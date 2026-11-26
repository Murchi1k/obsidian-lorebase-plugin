import { setIcon } from 'obsidian';
import type { FieldDefinition } from '../types';
import { i18n } from '../localization';
import { getLibraryFieldGroup, LIBRARY_FIELD_GROUPS, libraryCatalogCopy } from '../services/media/libraryFieldCatalog';
import { normalizeTitleSearch } from '../services/media/titleSearch';
import { createDropdownLifecycle } from './dropdownLifecycle';

let nextPickerId = 0;

/** A field catalog with search and semantic sections, shared by filters and sorting. */
export function createLibraryFieldPicker(container: HTMLElement, fields: FieldDefinition[], config: {
    label: string;
    selected?: string;
    add?: boolean;
    searchAliases?: Record<string, string>;
    onSelect: (field: FieldDefinition) => void;
}): void {
    const copy = libraryCatalogCopy(i18n.getLanguage());
    const doc = container.ownerDocument, view = doc.defaultView!;
    const id = `lorebase-field-picker-${++nextPickerId}`;
    container.empty();
    container.addClass('lorebase-settings-dropdown', 'is-floating', 'lorebase-field-picker');
    const trigger = container.createEl('button', { cls: 'lorebase-settings-dropdown-btn lorebase-field-picker-trigger', attr: {
        type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-controls': id,
        title: config.add ? `${config.label}\n${copy.customHint}` : config.label,
    } });
    if (config.add) setIcon(trigger.createSpan({ cls: 'lorebase-field-picker-add-icon', attr: { 'aria-hidden': 'true' } }), 'plus');
    trigger.createSpan({ cls: 'lorebase-settings-dropdown-label', text: config.label });
    setIcon(trigger.createSpan({ cls: 'lorebase-settings-dropdown-caret', attr: { 'aria-hidden': 'true' } }), 'chevron-down');
    const panel = container.createDiv({ cls: 'lorebase-settings-dropdown-panel lorebase-floating-dropdown-panel lorebase-field-picker-panel', attr: {
        id, role: 'dialog', 'aria-label': copy.choose,
    } });
    const header = panel.createDiv({ cls: 'lorebase-field-picker-search' });
    setIcon(header.createSpan({ attr: { 'aria-hidden': 'true' } }), 'search');
    const search = header.createEl('input', { attr: { type: 'search', placeholder: copy.search, 'aria-label': copy.search,
        role: 'combobox', 'aria-controls': `${id}-options`, 'aria-expanded': 'false', autocomplete: 'off' } });
    const list = panel.createDiv({ cls: 'lorebase-field-picker-list', attr: { role: 'listbox', id: `${id}-options`, 'aria-label': copy.choose } });
    const empty = panel.createDiv({ cls: 'lorebase-field-picker-empty', text: copy.noMatches, attr: { role: 'status' } });
    const rows: Array<{ field: FieldDefinition; button: HTMLButtonElement; query: string }> = [];
    const groups: Array<{ section: HTMLElement; rows: HTMLButtonElement[]; count: HTMLElement; content: HTMLElement; toggle?: HTMLButtonElement; caret?: HTMLElement }> = [];
    let notesExpanded = false;
    let searchNotesOverride: boolean | null = null;
    for (const group of LIBRARY_FIELD_GROUPS) {
        const members = fields.filter(field => getLibraryFieldGroup(field) === group);
        if (!members.length) continue;
        const section = list.createDiv({ cls: 'lorebase-field-picker-group', attr: { role: 'group', 'aria-label': copy[group] } });
        const toggle = group === 'note' ? section.createEl('button', { cls: 'lorebase-field-picker-group-heading lorebase-field-picker-group-toggle', attr: {
            type: 'button', tabindex: '-1', 'aria-label': copy.note, 'aria-expanded': 'false', 'aria-controls': `${id}-note`, title: copy.customHint,
        } }) : undefined;
        const heading = toggle ?? section.createDiv({ cls: 'lorebase-field-picker-group-heading', attr: { 'aria-hidden': 'true' } });
        heading.createSpan({ text: copy[group] });
        const count = heading.createSpan({ cls: 'lorebase-field-picker-group-count' });
        const caret = toggle?.createSpan({ cls: 'lorebase-field-picker-group-caret', attr: { 'aria-hidden': 'true' } });
        const content = section.createDiv({ cls: 'lorebase-field-picker-group-content', attr: toggle ? { id: `${id}-note` } : {} });
        toggle?.addEventListener('click', () => {
            if (search.value.trim()) searchNotesOverride = content.hidden;
            else notesExpanded = content.hidden;
            filter(false);
        });
        const groupRows: HTMLButtonElement[] = [];
        for (const field of members) {
            const metadata = `${copy[field.type]}${field.noteCount === undefined ? '' : ` · ${copy.notes}: ${field.noteCount}`}`;
            const option = content.createEl('button', { cls: 'lorebase-field-picker-option', attr: {
                type: 'button', role: 'option', 'aria-label': field.label, 'aria-selected': String(config.selected === field.id), tabindex: '-1',
                title: `${field.label}\n${metadata}`, 'aria-description': metadata,
            } });
            setIcon(option.createSpan({ cls: 'lorebase-field-picker-option-icon', attr: { 'aria-hidden': 'true' } }), field.icon);
            const text = option.createSpan({ cls: 'lorebase-field-picker-option-text' });
            text.createSpan({ cls: 'lorebase-field-picker-option-label', text: field.label });
            if (config.selected === field.id) setIcon(option.createSpan({ cls: 'lorebase-field-picker-selected', attr: { 'aria-hidden': 'true' } }), 'check');
            option.addEventListener('click', () => { close(); config.onSelect(field); });
            rows.push({ field, button: option, query: normalizeTitleSearch(`${copy[group]} ${field.label} ${field.source === 'yaml' ? field.id.slice(5) : ''} ${copy[field.type]} ${config.searchAliases?.[field.id] ?? ''}`) });
            groupRows.push(option);
        }
        groups.push({ section, rows: groupRows, count, content, toggle, caret });
    }
    const filter = (resetScroll = true): void => {
        const words = normalizeTitleSearch(search.value).split(' ').filter(Boolean);
        for (const row of rows) row.button.hidden = !words.every(word => row.query.includes(word));
        for (const group of groups) {
            const visible = group.rows.filter(row => !row.hidden).length;
            group.section.hidden = visible === 0;
            group.count.textContent = String(visible);
            if (group.toggle) {
                const expanded = searchNotesOverride ?? (notesExpanded || words.length > 0);
                group.content.hidden = !expanded;
                group.toggle.setAttribute('aria-expanded', String(expanded));
                if (group.caret) setIcon(group.caret, expanded ? 'chevron-down' : 'chevron-right');
            }
        }
        empty.hidden = rows.some(row => !row.button.hidden);
        if (resetScroll) list.scrollTop = 0;
        position();
    };
    const position = (): void => {
        if (!panel.hasClass('is-open')) return;
        const rect = trigger.getBoundingClientRect();
        if (rect.bottom <= 0 || rect.top >= view.innerHeight) { close(); return; }
        const width = Math.min(Math.max(rect.width, 310), 360, Math.max(0, view.innerWidth - 16));
        const below = view.innerHeight - rect.bottom - 12, above = rect.top - 12;
        const openAbove = below < 180 && above > below;
        panel.setCssStyles({ width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px`,
            maxHeight: `${Math.min(320, Math.max(120, openAbove ? above : below))}px`,
            left: `${Math.max(8, Math.min(rect.left, view.innerWidth - width - 8))}px`, top: '0px', visibility: 'hidden' });
        const height = panel.getBoundingClientRect().height;
        panel.setCssStyles({ top: `${Math.max(8, openAbove ? rect.top - height - 4 : Math.min(rect.bottom + 4, view.innerHeight - height - 8))}px`, visibility: '' });
    };
    const close = (): void => {
        lifecycle.stop();
        panel.removeClass('is-open');
        trigger.removeClass('is-open');
        container.removeClass('is-open');
        trigger.setAttribute('aria-expanded', 'false');
        search.setAttribute('aria-expanded', 'false');
        if (panel.parentElement !== container) {
            if (trigger.parentElement === container) container.append(panel); else panel.remove();
        }
    };
    const lifecycle = createDropdownLifecycle(trigger, panel, close, position);
    const open = (): void => {
        doc.querySelectorAll('.lorebase-settings-dropdown-panel.is-open').forEach(other => {
            if (other !== panel) other.dispatchEvent(new Event('lorebase-dropdown-close'));
        });
        search.value = '';
        notesExpanded = false;
        searchNotesOverride = null;
        filter();
        doc.body.append(panel);
        panel.addClass('is-open');
        trigger.addClass('is-open');
        container.addClass('is-open');
        trigger.setAttribute('aria-expanded', 'true');
        search.setAttribute('aria-expanded', 'true');
        position();
        lifecycle.start();
        search.focus({ preventScroll: true });
    };
    trigger.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); if (panel.hasClass('is-open')) close(); else open(); });
    trigger.addEventListener('keydown', event => { if (event.key === 'ArrowDown') { event.preventDefault(); open(); } });
    panel.addEventListener('click', event => event.stopPropagation());
    panel.addEventListener('lorebase-dropdown-close', close);
    search.addEventListener('input', () => { searchNotesOverride = null; filter(); });
    panel.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); close(); trigger.focus(); return; }
        const visible = Array.from(list.querySelectorAll<HTMLButtonElement>('button')).filter(button => !button.closest('[hidden]'));
        const index = visible.indexOf(doc.activeElement as HTMLButtonElement);
        const firstOption = visible.find(button => button.getAttribute('role') === 'option') ?? visible[0];
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (index < 0) { firstOption?.focus(); return; }
            const next = index + (event.key === 'ArrowDown' ? 1 : -1);
            if (next < 0 && index >= 0) search.focus();
            else visible[Math.max(0, Math.min(visible.length - 1, next))]?.focus();
        } else if (event.key === 'Enter' && doc.activeElement === search) {
            event.preventDefault(); firstOption?.click();
        } else if (index >= 0 && (event.key === 'Home' || event.key === 'End')) {
            event.preventDefault(); visible[event.key === 'Home' ? 0 : visible.length - 1]?.focus();
        }
    });
    panel.addEventListener('focusout', event => {
        if (event.relatedTarget instanceof view.HTMLElement && !panel.contains(event.relatedTarget) && event.relatedTarget !== trigger) close();
    });
    filter();
}
