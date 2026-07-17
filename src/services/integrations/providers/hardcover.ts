import { BookDetails, SearchResult } from '../types';
import { JsonFetcher, asArray, asObject, getArray, getObject, getString, mapStringList, stripHtml, toStringSafe } from './common';

interface HardcoverOptions {
    page?: number;
    pageSize?: number;
}

const HARDCOVER_ENDPOINT = 'https://api.hardcover.app/v1/graphql';

function withHasNext<T>(items: T[], hasNext: boolean): T[] {
    Object.defineProperty(items, 'hasNext', {
        value: hasNext,
        enumerable: false,
        configurable: true,
    });
    return items;
}

export async function searchHardcoverBooks(
    fetchJson: JsonFetcher,
    query: string,
    apiKey: string,
    options: HardcoverOptions = {}
): Promise<SearchResult[]> {
    if (!query.trim() || !apiKey.trim()) return [];
    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.max(1, options.pageSize ?? 10);
    const gql = `query SearchBooks($query: String!, $page: Int!, $perPage: Int!) {
  search(query: $query, query_type: "Book", page: $page, per_page: $perPage) {
    results
  }
}`;

    const root = asObject(await fetchJson(
        HARDCOVER_ENDPOINT,
        hardcoverHeaders(apiKey),
        'POST',
        JSON.stringify({ query: gql, variables: { query, page, perPage: pageSize } })
    ));
    const results = normalizeHardcoverResults(getObject(getObject(root, 'data'), 'search')?.results);
    const mapped = results
        .map((entry) => mapHardcoverSearchResult(entry))
        .filter((entry): entry is SearchResult => Boolean(entry?.id && entry.title));

    return withHasNext(mapped, mapped.length >= pageSize);
}

export async function getHardcoverBookDetails(
    fetchJson: JsonFetcher,
    id: string,
    apiKey: string
): Promise<BookDetails | null> {
    if (!id || !apiKey.trim()) return null;
    const numericId = Number.parseInt(id, 10);
    if (!Number.isFinite(numericId)) return null;

    const gql = `query BookDetails($id: Int!) {
  books_by_pk(id: $id) {
    id
    title
    subtitle
    description
    pages
    release_date
    slug
    cached_contributors
    cached_tags
    image { url }
    default_physical_edition {
      title
      pages
      release_date
      publisher { name }
      image { url }
    }
    contributions {
      author { name }
    }
  }
}`;

    const root = asObject(await fetchJson(
        HARDCOVER_ENDPOINT,
        hardcoverHeaders(apiKey),
        'POST',
        JSON.stringify({ query: gql, variables: { id: numericId } })
    ));
    const book = getObject(getObject(root, 'data'), 'books_by_pk');
    if (!book) return null;
    return mapHardcoverBookDetails(book);
}

function hardcoverHeaders(apiKey: string): Record<string, string> {
    const token = apiKey.trim();
    return {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': token.toLowerCase().startsWith('bearer ') ? token : `Bearer ${token}`,
    };
}

function normalizeHardcoverResults(value: unknown): Record<string, unknown>[] {
    if (Array.isArray(value)) return value.map((entry) => asObject(entry)).filter((entry): entry is Record<string, unknown> => Boolean(entry));
    const object = asObject(value);
    if (!object) return [];
    const hits = asArray(object.hits).length ? asArray(object.hits) : asArray(object.results);
    if (hits.length) return hits.map((entry) => asObject(entry)).filter((entry): entry is Record<string, unknown> => Boolean(entry));
    return [];
}

function mapHardcoverSearchResult(raw: Record<string, unknown>): SearchResult | null {
    const document = getObject(raw, 'document') ?? raw;
    const book = getObject(document, 'book') ?? document;
    const id = getString(book, 'id') || getString(document, 'id');
    const title = getString(book, 'title') || getString(document, 'title');
    if (!id || !title) return null;
    const authors = readContributors(book);
    const image = readImage(book) || getString(book, 'image_url') || getString(document, 'image_url');
    const year = extractYear(getString(book, 'release_date') || getString(document, 'release_date') || getString(book, 'publication_year'));
    return {
        id,
        title,
        subtitle: authors.join(', '),
        provider: 'hardcover',
        image,
        year,
        format: 'Book / Hardcover',
    };
}

function mapHardcoverBookDetails(book: Record<string, unknown>): BookDetails {
    const edition = getObject(book, 'default_physical_edition');
    const publisher = getString(getObject(edition, 'publisher'), 'name');
    const releaseDate = getString(edition, 'release_date') || getString(book, 'release_date');
    const image = readImage(edition) || readImage(book);
    const slug = getString(book, 'slug');
    const pages = getString(edition, 'pages') || getString(book, 'pages');
    const authors = readContributors(book);

    return {
        kind: 'book',
        name: getString(book, 'title') || getString(edition, 'title') || 'Untitled',
        description: stripHtml(getString(book, 'description')),
        poster: image,
        posterHorizontal: image,
        authors,
        publisher,
        genres: readGenres(book).slice(0, 12),
        year: extractYear(releaseDate),
        released: releaseDate,
        pages,
        rating: '',
        url: slug ? `https://hardcover.app/books/${slug}` : `https://hardcover.app/books/${getString(book, 'id')}`,
    };
}

function readImage(source: Record<string, unknown> | null): string {
    const image = getObject(source, 'image');
    return getString(image, 'url') || getString(source, 'image') || '';
}

function readContributors(source: Record<string, unknown>): string[] {
    const cached = source.cached_contributors;
    if (Array.isArray(cached)) {
        const names = mapStringList(cached, (entry) => getString(asObject(entry), 'name'));
        if (names.length) return names;
    }
    const contributions = getArray(source, 'contributions');
    const names = mapStringList(contributions, (entry) => getString(getObject(asObject(entry), 'author'), 'name'));
    return Array.from(new Set(names));
}

function readGenres(source: Record<string, unknown>): string[] {
    const cachedTags = asObject(source.cached_tags);
    const genreValue = cachedTags?.Genre ?? cachedTags?.genre ?? cachedTags?.genres;
    if (Array.isArray(genreValue)) {
        return mapStringList(genreValue, (entry) => {
            const object = asObject(entry);
            return object ? getString(object, 'tag') || getString(object, 'name') : entry;
        });
    }
    return [];
}

function extractYear(value: string): string {
    const match = toStringSafe(value).match(/\d{4}/);
    return match ? match[0] : '';
}
