/**
 * LOREBASE - Type Definitions
 * Core type definitions for all media types and plugin settings
 */
import type { App } from 'obsidian';
import type { AnimeService } from '../services/AnimeService';
import type { GameService } from '../services/GameService';

// =============================================================================
// MEDIA TYPES
// =============================================================================

/** Supported media types in the library */
export type MediaType = 'game' | 'anime';

/** Game completion status */
export type GameStatus = 'completed' | 'playing' | 'dropped' | 'sandbox' | 'not_started';

/** Anime release format */
export type AnimeFormat = 'tv' | 'movie' | 'ova' | 'ona' | 'special';

/** Anime watch status */
export type AnimeStatus = 'planned' | 'watching' | 'completed' | 'dropped' | 'paused';

/** Status across all media types */
export type MediaStatus = GameStatus | AnimeStatus;

/** User-defined visible label overrides for fixed status values */
export type StatusLabelSettings = {
    games: Partial<Record<GameStatus, string>>;
    anime: Partial<Record<AnimeStatus, string>>;
};

/** Preset tag displayed as a first-class planning chip in game UI */
export interface TagPreset {
    id: string;
    label: string;
    tag: string;
    icon?: string;
}

/** Preset groups for media tags */
export interface TagPresetSettings {
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

/** User rating from 1-5 */
export type UserRating = 1 | 2 | 3 | 4 | 5 | null;

/** Card size options */
export type CardSize = 'small' | 'medium' | 'large';

/** Card orientation */
export type CardOrientation = 'vertical' | 'horizontal';

/** Sort field options */
export type SortField = 'name' | 'year' | 'rating' | 'dateCompleted';

/** Sort order */
export type SortOrder = 'asc' | 'desc';

/** View mode */
export type ViewMode = 'grid' | 'horizontal';

/** Supported languages */
export type Language = 'en' | 'ru';

/** Particle effect options */
export type ParticleEffect = 'none' | 'sakura' | 'snow';

/** Template mode options */
export type TemplateMode = 'simple' | 'advanced';

/** Badge container positions on card */
export type BadgePosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/** Rating badge render mode */
export type RatingBadgeMode = 'star' | 'emoji';

/** Hover overlay text offset */
export interface OverlayTextOffset {
    x: number;
    y: number;
}

/** Hover overlay layout settings */
export interface OverlayTextLayout {
    title: OverlayTextOffset;
    year: OverlayTextOffset;
    format: OverlayTextOffset;
    description: OverlayTextOffset;
}

/** Hover overlay field visibility */
export interface OverlayTextVisibility {
    title: boolean;
    year: boolean;
    format: boolean;
    description: boolean;
}

/** Per-badge display settings */
export interface BadgeItemSettings {
    enabled: boolean;
    position: BadgePosition;
    /** Horizontal position in percent (0-100) */
    x: number;
    /** Vertical position in percent (0-100) */
    y: number;
}

/** Card badges configuration */
export interface BadgeSettings {
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
export interface BaseMediaItem {
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
    /** Trackable seasons/OVA/specials for this title */
    parts?: AnimePart[];
    /** Currently active part for quick progress actions */
    activePartId?: string | null;
}

/** Union for all media item types */
export type MediaItem = GameItem | AnimeItem;

// =============================================================================
// SETTINGS INTERFACES
// =============================================================================

/** Library-specific settings */
export interface LibrarySettings {
    /** Folder path in vault */
    folderPath: string;
    /** Number of columns in grid */
    columns: number;
    /** Card size */
    cardSize: CardSize;
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
    /** Accent color (hex) */
    accentColor: string;
    /** Enabled media types */
    enabledMedia: {
        games: boolean;
        anime: boolean;
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
    /** Hover overlay text positions for anime */
    animeOverlayTextLayout: OverlayTextLayout;
    /** Hover overlay text positions for horizontal anime cards */
    animeHorizontalOverlayTextLayout: OverlayTextLayout;
    /** Hover overlay field visibility for anime */
    animeOverlayTextVisibility: OverlayTextVisibility;
    /** Hover overlay field visibility for horizontal anime cards */
    animeHorizontalOverlayTextVisibility: OverlayTextVisibility;
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
    /** Display labels for fixed statuses */
    statusLabels: StatusLabelSettings;
    /** Managed tag presets shown as planning chips */
    tagPresets: TagPresetSettings;
    /** Games library settings */
    games: LibrarySettings;
    /** Anime library settings */
    anime: LibrarySettings;
    /** Integrations settings */
    integrations?: IntegrationsSettings;
}

/** Provider settings */
export interface IntegrationProviderSettings {
    enabled: boolean;
    apiKey?: string;
}

/** Media template settings */
export interface IntegrationTemplateSettings {
    provider: 'rawg' | 'steam' | 'anilist' | 'shikimori';
    templateEnabled: boolean;
    templateMode?: TemplateMode;
    templateFields?: string[];
    howLongToBeatEnabled?: boolean;
    template: string;
}

/** Integrations */
export interface IntegrationsSettings {
    enabled: boolean;
    providers: {
        rawg: IntegrationProviderSettings;
        steam: IntegrationProviderSettings;
        anilist: IntegrationProviderSettings;
        shikimori: IntegrationProviderSettings;
    };
    media: {
        games: IntegrationTemplateSettings;
        anime: IntegrationTemplateSettings;
    };
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
    refreshViews(): void;
    getGameService(): GameService | null;
    getAnimeService(): AnimeService | null;
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

