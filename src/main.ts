/**
 * LOREBASE - Main Plugin Entry Point
 * Games and anime tracker plugin for Obsidian
 */

import { Plugin, WorkspaceLeaf, Menu, Notice, addIcon, TFile } from 'obsidian';
import { LorebaseSettings, MediaItem, GameItem, GameStats, AnimeStats, VideoStats, ReadingStats, MediaType, RelatedMediaLink, ReadingItem } from './types';
import { DEFAULT_SETTINGS, VIEW_TYPE_LIBRARY, LOREBASE_ICON_ID, LOREBASE_ICON_SVG, DEFAULT_COVER } from './constants';
import { i18n, t } from './localization';
import { LibraryView } from './views/LibraryView';
import { LorebaseSettingTab } from './settings/SettingsTab';
import { EditModal } from './modals/EditModal';
import { AnimeEditModal } from './modals/AnimeEditModal';
import { VideoEditModal } from './modals/VideoEditModal';
import { ReadingEditModal } from './modals/ReadingEditModal';
import { StatsModal } from './modals/StatsModal';
import { DeleteModal } from './modals/DeleteModal';
import { SteamSyncReviewModal } from './modals/SteamSyncReviewModal';
import { GameService } from './services/GameService';
import { AnimeService } from './services/AnimeService';
import { VideoService } from './services/VideoService';
import { ReadingService } from './services/ReadingService';
import { ParticleService } from './services/ParticleService';
import { IntegrationService } from './services/IntegrationService';
import { SteamSyncService } from './services/SteamSyncService';
import { MetadataService } from './services/MetadataService';
import {
    mergeOverlayLayout,
    mergeOverlayVisibility,
    normalizeDescriptionLines,
    normalizeTagPresets,
    parseBadges,
} from './settings/settingsNormalization';
import { parseRelatedMedia } from './services/media/parsers';

// =============================================================================
// LOREBASE PLUGIN
// =============================================================================

/**
 * Main plugin class
 */
export default class LorebasePlugin extends Plugin {
    settings: LorebaseSettings = DEFAULT_SETTINGS;
    private gameService: GameService | null = null;
    private animeService: AnimeService | null = null;
    private movieService: VideoService | null = null;
    private seriesService: VideoService | null = null;
    private bookService: ReadingService | null = null;
    private mangaService: ReadingService | null = null;
    private mediaType: MediaType = 'game';
    private particleService: ParticleService | null = null;
    private integrationService: IntegrationService | null = null;
    private steamSyncService: SteamSyncService | null = null;
    private metadataService: MetadataService | null = null;

    async onload(): Promise<void> {
        // Load settings
        await this.loadSettings();
        this.normalizeMediaType();

        // Initialize localization
        i18n.setLanguage(this.settings.language);

        // Initialize game service
        this.metadataService = new MetadataService(this.app);
        this.gameService = new GameService(this.app, this.metadataService);
        this.gameService.setFolderPath(this.settings.games.folderPath);
        this.animeService = new AnimeService(this.app, this.metadataService);
        this.animeService.setFolderPath(this.settings.anime.folderPath);
        this.movieService = new VideoService(this.app, 'movie', this.settings.movies.folderPath, this.metadataService);
        this.seriesService = new VideoService(this.app, 'series', this.settings.series.folderPath, this.metadataService);
        this.bookService = new ReadingService(this.app, 'book', this.settings.books.folderPath, this.metadataService);
        this.mangaService = new ReadingService(this.app, 'manga', this.settings.manga.folderPath, this.metadataService);
        this.integrationService = new IntegrationService(this.app, () => this.settings, () => {
            void this.runSteamSync();
        });
        this.steamSyncService = new SteamSyncService(this.app, this.metadataService);
        addIcon(LOREBASE_ICON_ID, LOREBASE_ICON_SVG);

        // Register the library view
        this.registerView(
            VIEW_TYPE_LIBRARY,
            (leaf) => new LibraryView(leaf, this)
        );

        // Add ribbon icon
        this.addRibbonIcon(LOREBASE_ICON_ID, t('ribbonLibrary'), (evt: MouseEvent) => {
            this.showLibraryMenu(evt);
        });

        // Add command to open library
        this.addCommand({
            id: 'open-library',
            name: t('commandOpenLibrary'),
            callback: () => {
                void this.activateView();
            }
        });

        this.addCommand({
            id: 'add-game',
            name: t('commandAddGame'),
            callback: () => {
                void this.integrationService?.addGame();
            }
        });

        this.addCommand({
            id: 'add-anime',
            name: t('commandAddAnime'),
            callback: () => {
                void this.integrationService?.addAnime();
            }
        });

        this.addCommand({
            id: 'add-movie',
            name: t('commandAddMovie'),
            callback: () => {
                void this.integrationService?.addMovie();
            }
        });

        this.addCommand({
            id: 'add-series',
            name: t('commandAddSeries'),
            callback: () => {
                void this.integrationService?.addSeries();
            }
        });

        this.addCommand({
            id: 'add-book',
            name: t('commandAddBook'),
            callback: () => {
                void this.integrationService?.addBook();
            }
        });

        this.addCommand({
            id: 'add-manga',
            name: t('commandAddManga'),
            callback: () => {
                void this.integrationService?.addManga();
            }
        });

        this.addCommand({
            id: 'steam-sync',
            name: t('commandSteamSync'),
            callback: () => {
                void this.runSteamSync();
            }
        });

        // Register settings tab
        this.addSettingTab(new LorebaseSettingTab(this.app, this));

        // Apply accent color on load
        this.applyAccentColor();
        this.applyParticles();

        if (this.settings.steamSync.autoSyncPlaytimeOnStartup && this.settings.steamSync.steamId) {
            void this.runSteamPlaytimeSync();
        }
    }

    onunload(): void {
        this.gameService = null;
        this.animeService = null;
        this.movieService = null;
        this.seriesService = null;
        this.bookService = null;
        this.mangaService = null;

        if (this.particleService) {
            this.particleService.destroy();
            this.particleService = null;
        }

        this.integrationService = null;
        this.steamSyncService = null;
        this.metadataService = null;
    }

    /**
     * Load plugin settings
     */
    async loadSettings(): Promise<void> {
        const loaded: unknown = await this.loadData();
        const sanitized = this.isSettingsRecord(loaded) ? { ...loaded } : {};
        this.settings = Object.assign({}, DEFAULT_SETTINGS, sanitized);
        this.settings.settingsLayoutMode = sanitized.settingsLayoutMode === 'accordion'
            ? 'accordion'
            : 'tabs';
        i18n.setLanguage(this.settings.language);

        // Ensure nested objects are merged properly
        if (sanitized?.games) {
            this.settings.games = Object.assign({}, DEFAULT_SETTINGS.games, sanitized.games);
        }
        if (sanitized?.anime) {
            this.settings.anime = Object.assign({}, DEFAULT_SETTINGS.anime, sanitized.anime);
        }
        if (sanitized?.movies) {
            this.settings.movies = Object.assign({}, DEFAULT_SETTINGS.movies, sanitized.movies);
        }
        if (sanitized?.series) {
            this.settings.series = Object.assign({}, DEFAULT_SETTINGS.series, sanitized.series);
        }
        if (sanitized?.books) {
            this.settings.books = Object.assign({}, DEFAULT_SETTINGS.books, sanitized.books);
        }
        if (sanitized?.manga) {
            this.settings.manga = Object.assign({}, DEFAULT_SETTINGS.manga, sanitized.manga);
        }
        if (sanitized?.enabledMedia) {
            this.settings.enabledMedia = Object.assign({}, DEFAULT_SETTINGS.enabledMedia, sanitized.enabledMedia);
        }
        this.settings.migrations = Object.assign({}, DEFAULT_SETTINGS.migrations, sanitized?.migrations ?? {});
        if (!this.settings.migrations.animeProgressCardStyle && this.settings.anime.cardStyle === 'hover') {
            this.settings.anime.cardStyle = 'progress';
            this.settings.migrations.animeProgressCardStyle = true;
            void this.saveData(this.settings);
        }
        this.settings.steamSync = Object.assign({}, DEFAULT_SETTINGS.steamSync, sanitized?.steamSync ?? {});
        this.settings.steamSync.fields = Object.assign(
            {},
            DEFAULT_SETTINGS.steamSync.fields,
            sanitized?.steamSync?.fields ?? {}
        );
        if (this.settings.steamSync.statusWithPlaytime === 'playing' || this.settings.steamSync.statusWithPlaytime === 'completed') {
            this.settings.steamSync.statusWithPlaytime = DEFAULT_SETTINGS.steamSync.statusWithPlaytime;
        }
        if (this.settings.steamSync.statusWishlist === 'not_started') {
            this.settings.steamSync.statusWishlist = DEFAULT_SETTINGS.steamSync.statusWishlist;
        }
        this.settings.statusLabels = {
            games: Object.assign({}, DEFAULT_SETTINGS.statusLabels.games, sanitized?.statusLabels?.games ?? {}),
            anime: Object.assign({}, DEFAULT_SETTINGS.statusLabels.anime, sanitized?.statusLabels?.anime ?? {}),
            movies: Object.assign({}, DEFAULT_SETTINGS.statusLabels.movies, sanitized?.statusLabels?.movies ?? {}),
            series: Object.assign({}, DEFAULT_SETTINGS.statusLabels.series, sanitized?.statusLabels?.series ?? {}),
            books: Object.assign({}, DEFAULT_SETTINGS.statusLabels.books, sanitized?.statusLabels?.books ?? {}),
            manga: Object.assign({}, DEFAULT_SETTINGS.statusLabels.manga, sanitized?.statusLabels?.manga ?? {}),
        };
        const legacyCompletedLabel = t('statusPlayed').trim().toLowerCase();
        for (const labels of [this.settings.statusLabels.movies, this.settings.statusLabels.series]) {
            if (labels.completed?.trim().toLowerCase() === legacyCompletedLabel) {
                delete labels.completed;
            }
        }
        if (!Object.keys(this.settings.statusLabels.books).length && !sanitized?.statusLabels?.books) {
            this.settings.statusLabels.books = {
                planned: t('statusPlanToRead'),
                watching: t('statusReading'),
            };
        }
        if (!Object.keys(this.settings.statusLabels.manga).length && !sanitized?.statusLabels?.manga) {
            this.settings.statusLabels.manga = {
                planned: t('statusPlanToRead'),
                watching: t('statusReading'),
            };
        }
        this.settings.tagPresets = {
            games: normalizeTagPresets(sanitized?.tagPresets?.games),
        };

        type CustomizationProfile = {
            descriptionKey: keyof LorebaseSettings;
            descriptionFallbackKey?: keyof LorebaseSettings;
            layoutKey: keyof LorebaseSettings;
            layoutFallbackKey?: keyof LorebaseSettings;
            visibilityKey: keyof LorebaseSettings;
            visibilityFallbackKey?: keyof LorebaseSettings;
            badgesKey: keyof LorebaseSettings;
            badgesFallbackKey?: keyof LorebaseSettings;
        };
        const settingsRecord = this.settings as unknown as Record<string, unknown>;
        const sanitizedRecord = sanitized as Record<string, unknown>;
        const defaultsRecord = DEFAULT_SETTINGS as unknown as Record<string, unknown>;
        const mediaCustomization: Record<'game' | 'anime' | 'movie' | 'series' | 'book' | 'manga', Record<'vertical' | 'horizontal', CustomizationProfile>> = {
            game: {
                vertical: {
                    descriptionKey: 'descriptionLines',
                    layoutKey: 'overlayTextLayout',
                    visibilityKey: 'overlayTextVisibility',
                    badgesKey: 'badges',
                },
                horizontal: {
                    descriptionKey: 'horizontalDescriptionLines',
                    descriptionFallbackKey: 'descriptionLines',
                    layoutKey: 'horizontalOverlayTextLayout',
                    visibilityKey: 'horizontalOverlayTextVisibility',
                    visibilityFallbackKey: 'overlayTextVisibility',
                    badgesKey: 'horizontalBadges',
                    badgesFallbackKey: 'badges',
                },
            },
            anime: {
                vertical: {
                    descriptionKey: 'animeDescriptionLines',
                    descriptionFallbackKey: 'descriptionLines',
                    layoutKey: 'animeOverlayTextLayout',
                    layoutFallbackKey: 'overlayTextLayout',
                    visibilityKey: 'animeOverlayTextVisibility',
                    visibilityFallbackKey: 'overlayTextVisibility',
                    badgesKey: 'animeBadges',
                    badgesFallbackKey: 'badges',
                },
                horizontal: {
                    descriptionKey: 'animeHorizontalDescriptionLines',
                    descriptionFallbackKey: 'horizontalDescriptionLines',
                    layoutKey: 'animeHorizontalOverlayTextLayout',
                    layoutFallbackKey: 'horizontalOverlayTextLayout',
                    visibilityKey: 'animeHorizontalOverlayTextVisibility',
                    visibilityFallbackKey: 'animeOverlayTextVisibility',
                    badgesKey: 'animeHorizontalBadges',
                    badgesFallbackKey: 'animeBadges',
                },
            },
            movie: {
                vertical: {
                    descriptionKey: 'movieDescriptionLines',
                    descriptionFallbackKey: 'descriptionLines',
                    layoutKey: 'movieOverlayTextLayout',
                    layoutFallbackKey: 'overlayTextLayout',
                    visibilityKey: 'movieOverlayTextVisibility',
                    visibilityFallbackKey: 'overlayTextVisibility',
                    badgesKey: 'movieBadges',
                    badgesFallbackKey: 'badges',
                },
                horizontal: {
                    descriptionKey: 'movieHorizontalDescriptionLines',
                    descriptionFallbackKey: 'horizontalDescriptionLines',
                    layoutKey: 'movieHorizontalOverlayTextLayout',
                    layoutFallbackKey: 'horizontalOverlayTextLayout',
                    visibilityKey: 'movieHorizontalOverlayTextVisibility',
                    visibilityFallbackKey: 'horizontalOverlayTextVisibility',
                    badgesKey: 'movieHorizontalBadges',
                    badgesFallbackKey: 'horizontalBadges',
                },
            },
            series: {
                vertical: {
                    descriptionKey: 'seriesDescriptionLines',
                    descriptionFallbackKey: 'descriptionLines',
                    layoutKey: 'seriesOverlayTextLayout',
                    layoutFallbackKey: 'overlayTextLayout',
                    visibilityKey: 'seriesOverlayTextVisibility',
                    visibilityFallbackKey: 'overlayTextVisibility',
                    badgesKey: 'seriesBadges',
                    badgesFallbackKey: 'badges',
                },
                horizontal: {
                    descriptionKey: 'seriesHorizontalDescriptionLines',
                    descriptionFallbackKey: 'horizontalDescriptionLines',
                    layoutKey: 'seriesHorizontalOverlayTextLayout',
                    layoutFallbackKey: 'horizontalOverlayTextLayout',
                    visibilityKey: 'seriesHorizontalOverlayTextVisibility',
                    visibilityFallbackKey: 'horizontalOverlayTextVisibility',
                    badgesKey: 'seriesHorizontalBadges',
                    badgesFallbackKey: 'horizontalBadges',
                },
            },
            book: {
                vertical: {
                    descriptionKey: 'bookDescriptionLines',
                    descriptionFallbackKey: 'descriptionLines',
                    layoutKey: 'bookOverlayTextLayout',
                    layoutFallbackKey: 'overlayTextLayout',
                    visibilityKey: 'bookOverlayTextVisibility',
                    visibilityFallbackKey: 'overlayTextVisibility',
                    badgesKey: 'bookBadges',
                    badgesFallbackKey: 'badges',
                },
                horizontal: {
                    descriptionKey: 'bookHorizontalDescriptionLines',
                    descriptionFallbackKey: 'horizontalDescriptionLines',
                    layoutKey: 'bookHorizontalOverlayTextLayout',
                    layoutFallbackKey: 'horizontalOverlayTextLayout',
                    visibilityKey: 'bookHorizontalOverlayTextVisibility',
                    visibilityFallbackKey: 'horizontalOverlayTextVisibility',
                    badgesKey: 'bookHorizontalBadges',
                    badgesFallbackKey: 'horizontalBadges',
                },
            },
            manga: {
                vertical: {
                    descriptionKey: 'mangaDescriptionLines',
                    descriptionFallbackKey: 'descriptionLines',
                    layoutKey: 'mangaOverlayTextLayout',
                    layoutFallbackKey: 'overlayTextLayout',
                    visibilityKey: 'mangaOverlayTextVisibility',
                    visibilityFallbackKey: 'overlayTextVisibility',
                    badgesKey: 'mangaBadges',
                    badgesFallbackKey: 'badges',
                },
                horizontal: {
                    descriptionKey: 'mangaHorizontalDescriptionLines',
                    descriptionFallbackKey: 'horizontalDescriptionLines',
                    layoutKey: 'mangaHorizontalOverlayTextLayout',
                    layoutFallbackKey: 'horizontalOverlayTextLayout',
                    visibilityKey: 'mangaHorizontalOverlayTextVisibility',
                    visibilityFallbackKey: 'horizontalOverlayTextVisibility',
                    badgesKey: 'mangaHorizontalBadges',
                    badgesFallbackKey: 'horizontalBadges',
                },
            },
        };
        const readSetting = <T>(key: keyof LorebaseSettings): T => settingsRecord[key as string] as T;
        const readDefault = <T>(key: keyof LorebaseSettings): T => defaultsRecord[key as string] as T;
        const readSanitized = <T>(key: keyof LorebaseSettings): T | undefined => sanitizedRecord[key as string] as T | undefined;

        for (const media of ['game', 'anime', 'movie', 'series', 'book', 'manga'] as const) {
            for (const orientation of ['vertical', 'horizontal'] as const) {
                const profile = mediaCustomization[media][orientation];
                settingsRecord[profile.descriptionKey as string] = normalizeDescriptionLines(
                    readSanitized(profile.descriptionKey),
                    profile.descriptionFallbackKey
                        ? readSetting<number>(profile.descriptionFallbackKey)
                        : readDefault<number>(profile.descriptionKey)
                );

                const rawLayout = readSanitized<Partial<LorebaseSettings['overlayTextLayout']>>(profile.layoutKey);
                settingsRecord[profile.layoutKey as string] = mergeOverlayLayout(
                    rawLayout,
                    rawLayout
                        ? readDefault<LorebaseSettings['overlayTextLayout']>(profile.layoutKey)
                        : profile.layoutFallbackKey
                            ? readSetting<LorebaseSettings['overlayTextLayout']>(profile.layoutFallbackKey)
                            : readDefault<LorebaseSettings['overlayTextLayout']>(profile.layoutKey)
                );

                const rawVisibility = readSanitized<Partial<LorebaseSettings['overlayTextVisibility']>>(profile.visibilityKey);
                settingsRecord[profile.visibilityKey as string] = mergeOverlayVisibility(
                    rawVisibility,
                    rawVisibility
                        ? readDefault<LorebaseSettings['overlayTextVisibility']>(profile.visibilityKey)
                        : profile.visibilityFallbackKey
                            ? readSetting<LorebaseSettings['overlayTextVisibility']>(profile.visibilityFallbackKey)
                            : readDefault<LorebaseSettings['overlayTextVisibility']>(profile.visibilityKey)
                );

                const rawBadges = readSanitized(profile.badgesKey);
                settingsRecord[profile.badgesKey as string] = parseBadges(
                    rawBadges,
                    rawBadges
                        ? readDefault<LorebaseSettings['badges']>(profile.badgesKey)
                        : profile.badgesFallbackKey
                            ? readSetting<LorebaseSettings['badges']>(profile.badgesFallbackKey)
                            : readDefault<LorebaseSettings['badges']>(profile.badgesKey)
                );
            }
        }
        this.settings.overlayApplyToAllMedia = typeof sanitized?.overlayApplyToAllMedia === 'boolean'
            ? sanitized.overlayApplyToAllMedia
            : DEFAULT_SETTINGS.overlayApplyToAllMedia;
        // Migration guard: fix desync where anime badges were disabled via
        // "apply to all" but only game badges were re-enabled afterward.
        const animeBadgeDesync =
            (!this.settings.animeBadges.status.enabled && this.settings.badges.status.enabled)
            || (!this.settings.animeBadges.rating.enabled && this.settings.badges.rating.enabled);
        if (animeBadgeDesync) {
            if (!this.settings.animeBadges.status.enabled && this.settings.badges.status.enabled) {
                this.settings.animeBadges.status.enabled = true;
            }
            if (!this.settings.animeBadges.rating.enabled && this.settings.badges.rating.enabled) {
                this.settings.animeBadges.rating.enabled = true;
            }
            void this.saveData(this.settings);
        }
        if (sanitized?.integrations) {
            this.settings.integrations = Object.assign({}, DEFAULT_SETTINGS.integrations, sanitized.integrations);
            const integrations = this.settings.integrations;
            const defaultIntegrations = DEFAULT_SETTINGS.integrations;
            if (defaultIntegrations && sanitized.integrations.providers) {
                integrations.providers = Object.assign(
                    {},
                    defaultIntegrations.providers,
                    sanitized.integrations.providers
                );
            }
            if (defaultIntegrations) integrations.imageStorage = Object.assign(
                {},
                defaultIntegrations.imageStorage,
                sanitized.integrations.imageStorage ?? {}
            );
            if (defaultIntegrations && sanitized.integrations.media) {
                integrations.media = Object.assign(
                    {},
                    defaultIntegrations.media,
                    sanitized.integrations.media
                );
                integrations.media.games = Object.assign({}, defaultIntegrations.media.games, sanitized.integrations.media.games ?? {});
                integrations.media.anime = Object.assign({}, defaultIntegrations.media.anime, sanitized.integrations.media.anime ?? {});
                integrations.media.movies = Object.assign({}, defaultIntegrations.media.movies, sanitized.integrations.media.movies ?? {});
                integrations.media.series = Object.assign({}, defaultIntegrations.media.series, sanitized.integrations.media.series ?? {});
                integrations.media.books = Object.assign({}, defaultIntegrations.media.books, sanitized.integrations.media.books ?? {});
                integrations.media.manga = Object.assign({}, defaultIntegrations.media.manga, sanitized.integrations.media.manga ?? {});
            }

            // Backward compatibility: map removed anime provider "omdb" to "anilist".
            const animeProvider = String(integrations.media?.anime?.provider ?? '');
            if (animeProvider === 'omdb') {
                integrations.media.anime.provider = 'anilist';
            }
            const booksProvider = String(integrations.media?.books?.provider ?? '');
            if (!['hardcover', 'googlebooks'].includes(booksProvider)) {
                integrations.media.books.provider = 'hardcover';
            }
            const mangaProvider = String(integrations.media?.manga?.provider ?? '');
            if (!['anilist', 'shikimori', 'jikan', 'mangadex'].includes(mangaProvider)) {
                integrations.media.manga.provider = 'anilist';
            }
        }

        if (this.migrateIntegrationTemplates()) {
            await this.saveData(this.settings);
        }
    }

    private isSettingsRecord(value: unknown): value is Partial<LorebaseSettings> {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    }

    private migrateIntegrationTemplates(): boolean {
        const media = this.settings.integrations?.media;
        if (!media) return false;

        let changed = false;

        if (media.games?.template) {
            let nextTemplate = media.games.template;
            if (!/^\s*name\s*:/m.test(nextTemplate)) {
                nextTemplate = this.insertTemplateFieldAtFrontmatterTop(
                    nextTemplate,
                    'name: "{{VALUE:name}}"'
                );
            }
            nextTemplate = this.insertTemplateFieldAfter(
                nextTemplate,
                'poster',
                'poster_b: "{{VALUE:PosterHorizontal}}"',
                ['poster_b:', '{{VALUE:PosterHorizontal}}']
            );

            if (nextTemplate !== media.games.template) {
                media.games.template = nextTemplate;
                changed = true;
            }
        }

        if (media.anime?.template) {
            let nextTemplate = media.anime.template.replace(
                /^(\s*)image:\s*$/m,
                '$1image: "{{VALUE:image}}"'
            );
            nextTemplate = nextTemplate.replace(
                /^(\s*)status:\s*planned\s*$/m,
                '$1status: "{{VALUE:status}}"'
            );
            nextTemplate = nextTemplate
                .split(/\r?\n/)
                .filter((line) => !/^\s*name\s*:\s*["']?\{\{VALUE:name\}\}["']?\s*$/.test(line))
                .join('\n');
            if (!/^\s*title\s*:/m.test(nextTemplate)) {
                nextTemplate = this.insertTemplateFieldAtFrontmatterTop(
                    nextTemplate,
                    'title: "{{VALUE:name}}"'
                );
            }

            nextTemplate = this.insertTemplateFieldAfter(
                nextTemplate,
                'image',
                'image_b: "{{VALUE:ImageHorizontal}}"',
                ['image_b:', '{{VALUE:ImageHorizontal}}']
            );
            nextTemplate = this.insertTemplateFieldAfter(
                nextTemplate,
                'format',
                [
                    'season_current: "{{VALUE:seasonCurrent}}"',
                    'episode_current: "{{VALUE:episodeCurrent}}"',
                    'episode_total: "{{VALUE:episodeTotal}}"',
                    'active_part_id: "{{VALUE:activePartId}}"',
                    'anime_parts:',
                    '{{VALUE:animePartsYaml}}',
                ].join('\n'),
                ['anime_parts:', '{{VALUE:animePartsYaml}}']
            );
            nextTemplate = this.removeTemplateFields(nextTemplate, ['integration_provider', 'integration_id']);
            if (!nextTemplate.includes('anime_parts:')) {
                nextTemplate = this.insertTemplateFieldAfter(
                    nextTemplate,
                    'year',
                    [
                        'format: "{{VALUE:format}}"',
                        'season_current: "{{VALUE:seasonCurrent}}"',
                        'episode_current: "{{VALUE:episodeCurrent}}"',
                        'episode_total: "{{VALUE:episodeTotal}}"',
                        'active_part_id: "{{VALUE:activePartId}}"',
                        'anime_parts:',
                        '{{VALUE:animePartsYaml}}',
                    ].join('\n'),
                    ['anime_parts:', '{{VALUE:animePartsYaml}}']
                );
            }

            if (nextTemplate !== media.anime.template) {
                media.anime.template = nextTemplate;
                changed = true;
            }
        }

        if (media.games?.templateFields && media.games.templateFields[0] !== 'name') {
            media.games.templateFields = ['name', ...media.games.templateFields.filter((field) => field !== 'name')];
            changed = true;
        }
        if (media.anime?.templateFields && media.anime.templateFields[0] !== 'name') {
            media.anime.templateFields = ['name', ...media.anime.templateFields.filter((field) => field !== 'name')];
            changed = true;
        }
        if (media.anime?.templateFields && !media.anime.templateFields.includes('animeParts')) {
            const formatIndex = media.anime.templateFields.indexOf('format');
            const insertAt = formatIndex >= 0 ? formatIndex + 1 : media.anime.templateFields.length;
            media.anime.templateFields.splice(insertAt, 0, 'animeParts');
            changed = true;
        }
        if (media.anime?.templateFields?.includes('integrationSource')) {
            media.anime.templateFields = media.anime.templateFields.filter((field) => field !== 'integrationSource');
            changed = true;
        }
        if (media.series?.template) {
            let nextTemplate = media.series.template;
            nextTemplate = this.insertTemplateFieldAfter(
                nextTemplate,
                'year',
                [
                    'released: "{{VALUE:released}}"',
                    'runtime: "{{VALUE:runtime}}"',
                    'director: "{{VALUE:director}}"',
                    'actors: "{{VALUE:actors}}"',
                ].join('\n'),
                ['released:', '{{VALUE:released}}', 'runtime:', '{{VALUE:runtime}}', 'director:', '{{VALUE:director}}', 'actors:', '{{VALUE:actors}}']
            );
            if (nextTemplate !== media.series.template) {
                media.series.template = nextTemplate;
                changed = true;
            }
        }
        if (media.series?.templateFields) {
            const wanted = ['released', 'runtime', 'director', 'actors'];
            const missing = wanted.filter((field) => !media.series.templateFields?.includes(field));
            if (missing.length) {
                const yearIndex = media.series.templateFields.indexOf('year');
                const insertAt = yearIndex >= 0 ? yearIndex + 1 : media.series.templateFields.length;
                media.series.templateFields.splice(insertAt, 0, ...missing);
                changed = true;
            }
        }

        return changed;
    }

    private insertTemplateFieldAtFrontmatterTop(template: string, insertedLine: string): string {
        const lines = template.split(/\r?\n/);
        const startIndex = lines.findIndex((line) => line.trim() === '---');
        if (startIndex === -1) {
            return `${insertedLine}\n${template}`;
        }
        lines.splice(startIndex + 1, 0, insertedLine);
        return lines.join('\n');
    }

    private insertTemplateFieldAfter(template: string, fieldName: string, insertedLine: string, duplicateMarkers: string[]): string {
        if (duplicateMarkers.some((marker) => template.includes(marker))) {
            return template;
        }

        const escapedField = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const fieldLine = new RegExp(`^(\\s*)${escapedField}\\s*:\\s*.*$`, 'm');
        return template.replace(fieldLine, (line: string, indent: string) => `${line}\n${indent}${insertedLine}`);
    }

    private removeTemplateFields(template: string, fieldNames: string[]): string {
        const fields = new Set(fieldNames);
        return template
            .split(/\r?\n/)
            .filter((line) => {
                const match = line.match(/^\s*([^:#]+)\s*:/);
                return !match || !fields.has(match[1].trim());
            })
            .join('\n');
    }

    /**
     * Save plugin settings
     */
    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);

        // Update game service folder path if changed
        if (this.gameService) {
            this.gameService.setFolderPath(this.settings.games.folderPath);
        }
        if (this.animeService) {
            this.animeService.setFolderPath(this.settings.anime.folderPath);
        }
        if (this.movieService) {
            this.movieService.setFolderPath(this.settings.movies.folderPath);
        }
        if (this.seriesService) {
            this.seriesService.setFolderPath(this.settings.series.folderPath);
        }
        if (this.bookService) {
            this.bookService.setFolderPath(this.settings.books.folderPath);
        }
        if (this.mangaService) {
            this.mangaService.setFolderPath(this.settings.manga.folderPath);
        }

        // Update localization
        i18n.setLanguage(this.settings.language);

        // Apply accent color
        this.applyAccentColor();
        this.normalizeMediaType();
        this.applyParticles();
    }

    /**
     * Activate the library view
     */
    async activateView(): Promise<void> {
        const { workspace } = this.app;

        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_LIBRARY);

        if (leaves.length > 0) {
            // View already exists, use it
            leaf = leaves[0];
        } else {
            // Create new leaf in the main workspace
            leaf = workspace.getLeaf(true);
            if (leaf) {
                await leaf.setViewState({
                    type: VIEW_TYPE_LIBRARY,
                    active: true
                });
            }
        }

        if (leaf) {
            workspace.setActiveLeaf(leaf, { focus: true });
        }
    }

    /**
     * Show edit modal for a media item
     */
    showEditModal(item: MediaItem, onSave: () => void): void {
        if (item.type === 'anime') {
            const animeItem = item;
            const modal = new AnimeEditModal(
                this.app,
                animeItem,
                async (updates) => {
                    if (this.animeService) {
                        await this.animeService.updateAnime(animeItem, updates);
                        onSave();
                    }
                },
                () => {
                    this.showDeleteModal(animeItem, async () => {
                        if (!this.animeService) return;
                        await this.animeService.deleteAnime(animeItem);
                        onSave();
                    });
                },
                async () => {
                    if (!this.integrationService || !this.animeService) return;
                    const anime = animeItem;
                    if (!anime.integrationProvider || !anime.integrationId) {
                        new Notice(t('animePartsSourceMissing'));
                        return false;
                    }
                    new Notice(t('notifyLoading'), 1200);
                    const providerParts = await this.integrationService.fetchAnimePartsForItem(anime);
                    if (!providerParts?.length) {
                        new Notice(t('noticeNoResults'));
                        return false;
                    }
                    const review = await this.integrationService.reviewAnimePartsForItem(anime, providerParts);
                    if (!review) return false;
                    const activePart = review.parts.find((part) => part.id === review.activePartId) ?? review.parts[0] ?? null;
                    await this.animeService.updateAnime(anime, {
                        status: review.status,
                        parts: review.parts,
                        activePartId: review.activePartId,
                        seasonCurrent: activePart?.seasonNumber ?? null,
                        episodeCurrent: activePart?.episodeCurrent ?? null,
                        episodeTotal: activePart?.episodeTotal ?? null,
                    });
                    onSave();
                    return true;
                },
                this.collectRelatedMediaCandidates()
            );
            modal.open();
            return;
        }

        if (item.type === 'movie' || item.type === 'series') {
            const service = item.type === 'movie' ? this.movieService : this.seriesService;
            const modal = new VideoEditModal(
                this.app,
                item,
                async (updates) => {
                    if (!service) return;
                    await service.updateItem(item, updates);
                    onSave();
                },
                () => {
                    this.showDeleteModal(item, async () => {
                        if (!service) return;
                        await service.deleteItem(item);
                        onSave();
                    });
                },
                this.collectIncomingRelatedMedia(item.filePath),
                this.collectRelatedMediaCandidates()
            );
            modal.open();
            return;
        }

        if (item.type === 'book' || item.type === 'manga') {
            const service = item.type === 'book' ? this.bookService : this.mangaService;
            const readingItem = item as ReadingItem;
            const modal = new ReadingEditModal(
                this.app,
                readingItem,
                async (updates) => {
                    if (!service) return;
                    await service.updateItem(readingItem, updates);
                    onSave();
                },
                () => {
                    this.showDeleteModal(readingItem, async () => {
                        if (!service) return;
                        await service.deleteItem(readingItem);
                        onSave();
                    });
                }
            );
            modal.open();
            return;
        }

        const gameItem = item as GameItem;
        const seriesOptions = this.gameService?.getSeriesList() ?? [];
        const modal = new EditModal(
            this.app,
            gameItem,
            async (updates) => {
                if (this.gameService) {
                    await this.gameService.updateGame(gameItem, updates);
                    onSave();
                }
            },
            seriesOptions,
            () => {
                this.showDeleteModal(gameItem, async () => {
                    if (!this.gameService) return;
                    await this.gameService.deleteGame(gameItem);
                    onSave();
                });
            },
            this.settings.tagPresets.games
        );
        modal.open();
    }

    private collectRelatedMediaCandidates(): RelatedMediaLink[] {
        const folders: Array<{ type: RelatedMediaLink['type']; folderPath: string }> = [
            { type: 'anime', folderPath: this.settings.anime.folderPath },
            { type: 'movie', folderPath: this.settings.movies.folderPath },
            { type: 'series', folderPath: this.settings.series.folderPath },
            { type: 'book', folderPath: this.settings.books.folderPath },
            { type: 'manga', folderPath: this.settings.manga.folderPath },
        ];
        const candidates: RelatedMediaLink[] = [];
        const seen = new Set<string>();
        for (const file of this.app.vault.getMarkdownFiles()) {
            const mediaType = folders.find((entry) => this.isFileInFolder(file.path, entry.folderPath))?.type;
            if (!mediaType || seen.has(file.path)) continue;
            candidates.push({
                type: mediaType,
                path: file.path,
                title: this.getFileTitle(file),
                imageUrl: this.getFileImage(file),
            });
            seen.add(file.path);
        }
        return candidates.sort((left, right) => left.title.localeCompare(right.title));
    }

    private collectIncomingRelatedMedia(targetPath: string): RelatedMediaLink[] {
        const incoming: RelatedMediaLink[] = [];
        const seen = new Set<string>();
        const folders: Array<{ type: RelatedMediaLink['type']; folderPath: string }> = [
            { type: 'anime', folderPath: this.settings.anime.folderPath },
            { type: 'movie', folderPath: this.settings.movies.folderPath },
            { type: 'series', folderPath: this.settings.series.folderPath },
            { type: 'book', folderPath: this.settings.books.folderPath },
            { type: 'manga', folderPath: this.settings.manga.folderPath },
        ];
        for (const file of this.app.vault.getMarkdownFiles()) {
            const mediaType = folders.find((entry) => this.isFileInFolder(file.path, entry.folderPath))?.type;
            if (!mediaType) continue;
            const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
            const related = parseRelatedMedia(frontmatter?.related_media);
            if (!related.some((entry) => entry.path === targetPath)) continue;
            if (seen.has(file.path)) continue;
            incoming.push({
                type: mediaType,
                path: file.path,
                title: this.getFileTitle(file),
                imageUrl: this.getFileImage(file),
            });
            seen.add(file.path);
        }
        return incoming.sort((left, right) => left.title.localeCompare(right.title));
    }

    private getFileTitle(file: TFile): string {
        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
        const title = typeof frontmatter?.title === 'string' && frontmatter.title.trim()
            ? frontmatter.title.trim()
            : typeof frontmatter?.name === 'string' && frontmatter.name.trim()
                ? frontmatter.name.trim()
                : file.basename;
        return title || file.path;
    }

    private getFileImage(file: TFile): string {
        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
        const raw = frontmatter?.image ?? frontmatter?.poster ?? frontmatter?.image_b ?? frontmatter?.poster_b;
        return this.metadataService?.getImageUrl(raw, frontmatter?.cm_poster) ?? DEFAULT_COVER;
    }

    private isFileInFolder(filePath: string, folderPath: string): boolean {
        const normalizedFolder = folderPath.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
        const normalizedFile = filePath.replace(/\\/g, '/');
        if (!normalizedFolder) return true;
        return normalizedFile.startsWith(`${normalizedFolder}/`);
    }

    /**
     * Show statistics modal
     */
    showStatsModal(stats: GameStats | AnimeStats | VideoStats | ReadingStats, mediaType: MediaType): void {
        const modal = new StatsModal(this.app, stats, mediaType);
        modal.open();
    }

    /**
     * Show delete confirmation modal
     */
    showDeleteModal(game: MediaItem, onConfirm: () => Promise<void>): void {
        const modal = new DeleteModal(this.app, game, onConfirm);
        modal.open();
    }

    addMediaItem(mediaType: MediaType): void {
        if (mediaType === 'anime') {
            void this.integrationService?.addAnime();
            return;
        }
        if (mediaType === 'movie') {
            void this.integrationService?.addMovie();
            return;
        }
        if (mediaType === 'series') {
            void this.integrationService?.addSeries();
            return;
        }
        if (mediaType === 'book') {
            void this.integrationService?.addBook();
            return;
        }
        if (mediaType === 'manga') {
            void this.integrationService?.addManga();
            return;
        }
        void this.integrationService?.addGame();
    }

    /**
     * Get the game service instance
     */
    getGameService(): GameService | null {
        return this.gameService;
    }

    getAnimeService(): AnimeService | null {
        return this.animeService;
    }

    getMetadataService(): MetadataService | null {
        return this.metadataService;
    }

    getMovieService(): VideoService | null {
        return this.movieService;
    }

    getSeriesService(): VideoService | null {
        return this.seriesService;
    }

    getBookService(): ReadingService | null {
        return this.bookService;
    }

    getMangaService(): ReadingService | null {
        return this.mangaService;
    }

    getSteamSyncService(): SteamSyncService | null {
        return this.steamSyncService;
    }

    getMediaType(): MediaType {
        this.normalizeMediaType();
        return this.mediaType;
    }

    /**
     * Apply accent color to CSS variables
     */
    private applyAccentColor(): void {
        activeDocument.documentElement.style.setProperty('--lorebase-accent', this.settings.accentColor);
    }

    private applyParticles(): void {
        if (!this.particleService) {
            this.particleService = new ParticleService();
        }
        this.particleService.apply(this.settings.particleEffect, this.settings.particleIntensity);
    }

    private getEnabledMedia(): MediaType[] {
        const enabled: MediaType[] = [];
        if (this.settings.enabledMedia?.games) enabled.push('game');
        if (this.settings.enabledMedia?.anime) enabled.push('anime');
        if (this.settings.enabledMedia?.movies) enabled.push('movie');
        if (this.settings.enabledMedia?.series) enabled.push('series');
        if (this.settings.enabledMedia?.books) enabled.push('book');
        if (this.settings.enabledMedia?.manga) enabled.push('manga');
        return enabled;
    }

    private normalizeMediaType(): void {
        const enabled = this.getEnabledMedia();
        if (enabled.length === 0) {
            this.settings.enabledMedia = { games: true, anime: false, movies: false, series: false, books: false, manga: false };
            this.mediaType = 'game';
            return;
        }
        if (!enabled.includes(this.mediaType)) {
            this.mediaType = enabled[0];
        }
    }

    /**
     * Refresh all library views
     */
    refreshViews(): void {
        this.app.workspace.getLeavesOfType(VIEW_TYPE_LIBRARY).forEach(leaf => {
            if (leaf.view instanceof LibraryView) {
                void leaf.view.refresh();
            }
        });
    }

    /**
     * Lightweight refresh used by live settings preview updates.
     * Avoids full data reload from vault and updates only rendered card visuals.
     */
    refreshViewsVisuals(): void {
        this.app.workspace.getLeavesOfType(VIEW_TYPE_LIBRARY).forEach(leaf => {
            if (leaf.view instanceof LibraryView) {
                leaf.view.refreshCardVisuals();
            }
        });
    }

    async runSteamSync(): Promise<void> {
        if (!this.steamSyncService) return;

        try {
            new Notice('Steam Sync: loading Steam games...');
            const candidates = await this.steamSyncService.previewImport(this.settings);
            for (const warning of this.steamSyncService.consumeWarnings()) {
                new Notice(`Steam Sync: ${warning}`, 6000);
            }
            if (!candidates.length) {
                new Notice('Steam Sync: no games found.');
                return;
            }

            const selectedAppIds = await new SteamSyncReviewModal(this.app, candidates, this.settings.language).openAndGetValue();
            if (!selectedAppIds || selectedAppIds.size === 0) {
                new Notice('Steam Sync: import cancelled.');
                return;
            }

            new Notice(`Steam Sync: importing ${selectedAppIds.size} selected games...`);
            const result = await this.steamSyncService.sync(this.settings, {
                onProgress: (message) => new Notice(`Steam Sync: ${message}`, 1200),
                selectedAppIds,
            });
            this.gameService?.invalidateCache();
            this.refreshViews();
            new Notice(`Steam Sync complete: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.failed} failed.`);
        } catch (error) {
            console.error('[Steam Sync] Sync failed:', error);
            const message = error instanceof Error ? `: ${error.message}` : '';
            new Notice(`Steam Sync failed${message}`);
        }
    }

    private async runSteamPlaytimeSync(): Promise<void> {
        if (!this.steamSyncService) return;

        try {
            const result = await this.steamSyncService.syncPlaytimeForExisting(this.settings);
            if (result.updated > 0) {
                this.gameService?.invalidateCache();
                this.refreshViews();
                new Notice(`Steam playtime updated for ${result.updated} games.`, 2500);
            }
        } catch (error) {
            console.warn('[Steam Sync] Playtime auto-sync failed:', error);
        }
    }

    /**
     * Show library type selection menu
     */
    showLibraryMenu(evt: MouseEvent): void {
        const enabled = this.getEnabledMedia();
        if (enabled.length <= 1) {
            const nextType = enabled[0] ?? 'game';
            const changed = this.mediaType !== nextType;
            this.mediaType = nextType;
            void this.activateView();
            if (changed) {
                this.refreshViews();
            }
            return;
        }

        const menu = new Menu();

        const options: Array<{ type: MediaType; enabled: boolean; label: string; icon: string }> = [
            { type: 'game', enabled: this.settings.enabledMedia.games, label: t('contextGames'), icon: 'gamepad-2' },
            { type: 'anime', enabled: this.settings.enabledMedia.anime, label: t('contextAnime'), icon: 'clapperboard' },
            { type: 'movie', enabled: this.settings.enabledMedia.movies, label: t('settingsMovies'), icon: 'film' },
            { type: 'series', enabled: this.settings.enabledMedia.series, label: t('settingsSeries'), icon: 'tv' },
            { type: 'book', enabled: this.settings.enabledMedia.books, label: t('settingsBooks'), icon: 'book-open' },
            { type: 'manga', enabled: this.settings.enabledMedia.manga, label: t('settingsManga'), icon: 'book-open-text' },
        ];

        for (const option of options) {
            if (!option.enabled) continue;
            menu.addItem((item) => {
                const isSelected = this.mediaType === option.type;
                if (isSelected) {
                    const titleEl = activeDocument.createDocumentFragment();
                    const span = titleEl.createEl('span');
                    span.setText(option.label);
                    span.addClass('lorebase-menu-selected-title');
                    item.setTitle(titleEl);
                } else {
                    item.setTitle(option.label);
                }

                item.setIcon(option.icon)
                    .onClick(() => {
                        const changed = this.mediaType !== option.type;
                        if (!changed) return;
                        this.mediaType = option.type;
                        void this.activateView();
                        this.refreshViews();
                    });
            });
        }

        const element = evt.currentTarget;
        if (!(element instanceof HTMLElement)) return;
        const rect = element.getBoundingClientRect();
        menu.showAtPosition({ x: rect.right, y: rect.top });
    }
}
