import { afterEach, describe, expect, it } from 'vitest';
import { __setRequestUrlMock } from './mocks/obsidian';
import { getAniListMangaDetails, searchAniListManga } from '../src/services/integrations/providers/anilist';
import type { JsonFetcher } from '../src/services/integrations/providers/common';
import { getGoogleBooksDetails, searchGoogleBooks } from '../src/services/integrations/providers/googlebooks';
import { getHardcoverBookDetails, searchHardcoverBooks } from '../src/services/integrations/providers/hardcover';
import { getJikanMangaDetails, searchJikanManga } from '../src/services/integrations/providers/jikan';
import { getMangaDexDetails, searchMangaDex } from '../src/services/integrations/providers/mangadex';
import { getShikimoriMangaDetails, searchShikimoriManga } from '../src/services/integrations/providers/shikimori';

describe('reading providers', () => {
    afterEach(() => {
        __setRequestUrlMock(null);
    });

    it('maps Hardcover search and GraphQL book details', async () => {
        const fetchJson: JsonFetcher = async (_url, headers, _method, body) => {
            expect(headers?.Authorization).toBe('Bearer token-1');
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

        const results = await searchHardcoverBooks(fetchJson, 'way of kings', 'token-1');
        const details = await getHardcoverBookDetails(fetchJson, results[0].id, 'token-1');

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
                        startDate: { year: 1989 },
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
        });
        expect(details?.parts).toHaveLength(41);
        expect(details?.parts?.[0]).toMatchObject({ volumeNumber: 1, chapterTotal: 9 });
    });

    it('maps Shikimori manga search and details', async () => {
        const fetchJson: JsonFetcher = async (url) => {
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
            chapters: '364',
            volumes: '41',
            rating: '8.9',
        });
        expect(details?.parts).toHaveLength(41);
    });

    it('maps Jikan manga search/details and tolerates empty failure payloads', async () => {
        const empty = await searchJikanManga(async () => ({ status: 504, message: 'timeout' }), 'berserk');
        expect(empty).toEqual([]);

        const fetchJson: JsonFetcher = async (url) => {
            if (url.includes('/manga?')) {
                return {
                    pagination: { has_next_page: false },
                    data: [
                        {
                            mal_id: 2,
                            title: 'Berserk',
                            title_japanese: 'Berserk',
                            type: 'Manga',
                            images: { jpg: { large_image_url: 'https://cdn.example/berserk.jpg' } },
                            published: { from: '1989-08-25T00:00:00+00:00' },
                        },
                    ],
                };
            }
            return {
                data: {
                    mal_id: 2,
                    title: 'Berserk',
                    synopsis: '<p>Dark fantasy.</p>',
                    score: 9.3,
                    chapters: 364,
                    volumes: 41,
                    url: 'https://myanimelist.net/manga/2',
                    images: { jpg: { large_image_url: 'https://cdn.example/berserk.jpg' } },
                    published: { from: '1989-08-25T00:00:00+00:00' },
                    authors: [{ name: 'Kentaro Miura' }],
                    genres: [{ name: 'Action' }],
                    themes: [{ name: 'Gore' }],
                    demographics: [{ name: 'Seinen' }],
                },
            };
        };

        const results = await searchJikanManga(fetchJson, 'berserk');
        const details = await getJikanMangaDetails(fetchJson, results[0].id);

        expect(results[0]).toMatchObject({ id: '2', title: 'Berserk', provider: 'jikan' });
        expect(details).toMatchObject({
            kind: 'manga',
            name: 'Berserk',
            authors: ['Kentaro Miura'],
            chapters: '364',
            volumes: '41',
            rating: '9.3',
        });
        expect(details?.genres).toEqual(['Action', 'Gore', 'Seinen']);
        expect(details?.parts).toHaveLength(41);
    });

    it('maps Jikan numeric search through details endpoint', async () => {
        const calls: string[] = [];
        const results = await searchJikanManga(async (url) => {
            calls.push(url);
            return {
                data: {
                    mal_id: 2,
                    title: 'Berserk',
                    score: 9.3,
                    chapters: 364,
                    volumes: 41,
                    images: { jpg: { large_image_url: 'https://cdn.example/berserk.jpg' } },
                    published: { from: '1989-08-25T00:00:00+00:00' },
                    authors: [{ name: 'Kentaro Miura' }],
                },
            };
        }, '2');

        expect(calls).toEqual(['https://api.jikan.moe/v4/manga/2']);
        expect(results[0]).toMatchObject({
            id: '2',
            title: 'Berserk',
            provider: 'jikan',
            image: 'https://cdn.example/berserk.jpg',
            year: '1989',
        });
    });

    it('falls back to MyAnimeList page when Jikan manga search is unavailable', async () => {
        __setRequestUrlMock(() => ({
            text: `
                <tr>
                    <td><a href="https://myanimelist.net/manga/2/Berserk" data-l-content-id="2" data-l-content-type="manga">
                        <img alt="Berserk" data-src="https://cdn.myanimelist.net/r/50x70/images/manga/1/157897.jpg?s=x" />
                    </a></td>
                    <td><a href="https://myanimelist.net/manga/2/Berserk"><strong>Berserk</strong></a></td>
                    <td class="borderClass ac bgColor0">Manga</td>
                </tr>
            `,
        }));

        const results = await searchJikanManga(async () => {
            throw new Error('Request failed, status 504');
        }, 'berserk');

        expect(results[0]).toMatchObject({
            id: '2',
            title: 'Berserk',
            provider: 'jikan',
            image: 'https://cdn.myanimelist.net/images/manga/1/157897.jpg',
            format: 'Manga',
        });
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

        expect(results[0]).toMatchObject({ id: 'md-1', title: 'Akame ga Kill!', provider: 'mangadex' });
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
