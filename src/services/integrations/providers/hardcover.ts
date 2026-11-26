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
      country { code2 name }
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
    // Some works have no designated physical edition. Resolve one complete edition,
    // keeping its publisher, date and page count together.
    if (!getObject(book, 'default_physical_edition')) {
        try {
            const fallback = asObject(await fetchJson(HARDCOVER_ENDPOINT, hardcoverHeaders(apiKey), 'POST', JSON.stringify({
                query: 'query BookEdition($id: Int!) { editions(where: {book_id: {_eq: $id}}, order_by: [{users_count: desc}, {id: asc}], limit: 1) { title pages release_date publisher { name } country { code2 name } image { url } } }',
                variables: { id: numericId },
            })));
            const edition = asObject(getArray(getObject(fallback, 'data'), 'editions')[0]);
            if (edition) book.default_physical_edition = edition;
        } catch { /* Optional edition metadata must not prevent importing the work. */ }
    }
    return mapHardcoverBookDetails(book);
}

export async function resolveHardcoverSlug(fetchJson: JsonFetcher, slug: string, apiKey: string): Promise<string | null> {
    if (!/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/i.test(slug) || !apiKey.trim()) return null;
    const root = asObject(await fetchJson(HARDCOVER_ENDPOINT, hardcoverHeaders(apiKey), 'POST', JSON.stringify({
        query: 'query BookBySlug($slug: String!) { books(where: {slug: {_eq: $slug}}, limit: 2) { id slug } }', variables: { slug },
    })));
    const matches = getArray(getObject(root, 'data'), 'books').map(asObject).filter(book => getString(book, 'slug') === slug && /^[1-9]\d*$/.test(getString(book, 'id')));
    return matches.length === 1 ? getString(matches[0], 'id') : null;
}

function hardcoverHeaders(apiKey: string): Record<string, string> {
    const token = apiKey.trim()
        .replace(/^authorization\s*:\s*/i, '')
        .replace(/^bearer\s+/i, '')
        .trim();
    return {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'LOREBASE/1.0 (Obsidian plugin; book metadata)',
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
        released: getString(book, 'release_date') || getString(document, 'release_date'),
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
        // Publication country describes this edition, not the work's origin.
        countries: [],
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
