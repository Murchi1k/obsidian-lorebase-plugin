import { asObject, getArray, getObject, getString, type JsonFetcher } from './providers/common';
import { getIgdbGallery } from './providers/igdb';
import { getSteamGallery } from './providers/steam';
import { getShikimoriGallery } from './providers/shikimori';
import { getTmdbGallery } from './providers/tmdb';
import { getVndbGallery } from './providers/vndb';
import { fetchKitsu, resolveKitsuMalId } from './providers/kitsu';
import type { ProviderId, SourceImage } from './types';

export const galleryProviders = new Set<ProviderId>([
    'steam', 'igdb', 'rawg', 'vndb', 'shikimori', 'tmdb', 'tvmaze', 'kitsu', 'jikan', 'anilist',
]);

interface GallerySource {
    provider: ProviderId;
    id: string;
    apiKey?: string;
    clientSecret?: string;
    videoKind: 'movie' | 'tv';
}

type Progress = (images: SourceImage[]) => void;

export async function fetchSourceGallery(fetch: JsonFetcher, source: GallerySource, onProgress?: Progress): Promise<SourceImage[]> {
    const images = await loadImages(fetch, source, onProgress && (page => onProgress(normalizeImages(page))));
    return normalizeImages(images);
}

function normalizeImages(images: SourceImage[]): SourceImage[] {
    const result: SourceImage[] = [];
    const seen = new Set<string>();
    for (const image of images) {
        const url = image.url.trim();
        const key = (image.kind ?? 'images') + ':' + url;
        if (!isImageUrl(url) || seen.has(key)) continue;
        seen.add(key);
        result.push({ ...image, url, thumbnail: isImageUrl(image.thumbnail) ? image.thumbnail : url });
    }
    return result;
}

function isImageUrl(value: string): boolean {
    return /^https?:\/\/[^\s]+$/i.test(value);
}

async function loadImages(fetch: JsonFetcher, { provider, id, apiKey = '', clientSecret = '', videoKind }: GallerySource, onProgress?: Progress): Promise<SourceImage[]> {
    switch (provider) {
        case 'steam': return getSteamGallery(fetch, id);
        case 'igdb': return getIgdbGallery(fetch, id, apiKey, clientSecret);
        case 'rawg': return getRawgGallery(fetch, id, apiKey, onProgress);
        case 'vndb': return getVndbGallery(fetch, id);
        case 'shikimori': return getShikimoriGallery(fetch, id);
        case 'tmdb': return getTmdbGallery(fetch, id, apiKey, videoKind);
        case 'tvmaze': return getTvmazeGallery(fetch, id);
        case 'kitsu': return getKitsuGallery(fetch, id, onProgress);
        case 'jikan': {
            const kitsuId = await resolveKitsuMalId(fetch, id);
            return kitsuId ? getKitsuGallery(fetch, kitsuId, onProgress) : [];
        }
        case 'anilist': return getAniListGallery(fetch, id);
        default: return [];
    }
}

async function getRawgGallery(fetch: JsonFetcher, id: string, key: string, onProgress?: Progress): Promise<SourceImage[]> {
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(id)) return [];
    const url = new URL('https://api.rawg.io/api/games/' + id + '/screenshots');
    url.searchParams.set('key', key);
    url.searchParams.set('page_size', '40');
    const images: SourceImage[] = [];
    const nextPages = new Set<string>();
    for (let page = 1; ; page++) {
        url.searchParams.set('page', String(page));
        const response = asObject(await fetch(url.href));
        const rows = getArray(response, 'results');
        for (const row of rows) {
            const image = getString(asObject(row), 'image');
            images.push({ url: image, thumbnail: image });
        }
        const next = getString(response, 'next');
        if (!rows.length || !next || nextPages.has(next)) return images;
        nextPages.add(next);
        onProgress?.(images);
    }
}

async function getTvmazeGallery(fetch: JsonFetcher, id: string): Promise<SourceImage[]> {
    if (!/^[1-9]\d*$/.test(id)) return [];
    const data = await fetch('https://api.tvmaze.com/shows/' + id + '/images');
    return (Array.isArray(data) ? data : []).flatMap(raw => {
        const image = asObject(raw);
        const type = getString(image, 'type');
        if (!['background', 'poster', 'banner'].includes(type)) return [];
        const resolutions = getObject(image, 'resolutions');
        return [{
            kind: type === 'poster' ? 'posters' : 'backdrops',
            url: getString(getObject(resolutions, 'original'), 'url'),
            thumbnail: getString(getObject(resolutions, 'medium'), 'url'),
        }];
    });
}

async function getKitsuGallery(fetch: JsonFetcher, id: string, onProgress?: Progress): Promise<SourceImage[]> {
    if (!/^[1-9]\d*$/.test(id)) return [];
    const images: SourceImage[] = [];
    const nextPages = new Set<string>();
    for (let offset = 0; ; offset += 20) {
        const params = new URLSearchParams({ 'fields[episodes]': 'thumbnail', 'page[limit]': '20', 'page[offset]': String(offset) });
        const response = asObject(await fetchKitsu(fetch, 'anime/' + id + '/episodes?' + params));
        const episodes = getArray(response, 'data');
        for (const episode of episodes) {
            const attributes = getObject(asObject(episode), 'attributes');
            const thumbnail = getObject(attributes, 'thumbnail');
            images.push({ url: getString(thumbnail, 'original'), thumbnail: getString(thumbnail, 'small') });
        }
        const next = getString(getObject(response, 'links'), 'next');
        if (!episodes.length || !next || nextPages.has(next)) return images;
        nextPages.add(next);
        onProgress?.(images);
    }
}

async function getAniListGallery(fetch: JsonFetcher, id: string): Promise<SourceImage[]> {
    if (!/^[1-9]\d*$/.test(id)) return [];
    const response = asObject(await fetch('https://graphql.anilist.co', { 'Content-Type': 'application/json' }, 'POST', JSON.stringify({
        query: 'query ($id: Int!) { Media(id: $id, type: ANIME) { bannerImage streamingEpisodes { thumbnail } } }',
        variables: { id: Number(id) },
    })));
    const media = getObject(getObject(response, 'data'), 'Media');
    const images = getArray(media, 'streamingEpisodes').map(episode => getString(asObject(episode), 'thumbnail'));
    return [getString(media, 'bannerImage'), ...images].map(url => ({ url, thumbnail: url }));
}
