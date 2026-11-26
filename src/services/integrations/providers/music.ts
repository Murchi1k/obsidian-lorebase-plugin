import { normalizeCountryMetadata } from '../../media/statisticsCountries';
import type { MusicItem, MusicKind, MusicTrack } from '../../../types';
import { emptyMusicItem } from '../../MusicService';
import { asArray, asObject, getString, stripHtml } from './common';

export type MusicProvider = 'musicbrainz' | 'lastfm' | 'deezer';
export interface MusicSearchResult {
    id: string; title: string; artist: string; year: string; image: string;
    provider: MusicProvider; kind: MusicKind;
    fallbackImage?: string;
    directMatch?: boolean;
}
const normalizedMusicText = (value: string): string => value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
export function musicSearchIdentity(item: MusicSearchResult): string {
    // Album-level guest credits sometimes duplicate the main artist's album in Last.fm.
    const artist = item.kind === 'album' ? item.artist.split(/\s+(?:feat\.?|ft\.?|featuring)\s+/i)[0] : item.artist;
    return JSON.stringify([item.kind, normalizedMusicText(artist), normalizedMusicText(item.title)]);
}
export function organizeMusicResults(items: MusicSearchResult[], query: string): MusicSearchResult[] {
    const unique = new Map<string, MusicSearchResult>();
    for (const item of items) {
        const key = musicSearchIdentity(item);
        const previous = unique.get(key);
        if (!previous || (!previous.image && item.image)) unique.set(key, item);
        else if (item.image && item.image !== previous.image && !previous.fallbackImage) previous.fallbackImage = item.image;
    }
    const needle = normalizedMusicText(query);
    const rank = (item: MusicSearchResult): number => (normalizedMusicText(item.title) === needle ? 100 : normalizedMusicText(item.title).includes(needle) ? 50 : 0) + (item.image ? 1 : 0);
    return [...unique.values()].sort((a, b) => rank(b) - rank(a));
}
export function mergeMusicBrainzArtwork(items: MusicSearchResult[], artwork: MusicSearchResult[]): MusicSearchResult[] {
    const covers = new Map(artwork.map(item => [musicSearchIdentity(item), item]));
    return items.map(item => {
        if (item.image) return item;
        const match = covers.get(musicSearchIdentity(item));
        return match ? { ...item, image: match.image, fallbackImage: match.fallbackImage } : item;
    });
}
export type MusicFetch = (url: string) => Promise<unknown>;
const object = (v: unknown) => asObject(v) ?? {};
const text = (v: unknown) => typeof v === 'string' ? v : '';
const array = (v: unknown): unknown[] => Array.isArray(v) ? v : v && typeof v === 'object' ? [v] : [];
const credit = (v: unknown): string => asArray(v).map(entry => {
    const o = object(entry);
    return `${text(o.name) || text(object(o.artist).name)}${text(o.joinphrase)}`;
}).join('');
const seconds = (v: unknown, divisor = 1): number | null => {
    const n = Number(v); return v != null && v !== '' && Number.isFinite(n) && n > 0 ? Math.round(n / divisor) : null;
};
const LASTFM_PLACEHOLDER = /(?:2a96cbd8b46e442fc41c2b86b821562f|default_album|noimage|no_image)/i;
const cover = (v: unknown): string => array(v)
    .map(entry => text(object(entry)['#text']).trim())
    .filter(url => url && !LASTFM_PLACEHOLDER.test(url))
    .pop() || '';
const lucene = (value: string): string => value.trim().replace(/([+\-!(){}\[\]^"~*?:\\/|&])/g, '\\$1');

function releaseDate(value: unknown): string | null {
    const raw = text(value).trim();
    if (/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(raw)) return raw;
    // Legacy Last.fm responses use English dates, sometimes followed by a time.
    if (!/^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}(?:,.*)?$/.test(raw)) return null;
    const timestamp = Date.parse(`${raw.split(',')[0]} UTC`);
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : null;
}

export async function findMusicBrainzReleaseDate(fetch: MusicFetch, kind: MusicKind, title: string, artist: string): Promise<string | null> {
    if (!title.trim() || !artist.trim()) return null;
    const entity = kind === 'album' ? 'release-group' : 'recording';
    const params = new URLSearchParams({ query: `${entity}:(${lucene(title)}) AND artist:(${lucene(artist)})`, fmt: 'json', limit: '8' });
    const root = object(await fetch(`https://musicbrainz.org/ws/2/${entity}?${params}`));
    const dates = asArray(root[kind === 'album' ? 'release-groups' : 'recordings'])
        .map(object)
        .filter(entry => normalizedMusicText(text(entry.title)) === normalizedMusicText(title)
            && normalizedMusicText(credit(entry['artist-credit'])) === normalizedMusicText(artist))
        .map(entry => releaseDate(entry['first-release-date']))
        .filter((date): date is string => Boolean(date))
        .sort();
    return dates[0] || null;
}

/** Resolve artwork for a Last.fm result through the release attached to a MusicBrainz recording. */
export async function findMusicBrainzArtwork(fetch: MusicFetch, kind: MusicKind, title: string, artist: string): Promise<string[]> {
    if (!title.trim() || !artist.trim()) return [];
    const entity = kind === 'album' ? 'release' : 'recording';
    const params = new URLSearchParams({ query: `${entity}:(${lucene(title)}) AND artist:(${lucene(artist)})`, fmt: 'json', limit: '8' });
    const root = object(await fetch(`https://musicbrainz.org/ws/2/${entity}?${params}`));
    const urls: string[] = [];
    for (const entry of asArray(root[kind === 'album' ? 'releases' : 'recordings'])) {
        const item = object(entry);
        const releases = kind === 'album' ? [item] : asArray(item.releases).map(object);
        for (const release of releases) {
            const releaseId = text(release.id);
            const groupId = text(object(release['release-group']).id);
            if (releaseId) urls.push(`https://coverartarchive.org/release/${releaseId}/front-500`);
            if (groupId) urls.push(`https://coverartarchive.org/release-group/${groupId}/front-500`);
        }
    }
    return [...new Set(urls)];
}
function lastfmUrl(method: string, apiKey: string, params: Record<string, string>): string {
    const query = new URLSearchParams({ method, api_key: apiKey, format: 'json', ...params });
    return `https://ws.audioscrobbler.com/2.0/?${query}`;
}
async function lastfm(fetch: MusicFetch, url: string): Promise<Record<string, unknown>> {
    const result = object(await fetch(url));
    if (result.error) throw new Error('Last.fm request failed');
    return result;
}
export async function searchMusic(fetch: MusicFetch, provider: MusicProvider, kind: MusicKind, query: string, page = 1, apiKey = ''): Promise<MusicSearchResult[]> {
    if (!query.trim()) return [];
    const limit = 20;
    if (provider === 'musicbrainz') {
        const entity = kind === 'album' ? 'release' : 'recording';
        // Escape Lucene syntax: user input is text, never a provider query expression.
        const literal = lucene(query);
        const params = new URLSearchParams({ query: `(${entity}:(${literal}) OR artist:(${literal}))`, fmt: 'json', limit: String(limit), offset: String((page - 1) * limit) });
        const root = object(await fetch(`https://musicbrainz.org/ws/2/${entity}?${params}`));
        return asArray(root[kind === 'album' ? 'releases' : 'recordings']).map(entry => {
            const o = object(entry);
            const release = kind === 'album' ? o : object(asArray(o.releases)[0]);
            return {
                id: text(o.id), title: text(o.title), artist: credit(o['artist-credit']),
                year: text(release.date).slice(0, 4),
                image: text(release.id) ? `https://coverartarchive.org/release/${text(release.id)}/front-500` : '',
                fallbackImage: text(object(release['release-group']).id) ? `https://coverartarchive.org/release-group/${text(object(release['release-group']).id)}/front-500` : undefined,
                provider, kind,
            };
        }).filter(item => item.id && item.title);
    }
    if (provider === 'deezer') {
        const root = await deezer(fetch, `search/${kind === 'album' ? 'album' : 'track'}?${new URLSearchParams({ q: query.trim(), limit: String(limit), index: String((page - 1) * limit) })}`);
        return asArray(root.data).map(entry => {
            const o = object(entry); const album = kind === 'album' ? o : object(o.album);
            return { id: String(o.id || ''), title: text(o.title), artist: text(object(o.artist).name),
                year: text(o.release_date).slice(0, 4), image: text(album.cover_big) || text(album.cover_medium), provider, kind };
        }).filter(item => /^\d+$/.test(item.id) && item.title && item.artist);
    }
    if (!apiKey.trim()) throw new Error('Last.fm API key required');
    const entity = kind === 'album' ? 'album' : 'track';
    const root = await lastfm(fetch, lastfmUrl(`${entity}.search`, apiKey, { [entity]: query.trim(), limit: String(limit), page: String(page) }));
    const matches = object(object(root.results)[`${entity}matches`]);
    return array(matches[entity]).map(entry => {
        const o = object(entry);
        const artist = text(o.artist);
        const title = text(o.name);
        return { id: JSON.stringify([artist, title]), title, artist, year: '', image: cover(o.image), provider, kind };
    }).filter(item => item.title && item.artist);
}

export async function getMusicDetails(fetch: MusicFetch, selection: MusicSearchResult, apiKey = ''): Promise<MusicItem> {
    const result = { ...emptyMusicItem(), musicKind: selection.kind, displayName: selection.title, artist: selection.artist,
        poster: selection.image || null, imageUrl: selection.image, year: Number(selection.year) || null,
        integrationProvider: selection.provider, integrationId: selection.id };
    if (selection.provider === 'musicbrainz') {
        const entity = selection.kind === 'album' ? 'release' : 'recording';
        const params = new URLSearchParams({ fmt: 'json', inc: selection.kind === 'album' ? 'recordings+artist-credits+genres+annotation' : 'artist-credits+releases+genres+annotation' });
        const o = object(await fetch(`https://musicbrainz.org/ws/2/${entity}/${encodeURIComponent(selection.id)}?${params}`));
        if (!o.id) throw new Error('MusicBrainz item missing');
        result.displayName = text(o.title) || result.displayName;
        result.artist = credit(o['artist-credit']) || result.artist;
        result.description = text(o.annotation) || text(object(o.annotation).text);
        result.genres = asArray(o.genres).map(v => getString(object(v), 'name')).filter(Boolean);
        result.sourceUrl = `https://musicbrainz.org/${entity}/${selection.id}`;
        if (selection.kind === 'album') {
            result.countries = normalizeCountryMetadata([o.country, ...asArray(o['release-events']).map(event => object(object(event).area)['iso-3166-1-codes'])]);
            result.releaseDate = releaseDate(o.date);
            result.year = Number(result.releaseDate?.slice(0, 4)) || null;
            result.tracks = asArray(o.media).flatMap((medium, discIndex) => asArray(object(medium).tracks).map((value, index): MusicTrack => {
                const track = object(value); const recording = object(track.recording);
                return { id: text(track.id) || `${discIndex + 1}-${index + 1}`, title: text(track.title) || text(recording.title),
                    artist: credit(track['artist-credit']) || credit(recording['artist-credit']) || result.artist,
                    artists: asArray(track['artist-credit'] ?? recording['artist-credit']).map(value => text(object(value).name) || text(object(object(value).artist).name)).filter(Boolean),
                    disc: Number(object(medium).position) || discIndex + 1, duration: seconds(track.length ?? recording.length, 1000),
                    listened: false, favorite: false, userRating: null, recordingId: text(recording.id) || undefined };
            }));
            result.duration = result.tracks.length && result.tracks.every(track => track.duration !== null)
                ? result.tracks.reduce((sum, track) => sum + (track.duration ?? 0), 0) : null;
        } else {
            result.duration = seconds(o.length, 1000);
            const release = object(asArray(o.releases)[0]);
            result.album = text(release.title);
            result.releaseDate = releaseDate(o['first-release-date']) || releaseDate(release.date);
            result.year = Number(text(release.date).slice(0, 4)) || result.year;
            if (release.id) result.poster = `https://coverartarchive.org/release/${text(release.id)}/front-500`;
        }
    } else if (selection.provider === 'deezer') {
        if (!/^\d+$/.test(selection.id)) throw new Error('Invalid Deezer ID');
        const entity = selection.kind === 'album' ? 'album' : 'track';
        const o = await deezer(fetch, `${entity}/${selection.id}`);
        if (!o.id || !o.title) throw new Error('Deezer item missing');
        const artist = object(o.artist); const album = entity === 'album' ? o : object(o.album);
        result.displayName = text(o.title); result.artist = text(artist.name) || result.artist;
        result.deezerArtistId = String(artist.id || '');
        result.sourceUrl = `https://www.deezer.com/${entity}/${selection.id}`;
        result.poster = text(album.cover_big) || text(album.cover_xl) || result.poster;
        result.releaseDate = releaseDate(o.release_date) || releaseDate(album.release_date);
        result.year = Number(result.releaseDate?.slice(0, 4)) || result.year;
        result.duration = seconds(o.duration);
        result.genres = asArray(object(o.genres).data).map(v => text(object(v).name)).filter(Boolean);
        if (entity === 'album') {
            const values = [...asArray(object(o.tracks).data)];
            let offset = values.length;
            // Album responses can contain only the first page of a box set.
            while (offset < Number(o.nb_tracks) && offset < 5000) {
                const page = await deezer(fetch, `album/${selection.id}/tracks?limit=100&index=${offset}`);
                const more = asArray(page.data); if (!more.length) throw new Error('Incomplete Deezer tracklist');
                values.push(...more); offset += more.length;
            }
            if (Number(o.nb_tracks) > values.length) throw new Error('Incomplete Deezer tracklist');
            result.tracks = values.map((entry, index): MusicTrack => {
                const track = object(entry);
                return { id: `deezer-${track.id || index + 1}`, deezerId: String(track.id || ''), title: text(track.title),
                    artist: text(object(track.artist).name) || result.artist, duration: seconds(track.duration),
                    artists: asArray(track.contributors).map(value => text(object(value).name)).filter(Boolean),
                    disc: Number(track.disk_number) || 1, listened: false, favorite: false, userRating: null };
            });
        } else result.album = text(album.title);
    } else {
        const entity = selection.kind === 'album' ? 'album' : 'track';
        const root = await lastfm(fetch, lastfmUrl(`${entity}.getInfo`, apiKey, { artist: selection.artist, [entity]: selection.title, autocorrect: '1' }));
        const o = object(root[entity]);
        if (!o.name) throw new Error('Last.fm item missing');
        result.displayName = text(o.name);
        result.artist = text(o.artist) || text(object(o.artist).name) || result.artist;
        result.sourceUrl = text(o.url);
        result.listeningStats = { source: 'lastfm', listeners: musicCount(o.listeners), plays: musicCount(o.playcount), url: text(o.url) };
        result.releaseDate = releaseDate(o.releasedate) || releaseDate(object(o.album).releasedate);
        result.year = Number(result.releaseDate?.slice(0, 4)) || result.year;
        result.description = stripHtml(text(object(o.wiki).content) || text(object(o.wiki).summary));
        result.genres = array(object(o.tags ?? o.toptags).tag).map(v => text(object(v).name)).filter(Boolean);
        result.poster = cover(o.image) || cover(object(o.album).image) || result.poster;
        if (selection.kind === 'album') {
            result.tracks = array(object(o.tracks).track).map((value, index): MusicTrack => {
                const track = object(value);
                return { id: `lastfm-${index + 1}`, title: text(track.name), artist: text(object(track.artist).name) || result.artist,
                    disc: 1, duration: seconds(track.duration), listened: false, favorite: false, userRating: null };
            });
            result.duration = result.tracks.length && result.tracks.every(track => track.duration !== null)
                ? result.tracks.reduce((sum, track) => sum + (track.duration ?? 0), 0) : null;
        } else { result.album = text(object(o.album).title); result.duration = seconds(o.duration, 1000); }
    }
    if (selection.provider !== 'lastfm' && apiKey && result.artist) {
        try {
            const extra = await getMusicDetails(fetch, { ...selection, provider: 'lastfm', title: result.displayName, artist: result.artist }, apiKey);
            if (!result.description) result.description = extra.description;
            result.listeningStats = extra.listeningStats;
        } catch { /* Optional description enrichment must not discard a valid album. */ }
    }
    result.imageUrl = result.poster || '';
    result.nameLower = `${result.displayName} ${result.artist}`.toLocaleLowerCase();
    return result;
}

/** Deezer exposes public catalog data without OAuth; errors also arrive with HTTP 200. */
export async function deezer(fetch: MusicFetch, path: string): Promise<Record<string, unknown>> {
    const data = object(await fetch(`https://api.deezer.com/${path}`));
    if (data.error) throw new Error('Deezer request failed');
    return data;
}
export function musicCount(value: unknown): number | null {
    if (value == null || value === '') return null;
    const n = Number(value); return Number.isSafeInteger(n) && n >= 0 ? n : null;
}
