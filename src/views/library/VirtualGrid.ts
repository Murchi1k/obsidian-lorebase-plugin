import { GameCard } from '../../components/GameCard';

type VirtualGridOrientation = 'vertical' | 'horizontal';

type CreateCardFn<T> = (parent: HTMLElement, item: T) => GameCard;

export interface VirtualGridOptions<T> {
    gridEl: HTMLElement;
    scrollContainer: HTMLElement;
    items: T[];
    columns: number;
    orientation: VirtualGridOrientation;
    cardHeight: number;
    buffer: number;
    createCard: CreateCardFn<T>;
}

export class VirtualGrid<T> {
    private options: VirtualGridOptions<T>;
    private virtualScrollHandler: (() => void) | null = null;
    private rafId: number | null = null;
    private visibleCards: Map<number, GameCard> = new Map();
    private cardsPerRow: number;
    private spacer: HTMLElement | null = null;
    private cachedCardWidthCalc: string = '';

    constructor(options: VirtualGridOptions<T>) {
        this.options = options;
        this.cardsPerRow = Math.max(1, options.columns);
        this.setup();
    }

    destroy(): void {
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
        this.spacer = null;
    }

    updateLayout(options: Pick<VirtualGridOptions<T>, 'columns' | 'orientation' | 'cardHeight'>): void {
        this.options = {
            ...this.options,
            ...options,
        };
        this.cardsPerRow = Math.max(1, options.columns);
        this.rebuildCardWidthCalc();
        this.updateSpacerHeight();
        this.scheduleUpdate();
    }

    private setup(): void {
        this.spacer = this.options.gridEl.createDiv({ cls: 'lorebase-spacer' });
        this.spacer.setCssStyles({ gridColumn: '1 / -1' });
        this.rebuildCardWidthCalc();
        this.updateSpacerHeight();
        this.updateVisibleCards();

        this.virtualScrollHandler = () => {
            this.scheduleUpdate();
        };

        this.options.scrollContainer.addEventListener('scroll', this.virtualScrollHandler);
    }

    private updateSpacerHeight(): void {
        if (!this.spacer) return;

        const gap = this.getGap();
        const padding = this.getPadding();
        const totalRows = Math.ceil(this.options.items.length / this.cardsPerRow);
        const totalHeight = (totalRows * this.options.cardHeight) +
            (totalRows > 0 ? (totalRows - 1) * gap : 0) +
            (padding * 2);

        this.spacer.setCssStyles({ height: `${totalHeight}px` });
    }

    private scheduleUpdate(): void {
        if (this.rafId !== null) return;

        this.rafId = window.requestAnimationFrame(() => {
            this.rafId = null;
            this.updateVisibleCards();
        });
    }

    private updateVisibleCards(): void {
        const gap = this.getGap();
        const padding = this.getPadding();
        const scrollTop = this.options.scrollContainer.scrollTop;
        const containerHeight = this.options.scrollContainer.clientHeight;

        const startRow = Math.max(
            0,
            Math.floor((scrollTop - padding) / (this.options.cardHeight + gap)) - this.options.buffer
        );
        const endRow = Math.ceil(
            (scrollTop + containerHeight - padding) / (this.options.cardHeight + gap)
        ) + this.options.buffer;

        const startIndex = startRow * this.cardsPerRow;
        const endIndex = Math.min(endRow * this.cardsPerRow, this.options.items.length);

        for (const [index, card] of this.visibleCards) {
            if (index < startIndex || index >= endIndex) {
                card.destroy();
                this.visibleCards.delete(index);
            }
        }

        for (const [index, card] of this.visibleCards) {
            if (index >= startIndex && index < endIndex) {
                this.positionCard(index, card, this.cachedCardWidthCalc, gap, padding);
            }
        }

        for (let i = startIndex; i < endIndex; i++) {
            const item = this.options.items[i];
            if (!item || this.visibleCards.has(i)) continue;

            const card = this.options.createCard(this.options.gridEl, item);
            this.positionCard(i, card, this.cachedCardWidthCalc, gap, padding);
            this.visibleCards.set(i, card);
        }
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
            top: `${padding + (row * (this.options.cardHeight + gap))}px`,
            left: `calc(${padding}px + ${col} * (${cardWidthCalc} + ${gap}px))`,
        });
    }

    private getGap(): number {
        return 16;
    }

    private getPadding(): number {
        return 16;
    }

    private rebuildCardWidthCalc(): void {
        const gap = this.getGap();
        const padding = this.getPadding();
        const totalGapWidth = gap * (this.cardsPerRow - 1);
        const totalPaddingWidth = padding * 2;
        this.cachedCardWidthCalc = `calc((100% - ${totalGapWidth}px - ${totalPaddingWidth}px) / ${this.cardsPerRow})`;
    }
}
