import { asObject, getArray, getObject, getString, type JsonFetcher } from './providers/common';
import { getIgdbTrailerEntries } from './providers/igdb';
import { fetchKitsu, resolveKitsuMalId } from './providers/kitsu';
import { getShikimoriTrailerEntries } from './providers/shikimori';
import { getSteamTrailerEntries } from './providers/steam';
import { findTmdbGalleryId, getTmdbTrailerEntries } from './providers/tmdb';
import type { ProviderId, SourceTrailer } from './types';

export const trailerProviders = new Set<ProviderId>(['steam', 'igdb', 'rawg', 'shikimori', 'tmdb', 'kitsu', 'jikan', 'anilist']);

interface TrailerSource {
    provider: ProviderId;
    id: string;
    videoKind: 'movie' | 'tv';
    language: string;
    apiKey?: string;
    clientSecret?: string;
}

export async function fetchSourceTrailers(fetch: JsonFetcher, source: TrailerSource): Promise<SourceTrailer[]> {
    const trailers = await loadTrailers(fetch, source);
    const unique = new Map<string, SourceTrailer>();
    for (const trailer of trailers) {
        if (trailer && !unique.has(trailer.playback.url)) unique.set(trailer.playback.url, trailer);
    }
    return [...unique.values()];
}

async function loadTrailers(fetch: JsonFetcher, {
    provider, id, videoKind, language, apiKey = '', clientSecret = '',
}: TrailerSource): Promise<(SourceTrailer | null)[]> {
    switch (provider) {
        case 'steam': {
            const entries = await getSteamTrailerEntries(fetch, id);
            return entries.map(raw => {
                const row = asObject(raw);
                const file = getString(getObject(row, 'mp4'), 'max') || getString(getObject(row, 'webm'), 'max')
                    || getString(getObject(row, 'mp4'), '480') || getString(getObject(row, 'webm'), '480');
                return directTrailer(getString(row, 'name'), getString(row, 'thumbnail'), file,
                    getString(row, 'hls_h264'), 'https://store.steampowered.com/app/' + id + '/');
            });
        }
        case 'igdb': {
            const entries = await getIgdbTrailerEntries(fetch, id, apiKey, clientSecret);
            return entries.map(raw => {
                const row = asObject(raw);
                return hostedTrailer('youtube', getString(row, 'video_id'), getString(row, 'name'));
            });
        }
        case 'rawg': {
            if (!/^[a-z0-9][a-z0-9_-]*$/i.test(id)) return [];
            const params = new URLSearchParams({ key: apiKey });
            const response = await fetch('https://api.rawg.io/api/games/' + id + '/movies?' + params);
            const entries = Array.isArray(response) ? response : getArray(asObject(response), 'results');
            return entries.map(raw => {
                const row = asObject(raw);
                const files = getObject(row, 'data');
                const file = getString(files, 'max') || getString(files, '480');
                return directTrailer(getString(row, 'name'), getString(row, 'preview'), file, '');
            });
        }
        case 'tmdb': return loadTmdbTrailers(fetch, id, apiKey, videoKind, language);
        case 'omdb': {
            const tmdbId = await findTmdbGalleryId(fetch, id, apiKey, videoKind, 'imdb_id');
            return tmdbId ? loadTmdbTrailers(fetch, tmdbId, apiKey, videoKind, language) : [];
        }
        case 'tvmaze': {
            if (!/^[1-9]\d*$/.test(id)) return [];
            const data = asObject(await fetch('https://api.tvmaze.com/shows/' + id));
            const external = getObject(data, 'externals');
            const tmdbId = await findTmdbGalleryId(fetch, getString(external, 'imdb'), apiKey, 'tv', 'imdb_id')
                ?? await findTmdbGalleryId(fetch, getString(external, 'thetvdb'), apiKey, 'tv', 'tvdb_id');
            return tmdbId ? loadTmdbTrailers(fetch, tmdbId, apiKey, 'tv', language) : [];
        }
        case 'shikimori': {
            const entries = await getShikimoriTrailerEntries(fetch, id);
            return entries.map(asObject)
                .filter(row => ['pv', 'trailer', 'character_trailer', 'teaser', 'cm'].includes(getString(row, 'kind').toLowerCase()))
                .map(row => shikimoriTrailer(row));
        }
        case 'jikan':
        case 'kitsu': {
            const kitsuId = provider === 'jikan' ? await resolveKitsuMalId(fetch, id) : id;
            if (!kitsuId || !/^[1-9]\d*$/.test(kitsuId)) return [];
            const data = asObject(await fetchKitsu(fetch, 'anime/' + kitsuId + '?fields%5Banime%5D=youtubeVideoId'));
            return [hostedTrailer('youtube', getString(getObject(getObject(data, 'data'), 'attributes'), 'youtubeVideoId'))];
        }
        case 'anilist': {
            if (!/^[1-9]\d*$/.test(id)) return [];
            const data = asObject(await fetch('https://graphql.anilist.co', { 'Content-Type': 'application/json' }, 'POST', JSON.stringify({
                query: 'query ($id: Int!) { Media(id: $id, type: ANIME) { trailer { id site thumbnail } } }',
                variables: { id: Number(id) },
            })));
            const trailer = getObject(getObject(getObject(data, 'data'), 'Media'), 'trailer');
            return [hostedTrailer(getString(trailer, 'site'), getString(trailer, 'id'), '', getString(trailer, 'thumbnail'))];
        }
        default: return [];
    }
}

async function loadTmdbTrailers(fetch: JsonFetcher, id: string, key: string, kind: 'movie' | 'tv', language: string) {
    const entries = await getTmdbTrailerEntries(fetch, id, key, kind, language);
    return entries.filter(entry => ['Trailer', 'Teaser'].includes(getString(entry, 'type')))
        .map(entry => hostedTrailer(getString(entry, 'site'), getString(entry, 'key'), getString(entry, 'name')));
}

function directTrailer(title: string, thumbnail: string, file: string, hls: string, external?: string): SourceTrailer | null {
    const stream = httpsUrl(file) || httpsUrl(hls);
    if (!stream) return null;
    return {
        title,
        url: external || stream,
        thumbnail: httpsUrl(thumbnail),
        playback: { kind: httpsUrl(file) ? 'file' : 'hls', url: stream },
    };
}

function hostedTrailer(site: string, id: string, title = '', thumbnail = ''): SourceTrailer | null {
    switch (site.toLowerCase()) {
        case 'youtube':
            if (!/^[\w-]{11}$/.test(id)) return null;
            return {
                title, url: 'https://www.youtube.com/watch?v=' + id,
                thumbnail: httpsUrl(thumbnail) || 'https://i.ytimg.com/vi/' + id + '/mqdefault.jpg',
                playback: { kind: 'embed', url: 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1' },
            };
        case 'vimeo':
            if (!/^\d+$/.test(id)) return null;
            return {
                title, url: 'https://vimeo.com/' + id, thumbnail: httpsUrl(thumbnail),
                playback: { kind: 'embed', url: 'https://player.vimeo.com/video/' + id + '?autoplay=1' },
            };
        case 'dailymotion':
            if (!/^[a-z\d]+$/i.test(id)) return null;
            return {
                title, url: 'https://www.dailymotion.com/video/' + id, thumbnail: httpsUrl(thumbnail),
                playback: { kind: 'embed', url: 'https://www.dailymotion.com/embed/video/' + id + '?autoplay=1' },
            };
        default: return null;
    }
}

function shikimoriTrailer(row: Record<string, unknown> | null): SourceTrailer | null {
    const external = httpsUrl(getString(row, 'url'));
    const player = httpsUrl(getString(row, 'player_url'));
    const title = getString(row, 'name');
    const thumbnail = httpsUrl(getString(row, 'image_url'));
    for (const address of [external, player]) {
        if (!address) continue;
        const parsed = new URL(address);
        const host = parsed.hostname.replace(/^www\./, '');
        if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'youtu.be') {
            const id = parsed.searchParams.get('v') || parsed.pathname.split('/').filter(Boolean).pop() || '';
            const video = hostedTrailer('youtube', id, title, thumbnail);
            if (video) return video;
        }
        if (host === 'vimeo.com' || host === 'player.vimeo.com') {
            const video = hostedTrailer('vimeo', parsed.pathname.split('/').filter(Boolean).pop() || '', title, thumbnail);
            if (video) return video;
        }
        if (address === player && ['vk.com', 'vkvideo.ru'].includes(host) && parsed.pathname === '/video_ext.php') {
            return { title, url: external || player, thumbnail, playback: { kind: 'embed', url: player } };
        }
        if (address === player && host === 'rutube.ru' && parsed.pathname.startsWith('/play/embed/')) {
            return { title, url: external || player, thumbnail, playback: { kind: 'embed', url: player } };
        }
    }
    return null;
}

function httpsUrl(value: string): string {
    try {
        const url = new URL(value.replace(/^http:\/\//i, 'https://').replace(/^\/\//, 'https://'));
        return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
    } catch {
        return '';
    }
}
