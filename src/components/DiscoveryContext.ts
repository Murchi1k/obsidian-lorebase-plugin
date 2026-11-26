import { setIcon, type App } from 'obsidian';
import type { DiscoveryContext, MediaItem } from '../types';
import { normalizeDiscovery } from '../utils/discovery';
import { collectRecommenders } from '../utils/recommenders';
import { dt } from '../localization/discovery';
import { notesPersonalFields } from './NotesPersonalFields';
import { createPersonalNoteDisclosure } from './PersonalNoteDisclosure';

let discoveryId = 0;
function element<K extends keyof HTMLElementTagNameMap>(parent: HTMLElement, tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
    return parent.createEl(tag, { cls, text });
}

export function mountDiscovery(root: HTMLElement, initial: unknown, changed: (value: DiscoveryContext | undefined) => void, app?: App): void {
    if (root.querySelector('.lorebase-discovery')) return;
    const host=notesPersonalFields(root);
    if(!host) return;
    const disclosure=createPersonalNoteDisclosure(host,{cls:'lorebase-discovery',title:dt('title'),icon:'notebook-pen'});
    const {field:details,trigger:summary,body}=disclosure;
    body.classList.add('lorebase-discovery-body');
    const draft = { reason: '', recommendedBy: '', ...normalizeDiscovery(initial) };
    const syncSummary=():void=>{
        const value=[draft.recommendedBy.trim(),draft.reason.trim()].filter(Boolean).join(' · ');
        summary.title=value || dt('hint');
        details.classList.toggle('has-value',Boolean(value));
    };
    const id = ++discoveryId;
    for (const [key, title] of [['recommendedBy', dt('person')], ['reason', dt('reason')]] as const) {
        const field = element(body, 'div', 'lorebase-discovery-field');
        const label = element(field, 'label', '', title);
        const input = key === 'reason' ? element(field, 'textarea', '') : element(field, 'input', '');
        input.id = `lorebase-discovery-${id}-${key}`; label.htmlFor = input.id;
        if (key === 'reason') (input as HTMLTextAreaElement).rows = 2;
        input.dataset.discoveryField = key; input.value = draft[key];
        input.placeholder=dt(key==='recommendedBy' ? 'personPlaceholder' : 'reasonPlaceholder');
        input.addEventListener('input', () => { draft[key] = input.value; syncSummary(); changed(normalizeDiscovery(draft)); });
        if (key === 'recommendedBy') mountRecommenderSuggestions(field, input as HTMLInputElement, details, app, draft.recommendedBy);
    }
    details.addEventListener('lorebase-personal-note-toggle',syncSummary);
    syncSummary();
}

function mountRecommenderSuggestions(field: HTMLElement, input: HTMLInputElement, details: HTMLElement, app: App | undefined, initial: string): void {
    const panel = element(field, 'div', 'lorebase-discovery-suggestions');
    panel.id = input.id + '-suggestions'; panel.hidden = true; panel.setAttribute('role', 'listbox'); panel.setAttribute('aria-label', dt('person'));
    input.autocomplete = 'off'; input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', panel.id); input.setAttribute('aria-expanded', 'false');
    let names: string[] = [], shown: string[] = [], active = -1;
    const close = (): void => {
        panel.hidden = true; active = -1;
        input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant');
    };
    const highlight = (): void => {
        Array.from(panel.children).forEach((option, index) => {
            option.classList.toggle('is-active', index === active); option.setAttribute('aria-selected', String(index === active));
        });
        if (active >= 0) input.setAttribute('aria-activedescendant', panel.children[active].id);
        else input.removeAttribute('aria-activedescendant');
    };
    const choose = (name: string): void => {
        input.value = name;
        input.dispatchEvent(new input.ownerDocument.defaultView!.Event('input', { bubbles: true }));
        input.focus({ preventScroll: true }); close();
    };
    const render = (): void => {
        const query = input.value.trim().normalize('NFKC').toLocaleLowerCase();
        shown = names.filter(name => name.normalize('NFKC').toLocaleLowerCase().includes(query)).slice(0, 8);
        panel.replaceChildren(); active = -1;
        for (const [index, name] of shown.entries()) {
            const option = element(panel, 'button', '', name);
            option.type = 'button'; option.tabIndex = -1; option.id = panel.id + '-' + index;
            option.setAttribute('role', 'option'); option.setAttribute('aria-selected', 'false');
            option.addEventListener('click', () => choose(name));
        }
        panel.hidden = !shown.length; input.setAttribute('aria-expanded', String(Boolean(shown.length))); highlight();
    };
    input.addEventListener('focus', () => { names = collectRecommenders(app, initial); render(); });
    input.addEventListener('input', render);
    input.addEventListener('keydown', event => {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (event.key === 'Escape' && !panel.hidden) { event.preventDefault(); event.stopPropagation(); close(); }
        else if (event.key === 'Enter' && !panel.hidden && active >= 0) { event.preventDefault(); event.stopPropagation(); choose(shown[active]); }
        else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            if (panel.hidden) render();
            if (!shown.length) return;
            event.preventDefault(); event.stopPropagation();
            active = (active + (event.key === 'ArrowDown' ? 1 : active < 0 ? 0 : -1) + shown.length) % shown.length;
            highlight(); panel.children[active]?.scrollIntoView({ block: 'nearest' });
        }
    });
    field.addEventListener('focusout', event => {
        if (!(event.relatedTarget instanceof input.ownerDocument.defaultView!.Node) || !field.contains(event.relatedTarget)) close();
    });
    details.addEventListener('lorebase-personal-note-toggle', () => { if (!details.classList.contains('is-open')) close(); });
}

export function renderDiscoveryMark(parent: HTMLElement, item: Pick<MediaItem, 'discovery'>, enabled = true): void {
    parent.querySelector('.lorebase-discovery-mark')?.remove();
    if (!enabled || !normalizeDiscovery(item.discovery)) return;
    const icon = element(parent, 'span', 'lorebase-discovery-mark'); icon.setAttribute('role', 'img'); icon.title = dt('title'); icon.setAttribute('aria-label', dt('title')); setIcon(icon, 'notebook-pen');
}
