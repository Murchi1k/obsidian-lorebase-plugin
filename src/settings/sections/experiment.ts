import { Notice, Setting } from 'obsidian';
import { t } from '../../localization';
import { localizeExistingNoteImages } from '../../services/integrations/imageStorage';
import type { SettingsSectionContext } from './types';

export function renderLocalImageSettings(context: SettingsSectionContext, container: HTMLElement): void {
    const integrations = context.plugin.settings.integrations;
    if (!integrations) return;

    const imageStorage = integrations.imageStorage;
    const imageStorageGroup = context.createCollapsibleGroup(
        container,
        t('settingsIntegrationsImageStorage'),
        t('settingsIntegrationsImageStorageDesc'),
        false
    );

    new Setting(imageStorageGroup.body)
        .setName(t('settingsIntegrationsImageStorageEnable'))
        .setDesc(t('settingsIntegrationsImageStorageEnableDesc'))
        .addToggle(toggle => {
            toggle
                .setValue(imageStorage.enabled)
                .onChange(async (value) => {
                    imageStorage.enabled = value;
                    await context.plugin.saveSettings();
                    context.display();
                });
        });

    if (!imageStorage.enabled) return;

    new Setting(imageStorageGroup.body)
        .setName(t('settingsIntegrationsImageStorageFolder'))
        .setDesc(t('settingsIntegrationsImageStorageFolderDesc'))
        .addText(text => {
            text
                .setPlaceholder('files/lorebase/images')
                .setValue(imageStorage.folderPath)
                .onChange(async (value) => {
                    imageStorage.folderPath = value.trim() || 'files/lorebase/images';
                    await context.plugin.saveSettings();
                });
        });

    new Setting(imageStorageGroup.body)
        .setName(t('settingsIntegrationsImageStorageDownloadExisting'))
        .setDesc(t('settingsIntegrationsImageStorageDownloadExistingDesc'))
        .addButton(button => {
            button
                .setButtonText(t('settingsIntegrationsImageStorageDownloadExisting'))
                .onClick(() => {
                    void (async (): Promise<void> => {
                    button.setDisabled(true);
                    new Notice(t('settingsIntegrationsImageStorageDownloadStarted'));
                    try {
                        const result = await localizeExistingNoteImages(context.app, context.plugin.settings);
                        context.plugin.refreshViews();
                        new Notice(`${t('settingsIntegrationsImageStorageDownloadDone')}: ${result.updated} notes, ${result.downloaded} images, ${result.failed} failed.`);
                    } catch (error) {
                        const message = error instanceof Error ? `: ${error.message}` : '';
                        new Notice(`${t('noticeIntegrationsError')}${message}`);
                    } finally {
                        button.setDisabled(false);
                    }
                    })();
                });
        });
}
