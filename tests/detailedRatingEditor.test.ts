import { installStatisticsDom } from './helpers/statisticsDom';
// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DetailedRatingEditor } from '../src/modals/DetailedRatingEditor';
import { bindTitlePartRating } from '../src/components/TitlePartEditor';
import { i18n } from '../src/localization';
import { EditModal } from '../src/modals/EditModal';
import { AnimeEditModal } from '../src/modals/AnimeEditModal';
import { VideoEditModal } from '../src/modals/VideoEditModal';
import { ReadingEditModal } from '../src/modals/ReadingEditModal';

beforeAll(() => {
    installStatisticsDom();
    Object.assign(HTMLElement.prototype, {
        empty() { this.replaceChildren(); },
        toggleClass(name: string, active: boolean) { this.classList.toggle(name, active); },
        createEl(tag: string, options: { cls?: string; text?: string; attr?: Record<string, string> } = {}) {
            const node = this.ownerDocument.createElement(tag);
            node.className = options.cls ?? '';
            node.textContent = options.text ?? '';
            for (const [key, value] of Object.entries(options.attr ?? {})) node.setAttribute(key, value);
            this.appendChild(node);
            return node;
        },
        createDiv(options: object) { return this.createEl('div', options); },
        createSpan(options: object) { return this.createEl('span', options); },
    });
    i18n.setLanguage('ru');
});
afterEach(() => document.body.replaceChildren());
const scale = { mode: 'custom', max: 10, step: 0.5, display: 'number' } as const;
function open(parent: HTMLElement) {
    const details = parent.querySelector('details')!;
    details.open = true;
    details.dispatchEvent(new Event('toggle'));
}

describe('detailed rating disclosure', () => {
    it.each(['themed', 'seasonal', 'holiday'] as const)('keeps anime and series part ratings as stars with the %s preset', classicPreset => {
        for (const media of ['anime', 'series'] as const) {
            document.body.replaceChildren();
            const host = document.body.createDiv({ attr: { 'data-role': 'part-rating' } });
            const part = { userRating: 3 };
            bindTitlePartRating(document.body, { ...scale, mode: 'classic', classicPreset }, media, () => part);
            const stars = [...host.querySelectorAll<HTMLButtonElement>('.lorebase-editmode-dlc-star')];
            expect(stars).toHaveLength(5);
            expect(stars.every(star => star.textContent === '★')).toBe(true);
            stars[3].click(); expect(part.userRating).toBe(4);
        }
    });
    it.each([EditModal, AnimeEditModal, VideoEditModal, ReadingEditModal])('%s keeps criterion stars independent when the overall rating updates', Modal => {
        const overall = document.createElement('button');
        overall.className = 'lorebase-editmode-star'; overall.dataset.rating = '3';
        document.body.appendChild(overall);
        const editor = new DetailedRatingEditor([{ name: 'Сюжет', value: 8.5 }], 'game', scale);
        editor.mount(document.body); open(document.body);
        const modal = Object.assign(Object.create(Modal.prototype), {
            ratingSettings: scale, selectedRating: 4, item: { type: 'series' },
            qs: (root: HTMLElement, selector: string) => root.querySelector(selector),
            setText: (root: HTMLElement, selector: string, text: string) => { const el = root.querySelector(selector); if (el) el.textContent = text; },
        });
        modal.updateRatingUI(document.body);
        expect(overall.classList.contains('is-active')).toBe(true);
        expect(document.querySelector('.lorebase-criterion-star[data-rating="9"]')?.classList.contains('is-half')).toBe(true);
        document.querySelector<HTMLButtonElement>('.lorebase-criterion-star[data-rating="6"]')!.click();
        expect(modal.selectedRating).toBe(4);
        expect(editor.getValue()?.[0].value).toBe(6);
    });
    it('starts collapsed and lets a user score, rename, add and remove criteria in a separate draft', () => {
        const initial = [{ name: 'Сюжет', value: 8 }];
        const editor = new DetailedRatingEditor(initial, 'anime', scale);
        editor.mount(document.body);
        expect(document.querySelector('details')?.open).toBe(false);
        open(document.body);
        const row = document.querySelector<HTMLElement>('.lorebase-detailed-rating-row')!;
        expect(row.querySelector('select')).toBeNull();
        expect(row.querySelectorAll('.lorebase-criterion-star')).toHaveLength(10);
        const star = row.querySelector<HTMLButtonElement>('[data-rating="8"]')!;
        star.getBoundingClientRect = () => ({ left: 0, width: 30 } as DOMRect);
        star.dispatchEvent(new MouseEvent('click', { detail: 1, clientX: 4 }));
        expect(star.classList.contains('is-half')).toBe(true);
        expect(row.querySelector('.lorebase-criterion-value')?.textContent).toBe('7.5 / 10');
        const name = row.querySelector('input')!;
        name.value = 'История'; name.dispatchEvent(new Event('input'));
        const input = document.querySelector<HTMLInputElement>('.lorebase-detailed-rating-add input')!;
        input.value = 'Музыка';
        document.querySelector<HTMLButtonElement>('.lorebase-detailed-rating-add button')!.click();
        expect(editor.getValue()).toEqual([{ name: 'История', value: 7.5 }, { name: 'Музыка', value: null }]);
        expect(initial).toEqual([{ name: 'Сюжет', value: 8 }]);
        document.querySelector<HTMLButtonElement>('.lorebase-criterion-actions button:last-child')!.click();
        expect(editor.getValue()).toEqual([{ name: 'Музыка', value: null }]);
    });
    it('uses whole scores from the right half, keyboard clicks and classic settings; clears one criterion independently', () => {
        const editor = new DetailedRatingEditor([{ name: 'Сюжет', value: 7.5 }, { name: 'Музыка', value: 9 }], 'game', scale);
        editor.mount(document.body); open(document.body);
        const star = document.querySelector<HTMLButtonElement>('[data-rating="8"]')!;
        star.getBoundingClientRect = () => ({ left: 0, width: 30 } as DOMRect);
        star.dispatchEvent(new MouseEvent('click', { detail: 1, clientX: 26 }));
        expect(editor.getValue()?.[0].value).toBe(8);
        document.querySelector<HTMLButtonElement>('[data-rating="6"]')!.click();
        expect(editor.getValue()?.[0].value).toBe(6);
        document.querySelector<HTMLButtonElement>('.lorebase-criterion-actions button')!.click();
        expect(editor.getValue()).toEqual([{ name: 'Сюжет', value: null }, { name: 'Музыка', value: 9 }]);
        document.body.replaceChildren();
        const classic = new DetailedRatingEditor([{ name: 'Сюжет', value: null }], 'book', { ...scale, mode: 'classic' });
        classic.mount(document.body); open(document.body);
        expect(document.querySelectorAll('.lorebase-criterion-star')).toHaveLength(5);
    });
    it('edits precise personal and criterion scores independently and keeps whole-star selection', () => {
        const settings = { ...scale, step: 0.1 } as const;
        const root = document.body;
        const stars = root.createDiv({ attr: { 'data-role': 'stars' } });
        const readout = root.createDiv({ attr: { 'data-role': 'rating-value' } });
        const criteria = root.createDiv({ cls: 'lorebase-editmode-rating-wrap' });
        const editor = new DetailedRatingEditor([{ name: 'Сюжет', value: 8.5 }], 'game', settings);
        const modal = Object.assign(Object.create(EditModal.prototype), {
            ratingSettings: settings, selectedRating: 7.5, detailedRatingEditor: editor,
            qs: (host: HTMLElement, selector: string) => host.querySelector(selector),
        });
        modal.bindRating(root);

        const score = readout.querySelector('input')!;
        score.focus();
        score.value = '7,3';
        score.dispatchEvent(new Event('input'));
        expect(modal.selectedRating).toBe(7.3);
        expect(stars.querySelector('[data-rating="8"]')?.classList.contains('is-half')).toBe(true);
        score.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
        expect(modal.selectedRating).toBe(7.4);
        expect(score.value).toBe('7,4');
        score.value = '7,45';
        score.dispatchEvent(new Event('input'));
        expect(score.validity.valid).toBe(false);
        expect(modal.selectedRating).toBe(7.4);

        open(criteria);
        const criterion = criteria.querySelector<HTMLInputElement>('.lorebase-rating-tenths-input')!;
        criterion.value = '8.2';
        criterion.dispatchEvent(new Event('input'));
        expect(editor.getValue()).toEqual([{ name: 'Сюжет', value: 8.2 }]);
        expect(modal.selectedRating).toBe(7.4);
        stars.querySelector<HTMLButtonElement>('[data-rating="6"]')!.click();
        expect(modal.selectedRating).toBe(6);
        expect(score.value).toBe('6');
        expect(editor.getValue()?.[0].value).toBe(8.2);
    });

    it.each(['themed', 'seasonal', 'holiday'] as const)('keeps criterion stars with the %s personal preset', (classicPreset) => {
        const editor = new DetailedRatingEditor([{ name: 'Сюжет', value: 3 }], 'manga', {
            ...scale, mode: 'classic', classicPreset,
        });
        editor.mount(document.body);
        open(document.body);
        const stars = [...document.querySelectorAll<HTMLButtonElement>('.lorebase-criterion-star')];
        expect(stars).toHaveLength(5);
        expect(stars.every(button => button.textContent === '★')).toBe(true);
        expect(stars.every(button => !button.classList.contains('is-themed-rating'))).toBe(true);
        stars[3].click();
        expect(editor.getValue()).toEqual([{ name: 'Сюжет', value: 4 }]);
    });

    it('initializes defaults only when opened and preserves intentionally removed defaults', () => {
        const editor = new DetailedRatingEditor(undefined, 'game', scale);
        editor.mount(document.body);
        expect(editor.getValue()).toBeUndefined();
        open(document.body);
        expect(editor.getValue()?.map(row => row.name)).toEqual(['Персонажи', 'Сюжет', 'Атмосфера']);
        const empty = new DetailedRatingEditor([], 'game', scale);
        document.body.replaceChildren(); empty.mount(document.body); open(document.body);
        expect(empty.getValue()).toEqual([]);
    });
});
