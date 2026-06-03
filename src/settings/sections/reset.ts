import { Setting } from 'obsidian';
import { DEFAULT_SETTINGS } from '../../constants';
import { t } from '../../localization';
import { ICON_DANGER } from './constants';
import type { SettingsSectionContext } from './types';

export function renderResetSection(context: SettingsSectionContext, container: HTMLElement): void {
    context.createSectionHeader(container, ICON_DANGER, t('settingsDangerZone'));

    new Setting(container)
        .setName(t('settingsReset'))
        .setDesc(t('settingsDescReset'))
        .addButton(button => {
            button
                .setButtonText(t('settingsResetAllButton'))
                .setWarning()
                .onClick(async () => {
                    const { ResetModal } = await import('../../modals/ResetModal');
                    new ResetModal(context.app, async () => {
                        context.plugin.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
                        await context.plugin.saveSettings();
                        context.plugin.refreshViews();
                        context.display();
                    }).open();
                });
        });
}
