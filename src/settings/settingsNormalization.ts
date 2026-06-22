import { DEFAULT_SETTINGS } from '../constants';
import { LorebaseSettings, TagPreset } from '../types';

export function normalizeDescriptionLines(value: unknown, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.max(1, Math.min(70, Math.round(value)));
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
                tag: String(tag || label || id || '').trim().replace(/^#+/, '').toLowerCase(),
                icon: typeof preset.icon === 'string' ? preset.icon : undefined,
            };
        })
        .filter((preset) => preset.id && preset.label && preset.tag);
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
        };
    }

    const rawStatus = readRecord(rawBadges.status);
    const rawRating = readRecord(rawBadges.rating);
    const rawFavorite = readRecord(rawBadges.favorite);
    const rawRatingMode = typeof rawRating?.mode === 'string' ? rawRating.mode : undefined;
    const normalizedRatingMode = rawRatingMode === 'both' ? 'star' : rawRatingMode;
    return {
        status: Object.assign(
            {},
            defaults.status,
            rawStatus ?? {},
            {
                iconOnly: readBoolean(rawStatus?.completedIconOnly)
                    ?? readBoolean(rawStatus?.iconOnly)
                    ?? defaults.status.iconOnly,
            }
        ),
        rating: Object.assign({}, defaults.rating, rawRating ?? {}, {
            mode: normalizedRatingMode ?? defaults.rating.mode,
        }),
        favorite: Object.assign({}, defaults.favorite, rawFavorite ?? {}),
    };
}

function readRecord(value: unknown): Record<string, unknown> | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    return Object.fromEntries(Object.entries(value));
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
