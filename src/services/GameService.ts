/**
 * LOREBASE - Game Service (Optimized)
 * Handles game data loading, caching, filtering, and sorting
 * OPTIMIZED for performance with 10000+ items
 */

import { App, TFile, TFolder } from 'obsidian';
import { GameItem, GameStatus, FilterState, GameStats, SortField, SortOrder } from '../types';
import { MetadataService } from './MetadataService';
import { DEFAULT_COVER } from '../constants';
import { t } from '../localization';
import { filterAndSortMedia } from './media/filtering';
import { collectFieldTags, collectTags, getAllMarkdownFiles, isTruthy } from './media/serviceUtils';

// =============================================================================
// GAME SERVICE - OPTIMIZED
// =============================================================================

export class GameService {
    private app: App;
    private metadataService: MetadataService;
    private cache: GameItem[] = [];
    private cacheValid = false;
    private folderPath = 'Games';

    constructor(app: App) {
        this.app = app;
        this.metadataService = new MetadataService(app);
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
        const games: GameItem[] = [];

        // Process files synchronously using metadataCache
        // This avoids the "loading..." hang on large folders
        for (const file of files) {
            const game = this.parseGameFromCache(file);
            if (game) {
                games.push(game);
            }
        }

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

    private hasFrontmatterKey(frontmatter: Record<string, unknown> | null | undefined, key: string): boolean {
        if (!frontmatter) return false;
        return Object.prototype.hasOwnProperty.call(frontmatter, key);
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

    private readFrontmatterList(frontmatter: Record<string, unknown>, keys: string[]): string[] {
        const values: string[] = [];
        const seen = new Set<string>();

        for (const key of keys) {
            const rawValue = frontmatter[key];
            for (const value of this.toFrontmatterList(rawValue)) {
                const normalized = value.trim().toLowerCase();
                if (!normalized || seen.has(normalized)) continue;
                seen.add(normalized);
                values.push(normalized);
            }
        }

        return values;
    }

    private toFrontmatterList(value: unknown): string[] {
        if (value === null || value === undefined) return [];

        if (Array.isArray(value)) {
            return value
                .map((item) => String(item).trim())
                .filter(Boolean);
        }

        if (typeof value === 'string') {
            return value
                .split(/[,;\n]+/)
                .map((item) => item.trim())
                .filter(Boolean);
        }

        if (typeof value === 'number') {
            return [String(value)];
        }

        return [];
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

    private updateFrontmatterTextField(
        frontmatterUpdates: Record<string, unknown>,
        frontmatter: Record<string, unknown> | null | undefined,
        singularKey: string,
        pluralKey: string,
        value: string | undefined
    ): void {
        const normalized = (value ?? '').trim();
        const prefersPlural = this.hasFrontmatterKey(frontmatter, pluralKey) && !this.hasFrontmatterKey(frontmatter, singularKey);

        if (prefersPlural) {
            frontmatterUpdates[pluralKey] = normalized ? [normalized] : null;
            return;
        }

        frontmatterUpdates[singularKey] = normalized || null;
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

            const rawType = typeof metadata.type === 'string' ? metadata.type.toLowerCase() : '';
            if (rawType === 'anime') {
                return null;
            }

            // Get poster URLs (strict keys)
            const imageUrl = this.metadataService.getImageUrl(metadata.poster, metadata.cm_poster);
            const horizontalImageUrl = this.metadataService.getImageUrl(
                metadata.poster_b,
                metadata.cm_poster
            );
            const tags = collectTags(metadata, cache?.tags as Array<{ tag: string }> | undefined);
            const genres = collectFieldTags(metadata, ['genres']);
            const dateCompleted = this.parseCompletionDate(metadata.dateCompleted);
            const releaseDate = this.readFrontmatterText(metadata, ['releaseDate', 'release_date', 'released', 'release']);
            const publisher = this.readFrontmatterText(metadata, ['publisher', 'publishers']) ?? '';
            const developer = this.readFrontmatterText(metadata, ['developer', 'developers']) ?? '';
            const title = this.readFrontmatterText(metadata, ['name', 'title']) ?? file.basename ?? 'Unknown';

            // Determine status (prefer status field, fallback to legacy booleans)
            let status: GameStatus = 'not_started';
            const statusRaw = typeof metadata.status === 'string' ? metadata.status.toLowerCase() : '';
            const statusNormalized = statusRaw.replace(/[-\s]+/g, '_');
            if (statusNormalized === 'played') {
                status = 'completed';
            } else if (['completed', 'playing', 'dropped', 'sandbox', 'not_started'].includes(statusNormalized)) {
                status = statusNormalized as GameStatus;
            } else if (isTruthy(metadata.played)) {
                status = 'completed';
            } else if (isTruthy(metadata.playing)) {
                status = 'playing';
            } else if (isTruthy(metadata.dropped)) {
                status = 'dropped';
            } else if (isTruthy(metadata.sandbox)) {
                status = 'sandbox';
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
                poster: typeof metadata.poster === 'string' ? metadata.poster : '',
                imageUrl: imageUrl || DEFAULT_COVER,
                horizontalImageUrl: horizontalImageUrl || null,
                hasCustomPoster: Boolean(metadata.cm_poster),
                isAdult: isTruthy(metadata.Sex18),
                status,
                gameSeries: String(metadata.gameSeries || ''),
                dateCompleted,
                releaseDate,
                publisher,
                developer,
                tags,
                genres,
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
            isVisible: (game, hasGlobalFilters) => {
                if (filter.adultOnly) {
                    return showAdultInAll && game.isAdult;
                }
                if (filter.customOnly) {
                    return game.hasCustomPoster && (showAdultInAll || !game.isAdult);
                }
                return (hasGlobalFilters || !game.hasCustomPoster) && (showAdultInAll || !game.isAdult);
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

        // Sort within each series
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
            completed: 0, playing: 0, dropped: 0, sandbox: 0, notStarted: 0,
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
        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;

        if ('userRating' in updates) frontmatterUpdates.userRating = updates.userRating;
        if ('favorite' in updates) frontmatterUpdates.favorite = updates.favorite;
        if ('status' in updates) {
            frontmatterUpdates.status = updates.status ?? 'not_started';
            frontmatterUpdates.played = null;
            frontmatterUpdates.playing = null;
            frontmatterUpdates.dropped = null;
            frontmatterUpdates.sandbox = null;
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
        if ('releaseDate' in updates) this.updateFrontmatterReleaseDate(frontmatterUpdates, frontmatter, updates.releaseDate);
        if ('publisher' in updates) this.updateFrontmatterTextField(frontmatterUpdates, frontmatter, 'publisher', 'publishers', updates.publisher);
        if ('developer' in updates) this.updateFrontmatterTextField(frontmatterUpdates, frontmatter, 'developer', 'developers', updates.developer);
        if ('dateCompleted' in updates) {
            if (updates.dateCompleted && Number.isFinite(updates.dateCompleted)) {
                frontmatterUpdates.dateCompleted = this.normalizeCompletionDateForFrontmatter(updates.dateCompleted);
            } else {
                frontmatterUpdates.dateCompleted = null;
            }
        }
        if ('isAdult' in updates) frontmatterUpdates.Sex18 = updates.isAdult;
        // Note: hasCustomPoster is read-only from cm_poster value, don't write boolean to it

        await this.metadataService.updateMetadata(file, frontmatterUpdates);

        // No manual refresh here! We rely on metadataCache event in the View.
    }

    async deleteGame(game: GameItem): Promise<boolean> {
        const file = this.app.vault.getAbstractFileByPath(game.filePath);
        if (!file || !(file instanceof TFile)) return false;

        try {
            await this.app.vault.delete(file);
            this.cache = this.cache.filter(g => g.filePath !== game.filePath);
            return true;
        } catch (e) {
            console.error('Error deleting game:', e);
            return false;
        }
    }

    getRandomGame(games: GameItem[]): GameItem | null {
        if (games.length === 0) return null;
        return games[Math.floor(Math.random() * games.length)];
    }
}
