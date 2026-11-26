import { setIcon } from 'obsidian';
import { t } from '../localization';
import type { MediaItem } from '../types';
import { pt } from '../localization/playstation';
import { isSyncUrl, playStationUrl } from '../utils/syncSource';
import { comicVineIdFromPath, comicVineSourceUrl } from '../services/integrations/providers/comicvine';

export type MediaSourceAction = () => Promise<boolean | void>;

export function renderMediaSourcePanel(
    root: HTMLElement,
    item: MediaItem,
    onRefresh?: MediaSourceAction,
    onChange?: MediaSourceAction,
    showUrl = true
): void {
    if (!onRefresh && !onChange && !resolveSyncSource(item)) return;
    const column = root.querySelector<HTMLElement>('.lorebase-editmode-column-right');
    if (!column) return;

    const panel = root.ownerDocument.createElement('div');
    panel.className = 'lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-source-panel';
    panel.dataset.mobilePane = 'more';
    const titleRow = panel.createDiv({ cls: 'lorebase-editmode-panel-title-row' });
    titleRow.createEl('h3', { cls: 'lorebase-editmode-panel-title', text: t('editSource') });
    const compactRow = panel.createDiv({ cls: 'lorebase-source-compact-row' });
    const state = compactRow.createDiv({ cls: 'lorebase-source-state' });
    const actions = compactRow.createDiv({ cls: 'lorebase-source-actions' });
    const urlRow = showUrl ? panel.createDiv({ cls: 'lorebase-source-url-row' }) : null;

    const render = (): void => {
        state.empty();
        actions.empty();
        urlRow?.empty();
        const identity = resolveSourceIdentity(item);
        const origin = resolveSyncSource(item);
        panel.toggleClass('has-sync-source', Boolean(origin));
        const provider = identity.provider;
        const id = identity.id;
        const connected = Boolean(provider && id);
        if (origin) {
            const primary = state.createDiv({ cls: 'lorebase-source-origin' });
            primary.createSpan({ cls: 'lorebase-source-role', text: pt('primarySource') });
            primary.createSpan({ cls: 'lorebase-source-identity', text: origin.provider === 'playstation' ? 'PlayStation' : 'Trakt' });
            primary.createSpan({ cls: 'lorebase-source-origin-id', text: origin.id, attr: { title: origin.id } });
        }
        const catalog = state.createDiv({ cls: 'lorebase-source-catalog' });
        const status = catalog.createDiv({ cls: 'lorebase-source-status' });
        const icon = status.createSpan({ cls: 'lorebase-source-status-icon' });
        setIcon(icon, connected ? 'link-2' : 'unlink');
        status.createSpan({ text: origin ? pt('secondarySource') : connected ? t('editSourceConnected') : t('editSourceNotConnected') });
        if (connected) {
            const providerName = provider === 'jikan' ? 'MAL' : provider === 'mangaupdates' ? 'MangaUpdates' : provider === 'comicvine' ? 'Comic Vine' : provider.toUpperCase();
            const label = `${providerName} · ${id}`;
            const catalogUrl = origin ? resolveSourceUrl(item, identity) : null;
            if (catalogUrl) catalog.createEl('a', { cls: 'lorebase-source-identity', text: label, attr: { href: catalogUrl, target: '_blank', rel: 'noopener noreferrer', title: catalogUrl } });
            else catalog.createDiv({ cls: 'lorebase-source-identity', text: label });
        }

        if (connected && onRefresh) {
            createAction(actions, 'refresh-cw', t('editSourceRefresh') + (origin ? ' · ' + provider.toUpperCase() : ''), onRefresh, render, true);
        }
        if (onChange) {
            createAction(
                actions,
                connected ? 'repeat-2' : 'link-2',
                connected ? t('editSourceChange') : t('editSourceLink'),
                onChange,
                render,
                connected
            );
        }

        if (urlRow) {
            const sourceUrl = origin?.url || resolveSourceUrl(item, identity);
            urlRow.createSpan({ cls: 'lorebase-source-url-label', text: 'URL' });
            const value = urlRow.createEl('code', {
                cls: `lorebase-source-url-value ${sourceUrl ? '' : 'is-empty'}`,
                text: sourceUrl || '—',
                attr: { title: sourceUrl || t('editUrl') },
            });
            value.toggleClass('is-empty', !sourceUrl);
            const openButton = urlRow.createEl('button', {
                cls: 'lorebase-editmode-btn lorebase-editmode-btn-tight lorebase-source-url-open',
                attr: {
                    type: 'button',
                    title: t('editOpen'),
                    'aria-label': t('editOpen'),
                },
            });
            setIcon(openButton, 'external-link');
            openButton.disabled = !sourceUrl;
            openButton.toggleClass('is-disabled', !sourceUrl);
            openButton.addEventListener('click', () => {
                if (sourceUrl) window.open(sourceUrl, '_blank', 'noopener');
            });
        }
    };

    render();
    const communityRating = column.querySelector<HTMLElement>('.lorebase-editmode-community-rating');
    if (communityRating) {
        communityRating.after(panel);
        return;
    }
    const dates = column.querySelector<HTMLElement>('.lorebase-editmode-timestamps');
    if (dates) dates.before(panel);
    else column.appendChild(panel);
}

export function resolveSourceUrl(item: MediaItem, identity = resolveSourceIdentity(item)): string | null {
    const source = normalizeUrl(item.sourceUrl ?? '');
    const explicit = resolveSyncSource(item) && source && isSyncUrl(source) ? normalizeUrl(item.metadataSourceUrl ?? '') : source;
    if (explicit) {
        return identity.provider === 'shikimori'
            ? explicit.replace(/(shikimori\.(?:net|one|io|me)\/(?:animes|mangas)\/)(?!z)(\d+)/i, '$1z$2')
            : explicit;
    }

    const id = identity.id;
    if (!id) return null;
    const encodedId = encodeURIComponent(id);
    switch (identity.provider) {
        case 'steam': return `https://store.steampowered.com/app/${encodedId}/`;
        case 'rawg': return `https://rawg.io/games/${encodedId}`;
        case 'anilist': return `https://anilist.co/${item.type === 'manga' ? 'manga' : 'anime'}/${encodedId}`;
        case 'kitsu': return `https://kitsu.io/anime/${encodedId}`;
        case 'jikan': return `https://myanimelist.net/${item.type === 'manga' ? 'manga' : 'anime'}/${encodedId}`;
        case 'shikimori': return `https://shikimori.net/${item.type === 'manga' ? 'mangas' : 'animes'}/z${encodedId}`;
        case 'tmdb': return `https://www.themoviedb.org/${item.type === 'series' || item.type === 'anime' && item.integrationSourceKind === 'series' ? 'tv' : 'movie'}/${encodedId}`;
        case 'tvmaze': return `https://www.tvmaze.com/shows/${encodedId}`;
        case 'omdb': return `https://www.imdb.com/title/${encodedId}/`;
        case 'openlibrary': return /^OL[1-9]\d*[WM]$/i.test(id) ? 'https://openlibrary.org/' + (id.toUpperCase().endsWith('W') ? 'works/' : 'books/') + id.toUpperCase() : '';
        case 'googlebooks': return `https://books.google.com/books?id=${encodedId}`;
        case 'mangaupdates': return `https://www.mangaupdates.com/series/${encodedId}`;
        case 'mangadex': return `https://mangadex.org/title/${encodedId}`;
        case 'comicvine': return comicVineSourceUrl(id);
        default: return null;
    }
}

function resolveSyncSource(item: MediaItem) {
    if (item.syncSource) return item.syncSource;
    if (item.type === 'game' && item.playstation) return { provider: 'playstation', id: item.playstation.titleId, url: playStationUrl(item.playstation) };
    return undefined;
}

export function resolveSourceIdentity(item: MediaItem): { provider: string; id: string } {
    const explicitProvider = item.integrationProvider ? String(item.integrationProvider).trim().toLowerCase() : '';
    const explicitId = item.integrationId ? String(item.integrationId).trim() : '';
    if (explicitProvider && explicitId) return { provider: explicitProvider, id: explicitId };

    const url = item.sourceUrl?.trim() ?? '';
    const comicVinePath = url.match(/^(?:https?:\/\/)?(?:www\.)?comicvine\.(?:gamespot\.com|com)(\/[^?#]*)/i)?.[1];
    const comicVineId = comicVinePath ? comicVineIdFromPath(comicVinePath) : null;
    if (comicVineId) return { provider: 'comicvine', id: comicVineId };
    const patterns: Array<{ provider: string; pattern: RegExp }> = [
        { provider: 'steam', pattern: /store\.steampowered\.com\/app\/(\d+)/i },
        { provider: 'rawg', pattern: /rawg\.io\/games\/([^/?#]+)/i },
        { provider: 'anilist', pattern: /anilist\.co\/(?:anime|manga)\/(\d+)/i },
        { provider: 'kitsu', pattern: /kitsu\.(?:io|app)\/anime\/(\d+)/i },
        { provider: 'jikan', pattern: /myanimelist\.net\/(?:anime|manga)\/(\d+)/i },
        { provider: 'shikimori', pattern: /shikimori\.(?:net|one|io|me)\/(?:animes|mangas)\/[^\d]*(\d+)/i },
        { provider: 'tmdb', pattern: /themoviedb\.org\/(?:movie|tv)\/(\d+)/i },
        { provider: 'tvmaze', pattern: /tvmaze\.com\/shows\/(\d+)/i },
        { provider: 'omdb', pattern: /imdb\.com\/title\/(tt\d+)/i },
        { provider: 'openlibrary', pattern: /openlibrary\.org\/(?:works|books)\/(OL[1-9]\d*[WM])/i },
        { provider: 'googlebooks', pattern: /books\.google\.[^/?#]+\/books\?[^#]*\bid=([^&#]+)/i },
        { provider: 'mangaupdates', pattern: /mangaupdates\.com\/series\/([^/?#]+)/i },
        { provider: 'mangadex', pattern: /mangadex\.org\/title\/([^/?#]+)/i },
    ];
    for (const candidate of patterns) {
        const match = candidate.pattern.exec(url);
        if (match?.[1]) {
            try { return { provider: candidate.provider, id: decodeURIComponent(match[1]) }; }
            catch { /* A malformed imported URL must remain editable. */ }
        }
    }

    const steamAppId = item.type === 'game' && 'steamAppId' in item ? String(item.steamAppId ?? '').trim() : '';
    return steamAppId ? { provider: 'steam', id: steamAppId } : { provider: explicitProvider, id: explicitId };
}

function normalizeUrl(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^(https?:\/\/|obsidian:\/\/)/i.test(trimmed)) return trimmed;
    if (/^[^\s]+\.[^\s]+$/.test(trimmed)) return `https://${trimmed}`;
    return null;
}

function createAction(
    container: HTMLElement,
    iconName: string,
    label: string,
    action: MediaSourceAction,
    rerender: () => void,
    iconOnly = false
): void {
    const button = container.createEl('button', {
        cls: `lorebase-editmode-btn lorebase-editmode-btn-tight lorebase-source-action ${iconOnly ? 'is-icon-only' : ''}`,
        attr: { type: 'button', title: label, 'aria-label': label },
    });
    setIcon(button.createSpan({ cls: 'lorebase-source-action-icon' }), iconName);
    if (!iconOnly) button.createSpan({ text: label });
    button.addEventListener('click', () => {
        void (async (): Promise<void> => {
            button.disabled = true;
            button.addClass('is-loading');
            try {
                const changed = await action();
                if (changed !== false) rerender();
            } finally {
                button.disabled = false;
                button.removeClass('is-loading');
            }
        })();
    });
}
