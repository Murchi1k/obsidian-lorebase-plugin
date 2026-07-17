import { describe, expect, it } from 'vitest';
import { getTmdbDetails, searchTmdb } from '../src/services/integrations/providers/tmdb';
import type { JsonFetcher } from '../src/services/integrations/providers/common';

describe('TMDB provider', () => {
    it('searches movies with TMDB metadata', async () => {
        const fetchJson: JsonFetcher = async () => ({
            results: [
                {
                    id: 550,
                    title: 'Fight Club',
                    release_date: '1999-10-15',
                    poster_path: '/poster.jpg',
                },
            ],
        });

        const results = await searchTmdb(fetchJson, 'fight club', 'key', { kind: 'movies' });

        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({
            id: '550',
            title: 'Fight Club',
            provider: 'tmdb',
            year: '1999',
            format: 'Movie / TMDB',
            image: 'https://image.tmdb.org/t/p/w500/poster.jpg',
        });
    });

    it('searches series separately from movies', async () => {
        const fetchJson: JsonFetcher = async (url) => {
            expect(url).toContain('/search/tv');
            return {
                results: [
                    {
                        id: 76479,
                        name: 'The Boys',
                        first_air_date: '2019-07-25',
                        poster_path: '/boys.jpg',
                    },
                ],
            };
        };

        const results = await searchTmdb(fetchJson, 'the boys', 'key', { kind: 'series' });

        expect(results[0]).toMatchObject({
            id: '76479',
            title: 'The Boys',
            format: 'TV / TMDB',
        });
    });

    it('builds TV parts from TMDB seasons', async () => {
        const fetchJson: JsonFetcher = async (url) => {
            expect(url).toContain('/tv/76479');
            return {
                id: 76479,
                name: 'The Boys',
                overview: 'Superhero satire.',
                first_air_date: '2019-07-25',
                poster_path: '/poster.jpg',
                backdrop_path: '/backdrop.jpg',
                vote_average: 8.4,
                genres: [{ name: 'Drama' }],
                networks: [{ name: 'Prime Video' }],
                production_companies: [{ name: 'Amazon Studios' }],
                episode_run_time: [60],
                seasons: [
                    { id: 1, season_number: 0, name: 'Specials', episode_count: 2 },
                    { id: 2, season_number: 1, name: 'Season 1', episode_count: 8 },
                    { id: 3, season_number: 2, name: 'Season 2', episode_count: 8 },
                ],
                credits: { cast: [{ name: 'Karl Urban' }, { name: 'Jack Quaid' }] },
            };
        };

        const details = await getTmdbDetails(fetchJson, '76479', 'key', 'series');

        expect(details).toMatchObject({
            name: 'The Boys',
            year: '2019',
            runtime: '60 min',
            seasons: '2',
            episodeTotal: '16',
            networks: ['Prime Video'],
            studios: ['Amazon Studios'],
        });
        expect(details?.parts).toHaveLength(2);
        expect(details?.parts?.[0]).toMatchObject({
            kind: 'season',
            seasonNumber: 1,
            episodeTotal: 8,
        });
    });
});
