import { IntegrationMangaPart, MangaDetails, SearchResult } from '../types';
import { JsonFetcher, asObject, getArray, getObject, getString, mapStringList, stripHtml } from './common';

interface MangaDexOptions {
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
        title: query,
        limit: String(Math.min(pageSize, 100)),
        offset: String((page - 1) * pageSize),
        'includes[]': ['cover_art', 'author', 'artist'],
    });

    const root = asObject(await fetchJson(url));
    const data = getArray(root, 'data');
    const mapped = await Promise.all(data.map(async (entry) => {
        const item = asObject(entry);
        const attributes = getObject(item, 'attributes');
        const title = pickLocalized(getObject(attributes, 'title')) || 'Untitled';
        const cover = await getCoverUrl(fetchJson, item);
        return {
            id: getString(item, 'id'),
            title,
            subtitle: getString(attributes, 'status'),
            provider: 'mangadex' as const,
            image: cover,
            year: getString(attributes, 'year'),
            format: 'Manga / MangaDex',
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
    })));
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

async function fetchMangaDexAggregate(fetchJson: JsonFetcher, id: string): Promise<IntegrationMangaPart[]> {
    const root = asObject(await fetchJson(buildMangaDexUrl(`/manga/${encodeURIComponent(id)}/aggregate`, {
        'translatedLanguage[]': ['en'],
    })));
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
        })));
        const covers = getArray(root, 'data')
            .map((entry) => asObject(entry))
            .filter((entry): entry is Record<string, unknown> => Boolean(entry));
        const preferred = covers.find((cover) => ['en', 'ja'].includes(getString(getObject(cover, 'attributes'), 'locale')))
            ?? covers.find((cover) => getString(getObject(cover, 'attributes'), 'fileName'))
            ?? null;
        return getString(getObject(preferred, 'attributes'), 'fileName');
    } catch {
        return '';
    }
}

function buildCoverUrl(mangaId: string, fileName: string): string {
    return `https://uploads.mangadex.org/covers/${mangaId}/${fileName}.512.jpg`;
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
