import { setIcon } from 'obsidian';
import { t } from '../localization';
import { notesReaderText as text } from '../localization/notesReader';
import { descriptionExcerpt, descriptionParagraphs } from '../utils/descriptionParagraphs';

const readers = new WeakMap<HTMLElement, { sync: () => void; focus: (preventScroll: boolean) => void }>();

function panelIn(root: HTMLElement): HTMLElement | null {
    return root.matches('.lorebase-editmode-notes') ? root : root.querySelector('.lorebase-editmode-notes');
}

export function mountNotesReader(panel: HTMLElement): void {
    if (readers.has(panel)) return;
    const input = panel.querySelector<HTMLTextAreaElement>('.lorebase-editmode-notes-input');
    const shell = panel.querySelector<HTMLElement>('.lorebase-editmode-notes-shell');
    const tabs = panel.querySelector<HTMLElement>('.lorebase-editmode-note-tabs');
    if (!input || !shell || !tabs) return;
    let header = tabs.parentElement!;
    if (!header.classList.contains('lorebase-editmode-panel-title-row')) {
        header = panel.ownerDocument.createElement('div'); header.className = 'lorebase-editmode-panel-title-row';
        tabs.before(header); header.append(tabs);
    }
    const edit = header.createEl('button', { cls: 'lorebase-notes-edit-action', attr: { type: 'button', 'data-action': 'edit-description' } });
    const editIcon = edit.createSpan({ attr: { 'aria-hidden': 'true' } });
    const editLabel = edit.createSpan();
    const reader = shell.createDiv({ cls: 'lorebase-notes-reader' });
    const content = reader.createEl('article', { cls: 'lorebase-notes-reader-content', attr: { tabindex: '0', 'aria-label': t('editDescription') } });
    const more = reader.createEl('button', { cls: 'lorebase-notes-read-more', attr: { type: 'button', 'data-action': 'expand-description', 'aria-expanded': 'false' } });
    const addNote = reader.createEl('button', { cls: 'lorebase-notes-add-action', attr: { type: 'button', 'data-action': 'add-my-notes' } });
    setIcon(addNote.createSpan({ attr: { 'aria-hidden': 'true' } }), 'plus');
    addNote.createSpan({ text: text('addNote') });
    let mode = '', editing = false, expanded = false, lastText: string | undefined;
    let paragraphs: string[] = [];
    const render = (): void => {
        const excerpt = descriptionExcerpt(paragraphs);
        content.replaceChildren();
        for (const paragraph of expanded ? paragraphs : excerpt.paragraphs) content.createEl('p', { text: paragraph });
        const emptyNotes = mode === 'myNotes' && !paragraphs.length;
        content.hidden = emptyNotes; addNote.hidden = !emptyNotes;
        if (!paragraphs.length && !emptyNotes) content.createEl('p', { cls: 'is-empty', text: text('empty') });
        more.hidden = !excerpt.shortened;
        more.textContent = text(expanded ? 'less' : 'more');
        more.setAttribute('aria-expanded', String(expanded));
    };
    const sync = (): void => {
        const nextMode = panel.querySelector<HTMLElement>('.lorebase-editmode-note-tab.is-active')?.dataset.mode ?? 'description';
        if (mode !== nextMode) { mode = nextMode; editing = false; expanded = false; lastText = undefined; }
        const reading = !editing;
        panel.classList.toggle('is-reading-notes', reading);
        input.hidden = reading; reader.hidden = !reading;
        edit.hidden = reading && mode === 'myNotes' && !input.value.trim();
        edit.dataset.action = mode === 'myNotes' ? 'edit-my-notes' : 'edit-description';
        more.dataset.action = mode === 'myNotes' ? 'expand-my-notes' : 'expand-description';
        content.setAttribute('aria-label', t(mode === 'myNotes' ? 'editMyNotes' : 'editDescription'));
        editLabel.textContent = text(editing ? 'done' : 'edit'); setIcon(editIcon, editing ? 'check' : 'pencil');
        edit.setAttribute('aria-pressed', String(editing));
        if (reading && lastText !== input.value) {
            lastText = input.value; paragraphs = descriptionParagraphs(input.value); render();
        }
    };
    const focus = (preventScroll: boolean): void => (reader.hidden ? input : addNote.hidden ? content : addNote).focus({ preventScroll });
    const toggleEditing = (): void => { editing = !editing; sync(); focus(true); };
    edit.addEventListener('click', toggleEditing);
    addNote.addEventListener('click', toggleEditing);
    more.addEventListener('click', () => { expanded = !expanded; render(); });
    readers.set(panel, { sync, focus });
    sync();
}

/** Call after assigning a new textarea value or switching the active notes tab. */
export function syncNotesReader(root: HTMLElement): void {
    const panel = panelIn(root); if (panel) readers.get(panel)?.sync();
}

export function focusNotesContent(root: HTMLElement, preventScroll = false): void {
    const panel = panelIn(root); if (!panel) return;
    const reader = readers.get(panel);
    if (reader) reader.focus(preventScroll);
    else panel.querySelector<HTMLTextAreaElement>('.lorebase-editmode-notes-input')?.focus({ preventScroll });
}
