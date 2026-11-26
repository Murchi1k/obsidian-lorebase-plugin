import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchBinary, resetIntegrationRequestStateForTests } from '../src/services/integrations/shared';
import { MANGADEX_USER_AGENT, withMangaDexHeaders } from '../src/services/integrations/mangadexRequest';
import { findMangaDexCoverForMangaUpdates } from '../src/services/integrations/providers/mangadex';
import { IntegrationService } from '../src/services/IntegrationService';
import { DEFAULT_SETTINGS } from '../src/constants';
import { createMockApp } from './helpers/testHelpers';
import { __setRequestUrlMock } from './mocks/obsidian';

afterEach(() => { __setRequestUrlMock(null); resetIntegrationRequestStateForTests(); });
const cover = (id: string, mu: string, fileName = 'cover.jpg') => ({ id, attributes: { links: { mu } }, relationships: [{ type: 'cover_art', attributes: { fileName } }] });

describe('manga poster loading', () => {
    it('identifies binary CDN requests too, preserving the actual image bytes', async () => {
        const bytes = new Uint8Array([255, 216, 255, 217]).buffer;
        __setRequestUrlMock(options => {
            expect(options).toMatchObject({ headers: { 'User-Agent': MANGADEX_USER_AGENT } });
            return { status: 200, arrayBuffer: bytes, headers: { 'content-type': 'image/jpeg' } };
        });
        expect((await fetchBinary('https://uploads.mangadex.org/covers/id/cover.jpg')).arrayBuffer).toBe(bytes);
    });
    it('does not turn a successful HTML challenge response into an image blob', async () => {
        __setRequestUrlMock(() => ({ status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' }, arrayBuffer: new ArrayBuffer(12) }));
        await expect(fetchBinary('https://uploads.mangadex.org/covers/id/cover.jpg')).rejects.toThrow('did not return an image');
    });
    it('scopes the client header to the exact API and CDN hosts', () => {
        expect(withMangaDexHeaders('https://uploads.mangadex.org/a', { 'user-agent': 'browser', Authorization: 'token' })).toEqual({ 'User-Agent': MANGADEX_USER_AGENT, Authorization: 'token' });
        expect(withMangaDexHeaders('https://example.com', { 'User-Agent': 'OtherClient' })).toEqual({ 'User-Agent': 'OtherClient' });
        expect(withMangaDexHeaders('https://uploads.mangadex.org.example.com/a')).toEqual({});
    });
    it('uses the matching external ID, even when an unrelated title is ranked first', async () => {
        const fetch = vi.fn(async () => ({ data: [cover('wrong', 'other-record'), cover('exact', 'ugf5dzu')] }));
        expect(await findMangaDexCoverForMangaUpdates(fetch, '66296374554', 'Sousou no Frieren')).toBe('https://uploads.mangadex.org/covers/exact/cover.jpg');
    });
    it('keeps the original poster when only the title matches', async () => {
        expect(await findMangaDexCoverForMangaUpdates(async () => ({ data: [{ ...cover('wrong', 'other'), attributes: { title: { en: 'Same title' }, links: {} } }] }), '123', 'Same title')).toBe('');
    });
    it.each(['123', 'https://www.mangaupdates.com/series.html?id=123', 'https://www.mangaupdates.com/series/3f/title'])('accepts explicit MangaUpdates identities (%s)', async mu => {
        expect(await findMangaDexCoverForMangaUpdates(async () => ({ data: [cover('exact', mu)] }), '123', 'Title')).toContain('/covers/exact/');
    });
    it('shares the larger original between search and saved details without changing the source metadata', async () => {
        const service = new IntegrationService(createMockApp({}), () => structuredClone(DEFAULT_SETTINGS)) as any;
        const id = '662963745541';
        service.jsonFetcher = vi.fn(async (url: string) => url.includes('mangaupdates.com') ? {
            series_id: id, title: 'Original title', image: { url: { original: 'https://cdn.mangaupdates.com/image/small.jpg' } }, completed: true,
        } : { data: [cover('exact-series', Number(id).toString(36), 'large.png')] });
        const item = { id, title: 'Original title', provider: 'mangaupdates', image: 'https://cdn.mangaupdates.com/image/small.jpg' };
        expect(await service.resolveMangaSearchMetadata(item)).toBe('completed');
        expect(item.image).toBe('https://uploads.mangadex.org/covers/exact-series/large.png');
        const details = await service.fetchDetails('mangaupdates', id, '', '', 'manga');
        expect(details).toMatchObject({ name: 'Original title', poster: item.image, posterHorizontal: item.image });
        expect(service.jsonFetcher.mock.calls.filter(([url]: string[]) => url.includes('api.mangadex.org'))).toHaveLength(1);
    });
    it('keeps MangaUpdates usable when the higher resolution source is unavailable', async () => {
        const service = new IntegrationService(createMockApp({}), () => structuredClone(DEFAULT_SETTINGS)) as any;
        service.jsonFetcher = async (url: string) => {
            if (url.includes('api.mangadex.org')) throw new Error('HTTP 403');
            return { series_id: '662963745542', title: 'Fallback title', image: { url: { original: 'https://cdn.mangaupdates.com/image/original.jpg' } } };
        };
        expect((await service.getMangaUpdatesDetailsWithPoster('662963745542')).poster).toBe('https://cdn.mangaupdates.com/image/original.jpg');
    });
});
