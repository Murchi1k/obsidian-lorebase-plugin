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
                format: 'TV',
                image: 'https://cdn.example/naruto.jpg',
                provider: 'shikimori',
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
            name: 'Наруто',
            description: 'Anime about ninjas.',
            image: 'https://cdn.example/naruto-main.jpg',
            imageHorizontal: 'https://cdn.example/naruto-main.jpg',
            tags: ['Экшен'],
            studios: ['Pierrot'],
            year: '2002',
            imdbRating: '7.99',
            url: 'https://shikimori.io/animes/20-naruto',
            format: 'TV',
            parts: [
                {
                    id: 'shikimori-20',
                    kind: 'tv',
                    title: 'Наруто',
                    seasonNumber: 1,
                    episodeCurrent: 0,
                    episodeTotal: null,
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
});
