import { Setting, TFolder } from 'obsidian';
import { DEFAULT_SETTINGS } from '../../constants';
import { t } from '../../localization';
import type { CardSize } from '../../types';
import { addLorebaseDropdown } from './customDropdown';
import type { MediaTypeKey, SettingsSectionContext } from './types';

export function renderLibrarySettings(
    context: SettingsSectionContext,
    container: HTMLElement,
    title: string,
    key: MediaTypeKey,
    icon: string
): void {
    context.createSectionHeader(container, icon, title);

    const settings = context.plugin.settings[key];
    const mediaToggleLabel = key === 'games' ? t('settingsMediaGames') : t('settingsMediaAnime');
    const mediaToggleValue = key === 'games'
        ? context.plugin.settings.enabledMedia.games
        : context.plugin.settings.enabledMedia.anime;

    new Setting(container)
        .setName(mediaToggleLabel)
        .addToggle(toggle => {
            toggle
                .setValue(mediaToggleValue)
                .onChange(async (value) => {
                    let nextGames = context.plugin.settings.enabledMedia.games;
                    let nextAnime = context.plugin.settings.enabledMedia.anime;

                    if (key === 'games') {
                        nextGames = value;
                    } else {
                        nextAnime = value;
                    }

                    if (!nextGames && !nextAnime) {
                        if (key === 'games') {
                            nextGames = true;
                            toggle.setValue(true);
                        } else {
                            nextAnime = true;
                            toggle.setValue(true);
                        }
                    }

                    context.plugin.settings.enabledMedia = { games: nextGames, anime: nextAnime };
                    await context.plugin.saveSettings();
                    context.plugin.refreshViews();
                });
        });

    const folderSetting = new Setting(container)
        .setName(t('settingsFolder'))
        .setDesc(t('settingsDescFolder'));
    const folders = context.app.vault.getAllLoadedFiles()
        .filter((f): f is TFolder => f instanceof TFolder)
        .sort((a, b) => a.path.localeCompare(b.path));
    addLorebaseDropdown<string>(
        folderSetting,
        [
            { value: '', label: '/ (Root)' },
            ...folders
                .filter((folder) => Boolean(folder.path))
                .map((folder) => ({ value: folder.path, label: folder.path })),
        ],
        settings.folderPath,
        async (value) => {
            context.plugin.settings[key].folderPath = value;
            await context.plugin.saveSettings();
            context.plugin.refreshViews();
        }
    );

    new Setting(container)
        .setName(t('settingsColumns'))
        .setDesc(t('settingsDescColumns'))
        .addSlider(slider => {
            slider
                .setLimits(3, 8, 1)
                .setValue(settings.columns)

                .onChange(async (value) => {
                    context.plugin.settings[key].columns = value;
                    await context.plugin.saveSettings();
                    context.plugin.refreshViews();
                });
        });

    const cardSizeSetting = new Setting(container)
        .setName(t('settingsCardSize'));
    addLorebaseDropdown<CardSize>(
        cardSizeSetting,
        [
            { value: 'small', label: t('settingsSizeSmall') },
            { value: 'medium', label: t('settingsSizeMedium') },
            { value: 'large', label: t('settingsSizeLarge') },
        ],
        settings.cardSize,
        async (value) => {
            context.plugin.settings[key].cardSize = value;
            await context.plugin.saveSettings();
            context.plugin.refreshViews();
        }
    );

    new Setting(container)
        .setName(t('settingsCustomCardSize'))
        .setDesc(t('settingsCustomCardSizeDesc'))
        .addToggle(toggle => {
            toggle
                .setValue(settings.customCardSize)
                .onChange(async (value) => {
                    context.plugin.settings[key].customCardSize = value;
                    await context.plugin.saveSettings();
                    context.plugin.refreshViews();
                    context.display();
                });
        });

    if (settings.customCardSize) {
        new Setting(container)
            .setName(t('settingsCardMinWidth'))
            .setDesc(t('settingsCardMinWidthDesc'))
            .addSlider(slider => {
                slider
                    .setLimits(140, 480, 5)
                    .setValue(settings.customCardMinWidth)

                    .onChange(async (value) => {
                        context.plugin.settings[key].customCardMinWidth = value;
                        await context.plugin.saveSettings();
                        context.plugin.refreshViews();
                    });
            });

        new Setting(container)
            .setName(t('settingsCardMinHeight'))
            .setDesc(t('settingsCardMinHeightDesc'))
            .addSlider(slider => {
                slider
                    .setLimits(180, 900, 5)
                    .setValue(settings.customCardMinHeight)

                    .onChange(async (value) => {
                        context.plugin.settings[key].customCardMinHeight = value;
                        await context.plugin.saveSettings();
                        context.plugin.refreshViews();
                    });
            });

        new Setting(container)
            .setName(t('settingsCardImageRatio'))
            .setDesc(t('settingsCardImageRatioDesc'))
            .addSlider(slider => {
                slider
                    .setLimits(0.4, 2.2, 0.01)
                    .setValue(settings.customCardImageRatio)

                    .onChange(async (value) => {
                        context.plugin.settings[key].customCardImageRatio = value;
                        await context.plugin.saveSettings();
                        context.plugin.refreshViews();
                    });
            });

        new Setting(container)
            .setName(t('settingsHorizontalCardMinWidth'))
            .setDesc(t('settingsHorizontalCardMinWidthDesc'))
            .addSlider(slider => {
                slider
                    .setLimits(240, 700, 5)
                    .setValue(settings.customHorizontalCardMinWidth)

                    .onChange(async (value) => {
                        context.plugin.settings[key].customHorizontalCardMinWidth = value;
                        await context.plugin.saveSettings();
                        context.plugin.refreshViews();
                    });
            });

        new Setting(container)
            .setName(t('settingsHorizontalCardHeight'))
            .setDesc(t('settingsHorizontalCardHeightDesc'))
            .addSlider(slider => {
                slider
                    .setLimits(120, 520, 5)
                    .setValue(settings.customHorizontalCardHeight)

                    .onChange(async (value) => {
                        context.plugin.settings[key].customHorizontalCardHeight = value;
                        await context.plugin.saveSettings();
                        context.plugin.refreshViews();
                    });
            });

        new Setting(container)
            .setName(t('settingsCustomCardReset'))
            .addButton(button => {
                button
                    .setButtonText(t('resetConfirm'))
                    .onClick(() => {
                        void (async (): Promise<void> => {
                        const defaults = DEFAULT_SETTINGS[key];
                        context.plugin.settings[key].customCardSize = false;
                        context.plugin.settings[key].customCardMinWidth = defaults.customCardMinWidth;
                        context.plugin.settings[key].customCardMinHeight = defaults.customCardMinHeight;
                        context.plugin.settings[key].customCardImageRatio = defaults.customCardImageRatio;
                        context.plugin.settings[key].customHorizontalCardMinWidth = defaults.customHorizontalCardMinWidth;
                        context.plugin.settings[key].customHorizontalCardHeight = defaults.customHorizontalCardHeight;
                        await context.plugin.saveSettings();
                        context.plugin.refreshViews();
                        context.display();
                        })();
                    });
            });
    }

    if (key === 'games') {
        new Setting(container)
            .setName(t('settingsShowAdult'))
            .setDesc(t('settingsDescShowAdult'))
            .addToggle(toggle => {
                toggle
                    .setValue(settings.showAdultInAll)
                    .onChange(async (value) => {
                        context.plugin.settings[key].showAdultInAll = value;
                        await context.plugin.saveSettings();
                        context.plugin.refreshViews();
                    });
            });
    }
}
