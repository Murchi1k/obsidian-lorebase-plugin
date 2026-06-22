import type { AnimeFormat } from '../../../types';
import { AnimeDetails, IntegrationAnimePart, SearchResult } from '../types';
import { JsonFetcher, asArray, asObject, getArray, getObject, getString, mapAnimeFormat, mapStringList, stripHtml, toStringSafe } from './common';

const SHIKIMORI_PRIMARY_BASE_URL = 'https://shikimori.io';
const SHIKIMORI_LEGACY_BASE_URL = 'https://shikimori.one';
const SHIKIMORI_BASE_URLS = [SHIKIMORI_PRIMARY_BASE_URL, SHIKIMORI_LEGACY_BASE_URL];
const SHIKIMORI_HEADERS = {
    'Accept': 'application/json',
    'User-Agent': 'LOREBASE/1.0 (Obsidian plugin; metadata search)',
};
const SHIKIMORI_GRAPHQL_HEADERS = {
    ...SHIKIMORI_HEADERS,
    'Content-Type': 'application/json',
};

export async function searchShikimori(fetchJson: JsonFetcher, query: string): Promise<SearchResult[]> {
    const graphqlResults = await searchShikimoriGraphql(fetchJson, query);
    if (graphqlResults.length) return graphqlResults;

    for (const baseUrl of SHIKIMORI_BASE_URLS) {
        const url = new URL(`${baseUrl}/api/animes`);
        url.searchParams.set('search', query);
        url.searchParams.set('limit', '20');

        const json = await fetchJson(url.toString(), SHIKIMORI_HEADERS);
        const results = asArray(json);
        if (results.length) {
            return results
                .map((item) => mapShikimoriSearchResult(asObject(item), query))
                .filter((item): item is SearchResult & { sortScore: number } => Boolean(item?.id))
                .sort((a, b) => b.sortScore - a.sortScore)
                .slice(0, 10)
                .map(({ sortScore, ...item }) => item);
        }
    }

    return [];
}

export async function getShikimoriDetails(fetchJson: JsonFetcher, id: string): Promise<AnimeDetails | null> {
    const graphqlDetails = await getShikimoriDetailsGraphql(fetchJson, id);
    if (graphqlDetails) return graphqlDetails;

    for (const baseUrl of SHIKIMORI_BASE_URLS) {
        const url = new URL(`${baseUrl}/api/animes/${id}`);
        const item = asObject(await fetchJson(url.toString(), SHIKIMORI_HEADERS));
        if (!item) continue;

        const tags = mapStringList(
            getArray(item, 'genres'),
            (entry) => getString(asObject(entry), 'russian') || getString(asObject(entry), 'name')
        );
        const studios = mapStringList(getArray(item, 'studios'), (entry) => getString(asObject(entry), 'name'));
        const airedOn = getString(item, 'aired_on');
        const year = airedOn ? airedOn.slice(0, 4) : '';
        const image = getBestImage(getObject(item, 'image'));
        const parts = await getShikimoriRelatedParts(fetchJson, id, item);

        return {
            name: getString(item, 'russian') || getString(item, 'name') || 'Unknown',
            description: stripHtml(getString(item, 'description')),
            image,
            imageHorizontal: image,
            tags,
            studios,
            year,
            imdbRating: toStringSafe(item.score),
            url: `${SHIKIMORI_PRIMARY_BASE_URL}/animes/${id}`,
            format: mapAnimeFormat(getString(item, 'kind')),
            parts,
        };
    }

    return null;
}

async function searchShikimoriGraphql(fetchJson: JsonFetcher, query: string): Promise<SearchResult[]> {
    const gql = `query ($search: String!, $limit: Int!) {
  animes(search: $search, limit: $limit) {
    id
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
        const json = await fetchJson(
            `${baseUrl}/api/graphql`,
            SHIKIMORI_GRAPHQL_HEADERS,
            'POST',
            JSON.stringify({
                query: gql,
                variables: { search: query, limit: 20 },
            })
        );

        const root = asObject(json);
        const data = getObject(root, 'data');
        const results = getArray(data, 'animes');
        if (results.length) {
            return results
                .map((item) => mapShikimoriSearchResult(asObject(item), query))
                .filter((item): item is SearchResult & { sortScore: number } => Boolean(item?.id))
                .sort((a, b) => b.sortScore - a.sortScore)
                .slice(0, 10)
                .map(({ sortScore, ...item }) => item);
        }
    }

    return [];
}

async function getShikimoriDetailsGraphql(fetchJson: JsonFetcher, id: string): Promise<AnimeDetails | null> {
    const gql = `query ($ids: String!) {
  animes(ids: $ids, limit: 1) {
    id
    name
    russian
    description
    kind
    episodes
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
        const json = await fetchJson(
            `${baseUrl}/api/graphql`,
            SHIKIMORI_GRAPHQL_HEADERS,
            'POST',
            JSON.stringify({
                query: gql,
                variables: { ids: id },
            })
        );

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
    const parts = await getShikimoriRelatedParts(fetchJson, id, item);

    return {
        name: getString(item, 'russian') || getString(item, 'name') || 'Unknown',
        description: stripHtml(getString(item, 'description')),
        image,
        imageHorizontal: image,
        tags,
        studios,
        year: getShikimoriYear(item),
        imdbRating: toStringSafe(item.score),
        url: normalizeShikimoriUrl(getString(item, 'url')) || `${SHIKIMORI_PRIMARY_BASE_URL}/animes/${id}`,
        format: mapAnimeFormat(getString(item, 'kind')),
        parts,
    };
}

function mapShikimoriSearchResult(record: Record<string, unknown> | null, query: string): (SearchResult & { sortScore: number }) | null {
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
        year: getShikimoriYear(record),
        format: mapAnimeFormat(getString(record, 'kind')),
        image,
        provider: 'shikimori' as const,
        sortScore: getSearchSortScore(record, query, image),
    };
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
        .replace(/^\/\/shikimori\.one/i, `//${new URL(SHIKIMORI_PRIMARY_BASE_URL).host}`);
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
            seasonNumber,
            episodeCurrent: 0,
            episodeTotal: getNumber(item, 'episodes'),
            status: 'planned',
        };
    });
}

async function fetchShikimoriRelated(fetchJson: JsonFetcher, id: string): Promise<Record<string, unknown>[]> {
    for (const baseUrl of SHIKIMORI_BASE_URLS) {
        const json = await fetchJson(`${baseUrl}/api/animes/${id}/related`, SHIKIMORI_HEADERS);
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
