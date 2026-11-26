import { describe, expect, it, vi } from 'vitest';
import { GameCard } from '../src/components/GameCard';
import { BookItem } from '../src/types';

// Small Obsidian element adapter: exercise actual card events and image fallback.
class Element extends EventTarget {
    className = '';
    parentElement: Element | null = null;
    children: Element[] = [];
    attributes = new Map<string, string>();
    style = { setProperty: vi.fn(), removeProperty: vi.fn() };
    src = '';
    tag = '';
    setAttribute(key: string, value: string) { this.attributes.set(key, value); }
    toggleClass(name: string, enabled: boolean) {
        const classes = new Set(this.className.split(' ').filter(Boolean));
        if (enabled) classes.add(name); else classes.delete(name);
        this.className = [...classes].join(' ');
    }
    createEl(tag: string, options: { cls?: string; attr?: Record<string, string> } = {}) {
        const child = new Element();
        child.tag = tag;
        child.className = options.cls ?? '';
        child.parentElement = this;
        Object.entries(options.attr ?? {}).forEach(([key, value]) => child.setAttribute(key, value));
        this.children.push(child);
        return child;
    }
    createDiv(options = {}) { return this.createEl('div', options); }
    createSpan(options = {}) { return this.createEl('span', options); }
    querySelector(selector: string) { return this.children.find(child => child.className.split(' ').includes(selector.slice(1))) ?? null; }
    querySelectorAll() { return this.children.filter(child => child.className.includes('is-cover-visible')); }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); }
}

function setup(parent: Element, name: string, pageTotal: number | null = null) {
    const onClick = vi.fn();
    const onContextMenu = vi.fn();
    const book = { type: 'book', filePath: `${name}.md`, displayName: name, authors: ['Author'], imageUrl: 'cover.jpg', poster: 'backup.jpg', pageTotal } as BookItem;
    const card = new GameCard(parent as unknown as HTMLElement, book, { onClick, onContextMenu },
        undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
        undefined, undefined, undefined, undefined, undefined, value => `app://vault/${value}`, true);
    return { card, el: card.getElement() as unknown as Element, onClick };
}

describe('bookshelf interactions', () => {
    it('uses page count for thickness with readable bounds and a stable fallback', () => {
        const width = (pages: number | null, name = 'Book') => {
            const { el } = setup(new Element(), name, pages);
            return Number.parseFloat(el.style.setProperty.mock.calls.find(([key]) => key === '--spine-width')![1]);
        };
        expect(width(100)).toBeLessThan(width(300));
        expect(width(300)).toBeLessThan(width(600));
        expect(width(500) / width(300)).toBeCloseTo(5 / 3, 1);
        expect(width(600, 'Other title')).toBe(width(600));
        expect(width(1)).toBeGreaterThanOrEqual(38);
        expect(width(100000)).toBeLessThanOrEqual(112);
        for (const invalid of [null, 0, -10, NaN, Infinity]) expect(width(invalid)).toBe(44);
    });
    it('reveals the cover before opening the book, folds its neighbor, and supports Escape', () => {
        const parent = new Element();
        const first = setup(parent, 'First');
        const second = setup(parent, 'Second');
        const front = first.el.children.find(child => child.className === 'lorebase-book-front')!;
        expect(front.children.some(child => child.tag === 'img')).toBe(false);
        first.el.dispatchEvent(new Event('click'));
        expect(first.onClick).not.toHaveBeenCalled();
        expect(first.el.attributes.get('aria-expanded')).toBe('true');
        expect(front.children.find(child => child.tag === 'img')?.src).toBe('app://vault/cover.jpg');
        first.el.dispatchEvent(new Event('click'));
        expect(first.onClick).toHaveBeenCalledOnce();
        second.el.dispatchEvent(new Event('click'));
        expect(first.el.attributes.get('aria-expanded')).toBe('false');
        const escape = Object.assign(new Event('keydown'), { key: 'Escape' });
        second.el.dispatchEvent(escape);
        expect(second.el.attributes.get('aria-expanded')).toBe('false');
    });

    it('tries the alternate cover then leaves a title cover when images fail', () => {
        const { el } = setup(new Element(), 'Missing cover');
        el.dispatchEvent(new Event('click'));
        const front = el.children.find(child => child.className === 'lorebase-book-front')!;
        const img = front.children.find(child => child.tag === 'img')!;
        img.dispatchEvent(new Event('error'));
        expect(img.src).toBe('app://vault/backup.jpg');
        img.dispatchEvent(new Event('error'));
        expect(front.children.some(child => child.tag === 'img')).toBe(false);
        expect(front.children.some(child => child.className === 'lorebase-book-front-fallback')).toBe(true);
    });
});
