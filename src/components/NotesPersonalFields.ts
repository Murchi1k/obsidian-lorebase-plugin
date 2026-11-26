import { setIcon } from 'obsidian';
import { mountNotesReader } from './NotesReader';

/** Keep personal context with the description and the user's notes. */
export function notesPersonalFields(root: HTMLElement): HTMLElement | null {
    const notes=root.querySelector<HTMLElement>('.lorebase-editmode-notes');
    if(!notes) return null;
    const existing=notes.querySelector<HTMLElement>('.lorebase-notes-personal-fields');
    if(existing) return existing;
    notes.classList.add('lorebase-notes-editor');
    mountNotesReader(notes);
    for(const tab of Array.from(notes.querySelectorAll<HTMLElement>('.lorebase-editmode-note-tab'))) {
        const icon=notes.ownerDocument.createElement('span');
        icon.className='lorebase-note-tab-icon';icon.setAttribute('aria-hidden','true');
        setIcon(icon,tab.dataset.mode==='myNotes' ? 'notebook-pen' : 'align-left');
        tab.prepend(icon);
    }
    const section=notes.createDiv({cls:'lorebase-notes-personal-context'});
    notes.insertBefore(section,notes.querySelector('.lorebase-editmode-notes-shell'));
    return section.createDiv({cls:'lorebase-notes-personal-fields'});
}

