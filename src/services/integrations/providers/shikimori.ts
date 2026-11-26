import { asError } from '../../../utils/errors';
import { readAlternativeTitles, selectAlternativeTitles } from '../alternativeTitles';
import { parseEpisodeDuration } from '../../media/watchProgress';
import type { AnimeFormat } from '../../../types';
import { AnimeDetails, IntegrationAnimePart, IntegrationMangaPart, MangaDetails, SearchResult, type SourceImage } from '../types';
import { inferMangaWorkType } from '../../../utils/mangaWorkType';
import { JsonFetcher, asArray, asObject, getArray, getObject, getString, mapAnimeFormat, mapStringList, stripHtml, toStringSafe } from './common';

const SHIKIMORI_PRIMARY_BASE_URL = 'https://shikimori.net';
const SHIKIMORI_LEGACY_IO_BASE_URL = 'https://shikimori.io';
const SHIKIMORI_LEGACY_BASE_URL = 'https://shikimori.one';
const SHIKIMORI_BASE_URLS = [SHIKIMORI_PRIMARY_BASE_URL, SHIKIMORI_LEGACY_IO_BASE_URL, SHIKIMORI_LEGACY_BASE_URL];
const SHIKIMORI_HEADERS = {
    'Accept': 'application/json',
    'User-Agent': 'LOREBASE/1.0 (Obsidian plugin; metadata search)',
};
const SHIKIMORI_GRAPHQL_HEADERS = {
    ...SHIKIMORI_HEADERS,
    'Content-Type': 'application/json',
};

interface SearchPageOptions {
    includeAdult?: boolean;
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

export async function searchShikimori(
    fetchJson: JsonFetcher,
    query: string,
    options: SearchPageOptions = {}
): Promise<SearchResult[]> {
    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.max(1, options.pageSize ?? 10);
    const graphqlResults = await searchShikimoriGraphql(fetchJson, query, page, pageSize, 'anime', options.includeAdult);
    if (Object.prototype.hasOwnProperty.call(graphqlResults, 'hasNext')) return graphqlResults;

    for (const baseUrl of SHIKIMORI_BASE_URLS) {
        const url = new URL(`${baseUrl}/api/animes`);
        url.searchParams.set('search', query);
        url.searchParams.set('limit', String(pageSize));
        url.searchParams.set('page', String(page));
        url.searchParams.set('censored', String(!options.includeAdult));

        let json: unknown;
        try {
            json = await fetchJson(url.toString(), SHIKIMORI_HEADERS);
        } catch {
            continue;
        }
        const results = asArray(json);
        if (!Array.isArray(json)) continue;
        const mapped = results
            .map((item) => mapShikimoriSearchResult(asObject(item), query, 'anime', true))
            .filter((item): item is SearchResult & { sortScore: number } => Boolean(item?.id))
            .sort((a, b) => b.sortScore - a.sortScore)
            .map(({ sortScore, ...item }) => item);
        return withHasNext(mapped, results.length >= pageSize);
    }

    return [];
}

export async function getShikimoriDetails(
    fetchJson: JsonFetcher,
    id: string,
    options: { includeParts?: boolean } = {}
): Promise<AnimeDetails | null> {
    const graphqlDetails = await getShikimoriDetailsGraphql(fetchJson, id, options);
    if (graphqlDetails) return graphqlDetails;

    for (const baseUrl of SHIKIMORI_BASE_URLS) {
        const url = new URL(`${baseUrl}/api/animes/${id}`);
        let item: Record<string, unknown> | null;
        try {
            item = asObject(await fetchJson(url.toString(), SHIKIMORI_HEADERS));
        } catch {
            continue;
        }
        if (!item) continue;

        const tags = mapStringList(
            getArray(item, 'genres'),
            (entry) => getString(asObject(entry), 'russian') || getString(asObject(entry), 'name')
        );
        const studios = mapStringList(getArray(item, 'studios'), (entry) => getString(asObject(entry), 'name'));
        const airedOn = getString(item, 'aired_on');
        const year = airedOn ? airedOn.slice(0, 4) : '';
        const image = getBestImage(getObject(item, 'image'));
        const parts = options.includeParts === false ? [] : await getShikimoriRelatedParts(fetchJson, id, item);

        return {
            kind: 'anime',
            isAdult: /^rx$/.test(getString(item, 'rating').toLowerCase()),
            alternativeTitles: readAlternativeTitles('shikimori', item),
            name: getString(item, 'russian') || getString(item, 'name') || 'Unknown',
            description: cleanShikimoriDescription(getString(item, 'description')),
            image,
            imageHorizontal: image,
            genres: tags,
            tags: [],
            studios,
            year,
            released: airedOn,
            imdbRating: toStringSafe(item.score),
            communityRating: toStringSafe(item.score),
            url: buildShikimoriMediaUrl('anime', id),
            format: mapAnimeFormat(getString(item, 'kind')),
            parts,
        };
    }

    return null;
}

export async function searchShikimoriManga(
    fetchJson: JsonFetcher,
    query: string,
    options: SearchPageOptions = {}
): Promise<SearchResult[]> {
    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.max(1, options.pageSize ?? 10);
    // The legacy /api/mangas catalogue excludes light novels (/api/ranobe).
    // GraphQL searches both in one ranked, paginated list.
    const graphqlResults = await searchShikimoriGraphql(fetchJson, query, page, pageSize, 'manga', options.includeAdult);
    if (Object.prototype.hasOwnProperty.call(graphqlResults, 'hasNext')) return graphqlResults;

    for (const baseUrl of SHIKIMORI_BASE_URLS) {
        const url = new URL(`${baseUrl}/api/mangas`);
        url.searchParams.set('search', query);
        url.searchParams.set('limit', String(pageSize));
        url.searchParams.set('page', String(page));
        url.searchParams.set('censored', String(!options.includeAdult));

        let json: unknown;
        try {
            json = await fetchJson(url.toString(), SHIKIMORI_HEADERS);
        } catch {
            continue;
        }
        const results = asArray(json);
        if (!Array.isArray(json)) continue;
        const mapped = results
            .map((item) => mapShikimoriSearchResult(asObject(item), query, 'manga'))
            .filter((item): item is SearchResult & { sortScore: number } => Boolean(item?.id))
            .sort((a, b) => b.sortScore - a.sortScore)
            .map(({ sortScore, ...item }) => item);
        return withHasNext(mapped, results.length >= pageSize);
    }

    return [];
}

export async function getShikimoriMangaDetails(fetchJson: JsonFetcher, id: string): Promise<MangaDetails | null> {
    for (const baseUrl of SHIKIMORI_BASE_URLS) {
        const url = new URL(`${baseUrl}/api/mangas/${id}`);
        let item: Record<string, unknown> | null;
        try {
            item = asObject(await fetchJson(url.toString(), SHIKIMORI_HEADERS));
        } catch {
            continue;
        }
        if (!item) continue;

        const genres = mapStringList(
            getArray(item, 'genres'),
            (entry) => getString(asObject(entry), 'russian') || getString(asObject(entry), 'name')
        );
        const image = getBestImage(getObject(item, 'image'));
        const chapters = getNumber(item, 'chapters');
        const volumes = getNumber(item, 'volumes');
        const contributors = await getShikimoriMangaContributors(fetchJson, baseUrl, id);
        const released = getString(item, 'aired_on');

        return {
            kind: 'manga',
            alternativeTitles: readAlternativeTitles('shikimori', item),
            workType: inferMangaWorkType(getString(item, 'kind')),
            name: getString(item, 'russian') || getString(item, 'name') || 'Unknown',
            description: cleanShikimoriDescription(getString(item, 'description')),
            poster: image,
            posterHorizontal: image,
            authors: contributors.authors,
            artists: contributors.artists,
            genres,
            year: getShikimoriYear(item),
            released,
            chapters: chapters ? String(chapters) : '',
            volumes: volumes ? String(volumes) : '',
            rating: toStringSafe(item.score),
            communityRating: toStringSafe(item.score),
            url: buildShikimoriMediaUrl('manga', id),
            parts: buildShikimoriMangaParts(volumes, chapters),
        };
    }

    return null;
}

async function searchShikimoriGraphql(fetchJson: JsonFetcher, query: string, page: number, pageSize: number, media: 'anime' | 'manga' = 'anime', includeAdult = false): Promise<SearchResult[]> {
    const collection = media === 'manga' ? 'mangas' : 'animes';
    const gql = `query ($search: String!, $limit: Int!, $page: Int!, $censored: Boolean) {
  ${collection}(search: $search, limit: $limit, page: $page, censored: $censored) {
    isCensored
    id
    malId
    name
    russian
    kind
    score
    status
    airedOn {
      date
      year
    }
    poster {
      originalUrl
      mainUrl
    }
  }
}`;

    for (const baseUrl of SHIKIMORI_BASE_URLS) {
        let json: unknown;
        try {
            json = await fetchJson(
                `${baseUrl}/api/graphql`,
                SHIKIMORI_GRAPHQL_HEADERS,
                'POST',
                JSON.stringify({
                    query: gql,
                    variables: { search: query, limit: pageSize, page, censored: !includeAdult },
                })
            );
        } catch {
            continue;
        }

        const root = asObject(json);
        const data = getObject(root, 'data');
        const results = getArray(data, collection);
        if (!data || !Array.isArray(data[collection])) continue;
        const mapped = results
            .map((item) => mapShikimoriSearchResult(asObject(item), query, media))
            .filter((item): item is SearchResult & { sortScore: number } => Boolean(item?.id))
            .sort((a, b) => b.sortScore - a.sortScore)
            .map(({ sortScore, ...item }) => item);
        return withHasNext(mapped, results.length >= pageSize);
    }

    return [];
}

async function getShikimoriDetailsGraphql(
    fetchJson: JsonFetcher,
    id: string,
    options: { includeParts?: boolean } = {}
): Promise<AnimeDetails | null> {
    const gql = `query ($ids: String!) {
  animes(ids: $ids, limit: 1) {
    id
    name
    russian
    english
    japanese
    synonyms
    description
    kind
    episodes
    duration
    rating
    score
    url
    airedOn {
      date
      year
    }
    poster {
      originalUrl
      mainUrl
    }
    genres {
      name
      russian
    }
    studios {
      name
    }
  }
}`;

    let item: Record<string, unknown> | null = null;
    for (const baseUrl of SHIKIMORI_BASE_URLS) {
        let json: unknown;
        try {
            json = await fetchJson(
                `${baseUrl}/api/graphql`,
                SHIKIMORI_GRAPHQL_HEADERS,
                'POST',
                JSON.stringify({
                    query: gql,
                    variables: { ids: id },
                })
            );
        } catch {
            continue;
        }

        const root = asObject(json);
        const data = getObject(root, 'data');
        item = asObject(getArray(data, 'animes')[0]);
        if (item) break;
    }
    if (!item) return null;

    const tags = mapStringList(
        getArray(item, 'genres'),
        (entry) => getString(asObject(entry), 'russian') || getString(asObject(entry), 'name')
    );
    const studios = mapStringList(getArray(item, 'studios'), (entry) => getString(asObject(entry), 'name'));
    const image = getBestImage(getObject(item, 'poster'));
    const parts = options.includeParts === false ? [] : await getShikimoriRelatedParts(fetchJson, id, item);

    return {
        kind: 'anime',
        isAdult: /^rx$/.test(getString(item, 'rating').toLowerCase()),
        alternativeTitles: readAlternativeTitles('shikimori', item),
        name: getString(item, 'russian') || getString(item, 'name') || 'Unknown',
        description: cleanShikimoriDescription(getString(item, 'description')),
        image,
        imageHorizontal: image,
        genres: tags,
        tags: [],
        studios,
        year: getShikimoriYear(item),
        released: getString(getObject(item, 'airedOn'), 'date'),
        imdbRating: toStringSafe(item.score),
        communityRating: toStringSafe(item.score),
        url: normalizeShikimoriUrl(getString(item, 'url')) || buildShikimoriMediaUrl('anime', id),
        format: mapAnimeFormat(getString(item, 'kind')),
        parts,
    };
}

async function getShikimoriMangaContributors(
    fetchJson: JsonFetcher,
    baseUrl: string,
    id: string
): Promise<{ authors: string[]; artists: string[] }> {
    try {
        const roles = asArray(await fetchJson(`${baseUrl}/api/mangas/${id}/roles`, SHIKIMORI_HEADERS));
        const authors = new Set<string>();
        const artists = new Set<string>();
        for (const rawRole of roles) {
            const roleEntry = asObject(rawRole);
            const person = getObject(roleEntry, 'person');
            const name = getString(person, 'russian') || getString(person, 'name');
            if (!name) continue;
            const roleNames = [
                ...getArray(roleEntry, 'roles').map(toStringSafe),
                ...getArray(roleEntry, 'roles_russian').map(toStringSafe),
            ].join(' ').toLowerCase();
            if (/author|story|writer|автор|сценар/.test(roleNames)) authors.add(name);
            if (/artist|art|illustrat|худож|иллюстрат/.test(roleNames)) artists.add(name);
        }
        return { authors: Array.from(authors), artists: Array.from(artists) };
    } catch {
        return { authors: [], artists: [] };
    }
}

function mapShikimoriSearchResult(record: Record<string, unknown> | null, query: string, media: 'anime' | 'manga' = 'anime', legacy = false): (SearchResult & { sortScore: number }) | null {
    if (!record) return null;

    const image = getBestImage(getObject(record, 'image')) || getBestImage(getObject(record, 'poster'));
    const name = getString(record, 'name');
    const russian = getString(record, 'russian');
    const title = russian || name || 'Unknown';
    const subtitle = name && name !== title ? name : '';
    return {
        id: getString(record, 'id'),
        title,
        subtitle,
        malId: media === 'anime' ? getString(record, 'malId') || (legacy ? getString(record, 'id') : '') || undefined : undefined,
        year: getShikimoriYear(record),
        released: getString(record, 'aired_on') || getString(getObject(record, 'airedOn'), 'date'),
        publicationStatus: media === 'manga' ? getString(record, 'status') : undefined,
        format: media === 'manga' ? undefined : mapAnimeFormat(getString(record, 'kind')),
        ...(media === 'manga' ? { workType: inferMangaWorkType(getString(record, 'kind')), workTypeMedia: 'manga' as const } : {}),
        image,
        provider: 'shikimori' as const,
        isAdult: record.isCensored === true || /^rx$/i.test(getString(record, 'rating')),
        sortScore: getSearchSortScore(record, query, image),
    };
}

function buildShikimoriMangaParts(volumes: number | null, chapters: number | null): IntegrationMangaPart[] {
    if (!volumes || volumes <= 0) return [];
    const perVolume = chapters && chapters > 0 ? Math.ceil(chapters / volumes) : null;
    return Array.from({ length: Math.min(volumes, 200) }, (_, index) => ({
        id: `volume-${index + 1}`,
        kind: 'volume' as const,
        title: `Volume ${index + 1}`,
        volumeNumber: index + 1,
        chapterCurrent: 0,
        chapterTotal: perVolume,
        status: 'planned' as const,
    }));
}

function cleanShikimoriDescription(value: string): string {
    return stripHtml(value)
        .replace(/\[\/?summary[^\]]*\]/gi, '')
        .replace(/\[\/?[a-z][^\]]*\]/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function getBestImage(imageData: Record<string, unknown> | null): string {
    const path = getString(imageData, 'originalUrl')
        || getString(imageData, 'mainUrl')
        || getString(imageData, 'original')
        || getString(imageData, 'preview');
    if (!path || path.includes('/assets/globals/missing_')) return '';
    if (path.startsWith('//')) return `https:${normalizeShikimoriUrl(path)}`;
    if (path.startsWith('http')) return normalizeShikimoriUrl(path);
    return `${SHIKIMORI_PRIMARY_BASE_URL}${path}`;
}

function normalizeShikimoriUrl(url: string): string {
    return url.replace(/^https?:\/\/shikimori\.one/i, SHIKIMORI_PRIMARY_BASE_URL)
        .replace(/^\/\/shikimori\.one/i, `//${new URL(SHIKIMORI_PRIMARY_BASE_URL).host}`)
        .replace(/(shikimori\.(?:net|one|io|me)\/(?:animes|mangas)\/)(?!z)(\d+)/i, '$1z$2');
}

function buildShikimoriMediaUrl(media: 'anime' | 'manga', id: string): string {
    const path = media === 'manga' ? 'mangas' : 'animes';
    return `${SHIKIMORI_PRIMARY_BASE_URL}/${path}/z${encodeURIComponent(id)}`;
}

async function getShikimoriRelatedParts(
    fetchJson: JsonFetcher,
    id: string,
    root: Record<string, unknown>
): Promise<IntegrationAnimePart[]> {
    const byId = new Map<string, Record<string, unknown>>();
    const pending = [id];
    const visited = new Set<string>();
    const maxItems = 24;
    byId.set(id, root);

    while (pending.length && byId.size < maxItems) {
        const currentId = pending.shift();
        if (!currentId || visited.has(currentId)) continue;
        visited.add(currentId);

        const related = await fetchShikimoriRelated(fetchJson, currentId);
        for (const item of related) {
            const relatedId = getString(item, 'id');
            if (!relatedId || visited.has(relatedId) || byId.has(relatedId)) continue;
            byId.set(relatedId, item);
            pending.push(relatedId);
            if (byId.size >= maxItems) break;
        }
    }

    const media = Array.from(byId.values()).sort(compareShikimoriMedia);
    let tvSeason = 0;
    return media.map((item, index) => {
        const kind = mapShikimoriKind(getString(item, 'kind'));
        const seasonNumber = kind === 'tv' ? ++tvSeason : null;
        return {
            id: `shikimori-${getString(item, 'id') || index + 1}`,
            kind,
            title: getString(item, 'russian') || getString(item, 'name') || 'Unknown',
            alternativeTitles: selectAlternativeTitles(readAlternativeTitles('shikimori', item), 'all', getString(item, 'russian') || getString(item, 'name')),
            seasonNumber,
            episodeCurrent: 0,
            episodeTotal: getNumber(item, 'episodes'),
            poster: getBestImage(getObject(item, 'poster')) || getBestImage(getObject(item, 'image')) || null,
            year: Number(getShikimoriYear(item)) || null,
            episodeDuration: parseEpisodeDuration(item.duration),
            releaseDate: getString(item, 'aired_on') || getString(getObject(item, 'airedOn'), 'date'),
            status: 'planned',
        };
    });
}

async function fetchShikimoriRelated(fetchJson: JsonFetcher, id: string): Promise<Record<string, unknown>[]> {
    for (const baseUrl of SHIKIMORI_BASE_URLS) {
        let json: unknown;
        try {
            json = await fetchJson(`${baseUrl}/api/animes/${id}/related`, SHIKIMORI_HEADERS);
        } catch {
            continue;
        }
        const results = asArray(json)
            .map((entry) => getObject(asObject(entry), 'anime'))
            .filter((item): item is Record<string, unknown> => Boolean(item));
        if (results.length) return results;
    }
    return [];
}

function compareShikimoriMedia(a: Record<string, unknown>, b: Record<string, unknown>): number {
    const yearA = Number.parseInt(getShikimoriYear(a), 10);
    const yearB = Number.parseInt(getShikimoriYear(b), 10);
    const safeA = Number.isFinite(yearA) ? yearA : 9999;
    const safeB = Number.isFinite(yearB) ? yearB : 9999;
    if (safeA !== safeB) return safeA - safeB;
    const titleA = getString(a, 'russian') || getString(a, 'name');
    const titleB = getString(b, 'russian') || getString(b, 'name');
    return titleA.localeCompare(titleB);
}

function mapShikimoriKind(kind: string): AnimeFormat {
    const value = kind.toLowerCase();
    if (value === 'movie') return 'movie';
    if (value === 'ova') return 'ova';
    if (value === 'ona') return 'ona';
    if (value === 'special') return 'special';
    return 'tv';
}

function getNumber(source: Record<string, unknown> | null, key: string): number | null {
    if (!source) return null;
    const value = source[key];
    const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) ? parsed : null;
}

function getShikimoriYear(record: Record<string, unknown> | null): string {
    const airedOn = getString(record, 'aired_on');
    if (airedOn) return airedOn.slice(0, 4);

    const graphqlAiredOn = getObject(record, 'airedOn');
    const year = getString(graphqlAiredOn, 'year');
    if (year) return year;

    const date = getString(graphqlAiredOn, 'date');
    return date ? date.slice(0, 4) : '';
}

function getSearchSortScore(record: Record<string, unknown> | null, query: string, image: string): number {
    const normalizedQuery = query.trim().toLowerCase();
    const name = getString(record, 'name').toLowerCase();
    const russian = getString(record, 'russian').toLowerCase();
    const status = getString(record, 'status');
    const score = Number.parseFloat(getString(record, 'score')) || 0;
    const airedYear = Number.parseInt(getShikimoriYear(record), 10);

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

async function getShikimoriMediaList(fetchJson: JsonFetcher, id: string, kind: 'screenshots' | 'videos'): Promise<{ base: string; rows: unknown[] }> {
    const empty = { base: SHIKIMORI_PRIMARY_BASE_URL, rows: [] };
    if (!/^[1-9]\d*$/.test(id)) return empty;
    let failure: unknown;
    for (const base of SHIKIMORI_BASE_URLS) {
        try {
            const data = await fetchJson(`${base}/api/animes/${id}/${kind}`, SHIKIMORI_HEADERS);
            if (Array.isArray(data)) return { base, rows: data };
        } catch (error) {
            failure = error;
        }
    }
    if (failure) throw asError(failure);
    return empty;
}

export async function getShikimoriGallery(fetchJson: JsonFetcher, id: string): Promise<SourceImage[]> {
    const { base, rows } = await getShikimoriMediaList(fetchJson, id, 'screenshots');
    const resolve = (path: string): string => {
        try { return path ? new URL(path, base).href : ''; } catch { return ''; }
    };
    return rows.map(raw => {
        const image = asObject(raw);
        return { url: resolve(getString(image, 'original')), thumbnail: resolve(getString(image, 'preview')) };
    });
}

export async function getShikimoriTrailerEntries(fetchJson: JsonFetcher, id: string): Promise<unknown[]> {
    return (await getShikimoriMediaList(fetchJson, id, 'videos')).rows;
}
