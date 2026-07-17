import { GameDetails, SearchResult } from '../types';
import { JsonFetcher, asObject, getArray, getObject, getString, mapStringList, stripHtml, extractYear } from './common';
import { getSteamLibraryPoster, getSteamVerticalImageCandidates } from '../steamImages';
import { SteamGridDbOptions, getSteamGridDbPoster } from './steamgriddb';

export type UrlValidator = (url: string) => Promise<boolean>;

interface SteamSearchOptions {
    includeDlc?: boolean;
    steamGridDb?: SteamGridDbOptions;
    imageExists?: UrlValidator;
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

export async function searchSteam(fetchJson: JsonFetcher, query: string, options: SteamSearchOptions = {}): Promise<SearchResult[]> {
    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.max(1, options.pageSize ?? 10);
    const steamPageSize = Math.max(25, pageSize);
    const url = new URL('https://store.steampowered.com/search/results/');
    url.searchParams.set('query', '');
    url.searchParams.set('term', query);
    url.searchParams.set('l', 'english');
    url.searchParams.set('cc', 'us');
    url.searchParams.set('category1', '998');
    url.searchParams.set('page', String(page));
    url.searchParams.set('count', String(steamPageSize));
    url.searchParams.set('dynamic_data', '');
    url.searchParams.set('infinite', '1');

    const root = asObject(await fetchJson(url.toString()));
    const html = getString(root, 'results_html');
    const items = html ? parseSteamSearchHtml(html) : getArray(root, 'items');
    const total = Number(root?.total);
    const totalCount = Number(root?.total_count);
    const hasNext = Number.isFinite(total)
        ? page * steamPageSize < total
        : Number.isFinite(totalCount)
            ? page * steamPageSize < totalCount
            : items.length >= steamPageSize;

    const mapped = (await Promise.all(items.map(async (item): Promise<SearchResult | null> => {
        const record = asObject(item);
        const type = getString(record, 'type').toLowerCase();
        if (type && type !== 'app') return null;

        const released = getString(record, 'released');
        const id = getString(record, 'id');
        const image = await getFirstExistingUrl(getSteamVerticalImageCandidates(id, getSteamLibraryPoster(id)), options.imageExists);

        return {
            id,
            title: getString(record, 'name') || 'Unknown',
            subtitle: released,
            year: extractYear(released),
            image,
            provider: 'steam' as const,
        };
    }))).filter((result): result is SearchResult => result !== null);

    const results = options.includeDlc ? mapped : await filterSteamDlc(fetchJson, mapped);
    const enriched = await enrichSteamGridDbImages(fetchJson, results, options.steamGridDb);

    return withHasNext(enriched, hasNext);
}

function parseSteamSearchHtml(html: string): Record<string, unknown>[] {
    const rows: Record<string, unknown>[] = [];
    const rowPattern = /<a\b[^>]*data-ds-appid="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let match: RegExpExecArray | null;

    while ((match = rowPattern.exec(html)) !== null) {
        const id = match[1].split(',')[0]?.trim() ?? '';
        const body = match[2];
        const title = decodeHtml(extractHtmlText(body, /<span[^>]*class="title"[^>]*>([\s\S]*?)<\/span>/));
        if (!id || !title) continue;

        const released = decodeHtml(extractHtmlText(body, /<div[^>]*class="[^"]*\bsearch_released\b[^"]*"[^>]*>([\s\S]*?)<\/div>/));
        rows.push({
            id,
            name: title,
            released,
            type: 'app',
        });
    }

    return rows;
}

function extractHtmlText(html: string, pattern: RegExp): string {
    const match = html.match(pattern);
    return match?.[1]?.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() ?? '';
}

function decodeHtml(value: string): string {
    return value
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

export async function getSteamDetails(
    fetchJson: JsonFetcher,
    id: string,
    options: { steamGridDb?: SteamGridDbOptions; imageExists?: UrlValidator } = {}
): Promise<GameDetails | null> {
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
    const poster = await getFirstExistingUrl(getSteamVerticalImageCandidates(id, getSteamLibraryPoster(id)), options.imageExists)
        || await getSteamGridDbPoster(fetchJson, id, options.steamGridDb)
        || '';

    return {
        kind: 'game',
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

async function getFirstExistingUrl(candidates: string[], imageExists?: UrlValidator): Promise<string> {
    if (!imageExists) return '';

    for (const candidate of candidates) {
        try {
            if (await imageExists(candidate)) {
                return candidate;
            }
        } catch {
            // Treat validator failures as a missing image. Search/details should still work.
        }
    }

    return '';
}

async function enrichSteamGridDbImages(
    fetchJson: JsonFetcher,
    results: SearchResult[],
    options?: SteamGridDbOptions
): Promise<SearchResult[]> {
    if (!options?.enabled || !options.apiKey?.trim()) return results;

    return Promise.all(results.map(async (result) => {
        if (result.image) return result;
        const image = await getSteamGridDbPoster(fetchJson, result.id, options);
        return image ? { ...result, image } : result;
    }));
}

async function filterSteamDlc(fetchJson: JsonFetcher, results: SearchResult[]): Promise<SearchResult[]> {
    const ids = results
        .map((result) => result.id)
        .filter((id): id is string => Boolean(id));
    if (!ids.length) return results;

    try {
        const detailEntries = await Promise.all(ids.map(async (id) => [
            id,
            await fetchSteamBasicAppDetails(fetchJson, id),
        ] as const));
        const detailsById = new Map(detailEntries);

        return results.filter((result) => {
            const data = detailsById.get(result.id);
            if (!data) {
                return !isLikelySteamExtraContent(result.title);
            }
            return !isSteamExtraContentData(data) && !isLikelySteamExtraContent(result.title);
        });
    } catch (error) {
        console.warn('[LOREBASE] Failed to filter Steam DLC search results.', error);
        return results;
    }
}

async function fetchSteamBasicAppDetails(fetchJson: JsonFetcher, id: string): Promise<Record<string, unknown> | null> {
    try {
        const url = new URL('https://store.steampowered.com/api/appdetails');
        url.searchParams.set('appids', id);
        url.searchParams.set('filters', 'basic');
        url.searchParams.set('l', 'english');
        url.searchParams.set('cc', 'us');

        const json = asObject(await fetchJson(url.toString()));
        const appResult = getObject(json, id);
        return getObject(appResult, 'data');
    } catch {
        return null;
    }
}

function isSteamExtraContentData(data: Record<string, unknown>): boolean {
    const type = getString(data, 'type').toLowerCase();
    return type === 'dlc'
        || type === 'music'
        || Boolean(getObject(data, 'fullgame'));
}

function isLikelySteamExtraContent(title: string): boolean {
    return /\b(dlc|soundtrack|expansion pass|season pass|redkit|bonus content|add-?on)\b/i.test(title);
}
