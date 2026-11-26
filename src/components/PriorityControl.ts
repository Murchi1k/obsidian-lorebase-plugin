import { setIcon } from 'obsidian';
import type { MediaPriority } from '../types';
import { MEDIA_PRIORITIES, normalizePriority } from '../utils/priority';
import { pt } from '../localization/priority';
import { createLorebaseDropdown } from './LorebaseDropdown';

/** Priority stays below quick settings and edits only the modal draft. */
export function bindPriority(root: HTMLElement, value: unknown, changed: (value: MediaPriority) => void): void {
    if (root.querySelector('.lorebase-priority-control')) return;
    const quick = root.querySelector<HTMLElement>('.lorebase-editmode-quick-settings');
    const parent = quick?.parentElement ?? root.querySelector<HTMLElement>('.lorebase-editmode-status-rating') ?? root;
    const field = parent.createEl('section', { cls: 'lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-priority-control' });
    field.dataset.mobilePane = 'personal';
    if (quick) quick.after(field);
    const heading = field.createDiv({ cls: 'lorebase-priority-heading' });
    setIcon(heading.createSpan({ attr: { 'aria-hidden': 'true' } }), 'flag');
    heading.createSpan({ text: pt('priority') });
    field.dataset.priority = normalizePriority(value);
    const dropdown = field.createDiv({ cls: 'lorebase-priority-dropdown' });
    createLorebaseDropdown(dropdown, MEDIA_PRIORITIES.map(priority => ({ value: priority, label: pt(priority) })), normalizePriority(value), priority => {
        field.dataset.priority = priority; changed(priority);
    }, { floating: true, panelClass: 'lorebase-priority-options' });
    dropdown.querySelector('button')?.setAttribute('aria-label', pt('priority'));
}
