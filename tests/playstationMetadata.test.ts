import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/constants';
import { IntegrationService } from '../src/services/IntegrationService';
import { createMockApp } from './helpers/testHelpers';

function setup() {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.integrations!.imageStorage.enabled = false;
    const service = new IntegrationService(createMockApp({}), () => settings);
    const fetch = vi.spyOn(service as any, 'fetchDetails');
    return { settings, service, fetch };
}
const entry = { name: 'My PSN game', image: 'https://image.test/psn.jpg', platform: 'PS5' };

describe('PlayStation metadata preparation', () => {
    it('cleans PSN trademarks, includes catalog editions and retries the base title only when empty', async () => {
        const f = setup(); f.settings.integrations!.enabled = true;
        Object.assign(f.settings.integrations!.providers.igdb, { enabled: true, apiKey: 'client', clientSecret: 'secret' });
        const match = { id: '42', provider: 'igdb', title: 'Far Cry 3: Classic Edition' };
        const search = vi.spyOn(f.service as any, 'search').mockResolvedValueOnce([]).mockResolvedValueOnce([match]);
        const results = await f.service.findPlayStationMetadata('Far Cry® 3™ Classic Edition', 'igdb', new AbortController().signal);
        expect(search.mock.calls.map(call => call[1])).toEqual(['Far Cry 3 Classic Edition', 'Far Cry 3']);
        expect(search.mock.calls[0][4]).toMatchObject({ includeVersions: true });
        expect(results).toEqual([match]);
        search.mockReset().mockResolvedValue([match]);
        await f.service.findPlayStationMetadata('Far Cry 3 Classic Edition', 'igdb', new AbortController().signal);
        expect(search).toHaveBeenCalledOnce();
    });
    it('does not run fallback searches after cancellation', async () => {
        const f = setup(); f.settings.integrations!.enabled = true;
        Object.assign(f.settings.integrations!.providers.rawg, { enabled: true, apiKey: 'key' });
        const controller = new AbortController();
        const search = vi.spyOn(f.service as any, 'search').mockImplementation(async () => { controller.abort(); return []; });
        await expect(f.service.findPlayStationMetadata('Far Cry 3 Classic Edition', 'rawg', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
        expect(search).toHaveBeenCalledOnce();
    });
    it('creates a standard game template with PSN artwork without fetching another provider', async () => {
        const f = setup();
        const prepared = await f.service.preparePlayStationImport(entry, undefined, new AbortController().signal);
        expect(prepared.title).toBe(entry.name);
        expect(prepared.content).toMatch(/^---\r?\n/);
        expect(prepared.content).toContain(entry.image);
        expect(prepared.content).toContain('PS5');
        expect(prepared.metadata).toMatchObject({ name: entry.name, poster: entry.image, platforms: ['PS5'] });
        expect(prepared.metadata).not.toHaveProperty('integration_provider');
        expect(f.fetch).not.toHaveBeenCalled();
    });
    it('uses the confirmed catalog entry and preserves a custom template body', async () => {
        const f = setup(), media = f.settings.integrations!.media.games;
        Object.assign(f.settings.integrations!.providers.igdb, { enabled: true, apiKey: 'client', clientSecret: 'secret' });
        f.settings.integrations!.enabled = true;
        Object.assign(media, { templateEnabled: true, templateMode: 'advanced',
            template: '---\ntype: game\ntitle: "{{VALUE:name}}"\n---\n\n## My journal' });
        f.fetch.mockResolvedValue({ kind: 'game', name: 'Catalog title', description: 'Description', poster: entry.image,
            genres: ['Adventure'], platforms: ['PS5'], developers: ['Studio'], publishers: ['Publisher'],
            rating: '8', metacritic: '', released: '2024-01-01', year: '2024', url: 'https://www.igdb.com/games/catalog-title' });
        const prepared = await f.service.preparePlayStationImport(entry, { id: '42', provider: 'igdb', title: 'Catalog title' }, new AbortController().signal);
        expect(f.fetch).toHaveBeenCalledWith('igdb', '42', 'client', 'secret');
        expect(prepared.content).toContain('title: "Catalog title"');
        expect(prepared.content).toContain('## My journal');
        expect(prepared.content).toContain('integration_provider: "igdb"');
        expect(prepared.metadata).toMatchObject({ plot: 'Description', genres: ['Adventure'], integration_provider: 'igdb', integration_id: '42' });
    });
});
