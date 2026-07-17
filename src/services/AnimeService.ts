/**
 * LOREBASE - Anime Service
 * Handles anime data loading, caching, filtering, and sorting
 */

import { App, TFile, TFolder } from 'obsidian';
import { AnimeFormat, AnimeItem, AnimePart, AnimeStatus, AnimeStats, FilterState, SortField, SortOrder } from '../types';
import { MetadataService } from './MetadataService';
import { DEFAULT_COVER } from '../constants';
import { filterAndSortMedia } from './media/filtering';
import { getRandomItem, parseNumber, parseRelatedMedia, parseUserRating, parseYear, serializeRelatedMedia } from './media/parsers';
import { collectFieldTags, collectTags, getAllMarkdownFiles, isTruthy } from './media/serviceUtils';

export class AnimeService {
    private app: App;
    private metadataService: MetadataService;
    private cache: AnimeItem[] = [];
    private cacheValid = false;
    private folderPath = 'Anime';

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
        const animeItems: AnimeItem[] = [];

        for (const file of files) {
            const anime = this.parseAnimeFromCache(file);
            if (anime) {
                animeItems.push(anime);
            }
        }

        this.cache = animeItems;
        this.cacheValid = true;
        return animeItems;
    }

    private getStatusFromString(value: string): AnimeStatus | null {
        const normalized = value.trim().toLowerCase();
        return ['planned', 'watching', 'completed', 'dropped', 'paused'].includes(normalized)
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

        return {
            id: this.normalizePartId(this.readObjectValue(source, ['id']), `${kind}-${index + 1}`),
            kind,
            title,
            seasonNumber,
            episodeCurrent,
            episodeTotal,
            status,
        };
    }

    private buildLegacyPart(anime: Pick<AnimeItem, 'format' | 'seasonCurrent' | 'episodeCurrent' | 'episodeTotal' | 'status'> & { seasonTotal?: number | null }): AnimePart {
        return {
            id: 'legacy-main',
            kind: anime.format,
            title: anime.format === 'tv' && anime.seasonCurrent ? `Season ${anime.seasonCurrent}` : anime.format.toUpperCase(),
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

    private normalizeAnimeParts(metadata: Record<string, unknown>, fallback: Pick<AnimeItem, 'format' | 'seasonCurrent' | 'episodeCurrent' | 'episodeTotal' | 'status'> & { seasonTotal?: number | null }): { parts: AnimePart[]; activePartId: string | null } {
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
            season: part.seasonNumber,
            episode_current: part.episodeCurrent,
            episode_total: part.episodeTotal,
            status: part.status,
        }));
    }

    private areAllTrackablePartsCompleted(parts: AnimePart[]): boolean {
        return parts.length > 0 && parts.every((part) => part.status === 'completed');
    }

    private parseDate(value: unknown): number | null {
        if (value === null || value === undefined) return null;

        if (value instanceof Date) {
            return value.getTime();
        }

        if (typeof value === 'number' && Number.isFinite(value)) {
            if (value > 1e12) return value;
            if (value > 1e9) return value * 1000;
            return null;
        }

        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (!trimmed) return null;
            const parsed = Date.parse(trimmed);
            return Number.isNaN(parsed) ? null : parsed;
        }

        return null;
    }
    public parseAnimeFromCache(file: TFile): AnimeItem | null {
        try {
            const cache = this.app.metadataCache.getFileCache(file);
            const metadata = cache?.frontmatter || {};

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
            const integrationProvider = integrationProviderRaw === 'anilist' || integrationProviderRaw === 'shikimori'
                ? integrationProviderRaw
                : null;
            const integrationId = typeof metadata.integration_id === 'string' || typeof metadata.integration_id === 'number'
                ? String(metadata.integration_id).trim() || null
                : null;

            const format = this.getFormatFromString(metadata.format);

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
            const tags = collectTags(metadata, cache?.tags as Array<{ tag: string }> | undefined);
            const genres = collectFieldTags(metadata, ['genres', 'genre']);
            const dateAdded = file.stat?.ctime ?? file.stat?.mtime ?? Date.now();
            const dateWatched = this.parseDate(metadata.dateWatched);

            const seasonCurrent = parseNumber(metadata.season_current);
            const seasonTotal = parseNumber(metadata.season_total);
            const episodeCurrent = parseNumber(metadata.episode_current);
            const episodeTotal = parseNumber(metadata.episode_total);
            const { parts, activePartId } = this.normalizeAnimeParts(metadata, {
                format,
                status,
                seasonCurrent,
                seasonTotal,
                episodeCurrent,
                episodeTotal,
            });
            const activePart = this.getActivePart(parts, activePartId);

            const anime: AnimeItem = {
                type: 'anime',
                filePath: file.path,
                displayName: title || 'Unknown',
                nameLower: (title || 'unknown').toLowerCase(),
                year: parseYear(metadata.year),
                description: summaryText,
                summary: summaryText,
                userRating: parseUserRating(metadata.rating),
                favorite: isTruthy(metadata.favorite),
                poster: typeof metadata.poster === 'string' ? metadata.poster : '',
                imageUrl: verticalImageUrl || horizontalImageUrl || DEFAULT_COVER,
                horizontalImageUrl: horizontalImageUrl || verticalImageUrl || null,
                hasCustomPoster: Boolean(metadata.cm_poster),
                isAdult: false,
                format,
                status,
                seasonCurrent: activePart?.seasonNumber ?? seasonCurrent,
                seasonTotal,
                episodeCurrent: activePart?.episodeCurrent ?? episodeCurrent,
                episodeTotal: activePart?.episodeTotal ?? episodeTotal,
                genres,
                dateAdded,
                dateWatched,
                tags,
                sourceUrl: sourceUrl || null,
                integrationProvider,
                integrationId,
                parts,
                activePartId,
                relatedMedia: parseRelatedMedia(metadata.related_media),
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
        sortOrder: SortOrder
    ): AnimeItem[] {
        return filterAndSortMedia({
            items,
            filter,
            sortField,
            sortOrder,
            getCompletedDate: (item) => item.dateWatched ?? item.dateAdded,
            isVisible: (item, hasGlobalFilters) => (
                filter.customOnly
                    ? item.hasCustomPoster
                    : hasGlobalFilters || !item.hasCustomPoster
            ),
        });
    }

    async updateAnime(anime: AnimeItem, updates: Partial<AnimeItem>): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(anime.filePath);
        if (!file || !(file instanceof TFile)) {
            console.error('Anime file not found:', anime.filePath);
            return;
        }

        const frontmatterUpdates: Record<string, unknown> = {};

        if ('favorite' in updates) frontmatterUpdates.favorite = updates.favorite;
        if ('status' in updates) frontmatterUpdates.status = updates.status;
        if ('year' in updates) frontmatterUpdates.year = updates.year;
        if ('summary' in updates) frontmatterUpdates.summary = updates.summary;
        if ('userRating' in updates) {
            frontmatterUpdates.rating = updates.userRating ?? null;
            frontmatterUpdates.userRating = null;
        }
        if ('format' in updates) frontmatterUpdates.format = updates.format;
        let parts = updates.parts ?? anime.parts;
        let activePartId = updates.activePartId !== undefined ? updates.activePartId : anime.activePartId;
        if (parts && parts.length > 0) {
            const activePart = this.getActivePart(parts, activePartId);
            if (activePart && activePart.id !== activePartId) {
                activePartId = activePart.id;
            }
            if (this.areAllTrackablePartsCompleted(parts)) {
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
        if ('integrationProvider' in updates) frontmatterUpdates.integration_provider = updates.integrationProvider;
        if ('integrationId' in updates) frontmatterUpdates.integration_id = updates.integrationId;
        if ('genres' in updates) frontmatterUpdates.genres = updates.genres?.length ? updates.genres : null;
        if ('tags' in updates) frontmatterUpdates.tags = updates.tags?.length ? updates.tags : null;
        if ('relatedMedia' in updates) frontmatterUpdates.related_media = serializeRelatedMedia(updates.relatedMedia);

        await this.metadataService.updateMetadata(file, frontmatterUpdates);
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
            favorite: 0,
            withRating: 0,
            avgRating: 0,
            ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
            statusPercentages: {},
        };

        let ratingSum = 0;

        for (const item of anime) {
            if (!item) continue;

            switch (item.status) {
                case 'planned': stats.planned++; break;
                case 'watching': stats.watching++; break;
                case 'completed': stats.completed++; break;
                case 'dropped': stats.dropped++; break;
                case 'paused': stats.paused++; break;
            }

            if (item.favorite) stats.favorite++;

            if (item.userRating) {
                stats.withRating++;
                ratingSum += item.userRating;
                stats.ratingDistribution[item.userRating]++;
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
            };
        }

        return stats;
    }

}
