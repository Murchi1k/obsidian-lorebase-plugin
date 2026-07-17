import { App, TFile, TFolder } from 'obsidian';
import { BookItem, FilterState, MangaItem, MangaPart, ReadingItem, ReadingStatus, ReadingStats, RelatedMediaLink, SortField, SortOrder } from '../types';
import { DEFAULT_COVER } from '../constants';
import { MetadataService } from './MetadataService';
import { filterAndSortMedia } from './media/filtering';
import { getRandomItem, parseNumber, parseRelatedMedia, parseUserRating, parseYear, serializeRelatedMedia } from './media/parsers';
import { collectFieldTags, collectTags, getAllMarkdownFiles, isTruthy } from './media/serviceUtils';

export type ReadingMediaType = 'book' | 'manga';

export class ReadingService {
    private app: App;
    private metadataService: MetadataService;
    private cache: ReadingItem[] = [];
    private cacheValid = false;
    private folderPath: string;
    private mediaType: ReadingMediaType;

    constructor(app: App, mediaType: ReadingMediaType, folderPath: string, metadataService: MetadataService) {
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

    async loadItems(): Promise<ReadingItem[]> {
        if (this.cacheValid) return this.cache;

        const folder = this.app.vault.getAbstractFileByPath(this.folderPath);
        if (!folder || !(folder instanceof TFolder)) {
            console.warn(`${this.mediaType} folder not found: ${this.folderPath}`);
            return [];
        }

        this.cache = getAllMarkdownFiles(folder)
            .map((file) => this.parseFromCache(file))
            .filter((item): item is ReadingItem => Boolean(item));
        this.cacheValid = true;
        return this.cache;
    }

    async loadBooks(): Promise<BookItem[]> {
        if (this.mediaType !== 'book') return [];
        return (await this.loadItems()).filter((item): item is BookItem => item.type === 'book');
    }

    async loadManga(): Promise<MangaItem[]> {
        if (this.mediaType !== 'manga') return [];
        return (await this.loadItems()).filter((item): item is MangaItem => item.type === 'manga');
    }

    parseFromCache(file: TFile): ReadingItem | null {
        try {
            const cache = this.app.metadataCache.getFileCache(file);
            const metadata = cache?.frontmatter || {};
            const rawType = typeof metadata.type === 'string' ? metadata.type.trim().toLowerCase() : '';
            if (rawType && rawType !== this.mediaType) return null;

            const title = this.readText(metadata, ['title', 'name']) || file.basename?.trim() || 'Untitled';
            const description = this.readText(metadata, ['plot', 'summary', 'description']) || '';
            const poster = this.readText(metadata, ['poster', 'image']) || null;
            const horizontal = this.readText(metadata, ['poster_b', 'image_b', 'horizontal_poster']) || poster;
            const verticalImageUrl = this.metadataService.getImageUrl(metadata.poster ?? metadata.image, metadata.cm_poster);
            const horizontalImageUrl = this.metadataService.getImageUrl(metadata.poster_b ?? metadata.image_b ?? metadata.horizontal_poster, metadata.cm_poster);
            const status = this.getStatus(this.readText(metadata, ['status']) || '') ?? 'planned';
            const base = {
                filePath: file.path,
                displayName: title,
                nameLower: title.toLowerCase(),
                year: parseYear(metadata.year ?? metadata.first_publish_year),
                description,
                summary: description,
                userRating: parseUserRating(metadata.userRating ?? metadata.rating_user ?? metadata.rating),
                favorite: isTruthy(metadata.favorite),
                poster,
                imageUrl: verticalImageUrl || poster || DEFAULT_COVER,
                horizontalImageUrl: horizontalImageUrl || horizontal || verticalImageUrl || poster || null,
                hasCustomPoster: Boolean(metadata.cm_poster || poster),
                isAdult: false,
                status,
                genres: collectFieldTags(metadata, ['genres', 'genre', 'subjects', 'subject']),
                tags: collectTags(metadata, cache?.tags),
                dateAdded: file.stat?.ctime ?? file.stat?.mtime ?? Date.now(),
                lastModified: file.stat?.mtime ?? file.stat?.ctime ?? Date.now(),
                sourceUrl: this.readText(metadata, ['url', 'source_url']) || null,
                integrationProvider: this.normalizeProvider(this.readText(metadata, ['integration_provider'])),
                integrationId: this.readText(metadata, ['integration_id']) || null,
                relatedMedia: parseRelatedMedia(metadata.related_media),
            };

            if (this.mediaType === 'book') {
                return {
                    ...base,
                    type: 'book',
                    authors: this.toStringArray(metadata.authors ?? metadata.author ?? metadata.author_name),
                    publisher: this.readText(metadata, ['publisher', 'publishers']) || '',
                    releaseDate: this.readText(metadata, ['released', 'release_date', 'publishedDate', 'publish_date']) || null,
                    pageCurrent: parseNumber(metadata.page_current ?? metadata.pageCurrent),
                    pageTotal: parseNumber(metadata.page_total ?? metadata.pageTotal ?? metadata.pages ?? metadata.pageCount ?? metadata.number_of_pages),
                    chapterCurrent: parseNumber(metadata.chapter_current ?? metadata.chapterCurrent),
                    chapterTotal: parseNumber(metadata.chapter_total ?? metadata.chapterTotal ?? metadata.chapters),
                    integrationProvider: base.integrationProvider === 'hardcover' || base.integrationProvider === 'googlebooks'
                        ? base.integrationProvider
                        : null,
                };
            }

            const chapterCurrent = parseNumber(metadata.chapter_current ?? metadata.chapterCurrent);
            const chapterTotal = parseNumber(metadata.chapter_total ?? metadata.chapterTotal ?? metadata.chapters);
            const volumeCurrent = parseNumber(metadata.volume_current ?? metadata.volumeCurrent);
            const volumeTotal = parseNumber(metadata.volume_total ?? metadata.volumeTotal ?? metadata.volumes);
            const parts = this.normalizeMangaParts(metadata, {
                chapterCurrent,
                chapterTotal,
                volumeCurrent,
                volumeTotal,
                status,
            });
            const activePartId = this.normalizeActivePartId(parts, this.readText(metadata, ['active_part_id']));
            const activePart = this.getActivePart(parts, activePartId);

            return {
                ...base,
                type: 'manga',
                authors: this.toStringArray(metadata.authors ?? metadata.author),
                artists: this.toStringArray(metadata.artists ?? metadata.artist),
                chapterCurrent: activePart?.chapterCurrent ?? chapterCurrent,
                chapterTotal: activePart?.chapterTotal ?? chapterTotal,
                volumeCurrent: activePart?.volumeNumber ?? volumeCurrent,
                volumeTotal: volumeTotal ?? (parts.length ? parts.length : null),
                parts,
                activePartId,
                integrationProvider: base.integrationProvider === 'anilist'
                    || base.integrationProvider === 'shikimori'
                    || base.integrationProvider === 'jikan'
                    || base.integrationProvider === 'mangadex'
                    ? base.integrationProvider
                    : null,
            };
        } catch (error) {
            console.error(`Error parsing ${this.mediaType}:`, error);
            return null;
        }
    }

    filterAndSort(items: ReadingItem[], filter: FilterState, sortField: SortField, sortOrder: SortOrder): ReadingItem[] {
        return filterAndSortMedia({
            items,
            filter,
            sortField,
            sortOrder,
            isVisible: () => true,
            getCompletedDate: () => null,
        });
    }

    getRandomItem(items: ReadingItem[]): ReadingItem | null {
        return getRandomItem(items);
    }

    calculateStats(items: ReadingItem[]): ReadingStats {
        const stats: ReadingStats = {
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

    async updateItem(item: ReadingItem, updates: Partial<ReadingItem> & Record<string, unknown>): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(item.filePath);
        if (!(file instanceof TFile)) return;

        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
        const frontmatterUpdates: Record<string, unknown> = {};

        frontmatterUpdates.type = item.type;
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
        if ('status' in updates) frontmatterUpdates.status = updates.status;
        if ('userRating' in updates) frontmatterUpdates.rating = updates.userRating ?? null;
        if ('favorite' in updates) frontmatterUpdates.favorite = updates.favorite;
        if ('sourceUrl' in updates) this.updateTextField(frontmatterUpdates, frontmatter, ['url', 'source_url'], updates.sourceUrl);
        if ('integrationProvider' in updates) frontmatterUpdates.integration_provider = updates.integrationProvider;
        if ('integrationId' in updates) frontmatterUpdates.integration_id = updates.integrationId;
        if ('relatedMedia' in updates) frontmatterUpdates.related_media = serializeRelatedMedia(updates.relatedMedia as RelatedMediaLink[] | undefined);

        if (item.type === 'book') {
            if ('authors' in updates) this.updateListField(frontmatterUpdates, frontmatter, ['authors', 'author'], updates.authors);
            if ('publisher' in updates) this.updateTextField(frontmatterUpdates, frontmatter, ['publisher', 'publishers'], updates.publisher);
            if ('releaseDate' in updates) this.updateTextField(frontmatterUpdates, frontmatter, ['released', 'release_date', 'publishedDate'], updates.releaseDate);
            const pageTotal = 'pageTotal' in updates ? this.normalizeProgressValue(updates.pageTotal) : item.pageTotal;
            const pageCurrent = 'pageCurrent' in updates ? this.normalizeProgressValue(updates.pageCurrent, pageTotal) : item.pageCurrent;
            const chapterTotal = 'chapterTotal' in updates ? this.normalizeProgressValue(updates.chapterTotal) : item.chapterTotal;
            const chapterCurrent = 'chapterCurrent' in updates ? this.normalizeProgressValue(updates.chapterCurrent, chapterTotal) : item.chapterCurrent;
            if ('pageCurrent' in updates) frontmatterUpdates.page_current = pageCurrent;
            if ('pageTotal' in updates) frontmatterUpdates.page_total = pageTotal;
            if ('chapterCurrent' in updates) frontmatterUpdates.chapter_current = chapterCurrent;
            if ('chapterTotal' in updates) frontmatterUpdates.chapter_total = chapterTotal;
            const pagesDone = (pageTotal ?? 0) > 0 && (pageCurrent ?? 0) >= (pageTotal ?? 0);
            const chaptersDone = (chapterTotal ?? 0) > 0 && (chapterCurrent ?? 0) >= (chapterTotal ?? 0);
            if (pagesDone || chaptersDone) {
                frontmatterUpdates.status = 'completed';
            }
        } else {
            if ('authors' in updates) this.updateListField(frontmatterUpdates, frontmatter, ['authors', 'author'], updates.authors);
            if ('artists' in updates) this.updateListField(frontmatterUpdates, frontmatter, ['artists', 'artist'], updates.artists);
            let parts = this.cloneParts(Array.isArray(updates.parts) ? updates.parts as MangaPart[] : item.parts ?? []);
            let activePartId = updates.activePartId !== undefined ? String(updates.activePartId || '') || null : item.activePartId ?? null;
            const chapterTotal = 'chapterTotal' in updates ? this.normalizeProgressValue(updates.chapterTotal) : item.chapterTotal;
            const chapterCurrent = 'chapterCurrent' in updates ? this.normalizeProgressValue(updates.chapterCurrent, chapterTotal) : item.chapterCurrent;

            if (parts.length) {
                if ('volumeCurrent' in updates) {
                    const targetVolume = parseNumber(updates.volumeCurrent);
                    const volumePart = parts.find((part) => part.volumeNumber === targetVolume);
                    if (volumePart) activePartId = volumePart.id;
                }
                const activeIndex = parts.findIndex((part) => part.id === activePartId);
                const normalizedIndex = activeIndex >= 0 ? activeIndex : 0;
                const active = parts[normalizedIndex];
                activePartId = active?.id ?? null;
                if (active && 'chapterCurrent' in updates) active.chapterCurrent = chapterCurrent;
                if (active && 'chapterTotal' in updates) active.chapterTotal = chapterTotal;
                if (active && (active.chapterTotal ?? 0) > 0 && (active.chapterCurrent ?? 0) >= (active.chapterTotal ?? 0)) {
                    active.status = 'completed';
                }
            }

            if (parts.length && this.areAllMangaPartsCompleted(parts)) {
                frontmatterUpdates.status = 'completed';
            }
            if ('parts' in updates || 'chapterCurrent' in updates || 'chapterTotal' in updates || 'volumeCurrent' in updates) {
                frontmatterUpdates.manga_parts = this.serializeMangaParts(parts);
                frontmatterUpdates.active_part_id = activePartId ?? null;
            }
            if ('chapterCurrent' in updates) frontmatterUpdates.chapter_current = chapterCurrent;
            if ('chapterTotal' in updates) frontmatterUpdates.chapter_total = chapterTotal;
            if ('volumeCurrent' in updates) frontmatterUpdates.volume_current = this.normalizeProgressValue(updates.volumeCurrent);
            if ('volumeTotal' in updates) frontmatterUpdates.volume_total = this.normalizeProgressValue(updates.volumeTotal);
        }

        await this.metadataService.updateMetadata(file, frontmatterUpdates);
        this.invalidateCache();
    }

    async deleteItem(item: ReadingItem): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(item.filePath);
        if (file instanceof TFile) {
            await this.app.fileManager.trashFile(file);
            this.invalidateCache();
        }
    }

    private normalizeMangaParts(
        metadata: Record<string, unknown>,
        fallback: Pick<MangaItem, 'chapterCurrent' | 'chapterTotal' | 'volumeCurrent' | 'volumeTotal' | 'status'>
    ): MangaPart[] {
        const rawParts = Array.isArray(metadata.manga_parts) ? metadata.manga_parts : [];
        const parts = rawParts
            .map((entry, index) => this.parseMangaPart(entry, index))
            .filter((part): part is MangaPart => Boolean(part));
        if (parts.length) return parts;

        if (fallback.volumeCurrent !== null || fallback.volumeTotal !== null || fallback.chapterCurrent !== null || fallback.chapterTotal !== null) {
            return [{
                id: 'main',
                kind: 'volume',
                title: fallback.volumeCurrent ? `Volume ${fallback.volumeCurrent}` : 'Main',
                volumeNumber: fallback.volumeCurrent,
                chapterCurrent: fallback.chapterCurrent,
                chapterTotal: fallback.chapterTotal,
                status: fallback.status,
            }];
        }

        return [];
    }

    private parseMangaPart(raw: unknown, index: number): MangaPart | null {
        if (!raw || typeof raw !== 'object') return null;
        const source = raw as Record<string, unknown>;
        const volumeNumber = parseNumber(source.volumeNumber ?? source.volume ?? source.volume_number);
        const title = this.readText(source, ['title', 'name', 'label']) || (volumeNumber ? `Volume ${volumeNumber}` : `Volume ${index + 1}`);
        return {
            id: this.readText(source, ['id']) || `volume-${volumeNumber ?? index + 1}`,
            kind: 'volume',
            title,
            volumeNumber,
            chapterCurrent: parseNumber(source.chapterCurrent ?? source.chapter_current ?? source.current),
            chapterTotal: parseNumber(source.chapterTotal ?? source.chapter_total ?? source.total),
            status: this.getStatus(this.readText(source, ['status']) || '') ?? 'planned',
        };
    }

    private serializeMangaParts(parts: MangaPart[]): Array<Record<string, unknown>> {
        return parts.map((part) => ({
            id: part.id,
            kind: part.kind,
            title: part.title,
            volume: part.volumeNumber,
            chapter_current: part.chapterCurrent,
            chapter_total: part.chapterTotal,
            status: part.status,
        }));
    }

    private cloneParts(parts: MangaPart[]): MangaPart[] {
        return parts.map((part) => ({ ...part }));
    }

    private areAllMangaPartsCompleted(parts: MangaPart[]): boolean {
        return parts.length > 0 && parts.every((part) => part.status === 'completed');
    }

    private getActivePart(parts: MangaPart[], activePartId: string | null): MangaPart | null {
        if (!parts.length) return null;
        return parts.find((part) => part.id === activePartId) ?? parts[0] ?? null;
    }

    private normalizeActivePartId(parts: MangaPart[], raw: string): string | null {
        if (!parts.length) return null;
        const normalized = raw.trim();
        return parts.some((part) => part.id === normalized) ? normalized : parts[0]?.id ?? null;
    }

    private normalizeProgressValue(value: unknown, total?: number | null): number | null {
        const parsed = parseNumber(value);
        if (parsed === null) return null;
        const rounded = Math.max(0, Math.trunc(parsed));
        return total && total > 0 ? Math.min(rounded, total) : rounded;
    }

    private getStatus(value: string): ReadingStatus | null {
        const normalized = value.trim().toLowerCase();
        return ['planned', 'watching', 'completed', 'dropped', 'paused'].includes(normalized)
            ? normalized as ReadingStatus
            : null;
    }

    private normalizeProvider(value: string): string | null {
        const normalized = value.trim().toLowerCase();
        return ['hardcover', 'googlebooks', 'anilist', 'shikimori', 'jikan', 'mangadex'].includes(normalized)
            ? normalized
            : null;
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

    private toStringArray(value: unknown): string[] {
        if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean);
        if (typeof value === 'string') return value.split(/[,;\n]+/).map((entry) => entry.trim()).filter(Boolean);
        return [];
    }
}
