import type { StatisticsDeletion } from '../services/media/statisticsDeletions';
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
import type { MusicService } from '../services/MusicService';

// =============================================================================
// MEDIA TYPES
// =============================================================================

/** Supported media types in the library */
export type MediaType = 'game' | 'anime' | 'movie' | 'series' | 'book' | 'manga' | 'music';
export interface MediaWorkTypeCatalog {
    types: Array<{ value: string; label?: string; color?: string }>;
    redirects: Record<string, string>;
    hidden?: string[];
}
export type MusicKind = 'album' | 'track';
export type CustomMediaStatus = `custom_${string}`;
export type MusicStatus = 'to_be_released' | 'planned' | 'listening' | 'completed' | 'paused' | 'dropped' | 'on_repeat' | CustomMediaStatus;
export interface MusicTrack {
    id: string;
    title: string;
    artist: string;
    /** Separate performer names when the provider supplies artist credits. */
    artists?: string[];
    deezerArtistIds?: Record<string, string>;
    duration: number | null;
    disc: number;
    listened: boolean;
    userRating: UserRating;
    favorite: boolean;
    recordingId?: string;
    deezerId?: string;
}
export interface MusicListeningStats {
    listeners: number | null;
    plays: number | null;
    source: 'lastfm';
    url: string;
}
export interface MusicItem extends BaseMediaItem {
    type: 'music';
    releaseDate?: string | null;
    musicKind: MusicKind;
    status: MusicStatus;
    artist: string;
    album: string;
    duration: number | null;
    tracks: MusicTrack[];
    genres: string[];
    tags: string[];
    sourceUrl?: string | null;
    integrationProvider?: 'musicbrainz' | 'lastfm' | 'deezer' | null;
    integrationId?: string | null;
    deezerArtistId?: string;
    listeningStats?: MusicListeningStats;
    relatedMedia?: RelatedMediaLink[];
    parentAlbum?: string;
    parentTrackId?: string;
}

/** Game completion status */
export type GameStatus = 'completed' | 'playing' | 'dropped' | 'sandbox' | 'wishlist' | 'not_started' | 'to_be_released' | CustomMediaStatus;

/** Anime release format */
export type AnimeFormat = 'tv' | 'movie' | 'ova' | 'ona' | 'special';

/** Anime watch status */
export type AnimeStatus = 'planned' | 'watching' | 'completed' | 'dropped' | 'paused' | 'to_be_released' | CustomMediaStatus;

/** Movie/series watch status */
export type VideoStatus = AnimeStatus;

/** Book/manga reading status */
export type ReadingStatus = AnimeStatus;

/** Status across all media types */
export type MediaStatus = GameStatus | AnimeStatus | MusicStatus;

/** Top-level settings page presentation */
export type SettingsLayoutMode = 'tabs' | 'accordion';

/** Primary action when a library card is clicked */
export type CardClickAction = 'open' | 'edit';

/** User-defined visible label overrides for fixed status values */
export type StatusLabelSettings = {
    music?: Partial<Record<MusicStatus, string>>;
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

/** Existing-note import write behavior */
export type NoteImportWriteMode = 'copy' | 'replace';

/** Existing-note import target library */
export type NoteImportTargetMedia = 'auto' | 'games' | 'anime' | 'movies' | 'series' | 'books' | 'manga' | 'music';

/** User-editable frontmatter alias mapping for existing-note import */
export interface NoteImportFieldMapping {
    key: string;
    aliases: string[];
}

/** Settings for importing existing Markdown media notes into LOREBASE */
export interface NoteImportSettings {
    sourceFolderPath: string;
    targetMedia: NoteImportTargetMedia;
    writeMode: NoteImportWriteMode;
    fieldMappings: NoteImportFieldMapping[];
    blacklist: string[];
}

export interface EpisodeInfo {
    number: number;
    title: string;
    airDate?: string;
    duration?: number | null;
}
export interface EpisodeTrackingState {
    /** Legacy note data preserved on unrelated edits; episode scoring has no UI. */
    episodeRatings?: Record<string, number>;
    episodeTracking?: 'count' | 'episodes';
    /** Sparse, season-relative episode numbers. An empty array means none watched. */
    watchedEpisodes?: number[];
    episodeDetails?: EpisodeInfo[];
}
/** Trackable part of a single anime title: TV season, OVA, special, movie, etc. */
export interface AnimePart extends EpisodeTrackingState {
    id: string;
    kind: AnimeFormat;
    title: string;
    alternativeTitles?: string[];
    seasonNumber: number | null;
    episodeCurrent: number | null;
    episodeTotal: number | null;
    status: AnimeStatus;
    userRating?: UserRating;
    /** Cover owned by this part, independent of the title's main poster. */
    poster?: string | null;
    year?: number | null;
    episodeDuration?: number | null;
    releaseDate?: string | null;
}

/** Trackable part of a movie collection or TV series */
export interface VideoPart extends EpisodeTrackingState {
    id: string;
    kind: 'movie' | 'season';
    title: string;
    alternativeTitles?: string[];
    seasonNumber: number | null;
    episodeCurrent: number | null;
    episodeTotal: number | null;
    status: VideoStatus;
    userRating?: UserRating;
    poster?: string | null;
    year?: number | null;
    episodeDuration?: number | null;
    releaseDate?: string | null;
}

/** Trackable volume of a manga title */
export interface MangaPart {
    id: string;
    kind: 'volume';
    title: string;
    alternativeTitles?: string[];
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

/** User rating. Classic mode uses 1-5; custom mode supports half steps up to 10. */
export type UserRating = number | null;

export type RatingScaleMode = 'classic' | 'custom';
export type RatingScaleStep = 1 | 0.5 | 0.1;
export type ClassicRatingPreset = 'standard' | 'themed' | 'seasonal' | 'holiday';
export type ClassicRatingSeason = 'spring' | 'summer' | 'autumn' | 'winter';
export type ClassicRatingHoliday = 'christmas' | 'halloween' | 'easter' | 'lights';
export type CustomRatingDisplay = 'stars' | 'number' | 'custom';
export type CommunityRatingIcon = 'users' | 'star' | 'tomato';

export interface RatingScaleSettings {
    mode: RatingScaleMode;
    max: number;
    step: RatingScaleStep;
    display: CustomRatingDisplay;
    classicPreset?: ClassicRatingPreset;
    classicSeason?: ClassicRatingSeason;
    classicHoliday?: ClassicRatingHoliday;
    icon?: string;
}

/** Provider/community score stored in note frontmatter */
export interface CommunityRating {
    provider: string;
    rating: number | null;
    votes: number | null;
}

/** Card size options */
export type CardSize = 'small' | 'medium' | 'large';

/** Card orientation */
export type CardOrientation = 'vertical' | 'horizontal';

/** Card visual style */
export type CardStyle = 'hover' | 'progress';

/** Sort field options. dateCompleted is retained as a persisted-settings alias. */
export type MediaPriority = 'highest' | 'high' | 'normal' | 'low';

export type SortField =
    | 'name'
    | 'series'
    | 'year'
    | 'rating'
    | 'priority'
    | 'dateStarted'
    | 'dateFinished'
    | 'dateCompleted'
    | `yaml:${string}`;

/** Sort order */
export type SortOrder = 'asc' | 'desc';

export type LibraryFieldType = 'text' | 'number' | 'date' | 'boolean' | 'list';

export type FilterOperator =
    | 'contains'
    | 'equals'
    | 'notEquals'
    | 'empty'
    | 'notEmpty'
    | 'greater'
    | 'less'
    | 'between'
    | 'isTrue'
    | 'isFalse'
    | 'containsAny'
    | 'containsAll'
    | 'notContains'
    | 'thisMonth'
    | 'thisYear';

export interface FilterRule {
    id: string;
    field: string;
    fieldType: LibraryFieldType;
    operator: FilterOperator;
    value?: string | number | boolean | string[] | null;
    valueTo?: string | number | null;
}

export interface FieldDefinition {
    id: string;
    label: string;
    icon: string;
    type: LibraryFieldType;
    source: 'builtin' | 'yaml';
    operators: FilterOperator[];
    options?: Array<{ value: string; label: string }>;
    description?: string;
    unit?: string;
    min?: number;
    max?: number;
    step?: number | 'any';
    noteCount?: number;
}

export type GroupMode =
    | 'none' | 'series' | 'artist' | 'status' | 'rating' | 'priority'
    | 'dateStarted' | 'dateFinished' | 'finishedMonth' | 'finishedYear'
    | `yaml:${string}`;

export interface GroupSpec {
    mode: GroupMode;
    order: SortOrder;
}

export interface SortSpec {
    field: SortField;
    order: SortOrder;
}

export interface LibraryViewState {
    sort: SortSpec;
    group: GroupSpec;
    /** Manga subtypes selected in the dedicated selector shown next to sorting and grouping. */
    workTypes?: string[];
    rules: FilterRule[];
    tags: string[];
    genres: string[];
}

export interface SavedLibraryView {
    id: string;
    name: string;
    state: LibraryViewState;
    readonly?: boolean;
}

/** View mode */
export type ViewMode = 'grid' | 'horizontal';

/** Supported languages */
export type Language = 'en' | 'ru' | 'uk' | 'zh-CN';

/** Particle effect options */
export type ParticleEffect = 'none' | 'sakura' | 'snow' | 'leaves' | 'fireflies' | 'rain';

/** Template mode options */
type TemplateMode = 'simple' | 'advanced';

/** Steam Sync duplicate handling mode */
export type SteamSyncDuplicateMode = 'skip' | 'update' | 'ask';

/** Badge container positions on card */
export type BadgePosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/** Rating badge render mode */
export type RatingBadgeMode = 'star' | 'emoji';

/** Completion date format rendered on the status badge */
export type CompletionDateBadgeFormat = 'short' | 'full';

/** Completion date badge format per media library */
interface CompletionDateBadgeFormatSettings {
    games: CompletionDateBadgeFormat;
    anime: CompletionDateBadgeFormat;
    movies: CompletionDateBadgeFormat;
    series: CompletionDateBadgeFormat;
    books: CompletionDateBadgeFormat;
    manga: CompletionDateBadgeFormat;
    music: CompletionDateBadgeFormat;
}

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
        showReleaseCountdown?: boolean;
        alwaysShowCompletionDate?: boolean;
    };
    rating: BadgeItemSettings & {
        mode: RatingBadgeMode;
    };
    favorite: BadgeItemSettings & {
        subtlePulse: boolean;
    };
    workType: BadgeItemSettings;
    communityRating: BadgeItemSettings & { icon: CommunityRatingIcon };
}

// =============================================================================
// MEDIA ITEM INTERFACES
// =============================================================================

/** Base interface for all media items */
export interface RatingCriterion {
    name: string;
    value: UserRating;
}

export interface DiscoveryContext { reason: string; recommendedBy: string }
export interface PartCatalog { source: string; parts: Record<string, number | null> }

interface BaseMediaItem {
    /** Personal reasons remain available when the item is resumed. */
    statusReasons?: import('../utils/statusReasons').StatusReasons;
    discovery?: DiscoveryContext;
    partCatalog?: PartCatalog;
    /** Personal priority; old or omitted values mean normal. */
    priority?: MediaPriority;
    syncSource?: import('../utils/syncSource').SyncSource;
    metadataSourceUrl?: string | null;
    /** ISO country codes of origin, explicitly provided by the user or source. */
    countries?: string[];
    workType?: string;
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
    /** Optional independent scores; the overall score stays user-controlled. */
    detailedRatings?: RatingCriterion[];
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
    /** Community/provider rating such as AniList, MAL, TMDB, RAWG */
    communityRating?: number | null;
    /** Number of votes behind the community/provider rating */
    communityVotes?: number | null;
    /** Provider label for community rating */
    communityRatingProvider?: string | null;
    /** Markdown body section stored under ## My Notes */
    myNotes?: string;
    /** Personal start date: YYYY, YYYY-MM or YYYY-MM-DD. */
    started?: string | null;
    /** Personal completion: YYYY, YYYY-MM, YYYY-MM-DD or "unknown". */
    finished?: string | null;
    /** Completed repeats beyond the first play/watch/read. Not used for books or music. */
    repeatCount?: number;
    /** Scalar frontmatter fields available to the view rule engine */
    rawFields?: Record<string, string | number | boolean | string[] | null>;
}

/** Game-specific item */
export interface GameItem extends BaseMediaItem {
    type: 'game';
    /** Personal completion percentage; achievement percentage is applied only on request. */
    progressPercent?: number | null;
    /** Total played minutes; Steam refresh replaces this total rather than adding to it. */
    playtimeMinutes?: number | null;
    achievementsUnlocked?: number | null;
    achievementsTotal?: number | null;
    /** Personal PSN data, independent of Steam's time and achievements. */
    playstation?: import('../services/playstation/types').PlayStationTracking;
    gameModes?: Array<'solo' | 'coop' | 'multiplayer'>;
    /** Game status */
    status: GameStatus;
    /** Game series name */
    gameSeries: string;
    /** Date completed (from frontmatter, if available) */
    dateCompleted: number | null;
    /** Personal start date: YYYY, YYYY-MM or YYYY-MM-DD. */
    started?: string | null;
    /** Personal completion: YYYY, YYYY-MM, YYYY-MM-DD or "unknown". */
    finished?: string | null;
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
    /** Platform used for the user's own playthrough, independent of provider platforms. */
    playedOn?: string;
    /** Personal platform selections and completed repeats on each platform. */
    platformPlaythroughs?: import('../utils/repeatTracking').PlatformPlaythrough[];
    /** Supported game platforms */
    platforms?: string[];
    /** Optional source URL */
    sourceUrl?: string | null;
    /** Metadata provider used to create/update game details */
    integrationProvider?: 'rawg' | 'steam' | 'igdb' | 'vndb' | null;
    /** Provider-specific game id used to refresh community rating */
    integrationId?: string | null;
    /** Steam app id from Steam Sync or integration metadata */
    steamAppId?: string | null;
    /** Downloadable content attached to this game */
    dlc?: GameDlc[];
    /** Locally linked media notes */
    relatedMedia?: RelatedMediaLink[];
}

export interface GameDlc {
    id: string;
    provider: 'steam' | 'igdb';
    title: string;
    imageUrl?: string | null;
    url?: string | null;
    userRating?: UserRating;
    owned?: boolean;
}

export type PosterMode = 'active-part' | 'title';

export interface PartPosterSettings {
    /** Which cover is displayed; the title and part posters remain independent. */
    posterMode?: PosterMode;
    /** Resolved title cover, independent of the displayed active-part image. */
    titleImageUrl?: string;
}

/** Anime-specific item */
export interface AnimeItem extends BaseMediaItem, PartPosterSettings {
    type: 'anime';
    countryOfOrigin?: string;
    /** Anime format */
    format: AnimeFormat;
    /** Watch status */
    status: AnimeStatus;
    /** Summary from frontmatter */
    summary: string;
    /** Release or premiere date stored in frontmatter. */
    releaseDate?: string | null;
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
    /** Animation studios */
    studios?: string[];
    /** Date added (from frontmatter or file stats) */
    dateAdded: number;
    /** Date watched (from frontmatter) */
    dateWatched: number | null;
    /** Tags applied to the anime */
    tags: string[];
    /** Optional source URL */
    sourceUrl?: string | null;
    /** Metadata provider used to create/update anime composition */
    integrationProvider?: 'anilist' | 'kitsu' | 'jikan' | 'shikimori' | 'tmdb' | 'tvmaze' | 'omdb' | null;
    integrationSourceKind?: 'movie' | 'series';
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

export interface SeriesItem extends BaseMediaItem, PartPosterSettings {
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
    readingCycle?: string[];
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
    integrationProvider?: 'hardcover' | 'googlebooks' | 'openlibrary' | null;
    integrationId?: string | null;
    relatedMedia?: RelatedMediaLink[];
}

export interface MangaItem extends BaseMediaItem {
    readingCycle?: string[];
    type: 'manga';
    /** Work subtype kept separate from the top-level media type (Manga, Manhwa, Manhua, etc.). */
    workType: string;
    status: ReadingStatus;
    summary: string;
    /** Release or publication date stored in frontmatter. */
    releaseDate?: string | null;
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
    /** Metadata provider. `jikan` is accepted only for legacy manga notes that still use a MAL id. */
    integrationProvider?: 'anilist' | 'jikan' | 'shikimori' | 'mangaupdates' | 'mangadex' | 'comicvine' | null;
    integrationId?: string | null;
    parts?: MangaPart[];
    activePartId?: string | null;
    relatedMedia?: RelatedMediaLink[];
}

/** Union for all media item types */
export type ReadingItem = BookItem | MangaItem;
export type MediaItem = GameItem | AnimeItem | MovieItem | SeriesItem | BookItem | MangaItem | MusicItem;

// =============================================================================
// SETTINGS INTERFACES
// =============================================================================

/** Library-specific settings */
export interface CardGridDeviceSettings {
    mode: 'size' | 'columns';
    width: number;
    horizontalWidth: number;
    columns: number;
    horizontalColumns: number;
    gap: number;
}

export interface CardGridSettings {
    desktop: CardGridDeviceSettings;
    mobile: CardGridDeviceSettings;
    posterRatio: number;
    horizontalRatio: number;
}

interface LibrarySettings {
    cardGrid?: CardGridSettings;
    /** Cover source shared by all anime or series in this library. */
    posterMode?: PosterMode;
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
    /** Display books as varied spines on wooden shelves. */
    bookshelfEffect?: boolean;
    /** Card orientation */
    orientation: CardOrientation;
    /** Current sort field */
    sortField: SortField;
    /** Current sort order */
    sortOrder: SortOrder;
    /** Last active unified library view state */
    viewState: LibraryViewState;
    /** Named views scoped to this media library */
    savedViews: SavedLibraryView[];
    /** Currently selected named view, or null for an unsaved state */
    activeSavedViewId: string | null;
    /** Show 18+ content in 'all' mode */
    showAdultInAll: boolean;
}

/** A user-defined collection that can contain any media type. */
export interface CustomMediaGroup {
    id: string;
    name: string;
    itemPaths: string[];
    createdAt: number;
    updatedAt: number;
    description?: string;
    icon?: string;
    color?: string;
    pinned?: boolean;
}

/** Opt-in artwork treatments for albums and songs. */
export type MusicCoverMode = 'square' | 'vinyl' | 'cd';

export type CommunityLinkKey = 'kofi' | 'discord' | 'patreon' | 'github';
export type CommunityLinks = Record<CommunityLinkKey, string>;
export interface CommunityLink { id: string; label: string; url: string; icon: string; }
export interface CommunityLinkCache { updatedAt: number; links: CommunityLink[] | CommunityLinks; }

/** Plugin settings structure */
export interface LorebaseSettings {
    /** Receipts only; source lists stay in their original Markdown notes. */
    inbox?: import('../services/InboxService').InboxState;
    /** Values live in Secret Storage when supported; runtime credentials remain hydrated. */
    credentialRefs?: Record<string, string>;
    communityLinkCache?: CommunityLinkCache;
    statisticsDeletions?: StatisticsDeletion[];
    statisticsDeletionStarted?: number;
    statisticsDashboard?: import('../services/media/statisticsPreferences').StatisticsPreferences;
    /** Highest plugin version whose update window has been seen. */
    lastSeenReleaseVersion?: string;
    mediaWorkTypes?: Partial<Record<MediaType, MediaWorkTypeCatalog>>;
    statusEditorLayout?: 'list' | 'columns';
    statusCustomization?: Partial<Record<MediaType, Record<string, { label?: string; icon?: string; color?: string }>>>;
    music: LibrarySettings & {
        noteTemplate?: NoteTemplateSettings;
        albumCoverMode: MusicCoverMode;
        trackCoverMode: MusicCoverMode;
        provider: 'musicbrainz' | 'lastfm' | 'deezer';
        lastfmApiKey: string;
        providerEnabled?: Partial<Record<'musicbrainz' | 'lastfm' | 'deezer', boolean>>;
    };
    /** Interface language */
    language: Language;
    /** Enable optional galleries, people, recommendations and music discovery/playback. */
    onlineExtrasEnabled: boolean;
    /** Top-level settings page presentation */
    settingsLayoutMode: SettingsLayoutMode;
    /** Accent color (hex) */
    accentColor: string;
    /** Show provider/manual choice before opening the add flow */
    showAddModeChoice: boolean;
    /** Primary action when a library card is clicked */
    cardClickAction: CardClickAction;
    updatedEditor: boolean;
    /** User rating scale and custom rating presentation. */
    ratingScale: RatingScaleSettings;
    /** Legacy fallback date format in status badge while sorting by completion date */
    completionDateBadgeFormat: CompletionDateBadgeFormat;
    /** Date format in status badge while sorting by completion date, per media type */
    completionDateBadgeFormats: CompletionDateBadgeFormatSettings;
    /** Enabled media types */
    enabledMedia: {
        music: boolean;
        games: boolean;
        anime: boolean;
        movies: boolean;
        series: boolean;
        books: boolean;
        manga: boolean;
    };
    /** Media categories shown in the release calendar */
    releaseCalendarMediaTypes: MediaType[];
    /** Last selected release calendar presentation */
    releaseCalendarViewMode: 'calendar' | 'agenda';
    /** Last selected release calendar time range */
    releaseCalendarScope: 'upcoming' | 'all';
    /** User-defined cross-media collections */
    customGroups: CustomMediaGroup[];
    /** Particle effect type */
    particleEffect: ParticleEffect;
    /** Particle intensity */
    particleIntensity: number;
    animateParticlesWithReducedMotion: boolean;
    /** Max lines for game card description in hover overlay */
    descriptionLines: number;
    /** Max lines for horizontal game card description in hover overlay */
    horizontalDescriptionLines: number;
    /** Scroll long card descriptions within their configured line limit. */
    scrollCardDescriptions: boolean;
    /** Show the personal recommendation context icon on library cards. */
    showDiscoveryBadge: boolean;
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
    musicDescriptionLines: number;
    musicHorizontalDescriptionLines: number;
    musicOverlayTextLayout: OverlayTextLayout;
    musicHorizontalOverlayTextLayout: OverlayTextLayout;
    musicOverlayTextVisibility: OverlayTextVisibility;
    musicHorizontalOverlayTextVisibility: OverlayTextVisibility;
    musicBadges: BadgeSettings;
    musicHorizontalBadges: BadgeSettings;
    /** Display labels for fixed statuses */
    statusLabels: StatusLabelSettings;
    /** Managed tag presets shown as planning chips */
    tagPresets: TagPresetSettings;
    /** Existing Markdown note import settings */
    noteImport: NoteImportSettings;
    /** Internal one-time settings migrations */
    migrations?: {
        columnGridDefaults?: boolean;
        horizontalFourColumns?: boolean;
        raisedCardTextDefaults?: boolean;
        animeProgressCardStyle?: boolean;
        templateTypeField?: boolean;
        gameTemplateTypeField?: boolean;
        mangaTemplateAdultField?: boolean;
        mangaTemplateWorkTypeField?: boolean;
        comicsWorkType?: boolean;
        releaseCalendarTemplateDates?: boolean;
        orderedTemplateFields?: boolean;
        completeTemplateSchema?: boolean;
        countriesTemplateFields?: boolean;
        gameTrackingTemplateFields?: boolean;
        gameDefaultVisibilityFilters?: boolean;
        /** One-time migration from the removed Jikan manga search provider. */
        jikanMangaProviderV1?: boolean;
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
    /** Authenticated AniList anime and manga synchronization settings */
    anilistSync: AniListSyncSettings;
    traktSync: import('../services/trakt/types').TraktSyncSettings;
    playstationSync: import('../services/playstation/types').PlayStationSyncSettings;
}

/** Provider settings */
interface IntegrationProviderSettings {
    enabled: boolean;
    apiKey?: string;
    clientSecret?: string;
}

/** Media template settings */
export interface NoteTemplateSettings {
    templateEnabled: boolean;
    templateMode?: TemplateMode;
    templateFields?: string[];
    /** Fields written as Obsidian links in the simple template. */
    wikilinkFields?: string[];
    /** YAML names chosen in the advanced editor, also respected in simple mode. */
    fieldAliases?: Record<string, string>;
    previousFieldAliases?: Record<string, string[]>;
    advancedTemplate?: string;
    template: string;
}

export interface IntegrationTemplateSettings extends NoteTemplateSettings {
    provider: 'rawg' | 'steam' | 'igdb' | 'vndb' | 'anilist' | 'kitsu' | 'jikan' | 'shikimori' | 'tmdb' | 'tvmaze' | 'omdb' | 'hardcover' | 'googlebooks' | 'openlibrary' | 'mangaupdates' | 'mangadex' | 'comicvine';
    providerEnabled?: Partial<Record<'anilist' | 'shikimori', boolean>>;
    tmdbLanguage?: string;
    alternativeTitleLanguages?: Partial<Record<IntegrationTemplateSettings['provider'], string>>;
    alternativeTitlesDisabled?: Partial<Record<IntegrationTemplateSettings['provider'], boolean>>;
    howLongToBeatEnabled?: boolean;
}

/** Local image storage settings for integration imports */
export interface IntegrationImageStorageSettings {
    enabled: boolean;
    folderPath: string;
}

/** Integrations */
interface IntegrationsSettings {
    enabled: boolean;
    /** Omit empty root properties while retaining their positions in the template. */
    compactTemplates?: boolean;
    /** Delay between selected-item imports to avoid provider rate limits */
    requestCooldownSeconds: number;
    imageStorage: IntegrationImageStorageSettings;
    providers: {
        rawg: IntegrationProviderSettings;
        steam: IntegrationProviderSettings;
        steamgriddb: IntegrationProviderSettings;
        igdb: IntegrationProviderSettings;
        anilist: IntegrationProviderSettings;
        /** Legacy MAL identity, read through Kitsu; never offered in search. */
        jikan: IntegrationProviderSettings;
        kitsu: IntegrationProviderSettings;
        shikimori: IntegrationProviderSettings;
        tmdb: IntegrationProviderSettings;
        tvmaze: IntegrationProviderSettings;
        omdb: IntegrationProviderSettings;
        hardcover: IntegrationProviderSettings;
        googlebooks: IntegrationProviderSettings;
        openlibrary: IntegrationProviderSettings;
        mangaupdates: IntegrationProviderSettings;
        mangadex: IntegrationProviderSettings;
        comicvine: IntegrationProviderSettings;
        vndb: IntegrationProviderSettings;
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

export interface AniListSyncSettings {
    clientId: string;
    accessToken: string;
    username: string;
    autoSyncOnStartup: boolean;
    /** Deletions are opt-in; local removal also requires an observed vault delete event. */
    syncDeletions?: boolean;
    lastSynced: Record<string, AniListSyncSnapshot>;
}

export interface AniListSyncSnapshot {
    localPath?: string;
    localDeleted?: boolean;
    started?: string;
    finished?: string;
    notes?: string;
    /** Score after rounding to the local rating scale, for change detection. */
    localScore?: number;
    entryId?: number;
    status: string;
    progress: number;
    score: number;
    volumeProgress: number;
}

/** Interface for the main plugin class (decourples circular dependency) */
export interface LorebasePluginInterface {
    settings: LorebaseSettings;
    app: App;
    saveSettings(): Promise<void>;
    showEditModal(item: MediaItem, onSave: () => void, onBeforeSave?: () => void, partId?: string): void;
    showStatsModal(): void;
    showDeleteModal(game: MediaItem, onConfirm: () => Promise<void>): void;
    addMediaItem(mediaType: MediaType): void;
    runSteamSync(): Promise<void>;
    runAniListSync(): Promise<void>;
    runAniListImport(): Promise<void>;
    authorizeAniList(): Promise<void>;
    runNoteImport(): Promise<void>;
    enrichMediaItem(item: MediaItem, relink?: boolean, onSave?: () => void): Promise<boolean>;
    refreshViews(): void;
    getGameService(): GameService | null;
    getAniListSyncService(): import('../services/AniListSyncService').AniListSyncService | null;
    getAnimeService(): AnimeService | null;
    getMetadataService(): MetadataService | null;
    getMovieService(): VideoService | null;
    getSeriesService(): VideoService | null;
    getBookService(): ReadingService | null;
    getMangaService(): ReadingService | null;
    manageMediaWorkTypes?: (type: 'game' | 'movie' | 'series' | 'manga' | 'anime', onChanged?: () => void) => void;
    manageMangaWorkTypes?: (onChanged?: () => void) => void;
    getMusicService?(): MusicService | null;
    getMediaType(): MediaType;
    getEnabledMediaTypes(): MediaType[];
    switchMediaType(mediaType: MediaType): Promise<void>;
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
    /** Selected manga subtype; empty means all work types. */
    workTypes?: string[];
    /** Extensible field rules combined with AND */
    rules?: FilterRule[];
}

/** Statistics for game collection */
export interface GameStats {
    customStatusCounts?: Record<string, number>;
    total: number;
    completed: number;
    playing: number;
    dropped: number;
    sandbox: number;
    wishlist: number;
    notStarted: number;
    toBeReleased: number;
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
    customStatusCounts?: Record<string, number>;
    total: number;
    planned: number;
    watching: number;
    completed: number;
    dropped: number;
    paused: number;
    to_be_released: number;
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
