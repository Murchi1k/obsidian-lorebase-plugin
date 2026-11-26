import { countryFieldLabel } from '../utils/mediaWorkType';
import { createDropdownLifecycle } from './dropdownLifecycle';
import { mt } from '../localization/music';
import { getManageWorkTypesLabel } from '../utils/mangaWorkType';
/**
 * LOREBASE - Toolbar Component
 * Filter, sort, search, and action buttons
 */

import { setIcon } from 'obsidian';
import {
    FieldDefinition,
    FilterOperator,
    FilterRule,
    FilterState,
    GroupMode,
    LibraryViewState,
    MediaType,
    MusicCoverMode,
    SavedLibraryView,
    SortField,
    SortOrder,
    ViewMode,
} from '../types';
import { i18n, t } from '../localization';
import { SEARCH_DEBOUNCE_MS } from '../constants';
import { DropdownManager } from './toolbar/DropdownManager';
import { hasActiveTagFilters } from './toolbar/stateUtils';
import { TagGroups, TagSummary, ToolbarCallbacks } from './toolbar/types';
import { cloneLibraryViewState, createRuleId, libraryViewStatesEqual } from '../services/media/libraryViewState';
import { createLorebaseDropdown } from './LorebaseDropdown';
import { MEDIA_ICONS } from '../mediaPresentation';
import { LibrarySearchInput } from './LibrarySearchInput';
import { addSearchSuggestionRule, collectSearchSuggestions, findSearchSuggestions, SearchFilterSuggestion } from '../services/media/searchSuggestions';
import type { MediaItem } from '../types';
import { getCatalogFieldId, getLibraryFieldGroup, libraryCatalogCopy } from '../services/media/libraryFieldCatalog';
import { renderLibraryFilterChoices } from './LibraryFilterChoices';
import { createLibraryFieldPicker } from './LibraryFieldPicker';
import { suggestKeyboardLayout } from '../utils/keyboardLayout';
import { getTitleSearchMatch } from '../services/media/titleSearch';

export type { ToolbarCallbacks } from './toolbar/types';

// =============================================================================
// TOOLBAR COMPONENT
// =============================================================================

/**
 * Toolbar component with all controls
 */
export class Toolbar {
    private container: HTMLElement;
    private callbacks: ToolbarCallbacks;
    private currentSort: { field: SortField; order: SortOrder };
    private currentFilter: FilterState;
    private currentViewMode: ViewMode;
    private sortOptions: Array<{ field: SortField; label: string }>;
    private availableTags: TagGroups = { planTags: [], tags: [], genres: [] };
    private searchTimeout: number | null = null;
    private searchControl: LibrarySearchInput | null = null;
    private searchSuggestions: SearchFilterSuggestion[] = [];
    private searchItems: MediaItem[] = [];
    private randomLabel: string;
    private dropdownManager: DropdownManager;
    private batchDepth = 0;
    private batchDirty = false;
    private currentViewState: LibraryViewState;
    private savedViews: SavedLibraryView[];
    private activeSavedViewId: string | null;
    private fieldDefinitions: FieldDefinition[];
    private defaultViewState: LibraryViewState;
    private resizeObserver: ResizeObserver | null = null;
    private isNarrowViewPanel = false;
    private narrowViewPanelWidth = 0;
    private currentMediaType: MediaType;
    private enabledMediaTypes: MediaType[];
    private mediaTrayOpen = false;
    private mediaTrigger: HTMLButtonElement | null = null;
    private mediaTrayKeyHandler: (event: KeyboardEvent) => void;

    constructor(
        parent: HTMLElement,
        callbacks: ToolbarCallbacks,
        initialSort: { field: SortField; order: SortOrder },
        initialFilter: FilterState,
        initialViewMode: ViewMode,
        sortOptions: Array<{ field: SortField; label: string }>,
        randomLabel: string,
        viewState: LibraryViewState,
        savedViews: SavedLibraryView[],
        activeSavedViewId: string | null,
        fieldDefinitions: FieldDefinition[],
        defaultViewState: LibraryViewState,
        currentMediaType: MediaType,
        enabledMediaTypes: MediaType[],
        private musicCovers: { album: MusicCoverMode; track: MusicCoverMode } = { album: 'square', track: 'square' }
    ) {
        this.callbacks = callbacks;
        this.currentSort = initialSort;
        this.currentFilter = initialFilter;
        this.currentViewMode = initialViewMode;
        this.sortOptions = sortOptions;
        this.randomLabel = randomLabel;
        this.currentViewState = cloneLibraryViewState(viewState);
        this.savedViews = savedViews.map((view) => ({ ...view, state: cloneLibraryViewState(view.state) }));
        this.activeSavedViewId = activeSavedViewId;
        this.fieldDefinitions = fieldDefinitions;
        this.defaultViewState = cloneLibraryViewState(defaultViewState);
        this.currentMediaType = currentMediaType;
        this.enabledMediaTypes = [...enabledMediaTypes];
        this.mediaTrayKeyHandler = (event: KeyboardEvent): void => {
            if (event.key !== 'Escape' || !this.mediaTrayOpen) return;
            event.preventDefault();
            this.mediaTrayOpen = false;
            this.render();
            window.requestAnimationFrame(() => this.mediaTrigger?.focus());
        };
        this.container = parent.createDiv({ cls: 'lorebase-toolbar' });
        this.dropdownManager = new DropdownManager(this.container);
        activeDocument.addEventListener('keydown', this.mediaTrayKeyHandler);
        this.render();
        if (typeof ResizeObserver !== 'undefined') {
            this.resizeObserver = new ResizeObserver((entries) => {
                const width = Math.round(entries[0]?.contentRect.width ?? this.container.clientWidth);
                const isNarrow = width > 0 && width <= 520;
                if (isNarrow !== this.isNarrowViewPanel) {
                    this.isNarrowViewPanel = isNarrow;
                    this.container.toggleClass('is-narrow-view-panel', isNarrow);
                    if (!isNarrow) {
                        this.narrowViewPanelWidth = 0;
                        this.container.style.removeProperty('--lorebase-toolbar-width');
                    }
                }
                if (isNarrow && width !== this.narrowViewPanelWidth) {
                    this.narrowViewPanelWidth = width;
                    this.container.style.setProperty('--lorebase-toolbar-width', `${width}px`);
                }
            });
            this.resizeObserver.observe(this.container);
        }
    }

    /**
     * Begin a batch update — all render() calls are suppressed until endUpdate().
     */
    beginUpdate(): void {
        this.batchDepth++;
    }

    /**
     * End a batch update — renders once if anything changed.
     */
    endUpdate(): void {
        if (this.batchDepth > 0) this.batchDepth--;
        if (this.batchDepth === 0 && this.batchDirty) {
            this.batchDirty = false;
            this.renderNow();
        }
    }

    /**
     * Render the toolbar (respects batch mode)
     */
    private render(): void {
        if (this.batchDepth > 0) {
            this.batchDirty = true;
            return;
        }
        this.renderNow();
    }

    /**
     * Actual render implementation
     */
    private renderNow(): void {
        const previousInput = this.searchControl?.input;
        const restoreSearchFocus = Boolean(previousInput && previousInput.ownerDocument.activeElement === previousInput);
        const selection = [previousInput?.selectionStart ?? null, previousInput?.selectionEnd ?? null] as const;
        this.searchControl?.destroy();
        const keepViewPanelOpen = Boolean(
            this.container.querySelector('.lorebase-view-panel.is-open')
        );
        this.dropdownManager.closeDropdowns();
        this.container.empty();
        this.container.addClass('lorebase-toolbar');
        this.container.toggleClass('has-media-tray', this.mediaTrayOpen);

        const mobileHeader = this.container.createDiv({ cls: 'lorebase-toolbar-mobile-header' });
        mobileHeader.createSpan({ cls: 'lorebase-toolbar-mobile-title', text: 'LOREBASE' });

        const leftControls = this.container.createDiv({ cls: 'lorebase-toolbar-left' });
        const centerControls = this.container.createDiv({ cls: 'lorebase-toolbar-center' });
        const rightControls = this.container.createDiv({ cls: 'lorebase-toolbar-right' });

        this.renderOrganizeControl(leftControls);
        this.renderTagsControl(leftControls);
        this.renderMediaControl(leftControls);
        this.renderReleaseCalendarButton(leftControls);

        this.renderSearch(centerControls);
        this.renderAddButton(centerControls);

        this.renderCustomGroupsButton(rightControls);
        this.renderRandomButton(rightControls);
        this.renderViewModeControl(rightControls);
        this.renderSettingsControl(rightControls);

        if (this.mediaTrayOpen) {
            this.renderMediaTray();
        }

        if (keepViewPanelOpen) {
            const panel = this.container.querySelector<HTMLElement>('.lorebase-view-panel');
            const button = panel?.parentElement?.querySelector<HTMLButtonElement>('.lorebase-toolbar-btn');
            panel?.addClass('is-open');
            button?.addClass('is-open');
            button?.setAttribute('aria-expanded', 'true');
        }
        if (restoreSearchFocus) {
            const input = this.searchControl?.input;
            input?.focus({ preventScroll: true });
            input?.setSelectionRange(...selection);
        }
    }

    updateMusicCovers(album: MusicCoverMode, track: MusicCoverMode): void { this.musicCovers = { album, track }; }

    private renderMusicKindControl(parent: HTMLElement, coverOnly = false): void {
        const selected = this.currentViewState.rules.find(rule => rule.field === 'musicKind');
        const value = selected?.operator === 'containsAny' && Array.isArray(selected.value) && selected.value.length === 1 ? selected.value[0] : 'all';
        if (coverOnly) {
        const coverMode = value === 'track' ? this.musicCovers.track : this.musicCovers.album;
        const label = `${mt('coverStyle')}: ${mt(coverMode === 'cd' ? 'cdCase' : coverMode)}`;
        const coverButton = parent.createEl('button', { cls: 'lorebase-toolbar-btn', attr: { 'aria-label': label, title: label, type: 'button' } });
        setIcon(coverButton, 'disc-3');
        coverButton.toggleClass('is-active', coverMode !== 'square');
        coverButton.addEventListener('click', () => {
            const mode: MusicCoverMode = coverMode === 'square' ? 'cd' : coverMode === 'cd' ? 'vinyl' : 'square';
            const kind = value === 'track' ? 'track' : value === 'album' ? 'album' : 'all';
            if (kind !== 'track') this.musicCovers.album = mode;
            if (kind !== 'album') this.musicCovers.track = mode;
            this.callbacks.onMusicCoverModeChange?.(kind, mode);
            this.render();
        });
        return;
        }
        const row = parent.createDiv({ cls: 'lorebase-view-control-row' });
        row.createSpan({ cls: 'lorebase-view-control-label', text: mt('kind') });
        const dropdown = row.createDiv({ cls: 'lorebase-view-dropdown' });
        createLorebaseDropdown(dropdown, [
            { value: 'album', label: mt('albums') }, { value: 'track', label: mt('tracks') }, { value: 'all', label: mt('all') },
        ], value, (kind) => {
            const state = cloneLibraryViewState(this.currentViewState);
            state.rules = state.rules.filter(rule => rule.field !== 'musicKind');
            if (kind !== 'all') state.rules.push({ id: 'music-kind', field: 'musicKind', fieldType: 'list', operator: 'containsAny', value: [kind] });
            this.currentViewState = state;
            this.callbacks.onViewStateChange(state);
            this.render();
        }, { floating: true });
    }

    private renderOrganizeControl(parent: HTMLElement): void {
        const copy = this.viewText();
        const { button, panel } = this.createDropdown(parent, {
            icon: 'sliders-horizontal',
            label: copy.configure,
        });
        panel.addClass('lorebase-view-panel');
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', copy.configure);
        const count = this.currentViewState.rules.length;
        button.toggleClass('is-active', this.hasCustomizedView());
        this.addMobileButtonLabel(button, copy.configure, count);
        if (count > 0) {
            button.createSpan({ cls: 'lorebase-view-rule-count', text: String(count) });
        }
        this.renderViewPanel(panel, button);
    }

    private renderMediaControl(parent: HTMLElement): void {
        const current = this.mediaOption(this.currentMediaType);
        const button = parent.createEl('button', {
            cls: `lorebase-toolbar-btn lorebase-media-trigger ${this.mediaTrayOpen ? 'is-open' : ''}`,
            attr: {
                type: 'button',
                'aria-label': `${t('mediaSwitcher')}: ${current.label}`,
                'aria-expanded': String(this.mediaTrayOpen),
                'aria-controls': 'lorebase-media-tray',
            },
        });
        this.mediaTrigger = button;
        this.addMobileButtonLabel(button, current.label);

        const icon = button.createSpan({ cls: 'lorebase-media-trigger-icon' });
        setIcon(icon, current.icon);

        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.dropdownManager.closeDropdowns();
            this.mediaTrayOpen = !this.mediaTrayOpen;
            this.render();
        });
    }

    private renderMediaTray(): void {
        const tray = this.container.createDiv({
            cls: 'lorebase-media-tray',
            attr: {
                id: 'lorebase-media-tray',
                role: 'toolbar',
                'aria-label': t('mediaSwitcher'),
            },
        });

        for (const mediaType of this.enabledMediaTypes) {
            const option = this.mediaOption(mediaType);
            const active = mediaType === this.currentMediaType;
            const button = tray.createEl('button', {
                cls: `lorebase-media-option ${active ? 'is-active' : ''}`,
                attr: {
                    type: 'button',
                    'aria-label': option.label,
                    'aria-pressed': String(active),
                },
            });
            const icon = button.createSpan({ cls: 'lorebase-media-option-icon' });
            setIcon(icon, option.icon);
            if (active) {
                button.createSpan({ cls: 'lorebase-media-option-label', text: option.label });
            }
            button.addEventListener('click', () => {
                if (mediaType === this.currentMediaType) return;
                this.currentMediaType = mediaType;
                this.render();
                this.callbacks.onMediaTypeChange(mediaType);
            });
        }

        const close = tray.createEl('button', {
            cls: 'lorebase-media-option lorebase-media-tray-close',
            attr: { type: 'button', 'aria-label': t('mediaSwitcherClose') },
        });
        setIcon(close, 'x');
        close.addEventListener('click', () => {
            this.mediaTrayOpen = false;
            this.render();
            window.requestAnimationFrame(() => this.mediaTrigger?.focus());
        });
    }

    private mediaOption(mediaType: MediaType): { label: string; icon: string } {
        if (mediaType === 'anime') return { label: t('contextAnime'), icon: MEDIA_ICONS.anime };
        if (mediaType === 'movie') return { label: t('settingsMovies'), icon: MEDIA_ICONS.movie };
        if (mediaType === 'series') return { label: t('settingsSeries'), icon: MEDIA_ICONS.series };
        if (mediaType === 'music') return { label: mt('music'), icon: MEDIA_ICONS.music };
        if (mediaType === 'book') return { label: t('settingsBooks'), icon: MEDIA_ICONS.book };
        if (mediaType === 'manga') return { label: t('settingsManga'), icon: MEDIA_ICONS.manga };
        return { label: t('contextGames'), icon: MEDIA_ICONS.game };
    }

    private renderViewPanel(panel: HTMLElement, button: HTMLButtonElement): void {
        const copy = this.viewText();
        panel.empty();

        const header = panel.createDiv({ cls: 'lorebase-view-panel-header' });
        const titleWrap = header.createDiv({ cls: 'lorebase-view-panel-title-wrap' });
        titleWrap.createDiv({ cls: 'lorebase-view-panel-title', text: copy.configure });
        const activeSaved = this.savedViews.find((view) => view.id === this.activeSavedViewId);
        const dirty = Boolean(activeSaved && !libraryViewStatesEqual(activeSaved.state, this.currentViewState));
        titleWrap.createDiv({
            cls: `lorebase-view-panel-subtitle ${dirty ? 'is-dirty' : ''}`,
            text: dirty ? copy.modified : (activeSaved?.name ?? copy.baseView),
        });

        const reset = header.createEl('button', {
            cls: 'lorebase-view-icon-button',
            attr: { type: 'button', 'aria-label': copy.reset, title: copy.reset },
        });
        setIcon(reset, 'rotate-ccw');
        reset.addEventListener('click', () => this.callbacks.onResetView());

        const savedSection = panel.createDiv({ cls: 'lorebase-view-saved-section' });
        const savedDropdown = savedSection.createDiv({ cls: 'lorebase-view-dropdown' });
        createLorebaseDropdown(
            savedDropdown,
            [
                { label: copy.baseView, value: '' },
                ...this.savedViews.map((view) => ({ label: view.name, value: view.id })),
            ],
            this.activeSavedViewId ?? '',
            (value) => this.callbacks.onApplySavedView(value || null),
            { floating: true }
        );

        const update = savedSection.createEl('button', {
            cls: 'lorebase-view-icon-button',
            attr: {
                type: 'button',
                'aria-label': copy.update,
                title: copy.update,
            },
        });
        update.disabled = !this.activeSavedViewId;
        setIcon(update, 'save');
        update.addEventListener('click', () => {
            if (this.activeSavedViewId) {
                this.callbacks.onUpdateSavedView(this.activeSavedViewId, cloneLibraryViewState(this.currentViewState));
            }
        });

        if (this.activeSavedViewId) {
            const remove = savedSection.createEl('button', {
                cls: 'lorebase-view-icon-button is-danger',
                attr: { type: 'button', 'aria-label': copy.deleteView, title: copy.deleteView },
            });
            setIcon(remove, 'trash-2');
            remove.addEventListener('click', () => {
                if (this.activeSavedViewId) this.callbacks.onDeleteSavedView(this.activeSavedViewId);
            });
        }

        const saveRow = panel.createDiv({ cls: 'lorebase-view-save-row' });
        const nameInput = saveRow.createEl('input', {
            cls: 'lorebase-view-name-input',
            attr: { type: 'text', placeholder: copy.viewName, 'aria-label': copy.viewName },
        });
        const saveAs = saveRow.createEl('button', {
            cls: 'lorebase-view-small-button',
            text: copy.saveAs,
            attr: { type: 'button' },
        });
        const commitSave = (): void => {
            const name = nameInput.value.trim();
            if (!name) {
                nameInput.focus();
                return;
            }
            this.callbacks.onSaveView(name, cloneLibraryViewState(this.currentViewState));
        };
        saveAs.addEventListener('click', commitSave);
        nameInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') commitSave();
        });
        if (this.activeSavedViewId) {
            const rename = saveRow.createEl('button', {
                cls: 'lorebase-view-icon-button',
                attr: { type: 'button', 'aria-label': copy.rename, title: copy.rename },
            });
            setIcon(rename, 'pencil');
            rename.addEventListener('click', () => {
                const name = nameInput.value.trim();
                if (!name) {
                    nameInput.focus();
                    return;
                }
                if (this.activeSavedViewId) this.callbacks.onRenameSavedView(this.activeSavedViewId, name);
            });
        }

        const controls = panel.createDiv({ cls: 'lorebase-view-controls' });
        this.renderSortRow(controls, button, panel);
        this.renderGroupRow(controls, button, panel);
        if (this.currentMediaType === 'music') this.renderMusicKindControl(controls);
        this.renderWorkTypeRow(controls, button);

        const filters = panel.createDiv({ cls: 'lorebase-view-filters' });
        const filtersHeader = filters.createDiv({ cls: 'lorebase-view-section-header' });
        filtersHeader.createSpan({ text: copy.filters });
        filtersHeader.createSpan({ cls: 'lorebase-view-section-count', text: String(this.currentViewState.rules.length) });

        const ruleList = filters.createDiv({ cls: 'lorebase-view-rule-list' });
        if (this.currentViewState.rules.length === 0) {
            ruleList.createDiv({ cls: 'lorebase-view-empty', text: copy.noFilters });
        } else {
            for (const rule of this.currentViewState.rules) {
                this.renderRuleEditor(ruleList, rule, panel, button);
            }
        }

        const addRow = filters.createDiv({ cls: 'lorebase-view-add-row' });
        const addDropdown = addRow.createDiv({ cls: 'lorebase-view-dropdown is-filter-picker' });
        const selectedFields = new Set(this.currentViewState.rules.map(rule => getCatalogFieldId(rule.field)));
        createLibraryFieldPicker(addDropdown,
            this.fieldDefinitions.filter(field => field.id !== 'workType' && !selectedFields.has(field.id)), {
            label: copy.addFilter, add: true,
            onSelect: (definition) => {
                if (this.currentViewState.rules.some(rule => getCatalogFieldId(rule.field) === definition.id)) return;
                const rule: FilterRule = {
                    id: createRuleId(),
                    field: definition.id,
                    fieldType: definition.type,
                    operator: definition.operators[0],
                    value: definition.type === 'list' ? [] : '',
                };
                this.currentViewState.rules.push(rule);
                this.emitViewState(button);
                this.renderViewPanel(panel, button);
                const last = panel.querySelector<HTMLElement>('.lorebase-view-rule:last-child');
                last?.querySelector<HTMLElement>('input, .lorebase-filter-value-option')?.focus({ preventScroll: true });
                panel.scrollTop = panel.scrollHeight;
            },
        });
    }

    private renderSortRow(parent: HTMLElement, button: HTMLButtonElement, panel: HTMLElement): void {
        const copy = this.viewText();
        const row = parent.createDiv({ cls: 'lorebase-view-control-row' });
        row.createSpan({ cls: 'lorebase-view-control-label', text: copy.sortBy });
        const dropdown = row.createDiv({ cls: 'lorebase-view-dropdown is-sort-picker' });
        const options: FieldDefinition[] = [];
        for (const option of this.sortOptions) {
            const definition = this.fieldDefinitions.find(field => field.id === option.field);
            if (!definition && option.field !== 'name') continue;
            options.push({ ...definition, id: option.field, label: option.label, type: definition?.type ?? 'text',
                icon: option.field === 'name' ? 'type' : definition?.icon ?? 'type', source: 'builtin', operators: [] });
        }
        for (const field of this.fieldDefinitions.filter((entry) => entry.source === 'yaml')) {
            const sortField = `yaml:${field.type}:${field.id.slice(5)}`;
            options.push({ ...field, id: sortField });
        }
        const selected = options.find(field => field.id === this.currentViewState.sort.field);
        createLibraryFieldPicker(dropdown, options, {
            label: selected?.label ?? libraryCatalogCopy(i18n.getLanguage()).unavailable,
            selected: this.currentViewState.sort.field,
            onSelect: (field) => {
                if (field.id === 'priority' && this.currentViewState.sort.field !== 'priority') {
                    this.currentViewState.sort.order = 'desc'; this.currentSort.order = 'desc';
                }
                this.currentViewState.sort.field = field.id as SortField;
                this.currentSort.field = field.id as SortField;
                this.emitViewState(button);
                this.renderViewPanel(panel, button);
            },
        });
        row.appendChild(this.createOrderButton(this.currentViewState.sort.order, (order) => {
            this.currentViewState.sort.order = order;
            this.currentSort.order = order;
            this.emitViewState(button);
        }));
    }

    private renderGroupRow(parent: HTMLElement, button: HTMLButtonElement, panel: HTMLElement): void {
        const copy = this.viewText();
        const row = parent.createDiv({ cls: 'lorebase-view-control-row' });
        row.createSpan({ cls: 'lorebase-view-control-label', text: copy.groupBy });
        const dropdown = row.createDiv({ cls: 'lorebase-view-dropdown is-group-picker' });
        const options: FieldDefinition[] = [
            { id: 'none', label: copy.noGrouping, type: 'text', icon: 'layout-grid', source: 'builtin', operators: [] },
        ];
        if (this.currentMediaType === 'music') {
            options.push({ id: 'artist', label: mt('groupArtist'), type: 'text', icon: 'mic', source: 'builtin', operators: [] });
        }
        for (const field of this.fieldDefinitions) {
            if (field.source === 'yaml') {
                options.push({ ...field, id: `yaml:${field.type}:${field.id.slice(5)}` });
            } else if (field.id === 'series') {
                options.push({ ...field, label: copy.series });
            } else if (field.id === 'dateFinished') {
                options.push(field,
                    { ...field, id: 'finishedMonth', label: copy.finishedMonth },
                    { ...field, id: 'finishedYear', label: copy.finishedYear },
                );
            } else if (field.id === 'status' || field.id === 'rating' || field.id === 'dateStarted' || field.id === 'priority') {
                options.push(field);
            }
        }

        const mode = this.currentViewState.group.mode;
        createLibraryFieldPicker(dropdown, options, {
            label: options.find(field => field.id === mode)?.label ?? libraryCatalogCopy(i18n.getLanguage()).unavailable,
            selected: mode,
            searchAliases: {
                dateStarted: 'started start_date',
                dateFinished: 'finished finish_date',
            },
            onSelect: (field) => {
                if (field.id === 'priority' && this.currentViewState.group.mode !== 'priority') this.currentViewState.group.order = 'desc';
                this.currentViewState.group.mode = field.id as GroupMode;
                this.emitViewState(button);
                this.renderViewPanel(panel, button);
            },
        });
        const orderButton = this.createOrderButton(this.currentViewState.group.order, (order) => {
            this.currentViewState.group.order = order;
            this.emitViewState(button);
        });
        orderButton.disabled = this.currentViewState.group.mode === 'none';
        row.appendChild(orderButton);
    }

    private renderWorkTypeRow(parent: HTMLElement, button: HTMLButtonElement): void {
        const definition = this.fieldDefinitions.find((field) => field.id === 'workType');
        if (!definition) return;
        const copy = this.viewText();
        if (definition.label === countryFieldLabel(i18n.getLanguage())) {
            copy.allWorkTypes = ({ ru: 'Все страны', uk: 'Усі країни', en: 'All countries', 'zh-CN': '所有国家' })[i18n.getLanguage()];
            copy.selectedWorkTypes = ({ ru: 'Стран выбрано', uk: 'Країн вибрано', en: 'Countries selected', 'zh-CN': '已选国家' })[i18n.getLanguage()];
        }
        const row = parent.createDiv({ cls: 'lorebase-view-control-row lorebase-view-work-type-row' });
        row.createSpan({ cls: 'lorebase-view-control-label', text: definition.label });
        const dropdown = row.createDiv({ cls: 'lorebase-view-dropdown' });
        const selected = new Set(this.currentViewState.workTypes ?? []);
        const options = [...(definition.options ?? [])];
        for (const value of selected) {
            if (!options.some((option) => option.value === value)) options.push({ value, label: value });
        }
        this.createWorkTypeMultiSelect(dropdown, options, selected, copy, (values) => {
            this.currentViewState.workTypes = values;
            this.currentFilter.workTypes = [...values];
            this.emitViewState(button);
        });
    }

    private createWorkTypeMultiSelect(
        container: HTMLElement,
        options: Array<{ value: string; label: string }>,
        initial: Set<string>,
        copy: ReturnType<Toolbar['viewText']>,
        onChange: (values: string[]) => void
    ): void {
        const ownerDocument = container.ownerDocument;
        container.empty();
        container.addClass('lorebase-settings-dropdown', 'is-floating', 'is-multiselect');
        const selected = new Set(initial);
        const trigger = container.createEl('button', {
            cls: 'lorebase-settings-dropdown-btn',
            attr: { type: 'button', 'aria-haspopup': 'listbox', 'aria-expanded': 'false' },
        });
        const label = trigger.createSpan({ cls: 'lorebase-settings-dropdown-label' });
        const caret = trigger.createSpan({ cls: 'lorebase-settings-dropdown-caret' });
        setIcon(caret, 'chevron-down');
        const panel = container.createDiv({
            cls: 'lorebase-settings-dropdown-panel lorebase-floating-dropdown-panel lorebase-work-type-multiselect',
            attr: { role: 'listbox', 'aria-multiselectable': 'true' },
        });

        const renderLabel = (): void => {
            if (!selected.size) {
                label.setText(copy.allWorkTypes);
                return;
            }
            const labels = options.filter((option) => selected.has(option.value)).map((option) => option.label);
            label.setText(labels.length <= 2 ? labels.join(', ') : `${copy.selectedWorkTypes}: ${labels.length}`);
        };
        const position = (): void => {
            if (!panel.hasClass('is-open')) return;
            const rect = trigger.getBoundingClientRect();
            const ownerWindow = container.ownerDocument.defaultView ?? window;
            const viewportWidth = ownerWindow.document.documentElement.clientWidth;
            const viewportHeight = ownerWindow.document.documentElement.clientHeight;
            const width = Math.min(Math.max(rect.width, 190), 300, Math.max(190, viewportWidth - 16));
            const spaceBelow = viewportHeight - rect.bottom - 12;
            const maxHeight = Math.min(360, Math.max(120, spaceBelow));
            panel.setCssStyles({
                position: 'fixed', width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px`,
                left: `${Math.max(8, Math.min(rect.left, viewportWidth - width - 8))}px`,
                top: `${Math.min(rect.bottom + 4, viewportHeight - maxHeight - 8)}px`, maxHeight: `${maxHeight}px`,
            });
        };
        const close = (): void => {
            lifecycle.stop();
            panel.removeClass('is-open');
            trigger.removeClass('is-open');
            container.removeClass('is-open');
            trigger.setAttr('aria-expanded', 'false');
            if (panel.parentElement !== container) {
                if (trigger.parentElement === container) container.appendChild(panel);
                else panel.remove();
            }
        };
        const lifecycle = createDropdownLifecycle(trigger, panel, close, position);
        const renderOptions = (): void => {
            panel.empty();
            const addOption = (value: string, optionLabel: string, active: boolean, clearAll = false): void => {
                const item = panel.createDiv({
                    cls: 'lorebase-settings-dropdown-option',
                    attr: { role: 'option', tabindex: '0', 'aria-selected': String(active) },
                });
                item.toggleClass('is-selected', active);
                const check = item.createSpan({ cls: 'lorebase-settings-dropdown-option-check lorebase-multiselect-check' });
                if (active) setIcon(check, 'check');
                item.createSpan({ cls: 'lorebase-settings-dropdown-option-label', text: optionLabel });
                const toggle = (): void => {
                    if (clearAll) selected.clear();
                    else if (selected.has(value)) selected.delete(value);
                    else selected.add(value);
                    renderLabel();
                    renderOptions();
                    onChange(Array.from(selected));
                };
                item.addEventListener('click', (event) => { event.stopPropagation(); toggle(); });
                item.addEventListener('keydown', (event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    toggle();
                });
            };
            addOption('', copy.allWorkTypes, selected.size === 0, true);
            options.forEach((option) => addOption(option.value, option.label, selected.has(option.value)));
            if (this.callbacks.onManageWorkTypes) {
                const manage = panel.createEl('button', { cls: 'lorebase-settings-dropdown-more lorebase-dropdown-manage-action', attr: { type: 'button' } });
                setIcon(manage.createSpan(), 'settings-2');
                manage.createSpan({ text: getManageWorkTypesLabel(i18n.getLanguage(), this.currentMediaType === 'anime') });
                manage.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); close(); this.callbacks.onManageWorkTypes?.(); });
            }
            position();
        };
        trigger.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const open = !panel.hasClass('is-open');
            ownerDocument.querySelectorAll('.lorebase-settings-dropdown-panel.is-open').forEach((node) => {
                if (node !== panel) node.dispatchEvent(new Event('lorebase-dropdown-close'));
            });
            if (!open) {
                close();
                return;
            }
            container.ownerDocument.body.appendChild(panel);
            panel.addClass('is-open');
            trigger.addClass('is-open');
            container.addClass('is-open');
            trigger.setAttr('aria-expanded', 'true');
            position();
            lifecycle.start();
        });
        panel.addEventListener('lorebase-dropdown-close', close);
        panel.addEventListener('click', (event) => event.stopPropagation());
        renderLabel();
        renderOptions();
    }

    private renderRuleEditor(
        parent: HTMLElement,
        rule: FilterRule,
        panel: HTMLElement,
        button: HTMLButtonElement
    ): void {
        const copy = this.viewText();
        const definition = this.fieldDefinitions.find((field) => field.id === getCatalogFieldId(rule.field));
        const card = parent.createDiv({ cls: 'lorebase-view-rule' });
        card.dataset.field = rule.field;
        const top = card.createDiv({ cls: 'lorebase-view-rule-top' });
        const icon = top.createSpan({ cls: 'lorebase-view-rule-icon' });
        setIcon(icon, definition?.icon ?? 'circle-help');
        top.createSpan({
            cls: `lorebase-view-rule-label ${definition ? '' : 'is-missing'}`,
            text: definition ? `${definition.label}${definition.unit ? `, ${definition.unit}` : ''}` : `${copy.missingField}: ${rule.field.replace(/^yaml:/, '')}`,
        });
        if (definition) top.createSpan({ cls: 'lorebase-filter-field-source', text: libraryCatalogCopy(i18n.getLanguage())[getLibraryFieldGroup(definition)] });
        if (definition?.description) card.createDiv({ cls: 'lorebase-filter-field-hint', text: definition.description });
        const remove = top.createEl('button', {
            cls: 'lorebase-view-rule-remove',
            attr: { type: 'button', 'aria-label': copy.remove },
        });
        setIcon(remove, 'x');
        remove.addEventListener('click', () => {
            this.currentViewState.rules = this.currentViewState.rules.filter((entry) => entry.id !== rule.id);
            this.emitViewState(button);
            this.renderViewPanel(panel, button);
        });
        if (!definition) {
            card.createDiv({ cls: 'lorebase-filter-field-hint', text: libraryCatalogCopy(i18n.getLanguage()).unavailable });
            return;
        }

        const body = card.createDiv({ cls: 'lorebase-view-rule-body' });
        body.toggleClass('is-between', rule.operator === 'between');
        const operatorDropdown = body.createDiv({ cls: 'lorebase-view-dropdown is-operator' });
        const operators = [...new Set([...(definition?.operators ?? []), rule.operator])];
        createLorebaseDropdown(
            operatorDropdown,
            operators.map((value) => ({ value, label: this.operatorLabel(value) })),
            rule.operator,
            (value) => {
                rule.operator = value;
                this.emitViewState(button);
                this.renderViewPanel(panel, button);
            },
            { floating: true }
        );
        this.renderRuleValue(body, rule, definition, button);
    }

    private renderRuleValue(
        parent: HTMLElement,
        rule: FilterRule,
        definition: FieldDefinition | undefined,
        button: HTMLButtonElement
    ): void {
        if (['empty', 'notEmpty', 'isTrue', 'isFalse', 'thisMonth', 'thisYear'].includes(rule.operator)) return;

        if (definition?.type === 'list' && ['containsAny', 'containsAll', 'notContains', 'equals'].includes(rule.operator)) {
            renderLibraryFilterChoices(parent, rule, definition, () => {
                this.emitViewState(button);
            });
            return;
        }

        const inputType = rule.fieldType === 'number' ? 'number' : rule.fieldType === 'date' ? 'date' : 'text';
        if (rule.operator === 'between') {
            const range = parent.createDiv({ cls: 'lorebase-view-range-row' });
            const createRangeInput = (
                label: string,
                value: unknown,
                onChange: (inputValue: string) => void
            ): void => {
                const field = range.createEl('label', { cls: 'lorebase-view-range-field' });
                field.createSpan({ cls: 'lorebase-view-range-label', text: label });
                const rangeInput = field.createEl('input', {
                    cls: 'lorebase-view-value-input',
                    attr: { type: inputType, 'aria-label': label },
                });
                rangeInput.value = String(value ?? '');
                this.configureFilterInput(rangeInput, rule, definition, label);
                rangeInput.addEventListener('change', () => onChange(rangeInput.value));
            };
            createRangeInput(this.viewText().from, rule.value, (value) => {
                rule.value = rule.fieldType === 'number'
                    ? (value === '' ? null : Number(value))
                    : value;
                this.emitViewState(button);
            });
            createRangeInput(this.viewText().to, rule.valueTo, (value) => {
                rule.valueTo = rule.fieldType === 'number'
                    ? (value === '' ? null : Number(value))
                    : value;
                this.emitViewState(button);
            });
            return;
        }

        const input = parent.createEl('input', {
            cls: 'lorebase-view-value-input',
            attr: { type: inputType, placeholder: rule.fieldType === 'list' ? 'value, value' : '' },
        });
        input.value = Array.isArray(rule.value) ? rule.value.join(', ') : String(rule.value ?? '');
        this.configureFilterInput(input, rule, definition, definition?.label ?? rule.field);
        input.addEventListener('change', () => {
            rule.value = rule.fieldType === 'number'
                ? (input.value === '' ? null : Number(input.value))
                : rule.fieldType === 'list'
                    ? input.value.split(',').map((value) => value.trim()).filter(Boolean)
                    : input.value;
            this.emitViewState(button);
        });
    }

    private configureFilterInput(input: HTMLInputElement, rule: FilterRule, definition: FieldDefinition | undefined, label: string): void {
        input.setAttribute('aria-label', `${label}${definition?.unit ? ` (${definition.unit})` : ''}`);
        if (rule.fieldType !== 'number') return;
        input.step = String(definition?.step ?? 'any');
        if (definition?.min !== undefined) input.min = String(definition.min);
        if (definition?.max !== undefined) input.max = String(definition.max);
        if (definition?.unit) input.placeholder = definition.unit;
    }

    private createOrderButton(order: SortOrder, onChange: (order: SortOrder) => void): HTMLButtonElement {
        const button = createEl('button');
        button.className = 'lorebase-view-order-button';
        button.type = 'button';
        button.setAttribute('aria-label', t('sortOrder'));
        setIcon(button, order === 'asc' ? 'arrow-up' : 'arrow-down');
        button.addEventListener('click', () => {
            const next = order === 'asc' ? 'desc' : 'asc';
            onChange(next);
            button.empty();
            setIcon(button, next === 'asc' ? 'arrow-up' : 'arrow-down');
            order = next;
        });
        return button;
    }

    private emitViewState(button: HTMLButtonElement): void {
        this.currentFilter.rules = this.currentViewState.rules;
        this.currentFilter.workTypes = [...(this.currentViewState.workTypes ?? [])];
        this.callbacks.onViewStateChange(cloneLibraryViewState(this.currentViewState));
        button.toggleClass('is-active', this.hasCustomizedView());
        const activeSaved = this.savedViews.find((view) => view.id === this.activeSavedViewId);
        const subtitle = this.container.querySelector<HTMLElement>('.lorebase-view-panel-subtitle');
        if (subtitle && activeSaved) {
            const dirty = !libraryViewStatesEqual(activeSaved.state, this.currentViewState);
            subtitle.setText(dirty ? this.viewText().modified : activeSaved.name);
            subtitle.toggleClass('is-dirty', dirty);
        }
        button.querySelector('.lorebase-view-rule-count')?.remove();
        if (this.currentViewState.rules.length) {
            button.createSpan({ cls: 'lorebase-view-rule-count', text: String(this.currentViewState.rules.length) });
        }
    }

    private hasCustomizedView(): boolean {
        const hasFilters = this.currentViewState.rules.length > 0
            || this.currentViewState.tags.length > 0
            || this.currentViewState.genres.length > 0;
        const hasCustomSort = this.currentViewState.sort.field !== this.defaultViewState.sort.field
            || this.currentViewState.sort.order !== this.defaultViewState.sort.order;
        const hasCustomGrouping = this.currentViewState.group.mode !== this.defaultViewState.group.mode
            || this.currentViewState.group.order !== this.defaultViewState.group.order;
        const hasCustomWorkType = JSON.stringify(this.currentViewState.workTypes ?? []) !== JSON.stringify(this.defaultViewState.workTypes ?? []);
        return hasFilters || hasCustomSort || hasCustomGrouping || hasCustomWorkType;
    }

    private operatorLabel(operator: FilterOperator): string {
        return this.viewText().operators[operator] ?? operator;
    }

    private viewText(): {
        configure: string; modified: string; baseView: string; savedViews: string; reset: string;
        update: string; deleteView: string; viewName: string; saveAs: string; sortBy: string;
        groupBy: string; noGrouping: string; series: string; finishedMonth: string; finishedYear: string; allWorkTypes: string; selectedWorkTypes: string;
        filters: string; noFilters: string; addFilter: string; builtIn: string; noteFields: string;
        additional: string; showMore: string; showLess: string;
        missingField: string; remove: string; rename: string; from: string; to: string; operators: Record<string, string>;
    } {
        const language = i18n.getLanguage();
        if (language === 'ru') return {
            configure: 'Вид и фильтры', modified: 'Изменено', baseView: 'Базовый вид',
            savedViews: 'Сохранённые виды', reset: 'Сбросить', update: 'Обновить вид',
            deleteView: 'Удалить вид', viewName: 'Название вида', saveAs: 'Сохранить как',
            sortBy: 'Сортировка', groupBy: 'Группировка', noGrouping: 'Без группировки',
            series: 'По серии', finishedMonth: 'По месяцу окончания', finishedYear: 'По году окончания', allWorkTypes: 'Все типы', selectedWorkTypes: 'Выбрано',
            filters: 'Фильтры', noFilters: 'Нет активных фильтров', addFilter: 'Добавить фильтр',
            builtIn: 'Основные', noteFields: 'Поля заметок', missingField: 'Поле отсутствует',
            additional: 'Дополнительные', showMore: 'Показать ещё', showLess: 'Скрыть дополнительные',
            remove: 'Удалить', rename: 'Переименовать', from: 'От', to: 'До',
            operators: {
                contains: 'содержит', equals: 'равно', notEquals: 'не равно', empty: 'пусто',
                notEmpty: 'заполнено', greater: 'больше', less: 'меньше', between: 'в диапазоне',
                isTrue: 'да', isFalse: 'нет', containsAny: 'любое из',
                containsAll: 'все выбранные', notContains: 'ни одно из',
                thisMonth: 'в этом месяце', thisYear: 'в этом году',
            },
        };
        if (language === 'uk') return {
            configure: 'Вигляд і фільтри', modified: 'Змінено', baseView: 'Базовий вигляд',
            savedViews: 'Збережені вигляди', reset: 'Скинути', update: 'Оновити вигляд',
            deleteView: 'Видалити вигляд', viewName: 'Назва вигляду', saveAs: 'Зберегти як',
            sortBy: 'Сортування', groupBy: 'Групування', noGrouping: 'Без групування',
            series: 'За серією', finishedMonth: 'За місяцем завершення', finishedYear: 'За роком завершення', allWorkTypes: 'Усі типи', selectedWorkTypes: 'Вибрано',
            filters: 'Фільтри', noFilters: 'Немає активних фільтрів', addFilter: 'Додати фільтр',
            builtIn: 'Основні', noteFields: 'Поля нотаток', missingField: 'Поле відсутнє',
            additional: 'Додаткові', showMore: 'Показати ще', showLess: 'Сховати додаткові',
            remove: 'Видалити', rename: 'Перейменувати', from: 'Від', to: 'До',
            operators: {
                contains: 'містить', equals: 'дорівнює', notEquals: 'не дорівнює', empty: 'порожнє',
                notEmpty: 'заповнене', greater: 'більше', less: 'менше', between: 'у діапазоні',
                isTrue: 'так', isFalse: 'ні', containsAny: 'будь-яке з',
                containsAll: 'усі вибрані', notContains: 'жодне з',
                thisMonth: 'цього місяця', thisYear: 'цього року',
            },
        };
        return {
            configure: 'View & filters', modified: 'Modified', baseView: 'Base view',
            savedViews: 'Saved views', reset: 'Reset', update: 'Update view',
            deleteView: 'Delete view', viewName: 'View name', saveAs: 'Save as',
            sortBy: 'Sort', groupBy: 'Group', noGrouping: 'No grouping',
            series: 'By series', finishedMonth: 'By finish month', finishedYear: 'By finish year', allWorkTypes: 'All types', selectedWorkTypes: 'Selected',
            filters: 'Filters', noFilters: 'No active filters', addFilter: 'Add filter',
            builtIn: 'Built in', noteFields: 'Note fields', missingField: 'Missing field',
            additional: 'Additional', showMore: 'Show more', showLess: 'Show less',
            remove: 'Remove', rename: 'Rename', from: 'From', to: 'To',
            operators: {
                contains: 'contains', equals: 'equals', notEquals: 'does not equal', empty: 'is empty',
                notEmpty: 'is not empty', greater: 'greater than', less: 'less than', between: 'between',
                isTrue: 'yes', isFalse: 'no', containsAny: 'any of',
                containsAll: 'all of', notContains: 'none of',
                thisMonth: 'this month', thisYear: 'this year',
            },
        };
    }

    private renderTagsControl(parent: HTMLElement): void {
        const { button, panel } = this.createDropdown(parent, {
            icon: 'tag',
            label: t('tags'),
        });

        panel.addClass('lorebase-tags-dropdown');
        button.toggleClass('is-active', this.hasActiveTagFilters());
        this.addMobileButtonLabel(button, t('tags'));

        const sections: Array<{ key: 'tags' | 'genres'; title: string; items: TagSummary[]; prefix: string }> = [
            { key: 'tags', title: t('plans'), items: this.availableTags.planTags ?? [], prefix: '' },
            { key: 'tags', title: t('tags'), items: this.availableTags.tags, prefix: '#' },
            { key: 'genres', title: t('genres'), items: this.availableTags.genres, prefix: '#' },
        ];

        const hasAnyTags = sections.some(section => section.items.length > 0);
        if (!hasAnyTags) {
            panel.createDiv({ cls: 'lorebase-dropdown-empty', text: t('tagsEmpty') });
            return;
        }

        for (const section of sections) {
            if (section.items.length === 0) continue;

            const sectionEl = panel.createDiv({ cls: 'lorebase-tag-section' });
            sectionEl.createDiv({ cls: 'lorebase-tag-section-title', text: section.title });
            const list = sectionEl.createDiv({ cls: 'lorebase-tag-list' });

            for (const tag of section.items) {
                const isActive = this.currentFilter[section.key].includes(tag.id);
                const chip = list.createEl('button', {
                    cls: `lorebase-tag-chip ${isActive ? 'is-active' : ''}`,
                    text: `${section.prefix}${tag.label}`,
                    attr: {
                        type: 'button',
                        'aria-pressed': String(isActive),
                        title: `${tag.label} (${tag.count})`,
                    },
                });

                chip.addEventListener('click', () => {
                    const next = new Set(this.currentFilter[section.key]);
                    if (next.has(tag.id)) {
                        next.delete(tag.id);
                    } else {
                        next.add(tag.id);
                    }

                    const updated = Array.from(next);
                    this.currentFilter[section.key] = updated;
                    if (section.key === 'tags') {
                        this.callbacks.onFilterChange({ tags: updated });
                        this.currentViewState.tags = [...updated];
                    } else {
                        this.callbacks.onFilterChange({ genres: updated });
                        this.currentViewState.genres = [...updated];
                    }
                    this.callbacks.onViewStateChange(cloneLibraryViewState(this.currentViewState));

                    const nowActive = updated.includes(tag.id);
                    chip.toggleClass('is-active', nowActive);
                    chip.setAttribute('aria-pressed', String(nowActive));
                    button.toggleClass('is-active', this.hasActiveTagFilters());
                });
            }
        }

        // Tags dropdown is filter-only
    }

    private renderSearch(parent: HTMLElement): void {
        this.searchControl = new LibrarySearchInput(parent, {
            value: this.currentFilter.searchTerm,
            onInput: value => {
                this.currentFilter.searchTerm = value;
                if (this.searchTimeout !== null) window.clearTimeout(this.searchTimeout);
                this.searchTimeout = window.setTimeout(() => { this.searchTimeout = null; this.callbacks.onSearch(value); }, SEARCH_DEBOUNCE_MS);
            },
            onSubmit: value => {
                if (this.searchTimeout !== null) window.clearTimeout(this.searchTimeout);
                this.searchTimeout = null;
                this.currentFilter.searchTerm = value;
                this.callbacks.onSearch(value);
            },
            suggestions: query => findSearchSuggestions(this.searchSuggestions, query),
            layoutSuggestion: query => suggestKeyboardLayout(query,
                candidate => this.searchItems.some(item => getTitleSearchMatch(item, candidate) !== null), i18n.getLanguage()),
            onSuggestion: suggestion => {
                if (this.searchTimeout !== null) window.clearTimeout(this.searchTimeout);
                this.searchTimeout = null;
                this.currentFilter.searchTerm = '';
                this.currentViewState.rules = addSearchSuggestionRule(this.currentViewState.rules, suggestion);
                this.currentFilter.rules = this.currentViewState.rules;
                this.callbacks.onSearch('');
                this.callbacks.onViewStateChange(cloneLibraryViewState(this.currentViewState));
                this.render();
                this.searchControl?.input.focus({ preventScroll: true });
            },
        });
    }

    updateSearchItems(items: MediaItem[]): void {
        this.searchItems = items;
        this.searchSuggestions = collectSearchSuggestions(items, this.currentMediaType);
        this.searchControl?.refresh();
    }

    private renderAddButton(parent: HTMLElement): void {
        const addBtn = parent.createEl('button', {
            cls: 'lorebase-toolbar-btn lorebase-add-btn',
            attr: {
                type: 'button',
                'aria-label': t('promptAddSelected'),
            },
        });
        setIcon(addBtn, 'plus');
        addBtn.addEventListener('click', () => this.callbacks.onAdd());
    }

    private renderRandomButton(parent: HTMLElement): void {
        const randomBtn = parent.createEl('button', {
            cls: 'lorebase-toolbar-btn',
            attr: {
                type: 'button',
                'aria-label': this.randomLabel,
            },
        });
        setIcon(randomBtn, 'dice');
        this.addMobileButtonLabel(randomBtn, this.randomLabel);
        randomBtn.addEventListener('click', () => this.callbacks.onRandom());
    }

    private renderReleaseCalendarButton(parent: HTMLElement): void {
        const button = parent.createEl('button', {
            cls: 'lorebase-toolbar-btn lorebase-release-calendar-trigger',
            attr: { type: 'button', 'aria-label': t('releaseCalendar') },
        });
        setIcon(button, 'calendar-days');
        this.addMobileButtonLabel(button, t('releaseCalendar'));
        button.addEventListener('click', () => this.callbacks.onReleaseCalendar());
    }

    private renderCustomGroupsButton(parent: HTMLElement): void {
        const button = parent.createEl('button', {
            cls: 'lorebase-toolbar-btn lorebase-custom-groups-trigger',
            attr: { type: 'button', 'aria-label': t('customGroups') },
        });
        setIcon(button, 'folders');
        this.addMobileButtonLabel(button, t('customGroups'));
        button.addEventListener('click', () => this.callbacks.onCustomGroups());
    }

    private renderViewModeControl(parent: HTMLElement): void {
        const { button, panel } = this.createDropdown(parent, {
            icon: 'layout-grid',
            label: t('view'),
            align: 'right',
        });

        button.removeClass('is-active');
        this.addMobileButtonLabel(button, t('view'));

        const options: Array<{ mode: ViewMode; label: string; icon: string }> = [
            { mode: 'grid', label: t('viewGrid'), icon: 'rectangle-vertical' },
            { mode: 'horizontal', label: t('viewHorizontal'), icon: 'rectangle-horizontal' },
        ];

        const viewSection = panel.createDiv({ cls: 'lorebase-dropdown-section' });
        if (this.currentMediaType === 'music') this.renderMusicKindControl(viewSection, true);
        for (const option of options) {
            const isActive = this.currentViewMode === option.mode;
            const item = viewSection.createEl('button', {
                cls: `lorebase-dropdown-choice ${isActive ? 'is-selected' : ''}`,
                attr: { type: 'button' },
            });

            const icon = item.createSpan({ cls: 'lorebase-dropdown-icon' });
            setIcon(icon, option.icon);

            item.createSpan({ cls: 'lorebase-dropdown-label', text: option.label });

            if (isActive) {
                const check = item.createSpan({ cls: 'lorebase-dropdown-check' });
                setIcon(check, 'check');
            }

            item.addEventListener('click', () => {
                this.currentViewMode = option.mode;
                this.callbacks.onViewModeChange(option.mode);
                this.render();
            });
        }
    }

    private renderSettingsControl(parent: HTMLElement): void {
        const { panel } = this.createDropdown(parent, {
            icon: 'settings',
            label: t('settings'),
            align: 'right',
        });

        const actionSection = panel.createDiv({ cls: 'lorebase-dropdown-section' });

        const statsBtn = actionSection.createEl('button', {
            cls: 'lorebase-dropdown-choice',
            attr: { type: 'button' },
        });
        const statsIcon = statsBtn.createSpan({ cls: 'lorebase-dropdown-icon' });
        setIcon(statsIcon, 'bar-chart-2');
        statsBtn.createSpan({ cls: 'lorebase-dropdown-label', text: t('stats') });
        statsBtn.addEventListener('click', () => {
            this.callbacks.onStats();
            this.dropdownManager.closeDropdowns();
        });

        const settingsBtn = actionSection.createEl('button', {
            cls: 'lorebase-dropdown-choice',
            attr: { type: 'button' },
        });
        const settingsIcon = settingsBtn.createSpan({ cls: 'lorebase-dropdown-icon' });
        setIcon(settingsIcon, 'settings');
        settingsBtn.createSpan({ cls: 'lorebase-dropdown-label', text: t('settings') });
        settingsBtn.addEventListener('click', () => {
            this.callbacks.onSettings();
            this.dropdownManager.closeDropdowns();
        });
    }

    private createDropdown(
        parent: HTMLElement,
        options: { icon: string; label: string; align?: 'left' | 'right' }
    ): { button: HTMLButtonElement; panel: HTMLElement } {
        return this.dropdownManager.createDropdown(parent, options);
    }

    private addMobileButtonLabel(button: HTMLButtonElement, label: string, count = 0): void {
        button.addClass('lorebase-toolbar-mobile-labeled');
        button.createSpan({
            cls: 'lorebase-toolbar-mobile-label',
            text: count > 0 ? `${label} ${count}` : label,
        });
    }

    private hasActiveTagFilters(): boolean {
        return hasActiveTagFilters(this.currentFilter);
    }

    /**
     * Update filter state externally
     */
    updateFilter(filter: Partial<FilterState>): void {
        Object.assign(this.currentFilter, filter);
        this.render();
    }

    /**
     * Update view mode externally
     */
    updateViewMode(mode: ViewMode): void {
        this.currentViewMode = mode;
        this.render();
    }

    updateSort(sort: { field: SortField; order: SortOrder }): void {
        this.currentSort = sort;
        this.currentViewState.sort = { ...sort };
        this.render();
    }

    updateViewState(
        state: LibraryViewState,
        savedViews: SavedLibraryView[],
        activeSavedViewId: string | null,
        defaultViewState?: LibraryViewState
    ): void {
        this.currentViewState = cloneLibraryViewState(state);
        this.currentSort = { ...state.sort };
        this.currentFilter.rules = state.rules;
        this.currentFilter.tags = [...state.tags];
        this.currentFilter.genres = [...state.genres];
        this.currentFilter.workTypes = [...(state.workTypes ?? [])];
        this.savedViews = savedViews.map((view) => ({ ...view, state: cloneLibraryViewState(view.state) }));
        this.activeSavedViewId = activeSavedViewId;
        if (defaultViewState) this.defaultViewState = cloneLibraryViewState(defaultViewState);
        this.render();
    }

    updateFieldDefinitions(definitions: FieldDefinition[]): void {
        this.fieldDefinitions = definitions;
        this.render();
    }

    updateSortOptions(options: Array<{ field: SortField; label: string }>): void {
        this.sortOptions = options;
        this.render();
    }

    updateRandomLabel(label: string): void {
        this.randomLabel = label;
        this.render();
    }

    updateMediaContext(mediaType: MediaType, enabledMediaTypes: MediaType[]): void {
        if (this.currentMediaType !== mediaType) { this.searchSuggestions = []; this.searchItems = []; }
        this.currentMediaType = mediaType;
        this.enabledMediaTypes = [...enabledMediaTypes];
        this.render();
    }

    /**
     * Update available tags
     */
    updateTags(tags: TagGroups): void {
        this.availableTags = tags;
        this.render();
    }

    /**
     * Refresh the toolbar (re-render for localization updates)
     */
    refresh(): void {
        this.render();
    }

    /**
     * Destroy the toolbar
     */
    destroy(): void {
        this.searchControl?.destroy();
        this.searchControl = null;
        if (this.searchTimeout) {
            window.clearTimeout(this.searchTimeout);
            this.searchTimeout = null;
        }

        this.dropdownManager.destroy();
        activeDocument.removeEventListener('keydown', this.mediaTrayKeyHandler);
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;

        if (this.container && this.container.parentElement) {
            this.container.remove();
        }
    }
}
