import { normalizeStatusReasons } from '../utils/statusReasons';
import { normalizePartCatalog } from './media/partCatalog';
import { normalizeDiscovery, discoveryFrontmatter } from '../utils/discovery';
import { normalizeReleaseDate, releaseDatePatch } from '../utils/releaseDates';
import { normalizePriority } from '../utils/priority';
import { normalizePersonalDate, personalDateTimestamp, readPersonalDate } from '../utils/personalDates';
import { wikilinkLabel } from './integrations/templateValues';
import { parseEpisodeDuration } from './media/watchProgress';
import { animeGenreMigration } from '../utils/animeGenreMigration';
import { readEpisodeFields, episodeFields, normalizeEpisodePart } from './media/episodeTracking';
import { normalizeRepeatCount } from '../utils/repeatTracking';
import { normalizeCountry } from '../utils/mediaWorkType';
import { parseDetailedRatings } from '../utils/detailedRatings';
import { isCustomStatus, countCustomStatus } from '../statusPresentation';
/**
 * LOREBASE - Anime Service
 * Handles anime data loading, caching, filtering, and sorting
 */

import { App, TFile, TFolder } from 'obsidian';
import { AnimeFormat, AnimeItem, AnimePart, AnimeStatus, AnimeStats, FilterState, PosterMode, SortField, SortOrder } from '../types';
import { MetadataService } from './MetadataService';
import { DEFAULT_COVER, DEFAULT_SETTINGS } from '../constants';
import { filterAndSortMedia } from './media/filtering';
import { extractSimpleFrontmatter } from './media/libraryViewState';
import { getRandomItem, parseNumber, parseRelatedMedia, parseUserRating, parseYear, serializeRelatedMedia } from './media/parsers';
import { collectFieldTags, collectTags, getAllMarkdownFiles, isTruthy, mapInFrameBatches, normalizeCacheTags } from './media/serviceUtils';
import { updateMarkdownSection } from './markdownSections';
import { getPartPoster, normalizePosterMode } from './media/partPoster';
import { readPartAlternativeTitles } from './integrations/alternativeTitles';
import { isAnimeVideoProvider, readAnimeVideoSourceKind } from './integrations/animeVideoSources';

export class AnimeService {
    private app: App;
    private metadataService: MetadataService;
    private cache: AnimeItem[] = [];
    private cacheValid = false;
    private folderPath = DEFAULT_SETTINGS.anime.folderPath;
    private posterMode?: PosterMode;

    constructor(app: App, metadataService: MetadataService) {
        this.app = app;
        this.metadataService = metadataService;
    }

    setFolderPath(path: string): void {
        if (this.folderPath !== path) {
            this.folderPath = path;
            this.invalidateCache();
        }
    }

    invalidateCache(): void {
        this.cacheValid = false;
    }

    setPosterMode(mode: PosterMode | undefined): void {
        const next = normalizePosterMode(mode);
        if (this.posterMode !== next) {
            this.posterMode = next;
            this.invalidateCache();
        }
    }

    async loadAnime(): Promise<AnimeItem[]> {
        if (this.cacheValid && this.cache.length > 0) {
            return this.cache;
        }

        const folder = this.app.vault.getAbstractFileByPath(this.folderPath);
        if (!folder || !(folder instanceof TFolder)) {
            console.warn(`Anime folder not found: ${this.folderPath}`);
            return [];
        }

        const files = getAllMarkdownFiles(folder);
        for (const file of files) {
            const metadata = this.metadataService.resolveFrontmatter('anime', this.app.metadataCache.getFileCache(file)?.frontmatter ?? {});
            if (animeGenreMigration(metadata)) {
                try { await this.metadataService.migrateAnimeGenres(file); }
                catch (error) { console.error('Could not migrate anime genres:', file.path, error); }
            }
        }
        const animeItems = await mapInFrameBatches(files, (file) => this.parseAnimeFromCache(file));

        this.cache = animeItems;
        this.cacheValid = true;
        return animeItems;
    }

    private getStatusFromString(value: string): AnimeStatus | null {
        const normalized = value.trim().toLowerCase();
        return isCustomStatus(normalized) || ['planned', 'watching', 'completed', 'dropped', 'paused', 'to_be_released'].includes(normalized)
            ? (normalized as AnimeStatus)
            : null;
    }

    private getFormatFromString(value: unknown, fallback: AnimeFormat = 'tv'): AnimeFormat {
        const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
        return ['tv', 'movie', 'ova', 'ona', 'special'].includes(normalized)
            ? (normalized as AnimeFormat)
            : fallback;
    }

    private readObjectValue(source: Record<string, unknown>, keys: string[]): unknown {
        for (const key of keys) {
            if (Object.prototype.hasOwnProperty.call(source, key)) {
                return source[key];
            }
        }
        return undefined;
    }

    private inferIntegrationSource(sourceUrl: string): Pick<AnimeItem, 'integrationProvider' | 'integrationId'> | null {
        const candidates: Array<{ provider: NonNullable<AnimeItem['integrationProvider']>; pattern: RegExp }> = [
            { provider: 'anilist', pattern: /anilist\.co\/anime\/(\d+)/i },
            { provider: 'kitsu', pattern: /kitsu\.(?:io|app)\/anime\/(\d+)/i },
            { provider: 'jikan', pattern: /myanimelist\.net\/anime\/(\d+)/i },
            { provider: 'shikimori', pattern: /shikimori\.(?:one|me)\/animes\/(?:[a-z]+)?(\d+)/i },
            { provider: 'tmdb', pattern: /themoviedb\.org\/(?:tv|movie)\/(\d+)/i },
            { provider: 'tvmaze', pattern: /tvmaze\.com\/shows\/(\d+)/i },
            { provider: 'omdb', pattern: /imdb\.com\/title\/(tt\d+)/i },
        ];
        for (const candidate of candidates) {
            const id = sourceUrl.match(candidate.pattern)?.[1];
            if (id) return { integrationProvider: candidate.provider, integrationId: id };
        }
        return null;
    }

    private normalizePartId(value: unknown, fallback: string): string {
        const raw = typeof value === 'string' || typeof value === 'number'
            ? String(value).trim()
            : '';
        return raw || fallback;
    }

    private parseAnimePart(raw: unknown, index: number): AnimePart | null {
        if (!raw || typeof raw !== 'object') return null;
        const source = raw as Record<string, unknown>;
        const kind = this.getFormatFromString(this.readObjectValue(source, ['kind', 'format', 'type']), 'tv');
        const seasonNumber = parseNumber(this.readObjectValue(source, ['seasonNumber', 'season', 'season_number']));
        const episodeCurrent = parseNumber(this.readObjectValue(source, ['episodeCurrent', 'episode_current', 'current']));
        const episodeTotal = parseNumber(this.readObjectValue(source, ['episodeTotal', 'episode_total', 'total']));
        const statusRaw = this.readObjectValue(source, ['status']);
        const status = typeof statusRaw === 'string' ? this.getStatusFromString(statusRaw) ?? 'planned' : 'planned';
        const defaultTitle = kind === 'tv' && seasonNumber ? `Season ${seasonNumber}` : kind.toUpperCase();
        const titleRaw = this.readObjectValue(source, ['title', 'name', 'label']);
        const title = typeof titleRaw === 'string' && titleRaw.trim() ? titleRaw.trim() : defaultTitle;
        const rating = this.readObjectValue(source, ['user_rating', 'userRating']);

        return normalizeEpisodePart({
            id: this.normalizePartId(this.readObjectValue(source, ['id']), `${kind}-${index + 1}`),
            kind,
            title,
            alternativeTitles: readPartAlternativeTitles(source),
            seasonNumber,
            episodeCurrent,
            episodeTotal,
            status,
            ...(rating !== undefined ? { userRating: parseUserRating(rating) } : {}),
            poster: typeof (source.poster ?? source.image) === 'string' ? String(source.poster ?? source.image).trim() || null : null,
            year: parseNumber(source.year),
            episodeDuration: parseNumber(source.episode_duration ?? source.episodeDuration),
            ...(typeof (source.released ?? source.releaseDate) === 'string' ? { releaseDate: String(source.released ?? source.releaseDate) } : {}),
            ...readEpisodeFields(source),
        });
    }

    private buildLegacyPart(anime: Pick<AnimeItem, 'format' | 'seasonCurrent' | 'episodeCurrent' | 'episodeTotal' | 'status'> & { seasonTotal?: number | null; title?: string; poster?: string; year?: number | null; episodeDuration?: number | null }): AnimePart {
        return {
            id: 'legacy-main',
            kind: anime.format,
            title: anime.title || anime.format.toUpperCase(),
            poster: anime.poster ?? null,
            year: anime.year ?? null,
            episodeDuration: anime.episodeDuration ?? null,
            seasonNumber: anime.seasonCurrent ?? null,
            episodeCurrent: anime.episodeCurrent ?? null,
            episodeTotal: anime.episodeTotal ?? null,
            status: anime.status,
        };
    }

    private getActivePart(parts: AnimePart[] | undefined, activePartId: string | null | undefined): AnimePart | null {
        if (!parts?.length) return null;
        return parts.find((part) => part.id === activePartId) ?? parts[0] ?? null;
    }

    private normalizeAnimeParts(metadata: Record<string, unknown>, fallback: Pick<AnimeItem, 'format' | 'seasonCurrent' | 'episodeCurrent' | 'episodeTotal' | 'status'> & { seasonTotal?: number | null; title?: string; poster?: string; year?: number | null; episodeDuration?: number | null }): { parts: AnimePart[]; activePartId: string | null } {
        const rawParts = metadata.anime_parts;
        const parsedParts = Array.isArray(rawParts)
            ? rawParts.map((part, index) => this.parseAnimePart(part, index)).filter((part): part is AnimePart => Boolean(part))
            : [];
        const parts = parsedParts.length > 0 ? parsedParts : [this.buildLegacyPart(fallback)];
        const activePartIdRaw = typeof metadata.active_part_id === 'string' ? metadata.active_part_id.trim() : '';
        const activePartId = parts.some((part) => part.id === activePartIdRaw)
            ? activePartIdRaw
            : parts[0]?.id ?? null;
        return { parts, activePartId };
    }

    private serializeAnimeParts(parts: AnimePart[]): Array<Record<string, unknown>> {
        return parts.map((part) => ({
            id: part.id,
            kind: part.kind,
            title: part.title,
            ...(part.alternativeTitles?.length ? { alt_titles: part.alternativeTitles } : {}),
            season: part.seasonNumber,
            episode_current: part.episodeCurrent,
            episode_total: part.episodeTotal,
            status: part.status,
            ...(part.userRating != null ? { user_rating: part.userRating } : {}),
            poster: part.poster ?? null,
            year: part.year ?? null,
            episode_duration: part.episodeDuration ?? null,
            ...(part.releaseDate ? { released: part.releaseDate } : {}),
            ...episodeFields(part),
        }));
    }

    private areAllTrackablePartsCompleted(parts: AnimePart[]): boolean {
        return parts.length > 0 && parts.every((part) => part.status === 'completed');
    }


    private parseCommunityRating(value: unknown): number | null {
        const parsed = parseNumber(value);
        return parsed === null ? null : Math.round(parsed * 10) / 10;
    }

    public parseAnimeFromCache(file: TFile): AnimeItem | null {
        try {
            const cache = this.app.metadataCache.getFileCache(file);
            const original = this.metadataService.resolveFrontmatter('anime', cache?.frontmatter || {});
            const migration = animeGenreMigration(original);
            const metadata = migration ? Object.assign(original, migration) : original;

            const rawType = typeof metadata.type === 'string' ? metadata.type.toLowerCase() : '';
            if (rawType && rawType !== 'anime') {
                return null;
            }

            const frontmatterTitle = typeof metadata.title === 'string'
                ? metadata.title.trim()
                : (typeof metadata.name === 'string' ? metadata.name.trim() : '');
            const title = frontmatterTitle || file.basename?.trim();

            const summaryText = typeof metadata.summary === 'string'
                ? metadata.summary
                : (typeof metadata.plot === 'string' ? metadata.plot : '');
            const sourceUrl = typeof metadata.source_url === 'string'
                ? metadata.source_url
                : (typeof metadata.url === 'string' ? metadata.url : '');
            const integrationProviderRaw = typeof metadata.integration_provider === 'string'
                ? metadata.integration_provider.trim().toLowerCase()
                : '';
            let integrationProvider: AnimeItem['integrationProvider'] = integrationProviderRaw === 'anilist'
                || integrationProviderRaw === 'jikan'
                || integrationProviderRaw === 'kitsu'
                || integrationProviderRaw === 'shikimori'
                || isAnimeVideoProvider(integrationProviderRaw)
                ? integrationProviderRaw
                : null;
            let integrationId = typeof metadata.integration_id === 'string' || typeof metadata.integration_id === 'number'
                ? String(metadata.integration_id).trim() || null
                : null;
            if (!integrationProvider || !integrationId) {
                const inferredSource = this.inferIntegrationSource(sourceUrl);
                if (inferredSource) {
                    integrationProvider = inferredSource.integrationProvider ?? null;
                    integrationId = inferredSource.integrationId ?? null;
                }
            }

            const format = this.getFormatFromString(metadata.format);
            const integrationSourceKind = isAnimeVideoProvider(integrationProvider)
                ? readAnimeVideoSourceKind(metadata.integration_source_kind, sourceUrl, format)
                : undefined;

            let status: AnimeStatus = 'planned';
            if (typeof metadata.status === 'string') {
                const parsed = this.getStatusFromString(metadata.status);
                if (parsed) status = parsed;
            }

            const horizontalImageUrl = this.metadataService.getImageUrl(
                metadata.image_b ?? metadata.poster_b,
                metadata.cm_poster
            );
            const verticalImageUrl = this.metadataService.getImageUrl(
                metadata.image ?? metadata.poster,
                metadata.cm_poster
            );
            const rawVerticalImage = typeof metadata.image === 'string'
                ? metadata.image
                : (typeof metadata.poster === 'string' ? metadata.poster : '');
            const rawHorizontalImage = typeof metadata.image_b === 'string'
                ? metadata.image_b
                : (typeof metadata.poster_b === 'string' ? metadata.poster_b : '');
            const tags = collectTags(metadata, normalizeCacheTags(cache?.tags));
            const genres = collectFieldTags(metadata, ['genres', 'genre']);
            const studioValue = metadata.studios ?? metadata.studio;
            const studios = typeof studioValue === 'string' && wikilinkLabel(studioValue) !== studioValue
                ? [wikilinkLabel(studioValue)]
                : this.toDisplayList(studioValue).map(wikilinkLabel);
            const dateAdded = file.stat?.ctime ?? file.stat?.mtime ?? Date.now();
            const started = this.readDateText(metadata, ['started', 'dateStarted', 'start_date']);
            const finished = this.readDateText(metadata, ['finished', 'dateFinished', 'finish_date', 'dateWatched', 'watched']);
            const dateWatched = personalDateTimestamp(finished);

            const seasonCurrent = parseNumber(metadata.season_current);
            const seasonTotal = parseNumber(metadata.season_total);
            const episodeCurrent = parseNumber(metadata.episode_current);
            const episodeTotal = parseNumber(metadata.episode_total);
            const { parts, activePartId } = this.normalizeAnimeParts(metadata, {
                title,
                poster: rawVerticalImage,
                year: parseYear(metadata.year),
                episodeDuration: parseEpisodeDuration(metadata.episode_duration ?? metadata.duration ?? metadata.runtime),
                format,
                status,
                seasonCurrent,
                seasonTotal,
                episodeCurrent,
                episodeTotal,
            });
            const activePart = this.getActivePart(parts, activePartId);
            const titleImageUrl = verticalImageUrl || rawVerticalImage || horizontalImageUrl || rawHorizontalImage || DEFAULT_COVER;
            const posterMode = this.posterMode ?? normalizePosterMode(metadata.poster_mode);

            const anime: AnimeItem = {
                type: 'anime',
                filePath: file.path,
                displayName: title || 'Unknown',
                nameLower: (title || 'unknown').toLowerCase(),
                year: parseYear(metadata.year),
                description: summaryText,
                summary: summaryText,
                releaseDate: this.readDateText(metadata, ['released', 'release_date', 'releaseDate', 'aired_on', 'air_date', 'premiered']),
                detailedRatings: parseDetailedRatings(metadata.detailed_ratings),
                userRating: parseUserRating(metadata.rating),
                favorite: isTruthy(metadata.favorite),
                priority: normalizePriority(metadata.personal_priority),
                discovery: normalizeDiscovery(metadata.discovery_context),
                statusReasons: normalizeStatusReasons(metadata.status_reasons),
                partCatalog: normalizePartCatalog(metadata.part_catalog),
                poster: typeof metadata.poster === 'string' ? metadata.poster : rawVerticalImage,
                imageUrl: getPartPoster(parts, activePartId, posterMode, titleImageUrl, value => this.metadataService.getImageUrl(value)),
                titleImageUrl,
                posterMode,
                horizontalImageUrl: horizontalImageUrl || rawHorizontalImage || verticalImageUrl || rawVerticalImage || null,
                hasCustomPoster: Boolean(metadata.cm_poster),
                isAdult: isTruthy(metadata.Sex18 ?? metadata.isAdult),
                countryOfOrigin: normalizeCountry(metadata.country_of_origin ?? metadata.countryOfOrigin),
                workType: normalizeCountry(metadata.country_of_origin ?? metadata.countryOfOrigin),
                format,
                status,
                seasonCurrent: activePart?.seasonNumber ?? seasonCurrent,
                seasonTotal,
                episodeCurrent: activePart?.episodeCurrent ?? episodeCurrent,
                episodeTotal: activePart?.episodeTotal ?? episodeTotal,
                repeatCount: normalizeRepeatCount(metadata.repeat_count),
                genres,
                studios,
                started,
                finished,
                dateAdded,
                dateWatched,
                tags,
                sourceUrl: sourceUrl || null,
                integrationProvider,
                integrationSourceKind,
                integrationId,
                parts,
                activePartId,
                relatedMedia: parseRelatedMedia(metadata.related_media),
                communityRating: this.parseCommunityRating(metadata.communityRating ?? metadata.community_rating),
                communityVotes: parseNumber(metadata.communityVotes ?? metadata.community_votes),
                communityRatingProvider: typeof metadata.communityRatingProvider === 'string'
                    ? metadata.communityRatingProvider
                    : (typeof metadata.community_rating_provider === 'string' ? metadata.community_rating_provider : null),
                rawFields: extractSimpleFrontmatter(metadata.alt_titles === undefined ? metadata : { ...metadata, alt_titles: metadata.alt_titles }),
            };

            return anime;
        } catch (e) {
            console.error(`Error parsing anime file ${file.path}:`, e);
            return null;
        }
    }

    filterAndSort(
        items: AnimeItem[],
        filter: FilterState,
        sortField: SortField,
        sortOrder: SortOrder,
        showAdultInAll = false
    ): AnimeItem[] {
        const adultOnly = filter.adultOnly
            || filter.rules?.some(rule => rule.field === 'adult' && rule.operator === 'isTrue') === true;
        return filterAndSortMedia({
            items,
            filter,
            sortField,
            sortOrder,
            getCompletedDate: (item) => item.finished ? personalDateTimestamp(item.finished) : item.dateWatched,
            isVisible: (item, hasGlobalFilters) => {
                if (adultOnly && !item.isAdult) return false;
                if (!adultOnly && !showAdultInAll && item.isAdult) return false;
                return filter.customOnly
                    ? item.hasCustomPoster
                    : adultOnly || hasGlobalFilters || !item.hasCustomPoster;
            },
        });
    }

    async updateAnime(anime: AnimeItem, updates: Partial<AnimeItem>): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(anime.filePath);
        if (!file || !(file instanceof TFile)) {
            console.error('Anime file not found:', anime.filePath);
            return;
        }

        const frontmatterUpdates: Record<string, unknown> = {};
        if ('countries' in updates) frontmatterUpdates.countries = updates.countries ?? [];
        if ('repeatCount' in updates) frontmatterUpdates.repeat_count = normalizeRepeatCount(updates.repeatCount);
        const rawFrontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
        const frontmatter = this.metadataService.resolveFrontmatter('anime', rawFrontmatter || {});

        if ('displayName' in updates) {
            const title = updates.displayName?.trim() ?? '';
            if (frontmatter && Object.prototype.hasOwnProperty.call(frontmatter, 'name')
                && !Object.prototype.hasOwnProperty.call(frontmatter, 'title')) {
                frontmatterUpdates.name = title || null;
            } else {
                frontmatterUpdates.title = title || null;
            }
        }
        if ('favorite' in updates) frontmatterUpdates.favorite = updates.favorite;
        if ('priority' in updates) frontmatterUpdates.personal_priority = normalizePriority(updates.priority);
        if ('partCatalog' in updates) frontmatterUpdates.part_catalog = normalizePartCatalog(updates.partCatalog) ?? null;
        if ('discovery' in updates) frontmatterUpdates.discovery_context = discoveryFrontmatter(updates.discovery);
        if ('statusReasons' in updates) frontmatterUpdates.status_reasons = normalizeStatusReasons(updates.statusReasons) ?? null;
        if ('status' in updates) frontmatterUpdates.status = updates.status;
        if ('year' in updates) frontmatterUpdates.year = updates.year;
        if ('releaseDate' in updates) Object.assign(frontmatterUpdates,releaseDatePatch(frontmatter,updates.releaseDate,['released','release_date','releaseDate','aired_on','air_date','premiered']));
        if ('summary' in updates) frontmatterUpdates.summary = updates.summary;
        if ('detailedRatings' in updates) frontmatterUpdates.detailed_ratings = parseDetailedRatings(updates.detailedRatings) ?? null;
        if ('userRating' in updates) {
            frontmatterUpdates.rating = updates.userRating ?? null;
            frontmatterUpdates.userRating = null;
        }
        if ('format' in updates) frontmatterUpdates.format = updates.format;
        if ('posterMode' in updates) frontmatterUpdates.poster_mode = normalizePosterMode(updates.posterMode);
        let parts = updates.parts ?? anime.parts;
        let activePartId = updates.activePartId !== undefined ? updates.activePartId : anime.activePartId;
        if (parts && parts.length > 0) {
            const activePart = this.getActivePart(parts, activePartId);
            if (activePart && activePart.id !== activePartId) {
                activePartId = activePart.id;
            }
            if (!isCustomStatus(updates.status ?? anime.status) && this.areAllTrackablePartsCompleted(parts)) {
                frontmatterUpdates.status = 'completed';
            }
            frontmatterUpdates.anime_parts = this.serializeAnimeParts(parts);
            frontmatterUpdates.active_part_id = activePartId ?? null;
            frontmatterUpdates.season_current = activePart?.seasonNumber ?? null;
            frontmatterUpdates.episode_current = activePart?.episodeCurrent ?? null;
            frontmatterUpdates.episode_total = activePart?.episodeTotal ?? null;
        }
        if ('seasonCurrent' in updates) frontmatterUpdates.season_current = updates.seasonCurrent;
        if ('seasonTotal' in updates) frontmatterUpdates.season_total = updates.seasonTotal;
        if ('episodeCurrent' in updates) frontmatterUpdates.episode_current = updates.episodeCurrent;
        if ('episodeTotal' in updates) frontmatterUpdates.episode_total = updates.episodeTotal;
        if ('sourceUrl' in updates) frontmatterUpdates.source_url = updates.sourceUrl;
        if ('started' in updates) frontmatterUpdates.started = this.normalizeDateString(updates.started ?? '') || null;
        if ('finished' in updates) {
            const normalizedFinished = this.normalizeDateString(updates.finished ?? '');
            frontmatterUpdates.finished = normalizedFinished || null;
            frontmatterUpdates.dateWatched = normalizedFinished || null;
            for (const key of ['dateFinished', 'finish_date', 'watched']) frontmatterUpdates[key] = null;
        }
        if ('integrationProvider' in updates) frontmatterUpdates.integration_provider = updates.integrationProvider;
        if ('integrationId' in updates) frontmatterUpdates.integration_id = updates.integrationId;
        if ('countryOfOrigin' in updates) frontmatterUpdates.country_of_origin = normalizeCountry(updates.countryOfOrigin);
        if ('isAdult' in updates) frontmatterUpdates.Sex18 = updates.isAdult;
        if ('genres' in updates) frontmatterUpdates.genres = updates.genres?.length ? updates.genres : null;
        if ('studios' in updates) {
            const studios = this.toDisplayList(updates.studios);
            frontmatterUpdates.studios = studios.length ? studios : null;
        }
        if ('tags' in updates) frontmatterUpdates.tags = updates.tags?.length ? updates.tags : null;
        if ('relatedMedia' in updates) frontmatterUpdates.related_media = serializeRelatedMedia(updates.relatedMedia);
        if ('communityRating' in updates) frontmatterUpdates.communityRating = updates.communityRating;
        if ('communityVotes' in updates) frontmatterUpdates.communityVotes = updates.communityVotes;
        if ('communityRatingProvider' in updates) frontmatterUpdates.communityRatingProvider = updates.communityRatingProvider;

        await this.metadataService.updateMetadata(file, frontmatterUpdates, 'anime');
        if ('myNotes' in updates) {
            await this.updateMyNotesSection(file, updates.myNotes ?? '');
        }
    }

    private async updateMyNotesSection(file: TFile, value: string): Promise<void> {
        await updateMarkdownSection(this.app, file, value);
    }

    private readDateText(source: Record<string, unknown>, keys: string[]): string | null {
        if (keys[0] !== 'started' && keys[0] !== 'finished') {
            for (const key of keys) { const value = normalizeReleaseDate(source[key]); if (value) return value; }
            return null;
        }
        return readPersonalDate(source, keys);
    }

    private toDisplayList(value: unknown): string[] {
        const source = Array.isArray(value)
            ? value
            : typeof value === 'string'
                ? value.split(/[,;\n]+/)
                : [];
        const result: string[] = [];
        const seen = new Set<string>();
        for (const entry of source) {
            const normalized = String(entry).trim();
            const key = normalized.toLocaleLowerCase();
            if (!normalized || seen.has(key)) continue;
            seen.add(key);
            result.push(normalized);
        }
        return result;
    }

    private normalizeDateString(value: string | null | undefined): string {
        return normalizePersonalDate(value);
    }


    async deleteAnime(anime: AnimeItem): Promise<boolean> {
        const file = this.app.vault.getAbstractFileByPath(anime.filePath);
        if (!file || !(file instanceof TFile)) return false;

        try {
            await this.app.fileManager.trashFile(file);
            this.cache = this.cache.filter(g => g.filePath !== anime.filePath);
            return true;
        } catch (e) {
            console.error('Error deleting anime:', e);
            return false;
        }
    }

    getRandomAnime(items: AnimeItem[]): AnimeItem | null {
        return getRandomItem(items);
    }

    calculateStats(anime: AnimeItem[]): AnimeStats {
        const stats: AnimeStats = {
            total: anime.length,
            planned: 0,
            watching: 0,
            completed: 0,
            dropped: 0,
            paused: 0,
            to_be_released: 0,
            favorite: 0,
            withRating: 0,
            avgRating: 0,
            ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
            statusPercentages: {},
        };

        let ratingSum = 0;

        for (const item of anime) {
            if (!item) continue;
            countCustomStatus(stats, item.status);

            switch (item.status) {
                case 'planned': stats.planned++; break;
                case 'watching': stats.watching++; break;
                case 'completed': stats.completed++; break;
                case 'dropped': stats.dropped++; break;
                case 'paused': stats.paused++; break;
                case 'to_be_released': stats.to_be_released++; break;
            }

            if (item.favorite) stats.favorite++;

            if (item.userRating) {
                stats.withRating++;
                ratingSum += item.userRating;
                stats.ratingDistribution[item.userRating] = (stats.ratingDistribution[item.userRating] || 0) + 1;
            }
        }

        stats.avgRating = stats.withRating > 0
            ? Math.round((ratingSum / stats.withRating) * 10) / 10
            : 0;

        if (stats.total > 0) {
            stats.statusPercentages = {
                planned: Math.round((stats.planned / stats.total) * 1000) / 10,
                watching: Math.round((stats.watching / stats.total) * 1000) / 10,
                completed: Math.round((stats.completed / stats.total) * 1000) / 10,
                dropped: Math.round((stats.dropped / stats.total) * 1000) / 10,
                paused: Math.round((stats.paused / stats.total) * 1000) / 10,
                to_be_released: Math.round((stats.to_be_released / stats.total) * 1000) / 10,
            };
        }

        return stats;
    }

}
