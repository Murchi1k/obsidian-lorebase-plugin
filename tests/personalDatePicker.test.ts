// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HierarchicalDatePicker } from '../src/modals/HierarchicalDatePicker';
import { CompletionDateModal } from '../src/modals/CompletionDateModal';
import { i18n, t } from '../src/localization';
import { personalDateText as text } from '../src/localization/personalDates';
import { installStatisticsDom } from './helpers/statisticsDom';
import { createMockApp } from './helpers/testHelpers';
beforeEach(() => { installStatisticsDom(); i18n.setLanguage('ru'); });
afterEach(() => document.body.replaceChildren());
function fixture(initial = '', partial = true) {
    const root = document.body.createDiv(); const input = root.createEl('input'), trigger = root.createEl('button');
    let value = initial;
    const change = vi.fn((next: string) => { value = next; });
    const picker = new HierarchicalDatePicker(input, trigger, () => value, change, partial ? { allowPartial: true, allowUnknown: true } : {});
    picker.syncInput();
    const button = (name: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === name)!;
    return { picker, input, trigger, change, button, get: () => value };
}
describe('completion date picker', () => {
    it.each(['2019', '2019-06'])('round-trips typed %s without a guessed day', value => {
        const f = fixture(); f.input.value = value;
        f.input.dispatchEvent(new Event('input')); expect(f.picker.commit()).toBe(true);
        expect(f.get()).toBe(value); expect(f.input.value).toBe(value); f.picker.destroy();
    });
    it('offers explicit unknown and retains it on blur/commit', () => {
        const f = fixture('2019-06-18'); f.trigger.click(); f.button(text('unknown')).click();
        expect(f.get()).toBe('unknown'); expect(f.input.value).toBe('Дата неизвестна');
        expect(f.picker.commit()).toBe(true); expect(f.get()).toBe('unknown'); f.picker.destroy();
    });
    it('selects a year from the year grid without entering a month or day', () => {
        const f = fixture('2019-06-18'); f.trigger.click(); f.button(text('year')).click();
        f.button('2019').click(); expect(f.get()).toBe('2019'); expect(f.input.value).toBe('2019');
        expect(document.querySelector('.lorebase-date-picker-popover')).toBeNull(); f.picker.destroy();
    });
    it('can later replace an unknown date by a real exact date', () => {
        const f = fixture('unknown'); f.input.value = '18.06.2019';
        expect(f.picker.commit()).toBe(true); expect(f.get()).toBe('2019-06-18'); f.picker.destroy();
    });
    it('does not change the precision rules of release-date pickers', () => {
        const f = fixture('', false); f.input.value = '2019'; expect(f.picker.commit()).toBe(false);
        f.trigger.click(); expect(f.button(text('unknown'))).toBeUndefined(); expect(f.button(text('year'))).toBeUndefined(); f.picker.destroy();
    });
    it.each(['2019-13', '2019-02-29', 'not a date'])('rejects invalid %s without overwriting the draft', value => {
        const f = fixture('2019'); f.input.value = value; expect(f.picker.commit()).toBe(false); expect(f.get()).toBe('2019'); f.picker.destroy();
    });
});
describe('quick completion date dialog', () => {
    function mount() {
        const modal = new CompletionDateModal(createMockApp({}), 'Old favorite');
        modal.modalEl = document.body.createDiv(); modal.contentEl = modal.modalEl.createDiv();
        modal.open = vi.fn(() => modal.onOpen()); modal.close = vi.fn(() => modal.onClose());
        const result = modal.openAndGetValue(); return { modal, result };
    }
    it('saves only the entered year', async () => {
        const f = mount(); const input = f.modal.contentEl.querySelector('input')!;
        input.value = '2019'; input.dispatchEvent(new Event('input'));
        [...f.modal.contentEl.querySelectorAll('button')].find(button => button.textContent === t('editSave'))!.click();
        expect(await f.result).toBe('2019');
    });
    it('returns explicit unknown or cancellation, never today by default', async () => {
        const a = mount(); [...a.modal.contentEl.querySelectorAll('button')].find(button => button.textContent === text('unknown'))!.click();
        expect(await a.result).toBe('unknown');
        const b = mount(); b.modal.close(); expect(await b.result).toBeNull();
    });
});
