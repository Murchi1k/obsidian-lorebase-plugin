import { App, Modal, setIcon } from 'obsidian';
import { t } from '../localization';
import { personalDateText } from '../localization/personalDates';
import { UNKNOWN_DATE } from '../utils/personalDates';
import { HierarchicalDatePicker, validateDatePickers } from './HierarchicalDatePicker';

/** Completing an old title requires a real date choice, never an automatic 'today'. */
export class CompletionDateModal extends Modal {
    private value = '';
    private picker?: HierarchicalDatePicker;
    private resolve?: (date: string | null) => void;
    constructor(app: App, private title: string) { super(app); }
    openAndGetValue(): Promise<string | null> { return new Promise(resolve => { this.resolve = resolve; this.open(); }); }
    onOpen(): void {
        this.contentEl.createEl('h2', { text: personalDateText('completion') });
        this.contentEl.createEl('p', { text: this.title });
        this.contentEl.createEl('p', { text: personalDateText('hint'), cls: 'lorebase-completion-hint' });
        const field = this.contentEl.createDiv({ cls: 'lorebase-completion-date-field' });
        const input = field.createEl('input', { attr: { type: 'text', 'aria-label': personalDateText('completion') } });
        const trigger = field.createEl('button', { attr: { type: 'button', 'aria-label': personalDateText('exact') } }); setIcon(trigger, 'calendar-days');
        this.picker = new HierarchicalDatePicker(input, trigger, () => this.value, value => this.value = value, { allowPartial: true, allowUnknown: true });
        this.picker.syncInput(); input.placeholder = '2019';
        const options = this.contentEl.createDiv({ cls: 'lorebase-completion-date-actions' });
        const unknown = options.createEl('button', { text: personalDateText('unknown'), attr: { type: 'button' } });
        unknown.addEventListener('click', () => this.finish(UNKNOWN_DATE));
        const today = options.createEl('button', { text: t('editToday'), attr: { type: 'button' } });
        today.addEventListener('click', () => {
            const now = new Date();
            this.finish(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`);
        });
        const actions = this.contentEl.createDiv({ cls: 'lorebase-modal-actions' });
        actions.createEl('button', { text: t('commonCancel'), attr: { type: 'button' } }).addEventListener('click', () => this.close());
        actions.createEl('button', { text: t('editSave'), cls: 'mod-cta', attr: { type: 'button' } }).addEventListener('click', () => {
            if (this.picker && validateDatePickers([this.picker])) this.finish(this.value || UNKNOWN_DATE);
        });
    }
    private finish(value: string): void { const resolve = this.resolve; this.resolve = undefined; resolve?.(value); this.close(); }
    onClose(): void { this.picker?.destroy(); this.resolve?.(null); this.resolve = undefined; this.contentEl.empty(); }
}
