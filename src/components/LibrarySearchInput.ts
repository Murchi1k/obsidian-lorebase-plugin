import { setIcon } from 'obsidian';
import { i18n, t } from '../localization';
import { librarySearchCopy, SearchFilterSuggestion } from '../services/media/searchSuggestions';

let searchInputId = 0;
interface SearchInputOptions {
    value: string;
    onInput: (value: string) => void;
    onSubmit: (value: string) => void;
    suggestions: (query: string) => SearchFilterSuggestion[];
    layoutSuggestion?: (query: string) => string | null;
    onSuggestion: (suggestion: SearchFilterSuggestion) => void;
}

/** Suggestions require an explicit choice; Enter otherwise searches the original titles query. */
export class LibrarySearchInput {
    readonly root: HTMLElement;
    readonly input: HTMLInputElement;
    private panel: HTMLElement;
    private help: HTMLElement;
    private helpButton: HTMLButtonElement;
    private entries: SearchFilterSuggestion[] = [];
    private optionButtons: HTMLButtonElement[] = [];
    private selected = -1;
    private composing = false;
    private destroyed = false;
    private outside: (event: Event) => void;
    private blurTimer: number | null = null;

    constructor(parent: HTMLElement, private options: SearchInputOptions) {
        this.root = parent.createDiv({ cls: 'lorebase-search-container' });
        const panelId = `lorebase-search-suggestions-${++searchInputId}`;
        this.input = this.root.createEl('input', { cls: 'lorebase-search-input', attr: {
            type: 'text', placeholder: t('searchPlaceholder'), spellcheck: 'false', autocomplete: 'off',
            'aria-label': t('search'), role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': 'false', 'aria-controls': panelId,
        } });
        this.input.value = options.value;
        this.panel = this.root.createDiv({ cls: 'lorebase-search-suggestions', attr: {
            id: panelId, role: 'listbox', 'aria-label': librarySearchCopy(i18n.getLanguage()).suggestions,
        } });
        const helpCopy = {
            en: ['Search help', 'Search by title, alternative title or part title.', 'Type a studio, author or developer, then choose a suggestion to apply a filter.', 'Search titles'],
            ru: ['Как искать', 'По названию, альтернативному названию или названию части.', 'Введите студию, автора или разработчика и выберите подсказку, чтобы применить фильтр.', 'Поиск по названиям'],
            uk: ['Як шукати', 'За назвою, альтернативною назвою або назвою частини.', 'Введіть студію, автора чи розробника та виберіть підказку, щоб застосувати фільтр.', 'Пошук за назвами'],
            'zh-CN': ['搜索帮助', '按标题、别名或分部标题搜索。', '输入工作室、作者或开发商，选择建议以应用筛选。', '搜索标题'],
        }[i18n.getLanguage()];
        this.helpButton = this.root.createEl('button', { cls: 'lorebase-search-help-toggle', attr: {
            type: 'button', title: helpCopy[0], 'aria-label': helpCopy[0], 'aria-expanded': 'false', 'aria-controls': panelId + '-help',
        } });
        setIcon(this.helpButton, 'circle-help');
        this.help = this.root.createDiv({ cls: 'lorebase-search-help-content', attr: { id: panelId + '-help', role: 'note' } });
        const helpHeading = this.help.createDiv({ cls: 'lorebase-search-help-heading' });
        setIcon(helpHeading.createSpan({ attr: { 'aria-hidden': 'true' } }), 'search');
        helpHeading.createEl('strong', { text: helpCopy[0] });
        this.help.createEl('p', { text: helpCopy[1] });
        this.help.createEl('p', { text: helpCopy[2] });
        const shortcut = this.help.createDiv({ cls: 'lorebase-search-help-shortcut' });
        shortcut.createEl('kbd', { text: 'Enter' });
        shortcut.createSpan({ text: helpCopy[3] });
        this.helpButton.addEventListener('click', () => {
            this.help.hidden = !this.help.hidden;
            this.helpButton.setAttribute('aria-expanded', String(!this.help.hidden));
            this.closeSuggestions();
        });
        this.root.addEventListener('keydown', event => {
            if (event.key === 'Escape' && !this.help.hidden) {
                event.preventDefault(); event.stopPropagation(); this.close(); this.helpButton.focus();
            }
        });
        this.help.hidden = true;
        this.input.setAttribute('aria-describedby', this.help.id);
        this.close();
        this.input.addEventListener('input', event => {
            if (this.composing || (event as InputEvent).isComposing) return;
            this.changed();
        });
        this.input.addEventListener('compositionstart', () => this.composing = true);
        this.input.addEventListener('compositionend', () => { this.composing = false; this.changed(); });
        this.input.addEventListener('focus', () => this.refresh());
        this.input.addEventListener('keydown', event => this.keydown(event));
        this.root.addEventListener('focusout', () => {
            if (this.destroyed) return;
            if (this.blurTimer !== null) window.clearTimeout(this.blurTimer);
            this.blurTimer = window.setTimeout(() => {
                this.blurTimer = null;
                if (!this.root.contains(this.root.ownerDocument.activeElement)) this.close();
            }, 0);
        });
        this.outside = event => { if (!this.root.contains(event.target as Node)) this.close(); };
        this.root.ownerDocument.addEventListener('pointerdown', this.outside);
    }

    private changed(): void {
        this.selected = -1;
        this.options.onInput(this.input.value);
        this.refresh();
    }

    refresh(): void {
        if (this.destroyed || this.root.ownerDocument.activeElement !== this.input) return;
        this.help.hidden = true;
        this.helpButton.setAttribute('aria-expanded', 'false');
        this.entries = this.options.suggestions(this.input.value);
        this.panel.empty();
        this.optionButtons = [];
        this.selected = -1;
        const copy = librarySearchCopy(i18n.getLanguage());
        const layout = this.options.layoutSuggestion?.(this.input.value);
        if (layout) {
            const option = this.panel.createEl('button', { cls: 'lorebase-search-suggestion lorebase-search-layout-suggestion', attr: {
                type: 'button', role: 'option', id: `${this.panel.id}-layout`, tabindex: '-1', 'aria-selected': 'false',
                'aria-label': `${copy.searchFor} «${layout}»?`, title: copy.layoutHint, 'data-action': 'fix-keyboard-layout',
            } });
            setIcon(option.createSpan({ cls: 'lorebase-search-layout-icon', attr: { 'aria-hidden': 'true' } }), 'keyboard');
            const label = option.createSpan({ cls: 'lorebase-search-layout-label' });
            label.append(`${copy.searchFor} «`);
            label.createEl('strong', { text: layout }); label.append('»?');
            option.addEventListener('mousedown', event => event.preventDefault());
            option.addEventListener('click', () => {
                this.input.value = layout;
                this.close();
                this.options.onSubmit(layout);
                if (!this.destroyed) this.input.focus({ preventScroll: true });
            });
            this.optionButtons.push(option);
        }
        this.entries.forEach((entry, index) => {
            const option = this.panel.createEl('button', { cls: 'lorebase-search-suggestion', attr: {
                type: 'button', role: 'option', id: `${this.panel.id}-${index}`, tabindex: '-1', 'aria-selected': 'false',
                'aria-label': `${copy[entry.field]}: ${entry.value}`,
            } });
            option.createSpan({ cls: 'lorebase-search-suggestion-field', text: `${copy[entry.field]}:` });
            option.createSpan({ cls: 'lorebase-search-suggestion-value', text: entry.value });
            option.createSpan({ cls: 'lorebase-search-suggestion-count', text: String(entry.count), attr: { 'aria-hidden': 'true' } });
            option.addEventListener('mousedown', event => event.preventDefault());
            option.addEventListener('click', () => this.choose(entry));
            this.optionButtons.push(option);
        });
        this.panel.hidden = !this.optionButtons.length;
        this.input.setAttribute('aria-expanded', String(this.optionButtons.length > 0));
        this.input.removeAttribute('aria-activedescendant');
    }

    private keydown(event: KeyboardEvent): void {
        if (this.composing || event.isComposing) return;
        if (event.key === 'Escape' && (!this.panel.hidden || !this.help.hidden)) {
            event.preventDefault(); event.stopPropagation(); this.close(); return;
        }
        if (event.key === 'Tab') { this.close(); return; }
        if (event.key === 'Enter') {
            event.preventDefault();
            if (!this.panel.hidden && this.selected >= 0) this.optionButtons[this.selected]?.click();
            else { this.close(); this.options.onSubmit(this.input.value); }
            return;
        }
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        if (this.panel.hidden) this.refresh();
        if (!this.optionButtons.length) return;
        event.preventDefault();
        this.selected = event.key === 'ArrowDown' ? (this.selected + 1) % this.optionButtons.length
            : this.selected < 0 ? this.optionButtons.length - 1 : (this.selected - 1 + this.optionButtons.length) % this.optionButtons.length;
        this.optionButtons.forEach((option, index) => option.setAttribute('aria-selected', String(index === this.selected)));
        const option = this.optionButtons[this.selected];
        this.input.setAttribute('aria-activedescendant', option.id);
        option.scrollIntoView?.({ block: 'nearest' });
    }

    private choose(entry: SearchFilterSuggestion): void {
        this.close();
        this.options.onSuggestion(entry);
    }

    private close(): void {
        this.help.hidden = true;
        this.helpButton.setAttribute('aria-expanded', 'false');
        this.closeSuggestions();
    }

    private closeSuggestions(): void {
        this.panel.hidden = true;
        this.selected = -1;
        this.input.setAttribute('aria-expanded', 'false');
        this.input.removeAttribute('aria-activedescendant');
    }

    destroy(): void {
        this.destroyed = true;
        this.root.ownerDocument.removeEventListener('pointerdown', this.outside);
        if (this.blurTimer !== null) window.clearTimeout(this.blurTimer);
        this.root.remove();
    }
}
