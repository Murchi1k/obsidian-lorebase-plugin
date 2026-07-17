/**
 * LOREBASE - Type Definitions
 * Core type definitions for all media types and plugin settings
 */
import type { App } from 'obsidian';
import type { AnimeService } from '../services/AnimeService';
import type { GameService } from '../services/GameService';
import type { MetadataService } from '../services/MetadataService';
import type { ReadingService } from '../services/ReadingService';
import type { VideoService } from '../services/VideoService';

// =============================================================================
// MEDIA TYPES
// =============================================================================

/** Supported media types in the library */
export type MediaType = 'game' | 'anime' | 'movie' | 'series' | 'book' | 'manga';

/** Game completion status */
export type GameStatus = 'completed' | 'playing' | 'dropped' | 'sandbox' | 'wishlist' | 'not_started';

/** Anime release format */
export type AnimeFormat = 'tv' | 'movie' | 'ova' | 'ona' | 'special';

/** Anime watch status */
export type AnimeStatus = 'planned' | 'watching' | 'completed' | 'dropped' | 'paused';

/** Movie/series watch status */
export type VideoStatus = AnimeStatus;

/** Book/manga reading status */
export type ReadingStatus = AnimeStatus;

/** Status across all media types */
export type MediaStatus = GameStatus | AnimeStatus;

/** Top-level settings page presentation */
export type SettingsLayoutMode = 'tabs' | 'accordion';

/** User-defined visible label overrides for fixed status values */
export type StatusLabelSettings = {
    games: Partial<Record<GameStatus, string>>;
    anime: Partial<Record<AnimeStatus, string>>;
    movies: Partial<Record<VideoStatus, string>>;
    series: Partial<Record<VideoStatus, string>>;
    books: Partial<Record<ReadingStatus, string>>;
    manga: Partial<Record<ReadingStatus, string>>;
};

/** Preset tag displayed as a first-class planning chip in game UI */
export interface TagPreset {
    id: string;
    label: string;
    tag: string;
    icon?: string;
}

/** Preset groups for media tags */
interface TagPresetSettings {
    games: TagPreset[];
}

/** Trackable part of a single anime title: TV season, OVA, special, movie, etc. */
export interface AnimePart {
    id: string;
    kind: AnimeFormat;
    title: string;
    seasonNumber: number | null;
    episodeCurrent: number | null;
    episodeTotal: number | null;
    status: AnimeStatus;
}

/** Trackable part of a movie collection or TV series */
export interface VideoPart {
    id: string;
    kind: 'movie' | 'season';
    title: string;
    seasonNumber: number | null;
    episodeCurrent: number | null;
    episodeTotal: number | null;
    status: VideoStatus;
}

/** Trackable volume of a manga title */
export interface MangaPart {
    id: string;
    kind: 'volume';
    title: string;
    volumeNumber: number | null;
    chapterCurrent: number | null;
    chapterTotal: number | null;
    status: ReadingStatus;
}

/** Link from one media note to another local LOREBASE note */
export interface RelatedMediaLink {
    type: MediaType;
    path: string;
    title: string;
    imageUrl?: string | null;
}

/** User rating from 1-5 */
export type UserRating = 1 | 2 | 3 | 4 | 5 | null;

/** Card size options */
export type CardSize = 'small' | 'medium' | 'large';

/** Card orientation */
export type CardOrientation = 'vertical' | 'horizontal';

/** Card visual style */
export type CardStyle = 'hover' | 'progress';

/** Sort field options */
export type SortField = 'name' | 'series' | 'year' | 'rating' | 'dateCompleted';

/** Sort order */
export type SortOrder = 'asc' | 'desc';

/** View mode */
export type ViewMode = 'grid' | 'horizontal';

/** Supported languages */
export type Language = 'en' | 'ru' | 'uk';

/** Particle effect options */
export type ParticleEffect = 'none' | 'sakura' | 'snow';

/** Template mode options */
type TemplateMode = 'simple' | 'advanced';

/** Steam Sync duplicate handling mode */
export type SteamSyncDuplicateMode = 'skip' | 'update' | 'ask';

/** Badge container positions on card */
export type BadgePosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/** Rating badge render mode */
export type RatingBadgeMode = 'star' | 'emoji';

/** Hover overlay text offset */
interface OverlayTextOffset {
    x: number;
    y: number;
}

/** Hover overlay layout settings */
interface OverlayTextLayout {
    title: OverlayTextOffset;
    year: OverlayTextOffset;
    format: OverlayTextOffset;
    description: OverlayTextOffset;
}

/** Hover overlay field visibility */
interface OverlayTextVisibility {
    title: boolean;
    year: boolean;
    format: boolean;
    description: boolean;
}

/** Per-badge display settings */
interface BadgeItemSettings {
    enabled: boolean;
    position: BadgePosition;
    /** Horizontal position in percent (0-100) */
    x: number;
    /** Vertical position in percent (0-100) */
    y: number;
}

/** Card badges configuration */
interface BadgeSettings {
    status: BadgeItemSettings & {
        iconOnly: boolean;
    };
    rating: BadgeItemSettings & {
        mode: RatingBadgeMode;
    };
    favorite: BadgeItemSettings & {
        subtlePulse: boolean;
    };
}

// =============================================================================
// MEDIA ITEM INTERFACES
// =============================================================================

/** Base interface for all media items */
interface BaseMediaItem {
    /** File path in vault */
    filePath: string;
    /** Display name (title) */
    displayName: string;
    /** Lowercase name for search optimization */
    nameLower: string;
    /** Release year */
    year: number | null;
    /** Description/plot */
    description: string;
    /** User rating 1-5 */
    userRating: UserRating;
    /** Is favorite */
    favorite: boolean;
    /** Poster path or URL */
    poster: string | null;
    /** Resolved image URL for display */
    imageUrl: string;
    /** Optional horizontal image URL for landscape layout */
    horizontalImageUrl?: string | null;
    /** Has custom poster */
    hasCustomPoster: boolean;
    /** Is adult content (18+) */
    isAdult: boolean;
}

/** Game-specific item */
export interface GameItem extends BaseMediaItem {
    type: 'game';
    /** Game status */
    status: GameStatus;
    /** Game series name */
    gameSeries: string;
    /** Date completed (from frontmatter, if available) */
    dateCompleted: number | null;
    /** Release date stored in frontmatter */
    releaseDate?: string | null;
    /** Publisher stored in frontmatter */
    publisher?: string;
    /** Developer stored in frontmatter */
    developer?: string;
    /** Tags applied to the game */
    tags: string[];
    /** Genre tags (separate field) */
    genres: string[];
}

/** Anime-specific item */
export interface AnimeItem extends BaseMediaItem {
    type: 'anime';
    /** Anime format */
    format: AnimeFormat;
    /** Watch status */
    status: AnimeStatus;
    /** Summary from frontmatter */
    summary: string;
    /** Current season */
    seasonCurrent: number | null;
    /** Total seasons */
    seasonTotal?: number | null;
    /** Current episode */
    episodeCurrent: number | null;
    /** Total episodes */
    episodeTotal: number | null;
    /** Genres */
    genres: string[];
    /** Date added (from frontmatter or file stats) */
    dateAdded: number;
    /** Date watched (from frontmatter) */
    dateWatched: number | null;
    /** Tags applied to the anime */
    tags: string[];
    /** Optional source URL */
    sourceUrl?: string | null;
    /** Metadata provider used to create/update anime composition */
    integrationProvider?: 'anilist' | 'shikimori' | null;
    /** Provider-specific anime id used to refresh anime composition */
    integrationId?: string | null;
    /** Trackable seasons/OVA/specials for this title */
    parts?: AnimePart[];
    /** Currently active part for quick progress actions */
    activePartId?: string | null;
    /** Locally linked media notes */
    relatedMedia?: RelatedMediaLink[];
}

export interface MovieItem extends BaseMediaItem {
    type: 'movie';
    status: VideoStatus;
    summary: string;
    releaseDate?: string | null;
    runtime?: string;
    director?: string;
    actors?: string;
    rating?: string;
    genres: string[];
    tags: string[];
    sourceUrl?: string | null;
    integrationProvider?: 'tmdb' | 'tvmaze' | 'omdb' | null;
    integrationId?: string | null;
    parts?: VideoPart[];
    activePartId?: string | null;
    relatedMedia?: RelatedMediaLink[];
}

export interface SeriesItem extends BaseMediaItem {
    type: 'series';
    status: VideoStatus;
    summary: string;
    releaseDate?: string | null;
    runtime?: string;
    director?: string;
    actors?: string;
    seasons: number | null;
    episodeCurrent: number | null;
    episodeTotal: number | null;
    networks?: string[];
    studios?: string[];
    rating?: string;
    genres: string[];
    tags: string[];
    sourceUrl?: string | null;
    integrationProvider?: 'tmdb' | 'tvmaze' | 'omdb' | null;
    integrationId?: string | null;
    parts?: VideoPart[];
    activePartId?: string | null;
    relatedMedia?: RelatedMediaLink[];
}

export interface BookItem extends BaseMediaItem {
    type: 'book';
    status: ReadingStatus;
    summary: string;
    authors: string[];
    publisher?: string;
    releaseDate?: string | null;
    pageCurrent: number | null;
    pageTotal: number | null;
    chapterCurrent: number | null;
    chapterTotal: number | null;
    genres: string[];
    tags: string[];
    dateAdded: number;
    lastModified: number;
    sourceUrl?: string | null;
    integrationProvider?: 'hardcover' | 'googlebooks' | null;
    integrationId?: string | null;
    relatedMedia?: RelatedMediaLink[];
}

export interface MangaItem extends BaseMediaItem {
    type: 'manga';
    status: ReadingStatus;
    summary: string;
    authors: string[];
    artists: string[];
    chapterCurrent: number | null;
    chapterTotal: number | null;
    volumeCurrent: number | null;
    volumeTotal: number | null;
    genres: string[];
    tags: string[];
    dateAdded: number;
    lastModified: number;
    sourceUrl?: string | null;
    integrationProvider?: 'anilist' | 'shikimori' | 'jikan' | 'mangadex' | null;
    integrationId?: string | null;
    parts?: MangaPart[];
    activePartId?: string | null;
    relatedMedia?: RelatedMediaLink[];
}

/** Union for all media item types */
export type ReadingItem = BookItem | MangaItem;
export type MediaItem = GameItem | AnimeItem | MovieItem | SeriesItem | BookItem | MangaItem;

// =============================================================================
// SETTINGS INTERFACES
// =============================================================================

/** Library-specific settings */
interface LibrarySettings {
    /** Folder path in vault */
    folderPath: string;
    /** Number of columns in grid */
    columns: number;
    /** Card size */
    cardSize: CardSize;
    /** Card visual style */
    cardStyle: CardStyle;
    /** Use custom card dimensions instead of preset sizes */
    customCardSize: boolean;
    /** Vertical card minimum width (also used for adaptive columns) */
    customCardMinWidth: number;
    /** Vertical card minimum height */
    customCardMinHeight: number;
    /** Vertical card image aspect ratio (width / height) */
    customCardImageRatio: number;
    /** Horizontal card minimum width */
    customHorizontalCardMinWidth: number;
    /** Horizontal card height */
    customHorizontalCardHeight: number;
    /** Show anime season progress badge on cards */
    showAnimeSeasonProgress: boolean;
    /** Show anime episode progress badge on cards */
    showAnimeEpisodeProgress: boolean;
    /** Add hardcover/book-spine visual treatment for book-like cards */
    bookCoverEffect: boolean;
    /** Card orientation */
    orientation: CardOrientation;
    /** Current sort field */
    sortField: SortField;
    /** Current sort order */
    sortOrder: SortOrder;
    /** Show 18+ content in 'all' mode */
    showAdultInAll: boolean;
}

/** Plugin settings structure */
export interface LorebaseSettings {
    /** Interface language */
    language: Language;
    /** Top-level settings page presentation */
    settingsLayoutMode: SettingsLayoutMode;
    /** Accent color (hex) */
    accentColor: string;
    /** Show provider/manual choice before opening the add flow */
    showAddModeChoice: boolean;
    /** Enabled media types */
    enabledMedia: {
        games: boolean;
        anime: boolean;
        movies: boolean;
        series: boolean;
        books: boolean;
        manga: boolean;
    };
    /** Particle effect type */
    particleEffect: ParticleEffect;
    /** Particle intensity */
    particleIntensity: number;
    /** Max lines for game card description in hover overlay */
    descriptionLines: number;
    /** Max lines for horizontal game card description in hover overlay */
    horizontalDescriptionLines: number;
    /** Hover overlay text positions for games */
    overlayTextLayout: OverlayTextLayout;
    /** Hover overlay text positions for horizontal game cards */
    horizontalOverlayTextLayout: OverlayTextLayout;
    /** Hover overlay field visibility for games */
    overlayTextVisibility: OverlayTextVisibility;
    /** Hover overlay field visibility for horizontal game cards */
    horizontalOverlayTextVisibility: OverlayTextVisibility;
    /** Max lines for anime card description in hover overlay */
    animeDescriptionLines: number;
    /** Max lines for horizontal anime card description in hover overlay */
    animeHorizontalDescriptionLines: number;
    /** Max lines for movie card description in hover overlay */
    movieDescriptionLines: number;
    /** Max lines for horizontal movie card description in hover overlay */
    movieHorizontalDescriptionLines: number;
    /** Max lines for series card description in hover overlay */
    seriesDescriptionLines: number;
    /** Max lines for horizontal series card description in hover overlay */
    seriesHorizontalDescriptionLines: number;
    /** Max lines for book card description in hover overlay */
    bookDescriptionLines: number;
    /** Max lines for horizontal book card description in hover overlay */
    bookHorizontalDescriptionLines: number;
    /** Max lines for manga card description in hover overlay */
    mangaDescriptionLines: number;
    /** Max lines for horizontal manga card description in hover overlay */
    mangaHorizontalDescriptionLines: number;
    /** Hover overlay text positions for anime */
    animeOverlayTextLayout: OverlayTextLayout;
    /** Hover overlay text positions for horizontal anime cards */
    animeHorizontalOverlayTextLayout: OverlayTextLayout;
    /** Hover overlay text positions for movies */
    movieOverlayTextLayout: OverlayTextLayout;
    /** Hover overlay text positions for horizontal movie cards */
    movieHorizontalOverlayTextLayout: OverlayTextLayout;
    /** Hover overlay text positions for series */
    seriesOverlayTextLayout: OverlayTextLayout;
    /** Hover overlay text positions for horizontal series cards */
    seriesHorizontalOverlayTextLayout: OverlayTextLayout;
    /** Hover overlay text positions for books */
    bookOverlayTextLayout: OverlayTextLayout;
    /** Hover overlay text positions for horizontal book cards */
    bookHorizontalOverlayTextLayout: OverlayTextLayout;
    /** Hover overlay text positions for manga */
    mangaOverlayTextLayout: OverlayTextLayout;
    /** Hover overlay text positions for horizontal manga cards */
    mangaHorizontalOverlayTextLayout: OverlayTextLayout;
    /** Hover overlay field visibility for anime */
    animeOverlayTextVisibility: OverlayTextVisibility;
    /** Hover overlay field visibility for horizontal anime cards */
    animeHorizontalOverlayTextVisibility: OverlayTextVisibility;
    /** Hover overlay field visibility for movies */
    movieOverlayTextVisibility: OverlayTextVisibility;
    /** Hover overlay field visibility for horizontal movie cards */
    movieHorizontalOverlayTextVisibility: OverlayTextVisibility;
    /** Hover overlay field visibility for series */
    seriesOverlayTextVisibility: OverlayTextVisibility;
    /** Hover overlay field visibility for horizontal series cards */
    seriesHorizontalOverlayTextVisibility: OverlayTextVisibility;
    /** Hover overlay field visibility for books */
    bookOverlayTextVisibility: OverlayTextVisibility;
    /** Hover overlay field visibility for horizontal book cards */
    bookHorizontalOverlayTextVisibility: OverlayTextVisibility;
    /** Hover overlay field visibility for manga */
    mangaOverlayTextVisibility: OverlayTextVisibility;
    /** Hover overlay field visibility for horizontal manga cards */
    mangaHorizontalOverlayTextVisibility: OverlayTextVisibility;
    /** Apply overlay customization changes to both games and anime at once */
    overlayApplyToAllMedia: boolean;
    /** Badge rendering settings */
    badges: BadgeSettings;
    /** Badge rendering settings for horizontal game cards */
    horizontalBadges: BadgeSettings;
    /** Badge rendering settings for anime */
    animeBadges: BadgeSettings;
    /** Badge rendering settings for horizontal anime cards */
    animeHorizontalBadges: BadgeSettings;
    /** Badge rendering settings for movies */
    movieBadges: BadgeSettings;
    /** Badge rendering settings for horizontal movie cards */
    movieHorizontalBadges: BadgeSettings;
    /** Badge rendering settings for series */
    seriesBadges: BadgeSettings;
    /** Badge rendering settings for horizontal series cards */
    seriesHorizontalBadges: BadgeSettings;
    /** Badge rendering settings for books */
    bookBadges: BadgeSettings;
    /** Badge rendering settings for horizontal book cards */
    bookHorizontalBadges: BadgeSettings;
    /** Badge rendering settings for manga */
    mangaBadges: BadgeSettings;
    /** Badge rendering settings for horizontal manga cards */
    mangaHorizontalBadges: BadgeSettings;
    /** Display labels for fixed statuses */
    statusLabels: StatusLabelSettings;
    /** Managed tag presets shown as planning chips */
    tagPresets: TagPresetSettings;
    /** Internal one-time settings migrations */
    migrations?: {
        animeProgressCardStyle?: boolean;
    };
    /** Games library settings */
    games: LibrarySettings;
    /** Anime library settings */
    anime: LibrarySettings;
    /** Movies library settings */
    movies: LibrarySettings;
    /** Series library settings */
    series: LibrarySettings;
    /** Books library settings */
    books: LibrarySettings;
    /** Manga library settings */
    manga: LibrarySettings;
    /** Integrations settings */
    integrations?: IntegrationsSettings;
    /** Steam library and wishlist import settings */
    steamSync: SteamSyncSettings;
}

/** Provider settings */
interface IntegrationProviderSettings {
    enabled: boolean;
    apiKey?: string;
    clientSecret?: string;
}

/** Media template settings */
export interface IntegrationTemplateSettings {
    provider: 'rawg' | 'steam' | 'igdb' | 'anilist' | 'shikimori' | 'tmdb' | 'tvmaze' | 'omdb' | 'hardcover' | 'googlebooks' | 'jikan' | 'mangadex';
    templateEnabled: boolean;
    templateMode?: TemplateMode;
    templateFields?: string[];
    howLongToBeatEnabled?: boolean;
    template: string;
}

/** Local image storage settings for integration imports */
export interface IntegrationImageStorageSettings {
    enabled: boolean;
    folderPath: string;
}

/** Integrations */
interface IntegrationsSettings {
    enabled: boolean;
    imageStorage: IntegrationImageStorageSettings;
    providers: {
        rawg: IntegrationProviderSettings;
        steam: IntegrationProviderSettings;
        steamgriddb: IntegrationProviderSettings;
        igdb: IntegrationProviderSettings;
        anilist: IntegrationProviderSettings;
        shikimori: IntegrationProviderSettings;
        tmdb: IntegrationProviderSettings;
        tvmaze: IntegrationProviderSettings;
        omdb: IntegrationProviderSettings;
        hardcover: IntegrationProviderSettings;
        googlebooks: IntegrationProviderSettings;
        jikan: IntegrationProviderSettings;
        mangadex: IntegrationProviderSettings;
    };
    media: {
        games: IntegrationTemplateSettings;
        anime: IntegrationTemplateSettings;
        movies: IntegrationTemplateSettings;
        series: IntegrationTemplateSettings;
        books: IntegrationTemplateSettings;
        manga: IntegrationTemplateSettings;
    };
}

/** Steam Sync settings */
export interface SteamSyncSettings {
    steamId: string;
    apiKey: string;
    importOwnedGames: boolean;
    importWishlist: boolean;
    duplicateMode: SteamSyncDuplicateMode;
    statusWithPlaytime: GameStatus;
    statusWithoutPlaytime: GameStatus;
    statusWishlist: GameStatus;
    fields: {
        playtime: boolean;
        genres: boolean;
        releaseDate: boolean;
    };
    autoSyncPlaytimeOnStartup: boolean;
}

/** Interface for the main plugin class (decourples circular dependency) */
export interface LorebasePluginInterface {
    settings: LorebaseSettings;
    app: App;
    saveSettings(): Promise<void>;
    showEditModal(item: MediaItem, onSave: () => void): void;
    showStatsModal(stats: GameStats | AnimeStats, mediaType: MediaType): void;
    showDeleteModal(game: MediaItem, onConfirm: () => Promise<void>): void;
    addMediaItem(mediaType: MediaType): void;
    runSteamSync(): Promise<void>;
    refreshViews(): void;
    getGameService(): GameService | null;
    getAnimeService(): AnimeService | null;
    getMetadataService(): MetadataService | null;
    getMovieService(): VideoService | null;
    getSeriesService(): VideoService | null;
    getBookService(): ReadingService | null;
    getMangaService(): ReadingService | null;
    getMediaType(): MediaType;
}

// =============================================================================
// UI STATE INTERFACES
// =============================================================================

/** Filter state for library view */
export interface FilterState {
    /** Status filters */
    statuses: MediaStatus[];
    /** Favorite filter */
    favoriteOnly: boolean;
    /** Adult-only filter */
    adultOnly: boolean;
    /** Custom poster filter */
    customOnly: boolean;
    /** Search term */
    searchTerm: string;
    /** Selected tags */
    tags: string[];
    /** Selected genres */
    genres: string[];
}

/** Statistics for game collection */
export interface GameStats {
    total: number;
    completed: number;
    playing: number;
    dropped: number;
    sandbox: number;
    wishlist: number;
    notStarted: number;
    favorite: number;
    withRating: number;
    avgRating: number;
    customPosters: number;
    adult: number;
    seriesCount: number;
    ratingDistribution: Record<number, number>;
    statusPercentages: Record<string, number>;
}

/** Statistics for anime collection */
export interface AnimeStats {
    total: number;
    planned: number;
    watching: number;
    completed: number;
    dropped: number;
    paused: number;
    favorite: number;
    withRating: number;
    avgRating: number;
    ratingDistribution: Record<number, number>;
    statusPercentages: Record<string, number>;
}

/** Statistics for movies and series */
export type VideoStats = AnimeStats;

/** Statistics for books and manga */
export type ReadingStats = AnimeStats;
