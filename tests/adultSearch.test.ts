import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/constants';
import { IntegrationService } from '../src/services/IntegrationService';
import { searchAniList, searchAniListManga } from '../src/services/integrations/providers/anilist';
import { searchShikimori, searchShikimoriManga } from '../src/services/integrations/providers/shikimori';
import { searchMangaDex, getMangaDexDetails, MANGADEX_HEADERS } from '../src/services/integrations/providers/mangadex';
import { searchMangaUpdates } from '../src/services/integrations/providers/mangaupdates';
import { searchKitsu } from '../src/services/integrations/providers/kitsu';
import { createMockApp } from './helpers/testHelpers';

describe('adult search opt-in', () => {
    it.each([searchAniList, searchAniListManga])('uses an explicit safe filter and allows both ratings when enabled in AniList', async search => {
        const fetch = vi.fn(async () => ({ data: { Page: { media: [{ id: 1, isAdult: true, title: { english: 'Adult entry' } }], pageInfo: { hasNextPage: true } } } }));
        await search(fetch, 'query');
        expect(JSON.parse((fetch.mock.calls[0] as any)[3]).query).toContain('isAdult: false');
        const results = await search(fetch, 'query', { includeAdult: true });
        const request = JSON.parse((fetch.mock.calls[1] as any)[3]);
        // Explicit null returns empty lists on the live API.
        // Omit the argument entirely to include adult AND non-adult media.
        expect(request.variables).not.toHaveProperty('isAdult');
        expect(request.query).not.toMatch(/isAdult\s*:/);
        expect(results[0].isAdult).toBe(true);
    });
    it.each([searchShikimori, searchShikimoriManga])('passes the opt-in to Shikimori GraphQL and retains its classification', async search => {
        const fetch = vi.fn(async () => ({ data: { animes: [{ id: '1', name: 'Adult', isCensored: true }], mangas: [{ id: '2', name: 'Adult', isCensored: true }] } }));
        await search(fetch, 'query');
        expect(JSON.parse((fetch.mock.calls[0] as any)[3]).variables.censored).toBe(true);
        const results = await search(fetch, 'query', { includeAdult: true });
        expect(JSON.parse((fetch.mock.calls[1] as any)[3]).variables.censored).toBe(false);
        expect(results[0].isAdult).toBe(true);
    });
    it('passes the opt-in to the legacy Shikimori fallback too', async () => {
        const urls: string[] = [];
        const fetch = async (url: string) => { urls.push(url); return url.includes('/graphql') ? null : []; };
        await searchShikimoriManga(fetch, 'query', { includeAdult: true });
        expect(new URL(urls.at(-1)!).searchParams.get('censored')).toBe('false');
        await searchShikimori(fetch, 'query');
        expect(new URL(urls.at(-1)!).searchParams.get('censored')).toBe('true');
    });
    it('requests all four MangaDex ratings only when enabled', async () => {
        const fetch = vi.fn(async () => ({ data: [{ id: '1', attributes: { title: { en: 'Entry' }, contentRating: 'erotica' } }], total: 1, offset: 0, limit: 10 }));
        await searchMangaDex(fetch, 'query');
        expect(new URL((fetch.mock.calls[0] as any)[0]).searchParams.getAll('contentRating[]')).toEqual(['safe', 'suggestive']);
        const results = await searchMangaDex(fetch, 'query', { includeAdult: true });
        expect(new URL((fetch.mock.calls.filter(call => new URL((call as any)[0]).pathname === '/manga').at(-1) as any)[0]).searchParams.getAll('contentRating[]')).toEqual(['safe', 'suggestive', 'erotica', 'pornographic']);
        expect(results[0].isAdult).toBe(true);
    });
    it('identifies the MangaDex client for search, details, cover fallback and aggregate requests', async () => {
        const item = { id: 'header-test', attributes: { title: { en: 'Title' } }, relationships: [] };
        const fetch = vi.fn(async (url: string, headers: Record<string, string> = {}) => {
            expect(headers).toEqual(MANGADEX_HEADERS);
            const path = new URL(url).pathname;
            if (path === '/manga') return { data: [item] };
            if (path === '/cover') return { data: [{ attributes: { fileName: 'cover.jpg' } }] };
            if (path.endsWith('/aggregate')) return { volumes: {} };
            return { data: item };
        });
        await searchMangaDex(fetch, 'title');
        await getMangaDexDetails(fetch, item.id);
        expect(new Set(fetch.mock.calls.map(([url]) => new URL(url).pathname))).toEqual(new Set(['/manga', '/cover', '/manga/header-test', '/manga/header-test/aggregate']));
    });
    it('reads the adult genres supplied in MangaUpdates search responses', async () => {
        const results = await searchMangaUpdates(async () => ({ total_hits: 2, results: [
            { record: { series_id: 1, title: 'Safe entry', genres: [{ genre: 'Action' }] } },
            { record: { series_id: 2, title: 'Adult entry', genres: [{ genre: 'Adult' }] } },
        ] }), 'adult-filter-fixture-unique');
        expect(results.map(item => item.isAdult)).toEqual([false, true]);
    });
    it('uses both the Kitsu NSFW flag and R18 classification', async () => {
        const results = await searchKitsu(async () => ({ data: [
            { id: 1, type: 'anime', attributes: { canonicalTitle: 'Safe', ageRating: 'PG' } },
            { id: 2, type: 'anime', attributes: { canonicalTitle: 'Adult', nsfw: true } },
            { id: 3, type: 'anime', attributes: { canonicalTitle: 'R18', ageRating: 'R18' } },
        ] }), 'query');
        expect(results.map(item => item.isAdult)).toEqual([false, true, true]);
    });
    it.each([undefined, 'manga'])('keeps adult and safe AniList service caches separate (%s)', async kind => {
        const service = new IntegrationService(createMockApp({}), () => structuredClone(DEFAULT_SETTINGS)) as any;
        service.jsonFetcher = vi.fn(async () => ({ data: { Page: { media: [
            { id: 1, title: { english: 'Safe' }, isAdult: false },
            { id: 2, title: { english: 'Adult' }, isAdult: true },
        ], pageInfo: { hasNextPage: true } } } }));
        const safe = await service.search('anilist', 'query', '', '', {}, kind);
        expect(safe.map((item: any) => item.id)).toEqual(['1']);
        expect(safe.hasNext).toBe(true);
        expect((await service.search('anilist', 'query', '', '', { includeAdult: true }, kind))).toHaveLength(2);
        expect((await service.search('anilist', 'query', '', '', {}, kind))).toHaveLength(1);
        expect(service.jsonFetcher).toHaveBeenCalledTimes(2);
    });
});
