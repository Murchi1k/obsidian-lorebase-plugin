import { afterEach, describe, expect, it } from 'vitest';
import { __setRequestUrlMock } from './mocks/obsidian';
import { SteamSyncService } from '../src/services/SteamSyncService';
import { resetIntegrationRequestStateForTests } from '../src/services/integrations/shared';
import { createMockApp, createMockFile, createMetadataService } from './helpers/testHelpers';
import { DEFAULT_SETTINGS } from '../src/constants';

afterEach(() => { __setRequestUrlMock(null); resetIntegrationRequestStateForTests(); });
describe('update all linked game tracking', () => {
    it('updates linked games but preserves manual progress, unavailable stats and modes, and does not import', async () => {
        const notes = [
            { type: 'game', steamAppId: '42', progress_percent: 60, game_modes: ['coop'], playtime: 10 },
            { type: 'game', integration_provider: 'steam', integration_id: '44', achievements_unlocked: 3, achievements_total: 12 },
            { type: 'game', title: 'Unlinked' },
        ];
        const files = notes.map((_note, index) => createMockFile(`Games/${index}.md`, String(index)));
        const entries = Object.fromEntries(files.map((file, index) => [file.path, { frontmatter: notes[index] }]));
        const app = createMockApp(entries);
        app.vault.getMarkdownFiles = () => files;
        app.fileManager.processFrontMatter = async (file, callback) => callback(entries[file.path].frontmatter);
        __setRequestUrlMock(options => {
            const url = new URL(typeof options === 'string' ? options : options.url);
            if (url.pathname.includes('GetOwnedGames')) {
                const id = JSON.parse(url.searchParams.get('input_json')!).appids_filter[0];
                return { json: { response: { games: [{ appid: id, playtime_forever: 180 }] } } };
            }
            if (url.pathname.includes('GetPlayerAchievements') && url.searchParams.get('appid') === '42') return { json: { playerstats: { success: true, achievements: [{ achieved: 1 }, { achieved: 0 }] } } };
            return { json: { playerstats: { success: false } } };
        });
        const settings = structuredClone(DEFAULT_SETTINGS); settings.games.folderPath = 'Games';
        settings.steamSync.steamId = '76561198000000000'; settings.steamSync.apiKey = 'test';
        const service = new SteamSyncService(app, createMetadataService(app));
        const result = await service.syncTrackingForExisting(settings);
        expect(result).toEqual({ updated: 2, partial: 1, failed: 0, skipped: 1 });
        expect(notes[0]).toMatchObject({ playtime: 180, progress_percent: 60, game_modes: ['coop'], achievements_unlocked: 1, achievements_total: 2 });
        expect(notes[1]).toMatchObject({ playtime: 180, achievements_unlocked: 3, achievements_total: 12 });
        expect(notes[2]).toEqual({ type: 'game', title: 'Unlinked' });
    });
});
