import { t } from '../../localization';
import { renderAniListSyncSettings } from '../AniListSyncSettings';
import { renderSteamSyncSettings } from '../SteamSyncSettings';
import { renderTraktSyncSettings } from '../TraktSyncSettings';
import { renderPlayStationSyncSettings } from '../PlayStationSyncSettings';
import { renderChoiceButtons } from './choiceButtons';
import type { SettingsSectionContext } from './types';

type SyncProvider = 'steam' | 'anilist' | 'trakt' | 'playstation';
const activeProviders = new WeakMap<object, SyncProvider>();

export function requestSyncProvider(plugin: object, provider: SyncProvider): void {
    activeProviders.set(plugin, provider);
}

export function renderSyncSection(context: SettingsSectionContext, container: HTMLElement): void {
    const workspace = container.createDiv({ cls: 'lorebase-sync-settings-content' });
    const header = workspace.createDiv({ cls: 'lorebase-sync-service-header' });
    const navigation = header.createDiv({ cls: 'lorebase-sync-service-nav' });
    const statusHost = header.createDiv();
    const content = workspace.createDiv({ cls: 'lorebase-sync-service-panel' });
    const renderProvider = (provider: SyncProvider): void => {
        activeProviders.set(context.plugin, provider);
        content.empty();
        statusHost.empty();
        if (provider === 'steam') renderSteamSyncSettings(context, content, { embedded: true, statusHost });
        else if (provider === 'anilist') renderAniListSyncSettings(context, content, { embedded: true, statusHost });
        else if (provider === 'trakt') renderTraktSyncSettings(context, content, statusHost);
        else renderPlayStationSyncSettings(context, content, statusHost);
    };
    const active = activeProviders.get(context.plugin) ?? 'steam';
    const beta = 'BETA';
    const badgeShort = 'B';
    renderChoiceButtons<SyncProvider>(navigation, t('settingsSync'), [
        { value: 'steam', label: 'Steam', icon: 'gamepad-2' },
        { value: 'anilist', label: 'AniList', icon: 'sparkles', badge: beta, badgeShort },
        { value: 'trakt', label: 'Trakt', icon: 'clapperboard', badge: beta, badgeShort },
        { value: 'playstation', label: 'PlayStation', icon: 'gamepad-2', badge: beta, badgeShort },
    ], active, renderProvider);
    renderProvider(active);
}
