import { describe, expect, it, vi } from 'vitest';
import { getOpenLibraryDetails, searchOpenLibrary } from '../src/services/integrations/providers/openlibrary';
import { parseCatalogReference } from '../src/services/integrations/catalogReferences';
import { IntegrationService } from '../src/services/IntegrationService';
import { DEFAULT_SETTINGS } from '../src/constants';
import { createMockApp } from './helpers/testHelpers';
import type { JsonFetcher } from '../src/services/integrations/providers/common';

describe('Open Library book source', () => {
    it('searches without credentials, preserves Unicode, paginates and ignores invalid identities', async () => {
        const fetch = vi.fn<JsonFetcher>().mockResolvedValue({ numFound: 30, docs: [
            { key: '/works/OL123W', title: 'Дюна', author_name: ['Frank Herbert'], first_publish_year: 1965, cover_i: 123 },
            { key: '/authors/OL4A', title: 'Wrong kind' }, { key: '/works/OL5W' },
        ] });
        const result = await searchOpenLibrary(fetch, 'Дюна & Herbert', { page: 2, pageSize: 10 });
        const url = new URL(fetch.mock.calls[0][0]);
        expect(url.origin).toBe('https://openlibrary.org');
        expect(url.searchParams.get('q')).toBe('Дюна & Herbert');
        expect(url.searchParams.get('page')).toBe('2');
        expect(url.searchParams.has('key')).toBe(false);
        expect(result).toEqual([expect.objectContaining({ id: 'OL123W', provider: 'openlibrary', title: 'Дюна', year: '1965', subtitle: 'Frank Herbert' })]);
        expect((result as any).hasNext).toBe(true);
    });
    it('keeps a work usable without borrowing page counts or publishers from a random edition', async () => {
        const fetch = vi.fn<JsonFetcher>().mockResolvedValueOnce({ numFound: 1, docs: [{ key: '/works/OL1W', title: 'Book', author_name: ['Author'], first_publish_year: 2020, cover_i: 5 }] })
            .mockResolvedValueOnce({ title: 'Book', description: { value: '<p>Description</p>' }, subjects: ['Fantasy'] });
        await searchOpenLibrary(fetch, 'Book');
        expect(await getOpenLibraryDetails(fetch, 'OL1W')).toMatchObject({ name: 'Book', authors: ['Author'], description: 'Description', year: '2020', pages: '', publisher: '', genres: ['Fantasy'] });
        expect(fetch).toHaveBeenCalledTimes(2);
    });
    it('imports a specific edition with its real pages, publisher and partial publication date', async () => {
        const fetch = vi.fn<JsonFetcher>().mockResolvedValueOnce({ title: 'Edition', publish_date: '2023', number_of_pages: 352, publishers: ['Publisher'], covers: [40], authors: [{ key: '/authors/OL9A' }] })
            .mockResolvedValueOnce({ name: 'Author' });
        expect(await getOpenLibraryDetails(fetch, 'ol2m')).toMatchObject({ name: 'Edition', authors: ['Author'], pages: '352', publisher: 'Publisher', year: '2023', released: '2023', url: 'https://openlibrary.org/books/OL2M' });
        expect(fetch.mock.calls[0][0]).toBe('https://openlibrary.org/books/OL2M.json');
    });
    it('retains the book if optional author lookup fails and never fetches arbitrary author URLs', async () => {
        const fetch = vi.fn<JsonFetcher>().mockResolvedValueOnce({ title: 'Book', authors: [{ author: { key: '/authors/OL9A' } }, { author: { key: 'https://example.com/private' } }] })
            .mockRejectedValueOnce(new Error('offline'));
        expect(await getOpenLibraryDetails(fetch, 'OL1W')).toMatchObject({ name: 'Book', authors: [] });
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(await getOpenLibraryDetails(fetch, '../bad')).toBeNull();
        expect(fetch).toHaveBeenCalledTimes(2);
    });
    it('adds a freshly selected book from verified search data when details temporarily return 503', async () => {
        const fetch = vi.fn<JsonFetcher>().mockResolvedValueOnce({ numFound: 1, docs: [{ key: '/works/OL1W', title: 'Dune', author_name: ['Frank Herbert'], first_publish_year: 1965, cover_i: 5 }] })
            .mockRejectedValueOnce(Object.assign(new Error('unavailable'), { status: 503 }));
        await searchOpenLibrary(fetch, 'Dune');
        expect(await getOpenLibraryDetails(fetch, 'OL1W')).toMatchObject({ name: 'Dune', authors: ['Frank Herbert'], year: '1965', pages: '', description: '', url: 'https://openlibrary.org/works/OL1W' });
        expect(fetch).toHaveBeenCalledTimes(2);
    });
    it('does not disguise a missing record or reuse an expired search result after an outage', async () => {
        const fetch = vi.fn<JsonFetcher>().mockResolvedValueOnce({ numFound: 1, docs: [{ key: '/works/OL1W', title: 'Book' }] })
            .mockRejectedValueOnce(Object.assign(new Error('not found'), { status: 404 }));
        await searchOpenLibrary(fetch, 'Book');
        await expect(getOpenLibraryDetails(fetch, 'OL1W')).rejects.toThrow('not found');
        const time = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 6 * 60_000);
        fetch.mockRejectedValueOnce(Object.assign(new Error('unavailable'), { status: 503 }));
        try { await expect(getOpenLibraryDetails(fetch, 'OL1W')).rejects.toThrow('unavailable'); } finally { time.mockRestore(); }
    });
    it('distinguishes no results from malformed or failed searches', async () => {
        const fetch = vi.fn<JsonFetcher>().mockResolvedValueOnce({ numFound: 0, docs: [] }).mockResolvedValueOnce({ error: 'unavailable' });
        const empty = await searchOpenLibrary(fetch, 'absent');
        expect(empty).toEqual([]); expect((empty as any).hasNext).toBe(false);
        await expect(searchOpenLibrary(fetch, 'retry')).rejects.toThrow('unavailable');
        expect(await searchOpenLibrary(fetch, '   ')).toEqual([]);
        expect(fetch).toHaveBeenCalledTimes(2);
    });
    it.each(['https://openlibrary.org/works/OL1W/Book', 'openlibrary:OL1W', 'OL1W'])('supports exact book lookup from %s', input => {
        expect(parseCatalogReference(input, { kind: 'books', provider: 'openlibrary' })).toMatchObject({ provider: 'openlibrary', id: 'OL1W' });
        expect(() => parseCatalogReference(input, { kind: 'games', provider: 'steam' })).toThrow();
    });
    it('is available in ordinary book search with no key, routes details, and never adds a note during search', async () => {
        const settings = structuredClone(DEFAULT_SETTINGS); settings.integrations!.enabled = true;
        settings.integrations!.providers.hardcover.apiKey = ''; settings.integrations!.providers.googlebooks.apiKey = '';
        const app = createMockApp({}); app.vault.create = vi.fn(); app.vault.getMarkdownFiles = () => [];
        const service = new IntegrationService(app, () => settings), internal = service as any;
        const fetch = vi.fn<JsonFetcher>().mockImplementation(async url => url.includes('search.json')
            ? { numFound: 1, docs: [{ key: '/works/OL1W', title: 'Book', author_name: ['Author'] }] } : { title: 'Book' });
        internal.jsonFetcher = fetch;
        expect(internal.getProviderOptions('books')).toEqual([expect.objectContaining({ id: 'openlibrary' })]);
        expect(await service.searchCatalogInput('books', 'Book', 'openlibrary')).toEqual([expect.objectContaining({ provider: 'openlibrary', id: 'OL1W' })]);
        expect(await internal.fetchDetails('openlibrary', 'OL1W', '', '', 'books')).toMatchObject({ kind: 'book', name: 'Book' });
        expect(app.vault.create).not.toHaveBeenCalled(); service.dispose();
    });
});
