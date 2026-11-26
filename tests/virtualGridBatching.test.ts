// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import type { GameCard } from '../src/components/GameCard';
import { VirtualGrid, VirtualGroupedGrid } from '../src/views/library/VirtualGrid';

afterEach(() => { document.body.replaceChildren(); vi.useRealTimers(); });

function element(): HTMLElement {
    const node = document.createElement('div');
    node.addClass = name => node.classList.add(name);
    node.removeClass = name => node.classList.remove(name);
    node.setCssStyles = styles => Object.assign(node.style, styles);
    node.createDiv = () => node.appendChild(element()) as HTMLDivElement;
    node.createSpan = options => {
        const child = document.createElement('span'); child.textContent = options?.text ?? ''; node.appendChild(child); return child;
    };
    return node;
}

it.each([false, true])('builds virtual cards detached and attaches the complete viewport (grouped=%s)', grouped => {
    const scroller = document.body.appendChild(element()), gridEl = scroller.appendChild(element());
    Object.defineProperty(scroller, 'clientHeight', { value: 600 });
    gridEl.getBoundingClientRect = () => ({ top: -scroller.scrollTop }) as DOMRect;
    const items = Array.from({ length: 1000 }, (_, i) => i);
    const createCard = vi.fn((parent: HTMLElement, item: number) => {
        expect(parent.isConnected).toBe(false);
        const el = parent.appendChild(element()); el.className = 'test-card'; el.dataset.item = String(item);
        return { getElement: () => el, destroy: () => el.remove(), setImageLoadingPriority() {} } as unknown as GameCard;
    });
    const options = { gridEl, scrollContainer: scroller, columns: 3, orientation: 'vertical' as const, cardHeight: 200, buffer: 1, createCard };
    const grid = grouped ? new VirtualGroupedGrid({ ...options, groups: [{ key: 'a', label: 'A', items }], colors: [] })
        : new VirtualGrid({ ...options, items });
    const initial = gridEl.querySelectorAll<HTMLElement>('.test-card');
    expect(initial.length).toBeGreaterThan(0); expect(initial.length).toBeLessThan(30);
    expect([...initial].every(card => card.isConnected)).toBe(true);
    scroller.scrollTop = 6000; grid.updateViewport();
    const moved = [...gridEl.querySelectorAll<HTMLElement>('.test-card')];
    expect(moved.length).toBeGreaterThan(0); expect(moved.length).toBeLessThan(30);
    expect(moved.every(card => Number(card.dataset.item) > 60)).toBe(true);
    grid.destroy(); expect(gridEl.querySelectorAll('.test-card')).toHaveLength(0);
});

it.each([false, true])('renders a complete jump destination immediately, then restores preload rows (grouped=%s)', grouped => {
    vi.useFakeTimers();
    const scroller = document.body.appendChild(element()), gridEl = scroller.appendChild(element());
    Object.defineProperty(scroller, 'clientHeight', { value: 600 });
    gridEl.getBoundingClientRect = () => ({ top: -scroller.scrollTop }) as DOMRect;
    const items = Array.from({ length: 1000 }, (_, i) => i);
    const createCard = vi.fn((parent: HTMLElement, item: number) => {
        const el = parent.appendChild(element()); el.dataset.item = String(item);
        return { getElement: () => el, destroy: () => el.remove(), setImageLoadingPriority() {} } as unknown as GameCard;
    });
    const options = { gridEl, scrollContainer: scroller, columns: 3, orientation: 'vertical' as const, cardHeight: 200,
        buffer: 3, gap: 0, padding: 0, createCard, externalViewportUpdates: true };
    const grid = grouped ? new VirtualGroupedGrid({ ...options, groups: [{ key: 'a', label: 'A', items }], colors: [] })
        : new VirtualGrid({ ...options, items });
    const cards = () => [...gridEl.querySelectorAll<HTMLElement>('[data-item]')];
    scroller.scrollTop = 20_000; grid.updateViewport();
    const immediate = cards();
    expect(immediate.length).toBeGreaterThan(0);
    expect(immediate.length).toBeLessThanOrEqual(15);
    // Every row intersecting the viewport is present, including partial rows.
    for (let index = 0; index < items.length; index++) {
        const rowTop = (grouped ? 60 : 0) + Math.floor(index / 3) * 200;
        if (rowTop < scroller.scrollTop + 600 && rowTop + 200 > scroller.scrollTop) {
            expect(immediate.some(card => Number(card.dataset.item) === index)).toBe(true);
        }
    }
    vi.advanceTimersByTime(200);
    expect(cards().length).toBeGreaterThan(immediate.length);
    expect(immediate.every(card => card.isConnected)).toBe(true);
    scroller.scrollTop = 40_000; grid.updateViewport();
    grid.destroy();
    const createdBeforeClose = createCard.mock.calls.length;
    vi.advanceTimersByTime(1000);
    expect(createCard).toHaveBeenCalledTimes(createdBeforeClose);
    expect(cards()).toHaveLength(0);
});
