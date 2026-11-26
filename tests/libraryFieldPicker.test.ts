// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createLibraryFieldPicker } from '../src/components/LibraryFieldPicker';
import { i18n } from '../src/localization';
import type { FieldDefinition } from '../src/types';

beforeAll(() => {
    Object.assign(HTMLElement.prototype, {
        empty() { this.replaceChildren(); }, addClass(...names: string[]) { this.classList.add(...names); },
        removeClass(...names: string[]) { this.classList.remove(...names); }, hasClass(name: string) { return this.classList.contains(name); },
        setCssStyles(styles: object) { Object.assign(this.style, styles); },
        createEl(tag: string, options: any = {}) {
            const element = document.createElement(tag); element.className = options.cls ?? ''; element.textContent = options.text ?? '';
            for (const [key, value] of Object.entries(options.attr ?? {})) element.setAttribute(key, String(value)); this.append(element); return element;
        }, createDiv(options: any) { return this.createEl('div', options); }, createSpan(options: any) { return this.createEl('span', options); },
    });
});
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); i18n.setLanguage('en'); });

const fields: FieldDefinition[] = [
    { id: 'year', label: 'Год', type: 'number', source: 'builtin', icon: 'calendar', operators: ['equals'], noteCount: 8 },
    { id: 'dateFinished', label: 'Дата окончания', type: 'date', source: 'builtin', icon: 'calendar', operators: ['equals'], noteCount: 4 },
    { id: 'yaml:my_priority', label: 'my_priority', type: 'number', source: 'yaml', icon: 'hash', operators: ['equals'], noteCount: 1 },
];

function fixture() {
    i18n.setLanguage('ru');
    const root = document.body.createDiv();
    const onSelect = vi.fn();
    createLibraryFieldPicker(root, fields, { label: 'Добавить фильтр', add: true, onSelect });
    return { root, onSelect, search: root.querySelector<HTMLInputElement>('input')! };
}

describe('searchable field catalog', () => {
    it('collapses note properties by default and opens matching properties during search', () => {
        const { root, search } = fixture();
        const toggle = root.querySelector<HTMLButtonElement>('.lorebase-field-picker-group-toggle')!;
        const content = root.querySelector<HTMLElement>('.lorebase-field-picker-group-toggle + .lorebase-field-picker-group-content')!;
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        expect(content.hidden).toBe(true);
        toggle.click();
        expect(content.hidden).toBe(false);
        toggle.click();
        expect(content.hidden).toBe(true);
        search.value = 'priority'; search.dispatchEvent(new Event('input'));
        expect(content.hidden).toBe(false);
        search.value = ''; search.dispatchEvent(new Event('input'));
        expect(content.hidden).toBe(true);
    });
    it('searches property names across groups and keeps source counts in tooltips without extra rows', () => {
        const { root, search } = fixture();
        expect(root.querySelectorAll('[role="option"]')).toHaveLength(3);
        expect(root.querySelector('[aria-label="my_priority"]')?.getAttribute('title')).toContain('Заметок: 1');
        expect(root.querySelector('.lorebase-field-picker-option-meta')).toBeNull();
        search.value = 'priority'; search.dispatchEvent(new Event('input'));
        expect([...root.querySelectorAll<HTMLButtonElement>('[role="option"]')].filter(option => !option.hidden).map(option => option.getAttribute('aria-label'))).toEqual(['my_priority']);
        expect(root.querySelector('[aria-label="Даты"]')?.hasAttribute('hidden')).toBe(true);
    });
    it('supports keyboard selection and disposes the floating menu when its owner is removed', async () => {
        vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 10, bottom: 45, left: 10, width: 280, height: 35 } as DOMRect);
        const { root, search, onSelect } = fixture();
        root.querySelector<HTMLButtonElement>('button')!.click();
        expect(document.activeElement).toBe(search);
        search.value = 'priority'; search.dispatchEvent(new Event('input'));
        search.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
        expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toBe('my_priority');
        (document.activeElement as HTMLButtonElement).click();
        expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'yaml:my_priority' }));
        root.querySelector<HTMLButtonElement>('button')!.click();
        expect(document.querySelector('.lorebase-field-picker-panel.is-open')).not.toBeNull();
        root.remove();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(document.querySelector('.lorebase-field-picker-panel')).toBeNull();
    });
});
