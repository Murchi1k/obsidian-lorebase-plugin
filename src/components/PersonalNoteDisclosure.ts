import { setIcon } from 'obsidian';

let nextId = 0;

/** Keep the compact controls in one row and open their fields in the row below. */
export function createPersonalNoteDisclosure(host: HTMLElement, options: { cls: string; title: string; icon: string }) {
    const field = host.createDiv({ cls: `lorebase-personal-note ${options.cls}` });
    const id = `lorebase-personal-note-${++nextId}`;
    const trigger = field.createEl('button', { cls: 'lorebase-personal-note-trigger', attr: {
        type: 'button', id: `${id}-trigger`, 'aria-expanded': 'false', 'aria-controls': `${id}-body`,
    } });
    const icon = trigger.createSpan({ cls: 'lorebase-personal-note-icon', attr: { 'aria-hidden': 'true' } });
    setIcon(icon, options.icon);
    const copy = trigger.createSpan({ cls: 'lorebase-personal-note-copy' });
    const title = copy.createSpan({ cls: 'lorebase-personal-note-title', text: options.title });
    const caret = trigger.createSpan({ cls: 'lorebase-personal-note-caret', attr: { 'aria-hidden': 'true' } });
    setIcon(caret, 'chevron-down');
    const body = field.createDiv({ cls: 'lorebase-personal-note-body', attr: {
        id: `${id}-body`, role: 'region', 'aria-labelledby': trigger.id,
    } });
    body.hidden = true;
    let disabled = false;
    const isOpen = (): boolean => !body.hidden;
    const setOpen = (open: boolean): void => {
        if ((open && disabled) || open === isOpen()) return;
        if (open) host.querySelectorAll<HTMLButtonElement>('.lorebase-personal-note.is-open > .lorebase-personal-note-trigger')
            .forEach(other => { if (other !== trigger) other.click(); });
        body.hidden = !open; field.classList.toggle('is-open', open);
        trigger.setAttribute('aria-expanded', String(open));
        field.dispatchEvent(new field.ownerDocument.defaultView!.CustomEvent('lorebase-personal-note-toggle', { detail: open }));
    };
    trigger.addEventListener('click', () => setOpen(!isOpen()));
    const setDisabled = (value: boolean): void => {
        disabled = value; if (disabled) setOpen(false);
        field.classList.toggle('is-disabled', disabled);
        trigger.setAttribute('aria-disabled', String(disabled));
        setIcon(caret, disabled ? 'lock-keyhole' : 'chevron-down');
    };
    return { field, trigger, icon, title, body, isOpen, setOpen, setDisabled };
}
