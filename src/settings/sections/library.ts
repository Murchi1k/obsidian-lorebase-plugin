import { Setting } from 'obsidian';
import { DEFAULT_SETTINGS } from '../../constants';
import { t } from '../../localization';
import type { CardSize, CardStyle } from '../../types';
import { FolderSuggest } from '../../components/FolderSuggest';
import { ICON_MEDIA } from './constants';
import { addLorebaseDropdown } from './customDropdown';
import { renderLocalImageSettings } from './experiment';
import { createMediaTabs } from './mediaTabs';
import type { MediaTypeKey, SettingsSectionContext } from './types';

const MEDIA_SETTINGS_OPTIONS: Array<{
    key: MediaTypeKey;
    label: () => string;
    icon: string;
}> = [
    { key: 'games', label: () => t('settingsGames'), icon: 'gamepad-2' },
    { key: 'anime', label: () => t('settingsAnime'), icon: 'clapperboard' },
    { key: 'movies', label: () => t('settingsMovies'), icon: 'film' },
    { key: 'series', label: () => t('settingsSeries'), icon: 'tv' },
    { key: 'books', label: () => t('settingsBooks'), icon: 'book-open' },
    { key: 'manga', label: () => t('settingsManga'), icon: 'book-open-text' },
];

export function renderMediaSettings(context: SettingsSectionContext, container: HTMLElement): void {
    context.createSectionHeader(container, ICON_MEDIA, t('settingsMedia'));

    const root = container.createDiv({ cls: 'lorebase-media-settings' });
    root.createDiv({ cls: 'lorebase-settings-section-description', text: t('settingsMediaDesc') });
    const tabsHost = root.createDiv({ cls: 'lorebase-media-settings-tabs' });
    const panels = root.createDiv({ cls: 'lorebase-media-settings-panels' });
    const panelMap = new Map<MediaTypeKey, HTMLElement>();

    const selectMedia = (media: MediaTypeKey): void => {
        context.setActiveMediaTab('mediaSettings', media);
        panelMap.forEach((panel, key) => {
            const active = key === media;
            panel.toggleClass('is-active', active);
            panel.toggleAttribute('hidden', !active);
        });
    };

    for (const option of MEDIA_SETTINGS_OPTIONS) {
        const panel = panels.createDiv({ cls: `lorebase-media-settings-panel is-${option.key}` });
        panel.setAttribute('role', 'tabpanel');
        panelMap.set(option.key, panel);
        renderLibrarySettingsPanel(context, panel, option.key);
    }

    createMediaTabs(
        tabsHost,
        MEDIA_SETTINGS_OPTIONS.map((option) => ({
            value: option.key,
            label: option.label(),
            icon: option.icon,
        })),
        context.getActiveMediaTab('mediaSettings'),
        t('settingsMediaTabs'),
        selectMedia
    );
    selectMedia(context.getActiveMediaTab('mediaSettings'));
    renderLocalImageSettings(context, root);
}

function renderLibrarySettingsPanel(
    context: SettingsSectionContext,
    container: HTMLElement,
    key: MediaTypeKey
): void {
    const settings = context.plugin.settings[key];
    const mediaToggleLabel = key === 'games'
        ? t('settingsMediaGames')
        : key === 'anime'
            ? t('settingsMediaAnime')
            : key === 'movies'
                ? t('settingsMediaMovies')
                : key === 'series'
                    ? t('settingsMediaSeries')
                    : key === 'books'
                        ? t('settingsMediaBooks')
                        : t('settingsMediaManga');
    const mediaToggleValue = context.plugin.settings.enabledMedia[key];

    new Setting(container)
        .setName(mediaToggleLabel)
        .addToggle(toggle => {
            toggle
                .setValue(mediaToggleValue)
                .onChange(async (value) => {
                    const nextEnabled = { ...context.plugin.settings.enabledMedia };
                    nextEnabled[key] = value;

                    if (!Object.values(nextEnabled).some(Boolean)) {
                        nextEnabled[key] = true;
                        toggle.setValue(true);
                    }

                    context.plugin.settings.enabledMedia = nextEnabled;
                    await context.plugin.saveSettings();
                    context.plugin.refreshViews();
                });
        });

    const folderSetting = new Setting(container)
        .setName(t('settingsFolder'))
        .setDesc(t('settingsDescFolder'));
    folderSetting.addText(text => {
        const persistFolderPath = async (value: string): Promise<void> => {
            context.plugin.settings[key].folderPath = value.trim();
            await context.plugin.saveSettings();
            context.plugin.refreshViews();
        };

        text
            .setPlaceholder(DEFAULT_SETTINGS[key].folderPath)
            .setValue(settings.folderPath)
            .onChange((value) => {
                void persistFolderPath(value);
            });

        new FolderSuggest(context.app, text.inputEl, (path) => {
            void persistFolderPath(path);
        });
    });

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

    if (key === 'anime' || key === 'series' || key === 'books' || key === 'manga') {
        const cardStyleSetting = new Setting(container)
            .setName(t('settingsCardStyle'))
            .setDesc(t('settingsCardStyleDesc'));
        addLorebaseDropdown<CardStyle>(
            cardStyleSetting,
            [
                { value: 'hover', label: t('settingsCardStyleHover') },
                { value: 'progress', label: t('settingsCardStyleProgress') },
            ],
            settings.cardStyle ?? DEFAULT_SETTINGS[key].cardStyle,
            async (value) => {
                context.plugin.settings[key].cardStyle = value;
                await context.plugin.saveSettings();
                context.plugin.refreshViews();
            }
        );
    }

    if (key === 'books' || key === 'manga') {
        new Setting(container)
            .setName(t('settingsBookCoverEffect'))
            .setDesc(t('settingsBookCoverEffectDesc'))
            .addToggle(toggle => {
                toggle
                    .setValue(settings.bookCoverEffect)
                    .onChange(async (value) => {
                        context.plugin.settings[key].bookCoverEffect = value;
                        await context.plugin.saveSettings();
                        context.plugin.refreshViewsVisuals();
                    });
            });
    }

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
