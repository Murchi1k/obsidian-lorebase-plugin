import { GameDetails, SearchResult } from '../types';
import { JsonFetcher, asObject, getArray, getString, mapStringList, stripHtml, toStringSafe } from './common';

const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const IGDB_GAMES_URL = 'https://api.igdb.com/v4/games';

interface SearchPageOptions {
    page?: number;
    pageSize?: number;
}

function withHasNext<T>(items: T[], hasNext: boolean): T[] {
    Object.defineProperty(items, 'hasNext', {
        value: hasNext,
        enumerable: false,
        configurable: true,
    });
    return items;
}

function getNumber(source: Record<string, unknown> | null, key: string): number | null {
    if (!source) return null;
    const value = source[key];
    return typeof value === 'number' ? value : null;
}

function formatDate(timestamp: number | null): string {
    if (!timestamp) return '';
    return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

function getYear(timestamp: number | null): string {
    if (!timestamp) return '';
    return new Date(timestamp * 1000).getUTCFullYear().toString();
}

function getIgdbImageUrl(imageId: string, size: 'cover_big_2x' | 'screenshot_huge'): string {
    return imageId ? `https://images.igdb.com/igdb/image/upload/t_${size}/${imageId}.jpg` : '';
}

function escapeIgdbString(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function getAccessToken(fetchJson: JsonFetcher, clientId: string, clientSecret: string): Promise<string> {
    const params = new URLSearchParams();
    params.set('client_id', clientId);
    params.set('client_secret', clientSecret);
    params.set('grant_type', 'client_credentials');

    const token = asObject(await fetchJson(
        TWITCH_TOKEN_URL,
        { 'Content-Type': 'application/x-www-form-urlencoded' },
        'POST',
        params.toString()
    ));

    return getString(token, 'access_token');
}

async function fetchIgdbGames(
    fetchJson: JsonFetcher,
    clientId: string,
    clientSecret: string,
    body: string
): Promise<unknown[]> {
    const token = await getAccessToken(fetchJson, clientId, clientSecret);
    if (!token) return [];

    const result: unknown = await fetchJson(
        IGDB_GAMES_URL,
        {
            'Accept': 'application/json',
            'Authorization': `Bearer ${token}`,
            'Client-ID': clientId,
            'Content-Type': 'text/plain',
        },
        'POST',
        body
    );

    return Array.isArray(result) ? (result as unknown[]) : [];
}

export async function searchIgdb(
    fetchJson: JsonFetcher,
    query: string,
    clientId: string,
    clientSecret: string,
    options: SearchPageOptions = {}
): Promise<SearchResult[]> {
    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.max(1, options.pageSize ?? 10);
    const body = [
        'fields name,first_release_date,cover.image_id;',
        `search "${escapeIgdbString(query)}";`,
        'where version_parent = null;',
        `limit ${pageSize + 1};`,
        `offset ${(page - 1) * pageSize};`,
    ].join('\n');

    const results = await fetchIgdbGames(fetchJson, clientId, clientSecret, body);
    const hasNext = results.length > pageSize;

    const mapped = results.slice(0, pageSize).map((item) => {
        const record = asObject(item);
        const released = getNumber(record, 'first_release_date');
        const cover = asObject(record?.cover);
        const year = getYear(released);

        return {
            id: getString(record, 'id'),
            title: getString(record, 'name') || 'Unknown',
            subtitle: year,
            year,
            image: getIgdbImageUrl(getString(cover, 'image_id'), 'cover_big_2x'),
            provider: 'igdb' as const,
        };
    });

    return withHasNext(mapped, hasNext);
}

export async function getIgdbDetails(
    fetchJson: JsonFetcher,
    id: string,
    clientId: string,
    clientSecret: string
): Promise<GameDetails | null> {
    const numericId = Number(id);
    if (!Number.isFinite(numericId) || numericId <= 0) return null;

    const body = [
        'fields name,summary,storyline,first_release_date,total_rating,aggregated_rating,rating,',
        'cover.image_id,screenshots.image_id,genres.name,platforms.name,',
        'involved_companies.developer,involved_companies.publisher,involved_companies.company.name,websites.url;',
        `where id = ${numericId};`,
        'limit 1;',
    ].join('\n');

    const [rawItem] = await fetchIgdbGames(fetchJson, clientId, clientSecret, body);
    const item = asObject(rawItem);
    if (!item) return null;

    const released = getNumber(item, 'first_release_date');
    const involvedCompanies = getArray(item, 'involved_companies');
    const developers = mapStringList(
        involvedCompanies.filter((entry) => Boolean(asObject(entry)?.developer)),
        (entry) => getString(asObject(asObject(entry)?.company), 'name')
    );
    const publishers = mapStringList(
        involvedCompanies.filter((entry) => Boolean(asObject(entry)?.publisher)),
        (entry) => getString(asObject(asObject(entry)?.company), 'name')
    );
    const cover = asObject(item.cover);
    const screenshots = getArray(item, 'screenshots');
    const firstScreenshot = asObject(screenshots[0]);
    const websites = getArray(item, 'websites');
    const firstWebsiteUrl = getString(asObject(websites[0]), 'url');

    return {
        kind: 'game',
        name: getString(item, 'name') || 'Unknown',
        description: stripHtml(getString(item, 'summary') || getString(item, 'storyline')),
        poster: getIgdbImageUrl(getString(cover, 'image_id'), 'cover_big_2x'),
        posterHorizontal: getIgdbImageUrl(getString(firstScreenshot, 'image_id'), 'screenshot_huge'),
        genres: mapStringList(getArray(item, 'genres'), (entry) => getString(asObject(entry), 'name')),
        platforms: mapStringList(getArray(item, 'platforms'), (entry) => getString(asObject(entry), 'name')),
        developers,
        publishers,
        rating: toStringSafe(item.total_rating || item.rating),
        metacritic: toStringSafe(item.aggregated_rating),
        released: formatDate(released),
        year: getYear(released),
        url: firstWebsiteUrl || `https://www.igdb.com/games/${id}`,
    };
}
