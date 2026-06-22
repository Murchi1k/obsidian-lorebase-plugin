import { GameDetails, SearchResult } from '../types';
import { JsonFetcher, asObject, getArray, getObject, getString, mapStringList, stripHtml, toStringSafe } from './common';

export async function searchRawg(fetchJson: JsonFetcher, query: string, apiKey: string): Promise<SearchResult[]> {
    const url = new URL('https://api.rawg.io/api/games');
    url.searchParams.set('search', query);
    url.searchParams.set('page_size', '10');
    url.searchParams.set('key', apiKey);

    const root = asObject(await fetchJson(url.toString()));
    const results = getArray(root, 'results');

    return results.map((item) => {
        const record = asObject(item);
        const released = getString(record, 'released');
        return {
            id: getString(record, 'id'),
            title: getString(record, 'name') || 'Unknown',
            subtitle: released ? released.slice(0, 4) : '',
            year: released ? released.slice(0, 4) : '',
            image: getString(record, 'background_image'),
            provider: 'rawg',
        };
    });
}

export async function getRawgDetails(fetchJson: JsonFetcher, id: string, apiKey: string): Promise<GameDetails | null> {
    const url = new URL(`https://api.rawg.io/api/games/${id}`);
    url.searchParams.set('key', apiKey);
    const item = asObject(await fetchJson(url.toString()));
    if (!item) return null;

    const genres = mapStringList(getArray(item, 'genres'), (entry) => getString(asObject(entry), 'name'));
    const platforms = mapStringList(
        getArray(item, 'platforms'),
        (entry) => getString(getObject(asObject(entry), 'platform'), 'name')
    );
    const developers = mapStringList(getArray(item, 'developers'), (entry) => getString(asObject(entry), 'name'));
    const publishers = mapStringList(getArray(item, 'publishers'), (entry) => getString(asObject(entry), 'name'));
    const released = getString(item, 'released');
    const year = released ? released.slice(0, 4) : '';
    const slug = getString(item, 'slug');
    const urlLink = slug ? `https://rawg.io/games/${slug}` : '';

    return {
        name: getString(item, 'name') || 'Unknown',
        description: stripHtml(getString(item, 'description_raw') || getString(item, 'description')),
        poster: getString(item, 'background_image'),
        posterHorizontal: getString(item, 'background_image'),
        genres,
        platforms,
        developers,
        publishers,
        rating: toStringSafe(item.rating),
        metacritic: toStringSafe(item.metacritic),
        released,
        year,
        url: urlLink,
    };
}
