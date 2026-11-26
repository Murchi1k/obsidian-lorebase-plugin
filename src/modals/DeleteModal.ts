
import { mt } from '../localization/music';
/**
 * LOREBASE - Delete Modal
 * Confirmation modal for deleting games
 */

import { Modal, App, setIcon } from 'obsidian';
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
        setIcon(headerIcon, 'trash-2');
        const headerText = header.createDiv({ cls: 'lorebase-delete-header-text' });
        const isAnime = this.item.type === 'anime';
        const isMovie = this.item.type === 'movie';
        const isSeries = this.item.type === 'series';
        const isReadingMedia = this.item.type === 'book' || this.item.type === 'manga';
        const title = this.item.type === 'music' ? mt('deleteTitle') : isReadingMedia
            ? t('deleteTitleReading')
            : isMovie ? t('deleteTitleMovie')
                : isSeries ? t('deleteTitleSeries')
                    : isAnime ? t('deleteTitleAnime') : t('deleteTitle');
        const subtitle = this.item.type === 'music' ? mt('deleteSubtitle') : isReadingMedia
            ? t('deleteSubtitleReading')
            : isMovie ? t('deleteSubtitleMovie')
                : isSeries ? t('deleteSubtitleSeries')
                    : isAnime ? t('deleteSubtitleAnime') : t('deleteSubtitle');
        headerText.createEl('h2', { text: title });
        headerText.createEl('p', { cls: 'lorebase-delete-subtitle', text: subtitle });

        // Game info
        const gameInfo = contentEl.createDiv({ cls: 'lorebase-delete-game-info' });

        gameInfo.createEl('img', {
            cls: 'lorebase-delete-poster',
            attr: { src: this.item.imageUrl, alt: this.item.displayName }
        });

        const details = gameInfo.createDiv({ cls: 'lorebase-delete-details' });
        details.createEl('h3', { text: this.item.displayName });

        const yearLine = details.createEl('p');
        yearLine.createEl('strong', { text: `${t('year')}:` });
        yearLine.appendText(` ${this.item.year || t('yearNotSpecified')}`);

        const statusLabels: Record<MediaStatus, string> = i18n.getStatusLabels();
        let statusLabel = this.item.type === 'music' ? mt(this.item.status) : statusLabels[this.item.status] ?? t('statusNotStarted');
        if (this.item.status === 'completed' && this.item.type === 'game') {
            statusLabel = t('statusPlayed');
        } else if (isReadingMedia && this.item.status === 'completed') {
            statusLabel = t('statusReadCompleted');
        } else if (isReadingMedia && this.item.status === 'planned') {
            statusLabel = t('statusPlanToRead');
        } else if (isReadingMedia && this.item.status === 'watching') {
            statusLabel = t('statusReading');
        }
        const statusLine = details.createEl('p');
        statusLine.createEl('strong', { text: `${t('status')}:` });
        statusLine.appendText(` ${statusLabel}`);

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

        const confirmText = this.item.type === 'music' ? mt('deleteAck') : isReadingMedia
            ? t('deleteConfirmAckReading')
            : isMovie ? t('deleteConfirmAckMovie')
                : isSeries ? t('deleteConfirmAckSeries')
                    : isAnime ? t('deleteConfirmAckAnime') : t('deleteConfirmAck');
        const confirmLabel = confirmRow.createEl('label', {
            text: confirmText,
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

        confirmBtn.addEventListener('click', () => {
            confirmBtn.disabled = true;
            confirmBtn.textContent = '...';

            void this.onConfirm()
                .then(() => this.close())
                .catch((error: unknown) => {
                    console.error('Error deleting game:', error);
                    syncConfirmState();
                    confirmBtn.textContent = t('deleteConfirm');
                });
        });
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
}
