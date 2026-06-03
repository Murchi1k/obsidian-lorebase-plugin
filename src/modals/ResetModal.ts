/**
 * LOREBASE - Reset Modal
 * Confirmation modal for resetting settings
 */

import { Modal, App } from 'obsidian';
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

        // Header with icon
        const header = contentEl.createDiv({ cls: 'lorebase-reset-header' });
        header.innerHTML = `
            <div class="lorebase-reset-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
            </div>
        `;
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

        confirmBtn.addEventListener('click', async () => {
            confirmBtn.disabled = true;
            confirmBtn.textContent = '...';

            try {
                await this.onConfirm();
                this.close();
            } catch (e) {
                console.error('Error resetting settings:', e);
                confirmBtn.disabled = false;
                confirmBtn.textContent = t('resetConfirm');
            }
        });
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
}
