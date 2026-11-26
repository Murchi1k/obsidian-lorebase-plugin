import { describe, expect, it, vi } from 'vitest';
import { getVndbDetails, searchVndb } from '../src/services/integrations/providers/vndb';
import { searchRawg } from '../src/services/integrations/providers/rawg';
import { searchIgdb } from '../src/services/integrations/providers/igdb';
import { getAniListDetails } from '../src/services/integrations/providers/anilist';
import { getKitsuDetails } from '../src/services/integrations/providers/kitsu';
import type { JsonFetcher } from '../src/services/integrations/providers/common';

describe('visual novel and anime providers', () => {
    it('retains the complete release date returned by RAWG and IGDB searches', async () => {
        const [rawg] = await searchRawg(async () => ({ results: [{ id: 1, name: 'Game', released: '2020-12-10' }] }), 'Game', 'key');
        const [igdb] = await searchIgdb(async url => url.includes('oauth2') ? { access_token: 'test-token' } : [{ id: 1, name: 'Game', first_release_date: Date.UTC(2020, 11, 10) / 1000 }], 'Game', 'id', 'secret');
        expect(rawg).toMatchObject({ year: '2020', released: '2020-12-10' });
        expect(igdb).toMatchObject({ year: '2020', released: '2020-12-10' });
    });
    it('searches VNDB with pagination and imports ratings on the common 10-point scale', async () => {
        const fetch = vi.fn<JsonFetcher>().mockResolvedValue({ results: [{ id: 'v17', title: 'Ever17', image: { url: 'https://example.com/cover.jpg' }, released: '2002-08-29', rating: 85, votecount: 1200, developers: [{ name: 'KID' }], platforms: ['win'] }] });
        expect(await searchVndb(fetch, 'ever17', { page: 2, pageSize: 12 })).toEqual([expect.objectContaining({ id: 'v17', provider: 'vndb', released: '2002-08-29' })]);
        expect(JSON.parse(fetch.mock.calls[0][3]!)).toMatchObject({ page: 2, results: 12, filters: ['search', '=', 'ever17'] });
        expect(await getVndbDetails(fetch, 'v17')).toMatchObject({ workType: 'Visual novel', communityRating: '8.5', developers: ['KID'], platforms: ['win'] });
    });

    it('imports AniList countries and adult flags, and leaves Kitsu origin unknown', async () => {
        const fetch = vi.fn<JsonFetcher>().mockResolvedValue({ data: { Media: { id: 1, title: { romaji: 'Test' }, countryOfOrigin: 'CN', isAdult: true } } });
        expect(await getAniListDetails(fetch, '1', { includeParts: false })).toMatchObject({ countryOfOrigin: 'CN', isAdult: true });
        expect(JSON.parse(fetch.mock.calls[0][3]!).query).toContain('countryOfOrigin');
        const kitsu = await getKitsuDetails(async () => ({ data: { id: '1', type: 'anime', attributes: { canonicalTitle: 'Test', ageRating: 'R18' } } }), '1', { includeParts: false });
        expect(kitsu?.isAdult).toBe(true); expect(kitsu?.countryOfOrigin).toBeUndefined();
    });
});
