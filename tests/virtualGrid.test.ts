import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameCard } from '../src/components/GameCard';
import { VirtualGrid, VirtualGroupedGrid } from '../src/views/library/VirtualGrid';

function element(): HTMLElement {
    return {
        style: {},
        addClass: vi.fn(),
        removeClass: vi.fn(),
        getBoundingClientRect: () => ({ top: 0 }),
        createDiv: () => element(),
        createSpan: () => element(),
        setCssStyles(styles: object) { Object.assign(this.style, styles); },
        remove: vi.fn(),
        appendChild: vi.fn(),
        querySelectorAll: () => [],
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        scrollTop: 0,
        clientHeight: 1000,
        clientTop: 0,
    } as unknown as HTMLElement;
}

afterEach(() => vi.unstubAllGlobals());

describe('virtual grid resizing', () => {
    it.each([false, true])('preserves the first visible item and offset across a resize (grouped: %s)', grouped => {
        const container = element(), gridEl = element();
        gridEl.getBoundingClientRect = () => ({ top: 150 - container.scrollTop }) as DOMRect;
        const mounted = new Map<number, HTMLElement>();
        const items = Array.from({ length: 500 }, (_, i) => i);
        const createCard = (_: HTMLElement, item: number) => {
            const el = element(); mounted.set(item, el);
            return { getElement: () => el, destroy() {}, setImageLoadingPriority() {} } as unknown as GameCard;
        };
        const options = { gridEl, scrollContainer: container, columns: 5, orientation: 'vertical' as const, cardHeight: 300, buffer: 3, createCard };
        const grid = grouped
            ? new VirtualGroupedGrid({ ...options, groups: [{ key: 'a', label: 'A', items }], colors: [] })
            : new VirtualGrid({ ...options, items });
        // Item zero is valid too; truthiness checks must not skip it.
        expect(mounted.has(0)).toBe(true);
        container.scrollTop = 150 + parseFloat(mounted.get(10)!.style.top) + 45;
        grid.updateViewport();
        grid.updateLayout({ columns: 3, orientation: 'vertical', cardHeight: 230 });
        expect(150 + parseFloat(mounted.get(10)!.style.top) - container.scrollTop).toBeCloseTo(-45);
        grid.destroy();
    });

    it.each([false, true])('reuses nearby cards and their images when reversing scroll (grouped: %s)', grouped => {
        const container = element(), gridEl = element();
        gridEl.getBoundingClientRect = () => ({ top: -container.scrollTop }) as DOMRect;
        const items = Array.from({ length: 500 }, (_, i) => i);
        const cards = new Map<number, { el: HTMLElement; destroy: ReturnType<typeof vi.fn> }>();
        const createCard = vi.fn((_: HTMLElement, item: number) => {
            const card = { el: element(), destroy: vi.fn() }; cards.set(item, card);
            return { getElement: () => card.el, destroy: card.destroy, setImageLoadingPriority() {} } as unknown as GameCard;
        });
        const options = { gridEl, scrollContainer: container, columns: 3, orientation: 'vertical' as const, cardHeight: 300, buffer: 3, createCard };
        const grid = grouped
            ? new VirtualGroupedGrid({ ...options, groups: [{ key: 'a', label: 'A', items }], colors: [] })
            : new VirtualGrid({ ...options, items });
        const first = cards.get(0)!;
        container.scrollTop = 1400; grid.updateViewport();
        expect(first.el.remove).toHaveBeenCalled();
        expect(first.destroy).not.toHaveBeenCalled();
        container.scrollTop = 0; grid.updateViewport();
        expect(cards.get(0)).toBe(first);
        expect(gridEl.appendChild).toHaveBeenCalledWith(first.el);
        expect(createCard.mock.calls.filter(([, item]) => item === 0)).toHaveLength(1);
        grid.destroy();
        expect(first.destroy).toHaveBeenCalledTimes(1);
    });

    it('updates grouped height without replacing the scroll spacer', () => {
        const gridEl = element(), spacer = element();
        gridEl.createDiv = vi.fn(() => spacer);
        const grid = new VirtualGroupedGrid({ gridEl, scrollContainer: element(), groups: [], colors: [],
            columns: 3, orientation: 'vertical', cardHeight: 300, buffer: 3,
            createCard: () => { throw new Error('no cards'); },
        });
        grid.updateLayout({ columns: 2, orientation: 'vertical', cardHeight: 250 });
        expect(gridEl.createDiv).toHaveBeenCalledTimes(1);
        expect(spacer.remove).not.toHaveBeenCalled();
        grid.destroy();
    });
    it.each([0, 16, 48])('leaves space above and below series headings with a card gap of %s', gap => {
        const headers: HTMLElement[] = [], cards: HTMLElement[] = [];
        const gridEl = element();
        gridEl.createDiv = ((options: { cls: string }) => {
            const el = element();
            if (options.cls.includes('lorebase-virtual-group-title')) headers.push(el);
            return el;
        }) as HTMLElement['createDiv'];
        const grid = new VirtualGroupedGrid({ gridEl, scrollContainer: element(), groups: [
            { key: 'a', label: 'A', items: [1] }, { key: 'b', label: 'B', items: [2] },
        ], colors: [], columns: 1, orientation: 'vertical', cardHeight: 200, buffer: 3, gap, padding: 0,
            createCard: () => { const el = element(); cards.push(el); return { getElement: () => el, destroy() {}, setImageLoadingPriority() {} } as unknown as GameCard; },
        });
        expect(parseFloat(cards[0].style.top) - parseFloat(headers[0].style.top) - parseFloat(headers[0].style.height)).toBeGreaterThanOrEqual(24);
        expect(parseFloat(headers[1].style.top) - parseFloat(cards[0].style.top) - 200).toBeGreaterThanOrEqual(40);
        grid.destroy();
    });
    it.each([false, true])('uses the chosen pixel width and spacing (grouped: %s)', grouped => {
        const cards: HTMLElement[] = [];
        const createCard = () => {
            const el = element();
            cards.push(el);
            return { getElement: () => el, destroy() {}, setImageLoadingPriority() {} } as unknown as GameCard;
        };
        const options = {
            gridEl: element(), scrollContainer: element(), items: [1, 2, 3], columns: 2,
            orientation: 'vertical' as const, cardHeight: 240, buffer: 1, createCard,
            targetCardWidth: 160, gap: 9, padding: 9,
        };
        const grid = grouped
            ? new VirtualGroupedGrid({ ...options, groups: [{ key: 'a', label: 'A', items: options.items }], colors: [] })
            : new VirtualGrid(options);
        expect(cards[0].style.width).toContain('min(160px');
        expect(parseFloat(cards[2].style.top) - parseFloat(cards[0].style.top)).toBe(249);
        expect(cards[1].style.left).toContain('+ 9px)');
        grid.destroy();
    });

    it.each([false, true])('positions retained cards before returning (grouped: %s)', (grouped) => {
        const cards: Array<{ el: HTMLElement; destroy: ReturnType<typeof vi.fn> }> = [];
        const createCard = vi.fn(() => {
            const card = { el: element(), destroy: vi.fn() };
            cards.push(card);
            return { getElement: () => card.el, destroy: card.destroy, setImageLoadingPriority() {} } as unknown as GameCard;
        });
        const options = {
            gridEl: element(), scrollContainer: element(), items: [1, 2, 3],
            columns: 2, orientation: 'vertical' as const, cardHeight: 200,
            buffer: 1, createCard,
        };
        const grid = grouped
            ? new VirtualGroupedGrid({ ...options, groups: [{ key: 'a', label: 'A', items: options.items }], colors: [] })
            : new VirtualGrid(options);
        const previousTop = cards[1].el.style.top;

        // While the sidebar moves, retain the column count but immediately
        // move the next row to match the growing poster height.
        grid.updateLayout({ columns: grid.columns, orientation: 'vertical', cardHeight: 300 });
        expect(grid.columns).toBe(2);
        expect(cards[1].el.style.top).toBe(previousTop);
        expect(parseFloat(cards[2].el.style.top) - parseFloat(cards[0].el.style.top)).toBe(316);

        grid.updateLayout({ columns: 1, orientation: 'vertical', cardHeight: 240 });

        expect(createCard).toHaveBeenCalledTimes(3);
        expect(cards.every(card => card.destroy.mock.calls.length === 0)).toBe(true);
        expect(cards[1].el.style.top).not.toBe(previousTop);
        expect(parseFloat(cards[1].el.style.top) - parseFloat(cards[0].el.style.top)).toBe(256);
        grid.destroy();
    });

    it.each([false, true])('keeps scrolling work bounded with 100,000 items (grouped: %s)', grouped => {
        const frames: FrameRequestCallback[] = [];
        vi.stubGlobal('window', { requestAnimationFrame: (fn: FrameRequestCallback) => { frames.push(fn); return frames.length; }, cancelAnimationFrame: vi.fn() });
        const container = element(), gridEl = element();
        // Include a toolbar above the grid, as in the real library.
        gridEl.getBoundingClientRect = () => ({ top: 150 - container.scrollTop }) as DOMRect;
        const active = new Map<number, HTMLElement>();
        const itemByElement = new Map<HTMLElement, number>();
        gridEl.appendChild = ((el: HTMLElement) => { active.set(itemByElement.get(el)!, el); return el; }) as HTMLElement['appendChild'];
        const createCard = vi.fn((_parent: HTMLElement, item: number) => {
            const el = element();
            el.setCssStyles = vi.fn(el.setCssStyles.bind(el));
            el.remove = vi.fn(() => active.delete(item));
            itemByElement.set(el, item);
            active.set(item, el);
            return { getElement: () => el, destroy: () => active.delete(item), setImageLoadingPriority: vi.fn() } as unknown as GameCard;
        });
        const items = Array.from({ length: 100_000 }, (_, index) => index + 1);
        const options = { gridEl, scrollContainer: container, items, columns: 5, orientation: 'vertical' as const, cardHeight: 300, buffer: 3, createCard };
        const grid = grouped
            ? new VirtualGroupedGrid({ ...options, groups: Array.from({ length: 100 }, (_, i) => ({ key: String(i), label: String(i), items: items.slice(i * 1000, (i + 1) * 1000) })), colors: [] })
            : new VirtualGrid(options);
        let reads = 0;
        if (grouped) {
            const state = grid as unknown as { positions: unknown[] };
            state.positions = new Proxy(state.positions, { get(target, key, receiver) {
                if (typeof key === 'string' && /^\d+$/.test(key)) reads++;
                return Reflect.get(target, key, receiver);
            } });
        }
        const scroll = vi.mocked(container.addEventListener).mock.calls.find(([event]) => event === 'scroll')![1] as () => void;
        for (const top of [500_000, 1_000_000, 1_000_010, 4_000_000, 0]) {
            const retained = new Map(active);
            for (const el of retained.values()) vi.mocked(el.setCssStyles).mockClear();
            container.scrollTop = top;
            scroll(); scroll();
            expect(frames).toHaveLength(1);
            frames.shift()!(0);
            expect(active.size).toBeGreaterThan(0);
            expect(active.size).toBeLessThanOrEqual(60);
            const gridTop = top - 150;
            expect([...active.values()].some(el => parseFloat(el.style.top) <= gridTop + 1000 && parseFloat(el.style.top) + 300 >= gridTop)).toBe(true);
            for (const [item, el] of active) {
                expect(el.style.height).toBe('300px');
                if (retained.has(item)) expect(el.setCssStyles).not.toHaveBeenCalled();
            }
        }
        if (grouped) expect(reads).toBeLessThan(1000);
        grid.destroy();
        expect(active.size).toBe(0);
    });

    it('virtualizes group headers when each of 100,000 records has a distinct group', () => {
        const container = element(), gridEl = element();
        gridEl.getBoundingClientRect = () => ({ top: -container.scrollTop }) as DOMRect;
        const createDiv = vi.fn(() => element());
        gridEl.createDiv = createDiv;
        const grid = new VirtualGroupedGrid({ gridEl, scrollContainer: container,
            groups: Array.from({ length: 100_000 }, (_, i) => ({ key: String(i), label: String(i), items: [i] })),
            columns: 5, orientation: 'vertical', cardHeight: 300, buffer: 3, colors: [],
            createCard: () => ({ getElement: () => element(), destroy() {}, setImageLoadingPriority() {} }) as unknown as GameCard,
        });
        // One spacer plus the few headers in the overscan area.
        expect(createDiv.mock.calls.length).toBeLessThan(12);
        container.scrollTop = 9_000_000;
        grid.updateLayout({ columns: 5, orientation: 'vertical', cardHeight: 300 });
        expect(createDiv.mock.calls.length).toBeLessThan(25);
        grid.destroy();
    });

    it.each([false, true])('keeps the final record reachable beyond browser height limits (grouped: %s)', grouped => {
        const container = element(), gridEl = element();
        gridEl.getBoundingClientRect = () => ({ top: -container.scrollTop }) as DOMRect;
        const active = new Set<number>();
        const items = Array.from({ length: 100_000 }, (_, i) => i + 1);
        const options = { gridEl, scrollContainer: container, columns: 1, orientation: 'vertical' as const, cardHeight: 1000, buffer: 3,
            createCard: (_parent: HTMLElement, item: number) => {
                active.add(item);
                const el = element();
                el.remove = () => { active.delete(item); };
                return { getElement: () => el, destroy: () => active.delete(item), setImageLoadingPriority() {} } as unknown as GameCard;
            },
        };
        const grid = grouped
            ? new VirtualGroupedGrid({ ...options, groups: items.map(item => ({ key: String(item), label: String(item), items: [item] })), colors: [] })
            : new VirtualGrid({ ...options, items });
        container.scrollTop = 16_000_000 - container.clientHeight;
        grid.updateLayout({ columns: 1, orientation: 'vertical', cardHeight: 1000 });
        expect(active.has(100_000)).toBe(true);
        expect(active.size).toBeLessThan(12);
        grid.destroy();
    });
});
