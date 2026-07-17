/**
 * LOREBASE - Constants
 * Default values, configurations, and static data
 */

import { LorebaseSettings, MediaStatus, CardSize, CardOrientation, CardStyle } from './types';
import type { TranslationKey } from './localization';

// =============================================================================
// DEFAULT SETTINGS
// =============================================================================

/** Default library settings */
const DEFAULT_LIBRARY_SETTINGS = {
    folderPath: '',
    columns: 5,
    cardSize: 'medium' as CardSize,
    cardStyle: 'hover' as CardStyle,
    customCardSize: false,
    customCardMinWidth: 220,
    customCardMinHeight: 380,
    customCardImageRatio: 0.72,
    customHorizontalCardMinWidth: 340,
    customHorizontalCardHeight: 220,
    showAnimeSeasonProgress: true,
    showAnimeEpisodeProgress: true,
    bookCoverEffect: false,
    orientation: 'vertical' as CardOrientation,
    sortField: 'name' as const,
    sortOrder: 'asc' as const,
    showAdultInAll: false,
};

const DEFAULT_ANIME_TEMPLATE = `---
title: "{{VALUE:name}}"
image: "{{VALUE:image}}"
image_b: "{{VALUE:ImageHorizontal}}"
plot: "{{VALUE:Plot}}"
scoreImdb: "{{VALUE:imdbRating}}"
tags: "{{VALUE:tags}}"
year: "{{VALUE:Year}}"
studios: "{{VALUE:studios}}"
format: "{{VALUE:format}}"
season_current: "{{VALUE:seasonCurrent}}"
episode_current: "{{VALUE:episodeCurrent}}"
episode_total: "{{VALUE:episodeTotal}}"
active_part_id: "{{VALUE:activePartId}}"
anime_parts:
{{VALUE:animePartsYaml}}
rating: "{{VALUE:rating}}"
status: "{{VALUE:status}}"
favorite: false
url: "{{VALUE:url}}"
---`;

const DEFAULT_MOVIE_TEMPLATE = `---
type: "movie"
title: "{{VALUE:name}}"
poster: "{{VALUE:Poster}}"
poster_b: "{{VALUE:PosterHorizontal}}"
plot: "{{VALUE:Plot}}"
genres: "{{VALUE:genres}}"
year: "{{VALUE:Year}}"
released: "{{VALUE:released}}"
runtime: "{{VALUE:runtime}}"
director: "{{VALUE:director}}"
actors: "{{VALUE:actors}}"
rating: "{{VALUE:rating}}"
status: "{{VALUE:status}}"
favorite: false
active_part_id: "{{VALUE:activePartId}}"
movie_parts:
{{VALUE:videoPartsYaml}}
integration_provider: "{{VALUE:integrationProvider}}"
integration_id: "{{VALUE:integrationId}}"
url: "{{VALUE:url}}"
---`;

const DEFAULT_SERIES_TEMPLATE = `---
type: "series"
title: "{{VALUE:name}}"
poster: "{{VALUE:Poster}}"
poster_b: "{{VALUE:PosterHorizontal}}"
plot: "{{VALUE:Plot}}"
genres: "{{VALUE:genres}}"
year: "{{VALUE:Year}}"
released: "{{VALUE:released}}"
runtime: "{{VALUE:runtime}}"
director: "{{VALUE:director}}"
actors: "{{VALUE:actors}}"
seasons: "{{VALUE:seasons}}"
episode_current: "{{VALUE:episodeCurrent}}"
episode_total: "{{VALUE:episodeTotal}}"
active_part_id: "{{VALUE:activePartId}}"
series_parts:
{{VALUE:videoPartsYaml}}
rating: "{{VALUE:rating}}"
status: "{{VALUE:status}}"
favorite: false
integration_provider: "{{VALUE:integrationProvider}}"
integration_id: "{{VALUE:integrationId}}"
url: "{{VALUE:url}}"
---`;

const DEFAULT_BOOK_TEMPLATE = `---
type: "book"
title: "{{VALUE:name}}"
poster: "{{VALUE:Poster}}"
poster_b: "{{VALUE:PosterHorizontal}}"
plot: "{{VALUE:Plot}}"
authors: "{{VALUE:authors}}"
publisher: "{{VALUE:publisher}}"
genres: "{{VALUE:genres}}"
tags: "{{VALUE:tags}}"
year: "{{VALUE:Year}}"
released: "{{VALUE:released}}"
page_current: "{{VALUE:pageCurrent}}"
page_total: "{{VALUE:pageTotal}}"
chapter_current: "{{VALUE:chapterCurrent}}"
chapter_total: "{{VALUE:chapterTotal}}"
rating: "{{VALUE:rating}}"
status: "{{VALUE:status}}"
favorite: false
integration_provider: "{{VALUE:integrationProvider}}"
integration_id: "{{VALUE:integrationId}}"
url: "{{VALUE:url}}"
---`;

const DEFAULT_MANGA_TEMPLATE = `---
type: "manga"
title: "{{VALUE:name}}"
poster: "{{VALUE:Poster}}"
poster_b: "{{VALUE:PosterHorizontal}}"
plot: "{{VALUE:Plot}}"
authors: "{{VALUE:authors}}"
artists: "{{VALUE:artists}}"
genres: "{{VALUE:genres}}"
tags: "{{VALUE:tags}}"
year: "{{VALUE:Year}}"
chapter_current: "{{VALUE:chapterCurrent}}"
chapter_total: "{{VALUE:chapterTotal}}"
volume_current: "{{VALUE:volumeCurrent}}"
volume_total: "{{VALUE:volumeTotal}}"
active_part_id: "{{VALUE:activePartId}}"
manga_parts:
{{VALUE:mangaPartsYaml}}
rating: "{{VALUE:rating}}"
status: "{{VALUE:status}}"
favorite: false
integration_provider: "{{VALUE:integrationProvider}}"
integration_id: "{{VALUE:integrationId}}"
url: "{{VALUE:url}}"
---`;

const DEFAULT_GAME_TEMPLATE = `---
name: "{{VALUE:name}}"
poster: "{{VALUE:Poster}}"
poster_b: "{{VALUE:PosterHorizontal}}"
gameSeries:
genres:
  - "{{VALUE:genres}}"
plot: "{{VALUE:Plot}}"
platforms: "{{VALUE:platforms}}"
year: "{{VALUE:Year}}"
released: "{{VALUE:released}}"
developers:
  - "{{VALUE:developers}}"
publishers:
  - "{{VALUE:publishers}}"
rating: "{{VALUE:rating}}"
userRating:
status: "{{VALUE:status}}"
favorite: false
url: "{{VALUE:url}}"
main: "{{VALUE:main}}"
main_plus_sides: "{{VALUE:main_plus_sides}}"
perfectionist: "{{VALUE:perfectionist}}"
---`;
const DEFAULT_GAME_TEMPLATE_FIELDS = [
    'name',
    'poster',
    'posterHorizontal',
    'plot',
    'gameSeries',
    'genres',
    'platforms',
    'year',
    'released',
    'developers',
    'publishers',
    'rating',
    'userRating',
    'status',
    'favorite',
    'url',
];

const DEFAULT_ANIME_TEMPLATE_FIELDS = [
    'name',
    'image',
    'imageHorizontal',
    'plot',
    'scoreImdb',
    'tags',
    'year',
    'studios',
    'format',
    'animeParts',
    'rating',
    'status',
    'favorite',
    'url',
];

const DEFAULT_MOVIE_TEMPLATE_FIELDS = [
    'name',
    'poster',
    'posterHorizontal',
    'plot',
    'genres',
    'year',
    'released',
    'runtime',
    'director',
    'actors',
    'rating',
    'status',
    'favorite',
    'movieParts',
    'integrationSource',
    'url',
];

const DEFAULT_SERIES_TEMPLATE_FIELDS = [
    'name',
    'poster',
    'posterHorizontal',
    'plot',
    'genres',
    'year',
    'seasons',
    'episodeCurrent',
    'episodeTotal',
    'seriesParts',
    'rating',
    'status',
    'favorite',
    'integrationSource',
    'url',
];

const DEFAULT_BOOK_TEMPLATE_FIELDS = [
    'name',
    'poster',
    'posterHorizontal',
    'plot',
    'authors',
    'publisher',
    'genres',
    'tags',
    'year',
    'released',
    'pageCurrent',
    'pageTotal',
    'chapterCurrent',
    'chapterTotal',
    'rating',
    'status',
    'favorite',
    'integrationSource',
    'url',
];

const DEFAULT_MANGA_TEMPLATE_FIELDS = [
    'name',
    'poster',
    'posterHorizontal',
    'plot',
    'authors',
    'artists',
    'genres',
    'tags',
    'year',
    'chapterCurrent',
    'chapterTotal',
    'volumeCurrent',
    'volumeTotal',
    'mangaParts',
    'rating',
    'status',
    'favorite',
    'integrationSource',
    'url',
];

export const DEFAULT_GAME_TAG_PRESETS = [
    { id: 'check-later', label: 'Check later', tag: 'check later', icon: 'clock' },
    { id: 'play-soon', label: 'Play soon', tag: 'play soon', icon: 'play' },
    { id: 'wait-early-access', label: 'Wait for early access to end', tag: 'wait early access', icon: 'hourglass' },
    { id: 'next-playthrough', label: 'Next in queue', tag: 'next in queue', icon: 'list-start' },
] as const;

function createDefaultBadges(): LorebaseSettings['badges'] {
    return {
        status: {
            enabled: true,
            position: 'bottom-right',
            iconOnly: false,
            x: 70,
            y: 86,
        },
        rating: {
            enabled: true,
            position: 'bottom-right',
            mode: 'emoji',
            x: 88,
            y: 86,
        },
        favorite: {
            enabled: true,
            position: 'top-right',
            subtlePulse: false,
            x: 90,
            y: 10,
        },
    };
}


/** Default plugin settings */
export const DEFAULT_SETTINGS: LorebaseSettings = {
    language: 'en',
    settingsLayoutMode: 'tabs',
    accentColor: '#e4a47e',
    showAddModeChoice: true,
    enabledMedia: { games: true, anime: true, movies: true, series: true, books: true, manga: true },
    particleEffect: 'none',
    particleIntensity: 70,
    descriptionLines: 4,
    horizontalDescriptionLines: 4,
    overlayTextLayout: {
        title: { x: 7, y: 6.5 },
        year: { x: 7, y: 15 },
        format: { x: 30, y: 15 },
        description: { x: 2, y: 24 },
    },
    horizontalOverlayTextLayout: {
        title: { x: 7, y: 11.2 },
        year: { x: 7, y: 25.9 },
        format: { x: 30, y: 25.9 },
        description: { x: 2, y: 41.5 },
    },
    overlayTextVisibility: {
        title: true,
        year: true,
        format: false,
        description: true,
    },
    horizontalOverlayTextVisibility: {
        title: true,
        year: true,
        format: false,
        description: true,
    },
    animeDescriptionLines: 4,
    animeHorizontalDescriptionLines: 4,
    movieDescriptionLines: 4,
    movieHorizontalDescriptionLines: 4,
    seriesDescriptionLines: 4,
    seriesHorizontalDescriptionLines: 4,
    bookDescriptionLines: 4,
    bookHorizontalDescriptionLines: 4,
    mangaDescriptionLines: 4,
    mangaHorizontalDescriptionLines: 4,
    animeOverlayTextLayout: {
        title: { x: 7, y: 6.5 },
        year: { x: 7, y: 15 },
        format: { x: 30, y: 15 },
        description: { x: 2, y: 24 },
    },
    animeHorizontalOverlayTextLayout: {
        title: { x: 7, y: 11.2 },
        year: { x: 7, y: 25.9 },
        format: { x: 30, y: 25.9 },
        description: { x: 2, y: 41.5 },
    },
    movieOverlayTextLayout: {
        title: { x: 7, y: 6.5 },
        year: { x: 7, y: 15 },
        format: { x: 30, y: 15 },
        description: { x: 2, y: 24 },
    },
    movieHorizontalOverlayTextLayout: {
        title: { x: 7, y: 11.2 },
        year: { x: 7, y: 25.9 },
        format: { x: 30, y: 25.9 },
        description: { x: 2, y: 41.5 },
    },
    seriesOverlayTextLayout: {
        title: { x: 7, y: 6.5 },
        year: { x: 7, y: 15 },
        format: { x: 30, y: 15 },
        description: { x: 2, y: 24 },
    },
    seriesHorizontalOverlayTextLayout: {
        title: { x: 7, y: 11.2 },
        year: { x: 7, y: 25.9 },
        format: { x: 30, y: 25.9 },
        description: { x: 2, y: 41.5 },
    },
    bookOverlayTextLayout: {
        title: { x: 7, y: 6.5 },
        year: { x: 7, y: 15 },
        format: { x: 30, y: 15 },
        description: { x: 2, y: 24 },
    },
    bookHorizontalOverlayTextLayout: {
        title: { x: 7, y: 11.2 },
        year: { x: 7, y: 25.9 },
        format: { x: 30, y: 25.9 },
        description: { x: 2, y: 41.5 },
    },
    mangaOverlayTextLayout: {
        title: { x: 7, y: 6.5 },
        year: { x: 7, y: 15 },
        format: { x: 30, y: 15 },
        description: { x: 2, y: 24 },
    },
    mangaHorizontalOverlayTextLayout: {
        title: { x: 7, y: 11.2 },
        year: { x: 7, y: 25.9 },
        format: { x: 30, y: 25.9 },
        description: { x: 2, y: 41.5 },
    },
    animeOverlayTextVisibility: {
        title: true,
        year: true,
        format: true,
        description: true,
    },
    animeHorizontalOverlayTextVisibility: {
        title: true,
        year: true,
        format: true,
        description: true,
    },
    movieOverlayTextVisibility: {
        title: true,
        year: true,
        format: false,
        description: true,
    },
    movieHorizontalOverlayTextVisibility: {
        title: true,
        year: true,
        format: false,
        description: true,
    },
    seriesOverlayTextVisibility: {
        title: true,
        year: true,
        format: false,
        description: true,
    },
    seriesHorizontalOverlayTextVisibility: {
        title: true,
        year: true,
        format: false,
        description: true,
    },
    bookOverlayTextVisibility: {
        title: true,
        year: true,
        format: false,
        description: true,
    },
    bookHorizontalOverlayTextVisibility: {
        title: true,
        year: true,
        format: false,
        description: true,
    },
    mangaOverlayTextVisibility: {
        title: true,
        year: true,
        format: false,
        description: true,
    },
    mangaHorizontalOverlayTextVisibility: {
        title: true,
        year: true,
        format: false,
        description: true,
    },
    overlayApplyToAllMedia: false,
    badges: createDefaultBadges(),
    horizontalBadges: createDefaultBadges(),
    animeBadges: createDefaultBadges(),
    animeHorizontalBadges: createDefaultBadges(),
    movieBadges: createDefaultBadges(),
    movieHorizontalBadges: createDefaultBadges(),
    seriesBadges: createDefaultBadges(),
    seriesHorizontalBadges: createDefaultBadges(),
    bookBadges: createDefaultBadges(),
    bookHorizontalBadges: createDefaultBadges(),
    mangaBadges: createDefaultBadges(),
    mangaHorizontalBadges: createDefaultBadges(),
    statusLabels: {
        games: {},
        anime: {},
        movies: {},
        series: {},
        books: {},
        manga: {},
    },
    tagPresets: {
        games: DEFAULT_GAME_TAG_PRESETS.map((preset) => ({ ...preset })),
    },
    migrations: {
        animeProgressCardStyle: false,
    },
    games: { ...DEFAULT_LIBRARY_SETTINGS, folderPath: 'Games', sortField: 'series' as const },
    anime: { ...DEFAULT_LIBRARY_SETTINGS, folderPath: 'Anime', cardStyle: 'progress' },
    movies: { ...DEFAULT_LIBRARY_SETTINGS, folderPath: 'Movies' },
    series: { ...DEFAULT_LIBRARY_SETTINGS, folderPath: 'Series' },
    books: { ...DEFAULT_LIBRARY_SETTINGS, folderPath: 'Books' },
    manga: { ...DEFAULT_LIBRARY_SETTINGS, folderPath: 'Manga' },
    integrations: {
        enabled: true,
        imageStorage: {
            enabled: false,
            folderPath: 'files/lorebase/images',
        },
        providers: {
            rawg: { enabled: true, apiKey: '' },
            steam: { enabled: true },
            steamgriddb: { enabled: false, apiKey: '' },
            igdb: { enabled: false, apiKey: '', clientSecret: '' },
            anilist: { enabled: true },
            shikimori: { enabled: true },
            tmdb: { enabled: false, apiKey: '' },
            tvmaze: { enabled: true, apiKey: '' },
            omdb: { enabled: false, apiKey: '' },
            hardcover: { enabled: true, apiKey: '' },
            googlebooks: { enabled: false, apiKey: '' },
            jikan: { enabled: true },
            mangadex: { enabled: true },
        },
        media: {
            games: {
                provider: 'steam',
                templateEnabled: true,
                templateMode: 'simple',
                templateFields: [...DEFAULT_GAME_TEMPLATE_FIELDS],
                howLongToBeatEnabled: false,
                template: DEFAULT_GAME_TEMPLATE,
            },
            anime: {
                provider: 'anilist',
                templateEnabled: true,
                templateMode: 'simple',
                templateFields: [...DEFAULT_ANIME_TEMPLATE_FIELDS],
                template: DEFAULT_ANIME_TEMPLATE,
            },
            movies: {
                provider: 'tmdb',
                templateEnabled: true,
                templateMode: 'simple',
                templateFields: [...DEFAULT_MOVIE_TEMPLATE_FIELDS],
                template: DEFAULT_MOVIE_TEMPLATE,
            },
            series: {
                provider: 'tmdb',
                templateEnabled: true,
                templateMode: 'simple',
                templateFields: [...DEFAULT_SERIES_TEMPLATE_FIELDS],
                template: DEFAULT_SERIES_TEMPLATE,
            },
            books: {
                provider: 'hardcover',
                templateEnabled: true,
                templateMode: 'simple',
                templateFields: [...DEFAULT_BOOK_TEMPLATE_FIELDS],
                template: DEFAULT_BOOK_TEMPLATE,
            },
            manga: {
                provider: 'anilist',
                templateEnabled: true,
                templateMode: 'simple',
                templateFields: [...DEFAULT_MANGA_TEMPLATE_FIELDS],
                template: DEFAULT_MANGA_TEMPLATE,
            },
        },
    },
    steamSync: {
        steamId: '',
        apiKey: '',
        importOwnedGames: true,
        importWishlist: true,
        duplicateMode: 'skip',
        statusWithPlaytime: 'not_started',
        statusWithoutPlaytime: 'not_started',
        statusWishlist: 'wishlist',
        fields: {
            playtime: true,
            genres: true,
            releaseDate: true,
        },
        autoSyncPlaytimeOnStartup: false,
    },
};

// =============================================================================
// STATUS CONFIGURATION
// =============================================================================

/** Status configuration with icons and colors */
export const STATUS_CONFIG: Record<MediaStatus, { pathD: string }> = {
    playing: {
        pathD: 'M5 3l14 9-14 9V3z',
    },
    dropped: {
        pathD: 'M6 18L18 6M6 6l12 12',
    },
    sandbox: {
        pathD: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z',
    },
    wishlist: {
        pathD: 'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z',
    },
    not_started: {
        pathD: 'M12 2c5.52 0 10 4.48 10 10s-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2z',
    },
    planned: {
        pathD: 'M12 2c5.52 0 10 4.48 10 10s-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2z',
    },
    watching: {
        pathD: 'M5 3l14 9-14 9V3z',
    },
    completed: {
        pathD: 'M20 6L9 17l-5-5',
    },
    paused: {
        pathD: 'M6 4h4v16H6zM14 4h4v16h-4z',
    },
};

// =============================================================================
// ICON MAPS
// =============================================================================

/** Lucide icon names for status UI */
export const STATUS_ICON_MAP: Record<MediaStatus, string> = {
    playing: 'play',
    not_started: 'circle',
    dropped: 'x',
    sandbox: 'hexagon',
    wishlist: 'bookmark',
    planned: 'circle',
    watching: 'play',
    completed: 'check',
    paused: 'pause',
};

/** Lucide icon names for filter/flag UI */
export const FILTER_ICON_MAP = {
    favorite: 'heart',
    adult: 'shield-alert',
    custom: 'image',
} as const;

// =============================================================================
// RATING CONFIGURATION
// =============================================================================

/** Rating configuration with emojis and labels */
const EMOJI_AWESOME = '\u{1F60D}';
const EMOJI_GOOD = '\u{1F642}';
const EMOJI_OKAY = '\u{1F610}';
const EMOJI_WEAK = '\u{1F615}';
const EMOJI_BAD = '\u{1F922}';

export const RATING_CONFIG: Array<{ value: 1 | 2 | 3 | 4 | 5; emoji: string; labelKey: TranslationKey; color: string }> = [
    { value: 5, emoji: EMOJI_AWESOME, labelKey: 'ratingAwesome', color: '#4caf50' },
    { value: 4, emoji: EMOJI_GOOD, labelKey: 'ratingGood', color: '#8bc34a' },
    { value: 3, emoji: EMOJI_OKAY, labelKey: 'ratingOkay', color: '#ffc107' },
    { value: 2, emoji: EMOJI_WEAK, labelKey: 'ratingWeak', color: '#ff9800' },
    { value: 1, emoji: EMOJI_BAD, labelKey: 'ratingBad', color: '#ff4444' },
];

/** Rating emoji map for quick lookup */
export const RATING_EMOJI: Record<number, string> = {
    1: EMOJI_BAD,
    2: EMOJI_WEAK,
    3: EMOJI_OKAY,
    4: EMOJI_GOOD,
    5: EMOJI_AWESOME,
};

// =============================================================================
// CARD SIZE CONFIGURATION
// =============================================================================

/** Card size dimensions */
export const CARD_SIZES: Record<CardSize, { maxWidth: string; minHeight: string; imageHeight: string }> = {
    small: { maxWidth: '300px', minHeight: '340px', imageHeight: '300px' },
    medium: { maxWidth: '420px', minHeight: '380px', imageHeight: '360px' },
    large: { maxWidth: '520px', minHeight: '440px', imageHeight: '420px' },
};

/** Horizontal card dimensions (landscape layout) */
export const HORIZONTAL_CARD_SIZES: Record<CardSize, { width: string; height: string }> = {
    small: { width: '100%', height: '180px' },
    medium: { width: '100%', height: '220px' },
    large: { width: '100%', height: '280px' },
};

// =============================================================================
// COLOR PRESETS
// =============================================================================

/** Preset accent colors */
export const COLOR_PRESETS = [
    '#e4a47e', '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4',
    '#ffeaa7', '#dfe6e9', '#74b9ff', '#a29bfe', '#fd79a8',
];

/** Pastel colors for series headers */
export const SERIES_COLORS = [
    '#FDE2E4', '#CDEDF6', '#D0F4DE', '#FFDAD6', '#EADCF8',
    '#FFF5CC', '#F8E8E2', '#FCEEE9', '#FFF1E6', '#FBE3DC',
    '#EFDCD5', '#FAF0E6', '#F3DCD4', '#EDDCD9', '#EFD8C5',
    '#FDEFEF', '#F9EBEA', '#FFE9DC', '#FFECE1', '#F4DECB',
];

// =============================================================================
// VIRTUALIZATION CONSTANTS
// =============================================================================

/** Number of extra rows to render above/below viewport */
export const VIRTUALIZATION_BUFFER = 3;

/** Debounce delay for search input (ms) */
export const SEARCH_DEBOUNCE_MS = 150;

// =============================================================================
// VIEW CONSTANTS
// =============================================================================

/** Custom icon id used for ribbon/view */
export const LOREBASE_ICON_ID = 'lorebase-loader-pinwheel';

/** Custom icon SVG body (Lucide loader-pinwheel) */
export const LOREBASE_ICON_SVG = `
<g transform="scale(4.1666667)">
    <path d="M22 12a1 1 0 0 1-10 0 1 1 0 0 0-10 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
    <path d="M7 20.7a1 1 0 1 1 5-8.7 1 1 0 1 0 5-8.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
    <path d="M7 3.3a1 1 0 1 1 5 8.6 1 1 0 1 0 5 8.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></circle>
</g>
`;

/** View type ID */
export const VIEW_TYPE_LIBRARY = 'lorebase-library-view';

/** Default cover image - SVG placeholder to avoid 404 errors */
export const DEFAULT_COVER = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjYwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0iIzJhMmEyYSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMjQiIGZpbGw9IiM2NjYiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGRvbWluYW50LWJhc2VsaW5lPSJtaWRkbGUiPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg==';
