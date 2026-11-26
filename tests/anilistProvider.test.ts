import { describe, expect, it } from 'vitest';
import { enrichAnimeSearchCountries, getAniListDetails, searchAniList } from '../src/services/integrations/providers/anilist';
import type { SearchResult } from '../src/services/integrations/types';
import type { JsonFetcher } from '../src/services/integrations/providers/common';

describe('AniList anime provider', () => {
    it('resolves countries using exact MAL IDs and leaves unmatched countries unknown', async () => {
        const items: SearchResult[] = [
            { id: '1', malId: '5114', title: 'Anime', provider: 'jikan' },
            { id: '2', malId: '999999999', title: 'Unmatched', provider: 'shikimori' },
            { id: '3', malId: '123', title: 'Known', provider: 'jikan', countryOfOrigin: 'CN' },
        ];
        let sent: any;
        await enrichAnimeSearchCountries(async (_url, _headers, _method, body) => {
            sent = JSON.parse(body!);
            return { data: { Page: { media: [{ idMal: 5114, countryOfOrigin: 'JP' }] } } };
        }, items);
        expect(sent.variables).toEqual({ ids: [5114, 999999999] });
        expect(sent.query).toContain('idMal_in');
        expect(items.map(item => item.countryOfOrigin)).toEqual(['JP', undefined, 'CN']);
        await enrichAnimeSearchCountries(async () => { throw new Error('offline'); }, [{ id: '4', malId: '4', title: 'Offline', provider: 'jikan' }]);
    });
    it('sends paged GraphQL search variables and maps anime results', async () => {
        let request: { url: string; method?: string; body?: string } | null = null;
        const fetchJson: JsonFetcher = async (url, _headers, method, body) => {
            request = { url, method, body };
            return {
                data: {
                    Page: {
                        pageInfo: { hasNextPage: true },
                        media: [{
                            id: 5114,
                            title: {
                                english: 'Fullmetal Alchemist: Brotherhood',
                                romaji: 'Hagane no Renkinjutsushi: Fullmetal Alchemist',
                            },
                            startDate: { year: 2009, month: 4, day: 5 },
                            format: 'TV',
                            countryOfOrigin: 'JP',
                            coverImage: { large: 'https://cdn.example/fmab.jpg' },
                        }],
                    },
                },
            };
        };

        const results = await searchAniList(fetchJson, 'fullmetal', { page: 3, pageSize: 7 });
        expect(results[0].released).toBe('2009-04-05');
        const payload = JSON.parse(request?.body ?? '{}');

        expect(request).toMatchObject({ url: 'https://graphql.anilist.co', method: 'POST' });
        expect(payload.variables).toEqual({ search: 'fullmetal', page: 3, perPage: 7 });
        expect(payload.query).toContain('type: ANIME');
        expect(results[0]).toMatchObject({
            id: '5114',
            title: 'Fullmetal Alchemist: Brotherhood',
            provider: 'anilist',
            year: '2009',
            format: 'TV',
            countryOfOrigin: 'JP',
            image: 'https://cdn.example/fmab.jpg',
        });
        expect((results as typeof results & { hasNext?: boolean }).hasNext).toBe(true);
    });

    it('maps anime details, votes, studios, and sorted related parts', async () => {
        const fetchJson: JsonFetcher = async (_url, _headers, _method, body) => {
            expect(JSON.parse(String(body)).variables).toEqual({ id: 5114 });
            return {
                data: {
                    Media: {
                        id: 5114,
                        type: 'ANIME',
                        title: { english: 'Fullmetal Alchemist: Brotherhood' },
                        description: 'Two brothers seek the <b>Philosopher\'s Stone</b>.',
                        genres: ['Action', 'Adventure'],
                        episodes: 64,
                        duration: 24,
                        studios: { nodes: [{ name: 'Bones' }] },
                        startDate: { year: 2009, month: 4, day: 5 },
                        averageScore: 91,
                        stats: { scoreDistribution: [{ amount: 100 }, { amount: 250 }] },
                        siteUrl: 'https://anilist.co/anime/5114',
                        format: 'TV',
                        coverImage: { extraLarge: 'https://cdn.example/fmab-xl.jpg' },
                        relations: {
                            edges: [
                                {
                                    relationType: 'PREQUEL',
                                    node: {
                                        id: 121,
                                        type: 'ANIME',
                                        title: { english: 'Fullmetal Alchemist' },
                                        format: 'TV',
                                        episodes: 51,
                                        startDate: { year: 2003 },
                                    },
                                },
                                {
                                    relationType: 'SIDE_STORY',
                                    node: {
                                        id: 9135,
                                        type: 'ANIME',
                                        title: { english: 'The Sacred Star of Milos' },
                                        format: 'MOVIE',
                                        episodes: 1,
                                        startDate: { year: 2011 },
                                    },
                                },
                                {
                                    relationType: 'CHARACTER',
                                    node: { id: 999, type: 'ANIME', title: { english: 'Ignored' } },
                                },
                            ],
                        },
                    },
                },
            };
        };

        const details = await getAniListDetails(fetchJson, '5114');

        expect(details).toMatchObject({
            kind: 'anime',
            name: 'Fullmetal Alchemist: Brotherhood',
            description: "Two brothers seek the Philosopher's Stone.",
            genres: ['Action', 'Adventure'],
            tags: [],
            studios: ['Bones'],
            year: '2009',
            released: '2009-04-05',
            communityRating: '9.1',
            communityVotes: '350',
            format: 'TV',
            url: 'https://anilist.co/anime/5114',
        });
        expect(details?.parts).toEqual([
            expect.objectContaining({ id: 'anilist-121', kind: 'tv', seasonNumber: 1, episodeTotal: 51 }),
            expect.objectContaining({ id: 'anilist-5114', kind: 'tv', seasonNumber: 2, episodeTotal: 64, episodeDuration: 24, poster: 'https://cdn.example/fmab-xl.jpg', year: 2009 }),
            expect.objectContaining({ id: 'anilist-9135', kind: 'movie', seasonNumber: null, episodeTotal: 1 }),
        ]);
    });
});
