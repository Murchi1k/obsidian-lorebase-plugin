import { areOnlineExtrasEnabled, assertOnlineExtras, runOnlineExtra } from './onlineExtras';
import { requestUrl } from 'obsidian';
import { PLUGIN_VERSION } from '../version';
import { requestWithDeadline } from './integrations/requestDeadline';
import type { MusicKind } from '../types';
import { CatalogReferenceError } from '../localization/catalogReference';
import { parseCatalogReference } from './integrations/catalogReferences';
import { findMusicBrainzArtwork, findMusicBrainzReleaseDate, getMusicDetails, mergeMusicBrainzArtwork, MusicProvider, MusicSearchResult, searchMusic } from './integrations/providers/music';
import type { MusicItem } from '../types';
import { getArtistAppearances, getArtistReleases, getListeningStats, getMusicArtist, type MusicArtist, type MusicRelease } from './integrations/providers/musicDiscovery';
import { loadDeezerPreviews, type MusicPreviewQuery } from './media/musicPlayback';
import { getDeezerAlbumCredits } from './integrations/providers/musicTrackCredits';

// Shared by all dialogs, including failed requests, to respect MusicBrainz's 1 request/s limit.
let musicBrainzQueue: Promise<unknown> = Promise.resolve();
let lastRequest = 0;
const cache = new Map<string, { expires: number; data: unknown }>();
async function fetchMusic(url: string, fresh = false, extra = false): Promise<unknown> {
    if (extra) assertOnlineExtras();
    const cached = cache.get(url);
    if (!fresh && cached && cached.expires > Date.now()) return cached.data;
    const request = async (): Promise<unknown> => {
        const mb = new URL(url).hostname === 'musicbrainz.org';
        if (mb) {
            await new Promise(resolve => setTimeout(resolve, Math.max(0, 1100 - (Date.now() - lastRequest))));
            lastRequest = Date.now();
        }
        const options = { url, throw: false, headers: {
            Accept: 'application/json', ...(mb ? { 'User-Agent': `LOREBASE/${PLUGIN_VERSION} (Obsidian music library)` } : {}),
        } };
        const response = extra ? await runOnlineExtra(() => requestWithDeadline(() => requestUrl(options))) : await requestWithDeadline(() => requestUrl(options));
        if (response.status !== 200) throw new Error(`Music provider HTTP ${response.status}`);
        const data: unknown = response.json;
        if (!data || typeof data !== 'object') throw new Error('Invalid music response');
        if (!('error' in data)) {
            if (cache.size >= 100) cache.delete(cache.keys().next().value!);
            cache.set(url, { expires: Date.now() + 300_000, data });
        }
        return data;
    };
    if (new URL(url).hostname !== 'musicbrainz.org') return request();
    const operation = musicBrainzQueue.then(request);
    musicBrainzQueue = operation.catch(() => undefined);
    return operation;
}
const extraMusic = (url: string) => fetchMusic(url, false, true);

export class MusicCatalog {
    constructor(private readonly apiKey: () => string, private readonly enabled: (provider: MusicProvider) => boolean = () => true) {}
    previews(query: MusicPreviewQuery) {
        if (!this.enabled('deezer')) return Promise.reject(new Error('Music provider disabled'));
        // Preview URLs expire; resolve them on demand and never save them in a note.
        return runOnlineExtra(() => loadDeezerPreviews(url => fetchMusic(url, true, true), query));
    }
    listeningStats(item: Pick<MusicItem, 'artist' | 'displayName' | 'musicKind'>) {
        return runOnlineExtra(() => getListeningStats(extraMusic, this.enabled('lastfm') ? this.apiKey() : '', item));
    }
    artist(name: string, deezerId?: string, albumTitle?: string) {
        return runOnlineExtra(() => getMusicArtist(extraMusic, name, this.enabled('lastfm') ? this.apiKey() : '', this.enabled('deezer'), deezerId, albumTitle));
    }
    trackCredits(item: MusicItem, current: () => boolean = () => true) {
        if (!areOnlineExtrasEnabled() || !this.enabled('deezer')) return Promise.resolve(null);
        return runOnlineExtra(() => getDeezerAlbumCredits(extraMusic, item, current));
    }
    releases(artist: MusicArtist, page = 0) {
        if (!this.enabled('deezer')) return Promise.reject(new Error('Music provider disabled'));
        return runOnlineExtra(() => getArtistReleases(extraMusic, artist, page));
    }
    appearances(name: string, page = 0) {
        if (!this.enabled('musicbrainz')) return Promise.reject(new Error('Music provider disabled'));
        return runOnlineExtra(() => getArtistAppearances(extraMusic, name, page));
    }
    async releaseDetails(item: MusicRelease) {
        assertOnlineExtras();
        if (item.category !== 'featured') return this.details(item);
        if (!this.enabled('musicbrainz')) throw new Error('Music provider disabled');
        const params = new URLSearchParams({ 'release-group': item.id, fmt: 'json', limit: '1' });
        const root = await extraMusic(`https://musicbrainz.org/ws/2/release?${params}`) as { releases?: { id?: string }[] };
        const id = root.releases?.[0]?.id;
        if (!id) throw new Error('Release missing');
        return this.details({ ...item, id });
    }
    async search(provider: MusicProvider, kind: MusicKind, query: string, page = 1): Promise<MusicSearchResult[]> {
        const ref = parseCatalogReference(query, { kind: 'music', provider, musicKind: kind });
        if (ref) {
            const source = ref.provider as MusicProvider;
            if (!this.enabled(source) || source === 'lastfm' && !this.apiKey().trim()) throw new CatalogReferenceError('unavailable');
            const selection: MusicSearchResult = { provider: source, kind, id: ref.id, title: ref.title ?? '', artist: ref.artist ?? '', image: '', year: '' };
            const item = await getMusicDetails(fetchMusic, selection, source === 'lastfm' ? this.apiKey() : '');
            if (!item.displayName.trim()) throw new CatalogReferenceError('notFound');
            return Object.assign([{ ...selection, title: item.displayName, artist: item.artist, image: item.imageUrl || item.poster || '', year: item.year ? String(item.year) : '', directMatch: true }], { hasNext: false });
        }
        if (!this.enabled(provider)) return Promise.reject(new Error('Music provider disabled'));
        return searchMusic(fetchMusic, provider, kind, query.replace(/^title:\s*/i, ''), page, this.apiKey());
    }
    async details(item: MusicSearchResult) {
        if (!this.enabled(item.provider)) return Promise.reject(new Error('Music provider disabled'));
        const details = await getMusicDetails(fetchMusic, item, this.enabled('lastfm') && (areOnlineExtrasEnabled() || item.provider === 'lastfm') ? this.apiKey() : '');
        if (details.musicKind === 'album' && this.enabled('deezer')) {
            try {
                const credits = await this.trackCredits(details);
                if (credits) {
                    details.deezerArtistId = credits.deezerArtistId;
                    for (const credit of credits.tracks) Object.assign(details.tracks.find(track => track.id === credit.id)!, credit);
                }
            } catch { /* Optional guest credits do not replace a valid source response. */ }
        }
        if (item.provider === 'lastfm' && !details.releaseDate && this.enabled('musicbrainz')) {
            try {
                details.releaseDate = await findMusicBrainzReleaseDate(fetchMusic, item.kind, details.displayName || item.title, details.artist || item.artist);
                details.year = Number(details.releaseDate?.slice(0, 4)) || details.year;
            } catch { /* Optional enrichment must preserve valid Last.fm metadata. */ }
        }
        if (item.provider === 'lastfm' && !details.imageUrl && this.enabled('musicbrainz')) {
            const [image] = await findMusicBrainzArtwork(fetchMusic, item.kind, details.displayName || item.title, details.artist || item.artist);
            if (image) { details.poster = image; details.imageUrl = image; }
        }
        return details;
    }
    async enrichSearchCovers(provider: MusicProvider, kind: MusicKind, query: string, page: number, items: MusicSearchResult[]): Promise<MusicSearchResult[]> {
        if (provider !== 'lastfm' || kind !== 'track' || !this.enabled('musicbrainz') || !items.some(item => !item.image)) return items;
        try {
            const artwork = await searchMusic(fetchMusic, 'musicbrainz', 'track', query, page);
            return mergeMusicBrainzArtwork(items, artwork);
        } catch { return items; }
    }
}
