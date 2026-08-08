import { Notice, Setting, setIcon } from 'obsidian';
import type { SettingsSectionContext } from './sections/types';
import { AniListImportReviewModal } from '../modals/AniListImportReviewModal';

type AniListSyncTab = 'setup' | 'import' | 'sync';

export function renderAniListSyncSettings(
    context: SettingsSectionContext,
    container: HTMLElement,
    options: { embedded?: boolean } = {}
): void {
    let activeTab: AniListSyncTab = 'setup';
    const root = container.createDiv({ cls: `lorebase-steam-sync lorebase-anilist-sync ${options.embedded ? 'is-embedded' : ''}` });
    const header = root.createDiv({ cls: 'lorebase-sync-provider-header' });
    const title = header.createDiv({ cls: 'lorebase-sync-provider-title' });
    const icon = title.createSpan({ cls: 'lorebase-sync-provider-title-icon' });
    setIcon(icon, 'sparkles');
    title.createSpan({ text: 'AniList Sync' });
    const tabs = root.createDiv({ cls: 'lorebase-steam-sync-tabs' });
    const body = root.createDiv({ cls: 'lorebase-steam-sync-body' });

    const save = async (): Promise<void> => context.plugin.saveSettings();
    const render = (): void => {
        tabs.empty();
        body.empty();
        for (const tab of [{ id: 'setup', text: 'Setup' }, { id: 'import', text: 'Import' }, { id: 'sync', text: 'Sync' }] as const) {
            const button = tabs.createEl('button', { cls: 'lorebase-steam-sync-tab', text: tab.text, attr: { type: 'button' } });
            button.toggleClass('is-active', tab.id === activeTab);
            button.addEventListener('click', () => { activeTab = tab.id; render(); });
        }
        if (activeTab === 'setup') renderSetup(context, body, save);
        else if (activeTab === 'import') renderImport(context, body);
        else renderSync(context, body, save);
    };
    render();
}

function renderImport(context: SettingsSectionContext, body: HTMLElement): void {
    const panel = body.createDiv({ cls: 'lorebase-steam-sync-panel' });
    createPanelTitle(panel, 'download', 'Import selected entries');
    panel.createDiv({
        cls: 'lorebase-steam-sync-info',
        text: 'Review your AniList anime and manga lists, then select exactly which entries to create or update in LOREBASE. Import does not push local changes back to AniList.'
    });
    new Setting(panel)
        .addButton(button => button.setButtonText('Review AniList entries').setCta().onClick(() => void context.plugin.runAniListImport()));
}

function renderSetup(context: SettingsSectionContext, body: HTMLElement, save: () => Promise<void>): void {
    const settings = context.plugin.settings.anilistSync;
    const panel = body.createDiv({ cls: 'lorebase-steam-sync-panel' });
    createPanelTitle(panel, 'key-round', 'Connection');
    const help = panel.createDiv({ cls: 'lorebase-provider-help' });
    help.createDiv({
        cls: 'lorebase-provider-help-text',
        text: 'Create an AniList OAuth application with this redirect URL: https://anilist.co/api/v2/oauth/pin. Use the PIN button, approve Lorebase, and paste the access token from the redirected URL.'
    });

    const client = new Setting(panel).setName('Client ID').setDesc('Used to identify your AniList OAuth application.').addText(text => {
        text.setValue(settings.clientId).setPlaceholder('AniList Client ID').onChange(async value => { settings.clientId = value.trim(); await save(); });
    });
    client.settingEl.addClass('lorebase-steam-sync-field-row');
    const token = new Setting(panel).setName('Access token').setDesc('Required for reading and updating your lists.').addText(text => {
        text.inputEl.type = 'password';
        text.setValue(settings.accessToken).setPlaceholder('AniList access token').onChange(async value => { settings.accessToken = value.trim(); await save(); });
    });
    token.settingEl.addClass('lorebase-steam-sync-field-row');
    const username = new Setting(panel).setName('Username').setDesc('Optional; detected automatically when blank.').addText(text => {
        text.setValue(settings.username).setPlaceholder('AniList username').onChange(async value => { settings.username = value.trim(); await save(); });
    });
    username.settingEl.addClass('lorebase-steam-sync-field-row');

    new Setting(panel)
        .addButton(button => button.setButtonText('Get token with AniList PIN').setCta().onClick(() => void context.plugin.authorizeAniList()))
        .addButton(button => button.setButtonText('Test connection').onClick(() => void testConnection(context)));
}

function renderSync(context: SettingsSectionContext, body: HTMLElement, save: () => Promise<void>): void {
    const settings = context.plugin.settings.anilistSync;
    const panel = body.createDiv({ cls: 'lorebase-steam-sync-panel' });
    createPanelTitle(panel, 'refresh-cw', 'Two-way sync');
    panel.createDiv({
        cls: 'lorebase-steam-sync-info',
        text: 'Linked anime and manga notes sync both ways. New AniList entries are imported; local changes are pushed back; remote-only changes update notes. If both sides changed since the last sync, the local note wins.'
    });
    new Setting(panel)
        .setName('Sync on startup')
        .setDesc('Run AniList synchronization when Obsidian opens.')
        .addToggle(toggle => toggle.setValue(settings.autoSyncOnStartup).onChange(async value => { settings.autoSyncOnStartup = value; await save(); }));
    new Setting(panel)
        .addButton(button => button.setButtonText('Sync now').setCta().onClick(() => void context.plugin.runAniListSync()));
}

async function testConnection(context: SettingsSectionContext): Promise<void> {
    try {
        const settings = context.plugin.settings.anilistSync;
        const username = await context.plugin.getAniListSyncService()?.testConnection(settings);
        if (username && !settings.username) { settings.username = username; await context.plugin.saveSettings(); }
        new Notice(`AniList connection works${username ? `: ${username}` : ''}`);
    } catch (error) {
        new Notice(`AniList connection failed${error instanceof Error ? `: ${error.message}` : ''}`);
    }
}

function createPanelTitle(container: HTMLElement, iconId: string, text: string): void {
    const title = container.createDiv({ cls: 'lorebase-steam-sync-panel-title' });
    const icon = title.createSpan({ cls: 'lorebase-steam-sync-panel-icon' });
    setIcon(icon, iconId);
    title.createSpan({ text });
}
