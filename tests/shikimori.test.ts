import { describe, expect, it } from 'vitest';
import { getShikimoriDetails, searchShikimori } from '../src/services/integrations/providers/shikimori';
import { JsonFetcher } from '../src/services/integrations/providers/common';

describe('shikimori provider', () => {
    it('uses GraphQL search before legacy v1 results', async () => {
        const fetchJson: JsonFetcher = async (
            url: string,
            _headers = {},
            method = 'GET'
        ) => {
            if (method === 'GET' && url.includes('/api/animes?')) {
                return [];
            }
            if (method === 'POST' && url.endsWith('/api/graphql')) {
                return {
                    data: {
                        animes: [
                            {
                                id: '20',
                                name: 'Naruto',
                                russian: 'Наруто',
                                kind: 'tv',
                                score: '7.99',
                                status: 'released',
                                airedOn: { year: 2002, date: '2002-10-03' },
                                poster: { originalUrl: 'https://cdn.example/naruto.jpg' },
                            },
                        ],
                    },
                };
            }
            return null;
        };

        const results = await searchShikimori(fetchJson, 'naruto');

        expect(results).toEqual([
            {
                id: '20',
                title: 'Наруто',
                subtitle: 'Naruto',
                year: '2002',
                released: '2002-10-03',
                format: 'TV',
                image: 'https://cdn.example/naruto.jpg',
                provider: 'shikimori',
                isAdult: false,
            },
        ]);
    });

    it('uses GraphQL details before legacy v1 details', async () => {
        const fetchJson: JsonFetcher = async (
            url: string,
            _headers = {},
            method = 'GET'
        ) => {
            if (method === 'GET' && url.includes('/api/animes/20')) {
                return null;
            }
            if (method === 'POST' && url.endsWith('/api/graphql')) {
                return {
                    data: {
                        animes: [
                            {
                                id: '20',
                                name: 'Naruto',
                                russian: 'Наруто',
                                description: '<p>Anime about ninjas.</p>',
                                kind: 'tv',
                                score: '7.99',
                                url: 'https://shikimori.one/animes/20-naruto',
                                airedOn: { year: 2002, date: '2002-10-03' },
                                poster: { mainUrl: 'https://cdn.example/naruto-main.jpg' },
                                genres: [{ name: 'Action', russian: 'Экшен' }],
                                studios: [{ name: 'Pierrot' }],
                            },
                        ],
                    },
                };
            }
            return null;
        };

        const details = await getShikimoriDetails(fetchJson, '20');

        expect(details).toEqual({
            kind: 'anime',
            isAdult: false,
            alternativeTitles: [
                { title: 'Naruto', language: 'romaji' },
                { title: 'Наруто', language: 'ru' },
            ],
            name: 'Наруто',
            description: 'Anime about ninjas.',
            image: 'https://cdn.example/naruto-main.jpg',
            imageHorizontal: 'https://cdn.example/naruto-main.jpg',
            genres: ['Экшен'],
            tags: [],
            studios: ['Pierrot'],
            year: '2002',
            released: '2002-10-03',
            imdbRating: '7.99',
            communityRating: '7.99',
            url: 'https://shikimori.net/animes/z20-naruto',
            format: 'TV',
            parts: [
                {
                    id: 'shikimori-20',
                alternativeTitles: ['Naruto'],
                    kind: 'tv',
                    title: 'Наруто',
                    seasonNumber: 1,
                    episodeCurrent: 0,
                    episodeTotal: null,
                    episodeDuration: null,
                    poster: 'https://cdn.example/naruto-main.jpg',
                    releaseDate: '2002-10-03',
                    year: 2002,
                    status: 'planned',
                },
            ],
        });
    });

    it('prefers GraphQL original poster over legacy v1 poster', async () => {
        const fetchJson: JsonFetcher = async (
            url: string,
            _headers = {},
            method = 'GET'
        ) => {
            if (method === 'POST' && url.endsWith('/api/graphql')) {
                return {
                    data: {
                        animes: [
                            {
                                id: '52991',
                                name: 'Sousou no Frieren',
                                russian: 'Frieren',
                                description: '',
                                kind: 'tv',
                                score: '9.1',
                                url: 'https://shikimori.one/animes/52991-sousou-no-frieren',
                                airedOn: { year: 2023, date: '2023-09-29' },
                                poster: { originalUrl: 'https://cdn.example/frieren-original.jpg', mainUrl: 'https://cdn.example/frieren-main.jpg' },
                                genres: [],
                                studios: [],
                            },
                        ],
                    },
                };
            }
            if (method === 'GET' && url.includes('/api/animes/52991')) {
                return {
                    id: 52991,
                    name: 'Sousou no Frieren',
                    russian: 'Frieren',
                    image: { original: '/system/animes/original/52991.jpg' },
                };
            }
            return null;
        };

        const details = await getShikimoriDetails(fetchJson, '52991');

        expect(details?.image).toBe('https://cdn.example/frieren-original.jpg');
    });

    it('uses the next mirror when a Shikimori endpoint returns 404', async () => {
        const calls: string[] = [];
        const fetchJson: JsonFetcher = async (url, _headers, method = 'GET') => {
            calls.push(url);
            if (method === 'POST' && url.startsWith('https://shikimori.net/')) {
                throw Object.assign(new Error('HTTP 404'), { status: 404 });
            }
            if (method === 'POST' && url.startsWith('https://shikimori.io/')) {
                return {
                    data: {
                        animes: [{
                            id: '20',
                            name: 'Naruto',
                            russian: 'Наруто',
                            kind: 'tv',
                            airedOn: { year: 2002 },
                            poster: {},
                        }],
                    },
                };
            }
            return [];
        };

        const results = await searchShikimori(fetchJson, 'naruto');

        expect(results[0]?.id).toBe('20');
        expect(calls.slice(0, 2)).toEqual([
            'https://shikimori.net/api/graphql',
            'https://shikimori.io/api/graphql',
        ]);
    });

    it('accepts an empty GraphQL result without probing a failing mirror', async () => {
        const calls: string[] = [];
        const fetchJson: JsonFetcher = async (url) => {
            calls.push(url);
            if (url.startsWith('https://shikimori.net/')) return { data: { animes: [] } };
            throw Object.assign(new Error('HTTP 404'), { status: 404 });
        };

        await expect(searchShikimori(fetchJson, 'missing title')).resolves.toEqual([]);
        expect(calls).toEqual(['https://shikimori.net/api/graphql']);
    });

    it('uses the current z-prefixed route for REST detail fallbacks', async () => {
        const fetchJson: JsonFetcher = async (url, _headers, method = 'GET') => {
            if (method === 'POST') return null;
            if (url.includes('/related')) return [];
            return {
                id: 20,
                name: 'Naruto',
                image: {},
                genres: [],
                studios: [],
            };
        };

        const details = await getShikimoriDetails(fetchJson, '20');

        expect(details?.url).toBe('https://shikimori.net/animes/z20');
    });
});
