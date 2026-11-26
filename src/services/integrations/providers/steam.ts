import { inferGameWorkType } from '../workTypeInference';
import { GameDetails, SearchResult, type SourceImage } from '../types';
import type { GameDlc } from '../../../types';
import { JsonFetcher, asObject, getArray, getObject, getString, mapStringList, stripHtml, extractYear } from './common';
import { getSteamLibraryPoster, getSteamVerticalImageCandidates } from '../steamImages';
import { SteamGridDbOptions, getSteamGridDbPoster } from './steamgriddb';
import { isProviderBlockedError } from '../shared';

export type UrlValidator = (url: string) => Promise<boolean>;

const steamDlcCache = new Map<string, GameDlc>();
const STEAM_DLC_REQUEST_CONCURRENCY = 4;

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

async function mapWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
    const results = new Array<R>(items.length);
    let nextIndex = 0;
    const workerCount = Math.min(Math.max(1, concurrency), items.length);
    const workers = Array.from({ length: workerCount }, async () => {
        while (nextIndex < items.length) {
            const index = nextIndex++;
            results[index] = await mapper(items[index], index);
        }
    });
    await Promise.all(workers);
    return results;
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
        const candidates = getSteamVerticalImageCandidates(id, getSteamLibraryPoster(id));
        const image = options.imageExists
            ? await getFirstExistingUrl(candidates, options.imageExists)
            : '';

        return {
            id,
            title: getString(record, 'name') || 'Unknown',
            subtitle: released,
            released,
            year: extractYear(released),
            image,
            provider: 'steam' as const,
            workType: inferGameWorkType(record),
            workTypeMedia: 'game' as const,
        };
    }))).filter((result): result is SearchResult => result !== null);

    const results = options.includeDlc
        ? mapped
        : mapped.filter((result) => !isLikelySteamExtraContent(result.title));
    const enriched = await enrichSteamGridDbImages(fetchJson, results, options.steamGridDb);
    const withPreviewFallback = enriched.map((result) => (
        result.image
            ? result
            : { ...result, image: getSteamLibraryPoster(result.id) }
    ));

    return withHasNext(withPreviewFallback, hasNext);
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
    const data = getSteamAppData(json, id);
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
        workType: inferGameWorkType(data),
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

export async function getSteamDlcForGame(
    fetchJson: JsonFetcher,
    id: string,
    options: { imageExists?: UrlValidator; existing?: GameDlc[] } = {}
): Promise<GameDlc[]> {
    const appId = id.trim();
    if (!appId) return [];

    const data = await fetchSteamBasicAppDetails(fetchJson, appId);
    const dlcIds = getArray(data, 'dlc')
        .map((value) => String(value).trim())
        .filter(Boolean);
    if (!dlcIds.length) return [];

    const existing = new Map((options.existing ?? []).map((entry) => [String(entry.id), entry]));
    const records = await mapWithConcurrency(
        dlcIds.slice(0, 80),
        STEAM_DLC_REQUEST_CONCURRENCY,
        async (dlcId): Promise<GameDlc | null> => {
        const known = existing.get(dlcId) ?? steamDlcCache.get(dlcId);
        if (known?.title) return { ...known, provider: 'steam', id: dlcId };
        const details = await fetchSteamBasicAppDetails(fetchJson, dlcId);
        if (!details) return null;
        const title = getString(details, 'name');
        if (!title) return null;
        const headerImage = getString(details, 'header_image')
            || getString(details, 'capsule_image')
            || getString(details, 'capsule_imagev5');
        // appdetails already returns a verified header image. Probing several
        // CDN candidates for every DLC multiplied refresh time dramatically,
        // especially through Obsidian's paced request queue.
        const poster = headerImage || getSteamLibraryPoster(dlcId);
        const record: GameDlc = {
            id: dlcId,
            provider: 'steam',
            title,
            imageUrl: poster,
            url: `https://store.steampowered.com/app/${dlcId}/`,
            userRating: null,
        };
        steamDlcCache.set(dlcId, record);
        return record;
        }
    );

    return records.filter((record): record is GameDlc => record !== null);
}

async function getFirstExistingUrl(candidates: string[], imageExists?: UrlValidator): Promise<string> {
    if (!imageExists) return '';

    for (const candidate of candidates) {
        try {
            if (await imageExists(candidate)) return candidate;
        } catch {
            // Try the next known Steam image variant.
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

async function fetchSteamBasicAppDetails(fetchJson: JsonFetcher, id: string): Promise<Record<string, unknown> | null> {
    try {
        const url = new URL('https://store.steampowered.com/api/appdetails');
        url.searchParams.set('appids', id);
        url.searchParams.set('filters', 'basic');
        url.searchParams.set('l', 'english');
        url.searchParams.set('cc', 'us');

        const json = asObject(await fetchJson(url.toString()));
        return getSteamAppData(json, id);
    } catch (error) {
        if (isProviderBlockedError(error)) throw error;
        return null;
    }
}

function getSteamAppData(json: Record<string, unknown> | null, id: string): Record<string, unknown> | null {
    const direct = getObject(json, id);
    const directData = getObject(direct, 'data');
    if (direct?.success !== false && directData) return directData;

    // Steam may key an appdetails response by an edition ID while the
    // payload still identifies the requested game. Never use unrelated data.
    for (const value of Object.values(json ?? {})) {
        const result = asObject(value);
        const data = getObject(result, 'data');
        if (result?.success !== false && data && getString(data, 'steam_appid') === id) {
            return data;
        }
    }
    return null;
}

function isLikelySteamExtraContent(title: string): boolean {
    return /\b(dlc|soundtrack|expansion pass|season pass|redkit|bonus content|add-?on)\b/i.test(title);
}

export async function getSteamGallery(fetchJson: JsonFetcher, id: string): Promise<SourceImage[]> {
    if (!/^[1-9]\d*$/.test(id)) return [];
    const params = new URLSearchParams({ appids: id, filters: 'screenshots' });
    const data = getSteamAppData(asObject(await fetchJson(`https://store.steampowered.com/api/appdetails?${params}`)), id);
    return getArray(data, 'screenshots').map(raw => {
        const shot = asObject(raw);
        return { url: getString(shot, 'path_full'), thumbnail: getString(shot, 'path_thumbnail') };
    });
}

export async function getSteamTrailerEntries(fetchJson: JsonFetcher, id: string): Promise<unknown[]> {
    if (!/^[1-9]\d*$/.test(id)) return [];
    const params = new URLSearchParams({ appids: id, filters: 'movies' });
    const data = getSteamAppData(asObject(await fetchJson(`https://store.steampowered.com/api/appdetails?${params}`)), id);
    return getArray(data, 'movies');
}
