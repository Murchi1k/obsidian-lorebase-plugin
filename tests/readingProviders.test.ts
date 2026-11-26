import { afterEach, describe, expect, it } from 'vitest';
import { __setRequestUrlMock } from './mocks/obsidian';
import { getAniListMangaDetails, searchAniListManga } from '../src/services/integrations/providers/anilist';
import type { JsonFetcher } from '../src/services/integrations/providers/common';
import { getGoogleBooksDetails, searchGoogleBooks } from '../src/services/integrations/providers/googlebooks';
import { getHardcoverBookDetails, searchHardcoverBooks } from '../src/services/integrations/providers/hardcover';
import {
    getMangaUpdatesDetails,
    resetMangaUpdatesCachesForTests,
    searchMangaUpdates,
} from '../src/services/integrations/providers/mangaupdates';
import { getMangaDexDetails, searchMangaDex } from '../src/services/integrations/providers/mangadex';
import { getShikimoriMangaDetails, searchShikimoriManga } from '../src/services/integrations/providers/shikimori';

describe('reading providers', () => {
    it('finds Shikimori light novels beside manga with the same title and imports the correct type', async () => {
        const novel = { id: '70261', name: 'Mushoku Tensei: Isekai Ittara Honki Dasu', russian: 'Реинкарнация безработного', kind: 'light_novel',
            status: 'released', airedOn: { year: 2014, date: '2014-01-23' }, poster: { originalUrl: 'https://example.com/novel.jpg' } };
        const calls: string[] = [];
        const fetch: JsonFetcher = async (url, _headers, method, body) => {
            calls.push(url);
            if (url.endsWith('/api/graphql')) {
                expect(method).toBe('POST');
                const request = JSON.parse(body!);
                expect(request.query).toContain('mangas(search:');
                expect(request.variables).toEqual({ search: novel.name, limit: 2, page: 2, censored: true });
                return { data: { mangas: [{ ...novel, id: '70259', kind: 'manga' }, novel] } };
            }
            if (url.endsWith('/roles')) return [];
            return { ...novel, aired_on: novel.airedOn.date, volumes: 26 };
        };
        const results = await searchShikimoriManga(fetch, novel.name, { page: 2, pageSize: 2 });
        expect(results).toHaveLength(2);
        expect(results.map(item => item.workType)).toEqual(['Manga', 'Light novel']);
        expect(results[1]).toMatchObject({ id: '70261', released: '2014-01-23', publicationStatus: 'released' });
        expect((results as typeof results & { hasNext?: boolean }).hasNext).toBe(true);
        expect(calls).toHaveLength(1);
        expect(await getShikimoriMangaDetails(fetch, results[1].id)).toMatchObject({ workType: 'Light novel', name: novel.russian, volumes: '26' });
    });
    it('respects an empty combined Shikimori catalogue response without repeating the legacy search', async () => {
        let calls = 0;
        const results = await searchShikimoriManga(async () => { calls++; return { data: { mangas: [] } }; }, 'no match');
        expect(results).toEqual([]);
        expect((results as typeof results & { hasNext?: boolean }).hasNext).toBe(false);
        expect(calls).toBe(1);
    });
    it.each([
        ['ja', 'One-shot', 'One-shot'], ['ja', 'Doujinshi', 'Doujinshi'],
        ['ko', '', 'Manhwa'], ['zh', '', 'Manhua'], ['zh-hk', '', 'Manhua'], ['ja', '', 'Manga'],
    ])('uses MangaDex format tags and %s origin consistently in search and import', async (language, format, expected) => {
        const item = { id: 'format-test', attributes: {
            title: { en: 'Title' }, originalLanguage: language,
            status: 'ongoing', tags: format ? [{ attributes: { group: 'format', name: { en: format } } }] : [],
        }, relationships: [{ type: 'cover_art', attributes: { fileName: 'cover.jpg' } }] };
        const fetch: JsonFetcher = async url => {
            if (url.includes('/manga?')) {
                expect(new URL(url).searchParams.get('order[relevance]')).toBe('desc');
                return { data: [item], total: 1, offset: 0, limit: 10 };
            }
            if (url.includes('/aggregate')) return { volumes: {} };
            return { data: item };
        };
        const [result] = await searchMangaDex(fetch, 'Title');
        expect(result.workType).toBe(expected);
        expect(result.publicationStatus).toBe('ongoing');
        expect((await getMangaDexDetails(fetch, result.id))?.workType).toBe(expected);
    });
    afterEach(() => {
        __setRequestUrlMock(null);
        resetMangaUpdatesCachesForTests();
    });

    it('resolves the publisher without treating the edition country as the work origin', async () => {
        const details = await getHardcoverBookDetails(async (_url, _headers, _method, body) => {
            const query = JSON.parse(String(body)).query as string;
            if (query.includes('query BookEdition(')) return { data: { editions: [{ title: 'Edition', pages: 200, release_date: '2020-01-01', publisher: { name: 'Edition Publisher' }, country: { code2: 'ua', name: 'Ukraine' } }] } };
            expect(query).toContain('country { code2 name }');
            return { data: { books_by_pk: { id: 42, title: 'Work', default_physical_edition: null } } };
        }, '42', 'token');
        expect(details).toMatchObject({ name: 'Work', publisher: 'Edition Publisher', countries: [], pages: '200', released: '2020-01-01' });
    });
    it('keeps a book import usable when optional edition metadata fails', async () => {
        let calls = 0;
        const details = await getHardcoverBookDetails(async () => {
            if (calls++) throw new Error('Edition unavailable');
            return { data: { books_by_pk: { id: 42, title: 'Work' } } };
        }, '42', 'token');
        expect(details).toMatchObject({ name: 'Work', publisher: '', countries: [] });
    });
    it('maps Hardcover search and GraphQL book details', async () => {
        const fetchJson: JsonFetcher = async (_url, headers, _method, body) => {
            expect(headers?.Authorization).toBe('Bearer token-1');
            expect(headers?.['User-Agent']).toContain('LOREBASE');
            const payload = JSON.parse(String(body));
            if (payload.variables.query) {
                return {
                    data: {
                        search: {
                            results: [
                                {
                                    document: {
                                        id: 42,
                                        title: 'The Way of Kings',
                                        release_date: '2010-08-31',
                                        image: { url: 'https://img.example/wok.jpg' },
                                        cached_contributors: [{ name: 'Brandon Sanderson' }],
                                    },
                                },
                            ],
                        },
                    },
                };
            }
            return {
                data: {
                    books_by_pk: {
                        id: 42,
                        title: 'The Way of Kings',
                        description: '<p>Epic fantasy.</p>',
                        pages: 1007,
                        release_date: '2010-08-31',
                        slug: 'the-way-of-kings',
                        cached_contributors: [{ name: 'Brandon Sanderson' }],
                        cached_tags: { Genre: [{ tag: 'Fantasy' }] },
                        image: { url: 'https://img.example/wok.jpg' },
                        default_physical_edition: {
                            pages: 1007,
                            release_date: '2010-08-31',
                            publisher: { name: 'Tor Books' },
                            image: { url: 'https://img.example/wok-edition.jpg' },
                        },
                        contributions: [],
                    },
                },
            };
        };

        const results = await searchHardcoverBooks(fetchJson, 'way of kings', 'Authorization: Bearer token-1');
        const details = await getHardcoverBookDetails(fetchJson, results[0].id, 'Bearer token-1');

        expect(results[0]).toMatchObject({
            id: '42',
            title: 'The Way of Kings',
            provider: 'hardcover',
            year: '2010',
        });
        expect(details).toMatchObject({
            kind: 'book',
            name: 'The Way of Kings',
            authors: ['Brandon Sanderson'],
            publisher: 'Tor Books',
            pages: '1007',
            year: '2010',
            description: 'Epic fantasy.',
            url: 'https://hardcover.app/books/the-way-of-kings',
        });
        expect(details?.poster).toBe('https://img.example/wok-edition.jpg');
    });

    it('does not call Google Books without an API key', async () => {
        const fetchJson: JsonFetcher = async () => {
            throw new Error('Google Books should not be requested without an API key');
        };

        await expect(searchGoogleBooks(fetchJson, 'dune')).resolves.toEqual([]);
        await expect(getGoogleBooksDetails(fetchJson, 'gb-1')).resolves.toBeNull();
    });

    it('maps Google Books search and details with API key', async () => {
        const fetchJson: JsonFetcher = async (url) => {
            expect(url).toContain('key=test-key');
            if (url.includes('/volumes?')) {
                return {
                    totalItems: 1,
                    items: [
                        {
                            id: 'gb-1',
                            volumeInfo: {
                                title: 'Dune',
                                authors: ['Frank Herbert'],
                                publishedDate: '1965-08-01',
                                imageLinks: { thumbnail: 'http://books.example/dune.jpg' },
                            },
                        },
                    ],
                };
            }
            return {
                id: 'gb-1',
                volumeInfo: {
                    title: 'Dune',
                    authors: ['Frank Herbert'],
                    publisher: 'Chilton Books',
                    publishedDate: '1965-08-01',
                    pageCount: 412,
                    averageRating: 4.5,
                    categories: ['Science Fiction'],
                    description: '<p>Desert planet.</p>',
                    canonicalVolumeLink: 'https://books.google.com/dune',
                    imageLinks: { large: 'http://books.example/dune-large.jpg', thumbnail: 'http://books.example/dune-thumb.jpg' },
                },
            };
        };

        const results = await searchGoogleBooks(fetchJson, 'dune', 'test-key');
        const details = await getGoogleBooksDetails(fetchJson, results[0].id, 'test-key');

        expect(results[0]).toMatchObject({ id: 'gb-1', title: 'Dune', provider: 'googlebooks' });
        expect(results[0].image).toBe('https://books.example/dune.jpg');
        expect(details).toMatchObject({
            kind: 'book',
            name: 'Dune',
            publisher: 'Chilton Books',
            pages: '412',
            rating: '4.5',
            description: 'Desert planet.',
        });
        expect(details?.poster).toBe('https://books.example/dune-large.jpg');
    });

    it('surfaces Google Books API errors', async () => {
        const fetchJson: JsonFetcher = async () => ({
            error: { message: 'API key not valid' },
        });

        await expect(searchGoogleBooks(fetchJson, 'dune', 'bad-key')).rejects.toThrow('API key not valid');
    });

    it('maps AniList manga search and volume parts', async () => {
        const fetchJson: JsonFetcher = async (_url, _headers, _method, body) => {
            const payload = JSON.parse(String(body));
            if (payload.variables.search) {
                return {
                    data: {
                        Page: {
                            pageInfo: { hasNextPage: false },
                            media: [
                                {
                                    id: 30013,
                                    title: { userPreferred: 'Berserk' },
                                    startDate: { year: 1989 },
                                    format: 'MANGA',
                                    coverImage: { large: 'https://img.example/berserk.jpg' },
                                },
                            ],
                        },
                    },
                };
            }
            return {
                data: {
                    Media: {
                        id: 30013,
                        title: { userPreferred: 'Berserk' },
                        description: '<b>Dark fantasy.</b>',
                        genres: ['Action', 'Drama'],
                        chapters: 364,
                        volumes: 41,
                        startDate: { year: 1989, month: 8, day: 25 },
                        staff: {
                            edges: [
                                { role: 'Story & Art', node: { name: { full: 'Kentaro Miura' } } },
                                { role: 'Assistant', node: { name: { full: 'Studio Gaga' } } },
                            ],
                        },
                        averageScore: 91,
                        siteUrl: 'https://anilist.co/manga/30013',
                        coverImage: { extraLarge: 'https://img.example/berserk-xl.jpg' },
                    },
                },
            };
        };

        const results = await searchAniListManga(fetchJson, 'berserk');
        const details = await getAniListMangaDetails(fetchJson, results[0].id);

        expect(results[0]).toMatchObject({ id: '30013', title: 'Berserk', provider: 'anilist' });
        expect(details).toMatchObject({
            kind: 'manga',
            name: 'Berserk',
            chapters: '364',
            volumes: '41',
            rating: '9.1',
            released: '1989-08-25',
            authors: ['Kentaro Miura'],
            artists: ['Kentaro Miura'],
        });
        expect(details?.parts).toHaveLength(41);
        expect(details?.parts?.[0]).toMatchObject({ volumeNumber: 1, chapterTotal: 9 });
    });

    it('maps Shikimori manga search and details', async () => {
        const fetchJson: JsonFetcher = async (url) => {
            if (url.endsWith('/api/mangas/1/roles')) {
                return [
                    { roles: ['Author'], person: { name: 'Miura Kentarou' } },
                    { roles: ['Art'], person: { name: 'Miura Kentarou' } },
                ];
            }
            if (url.includes('/api/mangas?')) {
                return [
                    {
                        id: 1,
                        name: 'Berserk',
                        russian: 'Berserk',
                        kind: 'manga',
                        score: '8.9',
                        aired_on: '1989-08-25',
                        image: { original: '/system/mangas/original/1.jpg' },
                    },
                ];
            }
            return {
                id: 1,
                name: 'Berserk',
                russian: 'Berserk',
                description: '<p>Dark fantasy.</p>',
                score: '8.9',
                chapters: 364,
                volumes: 41,
                aired_on: '1989-08-25',
                image: { original: '/system/mangas/original/1.jpg' },
                genres: [{ name: 'Action', russian: 'Action' }],
            };
        };

        const results = await searchShikimoriManga(fetchJson, 'berserk');
        const details = await getShikimoriMangaDetails(fetchJson, results[0].id);

        expect(results[0]).toMatchObject({ id: '1', title: 'Berserk', provider: 'shikimori' });
        expect(results[0].image).toBe('https://shikimori.net/system/mangas/original/1.jpg');
        expect(details).toMatchObject({
            kind: 'manga',
            name: 'Berserk',
            url: 'https://shikimori.net/mangas/z1',
            chapters: '364',
            volumes: '41',
            rating: '8.9',
            released: '1989-08-25',
            authors: ['Miura Kentarou'],
            artists: ['Miura Kentarou'],
        });
        expect(details?.parts).toHaveLength(41);
    });

    it('maps MangaUpdates manga search and details', async () => {
        const calls: Array<{ url: string; method?: string; body?: string }> = [];
        const fetchJson: JsonFetcher = async (url, _headers, method, body) => {
            calls.push({ url, method, body });
            if (url.endsWith('/series/search')) {
                return {
                    total_hits: 1,
                    page: 1,
                    per_page: 25,
                    results: [{
                        record: {
                            series_id: 512,
                            title: 'Berserk',
                            type: 'Manga',
                            year: '1989',
                            image: { url: { original: 'https://cdn.example/berserk.jpg' } },
                        },
                        hit_title: 'Berserk',
                    }],
                };
            }
            return {
                series_id: 512,
                title: 'Berserk',
                description: 'Dark fantasy.',
                type: 'Manga',
                year: '1989',
                latest_chapter: 386,
                status: '43 Volumes (Ongoing)',
                bayesian_rating: 8.98,
                rating_votes: 3722,
                url: 'https://www.mangaupdates.com/series/512/berserk',
                image: { url: { original: 'https://cdn.example/berserk.jpg' } },
                authors: [
                    { name: 'Miura Kentarou', type: 'Author' },
                    { name: 'Miura Kentarou', type: 'Artist' },
                ],
                genres: [{ genre: 'Action' }, { genre: 'Adult' }, { genre: 'Seinen' }],
            };
        };

        const results = await searchMangaUpdates(fetchJson, 'berserk');
        const details = await getMangaUpdatesDetails(fetchJson, results[0].id);

        expect(calls[0]).toMatchObject({
            url: 'https://api.mangaupdates.com/v1/series/search',
            method: 'POST',
        });
        expect(JSON.parse(calls[0].body ?? '{}')).toMatchObject({ search: 'berserk', page: 1, perpage: 25 });
        expect(results[0]).toMatchObject({ id: '512', title: 'Berserk', provider: 'mangaupdates' });
        expect(details).toMatchObject({
            kind: 'manga',
            name: 'Berserk',
            authors: ['Miura Kentarou'],
            artists: ['Miura Kentarou'],
            chapters: '386',
            volumes: '43',
            publicationStatus: '43 Volumes (Ongoing)',
            rating: '8.98',
            communityVotes: '3722',
            isAdult: true,
        });
        expect(details?.genres).toEqual(['Action', 'Adult', 'Seinen']);
        expect(details?.parts).toHaveLength(43);
    });

    it('maps MangaUpdates numeric search through the series endpoint', async () => {
        const calls: string[] = [];
        const results = await searchMangaUpdates(async (url) => {
            calls.push(url);
            return {
                series_id: 512,
                title: 'Berserk',
                year: '1989',
                status: '43 Volumes (Ongoing)',
                image: { url: { original: 'https://cdn.example/berserk.jpg' } },
                authors: [{ name: 'Miura Kentarou', type: 'Author' }],
            };
        }, '512');

        expect(calls).toEqual(['https://api.mangaupdates.com/v1/series/512']);
        expect(results[0]).toMatchObject({
            id: '512',
            title: 'Berserk',
            provider: 'mangaupdates',
            image: 'https://cdn.example/berserk.jpg',
            year: '1989',
        });
    });

    it('caches MangaUpdates search and title details', async () => {
        let searchCalls = 0;
        let detailCalls = 0;
        const fetchJson: JsonFetcher = async (url) => {
            if (url.endsWith('/series/search')) {
                searchCalls++;
                return { total_hits: 0, results: [] };
            }
            detailCalls++;
            return {
                series_id: 512,
                title: 'Berserk',
                status: '43 Volumes (Ongoing)',
            };
        };

        await searchMangaUpdates(fetchJson, 'berserk');
        await searchMangaUpdates(fetchJson, 'BERSERK');
        await getMangaUpdatesDetails(fetchJson, '512');
        await getMangaUpdatesDetails(fetchJson, '512');

        expect(searchCalls).toBe(1);
        expect(detailCalls).toBe(1);
    });

    it('maps MangaDex covers and aggregate volumes', async () => {
        const fetchJson: JsonFetcher = async (url) => {
            if (url.includes('/manga?')) {
                return {
                    total: 1,
                    offset: 0,
                    limit: 10,
                    data: [
                        {
                            id: 'md-1',
                            attributes: { title: { en: 'Akame ga Kill!' }, year: 2010, status: 'completed' },
                            relationships: [{ type: 'cover_art', attributes: { fileName: 'cover.jpg' } }],
                        },
                    ],
                };
            }
            if (url.includes('/aggregate')) {
                return {
                    volumes: {
                        '1': { chapters: { '1': {}, '2': {} } },
                        '2': { chapters: { '3': {} } },
                    },
                };
            }
            return {
                data: {
                    id: 'md-1',
                    attributes: {
                        title: { en: 'Akame ga Kill!' },
                        description: { en: '<p>Assassins.</p>' },
                        year: 2010,
                        tags: [{ attributes: { name: { en: 'Action' } } }],
                    },
                    relationships: [
                        { type: 'cover_art', attributes: { fileName: 'cover.jpg' } },
                        { type: 'author', attributes: { name: 'Takahiro' } },
                        { type: 'artist', attributes: { name: 'Tetsuya Tashiro' } },
                    ],
                },
            };
        };

        const results = await searchMangaDex(fetchJson, 'akame');
        const details = await getMangaDexDetails(fetchJson, results[0].id);

        expect(results[0]).toMatchObject({ id: 'md-1', title: 'Akame ga Kill!', provider: 'mangadex', publicationStatus: 'completed' });
        expect(results[0].image).toBe('https://uploads.mangadex.org/covers/md-1/cover.jpg.512.jpg');
        expect(details).toMatchObject({
            kind: 'manga',
            name: 'Akame ga Kill!',
            authors: ['Takahiro'],
            artists: ['Tetsuya Tashiro'],
            chapters: '3',
            volumes: '2',
        });
        expect(details?.parts).toEqual([
            { id: 'volume-1', kind: 'volume', title: 'Volume 1', volumeNumber: 1, chapterCurrent: 0, chapterTotal: 2, status: 'planned' },
            { id: 'volume-2', kind: 'volume', title: 'Volume 2', volumeNumber: 2, chapterCurrent: 0, chapterTotal: 1, status: 'planned' },
        ]);
    });

    it('fetches MangaDex cover when manga relationships do not include cover attributes', async () => {
        const fetchJson: JsonFetcher = async (url) => {
            if (url.includes('/manga?')) {
                return {
                    total: 1,
                    offset: 0,
                    limit: 10,
                    data: [
                        {
                            id: 'md-2',
                            attributes: { title: { en: 'No Cover Inline' }, year: 2020, status: 'ongoing' },
                            relationships: [{ type: 'cover_art', id: 'cover-1' }],
                        },
                    ],
                };
            }
            if (url.includes('/cover?')) {
                return {
                    data: [
                        { type: 'cover_art', attributes: { locale: 'en', fileName: 'fallback.jpg' } },
                    ],
                };
            }
            return { volumes: {} };
        };

        const results = await searchMangaDex(fetchJson, 'no cover');

        expect(results[0]).toMatchObject({
            id: 'md-2',
            image: 'https://uploads.mangadex.org/covers/md-2/fallback.jpg.512.jpg',
        });
    });
});
