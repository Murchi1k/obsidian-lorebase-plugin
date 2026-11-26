// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReadingCycleEditor } from '../src/components/ReadingCycleEditor';
import { ReadingEditModal } from '../src/modals/ReadingEditModal';
import type { ReadingItem } from '../src/types';
import { installStatisticsDom } from './helpers/statisticsDom';
import { createMockApp } from './helpers/testHelpers';
import { i18n } from '../src/localization';
import { DEFAULT_SETTINGS } from '../src/constants';

function book(name: string, type: 'book' | 'manga' = 'book'): ReadingItem {
    return { type, filePath: name + '.md', displayName: name, authors: [], artists: [], genres: [], tags: [], status: 'planned',
        userRating: null, favorite: false, isAdult: false, imageUrl: '', summary: '', description: '', year: 2020, workType: '',
        pageCurrent: 0, pageTotal: 100, chapterCurrent: 0, chapterTotal: 20, volumeCurrent: 1, volumeTotal: 4 } as ReadingItem;
}
beforeEach(() => {
    installStatisticsDom(); i18n.setLanguage('en');
    vi.stubGlobal('createFragment', () => document.createDocumentFragment());
    vi.stubGlobal('createEl', (tag: string) => document.createElement(tag));
    vi.stubGlobal('createDiv', () => document.createElement('div'));
    vi.stubGlobal('createSpan', () => document.createElement('span'));
    Object.assign(HTMLElement.prototype, { setAttr(name: string, value: string) { this.setAttribute(name, value); }, setText(value: string) { this.textContent = value; } });
});
afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('reading cycle editor', () => {
    it.each(['book', 'manga'] as const)('updates the %s progress rings from the selected note without changing another note', type => {
        const a = book('A', type), b = book('B', type);
        a.readingCycle = b.readingCycle = ['A.md', 'B.md'];
        const editor = new ReadingCycleEditor(a, { items: [a, b], save: vi.fn() }, DEFAULT_SETTINGS.ratingScale, () => a, vi.fn(), vi.fn());
        editor.mount(document.body);
        const change = (key: string, value: string) => {
            const input = document.querySelector<HTMLInputElement>('[data-field="' + key + '"]')!;
            input.value = value; input.dispatchEvent(new Event('change'));
        };
        const kind = type === 'book' ? 'pages' : 'chapters';
        const key = type === 'book' ? 'pageCurrent' : 'chapterCurrent';
        const totalKey = type === 'book' ? 'pageTotal' : 'chapterTotal';
        const ring = () => document.querySelector('[data-progress-kind="' + kind + '"] [role="progressbar"]')!;
        change(key, type === 'book' ? '45' : '9');
        expect(ring().getAttribute('aria-valuenow')).toBe('45');
        change(totalKey, '0');
        expect(ring().hasAttribute('aria-valuenow')).toBe(false);
        expect(ring().getAttribute('aria-valuetext')).toBe('Total unknown');
        expect(ring().textContent).toBe('—');
        change(totalKey, type === 'book' ? '100' : '20');
        change(key, '200');
        expect(ring().getAttribute('aria-valuenow')).toBe('100');
        expect(editor.getChanges()[0].updates.status).toBe('completed');
        expect(a.chapterCurrent).toBe(0);
        expect(b.chapterCurrent).toBe(0);
    });
    it('keeps decimal entry and rating adjustments inside the selected cycle entry', () => {
        const a = book('A'), b = book('B');
        a.readingCycle = b.readingCycle = ['A.md', 'B.md'];
        const editor = new ReadingCycleEditor(a, { items: [a, b], save: vi.fn() },
            { ...DEFAULT_SETTINGS.ratingScale, mode: 'custom', max: 10, step: 0.1 }, () => a, vi.fn(), vi.fn());
        editor.mount(document.body);
        const input = document.querySelector<HTMLInputElement>('.lorebase-reading-cycle-rating input')!;
        input.value = '7,3'; input.dispatchEvent(new Event('input'));
        expect(input.checkValidity()).toBe(true);
        expect(editor.getChanges()[0].updates.userRating).toBe(7.3);
        const buttons = document.querySelectorAll<HTMLButtonElement>('.lorebase-game-dlc-score > button');
        buttons[0].click();
        expect(editor.getChanges()[0].updates.userRating).toBe(7.2);
        buttons[1].click();
        expect(editor.getChanges()[0].updates.userRating).toBe(7.3);
        expect(a.userRating).toBeNull(); expect(b.userRating).toBeNull();
    });
    it('orders only the other works while preserving the open work in the stored shared cycle', () => {
        const a = book('A'), b = book('B'), c = book('C');
        for (const item of [a, b, c]) item.readingCycle = ['A.md', 'B.md', 'C.md'];
        const editor = new ReadingCycleEditor(a, { items: [a, b, c], save: vi.fn() }, DEFAULT_SETTINGS.ratingScale, () => a, vi.fn(), vi.fn());
        editor.mount(document.body);
        expect([...document.querySelectorAll('[role="tab"]')].map(tab => tab.textContent)).toEqual(['B', 'C']);
        expect(document.querySelector<HTMLButtonElement>('[aria-label="Move earlier"]')!.disabled).toBe(true);
        document.querySelector<HTMLButtonElement>('[aria-label="Move later"]')!.click();
        expect([...document.querySelectorAll('[role="tab"]')].map(tab => tab.textContent)).toEqual(['C', 'B']);
        expect(editor.getChanges().find(change => change.item.filePath === 'A.md')!.updates.readingCycle).toEqual(['A.md', 'C.md', 'B.md']);
    });
    it('keeps progress for each manga volume when switching volumes in the cycle', () => {
        const a = book('A', 'manga'), b = book('B', 'manga');
        a.readingCycle = b.readingCycle = ['A.md', 'B.md'];
        Object.assign(b, { activePartId: 'one', parts: [
            { id: 'one', title: 'One', volumeNumber: 1, chapterCurrent: 0, chapterTotal: 10, status: 'planned' },
            { id: 'two', title: 'Two', volumeNumber: 2, chapterCurrent: 2, chapterTotal: 12, status: 'watching' },
        ] });
        const editor = new ReadingCycleEditor(a, { items: [a, b], save: vi.fn() }, DEFAULT_SETTINGS.ratingScale, () => a, vi.fn(), vi.fn());
        editor.mount(document.body);
        document.querySelector<HTMLButtonElement>('[role="tab"][data-path="B.md"]')!.click();
        const change = (key: string, value: string) => {
            const input = document.querySelector<HTMLInputElement>(`[data-field="${key}"]`)!;
            input.value = value; input.dispatchEvent(new Event('change'));
        };
        change('chapterCurrent', '5'); change('volumeCurrent', '2');
        expect(document.querySelector<HTMLInputElement>('[data-field="chapterCurrent"]')!.value).toBe('2');
        change('chapterCurrent', '3');
        const saved = editor.getChanges()[0].updates;
        expect(saved.parts?.map(part => part.chapterCurrent)).toEqual([5, 3]);
        expect((b as any).parts.map((part: any) => part.chapterCurrent)).toEqual([0, 2]);
    });
    it('stages progress and star ratings of another existing note, without changing the original', () => {
        const a = book('Metro 2033'), b = book('Metro 2034');
        a.readingCycle = b.readingCycle = [a.filePath, b.filePath];
        const editor = new ReadingCycleEditor(a, { items: [a, b], save: vi.fn() }, { ...DEFAULT_SETTINGS.ratingScale, classicPreset: 'holiday' }, () => a, vi.fn(), vi.fn());
        editor.mount(document.body);
        expect(document.querySelector('[role="tab"][data-path="Metro 2033.md"]')).toBeNull();
        expect(document.querySelector('.lorebase-reading-cycle-identity strong')?.textContent).toBe('Metro 2034');
        document.querySelector<HTMLButtonElement>('[role="tab"][data-path="Metro 2034.md"]')!.click();
        const progress = document.querySelector<HTMLInputElement>('[data-field="pageCurrent"]')!;
        progress.value = '45'; progress.dispatchEvent(new Event('change'));
        const stars = [...document.querySelectorAll<HTMLButtonElement>('.lorebase-editmode-dlc-star')];
        expect(stars.map(star => star.textContent)).toEqual(['★', '★', '★', '★', '★']);
        stars[3].click();
        expect(editor.getChanges()).toEqual([{ item: b, updates: { pageCurrent: 45, userRating: 4, readingCycle: a.readingCycle } }]);
        expect((b as any).pageCurrent).toBe(0); expect(b.userRating).toBeNull();
    });

    it.each(['book'] as const)('saves the %s group from the main editor while keeping notes and progress independent', async type => {
        const a = book('First', type), b = book('Second', type), c = book('Third', type);
        const saveOthers = vi.fn(async () => {}), saveCurrent = vi.fn(async () => {});
        const modal = new ReadingEditModal(createMockApp({}), a, saveCurrent, vi.fn(), undefined, [], [], undefined, undefined,
            DEFAULT_SETTINGS.ratingScale, undefined, true, { items: [a, b, c], save: saveOthers });
        modal.modalEl = document.body.createDiv(); modal.contentEl = modal.modalEl.createDiv();
        vi.spyOn(modal, 'close').mockImplementation(() => { modal.onClose(); modal.modalEl.remove(); });
        modal.onOpen();
        const root = modal.contentEl;
        const panels = root.querySelector('.lorebase-editmode-column-center')!;
        expect([...panels.children].indexOf(root.querySelector('.lorebase-editmode-status-rating')!))
            .toBeLessThan([...panels.children].indexOf(root.querySelector('.lorebase-editmode-reading-progress')!));
        const add = (path: string) => {
            root.querySelector<HTMLButtonElement>('.lorebase-reading-cycle-add')!.click();
            root.querySelector<HTMLButtonElement>(`.lorebase-reading-cycle-candidates [data-path="${path}"]`)!.click();
        };
        add(b.filePath);
        const progress = root.querySelector<HTMLInputElement>(`[data-role="reading-cycle"] [data-field="${type === 'book' ? 'pageCurrent' : 'chapterCurrent'}"]`)!;
        progress.value = '12'; progress.dispatchEvent(new Event('change'));
        add(c.filePath);
        expect(saveOthers).not.toHaveBeenCalled(); expect(saveCurrent).not.toHaveBeenCalled();
        await modal.saveBeforeSourceRefresh();
        const changes = saveOthers.mock.calls[0][0];
        expect(changes).toHaveLength(2);
        expect(changes.find((change: any) => change.item.filePath === b.filePath).updates)
            .toMatchObject({ [type === 'book' ? 'pageCurrent' : 'chapterCurrent']: 12, readingCycle: ['First.md', 'Second.md', 'Third.md'] });
        expect(saveCurrent).toHaveBeenCalledWith(expect.objectContaining({ readingCycle: ['First.md', 'Second.md', 'Third.md'], [type === 'book' ? 'pageCurrent' : 'chapterCurrent']: 0 }));
        expect(b.chapterCurrent).toBe(0); expect(c.chapterCurrent).toBe(0);
    });

    it('omits CYCLE for manga and preserves an existing saved cycle when editing progress', async () => {
        const manga = book('Manga', 'manga');
        manga.readingCycle = ['Manga.md', 'Other.md'];
        const save = vi.fn(async () => {});
        const modal = new ReadingEditModal(createMockApp({}), manga, save, vi.fn(), undefined, [], [], undefined, undefined,
            DEFAULT_SETTINGS.ratingScale, undefined, true, { items: [manga], save: vi.fn(async () => {}) });
        modal.modalEl = document.body.createDiv(); modal.contentEl = modal.modalEl.createDiv();
        modal.onOpen();
        expect(modal.contentEl.querySelector('[data-role="reading-cycle"]')).toBeNull();
        expect(modal.contentEl.querySelector('.lorebase-editmode-reading-progress')).not.toBeNull();
        await modal.saveBeforeSourceRefresh();
        expect(save).toHaveBeenCalled();
        expect(save.mock.calls[0][0]).not.toHaveProperty('readingCycle');
        expect(manga.readingCycle).toEqual(['Manga.md', 'Other.md']);
        modal.onClose();
    });
});
