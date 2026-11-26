import { handleAsyncAction } from '../../utils/actionHandler';
import { renderTemplateFieldsEditor } from '../../components/TemplateFieldsEditor';
import { buildDefaultAdvancedTemplate, completeAdvancedTemplate, rememberAdvancedTemplate, switchTemplateMode } from '../../services/integrations/templatePreferences';
import { renderAdditionalProviderHelp } from './additionalProviderHelp';
import { normalizeTmdbLanguage } from '../../services/integrations/providers/tmdb';
import { getTmdbLanguageOptions } from '../../utils/tmdbLanguageOptions';
import { renderProviderLegend } from './providerLegend';
import { mt } from '../../localization/music';
import { renderMusicProviderSettings } from './music';
import { Notice, Setting, setIcon } from 'obsidian';
import { i18n, t, type TranslationKey } from '../../localization';
import type { IntegrationTemplateSettings, NoteTemplateSettings } from '../../types';
import { getSecretStorage } from '../../services/CredentialStore';
import { IntegrationService } from '../../services/IntegrationService';
import {
    buildIntegrationDiagnosticReport,
    clearIntegrationDiagnostics,
    getIntegrationDiagnostics,
    type IntegrationDiagnosticEvent,
    type IntegrationDiagnosticOutcome,
} from '../../services/integrations/diagnostics';
import { getActiveIntegrationCooldowns } from '../../services/integrations/shared';
import { buildSimpleTemplate, getDefaultTemplateFields, getEffectiveSimpleTemplateFields, getSimpleWikilinkTokens } from '../../services/integrations/templateUtils';
import { ANIME_TEMPLATE_FIELDS, BOOK_TEMPLATE_FIELDS, GAME_TEMPLATE_FIELDS, GAME_TEMPLATE_FIELDS_HLTB, ICON_INTEGRATIONS, MANGA_TEMPLATE_FIELDS, MOVIE_TEMPLATE_FIELDS, SERIES_TEMPLATE_FIELDS } from './constants';
import { createLorebaseDropdown } from '../../components/LorebaseDropdown';
import { createProviderCredential, createProviderKeyHelp, createProviderLanguageField, createProviderLanguagePanel, providerApiKeyLabel } from './providerFields';
import { renderChoiceButtons } from './choiceButtons';
import { renderSyncSection } from './sync';
import type { SettingsSectionContext, TemplateFieldDef } from './types';
import { MEDIA_SETTINGS_ICONS } from '../../mediaPresentation';
import { getDeferredTemplateFields, getTemplateYamlKeys } from '../../services/integrations/templateSchema';
import { compactTemplateCopy, templateCopy, templateFieldDescription, templateFieldName } from './templateFieldHelp';
import type { TemplateKind } from '../../services/integrations/types';
import { renderMediaSwitch } from './mediaSwitch';
import { renderTemplateCodeEditor, renderTemplateFieldHint, renderTemplatePreview } from './templateTools';
import { renderGlobalTemplateWikilinks } from './templateWikilinks';
import { setTemplateWikilinkFields, updateTemplateWikilinks } from '../../services/integrations/templateWikilinks';
import { isProviderEnabled, setProviderEnabled } from '../../services/integrations/providerSettings';
import { renderAlternativeTitleSettings } from './alternativeTitleSettings';

type ProviderSettingsId = 'howlongtobeat' | 'steamgriddb' | 'musicbrainz' | 'lastfm' | 'deezer' | 'rawg' | 'steam' | 'igdb' | 'anilist' | 'kitsu' | 'shikimori' | 'tmdb' | 'tvmaze' | 'omdb' | 'hardcover' | 'googlebooks' | 'openlibrary' | 'mangaupdates' | 'mangadex' | 'vndb' | 'comicvine';
type ProviderCategory = 'games' | 'anime' | 'video' | 'books' | 'manga' | 'music';

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

const musicLabels: Partial<Record<string, TranslationKey>> = {
    title: 'templateFieldName', type: 'templateFieldType', poster: 'templateFieldPoster',
    description: 'templateFieldPlot', year: 'templateFieldYear', released: 'templateFieldReleased',
    genres: 'templateFieldGenres', tags: 'templateFieldTags', status: 'templateFieldStatus',
    rating: 'templateFieldRating', favorite: 'templateFieldFavorite', url: 'templateFieldUrl',
};
const musicHelpKeys: Record<string, string> = {
    title: 'name', description: 'plot', detailed_ratings: 'detailedRatings',
    integration_provider: 'integrationSource', integration_id: 'integrationSource',
};

function fieldName(kind: TemplateKind, field: TemplateFieldDef): string {
    if (kind === 'music') {
        if (field.key === 'artist' || field.key === 'album' || field.key === 'duration' || field.key === 'tracks') return mt(field.key);
        return templateFieldName(musicHelpKeys[field.key] ?? field.key) ?? (musicLabels[field.key] ? t(field.label) : field.key);
    }
    return templateFieldName(field.key) ?? t(field.label);
}

function fieldDescription(kind: TemplateKind, key: string): string {
    return templateFieldDescription(kind === 'music' ? musicHelpKeys[key] ?? key : key);
}

function renderSimpleTemplateFieldEditor(
    context: SettingsSectionContext,
    container: HTMLElement,
    media: NoteTemplateSettings,
    fields: TemplateFieldDef[],
    kind: TemplateKind,
    onPreferencesChange: () => void,
): void {
    const editor = container.createDiv();
    const updatePreview = renderTemplatePreview(container, media.template);
    const orderedKeys = getTemplateFieldOrder(media.templateFields, fields);
    const labels = new Map(fields.map(field => [field.key, fieldName(kind, field)]));
    const selected = new Set((media.templateFields ?? getDefaultTemplateFields(kind)).filter(key => orderedKeys.includes(key)));
    const linkableFields = new Set(Object.keys(getSimpleWikilinkTokens(kind)));
    renderTemplateFieldsEditor(editor, {
        fields: orderedKeys.map(key => ({
            key, name: labels.get(key) ?? key,
            property: getTemplateYamlKeys(buildSimpleTemplate(kind, [key], media.fieldAliases)).join(', '),
            description: fieldDescription(kind, key),
            canWikilink: linkableFields.has(key),
        })),
        selected,
        defaultOrder: getDefaultTemplateFields(kind),
        wikilinks: {
            fields: new Set(media.wikilinkFields ?? linkableFields),
            onChange: fields => {
                setTemplateWikilinkFields(media, kind, [...fields]);
                updatePreview(media.template);
                onPreferencesChange();
                void context.plugin.saveSettings();
            },
        },
        onChange: (keys, enabled) => {
            media.templateFields = keys.filter(key => enabled.has(key));
            media.template = buildSimpleTemplate(kind, media.templateFields, media.fieldAliases, media.wikilinkFields);
            updatePreview(media.template);
            void context.plugin.saveSettings();
        },
    });
}

function getGameTemplateFields(): TemplateFieldDef[] {
    const fields = [...GAME_TEMPLATE_FIELDS, ...GAME_TEMPLATE_FIELDS_HLTB];
    for (const field of getDeferredTemplateFields('games')) {
        if (!fields.some(candidate => candidate.key === field.key)) fields.push({ key: field.key, label: field.key === 'tags' ? 'templateFieldTags' : field.key === 'adult' ? 'editAdult' : 'templateFieldName' });
    }
    return fields;
}

function enableHowLongToBeatTemplateFields(media: IntegrationTemplateSettings): void {
    const hltbFields = GAME_TEMPLATE_FIELDS_HLTB.map((field) => field.key);
    const current = media.templateFields?.length
        ? media.templateFields
        : GAME_TEMPLATE_FIELDS.map((field) => field.key);
    media.templateFields = Array.from(new Set([...current, ...hltbFields]));
}

function syncSimpleTemplate(
    media: NoteTemplateSettings,
    kind: TemplateKind,
    howLongToBeatEnabled = false
): void {
    if (media.templateMode === 'advanced') return;
    const selected = media.templateFields ?? getDefaultTemplateFields(kind);
    media.templateFields = getEffectiveSimpleTemplateFields(kind, selected, {
        howLongToBeatEnabled
    });
    media.template = buildSimpleTemplate(kind, media.templateFields, media.fieldAliases, media.wikilinkFields);
}

type IntegrationsPane = 'providers' | 'sync' | 'diagnostics';
const requestedProviderSettings = new WeakMap<object, ProviderSettingsId>();

export function requestProviderSettings(plugin: object, provider: 'tmdb' | 'anilist'): void {
    requestedProviderSettings.set(plugin, provider);
    requestIntegrationsPane(plugin, 'providers');
}

const activeIntegrationPanes = new WeakMap<object, IntegrationsPane>();

export function requestIntegrationsPane(plugin: object, pane: IntegrationsPane): void {
    activeIntegrationPanes.set(plugin, pane);
}

export function renderIntegrationsSection(context: SettingsSectionContext, container: HTMLElement): void {
    const integrations = context.plugin.settings.integrations;
    if (!integrations) return;

    context.createSectionHeader(container, ICON_INTEGRATIONS, t('settingsIntegrations'));
    const secretStorage = getSecretStorage(context.app);
    const credentialNotice = secretStorage ? {
        en: 'Keys and tokens are kept on this device in Obsidian’s secure storage (Secret Storage). On another device, you may need to reconnect your services.',
        ru: 'Ключи и токены хранятся на этом устройстве в защищённом хранилище Obsidian (Secret Storage). На другом устройстве может потребоваться повторное подключение сервисов.',
        uk: 'Ключі й токени зберігаються на цьому пристрої в захищеному сховищі Obsidian (Secret Storage). На іншому пристрої може знадобитися повторне підключення сервісів.',
        'zh-CN': '密钥和令牌保存在此设备的 Obsidian 安全存储（Secret Storage）中。在其他设备上可能需要重新连接服务。',
    } : {
        en: 'This Obsidian version stores credentials in plugin settings. Obsidian 1.11.4 or newer is required for Secret Storage.',
        ru: 'В этой версии Obsidian ключи хранятся в настройках плагина. Для Secret Storage требуется Obsidian 1.11.4 или новее.',
        uk: 'У цій версії Obsidian ключі зберігаються в налаштуваннях плагіна. Для Secret Storage потрібен Obsidian 1.11.4 або новіший.',
        'zh-CN': '此版本将凭据保存在插件设置中。Secret Storage 需要 Obsidian 1.11.4 或更高版本。',
    };
    const notice = container.createDiv({ cls: 'lorebase-credential-storage-notice' });
    setIcon(notice.createSpan({ attr: { 'aria-hidden': 'true' } }), secretStorage ? 'shield-check' : 'info');
    notice.createDiv({ text: credentialNotice[context.plugin.settings.language] });
    const navigation = container.createDiv({ cls: 'lorebase-settings-subnav' });
    const options: Array<{ value: IntegrationsPane; label: string; icon: string }> = [
        { value: 'providers', label: t('settingsIntegrationsProviders'), icon: 'plug' },
    ];
    if (integrations.enabled) options.push({ value: 'sync', label: t('settingsSync'), icon: 'refresh-cw' });
    options.push({ value: 'diagnostics', label: t('settingsDiagnostics'), icon: 'activity' });

    const panels = new Map<IntegrationsPane, HTMLElement>();
    for (const { value } of options) panels.set(value, container.createDiv());
    const show = (value: IntegrationsPane): void => {
        activeIntegrationPanes.set(context.plugin, value);
        for (const [key, panel] of panels) panel.hidden = key !== value;
        if (value === 'diagnostics') panels.get(value)?.dispatchEvent(new Event('lorebase-diagnostics-show'));
    };
    const requested = activeIntegrationPanes.get(context.plugin) ?? 'providers';
    const initial = panels.has(requested) ? requested : 'providers';
    renderChoiceButtons(navigation, t('settingsIntegrations'), options, initial, show);
    renderProviders(context, panels.get('providers')!);
    const sync = panels.get('sync');
    if (sync) {
        sync.createDiv({ cls: 'lorebase-settings-section-description', text: t('settingsSectionSyncDesc') });
        renderSyncSection(context, sync);
    }
    renderIntegrationDiagnostics(panels.get('diagnostics')!);
    show(initial);
}

function renderProviders(context: SettingsSectionContext, container: HTMLElement): void {
    const integrations = context.plugin.settings.integrations;
    if (!integrations) return;

    const integrationService = new IntegrationService(context.app, () => context.plugin.settings);

    const preferences = container.createDiv({ cls: 'lorebase-provider-preferences' });
    const master = preferences.createDiv({ cls: 'lorebase-provider-master' });
    const masterCopy = master.createDiv();
    masterCopy.createDiv({ cls: 'setting-item-name', text: t('settingsIntegrationsEnable') });
    masterCopy.createDiv({ cls: 'setting-item-description', text: t('settingsIntegrationsEnableDesc') });
    renderMediaSwitch(master, t('settingsIntegrationsEnable'), integrations.enabled, value => {
        integrations.enabled = value;
        void context.plugin.saveSettings().then(() => context.display());
        return true;
    });

    if (!integrations.enabled) return;

    const pacing = preferences.createEl('details', { cls: 'lorebase-provider-pacing' });
    const pacingSummary = pacing.createEl('summary');
    setIcon(pacingSummary.createSpan({ attr: { 'aria-hidden': 'true' } }), 'timer');
    pacingSummary.createSpan({ text: t('settingsIntegrationsRequestCooldown') });
    setIcon(pacingSummary.createSpan({ cls: 'lorebase-provider-pacing-arrow', attr: { 'aria-hidden': 'true' } }), 'chevron-down');
    new Setting(pacing)
        .setDesc(t('settingsIntegrationsRequestCooldownDesc'))
        .addSlider(slider => {
            slider
                .setLimits(0, 10, 0.5)
                .setDynamicTooltip()
                .setValue(Number.isFinite(integrations.requestCooldownSeconds)
                    ? Math.min(10, Math.max(0, integrations.requestCooldownSeconds))
                    : 1)
                .onChange(async (value) => {
                    integrations.requestCooldownSeconds = value;
                    await context.plugin.saveSettings();
                });
        });

    const providersBlock = container.createDiv({ cls: 'lorebase-settings-block lorebase-provider-directory' });
    providersBlock.createEl('h3', { cls: 'lorebase-settings-group-title', text: t('settingsIntegrationsProviders') });
    const providerWorkspace = providersBlock.createDiv({ cls: 'lorebase-provider-workspace' });

    const games = integrations.media.games;
    const steamGridDb: ProviderSettingsDef = {
        id: 'steamgriddb', label: 'SteamGridDB', detailLabel: t('settingsIntegrationsSteamGridDb'), needsKey: true,
    };
    const gameProviders: ProviderSettingsDef[] = [
        { id: 'rawg', label: 'RAWG', detailLabel: t('settingsIntegrationsProviderRawg'), needsKey: true },
        { id: 'steam', label: 'Steam', detailLabel: t('settingsIntegrationsProviderSteam'), needsKey: false },
        { id: 'igdb', label: 'IGDB', detailLabel: t('settingsIntegrationsProviderIgdb'), needsKey: true, needsClientSecret: true },
        { id: 'vndb', label: 'VNDB', detailLabel: 'VNDB', needsKey: false },
        { id: 'howlongtobeat', label: 'HLTB', detailLabel: t('settingsIntegrationsHowLongToBeat'), needsKey: false },
    ];
    const animeProviders: ProviderSettingsDef[] = [
        { id: 'anilist', label: 'AniList', detailLabel: t('settingsIntegrationsProviderAnilist'), needsKey: false },
        { id: 'kitsu', label: 'Kitsu', detailLabel: t('settingsIntegrationsProviderKitsu'), needsKey: false },
        { id: 'shikimori', label: 'Shikimori', detailLabel: t('settingsIntegrationsProviderShikimori'), needsKey: false }
    ];
    const bookProviders: ProviderSettingsDef[] = [
        { id: 'hardcover', label: 'Hardcover', detailLabel: t('settingsIntegrationsProviderHardcover'), needsKey: true },
        { id: 'googlebooks', label: 'Google Books', detailLabel: t('settingsIntegrationsProviderGooglebooks'), needsKey: true, showKeyInput: true },
        { id: 'openlibrary', label: 'Open Library', detailLabel: 'Open Library', needsKey: false },
    ];
    const mangaProviders: ProviderSettingsDef[] = [
        { id: 'anilist', label: 'AniList', detailLabel: `AniList (${t('settingsManga')})`, needsKey: false },
        { id: 'shikimori', label: 'Shikimori', detailLabel: `Shikimori (${t('settingsManga')})`, needsKey: false },
        { id: 'mangaupdates', label: 'MUpd', detailLabel: t('settingsIntegrationsProviderMangaupdates'), needsKey: false },
        { id: 'mangadex', label: 'MangaDex', detailLabel: t('settingsIntegrationsProviderMangadex'), needsKey: false },
        { id: 'comicvine', label: 'Comic Vine', detailLabel: t('settingsIntegrationsProviderComicVine'), needsKey: true },
    ];
    const videoProviders: ProviderSettingsDef[] = [
        { id: 'tmdb', label: 'TMDB', detailLabel: t('settingsIntegrationsProviderTmdb'), needsKey: true },
        { id: 'tvmaze', label: 'TVmaze', detailLabel: t('settingsIntegrationsProviderTvmaze'), needsKey: false, showKeyInput: false },
        { id: 'omdb', label: 'OMDb', detailLabel: t('settingsIntegrationsProviderOmdb'), needsKey: true },
    ];
    const musicProviders: ProviderSettingsDef[] = [
        { id: 'musicbrainz', label: 'MusicBrainz', detailLabel: 'MusicBrainz', needsKey: false },
        { id: 'lastfm', label: 'Last.fm', detailLabel: 'Last.fm', needsKey: true },
        { id: 'deezer', label: 'Deezer', detailLabel: 'Deezer', needsKey: false },
    ];
    let selectedProviderId: string | null = null;

    const providerPicker = providerWorkspace.createDiv({ cls: 'lorebase-provider-picker' });
    const providerDetails = providerWorkspace.ownerDocument.createElement('div');
    providerDetails.className = 'lorebase-provider-details is-visible';
    const chipButtons = new Map<string, { chip: HTMLButtonElement; definition: ProviderSettingsDef; group: HTMLElement; category: ProviderCategory }>();
    const stateLabels = {
        en: { enabled: 'Enabled', disabled: 'Disabled', unconfigured: 'Setup required' },
        ru: { enabled: 'Включён', disabled: 'Выключен', unconfigured: 'Не настроен' },
        uk: { enabled: 'Увімкнено', disabled: 'Вимкнено', unconfigured: 'Не налаштовано' },
        'zh-CN': { enabled: '已启用', disabled: '已停用', unconfigured: '待配置' },
    }[i18n.getLanguage()];
    renderProviderLegend(providersBlock);

    const renderProviderGroup = (group: ProviderCategory, label: string, icon: string, providers: ProviderSettingsDef[]): void => {
        const groupEl = providerPicker.createEl('section', { cls: 'lorebase-provider-chip-group' });
        const heading = groupEl.createEl('h4', { cls: 'lorebase-provider-chip-title' });
        setIcon(heading.createSpan({ attr: { 'aria-hidden': 'true' } }), icon);
        heading.createSpan({ text: label });
        const chipsEl = groupEl.createDiv({ cls: 'lorebase-provider-chips' });

        for (const provider of providers) {
            const chip = chipsEl.createEl('button', {
                cls: 'lorebase-provider-chip',
                attr: { type: 'button', 'aria-expanded': 'false' },
            });
            chip.createSpan({ cls: 'lorebase-provider-state-dot', attr: { 'aria-hidden': 'true' } });
            chip.createSpan({ cls: 'lorebase-provider-name', text: provider.label });
            const chipId = group + ':' + provider.id;
            chipButtons.set(chipId, { chip, definition: provider, group: groupEl, category: group });
            chip.addEventListener('click', () => {
                selectedProviderId = selectedProviderId === chipId ? null : chipId;
                renderSelectedProvider();
            });
        }
    };

    const syncProviderChips = (): void => {
        for (const [id, { chip, definition, category }] of chipButtons) {
            const isActive = selectedProviderId !== null && id === selectedProviderId;
            chip.toggleClass('is-active', isActive);
            chip.setAttr('aria-expanded', String(isActive));
            if (definition.id === 'howlongtobeat') {
                const state = games.howLongToBeatEnabled ? 'enabled' : 'disabled';
                chip.dataset.providerState = state;
                chip.title = 'HLTB (HowLongToBeat) · ' + stateLabels[state];
                chip.setAttr('aria-label', chip.title);
                continue;
            }
            const providerId = definition.id;
            const music = providerId === 'musicbrainz' || providerId === 'lastfm' || providerId === 'deezer';
            const provider = music ? null : integrations.providers[providerId];
            const kind = category === 'anime' || category === 'manga' ? category : undefined;
            const enabled = music ? context.plugin.settings.music.providerEnabled?.[providerId] !== false : isProviderEnabled(integrations, providerId, kind);
            const key = music ? context.plugin.settings.music.lastfmApiKey : provider?.apiKey;
            const ready = !definition.needsKey || Boolean(key?.trim() && (!definition.needsClientSecret || provider?.clientSecret?.trim()));
            const state = !integrations.enabled || !enabled ? 'disabled' : ready ? 'enabled' : 'unconfigured';
            chip.dataset.providerState = state;
            chip.title = definition.label + ' · ' + stateLabels[state];
            chip.setAttr('aria-label', chip.title);
        }
    };

    const renderSelectedProvider = (): void => {
        syncProviderChips();
        providerDetails.empty();
        const selection = selectedProviderId === null ? undefined : chipButtons.get(selectedProviderId);
        if (!selection) {
            providerDetails.remove();
            return;
        }

        selection.group.append(providerDetails);
        renderProviderDetails(selection.definition, providerDetails, selection.category);
    };

    const renderProviderDetails = (definition: ProviderSettingsDef, providerDetails: HTMLElement, category?: ProviderCategory): void => {
        const { id, detailLabel, needsKey, showKeyInput = needsKey, needsClientSecret = false } = definition;
        if (id === 'musicbrainz' || id === 'lastfm' || id === 'deezer') { renderMusicProviderSettings(context, providerDetails, id, syncProviderChips); return; }
        if (id === 'howlongtobeat') {
            const hltb = new Setting(providerDetails)
                .setName(detailLabel)
                .setDesc(t('settingsIntegrationsHowLongToBeatDesc'))
                .addToggle(toggle => toggle.setValue(games.howLongToBeatEnabled ?? false).onChange(async value => {
                    games.howLongToBeatEnabled = value;
                    if (value) enableHowLongToBeatTemplateFields(games);
                    syncSimpleTemplate(games, 'games', value);
                    syncProviderChips();
                    await context.plugin.saveSettings();
                }));
            hltb.settingEl.addClass('lorebase-provider-detail-card', 'lorebase-hltb-settings');
            return;
        }
        const provider = integrations.providers[id];
        const kind = category === 'anime' || category === 'manga' ? category : undefined;
        providerDetails.toggleClass('is-igdb-provider', showKeyInput);

        const setting = new Setting(providerDetails)
            .setName(detailLabel)
            .addToggle(toggle => {
                toggle
                    .setValue(isProviderEnabled(integrations, id, kind))
                    .onChange(async (value) => {
                        setProviderEnabled(integrations, id, value, kind);
                        syncProviderChips();
                        await context.plugin.saveSettings();
                    });
            });
        if (id === 'steamgriddb') setting.setDesc(t('settingsIntegrationsSteamGridDbDesc'));
        setting.settingEl.addClass('lorebase-provider-setting');
        setting.settingEl.addClass('lorebase-provider-detail-card');
        if (showKeyInput) {
            setting.settingEl.addClass('is-igdb-provider');
        }

        if (id !== 'steamgriddb') {
            setting.addButton(button => {
                button
                    .setButtonText(t('settingsIntegrationsProviderTest'))
                    .onClick(() => {
                        void (async (): Promise<void> => {
                            const result = await integrationService.testProvider(id, kind);
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
                        })().catch(() => new Notice(t('noticeProviderTestFail')));
                    });
            });
        }

        if (showKeyInput) {
            setting.settingEl.addClass('has-key');
            setting.settingEl.addClass('is-key-open');
            const keyRow = setting.settingEl.createDiv({ cls: 'lorebase-provider-key-row lorebase-provider-credentials' });
            keyRow.classList.toggle('has-client-secret', needsClientSecret);
            const clientId = t('settingsIntegrationsProviderClientIdPlaceholder');
            createProviderCredential(keyRow, needsClientSecret ? clientId : providerApiKeyLabel(),
                needsClientSecret ? clientId : t(id === 'steamgriddb'
                    ? 'settingsIntegrationsSteamGridDbApiKey' : 'settingsIntegrationsProviderKeyPlaceholder'),
                provider.apiKey ?? '', value => {
                    provider.apiKey = value;
                    syncProviderChips();
                    void context.plugin.saveSettings();
                });

            if (id === 'comicvine') {
                const help = createProviderKeyHelp(keyRow);
                help.createDiv({ cls: 'lorebase-provider-help-text', text: t('settingsIntegrationsComicVineKeyHelp') });
                help.createDiv({ cls: 'lorebase-provider-help-links' }).createEl('a', {
                    text: 'Comic Vine API',
                    attr: { href: 'https://comicvine.gamespot.com/api/', target: '_blank', rel: 'noopener' },
                });
            } else if (id === 'steamgriddb') {
                const help = createProviderKeyHelp(keyRow);
                help.createDiv({ cls: 'lorebase-provider-help-title', text: t('settingsIntegrationsSteamGridDbHelpTitle') });
                help.createDiv({ cls: 'lorebase-provider-help-text', text: t('settingsIntegrationsSteamGridDbHelpText') });
                help.createDiv({ cls: 'lorebase-provider-help-links' }).createEl('a', {
                    text: t('settingsIntegrationsSteamGridDbLink'),
                    attr: { href: 'https://www.steamgriddb.com/profile/preferences/api', target: '_blank', rel: 'noopener' },
                });
            } else if (needsClientSecret) {
                const secret = t('settingsIntegrationsProviderClientSecretPlaceholder');
                createProviderCredential(keyRow, secret, secret, provider.clientSecret ?? '', value => {
                    provider.clientSecret = value;
                    syncProviderChips();
                    void context.plugin.saveSettings();
                });

                const help = createProviderKeyHelp(keyRow);
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
                const help = createProviderKeyHelp(keyRow);
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
                                ? 'https://hardcover.app/account/api/keys/new?scope=read%3Acatalog'
                            : id === 'googlebooks'
                                ? 'https://developers.google.com/books/docs/v1/using'
                                : 'https://www.omdbapi.com/apikey.aspx',
                        target: '_blank',
                        rel: 'noopener',
                    },
                });
            }
        }
        if (id === 'tmdb') renderTmdbLanguages(context, setting.settingEl);
        if (kind && id !== 'steamgriddb') renderAlternativeTitleSettings(context, setting.settingEl, id, kind);

        if (id === 'steam') {
            setting.settingEl.addClass('has-provider-extra');
            const artwork = setting.settingEl.createEl('details', { cls: 'lorebase-provider-steam-artwork' });
            const summary = artwork.createEl('summary');
            setIcon(summary.createSpan({ attr: { 'aria-hidden': 'true' } }), 'images');
            summary.createSpan({ text: steamGridDb.label });
            setIcon(summary.createSpan({ cls: 'lorebase-provider-artwork-chevron', attr: { 'aria-hidden': 'true' } }), 'chevron-down');
            renderProviderDetails(steamGridDb, artwork.createDiv());
        }
        if (id === 'vndb') {
            const helpRow = setting.settingEl.createDiv({ cls: 'lorebase-provider-free-access' });
            setting.settingEl.addClass('has-provider-extra');
            renderAdditionalProviderHelp(helpRow, 'vndb');
        }
    };

    const catalog = [
        { value: 'games', label: t('settingsGames'), icon: MEDIA_SETTINGS_ICONS.games, providers: gameProviders },
        { value: 'anime', label: t('settingsAnime'), icon: MEDIA_SETTINGS_ICONS.anime, providers: animeProviders },
        { value: 'video', label: t('settingsMoviesSeries'), icon: MEDIA_SETTINGS_ICONS.movies, providers: videoProviders },
        { value: 'books', label: t('settingsBooks'), icon: MEDIA_SETTINGS_ICONS.books, providers: bookProviders },
        { value: 'manga', label: t('settingsMangaAndComics'), icon: MEDIA_SETTINGS_ICONS.manga, providers: mangaProviders },
        { value: 'music', label: mt('music'), icon: 'music', providers: musicProviders },
    ] as const;
    for (const { value, label, icon, providers } of catalog) renderProviderGroup(value, label, icon, providers);
    const requestedProvider = requestedProviderSettings.get(context.plugin);
    requestedProviderSettings.delete(context.plugin);
    const requested = [...chipButtons].find(([, item]) => item.definition.id === requestedProvider);
    selectedProviderId = requested?.[0] ?? null;
    renderSelectedProvider();
}

function renderTmdbLanguages(context: SettingsSectionContext, container: HTMLElement): void {
    const integrations = context.plugin.settings.integrations;
    if (!integrations) return;
    container.addClass('has-provider-extra');
    const grid = createProviderLanguagePanel(container, 'lorebase-tmdb-language-setting',
        t('settingsTmdbLanguage'), t('settingsTmdbLanguageDesc'));
    const options = getTmdbLanguageOptions(i18n.getLanguage());
    for (const kind of ['movies', 'series'] as const) {
        const media = integrations.media[kind];
        const field = createProviderLanguageField(grid, t(kind === 'movies' ? 'settingsMovies' : 'settingsSeries'), MEDIA_SETTINGS_ICONS[kind]);
        createLorebaseDropdown(field.createDiv(), options, normalizeTmdbLanguage(media.tmdbLanguage),
            async value => {
                media.tmdbLanguage = value;
                await context.plugin.saveSettings();
            }, { floating: true, panelClass: 'lorebase-language-panel' });
    }
}

export function renderTemplatesSection(context: SettingsSectionContext, container: HTMLElement): void {
    const integrations = context.plugin.settings.integrations;
    if (!integrations) return;
    context.createSectionHeader(container, 'lucide:file-code', t('settingsIntegrationsTemplates'));
    container.createDiv({ cls: 'lorebase-settings-section-description', text: t('settingsTemplatesDesc') });
    const compactCopy = compactTemplateCopy();
    const compact = container.createDiv({ cls: 'lorebase-template-compact' });
    setIcon(compact.createSpan({ cls: 'lorebase-template-compact-icon', attr: { 'aria-hidden': 'true' } }), 'list-minus');
    const compactText = compact.createDiv();
    compactText.createEl('strong', { text: compactCopy.title });
    compactText.createDiv({ cls: 'setting-item-description', text: compactCopy.description });
    renderMediaSwitch(compact, compactCopy.title, integrations.compactTemplates === true, value => {
        integrations.compactTemplates = value;
        void context.plugin.saveSettings();
        return true;
    });

    const refreshEditors: Array<(enabled: boolean) => void> = [];
    const refreshWikilinks = renderGlobalTemplateWikilinks(container, context.plugin.settings, enabled => {
        refreshEditors.forEach(refresh => refresh(enabled));
        void context.plugin.saveSettings();
    });

    const templates = container.createDiv({ cls: 'lorebase-integration-templates-group' });
    const heading = templates.createDiv({ cls: 'lorebase-template-header' });
    const currentTitle = heading.createEl('h3');
    const switches = heading.createDiv({ cls: 'lorebase-template-switches' });
    const navigation = heading.createDiv({ cls: 'lorebase-template-media-nav' });
    navigation.createDiv({ cls: 'lorebase-template-media-label', text: templateCopy('media') });
    const templatePanels = templates.createDiv({ cls: 'lorebase-integration-template-panels' });
    const templatePanelMap = new Map<TemplateKind, { panel: HTMLElement; control: HTMLElement; title: string }>();
    const selectTemplateMedia = (media: TemplateKind): void => {
        context.setActiveMediaTab('integrationTemplates', media);
        templatePanelMap.forEach(({ panel, control, title }, key) => {
            const active = key === media;
            panel.hidden = !active;
            panel.toggleClass('is-active', active);
            control.hidden = !active;
            if (active) currentTitle.setText(title);
        });
    };

    const renderTemplateSettings = (key: TemplateKind, title: string, baseFields: TemplateFieldDef[]): void => {
        const integration = key === 'music' ? undefined : integrations.media[key];
        const media = integration ?? context.plugin.settings.music.noteTemplate;
        if (!media) return;
        const fields = [...baseFields];
        if (key !== 'music') {
            for (const field of getDeferredTemplateFields(key)) {
                if (!fields.some(candidate => candidate.key === field.key)) {
                    fields.push({ key: field.key, label: field.key === 'tags' ? 'templateFieldTags' : field.key === 'adult' ? 'editAdult' : field.key === 'studios' ? 'templateFieldStudios' : 'templateFieldName' });
                }
            }
        }

        const panel = templatePanels.createDiv({
            cls: 'lorebase-integration-template-panel is-' + key,
            attr: { role: 'group', 'aria-label': title },
        });
        const control = switches.createDiv({ cls: 'lorebase-template-switch' });
        templatePanelMap.set(key, { panel, control, title });
        control.createSpan({ text: templateCopy('useTemplate') });
        renderMediaSwitch(control, templateCopy('useTemplate'), media.templateEnabled, value => {
            media.templateEnabled = value;
            void context.plugin.saveSettings();
            renderEditor();
            return true;
        });
        const content = panel.createDiv({ cls: 'lorebase-template-content' });
        let advancedDraft: string | undefined;
        const renderEditor = (): void => {
            content.empty();
            if (!media.templateEnabled) {
                content.createDiv({ cls: 'setting-item-description', text: templateCopy('disabled') });
                return;
            }

            const mode = media.templateMode ?? 'simple';
            const toolbar = content.createDiv({ cls: 'lorebase-template-toolbar' });
            toolbar.createEl('h4', { text: t(mode === 'simple' ? 'settingsIntegrationsTemplateFields' : 'settingsIntegrationsTemplateContent') });
            renderChoiceButtons<'simple' | 'advanced'>(toolbar, t('settingsIntegrationsTemplateMode'), [
                { value: 'simple', label: t('settingsIntegrationsTemplateModeSimple'), icon: 'list-checks' },
                { value: 'advanced', label: t('settingsIntegrationsTemplateModeAdvanced'), icon: 'code-2' },
            ], mode, value => {
                switchTemplateMode(key, media, value);
                if (value === 'simple') syncSimpleTemplate(media, key, integration?.howLongToBeatEnabled);
                void context.plugin.saveSettings();
                renderEditor();
                refreshWikilinks();
            });
            content.createDiv({ cls: 'lorebase-template-guide', text: templateCopy(mode) });

            if (mode === 'simple') {
                renderSimpleTemplateFieldEditor(context, content, media, fields, key, refreshWikilinks);
                return;
            }

            const { editor, hint, footer: actions, syncLines } = renderTemplateCodeEditor(
                content, t('settingsIntegrationsTemplateContent'), advancedDraft ?? media.template
            );
            const complete = actions.createEl('button', { text: templateCopy('complete'), attr: { type: 'button' } });
            const save = actions.createEl('button', { cls: 'mod-cta', text: templateCopy('save'), attr: { type: 'button' } });
            const status = actions.createSpan({ cls: 'setting-item-description', attr: { role: 'status' } });
            const syncButtons = (): void => {
                advancedDraft = editor.value === media.template ? undefined : editor.value;
                save.disabled = advancedDraft === undefined;
                complete.disabled = completeAdvancedTemplate(key, editor.value) === editor.value;
            };
            editor.addEventListener('input', () => {
                syncButtons();
                status.setText(save.disabled ? '' : templateCopy('unsaved'));
            });
            complete.addEventListener('click', () => {
                editor.value = completeAdvancedTemplate(key, editor.value);
                syncLines();
                updateHint();
                syncButtons();
                status.setText(save.disabled ? '' : templateCopy('unsaved'));
            });
            save.addEventListener('click', handleAsyncAction(async () => {
                const draft = editor.value;
                if (draft.trimStart().startsWith('---') && !/^\uFEFF?---[ \t]*\r?\n[\s\S]*?^---[ \t]*$/m.test(draft)) {
                    status.setText(templateCopy('invalid'));
                    return;
                }
                const keys = getTemplateYamlKeys(draft);
                if (new Set(keys).size !== keys.length) {
                    status.setText(templateCopy('duplicates'));
                    return;
                }
                if (!media.fieldAliases) rememberAdvancedTemplate(key, media);
                media.template = draft;
                rememberAdvancedTemplate(key, media);
                refreshWikilinks();
                syncButtons();
                await context.plugin.saveSettings();
                status.setText(save.disabled ? templateCopy('saved') : templateCopy('unsaved'));
            }));
            editor.addEventListener('keydown', event => {
                if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
                    event.preventDefault();
                    event.stopPropagation();
                    save.click();
                }
            });
            syncButtons();
            if (advancedDraft !== undefined) status.setText(templateCopy('unsaved'));

            const updateHint = renderTemplateFieldHint(hint, editor, fields.map(field => ({
                name: fieldName(key, field),
                description: fieldDescription(key, field.key),
                yaml: buildDefaultAdvancedTemplate(key, media.fieldAliases, [field.key]).split('\n').slice(1, -4).join('\n'),
            })), getSimpleWikilinkTokens(key));
        };
        refreshEditors.push(enabled => {
            if (advancedDraft !== undefined) advancedDraft = updateTemplateWikilinks(advancedDraft, key, enabled);
            renderEditor();
        });
        renderEditor();
    };

    renderTemplateSettings('games', t('settingsIntegrationsGamesTemplate'), getGameTemplateFields());
    renderTemplateSettings('anime', t('settingsIntegrationsAnimeTemplate'), ANIME_TEMPLATE_FIELDS);
    renderTemplateSettings('movies', t('settingsIntegrationsMoviesTemplate'), MOVIE_TEMPLATE_FIELDS);
    renderTemplateSettings('series', t('settingsIntegrationsSeriesTemplate'), SERIES_TEMPLATE_FIELDS);
    renderTemplateSettings('books', t('settingsIntegrationsBooksTemplate'), BOOK_TEMPLATE_FIELDS);
    renderTemplateSettings('manga', t('settingsIntegrationsMangaTemplate'), MANGA_TEMPLATE_FIELDS);
    renderTemplateSettings('music', templateCopy('music'), getDefaultTemplateFields('music').map(key => ({ key, label: musicLabels[key] ?? 'templateFieldName' })));
    const mediaOptions: { value: TemplateKind; label: string; icon: string }[] = [
        { value: 'games', label: t('settingsGames'), icon: MEDIA_SETTINGS_ICONS.games },
        { value: 'anime', label: t('settingsAnime'), icon: MEDIA_SETTINGS_ICONS.anime },
        { value: 'movies', label: t('settingsMovies'), icon: MEDIA_SETTINGS_ICONS.movies },
        { value: 'series', label: t('settingsSeries'), icon: MEDIA_SETTINGS_ICONS.series },
        { value: 'books', label: t('settingsBooks'), icon: MEDIA_SETTINGS_ICONS.books },
        { value: 'manga', label: t('settingsManga'), icon: MEDIA_SETTINGS_ICONS.manga },
        { value: 'music', label: mt('music'), icon: 'music' },
    ];
    const available = mediaOptions.filter(option => templatePanelMap.has(option.value));
    const active = context.getActiveMediaTab('integrationTemplates');
    const selected = available.find(option => option.value === active) ?? available[0];
    if (selected) {
        navigation.classList.toggle('has-seven-media', available.length >= 7);
        renderChoiceButtons(navigation, templateCopy('media'), available, selected.value, selectTemplateMedia);
        selectTemplateMedia(selected.value);
    }
}

function renderIntegrationDiagnostics(container: HTMLElement): void {
    const body = container.createDiv({ cls: 'lorebase-settings-block lorebase-integration-diagnostics-group' });
    const header = body.createDiv({ cls: 'lorebase-diagnostics-header' });
    const heading = header.createDiv();
    heading.createEl('h3', { text: t('settingsIntegrationsDiagnostics') });
    const actions = header.createDiv({ cls: 'lorebase-diagnostics-actions' });

    const overview = body.createDiv({ cls: 'lorebase-diagnostics-overview', attr: { 'aria-live': 'polite' } });
    const createMetric = (icon: string, label: string): HTMLElement => {
        const metric = overview.createDiv({ cls: 'lorebase-diagnostics-metric' });
        setIcon(metric.createSpan({ attr: { 'aria-hidden': 'true' } }), icon);
        metric.createSpan({ text: label });
        return metric.createEl('strong');
    };
    const requestCount = createMetric('activity', {
        en: 'Events', ru: 'События', uk: 'Події', 'zh-CN': '事件',
    }[i18n.getLanguage()]);
    const errorCount = createMetric('triangle-alert', t('settingsDiagnosticErrors'));
    const cooldownCount = createMetric('timer', t('settingsIntegrationsDiagnosticsActiveCooldowns'));
    const eventsSection = body.createDiv({ cls: 'lorebase-diagnostics-section lorebase-diagnostics-log' });
    const toolbar = eventsSection.createDiv({ cls: 'lorebase-diagnostics-toolbar' });
    const filters = toolbar.createDiv({ cls: 'lorebase-diagnostics-filters' });

    const providerLabel = filters.createEl('label', { cls: 'lorebase-diagnostics-provider-filter' });
    providerLabel.createSpan({ text: t('settingsIntegrationsDiagnosticsProviderFilter') });
    const providerSelect = providerLabel.createEl('select', {
        cls: 'dropdown lorebase-diagnostics-provider-select',
        attr: { 'aria-label': t('settingsIntegrationsDiagnosticsProviderFilter') },
    });

    const errorsLabel = filters.createEl('label', { cls: 'lorebase-diagnostics-errors-filter' });
    const errorsOnlyInput = errorsLabel.createEl('input', { attr: { type: 'checkbox' } });
    errorsLabel.createSpan({ text: t('settingsIntegrationsDiagnosticsErrorsOnly') });
    const eventsCount = toolbar.createSpan({ cls: 'lorebase-diagnostics-event-count', attr: { title: t('settingsIntegrationsDiagnosticsRecentRequests') } });

    const createActionButton = (icon: string, label: string): HTMLButtonElement => {
        const button = actions.createEl('button', {
            cls: 'lorebase-diagnostics-action',
            attr: { type: 'button', title: label, 'aria-label': label },
        });
        const iconEl = button.createSpan({ cls: 'lorebase-diagnostics-action-icon' });
        setIcon(iconEl, icon);
        button.createSpan({ text: label });
        return button;
    };
    const refreshButton = createActionButton('refresh-cw', t('settingsIntegrationsDiagnosticsRefresh'));
    const copyButton = createActionButton('copy', t('settingsIntegrationsDiagnosticsCopy'));
    const clearButton = createActionButton('trash-2', t('settingsIntegrationsDiagnosticsClear'));

    const cooldownSection = body.createDiv({ cls: 'lorebase-diagnostics-section' });
    body.insertBefore(cooldownSection, eventsSection);
    cooldownSection.createDiv({
        cls: 'lorebase-diagnostics-section-title',
        text: t('settingsIntegrationsDiagnosticsActiveCooldowns'),
    });
    const cooldownList = cooldownSection.createDiv({ cls: 'lorebase-diagnostics-cooldowns' });

    const eventsList = eventsSection.createDiv({ cls: 'lorebase-diagnostics-events' });
    const privacyNotice = body.createEl('details', { cls: 'lorebase-diagnostics-privacy' });
    const privacySummary = privacyNotice.createEl('summary');
    setIcon(privacySummary.createSpan({ cls: 'lorebase-diagnostics-privacy-icon' }), 'shield-check');
    privacySummary.createSpan({ text: {
        en: 'What the log stores', ru: 'Что хранится в журнале',
        uk: 'Що зберігається в журналі', 'zh-CN': '日志存储内容',
    }[i18n.getLanguage()] });
    setIcon(privacySummary.createSpan({ cls: 'lorebase-diagnostics-privacy-arrow', attr: { 'aria-hidden': 'true' } }), 'chevron-down');
    privacyNotice.createDiv({ text: t('settingsIntegrationsDiagnosticsSessionOnly') });

    let selectedProvider = '';

    const renderProviderOptions = (events: IntegrationDiagnosticEvent[]): void => {
        const providers = Array.from(new Set(events.map((event) => event.provider))).sort((a, b) => a.localeCompare(b));
        if (selectedProvider && !providers.includes(selectedProvider)) selectedProvider = '';
        providerSelect.empty();
        providerSelect.createEl('option', {
            text: t('settingsIntegrationsDiagnosticsAllProviders'),
            value: '',
        });
        for (const provider of providers) {
            providerSelect.createEl('option', { text: provider, value: provider });
        }
        providerSelect.value = selectedProvider;
    };

    const getFilteredEvents = (): IntegrationDiagnosticEvent[] => getIntegrationDiagnostics()
        .filter((event) => !selectedProvider || event.provider === selectedProvider)
        .filter((event) => !errorsOnlyInput.checked || isDiagnosticFailure(event.outcome));

    const renderDiagnostics = (): void => {
        const events = getIntegrationDiagnostics();
        const cooldowns = getActiveIntegrationCooldowns();
        renderProviderOptions(events);
        requestCount.textContent = String(events.length);
        errorCount.textContent = String(events.filter(event => isDiagnosticFailure(event.outcome)).length);
        cooldownCount.textContent = String(cooldowns.length);

        overview.hidden = !events.length && !cooldowns.length;
        toolbar.hidden = !events.length;
        copyButton.hidden = !events.length && !cooldowns.length;
        clearButton.hidden = !events.length;
        eventsSection.classList.toggle('is-empty', !events.length);
        cooldownSection.hidden = !cooldowns.length;
        cooldownList.empty();
        for (const cooldown of cooldowns) {
            const row = cooldownList.createDiv({ cls: 'lorebase-diagnostics-cooldown' });
            const main = row.createDiv({ cls: 'lorebase-diagnostics-cooldown-main' });
            main.createSpan({ cls: 'lorebase-diagnostics-provider', text: cooldown.provider });
            main.createSpan({ cls: 'lorebase-diagnostics-status', text: `HTTP ${cooldown.status}` });
            row.createDiv({
                cls: 'lorebase-diagnostics-cooldown-meta',
                text: `${cooldown.host} · ${formatDiagnosticRemaining(cooldown.remainingMs)}`,
            });
        }

        const filtered = getFilteredEvents().reverse();

        eventsCount.setText(`${filtered.length} / ${events.length}`);
        eventsList.empty();
        if (!filtered.length) {
            const empty = eventsList.createDiv({ cls: 'lorebase-diagnostics-empty' });
            empty.setText(events.length ? t('settingsIntegrationsDiagnosticsEmpty') : {
                en: 'The log is empty.', ru: 'Журнал пока пуст.',
                uk: 'Журнал поки порожній.', 'zh-CN': '暂无日志。',
            }[i18n.getLanguage()]);
            return;
        }

        for (const event of filtered) {
            renderDiagnosticEvent(eventsList, event);
        }
    };

    const renderDiagnosticEvent = (target: HTMLElement, event: IntegrationDiagnosticEvent): void => {
        const row = target.createDiv({ cls: `lorebase-diagnostics-event is-${event.outcome}` });
        const header = row.createDiv({ cls: 'lorebase-diagnostics-event-header' });
        header.createSpan({ cls: 'lorebase-diagnostics-provider', text: event.provider });
        header.createSpan({
            cls: `lorebase-diagnostics-outcome is-${event.outcome}`,
            text: diagnosticOutcomeLabel(event.outcome),
        });
        header.createSpan({
            cls: 'lorebase-diagnostics-time',
            text: new Date(event.timestamp).toLocaleTimeString(),
        });

        if (event.kind === 'process') {
            row.createDiv({
                cls: 'lorebase-diagnostics-event-item',
                text: event.itemLabel || event.itemId || event.operation,
            });
            row.createDiv({
                cls: 'lorebase-diagnostics-event-meta',
                text: `${event.operation}${event.itemId ? ` · App ${event.itemId}` : ''} · ${event.durationMs} ms`,
            });
            if (event.detail) {
                row.createDiv({
                    cls: 'lorebase-diagnostics-event-detail',
                    text: event.detail,
                });
            }
        } else {
            const status = event.status > 0 ? `HTTP ${event.status}` : 'Network';
            const source = event.source === 'circuit' ? ' · circuit' : '';
            row.createDiv({
                cls: 'lorebase-diagnostics-event-meta',
                text: `${event.method} ${event.endpoint} · ${status} · ${event.durationMs} ms · #${event.attempt}${source}`,
            });
        }
        row.setAttr('title', event.host);
    };

    providerSelect.addEventListener('change', () => {
        selectedProvider = providerSelect.value;
        renderDiagnostics();
    });
    errorsOnlyInput.addEventListener('change', renderDiagnostics);
    refreshButton.addEventListener('click', renderDiagnostics);
    container.addEventListener('lorebase-diagnostics-show', renderDiagnostics);
    copyButton.addEventListener('click', () => {
        void (async (): Promise<void> => {
            try {
                const report = buildIntegrationDiagnosticReport(
                    getActiveIntegrationCooldowns(),
                    Date.now(),
                    getFilteredEvents()
                );
                await copyDiagnosticText(report);
                new Notice(t('settingsIntegrationsDiagnosticsCopied'));
            } catch (error) {
                const message = error instanceof Error ? `: ${error.message}` : '';
                new Notice(`${t('noticeIntegrationsError')}${message}`);
            }
        })();
    });
    clearButton.addEventListener('click', () => {
        clearIntegrationDiagnostics();
        renderDiagnostics();
        new Notice(t('settingsIntegrationsDiagnosticsCleared'));
    });

    renderDiagnostics();
}

function diagnosticOutcomeLabel(outcome: IntegrationDiagnosticOutcome): string {
    const labels: Record<IntegrationDiagnosticOutcome, TranslationKey> = {
        success: 'settingsIntegrationsDiagnosticsSuccess',
        error: 'settingsIntegrationsDiagnosticsError',
        blocked: 'settingsIntegrationsDiagnosticsBlocked',
        retry: 'settingsIntegrationsDiagnosticsRetry',
        created: 'settingsIntegrationsDiagnosticsCreated',
        updated: 'settingsIntegrationsDiagnosticsUpdated',
        skipped: 'settingsIntegrationsDiagnosticsSkipped',
        cancelled: 'settingsIntegrationsDiagnosticsCancelled',
    };
    return t(labels[outcome]);
}

function isDiagnosticFailure(outcome: IntegrationDiagnosticOutcome): boolean {
    return outcome === 'error' || outcome === 'blocked' || outcome === 'retry';
}

function formatDiagnosticRemaining(milliseconds: number): string {
    const totalSeconds = Math.max(1, Math.ceil(milliseconds / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

async function copyDiagnosticText(text: string): Promise<void> {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard API is unavailable.');
    await navigator.clipboard.writeText(text);
}
