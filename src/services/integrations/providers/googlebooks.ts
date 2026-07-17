import { BookDetails, SearchResult } from '../types';
import { JsonFetcher, asArray, asObject, getArray, getObject, getString, mapStringList, stripHtml } from './common';

interface GoogleBooksOptions {
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

export async function searchGoogleBooks(
    fetchJson: JsonFetcher,
    query: string,
    apiKey = '',
    options: GoogleBooksOptions = {}
): Promise<SearchResult[]> {
    if (!query.trim()) return [];
    if (!apiKey.trim()) return [];
    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.max(1, options.pageSize ?? 10);
    const url = new URL('https://www.googleapis.com/books/v1/volumes');
    url.searchParams.set('q', query);
    url.searchParams.set('startIndex', String((page - 1) * pageSize));
    url.searchParams.set('maxResults', String(Math.min(pageSize, 40)));
    url.searchParams.set('printType', 'books');
    url.searchParams.set('projection', 'lite');
    if (apiKey.trim()) url.searchParams.set('key', apiKey.trim());

    const root = asObject(await fetchJson(url.toString(), {
        'Accept': 'application/json',
    }));
    if (!root) throw new Error('Google Books request failed');
    throwGoogleBooksError(root);
    const items = getArray(root, 'items');
    const mapped = items.map((entry) => {
        const item = asObject(entry);
        const info = getObject(item, 'volumeInfo');
        const images = getObject(info, 'imageLinks');
        const authors = mapStringList(asArray(info?.authors), (value) => value);
        return {
            id: getString(item, 'id'),
            title: getString(info, 'title') || 'Untitled',
            subtitle: authors.join(', '),
            provider: 'googlebooks' as const,
            image: normalizeGoogleImage(getString(images, 'thumbnail') || getString(images, 'smallThumbnail')),
            year: getString(info, 'publishedDate').slice(0, 4),
            format: 'Book / Google Books',
        };
    }).filter((item) => item.id && item.title);

    const totalItems = Number(root?.totalItems);
    const hasNext = Number.isFinite(totalItems) ? page * pageSize < totalItems : mapped.length >= pageSize;
    return withHasNext(mapped, hasNext);
}

export async function getGoogleBooksDetails(fetchJson: JsonFetcher, id: string, apiKey = ''): Promise<BookDetails | null> {
    if (!id) return null;
    if (!apiKey.trim()) return null;
    const url = new URL(`https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(id)}`);
    if (apiKey.trim()) url.searchParams.set('key', apiKey.trim());
    const item = asObject(await fetchJson(url.toString(), {
        'Accept': 'application/json',
    }));
    if (!item) throw new Error('Google Books request failed');
    throwGoogleBooksError(item);

    const info = getObject(item, 'volumeInfo');
    const images = getObject(info, 'imageLinks');
    const publishedDate = getString(info, 'publishedDate');
    const authors = mapStringList(asArray(info?.authors), (value) => value);
    const categories = mapStringList(asArray(info?.categories), (value) => value);

    return {
        kind: 'book',
        name: getString(info, 'title') || 'Untitled',
        description: stripHtml(getString(info, 'description')),
        poster: normalizeGoogleImage(getString(images, 'extraLarge') || getString(images, 'large') || getString(images, 'thumbnail')),
        posterHorizontal: normalizeGoogleImage(getString(images, 'thumbnail')),
        authors,
        publisher: getString(info, 'publisher'),
        genres: categories,
        year: publishedDate.slice(0, 4),
        released: publishedDate,
        pages: getString(info, 'pageCount'),
        rating: getString(info, 'averageRating'),
        url: getString(info, 'canonicalVolumeLink') || getString(info, 'infoLink'),
    };
}

function normalizeGoogleImage(value: string): string {
    if (!value) return '';
    return value.replace(/^http:\/\//i, 'https://');
}

function throwGoogleBooksError(root: Record<string, unknown>): void {
    const error = getObject(root, 'error');
    if (!error) return;
    const message = getString(error, 'message') || 'Google Books API error';
    throw new Error(message);
}
