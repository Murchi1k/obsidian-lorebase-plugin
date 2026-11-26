import type { GameDetails, SearchResult, SourceImage } from '../types';
import { asObject, getArray, getObject, getString, stripHtml, type JsonFetcher } from './common';

const API = 'https://api.vndb.org/kana/vn';
const headers = { 'Content-Type': 'application/json' };
export async function searchVndb(fetch: JsonFetcher, query: string, options: { page?: number; pageSize?: number } = {}): Promise<SearchResult[]> {
    if (!query.trim()) return [];
    const root = asObject(await fetch(API, headers, 'POST', JSON.stringify({ filters: ['search', '=', query.trim()], fields: 'title,image.url,released', sort: 'searchrank', page: Math.max(1, options.page ?? 1), results: Math.min(100, options.pageSize ?? 20) })));
    return getArray(root, 'results').map(raw => {
        const item = asObject(raw);
        return { id: getString(item, 'id'), title: getString(item, 'title'), image: getString(getObject(item, 'image'), 'url'), year: getString(item, 'released').slice(0, 4), released: getString(item, 'released'), workType: 'Visual novel', workTypeMedia: 'game' as const, provider: 'vndb' as const };
    }).filter(item => item.id && item.title);
}
export async function getVndbDetails(fetch: JsonFetcher, id: string): Promise<GameDetails | null> {
    if (!/^v\d+$/.test(id)) return null;
    const root = asObject(await fetch(API, headers, 'POST', JSON.stringify({ filters: ['id', '=', id], fields: 'title,description,image.url,released,platforms,developers.name,rating,votecount', results: 1 })));
    const item = asObject(getArray(root, 'results')[0]);
    if (!item) return null;
    const rating = typeof item.rating === 'number' ? String(item.rating / 10) : '';
    return {
        kind: 'game', workType: 'Visual novel', name: getString(item, 'title'),
        description: stripHtml(getString(item, 'description').replace(/\[url=([^\]]+)\]([^[]+)\[\/url\]/g, '$2 ($1)').replace(/\[\/?(?:b|i|u|s|spoiler|quote|code)\]/g, '')),
        poster: getString(getObject(item, 'image'), 'url'), genres: [],
        platforms: getArray(item, 'platforms').map(String), developers: getArray(item, 'developers').map(raw => getString(asObject(raw), 'name')).filter(Boolean), publishers: [],
        rating, metacritic: '', released: getString(item, 'released'), year: getString(item, 'released').slice(0, 4), url: `https://vndb.org/${id}`,
        communityRating: rating, communityVotes: getString(item, 'votecount'),
    };
}

export async function getVndbGallery(fetch: JsonFetcher, id: string): Promise<SourceImage[]> {
    if (!/^v\d+$/.test(id)) return [];
    const response = asObject(await fetch(API, headers, 'POST', JSON.stringify({
        filters: ['id', '=', id], fields: 'screenshots.url,screenshots.thumbnail', results: 1,
    })));
    return getArray(asObject(getArray(response, 'results')[0]), 'screenshots').map(raw => {
        const image = asObject(raw);
        return { url: getString(image, 'url'), thumbnail: getString(image, 'thumbnail') };
    });
}
