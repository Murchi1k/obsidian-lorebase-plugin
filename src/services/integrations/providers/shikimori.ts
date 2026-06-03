import { AnimeDetails, SearchResult } from '../types';
import { JsonFetcher, asArray, asObject, getArray, getObject, getString, mapAnimeFormat, mapStringList, stripHtml, toStringSafe } from './common';

const SHIKIMORI_BASE_URL = 'https://shikimori.one';
const SHIKIMORI_HEADERS = {
    'Accept': 'application/json',
    'User-Agent': 'LOREBASE/1.0 (Obsidian plugin; metadata search)',
};

export async function searchShikimori(fetchJson: JsonFetcher, query: string): Promise<SearchResult[]> {
    const url = new URL(`${SHIKIMORI_BASE_URL}/api/animes`);
    url.searchParams.set('search', query);
    url.searchParams.set('limit', '20');

    const json = await fetchJson(url.toString(), SHIKIMORI_HEADERS);
    const results = asArray(json);

    return results
        .map((item) => {
            const record = asObject(item);
            const airedOn = getString(record, 'aired_on');
            const imageData = getObject(record, 'image');
            const image = getBestImage(imageData);
            const name = getString(record, 'name');
            const russian = getString(record, 'russian');
            const title = russian || name || 'Unknown';
            const subtitle = name && name !== title ? name : '';
            return {
                id: getString(record, 'id'),
                title,
                subtitle,
                year: airedOn ? airedOn.slice(0, 4) : '',
                format: mapAnimeFormat(getString(record, 'kind')),
                image,
                provider: 'shikimori' as const,
                sortScore: getSearchSortScore(record, query, image),
            };
        })
        .sort((a, b) => b.sortScore - a.sortScore)
        .slice(0, 10)
        .map(({ sortScore, ...item }) => item);
}

export async function getShikimoriDetails(fetchJson: JsonFetcher, id: string): Promise<AnimeDetails | null> {
    const url = new URL(`${SHIKIMORI_BASE_URL}/api/animes/${id}`);
    const item = asObject(await fetchJson(url.toString(), SHIKIMORI_HEADERS));
    if (!item) return null;

    const tags = mapStringList(
        getArray(item, 'genres'),
        (entry) => getString(asObject(entry), 'russian') || getString(asObject(entry), 'name')
    );
    const studios = mapStringList(getArray(item, 'studios'), (entry) => getString(asObject(entry), 'name'));
    const airedOn = getString(item, 'aired_on');
    const year = airedOn ? airedOn.slice(0, 4) : '';
    const image = getBestImage(getObject(item, 'image'));

    return {
        name: getString(item, 'russian') || getString(item, 'name') || 'Unknown',
        description: stripHtml(getString(item, 'description')),
        image,
        tags,
        studios,
        year,
        imdbRating: toStringSafe(item.score),
        url: `${SHIKIMORI_BASE_URL}/animes/${id}`,
        format: mapAnimeFormat(getString(item, 'kind')),
    };
}

function getBestImage(imageData: Record<string, unknown> | null): string {
    const path = getString(imageData, 'original') || getString(imageData, 'preview');
    if (!path || path.includes('/assets/globals/missing_')) return '';
    return path.startsWith('http') ? path : `${SHIKIMORI_BASE_URL}${path}`;
}

function getSearchSortScore(record: Record<string, unknown> | null, query: string, image: string): number {
    const normalizedQuery = query.trim().toLowerCase();
    const name = getString(record, 'name').toLowerCase();
    const russian = getString(record, 'russian').toLowerCase();
    const status = getString(record, 'status');
    const score = Number.parseFloat(getString(record, 'score')) || 0;
    const airedYear = Number.parseInt((getString(record, 'aired_on') || '').slice(0, 4), 10);

    let rank = score * 3;
    if (name === normalizedQuery || russian === normalizedQuery) rank += 80;
    else if (name.startsWith(normalizedQuery) || russian.startsWith(normalizedQuery)) rank += 40;
    else if (name.includes(normalizedQuery) || russian.includes(normalizedQuery)) rank += 20;

    if (status === 'released') rank += 25;
    else if (status === 'ongoing') rank += 15;
    else if (status === 'anons') rank -= 15;

    if (image) rank += 10;
    if (Number.isFinite(airedYear) && airedYear > new Date().getFullYear()) rank -= 10;
    return rank;
}
