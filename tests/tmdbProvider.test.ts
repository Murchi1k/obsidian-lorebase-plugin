import { describe, expect, it } from 'vitest';
import { getTmdbDetails, normalizeTmdbLanguage, searchTmdb } from '../src/services/integrations/providers/tmdb';
import type { JsonFetcher } from '../src/services/integrations/providers/common';
import { IntegrationService } from '../src/services/IntegrationService';
import { DEFAULT_SETTINGS } from '../src/constants';
import { createMockApp } from './helpers/testHelpers';

describe('TMDB provider', () => {
    it('imports directors from film crew and all-season TV crew without using creators as directors', async () => {
        for (const kind of ['movies', 'series'] as const) {
            const details = await getTmdbDetails(async url => {
                expect(new URL(url).searchParams.get('append_to_response')).toBe(kind === 'series' ? 'credits,aggregate_credits' : 'credits');
                return { title: 'Film', name: 'Show', created_by: [{ name: 'Creator' }],
                    credits: { crew: [{ name: 'Director A', job: 'Director' }, { name: 'Writer', job: 'Writer' }] },
                    ...(kind === 'series' ? { aggregate_credits: { crew: [{ name: 'Director A', jobs: [{ job: 'Director' }] }, { name: 'Director B', jobs: [{ job: 'Director' }] }] } } : {}),
                };
            }, '1', 'key', kind);
            expect(details?.director).toBe(kind === 'series' ? 'Director A, Director B' : 'Director A');
        }
    });
    it('retains production-country codes without extra requests for geography', async () => {
        const details = await getTmdbDetails(async () => ({ id: 1, title: 'Film', production_countries: [{ iso_3166_1: 'FR' }, { iso_3166_1: 'US' }], origin_country: ['FR'] }), '1', 'key', 'movies', 'en-US');
        expect(details?.countries).toEqual(['FR', 'US']);
    });
    it('keeps English as the default and validates persisted language values', () => {
        expect(normalizeTmdbLanguage(undefined)).toBe('en-US');
        expect(normalizeTmdbLanguage('invalid')).toBe('en-US');
        expect(normalizeTmdbLanguage(' UK-ua ')).toBe('uk-UA');
    });

    it('requests localized search results, metadata and posters for both media kinds', async () => {
        for (const kind of ['movies', 'series'] as const) {
            const payload = { id: 1, title: 'Назва', name: 'Назва', overview: 'Опис', poster_path: '/uk.jpg', genres: [{ name: 'Драма' }], seasons: [{ id: 2, season_number: 1, name: 'Сезон 1', episode_count: 8 }] };
            const fetchJson: JsonFetcher = async url => {
                expect(new URL(url).searchParams.get('language')).toBe('uk-UA');
                return url.includes('/search/') ? { results: [payload] } : payload;
            };
            const results = await searchTmdb(fetchJson, 'query', 'key', { kind, language: 'uk-UA' });
            const details = await getTmdbDetails(fetchJson, '1', 'key', kind, 'uk-UA');
            expect(results[0].title).toBe('Назва');
            expect(details).toMatchObject({ name: 'Назва', description: 'Опис', genres: ['Драма'], poster: 'https://image.tmdb.org/t/p/w500/uk.jpg' });
            if (kind === 'series') expect(details?.parts?.[0].title).toBe('Сезон 1');
        }
    });

    it('uses independent movie/series settings and invalidates search results when language changes', async () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.integrations!.media.movies.tmdbLanguage = 'uk-UA';
        settings.integrations!.media.series.tmdbLanguage = 'ru-RU';
        const service = new IntegrationService(createMockApp({}), () => settings) as unknown as {
            jsonFetcher: JsonFetcher;
            search(provider: 'tmdb', query: string, key: string, secret: string, options: { tmdbLanguage?: string }, kind: 'movies' | 'series'): Promise<{ title: string; tmdbLanguage?: string }[]>;
            fetchDetails(provider: 'tmdb', id: string, key: string, secret: string, kind: 'movies' | 'series', options?: { tmdbLanguage?: string }): Promise<{ name: string }>;
        };
        const requests: string[] = [];
        service.jsonFetcher = async url => {
            requests.push(url);
            const language = new URL(url).searchParams.get('language');
            const payload = { id: 1, title: language, name: language };
            return url.includes('/search/') ? { results: [payload] } : payload;
        };
        expect((await service.search('tmdb', 'same query', 'key', '', {}, 'movies'))[0].title).toBe('uk-UA');
        await service.search('tmdb', 'same query', 'key', '', {}, 'movies');
        expect(requests).toHaveLength(1);
        settings.integrations!.media.movies.tmdbLanguage = 'ja-JP';
        expect((await service.search('tmdb', 'same query', 'key', '', {}, 'movies'))[0].title).toBe('ja-JP');
        expect((await service.search('tmdb', 'same query', 'key', '', {}, 'series'))[0].title).toBe('ru-RU');
        expect((await service.fetchDetails('tmdb', '1', 'key', '', 'movies')).name).toBe('ja-JP');
        expect((await service.fetchDetails('tmdb', '1', 'key', '', 'series')).name).toBe('ru-RU');
        expect(requests).toHaveLength(5);
        const [selected] = await service.search('tmdb', 'same query', 'key', '', { tmdbLanguage: 'de-DE' }, 'movies');
        expect(selected).toMatchObject({ title: 'de-DE', tmdbLanguage: 'de-DE' });
        expect((await service.fetchDetails('tmdb', '1', 'key', '', 'movies', { tmdbLanguage: selected.tmdbLanguage })).name).toBe('de-DE');
        expect(settings.integrations!.media.movies.tmdbLanguage).toBe('ja-JP');
    });
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
            workType: undefined, workTypeMedia: 'movie',
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
            workType: undefined, workTypeMedia: 'series',
        });
    });

    it('fills missing show runtimes from actual season episode runtimes', async () => {
        const fetchJson: JsonFetcher = async url => {
            if (url.includes('/season/1')) return { episodes: [{ runtime: 50 }, { runtime: 60 }, { runtime: null }] };
            if (url.includes('/season/2')) return { episodes: [{ runtime: 65 }, { runtime: 75 }] };
            return { name: 'Show', episode_run_time: [], seasons: [
                { id: 1, season_number: 1, episode_count: 3 },
                { id: 2, season_number: 2, episode_count: 2 },
            ] };
        };
        const details = await getTmdbDetails(fetchJson, '1', 'key', 'series');
        expect(details?.parts?.map(part => part.episodeDuration)).toEqual([55, 70]);
    });
    it('keeps seasons usable when their runtime cannot be fetched', async () => {
        const fetchJson: JsonFetcher = async url => {
            if (url.includes('/season/')) throw new Error('Unavailable');
            return { name: 'Show', episode_run_time: [], seasons: [{ id: 1, season_number: 1, episode_count: 8 }] };
        };
        const details = await getTmdbDetails(fetchJson, '1', 'key', 'series');
        expect(details?.parts?.[0]).toMatchObject({ episodeTotal: 8, episodeDuration: null });
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
