import { App, TFile, TFolder } from 'obsidian';
import { FilterState, MovieItem, SeriesItem, SortField, SortOrder, VideoPart, VideoStats, VideoStatus } from '../types';
import { DEFAULT_COVER } from '../constants';
import { MetadataService } from './MetadataService';
import { filterAndSortMedia } from './media/filtering';
import { getRandomItem, parseNumber, parseRelatedMedia, parseUserRating, parseYear, serializeRelatedMedia } from './media/parsers';
import { collectFieldTags, collectTags, getAllMarkdownFiles, isTruthy } from './media/serviceUtils';

export type VideoMediaType = 'movie' | 'series';
export type VideoItem = MovieItem | SeriesItem;

export class VideoService {
    private app: App;
    private metadataService: MetadataService;
    private cache: VideoItem[] = [];
    private cacheValid = false;
    private folderPath: string;
    private mediaType: VideoMediaType;

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

    async loadItems(): Promise<VideoItem[]> {
        if (this.cacheValid && this.cache.length > 0) return this.cache;

        const folder = this.app.vault.getAbstractFileByPath(this.folderPath);
        if (!folder || !(folder instanceof TFolder)) {
            console.warn(`${this.mediaType} folder not found: ${this.folderPath}`);
            return [];
        }

        this.cache = getAllMarkdownFiles(folder)
            .map((file) => this.parseFromCache(file))
            .filter((item): item is VideoItem => Boolean(item));
        this.cacheValid = true;
        return this.cache;
    }

    parseFromCache(file: TFile): VideoItem | null {
        try {
            const cache = this.app.metadataCache.getFileCache(file);
            const metadata = cache?.frontmatter || {};
            const rawType = typeof metadata.type === 'string' ? metadata.type.trim().toLowerCase() : '';
            if (rawType && rawType !== this.mediaType) return null;

            const title = this.readText(metadata, ['title', 'name']) || file.basename?.trim() || 'Untitled';
            const description = this.readText(metadata, ['plot', 'summary', 'description']) || '';
            const poster = this.readText(metadata, ['poster', 'image']) || null;
            const horizontal = this.readText(metadata, ['poster_b', 'image_b', 'horizontal_poster']) || poster;
            const status = this.getStatus(this.readText(metadata, ['status']) || '') ?? 'planned';
            const partsKey = this.mediaType === 'series' ? 'series_parts' : 'movie_parts';
            const parts = this.parseParts(metadata[partsKey]);
            const activePartId = this.readText(metadata, ['active_part_id']) || parts[0]?.id || null;
            const activePart = parts.find((part) => part.id === activePartId) ?? parts[0] ?? null;

            const base = {
                filePath: file.path,
                displayName: title,
                nameLower: title.toLowerCase(),
                year: parseYear(metadata.year),
                description,
                summary: description,
                userRating: parseUserRating(metadata.userRating ?? metadata.rating_user),
                favorite: isTruthy(metadata.favorite),
                poster,
                imageUrl: poster || DEFAULT_COVER,
                horizontalImageUrl: horizontal,
                hasCustomPoster: Boolean(poster),
                isAdult: false,
                status,
                genres: collectFieldTags(metadata, ['genres', 'genre']),
                tags: collectTags(metadata, cache?.tags),
                sourceUrl: this.readText(metadata, ['url', 'source_url']),
                integrationProvider: this.normalizeProvider(this.readText(metadata, ['integration_provider'])),
                integrationId: this.readText(metadata, ['integration_id']),
                parts,
                activePartId,
                relatedMedia: parseRelatedMedia(metadata.related_media),
                rating: this.readText(metadata, ['rating', 'scoreImdb', 'imdbRating']) || '',
            };

            if (this.mediaType === 'series') {
                return {
                    ...base,
                    type: 'series',
                    releaseDate: this.readText(metadata, ['released', 'release_date']) || null,
                    runtime: this.readText(metadata, ['runtime']) || '',
                    director: this.readText(metadata, ['director', 'directors']) || '',
                    actors: this.readText(metadata, ['actors', 'cast']) || '',
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
                releaseDate: this.readText(metadata, ['released', 'release_date']) || null,
                runtime: this.readText(metadata, ['runtime']) || '',
                director: this.readText(metadata, ['director', 'directors']) || '',
                actors: this.readText(metadata, ['actors', 'cast']) || '',
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
            getCompletedDate: () => null,
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
            favorite: 0,
            withRating: 0,
            avgRating: 0,
            ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
            statusPercentages: {},
        };

        let ratingSum = 0;
        for (const item of items) {
            stats[item.status]++;
            if (item.favorite) stats.favorite++;
            if (item.userRating) {
                stats.withRating++;
                ratingSum += item.userRating;
                stats.ratingDistribution[item.userRating] = (stats.ratingDistribution[item.userRating] || 0) + 1;
            }
        }
        stats.avgRating = stats.withRating > 0 ? Math.round((ratingSum / stats.withRating) * 10) / 10 : 0;
        for (const status of ['planned', 'watching', 'completed', 'dropped', 'paused'] as const) {
            stats.statusPercentages[status] = stats.total > 0 ? Math.round((stats[status] / stats.total) * 1000) / 10 : 0;
        }
        return stats;
    }

    async updateItem(item: VideoItem, updates: Partial<VideoItem> & Record<string, unknown>): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(item.filePath);
        if (!(file instanceof TFile)) return;

        const frontmatterUpdates: Record<string, unknown> = {};
        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;

        if ('displayName' in updates) this.updateTextField(frontmatterUpdates, frontmatter, ['title', 'name'], updates.displayName);
        if ('title' in updates) this.updateTextField(frontmatterUpdates, frontmatter, ['title', 'name'], String(updates.title ?? ''));
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
        if ('userRating' in updates) frontmatterUpdates.userRating = updates.userRating;
        if ('favorite' in updates) frontmatterUpdates.favorite = updates.favorite;
        if ('sourceUrl' in updates) this.updateTextField(frontmatterUpdates, frontmatter, ['url', 'source_url'], updates.sourceUrl);
        if ('releaseDate' in updates) this.updateTextField(frontmatterUpdates, frontmatter, ['released', 'release_date', 'releaseDate'], updates.releaseDate);
        if ('runtime' in updates) this.updateTextField(frontmatterUpdates, frontmatter, ['runtime'], updates.runtime);
        if ('director' in updates) this.updateTextField(frontmatterUpdates, frontmatter, ['director', 'directors'], updates.director);
        if ('actors' in updates) this.updateTextField(frontmatterUpdates, frontmatter, ['actors', 'cast'], updates.actors);
        if ('seasons' in updates) frontmatterUpdates.seasons = updates.seasons;
        if ('networks' in updates) this.updateListField(frontmatterUpdates, frontmatter, ['networks', 'network'], updates.networks);
        if ('studios' in updates) this.updateListField(frontmatterUpdates, frontmatter, ['studios', 'studio'], updates.studios);
        if ('parts' in updates) frontmatterUpdates[this.mediaType === 'series' ? 'series_parts' : 'movie_parts'] = this.serializeParts(updates.parts ?? []);
        if ('activePartId' in updates) frontmatterUpdates.active_part_id = updates.activePartId;
        if ('relatedMedia' in updates) frontmatterUpdates.related_media = serializeRelatedMedia(updates.relatedMedia);
        if ('episodeCurrent' in updates) frontmatterUpdates.episode_current = updates.episodeCurrent;
        if ('episodeTotal' in updates) frontmatterUpdates.episode_total = updates.episodeTotal;
        if (this.mediaType === 'series') {
            const activeId = typeof updates.activePartId === 'string' ? updates.activePartId : item.activePartId;
            const parts = Array.isArray(updates.parts) ? updates.parts : item.parts;
            const activePart = parts?.find((part) => part.id === activeId);
            if (activePart?.seasonNumber !== undefined) frontmatterUpdates.season_current = activePart.seasonNumber;
        }

        await this.metadataService.updateMetadata(file, frontmatterUpdates);
        this.invalidateCache();
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
            return {
                id: this.readText(source, ['id']) || `${kind}-${index + 1}`,
                kind,
                title: this.readText(source, ['title', 'name']) || (kind === 'season' ? `Season ${seasonNumber ?? index + 1}` : `Part ${index + 1}`),
                seasonNumber,
                episodeCurrent: parseNumber(source.episodeCurrent ?? source.episode_current ?? source.current),
                episodeTotal: parseNumber(source.episodeTotal ?? source.episode_total ?? source.total),
                status: this.getStatus(this.readText(source, ['status']) || '') ?? 'planned',
            };
        });
    }

    private serializeParts(parts: VideoPart[]): Array<Record<string, unknown>> {
        return parts.map((part) => ({
            id: part.id,
            kind: part.kind,
            title: part.title,
            season: part.seasonNumber,
            episode_current: part.episodeCurrent,
            episode_total: part.episodeTotal,
            status: part.status,
        }));
    }

    private readText(source: Record<string, unknown>, keys: string[]): string {
        for (const key of keys) {
            const value = source[key];
            if (value === null || value === undefined) continue;
            if (Array.isArray(value)) {
                const text = value.map((entry) => String(entry).trim()).filter(Boolean).join(', ');
                if (text) return text;
                continue;
            }
            const text = String(value).trim();
            if (text) return text;
        }
        return '';
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
        return ['planned', 'watching', 'completed', 'dropped', 'paused'].includes(normalized)
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
}
