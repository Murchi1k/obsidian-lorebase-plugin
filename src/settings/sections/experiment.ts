import { Notice, setIcon } from 'obsidian';
import { t } from '../../localization';
import { renderMediaSwitch } from './mediaSwitch';
import type { SettingsSectionContext } from './types';

export function renderLocalImageSettings(context: SettingsSectionContext, container: HTMLElement): void {
    const imageStorage = context.plugin.settings.integrations?.imageStorage;
    if (!imageStorage) return;

    const storage = container.createEl('section', { cls: 'lorebase-media-card lorebase-media-storage' });
    const header = storage.createDiv({ cls: 'lorebase-media-card-header' });
    const heading = header.createEl('h3');
    setIcon(heading.createSpan({ attr: { 'aria-hidden': 'true' } }), 'images');
    heading.createSpan({ text: t('settingsIntegrationsImageStorage') });
    renderMediaSwitch(header, t('settingsIntegrationsImageStorageEnable'), imageStorage.enabled, value => {
        imageStorage.enabled = value;
        details.hidden = !value;
        void context.plugin.saveSettings();
        return true;
    });
    storage.createDiv({ cls: 'lorebase-media-card-description', text: t('settingsIntegrationsImageStorageDesc') });

    const details = storage.createDiv({ cls: 'lorebase-media-storage-details' });
    details.hidden = !imageStorage.enabled;
    const folder = details.createEl('label', { cls: 'lorebase-media-storage-folder' });
    folder.createSpan({ text: t('settingsIntegrationsImageStorageFolder') });
    const input = folder.createEl('input', { type: 'text', attr: { placeholder: 'files/lorebase/images' } });
    input.value = imageStorage.folderPath;
    input.addEventListener('input', () => {
        imageStorage.folderPath = input.value.trim() || 'files/lorebase/images';
        void context.plugin.saveSettings();
    });
    input.addEventListener('change', () => { input.value = imageStorage.folderPath; });

    const action = details.createDiv({ cls: 'lorebase-media-storage-action' });
    action.createSpan({ text: t('settingsIntegrationsImageStorageDownloadExistingDesc') });
    const download = action.createEl('button', {
        cls: 'lorebase-media-storage-download', attr: { type: 'button' },
    });
    setIcon(download.createSpan({ attr: { 'aria-hidden': 'true' } }), 'download');
    download.createSpan({ text: t('settingsIntegrationsImageStorageDownloadExisting') });
    download.addEventListener('click', async () => {
        if (download.disabled) return;
        download.disabled = true;
        new Notice(t('settingsIntegrationsImageStorageDownloadStarted'));
        try {
            const service = context.plugin.getIntegrationService();
            if (!service) return;
            const result = await service.localizeExistingImages(context.signal);
            if (context.signal?.aborted || !download.isConnected) return;
            context.plugin.refreshViews();
            new Notice(`${result.cancelled ? t('commonCancel') : t('settingsIntegrationsImageStorageDownloadDone')}: ${result.updated} notes, ${result.downloaded} images, ${result.failed} failed.`);
        } catch (error) {
            if (context.signal?.aborted || !download.isConnected) return;
            const message = error instanceof Error ? error.message : '';
            new Notice(`${t('noticeIntegrationsError')}${message ? ': ' + message : ''}`);
        } finally {
            download.disabled = false;
        }
    });
}
