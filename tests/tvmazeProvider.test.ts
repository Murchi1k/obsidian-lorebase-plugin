import { describe, expect, it } from 'vitest';
import { getTvmazeDetails, searchTvmaze } from '../src/services/integrations/providers/tvmaze';
import type { JsonFetcher } from '../src/services/integrations/providers/common';

describe('TVmaze provider', () => {
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
            format: 'Movie / TVmaze',
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
            format: 'Scripted',
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
