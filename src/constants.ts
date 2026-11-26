/**
 * LOREBASE - Constants
 * Default values, configurations, and static data
 */

import { LorebaseSettings, MediaStatus, CardSize, CardOrientation, CardStyle, NoteImportFieldMapping } from './types';
import type { TranslationKey } from './localization';
import { defaultTraktSettings } from './services/trakt/types';
import { defaultPlayStationSettings } from './services/playstation/types';
import { buildSimpleTemplate, getDefaultTemplateFields } from './services/integrations/templateUtils';
import { createDefaultCardGrid } from './services/media/cardGrid';

// =============================================================================
// DEFAULT SETTINGS
// =============================================================================

export const PARTICLE_INTENSITY_MIN = 5;
export const PARTICLE_INTENSITY_MAX = 80;

/** Default library settings */
const DEFAULT_LIBRARY_SETTINGS = {
    cardGrid: createDefaultCardGrid(),
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
    bookshelfEffect: false,
    orientation: 'vertical' as CardOrientation,
    sortField: 'name' as const,
    sortOrder: 'asc' as const,
    viewState: {
        sort: { field: 'name' as const, order: 'asc' as const },
        group: { mode: 'none' as const, order: 'desc' as const },
        rules: [],
        tags: [],
        genres: [],
    },
    savedViews: [],
    activeSavedViewId: null,
    showAdultInAll: false,
};

export const DEFAULT_NOTE_IMPORT_FIELD_MAPPINGS: NoteImportFieldMapping[] = [
    { key: 'name', aliases: ['name', 'title', 'Title'] },
    { key: 'poster', aliases: ['poster', 'image', 'cover', 'thumbnail'] },
    { key: 'poster_b', aliases: ['poster_b', 'backdrop', 'banner', 'image_b'] },
    { key: 'plot', aliases: ['plot', 'summary', 'description'] },
    { key: 'genres', aliases: ['genres', 'genre', 'Genre'] },
    { key: 'year', aliases: ['year', 'Year'] },
    { key: 'released', aliases: ['released', 'releaseDate', 'date'] },
    { key: 'rating', aliases: ['rating', 'userRating', 'score'] },
    { key: 'status', aliases: ['status'] },
    { key: 'url', aliases: ['url', 'source', 'link'] },
];

export const MUSIC_NOTE_IMPORT_FIELD_MAPPINGS: NoteImportFieldMapping[] = [
    { key: 'music_kind', aliases: ['music_kind', 'musicKind', 'music_type'] },
    { key: 'artist', aliases: ['artist', 'performer', 'исполнитель', 'виконавець'] },
    { key: 'album', aliases: ['album', 'альбом'] },
    { key: 'tracks', aliases: ['tracks', 'tracklist', 'songs', 'треклист'] },
    { key: 'duration', aliases: ['duration', 'length'] },
    { key: 'parent_album', aliases: ['parent_album', 'parentAlbum'] },
    { key: 'parent_track_id', aliases: ['parent_track_id', 'parentTrackId'] },
];

const DEFAULT_GAME_TEMPLATE_FIELDS = getDefaultTemplateFields('games');
const DEFAULT_GAME_TEMPLATE = buildSimpleTemplate('games', DEFAULT_GAME_TEMPLATE_FIELDS);

const DEFAULT_ANIME_TEMPLATE_FIELDS = getDefaultTemplateFields('anime');
const DEFAULT_ANIME_TEMPLATE = buildSimpleTemplate('anime', DEFAULT_ANIME_TEMPLATE_FIELDS);

const DEFAULT_MOVIE_TEMPLATE_FIELDS = getDefaultTemplateFields('movies');
const DEFAULT_MOVIE_TEMPLATE = buildSimpleTemplate('movies', DEFAULT_MOVIE_TEMPLATE_FIELDS);

const DEFAULT_SERIES_TEMPLATE_FIELDS = getDefaultTemplateFields('series');
const DEFAULT_SERIES_TEMPLATE = buildSimpleTemplate('series', DEFAULT_SERIES_TEMPLATE_FIELDS);

const DEFAULT_BOOK_TEMPLATE_FIELDS = getDefaultTemplateFields('books');
const DEFAULT_BOOK_TEMPLATE = buildSimpleTemplate('books', DEFAULT_BOOK_TEMPLATE_FIELDS);

const DEFAULT_MANGA_TEMPLATE_FIELDS = getDefaultTemplateFields('manga');
const DEFAULT_MANGA_TEMPLATE = buildSimpleTemplate('manga', DEFAULT_MANGA_TEMPLATE_FIELDS);

export const DEFAULT_GAME_TAG_PRESETS = [
    { id: 'check-later', label: 'Check later', tag: 'check-later', icon: 'clock' },
    { id: 'play-soon', label: 'Play soon', tag: 'play-soon', icon: 'play' },
    { id: 'wait-early-access', label: 'Wait for early access to end', tag: 'wait-early-access', icon: 'hourglass' },
    { id: 'next-playthrough', label: 'Next in queue', tag: 'next-in-queue', icon: 'list-start' },
] as const;

function createDefaultBadges(): LorebaseSettings['badges'] {
    return {
        status: {
            enabled: true,
            position: 'bottom-right',
            iconOnly: false,
            showReleaseCountdown: true,
            alwaysShowCompletionDate: false,
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
        communityRating: { enabled: false, position: 'top-left', x: 8, y: 10, icon: 'star' },
        workType: {
            enabled: true,
            position: 'top-right',
            x: 70,
            y: 10,
        },
    };
}


/** Default plugin settings */
export const DEFAULT_SETTINGS: LorebaseSettings = {
    language: 'en',
    onlineExtrasEnabled: true,
    settingsLayoutMode: 'tabs',
    accentColor: '#e4a47e',
    showAddModeChoice: true,
    cardClickAction: 'open',
    updatedEditor: false,
    ratingScale: {
        mode: 'classic',
        classicPreset: 'standard',
        classicSeason: 'spring',
        classicHoliday: 'christmas',
        max: 5,
        step: 1,
        display: 'number',
    },
    completionDateBadgeFormat: 'short',
    completionDateBadgeFormats: { music: 'short',
        games: 'short',
        anime: 'short',
        movies: 'short',
        series: 'short',
        books: 'short',
        manga: 'short',
    },
    enabledMedia: { games: true, anime: true, movies: true, series: true, books: true, manga: true, music: true },
    releaseCalendarMediaTypes: ['game', 'anime', 'movie', 'series', 'book', 'manga'],
    releaseCalendarViewMode: 'calendar',
    releaseCalendarScope: 'upcoming',
    customGroups: [],
    particleEffect: 'none',
    particleIntensity: 40,
    animateParticlesWithReducedMotion: false,
    descriptionLines: 6,
    horizontalDescriptionLines: 6,
    scrollCardDescriptions: false,
    showDiscoveryBadge: true,
    overlayTextLayout: {
        title: { x: 7, y: 5 },
        year: { x: 7, y: 13 },
        format: { x: 30, y: 13 },
        description: { x: 2, y: 21 },
    },
    horizontalOverlayTextLayout: {
        title: { x: 7, y: 7 },
        year: { x: 7, y: 20 },
        format: { x: 30, y: 20 },
        description: { x: 2, y: 35 },
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
    animeDescriptionLines: 6,
    animeHorizontalDescriptionLines: 6,
    movieDescriptionLines: 6,
    movieHorizontalDescriptionLines: 6,
    seriesDescriptionLines: 6,
    seriesHorizontalDescriptionLines: 6,
    bookDescriptionLines: 6,
    bookHorizontalDescriptionLines: 6,
    mangaDescriptionLines: 6,
    mangaHorizontalDescriptionLines: 6,
    animeOverlayTextLayout: {
        title: { x: 7, y: 5 },
        year: { x: 7, y: 13 },
        format: { x: 30, y: 13 },
        description: { x: 2, y: 21 },
    },
    animeHorizontalOverlayTextLayout: {
        title: { x: 7, y: 7 },
        year: { x: 7, y: 20 },
        format: { x: 30, y: 20 },
        description: { x: 2, y: 35 },
    },
    movieOverlayTextLayout: {
        title: { x: 7, y: 5 },
        year: { x: 7, y: 13 },
        format: { x: 30, y: 13 },
        description: { x: 2, y: 21 },
    },
    movieHorizontalOverlayTextLayout: {
        title: { x: 7, y: 7 },
        year: { x: 7, y: 20 },
        format: { x: 30, y: 20 },
        description: { x: 2, y: 35 },
    },
    seriesOverlayTextLayout: {
        title: { x: 7, y: 5 },
        year: { x: 7, y: 13 },
        format: { x: 30, y: 13 },
        description: { x: 2, y: 21 },
    },
    seriesHorizontalOverlayTextLayout: {
        title: { x: 7, y: 7 },
        year: { x: 7, y: 20 },
        format: { x: 30, y: 20 },
        description: { x: 2, y: 35 },
    },
    bookOverlayTextLayout: {
        title: { x: 7, y: 5 },
        year: { x: 7, y: 13 },
        format: { x: 30, y: 13 },
        description: { x: 2, y: 21 },
    },
    bookHorizontalOverlayTextLayout: {
        title: { x: 7, y: 7 },
        year: { x: 7, y: 20 },
        format: { x: 30, y: 20 },
        description: { x: 2, y: 35 },
    },
    mangaOverlayTextLayout: {
        title: { x: 7, y: 5 },
        year: { x: 7, y: 13 },
        format: { x: 30, y: 13 },
        description: { x: 2, y: 21 },
    },
    mangaHorizontalOverlayTextLayout: {
        title: { x: 7, y: 7 },
        year: { x: 7, y: 20 },
        format: { x: 30, y: 20 },
        description: { x: 2, y: 35 },
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
    musicDescriptionLines: 6,
    musicHorizontalDescriptionLines: 6,
    musicOverlayTextLayout: { title: { x: 0, y: 0 }, year: { x: 0, y: 40 }, format: { x: 0, y: 0 }, description: { x: 0, y: 0 } },
    musicHorizontalOverlayTextLayout: { title: { x: 0, y: 0 }, year: { x: 0, y: 14 }, format: { x: 0, y: 0 }, description: { x: 0, y: 0 } },
    musicOverlayTextVisibility: { title: true, year: true, format: false, description: false },
    musicHorizontalOverlayTextVisibility: { title: true, year: true, format: false, description: false },
    musicBadges: createDefaultBadges(),
    musicHorizontalBadges: createDefaultBadges(),
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
    noteImport: {
        sourceFolderPath: '',
        targetMedia: 'auto',
        writeMode: 'copy',
        fieldMappings: DEFAULT_NOTE_IMPORT_FIELD_MAPPINGS.map((mapping) => ({
            key: mapping.key,
            aliases: [...mapping.aliases],
        })),
        blacklist: [],
    },
    migrations: {
        animeProgressCardStyle: false,
        templateTypeField: false,
        gameTemplateTypeField: false,
        mangaTemplateAdultField: false,
        mangaTemplateWorkTypeField: false,
        releaseCalendarTemplateDates: false,
        orderedTemplateFields: false,
        completeTemplateSchema: false,
        gameTrackingTemplateFields: false,
        gameDefaultVisibilityFilters: false,
        jikanMangaProviderV1: false,
    },
    games: {
        ...DEFAULT_LIBRARY_SETTINGS,
        folderPath: 'LOREBASE/Games',
        sortField: 'series' as const,
        viewState: {
            ...DEFAULT_LIBRARY_SETTINGS.viewState,
            sort: { field: 'series' as const, order: 'asc' as const },
            group: { mode: 'series' as const, order: 'asc' as const },
            rules: [
                {
                    id: 'default-game-adult-hidden',
                    field: 'adult',
                    fieldType: 'boolean' as const,
                    operator: 'isFalse' as const,
                    value: false,
                },
                {
                    id: 'default-game-custom-hidden',
                    field: 'custom',
                    fieldType: 'boolean' as const,
                    operator: 'isFalse' as const,
                    value: false,
                },
            ],
            tags: [],
            genres: [],
        },
        savedViews: [],
    },
    anime: {
        ...DEFAULT_LIBRARY_SETTINGS,
        folderPath: 'LOREBASE/Anime',
        posterMode: 'active-part',
        cardStyle: 'progress',
        viewState: { ...DEFAULT_LIBRARY_SETTINGS.viewState, sort: { ...DEFAULT_LIBRARY_SETTINGS.viewState.sort }, group: { ...DEFAULT_LIBRARY_SETTINGS.viewState.group }, rules: [], tags: [], genres: [] },
        savedViews: [],
    },
    movies: {
        ...DEFAULT_LIBRARY_SETTINGS,
        folderPath: 'LOREBASE/Movies',
        viewState: { ...DEFAULT_LIBRARY_SETTINGS.viewState, sort: { ...DEFAULT_LIBRARY_SETTINGS.viewState.sort }, group: { ...DEFAULT_LIBRARY_SETTINGS.viewState.group }, rules: [], tags: [], genres: [] },
        savedViews: [],
    },
    series: {
        ...DEFAULT_LIBRARY_SETTINGS,
        folderPath: 'LOREBASE/Series',
        posterMode: 'active-part',
        viewState: { ...DEFAULT_LIBRARY_SETTINGS.viewState, sort: { ...DEFAULT_LIBRARY_SETTINGS.viewState.sort }, group: { ...DEFAULT_LIBRARY_SETTINGS.viewState.group }, rules: [], tags: [], genres: [] },
        savedViews: [],
    },
    books: {
        ...DEFAULT_LIBRARY_SETTINGS,
        folderPath: 'LOREBASE/Books',
        viewState: { ...DEFAULT_LIBRARY_SETTINGS.viewState, sort: { ...DEFAULT_LIBRARY_SETTINGS.viewState.sort }, group: { ...DEFAULT_LIBRARY_SETTINGS.viewState.group }, rules: [], tags: [], genres: [] },
        savedViews: [],
    },
    manga: {
        ...DEFAULT_LIBRARY_SETTINGS,
        folderPath: 'LOREBASE/Manga',
        viewState: { ...DEFAULT_LIBRARY_SETTINGS.viewState, sort: { ...DEFAULT_LIBRARY_SETTINGS.viewState.sort }, group: { ...DEFAULT_LIBRARY_SETTINGS.viewState.group }, rules: [], tags: [], genres: [] },
        savedViews: [],
    },
    music: {
        ...DEFAULT_LIBRARY_SETTINGS,
        cardGrid: createDefaultCardGrid(7),
        columns: 7,
        folderPath: 'LOREBASE/Music',
        noteTemplate: { templateEnabled: true, templateMode: 'simple', templateFields: getDefaultTemplateFields('music'),
            template: buildSimpleTemplate('music', getDefaultTemplateFields('music')) },
        customCardSize: true,
        customCardMinHeight: 180,
        customCardImageRatio: 1,
        albumCoverMode: 'square',
        trackCoverMode: 'square',
        provider: 'musicbrainz',
        lastfmApiKey: '',
        viewState: {
            ...DEFAULT_LIBRARY_SETTINGS.viewState,
            sort: { field: 'name', order: 'asc' },
            group: { mode: 'none', order: 'asc' },
            rules: [{ id: 'music-kind', field: 'musicKind', fieldType: 'list', operator: 'containsAny', value: ['album'] }],
            tags: [], genres: [],
        },
        savedViews: [],
    },
    integrations: {
        enabled: true,
        compactTemplates: false,
        requestCooldownSeconds: 1,
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
            kitsu: { enabled: true },
            jikan: { enabled: false },
            shikimori: { enabled: true },
            tmdb: { enabled: false, apiKey: '' },
            tvmaze: { enabled: true, apiKey: '' },
            omdb: { enabled: false, apiKey: '' },
            hardcover: { enabled: true, apiKey: '' },
            googlebooks: { enabled: false, apiKey: '' },
            openlibrary: { enabled: true, apiKey: '' },
            mangaupdates: { enabled: true },
            mangadex: { enabled: true },
            comicvine: { enabled: true, apiKey: '' },
            vndb: { enabled: true },
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
    anilistSync: {
        clientId: '',
        accessToken: '',
        username: '',
        autoSyncOnStartup: false,
        syncDeletions: false,
        lastSynced: {},
    },
    traktSync: defaultTraktSettings(),
    playstationSync: defaultPlayStationSettings(),
};

// =============================================================================
// STATUS CONFIGURATION
// =============================================================================

/** Status configuration with icons and colors */
export const STATUS_CONFIG: Record<MediaStatus, { pathD: string }> = {
    listening: { pathD: 'M9 18V5l12-2v13M9 8l12-2M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3M21 16a3 3 0 1 1-3-3 3 3 0 0 1 3 3' },
    on_repeat: { pathD: 'm17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3' },
    to_be_released: {
        pathD: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM12 14v3M10.5 15.5h3',
    },
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
    listening: 'headphones',
    on_repeat: 'repeat',
    to_be_released: 'calendar-clock',
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
