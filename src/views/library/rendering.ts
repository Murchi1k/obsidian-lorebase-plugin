import { MediaItem, ViewMode } from '../../types';
import { cardGridWidthCss } from '../../services/media/cardGrid';
import { getGroupSpacing } from './groupSpacing';

interface LibraryLayout {
    columns: number;
    orientation: 'vertical' | 'horizontal';
    minCardWidth: number;
    targetCardWidth?: number;
    gap?: number;
    padding?: number;
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
    layout: LibraryLayout;
    onBack: () => void;
}

export function createGrid(params: RenderFlatGridParams): HTMLElement {
    const { container, layout, className = 'lorebase-grid' } = params;
    const gridEl = container.createDiv({ cls: className });
    applyGridLayout(gridEl, layout);
    return gridEl;
}

export function applyGridLayout(gridEl: HTMLElement, layout: LibraryLayout): void {
    const columns = Math.max(1, layout.columns);
    const gap = layout.gap ?? 16;
    gridEl.setCssStyles({
        position: 'relative',
        gridTemplateColumns: `repeat(${columns}, minmax(0, ${layout.targetCardWidth ? cardGridWidthCss(columns, gap, 0, layout.targetCardWidth) : '1fr'}))`,
        gap: `${gap}px`,
        padding: `${layout.padding ?? 16}px`,
    });
    const section = gridEl.parentElement;
    if (section?.classList.contains('lorebase-view-group-section')) {
        const spacing = getGroupSpacing(gap);
        section.style.setProperty('--lorebase-group-padding', `${layout.padding ?? 16}px`);
        section.style.setProperty('--lorebase-group-margin', `${Math.max(0, spacing.sectionGap - (layout.padding ?? 16))}px`);
        gridEl.style.paddingTop = `${spacing.headerGap}px`;
    }
}

export function renderRandomCard(params: RenderRandomCardParams): void {
    const { container, item, titleText, backText, createCard, onBack } = params;
    container.empty();

    container.createDiv({
        cls: 'lorebase-random-title',
        text: `${titleText}: ${item.displayName}`
    });

    const grid = createGrid({ container, layout: params.layout, className: 'lorebase-grid lorebase-random-grid' });
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
