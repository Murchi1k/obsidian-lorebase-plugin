import { Notice, Setting } from 'obsidian';
import { t, type TranslationKey } from '../../localization';
import type { IntegrationTemplateSettings } from '../../types';
import { IntegrationService } from '../../services/IntegrationService';
import { ANIME_TEMPLATE_FIELDS, GAME_TEMPLATE_FIELDS, GAME_TEMPLATE_FIELDS_HLTB, ICON_INTEGRATIONS } from './constants';
import { addLorebaseDropdown } from './customDropdown';
import type { SettingsSectionContext, TemplateFieldDef } from './types';

function getTemplateFieldOrder(
    savedOrder: string[] | undefined,
    fields: TemplateFieldDef[]
): string[] {
    const allowed = new Set(fields.map((field) => field.key));
    const ordered: string[] = [];

    const pushUnique = (key: string): void => {
        if (!allowed.has(key)) return;
        if (ordered.includes(key)) return;
        ordered.push(key);
    };

    (savedOrder ?? []).forEach(pushUnique);
    fields.forEach((field) => pushUnique(field.key));

    return ordered;
}

function renderSimpleTemplateFieldEditor(
    context: SettingsSectionContext,
    container: HTMLElement,
    media: IntegrationTemplateSettings,
    fields: TemplateFieldDef[]
): void {
    container.createEl('div', {
        text: t('settingsIntegrationsTemplateFields'),
        cls: 'lorebase-settings-fields-title'
    });

    const listEl = container.createDiv({ cls: 'lorebase-template-fields-list' });
    const orderedKeys = getTemplateFieldOrder(media.templateFields, fields);
    const labels = new Map<string, string>(fields.map((field) => [field.key, t(field.label)]));
    const defaultSelected = media.templateFields ?? fields.map((field) => field.key);
    const selected = new Set(defaultSelected.filter((key) => orderedKeys.includes(key)));

    const saveTemplateFields = async (): Promise<void> => {
        media.templateFields = orderedKeys.filter((key) => selected.has(key));
        await context.plugin.saveSettings();
    };

    const moveItem = (fromIndex: number, toIndex: number): void => {
        if (fromIndex === toIndex) return;
        if (fromIndex < 0 || toIndex < 0) return;
        if (fromIndex >= orderedKeys.length || toIndex >= orderedKeys.length) return;
        const [moved] = orderedKeys.splice(fromIndex, 1);
        orderedKeys.splice(toIndex, 0, moved);
    };

    let draggingKey: string | null = null;

    const renderRows = (): void => {
        listEl.empty();

        orderedKeys.forEach((key) => {
            const setting = new Setting(listEl).setName(labels.get(key) ?? key);
            const row = setting.settingEl;
            row.addClass('lorebase-template-field-setting');
            row.draggable = true;
            row.setAttr('data-field', key);

            const info = row.querySelector('.setting-item-info');
            if (info instanceof HTMLElement) {
                info.addClass('lorebase-template-field-info');
                info.createSpan({ cls: 'lorebase-template-field-handle', text: '⋮⋮' });
            }

            setting.addToggle(toggle => {
                toggle
                    .setValue(selected.has(key))
                    .onChange(async (value) => {
                        if (value) selected.add(key);
                        else selected.delete(key);
                        await saveTemplateFields();
                    });
            });

            row.addEventListener('dragstart', (event) => {
                draggingKey = key;
                row.addClass('is-dragging');
                if (event.dataTransfer) {
                    event.dataTransfer.effectAllowed = 'move';
                }
            });

            row.addEventListener('dragover', (event) => {
                if (!draggingKey || draggingKey === key) return;
                event.preventDefault();
                row.addClass('is-drag-over');
            });

            row.addEventListener('dragleave', () => {
                row.removeClass('is-drag-over');
            });

            row.addEventListener('drop', (event) => {
                event.preventDefault();
                row.removeClass('is-drag-over');
                if (!draggingKey || draggingKey === key) return;
                const fromIndex = orderedKeys.indexOf(draggingKey);
                const toIndex = orderedKeys.indexOf(key);
                moveItem(fromIndex, toIndex);
                void saveTemplateFields();
                renderRows();
            });

            row.addEventListener('dragend', () => {
                draggingKey = null;
                listEl.querySelectorAll<HTMLElement>('.lorebase-template-field-setting').forEach((item) => {
                    item.removeClass('is-dragging');
                    item.removeClass('is-drag-over');
                });
            });
        });
    };

    renderRows();
}

function getGameTemplateFields(includeHowLongToBeat: boolean): TemplateFieldDef[] {
    return includeHowLongToBeat
        ? [...GAME_TEMPLATE_FIELDS, ...GAME_TEMPLATE_FIELDS_HLTB]
        : [...GAME_TEMPLATE_FIELDS];
}

export function renderIntegrationsSection(context: SettingsSectionContext, container: HTMLElement): void {
    const integrations = context.plugin.settings.integrations;
    if (!integrations) return;

    const integrationService = new IntegrationService(context.app, () => context.plugin.settings);

    context.createSectionHeader(container, ICON_INTEGRATIONS, t('settingsIntegrations'));

    new Setting(container)
        .setName(t('settingsIntegrationsEnable'))
        .setDesc(t('settingsIntegrationsEnableDesc'))
        .addToggle(toggle => {
            toggle
                .setValue(integrations.enabled)
                .onChange(async (value) => {
                    integrations.enabled = value;
                    await context.plugin.saveSettings();
                    context.display();
                });
        });

    if (!integrations.enabled) {
        return;
    }

    const providersGroup = context.createCollapsibleGroup(
        container,
        t('settingsIntegrationsProviders'),
        undefined,
        true
    );

    const renderProvider = (
        id: 'rawg' | 'steam' | 'anilist' | 'shikimori',
        label: string,
        needsKey: boolean
    ): void => {
        const provider = integrations.providers[id];

        const setting = new Setting(providersGroup.body)
            .setName(label)
            .setDesc(needsKey ? t('settingsIntegrationsProviderKeyRequired') : t('settingsIntegrationsProviderKeyOptional'))
            .addToggle(toggle => {
                toggle
                    .setValue(provider.enabled)
                    .onChange(async (value) => {
                        provider.enabled = value;
                        await context.plugin.saveSettings();
                    });
            });
        setting.settingEl.addClass('lorebase-provider-setting');

        setting.addButton(button => {
            button
                .setButtonText(t('settingsIntegrationsProviderTest'))
                .onClick(async () => {
                    const result = await integrationService.testProvider(id);
                    if (result.ok) {
                        new Notice(t('noticeProviderTestSuccess'));
                        return;
                    }
                    if (result.reason === 'missing_key') {
                        new Notice(t('noticeMissingApiKey'));
                        return;
                    }
                    if (result.reason === 'disabled') {
                        new Notice(t('noticeProviderDisabled'));
                        return;
                    }
                    new Notice(t('noticeProviderTestFail'));
                });
        });

        if (needsKey) {
            setting.settingEl.addClass('has-key');
            const keyRow = setting.settingEl.createDiv({ cls: 'lorebase-provider-key-row' });
            const keyInput = keyRow.createEl('input', {
                cls: 'lorebase-provider-key-input',
                attr: { type: 'text', placeholder: t('settingsIntegrationsProviderKeyPlaceholder') }
            });
            keyInput.value = provider.apiKey ?? '';
            keyInput.addEventListener('input', async () => {
                provider.apiKey = keyInput.value.trim();
                await context.plugin.saveSettings();
            });

            setting.addExtraButton(button => {
                button
                    .setIcon('chevron-down')
                    .setTooltip(t('settingsIntegrationsProviderKeyPlaceholder'))
                    .onClick(() => {
                        const isOpen = setting.settingEl.hasClass('is-key-open');
                        if (isOpen) {
                            setting.settingEl.removeClass('is-key-open');
                        } else {
                            setting.settingEl.addClass('is-key-open');
                            keyInput.focus();
                            keyInput.select();
                        }
                    });
            });
        }
    };

    renderProvider('rawg', t('settingsIntegrationsProviderRawg'), true);
    renderProvider('steam', t('settingsIntegrationsProviderSteam'), false);
    renderProvider('anilist', t('settingsIntegrationsProviderAnilist'), false);
    renderProvider('shikimori', t('settingsIntegrationsProviderShikimori'), false);

    const mediaProvidersGroup = context.createCollapsibleGroup(
        container,
        t('settingsIntegrationsMediaProviders'),
        undefined,
        true
    );

    const gamesProviderSetting = new Setting(mediaProvidersGroup.body)
        .setName(t('settingsIntegrationsGamesProvider'))
        .setDesc(t('settingsIntegrationsGamesProviderDesc'));
    addLorebaseDropdown<'rawg' | 'steam'>(
        gamesProviderSetting,
        [
            { value: 'rawg', label: 'RAWG' },
            { value: 'steam', label: 'Steam' },
        ],
        integrations.media.games.provider as 'rawg' | 'steam',
        async (value) => {
            integrations.media.games.provider = value;
            await context.plugin.saveSettings();
        }
    );

    const animeProviderSetting = new Setting(mediaProvidersGroup.body)
        .setName(t('settingsIntegrationsAnimeProvider'))
        .setDesc(t('settingsIntegrationsAnimeProviderDesc'));
    addLorebaseDropdown<'anilist' | 'shikimori'>(
        animeProviderSetting,
        [
            { value: 'anilist', label: 'AniList' },
            { value: 'shikimori', label: 'Shikimori' },
        ],
        integrations.media.anime.provider as 'anilist' | 'shikimori',
        async (value) => {
            integrations.media.anime.provider = value;
            await context.plugin.saveSettings();
        }
    );

    const templatesGroup = context.createCollapsibleGroup(
        container,
        t('settingsIntegrationsTemplates'),
        undefined,
        true
    );

    const renderTemplateSettings = (
        key: 'games' | 'anime',
        titleKey: TranslationKey,
        descKey: TranslationKey,
        fields: TemplateFieldDef[]
    ): void => {
        const media = integrations.media[key];

        const section = context.createCollapsibleGroup(
            templatesGroup.body,
            t(titleKey),
            t(descKey),
            key === 'games'
        );

        new Setting(section.body)
            .setName(t(titleKey))
            .setDesc(t(descKey))
            .addToggle(toggle => {
                toggle
                    .setValue(media.templateEnabled)
                    .onChange(async (value) => {
                        media.templateEnabled = value;
                        await context.plugin.saveSettings();
                        context.display();
                    });
            });

        if (!media.templateEnabled) return;

        const mode = media.templateMode ?? 'advanced';
        const templateModeSetting = new Setting(section.body)
            .setName(t('settingsIntegrationsTemplateMode'))
            .setDesc(t('settingsIntegrationsTemplateModeDesc'));
        addLorebaseDropdown<'simple' | 'advanced'>(
            templateModeSetting,
            [
                { value: 'simple', label: t('settingsIntegrationsTemplateModeSimple') },
                { value: 'advanced', label: t('settingsIntegrationsTemplateModeAdvanced') },
            ],
            mode as 'simple' | 'advanced',
            async (value) => {
                media.templateMode = value;
                await context.plugin.saveSettings();
                context.display();
            }
        );

        if (key === 'games') {
            new Setting(section.body)
                .setName(t('settingsIntegrationsHowLongToBeat'))
                .setDesc(t('settingsIntegrationsHowLongToBeatDesc'))
                .addToggle(toggle => {
                    toggle
                        .setValue(media.howLongToBeatEnabled ?? false)
                        .onChange(async (value) => {
                            media.howLongToBeatEnabled = value;
                            await context.plugin.saveSettings();
                            context.display();
                        });
                });
        }

        if ((media.templateMode ?? 'advanced') === 'simple') {
            const visibleFields = key === 'games'
                ? getGameTemplateFields(Boolean(media.howLongToBeatEnabled))
                : fields;
            renderSimpleTemplateFieldEditor(context, section.body, media, visibleFields);
            return;
        }

        new Setting(section.body)
            .setName(t('settingsIntegrationsTemplateContent'))
            .setDesc(t('settingsIntegrationsTemplateDesc'))
            .addTextArea(text => {
                text
                    .setValue(media.template)
                    .onChange(async (value) => {
                        media.template = value;
                        await context.plugin.saveSettings();
                    });
                text.inputEl.rows = 8;
            });
    };

    renderTemplateSettings('games', 'settingsIntegrationsGamesTemplate', 'settingsIntegrationsGamesTemplateDesc', getGameTemplateFields(Boolean(integrations.media.games.howLongToBeatEnabled)));
    renderTemplateSettings('anime', 'settingsIntegrationsAnimeTemplate', 'settingsIntegrationsAnimeTemplateDesc', ANIME_TEMPLATE_FIELDS);
}
