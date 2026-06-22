/**
 * LOREBASE - Reset Modal
 * Confirmation modal for resetting settings
 */

import { Modal, App, setIcon } from 'obsidian';
import { t } from '../localization';

// =============================================================================
// RESET MODAL
// =============================================================================

/**
 * Modal for confirming settings reset
 */
export class ResetModal extends Modal {
    private onConfirm: () => Promise<void>;

    constructor(
        app: App,
        onConfirm: () => Promise<void>
    ) {
        super(app);
        this.onConfirm = onConfirm;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('lorebase-reset-modal');
        this.modalEl.addClass('lorebase-reset-modal-container');

        // Header with icon
        const header = contentEl.createDiv({ cls: 'lorebase-reset-header' });
        const headerIcon = header.createDiv({ cls: 'lorebase-reset-icon' });
        setIcon(headerIcon, 'triangle-alert');
        header.createEl('h2', { text: t('resetTitle') });
        header.createEl('p', { cls: 'lorebase-reset-subtitle', text: t('resetSubtitle') });

        // Warning line
        const warning = contentEl.createDiv({ cls: 'lorebase-reset-warning' });
        warning.createSpan({ text: t('resetWarning') });

        // Confirmation checkbox
        const confirmRow = contentEl.createDiv({ cls: 'lorebase-reset-confirm' });
        const checkboxId = `lorebase-reset-ack-${Date.now()}`;
        const confirmCheckbox = confirmRow.createEl('input', {
            type: 'checkbox',
            cls: 'lorebase-reset-checkbox'
        });
        confirmCheckbox.setAttr('id', checkboxId);

        const confirmLabel = confirmRow.createEl('label', {
            text: t('resetConfirmAck'),
            cls: 'lorebase-reset-confirm-label'
        });
        confirmLabel.setAttr('for', checkboxId);

        // Buttons
        const buttons = contentEl.createDiv({ cls: 'lorebase-delete-buttons' });

        const cancelBtn = buttons.createEl('button', {
            text: t('deleteCancel'),
            cls: 'lorebase-btn'
        });
        cancelBtn.addEventListener('click', () => this.close());

        const confirmBtn = buttons.createEl('button', {
            text: t('resetConfirm'),
            cls: 'lorebase-btn lorebase-btn-danger'
        });
        confirmBtn.disabled = true;

        const syncConfirmState = (): void => {
            confirmBtn.disabled = !confirmCheckbox.checked;
        };
        confirmCheckbox.addEventListener('change', syncConfirmState);
        syncConfirmState();

        confirmBtn.addEventListener('click', () => {
            confirmBtn.disabled = true;
            confirmBtn.textContent = '...';

            void this.onConfirm()
                .then(() => this.close())
                .catch((error: unknown) => {
                    console.error('Error resetting settings:', error);
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = t('resetConfirm');
                });
        });
    }

    onClose(): void {
        const { contentEl } = this;
        this.modalEl.removeClass('lorebase-reset-modal-container');
        contentEl.empty();
    }
}
