import { configureOnlineExtras, onOnlineExtrasChange, readOnlineExtrasPreference } from './services/onlineExtras';
import { StatisticsDeletionJournal } from './services/media/statisticsDeletions';
import { CredentialStore, getSecretStorage } from './services/CredentialStore';
import { TraktSyncService } from './services/TraktSyncService';
import { PlayStationSyncService } from './services/PlayStationSyncService';
import { createPlayStationProgressPreference } from './components/PlayStationProgressPreference';
import { normalizePlayStationSettings } from './services/playstation/types';
import { PlayStationImportModal } from './modals/PlayStationImportModal';
import { pt, psnError } from './localization/playstation';
import { normalizeTraktSettings } from './services/trakt/types';
import { TraktLoginModal } from './modals/TraktLoginModal';
import { TraktImportModal } from './modals/TraktImportModal';
import { tt, traktError } from './localization/trakt';
import { CommunityLinksService } from './services/CommunityLinksService';
import { enableCompleteTemplate, enableGameTrackingTemplateFields, enableCountriesTemplateField } from './services/integrations/templatePreferences';
import { includeDeferredTemplateFields } from './services/integrations/templateSchema';
import { synchronizeReleaseStatuses } from './services/ReleaseStatusService';
import { dateKey } from './views/library/releaseCalendar';
import { MusicService } from './services/MusicService';
import { InboxService } from './services/InboxService';
import { InboxImporter } from './services/inbox/InboxImporter';
import { InboxModal, mountInbox } from './modals/InboxModal';
import { inboxText } from './localization/inbox';
import { MusicEditModal } from './modals/MusicEditModal';
import { gt } from './localization/gameTracking';
import { PeopleService } from './services/PeopleService';
import { RecommendationsService } from './services/RecommendationsService';
import { RecommendationLibraryService } from './services/RecommendationLibraryService';
import { EpisodeMetadataService } from './services/EpisodeMetadataService';
import { MusicSearchModal } from './modals/MusicSearchModal';
import { WhatsNewModal } from './modals/WhatsNewModal';
import { highlightReleaseTarget, mountReleaseReturn } from './releases/navigation';
import { getReleaseStartupAction } from './releases/versionState';
import { getReleaseCopy } from './releases/copy';
import type { ReleaseTarget } from './releases/catalog';
import { mt } from './localization/music';
/**
 * LOREBASE - Main Plugin Entry Point
 * Runtime version is read from manifest.json.
 */

import { Plugin, WorkspaceLeaf, Menu, Notice, addIcon, TFile, type Command } from 'obsidian';
import { GameDlc, LorebaseSettings, MediaItem, MediaType, RelatedMediaLink, NoteTemplateSettings } from './types';
import { DEFAULT_SETTINGS, VIEW_TYPE_LIBRARY, LOREBASE_ICON_ID, LOREBASE_ICON_SVG, DEFAULT_COVER, PARTICLE_INTENSITY_MAX, PARTICLE_INTENSITY_MIN } from './constants';
import { i18n, t, type TranslationKey } from './localization';
import { LibraryView } from './views/LibraryView';
import { LorebaseSettingTab } from './settings/SettingsTab';
import { EditModal } from './modals/EditModal';
import { bindPosterGallery } from './modals/PosterGalleryModal';
import { AnimeEditModal } from './modals/AnimeEditModal';
import { VideoEditModal } from './modals/VideoEditModal';
import { ReadingEditModal } from './modals/ReadingEditModal';
import type { ReadingItem } from './types';
import { StatsModal } from './modals/StatsModal';
import { loadStatisticsLibrary } from './services/StatisticsService';
import { DeleteModal } from './modals/DeleteModal';
import { SteamSyncReviewModal } from './modals/SteamSyncReviewModal';
import { renderInlineImportState, renderInlineSteamState, waitForInlinePreview, type InlineSyncPresentation } from './modals/inlineSync';
import { SteamSyncProgressModal } from './modals/SteamSyncProgressModal';
import { AniListImportReviewModal } from './modals/AniListImportReviewModal';
import { NoteImportReviewModal, reviewNoteImportInline, type NoteImportReviewOptions } from './modals/NoteImportReviewModal';
import { GameService } from './services/GameService';
import { AnimeService } from './services/AnimeService';
import { VideoService } from './services/VideoService';
import { ReadingService } from './services/ReadingService';
import { configureStatusPresentation, normalizeStatusCustomization } from './statusPresentation';
import { registerLorebaseTooltips } from './utils/tooltips';

import { configureMediaWorkTypes, normalizeAnimeCountryCatalog, normalizeMediaWorkTypeCatalog, type WorkTypeMedia } from './utils/mediaWorkType';
import { addComicsWorkType, replaceWorkTypeInView, normalizeWorkTypeCatalog } from './utils/mangaWorkType';
import { ParticleService } from './services/ParticleService';
import { IntegrationService } from './services/IntegrationService';
import { SteamSyncService } from './services/SteamSyncService';

import { AniListSyncService } from './services/AniListSyncService';
import { MetadataService } from './services/MetadataService';
import { NoteConversionService } from './services/NoteConversionService';
import { normalizeReleaseCalendarMediaTypes, normalizeReleaseCalendarScope, normalizeReleaseCalendarViewMode } from './views/library/releaseCalendar';
import { normalizeCustomGroups } from './services/media/customGroups';
import { normalizeCardGrid } from './services/media/cardGrid';
import {
    mergeOverlayLayout,
    mergeOverlayVisibility,
    migrateLegacyJikanMangaSettings,
    migrateKitsuProviderSettings,
    migrateUpdatedEditorSetting,
    normalizeDescriptionLines,
    normalizeLibraryViewSettings,
    normalizeNoteImportSettings,
    normalizeTagPresets,
    parseBadges,
} from './settings/settingsNormalization';
import { parseRelatedMedia } from './services/media/parsers';
import { normalizePosterMode } from './services/media/partPoster';
import type { MediaSourceSelection, TemplateKind } from './services/integrations/types';
import { buildSimpleTemplate, getDefaultTemplateFields, getEffectiveSimpleTemplateFields, migrateAlternativeTitleTemplate } from './services/integrations/templateUtils';
import { mediaTypeToKind, synchronizeProviderMetadata } from './services/integrations/enrichment';
import { normalizeRatingSettings } from './utils/rating';
import { MEDIA_ICONS } from './mediaPresentation';

// =============================================================================
// LOREBASE PLUGIN
// =============================================================================

/**
 * Main plugin class
 */
export default class LorebasePlugin extends Plugin {
    private credentialStore?: CredentialStore;

    async saveData(data: unknown): Promise<void> {
        this.credentialStore ??= new CredentialStore(getSecretStorage(this.app));
        await this.credentialStore.save(data, snapshot => super.saveData(snapshot));
    }
    private traktSyncService: TraktSyncService | null = null;
    private traktLoginModal?: TraktLoginModal;
    private traktImportModal?: TraktImportModal;
    private traktControllers = new Set<AbortController>();
    private traktSyncRunning = false;
    private playstationSyncService: PlayStationSyncService | null = null;
    private playstationImportModal?: PlayStationImportModal;
    private playstationControllers = new Set<AbortController>();
    private playstationSyncRunning = false;
    private communityLinksService?: CommunityLinksService;
    private statisticsJournal?: StatisticsDeletionJournal;
    settings: LorebaseSettings = DEFAULT_SETTINGS;
    private readonly playstationProgressPreference = createPlayStationProgressPreference(
        () => this.settings.playstationSync.showProgress,
        visible => { this.settings.playstationSync.showProgress = visible; void this.saveData(this.settings); }
    );
    private gameService: GameService | null = null;
    private animeService: AnimeService | null = null;
    private movieService: VideoService | null = null;
    private seriesService: VideoService | null = null;
    private bookService: ReadingService | null = null;
    private mangaService: ReadingService | null = null;
    private musicService: MusicService | null = null;
    private mediaType: MediaType = 'game';
    private particleService: ParticleService | null = null;
    private integrationService: IntegrationService | null = null;
    private inboxService: InboxService | null = null;
    private inboxImporter: InboxImporter | null = null;
    private peopleService: PeopleService | null = null;
    private recommendationsService: RecommendationsService | null = null;
    private episodeMetadataService: EpisodeMetadataService | null = null;
    private steamSyncService: SteamSyncService | null = null;
    private noteImportRunning = false;
    private steamSyncRunning = false;
    private aniListSyncService: AniListSyncService | null = null;
    private aniListSyncRunning = false;
    private metadataService: MetadataService | null = null;
    private noteConversionService: NoteConversionService | null = null;
    private lorebaseSettingTab?: LorebaseSettingTab;
    private existingInstall = false;
    private releaseStatusRunning = false;
    private releaseStatusPending = false;
    private releaseStatusTimer: number | undefined;
    private releaseStatusDay = "";
    private releaseStatusFolders = "";
    private readonly releaseStatusFiles = new Map<string, TFile>();
    private releaseModal?: WhatsNewModal;
    private releaseReturnCleanup?: () => void;
    private releaseDestination?: { close: () => void };
    private readonly localizedCommands: Array<{ command: Command; key: TranslationKey }> = [];

    async onload(): Promise<void> {
        this.register(registerLorebaseTooltips(document));
        this.registerEvent(this.app.workspace.on('window-open', (_workspaceWindow, ownerWindow) => {            this.register(registerLorebaseTooltips(ownerWindow.document));
        }));
        // Load settings
        await this.loadSettings();
        this.normalizeMediaType();

        // Initialize localization
        i18n.setLanguage(this.settings.language);
        configureOnlineExtras(this.settings.onlineExtrasEnabled);
        this.register(onOnlineExtrasChange(() => this.refreshViews()));

        // Initialize game service
        this.metadataService = new MetadataService(this.app, () => this.settings);
        const invalidateImages = (file: unknown): void => {
            if (!(file instanceof TFile) || file.extension !== 'md') this.metadataService?.invalidateImageCache();
        };
        this.registerEvent(this.app.vault.on('create', invalidateImages));
        this.registerEvent(this.app.vault.on('modify', invalidateImages));
        this.registerEvent(this.app.vault.on('delete', invalidateImages));
        this.registerEvent(this.app.vault.on('rename', invalidateImages));
        this.gameService = new GameService(this.app, this.metadataService);
        this.gameService.setFolderPath(this.settings.games.folderPath);
        this.animeService = new AnimeService(this.app, this.metadataService);
        this.animeService.setFolderPath(this.settings.anime.folderPath);
        this.animeService.setPosterMode(this.settings.anime.posterMode);
        this.movieService = new VideoService(this.app, 'movie', this.settings.movies.folderPath, this.metadataService);
        this.seriesService = new VideoService(this.app, 'series', this.settings.series.folderPath, this.metadataService);
        this.seriesService.setPosterMode(this.settings.series.posterMode);
        this.bookService = new ReadingService(this.app, 'book', this.settings.books.folderPath, this.metadataService);
        this.mangaService = new ReadingService(this.app, 'manga', this.settings.manga.folderPath, this.metadataService);
        this.musicService = new MusicService(this.app, this.settings.music.folderPath, this.metadataService, () => this.settings);
        this.integrationService = new IntegrationService(this.app, () => this.settings, presentation => this.runSteamSync(presentation), presentation => this.runAniListImport(presentation),
            (kind, presentation) => this.showInbox(kind, presentation));
        this.steamSyncService = new SteamSyncService(this.app, this.metadataService, () => this.settings);
        this.episodeMetadataService = new EpisodeMetadataService(() => this.settings);
        this.recommendationsService = new RecommendationsService(() => this.settings, undefined,
            new RecommendationLibraryService(this.app, () => this.settings, this.metadataService, async (kind, selection) => {
                const file = kind === 'anime' ? await this.integrationService?.addAnimeSelection(selection) ?? null
                    : await this.integrationService?.addVideoSelection(kind, selection) ?? null;
                if (file) { this.animeService?.invalidateCache(); this.movieService?.invalidateCache(); this.seriesService?.invalidateCache(); this.refreshViews(); }
                return file;
            }));
        this.peopleService = new PeopleService(this.app, () => this.settings, this.metadataService,
            async (kind, selection) => {
                const file = await this.integrationService?.addVideoSelection(kind, selection) ?? null;
                if (file) { this.movieService?.invalidateCache(); this.seriesService?.invalidateCache(); this.refreshViews(); }
                return file;
            });
        this.aniListSyncService = new AniListSyncService(this.app, this.metadataService, () => this.settings);
        this.traktSyncService = new TraktSyncService(this.app, () => this.settings, this.metadataService, this.integrationService, () => this.saveData(this.settings));
        this.playstationSyncService = new PlayStationSyncService(this.app, () => this.settings, this.metadataService, this.integrationService, () => this.saveData(this.settings));
        this.noteConversionService = new NoteConversionService(this.app, () => this.settings);
        addIcon(LOREBASE_ICON_ID, LOREBASE_ICON_SVG);

        this.statisticsJournal = new StatisticsDeletionJournal(this.settings.statisticsDeletions, events => { this.settings.statisticsDeletions = events; void this.saveSettings(); });
        if (!this.settings.statisticsDeletionStarted) { this.settings.statisticsDeletionStarted = Date.now(); void this.saveSettings(); }
        const observeStatistics = (file:TFile):void => {
            const path=file.path.replace(/\\/g,'/');
            const sources=[['game',this.settings.games.folderPath,this.gameService],['anime',this.settings.anime.folderPath,this.animeService],['movie',this.settings.movies.folderPath,this.movieService],['series',this.settings.series.folderPath,this.seriesService],['book',this.settings.books.folderPath,this.bookService],['manga',this.settings.manga.folderPath,this.mangaService],['music',this.settings.music.folderPath,this.musicService]] as const;
            for(const [type,folder,service] of sources){if(!folder||!path.startsWith(folder.replace(/\\/g,'/').replace(/\/$/,'')+'/'))continue;const item=type==='game'?(service as GameService).parseGameFromCache(file):type==='anime'?(service as AnimeService).parseAnimeFromCache(file):(service as VideoService|ReadingService|MusicService).parseFromCache(file);if(item){this.statisticsJournal?.observe(item,file.stat.ctime);return;}}
            this.statisticsJournal?.forget(file.path);
        };
        let statisticsStartupCancelled = false;
        this.register(() => { statisticsStartupCancelled = true; });
        this.app.workspace.onLayoutReady(() => {
            void (async () => {
                let processed = 0;
                for (const file of this.app.vault.getMarkdownFiles()) {
                    if (statisticsStartupCancelled) return;
                    observeStatistics(file);
                    if (++processed % 100 === 0) await new Promise<void>(resolve => window.setTimeout(resolve, 0));
                }
            })().catch(error => console.error('Could not index statistics', error));
        });
        this.registerEvent(this.app.metadataCache.on('changed',file=>observeStatistics(file)));
        this.registerEvent(this.app.vault.on('rename',(file,oldPath)=>{
            if (this.aniListSyncService?.recordLocalRename(this.settings.anilistSync, oldPath, file.path)) void this.saveData(this.settings);
            if(file instanceof TFile){this.statisticsJournal?.rename(oldPath,file.path);observeStatistics(file);}
        }));
        this.registerEvent(this.app.vault.on('delete',file=>{
            if (this.aniListSyncService?.recordLocalDeletion(this.settings.anilistSync, file.path)) void this.saveData(this.settings);
            if(file instanceof TFile)this.statisticsJournal?.remove(file.path);
        }));

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
        this.addCommand({ id: 'open-inbox', name: inboxText('command'), callback: () => this.showInbox() });
        this.addLocalizedCommand('statsTitle', { id: 'library-statistics', callback: () => this.showStatsModal() });

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

        this.addLocalizedCommand('commandAddMusic', {
            id: 'add-music',
            callback: () => this.addMediaItem('music'),
        });

        this.addLocalizedCommand('commandSteamSync', {
            id: 'steam-sync',
            callback: () => {
                void this.runSteamSync();
            }
        });

        this.addLocalizedCommand('commandAniListSync', {
            id: 'anilist-sync',
            callback: () => void this.runAniListSync(),
        });

        this.addLocalizedCommand('commandAniListImport', {
            id: 'anilist-import',
            callback: () => void this.runAniListImport(),
        });

        this.addLocalizedCommand('commandImportNotes', {
            id: 'import-existing-notes',
            callback: () => {
                void this.runNoteImport();
            }
        });

        // Register settings tab
        this.lorebaseSettingTab = new LorebaseSettingTab(this.app, this);
        this.addSettingTab(this.lorebaseSettingTab);

        // Apply accent color on load
        this.applyAccentColor();
        this.applyParticles();

        let unloaded = false;
        this.register(() => {
            unloaded = true;
            this.releaseModal?.close();
            this.releaseReturnCleanup?.();
        });
        this.app.workspace.onLayoutReady(() => {
            if (!unloaded) {
                void this.checkReleaseUpdate();
                void this.synchronizeMediaReleaseStatuses();
                if (this.settings.traktSync.autoSyncOnStartup && this.settings.traktSync.accessToken) void this.runTraktSync(true);
                if (this.settings.playstationSync.autoSyncOnStartup && this.settings.playstationSync.accountId) void this.runPlayStationSync(true);
            }
        });

        this.registerEvent(this.app.metadataCache.on('changed', file => {
            const folders = [this.settings.games, this.settings.anime, this.settings.movies, this.settings.series, this.settings.books, this.settings.manga, this.settings.music];
            if (!folders.some(config => this.isFileInFolder(file.path, config.folderPath))) return;
            this.releaseStatusFiles.set(file.path, file);
            if (this.releaseStatusRunning) { this.releaseStatusPending = true; return; }
            window.clearTimeout(this.releaseStatusTimer);
            this.releaseStatusTimer = window.setTimeout(() => void this.synchronizeMediaReleaseStatuses(), 1500);
        }));
        this.registerInterval(window.setInterval(() => {
            if (dateKey(new Date()) !== this.releaseStatusDay) void this.synchronizeMediaReleaseStatuses();
        }, 30_000));
        this.register(() => window.clearTimeout(this.releaseStatusTimer));

        if (this.settings.steamSync.autoSyncPlaytimeOnStartup && this.settings.steamSync.steamId) {
            void this.runSteamPlaytimeSync();
        }
        if (this.settings.anilistSync.autoSyncOnStartup && this.settings.anilistSync.accessToken) {
            void this.runAniListSync();
        }
    }

    private async synchronizeMediaReleaseStatuses(): Promise<void> {
        if (this.releaseStatusRunning || !this.metadataService) return;
        this.releaseStatusRunning = true;
        const today = dateKey(new Date());
        const folderSignature = JSON.stringify([this.settings.games, this.settings.anime, this.settings.movies, this.settings.series, this.settings.books, this.settings.manga, this.settings.music].map(config => config.folderPath));
        const fullScan = today !== this.releaseStatusDay || folderSignature !== this.releaseStatusFolders;
        const changedFiles = fullScan ? undefined : [...this.releaseStatusFiles.values()];
        this.releaseStatusFiles.clear();
        const dayChanged = Boolean(this.releaseStatusDay) && this.releaseStatusDay !== today;
        try {
            const sources = [
                { folder: this.settings.games.folderPath, parse: (file: TFile) => this.gameService?.parseGameFromCache(file) ?? null },
                { folder: this.settings.anime.folderPath, parse: (file: TFile) => this.animeService?.parseAnimeFromCache(file) ?? null },
                { folder: this.settings.movies.folderPath, parse: (file: TFile) => this.movieService?.parseFromCache(file) ?? null },
                { folder: this.settings.series.folderPath, parse: (file: TFile) => this.seriesService?.parseFromCache(file) ?? null },
                { folder: this.settings.books.folderPath, parse: (file: TFile) => this.bookService?.parseFromCache(file) ?? null },
                { folder: this.settings.manga.folderPath, parse: (file: TFile) => this.mangaService?.parseFromCache(file) ?? null },
                { folder: this.settings.music.folderPath, parse: (file: TFile) => this.musicService?.parseFromCache(file) ?? null },
            ];
            if (await synchronizeReleaseStatuses(this.app, this.metadataService, sources, new Date(), changedFiles)) {
                for (const service of [this.gameService, this.animeService, this.movieService, this.seriesService, this.bookService, this.mangaService, this.musicService]) service?.invalidateCache();
                this.refreshViews();
            } else if (dayChanged) {
                this.refreshViewsVisuals();
            }
            this.releaseStatusDay = today;
            this.releaseStatusFolders = folderSignature;
        } catch (error) {
            console.error('Could not synchronize release statuses', error);
        } finally {
            this.releaseStatusRunning = false;
            if (this.releaseStatusPending && this.metadataService) {
                this.releaseStatusPending = false;
                window.clearTimeout(this.releaseStatusTimer);
                this.releaseStatusTimer = window.setTimeout(() => void this.synchronizeMediaReleaseStatuses(), 1500);
            }
        }
    }

    onunload(): void {
        this.inboxImporter?.dispose(); this.inboxImporter = null; this.inboxService = null;
        this.steamSyncService?.dispose();
        this.musicService?.dispose();
        this.noteConversionService?.dispose();
        this.metadataService?.dispose();
        this.integrationService?.dispose();
        this.aniListSyncService?.dispose();
        this.playstationImportModal?.close();
        for (const controller of this.playstationControllers) controller.abort();
        this.playstationControllers.clear(); this.playstationSyncService = null;
        this.traktLoginModal?.close(); this.traktImportModal?.close();
        for (const controller of this.traktControllers) controller.abort();
        this.traktControllers.clear(); this.traktSyncService = null;
        this.gameService = null;
        this.animeService = null;
        this.movieService = null;
        this.seriesService = null;
        this.bookService = null;
        this.mangaService = null;
        this.musicService = null;

        if (this.particleService) {
            this.particleService.destroy();
            this.particleService = null;
        }

        this.integrationService = null;
        this.peopleService = null;
        this.recommendationsService = null;
        this.episodeMetadataService = null;
        this.steamSyncService = null;
        this.aniListSyncService = null;
        this.metadataService = null;
        this.noteConversionService = null;
    }

    /**
     * Load plugin settings
     */
    async loadSettings(): Promise<void> {
        let removedProviderSettings = false;
        const secretStorage = getSecretStorage(this.app);
        this.credentialStore ??= new CredentialStore(secretStorage);
        const loaded: unknown = this.credentialStore.restore(await this.loadData());
        this.existingInstall = this.isSettingsRecord(loaded) && Object.keys(loaded).length > 0;
        const sanitized = this.isSettingsRecord(loaded) ? { ...loaded } : {};
        const editorMigrated = migrateUpdatedEditorSetting(sanitized);
        this.settings = Object.assign({}, structuredClone(DEFAULT_SETTINGS), sanitized);
        this.settings.updatedEditor = sanitized.updatedEditor === true;
        this.settings.onlineExtrasEnabled = readOnlineExtrasPreference(sanitized);
        delete (this.settings as unknown as Record<string, unknown>).offlineMode;
        this.settings.playstationSync = normalizePlayStationSettings(sanitized.playstationSync);
        this.settings.scrollCardDescriptions = sanitized.scrollCardDescriptions === true;
        this.settings.showDiscoveryBadge = sanitized.showDiscoveryBadge !== false;
        this.settings.traktSync = normalizeTraktSettings(sanitized.traktSync);
        const mangaWorkTypes = normalizeWorkTypeCatalog(sanitized.mediaWorkTypes?.manga);
        const comicsTypeMigrated = !this.settings.migrations?.comicsWorkType;
        if (comicsTypeMigrated) this.settings.migrations = { ...this.settings.migrations, comicsWorkType: true };
        this.settings.mediaWorkTypes = { ...sanitized.mediaWorkTypes, manga: comicsTypeMigrated ? addComicsWorkType(mangaWorkTypes) : mangaWorkTypes };
        for (const type of ['game', 'movie', 'series'] as WorkTypeMedia[]) this.settings.mediaWorkTypes[type] = normalizeMediaWorkTypeCatalog(type, sanitized.mediaWorkTypes?.[type]);
        this.settings.mediaWorkTypes.anime = normalizeAnimeCountryCatalog(sanitized.mediaWorkTypes?.anime);
        configureMediaWorkTypes(this.settings.mediaWorkTypes);
        this.settings.statusEditorLayout = sanitized.statusEditorLayout === 'columns' ? 'columns' : 'list';
        const particleIntensity = Number(sanitized.particleIntensity);
        this.settings.particleIntensity = Number.isFinite(particleIntensity)
            ? Math.min(PARTICLE_INTENSITY_MAX, Math.max(PARTICLE_INTENSITY_MIN, Math.round(particleIntensity)))
            : DEFAULT_SETTINGS.particleIntensity;
        this.settings.animateParticlesWithReducedMotion = sanitized.animateParticlesWithReducedMotion === true;
        this.settings.settingsLayoutMode = sanitized.settingsLayoutMode === 'accordion'
            ? 'accordion'
            : 'tabs';
        this.settings.ratingScale = normalizeRatingSettings(sanitized.ratingScale);
        this.settings.completionDateBadgeFormat = sanitized.completionDateBadgeFormat === 'full'
            ? 'full'
            : 'short';
        const completionDateFallback = this.settings.completionDateBadgeFormat;
        const normalizeCompletionDateBadgeFormat = (value: unknown): 'short' | 'full' => (
            value === 'full' || value === 'short' ? value : completionDateFallback
        );
        this.settings.completionDateBadgeFormats = {
            music: normalizeCompletionDateBadgeFormat(sanitized?.completionDateBadgeFormats?.music),
            games: normalizeCompletionDateBadgeFormat(sanitized?.completionDateBadgeFormats?.games),
            anime: normalizeCompletionDateBadgeFormat(sanitized?.completionDateBadgeFormats?.anime),
            movies: normalizeCompletionDateBadgeFormat(sanitized?.completionDateBadgeFormats?.movies),
            series: normalizeCompletionDateBadgeFormat(sanitized?.completionDateBadgeFormats?.series),
            books: normalizeCompletionDateBadgeFormat(sanitized?.completionDateBadgeFormats?.books),
            manga: normalizeCompletionDateBadgeFormat(sanitized?.completionDateBadgeFormats?.manga),
        };
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
        this.settings.music = Object.assign({}, DEFAULT_SETTINGS.music, sanitized.music ?? {});
        this.settings.music.noteTemplate = { ...structuredClone(DEFAULT_SETTINGS.music.noteTemplate!), ...sanitized.music?.noteTemplate };
        for (const key of ['anime', 'series'] as const) {
            this.settings[key].posterMode = normalizePosterMode(this.settings[key].posterMode);
        }
        for (const key of ['albumCoverMode', 'trackCoverMode'] as const) {
            const mode = this.settings.music[key];
            this.settings.music[key] = mode === 'vinyl' || mode === 'cd' ? mode : 'square';
        }
        this.settings.music.provider = ['lastfm', 'deezer'].includes(this.settings.music.provider) ? this.settings.music.provider : 'musicbrainz';
        this.settings.music.lastfmApiKey = typeof this.settings.music.lastfmApiKey === 'string' ? this.settings.music.lastfmApiKey : '';
        for (const key of ['games', 'anime', 'movies', 'series', 'books', 'manga', 'music'] as const) {
            const normalizedView = normalizeLibraryViewSettings(sanitized?.[key], DEFAULT_SETTINGS[key].viewState);
            Object.assign(this.settings, { [key]: Object.assign({}, this.settings[key]) });
            this.settings[key].cardGrid = normalizeCardGrid(sanitized[key]?.cardGrid, this.settings[key]);
            Object.assign(this.settings[key], normalizedView);
            this.settings[key].sortField = normalizedView.viewState.sort.field;
            this.settings[key].sortOrder = normalizedView.viewState.sort.order;
        }
        if (sanitized?.enabledMedia) {
            this.settings.enabledMedia = Object.assign({}, DEFAULT_SETTINGS.enabledMedia, sanitized.enabledMedia);
        }
        this.settings.releaseCalendarMediaTypes = normalizeReleaseCalendarMediaTypes(
            sanitized.releaseCalendarMediaTypes
        );
        this.settings.releaseCalendarViewMode = normalizeReleaseCalendarViewMode(sanitized.releaseCalendarViewMode);
        this.settings.releaseCalendarScope = normalizeReleaseCalendarScope(sanitized.releaseCalendarScope);
        this.settings.customGroups = normalizeCustomGroups(sanitized.customGroups);
        this.settings.migrations = Object.assign({}, DEFAULT_SETTINGS.migrations, sanitized?.migrations ?? {});
        // Start the revised grid in the requested column mode once; later edits are retained.
        if (!this.settings.migrations.columnGridDefaults) {
            for (const key of ['games', 'anime', 'movies', 'series', 'books', 'manga', 'music'] as const) {
                const grid = this.settings[key].cardGrid!;
                for (const device of ['desktop', 'mobile'] as const) {
                    grid[device].mode = 'columns';
                    grid[device].columns = grid[device].horizontalColumns = key === 'music' ? 7 : 5;
                }
            }
            this.settings.migrations.columnGridDefaults = true;
        }
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
        this.settings.anilistSync = Object.assign({}, DEFAULT_SETTINGS.anilistSync, sanitized?.anilistSync ?? {});
        this.settings.anilistSync.syncDeletions = sanitized?.anilistSync?.syncDeletions === true;
        this.settings.anilistSync.lastSynced = Object.assign(
            {},
            DEFAULT_SETTINGS.anilistSync.lastSynced,
            sanitized?.anilistSync?.lastSynced ?? {}
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
            music: Object.assign({}, sanitized?.statusLabels?.music ?? {}),
        };
        this.settings.statusCustomization = normalizeStatusCustomization(sanitized.statusCustomization);
        configureStatusPresentation(this.settings);
        const legacyCompletedLabel = t('statusPlayed').trim().toLowerCase();
        for (const labels of [this.settings.statusLabels.movies, this.settings.statusLabels.series]) {
            if (labels.completed?.trim().toLowerCase() === legacyCompletedLabel) {
                delete labels.completed;
            }
        }
        const watchCompletedLabel = t('statusCompleted').trim().toLowerCase();
        for (const labels of [this.settings.statusLabels.books, this.settings.statusLabels.manga]) {
            if (labels.planned?.trim() === 'Plan to Read') delete labels.planned;
            if (labels.watching?.trim() === 'Reading') delete labels.watching;
            if (labels.completed?.trim().toLowerCase() === watchCompletedLabel) {
                delete labels.completed;
            }
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
        const mediaCustomization: Record<'game' | 'anime' | 'movie' | 'series' | 'book' | 'manga' | 'music', Record<'vertical' | 'horizontal', CustomizationProfile>> = {
            music: {
                vertical: { descriptionKey: 'musicDescriptionLines', layoutKey: 'musicOverlayTextLayout', visibilityKey: 'musicOverlayTextVisibility', badgesKey: 'musicBadges' },
                horizontal: { descriptionKey: 'musicHorizontalDescriptionLines', layoutKey: 'musicHorizontalOverlayTextLayout', visibilityKey: 'musicHorizontalOverlayTextVisibility', badgesKey: 'musicHorizontalBadges' },
            },
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

        for (const media of ['game', 'anime', 'movie', 'series', 'book', 'manga', 'music'] as const) {
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
        if (!this.settings.migrations?.horizontalFourColumns) {
            for (const key of ['games', 'anime', 'movies', 'series', 'books', 'manga', 'music'] as const) {
                for (const device of ['desktop', 'mobile'] as const) this.settings[key].cardGrid![device].horizontalColumns = 4;
            }
            this.settings.migrations = { ...this.settings.migrations, horizontalFourColumns: true };
        }
        if (!this.settings.migrations?.raisedCardTextDefaults) {
            const oldPositions = {
                vertical: { title: { x: 7, y: 6.5 }, year: { x: 7, y: 15 }, format: { x: 30, y: 15 }, description: { x: 2, y: 24 } },
                horizontal: { title: { x: 7, y: 11.2 }, year: { x: 7, y: 25.9 }, format: { x: 30, y: 25.9 }, description: { x: 2, y: 41.5 } },
            };
            for (const media of ['game', 'anime', 'movie', 'series', 'book', 'manga'] as const) {
                for (const direction of ['vertical', 'horizontal'] as const) {
                    const profile = mediaCustomization[media][direction];
                    const current = readSetting<LorebaseSettings['overlayTextLayout']>(profile.layoutKey);
                    const defaults = readDefault<LorebaseSettings['overlayTextLayout']>(profile.layoutKey);
                    for (const field of ['title', 'year', 'format', 'description'] as const) {
                        const old = oldPositions[direction][field];
                        if (current[field].x === old.x && current[field].y === old.y) current[field] = { ...defaults[field] };
                    }
                }
            }
            this.settings.migrations = { ...this.settings.migrations, raisedCardTextDefaults: true };
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
            if (defaultIntegrations) {
                for (const key of Object.keys(integrations.providers)) {
                    if (!Object.prototype.hasOwnProperty.call(defaultIntegrations.providers, key)) {
                        delete (integrations.providers as unknown as Record<string, unknown>)[key];
                        removedProviderSettings = true;
                    }
                }
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
            } else if (!['anilist', 'kitsu', 'jikan', 'shikimori'].includes(animeProvider)) {
                integrations.media.anime.provider = 'anilist';
            }
            const booksProvider = String(integrations.media?.books?.provider ?? '');
            if (!['hardcover', 'googlebooks', 'openlibrary'].includes(booksProvider)) {
                integrations.media.books.provider = 'hardcover';
            }
            const mangaProvider = String(integrations.media?.manga?.provider ?? '');
            if (mangaProvider !== 'jikan' && !['anilist', 'shikimori', 'mangaupdates', 'mangadex', 'comicvine'].includes(mangaProvider)) {
                integrations.media.manga.provider = 'anilist';
            }
        }

        const settingsMigrated = migrateLegacyJikanMangaSettings(this.settings, sanitized.integrations);
        const kitsuMigrated = migrateKitsuProviderSettings(this.settings, sanitized.integrations);
        const templatesMigrated = this.migrateIntegrationTemplates();
        const gameFiltersMigrated = this.migrateGameDefaultVisibilityFilters();
        const beforeTypeFilters = JSON.stringify([this.settings.manga.viewState, this.settings.manga.savedViews]);
        for (const [from, to] of Object.entries(this.settings.mediaWorkTypes?.manga?.redirects ?? {})) {
            replaceWorkTypeInView(this.settings.manga.viewState, from, to);
            this.settings.manga.savedViews.forEach(view => replaceWorkTypeInView(view.state, from, to));
        }
        const typeFiltersMigrated = beforeTypeFilters !== JSON.stringify([this.settings.manga.viewState, this.settings.manga.savedViews]);
        if (templatesMigrated || settingsMigrated || kitsuMigrated || gameFiltersMigrated || removedProviderSettings || typeFiltersMigrated || comicsTypeMigrated || editorMigrated || secretStorage) {
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
        for (const kind of ['anime', 'manga'] as const) {
            const template = media[kind].template;
            const migrated = migrateAlternativeTitleTemplate(template);
            if (migrated !== template) {
                media[kind].template = migrated;
                changed = true;
            }
        }

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
            kind: TemplateKind,
            mediaSettings: NoteTemplateSettings | undefined,
            howLongToBeatEnabled = false
        ): void => {
            if (!mediaSettings || mediaSettings.templateMode === 'advanced') return;
            const selected = Array.isArray(mediaSettings.templateFields)
                ? mediaSettings.templateFields
                : getDefaultTemplateFields(kind);
            const nextFields = getEffectiveSimpleTemplateFields(kind, selected, { howLongToBeatEnabled });
            const nextTemplate = buildSimpleTemplate(kind, nextFields, mediaSettings.fieldAliases, mediaSettings.wikilinkFields);
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
        if (!this.settings.migrations?.mangaTemplateWorkTypeField) {
            if (media.manga?.templateMode !== 'advanced') {
                const fields = Array.isArray(media.manga?.templateFields)
                    ? media.manga.templateFields
                    : [];
                if (!fields.includes('workType')) {
                    const typeIndex = fields.indexOf('type');
                    const insertAt = typeIndex >= 0 ? typeIndex + 1 : 0;
                    media.manga.templateFields = [
                        ...fields.slice(0, insertAt),
                        'workType',
                        ...fields.slice(insertAt),
                    ];
                    changed = true;
                }
            }
            if (this.settings.migrations) {
                this.settings.migrations.mangaTemplateWorkTypeField = true;
                changed = true;
            }
        }

        if (!this.settings.migrations?.releaseCalendarTemplateDates) {
            for (const mediaSettings of [media.anime, media.series, media.manga]) {
                if (!mediaSettings || mediaSettings.templateMode === 'advanced') continue;
                const fields = Array.isArray(mediaSettings.templateFields)
                    ? mediaSettings.templateFields
                    : [];
                if (fields.includes('released')) continue;
                const yearIndex = fields.indexOf('year');
                const insertAt = yearIndex >= 0 ? yearIndex + 1 : fields.length;
                mediaSettings.templateFields = [
                    ...fields.slice(0, insertAt),
                    'released',
                    ...fields.slice(insertAt),
                ];
                changed = true;
            }
            if (this.settings.migrations) {
                this.settings.migrations.releaseCalendarTemplateDates = true;
                changed = true;
            }
        }

        if (!this.settings.migrations?.orderedTemplateFields) {
            for (const kind of ['games', 'anime', 'movies', 'series', 'books', 'manga'] as const) {
                const config = media[kind];
                if (!config || config.templateMode === 'advanced') continue;
                config.templateFields = includeDeferredTemplateFields(kind, config.templateFields ?? getDefaultTemplateFields(kind));
            }
            if (this.settings.migrations) this.settings.migrations.orderedTemplateFields = true;
            changed = true;
        }

        if (!this.settings.migrations?.completeTemplateSchema) {
            for (const kind of ['games', 'anime', 'movies', 'series', 'books', 'manga'] as const) {
                if (media[kind]) enableCompleteTemplate(kind, media[kind]);
            }
            if (this.settings.migrations) this.settings.migrations.completeTemplateSchema = true;
            changed = true;
        }

        if (!this.settings.migrations?.gameTrackingTemplateFields) {
            if (media.games) enableGameTrackingTemplateFields(media.games);
            if (this.settings.migrations) this.settings.migrations.gameTrackingTemplateFields = true;
            changed = true;
        }

        if (!this.settings.migrations?.countriesTemplateFields) {
            for (const kind of ['games','anime','movies','series','books','manga'] as const) if (media[kind]) enableCountriesTemplateField(kind,media[kind]);
            if (this.settings.migrations) this.settings.migrations.countriesTemplateFields = true;
            changed = true;
        }
        syncSimpleTemplate('games', media.games, Boolean(media.games?.howLongToBeatEnabled));
        syncSimpleTemplate('anime', media.anime);
        syncSimpleTemplate('movies', media.movies);
        syncSimpleTemplate('series', media.series);
        syncSimpleTemplate('books', media.books);
        syncSimpleTemplate('manga', media.manga);
        syncSimpleTemplate('music', this.settings.music.noteTemplate);

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
    private templateConfigurationSignature = '';

    async saveSettings(): Promise<void> {
        configureOnlineExtras(this.settings.onlineExtrasEnabled);
        configureMediaWorkTypes(this.settings.mediaWorkTypes);
        configureStatusPresentation(this.settings);
        this.musicService?.setFolderPath(this.settings.music.folderPath);
        await this.saveData(this.settings);

        // Update game service folder path if changed
        if (this.gameService) {
            this.gameService.setFolderPath(this.settings.games.folderPath);
        }
        if (this.animeService) {
            this.animeService.setFolderPath(this.settings.anime.folderPath);
            this.animeService.setPosterMode(this.settings.anime.posterMode);
        }
        if (this.movieService) {
            this.movieService.setFolderPath(this.settings.movies.folderPath);
        }
        if (this.seriesService) {
            this.seriesService.setFolderPath(this.settings.series.folderPath);
            this.seriesService.setPosterMode(this.settings.series.posterMode);
        }
        if (this.bookService) {
            this.bookService.setFolderPath(this.settings.books.folderPath);
        }
        if (this.mangaService) {
            this.mangaService.setFolderPath(this.settings.manga.folderPath);
        }

        // Update localization
        i18n.setLanguage(this.settings.language);
        this.refreshLocalizedCommandNames();

        // Apply accent color
        this.applyAccentColor();
        this.normalizeMediaType();
        this.applyParticles();
        const signature = JSON.stringify({ media: this.settings.integrations?.media, music: this.settings.music.noteTemplate, compactTemplates: this.settings.integrations?.compactTemplates });
        if (signature !== this.templateConfigurationSignature) {
            this.templateConfigurationSignature = signature;
            for (const service of [this.gameService, this.animeService, this.movieService, this.seriesService, this.bookService, this.mangaService]) service?.invalidateCache();
            this.refreshViews();
        }
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
            { type: 'music', id: 'open-music-library', key: 'commandOpenMusicLibrary' },
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
    showEditModal(item: MediaItem, onSave: () => void, onBeforeSave?: () => void, partId?: string): void {
        if (item.type === 'music') {
            if (!this.musicService) return;
            const service = this.musicService;
            new MusicEditModal(this.app, item, this.settings, service, async draft => {
                onBeforeSave?.();
                await service.updateItem(item, draft);
                onSave();
            }, () => this.showDeleteModal(item, async () => { await service.deleteItem(item); onSave(); })).open();
            return;
        }
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
                async (request) => {
                    if (!this.integrationService || !this.animeService) return;
                    const anime = { ...animeItem, ...(request ? { parts: request.parts, activePartId: request.activePartId, status: request.status, partCatalog: request.partCatalog } : {}) };
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
                    const review = await this.integrationService.reviewAnimePartsForItem(anime, providerParts, request?.automatic);
                    if (!review) return false;
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
                ),
                this.settings.ratingScale,
                part => this.episodeMetadataService?.load(animeItem, part) ?? Promise.resolve([]),
                this.recommendationsService ?? undefined,
                this.settings.updatedEditor,
                this.settings.updatedEditor ? this.collectIncomingRelatedMedia(animeItem.filePath) : undefined
            );
            this.openEditorWithGallery(modal, animeItem);
            if (partId) modal.showPart(partId);
            return;
        }

        if (item.type === 'movie' || item.type === 'series') {
            const service = item.type === 'movie' ? this.movieService : this.seriesService;
            const episodeMetadata = this.episodeMetadataService;
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
                ),
                this.settings.ratingScale,
                (onChanged) => this.manageMediaWorkTypes(item.type, onChanged),
                this.peopleService ?? undefined,
                item.type === 'series' ? part => this.episodeMetadataService?.load(item, part) ?? Promise.resolve([]) : undefined,
                this.recommendationsService ?? undefined,
                this.settings.updatedEditor,
                item.type === 'series' && episodeMetadata?.canRefreshSeries(item)
                    ? () => episodeMetadata.refreshSeries(item)
                    : undefined
            );
            this.openEditorWithGallery(modal, item);
            if (partId) modal.showPart(partId);
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
                ),
                this.settings.ratingScale,
                (onChanged) => this.manageMangaWorkTypes(onChanged),
                this.settings.updatedEditor,
                {
                    items: this.app.vault.getMarkdownFiles()
                        .filter(file => this.isFileInFolder(file.path, readingItem.type === 'book' ? this.settings.books.folderPath : this.settings.manga.folderPath))
                        .map(file => service?.parseFromCache(file) ?? null)
                        .filter((entry): entry is ReadingItem => entry !== null),
                    save: async changes => {
                        if (!service) return;
                        for (const change of changes) await service.updateItem(change.item, change.updates);
                    },
                }
            );
            modal.open();
            if (partId) modal.showPart(partId);
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
            ),
            this.settings.ratingScale,
                (onChanged) => this.manageMediaWorkTypes('game', onChanged),
            this.steamSyncService ? (appId) => this.steamSyncService!.getGameTracking(this.settings.steamSync, appId) : undefined,
            this.settings.updatedEditor,
            this.playstationSyncService ? (tracking, signal) => this.playstationSyncService!.refresh(tracking, signal) : undefined,
            this.playstationProgressPreference,
        );
        this.openEditorWithGallery(modal, gameItem);
    }

    private openEditorWithGallery(modal: EditModal | AnimeEditModal | VideoEditModal, item: MediaItem): void {
        modal.open();
        const unbindGallery = bindPosterGallery(this.app, modal.contentEl, item.displayName, this.integrationService?.getGalleryLoader(item));
        if (unbindGallery) {
            const close = modal.onClose.bind(modal);
            modal.onClose = () => { unbindGallery(); close(); };
        }
    }

    async enrichMediaItem(item: MediaItem, relink = false, onSave?: () => void): Promise<boolean> {
        if (item.type === 'music') return false;
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
                    image: ((item.type === 'anime' || item.type === 'series') ? item.titleImageUrl || item.imageUrl : item.imageUrl) || undefined,
                    workTypeMedia: item.type === 'anime' ? item.integrationSourceKind : undefined,
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
            await this.metadataService.updateMetadata(file, merged.patch, item.type);

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

    private async refreshCommunityRatingForItem(item: MediaItem, onSave: () => void): Promise<boolean> {
        const metadata = this.metadataService;
        if (item.type === 'music' || !this.integrationService || !metadata) return false;

        const file = this.app.vault.getAbstractFileByPath(item.filePath);
        if (!(file instanceof TFile)) return false;

        const rating = await this.integrationService.fetchCommunityRatingForItem(item);
        if (!rating) return false;

        const updates = {
            communityRating: rating.rating,
            communityVotes: rating.votes,
            communityRatingProvider: rating.provider,
        };
        await metadata.updateMetadata(file, updates, item.type);
        Object.assign(item, updates);
        this.invalidateAllServiceCaches();
        onSave();
        return true;
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
        const raw = frontmatter as Record<string, unknown>;
        const types: MediaType[] = ['game', 'anime', 'movie', 'series', 'book', 'manga', 'music'];
        const type = types.includes(raw.type as MediaType) ? raw.type as MediaType
            : ([['game', this.settings.games], ['anime', this.settings.anime], ['movie', this.settings.movies],
                ['series', this.settings.series], ['book', this.settings.books], ['manga', this.settings.manga],
                ['music', this.settings.music]] as const)
                .filter(([, config]) => config.folderPath && this.isFileInFolder(file.path, config.folderPath))
                .sort((a, b) => b[1].folderPath.length - a[1].folderPath.length)[0]?.[0];
        return type && this.metadataService ? this.metadataService.resolveFrontmatter(type, raw)[key] : raw[key];
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
    showStatsModal(): StatsModal {
        const modal = new StatsModal(this.app, async () => {
            const game = this.gameService!, anime = this.animeService!, movie = this.movieService!, series = this.seriesService!, book = this.bookService!, manga = this.mangaService!, music = this.musicService!;
            for (const service of [game, anime, movie, series, book, manga, music]) service.invalidateCache();
            return loadStatisticsLibrary({ game: () => game.loadGames(), anime: () => anime.loadAnime(), movie: () => movie.loadItems(), series: () => series.loadItems(), book: () => book.loadItems(), manga: () => manga.loadItems(), music: () => music.loadItems() }, path => {
                const file = this.app.vault.getAbstractFileByPath(path); return file instanceof TFile ? file.stat.ctime : undefined;
            });
        }, () => this.settings, item => this.showEditModal(item, () => { void modal.reload(); }), async preferences => {
            this.settings.statisticsDashboard = preferences;
            await this.saveSettings();
        }, value => this.metadataService?.getImageUrl(value) ?? null);
        modal.open();
        return modal;
    }

    /**
     * Show delete confirmation modal
     */
    showDeleteModal(game: MediaItem, onConfirm: () => Promise<void>): void {
        const modal = new DeleteModal(this.app, game, onConfirm);
        modal.open();
    }

    addMediaItem(mediaType: MediaType): void {
        if (mediaType === 'music' && this.musicService) {
            const service = this.musicService;
            new MusicSearchModal(this.app, this.settings, service, () => this.refreshViews(), () => this.showInbox('music')).open();
            return;
        }
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

    getCommunityLinksService(): CommunityLinksService {
        return this.communityLinksService ??= new CommunityLinksService(this.settings.communityLinkCache, async cache => {
            this.settings.communityLinkCache = cache;
            await this.saveData(this.settings);
        });
    }

    getAnimeService(): AnimeService | null {
        return this.animeService;
    }

    getMetadataService(): MetadataService | null {
        return this.metadataService;
    }

    showInbox(kind: TemplateKind = 'games', presentation?: InlineSyncPresentation): void {
        if (!this.integrationService || !this.musicService) return;
        this.inboxService ??= new InboxService(this.app, () => this.settings, () => this.saveSettings());
        this.inboxImporter ??= new InboxImporter(this.app, () => this.settings, this.integrationService, this.musicService);
        const refresh = (): void => {
            this.gameService?.invalidateCache(); this.animeService?.invalidateCache(); this.movieService?.invalidateCache();
            this.seriesService?.invalidateCache(); this.bookService?.invalidateCache(); this.mangaService?.invalidateCache(); this.musicService?.invalidateCache();
            this.refreshViews();
        };
        if (presentation) mountInbox(this.app, presentation, this.inboxService, this.inboxImporter, () => this.settings, kind, refresh);
        else new InboxModal(this.app, this.inboxService, this.inboxImporter, () => this.settings, kind, refresh).open();
    }

    getIntegrationService(): IntegrationService | null {
        return this.integrationService;
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

    getMusicService(): MusicService | null { return this.musicService; }

    getMangaService(): ReadingService | null {
        return this.mangaService;
    }

    private async checkReleaseUpdate(): Promise<void> {
        const action = getReleaseStartupAction(this.manifest.version, this.settings.lastSeenReleaseVersion, this.existingInstall);
        if (action === 'none') return;
        if (action === 'show') this.showWhatsNew();
        const previous = this.settings.lastSeenReleaseVersion;
        this.settings.lastSeenReleaseVersion = this.manifest.version;
        try {
            // Only persist the marker; do not refresh views or restart effects on startup.
            await this.saveData(this.settings);
        } catch (error) {
            this.settings.lastSeenReleaseVersion = previous;
            console.error('LOREBASE: unable to remember release version', error);
            new Notice(getReleaseCopy(this.settings.language).saveFailed);
        }
    }

    showWhatsNew(): void {
        this.releaseReturnCleanup?.();
        this.releaseReturnCleanup = undefined;
        this.releaseDestination?.close();
        this.releaseDestination = undefined;
        this.releaseModal?.close();
        this.releaseModal ??= new WhatsNewModal(this);
        this.releaseModal.open();
    }

    offerReleaseReturn(): void {
        this.releaseReturnCleanup?.();
        this.releaseReturnCleanup = mountReleaseReturn(
            this.releaseModal?.modalEl?.ownerDocument ?? document,
            this.settings.language,
            () => this.showWhatsNew(),
        );
    }

    async openReleaseTarget(target: ReleaseTarget): Promise<boolean> {
        const copy = getReleaseCopy(this.settings.language);
        const settingsApi = (this.app as unknown as { setting?: {
            open: () => void; close: () => void; openTabById: (id: string) => void;
        } }).setting;
        try {
            if (target === 'statistics') {
                settingsApi?.close();
                this.releaseDestination = this.showStatsModal();
                return true;
            }
            if (target === 'adding') {
                await this.activateView();
                const view = this.app.workspace.getLeavesOfType(VIEW_TYPE_LIBRARY)[0]?.view;
                const button = view instanceof LibraryView ? view.contentEl.querySelector<HTMLElement>('.lorebase-add-btn') : null;
                if (!button) { new Notice(copy.failed); return false; }
                settingsApi?.close();
                requestAnimationFrame(() => highlightReleaseTarget(button));
                return true;
            }
            if (target === 'librarySearch') {
                await this.activateView();
                const view = this.app.workspace.getLeavesOfType(VIEW_TYPE_LIBRARY)[0]?.view;
                const input = view instanceof LibraryView
                    ? view.contentEl.querySelector<HTMLInputElement>('.lorebase-search-input') : null;
                if (!input) { new Notice(copy.failed); return false; }
                settingsApi?.close();
                requestAnimationFrame(() => highlightReleaseTarget(input));
                return true;
            }
            if (target === 'calendar' || target === 'groups') {
                await this.activateView();
                const view = this.app.workspace.getLeavesOfType(VIEW_TYPE_LIBRARY)[0]?.view;
                if (!(view instanceof LibraryView)) { new Notice(copy.failed); return false; }
                settingsApi?.close();
                this.releaseDestination = target === 'calendar' ? view.showReleaseCalendar() : view.showCustomGroups();
                if (this.releaseDestination) {
                    const destination = this.releaseDestination as { modalEl?: HTMLElement };
                    highlightReleaseTarget(destination.modalEl?.querySelector<HTMLElement>(target === 'calendar'
                        ? '.lorebase-release-calendar' : '.lorebase-groups-header'));
                }
                return true;
            }
            if (target === 'music' && this.isMediaTypeEnabled('music')) {
                await this.switchMediaType('music');
                settingsApi?.close();
                const view = this.app.workspace.getLeavesOfType(VIEW_TYPE_LIBRARY)[0]?.view;
                if (view instanceof LibraryView) highlightReleaseTarget(view.contentEl.querySelector<HTMLElement>('.lorebase-media-trigger'));
                return true;
            }
            if (!settingsApi || !this.lorebaseSettingTab) {
                new Notice(copy.failed);
                return false;
            }
            settingsApi.open();
            settingsApi.openTabById(this.manifest.id);
            if (target === 'music') {
                this.lorebaseSettingTab.openFeatureSettings('music');
                new Notice(copy.enableMusic);
            } else if (target === 'statuses') {
                this.lorebaseSettingTab.openSection('customization', '.lorebase-status-plans-group');
            } else if (target === 'mangaTypes') {
                this.lorebaseSettingTab.openMangaWorkTypes();
            } else if (target === 'vndb') {
                this.lorebaseSettingTab.openSection('integrations', '.lorebase-provider-picker');
            } else if (target === 'animeOrigin') {
                this.lorebaseSettingTab.openFeatureSettings('animeOrigin');
            } else if (target === 'integrations') {
                this.lorebaseSettingTab.openSection('integrations', '.lorebase-provider-picker');
            } else if (target === 'templates') {
                this.lorebaseSettingTab.openSection('templates', '.lorebase-integration-templates-group');
            } else {
                this.lorebaseSettingTab.openFeatureSettings(target);
            }
            return true;
        } catch (error) {
            console.error('LOREBASE: unable to open release target', error);
            new Notice(copy.failed);
            return false;
        }
    }

    manageMangaWorkTypes(onChanged?: () => void): void { this.manageMediaWorkTypes('manga', onChanged); }

    manageMediaWorkTypes(type: WorkTypeMedia | 'anime', onChanged?: () => void): void {
        const settingsApi = (this.app as unknown as { setting?: { open: () => void; openTabById: (id: string) => void } }).setting;
        if (!settingsApi || !this.lorebaseSettingTab) return;
        settingsApi.open();
        settingsApi.openTabById(this.manifest.id);
        this.lorebaseSettingTab.openMangaWorkTypes(onChanged, type === 'game' ? 'games' : type === 'movie' ? 'movies' : type);
    }

    getSteamSyncService(): SteamSyncService | null {
        return this.steamSyncService;
    }

    getAniListSyncService(): AniListSyncService | null {
        return this.aniListSyncService;
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

    applyParticles(): void {
        if (!this.particleService) {
            this.particleService = new ParticleService();
        }
        this.particleService.apply(this.settings.particleEffect, this.settings.particleIntensity, this.settings.animateParticlesWithReducedMotion);
    }

    private getEnabledMedia(): MediaType[] {
        const enabled: MediaType[] = [];
        if (this.settings.enabledMedia?.games) enabled.push('game');
        if (this.settings.enabledMedia?.anime) enabled.push('anime');
        if (this.settings.enabledMedia?.movies) enabled.push('movie');
        if (this.settings.enabledMedia?.series) enabled.push('series');
        if (this.settings.enabledMedia?.books) enabled.push('book');
        if (this.settings.enabledMedia?.manga) enabled.push('manga');
        if (this.settings.enabledMedia?.music) enabled.push('music');
        return enabled;
    }

    private isMediaTypeEnabled(mediaType: MediaType): boolean {
        if (mediaType === 'music') return Boolean(this.settings.enabledMedia.music);
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
            this.settings.enabledMedia = { games: true, anime: false, movies: false, series: false, books: false, manga: false, music: false };
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

    async runSteamSync(presentation?: InlineSyncPresentation): Promise<void> {
        if (presentation?.signal.aborted) return;
        if (!this.steamSyncService) return;
        if (this.steamSyncRunning) {
            if (presentation) renderInlineSteamState(presentation, this.settings.language, 'error', new Error('Steam Sync is already running.'), () => { void this.runSteamSync(presentation); });
            new Notice('Steam Sync is already running.');
            return;
        }
        this.steamSyncRunning = true;

        let progressModal: SteamSyncProgressModal | null = null;
        try {
            if (presentation) renderInlineSteamState(presentation, this.settings.language, 'loading');
            else new Notice('Steam Sync: loading Steam games...');
            const preview = this.steamSyncService.previewImport(this.settings);
            const candidates = presentation ? await waitForInlinePreview(preview, presentation.signal) : await preview;
            if (!candidates || presentation?.signal.aborted) return;
            for (const warning of this.steamSyncService.consumeWarnings()) {
                new Notice(`Steam Sync: ${warning}`, 6000);
            }
            if (!candidates.length) {
                if (presentation) renderInlineSteamState(presentation, this.settings.language, 'empty');
                else new Notice('Steam Sync: no games found.');
                return;
            }

            const review = new SteamSyncReviewModal(this.app, candidates, this.settings.language,
                ids => this.steamSyncService!.resolvePreviewNames(ids));
            const selectedAppIds = await (presentation ? review.mountInline(presentation) : review.openAndGetValue());
            if (presentation?.signal.aborted) return;
            if (!selectedAppIds || selectedAppIds.size === 0) {
                if (presentation) presentation.onBack();
                else new Notice('Steam Sync: import cancelled.');
                return;
            }

            const selectedCandidates = candidates.filter((candidate) => selectedAppIds.has(candidate.appId));
            progressModal = new SteamSyncProgressModal(this.app, selectedCandidates, this.settings.language);
            if (presentation) progressModal.mountInline(presentation);
            else progressModal.open();

            let haltReason: 'cancelled' | 'blocked' | null = null;
            const result = await this.steamSyncService.sync(this.settings, {
                signal: presentation?.signal,
                candidates: selectedCandidates,
                control: progressModal.getController(),
                onItemStart: (candidate, index, total) => progressModal?.setCurrent(candidate, index, total),
                onItemResult: (item) => progressModal?.addResult(item),
                onHalt: (reason) => {
                    haltReason = reason;
                    progressModal?.halt(reason);
                },
            });
            if (!this.steamSyncService) return;
            progressModal.complete(result);
            this.gameService?.invalidateCache();
            this.refreshViews();
            const summary = `${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.failed} failed.`;
            if (!presentation) new Notice(haltReason === 'cancelled'
                ? `Steam Sync cancelled: ${summary}`
                : haltReason === 'blocked'
                    ? `Steam Sync stopped by Steam cooldown: ${summary}`
                    : `Steam Sync complete: ${summary}`);
        } catch (error) {
            console.error('[Steam Sync] Sync failed:', error);
            progressModal?.fail(error);
            const message = error instanceof Error ? `: ${error.message}` : '';
            if (presentation && !progressModal) renderInlineSteamState(presentation, this.settings.language, 'error', error, () => { void this.runSteamSync(presentation); });
            else new Notice(`Steam Sync failed${message}`);
        } finally {
            this.steamSyncRunning = false;
        }
    }

    async runAniListSync(): Promise<void> {
        if (!this.aniListSyncService) return;
        if (this.aniListSyncRunning) {
            new Notice('AniList Sync is already running.');
            return;
        }
        this.aniListSyncRunning = true;
        try {
            new Notice('AniList Sync: syncing anime and manga...');
            const username = this.settings.anilistSync.username.trim()
                || await this.aniListSyncService.testConnection(this.settings.anilistSync);
            if (!this.settings.anilistSync.username.trim()) {
                this.settings.anilistSync.username = username;
            }
            const result = await this.aniListSyncService.sync(this.settings);
            if (!this.aniListSyncService) return;
            await this.saveSettings();
            this.animeService?.invalidateCache();
            this.mangaService?.invalidateCache();
            this.refreshViews();
            new Notice(`AniList Sync${result.cancelled ? ' · ' + t('commonCancel') : ''}: ${result.imported} imported, ${result.updatedLocal} updated, ${result.pushed} pushed, ${result.skipped} skipped, ${result.failed} failed.`);
        } catch (error) {
            if (!this.aniListSyncService) return;
            console.error('[AniList Sync] Sync failed:', error);
            new Notice(`AniList Sync failed${error instanceof Error ? `: ${error.message}` : ''}`);
        } finally {
            this.aniListSyncRunning = false;
        }
    }

    async runAniListImport(presentation?: InlineSyncPresentation): Promise<void> {
        const accountAtPreview = JSON.stringify([this.settings.anilistSync.accessToken, this.settings.anilistSync.username, this.settings.anilistSync.clientId]);
        if (!this.aniListSyncService || presentation?.signal.aborted) return;
        const showState = (state: 'loading' | 'empty' | 'error', error?: unknown): void => {
            if (presentation) renderInlineImportState(presentation, this.settings.language, state, error,
                state === 'error' ? () => { void this.runAniListImport(presentation); } : undefined, 'anilist');
        };
        if (this.aniListSyncRunning) {
            const error = new Error(t('settingsImportBusy'));
            if (presentation) showState('error', error); else new Notice(error.message);
            return;
        }
        this.aniListSyncRunning = true;
        let progress: SteamSyncProgressModal | undefined;
        try {
            if (presentation) showState('loading'); else new Notice('AniList Import: loading anime and manga...');
            const work = this.aniListSyncService.previewImport(this.settings);
            const candidates = presentation ? await waitForInlinePreview(work, presentation.signal) : await work;
            if (!candidates || presentation?.signal.aborted) return;
            if (!candidates.length) {
                if (presentation) showState('empty'); else new Notice('AniList Import: no entries found.');
                return;
            }
            const review = new AniListImportReviewModal(this.app, candidates, this.settings.language);
            const selected = await (presentation ? review.mountInline(presentation) : review.openAndGetValue());
            if (presentation?.signal.aborted) return;
            if (!selected?.size) { presentation?.onBack(); return; }
            if (accountAtPreview !== JSON.stringify([this.settings.anilistSync.accessToken, this.settings.anilistSync.username, this.settings.anilistSync.clientId])) throw new Error('AniList account changed. Open the import preview again.');
            const items = candidates.filter(item => selected.has(item.key));
            const display = items.map((item, index) => ({ appId: index + 1, name: item.title, poster: item.image,
                playtimeForever: 0, source: 'owned' as const }));
            const byKey = new Map(items.map((item, index) => [item.key, display[index]]));
            const completed = new Set<string>();
            progress = new SteamSyncProgressModal(this.app, display, this.settings.language, 'anilist');
            if (presentation) progress.mountInline(presentation); else progress.open();
            const result = await this.aniListSyncService.importSelected(this.settings, selected, {
                signal: presentation?.signal,
                control: progress.getController(),
                onItemStart: key => { const item = byKey.get(key); if (item) progress!.setCurrent(item, 0, items.length); },
                onItemResult: (key, outcome, detail) => {
                    const item = byKey.get(key); if (!item) return;
                    completed.add(key);
                    progress!.addResult({ appId: item.appId, name: item.name, outcome, detail, durationMs: 0 });
                },
            });
            if (!this.aniListSyncService) return;
            if (result.cancelled) progress.halt('cancelled');
            // Entries removed from AniList since preview have no work to apply.
            if (!result.cancelled && !progress.getController().isCancelled()) for (const [key, item] of byKey) if (!completed.has(key)) {
                result.skipped++;
                progress.addResult({ appId: item.appId, name: item.name, outcome: 'skipped', durationMs: 0 });
            }
            progress.complete({ created: result.imported, updated: result.updatedLocal, skipped: result.skipped, failed: result.failed });
            await this.saveSettings();
            this.animeService?.invalidateCache();
            this.mangaService?.invalidateCache();
            this.refreshViews();
        } catch (error) {
            console.error('[AniList Import] Import failed:', error);
            if (progress) progress.fail(error);
            else if (presentation) showState('error', error);
            else new Notice(`AniList Import failed${error instanceof Error ? `: ${error.message}` : ''}`);
        } finally {
            this.aniListSyncRunning = false;
        }
    }

    async authorizeAniList(): Promise<void> {
        if (!this.aniListSyncService) return;
        const settings = this.settings.anilistSync;
        if (!settings.clientId.trim()) {
            new Notice('AniList Sync: enter the Client ID first.');
            return;
        }
        window.open(this.aniListSyncService.getAuthorizationUrl(settings.clientId), '_blank', 'noopener');
        new Notice('AniList: approve access, copy the displayed token, then paste it into the Access token field in LOREBASE.', 8000);
    }

    async connectPlayStation(npsso: string): Promise<void> {
        if (!this.playstationSyncService) throw new Error('PSN_CONNECT_FIRST');
        const controller = new AbortController(); this.playstationControllers.add(controller);
        try { await this.playstationSyncService.api.connect(npsso, controller.signal); await this.saveSettings(); }
        finally { this.playstationControllers.delete(controller); }
    }
    async disconnectPlayStation(): Promise<void> {
        for (const controller of this.playstationControllers) controller.abort();
        this.playstationSyncService?.api.disconnect();
        await this.saveSettings();
    }
    runPlayStationImport(): void {
        if (!this.playstationSyncService || this.playstationImportModal) return;
        if (this.playstationSyncRunning) { new Notice(pt('busy')); return; }
        this.playstationImportModal = new PlayStationImportModal(this.app, this.playstationSyncService,
            () => { this.gameService?.invalidateCache(); this.refreshViews(); },
            () => { this.playstationImportModal = undefined; });
        this.playstationImportModal.open();
    }
    async runPlayStationSync(silent = false): Promise<void> {
        if (!this.playstationSyncService || this.playstationSyncRunning || this.playstationImportModal) { if (!silent) new Notice(pt('busy')); return; }
        this.playstationSyncRunning = true;
        const controller = new AbortController(); this.playstationControllers.add(controller);
        try {
            const result = await this.playstationSyncService.syncLinked(controller.signal);
            if (!controller.signal.aborted) {
                this.gameService?.invalidateCache(); this.refreshViews();
                if (!silent) new Notice(pt('updated') + ': ' + result.updated + ' · ' + pt('errors') + ': ' + result.failed + (result.partial ? '\n' + pt('partial') : ''), 7000);
            }
        } catch (error) { if (!silent && !controller.signal.aborted) new Notice(psnError(error)); }
        finally { this.playstationSyncRunning = false; this.playstationControllers.delete(controller); }
    }
    async connectTrakt(): Promise<void> {
        if (!this.traktSyncService || this.traktLoginModal) return;
        const modal = new TraktLoginModal(this.app, this.traktSyncService); this.traktLoginModal = modal;
        try { const connected = await modal.openAndGetValue(); if (connected && this.traktSyncService) { this.settings.traktSync = connected; await this.saveSettings(); } }
        catch (error) { new Notice(traktError(error)); }
        finally { this.traktLoginModal = undefined; }
    }

    runTraktImport(): void {
        if (!this.traktSyncService || this.traktImportModal) return;
        if (this.traktSyncRunning) { new Notice(tt('busy')); return; }
        this.traktImportModal = new TraktImportModal(this.app, this.traktSyncService, () => this.saveData(this.settings), () => {
            this.movieService?.invalidateCache(); this.seriesService?.invalidateCache(); this.refreshViews();
        }, () => { this.traktImportModal = undefined; });
        this.traktImportModal.open();
    }

    async runTraktSync(silent = false): Promise<void> {
        if (!this.traktSyncService || this.traktSyncRunning || this.traktImportModal) { if (!silent) new Notice(tt('busy')); return; }
        this.traktSyncRunning = true; const controller = new AbortController(); this.traktControllers.add(controller);
        try {
            const result = await this.traktSyncService.syncLinked(controller.signal);
            if (!controller.signal.aborted) { this.movieService?.invalidateCache(); this.seriesService?.invalidateCache(); this.refreshViews(); if (!silent) new Notice(`${tt('updated')}: ${result.updated} · ${tt('errors')}: ${result.failed}${result.skipped ? ` · ${tt('needsReview')}: ${result.skipped}` : ''}`, 6000); }
        } catch (error) { if (!controller.signal.aborted && !silent) new Notice(traktError(error)); }
        finally { this.traktSyncRunning = false; this.traktControllers.delete(controller); try { await this.saveData(this.settings); } catch { console.error('[LOREBASE] Could not save Trakt account state'); } }
    }

    async runNoteImport(surface?: { host: HTMLElement; signal: AbortSignal }): Promise<void> {
        if (!this.noteConversionService || surface?.signal.aborted) return;
        if (this.noteImportRunning) {
            new Notice(t('settingsImportBusy'));
            return;
        }
        this.noteImportRunning = true;

        try {
            const settings = structuredClone(this.settings);
            if (!surface) new Notice(t('settingsImportScanning'));
            const preview = await this.noteConversionService.preview(settings);
            if (!this.noteConversionService || surface?.signal.aborted) return;
            surface?.host.empty();
            for (const warning of preview.warnings) new Notice(warning, 5000);
            if (!preview.items.length) {
                if (surface) surface.host.createDiv({ cls: 'lorebase-nir-empty', text: t('settingsImportEmpty'), attr: { role: 'status' } });
                else new Notice(t('settingsImportEmpty'));
                return;
            }

            const options: NoteImportReviewOptions = {
                items: preview.items,
                writeMode: settings.noteImport.writeMode,
                language: settings.language,
                targetFolders: {
                    games: settings.games.folderPath,
                    anime: settings.anime.folderPath,
                    movies: settings.movies.folderPath,
                    series: settings.series.folderPath,
                    books: settings.books.folderPath,
                    manga: settings.manga.folderPath,
                    music: settings.music.folderPath,
                },
                showTypeSelector: settings.noteImport.targetMedia === 'auto',
                onFindSource: async (item, kind) =>
                    this.integrationService?.selectMediaSource(kind, item.title) ?? null,
            };
            const review = surface
                ? await reviewNoteImportInline(surface.host, options, surface.signal)
                : await new NoteImportReviewModal(this.app, options).openAndGetValue();
            if (!review || !review.selectedIds.size || surface?.signal.aborted) return;

            const enrichments: Record<string, Record<string, unknown>> = {};
            if (this.integrationService) {
                const cooldownMs = Math.max(
                    0,
                    Number(this.settings.integrations?.requestCooldownSeconds ?? 0)
                ) * 1000;
                let attemptedRequest = false;
                for (const id of review.selectedIds) {
                    if (!this.integrationService || !this.noteConversionService || surface?.signal.aborted) return;
                    const source = review.sourcesById[id];
                    const target = review.targetMediaById[id];
                    if (!source || !target || target === 'music') continue;
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

            if (!this.noteConversionService || surface?.signal.aborted) return;
            const result = await this.noteConversionService.apply(settings, review, enrichments, (path) => {
                new Notice(`LOREBASE import: ${path}`, 1000);
            }, surface?.signal);
            if (!this.noteConversionService || surface?.signal.aborted) return;
            this.invalidateAllServiceCaches();
            this.refreshViews();
            new Notice(`LOREBASE import ${result.cancelled ? 'cancelled' : 'complete'}: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.failed} failed.`);
        } catch (error) {
            if (!this.noteConversionService || surface?.signal.aborted) return;
            if (error instanceof Error && error.name === 'AbortError') { new Notice(t('commonCancel')); return; }
            console.error('[LOREBASE Note Import] Import failed:', error);
            const message = error instanceof Error ? `: ${error.message}` : '';
            new Notice(`${t('settingsImportFailed')}${message}`);
        } finally {
            this.noteImportRunning = false;
        }
    }

    private invalidateAllServiceCaches(): void {
        this.gameService?.invalidateCache();
        this.animeService?.invalidateCache();
        this.movieService?.invalidateCache();
        this.seriesService?.invalidateCache();
        this.bookService?.invalidateCache();
        this.mangaService?.invalidateCache();
        this.musicService?.invalidateCache();
    }

    async runSteamTrackingSync(): Promise<void> {
        if (!this.steamSyncService || this.steamSyncRunning) { new Notice(gt('loading')); return; }
        this.steamSyncRunning = true;
        const notice = new Notice(gt('loading'), 0);
        try {
            const result = await this.steamSyncService.syncTrackingForExisting(this.settings, (index, total) => notice.setMessage(`${gt('loading')} ${index} / ${total}`));
            if (!this.steamSyncService) return;
            this.gameService?.invalidateCache(); this.refreshViews();
            new Notice(`${result.cancelled ? t('commonCancel') + ' · ' : ''}${gt('syncResult')}: ${result.updated} / ${result.partial} / ${result.failed} / ${result.skipped}`, 8000);
        } catch { new Notice(gt('failed')); }
        finally { notice.hide(); this.steamSyncRunning = false; }
    }

    private async runSteamPlaytimeSync(): Promise<void> {
        if (!this.steamSyncService) return;

        try {
            const result = await this.steamSyncService.syncPlaytimeForExisting(this.settings);
            if (!this.steamSyncService || result.cancelled) return;
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
            { type: 'game', enabled: this.settings.enabledMedia.games, label: t('contextGames'), icon: MEDIA_ICONS.game },
            { type: 'anime', enabled: this.settings.enabledMedia.anime, label: t('contextAnime'), icon: MEDIA_ICONS.anime },
            { type: 'movie', enabled: this.settings.enabledMedia.movies, label: t('settingsMovies'), icon: MEDIA_ICONS.movie },
            { type: 'series', enabled: this.settings.enabledMedia.series, label: t('settingsSeries'), icon: MEDIA_ICONS.series },
            { type: 'book', enabled: this.settings.enabledMedia.books, label: t('settingsBooks'), icon: MEDIA_ICONS.book },
            { type: 'manga', enabled: this.settings.enabledMedia.manga, label: t('settingsManga'), icon: MEDIA_ICONS.manga },
            { type: 'music', enabled: this.settings.enabledMedia.music, label: mt('music'), icon: MEDIA_ICONS.music },
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
