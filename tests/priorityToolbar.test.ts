// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Toolbar } from '../src/components/Toolbar';
import { installStatisticsDom } from './helpers/statisticsDom';
import { createBaseFilter } from './helpers/testHelpers';
import { getBuiltInFieldDefinitions, getSortOptionsForMediaType, getStatusOptionsForMediaType } from '../src/views/library/viewOptions';
beforeEach(() => {
    installStatisticsDom(); vi.stubGlobal('activeDocument', document); vi.stubGlobal('createEl', (tag: string) => document.createElement(tag));
    Object.assign(HTMLElement.prototype, { setText(value: string) { this.textContent = value; } });
});
afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); });
it.each(['game', 'anime', 'movie', 'series', 'book', 'manga', 'music'] as const)('offers usable priority sort, grouping and filtering for %s', type => {
    const root = document.body.createDiv();
    const state: any = { sort: { field: 'name', order: 'asc' }, group: { mode: 'none', order: 'asc' }, workTypes: [], rules: [], tags: [], genres: [] };
    const onViewStateChange = vi.fn();
    const callbacks: any = new Proxy({ onViewStateChange }, { get(target: any, key) { return target[key] ?? vi.fn(); } });
    const toolbar = new Toolbar(root, callbacks, state.sort, createBaseFilter(), 'grid', getSortOptionsForMediaType(type), 'Random', state, [], null,
        getBuiltInFieldDefinitions(type, getStatusOptionsForMediaType(type), { showAdult: true, showCustom: true }), state, type, [type]);
    root.querySelector<HTMLElement>('.lorebase-view-panel')!.parentElement!.querySelector<HTMLButtonElement>('button')!.click();
    expect(root.querySelector('.lorebase-view-priority-filter')).toBeNull();
    const choose = (selector: string) => {
        const trigger = root.querySelector<HTMLButtonElement>(selector + ' > button')!;
        trigger.getBoundingClientRect = () => new DOMRect(20, 20, 260, 36); trigger.click();
        const panel = document.querySelector<HTMLElement>('.lorebase-field-picker-panel.is-open')!;
        const search = panel.querySelector<HTMLInputElement>('input')!; search.value = 'priority'; search.dispatchEvent(new Event('input'));
        panel.querySelector<HTMLButtonElement>('[role="option"][aria-label="Priority"]')!.click();
    };
    choose('.is-sort-picker'); expect(onViewStateChange.mock.lastCall![0].sort).toEqual({ field: 'priority', order: 'desc' });
    choose('.is-group-picker'); expect(onViewStateChange.mock.lastCall![0].group).toEqual({ mode: 'priority', order: 'desc' });
    choose('.is-filter-picker');
    const card = root.querySelector<HTMLElement>('.lorebase-view-rule[data-field="priority"]')!;
    expect(card.closest('.lorebase-view-filters')).not.toBeNull();
    expect(card.closest('.lorebase-view-controls')).toBeNull();
    const choices = Array.from(card.querySelectorAll<HTMLButtonElement>('.lorebase-filter-value-option'));
    expect(choices).toHaveLength(4);
    choices.find(choice => choice.textContent?.includes('Highest'))!.click();
    expect(onViewStateChange.mock.lastCall![0].rules).toEqual([expect.objectContaining({ field: 'priority', value: ['highest'] })]);
    choices.find(choice => choice.textContent?.includes('High') && !choice.textContent?.includes('Highest'))!.click();
    expect(onViewStateChange.mock.lastCall![0].rules[0].value).toEqual(['highest', 'high']);
    toolbar.destroy();
});
