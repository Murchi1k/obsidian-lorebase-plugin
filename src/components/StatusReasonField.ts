import { setIcon, type App } from 'obsidian';
import { personalNotesText as text } from '../localization/personalNotes';
import { normalizeStatusReasons, type StatusReasons } from '../utils/statusReasons';
import { notesPersonalFields } from './NotesPersonalFields';
import { createPersonalNoteDisclosure } from './PersonalNoteDisclosure';

let nextId = 0;
export function mountStatusReason(root: HTMLElement, initial: unknown, status: string, changed: (value: StatusReasons | undefined) => void, app?: App): void {
    if (root.querySelector('.lorebase-status-reason')) return;
    const host=notesPersonalFields(root);
    if(!host) return;
    const draft: StatusReasons = {...normalizeStatusReasons(initial)};
    const disclosure = createPersonalNoteDisclosure(host, { cls: 'lorebase-status-reason', title: text('droppedTitle'), icon: 'circle-x' });
    const { field, trigger, icon, title, body } = disclosure;
    const inputId = `lorebase-status-reason-${++nextId}`;
    body.createEl('label',{text:text('reasonLabel'),attr:{for:inputId}});
    const input = body.createEl('input',{cls:'lorebase-editmode-input',attr:{type:'text',id:inputId,'data-field':'status-reason'}});
    const list = field.createEl('datalist'); list.id = `${inputId}-suggestions`; input.setAttribute('list',list.id);
    const suggestions = new Set<string>();
    for (const file of app?.vault.getMarkdownFiles?.() ?? app?.vault.getFiles?.() ?? []) {
        const reasons = normalizeStatusReasons(app?.metadataCache.getFileCache(file)?.frontmatter?.status_reasons);
        for (const text of Object.values(reasons ?? {})) if (typeof text === 'string' && text) suggestions.add(text);
    }
    for (const text of Object.values(draft)) if (typeof text === 'string' && text) suggestions.add(text);
    for (const value of suggestions) list.createEl('option',{attr:{value}});
    host.prepend(field);
    let current = status;
    const syncPreview=():void=>{
        const value=input.value.trim();
        const enabled=current==='paused'||current==='dropped';
        trigger.title=enabled ? value || text('reasonHint') : text('unavailableHint');
        if(enabled) trigger.removeAttribute('aria-description');
        else trigger.setAttribute('aria-description',text('unavailableHint'));
        field.classList.toggle('has-value',Boolean(value));
    };
    const sync = (value: string): void => {
        if(current !== value) disclosure.setOpen(false);
        current = value;
        const enabled=value==='paused'||value==='dropped';
        disclosure.setDisabled(!enabled);input.disabled=!enabled;
        setIcon(icon,value==='paused' ? 'pause' : 'circle-x');
        title.textContent=text(value==='paused' ? 'pausedTitle' : 'droppedTitle');
        input.value = value === 'paused' || value === 'dropped' ? draft[value] ?? '' : '';
        input.placeholder=text(value==='paused' ? 'pausedExample' : 'droppedExample');
        input.setAttribute('aria-label',title.textContent);
        syncPreview();
    };
    input.addEventListener('input',()=>{
        if (current !== 'paused' && current !== 'dropped') return;
        draft[current] = input.value; syncPreview(); changed(normalizeStatusReasons(draft));
    });
    field.addEventListener('lorebase-personal-note-toggle',()=>{syncPreview();if(disclosure.isOpen()) input.focus({preventScroll:true});});
    root.addEventListener('lorebase-status-change',event=>sync((event as CustomEvent<string>).detail));
    sync(status);
}

export function syncStatusReason(root: HTMLElement, status: string): void {
    root.dispatchEvent(new root.ownerDocument.defaultView!.CustomEvent('lorebase-status-change',{detail:status}));
}
