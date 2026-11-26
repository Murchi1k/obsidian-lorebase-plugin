import { readAlternativeTitles } from '../alternativeTitles';
import { IntegrationMangaPart, MangaDetails, SearchResult } from '../types';
import { inferMangaWorkType } from '../../../utils/mangaWorkType';
import {
    JsonFetcher,
    asObject,
    getArray,
    getObject,
    getString,
    mapStringList,
} from './common';

interface MangaUpdatesOptions {
    page?: number;
    pageSize?: number;
}

type CacheEntry<T> = {
    expiresAt: number;
    value: T;
};

const API_ROOT = 'https://api.mangaupdates.com/v1';
const API_PAGE_SIZE = 25;
const SEARCH_CACHE_TTL_MS = 20 * 60_000;
const DETAILS_CACHE_TTL_MS = 24 * 60 * 60_000;
const MAX_SEARCH_CACHE_ENTRIES = 80;
const MAX_DETAILS_CACHE_ENTRIES = 200;

const searchPageCache = new Map<string, CacheEntry<Record<string, unknown>>>();
const detailsCache = new Map<string, CacheEntry<MangaDetails>>();
const searchPageRequests = new Map<string, Promise<Record<string, unknown> | null>>();
const detailsRequests = new Map<string, Promise<MangaDetails | null>>();

function withHasNext<T>(items: T[], hasNext: boolean): T[] {
    Object.defineProperty(items, 'hasNext', {
        value: hasNext,
        enumerable: false,
        configurable: true,
    });
    return items;
}

export async function searchMangaUpdates(
    fetchJson: JsonFetcher,
    query: string,
    options: MangaUpdatesOptions = {}
): Promise<SearchResult[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return [];

    if (/^\d+$/.test(normalizedQuery)) {
        const details = await getMangaUpdatesDetails(fetchJson, normalizedQuery);
        if (!details) return [];
        return withHasNext([{
            id: normalizedQuery,
            title: details.name,
            subtitle: details.authors.join(', '),
            provider: 'mangaupdates',
            image: details.poster,
            year: details.year,
            publicationStatus: details.publicationStatus,
            isAdult: details.isAdult,
            workType: details.workType, workTypeMedia: 'manga',
        }], false);
    }

    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.max(1, options.pageSize ?? 10);
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const firstApiPage = Math.floor(start / API_PAGE_SIZE) + 1;
    const lastApiPage = Math.floor(Math.max(start, end - 1) / API_PAGE_SIZE) + 1;
    const records: unknown[] = [];
    let totalHits = 0;

    for (let apiPage = firstApiPage; apiPage <= lastApiPage; apiPage++) {
        const root = await fetchSearchPage(fetchJson, normalizedQuery, apiPage);
        if (!root) continue;
        totalHits = Math.max(totalHits, toNonNegativeInteger(root.total_hits));
        records.push(...getArray(root, 'results'));
    }

    const offsetWithinFirstPage = start - ((firstApiPage - 1) * API_PAGE_SIZE);
    const selected = records.slice(offsetWithinFirstPage, offsetWithinFirstPage + pageSize);
    const mapped = selected
        .map(mapSearchResult)
        .filter((item): item is SearchResult => Boolean(item));
    const hasNext = totalHits > end || (totalHits === 0 && selected.length >= pageSize);
    return withHasNext(mapped, hasNext);
}

export async function getMangaUpdatesDetails(
    fetchJson: JsonFetcher,
    id: string
): Promise<MangaDetails | null> {
    const normalizedId = id.trim();
    if (!normalizedId) return null;

    const cached = getCached(detailsCache, normalizedId);
    if (cached) return cached;

    const existingRequest = detailsRequests.get(normalizedId);
    if (existingRequest) return existingRequest;

    const request = (async (): Promise<MangaDetails | null> => {
        const item = asObject(await fetchJson(
            `${API_ROOT}/series/${encodeURIComponent(normalizedId)}`,
            mangaUpdatesHeaders()
        ));
        if (!item) return null;

        const details = mapDetails(item);
        if (!details) return null;
        setCached(detailsCache, normalizedId, details, DETAILS_CACHE_TTL_MS, MAX_DETAILS_CACHE_ENTRIES);
        return details;
    })();
    detailsRequests.set(normalizedId, request);
    try {
        return await request;
    } finally {
        detailsRequests.delete(normalizedId);
    }
}

async function fetchSearchPage(
    fetchJson: JsonFetcher,
    query: string,
    page: number
): Promise<Record<string, unknown> | null> {
    const cacheKey = `${query.toLowerCase()}|${page}`;
    const cached = getCached(searchPageCache, cacheKey);
    if (cached) return cached;

    const existingRequest = searchPageRequests.get(cacheKey);
    if (existingRequest) return existingRequest;

    const request = (async (): Promise<Record<string, unknown> | null> => {
        const root = asObject(await fetchJson(
            `${API_ROOT}/series/search`,
            mangaUpdatesHeaders(true),
            'POST',
            JSON.stringify({
                search: query,
                page,
                perpage: API_PAGE_SIZE,
            })
        ));
        if (!root) return null;
        setCached(searchPageCache, cacheKey, root, SEARCH_CACHE_TTL_MS, MAX_SEARCH_CACHE_ENTRIES);
        return root;
    })();
    searchPageRequests.set(cacheKey, request);
    try {
        return await request;
    } finally {
        searchPageRequests.delete(cacheKey);
    }
}

function mapSearchResult(entry: unknown): SearchResult | null {
    const result = asObject(entry);
    const record = getObject(result, 'record');
    const id = getString(record, 'series_id');
    const title = getString(record, 'title') || getString(result, 'hit_title');
    if (!id || !title) return null;

    const hitTitle = getString(result, 'hit_title');
    return {
        id,
        title,
        subtitle: hitTitle && hitTitle !== title ? hitTitle : '',
        provider: 'mangaupdates',
        isAdult: getArray(record, 'genres').some(entry => ['adult', 'hentai'].includes(getString(asObject(entry), 'genre').toLowerCase())),
        image: getImageUrl(record),
        year: getString(record, 'year'),
        publicationStatus: getString(record, 'status') || getCached(detailsCache, id)?.publicationStatus,
        workType: getString(record, 'type') ? inferMangaWorkType(getString(record, 'type')) : undefined,
        workTypeMedia: 'manga',
    };
}

function mapDetails(item: Record<string, unknown>): MangaDetails | null {
    const id = getString(item, 'series_id');
    const name = getString(item, 'title');
    if (!id || !name) return null;

    const authors = getArray(item, 'authors');
    const writers = uniqueStrings(mapStringList(authors, (entry) => {
        const author = asObject(entry);
        return getString(author, 'type').toLowerCase() === 'author'
            ? getString(author, 'name')
            : '';
    }));
    const artists = uniqueStrings(mapStringList(authors, (entry) => {
        const author = asObject(entry);
        return getString(author, 'type').toLowerCase() === 'artist'
            ? getString(author, 'name')
            : '';
    }));
    const genres = uniqueStrings(mapStringList(getArray(item, 'genres'), (entry) => (
        getString(asObject(entry), 'genre')
    )));
    const chapters = getString(item, 'latest_chapter');
    const volumes = readVolumeCount(getString(item, 'status'));
    const rating = getString(item, 'bayesian_rating');

    return {
        kind: 'manga',
        publicationStatus: item.completed === true ? 'completed' : getString(item, 'status'),
        alternativeTitles: readAlternativeTitles('mangaupdates', item),
        workType: inferMangaWorkType(getString(item, 'type')),
        name,
        description: getString(item, 'description').trim(),
        poster: getImageUrl(item),
        posterHorizontal: getImageUrl(item),
        authors: writers,
        artists,
        genres,
        isAdult: genres.some((genre) => ['adult', 'hentai'].includes(genre.toLowerCase())),
        year: getString(item, 'year'),
        chapters,
        volumes,
        rating,
        communityRating: rating,
        communityVotes: getString(item, 'rating_votes'),
        url: getString(item, 'url') || `https://www.mangaupdates.com/series.html?id=${id}`,
        parts: buildParts(volumes, chapters),
    };
}

function buildParts(volumesValue: string, chaptersValue: string): IntegrationMangaPart[] {
    const volumes = Number.parseInt(volumesValue, 10);
    const chapters = Number.parseInt(chaptersValue, 10);
    if (!Number.isFinite(volumes) || volumes <= 0) return [];
    const chaptersPerVolume = Number.isFinite(chapters) && chapters > 0
        ? Math.ceil(chapters / volumes)
        : null;

    return Array.from({ length: volumes }, (_, index) => ({
        id: `volume-${index + 1}`,
        kind: 'volume',
        title: `Volume ${index + 1}`,
        volumeNumber: index + 1,
        chapterCurrent: 0,
        chapterTotal: chaptersPerVolume,
        status: 'planned',
    }));
}

function readVolumeCount(status: string): string {
    const match = status.match(/\b(\d+)\s+Volumes?\b/i);
    return match?.[1] ?? '';
}

function getImageUrl(item: Record<string, unknown> | null): string {
    const urls = getObject(getObject(item, 'image'), 'url');
    const original = getString(urls, 'original');
    if (original) return original;
    const thumbnail = getString(urls, 'thumb');
    try {
        const url = new URL(thumbnail);
        if (url.hostname === 'cdn.mangaupdates.com') url.pathname = url.pathname.replace(/^\/image\/thumb\//, '/image/');
        return url.toString();
    } catch { return thumbnail; }
}

function mangaUpdatesHeaders(includeJsonBody = false): Record<string, string> {
    return {
        'Accept': 'application/json',
        ...(includeJsonBody ? { 'Content-Type': 'application/json' } : {}),
    };
}

function uniqueStrings(values: string[]): string[] {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function toNonNegativeInteger(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
    const entry = cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
        cache.delete(key);
        return null;
    }
    return entry.value;
}

function setCached<T>(
    cache: Map<string, CacheEntry<T>>,
    key: string,
    value: T,
    ttlMs: number,
    maxEntries: number
): void {
    cache.delete(key);
    cache.set(key, { expiresAt: Date.now() + ttlMs, value });
    while (cache.size > maxEntries) {
        let oldestKey: string | undefined;
        for (const cacheKey of cache.keys()) {
            oldestKey = cacheKey;
            break;
        }
        if (!oldestKey) break;
        cache.delete(oldestKey);
    }
}

export function resetMangaUpdatesCachesForTests(): void {
    searchPageCache.clear();
    detailsCache.clear();
    searchPageRequests.clear();
    detailsRequests.clear();
}
