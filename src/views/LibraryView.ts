/**
 * LOREBASE - Library View
 * Main view for displaying the game library with virtualized rendering
 */

import { ItemView, WorkspaceLeaf, TFile, TAbstractFile } from 'obsidian';
import { AnimeItem, FieldDefinition, GameItem, LibraryViewState, MangaItem, MediaItem, MediaStatus, MediaType, FilterState, LorebaseSettings, LorebasePluginInterface, MovieItem, ReadingItem, SeriesItem, ViewMode, SortField } from '../types';
import { GameService } from '../services/GameService';
import { AnimeService } from '../services/AnimeService';
import { VideoService } from '../services/VideoService';
import { ReadingService } from '../services/ReadingService';
import { MetadataService } from '../services/MetadataService';
import { Toolbar, ToolbarCallbacks } from '../components/Toolbar';
import { GameCard } from '../components/GameCard';
import { VIEW_TYPE_LIBRARY, VIRTUALIZATION_BUFFER, LOREBASE_ICON_ID, SERIES_COLORS, STATUS_CONFIG, DEFAULT_GAME_TAG_PRESETS, DEFAULT_SETTINGS } from '../constants';
import { getRatingEmoji } from '../utils/ratingScale';
import { t, i18n } from '../localization';
import { VirtualGrid, VirtualGridController, VirtualGroupedGrid } from './library/VirtualGrid';
import { showMediaContextMenu } from './library/contextMenu';
import { EffectiveLayout, LayoutCalculator } from './library/LayoutCalculator';
import { RenderScrollMode, ScrollAnchor, ScrollManager } from './library/ScrollManager';
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
    createGrid,
    renderRandomCard,
} from './library/rendering';
import {
    cloneLibraryViewState,
    collectYamlFieldDefinitions,
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
const LAYOUT_RESIZE_SETTLE_MS = 180;
const OPTIMISTIC_METADATA_SUPPRESS_MS = 1200;

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
    private toolbar: Toolbar | null = null;
    private libraryContentEl: HTMLElement | null = null;
    private gridEl: HTMLElement | null = null;
    private isDestroyed = false; // Track if view has been destroyed

    // State
    private games: MediaItem[] = [];
    private gameIndex: Map<string, number> = new Map(); // filePath → index in games[]
    private filteredGames: MediaItem[] = [];
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
        rules: [],
    };
    private viewState: LibraryViewState = cloneLibraryViewState(DEFAULT_SETTINGS.games.viewState);
    private tagsDirty = true;
    private cachedLayout: EffectiveLayout | null = null;
    private layoutCalculator: LayoutCalculator;
    private scrollManager: ScrollManager;

    // Virtualization state
    private virtualGrid: VirtualGridController | null = null;
    private visualRefreshRafId: number | null = null;
    private visualRefreshIdleId: number | null = null;
    private visualRefreshScheduled = false;
    private filterRafId: number | null = null;
    private cardBatchRafId: number | null = null;
    private contentRevealAnimations = new Set<Animation>();
    private cardReflowAnimations = new Set<Animation>();
    private resizeObserver: ResizeObserver | null = null;
    private lastObservedLayoutWidth: number | null = null;
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
        ));
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
            this.viewMode = activeSettings.orientation === 'horizontal' ? 'horizontal' : 'grid';

            // Use contentEl provided by ItemView
            const container = this.contentEl;
            container.empty();
            container.addClass('lorebase-view');
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
            this.plugin.getEnabledMediaTypes()
        );
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
            if (requestedMediaType === 'anime') {
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
            const settings = this.getActiveSettings();

            if (this.mediaType === 'anime') {
                this.filteredGames = this.animeService.filterAndSort(
                    this.games as AnimeItem[],
                    this.filter,
                    this.viewState.sort.field,
                    this.viewState.sort.order
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

            this.updateToolbarTags();
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

        if (shouldGroup) {
            this.renderGroupedView(scrollMode, anchor, version);
        } else {
            this.renderFlatGrid(scrollMode, anchor, version);
        }
    }

    private renderGroupedView(scrollMode: RenderScrollMode, anchor: ScrollAnchor | null, version: number): void {
        if (!this.libraryContentEl) return;
        const layout = this.getEffectiveLayout();
        const renderedLayout = { ...layout, columns: this.getRenderedColumns(layout) };
        const locale = i18n.getLanguage() === 'uk' ? 'uk-UA' : i18n.getLanguage() === 'ru' ? 'ru-RU' : 'en-US';
        const groups = groupMediaItems(
            this.filteredGames,
            this.viewState.group.mode,
            this.viewState.group.order,
            locale
        );
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
                orientation: layout.orientation,
                cardHeight,
                buffer: VIRTUALIZATION_BUFFER,
                createCard: (parent, item) => this.createCard(parent, item),
            });
            this.finishContentRebuild(version, () => this.scrollManager.apply(scrollMode, anchor));
            return;
        }
        const tasks: CardRenderTask[] = [];

        groups.forEach((group, index) => {
            const section = this.libraryContentEl!.createDiv({ cls: 'lorebase-series-section lorebase-view-group-section' });
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
        window.requestAnimationFrame(() => {
            if (this.isDestroyed || version !== this.renderVersion || !this.libraryContentEl) return;
            const content = this.libraryContentEl;
            content.removeClass('is-rebuilding');

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
        };
        animation.onfinish = remove;
        animation.oncancel = remove;
    }

    private cancelAnimations(collection: Set<Animation>): void {
        for (const animation of collection) animation.cancel();
        collection.clear();
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
        const columns = this.getRenderedColumns(layout);
        const cardHeight = this.layoutCalculator.calculateActualCardHeight(layout, columns, this.gridEl);
        this.virtualGrid = new VirtualGrid<MediaItem>({
            gridEl: this.gridEl,
            scrollContainer: this.contentEl,
            items: this.filteredGames,
            columns,
            orientation: layout.orientation,
            cardHeight,
            buffer: VIRTUALIZATION_BUFFER,
            createCard: (parent, item) => this.createCard(parent, item),
        });
    }

    /**
     * Cleanup virtualization
     */
    private cleanupVirtualization(): void {
        if (this.virtualGrid) {
            this.virtualGrid.destroy();
            this.virtualGrid = null;
        }
    }

    private observeLayoutResize(): void {
        if (typeof ResizeObserver === 'undefined') return;

        this.resizeObserver?.disconnect();
        this.lastObservedLayoutWidth = null;
        this.resizeObserver = new ResizeObserver((entries) => {
            const width = Math.round(entries[0]?.contentRect.width ?? this.contentEl.clientWidth);
            if (width <= 0) return;
            if (this.lastObservedLayoutWidth === null) {
                this.lastObservedLayoutWidth = width;
                return;
            }
            if (width === this.lastObservedLayoutWidth) return;
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

    private scheduleVirtualLayoutRefresh(onComplete?: () => void): void {
        if (this.isDestroyed || !this.libraryContentEl) return;

        if (this.resizeLayoutRafId !== null) return;

        this.resizeLayoutRafId = window.requestAnimationFrame(() => {
            this.resizeLayoutRafId = null;
            if (this.isDestroyed || !this.libraryContentEl) return;

            this.cancelAnimations(this.cardReflowAnimations);
            const previousPositions = this.captureRenderedCardPositions();
            const layout = this.getEffectiveLayout();
            const columns = this.getRenderedColumns(layout);
            this.updateRenderedGridColumns(columns);

            if (this.virtualGrid && this.gridEl) {
                const cardHeight = this.layoutCalculator.calculateActualCardHeight(layout, columns, this.gridEl);
                this.virtualGrid.updateLayout({
                    columns,
                    orientation: layout.orientation,
                    cardHeight,
                });
            }
            this.animateRenderedCardReflow(previousPositions);
            onComplete?.();
        });
    }

    private captureRenderedCardPositions(): Map<string, DOMRect> {
        const positions = new Map<string, DOMRect>();
        this.libraryContentEl?.querySelectorAll<HTMLElement>('.lorebase-card[data-lorebase-file-path]')
            .forEach((card) => {
                const key = card.dataset.lorebaseFilePath;
                if (key) positions.set(key, card.getBoundingClientRect());
            });
        return positions;
    }

    private animateRenderedCardReflow(previousPositions: Map<string, DOMRect>): void {
        if (!this.libraryContentEl || previousPositions.size === 0) return;

        this.libraryContentEl.querySelectorAll<HTMLElement>('.lorebase-card[data-lorebase-file-path]')
            .forEach((card) => {
                const key = card.dataset.lorebaseFilePath;
                const previous = key ? previousPositions.get(key) : null;
                if (!previous || typeof card.animate !== 'function') return;

                const current = card.getBoundingClientRect();
                const deltaX = previous.left - current.left;
                const deltaY = previous.top - current.top;
                if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return;

                const hoverOffset = card.matches(':hover') ? -4 : 0;
                const animation = card.animate(
                    [
                        {
                            transform: `translate3d(${deltaX}px, ${deltaY + hoverOffset}px, 0)`,
                        },
                        {
                            transform: `translate3d(0, ${hoverOffset}px, 0)`,
                        },
                    ],
                    {
                        duration: 380,
                        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                    }
                );
                this.trackAnimation(animation, this.cardReflowAnimations);
            });
    }

    private updateRenderedGridColumns(columns: number): void {
        const ownerWindow = this.containerEl.ownerDocument.defaultView;
        const safeColumns = ownerWindow?.matchMedia('(max-width: 520px)').matches
            ? 2
            : Math.max(1, columns);
        const template = `repeat(${safeColumns}, minmax(0, 1fr))`;
        this.libraryContentEl?.querySelectorAll<HTMLElement>('.lorebase-grid').forEach((grid) => {
            grid.style.gridTemplateColumns = template;
        });
    }

    private markLayoutResizing(): void {
        if (this.resizeSettleTimerId === null) {
            this.virtualGrid?.setLayoutResizing(true);
        }

        if (this.resizeSettleTimerId !== null) {
            window.clearTimeout(this.resizeSettleTimerId);
        }

        this.resizeSettleTimerId = window.setTimeout(() => {
            this.resizeSettleTimerId = null;
            this.scheduleVirtualLayoutRefresh(() => {
                this.virtualGrid?.setLayoutResizing(false);
            });
        }, LAYOUT_RESIZE_SETTLE_MS);
    }

    private cleanupLayoutResize(): void {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
        this.lastObservedLayoutWidth = null;

        if (this.resizeLayoutRafId !== null) {
            window.cancelAnimationFrame(this.resizeLayoutRafId);
            this.resizeLayoutRafId = null;
        }

        if (this.resizeSettleTimerId !== null) {
            window.clearTimeout(this.resizeSettleTimerId);
            this.resizeSettleTimerId = null;
        }

        this.virtualGrid?.setLayoutResizing(false);
    }

    /**
     * Create a game card (uses cached layout/profiles per render cycle)
     */
    private createCard(parent: HTMLElement, game: MediaItem): GameCard {
        const layout = this.cachedLayout ?? this.getEffectiveLayout();
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
            },
            layout.cardSize,
            layout.orientation,
            activeSettings.cardStyle,
            this.viewState.sort.field,
            this.getBadgeProfile(game.type),
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
            (value) => this.plugin.getMetadataService()?.getImageUrl(value) ?? null
        );
        card.getElement().dataset.lorebaseFilePath = game.filePath;
        card.getElement().toggleClass(
            'lorebase-book-cover-effect',
            (game.type === 'book' || game.type === 'manga') && Boolean(activeSettings.bookCoverEffect)
        );
        return card;
    }

    private areMediaItemsEquivalent(left: MediaItem, right: MediaItem): boolean {
        if (left.type !== right.type) return false;
        if (
            left.filePath !== right.filePath
            || left.displayName !== right.displayName
            || left.year !== right.year
            || left.description !== right.description
            || left.userRating !== right.userRating
            || left.favorite !== right.favorite
            || left.imageUrl !== right.imageUrl
            || left.horizontalImageUrl !== right.horizontalImageUrl
            || left.hasCustomPoster !== right.hasCustomPoster
            || left.isAdult !== right.isAdult
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
            return left.format === right.format
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

    private openEditModal(item: MediaItem): void {
        const scrollTop = this.contentEl.scrollTop;
        this.plugin.showEditModal(
            item,
            () => {
                this.refreshFileFromCache(item.filePath);
                window.setTimeout(() => this.refreshFileFromCache(item.filePath), 100);
                this.finishEditScrollRestore(item.filePath);
            },
            () => this.beginEditScrollRestore(item.filePath, scrollTop)
        );
    }

    /**
     * Show context menu for a game
     */
    private showContextMenu(game: MediaItem, x: number, y: number): void {
        showMediaContextMenu(game, x, y, {
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
            onDelete: (item) => {
                this.plugin.showDeleteModal(item, async () => {
                    if (this.isDestroyed) return;
                    if (item.type === 'anime') {
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
    }

    private updateStatusBadge(
        imageEl: HTMLElement,
        item: MediaItem,
        badgeProfile: LorebaseSettings['badges']
    ): void {
        imageEl.querySelector('.lorebase-card-status')?.remove();
        if (!badgeProfile.status.enabled) return;

        const group = this.getOrCreateBadgeGroup(imageEl, badgeProfile.status.position);
        const config = STATUS_CONFIG[item.status];
        const statusBadge = group.createDiv({ cls: `lorebase-card-status lorebase-status-${item.status}` });

        if (badgeProfile.status.iconOnly) {
            statusBadge.addClass('is-icon-only');
            statusBadge.appendChild(this.createBadgeSvg(config.pathD));
            return;
        }

        statusBadge.appendChild(this.createBadgeSvg(config.pathD));
        statusBadge.createSpan({ text: this.getRenderedStatusLabel(item) });
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

        if (badgeProfile.rating.mode === 'emoji') {
            ratingBadge.addClass('is-emoji');
            ratingBadge.textContent = getRatingEmoji(item.userRating);
            return;
        }

        ratingBadge.textContent = `★${item.userRating}`;
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
        const overrides = this.getStatusLabelOverrides(item.type);
        const isReadingMedia = item.type === 'book' || item.type === 'manga';
        const fallback: Record<string, string> = {
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
        const locale = i18n.getLanguage() === 'ru' ? 'ru-RU' : 'en-US';
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
        const randomGame = this.mediaType === 'anime'
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
            renderRandomCard({
                container: this.libraryContentEl,
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
        if (this.mediaType === 'anime') {
            const stats = this.animeService.calculateStats(this.games as AnimeItem[]);
            this.plugin.showStatsModal(stats, 'anime');
            return;
        }
        if (this.mediaType === 'movie') {
            const stats = this.movieService.calculateStats(this.games as MovieItem[]);
            this.plugin.showStatsModal(stats, 'movie');
            return;
        }
        if (this.mediaType === 'series') {
            const stats = this.seriesService.calculateStats(this.games as SeriesItem[]);
            this.plugin.showStatsModal(stats, 'series');
            return;
        }
        if (this.mediaType === 'book') {
            const stats = this.bookService.calculateStats(this.games as ReadingItem[]);
            this.plugin.showStatsModal(stats, 'book');
            return;
        }
        if (this.mediaType === 'manga') {
            const stats = this.mangaService.calculateStats(this.games as ReadingItem[]);
            this.plugin.showStatsModal(stats, 'manga');
            return;
        }
        const stats = this.gameService.calculateStats(this.games as GameItem[]);
        this.plugin.showStatsModal(stats, 'game');
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
        this.invalidateActiveServiceCache();
        this.cachedLayout = null;

        // If 18+ is disabled and we are in adult mode, switch to all
        if (!activeSettings.showAdultInAll && this.filter.adultOnly) {
            this.filter.adultOnly = false;
        }

        if (this.toolbar) {
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
        return this.layoutCalculator.getEffectiveLayout(this.getActiveSettings(), this.viewMode);
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
        return [
            ...getBuiltInFieldDefinitions(this.mediaType, this.getStatusOptions(), this.getFilterFlags()),
            ...collectYamlFieldDefinitions(this.games),
        ];
    }

    private uniqueSavedViewName(name: string, existing: string[]): string {
        const base = name.trim() || (i18n.getLanguage() === 'ru' ? 'Новый вид' : 'New view');
        const used = new Set(existing.map((entry) => entry.toLocaleLowerCase()));
        if (!used.has(base.toLocaleLowerCase())) return base;
        let index = 2;
        while (used.has(`${base} ${index}`.toLocaleLowerCase())) index++;
        return `${base} ${index}`;
    }

    private getOverlayProfile(mediaType: MediaType): {
        layout: LorebaseSettings['overlayTextLayout'];
        visibility: LorebaseSettings['overlayTextVisibility'];
        descriptionLines: number;
    } {
        if (mediaType === 'anime') {
            return {
                layout: this.viewMode === 'horizontal'
                    ? this.plugin.settings.animeHorizontalOverlayTextLayout
                    : this.plugin.settings.animeOverlayTextLayout,
                visibility: this.viewMode === 'horizontal'
                    ? this.plugin.settings.animeHorizontalOverlayTextVisibility
                    : this.plugin.settings.animeOverlayTextVisibility,
                descriptionLines: this.viewMode === 'horizontal'
                    ? this.plugin.settings.animeHorizontalDescriptionLines
                    : this.plugin.settings.animeDescriptionLines,
            };
        }
        if (mediaType === 'movie') {
            return {
                layout: this.viewMode === 'horizontal'
                    ? this.plugin.settings.movieHorizontalOverlayTextLayout
                    : this.plugin.settings.movieOverlayTextLayout,
                visibility: this.viewMode === 'horizontal'
                    ? this.plugin.settings.movieHorizontalOverlayTextVisibility
                    : this.plugin.settings.movieOverlayTextVisibility,
                descriptionLines: this.viewMode === 'horizontal'
                    ? this.plugin.settings.movieHorizontalDescriptionLines
                    : this.plugin.settings.movieDescriptionLines,
            };
        }
        if (mediaType === 'series') {
            return {
                layout: this.viewMode === 'horizontal'
                    ? this.plugin.settings.seriesHorizontalOverlayTextLayout
                    : this.plugin.settings.seriesOverlayTextLayout,
                visibility: this.viewMode === 'horizontal'
                    ? this.plugin.settings.seriesHorizontalOverlayTextVisibility
                    : this.plugin.settings.seriesOverlayTextVisibility,
                descriptionLines: this.viewMode === 'horizontal'
                    ? this.plugin.settings.seriesHorizontalDescriptionLines
                    : this.plugin.settings.seriesDescriptionLines,
            };
        }
        if (mediaType === 'book') {
            return {
                layout: this.viewMode === 'horizontal'
                    ? this.plugin.settings.bookHorizontalOverlayTextLayout
                    : this.plugin.settings.bookOverlayTextLayout,
                visibility: this.viewMode === 'horizontal'
                    ? this.plugin.settings.bookHorizontalOverlayTextVisibility
                    : this.plugin.settings.bookOverlayTextVisibility,
                descriptionLines: this.viewMode === 'horizontal'
                    ? this.plugin.settings.bookHorizontalDescriptionLines
                    : this.plugin.settings.bookDescriptionLines,
            };
        }
        if (mediaType === 'manga') {
            return {
                layout: this.viewMode === 'horizontal'
                    ? this.plugin.settings.mangaHorizontalOverlayTextLayout
                    : this.plugin.settings.mangaOverlayTextLayout,
                visibility: this.viewMode === 'horizontal'
                    ? this.plugin.settings.mangaHorizontalOverlayTextVisibility
                    : this.plugin.settings.mangaOverlayTextVisibility,
                descriptionLines: this.viewMode === 'horizontal'
                    ? this.plugin.settings.mangaHorizontalDescriptionLines
                    : this.plugin.settings.mangaDescriptionLines,
            };
        }
        return {
            layout: this.viewMode === 'horizontal'
                ? this.plugin.settings.horizontalOverlayTextLayout
                : this.plugin.settings.overlayTextLayout,
            visibility: this.viewMode === 'horizontal'
                ? this.plugin.settings.horizontalOverlayTextVisibility
                : this.plugin.settings.overlayTextVisibility,
            descriptionLines: this.viewMode === 'horizontal'
                ? this.plugin.settings.horizontalDescriptionLines
                : this.plugin.settings.descriptionLines,
        };
    }

    private getBadgeProfile(mediaType: MediaType): LorebaseSettings['badges'] {
        if (mediaType === 'anime') {
            return this.viewMode === 'horizontal'
                ? this.plugin.settings.animeHorizontalBadges
                : this.plugin.settings.animeBadges;
        }
        if (mediaType === 'movie') {
            return this.viewMode === 'horizontal'
                ? this.plugin.settings.movieHorizontalBadges
                : this.plugin.settings.movieBadges;
        }
        if (mediaType === 'series') {
            return this.viewMode === 'horizontal'
                ? this.plugin.settings.seriesHorizontalBadges
                : this.plugin.settings.seriesBadges;
        }
        if (mediaType === 'book') {
            return this.viewMode === 'horizontal'
                ? this.plugin.settings.bookHorizontalBadges
                : this.plugin.settings.bookBadges;
        }
        if (mediaType === 'manga') {
            return this.viewMode === 'horizontal'
                ? this.plugin.settings.mangaHorizontalBadges
                : this.plugin.settings.mangaBadges;
        }
        return this.viewMode === 'horizontal'
            ? this.plugin.settings.horizontalBadges
            : this.plugin.settings.badges;
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
        this.toolbar.updateTags(groups);
        this.toolbar.updateFieldDefinitions(this.getFieldDefinitions());
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
