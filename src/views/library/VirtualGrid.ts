import { GameCard } from '../../components/GameCard';
import { cardGridWidthCss } from '../../services/media/cardGrid';
import { getGroupSpacing } from './groupSpacing';
import { VirtualCardCache } from './VirtualCardCache';

type VirtualGridOrientation = 'vertical' | 'horizontal';

type CreateCardFn<T> = (parent: HTMLElement, item: T) => GameCard;
const MAX_SCROLL_HEIGHT = 16_000_000;
type ScrollRange = { height: number; offset: number };

function cardBatch(grid: HTMLElement): HTMLElement {
    return grid.ownerDocument?.createElement('div') ?? grid;
}

function attachCardBatch(grid: HTMLElement, batch: HTMLElement): void {
    if (batch === grid || !batch.firstChild) return;
    const fragment = batch.ownerDocument.createDocumentFragment();
    while (batch.firstChild) fragment.appendChild(batch.firstChild);
    grid.appendChild(fragment);
}

/** Keep scrollbar jumps cheap; restore the normal preload window once settled. */
class ScrollOverscan {
    private previousTop: number | undefined;
    private timer: ReturnType<typeof setTimeout> | null = null;

    constructor(private readonly settled: () => void) {}

    rows(top: number, height: number, rowHeight: number, normal: number, reposition: boolean): number {
        const jump = this.previousTop !== undefined && Math.abs(top - this.previousTop) > Math.max(height, rowHeight * 2);
        this.previousTop = top;
        if (reposition) this.cancel();
        else if (jump) {
            this.cancel();
            this.timer = setTimeout(() => { this.timer = null; this.settled(); }, 180);
        }
        return this.timer === null ? normal : 0;
    }

    cancel(): void {
        if (this.timer !== null) clearTimeout(this.timer);
        this.timer = null;
    }
}

function viewport(grid: HTMLElement, container: HTMLElement): { top: number; bottom: number } {
    // scrollTop includes the toolbar and any content before the grid.
    const offset = grid.getBoundingClientRect().top - container.getBoundingClientRect().top
        - container.clientTop + container.scrollTop;
    const top = container.scrollTop - offset;
    return { top, bottom: top + container.clientHeight };
}

function virtualViewport(grid: HTMLElement, container: HTMLElement, range: ScrollRange): { top: number; bottom: number; shifted: boolean } {
    const physical = viewport(grid, container);
    const height = container.clientHeight;
    const physicalRange = Math.max(1, Math.min(MAX_SCROLL_HEIGHT, range.height) - height);
    const logicalRange = Math.max(1, range.height - height);
    const top = range.height > MAX_SCROLL_HEIGHT && physical.top > 0
        ? physical.top * logicalRange / physicalRange : physical.top;
    const offset = top - physical.top;
    const shifted = offset !== range.offset;
    range.offset = offset;
    return { top, bottom: top + height, shifted };
}

function restoreVirtualTop(grid: HTMLElement, container: HTMLElement, range: ScrollRange, top: number): void {
    const gridOffset = container.scrollTop - viewport(grid, container).top;
    const height = container.clientHeight;
    const logicalRange = Math.max(1, range.height - height);
    const physicalRange = Math.max(1, Math.min(MAX_SCROLL_HEIGHT, range.height) - height);
    const physicalTop = range.height > MAX_SCROLL_HEIGHT && top > 0 ? top * physicalRange / logicalRange : top;
    container.scrollTop = Math.max(0, gridOffset + physicalTop);
}

function lowerBound<T>(items: T[], value: number, top: (item: T) => number): number {
    let start = 0;
    let end = items.length;
    while (start < end) {
        const middle = (start + end) >>> 1;
        if (top(items[middle]) < value) start = middle + 1;
        else end = middle;
    }
    return start;
}

export interface VirtualGridOptions<T> {
    gridEl: HTMLElement;
    scrollContainer: HTMLElement;
    items: T[];
    columns: number;
    orientation: VirtualGridOrientation;
    cardHeight: number;
    buffer: number;
    createCard: CreateCardFn<T>;
    targetCardWidth?: number;
    gap?: number;
    padding?: number;
    /** The owner calls updateViewport for both native and animated scrolling. */
    externalViewportUpdates?: boolean;
}

type VirtualLayoutOptions = Pick<VirtualGridOptions<unknown>, 'columns' | 'orientation' | 'cardHeight' | 'targetCardWidth' | 'gap' | 'padding'>;

export interface VirtualGroup<T> {
    key: string;
    label: string;
    items: T[];
}

export interface VirtualGroupedGridOptions<T> extends Omit<VirtualGridOptions<T>, 'items'> {
    groups: VirtualGroup<T>[];
    colors: string[];
}

export interface VirtualGridController {
    readonly columns: number;
    destroy(): void;
    updateLayout(options: VirtualLayoutOptions): void;
    updateViewport(): void;
}

export class VirtualGrid<T> {
    private options: VirtualGridOptions<T>;
    private virtualScrollHandler: (() => void) | null = null;
    private rafId: number | null = null;
    private visibleCards: Map<number, GameCard> = new Map();
    private cardCache = new VirtualCardCache();
    private cardsPerRow: number;
    private spacer: HTMLElement | null = null;
    private cachedCardWidthCalc: string = '';
    private scrollRange: ScrollRange = { height: 0, offset: 0 };
    private overscan = new ScrollOverscan(() => this.updateVisibleCards());

    constructor(options: VirtualGridOptions<T>) {
        this.options = options;
        this.cardsPerRow = Math.max(1, options.columns);
        this.setup();
    }

    destroy(): void {
        this.overscan.cancel();
        if (this.virtualScrollHandler) {
            this.options.scrollContainer.removeEventListener('scroll', this.virtualScrollHandler);
            this.virtualScrollHandler = null;
        }

        if (this.rafId !== null) {
            window.cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }

        for (const card of this.visibleCards.values()) {
            card.destroy();
        }
        this.visibleCards.clear();
        this.cardCache.destroy();
        this.spacer?.remove();
        this.spacer = null;
        this.options.gridEl.removeClass('lorebase-virtual-grid');
    }

    updateLayout(options: VirtualLayoutOptions): void {
        const { top } = virtualViewport(this.options.gridEl, this.options.scrollContainer, this.scrollRange);
        const oldRowHeight = this.options.cardHeight + this.getGap();
        const anchorIndex = Math.min(this.options.items.length - 1,
            Math.max(0, Math.floor((top - this.getPadding()) / oldRowHeight)) * this.cardsPerRow);
        const oldTop = this.getPadding() + Math.floor(anchorIndex / this.cardsPerRow) * oldRowHeight;
        const preserve = top > this.getPadding() && anchorIndex >= 0;
        this.options = {
            ...this.options,
            ...options,
        };
        this.cardsPerRow = Math.max(1, options.columns);
        this.rebuildCardWidthCalc();
        this.updateSpacerHeight();
        if (preserve) {
            const newTop = this.getPadding() + Math.floor(anchorIndex / this.cardsPerRow) * (options.cardHeight + this.getGap());
            restoreVirtualTop(this.options.gridEl, this.options.scrollContainer, this.scrollRange, newTop - (oldTop - top));
        }
        // Reflow animation measures the new positions immediately after this call.
        this.updateVisibleCards(true);
    }

    get columns(): number {
        return this.cardsPerRow;
    }

    updateViewport(): void {
        if (this.rafId !== null) window.cancelAnimationFrame(this.rafId);
        this.rafId = null;
        this.updateVisibleCards();
    }

    private setup(): void {
        this.options.gridEl.addClass('lorebase-virtual-grid');
        this.spacer = this.options.gridEl.createDiv({ cls: 'lorebase-spacer' });
        this.spacer.setCssStyles({ gridColumn: '1 / -1' });
        this.rebuildCardWidthCalc();
        this.updateSpacerHeight();
        this.updateVisibleCards();

        this.virtualScrollHandler = () => {
            this.scheduleUpdate();
        };

        if (!this.options.externalViewportUpdates) {
            this.options.scrollContainer.addEventListener('scroll', this.virtualScrollHandler, { passive: true });
        }
    }

    private updateSpacerHeight(): void {
        if (!this.spacer) return;

        const gap = this.getGap();
        const padding = this.getPadding();
        const totalRows = Math.ceil(this.options.items.length / this.cardsPerRow);
        const totalHeight = (totalRows * this.options.cardHeight) +
            (totalRows > 0 ? (totalRows - 1) * gap : 0) +
            (padding * 2);

        // Browsers cap layout dimensions. Compress only enormous scroll ranges,
        // then offset the small rendered window to keep every record reachable.
        this.scrollRange.height = totalHeight;
        this.spacer.setCssStyles({ height: `${Math.max(0, Math.min(MAX_SCROLL_HEIGHT, totalHeight) - padding * 2)}px` });
    }

    private scheduleUpdate(): void {
        if (this.rafId !== null) return;

        this.rafId = window.requestAnimationFrame(() => {
            this.rafId = null;
            this.updateVisibleCards();
        });
    }

    private updateVisibleCards(reposition = false): void {
        const gap = this.getGap();
        const padding = this.getPadding();
        const { top, bottom, shifted } = virtualViewport(this.options.gridEl, this.options.scrollContainer, this.scrollRange);
        reposition ||= shifted;
        const rowHeight = this.options.cardHeight + gap;
        const buffer = this.overscan.rows(top, bottom - top, rowHeight, this.options.buffer, reposition);

        const startRow = Math.max(
            0,
            Math.floor((top - padding) / rowHeight) - buffer
        );
        const endRow = Math.ceil(
            (bottom - padding) / rowHeight
        ) + buffer;

        const startIndex = startRow * this.cardsPerRow;
        const endIndex = Math.min(endRow * this.cardsPerRow, this.options.items.length);

        for (const [index, card] of this.visibleCards) {
            if (index < startIndex || index >= endIndex) {
                this.cardCache.retain(index, card, this.options.items[index]);
                this.visibleCards.delete(index);
            }
        }

        const visibleStart = Math.max(startIndex, Math.floor((top - padding) / rowHeight) * this.cardsPerRow);
        const visibleEnd = Math.min(endIndex, Math.ceil((bottom - padding) / rowHeight) * this.cardsPerRow);
        const batch = cardBatch(this.options.gridEl);
        const render = (i: number): void => {
            const item = this.options.items[i];
            if (i < 0 || i >= this.options.items.length) return;
            let card = this.visibleCards.get(i);
            if (!card) {
                card = this.cardCache.take(i, batch, item) ?? this.options.createCard(batch, item);
                this.visibleCards.set(i, card);
                this.positionCard(i, card, this.cachedCardWidthCalc, gap, padding);
            } else if (reposition) this.positionCard(i, card, this.cachedCardWidthCalc, gap, padding);
            card.setImageLoadingPriority(i >= visibleStart && i < visibleEnd);
        };
        // Start visible requests before the overscan posters compete for bandwidth.
        for (let i = visibleStart; i < visibleEnd; i++) render(i);
        for (let i = startIndex; i < visibleStart; i++) render(i);
        for (let i = Math.max(startIndex, visibleEnd); i < endIndex; i++) render(i);
        attachCardBatch(this.options.gridEl, batch);
    }

    private positionCard(
        index: number,
        card: GameCard,
        cardWidthCalc: string,
        gap: number,
        padding: number
    ): void {
        const row = Math.floor(index / this.cardsPerRow);
        const col = index % this.cardsPerRow;
        const cardEl = card.getElement();

        cardEl.setCssStyles({
            position: 'absolute',
            width: cardWidthCalc,
            height: `${this.options.cardHeight}px`,
            top: `${padding + (row * (this.options.cardHeight + gap)) - this.scrollRange.offset}px`,
            left: `calc(${padding}px + ${col} * (${cardWidthCalc} + ${gap}px))`,
        });
    }

    private getGap(): number {
        return this.options.gap ?? 16;
    }

    private getPadding(): number {
        return this.options.padding ?? 16;
    }

    private rebuildCardWidthCalc(): void {
        const gap = this.getGap();
        const padding = this.getPadding();
        this.cachedCardWidthCalc = cardGridWidthCss(this.cardsPerRow, gap, padding, this.options.targetCardWidth);
    }
}

/**
 * Virtualized grouped grid. Both cards and headers are bounded by the viewport,
 * including libraries grouped by fields with thousands of distinct values.
 */
export class VirtualGroupedGrid<T> implements VirtualGridController {
    private options: VirtualGroupedGridOptions<T>;
    private positions: Array<{ item: T; top: number; leftColumn: number }> = [];
    private visibleCards = new Map<number, GameCard>();
    private cardCache = new VirtualCardCache();
    private headers = new Map<number, HTMLElement>();
    private headerPositions: Array<{ group: VirtualGroup<T>; top: number }> = [];
    private spacer: HTMLElement | null = null;
    private scrollHandler: (() => void) | null = null;
    private rafId: number | null = null;
    private cardWidthCalc = '';
    private scrollRange: ScrollRange = { height: 0, offset: 0 };
    private overscan = new ScrollOverscan(() => this.updateVisibleCards());

    constructor(options: VirtualGroupedGridOptions<T>) {
        this.options = options;
        options.gridEl.addClass('lorebase-virtual-grid');
        this.rebuild();
        this.updateVisibleCards();
        this.scrollHandler = () => this.scheduleUpdate();
        if (!options.externalViewportUpdates) {
            options.scrollContainer.addEventListener('scroll', this.scrollHandler, { passive: true });
        }
    }

    destroy(): void {
        this.overscan.cancel();
        if (this.scrollHandler) {
            this.options.scrollContainer.removeEventListener('scroll', this.scrollHandler);
            this.scrollHandler = null;
        }
        if (this.rafId !== null) window.cancelAnimationFrame(this.rafId);
        this.rafId = null;
        for (const card of this.visibleCards.values()) card.destroy();
        this.visibleCards.clear();
        this.cardCache.destroy();
        this.headers.forEach(header => header.remove());
        this.headers.clear();
        this.headerPositions = [];
        this.positions = [];
        this.spacer?.remove();
        this.spacer = null;
        this.options.gridEl.removeClass('lorebase-virtual-grid');
    }

    updateLayout(options: VirtualLayoutOptions): void {
        const { top } = virtualViewport(this.options.gridEl, this.options.scrollContainer, this.scrollRange);
        const anchorIndex = Math.min(this.positions.length - 1,
            lowerBound(this.positions, top - this.options.cardHeight, position => position.top));
        const oldTop = this.positions[anchorIndex]?.top;
        const preserve = top > (this.options.padding ?? 16) && oldTop !== undefined;
        this.options = { ...this.options, ...options };
        // Item order is unchanged: retain cards and their decoded poster images.
        this.rebuild();
        if (preserve) {
            restoreVirtualTop(this.options.gridEl, this.options.scrollContainer, this.scrollRange,
                this.positions[anchorIndex].top - (oldTop! - top));
        }
        this.updateVisibleCards(true);
    }

    get columns(): number {
        return Math.max(1, this.options.columns);
    }

    updateViewport(): void {
        if (this.rafId !== null) window.cancelAnimationFrame(this.rafId);
        this.rafId = null;
        this.updateVisibleCards();
    }

    private rebuild(): void {
        const columns = Math.max(1, this.options.columns);
        const gap = this.options.gap ?? 16;
        const padding = this.options.padding ?? 16;
        const spacing = getGroupSpacing(gap);
        this.cardWidthCalc = cardGridWidthCss(columns, gap, padding, this.options.targetCardWidth);
        this.positions = [];
        this.headerPositions = [];

        let top = padding;
        this.options.groups.forEach(group => {
            this.headerPositions.push({ group, top });
            top += spacing.headerHeight + spacing.headerGap;

            group.items.forEach((item, index) => {
                const row = Math.floor(index / columns);
                this.positions.push({
                    item,
                    top: top + row * (this.options.cardHeight + gap),
                    leftColumn: index % columns,
                });
            });
            const rows = Math.ceil(group.items.length / columns);
            top += rows * this.options.cardHeight + Math.max(0, rows - 1) * gap + spacing.sectionGap;
        });

        // Replacing the spacer briefly collapses the scroll range and can clamp
        // scrollTop to zero before the new layout is installed.
        this.spacer ??= this.options.gridEl.createDiv({ cls: 'lorebase-spacer' });
        this.scrollRange.height = top + padding;
        this.spacer.setCssStyles({ height: `${Math.max(0, Math.min(MAX_SCROLL_HEIGHT, this.scrollRange.height) - padding * 2)}px`, gridColumn: '1 / -1' });
    }

    private scheduleUpdate(): void {
        if (this.rafId !== null) return;
        this.rafId = window.requestAnimationFrame(() => {
            this.rafId = null;
            this.updateVisibleCards();
        });
    }

    private updateVisibleCards(reposition = false): void {
        const { top, bottom, shifted } = virtualViewport(this.options.gridEl, this.options.scrollContainer, this.scrollRange);
        reposition ||= shifted;
        const rowHeight = this.options.cardHeight + (this.options.gap ?? 16);
        const buffer = this.overscan.rows(top, bottom - top, rowHeight, this.options.buffer, reposition) * rowHeight;
        this.updateHeaders(top - buffer, bottom + buffer, reposition);
        // Positions are ordered by row. Scrolling must not scan a huge library.
        const start = lowerBound(this.positions, top - buffer - this.options.cardHeight, position => position.top);
        const end = lowerBound(this.positions, bottom + buffer, position => position.top);
        const visibleStart = Math.max(start, lowerBound(this.positions, top - this.options.cardHeight, position => position.top));
        const visibleEnd = Math.min(end, lowerBound(this.positions, bottom, position => position.top));
        const batch = cardBatch(this.options.gridEl);
        for (const [index, card] of this.visibleCards) {
            if (index >= start && index < end) continue;
            this.cardCache.retain(index, card, this.positions[index].item);
            this.visibleCards.delete(index);
        }
        const render = (index: number): void => {
            const position = this.positions[index];
            let card = this.visibleCards.get(index);
            let created = false;
            if (!card) {
                card = this.cardCache.take(index, batch, position.item) ?? this.options.createCard(batch, position.item);
                this.visibleCards.set(index, card);
                created = true;
            }
            if (created || reposition) card.getElement().setCssStyles({
                position: 'absolute',
                width: this.cardWidthCalc,
                height: `${this.options.cardHeight}px`,
                top: `${position.top - this.scrollRange.offset}px`,
                left: `calc(${this.options.padding ?? 16}px + ${position.leftColumn} * (${this.cardWidthCalc} + ${this.options.gap ?? 16}px))`,
            });
            card.setImageLoadingPriority(index >= visibleStart && index < visibleEnd);
        };
        for (let index = visibleStart; index < visibleEnd; index++) render(index);
        for (let index = start; index < visibleStart; index++) render(index);
        for (let index = Math.max(start, visibleEnd); index < end; index++) render(index);
        attachCardBatch(this.options.gridEl, batch);
    }

    private updateHeaders(top: number, bottom: number, reposition: boolean): void {
        const { headerHeight } = getGroupSpacing(this.options.gap ?? 16);
        const start = lowerBound(this.headerPositions, top - headerHeight, position => position.top);
        const end = lowerBound(this.headerPositions, bottom, position => position.top);
        for (const [index, header] of this.headers) {
            if (index >= start && index < end) continue;
            header.remove();
            this.headers.delete(index);
        }
        for (let index = start; index < end; index++) {
            const position = this.headerPositions[index];
            let header = this.headers.get(index);
            let created = false;
            if (!header) {
                header = this.options.gridEl.createDiv({ cls: 'lorebase-series-title lorebase-view-group-title lorebase-virtual-group-title' });
                header.createSpan({ text: position.group.label });
                header.createSpan({ cls: 'lorebase-view-group-count', text: String(position.group.items.length) });
                header.style.borderLeftColor = this.options.colors[index % Math.max(1, this.options.colors.length)] ?? 'var(--lorebase-accent)';
                this.headers.set(index, header);
                created = true;
            }
            if (created || reposition) header.setCssStyles({
                position: 'absolute', top: `${position.top - this.scrollRange.offset}px`,
                left: `${this.options.padding ?? 16}px`, right: `${this.options.padding ?? 16}px`, height: `${headerHeight}px`,
            });
        }
    }
}
