import { afterEach, describe, expect, it, vi } from 'vitest';
import { getKitsuDetails, getLegacyMalAnimeDetails, getLegacyMalMangaDetails, resolveKitsuMalId, searchKitsu } from '../src/services/integrations/providers/kitsu';
import { migrateKitsuProviderSettings } from '../src/settings/settingsNormalization';
import { DEFAULT_SETTINGS } from '../src/constants';
import { IntegrationService } from '../src/services/IntegrationService';
import { createMockApp } from './helpers/testHelpers';
const anime = { id: '8270', type: 'anime', attributes: { canonicalTitle: 'Akame ga Kill!', titles: { en_us: 'Akame ga Kill!', en_jp: 'Akame ga Kill', ja_jp: 'アカメが斬る！' }, startDate: '2014-07-07', subtype: 'TV', episodeCount: 24, episodeLength: 24, averageRating: '78.12', ratingFrequencies: { '10': '2', '20': '3' }, posterImage: { large: 'https://example.com/akame.jpg' } } };
const mapping = (kind = 'anime') => ({ data: [{ type: 'mappings', attributes: { externalSite: `myanimelist/${kind}`, externalId: '22199' }, relationships: { item: { data: { type: kind, id: '8270' } } } }] });
afterEach(() => vi.useRealTimers());
describe('Kitsu replaces the removed catalog', () => {
    it('searches with offset pagination and keeps Kitsu IDs distinct from MAL IDs', async () => {
        const fetch = vi.fn(async () => ({ data: [anime], links: { next: 'next' } }));
        const result = await searchKitsu(fetch, ' Akame ', { page: 2, pageSize: 12 });
        const url = new URL(fetch.mock.calls[0][0]);
        expect(url.hostname).toBe('kitsu.io'); expect(url.searchParams.get('filter[text]')).toBe('Akame'); expect(url.searchParams.get('page[offset]')).toBe('12');
        expect(result[0]).toMatchObject({ id: '8270', provider: 'kitsu', title: 'Akame ga Kill!', released: '2014-07-07' });
        expect((result as any).hasNext).toBe(true);
    });
    it('imports score, runtime and only linked anime parts, genre and studio records', async () => {
        const ref = (type: string, id: string) => ({ type, id });
        const details = await getKitsuDetails(async () => ({ data: { ...anime, relationships: { categories: { data: [ref('categories', '1')] }, animeProductions: { data: [ref('animeProductions', '1')] }, mediaRelationships: { data: [ref('mediaRelationships', '1'), ref('mediaRelationships', '2')] } } }, included: [
            { ...anime, id: '8271', attributes: { ...anime.attributes, canonicalTitle: 'Sequel', startDate: '2015-01-01' } },
            { ...anime, id: '8272' },
            { type: 'categories', id: '1', attributes: { title: 'Action' } },
            { type: 'categories', id: '2', attributes: { title: 'Unrelated' } },
            { type: 'animeProductions', id: '1', attributes: { role: 'studio' }, relationships: { producer: { data: ref('producers', '1') } } },
            { type: 'producers', id: '1', attributes: { name: 'White Fox' } },
            { type: 'mediaRelationships', id: '1', attributes: { role: 'sequel' }, relationships: { destination: { data: ref('anime', '8271') } } },
            { type: 'mediaRelationships', id: '2', attributes: { role: 'character' }, relationships: { destination: { data: ref('anime', '8272') } } },
        ] }), '8270');
        expect(details).toMatchObject({ genres: ['Action'], studios: ['White Fox'], communityRating: '7.81', communityVotes: '5' });
        expect(details?.parts?.map(part => part.id)).toEqual(['kitsu-8270', 'kitsu-8271']);
        expect(details?.parts?.[0]).toMatchObject({ kind: 'tv', episodeTotal: 24, episodeDuration: 24 });
    });
    it('refreshes old anime through an exact mapping and preserves its root part identity', async () => {
        const fetch = vi.fn(async (url: string) => url.includes('/mappings?') ? mapping() : { data: anime });
        expect(await getLegacyMalAnimeDetails(fetch, '22199')).toMatchObject({ parts: [{ id: 'jikan-22199', episodeTotal: 24 }] });
        expect(fetch.mock.calls.every(([url]) => new URL(url).hostname === 'kitsu.io')).toBe(true);
    });
    it('rejects wrong IDs, ambiguous mappings and wrong media types', async () => {
        expect(await resolveKitsuMalId(async () => mapping('manga'), '22199')).toBeNull();
        expect(await resolveKitsuMalId(async () => ({ data: [...mapping().data, { ...mapping().data[0], relationships: { item: { data: { type: 'anime', id: '9' } } } }] }), '22199')).toBeNull();
        expect(await getKitsuDetails(async () => ({ data: { ...anime, id: '999' } }), '8270')).toBeNull();
        expect(await getKitsuDetails(async () => { throw new Error('must not fetch'); }, '8270junk')).toBeNull();
    });
    it('refreshes legacy manga through Kitsu without changing its stored MAL ID', async () => {
        const fetch = async (url: string) => url.includes('/mappings?') ? mapping('manga') : { data: { ...anime, type: 'manga', attributes: { ...anime.attributes, canonicalTitle: 'Manga', chapterCount: 30, volumeCount: 3 } } };
        expect(await getLegacyMalMangaDetails(fetch, '22199')).toMatchObject({ chapters: '30', volumes: '3' });
        const service = new IntegrationService(createMockApp({}), () => structuredClone(DEFAULT_SETTINGS));
        (service as any).jsonFetcher = fetch;
        const patch = await service.getMediaEnrichment('manga', { provider: 'jikan', id: '22199', title: 'Manga' });
        expect(patch?.values).toMatchObject({ integration_provider: 'jikan', integration_id: '22199', name: 'Manga', volume_total: 3 });
    });
    it('migrates search settings once without treating MAL IDs as Kitsu IDs', () => {
        const settings = structuredClone(DEFAULT_SETTINGS); settings.integrations!.media.anime.provider = 'jikan';
        const saved = structuredClone(settings.integrations!); delete (saved.providers as any).kitsu; saved.providers.jikan.enabled = true;
        expect(migrateKitsuProviderSettings(settings, saved)).toBe(true);
        expect(settings.integrations!.media.anime.provider).toBe('kitsu'); expect(settings.integrations!.providers.kitsu.enabled).toBe(true);
        expect(settings.integrations!.providers.jikan.enabled).toBe(false);
        expect(migrateKitsuProviderSettings(settings, settings.integrations)).toBe(false);
    });
    it('times out a hanging search and clears timers after successful responses', async () => {
        vi.useFakeTimers();
        const pending = expect(searchKitsu(async () => new Promise(() => {}), 'Akame')).rejects.toThrow('timed out');
        await vi.advanceTimersByTimeAsync(8000); await pending;
        expect(await searchKitsu(async () => ({ data: [], links: {} }), 'none')).toEqual([]); expect(vi.getTimerCount()).toBe(0);
    });
});
