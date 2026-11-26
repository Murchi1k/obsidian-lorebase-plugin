// @vitest-environment happy-dom
import { renderGamePlatformChips } from '../src/components/GamePlatformChips';
import type { PlatformPlaythrough } from '../src/utils/repeatTracking';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderRepeatTracking } from '../src/components/RepeatTrackingControl';
import { i18n } from '../src/localization';
import type { MediaItem } from '../src/types';

beforeAll(() => {
    Object.assign(HTMLElement.prototype, {
        empty() { this.replaceChildren(); },
        addClass(...names: string[]) { this.classList.add(...names); },
        removeClass(...names: string[]) { this.classList.remove(...names); },
        hasClass(name: string) { return this.classList.contains(name); },
        toggleClass(name: string, active: boolean) { this.classList.toggle(name, active); },
        setCssStyles(styles: object) { Object.assign(this.style, styles); },
        createSpan(options: object) { return this.createEl('span', options); },
        createEl(tag: string, options: { cls?: string; text?: string; attr?: Record<string, string> } = {}) {
            const node = this.ownerDocument.createElement(tag);
            node.className = options.cls ?? '';
            node.textContent = options.text ?? '';
            for (const [key, value] of Object.entries(options.attr ?? {})) node.setAttribute(key, value);
            this.appendChild(node);
            return node;
        },
        createDiv(options: object) { return this.createEl('div', options); },
    });
    i18n.setLanguage('ru');
});
afterEach(() => document.body.replaceChildren());

describe('repeat tracking controls', () => {
    it.each(['anime', 'movie', 'series', 'manga'] as const)('edits %s repeats in its tracking location without changing the model', type => {
        document.body.innerHTML = '<section class="lorebase-editmode-status-rating"></section><section class="lorebase-editmode-anime-parts"><div data-role="part-repeat-tracking"></div></section><details class="lorebase-editmode-advanced"><summary>Дополнительно</summary><div class="lorebase-editmode-meta-row"></div></details>';
        const item = { type, repeatCount: 0 } as MediaItem;
        let value = 0;
        renderRepeatTracking(document.body, item, 0, next => value = next);
        const composition = type === 'anime' || type === 'series';
        expect(document.querySelector('[data-role="part-repeat-tracking"] input') !== null).toBe(composition);
        expect(document.querySelector('.lorebase-editmode-advanced input') !== null).toBe(!composition);
        expect(document.querySelector('.lorebase-editmode-status-rating input')).toBeNull();
        expect(document.querySelector<HTMLDetailsElement>('.lorebase-editmode-advanced')!.open).toBe(false);
        const input = document.querySelector<HTMLInputElement>('.lorebase-repeat-pill-input')!;
        input.value = '3'; input.dispatchEvent(new Event('input'));
        expect(value).toBe(3);
        input.value = '-3'; input.dispatchEvent(new Event('input')); input.dispatchEvent(new Event('blur'));
        expect(value).toBe(0);
        expect(input.value).toBe('0');
        expect(item.repeatCount).toBe(0);
        expect(document.querySelectorAll('button')).toHaveLength(0);
    });
    it.each(['game', 'book', 'music'] as const)('does not add standalone controls for %s', type => {
        document.body.innerHTML = '<details class="lorebase-editmode-advanced"></details>';
        renderRepeatTracking(document.body, { type } as MediaItem, 0, () => {});
        expect(document.querySelector('input')).toBeNull();
    });
});

describe('platform chip playthrough tracking', () => {
    it('allows multiselect, independent repeat counts and deselection without losing counts', () => {
        let entries: PlatformPlaythrough[] = [];
        const original = entries;
        const render = (): void => renderGamePlatformChips(document.body, ['PC', 'PS5'], entries, {
            family: () => 'pc', icon: () => 'monitor', onRemove: () => {},
            onChange: (next, refresh) => { entries = next; if (refresh) render(); },
        });
        const select = (name: string): void => document.querySelector<HTMLButtonElement>(
            'button[aria-label="Играл на: ' + name + '"]')!.click();
        render(); select('PC'); select('PS5');
        expect(entries.filter(entry => entry.selected).map(entry => entry.platform)).toEqual(['PC', 'PS5']);
        expect(document.querySelector('details')).toBeNull();
        const pc = document.querySelector<HTMLInputElement>('input[aria-label="PC: Перепрохождения"]')!;
        const ps = document.querySelector<HTMLInputElement>('input[aria-label="PS5: Перепрохождения"]')!;
        pc.value = '2'; pc.dispatchEvent(new Event('input'));
        ps.value = '1'; ps.dispatchEvent(new Event('input'));
        expect(entries.map(entry => entry.repeatCount)).toEqual([2, 1]);
        expect(document.activeElement).not.toBeNull();
        select('PC');
        expect(entries.find(entry => entry.platform === 'PC')).toMatchObject({ selected: false, repeatCount: 2 });
        select('PC');
        expect(entries.find(entry => entry.platform === 'PC')).toMatchObject({ selected: true, repeatCount: 2 });
        expect(original).toEqual([]);
    });
    it('keeps every platform available with full names and selected repeat counts', () => {
        const platforms = ['PC (Microsoft Windows)', 'PS5', 'Xbox', 'Nintendo Switch 2', 'Mac', 'Linux', 'Deck'];
        let entries = [{ platform: 'Deck', selected: true, repeatCount: 3 }];
        const render = () => renderGamePlatformChips(document.body, platforms, entries, {
            family: () => 'pc', icon: () => 'monitor', onRemove: () => {}, onChange: next => { entries = next; render(); },
        });
        render();
        expect(document.querySelectorAll('.lorebase-platform-choices .lorebase-platform-choice')).toHaveLength(7);
        expect(document.querySelector('.lorebase-platform-more')).toBeNull();
        expect(document.querySelector('button[aria-label="Играл на: PC (Microsoft Windows)"]')!.textContent).toContain('PC (Microsoft Windows)');
        expect(document.querySelector<HTMLInputElement>('.lorebase-repeat-pill-input')!.value).toBe('3');
        const list = document.querySelector<HTMLElement>('.lorebase-platform-choices')!;
        list.scrollTop = 80;
        document.querySelector<HTMLButtonElement>('button[aria-label="Играл на: PS5"]')!.click();
        expect(document.querySelector<HTMLElement>('.lorebase-platform-choices')!.scrollTop).toBe(80);
        expect(entries.find(entry => entry.platform === 'PS5')?.selected).toBe(true);
        expect(entries.find(entry => entry.platform === 'Deck')?.repeatCount).toBe(3);
    });
    it('keeps a personally selected platform when provider availability changes', () => {
        const entries = [{ platform: 'Steam Deck', selected: true, repeatCount: 3 }];
        renderGamePlatformChips(document.body, ['PS5'], entries, {
            family: () => 'pc', icon: () => 'monitor', onRemove: () => {}, onChange: () => {},
        });
        expect(document.querySelector('button[aria-label="Играл на: Steam Deck"]')?.getAttribute('aria-pressed')).toBe('true');
        expect(document.querySelector<HTMLInputElement>('.lorebase-repeat-pill-input')?.value).toBe('3');
    });
});
