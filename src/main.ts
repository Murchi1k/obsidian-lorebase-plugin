/**
 * LOREBASE - Main Plugin Entry Point
 * v3.0.1
 */

import { Plugin, WorkspaceLeaf, Menu, Notice, addIcon, TFile, type Command } from 'obsidian';
import { CommunityRating, GameDlc, LorebaseSettings, MediaItem, GameStats, AnimeStats, MediaType, RelatedMediaLink, IntegrationTemplateSettings } from './types';
import { DEFAULT_SETTINGS, VIEW_TYPE_LIBRARY, LOREBASE_ICON_ID, LOREBASE_ICON_SVG, DEFAULT_COVER, PARTICLE_INTENSITY_MAX, PARTICLE_INTENSITY_MIN } from './constants';
import { i18n, t, type TranslationKey } from './localization';
import { normalizeRatingScale, ratingScale } from './utils/ratingScale';
import { LibraryView } from './views/LibraryView';
import { LorebaseSettingTab } from './settings/SettingsTab';
import { EditModal } from './modals/EditModal';
import { AnimeEditModal } from './modals/AnimeEditModal';
import { VideoEditModal } from './modals/VideoEditModal';
import { ReadingEditModal } from './modals/ReadingEditModal';
import { StatsModal } from './modals/StatsModal';
import { DeleteModal } from './modals/DeleteModal';
import { SteamSyncReviewModal } from './modals/SteamSyncReviewModal';
import { SteamSyncProgressModal } from './modals/SteamSyncProgressModal';
import { NoteImportReviewModal } from './modals/NoteImportReviewModal';
import { GameService } from './services/GameService';
import { AnimeService } from './services/AnimeService';
import { VideoService } from './services/VideoService';
import { ReadingService } from './services/ReadingService';
import { ParticleService } from './services/ParticleService';
import { IntegrationService } from './services/IntegrationService';
import { SteamSyncService } from './services/SteamSyncService';
import { MetadataService } from './services/MetadataService';
import { NoteConversionService } from './services/NoteConversionService';
import {
    mergeOverlayLayout,
    mergeOverlayVisibility,
    migrateLegacyJikanMangaSettings,
    normalizeDescriptionLines,
    normalizeLibraryViewSettings,
    normalizeNoteImportSettings,
    normalizeTagPresets,
    parseBadges,
} from './settings/settingsNormalization';
import { parseRelatedMedia } from './services/media/parsers';
import type { MediaKind, MediaSourceSelection } from './services/integrations/types';
import { buildSimpleTemplate, getDefaultTemplateFields, getEffectiveSimpleTemplateFields } from './services/integrations/templateUtils';
import { mediaTypeToKind, synchronizeProviderMetadata } from './services/integrations/enrichment';

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
    private steamSyncRunning = false;
    private metadataService: MetadataService | null = null;
    private noteConversionService: NoteConversionService | null = null;
    private readonly localizedCommands: Array<{ command: Command; key: TranslationKey }> = [];

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
        this.noteConversionService = new NoteConversionService(this.app);
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
        this.addLocalizedCommand('commandOpenLibrary', {
            id: 'open-library',
            callback: () => {
                void this.activateView();
            }
        });

        this.registerOpenLibraryCommands();

        this.addLocalizedCommand('commandAddGame', {
            id: 'add-game',
            callback: () => {
                void this.integrationService?.addGame();
            }
        });

        this.addLocalizedCommand('commandAddAnime', {
            id: 'add-anime',
            callback: () => {
                void this.integrationService?.addAnime();
            }
        });

        this.addLocalizedCommand('commandAddMovie', {
            id: 'add-movie',
            callback: () => {
                void this.integrationService?.addMovie();
            }
        });

        this.addLocalizedCommand('commandAddSeries', {
            id: 'add-series',
            callback: () => {
                void this.integrationService?.addSeries();
            }
        });

        this.addLocalizedCommand('commandAddBook', {
            id: 'add-book',
            callback: () => {
                void this.integrationService?.addBook();
            }
        });

        this.addLocalizedCommand('commandAddManga', {
            id: 'add-manga',
            callback: () => {
                void this.integrationService?.addManga();
            }
        });

        this.addLocalizedCommand('commandSteamSync', {
            id: 'steam-sync',
            callback: () => {
                void this.runSteamSync();
            }
        });

        this.addLocalizedCommand('commandImportNotes', {
            id: 'import-existing-notes',
            callback: () => {
                void this.runNoteImport();
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
        this.noteConversionService = null;
    }

    /**
     * Load plugin settings
     */
    async loadSettings(): Promise<void> {
        const loaded: unknown = await this.loadData();
        const sanitized = this.isSettingsRecord(loaded) ? { ...loaded } : {};
        this.settings = Object.assign({}, DEFAULT_SETTINGS, sanitized);
        const particleIntensity = Number(sanitized.particleIntensity);
        this.settings.particleIntensity = Number.isFinite(particleIntensity)
            ? Math.min(PARTICLE_INTENSITY_MAX, Math.max(PARTICLE_INTENSITY_MIN, Math.round(particleIntensity)))
            : DEFAULT_SETTINGS.particleIntensity;
        this.settings.ratingScale = normalizeRatingScale(Number(sanitized.ratingScale));
        this.settings.settingsLayoutMode = sanitized.settingsLayoutMode === 'accordion'
            ? 'accordion'
            : 'tabs';
        this.settings.completionDateBadgeFormat = sanitized.completionDateBadgeFormat === 'full'
            ? 'full'
            : 'short';
        const completionDateFallback = this.settings.completionDateBadgeFormat;
        const normalizeCompletionDateBadgeFormat = (value: unknown): 'short' | 'full' => (
            value === 'full' || value === 'short' ? value : completionDateFallback
        );
        this.settings.completionDateBadgeFormats = {
            games: normalizeCompletionDateBadgeFormat(sanitized?.completionDateBadgeFormats?.games),
            anime: normalizeCompletionDateBadgeFormat(sanitized?.completionDateBadgeFormats?.anime),
            movies: normalizeCompletionDateBadgeFormat(sanitized?.completionDateBadgeFormats?.movies),
            series: normalizeCompletionDateBadgeFormat(sanitized?.completionDateBadgeFormats?.series),
            books: normalizeCompletionDateBadgeFormat(sanitized?.completionDateBadgeFormats?.books),
            manga: normalizeCompletionDateBadgeFormat(sanitized?.completionDateBadgeFormats?.manga),
        };
        i18n.setLanguage(this.settings.language);
        ratingScale.set(this.settings.ratingScale);

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
        for (const key of ['games', 'anime', 'movies', 'series', 'books', 'manga'] as const) {
            const normalizedView = normalizeLibraryViewSettings(sanitized?.[key], DEFAULT_SETTINGS[key].viewState);
            this.settings[key] = Object.assign({}, this.settings[key]);
            Object.assign(this.settings[key], normalizedView);
            this.settings[key].sortField = normalizedView.viewState.sort.field;
            this.settings[key].sortOrder = normalizedView.viewState.sort.order;
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
        const watchCompletedLabel = t('statusCompleted').trim().toLowerCase();
        for (const labels of [this.settings.statusLabels.books, this.settings.statusLabels.manga]) {
            if (labels.completed?.trim().toLowerCase() === watchCompletedLabel) {
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
        this.settings.noteImport = normalizeNoteImportSettings(sanitized?.noteImport);

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
            } else if (!['anilist', 'jikan', 'shikimori'].includes(animeProvider)) {
                integrations.media.anime.provider = 'anilist';
            }
            const booksProvider = String(integrations.media?.books?.provider ?? '');
            if (!['hardcover', 'googlebooks'].includes(booksProvider)) {
                integrations.media.books.provider = 'hardcover';
            }
            const mangaProvider = String(integrations.media?.manga?.provider ?? '');
            if (mangaProvider !== 'jikan' && !['anilist', 'shikimori', 'mangaupdates', 'mangadex'].includes(mangaProvider)) {
                integrations.media.manga.provider = 'anilist';
            }
        }

        const settingsMigrated = migrateLegacyJikanMangaSettings(this.settings, sanitized.integrations);
        const templatesMigrated = this.migrateIntegrationTemplates();
        const gameFiltersMigrated = this.migrateGameDefaultVisibilityFilters();
        if (templatesMigrated || settingsMigrated || gameFiltersMigrated) {
            await this.saveData(this.settings);
        }
    }

    private isSettingsRecord(value: unknown): value is Partial<LorebaseSettings> {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    }

    private migrateGameDefaultVisibilityFilters(): boolean {
        if (this.settings.migrations?.gameDefaultVisibilityFilters) return false;

        if (this.settings.games.activeSavedViewId === null && this.settings.games.viewState.rules.length === 0) {
            this.settings.games.viewState.rules = DEFAULT_SETTINGS.games.viewState.rules.map((rule) => ({
                ...rule,
                value: Array.isArray(rule.value) ? [...rule.value] : rule.value,
            }));
        }
        if (this.settings.migrations) {
            this.settings.migrations.gameDefaultVisibilityFilters = true;
        }
        return true;
    }

    private migrateIntegrationTemplates(): boolean {
        const media = this.settings.integrations?.media;
        if (!media) return false;

        let changed = false;
        const stripTemplateFields = (fields: string[] | undefined, removed: string[]): string[] | undefined => {
            if (!fields) return fields;
            const next = fields.filter((field) => !removed.includes(field));
            return next.length === fields.length ? fields : next;
        };
        const stripMediaTemplateFields = (mediaSettings: { template?: string; templateFields?: string[] } | undefined, removed: string[]): void => {
            if (!mediaSettings) return;
            if (mediaSettings.template) {
                const nextTemplate = this.removeTemplateFields(mediaSettings.template, removed);
                if (nextTemplate !== mediaSettings.template) {
                    mediaSettings.template = nextTemplate;
                    changed = true;
                }
            }
            const nextFields = stripTemplateFields(mediaSettings.templateFields, removed);
            if (nextFields !== mediaSettings.templateFields) {
                mediaSettings.templateFields = nextFields;
                changed = true;
            }
        };
        const arraysEqual = (left: string[] | undefined, right: string[]): boolean => {
            if (!left || left.length !== right.length) return false;
            return left.every((value, index) => value === right[index]);
        };
        const syncSimpleTemplate = (
            kind: MediaKind,
            mediaSettings: IntegrationTemplateSettings | undefined,
            howLongToBeatEnabled = false
        ): void => {
            if (!mediaSettings || mediaSettings.templateMode === 'advanced') return;
            const selected = Array.isArray(mediaSettings.templateFields)
                ? mediaSettings.templateFields
                : getDefaultTemplateFields(kind);
            const nextFields = getEffectiveSimpleTemplateFields(kind, selected, { howLongToBeatEnabled });
            const nextTemplate = buildSimpleTemplate(kind, nextFields);
            if (!arraysEqual(mediaSettings.templateFields, nextFields)) {
                mediaSettings.templateFields = nextFields;
                changed = true;
            }
            if (mediaSettings.template !== nextTemplate) {
                mediaSettings.template = nextTemplate;
                changed = true;
            }
        };

        stripMediaTemplateFields(media.games, ['rating']);
        stripMediaTemplateFields(media.anime, ['scoreImdb']);

        if (!this.settings.migrations?.templateTypeField) {
            for (const mediaSettings of [media.anime, media.movies, media.series, media.books, media.manga]) {
                if (mediaSettings?.templateMode === 'advanced') continue;
                const fields = Array.isArray(mediaSettings?.templateFields)
                    ? mediaSettings.templateFields
                    : [];
                if (!fields.includes('type')) {
                    mediaSettings.templateFields = ['type', ...fields];
                    changed = true;
                }
            }
            if (this.settings.migrations) {
                this.settings.migrations.templateTypeField = true;
                changed = true;
            }
        }
        if (!this.settings.migrations?.gameTemplateTypeField) {
            if (media.games?.templateMode !== 'advanced') {
                const fields = Array.isArray(media.games?.templateFields)
                    ? media.games.templateFields
                    : [];
                if (!fields.includes('type')) {
                    media.games.templateFields = ['type', ...fields];
                    changed = true;
                }
            }
            if (this.settings.migrations) {
                this.settings.migrations.gameTemplateTypeField = true;
                changed = true;
            }
        }
        if (!this.settings.migrations?.mangaTemplateAdultField) {
            if (media.manga?.templateMode !== 'advanced') {
                const fields = Array.isArray(media.manga?.templateFields)
                    ? media.manga.templateFields
                    : [];
                if (!fields.includes('adult')) {
                    const favoriteIndex = fields.indexOf('favorite');
                    const insertAt = favoriteIndex >= 0 ? favoriteIndex + 1 : fields.length;
                    media.manga.templateFields = [
                        ...fields.slice(0, insertAt),
                        'adult',
                        ...fields.slice(insertAt),
                    ];
                    changed = true;
                }
            }
            if (this.settings.migrations) {
                this.settings.migrations.mangaTemplateAdultField = true;
                changed = true;
            }
        }

        syncSimpleTemplate('games', media.games, Boolean(media.games?.howLongToBeatEnabled));
        syncSimpleTemplate('anime', media.anime);
        syncSimpleTemplate('movies', media.movies);
        syncSimpleTemplate('series', media.series);
        syncSimpleTemplate('books', media.books);
        syncSimpleTemplate('manga', media.manga);

        return changed;
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
        ratingScale.set(this.settings.ratingScale);
        this.refreshLocalizedCommandNames();

        // Apply accent color
        this.applyAccentColor();
        this.normalizeMediaType();
        this.applyParticles();
    }

    /**
     * Activate the library view
     */
    async activateView(mediaType?: MediaType): Promise<void> {
        if (mediaType) {
            this.mediaType = mediaType;
        }

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

    private registerOpenLibraryCommands(): void {
        const commands: Array<{ type: MediaType; id: string; key: TranslationKey }> = [
            { type: 'game', id: 'open-games-library', key: 'commandOpenGamesLibrary' },
            { type: 'anime', id: 'open-anime-library', key: 'commandOpenAnimeLibrary' },
            { type: 'movie', id: 'open-movies-library', key: 'commandOpenMoviesLibrary' },
            { type: 'series', id: 'open-series-library', key: 'commandOpenSeriesLibrary' },
            { type: 'book', id: 'open-books-library', key: 'commandOpenBooksLibrary' },
            { type: 'manga', id: 'open-manga-library', key: 'commandOpenMangaLibrary' },
        ];

        for (const command of commands) {
            this.addLocalizedCommand(command.key, {
                id: command.id,
                checkCallback: (checking) => {
                    if (!this.isMediaTypeEnabled(command.type)) return false;
                    if (!checking) {
                        void this.openLibrary(command.type);
                    }
                    return true;
                },
            });
        }
    }

    private addLocalizedCommand(key: TranslationKey, command: Omit<Command, 'name'>): Command {
        const registeredCommand = this.addCommand({ ...command, name: t(key) });
        this.localizedCommands.push({ command: registeredCommand, key });
        return registeredCommand;
    }

    private refreshLocalizedCommandNames(): void {
        for (const { command, key } of this.localizedCommands) {
            command.name = `${this.manifest.name}: ${t(key)}`;
        }
    }

    private async openLibrary(mediaType: MediaType): Promise<void> {
        if (!this.isMediaTypeEnabled(mediaType)) return;

        const changed = this.mediaType !== mediaType;
        await this.activateView(mediaType);
        if (changed) {
            this.refreshViews();
        }
    }

    /**
     * Show edit modal for a media item
     */
    showEditModal(item: MediaItem, onSave: () => void, onBeforeSave?: () => void): void {
        if (item.type === 'anime') {
            const animeItem = item;
            const modal: AnimeEditModal = new AnimeEditModal(
                this.app,
                animeItem,
                async (updates) => {
                    if (this.animeService) {
                        onBeforeSave?.();
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
                        integrationProvider: anime.integrationProvider,
                        integrationId: anime.integrationId,
                        parts: review.parts,
                        activePartId: review.activePartId,
                        seasonCurrent: activePart?.seasonNumber ?? null,
                        episodeCurrent: activePart?.episodeCurrent ?? null,
                        episodeTotal: activePart?.episodeTotal ?? null,
                    });
                    anime.status = review.status;
                    anime.parts = review.parts;
                    anime.activePartId = review.activePartId;
                    anime.seasonCurrent = activePart?.seasonNumber ?? null;
                    anime.episodeCurrent = activePart?.episodeCurrent ?? null;
                    anime.episodeTotal = activePart?.episodeTotal ?? null;
                    onSave();
                    return review;
                },
                () => this.refreshCommunityRatingForItem(animeItem, onSave),
                this.collectRelatedMediaCandidates(),
                (): Promise<boolean> => this.enrichMediaItemFromEditor(
                    animeItem,
                    false,
                    onSave,
                    () => modal.saveBeforeSourceRefresh()
                ),
                (): Promise<boolean> => this.enrichMediaItemFromEditor(
                    animeItem,
                    true,
                    onSave,
                    () => modal.saveBeforeSourceRefresh()
                )
            );
            modal.open();
            return;
        }

        if (item.type === 'movie' || item.type === 'series') {
            const service = item.type === 'movie' ? this.movieService : this.seriesService;
            const modal: VideoEditModal = new VideoEditModal(
                this.app,
                item,
                async (updates) => {
                    if (!service) return;
                    onBeforeSave?.();
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
                () => this.refreshCommunityRatingForItem(item, onSave),
                this.collectIncomingRelatedMedia(item.filePath),
                this.collectRelatedMediaCandidates(),
                (): Promise<boolean> => this.enrichMediaItemFromEditor(
                    item,
                    false,
                    onSave,
                    () => modal.saveBeforeSourceRefresh()
                ),
                (): Promise<boolean> => this.enrichMediaItemFromEditor(
                    item,
                    true,
                    onSave,
                    () => modal.saveBeforeSourceRefresh()
                )
            );
            modal.open();
            return;
        }

        if (item.type === 'book' || item.type === 'manga') {
            const service = item.type === 'book' ? this.bookService : this.mangaService;
            const readingItem = item;
            const modal: ReadingEditModal = new ReadingEditModal(
                this.app,
                readingItem,
                async (updates) => {
                    if (!service) return;
                    onBeforeSave?.();
                    await service.updateItem(readingItem, updates);
                    onSave();
                },
                () => {
                    this.showDeleteModal(readingItem, async () => {
                        if (!service) return;
                        await service.deleteItem(readingItem);
                        onSave();
                    });
                },
                readingItem.type === 'book'
                    ? undefined
                    : () => this.refreshCommunityRatingForItem(readingItem, onSave),
                this.collectRelatedMediaCandidates(),
                this.collectIncomingRelatedMedia(readingItem.filePath),
                (): Promise<boolean> => this.enrichMediaItemFromEditor(
                    readingItem,
                    false,
                    onSave,
                    () => modal.saveBeforeSourceRefresh()
                ),
                (): Promise<boolean> => this.enrichMediaItemFromEditor(
                    readingItem,
                    true,
                    onSave,
                    () => modal.saveBeforeSourceRefresh()
                )
            );
            modal.open();
            return;
        }

        const gameItem = item;
        const seriesOptions = this.gameService?.getSeriesList() ?? [];
        const modal: EditModal = new EditModal(
            this.app,
            gameItem,
            async (updates) => {
                if (this.gameService) {
                    onBeforeSave?.();
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
            this.settings.tagPresets.games,
            () => this.refreshCommunityRatingForItem(gameItem, onSave),
            (existingDlc) => this.refreshGameDlcForItem(gameItem, existingDlc, onSave),
            this.collectRelatedMediaCandidates(),
            this.collectIncomingRelatedMedia(gameItem.filePath),
            (): Promise<boolean> => this.enrichMediaItemFromEditor(
                gameItem,
                false,
                onSave,
                () => modal.saveBeforeSourceRefresh()
            ),
            (): Promise<boolean> => this.enrichMediaItemFromEditor(
                gameItem,
                true,
                onSave,
                () => modal.saveBeforeSourceRefresh()
            )
        );
        modal.open();
    }

    async enrichMediaItem(item: MediaItem, relink = false, onSave?: () => void): Promise<boolean> {
        if (!this.integrationService || !this.metadataService) return false;
        const kind = mediaTypeToKind(item.type);
        if (!kind) return false;

        try {
            const file = this.app.vault.getAbstractFileByPath(item.filePath);
            if (!(file instanceof TFile)) return false;
            const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
            const current = frontmatter && typeof frontmatter === 'object'
                ? { ...frontmatter } as Record<string, unknown>
                : {};
            delete current.position;
            const searchTitle = this.getMediaSearchTitle(item, current);

            let source: MediaSourceSelection | null = null;
            const provider = typeof item.integrationProvider === 'string'
                ? item.integrationProvider
                : null;
            const id = item.integrationId ? String(item.integrationId).trim() : '';
            if (!relink && provider && id) {
                source = {
                    provider,
                    id,
                    title: searchTitle,
                    year: item.year ? String(item.year) : undefined,
                    image: item.imageUrl || undefined,
                };
            } else {
                source = await this.integrationService.selectMediaSource(
                    kind,
                    searchTitle,
                    provider ?? undefined
                );
            }
            if (!source) return false;

            new Notice(t('notifyLoading'), 1200);
            const enrichment = await this.integrationService.getMediaEnrichment(kind, source);
            if (!enrichment) {
                new Notice(t('noticeSourceFailed'));
                return false;
            }
            const incoming = { ...enrichment.values };
            if (current.cm_poster) {
                delete incoming.poster;
                delete incoming.poster_b;
            }
            const merged = synchronizeProviderMetadata(current, incoming, source);
            this.repairGeneratedSteamPoster(current, incoming, source, merged);
            await this.metadataService.updateMetadata(file, merged.patch);

            const mergedSourceUrl = [merged.values.url, merged.values.source_url]
                .find((value): value is string => typeof value === 'string' && value.trim().length > 0);

            Object.assign(item, {
                integrationProvider: source.provider,
                integrationId: source.id,
                sourceUrl: mergedSourceUrl?.trim() ?? item.sourceUrl ?? null,
            });
            this.invalidateAllServiceCaches();
            this.refreshViews();
            onSave?.();

            const metadataFields = merged.filledFields.filter((field) => (
                field !== 'integration_provider' && field !== 'integration_id'
            ));
            new Notice(metadataFields.length ? t('noticeSourceUpdated') : t('noticeSourceNoChanges'));
            return true;
        } catch (error) {
            console.error('[LOREBASE Enrichment] Failed to enrich media item:', error);
            new Notice(t('noticeSourceFailed'));
            return false;
        }
    }

    private repairGeneratedSteamPoster(
        current: Record<string, unknown>,
        incoming: Record<string, unknown>,
        source: MediaSourceSelection,
        merged: { values: Record<string, unknown>; patch: Record<string, unknown>; filledFields: string[] }
    ): void {
        if (source.provider !== 'steam' || current.cm_poster) return;
        const incomingPoster = typeof incoming.poster === 'string' ? incoming.poster.trim() : '';
        if (!incomingPoster) return;

        const aliases = ['poster', 'image', 'cover', 'thumbnail'];
        const currentKey = Object.keys(current).find((key) => (
            aliases.some((alias) => alias.toLowerCase() === key.toLowerCase())
        ));
        if (!currentKey) return;
        const currentPoster = typeof current[currentKey] === 'string' ? current[currentKey].trim() : '';
        if (!currentPoster || currentPoster === incomingPoster) return;

        // Older Steam imports could persist a guessed, missing portrait URL or
        // a landscape banner in the portrait field. These are provider-owned
        // assets, so replacing them with the newly resolved portrait is safe;
        // cm_poster and unrelated custom URLs remain untouched.
        const isGeneratedSteamArtwork = /(?:steamstatic|akamaihd)\.com\/.*\/steam\/apps\/\d+\/.*(?:library_600x900|header|capsule_616x353)/i
            .test(currentPoster);
        if (!isGeneratedSteamArtwork) return;

        merged.values[currentKey] = incomingPoster;
        merged.patch[currentKey] = incomingPoster;
        if (!merged.filledFields.includes(currentKey)) merged.filledFields.push(currentKey);
    }

    private async enrichMediaItemFromEditor(
        item: MediaItem,
        relink: boolean,
        onSave: (() => void) | undefined,
        saveEditor: () => Promise<boolean>
    ): Promise<boolean> {
        const saved = await saveEditor();
        if (!saved) return false;
        return this.enrichMediaItem(item, relink, onSave);
    }

    private getMediaSearchTitle(item: MediaItem, frontmatter: Record<string, unknown>): string {
        const nameMapping = this.settings.noteImport.fieldMappings.find((mapping) => (
            mapping.key.trim().toLowerCase() === 'name'
        ));
        const aliases = [
            'name',
            'Name',
            'title',
            'Title',
            ...(nameMapping?.aliases ?? []),
        ];
        const entries = Object.entries(frontmatter);
        for (const alias of aliases) {
            const found = entries.find(([key]) => key.toLowerCase() === alias.toLowerCase());
            if (!found) continue;
            const value = found[1];
            if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
        }
        return item.displayName;
    }

    private async refreshCommunityRatingForItem(item: MediaItem, onSave: () => void): Promise<CommunityRating | null> {
        if (!this.integrationService) return null;
        const rating = await this.integrationService.fetchCommunityRatingForItem(item);
        if (!rating || !Number.isFinite(rating.rating)) return null;

        const updates = {
            communityRating: rating.rating,
            communityVotes: rating.votes,
            communityRatingProvider: rating.provider,
        };

        item.communityRating = rating.rating;
        item.communityVotes = rating.votes;
        item.communityRatingProvider = rating.provider;

        if (item.type === 'anime') {
            await this.animeService?.updateAnime(item, updates);
        } else if (item.type === 'movie') {
            await this.movieService?.updateItem(item, updates);
        } else if (item.type === 'series') {
            await this.seriesService?.updateItem(item, updates);
        } else if (item.type === 'book') {
            await this.bookService?.updateItem(item, updates);
        } else if (item.type === 'manga') {
            await this.mangaService?.updateItem(item, updates);
        } else {
            await this.gameService?.updateGame(item, updates);
        }

        onSave();
        return rating;
    }

    private async refreshGameDlcForItem(item: MediaItem, existingDlc: GameDlc[], onSave: () => void): Promise<GameDlc[] | null> {
        if (item.type !== 'game' || !this.integrationService || !this.gameService) return null;
        const fetched = await this.integrationService.fetchGameDlcForItem(item);
        if (!fetched) return null;

        const ratingKey = (entry: GameDlc): string => `${entry.provider}:${entry.id}`;
        const ratings = new Map(existingDlc.map((entry) => [ratingKey(entry), entry.userRating ?? null]));
        const currentRatings = new Map((item.dlc ?? []).map((entry) => [ratingKey(entry), entry.userRating ?? null]));
        const merged = fetched.map((entry) => ({
            ...entry,
            userRating: ratings.get(ratingKey(entry)) ?? currentRatings.get(ratingKey(entry)) ?? entry.userRating ?? null,
        }));

        item.dlc = merged;
        await this.gameService.updateGame(item, { dlc: merged });
        onSave();
        return merged;
    }

    private collectRelatedMediaCandidates(): RelatedMediaLink[] {
        const folders: Array<{ type: RelatedMediaLink['type']; folderPath: string }> = [
            { type: 'game', folderPath: this.settings.games.folderPath },
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
            { type: 'game', folderPath: this.settings.games.folderPath },
            { type: 'anime', folderPath: this.settings.anime.folderPath },
            { type: 'movie', folderPath: this.settings.movies.folderPath },
            { type: 'series', folderPath: this.settings.series.folderPath },
            { type: 'book', folderPath: this.settings.books.folderPath },
            { type: 'manga', folderPath: this.settings.manga.folderPath },
        ];
        for (const file of this.app.vault.getMarkdownFiles()) {
            const mediaType = folders.find((entry) => this.isFileInFolder(file.path, entry.folderPath))?.type;
            if (!mediaType) continue;
            const related = parseRelatedMedia(this.getFrontmatterValue(file, 'related_media'));
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
        const rawTitle = this.getFrontmatterValue(file, 'title');
        const rawName = this.getFrontmatterValue(file, 'name');
        const title = typeof rawTitle === 'string' && rawTitle.trim()
            ? rawTitle.trim()
            : typeof rawName === 'string' && rawName.trim()
                ? rawName.trim()
                : file.basename;
        return title || file.path;
    }

    private getFileImage(file: TFile): string {
        const raw = this.getFrontmatterValue(file, 'image')
            ?? this.getFrontmatterValue(file, 'poster')
            ?? this.getFrontmatterValue(file, 'image_b')
            ?? this.getFrontmatterValue(file, 'poster_b');
        return this.metadataService?.getImageUrl(raw, this.getFrontmatterValue(file, 'cm_poster')) ?? DEFAULT_COVER;
    }

    private getFrontmatterValue(file: TFile, key: string): unknown {
        const frontmatter: unknown = this.app.metadataCache.getFileCache(file)?.frontmatter;
        if (!frontmatter || typeof frontmatter !== 'object') return undefined;
        return (frontmatter as Record<string, unknown>)[key];
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
    showStatsModal(stats: GameStats | AnimeStats, mediaType: MediaType): void {
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

    getEnabledMediaTypes(): MediaType[] {
        return [...this.getEnabledMedia()];
    }

    async switchMediaType(mediaType: MediaType): Promise<void> {
        await this.openLibrary(mediaType);
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

    private isMediaTypeEnabled(mediaType: MediaType): boolean {
        if (mediaType === 'game') return Boolean(this.settings.enabledMedia?.games);
        if (mediaType === 'anime') return Boolean(this.settings.enabledMedia?.anime);
        if (mediaType === 'movie') return Boolean(this.settings.enabledMedia?.movies);
        if (mediaType === 'series') return Boolean(this.settings.enabledMedia?.series);
        if (mediaType === 'book') return Boolean(this.settings.enabledMedia?.books);
        return Boolean(this.settings.enabledMedia?.manga);
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
        if (this.steamSyncRunning) {
            new Notice('Steam Sync is already running.');
            return;
        }
        this.steamSyncRunning = true;

        let progressModal: SteamSyncProgressModal | null = null;
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

            const selectedCandidates = candidates.filter((candidate) => selectedAppIds.has(candidate.appId));
            progressModal = new SteamSyncProgressModal(this.app, selectedCandidates, this.settings.language);
            progressModal.open();

            let haltReason: 'cancelled' | 'blocked' | null = null;
            const result = await this.steamSyncService.sync(this.settings, {
                candidates: selectedCandidates,
                control: progressModal.getController(),
                onItemStart: (candidate, index, total) => progressModal?.setCurrent(candidate, index, total),
                onItemResult: (item) => progressModal?.addResult(item),
                onHalt: (reason) => {
                    haltReason = reason;
                    progressModal?.halt(reason);
                },
            });
            progressModal.complete(result);
            this.gameService?.invalidateCache();
            this.refreshViews();
            const summary = `${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.failed} failed.`;
            new Notice(haltReason === 'cancelled'
                ? `Steam Sync cancelled: ${summary}`
                : haltReason === 'blocked'
                    ? `Steam Sync stopped by Steam cooldown: ${summary}`
                    : `Steam Sync complete: ${summary}`);
        } catch (error) {
            console.error('[Steam Sync] Sync failed:', error);
            progressModal?.fail(error);
            const message = error instanceof Error ? `: ${error.message}` : '';
            new Notice(`Steam Sync failed${message}`);
        } finally {
            this.steamSyncRunning = false;
        }
    }

    async runNoteImport(): Promise<void> {
        if (!this.noteConversionService) return;

        try {
            new Notice('LOREBASE import: building preview...');
            const preview = await this.noteConversionService.preview(this.settings);
            for (const warning of preview.warnings) {
                new Notice(`LOREBASE import: ${warning}`, 5000);
            }
            if (!preview.items.length) {
                new Notice('LOREBASE import: no markdown notes found.');
                return;
            }

            const review = await new NoteImportReviewModal(
                this.app,
                preview.items,
                this.settings.noteImport.writeMode,
                this.settings.language,
                {
                    games: this.settings.games.folderPath,
                    anime: this.settings.anime.folderPath,
                    movies: this.settings.movies.folderPath,
                    series: this.settings.series.folderPath,
                    books: this.settings.books.folderPath,
                    manga: this.settings.manga.folderPath,
                },
                this.settings.noteImport.targetMedia === 'auto',
                async (item, kind) => {
                    if (!this.integrationService) return null;
                    return this.integrationService.selectMediaSource(kind, item.title);
                }
            ).openAndGetValue();
            if (!review || review.selectedIds.size === 0) {
                new Notice('LOREBASE import: cancelled.');
                return;
            }

            const enrichments: Record<string, Record<string, unknown>> = {};
            if (this.integrationService) {
                const cooldownMs = Math.max(
                    0,
                    Number(this.settings.integrations?.requestCooldownSeconds ?? 0)
                ) * 1000;
                let attemptedRequest = false;
                for (const id of review.selectedIds) {
                    const source = review.sourcesById[id];
                    const target = review.targetMediaById[id];
                    if (!source || !target) continue;
                    try {
                        if (attemptedRequest && cooldownMs > 0) {
                            await new Promise<void>((resolve) => window.setTimeout(resolve, cooldownMs));
                        }
                        attemptedRequest = true;
                        const enrichment = await this.integrationService.getMediaEnrichment(target, source);
                        if (enrichment) enrichments[id] = enrichment.values;
                    } catch (error) {
                        console.error('[LOREBASE Note Import] Source enrichment failed:', id, error);
                    }
                }
            }

            const result = await this.noteConversionService.apply(this.settings, review, enrichments, (path) => {
                new Notice(`LOREBASE import: ${path}`, 1000);
            });
            this.invalidateAllServiceCaches();
            this.refreshViews();
            new Notice(`LOREBASE import complete: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.failed} failed.`);
        } catch (error) {
            console.error('[LOREBASE Note Import] Import failed:', error);
            const message = error instanceof Error ? `: ${error.message}` : '';
            new Notice(`LOREBASE import failed${message}`);
        }
    }

    private invalidateAllServiceCaches(): void {
        this.gameService?.invalidateCache();
        this.animeService?.invalidateCache();
        this.movieService?.invalidateCache();
        this.seriesService?.invalidateCache();
        this.bookService?.invalidateCache();
        this.mangaService?.invalidateCache();
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
                    const titleEl = createFragment();
                    const span = createSpan({
                        text: option.label,
                        cls: 'lorebase-menu-selected-title',
                    });
                    titleEl.appendChild(span);
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
