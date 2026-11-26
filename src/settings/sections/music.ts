import { handleAsyncAction } from '../../utils/actionHandler';
import { MusicCatalog } from '../../services/MusicCatalog';
import { Notice, Setting } from 'obsidian';
import { mt } from '../../localization/music';
import { t } from '../../localization';
import { renderChoiceButtons } from './choiceButtons';
import { createProviderCredential, createProviderKeyHelp, providerApiKeyLabel } from './providerFields';
import type { SettingsSectionContext } from './types';

export function renderMusicCardSettings(context: SettingsSectionContext, section: HTMLElement, updatePreview: () => void): void {
    const { plugin } = context;
    const settings = plugin.settings.music;
    for (const [key, label] of [['albumCoverMode', 'albumCover'], ['trackCoverMode', 'trackCover']] as const) {
        const row = section.createDiv({ cls: 'lorebase-music-cover-setting' });
        row.createEl('strong', { text: mt(label) });
        renderChoiceButtons(row, mt(label), [
            { value: 'square', label: mt('square'), icon: 'square' },
            { value: 'vinyl', label: mt('vinyl'), icon: 'disc-3' },
            { value: 'cd', label: mt('cdCase'), icon: 'disc' },
        ], settings[key], handleAsyncAction(async value => {
            settings[key] = value;
            updatePreview();
            await plugin.saveSettings();
            plugin.refreshViews();
        }));
    }
}

export function renderMusicProviderSettings(context: SettingsSectionContext, section: HTMLElement, provider: 'musicbrainz' | 'lastfm' | 'deezer', onChange: () => void = () => {}): void {
    const { plugin } = context;
    const settings = plugin.settings.music;
    const needsKey = provider === 'lastfm';
    const label = needsKey ? 'Last.fm' : provider === 'deezer' ? 'Deezer' : 'MusicBrainz';
    section.toggleClass('is-igdb-provider', needsKey);
    const setting = new Setting(section)
        .setName(label + ' (' + mt('music') + ')')
        .addToggle(toggle => toggle.setValue(settings.providerEnabled?.[provider] !== false).onChange(async value => {
            settings.providerEnabled = { ...settings.providerEnabled, [provider]: value };
            onChange();
            await plugin.saveSettings();
        }));
    setting.settingEl.addClass('lorebase-provider-setting', 'lorebase-provider-detail-card');
    setting.addButton(button => button.setButtonText(t('settingsIntegrationsProviderTest')).onClick(async () => {
        if (settings.providerEnabled?.[provider] === false) { new Notice(t('noticeProviderDisabled')); return; }
        if (needsKey && !settings.lastfmApiKey.trim()) { new Notice(t('noticeMissingApiKey')); return; }
        button.setDisabled(true);
        try {
            await new MusicCatalog(() => settings.lastfmApiKey).search(provider, 'album', 'Abbey Road');
            new Notice(t('noticeProviderTestSuccess'));
        } catch { new Notice(t('noticeProviderTestFail')); }
        finally { button.setDisabled(false); }
    }));
    if (!needsKey) { setting.setDesc(mt(provider === 'deezer' ? 'deezerHelp' : 'musicbrainzHelp')); return; }
    setting.settingEl.addClass('is-igdb-provider', 'has-key', 'is-key-open');
    const keyRow = setting.settingEl.createDiv({ cls: 'lorebase-provider-key-row lorebase-provider-credentials' });
    createProviderCredential(keyRow, providerApiKeyLabel(), t('settingsIntegrationsProviderKeyPlaceholder'), settings.lastfmApiKey, value => {
        settings.lastfmApiKey = value;
        onChange();
        void plugin.saveSettings();
    });
    const help = createProviderKeyHelp(keyRow);
    help.createDiv({ cls: 'lorebase-provider-help-title', text: mt('lastfmKeyTitle') });
    help.createDiv({ cls: 'lorebase-provider-help-text', text: mt('lastfmKeyHelp') });
    help.createDiv({ cls: 'lorebase-provider-help-links' }).createEl('a', { text: mt('lastfmKeyLink'),
        attr: { href: 'https://www.last.fm/api/account/create', target: '_blank', rel: 'noopener noreferrer' } });
}
