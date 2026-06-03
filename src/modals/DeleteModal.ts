/**
 * LOREBASE - Delete Modal
 * Confirmation modal for deleting games
 */

import { Modal, App } from 'obsidian';
import { MediaItem, MediaStatus } from '../types';
import { t, i18n } from '../localization';

// =============================================================================
// DELETE MODAL
// =============================================================================

/**
 * Modal for confirming game deletion
 */
export class DeleteModal extends Modal {
    private item: MediaItem;
    private onConfirm: () => Promise<void>;

    constructor(
        app: App,
        game: MediaItem,
        onConfirm: () => Promise<void>
    ) {
        super(app);
        this.item = game;
        this.onConfirm = onConfirm;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('lorebase-delete-modal');

        // Header with icon
        const header = contentEl.createDiv({ cls: 'lorebase-delete-header' });
        const headerIcon = header.createDiv({ cls: 'lorebase-delete-icon' });
        headerIcon.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                <path d="M6 6v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6"/>
                <line x1="10" y1="11" x2="10" y2="17"/>
                <line x1="14" y1="11" x2="14" y2="17"/>
            </svg>
        `;
        const headerText = header.createDiv({ cls: 'lorebase-delete-header-text' });
        const isAnime = this.item.type === 'anime';
        headerText.createEl('h2', { text: isAnime ? t('deleteTitleAnime') : t('deleteTitle') });
        headerText.createEl('p', { cls: 'lorebase-delete-subtitle', text: isAnime ? t('deleteSubtitleAnime') : t('deleteSubtitle') });

        // Game info
        const gameInfo = contentEl.createDiv({ cls: 'lorebase-delete-game-info' });

        const poster = gameInfo.createEl('img', {
            cls: 'lorebase-delete-poster',
            attr: { src: this.item.imageUrl, alt: this.item.displayName }
        });

        const details = gameInfo.createDiv({ cls: 'lorebase-delete-details' });
        details.createEl('h3', { text: this.item.displayName });

        details.createEl('p').innerHTML = `<strong>${t('year')}:</strong> ${this.item.year || t('yearNotSpecified')}`;

        const statusLabels: Record<MediaStatus, string> = i18n.getStatusLabels() as Record<MediaStatus, string>;
        let statusLabel = statusLabels[this.item.status] ?? t('statusNotStarted');
        if (this.item.status === 'completed' && !isAnime) {
            statusLabel = t('statusPlayed');
        }
        details.createEl('p').innerHTML = `<strong>${t('status')}:</strong> ${statusLabel}`;

        // Warning line
        contentEl.createDiv({
            cls: 'lorebase-delete-warning',
            text: t('deleteWarning')
        });

        // Confirmation checkbox
        const confirmRow = contentEl.createDiv({ cls: 'lorebase-delete-confirm' });
        const checkboxId = `lorebase-delete-ack-${Date.now()}`;
        const confirmCheckbox = confirmRow.createEl('input', {
            type: 'checkbox',
            cls: 'lorebase-delete-checkbox'
        });
        confirmCheckbox.setAttr('id', checkboxId);

        const confirmLabel = confirmRow.createEl('label', {
            text: isAnime ? t('deleteConfirmAckAnime') : t('deleteConfirmAck'),
            cls: 'lorebase-delete-confirm-label'
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
            text: t('deleteConfirm'),
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
                console.error('Error deleting game:', e);
                syncConfirmState();
                confirmBtn.textContent = t('deleteConfirm');
            }
        });
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
}
