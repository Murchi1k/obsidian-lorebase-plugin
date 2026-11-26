import { DEFAULT_SETTINGS } from '../constants';
import { LibraryViewState, LorebaseSettings, NoteImportFieldMapping, NoteImportSettings, SavedLibraryView, TagPreset } from '../types';
import {
    normalizeLibraryViewState,
    normalizeSavedLibraryViews,
} from '../services/media/libraryViewState';

export function normalizeLibraryViewSettings(
    raw: unknown,
    fallback: LibraryViewState
): { viewState: LibraryViewState; savedViews: SavedLibraryView[]; activeSavedViewId: string | null } {
    const record = readRecord(raw) ?? {};
    const legacyFallback: LibraryViewState = {
        ...fallback,
        sort: {
            field: record.sortField === 'dateCompleted'
                ? 'dateFinished'
                : typeof record.sortField === 'string'
                    ? record.sortField as LibraryViewState['sort']['field']
                : fallback.sort.field,
            order: record.sortOrder === 'desc' ? 'desc' : fallback.sort.order,
        },
        group: {
            mode: record.sortField === 'series'
                ? 'series'
                : typeof record.sortField === 'string'
                    ? 'none'
                    : fallback.group.mode,
            order: record.sortOrder === 'desc' ? 'desc' : fallback.group.order,
        },
    };
    const viewState = normalizeLibraryViewState(record.viewState, legacyFallback);
    const savedViews = normalizeSavedLibraryViews(record.savedViews, fallback);
    const requestedId = typeof record.activeSavedViewId === 'string' ? record.activeSavedViewId : null;
    return {
        viewState,
        savedViews,
        activeSavedViewId: requestedId && savedViews.some((view) => view.id === requestedId) ? requestedId : null,
    };
}

export function normalizeDescriptionLines(value: unknown, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.max(1, Math.min(70, Math.round(value)));
}

export function migrateUpdatedEditorSetting(settings: Record<string, unknown>): boolean {
    const legacyKeys = ['compactGameEditor', 'compactAnimeEditor', 'compactVideoEditor', 'compactReadingEditor'];
    if (!legacyKeys.some(key => Object.prototype.hasOwnProperty.call(settings, key))) return false;

    if (typeof settings.updatedEditor !== 'boolean') {
        settings.updatedEditor = legacyKeys.some(key => settings[key] === true);
    }
    for (const key of legacyKeys) delete settings[key];
    return true;
}

export function normalizeTagPresets(raw: unknown): TagPreset[] {
    if (!Array.isArray(raw)) {
        return DEFAULT_SETTINGS.tagPresets.games.map((preset) => ({ ...preset }));
    }

    return raw
        .filter((preset): preset is Record<string, unknown> => typeof preset === 'object' && preset !== null)
        .map((preset) => {
            const id = preset.id;
            const tag = preset.tag;
            const label = preset.label;
            return {
                id: String(id || tag || label || '').trim(),
                label: String(label || tag || id || '').trim(),
                tag: normalizeObsidianTag(String(tag || label || id || '')),
                icon: typeof preset.icon === 'string' ? preset.icon : undefined,
            };
        })
        .filter((preset) => preset.id && preset.label && preset.tag);
}

export function normalizeObsidianTag(value: string): string {
    return value
        .trim()
        .replace(/^#+/, '')
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

export function normalizeNoteImportSettings(raw: unknown): NoteImportSettings {
    const defaults = DEFAULT_SETTINGS.noteImport;
    const record = readRecord(raw) ?? {};
    const targetMedia = readMediaTypeKey(record.targetMedia) ?? defaults.targetMedia;
    const writeMode = record.writeMode === 'replace' ? 'replace' : defaults.writeMode;

    return {
        sourceFolderPath: typeof record.sourceFolderPath === 'string'
            ? record.sourceFolderPath.trim()
            : defaults.sourceFolderPath,
        targetMedia,
        writeMode,
        fieldMappings: normalizeNoteImportMappings(record.fieldMappings, defaults.fieldMappings),
        blacklist: normalizePropertyList(record.blacklist),
    };
}

/**
 * Migrates settings from builds where Jikan was offered as a manga provider.
 * Provider credentials/settings can be copied safely, but note ids cannot:
 * Jikan stores MAL ids while MangaUpdates uses a different id namespace.
 */
export function migrateLegacyJikanMangaSettings(
    settings: LorebaseSettings,
    savedIntegrations: LorebaseSettings['integrations'] | undefined
): boolean {
    settings.migrations ??= {};
    if (settings.migrations.jikanMangaProviderV1) return false;

    const integrations = settings.integrations;
    const savedProviders = savedIntegrations?.providers;
    if (integrations && savedProviders?.jikan && !savedProviders.mangaupdates) {
        integrations.providers.mangaupdates = {
            ...integrations.providers.mangaupdates,
            ...savedProviders.jikan,
        };
    }
    if (integrations?.media.manga.provider === 'jikan') {
        integrations.media.manga.provider = 'mangaupdates';
    }

    settings.migrations.jikanMangaProviderV1 = true;
    return true;
}

/** Move search preferences, never rewrite note IDs across catalog namespaces. */
export function migrateKitsuProviderSettings(settings: LorebaseSettings, saved: LorebaseSettings['integrations'] | undefined): boolean {
    const integrations = settings.integrations;
    if (!integrations) return false;
    let changed = false;
    if (saved?.providers.jikan && !saved.providers.kitsu) {
        integrations.providers.kitsu = { enabled: saved.providers.jikan.enabled };
        changed = true;
    }
    if (integrations.media.anime.provider === 'jikan') { integrations.media.anime.provider = 'kitsu'; changed = true; }
    if (integrations.providers.jikan.enabled) { integrations.providers.jikan.enabled = false; changed = true; }
    return changed;
}

function normalizeNoteImportMappings(
    raw: unknown,
    defaults: NoteImportFieldMapping[]
): NoteImportFieldMapping[] {
    const source = Array.isArray(raw) && raw.length ? raw : defaults;
    const mappings: NoteImportFieldMapping[] = [];
    const seen = new Set<string>();

    for (const entry of source) {
        const record = readRecord(entry);
        if (!record) continue;
        const key = typeof record.key === 'string' ? record.key.trim() : '';
        if (!key || seen.has(key)) continue;
        const aliases = normalizePropertyList(record.aliases);
        const nextAliases = aliases.includes(key) ? aliases : [key, ...aliases];
        mappings.push({ key, aliases: nextAliases });
        seen.add(key);
    }

    return mappings.length
        ? mappings
        : defaults.map((mapping) => ({ key: mapping.key, aliases: [...mapping.aliases] }));
}

function normalizePropertyList(raw: unknown): string[] {
    const values = Array.isArray(raw)
        ? raw
        : typeof raw === 'string'
            ? raw.split(/[,;\n]+/)
            : [];
    const normalized: string[] = [];
    const seen = new Set<string>();
    for (const value of values) {
        const text = String(value).trim();
        if (!text || seen.has(text)) continue;
        seen.add(text);
        normalized.push(text);
    }
    return normalized;
}

function readMediaTypeKey(value: unknown): NoteImportSettings['targetMedia'] | undefined {
    if (
        value === 'auto'
        || value === 'games'
        || value === 'anime'
        || value === 'movies'
        || value === 'series'
        || value === 'books'
        || value === 'manga'
        || value === 'music'
    ) {
        return value;
    }
    return undefined;
}

export function mergeOverlayLayout(
    raw: Partial<LorebaseSettings['overlayTextLayout']> | undefined,
    defaults: LorebaseSettings['overlayTextLayout']
): LorebaseSettings['overlayTextLayout'] {
    return {
        title: Object.assign({}, defaults.title, raw?.title ?? {}),
        year: Object.assign({}, defaults.year, raw?.year ?? {}),
        format: Object.assign({}, defaults.format, raw?.format ?? {}),
        description: Object.assign({}, defaults.description, raw?.description ?? {}),
    };
}

export function mergeOverlayVisibility(
    raw: Partial<LorebaseSettings['overlayTextVisibility']> | undefined,
    defaults: LorebaseSettings['overlayTextVisibility']
): LorebaseSettings['overlayTextVisibility'] {
    return {
        title: typeof raw?.title === 'boolean' ? raw.title : defaults.title,
        year: typeof raw?.year === 'boolean' ? raw.year : defaults.year,
        format: typeof raw?.format === 'boolean' ? raw.format : defaults.format,
        description: typeof raw?.description === 'boolean' ? raw.description : defaults.description,
    };
}

export function parseBadges(
    rawValue: unknown,
    defaults: LorebaseSettings['badges']
): LorebaseSettings['badges'] {
    if (!rawValue || typeof rawValue !== 'object') {
        return cloneBadges(defaults);
    }

    const rawBadges = readRecord(rawValue);
    if (!rawBadges) return cloneBadges(defaults);

    const isLegacyFlat =
        typeof rawBadges.status === 'boolean'
        || typeof rawBadges.rating === 'boolean'
        || typeof rawBadges.favorite === 'boolean';

    if (isLegacyFlat) {
        const sharedPosition = readBadgePosition(rawBadges.position) ?? 'bottom-right';
        const statusCoords = getLegacyCoordinates(sharedPosition, 'status');
        const ratingCoords = getLegacyCoordinates(sharedPosition, 'rating');
        const favoriteCoords = getLegacyCoordinates(sharedPosition, 'favorite');
        return {
            status: {
                enabled: readBoolean(rawBadges.status) ?? defaults.status.enabled,
                position: sharedPosition,
                iconOnly: defaults.status.iconOnly,
                showReleaseCountdown: defaults.status.showReleaseCountdown ?? true,
                alwaysShowCompletionDate: defaults.status.alwaysShowCompletionDate ?? false,
                x: statusCoords.x,
                y: statusCoords.y,
            },
            rating: {
                enabled: readBoolean(rawBadges.rating) ?? defaults.rating.enabled,
                position: sharedPosition,
                mode: defaults.rating.mode,
                x: ratingCoords.x,
                y: ratingCoords.y,
            },
            favorite: {
                enabled: readBoolean(rawBadges.favorite) ?? defaults.favorite.enabled,
                position: 'top-right',
                subtlePulse: defaults.favorite.subtlePulse,
                x: favoriteCoords.x,
                y: favoriteCoords.y,
            },
            workType: Object.assign({}, defaults.workType),
            communityRating: { ...defaults.communityRating, position: 'top-left', x: 8, y: 10 },
        };
    }

    const rawStatus = readRecord(rawBadges.status);
    const rawRating = readRecord(rawBadges.rating);
    const rawCommunity = readRecord(rawBadges.communityRating);
    const legacyCommunityEnabled = readBoolean(rawRating?.showCommunityRating);
    if (rawRating) delete rawRating.showCommunityRating;
    const rawFavorite = readRecord(rawBadges.favorite);
    const rawWorkType = readRecord(rawBadges.workType);
    const rawRatingMode = typeof rawRating?.mode === 'string' ? rawRating.mode : undefined;
    const normalizedRatingMode = rawRatingMode === 'both' ? 'star' : rawRatingMode;
    return {
        status: Object.assign(
            {},
            defaults.status,
            rawStatus ?? {},
            {
                showReleaseCountdown: readBoolean(rawStatus?.showReleaseCountdown) ?? defaults.status.showReleaseCountdown ?? true,
                alwaysShowCompletionDate: readBoolean(rawStatus?.alwaysShowCompletionDate) ?? defaults.status.alwaysShowCompletionDate ?? false,
                iconOnly: readBoolean(rawStatus?.completedIconOnly)
                    ?? readBoolean(rawStatus?.iconOnly)
                    ?? defaults.status.iconOnly,
            }
        ),
        rating: Object.assign({}, defaults.rating, rawRating ?? {}, {
            mode: normalizedRatingMode ?? defaults.rating.mode,
        }),
        favorite: Object.assign({}, defaults.favorite, rawFavorite ?? {}),
        workType: Object.assign({}, defaults.workType, rawWorkType ?? {}),
        communityRating: {
            ...defaults.communityRating,
            icon: rawCommunity?.icon === 'users' || rawCommunity?.icon === 'star' || rawCommunity?.icon === 'tomato'
                ? rawCommunity.icon : defaults.communityRating.icon,
            enabled: readBoolean(rawCommunity?.enabled) ?? legacyCommunityEnabled ?? defaults.communityRating.enabled,
            position: 'top-left',
            x: 8,
            y: 10,
        },
    };
}

function readRecord(value: unknown): Record<string, unknown> | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const record: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
        record[key] = entry;
    }
    return record;
}

function readBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
}

function readBadgePosition(value: unknown): LorebaseSettings['badges']['status']['position'] | undefined {
    if (
        value === 'top-left'
        || value === 'top-right'
        || value === 'bottom-left'
        || value === 'bottom-right'
    ) {
        return value;
    }
    return undefined;
}

function cloneBadges(badges: LorebaseSettings['badges']): LorebaseSettings['badges'] {
    return {
        status: Object.assign({}, badges.status),
        rating: Object.assign({}, badges.rating),
        favorite: Object.assign({}, badges.favorite),
        workType: Object.assign({}, badges.workType),
        communityRating: { ...badges.communityRating, position: 'top-left', x: 8, y: 10 },
    };
}

function getLegacyCoordinates(
    position: LorebaseSettings['badges']['status']['position'],
    key: 'status' | 'rating' | 'favorite'
): { x: number; y: number } {
    const map: Record<LorebaseSettings['badges']['status']['position'], Record<'status' | 'rating' | 'favorite', { x: number; y: number }>> = {
        'top-left': {
            status: { x: 10, y: 10 },
            rating: { x: 28, y: 10 },
            favorite: { x: 46, y: 10 },
        },
        'top-right': {
            status: { x: 64, y: 10 },
            rating: { x: 82, y: 10 },
            favorite: { x: 92, y: 10 },
        },
        'bottom-left': {
            status: { x: 10, y: 86 },
            rating: { x: 28, y: 86 },
            favorite: { x: 46, y: 86 },
        },
        'bottom-right': {
            status: { x: 70, y: 86 },
            rating: { x: 88, y: 86 },
            favorite: { x: 92, y: 86 },
        },
    };
    return map[position][key];
}
