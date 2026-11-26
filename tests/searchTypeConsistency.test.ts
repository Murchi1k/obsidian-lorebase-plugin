import { afterEach, describe, expect, it } from 'vitest';
import { getTmdbDetails, searchTmdb } from '../src/services/integrations/providers/tmdb';
import { getTvmazeDetails, searchTvmaze } from '../src/services/integrations/providers/tvmaze';
import { getRawgDetails, searchRawg } from '../src/services/integrations/providers/rawg';
import { getAniListMangaDetails, searchAniListManga } from '../src/services/integrations/providers/anilist';
import { getSearchCardMetadata } from '../src/modals/searchCardMetadata';
import { configureMediaWorkTypes } from '../src/utils/mediaWorkType';
import { addComicsWorkType, configureMangaWorkTypes, getMangaWorkTypeCatalog, normalizeMangaWorkType, normalizeWorkTypeCatalog } from '../src/utils/mangaWorkType';
import { i18n } from '../src/localization';
import type { JsonFetcher } from '../src/services/integrations/providers/common';

afterEach(() => { configureMediaWorkTypes(); configureMangaWorkTypes(); });
describe('search and imported work types agree', () => {
    it.each([
        ['movies', 16, 'Animation', 'Мультфильм'], ['movies', 99, 'Documentary', 'Документальный фильм'],
        ['movies', 18, 'Movie', 'Фильм'], ['series', 16, 'Animated series', 'Мультсериал'],
        ['series', 99, 'Documentary series', 'Документальный сериал'], ['series', 10764, 'TV show', 'Телешоу'],
    ] as const)('uses TMDB genre IDs for %s %s in search and details', async (kind, genre, type, label) => {
        i18n.setLanguage('ru');
        const item = { id: 1, title: 'Hexed', name: 'Hexed', genre_ids: [genre], genres: [{ id: genre, name: 'Localized genre' }], first_air_date: '2026-01-01', release_date: '2026-01-01' };
        const fetch: JsonFetcher = async url => url.includes('/search/') ? { results: [item] } : item;
        const [result] = await searchTmdb(fetch, 'Hexed', 'key', { kind });
        expect(result.workType).toBe(type);
        expect((await getTmdbDetails(fetch, '1', 'key', kind))?.workType).toBe(type);
        expect(getSearchCardMetadata(result).meta).toBe(`1 янв. 2026 / ${label}`);
    });

    it.each(['Animation', 'Documentary', 'Reality', 'Scripted'])('uses TVmaze %s consistently', async type => {
        const item = { id: 1, name: 'Test', type };
        const fetch: JsonFetcher = async url => url.includes('/search/') ? [{ show: item }] : item;
        const [result] = await searchTvmaze(fetch, 'Test', '', { kind: 'series' });
        expect(result.workType).toBe((await getTvmazeDetails(fetch, '1', '', 'series'))?.workType);
    });

    it('recognizes visual novels from game search genres and applies the same saved catalogue redirects', async () => {
        i18n.setLanguage('ru');
        const item = { id: 1, name: 'Novel', genres: [{ name: 'Visual Novel' }] };
        const fetch: JsonFetcher = async url => new URL(url).pathname.endsWith('/1') ? item : { results: [item] };
        const [result] = await searchRawg(fetch, 'Novel', 'key');
        expect(result.workType).toBe('Visual novel');
        expect((await getRawgDetails(fetch, '1', 'key'))?.workType).toBe('Visual novel');
        expect(getSearchCardMetadata(result).meta).toBe('Визуальная новелла');
        configureMediaWorkTypes({ game: { types: [{ value: 'Game' }], redirects: { 'Visual novel': 'Game' } } });
        expect(getSearchCardMetadata(result).meta).toBe('Игра');
    });

    it('uses AniList origin in both manga search and details', async () => {
        const item = { id: 1, title: { romaji: 'Test' }, format: 'MANGA', countryOfOrigin: 'KR', status: 'FINISHED', startDate: { year: 2020, month: 12, day: 9 } };
        const fetch: JsonFetcher = async (_url, _headers, _method, body) => {
            const query = JSON.parse(body!).query as string;
            expect(query).toContain('countryOfOrigin');
            return query.includes('Page(') ? { data: { Page: { media: [item] } } } : { data: { Media: item } };
        };
        expect((await searchAniListManga(fetch, 'Test'))[0]).toMatchObject({ workType: 'Manhwa', released: '2020-12-09', publicationStatus: 'FINISHED' });
        expect((await getAniListMangaDetails(fetch, '1'))?.workType).toBe('Manhwa');
    });

    it('leaves subtype unknown when search lacks classification instead of claiming every result is a film', async () => {
        const [result] = await searchTmdb(async () => ({ results: [{ id: 1, title: 'Unknown', release_date: '2026-01-01' }] }), 'Unknown', 'key', { kind: 'movies' });
        expect(result.workType).toBeUndefined();
        expect(getSearchCardMetadata(result).meta).toBe('1 янв. 2026');
    });

    it('restores Comics in existing catalogues and reads legacy note values', () => {
        const catalog = addComicsWorkType(normalizeWorkTypeCatalog({ types: [{ value: 'Manga' }, { value: 'Comic', color: '#123456' }], redirects: { Comics: 'Manga' } }));
        configureMangaWorkTypes(catalog);
        expect(getMangaWorkTypeCatalog(['Comic']).types).toEqual([{ value: 'Manga' }, { value: 'Comics', color: '#123456' }]);
        expect(normalizeMangaWorkType('комиксы')).toBe('Comics');
        expect(catalog.redirects).toEqual({});
    });
});
