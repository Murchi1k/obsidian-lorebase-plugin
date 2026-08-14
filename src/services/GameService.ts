/**
 * LOREBASE - Game Service (Optimized)
 * Handles game data loading, caching, filtering, and sorting
 * OPTIMIZED for performance with 10000+ items
 */

import { App, TFile, TFolder } from 'obsidian';
import { GameDlc, GameItem, GameStatus, FilterState, GameStats, SortField, SortOrder } from '../types';
import { MetadataService } from './MetadataService';
import { DEFAULT_COVER } from '../constants';
import { t } from '../localization';
import { filterAndSortMedia } from './media/filtering';
import { extractSimpleFrontmatter } from './media/libraryViewState';
import { getRandomItem, parseRelatedMedia, serializeRelatedMedia } from './media/parsers';
import { collectFieldTags, collectTags, getAllMarkdownFiles, isTruthy, mapInFrameBatches, normalizeCacheTags } from './media/serviceUtils';
import { upsertMarkdownSection } from './markdownSections';

export { extractMarkdownSection, upsertMarkdownSection } from './markdownSections';

const MY_NOTES_HEADING = 'My Notes';

// =============================================================================
// GAME SERVICE - OPTIMIZED
// =============================================================================

export class GameService {
    private app: App;
    private metadataService: MetadataService;
    private cache: GameItem[] = [];
    private cacheValid = false;
    private folderPath = 'Games';

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

    /**
     * Load all games - HIGHLY OPTIMIZED using metadataCache
     */
    async loadGames(): Promise<GameItem[]> {
        if (this.cacheValid && this.cache.length > 0) {
            return this.cache;
        }

        const folder = this.app.vault.getAbstractFileByPath(this.folderPath);
        if (!folder || !(folder instanceof TFolder)) {
            console.warn(`Games folder not found: ${this.folderPath}`);
            return [];
        }

        const files = getAllMarkdownFiles(folder);
        const games = await mapInFrameBatches(files, (file) => this.parseGameFromCache(file));

        this.cache = games;
        this.cacheValid = true;
        return games;
    }

    getSeriesList(): string[] {
        if (!this.cacheValid || this.cache.length === 0) return [];

        const seriesSet = new Set<string>();
        for (const game of this.cache) {
            const series = game?.gameSeries?.trim();
            if (series) seriesSet.add(series);
        }

        return Array.from(seriesSet.values()).sort((a, b) => a.localeCompare(b));
    }

    private parseCompletionDate(value: unknown): number | null {
        if (value === null || value === undefined) return null;

        if (value instanceof Date) {
            return value.getTime();
        }

        if (typeof value === 'number' && Number.isFinite(value)) {
            if (value >= 1900 && value <= 2100) {
                return new Date(value, 0, 1).getTime();
            }
            if (value > 1e12) return value;
            if (value > 1e9) return value * 1000;
            return null;
        }

        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (!trimmed) return null;
            if (/^\d{4}$/.test(trimmed)) {
                return new Date(Number(trimmed), 0, 1).getTime();
            }
            const parsed = Date.parse(trimmed);
            return Number.isNaN(parsed) ? null : parsed;
        }

        return null;
    }

    private normalizeCompletionDateForFrontmatter(timestamp: number): string {
        const date = new Date(timestamp);
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    private readCompletionTimestamp(frontmatter: Record<string, unknown>, finished: string | null): number | null {
        return this.parseCompletionDate(finished)
            ?? this.parseCompletionDate(frontmatter.dateCompleted)
            ?? this.parseCompletionDate(frontmatter.completionDate);
    }

    private hasFrontmatterKey(frontmatter: Record<string, unknown> | null | undefined, key: string): boolean {
        if (!frontmatter) return false;
        return Boolean(Object.prototype.hasOwnProperty.call(frontmatter, key));
    }

    private readFrontmatterText(frontmatter: Record<string, unknown>, keys: string[]): string | null {
        for (const key of keys) {
            const value = frontmatter[key];
            if (value === undefined || value === null) continue;

            if (Array.isArray(value)) {
                const normalized = value
                    .map(item => String(item).trim())
                    .filter(Boolean)
                    .join(', ');
                if (normalized) return normalized;
                continue;
            }

            const normalized = String(value).trim();
            if (normalized) return normalized;
        }
        return null;
    }

    private readFrontmatterNumber(frontmatter: Record<string, unknown>, keys: string[]): number | null {
        for (const key of keys) {
            const value = frontmatter[key];
            if (value === undefined || value === null || value === '') continue;
            const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
            if (Number.isFinite(parsed)) return parsed;
        }
        return null;
    }

    private readFrontmatterDateText(frontmatter: Record<string, unknown>, keys: string[]): string | null {
        const text = this.readFrontmatterText(frontmatter, keys);
        if (!text) return null;
        const normalized = this.normalizeDateString(text);
        return normalized || text;
    }

    private normalizeDateString(value: string | null | undefined): string {
        const trimmed = (value ?? '').trim();
        if (!trimmed) return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
        const parsed = Date.parse(trimmed);
        if (Number.isNaN(parsed)) return '';
        const date = new Date(parsed);
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    private normalizeListForFrontmatter(values: string[] | undefined, removeHashPrefix: boolean = false): string[] {
        if (!values?.length) return [];

        const normalized: string[] = [];
        const seen = new Set<string>();

        for (const value of values) {
            const raw = removeHashPrefix ? value.replace(/^#+/, '') : value;
            const cleaned = raw.trim().toLowerCase();
            if (!cleaned || seen.has(cleaned)) continue;
            seen.add(cleaned);
            normalized.push(cleaned);
        }

        return normalized;
    }

    private parseDlcList(value: unknown): GameDlc[] {
        if (!Array.isArray(value)) return [];
        const entries: GameDlc[] = [];
        const seen = new Set<string>();

        for (const item of value) {
            if (!item || typeof item !== 'object') continue;
            const record = item as Record<string, unknown>;
            const id = String(record.id ?? record.appid ?? '').trim();
            const title = String(record.title ?? record.name ?? '').trim();
            if (!id || !title || seen.has(id)) continue;
            seen.add(id);
            entries.push({
                id,
                provider: record.provider === 'igdb' ? 'igdb' : 'steam',
                title,
                imageUrl: this.readRecordText(record, ['imageUrl', 'image', 'poster']),
                url: this.readRecordText(record, ['url', 'sourceUrl']),
                userRating: this.parseUserRating(record.userRating ?? record.rating),
                owned: typeof record.owned === 'boolean' ? record.owned : undefined,
            });
        }

        return entries;
    }

    private serializeDlcList(values: GameDlc[] | undefined): Array<Record<string, unknown>> | null {
        if (!values?.length) return null;
        return values.map((item) => ({
            id: item.id,
            provider: item.provider,
            title: item.title,
            image: item.imageUrl || null,
            url: item.url || null,
            userRating: item.userRating ?? null,
            owned: item.owned ?? null,
        }));
    }

    private readRecordText(record: Record<string, unknown>, keys: string[]): string | null {
        for (const key of keys) {
            const value = record[key];
            if (value === null || value === undefined) continue;
            const text = String(value).trim();
            if (text) return text;
        }
        return null;
    }

    private parseUserRating(value: unknown): GameDlc['userRating'] {
        if (value === null || value === undefined || value === '') return null;
        const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
        return Number.isFinite(parsed) && parsed >= 1 && parsed <= 5
            ? parsed as GameDlc['userRating']
            : null;
    }

    private updateFrontmatterTextField(
        frontmatterUpdates: Record<string, unknown>,
        frontmatter: Record<string, unknown> | null | undefined,
        singularKey: string,
        pluralKey: string,
        value: string | undefined
    ): void {
        const values = this.splitDisplayList(value);
        const prefersPlural = this.hasFrontmatterKey(frontmatter, pluralKey) && !this.hasFrontmatterKey(frontmatter, singularKey);

        if (values.length === 0) {
            frontmatterUpdates[singularKey] = null;
            frontmatterUpdates[pluralKey] = null;
            return;
        }

        if (values.length > 1 || prefersPlural) {
            frontmatterUpdates[pluralKey] = values;
            frontmatterUpdates[singularKey] = null;
            return;
        }

        frontmatterUpdates[singularKey] = values[0];
        if (this.hasFrontmatterKey(frontmatter, pluralKey)) frontmatterUpdates[pluralKey] = null;
    }

    private splitDisplayList(value: string | undefined): string[] {
        const result: string[] = [];
        const seen = new Set<string>();
        for (const item of (value ?? '').split(/[,;\n]+/)) {
            const normalized = item.trim();
            const key = normalized.toLocaleLowerCase();
            if (!normalized || seen.has(key)) continue;
            seen.add(key);
            result.push(normalized);
        }
        return result;
    }

    private updateFrontmatterListField(
        frontmatterUpdates: Record<string, unknown>,
        frontmatter: Record<string, unknown> | null | undefined,
        singularKey: string,
        pluralKey: string,
        values: string[] | undefined,
        removeHashPrefix: boolean = false
    ): void {
        const normalized = this.normalizeListForFrontmatter(values, removeHashPrefix);
        const hasSingular = this.hasFrontmatterKey(frontmatter, singularKey);
        const hasPlural = this.hasFrontmatterKey(frontmatter, pluralKey);

        if (hasSingular && !hasPlural) {
            frontmatterUpdates[singularKey] = normalized.length > 0 ? normalized : null;
            return;
        }

        frontmatterUpdates[pluralKey] = normalized.length > 0 ? normalized : null;
    }

    private updateFrontmatterDisplayListField(
        frontmatterUpdates: Record<string, unknown>,
        frontmatter: Record<string, unknown> | null | undefined,
        singularKey: string,
        pluralKey: string,
        values: string[] | undefined
    ): void {
        const normalized: string[] = [];
        const seen = new Set<string>();
        for (const value of values ?? []) {
            const displayValue = String(value ?? '').trim().replace(/\s+/g, ' ');
            const key = displayValue.toLocaleLowerCase();
            if (!displayValue || seen.has(key)) continue;
            seen.add(key);
            normalized.push(displayValue);
        }

        const hasSingular = this.hasFrontmatterKey(frontmatter, singularKey);
        const hasPlural = this.hasFrontmatterKey(frontmatter, pluralKey);
        if (hasSingular && !hasPlural) {
            frontmatterUpdates[singularKey] = normalized.length > 0 ? normalized : null;
            return;
        }
        frontmatterUpdates[pluralKey] = normalized.length > 0 ? normalized : null;
    }

    private updateFrontmatterReleaseDate(
        frontmatterUpdates: Record<string, unknown>,
        frontmatter: Record<string, unknown> | null | undefined,
        value: string | null | undefined
    ): void {
        const normalized = (value ?? '').trim();
        if (!normalized) {
            if (this.hasFrontmatterKey(frontmatter, 'released')) {
                frontmatterUpdates.released = null;
                return;
            }
            if (this.hasFrontmatterKey(frontmatter, 'release_date')) {
                frontmatterUpdates.release_date = null;
                return;
            }
            frontmatterUpdates.releaseDate = null;
            return;
        }

        if (this.hasFrontmatterKey(frontmatter, 'released')) {
            frontmatterUpdates.released = normalized;
            return;
        }
        if (this.hasFrontmatterKey(frontmatter, 'release_date')) {
            frontmatterUpdates.release_date = normalized;
            return;
        }
        frontmatterUpdates.releaseDate = normalized;
    }

    public parseGameFromCache(file: TFile): GameItem | null {
        try {
            const cache = this.app.metadataCache.getFileCache(file);
            const metadata = cache?.frontmatter || {};

            const rawType = typeof metadata.type === 'string' ? metadata.type.trim().toLowerCase() : '';
            if (rawType && rawType !== 'game') {
                return null;
            }

            // Get poster URLs (strict keys)
            const rawPoster = typeof metadata.poster === 'string' ? metadata.poster : '';
            const rawHorizontalPoster = typeof metadata.poster_b === 'string' ? metadata.poster_b : '';
            const imageUrl = this.metadataService.getImageUrl(metadata.poster, metadata.cm_poster);
            const horizontalImageUrl = this.metadataService.getImageUrl(
                metadata.poster_b,
                metadata.cm_poster
            );
            const tags = collectTags(metadata, normalizeCacheTags(cache?.tags));
            const genres = collectFieldTags(metadata, ['genres']);
            const platforms = this.splitDisplayList(
                this.readFrontmatterText(metadata, ['platforms', 'platform', 'Platforms', 'Platform']) ?? undefined
            );
            const started = this.readFrontmatterDateText(metadata, ['started', 'dateStarted', 'start_date']);
            const finished = this.readFrontmatterDateText(metadata, ['finished', 'dateFinished', 'finish_date']);
            const dateCompleted = this.readCompletionTimestamp(metadata, finished);
            const releaseDate = this.readFrontmatterText(metadata, ['releaseDate', 'release_date', 'released', 'release']);
            const publisher = this.readFrontmatterText(metadata, ['publisher', 'publishers']) ?? '';
            const developer = this.readFrontmatterText(metadata, ['developer', 'developers']) ?? '';
            const title = this.readFrontmatterText(metadata, ['name', 'title']) ?? file.basename ?? 'Unknown';
            const sourceUrl = this.readFrontmatterText(metadata, ['url', 'source_url']);
            const steamAppId = this.readFrontmatterText(metadata, ['steamAppId', 'steam_appid', 'appid']);
            const integrationProviderRaw = (this.readFrontmatterText(metadata, ['integration_provider']) ?? '').toLowerCase();
            const integrationProvider = integrationProviderRaw === 'rawg' || integrationProviderRaw === 'steam' || integrationProviderRaw === 'igdb'
                ? integrationProviderRaw
                : steamAppId
                    ? 'steam'
                : null;

            // Determine status (prefer status field, fallback to legacy booleans)
            let status: GameStatus = 'not_started';
            const statusRaw = typeof metadata.status === 'string' ? metadata.status.toLowerCase() : '';
            const statusNormalized = statusRaw.replace(/[-\s]+/g, '_');
            // @deprecated Legacy boolean status fallback kept for old notes.
            if (statusNormalized === 'played') {
                status = 'completed';
            } else if (['completed', 'playing', 'dropped', 'sandbox', 'wishlist', 'not_started'].includes(statusNormalized)) {
                status = statusNormalized as GameStatus;
            } else if (isTruthy(metadata.played)) {
                status = 'completed';
            } else if (isTruthy(metadata.playing)) {
                status = 'playing';
            } else if (isTruthy(metadata.dropped)) {
                status = 'dropped';
            } else if (isTruthy(metadata.sandbox)) {
                status = 'sandbox';
            } else if (isTruthy(metadata.wishlist)) {
                status = 'wishlist';
            }

            // Parse rating safely
            let userRating = null;
            if (metadata.userRating !== undefined && metadata.userRating !== null) {
                const rating = typeof metadata.userRating === 'string'
                    ? parseInt(metadata.userRating, 10)
                    : Number(metadata.userRating);
                if (!isNaN(rating) && rating >= 1 && rating <= 5) {
                    userRating = rating as 1 | 2 | 3 | 4 | 5;
                }
            }

            // Parse year safely
            let year: number | null = null;
            if (metadata.year !== undefined && metadata.year !== null) {
                const parsed = typeof metadata.year === 'number'
                    ? metadata.year
                    : parseInt(String(metadata.year), 10);
                if (!isNaN(parsed)) year = parsed;
            }

            const game: GameItem = {
                type: 'game',
                filePath: file.path,
                displayName: title,
                nameLower: title.toLowerCase(),
                year,
                description: String(metadata.plot || ''),
                userRating,
                favorite: isTruthy(metadata.favorite),
                poster: rawPoster,
                imageUrl: imageUrl || rawPoster || DEFAULT_COVER,
                horizontalImageUrl: horizontalImageUrl || rawHorizontalPoster || null,
                hasCustomPoster: Boolean(metadata.cm_poster),
                isAdult: isTruthy(metadata.Sex18),
                status,
                gameSeries: String(metadata.gameSeries || ''),
                dateCompleted,
                started,
                finished,
                releaseDate,
                publisher,
                developer,
                tags,
                genres,
                platforms,
                sourceUrl,
                integrationProvider,
                integrationId: this.readFrontmatterText(metadata, ['integration_id']) ?? steamAppId,
                steamAppId,
                dlc: this.parseDlcList(metadata.dlc),
                relatedMedia: parseRelatedMedia(metadata.related_media),
                rawFields: extractSimpleFrontmatter(metadata),
                communityRating: this.readFrontmatterNumber(metadata, ['communityRating', 'community_rating']),
                communityVotes: this.readFrontmatterNumber(metadata, ['communityVotes', 'community_votes']),
                communityRatingProvider: this.readFrontmatterText(metadata, ['communityRatingProvider', 'community_rating_provider']),
            };

            return game;
        } catch (e) {
            console.error(`Error parsing game file ${file.path}:`, e);
            return null;
        }
    }

    /**
     * Filter and sort games - OPTIMIZED with safe comparisons
     */
    filterAndSort(
        games: GameItem[],
        filter: FilterState,
        sortField: SortField,
        sortOrder: SortOrder,
        showAdultInAll: boolean = false
    ): GameItem[] {
        return filterAndSortMedia({
            items: games,
            filter,
            sortField,
            sortOrder,
            getCompletedDate: (game) => game.dateCompleted,
            isVisible: (game) => {
                if (filter.adultOnly) {
                    return showAdultInAll && game.isAdult;
                }
                if (filter.customOnly) {
                    return game.hasCustomPoster && (showAdultInAll || !game.isAdult);
                }
                return showAdultInAll || !game.isAdult;
            },
        });
    }

    /**
     * Group games by series - SIMPLIFIED
     */
    groupBySeries(games: GameItem[], sortOrder: SortOrder): Map<string, GameItem[]> {
        const grouped = new Map<string, GameItem[]>();
        const noSeriesKey = t('noSeries');

        for (const game of games) {
            if (!game) continue;
            const series = game.gameSeries || noSeriesKey;
            if (!grouped.has(series)) {
                grouped.set(series, []);
            }
            grouped.get(series)!.push(game);
        }

        // Sort within each series by release year for chronological series order.
        for (const seriesGames of grouped.values()) {
            seriesGames.sort((a, b) => {
                const aYear = a?.year ?? 0;
                const bYear = b?.year ?? 0;
                return sortOrder === 'asc' ? aYear - bYear : bYear - aYear;
            });
        }

        // Sort series keys
        const sortedKeys = Array.from(grouped.keys()).sort((a, b) => {
            if (a === noSeriesKey) return 1;
            if (b === noSeriesKey) return -1;
            return sortOrder === 'asc' ? a.localeCompare(b) : b.localeCompare(a);
        });

        const sortedMap = new Map<string, GameItem[]>();
        for (const key of sortedKeys) {
            sortedMap.set(key, grouped.get(key)!);
        }

        return sortedMap;
    }

    calculateStats(games: GameItem[]): GameStats {
        const stats: GameStats = {
            total: games.length,
            completed: 0, playing: 0, dropped: 0, sandbox: 0, wishlist: 0, notStarted: 0,
            favorite: 0, withRating: 0, avgRating: 0,
            customPosters: 0, adult: 0, seriesCount: 0,
            ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
            statusPercentages: {},
        };

        let ratingSum = 0;
        const seriesSet = new Set<string>();

        for (const game of games) {
            if (!game) continue;

            switch (game.status) {
                case 'completed': stats.completed++; break;
                case 'playing': stats.playing++; break;
                case 'dropped': stats.dropped++; break;
                case 'sandbox': stats.sandbox++; break;
                case 'wishlist': stats.wishlist++; break;
                case 'not_started': stats.notStarted++; break;
            }

            if (game.favorite) stats.favorite++;
            if (game.hasCustomPoster) stats.customPosters++;
            if (game.isAdult) stats.adult++;

            if (game.userRating) {
                stats.withRating++;
                ratingSum += game.userRating;
                stats.ratingDistribution[game.userRating]++;
            }

            if (game.gameSeries && game.gameSeries !== t('noSeries')) {
                seriesSet.add(game.gameSeries);
            }
        }

        stats.avgRating = stats.withRating > 0 ? Math.round((ratingSum / stats.withRating) * 10) / 10 : 0;
        stats.seriesCount = seriesSet.size;

        if (stats.total > 0) {
                stats.statusPercentages = {
                    completed: Math.round((stats.completed / stats.total) * 1000) / 10,
                    playing: Math.round((stats.playing / stats.total) * 1000) / 10,
                    dropped: Math.round((stats.dropped / stats.total) * 1000) / 10,
                    sandbox: Math.round((stats.sandbox / stats.total) * 1000) / 10,
                    wishlist: Math.round((stats.wishlist / stats.total) * 1000) / 10,
                    notStarted: Math.round((stats.notStarted / stats.total) * 1000) / 10,
                };
            }

        return stats;
    }

    async updateGame(game: GameItem, updates: Partial<GameItem>): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(game.filePath);
        if (!file || !(file instanceof TFile)) {
            console.error('Game file not found:', game.filePath);
            return;
        }

        const frontmatterUpdates: Record<string, unknown> = {};
        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;

        if ('userRating' in updates) frontmatterUpdates.userRating = updates.userRating;
        if ('favorite' in updates) frontmatterUpdates.favorite = updates.favorite;
        if ('status' in updates) {
            frontmatterUpdates.status = updates.status ?? 'not_started';
            frontmatterUpdates.played = null;
            frontmatterUpdates.playing = null;
            frontmatterUpdates.dropped = null;
            frontmatterUpdates.sandbox = null;
            frontmatterUpdates.wishlist = null;
        }
        if ('year' in updates) frontmatterUpdates.year = updates.year;
        if ('displayName' in updates) {
            const title = updates.displayName?.trim() ?? '';
            if (this.hasFrontmatterKey(frontmatter, 'title') && !this.hasFrontmatterKey(frontmatter, 'name')) {
                frontmatterUpdates.title = title || null;
            } else {
                frontmatterUpdates.name = title || null;
            }
        }
        if ('description' in updates) frontmatterUpdates.plot = updates.description;
        if ('gameSeries' in updates) frontmatterUpdates.gameSeries = updates.gameSeries || '';
        if ('tags' in updates) this.updateFrontmatterListField(frontmatterUpdates, frontmatter, 'tag', 'tags', updates.tags, true);
        if ('genres' in updates) this.updateFrontmatterListField(frontmatterUpdates, frontmatter, 'genre', 'genres', updates.genres);
        if ('platforms' in updates) this.updateFrontmatterDisplayListField(frontmatterUpdates, frontmatter, 'platform', 'platforms', updates.platforms);
        if ('releaseDate' in updates) this.updateFrontmatterReleaseDate(frontmatterUpdates, frontmatter, updates.releaseDate);
        if ('started' in updates) frontmatterUpdates.started = this.normalizeDateString(updates.started) || null;
        if ('finished' in updates) {
            const normalizedFinished = this.normalizeDateString(updates.finished);
            frontmatterUpdates.finished = normalizedFinished || null;
            if (this.hasFrontmatterKey(frontmatter, 'dateCompleted')) frontmatterUpdates.dateCompleted = null;
            if (this.hasFrontmatterKey(frontmatter, 'completionDate')) frontmatterUpdates.completionDate = null;
        }
        if ('publisher' in updates) this.updateFrontmatterTextField(frontmatterUpdates, frontmatter, 'publisher', 'publishers', updates.publisher);
        if ('developer' in updates) this.updateFrontmatterTextField(frontmatterUpdates, frontmatter, 'developer', 'developers', updates.developer);
        if ('sourceUrl' in updates) frontmatterUpdates.url = updates.sourceUrl || null;
        if ('integrationProvider' in updates) frontmatterUpdates.integration_provider = updates.integrationProvider;
        if ('integrationId' in updates) frontmatterUpdates.integration_id = updates.integrationId;
        if ('steamAppId' in updates) frontmatterUpdates.steamAppId = updates.steamAppId;
        if ('dlc' in updates) frontmatterUpdates.dlc = this.serializeDlcList(updates.dlc);
        if ('relatedMedia' in updates) frontmatterUpdates.related_media = serializeRelatedMedia(updates.relatedMedia);
        if ('communityRating' in updates) frontmatterUpdates.communityRating = updates.communityRating;
        if ('communityVotes' in updates) frontmatterUpdates.communityVotes = updates.communityVotes;
        if ('communityRatingProvider' in updates) frontmatterUpdates.communityRatingProvider = updates.communityRatingProvider;
        if ('dateCompleted' in updates) {
            frontmatterUpdates.finished = updates.dateCompleted && Number.isFinite(updates.dateCompleted)
                ? this.normalizeCompletionDateForFrontmatter(updates.dateCompleted)
                : null;
            if (this.hasFrontmatterKey(frontmatter, 'dateCompleted')) frontmatterUpdates.dateCompleted = null;
            if (this.hasFrontmatterKey(frontmatter, 'completionDate')) frontmatterUpdates.completionDate = null;
        }
        if ('isAdult' in updates) frontmatterUpdates.Sex18 = updates.isAdult;
        // Note: hasCustomPoster is read-only from cm_poster value, don't write boolean to it

        await this.metadataService.updateMetadata(file, frontmatterUpdates);
        if ('myNotes' in updates) {
            await this.updateMyNotesSection(file, updates.myNotes ?? '');
        }

        // No manual refresh here! We rely on metadataCache event in the View.
    }

    private async updateMyNotesSection(file: TFile, value: string): Promise<void> {
        const content = await this.app.vault.read(file);
        const next = upsertMarkdownSection(content, MY_NOTES_HEADING, value);
        if (next !== content) {
            await this.app.vault.modify(file, next);
        }
    }

    async deleteGame(game: GameItem): Promise<boolean> {
        const file = this.app.vault.getAbstractFileByPath(game.filePath);
        if (!file || !(file instanceof TFile)) return false;

        try {
            await this.app.fileManager.trashFile(file);
            this.cache = this.cache.filter(g => g.filePath !== game.filePath);
            return true;
        } catch (e) {
            console.error('Error deleting game:', e);
            return false;
        }
    }

    getRandomGame(games: GameItem[]): GameItem | null {
        return getRandomItem(games);
    }
}
