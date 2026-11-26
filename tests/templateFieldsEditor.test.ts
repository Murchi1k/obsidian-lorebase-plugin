// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderTemplateFieldsEditor, type TemplateEditorField } from '../src/components/TemplateFieldsEditor';
import { i18n } from '../src/localization';
import { renderTemplateFieldHint } from '../src/settings/sections/templateTools';
import { getSimpleWikilinkTokens } from '../src/services/integrations/templateUtils';

beforeAll(() => {
    Object.assign(HTMLElement.prototype, {
        empty() { this.replaceChildren(); },
        setText(text: string) { this.textContent = text; },
        createEl(tag: string, options: any = {}) {
            const el = document.createElement(tag); el.className = options.cls ?? ''; el.textContent = options.text ?? '';
            for (const [key, value] of Object.entries(options.attr ?? {})) el.setAttribute(key, String(value));
            this.append(el); return el;
        },
        createDiv(options: any = {}) { return this.createEl('div', options); },
        createSpan(options: any = {}) { return this.createEl('span', options); },
    });
});
afterEach(() => document.body.replaceChildren());

const fields: TemplateEditorField[] = [
    { key: 'name', name: 'Название', property: 'name', description: 'Название на карточке.' },
    { key: 'poster', name: 'Постер', property: 'xys', description: 'Вертикальная обложка.' },
    { key: 'posterHorizontal', name: 'Горизонтальный постер', property: 'poster_b', description: 'Горизонтальная обложка.' },
];
function fixture(editorFields = fields, wikilinks?: Parameters<typeof renderTemplateFieldsEditor>[1]['wikilinks']) {
    i18n.setLanguage('ru');
    const root = document.body.createDiv();
    const save = vi.fn();
    renderTemplateFieldsEditor(root, { fields: editorFields, selected: new Set(editorFields.map(field => field.key)), defaultOrder: editorFields.map(field => field.key), wikilinks, onChange: save });
    return { root, save };
}

describe('compact template editor', () => {
    it('shows actual renamed properties, keeps descriptions out of rows and displays only the selected explanation', () => {
        const { root } = fixture();
        expect(root.querySelector('[data-field="poster"] code')?.textContent).toBe('xys');
        expect(root.querySelector('.lorebase-template-editor-list')?.textContent).not.toContain('Вертикальная обложка.');
        root.querySelector<HTMLButtonElement>('[data-field="poster"] .lorebase-template-editor-name')!.click();
        expect(root.querySelector('.lorebase-template-editor-help')?.textContent).toContain('Вертикальная обложка.');
        root.querySelector<HTMLButtonElement>('[data-field="name"] .lorebase-template-editor-name')!.click();
        expect(root.querySelector('.lorebase-template-editor-help')?.textContent).not.toContain('Вертикальная обложка.');
    });

    it('searches by the actual property name without losing checkbox choices', () => {
        const { root, save } = fixture();
        const search = root.querySelector<HTMLInputElement>('input[type="search"]')!;
        search.value = 'xys'; search.dispatchEvent(new Event('input'));
        expect(root.querySelectorAll('[data-field]')).toHaveLength(1);
        const checkbox = root.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
        checkbox.checked = false; checkbox.dispatchEvent(new Event('change'));
        expect(save.mock.lastCall?.[1].has('poster')).toBe(false);
        search.value = ''; search.dispatchEvent(new Event('input'));
        expect(root.querySelectorAll('[data-field]')).toHaveLength(3);
        expect(root.querySelector<HTMLInputElement>('[data-field="poster"] input')!.checked).toBe(false);
        root.querySelector<HTMLButtonElement>('.lorebase-template-editor-actions button')!.click();
        expect(root.querySelectorAll('input[type="checkbox"]:checked')).toHaveLength(3);
        expect(root.querySelector('.lorebase-template-editor-count')?.textContent).toBe('3 / 3');
    });


    it('keeps individual link formatting independent of field inclusion and search', () => {
        const changed = vi.fn(), preferences = new Set(['authors']);
        const { root, save } = fixture([
            ...fields,
            { key: 'authors', name: 'Авторы', property: 'authors', description: '', canWikilink: true },
            { key: 'genres', name: 'Жанры', property: 'genres', description: '', canWikilink: true },
        ], { fields: preferences, onChange: changed });
        expect(root.querySelectorAll('.lorebase-template-editor-wikilink')).toHaveLength(2);
        expect(root.querySelector('[data-field="poster"] .lorebase-template-editor-wikilink')).toBeNull();
        const authors = root.querySelector<HTMLButtonElement>('[data-field="authors"] .lorebase-template-editor-wikilink')!;
        const genres = root.querySelector<HTMLButtonElement>('[data-field="genres"] .lorebase-template-editor-wikilink')!;
        expect(authors.textContent).toBe('Вкл.');
        expect(genres.textContent).toBe('Выкл.');
        authors.click(); genres.click();
        expect([...changed.mock.lastCall![0]]).toEqual(['genres']);
        expect(save).not.toHaveBeenCalled();
        const inclusion = root.querySelector<HTMLInputElement>('[data-field="genres"] input[type="checkbox"]')!;
        inclusion.checked = false; inclusion.dispatchEvent(new Event('change'));
        expect(genres.disabled).toBe(true);
        expect(preferences.has('genres')).toBe(true);
        inclusion.checked = true; inclusion.dispatchEvent(new Event('change'));
        expect(genres.disabled).toBe(false);
        const search = root.querySelector<HTMLInputElement>('input[type="search"]')!;
        search.value = 'authors'; search.dispatchEvent(new Event('input'));
        search.value = ''; search.dispatchEvent(new Event('input'));
        expect(root.querySelector('[data-field="authors"] .lorebase-template-editor-wikilink')?.getAttribute('aria-pressed')).toBe('false');
        expect(root.querySelector('[data-field="genres"] .lorebase-template-editor-wikilink')?.getAttribute('aria-pressed')).toBe('true');
    });

    it('shows the exact wikilink token for the current property in the advanced hint', () => {
        const host = document.body.createDiv();
        const editor = document.body.createEl('textarea');
        editor.value = '---\n"Авторы книги": "{{VALUE:authors}}"\ngenres: "{{VALUE:genres|wikilink}}"\nyear: {{VALUE:Year}}\n---';
        renderTemplateFieldHint(host, editor, [], getSimpleWikilinkTokens('books'));
        const moveCursor = (token: string) => {
            editor.setSelectionRange(editor.value.indexOf(token), editor.value.indexOf(token));
            editor.dispatchEvent(new Event('click'));
        };
        moveCursor('authors');
        expect(host.querySelector('.lorebase-template-wikilink-hint code')?.textContent).toBe('{{VALUE:authors|wikilink}}');
        moveCursor('genres');
        expect(host.querySelector('.lorebase-template-wikilink-hint code')?.textContent).toBe('{{VALUE:genres|wikilink}}');
        moveCursor('Year');
        expect(host.querySelector('.lorebase-template-wikilink-hint')).toBeNull();
    });


    it('uses the plural directors token in the video template hint', () => {
        const host = document.body.createDiv();
        const editor = document.body.createEl('textarea');
        editor.value = '---\ndirectors: "{{VALUE:directors}}"\n---';
        const start = editor.value.indexOf('VALUE:');
        editor.setSelectionRange(start, start);
        renderTemplateFieldHint(host, editor, [], getSimpleWikilinkTokens('movies'));
        expect(host.querySelector('.lorebase-template-wikilink-hint code')?.textContent).toBe('{{VALUE:directors|wikilink}}');
    });

    it('supports keyboard reordering and restores the template order', () => {
        const { root, save } = fixture();
        root.querySelector<HTMLButtonElement>('[data-field="poster"] .lorebase-template-editor-grip')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true }));
        expect(save.mock.lastCall?.[0]).toEqual(['poster', 'name', 'posterHorizontal']);
        root.querySelectorAll<HTMLButtonElement>('.lorebase-template-editor-actions button')[1].click();
        expect(save.mock.lastCall?.[0]).toEqual(['name', 'poster', 'posterHorizontal']);
    });
});
