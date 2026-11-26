import { createLorebaseDropdown } from '../components/LorebaseDropdown';
import { setIcon } from 'obsidian';
import { renderMediaSwitch } from './sections/mediaSwitch';
import { pt, psnError } from '../localization/playstation';
import { createSyncWorkspace, renderSyncButton, renderSyncConnectionStatus, renderSyncOperations, renderSyncStartup } from './syncDisclosure';
import type { SettingsSectionContext } from './sections/types';

export function renderPlayStationSyncSettings(context: SettingsSectionContext, container: HTMLElement, statusHost: HTMLElement): void {
    const config = context.plugin.settings.playstationSync;
    const root = container.createDiv({ cls: 'lorebase-steam-sync lorebase-playstation-settings is-embedded' });
    const status = renderSyncConnectionStatus(statusHost);
    status(Boolean(config.accountId && config.secretId), config.accountId ? pt('connected') + ' · ' + config.onlineId : pt('disconnected'));
    const { operations, navigation, addPage } = createSyncWorkspace(root);
    navigation.addClass('lorebase-psn-navigation');
    renderSyncOperations(operations, [
        { label: pt('import'), icon: 'download', description: pt('reviewHint'), run: () => context.plugin.runPlayStationImport() },
        { label: pt('sync'), icon: 'refresh-cw', description: pt('startupHint'), run: () => context.plugin.runPlayStationSync() },
    ]);
    operations.querySelectorAll<HTMLButtonElement>('.lorebase-sync-operation').forEach(button => { button.disabled = !config.accountId; });
    const fields = operations.createDiv({ cls: 'lorebase-psn-settings-fields' });
    const field = (title: string, options: Array<{ value: string; label: string }>, value: string, change: (value: string) => void) => {
        const row = fields.createDiv({ cls: 'lorebase-psn-settings-field' });
        row.createEl('label', { text: title });
        const host = row.createDiv();
        createLorebaseDropdown(host, options, value, next => { change(next); void context.plugin.saveSettings(); }, { floating: true });
        host.querySelector('button')?.setAttribute('aria-label', title);
    };
    field(pt('scope'), [{ value: 'played', label: pt('played') }, { value: 'purchased', label: pt('purchased') }, { value: 'all', label: pt('all') }],
        config.scope, value => { if (value === 'played' || value === 'purchased' || value === 'all') config.scope = value; });
    field(pt('metadata'), [{ value: 'psn', label: pt('psnOnly') }, { value: 'igdb', label: 'IGDB' }, { value: 'rawg', label: 'RAWG' }],
        config.metadataProvider, value => { if (value === 'psn' || value === 'igdb' || value === 'rawg') config.metadataProvider = value; });
    const options = operations.createEl('details', { cls: 'lorebase-psn-settings-disclosure' });
    const summary = options.createEl('summary'); setIcon(summary.createSpan({ attr: { 'aria-hidden': 'true' } }), 'sliders-horizontal'); summary.createSpan({ text: pt('options') });
    const toggles = options.createDiv({ cls: 'lorebase-psn-settings-fields' });
    for (const [key, title] of [['importPlaytime', pt('time')], ['importTrophies', pt('trophies')]] as const) {
        const row = toggles.createDiv({ cls: 'lorebase-psn-toggle' }); row.createSpan({ text: title });
        renderMediaSwitch(row, title, config[key], value => { config[key] = value; void context.plugin.saveSettings(); return true; });
    }
    renderSyncStartup(options, pt('startup'), pt('startupHint'), config.autoSyncOnStartup, value => { config.autoSyncOnStartup = value; void context.plugin.saveSettings(); });
    const connection = addPage(pt('connection'), 'user-round', pt('connectionSubtitle'));
    connection.addClass('lorebase-psn-connection');
    connection.createDiv({ cls: 'setting-item-description lorebase-psn-connect-intro', text: pt('authHint') });
    const links = connection.createDiv({ cls: 'lorebase-psn-auth-links' });
    for (const [index, [label, href]] of [[pt('signin'), 'https://www.playstation.com/'], [pt('getKey'), 'https://ca.account.sony.com/api/v1/ssocookie']].entries()) {
        const link = links.createEl('a', { cls: 'lorebase-psn-auth-step', attr: { href, target: '_blank', rel: 'noopener noreferrer' } });
        link.createSpan({ cls: 'lorebase-psn-auth-step-number', text: String(index + 1) }); link.createSpan({ text: label });
        setIcon(link.createSpan({ attr: { 'aria-hidden': 'true' } }), 'external-link');
    }
    const accountFields = connection.createDiv({ cls: 'lorebase-sync-fields' });
    const fieldRow = accountFields.createDiv({ cls: 'lorebase-sync-field' });
    fieldRow.createEl('label', { cls: 'lorebase-sync-field-label', text: 'NPSSO' });
    const control = fieldRow.createDiv({ cls: 'lorebase-sync-field-control' });
    setIcon(control.createSpan({ cls: 'lorebase-sync-field-icon', attr: { 'aria-hidden': 'true' } }), 'fingerprint');
    const input = control.createEl('input', { cls: 'lorebase-sync-field-input', attr: { type: 'password', placeholder: pt('keyPlaceholder'), 'aria-label': 'NPSSO',
        autocomplete: 'off', spellcheck: 'false' } });
    fieldRow.createDiv({ cls: 'setting-item-description', text: pt('keyHint') });
    const message = connection.createDiv({ cls: 'setting-item-description lorebase-psn-auth-message', attr: { role: 'status' } });
    const actions = connection.createDiv({ cls: 'lorebase-sync-surface-actions' });
    const connect = renderSyncButton(actions, 'key-round', pt('connect'), 'primary');
    connect.disabled = true; input.addEventListener('input', () => { connect.disabled = !input.value.trim(); });
    connect.addEventListener('click', async () => {
        connect.disabled = true; message.textContent = pt('loading');
        try { await context.plugin.connectPlayStation(input.value); if (!context.signal?.aborted) context.display(); }
        catch (error) { if (!context.signal?.aborted) message.textContent = psnError(error); }
        finally { input.value = ''; }
    });
    if (config.accountId) {
        const disconnect = renderSyncButton(actions, 'log-out', pt('disconnect'));
        disconnect.addEventListener('click', async () => {
            disconnect.disabled = true;
            try { await context.plugin.disconnectPlayStation(); if (!context.signal?.aborted) context.display(); }
            catch (error) { message.textContent = psnError(error); disconnect.disabled = false; }
        });
    }
    const security = connection.createEl('details', { cls: 'lorebase-psn-security' });
    security.createEl('summary', { text: pt('security') });
    security.createDiv({ cls: 'setting-item-description', text: pt('auth') });
    const help = addPage(pt('sourcesHelp'), 'info', pt('sourcesSubtitle'));
    help.createDiv({ cls: 'setting-item-description', text: pt('scopeHint') });
    help.createDiv({ cls: 'setting-item-description', text: pt('metadataHint') });
}
