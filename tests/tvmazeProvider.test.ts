import { describe, expect, it } from 'vitest';
import { getTvmazeDetails, searchTvmaze } from '../src/services/integrations/providers/tvmaze';
import type { JsonFetcher } from '../src/services/integrations/providers/common';

describe('TVmaze provider', () => {
    it('imports directors from crew rather than leaving the field empty', async () => {
        const details = await getTvmazeDetails(async url => {
            expect(url).toContain('embed[]=crew');
            return { name: 'Show', type: 'Scripted', _embedded: { crew: [
                { type: 'Director', person: { name: 'A' } }, { type: 'Director', person: { name: 'A' } }, { type: 'Writer', person: { name: 'B' } },
            ] } };
        }, '1', '', 'series');
        expect(details?.director).toBe('A');
    });
    it('imports the original network country and leaves absent country metadata unknown', async () => {
        const details = { id: 1, name: 'Example', type: 'Scripted', genres: [], _embedded: { seasons: [], cast: [] } };
        expect(await getTvmazeDetails(async () => ({ ...details, network: { country: { code: 'GB', name: 'United Kingdom' } } }), '1', '', 'series')).toMatchObject({ countries: ['GB'] });
        expect(await getTvmazeDetails(async () => details, '1', '', 'series')).toMatchObject({ countries: [] });
    });
    it('does not return scripted shows when searching movies', async () => {
        const fetchJson: JsonFetcher = async () => [
            {
                show: {
                    id: 1,
                    name: 'The Boys',
                    type: 'Scripted',
                    premiered: '2019-07-26',
                    image: { medium: 'poster.jpg' },
                },
            },
            {
                show: {
                    id: 2,
                    name: 'Movie Result',
                    type: 'Movie',
                    premiered: '2020-01-01',
                    image: { medium: 'movie.jpg' },
                },
            },
        ];

        const results = await searchTvmaze(fetchJson, 'boys', '', { kind: 'movies' });

        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({
            id: '2',
            title: 'Movie Result',
            workType: 'Movie', workTypeMedia: 'movie',
        });
    });

    it('keeps scripted shows when searching series', async () => {
        const fetchJson: JsonFetcher = async () => [
            {
                show: {
                    id: 1,
                    name: 'The Boys',
                    type: 'Scripted',
                    premiered: '2019-07-26',
                    image: { medium: 'poster.jpg' },
                },
            },
        ];

        const results = await searchTvmaze(fetchJson, 'boys', '', { kind: 'series' });

        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({
            id: '1',
            title: 'The Boys',
            workType: 'Series', workTypeMedia: 'series',
        });
    });

    it('rejects scripted show details for movie imports', async () => {
        const fetchJson: JsonFetcher = async () => ({
            id: 1,
            name: 'The Boys',
            type: 'Scripted',
            premiered: '2019-07-26',
            image: { medium: 'poster.jpg' },
            _embedded: { seasons: [] },
        });

        const details = await getTvmazeDetails(fetchJson, '1', '', 'movies');

        expect(details).toBeNull();
    });
});
