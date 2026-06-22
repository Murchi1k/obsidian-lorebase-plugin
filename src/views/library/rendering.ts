import { MediaItem, FilterState, ViewMode } from '../../types';

export interface LibraryLayout {
    columns: number;
    orientation: 'vertical' | 'horizontal';
    minCardWidth: number;
}

interface BaseRenderParams {
    container: HTMLElement;
    layout: LibraryLayout;
}

export interface RenderFlatGridParams extends BaseRenderParams {
    className?: string;
}

export interface RenderRandomCardParams {
    container: HTMLElement;
    item: MediaItem;
    titleText: string;
    backText: string;
    createCard: (parent: HTMLElement, item: MediaItem) => void;
    onBack: () => void;
}

export function shouldGroupBySeries(
    mediaType: 'game' | 'anime',
    sortField: string,
    viewMode: ViewMode,
    filter: FilterState,
    totalItems: number
): boolean {
    const hasFlagFilters = filter.favoriteOnly || filter.adultOnly || filter.customOnly;
    const isGroupableView = viewMode === 'grid' || viewMode === 'horizontal';

    return mediaType === 'game'
        && sortField === 'name'
        && isGroupableView
        && !hasFlagFilters
        && totalItems <= 300;
}

export function createGrid(params: RenderFlatGridParams): HTMLElement {
    const { container, layout, className = 'lorebase-grid' } = params;
    const gridEl = container.createDiv({ cls: className });
    gridEl.setCssStyles({
        position: 'relative',
        gridTemplateColumns: `repeat(${Math.max(1, layout.columns)}, minmax(0, 1fr))`,
        gap: '16px',
        padding: '16px',
    });

    return gridEl;
}

export function renderRandomCard(params: RenderRandomCardParams): void {
    const { container, item, titleText, backText, createCard, onBack } = params;
    container.empty();

    container.createDiv({
        cls: 'lorebase-random-title',
        text: `${titleText}: ${item.displayName}`
    });

    const grid = container.createDiv({ cls: 'lorebase-grid lorebase-random-grid' });
    createCard(grid, item);

    const backBtn = container.createEl('button', {
        cls: 'lorebase-btn lorebase-back-btn',
        text: backText
    });
    backBtn.addEventListener('click', onBack);
}

export function applyViewModeClass(container: HTMLElement, viewMode: ViewMode): void {
    container.removeClass(
        'lorebase-view-mode-grid',
        'lorebase-view-mode-horizontal'
    );
    container.addClass(`lorebase-view-mode-${viewMode}`);
}
