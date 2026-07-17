import { requestUrl } from 'obsidian';
import { MangaDetails, SearchResult } from '../types';
import { JsonFetcher, asObject, getArray, getObject, getString, mapStringList, stripHtml } from './common';

interface JikanOptions {
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

export async function searchJikanManga(
    fetchJson: JsonFetcher,
    query: string,
    options: JikanOptions = {}
): Promise<SearchResult[]> {
    if (!query.trim()) return [];
    if (/^\d+$/.test(query.trim())) {
        const details = await getJikanMangaDetails(fetchJson, query.trim());
        if (!details) return [];
        return withHasNext([{
            id: query.trim(),
            title: details.name,
            subtitle: details.authors.join(', '),
            provider: 'jikan' as const,
            image: details.poster,
            year: details.year,
            format: 'Manga / Jikan',
        }], false);
    }
    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.max(1, options.pageSize ?? 10);
    const url = new URL('https://api.jikan.moe/v4/manga');
    url.searchParams.set('q', query);
    url.searchParams.set('page', String(page));
    url.searchParams.set('limit', String(Math.min(pageSize, 25)));
    url.searchParams.set('sfw', 'true');

    const root = await fetchJikanJson(fetchJson, url.toString());
    if (!root) return searchMyAnimeListManga(query, pageSize);
    const data = getArray(root, 'data');
    if (!data.length) return searchMyAnimeListManga(query, pageSize);

    const mapped = data.map((entry) => {
        const item = asObject(entry);
        const images = getObject(getObject(item, 'images'), 'jpg') || getObject(getObject(item, 'images'), 'webp');
        return {
            id: getString(item, 'mal_id'),
            title: getString(item, 'title') || getString(item, 'title_english') || 'Untitled',
            subtitle: getString(item, 'title_japanese'),
            provider: 'jikan' as const,
            image: getString(images, 'large_image_url') || getString(images, 'image_url'),
            year: getJikanYear(item),
            format: getString(item, 'type') || 'Manga / Jikan',
        };
    }).filter((item) => item.id && item.title);

    const pagination = getObject(root, 'pagination');
    return withHasNext(mapped, Boolean(pagination?.has_next_page));
}

export async function getJikanMangaDetails(fetchJson: JsonFetcher, id: string): Promise<MangaDetails | null> {
    if (!id) return null;
    const root = await fetchJikanJson(fetchJson, `https://api.jikan.moe/v4/manga/${encodeURIComponent(id)}`);
    if (!root) return null;
    const item = getObject(root, 'data');
    if (!item) return null;

    const images = getObject(getObject(item, 'images'), 'jpg') || getObject(getObject(item, 'images'), 'webp');
    const authors = mapStringList(getArray(item, 'authors'), (entry) => getString(asObject(entry), 'name'));
    const genres = [
        ...mapStringList(getArray(item, 'genres'), (entry) => getString(asObject(entry), 'name')),
        ...mapStringList(getArray(item, 'themes'), (entry) => getString(asObject(entry), 'name')),
        ...mapStringList(getArray(item, 'demographics'), (entry) => getString(asObject(entry), 'name')),
    ];

    return {
        kind: 'manga',
        name: getString(item, 'title') || getString(item, 'title_english') || 'Untitled',
        description: stripHtml(getString(item, 'synopsis')),
        poster: getString(images, 'large_image_url') || getString(images, 'image_url'),
        posterHorizontal: getString(images, 'large_image_url') || getString(images, 'image_url'),
        authors,
        artists: [],
        genres: Array.from(new Set(genres)),
        year: getJikanYear(item),
        chapters: getString(item, 'chapters'),
        volumes: getString(item, 'volumes'),
        rating: getString(item, 'score'),
        url: getString(item, 'url'),
        parts: buildJikanParts(item),
    };
}

function jikanHeaders(): Record<string, string> {
    return {
        'Accept': 'application/json',
        'User-Agent': 'LOREBASE Obsidian plugin',
    };
}

async function fetchJikanJson(fetchJson: JsonFetcher, url: string): Promise<Record<string, unknown> | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
        let root: Record<string, unknown> | null = null;
        try {
            root = asObject(await fetchJson(url, jikanHeaders()));
        } catch {
            root = null;
        }
        if (root && !isTransientJikanFailure(root)) {
            return root;
        }
        if (attempt === 0) {
            await delay(900);
        }
    }
    return null;
}

function isTransientJikanFailure(root: Record<string, unknown>): boolean {
    const status = Number(root.status);
    return status === 429 || status >= 500;
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => window.setTimeout(resolve, ms));
}

async function searchMyAnimeListManga(query: string, pageSize: number): Promise<SearchResult[]> {
    try {
        const url = new URL('https://myanimelist.net/manga.php');
        url.searchParams.set('q', query);
        url.searchParams.set('cat', 'manga');
        const response = await requestUrl({
            url: url.toString(),
            method: 'GET',
            headers: {
                'Accept': 'text/html,application/xhtml+xml',
                'User-Agent': 'Mozilla/5.0 LOREBASE Obsidian plugin',
            },
        });
        return parseMyAnimeListMangaSearch(response.text ?? '', pageSize);
    } catch {
        return [];
    }
}

function parseMyAnimeListMangaSearch(html: string, pageSize: number): SearchResult[] {
    const results: SearchResult[] = [];
    const seen = new Set<string>();
    const rows = html.split(/<tr\b/i);
    for (const row of rows) {
        if (!row.includes('data-l-content-type="manga"')) continue;
        const id = matchFirst(row, /data-l-content-id="(\d+)"/i)
            || matchFirst(row, /\/manga\/(\d+)\//i);
        if (!id || seen.has(id)) continue;

        const title = decodeHtml(
            matchFirst(row, /<strong>([\s\S]*?)<\/strong>/i)
            || matchFirst(row, /<img[^>]+alt="([^"]+)"/i)
        ).trim();
        if (!title) continue;

        const image = normalizeMalImage(decodeHtml(
            matchFirst(row, /data-srcset="[^"]*?,\s*([^"\s]+)\s+2x/i)
            || matchFirst(row, /data-src="([^"]+)"/i)
            || matchFirst(row, /src="([^"]+)"/i)
        ));
        const format = decodeHtml(matchFirst(row, /<td[^>]*class="[^"]*\bac\b[^"]*"[^>]*>\s*([^<]+?)\s*<\/td>/i)).trim();

        seen.add(id);
        results.push({
            id,
            title,
            subtitle: '',
            provider: 'jikan',
            image,
            year: '',
            format: format || 'Manga / Jikan',
        });
        if (results.length >= pageSize) break;
    }
    return withHasNext(results, results.length >= pageSize);
}

function matchFirst(value: string, pattern: RegExp): string {
    return value.match(pattern)?.[1] ?? '';
}

function normalizeMalImage(value: string): string {
    if (!value) return '';
    return value
        .replace(/&amp;/g, '&')
        .replace(/\/r\/\d+x\d+(?=\/images\/)/, '')
        .replace(/\?.*$/, '');
}

function decodeHtml(value: string): string {
    return value
        .replace(/<[^>]*>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ');
}

function buildJikanParts(item: Record<string, unknown>) {
    const volumes = Number.parseInt(getString(item, 'volumes'), 10);
    const chapters = Number.parseInt(getString(item, 'chapters'), 10);
    if (!Number.isFinite(volumes) || volumes <= 0) return [];
    const perVolume = Number.isFinite(chapters) && chapters > 0 ? Math.ceil(chapters / volumes) : null;
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

function getJikanYear(item: Record<string, unknown> | null): string {
    const published = getObject(item, 'published');
    const from = getString(published, 'from');
    if (from) return from.slice(0, 4);
    const year = getString(item, 'year');
    if (year) return year;
    const aired = getObject(item, 'aired');
    return getString(aired, 'from').slice(0, 4);
}
