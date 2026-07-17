import { Notice, Setting, setIcon } from 'obsidian';
import { t, type TranslationKey } from '../../localization';
import type { IntegrationTemplateSettings } from '../../types';
import { IntegrationService } from '../../services/IntegrationService';
import { renderSteamSyncSettings } from '../SteamSyncSettings';
import { ANIME_TEMPLATE_FIELDS, BOOK_TEMPLATE_FIELDS, GAME_TEMPLATE_FIELDS, GAME_TEMPLATE_FIELDS_HLTB, ICON_INTEGRATIONS, MANGA_TEMPLATE_FIELDS, MOVIE_TEMPLATE_FIELDS, SERIES_TEMPLATE_FIELDS } from './constants';
import { addLorebaseDropdown } from './customDropdown';
import { createMediaTabs } from './mediaTabs';
import type { MediaTypeKey, SettingsSectionContext, TemplateFieldDef } from './types';

type ProviderSettingsId = 'rawg' | 'steam' | 'igdb' | 'anilist' | 'shikimori' | 'tmdb' | 'tvmaze' | 'omdb' | 'hardcover' | 'googlebooks' | 'jikan' | 'mangadex';

interface ProviderSettingsDef {
    id: ProviderSettingsId;
    label: string;
    detailLabel: string;
    needsKey: boolean;
    showKeyInput?: boolean;
    needsClientSecret?: boolean;
}

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
    fields.forEach((field, index) => {
        if (ordered.includes(field.key)) return;

        const previousDefaultKey = fields
            .slice(0, index)
            .map((candidate) => candidate.key)
            .reverse()
            .find((key) => ordered.includes(key));
        if (previousDefaultKey) {
            ordered.splice(ordered.indexOf(previousDefaultKey) + 1, 0, field.key);
            return;
        }

        const nextDefaultKey = fields
            .slice(index + 1)
            .map((candidate) => candidate.key)
            .find((key) => ordered.includes(key));
        if (nextDefaultKey) {
            ordered.splice(ordered.indexOf(nextDefaultKey), 0, field.key);
            return;
        }

        ordered.push(field.key);
    });

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

function enableHowLongToBeatTemplateFields(media: IntegrationTemplateSettings): void {
    const hltbFields = GAME_TEMPLATE_FIELDS_HLTB.map((field) => field.key);
    const current = media.templateFields?.length
        ? media.templateFields
        : GAME_TEMPLATE_FIELDS.map((field) => field.key);
    media.templateFields = Array.from(new Set([...current, ...hltbFields]));
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

    const gameProviders: ProviderSettingsDef[] = [
        { id: 'rawg', label: 'RAWG', detailLabel: t('settingsIntegrationsProviderRawg'), needsKey: true },
        { id: 'steam', label: 'Steam', detailLabel: t('settingsIntegrationsProviderSteam'), needsKey: false },
        { id: 'igdb', label: 'IGDB', detailLabel: t('settingsIntegrationsProviderIgdb'), needsKey: true, needsClientSecret: true }
    ];
    const animeProviders: ProviderSettingsDef[] = [
        { id: 'anilist', label: 'AniList', detailLabel: t('settingsIntegrationsProviderAnilist'), needsKey: false },
        { id: 'shikimori', label: 'Shikimori', detailLabel: t('settingsIntegrationsProviderShikimori'), needsKey: false }
    ];
    const bookProviders: ProviderSettingsDef[] = [
        { id: 'hardcover', label: 'Hardcover', detailLabel: t('settingsIntegrationsProviderHardcover'), needsKey: true },
        { id: 'googlebooks', label: 'Google Books', detailLabel: t('settingsIntegrationsProviderGooglebooks'), needsKey: true, showKeyInput: true },
    ];
    const mangaProviders: ProviderSettingsDef[] = [
        { id: 'anilist', label: 'AniList', detailLabel: t('settingsIntegrationsProviderAnilist'), needsKey: false },
        { id: 'shikimori', label: 'Shikimori', detailLabel: t('settingsIntegrationsProviderShikimori'), needsKey: false },
        { id: 'jikan', label: 'Jikan', detailLabel: t('settingsIntegrationsProviderJikan'), needsKey: false },
        { id: 'mangadex', label: 'MangaDex', detailLabel: t('settingsIntegrationsProviderMangadex'), needsKey: false },
    ];
    const videoProviders: ProviderSettingsDef[] = [
        { id: 'tmdb', label: 'TMDB', detailLabel: t('settingsIntegrationsProviderTmdb'), needsKey: true },
        { id: 'tvmaze', label: 'TVmaze', detailLabel: t('settingsIntegrationsProviderTvmaze'), needsKey: false, showKeyInput: false },
        { id: 'omdb', label: 'OMDb', detailLabel: t('settingsIntegrationsProviderOmdb'), needsKey: true },
    ];
    const allProviders = [...gameProviders, ...animeProviders, ...bookProviders, ...mangaProviders, ...videoProviders];
    let selectedProviderId: ProviderSettingsId | null = null;

    const providerPicker = providersGroup.body.createDiv({ cls: 'lorebase-provider-picker' });
    const providerDetails = providersGroup.body.createDiv({ cls: 'lorebase-provider-details' });
    const chipButtons = new Map<ProviderSettingsId, HTMLButtonElement>();

    const clearSelectedProvider = (): void => {
        if (selectedProviderId === null) return;
        selectedProviderId = null;
        renderSelectedProvider();
    };

    const renderProviderGroup = (title: string, icon: string, providers: ProviderSettingsDef[]): void => {
        const groupEl = providerPicker.createDiv({ cls: 'lorebase-provider-chip-group' });
        const titleEl = groupEl.createDiv({ cls: 'lorebase-provider-chip-title' });
        const iconEl = titleEl.createSpan({ cls: 'lorebase-provider-chip-title-icon' });
        setIcon(iconEl, icon);
        titleEl.createSpan({ text: title });
        const chipsEl = groupEl.createDiv({ cls: 'lorebase-provider-chips' });

        for (const provider of providers) {
            const chip = chipsEl.createEl('button', {
                cls: 'lorebase-provider-chip',
                text: provider.label,
                attr: {
                    type: 'button',
                    'aria-pressed': 'false'
                }
            });
            chipButtons.set(provider.id, chip);
            chip.addEventListener('click', (event) => {
                event.stopPropagation();
                selectedProviderId = selectedProviderId === provider.id ? null : provider.id;
                renderSelectedProvider();
            });
        }
    };

    const syncProviderChips = (): void => {
        for (const [id, chip] of chipButtons) {
            const isActive = selectedProviderId !== null && id === selectedProviderId;
            chip.toggleClass('is-active', isActive);
            chip.setAttr('aria-pressed', String(isActive));
        }
    };

    const renderSelectedProvider = (): void => {
        syncProviderChips();
        providerDetails.empty();
        providerDetails.toggleClass('is-visible', selectedProviderId !== null);
        if (selectedProviderId === null) return;

        const definition = allProviders.find((provider) => provider.id === selectedProviderId);
        if (!definition) return;

        const { id, detailLabel, needsKey, showKeyInput = needsKey, needsClientSecret = false } = definition;
        const provider = integrations.providers[id];
        providerDetails.toggleClass('is-igdb-provider', showKeyInput);

        const setting = new Setting(providerDetails)
            .setName(detailLabel)
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
        setting.settingEl.addClass('lorebase-provider-detail-card');
        if (showKeyInput) {
            setting.settingEl.addClass('is-igdb-provider');
        }

        setting.addButton(button => {
            button
                .setButtonText(t('settingsIntegrationsProviderTest'))
                .onClick(() => {
                    void (async (): Promise<void> => {
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
                    })();
                });
        });

        if (showKeyInput) {
            setting.settingEl.addClass('has-key');
            setting.settingEl.addClass('is-key-open');
            const keyRow = setting.settingEl.createDiv({ cls: 'lorebase-provider-key-row' });
            const keyInput = keyRow.createEl('input', {
                cls: 'lorebase-provider-key-input',
                attr: {
                    type: 'password',
                    placeholder: needsClientSecret
                        ? t('settingsIntegrationsProviderClientIdPlaceholder')
                        : t('settingsIntegrationsProviderKeyPlaceholder')
                }
            });
            keyInput.value = provider.apiKey ?? '';
            keyInput.addEventListener('input', () => {
                provider.apiKey = keyInput.value.trim();
                void context.plugin.saveSettings();
            });

            if (needsClientSecret) {
                const secretInput = keyRow.createEl('input', {
                    cls: 'lorebase-provider-key-input',
                    attr: { type: 'password', placeholder: t('settingsIntegrationsProviderClientSecretPlaceholder') }
                });
                secretInput.value = provider.clientSecret ?? '';
                secretInput.addEventListener('input', () => {
                    provider.clientSecret = secretInput.value.trim();
                    void context.plugin.saveSettings();
                });

                const help = keyRow.createDiv({ cls: 'lorebase-provider-help' });
                help.createDiv({
                    cls: 'lorebase-provider-help-title',
                    text: t('settingsIntegrationsProviderIgdbHelpTitle')
                });
                help.createDiv({
                    cls: 'lorebase-provider-help-text',
                    text: t('settingsIntegrationsProviderIgdbHelpText')
                });
                const links = help.createDiv({ cls: 'lorebase-provider-help-links' });
                links.createEl('a', {
                    text: t('settingsIntegrationsProviderIgdbTwitchLink'),
                    attr: {
                        href: 'https://dev.twitch.tv/console/apps',
                        target: '_blank',
                        rel: 'noopener'
                    }
                });
                links.createEl('a', {
                    text: t('settingsIntegrationsProviderIgdbDocsLink'),
                    attr: {
                        href: 'https://api-docs.igdb.com/',
                        target: '_blank',
                        rel: 'noopener'
                    }
                });
            } else if (id === 'rawg' || id === 'tmdb' || id === 'tvmaze' || id === 'omdb' || id === 'hardcover' || id === 'googlebooks') {
                const help = keyRow.createDiv({ cls: 'lorebase-provider-help' });
                help.createDiv({
                    cls: 'lorebase-provider-help-title',
                    text: id === 'rawg'
                        ? t('settingsIntegrationsProviderRawgHelpTitle')
                        : id === 'tmdb'
                            ? t('settingsIntegrationsProviderTmdbHelpTitle')
                        : id === 'tvmaze'
                            ? t('settingsIntegrationsProviderTvmazeHelpTitle')
                        : id === 'hardcover'
                            ? t('settingsIntegrationsProviderHardcoverHelpTitle')
                        : id === 'googlebooks'
                            ? t('settingsIntegrationsProviderGooglebooksHelpTitle')
                            : t('settingsIntegrationsProviderOmdbHelpTitle'),
                });
                help.createDiv({
                    cls: 'lorebase-provider-help-text',
                    text: id === 'rawg'
                        ? t('settingsIntegrationsProviderRawgHelpText')
                        : id === 'tmdb'
                            ? t('settingsIntegrationsProviderTmdbHelpText')
                        : id === 'tvmaze'
                            ? t('settingsIntegrationsProviderTvmazeHelpText')
                        : id === 'hardcover'
                            ? t('settingsIntegrationsProviderHardcoverHelpText')
                        : id === 'googlebooks'
                            ? t('settingsIntegrationsProviderGooglebooksHelpText')
                            : t('settingsIntegrationsProviderOmdbHelpText'),
                });
                const links = help.createDiv({ cls: 'lorebase-provider-help-links' });
                links.createEl('a', {
                    text: id === 'rawg'
                        ? t('settingsIntegrationsProviderRawgLink')
                        : id === 'tmdb'
                            ? t('settingsIntegrationsProviderTmdbLink')
                        : id === 'tvmaze'
                            ? t('settingsIntegrationsProviderTvmazeLink')
                        : id === 'hardcover'
                            ? t('settingsIntegrationsProviderHardcoverLink')
                        : id === 'googlebooks'
                            ? t('settingsIntegrationsProviderGooglebooksLink')
                            : t('settingsIntegrationsProviderOmdbLink'),
                    attr: {
                        href: id === 'rawg'
                            ? 'https://rawg.io/apidocs'
                            : id === 'tmdb'
                                ? 'https://developer.themoviedb.org/docs/getting-started'
                            : id === 'tvmaze'
                                ? 'https://www.tvmaze.com/api'
                            : id === 'hardcover'
                                ? 'https://hardcover.app/account/api'
                            : id === 'googlebooks'
                                ? 'https://developers.google.com/books/docs/v1/using'
                                : 'https://www.omdbapi.com/apikey.aspx',
                        target: '_blank',
                        rel: 'noopener',
                    },
                });
            }
        }
    };

    renderProviderGroup(t('settingsGames'), 'gamepad-2', gameProviders);
    renderProviderGroup(t('settingsAnime'), 'clapperboard', animeProviders);
    renderProviderGroup(t('settingsMoviesSeries'), 'film', videoProviders);
    renderProviderGroup(t('settingsBooks'), 'book-open', bookProviders);
    renderProviderGroup(t('settingsManga'), 'book-open-text', mangaProviders);

    providersGroup.body.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (target.closest('button, input, textarea, select, a, .lorebase-provider-detail-card')) return;
        clearSelectedProvider();
    });

    const steamSyncGroup = context.createCollapsibleGroup(
        container,
        t('commandSteamSync'),
        t('settingsIntegrationsSteamSyncDesc'),
        false
    );
    steamSyncGroup.root.addClass('lorebase-integration-steam-sync-group');
    renderSteamSyncSettings(context, steamSyncGroup.body, { embedded: true });

    const templatesGroup = context.createCollapsibleGroup(
        container,
        t('settingsIntegrationsTemplates'),
        undefined,
        true
    );
    templatesGroup.root.addClass('lorebase-integration-templates-group');
    const templateTabsHost = templatesGroup.body.createDiv({ cls: 'lorebase-integration-template-tabs' });
    const templatePanels = templatesGroup.body.createDiv({ cls: 'lorebase-integration-template-panels' });
    const templatePanelMap = new Map<MediaTypeKey, HTMLElement>();

    const selectTemplateMedia = (media: MediaTypeKey): void => {
        context.setActiveMediaTab('integrationTemplates', media);
        templatePanelMap.forEach((panel, key) => {
            const active = key === media;
            panel.toggleClass('is-active', active);
            panel.toggleAttribute('hidden', !active);
        });
    };

    const renderTemplateSettings = (
        key: MediaTypeKey,
        titleKey: TranslationKey,
        descKey: TranslationKey,
        fields: TemplateFieldDef[]
    ): void => {
        const media = integrations.media[key];

        const panel = templatePanels.createDiv({
            cls: `lorebase-integration-template-panel is-${key}`,
            attr: { role: 'tabpanel' },
        });
        templatePanelMap.set(key, panel);

        new Setting(panel)
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
        const templateModeSetting = new Setting(panel)
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
            new Setting(panel)
                .setName(t('settingsIntegrationsHowLongToBeat'))
                .setDesc(t('settingsIntegrationsHowLongToBeatDesc'))
                .addToggle(toggle => {
                    toggle
                        .setValue(media.howLongToBeatEnabled ?? false)
                        .onChange(async (value) => {
                            media.howLongToBeatEnabled = value;
                            if (value) {
                                enableHowLongToBeatTemplateFields(media);
                            }
                            await context.plugin.saveSettings();
                            context.display();
                        });
                });

            const steamGridDb = integrations.providers.steamgriddb;
            let steamGridDbPanelOpen = false;
            let steamGridDbChevron: HTMLElement | null = null;
            let steamGridDbApiPanel: HTMLElement | null = null;
            const syncSteamGridDbPanel = (): void => {
                steamGridDbApiPanel?.toggleClass('is-open', steamGridDbPanelOpen);
                steamGridDbApiPanel?.toggleClass('is-hidden', !steamGridDbPanelOpen);
                steamGridDbChevron?.toggleClass('is-open', steamGridDbPanelOpen);
            };

            const steamGridDbSetting = new Setting(panel)
                .setName(t('settingsIntegrationsSteamGridDb'))
                .setDesc(t('settingsIntegrationsSteamGridDbDesc'))
                .addButton(button => {
                    button
                        .setIcon('chevron-down')
                        .setTooltip(t('settingsIntegrationsSteamGridDbApiKey'))
                        .onClick(() => {
                            steamGridDbPanelOpen = !steamGridDbPanelOpen;
                            syncSteamGridDbPanel();
                        });
                    steamGridDbChevron = button.buttonEl;
                    steamGridDbChevron.addClass('lorebase-steamgriddb-chevron');
                })
                .addToggle(toggle => {
                    toggle
                        .setValue(steamGridDb.enabled)
                        .onChange(async (value) => {
                            steamGridDb.enabled = value;
                            await context.plugin.saveSettings();
                        });
                });
            steamGridDbSetting.settingEl.addClass('lorebase-steamgriddb-setting');

            steamGridDbApiPanel = panel.createDiv({ cls: 'lorebase-steamgriddb-api-panel is-hidden' });
            steamGridDbApiPanel.createDiv({
                cls: 'lorebase-steamgriddb-api-title',
                text: t('settingsIntegrationsSteamGridDbApiKey'),
            });
            const keyInput = steamGridDbApiPanel.createEl('input', {
                cls: 'lorebase-provider-key-input',
                attr: {
                    type: 'password',
                    placeholder: t('settingsIntegrationsSteamGridDbApiKey'),
                },
            });
            keyInput.value = steamGridDb.apiKey ?? '';
            keyInput.addEventListener('input', () => {
                steamGridDb.apiKey = keyInput.value.trim();
                void context.plugin.saveSettings();
            });

            const help = steamGridDbApiPanel.createDiv({ cls: 'lorebase-provider-help' });
            help.createDiv({
                cls: 'lorebase-provider-help-title',
                text: t('settingsIntegrationsSteamGridDbHelpTitle'),
            });
            help.createDiv({
                cls: 'lorebase-provider-help-text',
                text: t('settingsIntegrationsSteamGridDbHelpText'),
            });
            const links = help.createDiv({ cls: 'lorebase-provider-help-links' });
            links.createEl('a', {
                text: t('settingsIntegrationsSteamGridDbLink'),
                attr: {
                    href: 'https://www.steamgriddb.com/profile/preferences/api',
                    target: '_blank',
                    rel: 'noopener',
                },
            });
            syncSteamGridDbPanel();
        }

        if ((media.templateMode ?? 'advanced') === 'simple') {
            const visibleFields = key === 'games'
                ? getGameTemplateFields(Boolean(media.howLongToBeatEnabled))
                : fields;
            renderSimpleTemplateFieldEditor(context, panel, media, visibleFields);
            return;
        }

        new Setting(panel)
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
    renderTemplateSettings('movies', 'settingsIntegrationsMoviesTemplate', 'settingsIntegrationsMoviesTemplateDesc', MOVIE_TEMPLATE_FIELDS);
    renderTemplateSettings('series', 'settingsIntegrationsSeriesTemplate', 'settingsIntegrationsSeriesTemplateDesc', SERIES_TEMPLATE_FIELDS);
    renderTemplateSettings('books', 'settingsIntegrationsBooksTemplate', 'settingsIntegrationsBooksTemplateDesc', BOOK_TEMPLATE_FIELDS);
    renderTemplateSettings('manga', 'settingsIntegrationsMangaTemplate', 'settingsIntegrationsMangaTemplateDesc', MANGA_TEMPLATE_FIELDS);
    createMediaTabs(
        templateTabsHost,
        [
            { value: 'games', label: t('settingsGames'), icon: 'gamepad-2' },
            { value: 'anime', label: t('settingsAnime'), icon: 'clapperboard' },
            { value: 'movies', label: t('settingsMovies'), icon: 'film' },
            { value: 'series', label: t('settingsSeries'), icon: 'tv' },
            { value: 'books', label: t('settingsBooks'), icon: 'book-open' },
            { value: 'manga', label: t('settingsManga'), icon: 'book-open-text' },
        ],
        context.getActiveMediaTab('integrationTemplates'),
        t('settingsIntegrationTemplateTabs'),
        selectTemplateMedia
    );
    selectTemplateMedia(context.getActiveMediaTab('integrationTemplates'));
}
