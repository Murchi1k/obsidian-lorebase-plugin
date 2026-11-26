import { CARD_MEDIA_KEYS, getCardProfile } from '../services/media/cardProfiles';
import { withReleaseCountdown } from '../utils/releaseCountdown';
import { MusicService } from '../services/MusicService';
import type { MusicItem } from '../types';
import { mt } from '../localization/music';
/**
 * LOREBASE - Library View
 * Main view for displaying the game library with virtualized rendering
 */

import { ItemView, WorkspaceLeaf, TFile, TAbstractFile, setIcon, Platform } from 'obsidian';
import { getStatusAppearance } from '../statusPresentation';
import { AnimeItem, CustomMediaGroup, FieldDefinition, GameItem, LibraryViewState, MangaItem, MediaItem, MediaStatus, MediaType, FilterState, LorebaseSettings, LorebasePluginInterface, MovieItem, ReadingItem, SeriesItem, ViewMode, SortField } from '../types';
import { GameService } from '../services/GameService';
import { AnimeService } from '../services/AnimeService';
import { VideoService } from '../services/VideoService';
import { ReadingService } from '../services/ReadingService';
import { MetadataService } from '../services/MetadataService';
import { Toolbar, ToolbarCallbacks } from '../components/Toolbar';
import { GameCard } from '../components/GameCard';
import { VIEW_TYPE_LIBRARY, VIRTUALIZATION_BUFFER, LOREBASE_ICON_ID, SERIES_COLORS, DEFAULT_GAME_TAG_PRESETS, DEFAULT_SETTINGS } from '../constants';
import { t, i18n } from '../localization';
import { VirtualGrid, VirtualGridController, VirtualGroupedGrid } from './library/VirtualGrid';
import { BackToTop } from './library/BackToTop';
import { SmoothScroll } from './library/SmoothScroll';
import { showMediaContextMenu } from './library/contextMenu';
import { CompletionDateModal } from '../modals/CompletionDateModal';
import { EffectiveLayout, LayoutCalculator } from './library/LayoutCalculator';
import { RenderScrollMode, ScrollAnchor, ScrollManager } from './library/ScrollManager';
import { CardRect, planCardReflow } from './library/cardReflow';
import { renderRatingBadgeContent } from '../components/RatingBadgeContent';
import { getMediaWorkTypeColor, getMediaWorkTypeLabel } from '../utils/mediaWorkType';
import { ReleaseCalendarModal } from '../modals/ReleaseCalendarModal';
import { CustomGroupsModal } from '../modals/CustomGroupsModal';
import { setGroupMembership } from '../services/media/customGroups';
import { buildLibraryFieldCatalog, reconcileCatalogYamlField } from '../services/media/libraryFieldCatalog';
import { getTitleSearchMatch } from '../services/media/titleSearch';
import {
    collectToolbarTags,
    getBuiltInFieldDefinitions,
    getFilterFlagsForMediaType,
    getRandomLabelForMediaType,
    getRandomTitleLabelForMediaType,
    getSortOptionsForMediaType,
    getStatusOptionsForMediaType,
} from './library/viewOptions';
import {
    applyViewModeClass,
    applyGridLayout,
    createGrid,
    renderRandomCard,
} from './library/rendering';
import {
    cloneLibraryViewState,
    groupMediaItems,
} from '../services/media/libraryViewState';

type AppSettingsApi = { open: () => void; openTabById: (id: string) => void };
type IdleDeadlineLike = { didTimeout: boolean; timeRemaining: () => number };
type IdleWindowLike = Window & {
    requestIdleCallback?: (
        callback: (deadline: IdleDeadlineLike) => void,
        options?: { timeout: number }
    ) => number;
    cancelIdleCallback?: (handle: number) => void;
};
type CardRenderTask = {
    parent: HTMLElement;
    item: MediaItem;
};

const VISUAL_REFRESH_IDLE_TIMEOUT_MS = 50;
const VISUAL_REFRESH_FALLBACK_MS = 120;
const CARD_RENDER_BATCH_SIZE = 8;
const OPTIMISTIC_METADATA_SUPPRESS_MS = 1200;
const LAYOUT_RESIZE_SETTLE_MS = 100;

// =============================================================================
// LIBRARY VIEW
// =============================================================================

/**
 * Main library view with virtualized card grid
 */
export class LibraryView extends ItemView {
    private plugin: LorebasePluginInterface;
    private gameService: GameService;
    private animeService: AnimeService;
    private movieService: VideoService;
    private seriesService: VideoService;
    private bookService: ReadingService;
    private mangaService: ReadingService;
    private musicService: MusicService;
    private toolbar: Toolbar | null = null;
    private libraryContentEl: HTMLElement | null = null;
    private gridEl: HTMLElement | null = null;
    private isDestroyed = false; // Track if view has been destroyed

    // State
    private games: MediaItem[] = [];
    private gameIndex: Map<string, number> = new Map(); // filePath → index in games[]
    private filteredGames: MediaItem[] = [];
    private hasPartSearchMatches = false;
    private viewMode: ViewMode = 'grid';
    private mediaType: MediaType = 'game';
    private filter: FilterState = {
        statuses: [],
        favoriteOnly: false,
        adultOnly: false,
        customOnly: false,
        searchTerm: '',
        tags: [],
        genres: [],
        workTypes: [],
        rules: [],
    };
    private viewState: LibraryViewState = cloneLibraryViewState(DEFAULT_SETTINGS.games.viewState);
    private tagsDirty = true;
    private cachedLayout: EffectiveLayout | null = null;
    private layoutCalculator: LayoutCalculator;
    private scrollManager: ScrollManager;

    // Virtualization state
    private virtualGrid: VirtualGridController | null = null;
    private backToTop: BackToTop | null = null;
    private smoothScroll: SmoothScroll | null = null;
    private visualRefreshRafId: number | null = null;
    private visualRefreshIdleId: number | null = null;
    private visualRefreshScheduled = false;
    private filterRafId: number | null = null;
    private cardBatchRafId: number | null = null;
    private contentRevealAnimations = new Set<Animation>();
    private cardReflowAnimations = new Set<Animation>();
    private resizeObserver: ResizeObserver | null = null;
    private lastObservedLayoutWidth: number | null = null;
    private lastObservedLayoutHeight: number | null = null;
    private resizeLayoutRafId: number | null = null;
    private resizeSettleTimerId: number | null = null;
    private renderVersion = 0;
    private loadGeneration = 0;
    private pendingFilterScrollMode: RenderScrollMode = 'none';
    private pendingFilterScrollTop: number | null = null;
    private editScrollRestore: { filePath: string; scrollTop: number } | null = null;
    private editScrollRestoreTimerId: number | null = null;
    private optimisticMutations = new Map<string, number>();

    constructor(leaf: WorkspaceLeaf, plugin: LorebasePluginInterface) {
        super(leaf);
        this.plugin = plugin;
        const sharedGameService = this.plugin.getGameService();
        const sharedAnimeService = this.plugin.getAnimeService();
        const sharedMovieService = this.plugin.getMovieService();
        const sharedSeriesService = this.plugin.getSeriesService();
        const sharedBookService = this.plugin.getBookService();
        const sharedMangaService = this.plugin.getMangaService();
        const sharedMetadataService = this.plugin.getMetadataService() ?? new MetadataService(this.app);

        this.musicService = this.plugin.getMusicService?.() ?? new MusicService(this.app, this.plugin.settings.music.folderPath, sharedMetadataService);
        this.gameService = sharedGameService instanceof GameService
            ? sharedGameService
            : new GameService(this.app, sharedMetadataService);
        this.animeService = sharedAnimeService instanceof AnimeService
            ? sharedAnimeService
            : new AnimeService(this.app, sharedMetadataService);
        this.movieService = sharedMovieService instanceof VideoService
            ? sharedMovieService
            : new VideoService(this.app, 'movie', this.plugin.settings.movies.folderPath, sharedMetadataService);
        this.seriesService = sharedSeriesService instanceof VideoService
            ? sharedSeriesService
            : new VideoService(this.app, 'series', this.plugin.settings.series.folderPath, sharedMetadataService);
        this.bookService = sharedBookService instanceof ReadingService
            ? sharedBookService
            : new ReadingService(this.app, 'book', this.plugin.settings.books.folderPath, sharedMetadataService);
        this.mangaService = sharedMangaService instanceof ReadingService
            ? sharedMangaService
            : new ReadingService(this.app, 'manga', this.plugin.settings.manga.folderPath, sharedMetadataService);
        this.layoutCalculator = new LayoutCalculator(() => (
            this.libraryContentEl?.clientWidth || this.contentEl.clientWidth
        ), () => Platform.isMobile || Boolean(this.containerEl.ownerDocument.defaultView?.matchMedia('(max-width: 520px)').matches));
        this.scrollManager = new ScrollManager(
            () => this.contentEl,
            () => this.isDestroyed
        );
    }

    getViewType(): string {
        return VIEW_TYPE_LIBRARY;
    }

    getDisplayText(): string {
        return 'LOREBASE';
    }

    getIcon(): string {
        return LOREBASE_ICON_ID;
    }

    async onOpen(): Promise<void> {
        try {
            // Apply settings
            const settings = this.plugin.settings;
            this.mediaType = this.plugin.getMediaType();
            const activeSettings = this.getActiveSettings();
            this.setViewState(activeSettings.viewState, false);
            i18n.setLanguage(settings.language);
            this.gameService.setFolderPath(settings.games.folderPath);
            this.animeService.setFolderPath(settings.anime.folderPath);
            this.movieService.setFolderPath(settings.movies.folderPath);
            this.seriesService.setFolderPath(settings.series.folderPath);
            this.bookService.setFolderPath(settings.books.folderPath);
            this.mangaService.setFolderPath(settings.manga.folderPath);
        this.musicService.setFolderPath(settings.music.folderPath);
            this.viewMode = activeSettings.orientation === 'horizontal' ? 'horizontal' : 'grid';

            // Use contentEl provided by ItemView
            const container = this.contentEl;
            container.empty();
            container.addClass('lorebase-view');
            container.tabIndex = -1;
            this.containerEl.addClass('lorebase-view-shell');
            this.backToTop?.destroy();
            this.backToTop = new BackToTop(this.containerEl, container);
            this.smoothScroll?.destroy();
            this.smoothScroll = new SmoothScroll(container, {
                onFrame: () => this.virtualGrid?.updateViewport(),
                onIdle: () => {
                    const hovered = container.querySelector<HTMLElement>('.lorebase-card:hover');
                    if (hovered) GameCard.refitOverlay(hovered);
                },
            });
            this.applyViewMode();

            // Apply accent color
            container.style.setProperty('--accent-color', settings.accentColor);

            // Create toolbar
            this.createToolbar(container);

            // Create content area
            this.libraryContentEl = container.createDiv({ cls: 'lorebase-content' });
            this.observeLayoutResize();

            // Load and render games
            await this.loadGames();

            // Register event listener for auto-updates
            this.registerEvent(
                this.app.metadataCache.on('changed', (file) => {
                    this.handleMetadataChange(file);
                })
            );

            // Register event listener for deletions
            this.registerEvent(
                this.app.vault.on('delete', (file) => {
                    this.handleFileDelete(file);
                })
            );

            this.registerEvent(
                this.app.vault.on('rename', (file, oldPath) => {
                    this.handleFileRename(file, oldPath);
                })
            );
        } catch (e) {
            console.error('Error opening library view:', e);
            this.showError(t('errorInitView'));
        }
    }

    async onClose(): Promise<void> {
        // Mark as destroyed FIRST to prevent any async operations
        this.isDestroyed = true;

        try {
            // Clean up virtualization first (removes scroll handlers)
            this.cleanupVirtualization();
            this.smoothScroll?.destroy();
            this.smoothScroll = null;
            this.backToTop?.destroy();
            this.backToTop = null;
            this.containerEl.removeClass('lorebase-view-shell');
            this.cancelScheduledFilter();
            this.cancelCardBatch();
            this.cancelContentAnimations();
            this.cancelScheduledVisualRefresh();
            this.cleanupLayoutResize();
            if (this.editScrollRestoreTimerId !== null) {
                window.clearTimeout(this.editScrollRestoreTimerId);
                this.editScrollRestoreTimerId = null;
            }

            // Destroy toolbar safely
            if (this.toolbar) {
                try {
                    this.toolbar.destroy();
                } catch (e) {
                    console.warn('Error destroying toolbar:', e);
                }
                this.toolbar = null;
            }
        } catch (e) {
            console.warn('Error closing library view:', e);
        } finally {
            // Nullify all references to prevent async access after destroy
            this.libraryContentEl = null;
            this.gridEl = null;
        }
    }

    /**
     * Handle file deletions for auto-update
     */
    private handleFileDelete(file: TAbstractFile): void {
        // Don't process if view is destroyed
        if (this.isDestroyed) return;

        // Only process if it's a TFile (not a folder)
        if (!(file instanceof TFile)) return;
        this.invalidateActiveServiceCache();
        this.updateCustomGroupPath(file.path, null);

        // Check if this file is in our games list (O(1) lookup)
        const index = this.gameIndex.get(file.path);

        if (index !== undefined) {
            // Remove from games array and rebuild index
            this.games.splice(index, 1);
            this.rebuildGameIndex();
            this.tagsDirty = true;
            this.applyFiltersAndSort({ scrollMode: 'preserve' });
        }
    }

    private handleFileRename(file: TAbstractFile, oldPath: string): void {
        if (this.isDestroyed) return;
        if (!(file instanceof TFile)) return;
        this.invalidateActiveServiceCache();
        this.updateCustomGroupPath(oldPath, file.path);

        const existingIndex = this.gameIndex.get(oldPath);
        const activeSettings = this.getActiveSettings();
        const isInLibraryFolder = file.path.startsWith(activeSettings.folderPath) && file.extension === 'md';
        const parsedItem = this.parseActiveItemFromCache(file);

        if (existingIndex !== undefined) {
            if (isInLibraryFolder && parsedItem) {
                this.games[existingIndex] = parsedItem;
            } else {
                this.games.splice(existingIndex, 1);
            }
            this.rebuildGameIndex();
            this.tagsDirty = true;
            this.applyFiltersAndSort({ scrollMode: 'preserve' });
            return;
        }

        if (isInLibraryFolder && parsedItem) {
            this.gameIndex.set(parsedItem.filePath, this.games.length);
            this.games.push(parsedItem);
            this.tagsDirty = true;
            this.applyFiltersAndSort({ scrollMode: 'preserve' });
        }
    }

    /**
     * Handle metadata changes for auto-update
     */
    private handleMetadataChange(file: TFile): void {
        // Don't process if view is destroyed
        if (this.isDestroyed) return;
        this.invalidateActiveServiceCache();

        // Check if this file is in our games list (O(1) lookup)
        const existingIndex = this.gameIndex.get(file.path);
        const activeSettings = this.getActiveSettings();
        const isInLibraryFolder = file.path.startsWith(activeSettings.folderPath) && file.extension === 'md';
        const parsedItem = this.parseActiveItemFromCache(file);

        if (existingIndex !== undefined) {
            if (this.shouldSuppressOptimisticMetadataRender(file.path)) {
                return;
            }
            // Existing item - update or remove if it no longer matches the active media type
            if (parsedItem) {
                const previousItem = this.games[existingIndex];
                const needsRender = !this.areMediaItemsEquivalent(previousItem, parsedItem);
                this.games[existingIndex] = parsedItem;
                if (!needsRender) {
                    return;
                }
            } else {
                this.games.splice(existingIndex, 1);
                this.rebuildGameIndex();
            }
            this.tagsDirty = true;
            const editScroll = this.getEditScrollRestore(file.path);
            this.applyFiltersAndSort(editScroll
                ? { scrollMode: 'position', scrollTop: editScroll.scrollTop }
                : { scrollMode: 'preserve' });
        } else if (isInLibraryFolder) {
            // It's a new item in the active media type
            if (parsedItem) {
                this.gameIndex.set(parsedItem.filePath, this.games.length);
                this.games.push(parsedItem);
                this.tagsDirty = true;
                const editScroll = this.getEditScrollRestore(file.path);
                this.applyFiltersAndSort(editScroll
                    ? { scrollMode: 'position', scrollTop: editScroll.scrollTop }
                    : { scrollMode: 'preserve' });
            }
        }
    }

    private updateCustomGroupPath(oldPath: string, newPath: string | null): void {
        let changed = false;
        const groups = this.plugin.settings.customGroups.map((group) => {
            if (!group.itemPaths.includes(oldPath)) return group;
            changed = true;
            const paths = group.itemPaths.filter((path) => path !== oldPath);
            if (newPath) paths.push(newPath);
            return { ...group, itemPaths: [...new Set(paths)], updatedAt: Date.now() };
        });
        if (changed) this.saveCustomGroups(groups);
    }

    private refreshFileFromCache(filePath: string): void {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return;
        this.handleMetadataChange(file);
    }

    private getEditScrollRestore(filePath: string): { filePath: string; scrollTop: number } | null {
        return this.editScrollRestore?.filePath === filePath ? this.editScrollRestore : null;
    }

    private beginEditScrollRestore(filePath: string, scrollTop: number): void {
        if (this.editScrollRestoreTimerId !== null) {
            window.clearTimeout(this.editScrollRestoreTimerId);
            this.editScrollRestoreTimerId = null;
        }
        this.editScrollRestore = { filePath, scrollTop };
    }

    private finishEditScrollRestore(filePath: string): void {
        if (this.editScrollRestoreTimerId !== null) {
            window.clearTimeout(this.editScrollRestoreTimerId);
        }
        this.editScrollRestoreTimerId = window.setTimeout(() => {
            this.editScrollRestoreTimerId = null;
            if (this.editScrollRestore?.filePath === filePath) {
                this.editScrollRestore = null;
            }
        }, 600);
    }

    private invalidateActiveServiceCache(): void {
        if (this.mediaType === 'anime') {
            this.animeService.invalidateCache();
        } else if (this.mediaType === 'movie') {
            this.movieService.invalidateCache();
        } else if (this.mediaType === 'series') {
            this.seriesService.invalidateCache();
        } else if (this.mediaType === 'book') {
            this.bookService.invalidateCache();
        } else if (this.mediaType === 'manga') {
            this.mangaService.invalidateCache();
        } else {
            this.gameService.invalidateCache();
        }
    }

    private parseActiveItemFromCache(file: TFile): MediaItem | null {
        if (this.mediaType === 'music') return this.musicService.parseFromCache(file);
        if (this.mediaType === 'anime') return this.animeService.parseAnimeFromCache(file);
        if (this.mediaType === 'movie') return this.movieService.parseFromCache(file);
        if (this.mediaType === 'series') return this.seriesService.parseFromCache(file);
        if (this.mediaType === 'book') return this.bookService.parseFromCache(file);
        if (this.mediaType === 'manga') return this.mangaService.parseFromCache(file);
        return this.gameService.parseGameFromCache(file);
    }

    /**
     * Create the toolbar
     */
    private createToolbar(container: HTMLElement): void {
        const callbacks: ToolbarCallbacks = {
            onMusicCoverModeChange: (kind, mode) => {
                if (kind !== 'track') this.plugin.settings.music.albumCoverMode = mode;
                if (kind !== 'album') this.plugin.settings.music.trackCoverMode = mode;
                void this.plugin.saveSettings();
                this.render({ scrollMode: 'preserve' });
            },
            onSortChange: (field, order) => {
                const activeSettings = this.getActiveSettings();
                activeSettings.sortField = field;
                activeSettings.sortOrder = order;
                this.viewState.sort = { field, order };
                activeSettings.viewState = cloneLibraryViewState(this.viewState);
                void this.plugin.saveSettings();
                this.applyFiltersAndSort({ scrollMode: 'top' });
            },
            onFilterChange: (filter) => {
                Object.assign(this.filter, filter);
                this.applyFiltersAndSort({ scrollMode: 'top' });
            },
            onSearch: (term) => {
                this.filter.searchTerm = term;
                this.applyFiltersAndSort({ scrollMode: 'top' });
            },
            onAdd: () => this.plugin.addMediaItem(this.mediaType),
            onRandom: () => this.showRandomGame(),
            onStats: () => this.showStats(),
            onSettings: () => this.showSettingsPanel(),
            onReleaseCalendar: () => this.showReleaseCalendar(),
            onCustomGroups: () => this.showCustomGroups(),
            onManageWorkTypes: ['game', 'movie', 'series', 'manga', 'anime'].includes(this.mediaType) ? () => this.plugin.manageMediaWorkTypes?.(this.mediaType as 'game' | 'movie' | 'series' | 'manga' | 'anime') : undefined,
            onViewModeChange: (mode) => {
                this.viewMode = mode;
                const activeSettings = this.getActiveSettings();
                activeSettings.orientation = mode === 'horizontal' ? 'horizontal' : 'vertical';
                void this.plugin.saveSettings();
                this.applyViewMode();
                this.render({ scrollMode: 'top' });
            },
            onViewStateChange: (state) => {
                this.setViewState(state, true);
                this.applyFiltersAndSort({ scrollMode: 'top' });
            },
            onApplySavedView: (id) => {
                this.tagsDirty = true;
                const settings = this.getActiveSettings();
                const saved = id ? settings.savedViews.find((view) => view.id === id) : null;
                settings.activeSavedViewId = saved?.id ?? null;
                this.setViewState(saved?.state ?? this.getDefaultViewState(), true);
                this.toolbar?.updateViewState(
                    this.viewState,
                    settings.savedViews,
                    settings.activeSavedViewId,
                    this.getDefaultViewState()
                );
                this.applyFiltersAndSort({ scrollMode: 'top' });
            },
            onSaveView: (name, state) => {
                const settings = this.getActiveSettings();
                const normalizedName = this.uniqueSavedViewName(name, settings.savedViews.map((view) => view.name));
                const id = `view-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
                settings.savedViews.push({ id, name: normalizedName, state: cloneLibraryViewState(state) });
                settings.activeSavedViewId = id;
                void this.plugin.saveSettings();
                this.toolbar?.updateViewState(state, settings.savedViews, id, this.getDefaultViewState());
            },
            onUpdateSavedView: (id, state) => {
                const settings = this.getActiveSettings();
                const saved = settings.savedViews.find((view) => view.id === id);
                if (!saved || saved.readonly) return;
                saved.state = cloneLibraryViewState(state);
                settings.activeSavedViewId = id;
                void this.plugin.saveSettings();
                this.toolbar?.updateViewState(state, settings.savedViews, id, this.getDefaultViewState());
            },
            onRenameSavedView: (id, name) => {
                const settings = this.getActiveSettings();
                const saved = settings.savedViews.find((view) => view.id === id);
                if (!saved || saved.readonly) return;
                saved.name = this.uniqueSavedViewName(
                    name,
                    settings.savedViews.filter((view) => view.id !== id).map((view) => view.name)
                );
                void this.plugin.saveSettings();
                this.toolbar?.updateViewState(this.viewState, settings.savedViews, id, this.getDefaultViewState());
            },
            onDeleteSavedView: (id) => {
                const settings = this.getActiveSettings();
                settings.savedViews = settings.savedViews.filter((view) => view.id !== id || view.readonly);
                settings.activeSavedViewId = null;
                this.setViewState(this.getDefaultViewState(), true);
                this.toolbar?.updateViewState(
                    this.viewState,
                    settings.savedViews,
                    null,
                    this.getDefaultViewState()
                );
                this.applyFiltersAndSort({ scrollMode: 'top' });
            },
            onResetView: () => {
                const settings = this.getActiveSettings();
                settings.activeSavedViewId = null;
                this.setViewState(this.getDefaultViewState(), true);
                this.toolbar?.updateViewState(
                    this.viewState,
                    settings.savedViews,
                    null,
                    this.getDefaultViewState()
                );
                this.applyFiltersAndSort({ scrollMode: 'top' });
            },
            onMediaTypeChange: (mediaType) => {
                void this.plugin.switchMediaType(mediaType);
            },
        };

        const activeSettings = this.getActiveSettings();
        this.toolbar = new Toolbar(
            container,
            callbacks,
            {
                field: this.viewState.sort.field,
                order: this.viewState.sort.order
            },
            this.filter,
            this.viewMode,
            this.getSortOptions(),
            this.getRandomLabel(),
            this.viewState,
            activeSettings.savedViews,
            activeSettings.activeSavedViewId,
            this.getFieldDefinitions(),
            this.getDefaultViewState(),
            this.mediaType,
            this.plugin.getEnabledMediaTypes(),
            { album: this.plugin.settings.music.albumCoverMode, track: this.plugin.settings.music.trackCoverMode }
        );
    }

    showReleaseCalendar(): ReleaseCalendarModal {
        const modal = new ReleaseCalendarModal(
            this.app,
            async () => {
                const libraries = await Promise.all([
                    this.gameService.loadGames(),
                    this.animeService.loadAnime(),
                    this.movieService.loadItems(),
                    this.seriesService.loadItems(),
                    this.bookService.loadItems(),
                    this.mangaService.loadItems(),
                ]);
                return libraries.flat();
            },
            (item) => this.openGame(item),
            this.plugin.settings.releaseCalendarMediaTypes,
            (types) => {
                this.plugin.settings.releaseCalendarMediaTypes = types;
                void this.plugin.saveSettings();
            },
            this.plugin.settings.releaseCalendarViewMode,
            this.plugin.settings.releaseCalendarScope,
            (mode, scope) => {
                this.plugin.settings.releaseCalendarViewMode = mode;
                this.plugin.settings.releaseCalendarScope = scope;
                void this.plugin.saveSettings();
            }
        );
        modal.open();
        return modal;
    }

    private async loadAllMediaItems(): Promise<MediaItem[]> {
        const libraries = await Promise.all([
            this.gameService.loadGames(),
            this.animeService.loadAnime(),
            this.movieService.loadItems(),
            this.seriesService.loadItems(),
            this.bookService.loadItems(),
            this.mangaService.loadItems(),
            this.musicService.loadItems(),
        ]);
        return libraries.flat();
    }

    showCustomGroups(): CustomGroupsModal {
        const modal = new CustomGroupsModal(
            this.app,
            this.plugin.settings.customGroups,
            () => this.loadAllMediaItems(),
            (item) => this.openGame(item),
            (groups) => this.saveCustomGroups(groups)
        );
        modal.open();
        return modal;
    }

    private saveCustomGroups(groups: CustomMediaGroup[]): void {
        this.plugin.settings.customGroups = groups;
        void this.plugin.saveSettings();
    }

    private toggleCustomGroupMembership(item: MediaItem, groupId: string): void {
        this.saveCustomGroups(this.plugin.settings.customGroups.map((group) => group.id === groupId
            ? setGroupMembership(group, item.filePath, !group.itemPaths.includes(item.filePath))
            : group));
    }

    /**
     * Load games from the vault
     */
    private async loadGames(): Promise<void> {
        const generation = ++this.loadGeneration;
        const requestedMediaType = this.mediaType;
        this.showLoading();
        await this.waitForNextFrame();
        if (this.isDestroyed || generation !== this.loadGeneration) return;

        try {
            let games: MediaItem[];
            if (requestedMediaType === 'music') {
                games = await this.musicService.loadItems();
            } else if (requestedMediaType === 'anime') {
                games = await this.animeService.loadAnime();
            } else if (requestedMediaType === 'movie') {
                games = await this.movieService.loadItems();
            } else if (requestedMediaType === 'series') {
                games = await this.seriesService.loadItems();
            } else if (requestedMediaType === 'book') {
                games = await this.bookService.loadItems();
            } else if (requestedMediaType === 'manga') {
                games = await this.mangaService.loadItems();
            } else {
                games = await this.gameService.loadGames();
            }
            if (this.isDestroyed || generation !== this.loadGeneration || this.mediaType !== requestedMediaType) return;
            this.games = games;
            this.rebuildGameIndex();
            this.tagsDirty = true;
            this.cachedLayout = null;
            this.applyFiltersAndSort({ scrollMode: 'none' });
        } catch (e) {
            if (generation !== this.loadGeneration || this.mediaType !== requestedMediaType) return;
            console.error('Error loading games:', e);
            this.showError(t('errorLoadingItems'));
        }
    }

    /**
     * Apply filters and sorting, then render
     */
    private applyFiltersAndSort(options: { scrollMode?: RenderScrollMode; scrollTop?: number } = {}): void {
        if (this.isDestroyed) return;

        this.pendingFilterScrollMode = this.mergeScrollModes(
            this.pendingFilterScrollMode,
            options.scrollMode ?? 'preserve'
        );
        if (options.scrollMode === 'position' && Number.isFinite(options.scrollTop)) {
            this.pendingFilterScrollTop = options.scrollTop as number;
        }

        if (this.filterRafId !== null) {
            return;
        }

        this.filterRafId = window.requestAnimationFrame(() => {
            this.filterRafId = null;
            const scrollMode = this.pendingFilterScrollMode;
            const scrollTop = this.pendingFilterScrollTop;
            this.pendingFilterScrollMode = 'none';
            this.pendingFilterScrollTop = null;
            this.runFiltersAndSort(scrollMode, scrollTop);
        });
    }

    private runFiltersAndSort(scrollMode: RenderScrollMode, scrollTop: number | null = null): void {
        // Don't process if view is destroyed
        if (this.isDestroyed) return;

        try {
            this.updateToolbarTags();
            const settings = this.getActiveSettings();

            if (this.mediaType === 'music') {
                this.filteredGames = this.musicService.filterAndSort(this.games as MusicItem[], this.filter, this.viewState.sort.field, this.viewState.sort.order);
            } else if (this.mediaType === 'anime') {
                this.filteredGames = this.animeService.filterAndSort(
                    this.games as AnimeItem[],
                    this.filter,
                    this.viewState.sort.field,
                    this.viewState.sort.order,
                    settings.showAdultInAll
                );
            } else if (this.mediaType === 'movie') {
                this.filteredGames = this.movieService.filterAndSort(
                    this.games as MovieItem[],
                    this.filter,
                    this.viewState.sort.field,
                    this.viewState.sort.order
                );
            } else if (this.mediaType === 'series') {
                this.filteredGames = this.seriesService.filterAndSort(
                    this.games as SeriesItem[],
                    this.filter,
                    this.viewState.sort.field,
                    this.viewState.sort.order
                );
            } else if (this.mediaType === 'book') {
                this.filteredGames = this.bookService.filterAndSort(
                    this.games as ReadingItem[],
                    this.filter,
                    this.viewState.sort.field,
                    this.viewState.sort.order
                );
            } else if (this.mediaType === 'manga') {
                this.filteredGames = this.mangaService.filterAndSort(
                    this.games as ReadingItem[],
                    this.filter,
                    this.viewState.sort.field,
                    this.viewState.sort.order,
                    settings.showAdultInAll
                );
            } else {
                this.filteredGames = this.gameService.filterAndSort(
                    this.games as GameItem[],
                    this.filter,
                    this.viewState.sort.field,
                    this.viewState.sort.order,
                    settings.showAdultInAll
                );
            }

            this.hasPartSearchMatches = Boolean(this.filter.searchTerm.trim()
                && this.filteredGames.some(item => getTitleSearchMatch(item, this.filter.searchTerm)?.partId));
            this.render({ scrollMode, scrollTop: scrollTop ?? undefined });
        } catch (e) {
            console.error('Error applying filters/sort:', e);
            this.showError(t('errorProcessingList'));
        }
    }

    private mergeScrollModes(current: RenderScrollMode, next: RenderScrollMode): RenderScrollMode {
        if (current === 'top' || next === 'top') return 'top';
        if (current === 'position' || next === 'position') return 'position';
        if (current === 'preserve' || next === 'preserve') return 'preserve';
        return 'none';
    }

    private cancelScheduledFilter(): void {
        if (this.filterRafId !== null) {
            window.cancelAnimationFrame(this.filterRafId);
            this.filterRafId = null;
        }
        this.pendingFilterScrollMode = 'none';
        this.pendingFilterScrollTop = null;
    }

    /**
     * Render the games grid
     */
    private render(options: { scrollMode?: RenderScrollMode; scrollTop?: number } = {}): void {
        if (!this.libraryContentEl) return;
        this.cachedLayout = null;

        const version = ++this.renderVersion;
        const scrollMode = options.scrollMode ?? 'none';
        const anchor = scrollMode === 'position'
            ? {
                scrollTop: options.scrollTop ?? this.contentEl.scrollTop,
                filePath: null,
                offsetTop: null,
            }
            : scrollMode === 'preserve'
                ? this.scrollManager.capture()
                : null;

        // CRITICAL: Cleanup previous virtualization to remove event listeners
        this.cleanupVirtualization();
        this.cancelCardBatch();
        this.cancelContentAnimations();

        this.libraryContentEl.addClass('is-rebuilding');
        this.libraryContentEl.empty();

        if (this.filteredGames.length === 0) {
            this.libraryContentEl.createDiv({
                cls: 'lorebase-empty',
                text: this.getEmptyStateText()
            });
            this.finishContentRebuild(version, () => this.scrollManager.apply(scrollMode, anchor));
            return;
        }

        const shouldGroup = this.viewState.group.mode !== 'none';

        if (this.mediaType === 'book' && this.plugin.settings.books.bookshelfEffect) {
            const groups = shouldGroup
                ? this.groupVisibleItems()
                : [{ label: '', items: this.filteredGames }];
            const tasks: CardRenderTask[] = [];
            this.gridEl = null;
            for (const group of groups) {
                const section = this.libraryContentEl.createDiv({ cls: 'lorebase-bookshelf-section' });
                if (shouldGroup) {
                    const title = section.createDiv({ cls: 'lorebase-series-title lorebase-view-group-title', text: group.label });
                    title.createSpan({ cls: 'lorebase-view-group-count', text: String(group.items.length) });
                }
                const shelf = section.createDiv({ cls: 'lorebase-bookshelf' });
                for (const item of group.items) tasks.push({ parent: shelf, item });
            }
            this.renderCardsInBatches(tasks, version, () => {
                this.finishContentRebuild(version, () => this.scrollManager.apply(scrollMode, anchor));
            });
            return;
        }

        if (shouldGroup) {
            this.renderGroupedView(scrollMode, anchor, version);
        } else {
            this.renderFlatGrid(scrollMode, anchor, version);
        }
    }

    private groupVisibleItems(): ReturnType<typeof groupMediaItems> {
        const { mode, order } = this.viewState.group;
        return groupMediaItems(
            this.filteredGames, mode, order, i18n.getLocale(),
            mode === 'status' ? this.getStatusOptions() : [],
        );
    }

    private renderGroupedView(scrollMode: RenderScrollMode, anchor: ScrollAnchor | null, version: number): void {
        if (!this.libraryContentEl) return;
        const layout = this.getEffectiveLayout();
        this.cachedLayout = layout;
        const renderedLayout = { ...layout, columns: this.getRenderedColumns(layout) };
        const groups = this.groupVisibleItems();
        if (this.filteredGames.length > 100) {
            this.gridEl = createGrid({
                container: this.libraryContentEl,
                layout: renderedLayout,
                className: 'lorebase-grid lorebase-virtual-group-grid',
            });
            const columns = this.getRenderedColumns(layout);
            const cardHeight = this.layoutCalculator.calculateActualCardHeight(layout, columns, this.gridEl);
            this.virtualGrid = new VirtualGroupedGrid<MediaItem>({
                gridEl: this.gridEl,
                scrollContainer: this.contentEl,
                groups,
                colors: SERIES_COLORS,
                columns,
                targetCardWidth: layout.targetCardWidth, gap: layout.gap, padding: layout.padding,
                orientation: layout.orientation,
                cardHeight,
                buffer: VIRTUALIZATION_BUFFER,
                externalViewportUpdates: true,
                createCard: (parent, item) => this.createCard(parent, item),
            });
            this.finishContentRebuild(version, () => this.scrollManager.apply(scrollMode, anchor));
            return;
        }
        const tasks: CardRenderTask[] = [];

        groups.forEach((group, index) => {
            const section = this.libraryContentEl!.createDiv({ cls: 'lorebase-series-section lorebase-view-group-section' });
            section.toggleClass('lorebase-music-group-section', this.mediaType === 'music');
            const title = section.createDiv({ cls: 'lorebase-series-title lorebase-view-group-title' });
            title.createSpan({ text: group.label });
            title.createSpan({ cls: 'lorebase-view-group-count', text: String(group.items.length) });
            title.style.borderLeftColor = SERIES_COLORS[index % SERIES_COLORS.length];
            const grid = createGrid({ container: section, layout: renderedLayout, className: 'lorebase-grid' });
            for (const item of group.items) tasks.push({ parent: grid, item });
        });

        this.renderCardsInBatches(tasks, version, () => {
            this.finishContentRebuild(version, () => this.scrollManager.apply(scrollMode, anchor));
        });
    }

    private getEmptyStateText(): string {
        if (this.mediaType === 'anime') return t('noAnimeFound');
        if (this.mediaType === 'movie') return t('noMoviesFound');
        if (this.mediaType === 'series') return t('noSeriesFound');
        if (this.mediaType === 'music') return mt('noResults');
        if (this.mediaType === 'book') return t('noBooksFound');
        if (this.mediaType === 'manga') return t('noMangaFound');
        return t('noGamesFound');
    }

    /**
     * Render flat grid without grouping
     */
    private renderFlatGrid(scrollMode: RenderScrollMode, anchor: ScrollAnchor | null, version: number): void {
        if (!this.libraryContentEl) return;

        const layout = this.getEffectiveLayout();
        const activeSettings = this.getActiveSettings();
        const renderedLayout = {
            ...layout,
            columns: this.getRenderedColumns(layout),
        };

        this.gridEl = createGrid({
            container: this.libraryContentEl,
            layout: renderedLayout,
        });
        this.gridEl.toggleClass(
            'lorebase-grid-book-cover-effect',
            (this.mediaType === 'book' || this.mediaType === 'manga') && Boolean(activeSettings.bookCoverEffect)
        );
        this.gridEl.toggleClass(
            'lorebase-grid-progress-style',
            activeSettings.cardStyle === 'progress'
        );

        // For small collections, render all
        if (this.filteredGames.length <= 100) {
            const tasks = this.filteredGames.map((game) => ({
                parent: this.gridEl as HTMLElement,
                item: game,
            }));
            this.renderCardsInBatches(tasks, version, () => {
                this.finishContentRebuild(version, () => this.scrollManager.apply(scrollMode, anchor));
            });
        } else {
            // Use virtualization for large collections
            this.enableVirtualization();
            this.finishContentRebuild(version, () => this.scrollManager.apply(scrollMode, anchor));
        }
    }

    private finishContentRebuild(version: number, onReady: () => void): void {
        if (this.isDestroyed || version !== this.renderVersion || !this.libraryContentEl) return;
        onReady();
        this.virtualGrid?.updateViewport();
        window.requestAnimationFrame(() => {
            if (this.isDestroyed || version !== this.renderVersion || !this.libraryContentEl) return;
            const content = this.libraryContentEl;
            content.removeClass('is-rebuilding');
            if (content.ownerDocument.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

            const viewport = this.contentEl.getBoundingClientRect();
            const visibleCards = Array.from(content.querySelectorAll<HTMLElement>('.lorebase-card'))
                .filter((card) => {
                    const rect = card.getBoundingClientRect();
                    return rect.bottom >= viewport.top && rect.top <= viewport.bottom;
                })
                .slice(0, 32);
            const targets = visibleCards.length > 0
                ? visibleCards
                : content.firstElementChild instanceof HTMLElement
                    ? [content.firstElementChild]
                    : [];

            targets.forEach((target, index) => {
                if (typeof target.animate !== 'function') return;
                const hoverOffset = target.matches('.lorebase-card:hover') ? -4 : 0;
                const animation = target.animate(
                    [
                        { opacity: 0, transform: `translate3d(0, ${hoverOffset + 10}px, 0)` },
                        { opacity: 1, transform: `translate3d(0, ${hoverOffset}px, 0)` },
                    ],
                    {
                        duration: 280,
                        delay: Math.min(index * 14, 112),
                        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                        fill: 'backwards',
                    }
                );
                this.trackAnimation(animation, this.contentRevealAnimations);
            });
        });
    }

    private trackAnimation(animation: Animation, collection: Set<Animation>): void {
        collection.add(animation);
        const remove = (): void => {
            collection.delete(animation);
            if (collection === this.cardReflowAnimations && collection.size === 0) {
                this.contentEl.removeClass('is-layout-resizing');
            }
        };
        animation.onfinish = remove;
        animation.oncancel = remove;
    }

    private cancelAnimations(collection: Set<Animation>): void {
        for (const animation of collection) animation.cancel();
        collection.clear();
        if (collection === this.cardReflowAnimations) this.contentEl.removeClass('is-layout-resizing');
    }

    private cancelContentAnimations(): void {
        this.cancelAnimations(this.contentRevealAnimations);
        this.cancelAnimations(this.cardReflowAnimations);
    }

    private renderCardsInBatches(
        tasks: CardRenderTask[],
        version: number,
        onComplete: () => void
    ): void {
        let index = 0;

        const renderNextBatch = (): void => {
            if (this.isDestroyed || version !== this.renderVersion) return;

            const end = Math.min(index + CARD_RENDER_BATCH_SIZE, tasks.length);
            for (; index < end; index++) {
                const task = tasks[index];
                this.createCard(task.parent, task.item);
            }

            if (index < tasks.length) {
                this.cardBatchRafId = window.requestAnimationFrame(() => {
                    this.cardBatchRafId = null;
                    renderNextBatch();
                });
                return;
            }

            this.cardBatchRafId = null;
            onComplete();
        };

        renderNextBatch();
    }

    private cancelCardBatch(): void {
        if (this.cardBatchRafId !== null) {
            window.cancelAnimationFrame(this.cardBatchRafId);
            this.cardBatchRafId = null;
        }
    }

    /**
     * Setup virtualized scrolling for large collections
     */
    private enableVirtualization(): void {
        if (!this.gridEl) return;

        const layout = this.getEffectiveLayout();
        this.cachedLayout = layout;
        const columns = this.getRenderedColumns(layout);
        const cardHeight = this.layoutCalculator.calculateActualCardHeight(layout, columns, this.gridEl);
        this.virtualGrid = new VirtualGrid<MediaItem>({
            gridEl: this.gridEl,
            scrollContainer: this.contentEl,
            items: this.filteredGames,
            columns,
            targetCardWidth: layout.targetCardWidth, gap: layout.gap, padding: layout.padding,
            orientation: layout.orientation,
            cardHeight,
            buffer: VIRTUALIZATION_BUFFER,
            externalViewportUpdates: true,
            createCard: (parent, item) => this.createCard(parent, item),
        });
    }

    /**
     * Cleanup virtualization
     */
    private cleanupVirtualization(): void {
        this.smoothScroll?.cancel();
        if (this.virtualGrid) {
            this.virtualGrid.destroy();
            this.virtualGrid = null;
        }
        // Small grids, bookshelves and random cards own listeners and image
        // loads too. Removing DOM alone leaves those resources active.
        this.libraryContentEl?.querySelectorAll<HTMLElement>('.lorebase-card')
            .forEach(GameCard.destroyElement);
    }

    private observeLayoutResize(): void {
        if (typeof ResizeObserver === 'undefined') return;

        this.resizeObserver?.disconnect();
        this.lastObservedLayoutWidth = null;
        this.lastObservedLayoutHeight = null;
        this.resizeObserver = new ResizeObserver((entries) => {
            const width = Math.round(entries[0]?.contentRect.width ?? this.contentEl.clientWidth);
            if (width <= 0) return;
            const height = Math.round(entries[0]?.contentRect.height ?? this.contentEl.clientHeight);
            const heightChanged = height !== this.lastObservedLayoutHeight;
            this.lastObservedLayoutHeight = height;
            if (this.lastObservedLayoutWidth === null) {
                this.lastObservedLayoutWidth = width;
                // Keep posters at their current size while the host animates a sidebar.
                // The final width is committed once, when the pane settles.
                if (this.libraryContentEl) this.libraryContentEl.style.width = `${width}px`;
                this.scheduleVirtualLayoutRefresh();
                return;
            }
            if (width === this.lastObservedLayoutWidth) {
                if (heightChanged) this.virtualGrid?.updateViewport();
                return;
            }
            this.lastObservedLayoutWidth = width;
            this.markLayoutResizing();
        });
        this.resizeObserver.observe(this.contentEl);
    }

    private waitForNextFrame(): Promise<void> {
        return new Promise((resolve) => {
            window.requestAnimationFrame(() => resolve());
        });
    }

    private scheduleVirtualLayoutRefresh(): void {
        if (this.isDestroyed || !this.libraryContentEl) return;

        if (this.resizeLayoutRafId !== null) return;

        this.resizeLayoutRafId = window.requestAnimationFrame(() => {
            this.resizeLayoutRafId = null;
            this.refreshGridLayout();
        });
    }

    private refreshGridLayout(): void {
        if (this.isDestroyed || !this.libraryContentEl) return;

        const previous = this.captureCardLayout();
        const anchor = this.virtualGrid ? null : this.scrollManager.capture();
        // Preserve the on-screen position before replacing an in-flight move.
        this.smoothScroll?.cancel();
        this.cancelAnimations(this.contentRevealAnimations);
        this.cancelAnimations(this.cardReflowAnimations);
        this.contentEl.addClass('is-layout-resizing');
        // Keep the old grid geometry until this transaction. Otherwise the
        // browser shrinks posters before we can capture their old bounds.
        if (this.lastObservedLayoutWidth) {
            this.libraryContentEl.style.width = `${this.lastObservedLayoutWidth}px`;
        }
        const layout = this.getEffectiveLayout();
        this.cachedLayout = layout;
        const columns = this.getRenderedColumns(layout);
        this.updateRenderedGridColumns(columns, layout);

        if (this.virtualGrid && this.gridEl) {
            const cardHeight = this.layoutCalculator.calculateActualCardHeight(layout, columns, this.gridEl);
            this.virtualGrid.updateLayout({
                columns,
                targetCardWidth: layout.targetCardWidth, gap: layout.gap, padding: layout.padding,
                orientation: layout.orientation,
                cardHeight,
            });
        }
        if (anchor) this.scrollManager.apply('preserve', anchor);
        const current = this.captureCardLayout();
        this.libraryContentEl.querySelectorAll<HTMLElement>('.lorebase-card[data-lorebase-file-path]')
            .forEach(card => { if (current.has(card.dataset.lorebaseFilePath!)) GameCard.refitOverlay(card); });
        this.animateRenderedCardReflow(previous, current);
    }

    private captureCardLayout(): Map<string, CardRect> {
        const result = new Map<string, CardRect>();
        const viewport = this.contentEl.getBoundingClientRect();
        this.libraryContentEl?.querySelectorAll<HTMLElement>('.lorebase-grid').forEach(grid => {
            const cards = Array.from(grid.querySelectorAll<HTMLElement>('.lorebase-card[data-lorebase-file-path]'));
            cards.forEach(card => {
                const rect = card.getBoundingClientRect();
                if (rect.bottom < viewport.top - rect.height || rect.top > viewport.bottom + rect.height) return;
                result.set(card.dataset.lorebaseFilePath!, {
                    left: rect.left, top: rect.top, width: rect.width, height: rect.height, row: card.offsetTop,
                });
            });
        });
        return result;
    }

    private animateRenderedCardReflow(previous: Map<string, CardRect>, current: Map<string, CardRect>): void {
        if (!this.libraryContentEl) return;
        const ownerWindow = this.containerEl.ownerDocument.defaultView;
        if (ownerWindow?.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            this.contentEl.removeClass('is-layout-resizing');
            return;
        }
        const plan = planCardReflow(previous, current);

        this.libraryContentEl.querySelectorAll<HTMLElement>('.lorebase-card[data-lorebase-file-path]')
            .forEach((card) => {
                if (typeof card.animate !== 'function') return;

                const key = card.dataset.lorebaseFilePath!;
                const next = current.get(key);
                if (!next || next.width <= 0 || next.height <= 0) return;
                const frames = plan.get(key);
                if (!frames) return;
                const animation = card.animate(
                    frames,
                    {
                        duration: 260,
                        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                    }
                );
                this.trackAnimation(animation, this.cardReflowAnimations);
            });
        if (this.cardReflowAnimations.size === 0) this.contentEl.removeClass('is-layout-resizing');
    }

    private updateRenderedGridColumns(columns: number, layout: EffectiveLayout): void {
        this.libraryContentEl?.querySelectorAll<HTMLElement>('.lorebase-grid').forEach((grid) => {
            applyGridLayout(grid, { ...layout, columns });
        });
    }

    private markLayoutResizing(): void {
        if (this.isDestroyed || !this.libraryContentEl) return;
        if (this.resizeLayoutRafId !== null) {
            window.cancelAnimationFrame(this.resizeLayoutRafId);
            this.resizeLayoutRafId = null;
        }
        if (this.resizeSettleTimerId === null) {
            this.smoothScroll?.cancel();
            this.cancelAnimations(this.contentRevealAnimations);
            this.cancelAnimations(this.cardReflowAnimations);
            this.contentEl.addClass('is-layout-resizing');
        } else window.clearTimeout(this.resizeSettleTimerId);
        // A sidebar transition produces several widths. Measuring and refitting
        // every card at each step blocks the host animation, even in small grids.
        this.resizeSettleTimerId = window.setTimeout(() => {
            this.resizeSettleTimerId = null;
            this.scheduleVirtualLayoutRefresh();
        }, LAYOUT_RESIZE_SETTLE_MS);
    }

    private cleanupLayoutResize(): void {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
        this.lastObservedLayoutWidth = null;
        this.lastObservedLayoutHeight = null;
        if (this.resizeSettleTimerId !== null) {
            window.clearTimeout(this.resizeSettleTimerId);
            this.resizeSettleTimerId = null;
        }

        if (this.resizeLayoutRafId !== null) {
            window.cancelAnimationFrame(this.resizeLayoutRafId);
            this.resizeLayoutRafId = null;
        }
        this.contentEl.removeClass('is-layout-resizing');
    }

    getCardPreviewReference(media: MediaType, orientation: LorebaseSettings['games']['orientation']): { item?: MediaItem; width?: number; availableWidth?: number; fontSize?: string; lineHeight?: string } | null {
        if (!this.libraryContentEl) return null;
        const candidates = this.filteredGames.length ? this.filteredGames : this.games.filter(item => !item.isAdult);
        let item: MediaItem | undefined;
        let longest = -1;
        for (const candidate of candidates) {
            if (candidate.type !== media) continue;
            const description = candidate.type === 'anime' ? candidate.summary || candidate.description : candidate.description;
            const length = description?.trim().length ?? 0;
            if (length <= longest) continue;
            item = candidate;
            longest = length;
        }
        const rendered = this.libraryContentEl.querySelectorAll<HTMLElement>('.lorebase-card[data-lorebase-file-path]');
        const element = Array.from(rendered).find(card => card.dataset.lorebaseFilePath === item?.filePath) ?? rendered[0];
        const cardStyle = element?.ownerDocument.defaultView?.getComputedStyle(element);
        const grid = element?.closest<HTMLElement>('.lorebase-grid:not(.lorebase-random-grid)');
        const layout = this.layoutCalculator.getEffectiveLayout(this.plugin.settings[CARD_MEDIA_KEYS[media]], orientation === 'horizontal' ? 'horizontal' : 'grid');
        const width = this.layoutCalculator.getCardWidth(layout, this.getRenderedColumns(layout), grid?.clientWidth);
        return {
            item,
            width,
            availableWidth: grid?.clientWidth || this.libraryContentEl.clientWidth,
            fontSize: cardStyle?.fontSize,
            lineHeight: cardStyle?.lineHeight,
        };
    }

    private createCard(parent: HTMLElement, game: MediaItem): GameCard {
        // The grid geometry is shared by all cards until the next render/resize.
        // Reading its width after each DOM insertion forces a layout for every card.
        const layout = this.cachedLayout ??= this.getEffectiveLayout();
        const activeSettings = this.getActiveSettings();
        const overlayProfile = this.getOverlayProfile(game.type);
        const card = new GameCard(
            parent,
            game,
            {
                onClick: (g) => {
                    void this.handleCardClick(g);
                },
                onContextMenu: (g, x, y) => this.showContextMenu(g, x, y),
                onPartClick: (item, partId) => this.openEditModal(item, partId),
            },
            layout.cardSize,
            layout.orientation,
            activeSettings.cardStyle,
            this.viewState.sort.field,
            overlayProfile.badges,
            overlayProfile.layout,
            overlayProfile.visibility,
            overlayProfile.descriptionLines,
            layout.dimensions,
            {
                showSeason: activeSettings.showAnimeSeasonProgress,
                showEpisode: activeSettings.showAnimeEpisodeProgress,
            },
            this.getStatusLabelOverrides(game.type),
            this.getCompletionDateBadgeFormat(game.type),
            this.plugin.settings.ratingScale,
            (value) => this.plugin.getMetadataService()?.getImageUrl(value) ?? null,
            game.type === 'book' && Boolean(this.plugin.settings.books.bookshelfEffect),
            this.filter.searchTerm, false,
            ['dateFinished', 'finishedMonth', 'finishedYear'].includes(this.viewState.group.mode),
            this.plugin.settings.scrollCardDescriptions,
            this.plugin.settings.showDiscoveryBadge,
        );
        card.getElement().dataset.lorebaseFilePath = game.filePath;
        if (game.type === 'music') {
            const mode = game.musicKind === 'album' ? this.plugin.settings.music.albumCoverMode : this.plugin.settings.music.trackCoverMode;
            card.getElement().toggleClass('lorebase-music-vinyl', mode === 'vinyl');
            card.getElement().toggleClass('lorebase-music-cd', mode === 'cd');
        }
        card.getElement().toggleClass(
            'lorebase-book-cover-effect',
            (game.type === 'book' || game.type === 'manga') && Boolean(activeSettings.bookCoverEffect)
                && !(game.type === 'book' && this.plugin.settings.books.bookshelfEffect)
        );
        return card;
    }

    private areMediaItemsEquivalent(left: MediaItem, right: MediaItem): boolean {
        if (left.type !== right.type) return false;
        if (left.type === 'music' && right.type === 'music') return JSON.stringify(left) === JSON.stringify(right);
        if (
            left.filePath !== right.filePath
            || left.displayName !== right.displayName
            || left.year !== right.year
            || left.description !== right.description
            || left.userRating !== right.userRating
            || left.communityRating !== right.communityRating
            || left.communityVotes !== right.communityVotes
            || left.communityRatingProvider !== right.communityRatingProvider
            || JSON.stringify(left.detailedRatings) !== JSON.stringify(right.detailedRatings)
            || left.discovery?.recommendedBy !== right.discovery?.recommendedBy
            || left.discovery?.reason !== right.discovery?.reason
            || JSON.stringify(left.statusReasons) !== JSON.stringify(right.statusReasons)
            || left.favorite !== right.favorite
            || left.imageUrl !== right.imageUrl
            || left.horizontalImageUrl !== right.horizontalImageUrl
            || left.hasCustomPoster !== right.hasCustomPoster
            || left.isAdult !== right.isAdult
            || left.workType !== right.workType
            || left.status !== right.status
            || left.started !== right.started
            || left.finished !== right.finished
            || !this.areRawFieldsEquivalent(left.rawFields, right.rawFields)
            || !this.areStringArraysEquivalent(left.tags, right.tags)
            || !this.areStringArraysEquivalent(left.genres, right.genres)
        ) {
            return false;
        }

        if (left.type === 'anime' && right.type === 'anime') {
            return left.posterMode === right.posterMode
                && left.releaseDate === right.releaseDate
                && left.titleImageUrl === right.titleImageUrl
                && left.activePartId === right.activePartId
                && JSON.stringify(left.parts) === JSON.stringify(right.parts)
                && left.format === right.format
                && left.summary === right.summary
                && left.seasonCurrent === right.seasonCurrent
                && left.seasonTotal === right.seasonTotal
                && left.episodeCurrent === right.episodeCurrent
                && left.episodeTotal === right.episodeTotal
                && left.dateWatched === right.dateWatched
                && left.sourceUrl === right.sourceUrl
                && this.areRelatedMediaEquivalent(left.relatedMedia, right.relatedMedia);
        }

        if (left.type === 'game' && right.type === 'game') {
            return left.gameSeries === right.gameSeries
                && left.dateCompleted === right.dateCompleted
                && left.started === right.started
                && left.finished === right.finished
                && left.releaseDate === right.releaseDate
                && left.publisher === right.publisher
                && left.developer === right.developer;
        }

        if (left.type === 'movie' && right.type === 'movie') {
            const leftParts = left.parts ?? [];
            const rightParts = right.parts ?? [];
            return left.summary === right.summary
                && left.sourceUrl === right.sourceUrl
                && left.rating === right.rating
                && left.releaseDate === right.releaseDate
                && left.runtime === right.runtime
                && left.director === right.director
                && left.actors === right.actors
                && left.activePartId === right.activePartId
                && this.areVideoPartsEquivalent(leftParts, rightParts)
                && this.areRelatedMediaEquivalent(left.relatedMedia, right.relatedMedia);
        }

        if (left.type === 'series' && right.type === 'series') {
            const leftParts = left.parts ?? [];
            const rightParts = right.parts ?? [];
            return left.summary === right.summary
                && left.posterMode === right.posterMode
                && left.titleImageUrl === right.titleImageUrl
                && left.sourceUrl === right.sourceUrl
                && left.rating === right.rating
                && left.releaseDate === right.releaseDate
                && left.runtime === right.runtime
                && left.director === right.director
                && left.actors === right.actors
                && left.activePartId === right.activePartId
                && this.areVideoPartsEquivalent(leftParts, rightParts)
                && left.seasons === right.seasons
                && left.episodeCurrent === right.episodeCurrent
                && left.episodeTotal === right.episodeTotal
                && this.areStringArraysEquivalent(left.networks, right.networks)
                && this.areStringArraysEquivalent(left.studios, right.studios)
                && this.areRelatedMediaEquivalent(left.relatedMedia, right.relatedMedia);
        }

        if (left.type === 'book' && right.type === 'book') {
            return left.summary === right.summary
                && left.sourceUrl === right.sourceUrl
                && left.publisher === right.publisher
                && left.releaseDate === right.releaseDate
                && left.pageCurrent === right.pageCurrent
                && left.pageTotal === right.pageTotal
                && this.areStringArraysEquivalent(left.authors, right.authors)
                && this.areRelatedMediaEquivalent(left.relatedMedia, right.relatedMedia);
        }

        if (left.type === 'manga' && right.type === 'manga') {
            return left.summary === right.summary
                && left.releaseDate === right.releaseDate
                && left.sourceUrl === right.sourceUrl
                && left.chapterCurrent === right.chapterCurrent
                && left.chapterTotal === right.chapterTotal
                && left.volumeCurrent === right.volumeCurrent
                && left.volumeTotal === right.volumeTotal
                && left.activePartId === right.activePartId
                && this.areStringArraysEquivalent(left.authors, right.authors)
                && this.areStringArraysEquivalent(left.artists, right.artists)
                && this.areMangaPartsEquivalent(left.parts ?? [], right.parts ?? [])
                && this.areRelatedMediaEquivalent(left.relatedMedia, right.relatedMedia);
        }

        return true;
    }

    private areRawFieldsEquivalent(
        left: MediaItem['rawFields'],
        right: MediaItem['rawFields']
    ): boolean {
        const leftKeys = Object.keys(left ?? {});
        const rightKeys = Object.keys(right ?? {});
        if (leftKeys.length !== rightKeys.length) return false;
        for (const key of leftKeys) {
            const leftValue = left?.[key];
            const rightValue = right?.[key];
            if (Array.isArray(leftValue) || Array.isArray(rightValue)) {
                if (!Array.isArray(leftValue) || !Array.isArray(rightValue)) return false;
                if (leftValue.length !== rightValue.length || leftValue.some((value, index) => value !== rightValue[index])) {
                    return false;
                }
            } else if (leftValue !== rightValue) {
                return false;
            }
        }
        return true;
    }

    private areStringArraysEquivalent(left: string[] | undefined, right: string[] | undefined): boolean {
        const leftValues = left ?? [];
        const rightValues = right ?? [];
        if (leftValues.length !== rightValues.length) return false;
        return leftValues.every((value, index) => value === rightValues[index]);
    }

    private areVideoPartsEquivalent(left: NonNullable<MovieItem['parts']>, right: NonNullable<MovieItem['parts']>): boolean {
        return left.length === right.length
            && left.every((part, index) => {
                const other = right[index];
                return Boolean(other)
                    && part.id === other.id
                    && part.title === other.title
                    && this.areStringArraysEquivalent(part.alternativeTitles, other.alternativeTitles)
                    && part.seasonNumber === other.seasonNumber
                    && part.episodeCurrent === other.episodeCurrent
                    && part.episodeTotal === other.episodeTotal
                    && part.status === other.status;
            });
    }

    private areMangaPartsEquivalent(left: NonNullable<MangaItem['parts']>, right: NonNullable<MangaItem['parts']>): boolean {
        return left.length === right.length
            && left.every((part, index) => {
                const other = right[index];
                return Boolean(other)
                    && part.id === other.id
                    && part.title === other.title
                    && this.areStringArraysEquivalent(part.alternativeTitles, other.alternativeTitles)
                    && part.volumeNumber === other.volumeNumber
                    && part.chapterCurrent === other.chapterCurrent
                    && part.chapterTotal === other.chapterTotal
                    && part.status === other.status;
            });
    }

    private areRelatedMediaEquivalent(left: AnimeItem['relatedMedia'], right: AnimeItem['relatedMedia']): boolean {
        const leftItems = left ?? [];
        const rightItems = right ?? [];
        if (leftItems.length !== rightItems.length) return false;
        return leftItems.every((leftItem, index) => {
            const rightItem = rightItems[index];
            return Boolean(rightItem)
                && leftItem.type === rightItem.type
                && leftItem.path === rightItem.path
                && leftItem.title === rightItem.title;
        });
    }

    /**
     * Rebuild the filePath → index lookup map.
     * Called after games[] array changes (load, splice, push).
     */
    private rebuildGameIndex(): void {
        this.gameIndex.clear();
        for (let i = 0, len = this.games.length; i < len; i++) {
            this.gameIndex.set(this.games[i].filePath, i);
        }
    }

    /**
     * Open a game note
     */
    private async openGame(game: MediaItem): Promise<void> {
        await this.app.workspace.openLinkText(game.filePath, '', false);
    }

    private async handleCardClick(game: MediaItem): Promise<void> {
        if (this.plugin.settings.cardClickAction === 'edit') {
            this.openEditModal(game);
            return;
        }
        await this.openGame(game);
    }

    private openEditModal(item: MediaItem, partId?: string): void {
        const scrollTop = this.contentEl.scrollTop;
        this.plugin.showEditModal(
            item,
            () => {
                this.refreshFileFromCache(item.filePath);
                window.setTimeout(() => this.refreshFileFromCache(item.filePath), 100);
                this.finishEditScrollRestore(item.filePath);
            },
            () => this.beginEditScrollRestore(item.filePath, scrollTop),
            partId
        );
    }

    /**
     * Show context menu for a game
     */
    private showContextMenu(game: MediaItem, x: number, y: number): void {
        showMediaContextMenu(game, x, y, {
            chooseCompletionDate: item => new CompletionDateModal(this.app, item.displayName).openAndGetValue(),
            isDestroyed: () => this.isDestroyed,
            getStatusOptions: () => this.getStatusOptions(),
            onApplyFiltersAndSort: () => this.applyFiltersAndSort({ scrollMode: 'preserve' }),
            onItemMutated: (item, changedFields) => this.handleContextItemMutation(item, changedFields),
            onEdit: (item) => {
                this.openEditModal(item);
            },
            onOpen: (item) => {
                void this.openGame(item);
            },
            cardClickAction: this.plugin.settings.cardClickAction ?? 'open',
            ratingMode: this.getBadgeProfile(game.type).rating.mode,
            ratingSettings: this.plugin.settings.ratingScale,
            customGroups: this.plugin.settings.customGroups,
            onToggleCustomGroup: (item, groupId) => this.toggleCustomGroupMembership(item, groupId),
            onOpenCustomGroups: () => this.showCustomGroups(),
            onDelete: (item) => {
                this.plugin.showDeleteModal(item, async () => {
                    if (this.isDestroyed) return;
                    if (item.type === 'music') {
                        await this.musicService.deleteItem(item);
                    } else if (item.type === 'anime') {
                        await this.animeService.deleteAnime(item);
                    } else if (item.type === 'movie') {
                        await this.movieService.deleteItem(item);
                    } else if (item.type === 'series') {
                        await this.seriesService.deleteItem(item);
                    } else if (item.type === 'book') {
                        await this.bookService.deleteItem(item);
                    } else if (item.type === 'manga') {
                        await this.mangaService.deleteItem(item);
                    } else {
                        await this.gameService.deleteGame(item);
                    }
                    this.games = this.games.filter(g => g.filePath !== item.filePath);
                    this.applyFiltersAndSort({ scrollMode: 'preserve' });
                });
            },
            onSourceAction: (item, relink) => {
                void this.plugin.enrichMediaItem(item, relink, () => {
                    if (this.isDestroyed) return;
                    this.refreshFileFromCache(item.filePath);
                });
            },
            updateMusic: (item, updates) => { void this.musicService.updateItem(item, updates).catch(() => this.refresh()); },
            updateAnime: (anime, updates) => {
                void this.animeService.updateAnime(anime, updates);
            },
            updateGame: (gameItem, updates) => {
                void this.gameService.updateGame(gameItem, updates);
            },
            updateVideo: (videoItem, updates) => {
                if (videoItem.type === 'movie') {
                    void this.movieService.updateItem(videoItem, updates);
                } else {
                    void this.seriesService.updateItem(videoItem, updates);
                }
            },
            updateReading: (readingItem, updates) => {
                if (readingItem.type === 'book') {
                    void this.bookService.updateItem(readingItem, updates);
                } else {
                    void this.mangaService.updateItem(readingItem, updates);
                }
            },
        });
    }

    private handleContextItemMutation(item: MediaItem, changedFields: string[]): void {
        this.optimisticMutations.set(item.filePath, Date.now() + OPTIMISTIC_METADATA_SUPPRESS_MS);
        if (this.shouldFullRefreshAfterMutation(changedFields)) {
            this.applyFiltersAndSort({ scrollMode: 'preserve' });
            return;
        }
        this.refreshRenderedCard(item);
    }

    private shouldSuppressOptimisticMetadataRender(filePath: string): boolean {
        const until = this.optimisticMutations.get(filePath);
        if (!until) return false;
        if (Date.now() > until) {
            this.optimisticMutations.delete(filePath);
            return false;
        }
        return true;
    }

    private shouldFullRefreshAfterMutation(changedFields: string[]): boolean {
        if (changedFields.includes('priority')) return true;
        if (changedFields.includes('userRating') && this.viewState.sort.field === 'rating') return true;
        if ((this.viewState.sort.field === 'dateFinished' || this.viewState.sort.field === 'dateCompleted') && changedFields.some((field) => (
            field === 'status'
            || field === 'finished'
            || field === 'dateCompleted'
        ))) return true;
        if (this.viewState.sort.field === 'dateStarted' && changedFields.includes('started')) return true;
        if (changedFields.includes('status') && this.filter.statuses.length > 0) return true;
        if (changedFields.includes('favorite') && this.filter.favoriteOnly) return true;
        return false;
    }

    private refreshRenderedCard(item: MediaItem): void {
        const current = this.libraryContentEl?.querySelector<HTMLElement>(`[data-lorebase-file-path="${CSS.escape(item.filePath)}"]`);
        if (!current) {
            this.applyFiltersAndSort({ scrollMode: 'preserve' });
            return;
        }
        this.updateRenderedCardBadges(current, item);
        if (!GameCard.refreshElement(current, item)) {
            this.applyFiltersAndSort({ scrollMode: 'preserve' });
        }
    }

    private updateRenderedCardBadges(cardEl: HTMLElement, item: MediaItem): void {
        const badgeProfile = this.getBadgeProfile(item.type);
        cardEl.toggleClass(
            'lorebase-card-favorite-pulse',
            badgeProfile.favorite.enabled && badgeProfile.favorite.subtlePulse && item.favorite
        );

        const imageEl = cardEl.querySelector<HTMLElement>('.lorebase-card-image');
        if (!imageEl) return;

        this.updateStatusBadge(imageEl, item, badgeProfile);
        this.updateRatingBadge(imageEl, item, badgeProfile);
        this.updateFavoriteBadge(imageEl, item, badgeProfile);
        this.updateWorkTypeBadge(imageEl, item, badgeProfile);
    }

    private updateStatusBadge(
        imageEl: HTMLElement,
        item: MediaItem,
        badgeProfile: LorebaseSettings['badges']
    ): void {
        imageEl.querySelector('.lorebase-card-status')?.remove();
        if (!badgeProfile.status.enabled) return;

        const group = this.getOrCreateBadgeGroup(imageEl, badgeProfile.status.position);
        const appearance = getStatusAppearance(item.type, item.status);
        const statusBadge = group.createDiv({ cls: `lorebase-card-status lorebase-status-${item.status}` });
        statusBadge.style.color = appearance.color;
        setIcon(statusBadge.createSpan({ cls: 'lorebase-status-badge-icon' }), appearance.icon);

        if (badgeProfile.status.iconOnly) {
            statusBadge.addClass('is-icon-only');
            return;
        }

        statusBadge.createSpan({ text: withReleaseCountdown(this.getRenderedStatusLabel(item), item, i18n.getLanguage(), new Date(), badgeProfile.status.showReleaseCountdown !== false) });
    }

    private updateRatingBadge(
        imageEl: HTMLElement,
        item: MediaItem,
        badgeProfile: LorebaseSettings['badges']
    ): void {
        imageEl.querySelector('.lorebase-card-rating')?.remove();
        if (!badgeProfile.rating.enabled || !item.userRating) return;

        const group = this.getOrCreateBadgeGroup(imageEl, badgeProfile.rating.position);
        const ratingBadge = group.createDiv({ cls: 'lorebase-card-rating' });

        renderRatingBadgeContent(ratingBadge, item.userRating, this.plugin.settings.ratingScale, badgeProfile.rating.mode, item.type);
    }

    private updateFavoriteBadge(
        imageEl: HTMLElement,
        item: MediaItem,
        badgeProfile: LorebaseSettings['badges']
    ): void {
        imageEl.querySelector('.lorebase-card-favorite-badge')?.remove();
        if (!badgeProfile.favorite.enabled || !item.favorite || badgeProfile.favorite.subtlePulse) return;

        const group = this.getOrCreateBadgeGroup(imageEl, badgeProfile.favorite.position);
        const favoriteBadge = group.createDiv({ cls: 'lorebase-card-favorite-badge' });
        favoriteBadge.appendChild(this.createBadgeSvg(
            'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
            { fill: '#ffffff', stroke: 'none', width: '12', height: '12' }
        ));
    }

    private updateWorkTypeBadge(
        imageEl: HTMLElement,
        item: MediaItem,
        badgeProfile: LorebaseSettings['badges']
    ): void {
        imageEl.querySelector('.lorebase-card-work-type')?.remove();
        if (!item.workType || !badgeProfile.workType.enabled) return;

        const group = this.getOrCreateBadgeGroup(imageEl, badgeProfile.workType.position);
        const badge = group.createDiv({
            cls: 'lorebase-card-work-type',
            text: getMediaWorkTypeLabel(item.type, item.workType || '', i18n.getLanguage()),
        });
        badge.style.setProperty('--lorebase-type-color', getMediaWorkTypeColor(item.type, item.workType || ''));
    }

    private getOrCreateBadgeGroup(
        imageEl: HTMLElement,
        position: LorebaseSettings['badges']['status']['position']
    ): HTMLElement {
        const positionClass = `is-${position}`;
        const existing = Array.from(imageEl.querySelectorAll<HTMLElement>('.lorebase-card-badge-group'))
            .find((group) => group.hasClass(positionClass));
        if (existing) return existing;

        const group = imageEl.createDiv({ cls: `lorebase-card-badge-group ${positionClass}` });
        if (position.startsWith('top')) group.addClass('is-top-badge');
        return group;
    }

    private getRenderedStatusLabel(item: MediaItem): string {
        const customLabel = getStatusAppearance(item.type, item.status).label;
        if (customLabel) return customLabel;
        if (item.type === 'music') return mt(item.status);
        const overrides = this.getStatusLabelOverrides(item.type);
        const isReadingMedia = item.type === 'book' || item.type === 'manga';
        const fallback: Record<string, string> = {
            to_be_released: t('statusToBeReleased'),
            completed: item.type === 'game'
                ? t('statusPlayed')
                : isReadingMedia ? t('statusReadCompleted') : t('statusCompleted'),
            playing: t('statusPlaying'),
            dropped: t('statusDropped'),
            sandbox: t('statusSandbox'),
            wishlist: t('statusWishlist'),
            not_started: t('statusNotStarted'),
            planned: isReadingMedia ? t('statusPlanToRead') : t('statusPlanned'),
            watching: isReadingMedia ? t('statusReading') : t('statusWatching'),
            paused: t('statusPaused'),
        };
        const override = overrides[item.status]?.trim();
        const isLegacyGameCompletedLabel = item.type !== 'game'
            && item.status === 'completed'
            && override === t('statusPlayed')
            && t('statusPlayed') !== t('statusCompleted');
        let label = !isLegacyGameCompletedLabel && override
            ? override
            : fallback[item.status] || String(item.status);
        if (this.shouldShowFinishedDateOnBadge(item)) {
            const formatted = this.formatFinishedDate(item.finished);
            if (formatted) label = `${label} | ${formatted}`;
        }
        return label;
    }

    private shouldShowFinishedDateOnBadge(item: MediaItem): boolean {
        return (this.viewState.sort.field === 'dateFinished' || this.viewState.sort.field === 'dateCompleted')
            && item.status === 'completed'
            && Boolean(this.getFinishedTimestamp(item.finished));
    }

    private formatFinishedDate(value: string | null | undefined): string | null {
        const timestamp = this.getFinishedTimestamp(value);
        if (!timestamp) return null;
        const locale = i18n.getLocale();
        const options: Intl.DateTimeFormatOptions = this.getCompletionDateBadgeFormat(this.mediaType) === 'full'
            ? { month: 'short', day: 'numeric', year: 'numeric' }
            : { month: 'short', day: 'numeric' };
        try {
            return new Intl.DateTimeFormat(locale, options).format(new Date(timestamp));
        } catch {
            return new Date(timestamp).toLocaleDateString(locale, options);
        }
    }

    private getFinishedTimestamp(value: string | null | undefined): number | null {
        if (!value) return null;
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? null : parsed;
    }

    private getCompletionDateBadgeFormat(mediaType: MediaType): LorebaseSettings['completionDateBadgeFormat'] {
        const key = mediaType === 'game'
            ? 'games'
            : mediaType === 'movie'
                ? 'movies'
                : mediaType === 'book'
                    ? 'books'
                    : mediaType;
        return this.plugin.settings.completionDateBadgeFormats?.[key]
            ?? this.plugin.settings.completionDateBadgeFormat
            ?? 'short';
    }

    private createBadgeSvg(
        pathD: string,
        options: { fill?: string; stroke?: string; width?: string; height?: string } = {}
    ): SVGElement {
        const svg = createSvg('svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', options.fill ?? 'none');
        svg.setAttribute('stroke', options.stroke ?? 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        if (options.width) svg.setAttribute('width', options.width);
        if (options.height) svg.setAttribute('height', options.height);
        const path = svg.createSvg('path');
        path.setAttribute('d', pathD);
        svg.appendChild(path);
        return svg;
    }

    /**
     * Show random game
     */
    private showRandomGame(): void {
        const randomGame = this.mediaType === 'music'
            ? this.filteredGames[Math.floor(Math.random() * this.filteredGames.length)]
            : this.mediaType === 'anime'
            ? this.animeService.getRandomAnime(this.filteredGames as AnimeItem[])
            : this.mediaType === 'movie'
                ? this.movieService.getRandomItem(this.filteredGames as MovieItem[])
                : this.mediaType === 'series'
                    ? this.seriesService.getRandomItem(this.filteredGames as SeriesItem[])
                    : this.mediaType === 'book'
                        ? this.bookService.getRandomItem(this.filteredGames as ReadingItem[])
                        : this.mediaType === 'manga'
                            ? this.mangaService.getRandomItem(this.filteredGames as ReadingItem[])
                            : this.gameService.getRandomGame(this.filteredGames as GameItem[]);
        if (randomGame) {
            if (!this.libraryContentEl) return;
            this.renderVersion++;
            this.cancelCardBatch();
            this.cancelContentAnimations();
            this.cleanupVirtualization();
            this.gridEl = null;
            renderRandomCard({
                container: this.libraryContentEl,
                layout: { ...this.getEffectiveLayout(), columns: 1, targetCardWidth: this.layoutCalculator.getCardWidth(this.getEffectiveLayout()) },
                item: randomGame,
                titleText: this.getRandomTitleLabel(),
                backText: t('commonBack'),
                createCard: (parent, item) => {
                    this.createCard(parent, item);
                },
                onBack: () => this.render({ scrollMode: 'preserve' }),
            });
        }
    }

    /**
     * Show statistics modal
     */
    private showStats(): void {
        this.plugin.showStatsModal();
    }

    /**
     * Show settings panel
     */
    private showSettingsPanel(): void {
        // Open Obsidian settings to our plugin tab
        const settingsApi = (this.app as unknown as { setting?: AppSettingsApi }).setting;
        if (!settingsApi) return;
        settingsApi.open();
        settingsApi.openTabById('lorebase');
    }

    /**
     * Show loading indicator
     */
    private showLoading(): void {
        if (!this.libraryContentEl) return;
        this.renderVersion++;
        this.cancelCardBatch();
        this.cleanupVirtualization();
        this.gridEl = null;
        this.cancelContentAnimations();
        this.libraryContentEl.removeClass('is-rebuilding');
        this.libraryContentEl.empty();
        this.libraryContentEl.createDiv({ cls: 'lorebase-loading', text: t('notifyLoading') });
    }

    /**
     * Show error message
     */
    private showError(message: string): void {
        if (!this.libraryContentEl) return;
        this.renderVersion++;
        this.cancelCardBatch();
        this.cleanupVirtualization();
        this.gridEl = null;
        this.cancelContentAnimations();
        this.libraryContentEl.removeClass('is-rebuilding');
        this.libraryContentEl.empty();
        this.libraryContentEl.createDiv({ cls: 'lorebase-error', text: message });
    }

    /**
     * Refresh the view
     */
    async refresh(): Promise<void> {
        this.cancelScheduledVisualRefresh();

        const settings = this.plugin.settings;
        this.syncMediaType();
        const activeSettings = this.getActiveSettings();
        // Update folder path from settings in case it changed
        this.gameService.setFolderPath(settings.games.folderPath);
        this.animeService.setFolderPath(settings.anime.folderPath);
        this.movieService.setFolderPath(settings.movies.folderPath);
        this.seriesService.setFolderPath(settings.series.folderPath);
        this.bookService.setFolderPath(settings.books.folderPath);
        this.mangaService.setFolderPath(settings.manga.folderPath);
        this.musicService.setFolderPath(settings.music.folderPath);
        this.invalidateActiveServiceCache();
        this.cachedLayout = null;

        // If 18+ is disabled and we are in adult mode, switch to all
        if (!activeSettings.showAdultInAll && this.filter.adultOnly) {
            this.filter.adultOnly = false;
        }

        if (this.toolbar) {
            this.toolbar.updateMusicCovers(this.plugin.settings.music.albumCoverMode, this.plugin.settings.music.trackCoverMode);
            this.toolbar.beginUpdate();
            this.toolbar.updateMediaContext(this.mediaType, this.plugin.getEnabledMediaTypes());
            this.toolbar.updateSortOptions(this.getSortOptions());
            this.toolbar.updateRandomLabel(this.getRandomLabel());
            this.toolbar.refresh();
            this.toolbar.endUpdate();
        }
        await this.loadGames();
    }

    /**
     * Lightweight visual refresh for card-only setting changes (badges/overlay visuals).
     * Reuses already loaded items and current filters without reloading vault data.
     */
    refreshCardVisuals(): void {
        if (this.isDestroyed || !this.libraryContentEl) return;
        this.cachedLayout = null;
        this.scheduleVisualRefresh();
    }

    private scheduleVisualRefresh(): void {
        if (this.visualRefreshScheduled) return;
        this.visualRefreshScheduled = true;

        const run = (): void => {
            this.visualRefreshScheduled = false;
            this.visualRefreshIdleId = null;
            if (this.isDestroyed || !this.libraryContentEl) return;
            this.render({ scrollMode: 'preserve' });
        };

        const idleWindow = window as IdleWindowLike;
        this.visualRefreshRafId = window.requestAnimationFrame(() => {
            this.visualRefreshRafId = null;
            if (typeof idleWindow.requestIdleCallback === 'function') {
                this.visualRefreshIdleId = idleWindow.requestIdleCallback(() => {
                    run();
                }, { timeout: VISUAL_REFRESH_IDLE_TIMEOUT_MS });
                return;
            }
            this.visualRefreshIdleId = window.setTimeout(run, VISUAL_REFRESH_FALLBACK_MS);
        });
    }

    private cancelScheduledVisualRefresh(): void {
        if (this.visualRefreshRafId !== null) {
            window.cancelAnimationFrame(this.visualRefreshRafId);
            this.visualRefreshRafId = null;
        }

        if (this.visualRefreshIdleId !== null) {
            const idleWindow = window as IdleWindowLike;
            if (typeof idleWindow.cancelIdleCallback === 'function') {
                idleWindow.cancelIdleCallback(this.visualRefreshIdleId);
            } else {
                window.clearTimeout(this.visualRefreshIdleId);
            }
            this.visualRefreshIdleId = null;
        }

        this.visualRefreshScheduled = false;
    }

    private applyViewMode(): void {
        applyViewModeClass(this.contentEl, this.viewMode);
    }

    private getEffectiveLayout(): EffectiveLayout {
        return { ...this.layoutCalculator.getEffectiveLayout(this.getActiveSettings(), this.viewMode), partSearchCaption: this.hasPartSearchMatches };
    }

    private getRenderedColumns(layout: EffectiveLayout): number {
        return this.layoutCalculator.getRenderedColumns(layout);
    }

    private syncMediaType(): void {
        const nextType = this.plugin.getMediaType();
        if (this.mediaType === nextType) return;

        this.mediaType = nextType;
        const activeSettings = this.getActiveSettings();
        this.setViewState(activeSettings.viewState, false);
        this.viewMode = activeSettings.orientation === 'horizontal' ? 'horizontal' : 'grid';
        this.applyViewMode();
        this.filter.adultOnly = false;
        this.filter.customOnly = false;
        this.invalidateActiveServiceCache();
        this.filter.statuses = [];
        this.tagsDirty = true;
        this.cachedLayout = null;

        if (this.toolbar) {
            this.toolbar.updateMusicCovers(this.plugin.settings.music.albumCoverMode, this.plugin.settings.music.trackCoverMode);
            this.toolbar.beginUpdate();
            this.toolbar.updateMediaContext(this.mediaType, this.plugin.getEnabledMediaTypes());
            this.toolbar.updateSortOptions(this.getSortOptions());
            this.toolbar.updateRandomLabel(this.getRandomLabel());
            this.toolbar.updateSort({
                field: this.viewState.sort.field,
                order: this.viewState.sort.order,
            });
            this.toolbar.updateFilter({
                statuses: [],
                tags: this.viewState.tags,
                genres: this.viewState.genres,
                workTypes: [...(this.viewState.workTypes ?? [])],
                adultOnly: false,
                customOnly: false,
                rules: this.viewState.rules,
            });
            this.toolbar.updateViewState(
                this.viewState,
                activeSettings.savedViews,
                activeSettings.activeSavedViewId,
                this.getDefaultViewState()
            );
            this.toolbar.updateViewMode(this.viewMode);
            this.toolbar.endUpdate();
        }
    }

    private getActiveSettings(): LorebaseSettings['games'] {
        if (this.mediaType === 'music') return this.plugin.settings.music;
        if (this.mediaType === 'anime') return this.plugin.settings.anime;
        if (this.mediaType === 'movie') return this.plugin.settings.movies;
        if (this.mediaType === 'series') return this.plugin.settings.series;
        if (this.mediaType === 'book') return this.plugin.settings.books;
        if (this.mediaType === 'manga') return this.plugin.settings.manga;
        return this.plugin.settings.games;
    }

    private setViewState(state: LibraryViewState, persist: boolean): void {
        this.viewState = cloneLibraryViewState(state);
        this.filter.rules = this.viewState.rules;
        this.filter.tags = [...this.viewState.tags];
        this.filter.genres = [...this.viewState.genres];
        this.filter.workTypes = [...(this.viewState.workTypes ?? [])];
        this.filter.adultOnly = this.viewState.rules.some((rule) => rule.field === 'adult' && rule.operator === 'isTrue');
        this.filter.customOnly = this.viewState.rules.some((rule) => rule.field === 'custom' && rule.operator === 'isTrue');
        const settings = this.getActiveSettings();
        settings.viewState = cloneLibraryViewState(this.viewState);
        settings.sortField = this.viewState.sort.field;
        settings.sortOrder = this.viewState.sort.order;
        if (persist) void this.plugin.saveSettings();
    }

    private getDefaultViewState(): LibraryViewState {
        const key = this.mediaType === 'game'
            ? 'games'
            : this.mediaType === 'movie'
                ? 'movies'
                : this.mediaType === 'book'
                    ? 'books'
                    : this.mediaType;
        return cloneLibraryViewState(DEFAULT_SETTINGS[key].viewState);
    }

    private getFieldDefinitions(): FieldDefinition[] {
        const definitions: FieldDefinition[] = [
            ...getBuiltInFieldDefinitions(
                this.mediaType,
                this.getStatusOptions(),
                this.getFilterFlags(),
                this.games.map(item => item.workType || '').filter(Boolean)
            ),
        ];
        return buildLibraryFieldCatalog(definitions, this.games, this.viewState.rules,
            this.plugin.getMetadataService()?.getFrontmatterFieldAliases(this.mediaType) ?? {});
    }

    private uniqueSavedViewName(name: string, existing: string[]): string {
        const base = name.trim() || t('viewNew');
        const used = new Set(existing.map((entry) => entry.toLocaleLowerCase()));
        if (!used.has(base.toLocaleLowerCase())) return base;
        let index = 2;
        while (used.has(`${base} ${index}`.toLocaleLowerCase())) index++;
        return `${base} ${index}`;
    }

    private getOverlayProfile(mediaType: MediaType) {
        return getCardProfile(this.plugin.settings, mediaType, this.viewMode === 'horizontal' ? 'horizontal' : 'vertical');
    }

    private getBadgeProfile(mediaType: MediaType): LorebaseSettings['badges'] {
        return this.getOverlayProfile(mediaType).badges;
    }

    private getStatusOptions(): Array<{ status: MediaStatus; label: string }> {
        return getStatusOptionsForMediaType(this.mediaType, this.plugin.settings.statusLabels);
    }

    private getSortOptions(): Array<{ field: SortField; label: string }> {
        return getSortOptionsForMediaType(this.mediaType);
    }

    private getFilterFlags(): { showAdult: boolean; showCustom: boolean } {
        return getFilterFlagsForMediaType(this.mediaType);
    }

    private getRandomLabel(): string {
        return getRandomLabelForMediaType(this.mediaType);
    }

    private getRandomTitleLabel(): string {
        return getRandomTitleLabelForMediaType(this.mediaType);
    }

    private updateToolbarTags(): void {
        if (!this.toolbar || !this.tagsDirty) return;
        const groups = collectToolbarTags(this.games, {
            tags: this.filter.tags,
            genres: this.filter.genres,
        });
        if (this.mediaType === 'game') {
            const presetByTag = new Map(this.plugin.settings.tagPresets.games.map((preset) => [preset.tag, preset]));
            const tagCounts = new Map(groups.tags.map((tag) => [tag.id, tag.count]));
            groups.planTags = this.plugin.settings.tagPresets.games.map((preset) => ({
                id: preset.tag,
                label: this.getPlanPresetLabel(preset.id, preset.label),
                count: tagCounts.get(preset.tag) ?? 0,
            }));
            groups.tags = groups.tags.filter((tag) => !presetByTag.has(tag.id));
        }
        this.toolbar.beginUpdate();
        const definitions = this.getFieldDefinitions();
        const sortField = reconcileCatalogYamlField(this.viewState.sort.field, definitions);
        const groupMode = reconcileCatalogYamlField(this.viewState.group.mode, definitions);
        if (sortField !== this.viewState.sort.field || groupMode !== this.viewState.group.mode) {
            this.setViewState({
                ...this.viewState,
                sort: { ...this.viewState.sort, field: sortField },
                group: { ...this.viewState.group, mode: groupMode },
            }, true);
            const settings = this.getActiveSettings();
            this.toolbar.updateViewState(this.viewState, settings.savedViews, settings.activeSavedViewId, this.getDefaultViewState());
        }
        this.toolbar.updateSearchItems(this.games);
        this.toolbar.updateTags(groups);
        this.toolbar.updateFieldDefinitions(definitions);
        this.toolbar.endUpdate();
        this.tagsDirty = false;
    }

    private getStatusLabelOverrides(mediaType: MediaType): Partial<Record<MediaStatus, string>> {
        return mediaType === 'anime'
            ? this.plugin.settings.statusLabels.anime
            : mediaType === 'movie'
                ? this.plugin.settings.statusLabels.movies
                : mediaType === 'series'
                    ? this.plugin.settings.statusLabels.series
                    : mediaType === 'book'
                        ? this.plugin.settings.statusLabels.books
                        : mediaType === 'manga'
                            ? this.plugin.settings.statusLabels.manga
                            : this.plugin.settings.statusLabels.games;
    }

    private getPlanPresetLabel(id: string, fallback: string): string {
        const labels: Record<string, string> = {
            'check-later': t('planCheckLater'),
            'play-soon': t('planPlaySoon'),
            'wait-early-access': t('planWaitEarlyAccess'),
            'next-playthrough': t('planNextInQueue'),
        };
        const defaultPreset = DEFAULT_GAME_TAG_PRESETS.find((preset) => preset.id === id);
        return defaultPreset && fallback === defaultPreset.label ? labels[id] ?? fallback : fallback;
    }

}
