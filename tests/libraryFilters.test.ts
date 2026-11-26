// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Toolbar } from '../src/components/Toolbar';
import { renderLibraryFilterChoices } from '../src/components/LibraryFilterChoices';
import { getBuiltInFieldDefinitions } from '../src/views/library/viewOptions';
import { populateFilterOptions } from '../src/services/media/libraryFieldCatalog';
import { DEFAULT_SETTINGS } from '../src/constants';
import { i18n } from '../src/localization';
import type { FieldDefinition, FilterRule, MediaItem } from '../src/types';
import * as obsidian from 'obsidian';

beforeAll(() => {
    Object.assign(globalThis, { activeDocument: document, createEl: (tag: string) => document.createElement(tag) });
    Object.assign(HTMLElement.prototype, {
        empty() { this.replaceChildren(); }, addClass(...names: string[]) { this.classList.add(...names); },
        removeClass(...names: string[]) { this.classList.remove(...names); }, hasClass(name: string) { return this.classList.contains(name); },
        toggleClass(name: string, active: boolean) { this.classList.toggle(name, active); }, setAttr(name: string, value: string) { this.setAttribute(name, value); },
        setText(value: string) { this.textContent = value; }, setCssStyles(styles: object) { Object.assign(this.style, styles); },
        createEl(tag: string, options: any = {}) {
            const element = document.createElement(tag); element.className = options.cls ?? ''; element.textContent = options.text ?? '';
            for (const [key, value] of Object.entries(options.attr ?? {})) element.setAttribute(key, String(value));
            this.append(element); return element;
        }, createDiv(options: any) { return this.createEl('div', options); }, createSpan(options: any) { return this.createEl('span', options); },
    });
});
afterEach(() => { document.body.replaceChildren(); i18n.setLanguage('en'); vi.restoreAllMocks(); });

function fixture(extraFields: FieldDefinition[] = []) {
    i18n.setLanguage('ru');
    const toolbar = Object.create(Toolbar.prototype) as any;
    const state = structuredClone(DEFAULT_SETTINGS.anime.viewState);
    const fields = populateFilterOptions(getBuiltInFieldDefinitions('anime', [], { showAdult: true, showCustom: false }),
        [{ studios: ['Madhouse', 'MAPPA'] }] as MediaItem[], []);
    fields.push(...extraFields);
    Object.assign(toolbar, { currentViewState: state, defaultViewState: structuredClone(state), savedViews: [], activeSavedViewId: null,
        fieldDefinitions: fields, currentFilter: { rules: [] }, currentMediaType: 'anime', sortOptions: [{ field: 'name', label: 'Название' }],
        callbacks: { onViewStateChange: vi.fn() }, container: document.body,
    });
    const panel = document.body.createDiv(), trigger = document.body.createEl('button');
    toolbar.renderViewPanel(panel, trigger);
    const add = (label: string) => {
        const option = [...panel.querySelectorAll<HTMLElement>('.is-filter-picker [role="option"]')].find(option => option.getAttribute('aria-label') === label);
        expect(option).toBeDefined(); option!.click();
    };
    const pickerLabels = () => [...panel.querySelectorAll<HTMLElement>('.is-filter-picker [role="option"]')].map(option => option.getAttribute('aria-label'));
    return { toolbar, panel, add, pickerLabels, trigger };
}

describe('library filter editing', () => {
    it('collapses note fields in both menus and gives the Name sort a supported icon', () => {
        const iconSpy = vi.spyOn(obsidian, 'setIcon');
        const { panel } = fixture([{ id: 'yaml:priority', label: 'priority', type: 'number', source: 'yaml', icon: 'hash', operators: ['equals'] }]);
        for (const selector of ['.is-filter-picker', '.is-sort-picker']) {
            const toggle = panel.querySelector<HTMLButtonElement>(`${selector} .lorebase-field-picker-group-toggle`)!;
            expect(toggle.getAttribute('aria-expanded')).toBe('false');
            const content = toggle.nextElementSibling as HTMLElement;
            expect(content.hidden).toBe(true);
            toggle.click();
            expect(content.hidden).toBe(false);
        }
        const nameIcon = panel.querySelector('.is-sort-picker [aria-label="Название"] .lorebase-field-picker-option-icon');
        expect(nameIcon).not.toBeNull();
        expect(iconSpy).toHaveBeenCalledWith(nameIcon, 'type');
        for (const heading of panel.querySelectorAll('.lorebase-field-picker-group-heading:not(.lorebase-field-picker-group-toggle)')) {
            expect(iconSpy.mock.calls.some(([element]) => heading.contains(element as unknown as Node))).toBe(false);
        }
    });

    it('finds exact dates by their YAML names and applies a custom grouping from search', () => {
        const { toolbar, panel } = fixture([
            { id: 'yaml:priority', label: 'priority', type: 'number', source: 'yaml', icon: 'hash', operators: [] },
        ]);
        const search = panel.querySelector<HTMLInputElement>('.is-group-picker input[type="search"]')!;
        const matching = (value: string) => {
            search.value = value;
            search.dispatchEvent(new Event('input'));
            return [...panel.querySelectorAll<HTMLButtonElement>('.is-group-picker [role="option"]')]
                .filter(option => !option.hidden);
        };
        expect(matching('started').map(option => option.getAttribute('aria-label'))).toEqual(['Дата начала']);
        expect(matching('finished').map(option => option.getAttribute('aria-label'))).toEqual(['Дата окончания']);
        expect(matching('priority')).toHaveLength(1);
        matching('priority')[0].click();
        expect(toolbar.callbacks.onViewStateChange).toHaveBeenLastCalledWith(expect.objectContaining({
            group: { mode: 'yaml:number:priority', order: 'desc' },
        }));
        expect(panel.querySelector('.is-group-picker .lorebase-settings-dropdown-label')?.textContent).toBe('priority');
    });
    it('removes an added field from the catalog, selects several studios in one rule, and restores the field on removal', () => {
        const { toolbar, panel, add, pickerLabels } = fixture();
        add('Студия');
        expect(pickerLabels()).not.toContain('Студия');
        for (const option of panel.querySelectorAll<HTMLButtonElement>('.lorebase-filter-value-option')) option.click();
        expect(toolbar.currentViewState.rules).toHaveLength(1);
        expect(toolbar.callbacks.onViewStateChange).toHaveBeenLastCalledWith(expect.objectContaining({ rules: [expect.objectContaining({ field: 'studios', value: ['Madhouse', 'MAPPA'] })] }));
        panel.querySelector<HTMLButtonElement>('.lorebase-view-rule-remove')!.click();
        expect(pickerLabels()).toContain('Студия');
    });
    it('uses predefined format choices rather than a text contains filter', () => {
        const { toolbar, panel, add } = fixture();
        add('Формат активной части');
        expect(panel.querySelector('.lorebase-view-rule input[type="text"]')).toBeNull();
        const ona = [...panel.querySelectorAll<HTMLButtonElement>('.lorebase-filter-value-option')].find(option => option.textContent === 'ONA')!;
        ona.click();
        expect(toolbar.currentViewState.rules[0]).toMatchObject({ field: 'activePartFormat', fieldType: 'list', operator: 'containsAny', value: ['ona'] });
    });
    it('groups the catalog and does not add an unavailable saved sort as a fake option', () => {
        const { toolbar, panel, trigger, pickerLabels } = fixture();
        expect(pickerLabels()).not.toContain('Добавить фильтр');
        const groups = [...panel.querySelectorAll('.is-filter-picker .lorebase-field-picker-group')].map(group => group.getAttribute('aria-label'));
        expect(groups).toContain('О тайтле');
        expect(groups).toContain('Даты');
        expect(groups).toContain('Оценки');
        toolbar.currentViewState.sort.field = 'yaml:number:playtime';
        toolbar.renderViewPanel(panel, trigger);
        expect(panel.querySelector('.is-sort-picker .lorebase-settings-dropdown-label')?.textContent).toBe('Поле отсутствует в заметках');
        expect([...panel.querySelectorAll('.is-sort-picker [role="option"]')].some(option => option.getAttribute('aria-label') === 'playtime')).toBe(false);
    });
    it('edits percentage ranges as numbers and dates as periods', () => {
        const { toolbar, panel, add } = fixture();
        add('Прогресс просмотра');
        [...panel.querySelectorAll<HTMLElement>('.is-operator [role="option"]')].find(option => option.textContent === 'в диапазоне')!.click();
        const numbers = [...panel.querySelectorAll<HTMLInputElement>('.lorebase-view-range-row input')];
        expect(numbers.map(input => [input.type, input.min, input.max, input.placeholder])).toEqual([['number', '0', '100', '%'], ['number', '0', '100', '%']]);
        for (const [index, input] of numbers.entries()) { input.value = String(index ? 75 : 25); input.dispatchEvent(new Event('change')); }
        expect(toolbar.currentViewState.rules[0]).toMatchObject({ value: 25, valueTo: 75 });
        add('Дата окончания');
        const dateRule = panel.querySelectorAll('.lorebase-view-rule')[1];
        expect(dateRule.querySelector('input')).toBeNull();
        [...dateRule.querySelectorAll<HTMLElement>('.is-operator [role="option"]')].find(option => option.textContent === 'в диапазоне')!.click();
        expect(panel.querySelectorAll('.lorebase-view-rule')[1].querySelectorAll('input[type="date"]')).toHaveLength(2);
    });
    it('keeps a selected value visible even when the search has no other matches', () => {
        i18n.setLanguage('ru');
        const rule: FilterRule = { id: 'studios', field: 'studios', fieldType: 'list', operator: 'containsAny', value: ['Removed studio'] };
        const definition: FieldDefinition = { id: 'studios', label: 'Студия', type: 'list', source: 'builtin', icon: 'building-2', operators: ['containsAny'], options: [{ value: 'Madhouse', label: 'Madhouse' }] };
        const changed = vi.fn();
        renderLibraryFilterChoices(document.body, rule, definition, changed);
        const search = document.querySelector<HTMLInputElement>('input')!;
        search.value = 'no matches'; search.dispatchEvent(new Event('input'));
        const options = [...document.querySelectorAll<HTMLButtonElement>('.lorebase-filter-value-option')];
        expect(options.filter(option => !option.hidden).map(option => option.textContent)).toEqual(['Removed studio']);
        options.find(option => option.textContent === 'Removed studio')!.click();
        expect(rule.value).toEqual([]);
        expect(changed).toHaveBeenCalledOnce();
        expect(document.querySelector('.lorebase-filter-value-empty')?.textContent).toBe('Ничего не найдено');
    });
});
