import { GameDetails, SearchResult } from '../types';
import { JsonFetcher, asObject, getArray, getObject, getString, mapStringList, stripHtml, extractYear } from './common';

function getSteamLibraryPoster(appId: string): string {
    return appId ? `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/library_600x900.jpg` : '';
}

export async function searchSteam(fetchJson: JsonFetcher, query: string): Promise<SearchResult[]> {
    const url = new URL('https://store.steampowered.com/api/storesearch/');
    url.searchParams.set('term', query);
    url.searchParams.set('l', 'english');
    url.searchParams.set('cc', 'us');

    const root = asObject(await fetchJson(url.toString()));
    const items = getArray(root, 'items');

    return items.map((item) => {
        const record = asObject(item);
        const released = getString(record, 'released');
        const id = getString(record, 'id');
        return {
            id,
            title: getString(record, 'name') || 'Unknown',
            subtitle: released,
            year: extractYear(released),
            image: getSteamLibraryPoster(id)
                || getString(record, 'tiny_image')
                || getString(record, 'capsule_image')
                || getString(record, 'header_image'),
            provider: 'steam',
        };
    });
}

export async function getSteamDetails(fetchJson: JsonFetcher, id: string): Promise<GameDetails | null> {
    const url = new URL('https://store.steampowered.com/api/appdetails');
    url.searchParams.set('appids', id);
    url.searchParams.set('l', 'english');
    url.searchParams.set('cc', 'us');

    const json = asObject(await fetchJson(url.toString()));
    const appResult = getObject(json, id);
    const data = getObject(appResult, 'data');
    if (!data) return null;

    const genres = mapStringList(getArray(data, 'genres'), (entry) => getString(asObject(entry), 'description'));
    const platformsMap = getObject(data, 'platforms');
    const platforms = platformsMap
        ? Object.entries(platformsMap)
            .filter(([, enabled]) => Boolean(enabled))
            .map(([key]) => key)
        : [];
    const developers = mapStringList(getArray(data, 'developers'), (entry) => entry);
    const publishers = mapStringList(getArray(data, 'publishers'), (entry) => entry);
    const releaseDate = getObject(data, 'release_date');
    const released = getString(releaseDate, 'date');
    const year = extractYear(released);
    const metacritic = getString(getObject(data, 'metacritic'), 'score');
    const posterHorizontal = getString(data, 'header_image')
        || getString(data, 'capsule_image')
        || getString(data, 'capsule_imagev5');
    const poster = getSteamLibraryPoster(id)
        || getString(data, 'capsule_image')
        || getString(data, 'header_image')
        || getString(data, 'capsule_imagev5');

    return {
        name: getString(data, 'name') || 'Unknown',
        description: stripHtml(getString(data, 'short_description') || getString(data, 'detailed_description')),
        poster,
        posterHorizontal,
        genres,
        platforms,
        developers,
        publishers,
        rating: '',
        metacritic,
        released,
        year,
        url: `https://store.steampowered.com/app/${id}/`,
    };
}
