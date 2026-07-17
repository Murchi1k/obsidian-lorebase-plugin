import { Setting } from 'obsidian';
import { DEFAULT_SETTINGS } from '../../constants';
import { t } from '../../localization';
import type { SettingsSectionContext } from './types';

export function renderResetSettings(context: SettingsSectionContext, container: HTMLElement): void {
    const resetSetting = new Setting(container)
        .setName(t('settingsReset'))
        .setDesc(t('settingsDescReset'))
        .addButton(button => {
            button
                .setButtonText(t('settingsReset'))
                .setWarning()
                .onClick(() => {
                    void (async (): Promise<void> => {
                    const { ResetModal } = await import('../../modals/ResetModal');
                    new ResetModal(context.app, async () => {
                        context.plugin.settings = structuredClone(DEFAULT_SETTINGS);
                        await context.plugin.saveSettings();
                        context.plugin.refreshViews();
                        context.display();
                    }).open();
                    })();
                });
        });
    resetSetting.settingEl.addClass('lorebase-reset-settings-row');
}
