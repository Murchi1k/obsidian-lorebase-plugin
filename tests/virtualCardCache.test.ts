// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import type { GameCard } from '../src/components/GameCard';
import { VirtualCardCache } from '../src/views/library/VirtualCardCache';

afterEach(() => document.body.replaceChildren());

function card(width = 100, height = 150) {
    const el = document.body.appendChild(document.createElement('div'));
    const img = el.appendChild(document.createElement('img'));
    Object.defineProperties(img, { naturalWidth: { value: width, configurable: true }, naturalHeight: { value: height, configurable: true } });
    const destroy = vi.fn(() => el.remove());
    return { getElement: () => el, destroy, setImageLoadingPriority: vi.fn() } as unknown as GameCard;
}

it('bounds detached card count and destroys all remaining resources on close', () => {
    const cache = new VirtualCardCache();
    const cards = Array.from({ length: 80 }, () => card());
    cards.forEach((card, i) => cache.retain(i, card, i));
    expect(cards.filter(card => vi.mocked(card.destroy).mock.calls.length === 0)).toHaveLength(24);
    expect(document.body.children).toHaveLength(0);
    cache.destroy();
    expect(cards.every(card => vi.mocked(card.destroy).mock.calls.length === 1)).toBe(true);
});

it('evicts full-resolution posters according to their decoded memory cost', () => {
    const cache = new VirtualCardCache();
    const a = card(2000, 2000), b = card(2000, 2000);
    cache.retain(0, a, 0); cache.retain(1, b, 1);
    expect(a.destroy).toHaveBeenCalledTimes(1);
    expect(b.destroy).not.toHaveBeenCalled();
    cache.destroy();
});

it('discards a cached card when metadata changed while it was detached', () => {
    const cache = new VirtualCardCache(), saved = card();
    cache.retain(0, saved, { imageUrl: 'old' });
    expect(cache.take(0, document.body, { imageUrl: 'new' })).toBeUndefined();
    expect(saved.destroy).toHaveBeenCalledTimes(1);
    cache.destroy();
});

it('enforces the decoded image budget when detached covers finish loading', () => {
    const cache = new VirtualCardCache(), a = card(0, 0), b = card(0, 0);
    cache.retain(0, a, 0); cache.retain(1, b, 1);
    for (const saved of [a, b]) {
        const image = saved.getElement().querySelector('img')!;
        Object.defineProperties(image, { naturalWidth: { value: 2000 }, naturalHeight: { value: 2000 } });
        image.dispatchEvent(new Event('load'));
    }
    expect(a.destroy).toHaveBeenCalledTimes(1);
    expect(b.destroy).not.toHaveBeenCalled();
    cache.destroy(); expect(b.destroy).toHaveBeenCalledTimes(1);
});

it('removes image listeners when a cached card is reused or destroyed', () => {
    const cache = new VirtualCardCache(), a = card(), b = card();
    const imageA = a.getElement().querySelector('img')!, imageB = b.getElement().querySelector('img')!;
    const removeA = vi.spyOn(imageA, 'removeEventListener'), removeB = vi.spyOn(imageB, 'removeEventListener');
    cache.retain(0, a, 0); cache.retain(1, b, 1);
    expect(cache.take(0, document.body, 0)).toBe(a);
    expect(removeA).toHaveBeenCalledWith('load', expect.any(Function));
    cache.destroy(); expect(removeB).toHaveBeenCalledWith('load', expect.any(Function));
    expect(a.destroy).not.toHaveBeenCalled(); a.destroy();
});
