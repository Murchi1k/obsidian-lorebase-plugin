export type ScrollAnchor = {
    scrollTop: number;
    filePath: string | null;
    offsetTop: number | null;
};

export type RenderScrollMode = 'none' | 'preserve' | 'top';

export class ScrollManager {
    constructor(
        private readonly getScrollContainer: () => HTMLElement,
        private readonly isDestroyed: () => boolean
    ) {}

    capture(): ScrollAnchor | null {
        const scrollContainer = this.getScrollContainer();
        const scrollTop = scrollContainer.scrollTop;
        const containerRect = scrollContainer.getBoundingClientRect();
        const cards = Array.from(
            scrollContainer.querySelectorAll<HTMLElement>('.lorebase-card[data-lorebase-file-path]')
        );

        for (const card of cards) {
            const rect = card.getBoundingClientRect();
            if (rect.bottom < containerRect.top) continue;
            if (rect.top > containerRect.bottom) break;

            return {
                scrollTop,
                filePath: card.dataset.lorebaseFilePath ?? null,
                offsetTop: rect.top - containerRect.top,
            };
        }

        return {
            scrollTop,
            filePath: null,
            offsetTop: null,
        };
    }

    apply(mode: RenderScrollMode, anchor: ScrollAnchor | null): void {
        if (this.isDestroyed()) return;
        const scrollContainer = this.getScrollContainer();
        if (mode === 'top') {
            scrollContainer.scrollTop = 0;
            return;
        }
        if (mode === 'preserve') this.restore(anchor);
    }

    private restore(anchor: ScrollAnchor | null): void {
        if (!anchor || this.isDestroyed()) return;

        const scrollContainer = this.getScrollContainer();
        if (anchor.filePath && anchor.offsetTop !== null) {
            const cards = Array.from(
                scrollContainer.querySelectorAll<HTMLElement>('.lorebase-card[data-lorebase-file-path]')
            );
            const target = cards.find((card) => card.dataset.lorebaseFilePath === anchor.filePath);
            if (target) {
                const containerRect = scrollContainer.getBoundingClientRect();
                const targetRect = target.getBoundingClientRect();
                const delta = targetRect.top - containerRect.top - anchor.offsetTop;
                scrollContainer.scrollTop += delta;
                return;
            }
        }

        const maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
        scrollContainer.scrollTop = Math.max(0, Math.min(anchor.scrollTop, maxScrollTop));
    }
}
