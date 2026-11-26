import { setIcon } from 'obsidian';
import { i18n, t } from '../localization';
import { HierarchicalDatePicker } from '../modals/HierarchicalDatePicker';
import { normalizeProgress, stepProgress } from '../utils/progress';
import { normalizeRepeatCount } from '../utils/repeatTracking';
import { normalizeChapterPosition, stepChapterPosition } from '../utils/mangaChapters';

export function createManualDate(parent: HTMLElement, label: string, get: () => string, change: (value: string) => void): HierarchicalDatePicker {
    const field = parent.createDiv({ cls: 'lorebase-editmode-field lorebase-editmode-date-field' });
    field.createSpan({ cls: 'lorebase-editmode-field-label', text: label });
    const row = field.createDiv({ cls: 'lorebase-editmode-date-control' });
    const trigger = row.createEl('button', { cls: 'lorebase-editmode-date-control-icon', attr: { type: 'button', 'aria-label': label, title: label } });
    setIcon(trigger, 'calendar-days');
    const input = row.createEl('input', { cls: 'lorebase-editmode-input', attr: { type: 'text', inputmode: 'numeric', maxlength: '10', 'aria-label': label } });
    const release=label === t('templateFieldReleased');
    if(release) {input.removeAttribute('maxlength');input.removeAttribute('inputmode');}
    const picker = new HierarchicalDatePicker(input, trigger, get, change, { allowPartial: release || label === t('editStarted') || label === t('editFinished'), allowUnknown: release || label === t('editFinished'), allowQuarter:release });
    picker.syncInput();
    return picker;
}

/** The same rings and bounded stepper used by the reading editor. Updates in place to retain focus. */
export function createManualProgress(parent: HTMLElement, label: string, currentLabel: string, totalLabel: string,
    getCurrent: () => number | null, getTotal: () => number | null,
    setCurrent: (value: number | null) => void, setTotal: (value: number | null) => void, color: string, fractional=false): void {
    const panel = parent.createDiv({ cls: 'lorebase-manual-progress-card' });
    const meter = panel.createDiv({ cls: 'lorebase-reading-progress-meter', attr: { 'aria-live': 'polite' } });
    meter.style.setProperty('--reading-progress-color', color);
    meter.createDiv({ cls: 'lorebase-reading-progress-ring' });
    const body = meter.createDiv({ cls: 'lorebase-reading-progress-body' });
    const count = body.createDiv({ cls: 'lorebase-reading-progress-count' });
    const currentText = count.createSpan({ cls: 'lorebase-reading-progress-current' });
    const totalText = count.createSpan({ cls: 'lorebase-reading-progress-total' });
    body.createDiv({ cls: 'lorebase-reading-progress-label', text: label });
    const fields = panel.createDiv({ cls: 'lorebase-manual-progress-inputs' });
    const field = fields.createDiv({ cls: 'lorebase-editmode-field' });
    field.createSpan({ cls: 'lorebase-editmode-field-label', text: currentLabel });
    const row = field.createDiv({ cls: 'lorebase-manual-progress-stepper' });
    const minus = row.createEl('button', { text: '−', attr: { type: 'button', 'aria-label': `${currentLabel} −1` } });
    const current = row.createEl('input', { cls: 'lorebase-editmode-input', attr: { type: 'number', min: '0', step: '1', 'aria-label': currentLabel } });
    if(fractional) current.step='any';
    const plus = row.createEl('button', { text: '+', attr: { type: 'button', 'aria-label': `${currentLabel} +1` } });
    const totalField = fields.createDiv({ cls: 'lorebase-editmode-field' });
    totalField.createSpan({ cls: 'lorebase-editmode-field-label', text: totalLabel });
    const total = totalField.createEl('input', { cls: 'lorebase-editmode-input', attr: { type: 'number', min: '0', step: '1', 'aria-label': totalLabel, placeholder: '—' } });
    const parse = (value: string): number | null => value.trim() && Number.isFinite(Number(value)) ? Math.max(0, Math.trunc(Number(value))) : null;
    const refresh = (): void => {
        const c = getCurrent(), n = getTotal();
        current.value = c === null ? '' : String(c); total.value = n === null ? '' : String(n);
        currentText.textContent = String(fractional ? Math.floor(c ?? 0) : c ?? 0); totalText.textContent = ` / ${n ?? '?'}`;
        meter.style.setProperty('--reading-progress', `${n && n > 0 ? Math.min(100, (c ?? 0) / n * 100) : 0}%`);
        minus.disabled = !c; plus.disabled = Boolean(n && n > 0 && (c ?? 0) >= n);
    };
    current.addEventListener('input', () => { setCurrent(fractional ? normalizeChapterPosition(current.value,getTotal()) : normalizeProgress(parse(current.value), getTotal())); if(!fractional) refresh(); });
    total.addEventListener('input', () => { setTotal(parse(total.value)); setCurrent(fractional ? normalizeChapterPosition(getCurrent(),getTotal()) : normalizeProgress(getCurrent(), getTotal())); refresh(); });
    minus.addEventListener('click', () => { setCurrent(fractional ? stepChapterPosition(getCurrent(),-1,getTotal()) : stepProgress(getCurrent(), -1, getTotal())); refresh(); });
    plus.addEventListener('click', () => { setCurrent(fractional ? stepChapterPosition(getCurrent(),1,getTotal()) : stepProgress(getCurrent(), 1, getTotal())); refresh(); });
    refresh();
}

export function createManualGroup(parent: HTMLElement, title: string): HTMLElement {
    const group = parent.createEl('section', { cls: 'lorebase-manual-detail-group' });
    group.createEl('h3', { text: title });
    return group.createDiv({ cls: 'lorebase-manual-section-grid' });
}

export function createManualTracking(parent: HTMLElement, open: boolean, change: (open: boolean) => void): HTMLElement {
    const details = parent.createEl('details', { cls: 'lorebase-manual-main-tracking' });
    details.open = open;
    const summary = details.createEl('summary', { cls: 'lorebase-manual-tracking-summary' });
    setIcon(summary.createSpan({ cls: 'lorebase-manual-tracking-icon', attr: { 'aria-hidden': 'true' } }), 'sliders-horizontal');
    summary.createSpan({ text: t('editTracking') });
    setIcon(summary.createSpan({ cls: 'lorebase-manual-tracking-chevron', attr: { 'aria-hidden': 'true' } }), 'chevron-right');
    details.addEventListener('toggle', () => { if (details.isConnected) change(details.open); });
    const section = details.createDiv({ cls: 'lorebase-manual-detail-group' });
    return section.createDiv({ cls: 'lorebase-manual-section-grid' });
}

export function createManualNotes(parent: HTMLElement, description: string, notes: string, change: (key: 'description' | 'myNotes', value: string) => void): void {
    const section = parent.createEl('section', { cls: 'lorebase-manual-notes is-wide' });
    const modes = section.createDiv({ cls: 'lorebase-manual-note-modes', attr: { role: 'group', 'aria-label': t('editDescription') } });
    const labels = { description: t('editDescription'), myNotes: ({ ru: 'Мои заметки', uk: 'Мої нотатки', en: 'My notes', 'zh-CN': '我的笔记' })[i18n.getLanguage()] };
    const values = { description, myNotes: notes };
    let active: 'description' | 'myNotes' = 'description';
    const input = section.createEl('textarea', { cls: 'lorebase-editmode-input lorebase-manual-textarea', attr: { rows: '5' } });
    const refresh = (): void => {
        input.value = values[active];
        input.setAttribute('aria-label', labels[active]);
        input.placeholder = t(active === 'description' ? 'editDescriptionPlaceholder' : 'editMyNotesPlaceholder');
        modes.querySelectorAll<HTMLButtonElement>('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.noteMode === active)));
    };
    for (const key of ['description', 'myNotes'] as const) {
        const button = modes.createEl('button', { text: labels[key], attr: { type: 'button', 'data-note-mode': key } });
        button.addEventListener('click', () => { active = key; refresh(); });
    }
    input.addEventListener('input', () => { values[active] = input.value; change(active, input.value); });
    refresh();
}

export function createManualRepeatCounter(parent: HTMLElement, label: string, initial: number, change: (value: number) => void): void {
    const field = parent.createDiv({ cls: 'lorebase-manual-repeat-field' });
    field.createSpan({ cls: 'lorebase-editmode-field-label', text: label });
    const row = field.createDiv({ cls: 'lorebase-manual-counter' });
    const minus = row.createEl('button', { text: '−', attr: { type: 'button', 'aria-label': `${label} −1` } });
    const input = row.createEl('input', { attr: { type: 'number', min: '0', step: '1', inputmode: 'numeric', 'aria-label': label } });
    const plus = row.createEl('button', { text: '+', attr: { type: 'button', 'aria-label': `${label} +1` } });
    const refresh = (value: number): void => { input.value = String(value); minus.disabled = value === 0; };
    const update = (value: unknown): void => { const count = normalizeRepeatCount(value); change(count); refresh(count); };
    input.addEventListener('input', () => { const count = normalizeRepeatCount(input.value); change(count); minus.disabled = count === 0; });
    input.addEventListener('blur', () => update(input.value));
    minus.addEventListener('click', () => update(normalizeRepeatCount(input.value) - 1));
    plus.addEventListener('click', () => update(normalizeRepeatCount(input.value) + 1));
    refresh(normalizeRepeatCount(initial));
}

export function createManualToggle(parent: HTMLElement, label: string, initial: boolean, change: (value: boolean) => void): void {
    const row = parent.createDiv({ cls: 'lorebase-editmode-switch-row' });
    row.createSpan({ cls: 'lorebase-editmode-switch-label', text: label });
    const button = row.createEl('button', { cls: 'lorebase-editmode-switch', attr: { type: 'button', role: 'switch', 'aria-label': label, 'aria-checked': String(initial) } });
    button.createSpan({ cls: 'lorebase-editmode-switch-thumb' });
    button.toggleClass('is-active', initial);
    button.addEventListener('click', () => {
        const next = button.getAttribute('aria-checked') !== 'true';
        button.setAttribute('aria-checked', String(next)); button.toggleClass('is-active', next); change(next);
    });
}
