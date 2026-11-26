import { normalizeStatusReasons } from '../utils/statusReasons';
import { normalizeReleaseDate, releaseDatePatch } from '../utils/releaseDates';
import { normalizePartCatalog } from './media/partCatalog';
import { normalizeDiscovery, discoveryFrontmatter } from '../utils/discovery';
import { normalizePriority } from '../utils/priority';
import { normalizePersonalDate, personalDateTimestamp, readPersonalDate } from '../utils/personalDates';
import { isSyncUrl, syncSourceFromFrontmatter } from '../utils/syncSource';
import { wikilinkLabel } from './integrations/templateValues';
import { normalizeRepeatCount } from '../utils/repeatTracking';
import { readEpisodeFields, episodeFields, normalizeEpisodePart } from './media/episodeTracking';
import { normalizeMediaWorkType } from '../utils/mediaWorkType';
import { parseDetailedRatings } from '../utils/detailedRatings';
import { isCustomStatus, countCustomStatus } from '../statusPresentation';
import { App, TFile, TFolder } from 'obsidian';
import { FilterState, MovieItem, PosterMode, SeriesItem, SortField, SortOrder, VideoPart, VideoStats, VideoStatus } from '../types';
import { DEFAULT_COVER } from '../constants';
import { MetadataService } from './MetadataService';
import { filterAndSortMedia } from './media/filtering';
import { extractSimpleFrontmatter } from './media/libraryViewState';
import { getRandomItem, parseNumber, parseRelatedMedia, parseUserRating, parseYear, serializeRelatedMedia } from './media/parsers';
import { collectFieldTags, collectTags, getAllMarkdownFiles, isTruthy, mapInFrameBatches } from './media/serviceUtils';
import { updateMarkdownSection } from './markdownSections';
import { getPartPoster, normalizePosterMode } from './media/partPoster';
import { readPartAlternativeTitles } from './integrations/alternativeTitles';

export type VideoMediaType = 'movie' | 'series';
export type VideoItem = MovieItem | SeriesItem;

export class VideoService {
    private app: App;
    private metadataService: MetadataService;
    private cache: VideoItem[] = [];
    private cacheValid = false;
    private folderPath: string;
    private mediaType: VideoMediaType;
    private posterMode?: PosterMode;

    constructor(app: App, mediaType: VideoMediaType, folderPath: string, metadataService: MetadataService) {
        this.app = app;
        this.mediaType = mediaType;
        this.folderPath = folderPath;
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

    async loadItems(): Promise<VideoItem[]> {
        if (this.cacheValid && this.cache.length > 0) return this.cache;

        const folder = this.app.vault.getAbstractFileByPath(this.folderPath);
        if (!folder || !(folder instanceof TFolder)) {
            console.warn(`${this.mediaType} folder not found: ${this.folderPath}`);
            return [];
        }

        this.cache = await mapInFrameBatches(
            getAllMarkdownFiles(folder),
            (file) => this.parseFromCache(file)
        );
        this.cacheValid = true;
        return this.cache;
    }

    parseFromCache(file: TFile): VideoItem | null {
        try {
            const cache = this.app.metadataCache.getFileCache(file);
            const metadata = this.metadataService.resolveFrontmatter(this.mediaType, cache?.frontmatter || {});
            const rawType = typeof metadata.type === 'string' ? metadata.type.trim().toLowerCase() : '';
            if (rawType && rawType !== this.mediaType) return null;

            const title = this.readText(metadata, ['title', 'name']) || file.basename?.trim() || 'Untitled';
            const description = this.readText(metadata, ['plot', 'summary', 'description']) || '';
            const poster = this.readText(metadata, ['poster', 'image']) || null;
            const horizontal = this.readText(metadata, ['poster_b', 'image_b', 'horizontal_poster']) || poster;
            const verticalImageUrl = this.metadataService.getImageUrl(metadata.poster ?? metadata.image, metadata.cm_poster);
            const horizontalImageUrl = this.metadataService.getImageUrl(
                metadata.poster_b ?? metadata.image_b ?? metadata.horizontal_poster,
                metadata.cm_poster
            );
            const status = this.getStatus(this.readText(metadata, ['status']) || '') ?? 'planned';
            const partsKey = this.mediaType === 'series' ? 'series_parts' : 'movie_parts';
            const parts = this.parseParts(metadata[partsKey]);
            const activePartId = this.readText(metadata, ['active_part_id']) || parts[0]?.id || null;
            const activePart = parts.find((part) => part.id === activePartId) ?? parts[0] ?? null;
            const syncSource = syncSourceFromFrontmatter(this.mediaType, metadata);
            const rawSourceUrl = this.readText(metadata, ['url', 'source_url']);

            const base = {
                filePath: file.path,
                displayName: title,
                nameLower: title.toLowerCase(),
                year: parseYear(metadata.year),
                description,
                summary: description,
                detailedRatings: parseDetailedRatings(metadata.detailed_ratings),
                userRating: parseUserRating(metadata.userRating ?? metadata.rating_user),
                favorite: isTruthy(metadata.favorite),
                priority: normalizePriority(metadata.personal_priority),
                discovery: normalizeDiscovery(metadata.discovery_context),
                statusReasons: normalizeStatusReasons(metadata.status_reasons),
                partCatalog: normalizePartCatalog(metadata.part_catalog),
                poster,
                imageUrl: verticalImageUrl || poster || DEFAULT_COVER,
                horizontalImageUrl: horizontalImageUrl || verticalImageUrl || horizontal,
                hasCustomPoster: Boolean(poster),
                isAdult: false,
                workType: normalizeMediaWorkType(this.mediaType, metadata.work_type ?? metadata.workType),
                status,
                repeatCount: normalizeRepeatCount(metadata.repeat_count),
                genres: collectFieldTags(metadata, ['genres', 'genre']),
                tags: collectTags(metadata, cache?.tags),
                sourceUrl: syncSource?.url || rawSourceUrl,
                syncSource,
                metadataSourceUrl: this.readText(metadata, ['metadata_url']) || (syncSource && rawSourceUrl && !isSyncUrl(rawSourceUrl) ? rawSourceUrl : null),
                started: this.readDateText(metadata, ['started', 'dateStarted', 'start_date']),
                finished: this.readDateText(metadata, ['finished', 'dateFinished', 'finish_date', 'dateWatched', 'watched']),
                integrationProvider: this.normalizeProvider(this.readText(metadata, ['integration_provider'])),
                integrationId: this.readText(metadata, ['integration_id']),
                parts,
                activePartId,
                relatedMedia: parseRelatedMedia(metadata.related_media),
                rating: this.readText(metadata, ['rating', 'scoreImdb', 'imdbRating']) || '',
                communityRating: parseNumber(metadata.communityRating ?? metadata.community_rating),
                communityVotes: parseNumber(metadata.communityVotes ?? metadata.community_votes),
                communityRatingProvider: this.readText(metadata, ['communityRatingProvider', 'community_rating_provider']) || null,
                rawFields: extractSimpleFrontmatter(metadata),
            };

            if (this.mediaType === 'series') {
                const posterMode = this.posterMode ?? normalizePosterMode(metadata.poster_mode);
                return {
                    ...base,
                    type: 'series',
                    titleImageUrl: base.imageUrl,
                    posterMode,
                    imageUrl: getPartPoster(parts, activePartId, posterMode, base.imageUrl, value => this.metadataService.getImageUrl(value)),
                    releaseDate: this.readDateText(metadata, ['released', 'release_date', 'releaseDate', 'premiered', 'first_air_date']) || null,
                    runtime: this.readText(metadata, ['runtime']) || '',
                    director: this.readText(metadata, ['director', 'directors'], wikilinkLabel) || '',
                    actors: this.readText(metadata, ['actors', 'cast'], wikilinkLabel) || '',
                    seasons: (parseNumber(metadata.seasons) ?? parts.length) || null,
                    episodeCurrent: activePart?.episodeCurrent ?? parseNumber(metadata.episode_current),
                    episodeTotal: activePart?.episodeTotal ?? parseNumber(metadata.episode_total),
                    networks: this.toStringArray(metadata.networks),
                    studios: this.toStringArray(metadata.studios),
                };
            }

            return {
                ...base,
                type: 'movie',
                releaseDate: this.readDateText(metadata, ['released', 'release_date', 'releaseDate']) || null,
                runtime: this.readText(metadata, ['runtime']) || '',
                director: this.readText(metadata, ['director', 'directors'], wikilinkLabel) || '',
                actors: this.readText(metadata, ['actors', 'cast'], wikilinkLabel) || '',
            };
        } catch (error) {
            console.error(`Error parsing ${this.mediaType}:`, error);
            return null;
        }
    }

    filterAndSort(items: VideoItem[], filter: FilterState, sortField: SortField, sortOrder: SortOrder): VideoItem[] {
        return filterAndSortMedia({
            items,
            filter,
            sortField,
            sortOrder,
            isVisible: () => true,
            getCompletedDate: (item) => this.parseDateString(item.finished),
        });
    }

    getRandomItem(items: VideoItem[]): VideoItem | null {
        return getRandomItem(items);
    }

    calculateStats(items: VideoItem[]): VideoStats {
        const stats: VideoStats = {
            total: items.length,
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
        for (const item of items) {
            countCustomStatus(stats, item.status);
            if (!isCustomStatus(item.status)) stats[item.status]++;
            if (item.favorite) stats.favorite++;
            if (item.userRating) {
                stats.withRating++;
                ratingSum += item.userRating;
                stats.ratingDistribution[item.userRating] = (stats.ratingDistribution[item.userRating] || 0) + 1;
            }
        }
        stats.avgRating = stats.withRating > 0 ? Math.round((ratingSum / stats.withRating) * 10) / 10 : 0;
        for (const status of ['to_be_released', 'planned', 'watching', 'completed', 'dropped', 'paused'] as const) {
            stats.statusPercentages[status] = stats.total > 0 ? Math.round((stats[status] / stats.total) * 1000) / 10 : 0;
        }
        return stats;
    }

    async updateItem(item: VideoItem, updates: Partial<VideoItem> & Record<string, unknown>): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(item.filePath);
        if (!(file instanceof TFile)) return;

        const frontmatterUpdates: Record<string, unknown> = {};
        if ('countries' in updates) frontmatterUpdates.countries = updates.countries ?? [];
        if ('repeatCount' in updates) frontmatterUpdates.repeat_count = normalizeRepeatCount(updates.repeatCount);
        const rawFrontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
        const frontmatter = this.metadataService.resolveFrontmatter(this.mediaType, rawFrontmatter || {});

        if ('displayName' in updates) this.updateTextField(frontmatterUpdates, frontmatter, ['title', 'name'], updates.displayName);
        if ('title' in updates) this.updateTextField(frontmatterUpdates, frontmatter, ['title', 'name'], String(updates.title ?? ''));
        if ('workType' in updates) frontmatterUpdates.work_type = normalizeMediaWorkType(this.mediaType, updates.workType);
        if ('year' in updates) frontmatterUpdates.year = updates.year;
        if ('description' in updates) this.updateTextField(frontmatterUpdates, frontmatter, ['plot', 'summary', 'description'], updates.description);
        if ('summary' in updates) this.updateTextField(frontmatterUpdates, frontmatter, ['plot', 'summary', 'description'], updates.summary);
        if ('poster' in updates) this.updateTextField(frontmatterUpdates, frontmatter, ['poster', 'image'], updates.poster);
        if ('imageUrl' in updates) this.updateTextField(frontmatterUpdates, frontmatter, ['poster', 'image'], updates.imageUrl === DEFAULT_COVER ? '' : updates.imageUrl);
        if ('horizontalImageUrl' in updates) this.updateTextField(frontmatterUpdates, frontmatter, ['poster_b', 'image_b', 'horizontal_poster'], updates.horizontalImageUrl);
        if ('genres' in updates) this.updateListField(frontmatterUpdates, frontmatter, ['genres', 'genre'], updates.genres);
        if ('tags' in updates) this.updateListField(frontmatterUpdates, frontmatter, ['tags', 'tag'], updates.tags, true);
        if ('rating' in updates) this.updateTextField(frontmatterUpdates, frontmatter, ['rating', 'scoreImdb', 'imdbRating'], updates.rating);
        if ('status' in updates) frontmatterUpdates.status = updates.status;
        if ('detailedRatings' in updates) frontmatterUpdates.detailed_ratings = parseDetailedRatings(updates.detailedRatings) ?? null;
        if ('userRating' in updates) frontmatterUpdates.userRating = updates.userRating;
        if ('favorite' in updates) frontmatterUpdates.favorite = updates.favorite;
        if ('priority' in updates) frontmatterUpdates.personal_priority = normalizePriority(updates.priority);
        if ('partCatalog' in updates) frontmatterUpdates.part_catalog = normalizePartCatalog(updates.partCatalog) ?? null;
        if ('discovery' in updates) frontmatterUpdates.discovery_context = discoveryFrontmatter(updates.discovery);
        if ('statusReasons' in updates) frontmatterUpdates.status_reasons = normalizeStatusReasons(updates.statusReasons) ?? null;
        if ('sourceUrl' in updates) this.updateTextField(frontmatterUpdates, frontmatter, ['url', 'source_url'], updates.sourceUrl);
        if ('started' in updates) frontmatterUpdates.started = normalizePersonalDate(updates.started) || null;
        if ('finished' in updates) {
            frontmatterUpdates.finished = normalizePersonalDate(updates.finished) || null;
            for (const key of ['dateFinished', 'finish_date', 'dateWatched', 'watched']) frontmatterUpdates[key] = null;
        }
        if ('releaseDate' in updates) Object.assign(frontmatterUpdates,releaseDatePatch(frontmatter,updates.releaseDate,['released','release_date','releaseDate','premiered','first_air_date']));
        if ('runtime' in updates) this.updateTextField(frontmatterUpdates, frontmatter, ['runtime'], updates.runtime);
        if ('director' in updates) this.updateDisplayListField(
            frontmatterUpdates,
            frontmatter,
            'director',
            'directors',
            updates.director
        );
        if ('actors' in updates) this.updateDisplayListField(
            frontmatterUpdates,
            frontmatter,
            'cast',
            'actors',
            updates.actors
        );
        if ('seasons' in updates) frontmatterUpdates.seasons = updates.seasons;
        if ('networks' in updates) this.updateListField(frontmatterUpdates, frontmatter, ['networks', 'network'], updates.networks);
        if ('studios' in updates) this.updateListField(frontmatterUpdates, frontmatter, ['studios', 'studio'], updates.studios);
        if ('parts' in updates) frontmatterUpdates[this.mediaType === 'series' ? 'series_parts' : 'movie_parts'] = this.serializeParts(updates.parts ?? []);
        if ('activePartId' in updates) frontmatterUpdates.active_part_id = updates.activePartId;
        if (this.mediaType === 'series' && 'posterMode' in updates) frontmatterUpdates.poster_mode = normalizePosterMode(updates.posterMode);
        if ('relatedMedia' in updates) frontmatterUpdates.related_media = serializeRelatedMedia(updates.relatedMedia);
        if ('episodeCurrent' in updates) frontmatterUpdates.episode_current = updates.episodeCurrent;
        if ('episodeTotal' in updates) frontmatterUpdates.episode_total = updates.episodeTotal;
        if ('communityRating' in updates) frontmatterUpdates.communityRating = updates.communityRating;
        if ('communityVotes' in updates) frontmatterUpdates.communityVotes = updates.communityVotes;
        if ('communityRatingProvider' in updates) frontmatterUpdates.communityRatingProvider = updates.communityRatingProvider;
        if (this.mediaType === 'series') {
            const activeId = typeof updates.activePartId === 'string' ? updates.activePartId : item.activePartId;
            const parts = Array.isArray(updates.parts) ? updates.parts : item.parts;
            const activePart = parts?.find((part) => part.id === activeId);
            if (activePart?.seasonNumber !== undefined) frontmatterUpdates.season_current = activePart.seasonNumber;
        }

        await this.metadataService.updateMetadata(file, frontmatterUpdates, this.mediaType);
        if ('myNotes' in updates) {
            await this.updateMyNotesSection(file, String(updates.myNotes ?? ''));
        }
        this.invalidateCache();
    }

    private async updateMyNotesSection(file: TFile, value: string): Promise<void> {
        await updateMarkdownSection(this.app, file, value);
    }

    async deleteItem(item: VideoItem): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(item.filePath);
        if (file instanceof TFile) {
            await this.app.fileManager.trashFile(file);
            this.invalidateCache();
        }
    }

    private parseParts(raw: unknown): VideoPart[] {
        if (!Array.isArray(raw)) return [];
        return raw.map((entry, index) => {
            const source = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
            const kind = this.mediaType === 'series' ? 'season' : 'movie';
            const seasonNumber = parseNumber(source.seasonNumber ?? source.season ?? source.season_number);
            const rating = source.user_rating ?? source.userRating;
            return normalizeEpisodePart({
                id: this.readText(source, ['id']) || `${kind}-${index + 1}`,
                kind,
                title: this.readText(source, ['title', 'name']) || (kind === 'season' ? `Season ${seasonNumber ?? index + 1}` : `Part ${index + 1}`),
                alternativeTitles: readPartAlternativeTitles(source),
                seasonNumber,
                episodeCurrent: parseNumber(source.episodeCurrent ?? source.episode_current ?? source.current),
                episodeTotal: parseNumber(source.episodeTotal ?? source.episode_total ?? source.total),
                status: this.getStatus(this.readText(source, ['status']) || '') ?? 'planned',
                poster: this.readText(source, ['poster', 'image']) || null,
                year: parseNumber(source.year),
                episodeDuration: parseNumber(source.episode_duration ?? source.episodeDuration),
            ...(typeof (source.released ?? source.releaseDate) === 'string' ? { releaseDate: String(source.released ?? source.releaseDate) } : {}),
                ...(rating !== undefined ? { userRating: parseUserRating(rating) } : {}),
                ...readEpisodeFields(source),
            });
        });
    }

    private serializeParts(parts: VideoPart[]): Array<Record<string, unknown>> {
        return parts.map((part) => ({
            id: part.id,
            kind: part.kind,
            title: part.title,
            ...(part.alternativeTitles?.length ? { alt_titles: part.alternativeTitles } : {}),
            season: part.seasonNumber,
            episode_current: part.episodeCurrent,
            episode_total: part.episodeTotal,
            status: part.status,
            poster: part.poster ?? null,
            year: part.year ?? null,
            episode_duration: part.episodeDuration ?? null,
            ...(part.releaseDate ? { released: part.releaseDate } : {}),
            ...(part.userRating != null ? { user_rating: part.userRating } : {}),
            ...episodeFields(part),
        }));
    }

    private readText(source: Record<string, unknown>, keys: string[], label: (text: string) => string = String): string {
        for (const key of keys) {
            const value = source[key];
            if (value === null || value === undefined) continue;
            if (Array.isArray(value)) {
                const text = value.map(entry => label(String(entry).trim())).filter(Boolean).join(', ');
                if (text) return text;
                continue;
            }
            const text = label(String(value).trim());
            if (text) return text;
        }
        return '';
    }

    private readDateText(source: Record<string, unknown>, keys: string[]): string | null {
        if (keys[0] === 'started' || keys[0] === 'finished') return readPersonalDate(source, keys);
        const text = this.readText(source, keys);
        if (!text) return null;
        return this.normalizeDateString(text) || null;
    }

    private normalizeDateString(value: string): string {
        return normalizeReleaseDate(value);
    }

    private parseDateString(value: string | null | undefined): number | null {
        return personalDateTimestamp(value);
    }

    private hasKey(frontmatter: Record<string, unknown> | null | undefined, key: string): boolean {
        return Boolean(frontmatter && Object.prototype.hasOwnProperty.call(frontmatter, key));
    }

    private preferredKey(frontmatter: Record<string, unknown> | null | undefined, keys: string[]): string {
        return keys.find((key) => this.hasKey(frontmatter, key)) ?? keys[0];
    }

    private updateTextField(
        updates: Record<string, unknown>,
        frontmatter: Record<string, unknown> | null | undefined,
        keys: string[],
        value: unknown
    ): void {
        const key = this.preferredKey(frontmatter, keys);
        const normalized = value === null || value === undefined ? '' : String(value).trim();
        updates[key] = normalized || null;
    }

    private updateDisplayListField(
        updates: Record<string, unknown>,
        frontmatter: Record<string, unknown> | null | undefined,
        singularKey: string,
        pluralKey: string,
        value: unknown
    ): void {
        const values = this.toDisplayList(value);
        const prefersPlural = this.hasKey(frontmatter, pluralKey) && !this.hasKey(frontmatter, singularKey);

        if (values.length === 0) {
            updates[singularKey] = null;
            updates[pluralKey] = null;
            return;
        }

        if (values.length > 1 || prefersPlural) {
            updates[pluralKey] = values;
            updates[singularKey] = null;
            return;
        }

        updates[singularKey] = values[0];
        if (this.hasKey(frontmatter, pluralKey)) updates[pluralKey] = null;
    }

    private updateListField(
        updates: Record<string, unknown>,
        frontmatter: Record<string, unknown> | null | undefined,
        keys: string[],
        values: unknown,
        removeHashPrefix = false
    ): void {
        const key = this.preferredKey(frontmatter, keys);
        const normalized = this.toStringArray(values)
            .map((value) => (removeHashPrefix ? value.replace(/^#+/, '') : value).trim().toLowerCase())
            .filter((value, index, source) => Boolean(value) && source.indexOf(value) === index);
        updates[key] = normalized.length ? normalized : null;
    }

    private getStatus(value: string): VideoStatus | null {
        const normalized = value.trim().toLowerCase();
        return isCustomStatus(normalized) || ['planned', 'watching', 'completed', 'dropped', 'paused', 'to_be_released'].includes(normalized)
            ? normalized as VideoStatus
            : null;
    }

    private normalizeProvider(value: string): 'tmdb' | 'tvmaze' | 'omdb' | null {
        const normalized = value.trim().toLowerCase();
        return normalized === 'tmdb' || normalized === 'tvmaze' || normalized === 'omdb' ? normalized : null;
    }

    private toStringArray(value: unknown): string[] {
        if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean);
        if (typeof value === 'string') return value.split(/[,;\n]+/).map((entry) => entry.trim()).filter(Boolean);
        return [];
    }

    private toDisplayList(value: unknown): string[] {
        const result: string[] = [];
        const seen = new Set<string>();
        for (const entry of this.toStringArray(value)) {
            const normalized = entry.trim();
            const key = normalized.toLocaleLowerCase();
            if (!normalized || seen.has(key)) continue;
            seen.add(key);
            result.push(normalized);
        }
        return result;
    }
}
