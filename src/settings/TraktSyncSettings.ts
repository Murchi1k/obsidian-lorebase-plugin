import { createLorebaseDropdown } from '../components/LorebaseDropdown';
import { setIcon } from 'obsidian';
import { tt } from '../localization/trakt';
import { createSyncWorkspace, renderSyncButton, renderSyncConnectionStatus, renderSyncOperations, renderSyncStartup } from './syncDisclosure';
import { defaultTraktSettings } from '../services/trakt/types';
import type { SettingsSectionContext } from './sections/types';

export function renderTraktSyncSettings(context: SettingsSectionContext, container: HTMLElement, statusHost: HTMLElement): void {
    let config = context.plugin.settings.traktSync;
    const root = container.createDiv({ cls: 'lorebase-steam-sync lorebase-trakt-settings is-embedded' });
    const setStatus = renderSyncConnectionStatus(statusHost);
    const { operations, addPage } = createSyncWorkspace(root);
    renderSyncOperations(operations, [
        { label: tt('import'), description: tt('importHint'), icon: 'download', run: () => context.plugin.runTraktImport() },
        { label: tt('sync'), description: tt('syncHint'), icon: 'refresh-cw', run: () => context.plugin.runTraktSync() },
    ]);
    const fields = operations.createDiv({ cls: 'lorebase-trakt-provider-fields', attr: { 'aria-label': tt('metadata'), title: tt('metadataHint') } });
    const field = (label: string, key: 'movieProvider' | 'seriesProvider', options: Array<{ value: string; label: string }>) => {
        const host = fields.createDiv({ cls: 'lorebase-trakt-provider-field' }); host.createEl('label', { text: label });
        createLorebaseDropdown(host.createDiv(), options, config[key], value => { if (key === 'movieProvider' && (value === 'tmdb' || value === 'omdb')) config.movieProvider = value; if (key === 'seriesProvider' && (value === 'tvmaze' || value === 'tmdb')) config.seriesProvider = value; void context.plugin.saveSettings(); }, { floating: true });
    };
    field(tt('movies'), 'movieProvider', [{ value: 'tmdb', label: 'TMDB' }, { value: 'omdb', label: 'OMDb' }]);
    field(tt('series'), 'seriesProvider', [{ value: 'tvmaze', label: 'TVmaze' }, { value: 'tmdb', label: 'TMDB' }]);
    const direction = fields.createDiv({ cls: 'lorebase-trakt-provider-field' }); direction.createEl('label', { text: tt('direction') });
    createLorebaseDropdown(direction.createDiv(), [{ value: 'pull', label: tt('pull') }, { value: 'both', label: tt('both') }], config.twoWay ? 'both' : 'pull', value => { config.twoWay = value === 'both'; void context.plugin.saveSettings(); }, { floating: true });
    const connection = addPage(tt('connection'), 'user-round', tt('subtitle'));
    const accountFields = connection.createDiv({ cls: 'lorebase-sync-fields' });
    const clientField = accountFields.createDiv({ cls: 'lorebase-sync-field' });
    clientField.createEl('label', { cls: 'lorebase-sync-field-label', text: tt('clientId') });
    const control = clientField.createDiv({ cls: 'lorebase-sync-field-control' });
    setIcon(control.createSpan({ cls: 'lorebase-sync-field-icon' }), 'fingerprint');
    const clientId = control.createEl('input', { cls: 'lorebase-sync-field-input', attr: { type: 'text', 'aria-label': tt('clientId'), placeholder: 'Trakt Client ID', autocomplete: 'off', spellcheck: 'false' } });
    clientId.value = config.clientId;
    clientField.createDiv({ cls: 'setting-item-description', text: tt('clientIdHint') });
    const actions = connection.createDiv({ cls: 'lorebase-sync-surface-actions' });
    const updateConnection = () => {
        setStatus(Boolean(config.accessToken), config.accessToken ? [tt('connected'), config.username].filter(Boolean).join(' · ') : tt('disconnected'));
        actions.empty();
        const connect = renderSyncButton(actions, 'key-round', tt('connect'), 'primary');
        connect.disabled = !config.clientId;
        connect.addEventListener('click', async () => { connect.disabled = true; try { await context.plugin.connectTrakt(); } finally { if (!context.signal?.aborted) context.display(); } });
        if (config.accessToken) {
            const disconnect = renderSyncButton(actions, 'log-out', tt('disconnect'));
            disconnect.addEventListener('click', async () => { context.plugin.settings.traktSync = { ...defaultTraktSettings(), clientId: config.clientId, movieProvider: config.movieProvider, seriesProvider: config.seriesProvider }; await context.plugin.saveSettings(); if (!context.signal?.aborted) context.display(); });
        }
        operations.querySelectorAll<HTMLButtonElement>('.lorebase-sync-operation').forEach(button => { button.disabled = !config.accessToken; });
    };
    clientId.addEventListener('input', () => {
        const value = clientId.value.trim(); if (value === config.clientId) return;
        config = { ...config, clientId: value, accessToken: '', refreshToken: '', expiresAt: 0, username: '', lastSynced: {} };
        context.plugin.settings.traktSync = config;
        updateConnection(); void context.plugin.saveSettings();
    });
    updateConnection();
    renderSyncStartup(operations, tt('startup'), tt('startupHint'), config.autoSyncOnStartup, value => { config.autoSyncOnStartup = value; void context.plugin.saveSettings(); });
}
