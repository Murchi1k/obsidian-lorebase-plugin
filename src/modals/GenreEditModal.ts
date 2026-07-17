import { App, Modal, setIcon } from 'obsidian';
import { t } from '../localization';

export class GenreEditModal extends Modal {
    private values: string[];
    private onApply: (values: string[]) => void;

    constructor(app: App, values: string[], onApply: (values: string[]) => void) {
        super(app);
        this.values = this.normalizeList(values);
        this.onApply = onApply;
    }

    onOpen(): void {
        this.contentEl.empty();
        this.modalEl.addClass('lorebase-genre-modal-container');
        this.contentEl.addClass('lorebase-genre-modal', 'lorebase-modal-panel');

        const header = this.contentEl.createDiv({ cls: 'lorebase-genre-modal-header' });
        header.createEl('h3', { text: t('templateFieldGenres') });

        const body = this.contentEl.createDiv({ cls: 'lorebase-genre-modal-body' });
        const chips = body.createDiv({ cls: 'lorebase-genre-modal-chips' });
        const inputRow = body.createDiv({ cls: 'lorebase-genre-modal-input-row' });
        const input = inputRow.createEl('input', {
            cls: 'lorebase-editmode-input lorebase-genre-modal-input',
            attr: { type: 'text', placeholder: t('templateFieldGenres') },
        });
        const addButton = inputRow.createEl('button', {
            cls: 'lorebase-editmode-btn lorebase-editmode-btn-tight lorebase-genre-modal-add',
            attr: { type: 'button', 'aria-label': t('templateFieldGenres') },
        });
        setIcon(addButton, 'plus');

        const render = (): void => {
            chips.empty();
            for (const value of this.values) {
                const chip = chips.createEl('button', {
                    cls: 'lorebase-editmode-chip lorebase-genre-modal-chip',
                    attr: { type: 'button', title: t('editRemoveHint') },
                });
                chip.createSpan({ text: value });
                chip.createSpan({ cls: 'lorebase-genre-modal-chip-x', text: '×' });
                chip.addEventListener('click', () => {
                    this.values = this.values.filter((entry) => entry !== value);
                    render();
                });
            }
        };

        const addCurrent = (): void => {
            const normalized = this.normalize(input.value);
            if (!normalized || this.values.includes(normalized)) return;
            this.values.push(normalized);
            input.value = '';
            render();
            input.focus();
        };

        input.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            addCurrent();
        });
        addButton.addEventListener('click', addCurrent);

        const actions = this.contentEl.createDiv({ cls: 'lorebase-genre-modal-actions' });
        actions.createEl('button', {
            cls: 'lorebase-editmode-btn lorebase-editmode-btn-ghost',
            text: t('editCancel'),
            attr: { type: 'button' },
        }).addEventListener('click', () => this.close());
        actions.createEl('button', {
            cls: 'lorebase-editmode-btn lorebase-editmode-btn-primary',
            text: t('editSave'),
            attr: { type: 'button' },
        }).addEventListener('click', () => {
            addCurrent();
            this.onApply([...this.values]);
            this.close();
        });

        render();
        input.focus();
    }

    onClose(): void {
        this.contentEl.empty();
        this.modalEl.removeClass('lorebase-genre-modal-container');
    }

    private normalizeList(values: string[]): string[] {
        const unique = new Set<string>();
        for (const value of values) {
            const normalized = this.normalize(value);
            if (normalized) unique.add(normalized);
        }
        return Array.from(unique.values());
    }

    private normalize(value: string): string | null {
        const cleaned = value.trim().replace(/^#+/, '').toLowerCase();
        return cleaned || null;
    }
}
