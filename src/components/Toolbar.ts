/**
 * LOREBASE - Toolbar Component
 * Filter, sort, search, and action buttons
 */

import { setIcon } from 'obsidian';
import { FilterState, SortField, SortOrder, MediaStatus, ViewMode } from '../types';
import { t } from '../localization';
import { SEARCH_DEBOUNCE_MS, STATUS_ICON_MAP, FILTER_ICON_MAP } from '../constants';
import { DropdownManager } from './toolbar/DropdownManager';
import { hasActiveFilters, hasActiveTagFilters } from './toolbar/stateUtils';
import { TagGroups, TagSummary, ToolbarCallbacks } from './toolbar/types';

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
    private statusOptions: Array<{ status: MediaStatus; label: string }>;
    private sortOptions: Array<{ field: SortField; label: string }>;
    private showAdultFilter: boolean;
    private showCustomFilter: boolean;
    private availableTags: TagGroups = { planTags: [], tags: [], genres: [] };
    private searchTimeout: number | null = null;
    private showAdultInAll: boolean;
    private randomLabel: string;
    private dropdownManager: DropdownManager;
    private batchDepth = 0;
    private batchDirty = false;

    constructor(
        parent: HTMLElement,
        callbacks: ToolbarCallbacks,
        initialSort: { field: SortField; order: SortOrder },
        initialFilter: FilterState,
        initialViewMode: ViewMode,
        showAdultInAll: boolean,
        statusOptions: Array<{ status: MediaStatus; label: string }>,
        sortOptions: Array<{ field: SortField; label: string }>,
        filterFlags: { showAdult: boolean; showCustom: boolean },
        randomLabel: string
    ) {
        this.callbacks = callbacks;
        this.currentSort = initialSort;
        this.currentFilter = initialFilter;
        this.currentViewMode = initialViewMode;
        this.showAdultInAll = showAdultInAll;
        this.statusOptions = statusOptions;
        this.sortOptions = sortOptions;
        this.showAdultFilter = filterFlags.showAdult;
        this.showCustomFilter = filterFlags.showCustom;
        this.randomLabel = randomLabel;
        this.container = parent.createDiv({ cls: 'lorebase-toolbar' });
        this.dropdownManager = new DropdownManager(this.container);
        this.render();
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
        this.dropdownManager.closeDropdowns();
        this.container.empty();
        this.container.addClass('lorebase-toolbar');

        const leftControls = this.container.createDiv({ cls: 'lorebase-toolbar-left' });
        const centerControls = this.container.createDiv({ cls: 'lorebase-toolbar-center' });
        const rightControls = this.container.createDiv({ cls: 'lorebase-toolbar-right' });

        this.renderFilterControl(leftControls);
        this.renderSortControl(leftControls);
        this.renderTagsControl(leftControls);

        this.renderSearch(centerControls);
        this.renderAddButton(centerControls);

        this.renderRandomButton(rightControls);
        this.renderViewModeControl(rightControls);
        this.renderSettingsControl(rightControls);
    }

    private renderFilterControl(parent: HTMLElement): void {
        const { button, panel } = this.createDropdown(parent, {
            icon: 'filter',
            label: t('filter'),
        });
        panel.addClass('lorebase-filter-dropdown');

        button.toggleClass('is-active', this.hasActiveFilters());

        const statusSection = panel.createDiv({ cls: 'lorebase-dropdown-section lorebase-filter-section' });
        statusSection.createDiv({ cls: 'lorebase-filter-section-title', text: t('status') });
        const statusGroup = statusSection.createDiv({ cls: 'lorebase-filter-group lorebase-filter-statuses' });

        for (const { status, label } of this.statusOptions) {
            const isChecked = this.currentFilter.statuses.includes(status);
            this.createCheckbox(statusGroup, label, isChecked, (checked) => {
                const next = new Set(this.currentFilter.statuses);
                if (checked) {
                    next.add(status);
                } else {
                    next.delete(status);
                }
                const updated = Array.from(next);
                this.currentFilter.statuses = updated;
                this.callbacks.onFilterChange({ statuses: updated });
                button.toggleClass('is-active', this.hasActiveFilters());
            }, { icon: STATUS_ICON_MAP[status] });
        }

        const flagSection = panel.createDiv({ cls: 'lorebase-dropdown-section lorebase-filter-section' });
        flagSection.createDiv({ cls: 'lorebase-filter-section-title', text: t('filterFlags') });
        const flagGroup = flagSection.createDiv({ cls: 'lorebase-filter-group' });

        this.createCheckbox(
            flagGroup,
            t('statusFavorite'),
            this.currentFilter.favoriteOnly,
            (checked) => {
                this.currentFilter.favoriteOnly = checked;
                this.callbacks.onFilterChange({ favoriteOnly: checked });
                button.toggleClass('is-active', this.hasActiveFilters());
            },
            { icon: FILTER_ICON_MAP.favorite }
        );

        if (this.showAdultFilter) {
            this.createCheckbox(
                flagGroup,
                t('filterAdult'),
                this.currentFilter.adultOnly,
                (checked) => {
                    this.currentFilter.adultOnly = checked;
                    this.callbacks.onFilterChange({ adultOnly: checked });
                    button.toggleClass('is-active', this.hasActiveFilters());
                },
                { disabled: !this.showAdultInAll, icon: FILTER_ICON_MAP.adult }
            );
        }

        if (this.showCustomFilter) {
            this.createCheckbox(
                flagGroup,
                t('modeCustom'),
                this.currentFilter.customOnly,
                (checked) => {
                    this.currentFilter.customOnly = checked;
                    this.callbacks.onFilterChange({ customOnly: checked });
                    button.toggleClass('is-active', this.hasActiveFilters());
                },
                { icon: FILTER_ICON_MAP.custom }
            );
        }

        // Display section removed - search now works across all cards
    }

    private renderSortControl(parent: HTMLElement): void {
        const { panel } = this.createDropdown(parent, {
            icon: 'arrow-up-down',
            label: t('sort'),
        });

        const options = this.sortOptions;
        const iconMap: Record<SortField, string> = {
            name: 'type',
            rating: 'star',
            year: 'calendar',
            dateCompleted: 'calendar-check',
        };

        const fieldSection = panel.createDiv({ cls: 'lorebase-dropdown-section' });

        for (const option of options) {
            const isActive = this.currentSort.field === option.field;
            const item = fieldSection.createEl('button', {
                cls: `lorebase-dropdown-choice ${isActive ? 'is-selected' : ''}`,
                attr: { type: 'button' },
            });

            const icon = item.createSpan({ cls: 'lorebase-dropdown-icon' });
            setIcon(icon, iconMap[option.field]);

            const label = item.createSpan({ cls: 'lorebase-dropdown-label', text: option.label });
            label.setAttribute('aria-hidden', 'true');

            if (isActive) {
                const check = item.createSpan({ cls: 'lorebase-dropdown-check' });
                setIcon(check, 'check');
            }

            item.addEventListener('click', () => {
                this.currentSort.field = option.field;
                this.callbacks.onSortChange(option.field, this.currentSort.order);
                this.render();
            });
        }

        const orderSection = panel.createDiv({ cls: 'lorebase-dropdown-section' });
        const orderRow = orderSection.createDiv({ cls: 'lorebase-dropdown-row' });
        orderRow.createSpan({ cls: 'lorebase-dropdown-muted', text: t('sortOrder') });

        const orderBtn = orderRow.createEl('button', {
            cls: 'lorebase-sort-order-btn',
            attr: { type: 'button', 'aria-label': t('sortOrder') },
        });

        const orderIcon = orderBtn.createSpan({ cls: 'lorebase-order-icon' });
        setIcon(orderIcon, this.currentSort.order === 'asc' ? 'arrow-up' : 'arrow-down');
        orderBtn.createSpan({ text: this.currentSort.order === 'asc' ? t('sortAsc') : t('sortDesc') });

        orderBtn.addEventListener('click', () => {
            const nextOrder: SortOrder = this.currentSort.order === 'asc' ? 'desc' : 'asc';
            this.currentSort.order = nextOrder;
            this.callbacks.onSortChange(this.currentSort.field, nextOrder);
            this.render();
        });
    }

    private renderTagsControl(parent: HTMLElement): void {
        const { button, panel } = this.createDropdown(parent, {
            icon: 'tag',
            label: t('tags'),
        });

        panel.addClass('lorebase-tags-dropdown');
        button.toggleClass('is-active', this.hasActiveTagFilters());

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
                    } else {
                        this.callbacks.onFilterChange({ genres: updated });
                    }

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
        const searchContainer = parent.createDiv({ cls: 'lorebase-search-container' });

        const searchInput = searchContainer.createEl('input', {
            cls: 'lorebase-search-input',
            attr: {
                type: 'text',
                placeholder: t('searchPlaceholder'),
                spellcheck: 'false',
                'aria-label': t('search'),
            },
        });

        searchInput.value = this.currentFilter.searchTerm;

        searchInput.addEventListener('input', () => {
            const value = searchInput.value;

            if (this.searchTimeout) {
                window.clearTimeout(this.searchTimeout);
            }

            this.searchTimeout = window.setTimeout(() => {
                this.currentFilter.searchTerm = value;
                this.callbacks.onSearch(value);
            }, SEARCH_DEBOUNCE_MS);
        });

        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
            }
        });
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
        randomBtn.addEventListener('click', () => this.callbacks.onRandom());
    }

    private renderViewModeControl(parent: HTMLElement): void {
        const { button, panel } = this.createDropdown(parent, {
            icon: 'layout-grid',
            label: t('view'),
            align: 'right',
        });

        button.removeClass('is-active');

        const options: Array<{ mode: ViewMode; label: string; icon: string }> = [
            { mode: 'grid', label: t('viewGrid'), icon: 'rectangle-vertical' },
            { mode: 'horizontal', label: t('viewHorizontal'), icon: 'rectangle-horizontal' },
        ];

        const viewSection = panel.createDiv({ cls: 'lorebase-dropdown-section' });
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
            cls: 'lorebase-dropdown-action',
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
            cls: 'lorebase-dropdown-action',
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

    private createCheckbox(
        parent: HTMLElement,
        label: string,
        checked: boolean,
        onChange: (checked: boolean) => void,
        options?: { disabled?: boolean; icon?: string }
    ): void {
        const row = parent.createDiv({ cls: 'lorebase-dropdown-item' });
        if (options?.disabled) {
            row.addClass('is-disabled');
        }

        if (options?.icon) {
            const icon = row.createSpan({ cls: 'lorebase-dropdown-icon lorebase-filter-icon' });
            setIcon(icon, options.icon);
        }

        const labelSpan = row.createSpan({ cls: 'lorebase-dropdown-label', text: label });
        labelSpan.setAttribute('aria-hidden', 'true');

        const input = row.createEl('input', {
            attr: {
                type: 'checkbox',
                'aria-label': label,
            },
        });
        input.checked = checked;
        input.disabled = Boolean(options?.disabled);

        row.addEventListener('click', (event) => {
            if (options?.disabled) return;
            if (event.target === input) return;
            input.checked = !input.checked;
            onChange(input.checked);
        });

        input.addEventListener('change', () => {
            onChange(input.checked);
        });
    }

    private hasActiveFilters(): boolean {
        return hasActiveFilters(this.currentFilter);
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
        this.render();
    }

    updateStatusOptions(options: Array<{ status: MediaStatus; label: string }>): void {
        this.statusOptions = options;
        this.render();
    }

    updateSortOptions(options: Array<{ field: SortField; label: string }>): void {
        this.sortOptions = options;
        this.render();
    }

    updateFilterFlags(flags: { showAdult: boolean; showCustom: boolean }): void {
        this.showAdultFilter = flags.showAdult;
        this.showCustomFilter = flags.showCustom;
        this.render();
    }

    updateRandomLabel(label: string): void {
        this.randomLabel = label;
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
    refresh(showAdultInAll?: boolean): void {
        if (showAdultInAll !== undefined) {
            this.showAdultInAll = showAdultInAll;
        }
        this.render();
    }

    /**
     * Destroy the toolbar
     */
    destroy(): void {
        if (this.searchTimeout) {
            window.clearTimeout(this.searchTimeout);
            this.searchTimeout = null;
        }

        this.dropdownManager.destroy();

        if (this.container && this.container.parentElement) {
            this.container.remove();
        }
    }
}
