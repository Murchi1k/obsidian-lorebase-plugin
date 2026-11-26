import { readAlternativeTitles } from '../alternativeTitles';
import { IntegrationMangaPart, MangaDetails, SearchResult } from '../types';
import { inferMangaWorkType } from '../../../utils/mangaWorkType';
import { JsonFetcher, asObject, getArray, getObject, getString, mapStringList, stripHtml } from './common';
import { isProviderBlockedError } from '../shared';
import { MANGADEX_HEADERS } from '../mangadexRequest';
export { MANGADEX_HEADERS } from '../mangadexRequest';

interface MangaDexOptions {
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

export async function searchMangaDex(
    fetchJson: JsonFetcher,
    query: string,
    options: MangaDexOptions = {}
): Promise<SearchResult[]> {
    if (!query.trim()) return [];
    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.max(1, options.pageSize ?? 10);
    const url = buildMangaDexUrl('/manga', {
        title: query.trim(),
        'contentRating[]': options.includeAdult ? ['safe', 'suggestive', 'erotica', 'pornographic'] : ['safe', 'suggestive'],
        'order[relevance]': 'desc',
        limit: String(Math.min(pageSize, 100)),
        offset: String((page - 1) * pageSize),
        'includes[]': ['cover_art', 'author', 'artist'],
    });

    const root = asObject(await fetchJson(url, MANGADEX_HEADERS));
    const data = getArray(root, 'data');
    const mapped = await Promise.all(data.map(async (entry) => {
        const item = asObject(entry);
        const attributes = getObject(item, 'attributes');
        const title = pickLocalized(getObject(attributes, 'title')) || 'Untitled';
        const cover = await getCoverUrl(fetchJson, item);
        return {
            id: getString(item, 'id'),
            title,
            publicationStatus: getString(attributes, 'status'),
            provider: 'mangadex' as const,
            isAdult: ['erotica', 'pornographic'].includes(getString(attributes, 'contentRating')),
            image: cover,
            year: getString(attributes, 'year'),
            workType: getMangaDexWorkType(attributes),
            workTypeMedia: 'manga' as const,
        };
    }));
    const filtered = mapped.filter((item) => item.id && item.title);

    const total = Number(root?.total);
    const offset = Number(root?.offset);
    const limit = Number(root?.limit);
    const hasNext = Number.isFinite(total) && Number.isFinite(offset) && Number.isFinite(limit)
        ? offset + limit < total
        : filtered.length >= pageSize;
    return withHasNext(filtered, hasNext);
}

export async function getMangaDexDetails(fetchJson: JsonFetcher, id: string): Promise<MangaDetails | null> {
    if (!id) return null;
    const root = asObject(await fetchJson(buildMangaDexUrl(`/manga/${encodeURIComponent(id)}`, {
        'includes[]': ['cover_art', 'author', 'artist'],
    }), MANGADEX_HEADERS));
    const item = getObject(root, 'data');
    if (!item) return null;

    const attributes = getObject(item, 'attributes');
    const cover = await getCoverUrl(fetchJson, item);
    const relationships = getArray(item, 'relationships');
    const authors = relationshipNames(relationships, 'author');
    const artists = relationshipNames(relationships, 'artist');
    const tags = mapStringList(getArray(attributes, 'tags'), (entry) => pickLocalized(getObject(getObject(asObject(entry), 'attributes'), 'name')));
    const parts = await fetchMangaDexAggregate(fetchJson, id);
    const title = pickLocalized(getObject(attributes, 'title')) || 'Untitled';

    return {
        kind: 'manga',
        alternativeTitles: readAlternativeTitles('mangadex', attributes),
        workType: getMangaDexWorkType(attributes),
        name: title,
        description: stripHtml(pickLocalized(getObject(attributes, 'description'))),
        poster: cover,
        posterHorizontal: cover,
        authors,
        artists,
        genres: tags,
        year: getString(attributes, 'year'),
        chapters: sumChapters(parts),
        volumes: parts.length ? String(parts.length) : '',
        rating: '',
        url: `https://mangadex.org/title/${id}`,
        parts,
    };
}

/** Use a larger cover only when MangaDex explicitly links to this MangaUpdates record. */
export async function findMangaDexCoverForMangaUpdates(fetchJson: JsonFetcher, id: string, title: string): Promise<string> {
    if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0 || !title.trim()) return '';
    const identities = new Set([id, Number(id).toString(36)]);
    const root = asObject(await fetchJson(buildMangaDexUrl('/manga', {
        title: title.trim(), limit: '10', 'order[relevance]': 'desc',
        'includes[]': ['cover_art'],
        'contentRating[]': ['safe', 'suggestive', 'erotica', 'pornographic'],
    }), MANGADEX_HEADERS));
    const match = getArray(root, 'data').map(asObject).find(item => {
        let link = getString(getObject(getObject(item, 'attributes'), 'links'), 'mu').trim();
        if (/^https?:\/\//i.test(link)) {
            try {
                const url = new URL(link);
                if (!['mangaupdates.com', 'www.mangaupdates.com'].includes(url.hostname)) return false;
                link = url.searchParams.get('id') || url.pathname.match(/^\/series\/([^/]+)/)?.[1] || '';
            } catch { return false; }
        }
        return identities.has(link.toLowerCase());
    });
    if (!match) return '';
    // Store the original in the note; the preview can use a smaller CDN rendition.
    return (await getCoverUrl(fetchJson, match)).replace(/\.512\.jpg$/i, '');
}

async function fetchMangaDexAggregate(fetchJson: JsonFetcher, id: string): Promise<IntegrationMangaPart[]> {
    const root = asObject(await fetchJson(buildMangaDexUrl(`/manga/${encodeURIComponent(id)}/aggregate`, {
        'translatedLanguage[]': ['en'],
    }), MANGADEX_HEADERS));
    const volumes = getObject(root, 'volumes');
    if (!volumes) return [];

    return Object.entries(volumes)
        .map(([volumeKey, raw], index) => {
            const volume = asObject(raw);
            const chapterCount = countAggregateChapters(volume);
            const volumeNumber = parseVolumeNumber(volumeKey) ?? index + 1;
            return {
                id: `volume-${volumeKey || index + 1}`,
                kind: 'volume' as const,
                title: volumeKey && volumeKey !== 'none' ? `Volume ${volumeKey}` : 'No Volume',
                volumeNumber,
                chapterCurrent: 0,
                chapterTotal: chapterCount,
                status: 'planned' as const,
            };
        })
        .sort((a, b) => (a.volumeNumber ?? 9999) - (b.volumeNumber ?? 9999));
}

function countAggregateChapters(volume: Record<string, unknown> | null): number | null {
    const chapters = getObject(volume, 'chapters');
    if (!chapters) return null;
    const count = Object.keys(chapters).length;
    return count > 0 ? count : null;
}

function sumChapters(parts: IntegrationMangaPart[]): string {
    const total = parts.reduce((sum, part) => sum + (part.chapterTotal ?? 0), 0);
    return total > 0 ? String(total) : '';
}

async function getCoverUrl(fetchJson: JsonFetcher, item: Record<string, unknown> | null): Promise<string> {
    const id = getString(item, 'id');
    if (!id) return '';
    const inlineFileName = getInlineCoverFileName(item);
    if (inlineFileName) return buildCoverUrl(id, inlineFileName);

    const fallbackFileName = await fetchCoverFileName(fetchJson, id);
    return fallbackFileName ? buildCoverUrl(id, fallbackFileName) : '';
}

function getInlineCoverFileName(item: Record<string, unknown> | null): string {
    const cover = getArray(item, 'relationships')
        .map((relationship) => asObject(relationship))
        .find((relationship) => getString(relationship, 'type') === 'cover_art');
    return getString(getObject(cover ?? null, 'attributes'), 'fileName');
}

async function fetchCoverFileName(fetchJson: JsonFetcher, mangaId: string): Promise<string> {
    try {
        const root = asObject(await fetchJson(buildMangaDexUrl('/cover', {
            'manga[]': mangaId,
            limit: '12',
            'order[volume]': 'asc',
        }), MANGADEX_HEADERS));
        const covers = getArray(root, 'data')
            .map((entry) => asObject(entry))
            .filter((entry): entry is Record<string, unknown> => Boolean(entry));
        const preferred = covers.find((cover) => ['en', 'ja'].includes(getString(getObject(cover, 'attributes'), 'locale')))
            ?? covers.find((cover) => getString(getObject(cover, 'attributes'), 'fileName'))
            ?? null;
        return getString(getObject(preferred, 'attributes'), 'fileName');
    } catch (error) {
        if (isProviderBlockedError(error)) throw error;
        return '';
    }
}

function buildCoverUrl(mangaId: string, fileName: string): string {
    return `https://uploads.mangadex.org/covers/${mangaId}/${fileName}.512.jpg`;
}

function getMangaDexWorkType(attributes: Record<string, unknown> | null): string {
    const formats = getArray(attributes, 'tags').map(raw => getObject(asObject(raw), 'attributes'))
        .filter(tag => getString(tag, 'group') === 'format')
        .map(tag => getString(getObject(tag, 'name'), 'en'));
    return inferMangaWorkType(formats.join(' '), getString(attributes, 'originalLanguage'));
}

function relationshipNames(relationships: unknown[], type: string): string[] {
    return mapStringList(relationships, (entry) => {
        const relationship = asObject(entry);
        if (getString(relationship, 'type') !== type) return '';
        return getString(getObject(relationship, 'attributes'), 'name');
    });
}

function pickLocalized(value: Record<string, unknown> | null): string {
    if (!value) return '';
    return getString(value, 'en')
        || getString(value, 'ja-ro')
        || getString(value, 'ja')
        || Object.values(value).map((entry) => String(entry).trim()).find(Boolean)
        || '';
}

function parseVolumeNumber(value: string): number | null {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function buildMangaDexUrl(path: string, params: Record<string, string | string[]>): string {
    const url = new URL(`https://api.mangadex.org${path}`);
    for (const [key, value] of Object.entries(params)) {
        if (Array.isArray(value)) {
            for (const entry of value) url.searchParams.append(key, entry);
        } else {
            url.searchParams.set(key, value);
        }
    }
    return url.toString();
}
