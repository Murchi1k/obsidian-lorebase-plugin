// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AnimePartsReviewModal } from '../src/modals/AnimePartsReviewModal';
import { i18n } from '../src/localization';
import { createMockApp } from './helpers/testHelpers';

beforeAll(() => {
    Object.assign(HTMLElement.prototype, {
        empty() { this.replaceChildren(); },
        addClass(...names: string[]) { this.classList.add(...names); },
        removeClass(...names: string[]) { this.classList.remove(...names); },
        toggleClass(name: string, active: boolean) { this.classList.toggle(name, active); },
        createEl(tag: string, options: { cls?: string; text?: string; attr?: Record<string, string> } = {}) {
            const node = this.ownerDocument.createElement(tag);
            node.className = options.cls ?? '';
            if (options.text) node.textContent = options.text;
            for (const [name, value] of Object.entries(options.attr ?? {})) node.setAttribute(name, value);
            this.appendChild(node);
            return node;
        },
        createDiv(options: object) { return this.createEl('div', options); },
        createSpan(options: object) { return this.createEl('span', options); },
    });
    i18n.setLanguage('ru');
});
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

const first = { id: 'first', title: 'Cyberpunk: Edgerunners', kind: 'ona', seasonNumber: null, episodeCurrent: 4, episodeTotal: 10, status: 'watching', poster: 'https://cdn.example/local.jpg', episodeDuration: 26, year: 2022 };
const second = { id: 'second', title: 'Cyberpunk: Edgerunners 2', kind: 'ona', seasonNumber: null, episodeCurrent: 3, episodeTotal: 10, status: 'watching', poster: 'https://cdn.example/second.jpg', episodeDuration: 28, year: 2026 };
const providers = [{ ...first, title: 'Provider title', episodeCurrent: 0, status: 'planned', poster: 'https://cdn.example/remote.jpg', episodeDuration: 24 }, { ...second, episodeCurrent: 0, status: 'planned' }];

function fixture(options: any = {}) {
    const input = { title: 'Состав из провайдера', subtitle: 'Cyberpunk: Edgerunners 2', providerParts: providers, existingParts: [first, second], activePartId: 'second', status: 'watching', markNewParts: true, ...options };
    const modal = new AnimePartsReviewModal(createMockApp({}), input) as any;
    const shell = document.body.createDiv({ cls: 'modal' });
    const root = shell.createDiv({ cls: 'modal-content' });
    modal.modalEl = shell; modal.contentEl = root;
    vi.spyOn(modal, 'close').mockImplementation(() => modal.onClose());
    const result = modal.openAndGetValue();
    modal.onOpen();
    return { modal, shell, root, input, result };
}
const rows = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>('.lorebase-anime-parts-item'));
const check = (row: HTMLElement) => row.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
const active = (row: HTMLElement) => row.querySelector<HTMLInputElement>('input[type="radio"]')!;

describe('provider parts review', () => {
    it('shows compact summaries and existing selection without duplicating the part editor', () => {
        const { root } = fixture();
        const items = rows(root);
        expect(items).toHaveLength(2);
        expect(root.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
        expect(root.querySelectorAll('input[type="radio"]')).toHaveLength(2);
        expect(root.querySelector('select, input[type="number"], input[type="text"], .lorebase-anime-parts-editor')).toBeNull();
        expect(items[0].textContent).toContain('Cyberpunk: Edgerunners');
        expect(items[0].textContent).toContain('ONA · 2022 · 26 мин');
        expect(items[0].textContent).toContain('4 / 10 серий');
        expect(items[0].textContent).toContain('Смотрю');
        expect(items[0].querySelector('img')?.src).toBe(first.poster);
        expect(check(items[0]).checked).toBe(true);
        expect(active(items[1]).checked).toBe(true);
        expect(root.querySelector('[data-role="selected-count"]')?.textContent).toBe('Выбрано: 2 / 2');
        expect(root.querySelector('input[type="search"]')).toBeNull();
    });
    it('selects a current part directly and reconciles it when that part is excluded', () => {
        const { root, modal } = fixture();
        const items = rows(root);
        active(items[0]).click();
        expect(modal.activePartId).toBe('first');
        check(items[0]).click();
        expect(modal.activePartId).toBe('second');
        expect(active(items[0]).disabled).toBe(true);
        check(items[1]).click();
        expect(modal.activePartId).toBeNull();
        expect(root.querySelector<HTMLButtonElement>('[data-action="apply"]')?.disabled).toBe(true);
        check(items[0]).click();
        expect(modal.activePartId).toBe('first');
        expect(active(items[0]).checked).toBe(true);
        expect(root.querySelector<HTMLButtonElement>('[data-action="apply"]')?.disabled).toBe(false);
        expect(items[0]).toBe(rows(root)[0]);
    });
    it('selects or clears all parts without replacing the rows', () => {
        const { root } = fixture();
        const items = rows(root);
        const toggle = root.querySelector<HTMLButtonElement>('[data-action="toggle-all"]')!;
        expect(toggle.textContent).toBe('Снять выбор');
        toggle.click();
        expect(items.every(item => !check(item).checked && active(item).disabled)).toBe(true);
        expect(root.querySelector('[data-role="selected-count"]')?.textContent).toBe('Выбрано: 0 / 2');
        toggle.click();
        expect(items.every(item => check(item).checked)).toBe(true);
        expect(active(items[0]).checked).toBe(true);
        expect(rows(root)[0]).toBe(items[0]);
    });
    it('marks newly found parts, retains local parts, and returns existing metadata unchanged', async () => {
        const local = { ...first, id: 'manual', title: 'Моя часть', status: 'paused', seasonNumber: 5 };
        const saved = { ...first, userRating: 8.5 };
        const { root, result } = fixture({ existingParts: [saved, local], activePartId: 'manual' });
        const items = rows(root);
        expect(items[1].querySelector('[data-role="part-origin"]')?.textContent).toBe('Новое');
        expect(check(items[1]).checked).toBe(false);
        expect(items[2].querySelector('[data-role="part-origin"]')?.textContent).toBe('Своя часть');
        expect(active(items[2]).checked).toBe(true);
        check(items[1]).click();
        root.querySelector<HTMLButtonElement>('[data-action="apply"]')!.click();
        const value = await result;
        expect(value.parts).toEqual([{ ...saved, alternativeTitles: ['Provider title'] }, { ...providers[1], alternativeTitles: [] }, local]);
        expect(value.activePartId).toBe('manual');
        expect(value.parts.every((part: any) => !('isNew' in part))).toBe(true);
        expect(first.episodeDuration).toBe(26);
        expect(providers[0].episodeCurrent).toBe(0);
    });
    it('filters large lists without changing hidden selections or stealing input focus', () => {
        const parts = Array.from({ length: 9 }, (_, index) => ({ ...first, id: String(index), title: 'История ' + index }));
        const { root } = fixture({ providerParts: parts, existingParts: [], activePartId: null });
        const items = rows(root);
        check(items[8]).click();
        const search = root.querySelector<HTMLInputElement>('input[type="search"]')!;
        search.focus(); search.value = 'история 2'; search.dispatchEvent(new Event('input'));
        expect(items.filter(item => !item.hidden)).toEqual([items[2]]);
        expect(document.activeElement).toBe(search);
        expect(root.querySelector('[data-role="selected-count"]')?.textContent).toBe('Выбрано: 8 / 9');
        search.value = 'нет совпадений'; search.dispatchEvent(new Event('input'));
        expect(root.querySelector<HTMLElement>('[data-role="empty-results"]')?.hidden).toBe(false);
        search.value = ''; search.dispatchEvent(new Event('input'));
        expect(items.every(item => !item.hidden)).toBe(true);
        expect(check(items[8]).checked).toBe(false);
    });
    it.each(['cancel', 'escape', 'close'])('returns no changes on %s', async action => {
        const { root, shell, modal, result } = fixture();
        check(rows(root)[0]).click();
        if (action === 'cancel') root.querySelector<HTMLButtonElement>('[data-action="cancel"]')!.click();
        else if (action === 'escape') shell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        else modal.close();
        expect(await result).toBeNull();
        expect(first.episodeCurrent).toBe(4);
        expect(second.episodeCurrent).toBe(3);
    });
    it('keeps apply disabled for an empty result', () => {
        const { root, modal } = fixture({ providerParts: [], existingParts: [] });
        expect(root.querySelector('[data-role="empty-results"]')?.textContent).toBe('Нет доступных частей.');
        expect(root.querySelector<HTMLButtonElement>('[data-action="apply"]')?.disabled).toBe(true);
        expect(root.querySelector<HTMLButtonElement>('[data-action="toggle-all"]')?.disabled).toBe(true);
        modal.confirm();
        expect(modal.close).not.toHaveBeenCalled();
    });
    it('returns completed only when every included part is completed', async () => {
        const completed = [{ ...first, status: 'completed', episodeCurrent: 10 }, { ...second, status: 'completed', episodeCurrent: 10 }];
        const { root, result } = fixture({ existingParts: completed, status: 'paused' });
        root.querySelector<HTMLButtonElement>('[data-action="apply"]')!.click();
        expect((await result).status).toBe('completed');
    });
    it('remembers five provider parts while retaining only the two selected parts',async()=>{
        const full=[...providers,...[3,4,5].map(n=>({...providers[0],id:'extra-'+n,title:'Extra '+n}))];
        const f=fixture({providerParts:full,catalogSource:'anilist:1:anime'});expect(f.root.textContent).not.toContain('Новое');
        f.root.querySelector<HTMLButtonElement>('[data-action="apply"]')!.click();const value=await f.result;
        expect(value.parts).toHaveLength(2);expect(Object.keys(value.partCatalog.parts)).toHaveLength(5);
        const again=fixture({providerParts:full,catalogSource:'anilist:1:anime',partCatalog:value.partCatalog});expect(again.root.textContent).not.toContain('Новое');again.modal.close();
    });

});
