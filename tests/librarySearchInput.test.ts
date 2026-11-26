// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { LibrarySearchInput } from '../src/components/LibrarySearchInput';
import { Toolbar } from '../src/components/Toolbar';
import { GameCard } from '../src/components/GameCard';
import { ReadingEditModal } from '../src/modals/ReadingEditModal';
import { i18n } from '../src/localization';
import { DEFAULT_SETTINGS } from '../src/constants';
import { findSearchSuggestions, SearchFilterSuggestion } from '../src/services/media/searchSuggestions';
import { suggestKeyboardLayout } from '../src/utils/keyboardLayout';

beforeAll(() => {
    Object.assign(HTMLElement.prototype, {
        empty() { this.replaceChildren(); },
        addClass(...names: string[]) { this.classList.add(...names); },
        toggleClass(name: string, active: boolean) { this.classList.toggle(name, active); },
        createEl(tag: string, options: any = {}) {
            const element = this.ownerDocument.createElement(tag);
            element.className = options.cls ?? '';
            element.textContent = options.text ?? '';
            for (const [key, value] of Object.entries(options.attr ?? {})) element.setAttribute(key, String(value));
            this.appendChild(element); return element;
        },
        createDiv(options: any) { return this.createEl('div', options); },
        createSpan(options: any) { return this.createEl('span', options); },
    });
    i18n.setLanguage('ru');
});
const controls: LibrarySearchInput[] = [];
afterEach(() => { controls.splice(0).forEach(control => control.destroy()); document.body.replaceChildren(); vi.useRealTimers(); vi.restoreAllMocks(); });
const index: SearchFilterSuggestion[] = [{ field: 'studios', value: 'Madhouse', count: 3 }, { field: 'studios', value: 'Madman', count: 1 }];
function fixture(layoutSuggestion?: (query: string) => string | null) {
    const options = { value: '', onInput: vi.fn(), onSubmit: vi.fn(), onSuggestion: vi.fn(), layoutSuggestion, suggestions: (query: string) => findSearchSuggestions(index, query) };
    const control = new LibrarySearchInput(document.body, options);
    controls.push(control);
    control.input.focus();
    return { control, options };
}
function type(control: LibrarySearchInput, value: string) {
    control.input.value = value;
    control.input.dispatchEvent(new Event('input', { bubbles: true }));
}
function key(control: LibrarySearchInput, value: string) {
    control.input.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
}

describe('explicit search suggestions', () => {
    it('keeps help closed on focus and opens it only through the question button', () => {
        const { control, options } = fixture();
        const help = control.root.querySelector<HTMLElement>('.lorebase-search-help-content')!;
        const button = control.root.querySelector<HTMLButtonElement>('.lorebase-search-help-toggle')!;
        expect(help.hidden).toBe(true);
        expect(button.getAttribute('aria-label')).toBe('Как искать');
        expect(help.querySelector('strong')!.textContent).toBe('Как искать');
        expect(help.querySelectorAll('p')).toHaveLength(2);
        expect(help.querySelector('kbd')!.textContent).toBe('Enter');
        button.click();
        expect(help.hidden).toBe(false);
        expect(button.getAttribute('aria-expanded')).toBe('true');
        expect(help.textContent).toContain('альтернативному названию');
        button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(help.hidden).toBe(true);
        expect(button.getAttribute('aria-expanded')).toBe('false');
        control.input.focus();
        expect(help.hidden).toBe(true);
        type(control, 'mad');
        expect(help.hidden).toBe(true);
        expect(options.onSubmit).not.toHaveBeenCalled();
    });
    it('shows field-labelled options while typing and keeps Enter as a title search by default', () => {
        const { control, options } = fixture();
        type(control, 'Madhouse');
        expect(control.root.textContent).toContain('Студия:Madhouse3');
        expect(control.input.getAttribute('aria-expanded')).toBe('true');
        expect(document.activeElement).toBe(control.input);
        key(control, 'Enter');
        expect(options.onSubmit).toHaveBeenCalledWith('Madhouse');
        expect(options.onSuggestion).not.toHaveBeenCalled();
    });
    it('requires an explicit keyboard selection and supports arrows, Escape and pointer dismissal', () => {
        const { control, options } = fixture();
        type(control, 'mad'); key(control, 'ArrowDown');
        expect(control.input.getAttribute('aria-activedescendant')).toBe(control.root.querySelector('[role="option"]')!.id);
        key(control, 'ArrowUp'); key(control, 'Enter');
        expect(options.onSuggestion).toHaveBeenCalledWith(index[1]);
        type(control, 'mad'); key(control, 'Escape');
        expect(control.input.value).toBe('mad');
        expect(control.input.getAttribute('aria-expanded')).toBe('false');
        type(control, 'mad'); document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
        expect(control.input.getAttribute('aria-expanded')).toBe('false');
    });
    it('does not submit incomplete IME text and commits the composed text', () => {
        const { control, options } = fixture();
        control.input.dispatchEvent(new CompositionEvent('compositionstart'));
        type(control, 'ма'); key(control, 'Enter');
        expect(options.onInput).not.toHaveBeenCalled();
        expect(options.onSubmit).not.toHaveBeenCalled();
        control.input.dispatchEvent(new CompositionEvent('compositionend'));
        expect(options.onInput).toHaveBeenCalledWith('ма');
    });
    it('creates a regular toolbar filter and cancels any pending text search', () => {
        vi.useFakeTimers();
        const toolbar = Object.create(Toolbar.prototype) as any;
        const callbacks = { onSearch: vi.fn(), onViewStateChange: vi.fn() };
        Object.assign(toolbar, { callbacks, currentFilter: { searchTerm: '' }, currentViewState: structuredClone(DEFAULT_SETTINGS.anime.viewState),
            searchSuggestions: index, searchItems: [], searchTimeout: null, render: vi.fn() });
        toolbar.renderSearch(document.body);
        const control = toolbar.searchControl as LibrarySearchInput;
        controls.push(control); control.input.focus(); type(control, 'Madhouse');
        control.root.querySelector<HTMLButtonElement>('[role="option"]')!.click();
        vi.runAllTimers();
        expect(callbacks.onSearch.mock.calls).toEqual([['']]);
        expect(callbacks.onViewStateChange.mock.calls[0][0].rules).toEqual([expect.objectContaining({ field: 'studios', fieldType: 'list', operator: 'containsAny', value: ['Madhouse'] })]);
        expect(toolbar.currentFilter.searchTerm).toBe('');
    });
});

describe('explicit keyboard layout correction', () => {
    const correction = (query: string) => suggestKeyboardLayout(query, candidate => candidate === 'witcher');

    it('shows a suggestion below the input without replacing or submitting the typed query', () => {
        const { control, options } = fixture(correction);
        type(control, 'цшесрук');
        const option = control.root.querySelector<HTMLButtonElement>('[data-action="fix-keyboard-layout"]')!;
        expect(option.textContent).toBe('Искать «witcher»?');
        expect(control.input.nextElementSibling!.contains(option)).toBe(true);
        expect(control.input.value).toBe('цшесрук');
        expect(options.onInput).toHaveBeenCalledExactlyOnceWith('цшесрук');
        expect(options.onSubmit).not.toHaveBeenCalled();
        key(control, 'Enter');
        expect(options.onSubmit).toHaveBeenCalledExactlyOnceWith('цшесрук');
        expect(control.input.value).toBe('цшесрук');
    });

    it('applies the correction only after a click and keeps normal filters separate', () => {
        const { control, options } = fixture(correction);
        type(control, 'цшесрук');
        control.root.querySelector<HTMLButtonElement>('[data-action="fix-keyboard-layout"]')!.click();
        expect(control.input.value).toBe('witcher');
        expect(document.activeElement).toBe(control.input);
        expect(options.onSubmit).toHaveBeenCalledExactlyOnceWith('witcher');
        expect(options.onSuggestion).not.toHaveBeenCalled();
        expect(control.input.getAttribute('aria-expanded')).toBe('false');
    });

    it('navigates layout and creator suggestions together without choosing on Escape', () => {
        const { control, options } = fixture(query => query === 'mad' ? 'ьфв' : null);
        type(control, 'mad');
        expect(control.root.querySelectorAll('[role="option"]')).toHaveLength(3);
        key(control, 'ArrowDown'); key(control, 'Escape');
        expect(control.input.value).toBe('mad');
        expect(options.onSubmit).not.toHaveBeenCalled();
        key(control, 'ArrowDown'); key(control, 'ArrowDown'); key(control, 'Enter');
        expect(options.onSuggestion).toHaveBeenCalledExactlyOnceWith(index[0]);
        type(control, 'mad'); key(control, 'ArrowDown'); key(control, 'Enter');
        expect(options.onSubmit).toHaveBeenCalledExactlyOnceWith('ьфв');
    });

    it('uses titles, aliases and parts from the current library and cancels the pending raw search', () => {
        vi.useFakeTimers();
        const toolbar = Object.create(Toolbar.prototype) as any;
        const callbacks = { onSearch: vi.fn(), onViewStateChange: vi.fn() };
        const view = structuredClone(DEFAULT_SETTINGS.anime.viewState);
        Object.assign(toolbar, { callbacks, currentFilter: { searchTerm: '', rules: view.rules }, currentViewState: view,
            currentMediaType: 'anime', searchSuggestions: [], searchItems: [], searchTimeout: null });
        toolbar.renderSearch(document.body);
        const control = toolbar.searchControl as LibrarySearchInput;
        controls.push(control); control.input.focus();
        const item = { displayName: 'Collection', rawFields: { aliases: ['Witcher'] },
            parts: [{ id: 'second', title: 'Dune', alternativeTitles: ['Stalker'] }] };
        toolbar.updateSearchItems([item]);
        const fix = () => control.root.querySelector<HTMLButtonElement>('[data-action="fix-keyboard-layout"]');
        type(control, 'вгту'); expect(fix()!.textContent).toBe('Искать «dune»?');
        type(control, 'ыефдлук'); expect(fix()!.textContent).toBe('Искать «stalker»?');
        type(control, 'цшесрук'); fix()!.click();
        vi.runAllTimers();
        expect(callbacks.onSearch.mock.calls).toEqual([['witcher']]);
        expect(callbacks.onViewStateChange).not.toHaveBeenCalled();
        expect(toolbar.currentViewState).toEqual(view);
        expect(toolbar.currentFilter.searchTerm).toBe('witcher');
        type(control, 'цшесрук');
        toolbar.updateSearchItems([]);
        expect(fix()).toBeNull();
        expect(control.input.value).toBe('цшесрук');
        window.clearTimeout(toolbar.searchTimeout);
    });
});

it('explains a matched part on its title card and opens that part without the normal card action', () => {
    const card = Object.create(GameCard.prototype) as any;
    const item = { displayName: 'Collection', nameLower: 'collection', rawFields: {}, parts: [{ id: 'second', title: 'Edgerunners 2', alternativeTitles: ['Вторая история'] }] };
    const image = document.body.createDiv({});
    const container = document.body.createDiv({});
    container.appendChild(image);
    const footer = container.createDiv({ cls: 'lorebase-card-progress-footer' });
    const progress = footer.createDiv({ cls: 'lorebase-card-progress-row' });
    const callbacks = { onClick: vi.fn(), onPartClick: vi.fn() };
    container.addEventListener('click', callbacks.onClick);
    Object.assign(card, { game: item, searchQuery: 'история', callbacks, container });
    card.renderSearchMatch();
    const button = footer.querySelector<HTMLButtonElement>('button')!;
    expect(image.querySelector('button')).toBeNull();
    expect(button.textContent).toBe('В составе ·Edgerunners 2');
    expect(button.title).toContain('Вторая история');
    expect(button.nextElementSibling).toBe(progress);
    button.click();
    expect(callbacks.onPartClick).toHaveBeenCalledWith(item, 'second');
    expect(callbacks.onClick).not.toHaveBeenCalled();
});

it('opens a matching manga volume with its own chapter counters, keeping saved data unchanged until Save', async () => {
    const parts = [{ id: 'first', kind: 'volume', title: 'First', volumeNumber: 1, chapterCurrent: 4, chapterTotal: 10, status: 'watching' },
        { id: 'second', kind: 'volume', title: 'Second', volumeNumber: 2, chapterCurrent: 2, chapterTotal: 8, status: 'watching' }];
    const item = { type: 'manga', displayName: 'Collection', imageUrl: '', filePath: 'Title.md', status: 'watching', parts,
        activePartId: 'first', chapterCurrent: 4, chapterTotal: 10, volumeCurrent: 1, volumeTotal: 2, tags: [], genres: [], authors: [] } as any;
    const save = vi.fn();
    const modal = new ReadingEditModal({} as any, item, save, vi.fn()) as any;
    const root = document.body.createDiv({ cls: 'lorebase-editmode-root' });
    root.innerHTML = modal.buildTemplate(); modal.contentEl = document.body;
    modal.showPart('second');
    expect(modal.volumeCurrent).toBe(2);
    expect(modal.chapterCurrent).toBe(2);
    expect(modal.chapterTotal).toBe(8);
    expect(item.activePartId).toBe('first');
    expect(item.chapterCurrent).toBe(4);
    await modal.save();
    expect(save.mock.calls[0][0]).toMatchObject({ activePartId: 'second', chapterCurrent: 2, chapterTotal: 8, volumeCurrent: 2 });
    expect(save.mock.calls[0][0].parts[0].chapterCurrent).toBe(4);
});
