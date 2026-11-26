import { createLorebaseDropdown } from '../../components/LorebaseDropdown';
import { i18n, t } from '../../localization';
import { MEDIA_SETTINGS_ICONS } from '../../mediaPresentation';
import { getAlternativeTitleOptions, getAlternativeTitlePreference } from '../../services/integrations/alternativeTitles';
import type { ProviderId } from '../../services/integrations/types';
import { renderMediaSwitch } from './mediaSwitch';
import { createProviderLanguageField, createProviderLanguagePanel } from './providerFields';
import type { SettingsSectionContext } from './types';

export function renderAlternativeTitleSettings(context: SettingsSectionContext, container: HTMLElement, provider: ProviderId, kind: 'anime' | 'manga'): void {
    const media = context.plugin.settings.integrations?.media[kind];
    const values = getAlternativeTitleOptions(provider);
    if (!media || !values.length) return;

    const scriptFilter = provider === 'mangaupdates';
    const displayNames = new Intl.DisplayNames([i18n.getLanguage()], { type: scriptFilter ? 'script' : 'language' });
    const label = (value: string): string => {
        if (value === 'all') return t('alternativeTitleAll');
        if (value === 'native') return t('alternativeTitleNative');
        if (value === 'default') return t('alternativeTitleDefault');
        if (value === 'romaji' || value === 'ja-ro') return 'Romaji';
        if (value === 'ko-ro') return '한국어 (Latin)';
        if (value === 'zh-ro') return '中文 (Latin)';
        return displayNames.of(value === 'es-la' ? 'es-419' : value) ?? value;
    };
    container.addClass('has-provider-extra');
    const grid = createProviderLanguagePanel(container, 'lorebase-alternative-title-languages', t('alternativeTitles'),
        t(scriptFilter ? 'alternativeTitleScriptDesc' : 'alternativeTitleLanguageDesc'));
    const mediaLabel = t(kind === 'anime' ? 'settingsAnime' : 'settingsManga');
    const field = createProviderLanguageField(grid, mediaLabel, MEDIA_SETTINGS_ICONS[kind]);
    const preference = getAlternativeTitlePreference(media, provider);
    const saveLanguage = (value: string): void => {
        if (media.alternativeTitleLanguages?.[provider] === 'none') {
            media.alternativeTitlesDisabled = { ...media.alternativeTitlesDisabled, [provider]: true };
        }
        media.alternativeTitleLanguages = { ...media.alternativeTitleLanguages, [provider]: value };
    };

    createLorebaseDropdown(field.createDiv({ cls: 'lorebase-provider-alias-language' }),
        values.map(value => ({ value, label: label(value) })),
        values.includes(preference.language) ? preference.language : 'all', async value => {
            saveLanguage(value);
            await context.plugin.saveSettings();
        }, { floating: true, panelClass: 'lorebase-language-panel' });

    renderMediaSwitch(field, `${t('alternativeTitleSave')} — ${mediaLabel}`, preference.enabled, enabled => {
        if (media.alternativeTitleLanguages?.[provider] === 'none') saveLanguage(preference.language);
        media.alternativeTitlesDisabled = { ...media.alternativeTitlesDisabled, [provider]: !enabled };
        void context.plugin.saveSettings();
        return true;
    });
}
