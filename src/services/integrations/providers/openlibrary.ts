import type { BookDetails, SearchResult } from '../types';
import { asObject, getArray, getObject, getString, mapStringList, stripHtml, type JsonFetcher } from './common';

const ORIGIN = 'https://openlibrary.org';
interface BookSummary { title: string; authors: string[]; year: string; image: string; expiresAt: number; }
const summaries = new WeakMap<JsonFetcher, Map<string, BookSummary>>();
export function normalizeOpenLibraryId(value: string): string | null {
    return /^OL[1-9]\d*[WM]$/i.test(value) ? value.toUpperCase() : null;
}
function cover(value: unknown): string {
    return Number.isSafeInteger(Number(value)) && Number(value) > 0
        ? `https://covers.openlibrary.org/b/id/${value}-L.jpg?default=false` : '';
}
function date(value: string): string {
    const iso = value.match(/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/)?.[0];
    return iso ?? value.match(/\b(?:1[0-9]{3}|20[0-9]{2})\b/)?.[0] ?? '';
}
export async function searchOpenLibrary(fetch: JsonFetcher, query: string, options: { page?: number; pageSize?: number } = {}): Promise<SearchResult[]> {
    if (!query.trim()) return [];
    const page = Math.max(1, Math.trunc(options.page || 1));
    const limit = Math.max(1, Math.min(50, Math.trunc(options.pageSize || 10)));
    const url = new URL('/search.json', ORIGIN);
    url.searchParams.set('q', query.trim());
    url.searchParams.set('page', String(page));
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('fields', 'key,title,author_name,cover_i,first_publish_year');
    const root = asObject(await fetch(url.toString(), { Accept: 'application/json' }));
    if (!root || !Array.isArray(root.docs)) throw new Error('Open Library search unavailable');
    const cache = summaries.get(fetch) ?? new Map(); summaries.set(fetch, cache);
    const results: SearchResult[] = [];
    for (const raw of root.docs) {
        const row = asObject(raw);
        const id = normalizeOpenLibraryId(getString(row, 'key').replace(/^\/works\//, ''));
        const title = getString(row, 'title').trim();
        if (!id || !title) continue;
        const authors = mapStringList(getArray(row, 'author_name'), value => value);
        const year = date(getString(row, 'first_publish_year'));
        const image = cover(row?.cover_i);
        if (cache.size >= 200) cache.delete(cache.keys().next().value!);
        cache.set(id, { title, authors, year, image, expiresAt: Date.now() + 5 * 60_000 });
        results.push({ id, title, subtitle: authors.join(', '), year, released: year, image, provider: 'openlibrary', format: 'Book / Open Library' });
    }
    const total = Number(root.numFound ?? root.num_found);
    Object.defineProperty(results, 'hasNext', { value: Number.isFinite(total) ? page * limit < total : root.docs.length === limit });
    return results;
}

export async function getOpenLibraryDetails(fetch: JsonFetcher, rawId: string): Promise<BookDetails | null> {
    const id = normalizeOpenLibraryId(rawId);
    if (!id) return null;
    const path = `/${id.endsWith('W') ? 'works' : 'books'}/${id}`;
    const summary = summaries.get(fetch)?.get(id);
    const cached = summary && summary.expiresAt > Date.now() ? summary : undefined;
    let row: Record<string, unknown> | null;
    try {
        row = asObject(await fetch(`${ORIGIN}${path}.json`, { Accept: 'application/json' }));
    } catch (error) {
        const status = Number(asObject(error)?.status);
        // A selected, recent result is enough to add a book when only details are down.
        // Do not conceal a definite missing/invalid identity or reuse stale search data.
        if (!cached || status >= 400 && status < 500 && status !== 429) throw error;
        row = { title: cached.title };
    }
    if (!row || !getString(row, 'title').trim()) return null;
    const authors = cached?.authors.length ? [...cached.authors] : [];
    if (!authors.length) {
        const keys = [...new Set(getArray(row, 'authors').map(raw => {
            const item = asObject(raw);
            return getString(getObject(item, 'author') ?? item, 'key');
        }).filter(key => /^\/authors\/OL[1-9]\d*A$/.test(key)))].slice(0, 5);
        for (const key of keys) {
            try {
                const author = asObject(await fetch(`${ORIGIN}${key}.json`, { Accept: 'application/json' }));
                const name = getString(author, 'name').trim();
                if (name) authors.push(name);
            } catch { /* Optional author lookup must not prevent adding the book. */ }
        }
    }
    const published = date(getString(row, id.endsWith('W') ? 'first_publish_date' : 'publish_date')) || cached?.year || '';
    const description = typeof row.description === 'string' ? row.description : getString(asObject(row.description), 'value');
    return {
        kind: 'book', name: getString(row, 'title').trim(), description: stripHtml(description),
        poster: getArray(row, 'covers').map(cover).find(Boolean) || cached?.image || '', authors,
        publisher: id.endsWith('M') ? mapStringList(getArray(row, 'publishers'), value => value).join(', ') : '',
        genres: mapStringList(getArray(row, 'subjects'), value => typeof value === 'string' ? value : '').slice(0, 12),
        year: published.slice(0, 4), released: published,
        // A work does not identify a particular edition: never invent its page count.
        pages: id.endsWith('M') && Number(row.number_of_pages) > 0 ? String(row.number_of_pages) : '',
        url: `${ORIGIN}${path}`,
    };
}
