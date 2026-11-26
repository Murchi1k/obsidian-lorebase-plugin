import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/constants';
import { RecommendationsService, type RecommendationTitle } from '../src/services/RecommendationsService';
import { anilistRecommendations, shikimoriRecommendations, tmdbRecommendations } from '../src/services/integrations/providers/recommendations';
import type { JsonFetcher } from '../src/services/integrations/providers/common';

const movies = Array.from({ length: 10 }, (_, index) => ({ id: index + 20, title: `Movie ${index}`, poster_path: `/image${index}.jpg`, release_date: '2024-02-01' }));
const animeMedia = (id: number) => ({ id, type: 'ANIME', title: { english: `Anime ${id}` }, coverImage: { medium: `https://s4.anilist.co/${id}.jpg` }, startDate: { year: 2020 } });
const animeResponse = { data: { Media: { id: 120377, recommendations: { nodes: Array.from({ length: 12 }, (_, n) => ({ mediaRecommendation: animeMedia(n + 1) })) } } } };
function fixture() {
    const settings = structuredClone(DEFAULT_SETTINGS); settings.integrations!.enabled = true;
    for (const provider of ['tmdb', 'anilist', 'shikimori', 'kitsu'] as const) settings.integrations!.providers[provider].enabled = true;
    settings.integrations!.providers.tmdb.apiKey = 'key'; settings.integrations!.media.movies.tmdbLanguage = 'ru-RU';
    const fetch = vi.fn<JsonFetcher>(async url => url.includes('anilist') ? animeResponse : { results: movies });
    const service = new RecommendationsService(() => settings, fetch);
    const movie = { type: 'movie', displayName: 'Original', integrationProvider: 'tmdb', integrationId: '10' } as RecommendationTitle;
    return { settings, fetch, service, movie };
}
afterEach(() => { vi.useRealTimers(); });
describe('catalog recommendations', () => {
    it('keeps source order, removes self/duplicates/adult titles and caps the row at seven', async () => {
        const fetch = vi.fn(async () => ({ results: [{ ...movies[0], id: 10 }, movies[1], movies[1], { ...movies[2], adult: true }, ...movies.slice(3)] }));
        const result = await tmdbRecommendations(fetch, 'movie', '10', 'key', 'ru-RU');
        expect(result.items.map(item => item.id)).toEqual(['21', '23', '24', '25', '26', '27', '28']);
        expect(result.items[0]).toMatchObject({ title: 'Movie 1', year: '2024', image: 'https://image.tmdb.org/t/p/w185/image1.jpg', url: 'https://www.themoviedb.org/movie/21' });
        expect(fetch).toHaveBeenCalledTimes(1); expect(fetch.mock.calls[0][0]).toContain('language=ru-RU');
    });
    it('uses similar titles only when the recommendation list is short', async () => {
        const fetch: JsonFetcher = vi.fn(async url => ({ results: url.includes('/recommendations') ? movies.slice(0, 2) : [movies[0], ...movies.slice(2)] }));
        expect((await tmdbRecommendations(fetch, 'series', '10', 'key', 'en-US')).items).toHaveLength(7);
        expect(fetch).toHaveBeenCalledTimes(2); expect(vi.mocked(fetch).mock.calls[1][0]).toContain('/tv/10/similar');
    });
    it('does not replace a real empty response with fabricated or local recommendations', async () => {
        expect((await tmdbRecommendations(async () => ({ results: [] }), 'movie', '10', 'key', 'en-US')).items).toEqual([]);
        await expect(tmdbRecommendations(async () => ({}), 'movie', '10', 'key', 'en-US')).rejects.toThrow();
    });
    it('reads AniList user recommendations, not franchise relations, and uses canonical source links', async () => {
        const response = structuredClone(animeResponse);
        response.data.Media.recommendations.nodes.unshift({ mediaRecommendation: animeMedia(120377) });
        response.data.Media.recommendations.nodes[2].mediaRecommendation.type = 'MANGA';
        const fetch = vi.fn(async () => response);
        const result = await anilistRecommendations(fetch, '120377', false, false);
        expect(result.items).toHaveLength(7); expect(result.items.map(item => item.id)).not.toContain('120377'); expect(result.items.map(item => item.id)).not.toContain('2');
        expect(result.items[0].url).toBe('https://anilist.co/anime/1');
        const call = vi.mocked(fetch).mock.calls[0] as unknown as [string, object, string, string];
        expect(JSON.parse(call[3]).query).toContain('recommendations(sort: RATING_DESC'); expect(JSON.parse(call[3]).query).not.toContain('relations');
    });
    it('treats GraphQL errors as a retryable failure rather than an empty list', async () => {
        await expect(anilistRecommendations(async () => ({ errors: [{ message: 'Rate limited' }], data: null }), '1', false, false)).rejects.toThrow();
    });
    it('prefers full-size anime covers and falls back to smaller trusted images when unavailable', async () => {
        const covers = [
            { extraLarge: 'https://s4.anilist.co/full.jpg', large: 'https://s4.anilist.co/large.jpg', medium: 'https://s4.anilist.co/small.jpg' },
            { large: 'https://s4.anilist.co/large.jpg', medium: 'https://s4.anilist.co/small.jpg' },
            { extraLarge: 'https://untrusted.example/cover.jpg', large: 'https://s4.anilist.co/fallback.jpg' },
            { medium: 'https://s4.anilist.co/small.jpg' },
            {},
        ];
        const fetch = vi.fn(async () => ({ data: { Media: { id: 120377, recommendations: { nodes: covers.map((coverImage, index) => ({ mediaRecommendation: { ...animeMedia(index + 1), coverImage } })) } } } }));
        const result = await anilistRecommendations(fetch, '120377', false, false);
        expect(result.items.map(item => item.image)).toEqual(['https://s4.anilist.co/full.jpg', 'https://s4.anilist.co/large.jpg', 'https://s4.anilist.co/fallback.jpg', 'https://s4.anilist.co/small.jpg', '']);
        const call = fetch.mock.calls[0] as unknown as [string, object, string, string];
        expect(JSON.parse(call[3]).query).toContain('coverImage { extraLarge large medium }');
    });
    it('uses the Shikimori similar endpoint and localized names without following supplied links', async () => {
        const fetch = vi.fn(async () => [{ id: 2, name: 'Other', russian: 'Другой', image: { original: '/system/original/2.jpg', preview: '/system/2.jpg' }, aired_on: '2018-01-01', url: 'javascript:bad' },
            { id: 3, name: 'Preview only', image: { preview: '/system/3.jpg' } }]);
        const result = await shikimoriRecommendations(fetch, '1', 'ru', false);
        expect(fetch).toHaveBeenCalledWith('https://shikimori.net/api/animes/1/similar', expect.anything());
        expect(result.items[0]).toMatchObject({ title: 'Другой', image: 'https://shikimori.net/system/original/2.jpg', url: 'https://shikimori.net/animes/2', year: '2018' });
        expect(result.items[1].image).toBe('https://shikimori.net/system/3.jpg');
    });
});
describe('recommendations session service', () => {
    it('coalesces requests in memory and respects changes to language and enabled providers', async () => {
        const { service, fetch, movie, settings } = fixture();
        const [first, second] = await Promise.all([service.load(movie), service.load(movie)]);
        expect(first).toBe(second); expect(fetch).toHaveBeenCalledTimes(1);
        settings.integrations!.media.movies.tmdbLanguage = 'uk-UA'; await service.load(movie); expect(fetch).toHaveBeenCalledTimes(2);
        settings.integrations!.providers.tmdb.enabled = false; await expect(service.load(movie)).rejects.toThrow('RECOMMENDATIONS_TMDB'); expect(fetch).toHaveBeenCalledTimes(2);
    });
    it('expires cached data and evicts rejected requests so retry can recover', async () => {
        vi.useFakeTimers(); const { service, fetch, movie } = fixture();
        fetch.mockRejectedValueOnce(new Error('Offline'));
        await expect(service.load(movie)).rejects.toThrow('Offline'); await service.load(movie); expect(fetch).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(15 * 60_000 + 1); await service.load(movie); expect(fetch).toHaveBeenCalledTimes(3);
    });
    it('does not make a fuzzy search or query an untrusted source for an unlinked title', async () => {
        const { service, fetch } = fixture();
        await expect(service.load({ type: 'movie', displayName: 'Popular title', sourceUrl: 'https://themoviedb.org.evil.test/movie/1' } as RecommendationTitle)).rejects.toThrow('RECOMMENDATIONS_SOURCE');
        expect(fetch).not.toHaveBeenCalled();
        await expect(service.load({ type: 'movie', sourceUrl: 'https://www.themoviedb.org/movie/123invalid' } as RecommendationTitle)).rejects.toThrow('RECOMMENDATIONS_SOURCE');
        expect(fetch).not.toHaveBeenCalled();
    });
    it('resolves IMDb IDs by exact identity and keeps movie/series result sets separate', async () => {
        const { service, fetch } = fixture();
        fetch.mockImplementation(async url => url.includes('/find/') ? { movie_results: [{ id: 99 }], tv_results: [{ id: 88 }] } : { results: movies });
        await service.load({ type: 'series', integrationProvider: 'omdb', integrationId: 'tt0123456' } as RecommendationTitle);
        expect(fetch.mock.calls[0][0]).toContain('/find/tt0123456'); expect(fetch.mock.calls[1][0]).toContain('/tv/88/recommendations');
    });
    it('maps TVmaze through external IDs instead of treating its ID as a TMDB ID', async () => {
        const { service, fetch } = fixture();
        fetch.mockImplementation(async url => url.includes('tvmaze.com') ? { id: 150, externals: { imdb: 'tt1586680' } } : url.includes('/find/') ? { tv_results: [{ id: 34307 }] } : { results: movies });
        await service.load({ type: 'series', integrationProvider: 'tvmaze', integrationId: '150' } as RecommendationTitle);
        expect(fetch.mock.calls[2][0]).toContain('/tv/34307/recommendations');
    });
    it('maps Kitsu to MAL before requesting AniList recommendations', async () => {
        const { service, fetch } = fixture();
        fetch.mockImplementation(async url => url.includes('kitsu.io') ? { data: [{ attributes: { externalSite: 'myanimelist/anime', externalId: '44511' } }] } : animeResponse);
        await service.load({ type: 'anime', integrationProvider: 'kitsu', integrationId: '999', isAdult: false } as RecommendationTitle);
        expect(fetch.mock.calls[0][0]).toContain('/anime/999/mappings');
        const body = JSON.parse(fetch.mock.calls[1][3]!); expect(body.variables.id).toBe(44511); expect(body.query).toContain('idMal: $id');
    });
    it('bounds stalled network requests', async () => {
        vi.useFakeTimers(); const { service, fetch, movie } = fixture(); fetch.mockImplementation(() => new Promise(() => {}));
        const pending = expect(service.load(movie)).rejects.toThrow('timed out'); await vi.advanceTimersByTimeAsync(15_000); await pending;
    });
});
