import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/constants';
import { EpisodeMetadataService } from '../src/services/EpisodeMetadataService';
const part = { id: 'season-1', seasonNumber: 1 } as any;
function fixture() {
    const settings = structuredClone(DEFAULT_SETTINGS); settings.integrations!.enabled = true;
    for (const provider of ['tmdb', 'tvmaze', 'anilist', 'kitsu', 'jikan', 'shikimori'] as const) settings.integrations!.providers[provider].enabled = true;
    settings.integrations!.providers.tmdb.apiKey = 'key'; settings.integrations!.media.series.tmdbLanguage = 'ru-RU';
    return settings;
}
describe('on-demand episode metadata', () => {
    afterEach(() => vi.useRealTimers());
    it('requests the correct TMDB season/language and coalesces repeated requests', async () => {
        const settings = fixture();
        const fetch = vi.fn(async (url: string) => { expect(url).toContain('/tv/12/season/1?'); expect(new URL(url).searchParams.get('language')).toBe('ru-RU'); return { season_number: 1, episodes: [{ episode_number: 2, name: 'Серия', air_date: '2020-02-02', runtime: 40 }] }; });
        const service = new EpisodeMetadataService(() => settings, fetch);
        const item = { type: 'series', integrationProvider: 'tmdb', integrationId: '12' } as any;
        const [first, second] = await Promise.all([service.load(item, part), service.load(item, part)]);
        expect(first).toEqual([{ number: 2, title: 'Серия', airDate: '2020-02-02', duration: 40 }]); expect(second).toEqual(first); expect(fetch).toHaveBeenCalledOnce();
    });
    it('looks up TVmaze seasons by season number rather than treating provider IDs as numbers', async () => {
        const settings = fixture();
        const fetch = vi.fn(async (url: string) => url.endsWith('/seasons') ? [{ id: 919, number: 1 }, { id: 920, number: 2 }] : [{ season: 1, number: 1, name: 'Pilot' }, { season: 2, number: 2, name: 'Wrong season' }, { season: 1, number: null, name: 'Special' }]);
        const service = new EpisodeMetadataService(() => settings, fetch);
        expect(await service.load({ type: 'series', integrationProvider: 'tvmaze', integrationId: '12' } as any, part)).toEqual([{ number: 1, title: 'Pilot' }]);
        expect(fetch.mock.calls[1][0]).toBe('https://api.tvmaze.com/seasons/919/episodes');
    });

    it('loads episodes from the correct season of an imported anime and skips unrelated parts', async () => {
        const settings = fixture();
        settings.integrations!.providers.omdb = { enabled: true, apiKey: 'key' };
        const fetch = vi.fn(async (url: string) => {
            expect(new URL(url).searchParams.get('Season')).toBe('2');
            return { Episodes: [{ Episode: '1', Title: 'Premiere', Released: '2024-11-09' }] };
        });
        const service = new EpisodeMetadataService(() => settings, fetch);
        const item = { type: 'anime', integrationProvider: 'omdb', integrationId: 'tt101', integrationSourceKind: 'series' } as any;
        expect(await service.load(item, { ...part, id: 'omdb-series-tt101-2', seasonNumber: 2 })).toEqual([{ number: 1, title: 'Premiere', airDate: '2024-11-09' }]);
        expect(await service.load(item, { ...part, id: 'manual-2', seasonNumber: 2 })).toEqual([]);
        expect(fetch).toHaveBeenCalledOnce();
    });

    it('refreshes TMDB covers and episode details even when the old episode request is cached', async () => {
        let requests = 0;
        const fetch = vi.fn(async (url: string) => {
            if (url.includes('/season/1?')) return { season_number: 1, episodes: [{ episode_number: 1, name: ++requests === 1 ? 'Old name' : 'New name' }] };
            if (url.includes('/season/2?')) throw new Error('Season details are offline');
            return { seasons: [
                { id: 501, season_number: 1, name: 'Season 1', episode_count: 12, poster_path: '/first.jpg' },
                { id: 502, season_number: 2, name: 'Season 2', episode_count: 8, poster_path: '/second.jpg' },
            ] };
        });
        const service = new EpisodeMetadataService(fixture, fetch);
        const item = { type: 'series', integrationProvider: 'tmdb', integrationId: '12' } as any;
        expect(await service.load(item, part)).toEqual([{ number: 1, title: 'Old name' }]);
        const result = await service.refreshSeries(item);
        expect(result.partial).toBe(true);
        expect(result.parts).toEqual([
            expect.objectContaining({ seasonNumber: 1, episodeTotal: 12, poster: 'https://image.tmdb.org/t/p/w500/first.jpg', episodeDetails: [{ number: 1, title: 'New name' }] }),
            expect.objectContaining({ seasonNumber: 2, episodeTotal: 8, poster: 'https://image.tmdb.org/t/p/w500/second.jpg' }),
        ]);
        expect(await service.load(item, part)).toEqual([{ number: 1, title: 'New name' }]);
        expect(fetch).toHaveBeenCalledTimes(4);
    });

    it('refreshes TVmaze season posters and numbered episodes with the connected source', async () => {
        const season = { id: 919, number: 1, episodeOrder: 7, image: { original: 'https://example.com/season.jpg' } };
        const fetch = vi.fn(async (url: string) => {
            if (url.endsWith('/seasons')) return [season];
            if (url.endsWith('/919/episodes')) return [{ season: 1, number: 1, name: 'Pilot' }];
            return { name: 'Series', _embedded: { seasons: [season] } };
        });
        const service = new EpisodeMetadataService(fixture, fetch);
        const item = { type: 'series', integrationProvider: 'tvmaze', integrationId: '12' } as any;
        expect(await service.refreshSeries(item)).toEqual({ partial: false, parts: [expect.objectContaining({
            seasonNumber: 1, episodeTotal: 7, poster: 'https://example.com/season.jpg', episodeDetails: [{ number: 1, title: 'Pilot' }],
        })] });
    });

    it.each(['anilist', 'shikimori'])('maps each %s part to Kitsu through its own MAL identity', async provider => {
        const fetch = vi.fn(async (url: string, _headers?: object, _method?: string, body?: string) => {
            if (url.includes('anilist')) { expect(JSON.parse(body!).variables.id).toBe(99); return { data: { Media: { id: 99, idMal: 123 } } }; }
            if (url.includes('shikimori')) { expect(JSON.parse(body!).variables.ids).toBe('99'); return { data: { animes: [{ id: '99', malId: '123' }] } }; }
            if (url.includes('/mappings?')) { expect(new URL(url).searchParams.get('filter[externalId]')).toBe('123'); return mapping(); }
            expect(new URL(url).pathname).toBe('/api/edge/anime/456/episodes');
            return { data: [{ type: 'episodes', attributes: { number: 1, canonicalTitle: 'First' } }], links: {} };
        });
        const service = new EpisodeMetadataService(fixture, fetch);
        expect(await service.load({ type: 'anime', integrationProvider: provider, integrationId: '1' } as any, { ...part, id: provider + '-99' })).toEqual([{ number: 1, title: 'First' }]);
        expect(fetch.mock.calls.every(([url]) => !url.includes('jikan'))).toBe(true);
    });
    it('loads Kitsu parts directly with pagination and prefers available localized titles', async () => {
        const fetch = vi.fn(async (url: string) => {
            expect(new URL(url).pathname).toBe('/api/edge/anime/456/episodes');
            const second = new URL(url).searchParams.get('page[offset]') === '20';
            return { data: [{ type: 'episodes', attributes: { number: second ? 21 : 1, canonicalTitle: 'English', titles: { ru_ru: second ? 'Последняя' : 'Первая' }, airdate: '2020-01-01', length: 24 } }], links: { next: second ? null : 'next' } };
        });
        const result = await new EpisodeMetadataService(fixture, fetch).load({ type: 'anime', integrationProvider: 'kitsu', integrationId: '1' } as any, { ...part, id: 'kitsu-456' });
        expect(result).toEqual([{ number: 1, title: 'Первая', airDate: '2020-01-01', duration: 24 }, { number: 21, title: 'Последняя', airDate: '2020-01-01', duration: 24 }]);
        expect(fetch).toHaveBeenCalledTimes(2);
    });
    it('loads older MAL parts through Kitsu without any requests to the removed provider', async () => {
        const fetch = vi.fn(async (url: string) => {
            expect(new URL(url).hostname).toBe('kitsu.io');
            return url.includes('/mappings?') ? mapping() : { data: [{ type: 'episodes', attributes: { number: 1, canonicalTitle: 'First' } }], links: {} };
        });
        expect(await new EpisodeMetadataService(fixture, fetch).load({ type: 'anime', integrationProvider: 'jikan' } as any, { ...part, id: 'jikan-123' })).toEqual([{ number: 1, title: 'First' }]);
    });
    it('rejects unrelated/ambiguous mappings and unidentified manually added parts', async () => {
        for (const externalId of ['999', '123']) {
            const fetch = vi.fn(async () => ({ data: ['456', '789'].map(kitsuId => ({ ...mapping().data[0], attributes: { externalSite: 'myanimelist/anime', externalId }, relationships: { item: { data: { type: 'anime', id: kitsuId } } } })) }));
            expect(await new EpisodeMetadataService(fixture, fetch).load({ type: 'anime', integrationProvider: 'jikan' } as any, { ...part, id: 'jikan-123' })).toEqual([]);
            expect(fetch).toHaveBeenCalledOnce();
        }
        const fetch = vi.fn(async () => ({})), service = new EpisodeMetadataService(fixture, fetch);
        expect(await service.load({ type: 'anime', integrationProvider: 'anilist', integrationId: '1', parts: [{ id: 'anilist-1' }, { id: 'tv-2' }] } as any, { ...part, id: 'tv-2' })).toEqual([]);
        expect(await service.load({ type: 'anime', integrationProvider: 'anilist', integrationId: '1' } as any, { ...part, id: 'tv-2' })).toEqual([]);
        expect(fetch).not.toHaveBeenCalled();
    });
    it('ends a hanging request, allows retry, and respects disabled integrations', async () => {
        vi.useFakeTimers();
        const settings = fixture(), fetch = vi.fn(async () => new Promise(() => {}));
        const service = new EpisodeMetadataService(() => settings, fetch, { requestTimeoutMs: 100 });
        const item = { type: 'anime', integrationProvider: 'kitsu' } as any, selected = { ...part, id: 'kitsu-123' };
        const first = expect(service.load(item, selected)).rejects.toThrow('timed out');
        await vi.advanceTimersByTimeAsync(100); await first;
        const retry = expect(service.load(item, selected)).rejects.toThrow();
        await vi.advanceTimersByTimeAsync(100); await retry;
        settings.integrations!.providers.kitsu.enabled = false; expect(await service.load(item, selected)).toEqual([]);
        expect(fetch).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(0);
    });
    it('bounds the whole load when a catalog keeps returning more pages', async () => {
        vi.useFakeTimers();
        const fetch = vi.fn(async () => { await new Promise(resolve => setTimeout(resolve, 40)); return { data: [], links: { next: 'more' } }; });
        const service = new EpisodeMetadataService(fixture, fetch, { requestTimeoutMs: 100, loadTimeoutMs: 50 });
        const pending = expect(service.load({ type: 'anime', integrationProvider: 'kitsu' } as any, { ...part, id: 'kitsu-123' })).rejects.toThrow('timed out');
        await vi.advanceTimersByTimeAsync(50); await pending;
        await vi.advanceTimersByTimeAsync(40); expect(fetch).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(0);
    });
});
function mapping() { return { data: [{ type: 'mappings', attributes: { externalSite: 'myanimelist/anime', externalId: '123' }, relationships: { item: { data: { type: 'anime', id: '456' } } } }] }; }
