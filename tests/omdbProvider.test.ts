import { describe, expect, it } from 'vitest';
import { getOmdbDetails, searchOmdb } from '../src/services/integrations/providers/omdb';
import type { JsonFetcher } from '../src/services/integrations/providers/common';

describe('OMDb provider', () => {
    it('searches the correct media type and removes N/A posters', async () => {
        let requestedUrl = '';
        const fetchJson: JsonFetcher = async (url) => {
            requestedUrl = url;
            return {
                Search: [
                    { imdbID: 'tt0944947', Title: 'Game of Thrones', Year: '2011–2019', Type: 'series', Poster: 'N/A' },
                    { imdbID: 'tt0000002', Title: 'Second result', Year: '2012', Type: 'series', Poster: 'poster.jpg' },
                ],
            };
        };

        const results = await searchOmdb(fetchJson, 'game of thrones', 'api key', { kind: 'series', page: 2, pageSize: 1 });
        const url = new URL(requestedUrl);

        expect(url.searchParams.get('apikey')).toBe('api key');
        expect(url.searchParams.get('s')).toBe('game of thrones');
        expect(url.searchParams.get('type')).toBe('series');
        expect(url.searchParams.get('page')).toBe('2');
        expect(results).toEqual([{
            id: 'tt0944947',
            title: 'Game of Thrones',
            provider: 'omdb',
            image: '',
            year: '2011–2019',
            workType: undefined, workTypeMedia: 'series',
        }]);
    });

    it('builds series parts and community metadata from season requests', async () => {
        const fetchJson: JsonFetcher = async (url) => {
            const season = new URL(url).searchParams.get('Season');
            if (season) {
                return { Episodes: Array.from({ length: Number(season) + 2 }, (_, index) => ({ Episode: String(index + 1) })) };
            }
            return {
                Response: 'True',
                Title: 'Game of Thrones',
                Plot: 'Nine noble families fight for control.',
                Poster: 'https://cdn.example/got.jpg',
                Genre: 'Action, Adventure, Drama',
                Year: '2011–2019',
                Released: '17 Apr 2011',
                Runtime: '57 min',
                Director: 'N/A',
                Actors: 'Emilia Clarke, Peter Dinklage',
                Country: 'United States, United Kingdom',
                imdbRating: '9.2',
                imdbVotes: '2,345,678',
                totalSeasons: '2',
            };
        };

        const details = await getOmdbDetails(fetchJson, 'tt0944947', 'key', 'series');

        expect(details).toMatchObject({
            kind: 'video',
            name: 'Game of Thrones',
            genres: ['Action', 'Adventure', 'Drama'],
            director: '',
            actors: 'Emilia Clarke, Peter Dinklage',
            countries: ['US', 'GB'],
            communityRating: '9.2',
            communityVotes: '2345678',
            seasons: '2',
            episodeTotal: '7',
            url: 'https://www.imdb.com/title/tt0944947/',
        });
        expect(details?.parts).toEqual([
            expect.objectContaining({ id: 'season-1', seasonNumber: 1, episodeTotal: 3 }),
            expect.objectContaining({ id: 'season-2', seasonNumber: 2, episodeTotal: 4 }),
        ]);
    });

    it('returns null for provider-level error responses', async () => {
        const fetchJson: JsonFetcher = async () => ({ Response: 'False', Error: 'Incorrect IMDb ID.' });

        await expect(getOmdbDetails(fetchJson, 'bad-id', 'key', 'movies')).resolves.toBeNull();
    });
});
