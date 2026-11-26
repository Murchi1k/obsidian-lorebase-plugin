import type { MusicItem, MusicListeningStats } from '../../../types';
import { asArray, asObject, getString } from './common';
import { deezer, musicCount, type MusicFetch, type MusicSearchResult } from './music';
import { findDeezerAlbum } from './musicTrackCredits';

const obj = (v: unknown) => asObject(v) ?? {};
const nameKey = (name: string) => name.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
export interface MusicArtist {
    id: string; name: string; image: string; url: string;
    listeners: number | null; fans: number | null;
}
export interface MusicRelease extends MusicSearchResult {
    category: 'album' | 'ep' | 'single' | 'featured';
    released: string;
}
export function normalizeListeningStats(value: unknown): MusicListeningStats | undefined {
    const o = obj(value);
    if (o.source !== 'lastfm') return undefined;
    const listeners = musicCount(o.listeners), plays = musicCount(o.plays);
    if (listeners === null && plays === null) return undefined;
    const url = getString(o, 'url');
    return { source: 'lastfm', listeners, plays, url: /^https:\/\/www\.last\.fm\//.test(url) ? url : '' };
}
const fmUrl = (method: string, key: string, params: Record<string, string>) =>
    `https://ws.audioscrobbler.com/2.0/?${new URLSearchParams({ method, api_key: key, format: 'json', autocorrect: '0', ...params })}`;
export async function getListeningStats(fetch: MusicFetch, key: string, item: Pick<MusicItem, 'musicKind' | 'artist' | 'displayName'>): Promise<MusicListeningStats | undefined> {
    if (!key.trim() || !item.artist.trim()) return undefined;
    const entity = item.musicKind === 'album' ? 'album' : 'track';
    const root = obj(await fetch(fmUrl(`${entity}.getInfo`, key, { artist: item.artist, [entity]: item.displayName })));
    if (root.error) throw new Error('Last.fm request failed');
    const o = obj(root[entity]);
    const artist = typeof o.artist === 'string' ? o.artist : getString(obj(o.artist), 'name');
    if (nameKey(getString(o, 'name')) !== nameKey(item.displayName) || nameKey(artist) !== nameKey(item.artist)) return undefined;
    return normalizeListeningStats({ source: 'lastfm', listeners: o.listeners, plays: o.playcount, url: o.url });
}
export async function getMusicArtist(fetch: MusicFetch, name: string, key: string, useDeezer: boolean, deezerId?: string, albumTitle?: string): Promise<MusicArtist | null> {
    let artist: MusicArtist | null = null;
    let listeners: number | null = null;
    const results = await Promise.allSettled([
        useDeezer ? (async () => {
            let id = /^\d+$/.test(deezerId || '') ? deezerId : '';
            let o = id ? await deezer(fetch, `artist/${id}`) : null;
            if (!o || nameKey(getString(o, 'name')) !== nameKey(name)) {
                const root = await deezer(fetch, `search/artist?${new URLSearchParams({ q: name, limit: '25' })}`);
                const matches = asArray(root.data).map(obj).filter(o => nameKey(getString(o, 'name')) === nameKey(name));
                const match = matches.length === 1 ? matches[0] : undefined;
                id = match ? String(match.id || '') : '';
                if (!id && albumTitle?.trim()) {
                    const album = await findDeezerAlbum(fetch, { artist: name, displayName: albumTitle, integrationProvider: null, integrationId: null });
                    id = album ? String(obj(album.artist).id || '') : '';
                }
                o = id ? await deezer(fetch, `artist/${id}`) : null;
            }
            if (!o?.id || nameKey(getString(o, 'name')) !== nameKey(name)) return;
            artist = { id: String(o.id), name: getString(o, 'name'), image: getString(o, 'picture_big'),
                url: `https://www.deezer.com/artist/${o.id}`, listeners: null, fans: musicCount(o.nb_fan) };
        })() : Promise.resolve(),
        key.trim() ? (async () => {
            const root = obj(await fetch(fmUrl('artist.getInfo', key, { artist: name })));
            const o = obj(root.artist);
            if (root.error) throw new Error('Last.fm request failed');
            if (nameKey(getString(o, 'name')) === nameKey(name)) listeners = musicCount(obj(o.stats).listeners);
        })() : Promise.resolve(),
    ]);
    if (results.every(result => result.status === 'rejected')) throw new Error('Artist unavailable');
    // A Last.fm profile without a matching Deezer identity cannot open the wrong discography.
    if (!artist) return listeners === null ? null : { id: '', name, image: '', url: '', listeners, fans: null };
    return { ...(artist as MusicArtist), listeners };
}
export async function getArtistReleases(fetch: MusicFetch, artist: MusicArtist, page = 0): Promise<{ items: MusicRelease[]; more: boolean }> {
    if (!/^\d+$/.test(artist.id)) return { items: [], more: false };
    const root = await deezer(fetch, `artist/${artist.id}/albums?limit=100&index=${Math.max(0, page) * 100}`);
    return { items: asArray(root.data).map(obj).filter(o => o.id && o.title).map(o => ({
        id: String(o.id), title: getString(o, 'title'), artist: artist.name, provider: 'deezer', kind: 'album',
        image: getString(o, 'cover_big') || getString(o, 'cover_medium'), year: getString(o, 'release_date').slice(0, 4),
        released: getString(o, 'release_date'), category: o.record_type === 'ep' ? 'ep' : o.record_type === 'single' ? 'single' : 'album',
    })), more: typeof root.next === 'string' && asArray(root.data).length > 0 };
}
/** MusicBrainz album credits identify guest/co-credited releases; never infer them from title text. */
export async function getArtistAppearances(fetch: MusicFetch, name: string, page = 0): Promise<{ items: MusicRelease[]; more: boolean }> {
    const query = new URLSearchParams({ query: `artist:"${name.replace(/([+\-!(){}\[\]^"~*?:\\/|&])/g, '\\$1')}"`, fmt: 'json', limit: '25' });
    const matches = obj(await fetch(`https://musicbrainz.org/ws/2/artist?${query}`));
    const exact = asArray(matches.artists).map(obj).filter(o => nameKey(getString(o, 'name')) === nameKey(name));
    const match = exact.length === 1 ? exact[0] : undefined;
    if (!match) return { items: [], more: false };
    const id = getString(match, 'id');
    const params = new URLSearchParams({ artist: id, inc: 'artist-credits', fmt: 'json', limit: '100', offset: String(page * 100) });
    const root = obj(await fetch(`https://musicbrainz.org/ws/2/release-group?${params}`));
    const groups = asArray(root['release-groups']);
    return { items: groups.map(obj).filter(o => {
        const credits = asArray(o['artist-credit']).map(obj);
        return credits.length > 1 && credits.some(c => obj(c.artist).id === id);
    }).map(o => ({ id: getString(o, 'id'), title: getString(o, 'title'),
        artist: asArray(o['artist-credit']).map(c => getString(obj(c), 'name') + getString(obj(c), 'joinphrase')).join(''),
        provider: 'musicbrainz', kind: 'album', category: 'featured',
        image: `https://coverartarchive.org/release-group/${getString(o, 'id')}/front-500`,
        released: getString(o, 'first-release-date'), year: getString(o, 'first-release-date').slice(0, 4),
    })), more: (page + 1) * 100 < Number(root['release-group-count']) };
}
