import { describe, expect, it, vi } from 'vitest';
import { App, TFile, TFolder } from './mocks/obsidian';
import { DEFAULT_SETTINGS } from '../src/constants';
import { MetadataService } from '../src/services/MetadataService';
import { PlayStationSyncService } from '../src/services/PlayStationSyncService';
import type { PlayStationApi } from '../src/services/playstation/api';
import type { IntegrationService } from '../src/services/IntegrationService';
import type { PlayStationEntry } from '../src/services/playstation/types';
vi.mock('obsidian', async original => ({ ...await original<object>(), parseYaml: (value: string) => JSON.parse(value), stringifyYaml: (value: unknown) => JSON.stringify(value) }));
const signal = () => new AbortController().signal;
const entry = (): PlayStationEntry => ({ accountId: '123', titleId: 'PPSA00001_00', platform: 'PS5', name: 'My game', image: '', played: true, playtimeMinutes: 500,
    trophySets: [{ id: 'NPWR00001_00', title: 'My game', platform: 'PS5', progress: 50,
        earned: { bronze: 5, silver: 2, gold: 1, platinum: 0 }, total: { bronze: 10, silver: 4, gold: 2, platinum: 1 } }] });
function fixture() {
    const settings = structuredClone(DEFAULT_SETTINGS);
    Object.assign(settings.playstationSync, { accountId: '123', secretId: 'lorebase-psn-test' });
    settings.games.folderPath = 'Games'; settings.integrations!.media.games.templateEnabled = false;
    const folder = Object.assign(new TFolder('Games'), { children: [] as TFile[] });
    const files = new Map<string, TFile>(), fm = new Map<string, Record<string, any>>(), content = new Map<string, string>();
    const app = { vault: {
        getAbstractFileByPath: (path: string) => path === 'Games' ? folder : files.get(path) ?? null,
        cachedRead: async (file: TFile) => '---\n' + JSON.stringify(fm.get(file.path)) + '\n---\nPersonal notes',
        createFolder: vi.fn(), create: vi.fn(async (path: string, body: string) => {
            const file = new TFile(path, path.split('/').at(-1)!.slice(0, -3)); files.set(path, file); folder.children.push(file); content.set(path, body);
            const match = body.match(/^---\n([\s\S]*?)\n---/); fm.set(path, match ? JSON.parse(match[1]) : {}); return file;
        }),
    }, metadataCache: { getFileCache: (file: TFile) => ({ frontmatter: fm.get(file.path) }) },
    fileManager: { processFrontMatter: async (file: TFile, run: (value: any) => void) => { run(fm.get(file.path)!); } } } as unknown as App;
    const api = { entries: vi.fn(async () => [entry()]), tracking: vi.fn(async (previous: any) => ({ ...previous, ...entry() })) } as unknown as PlayStationApi;
    const integration = {
        findPlayStationMetadata: vi.fn(async () => [{ id: '42', provider: 'igdb', title: 'My game' }]),
        preparePlayStationImport: vi.fn(async (_entry: unknown, source: any) => {
            const metadata = { type: 'game', name: 'My game', poster: 'poster.jpg', plot: 'Catalog description', genres: ['Adventure'],
                ...(source ? { integration_provider: source.provider, integration_id: source.id } : {}) };
            return { title: 'My game', content: '---\n' + JSON.stringify(metadata) + '\n---\nTemplate body', metadata };
        }),
    } as unknown as IntegrationService;
    const metadata = new MetadataService(app as any, () => settings);
    const service = new PlayStationSyncService(app as any, () => settings, metadata, integration, vi.fn(async () => {}), api);
    const seed = (path: string, data: Record<string, any>) => {
        const file = new TFile(path, path.split('/').at(-1)!.slice(0, -3)); files.set(path, file); folder.children.push(file); fm.set(path, data); return data;
    };
    return { settings, app, api, integration, service, seed, fm, content };
}
describe('PlayStation review and note import', () => {
    it('writes PSN identity and progress atomically with a new game note', async () => {
        const f = fixture(), rows = await f.service.preview(signal());
        expect(rows[0].targetChosen).toBe(true);
        const result = await f.service.apply(rows, signal());
        expect(result).toMatchObject({ created: 1, updated: 0, failed: 0 });
        const saved = f.fm.get('Games/My game.md')!;
        expect(saved.playstation).toMatchObject({ accountId: '123', titleId: 'PPSA00001_00', playtimeMinutes: 500, trophySets: entry().trophySets });
        expect(saved.status).toBe('playing');
        expect(f.content.get('Games/My game.md')).toContain('Template body');
        expect(f.content.get('Games/My game.md')).not.toContain('lorebase-psn-test');
        expect(f.app.vault.create).toHaveBeenCalledOnce();
        const next = await f.service.preview(signal());
        expect(next[0].path).toBe('Games/My game.md');
    });
    it('requires an explicit target for same-name games and keeps Steam data, ratings and text', async () => {
        const f = fixture();
        const original = f.seed('Games/My game.md', { type: 'game', name: 'My game', integration_provider: 'steam', integration_id: '100', playtime: 1200,
            achievements_unlocked: 20, achievements_total: 25, userRating: 4.5, status: 'completed', plot: 'My description' });
        const rows = await f.service.preview(signal());
        expect(rows[0]).toMatchObject({ targetChosen: false, needsTarget: true });
        expect((await f.service.apply(rows, signal())).failed).toBe(1);
        f.service.bind(rows[0], 'Games/My game.md');
        expect((await f.service.apply(rows, signal())).updated).toBe(1);
        expect(original).toMatchObject({ integration_provider: 'steam', integration_id: '100', playtime: 1200, achievements_unlocked: 20,
            achievements_total: 25, userRating: 4.5, status: 'completed', plot: 'My description', playstation: { titleId: 'PPSA00001_00', playtimeMinutes: 500 } });
    });
    it('requires a confirmed metadata match when using another API', async () => {
        const f = fixture(); f.settings.playstationSync.metadataProvider = 'igdb';
        const rows = await f.service.preview(signal());
        expect((await f.service.apply(rows, signal())).failedIds).toEqual(['PPSA00001_00']);
        expect(f.app.vault.create).not.toHaveBeenCalled();
        rows[0].source = (await f.service.candidates(rows[0], signal()))[0];
        const result = await f.service.apply(rows, signal());
        expect(result.created).toBe(1);
        expect(f.fm.get('Games/My game.md')).toMatchObject({ integration_provider: 'igdb', integration_id: '42', plot: 'Catalog description' });
    });
    it('supports the explicit PlayStation-only fallback and independently disabled time/trophies', async () => {
        const f = fixture(); Object.assign(f.settings.playstationSync, { metadataProvider: 'rawg', importPlaytime: false, importTrophies: false });
        const rows = await f.service.preview(signal()); rows[0].psnOnly = true;
        expect((await f.service.apply(rows, signal())).created).toBe(1);
        const saved = f.fm.get('Games/My game.md')!.playstation;
        expect(saved.titleId).toBe('PPSA00001_00'); expect(saved.playtimeMinutes).toBeUndefined(); expect(saved.trophySets).toBeUndefined();
    });
    it('does not overwrite a concurrent personal-data change', async () => {
        const f = fixture(), original = f.seed('Games/Linked.md', { type: 'game', name: 'My game', playstation: entry() });
        const rows = await f.service.preview(signal());
        original.playstation = { ...entry(), playtimeMinutes: 999 };
        const result = await f.service.apply(rows, signal());
        expect(result.failed).toBe(1); expect(original.playstation.playtimeMinutes).toBe(999);
    });
    it('does not reuse preview rows after the connected account changes', async () => {
        const f = fixture(), rows = await f.service.preview(signal()); f.settings.playstationSync.secretId = '';
        const result = await f.service.apply(rows, signal());
        expect(result.failed).toBe(1); expect(f.app.vault.create).not.toHaveBeenCalled();
    });
    it('checks cancellation inside a queued frontmatter write', async () => {
        const f = fixture(), original = f.seed('Games/Linked.md', { type: 'game', name: 'My game', playstation: entry() });
        const controller = new AbortController(), rows = await f.service.preview(controller.signal), before = JSON.stringify(original);
        f.app.fileManager.processFrontMatter = async (_file, callback) => { controller.abort(); callback(original); };
        await expect(f.service.apply(rows, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
        expect(JSON.stringify(original)).toBe(before);
    });
    it('updates only PSN-linked notes during sync and retains old time when it is unavailable', async () => {
        const f = fixture();
        const original = f.seed('Games/Linked.md', { type: 'game', name: 'My game', playtime: 700, playstation: { ...entry(), playtimeMinutes: 123 } });
        f.seed('Games/Other.md', { type: 'game', name: 'Other', playtime: 321 });
        vi.mocked(f.api.tracking).mockResolvedValue({ ...entry(), playtimeMinutes: undefined, partial: true });
        const result = await f.service.syncLinked(signal());
        expect(result).toMatchObject({ updated: 1, partial: 1, failed: 0 });
        expect(original.playtime).toBe(700); expect(original.playstation.playtimeMinutes).toBe(123);
        expect(f.api.tracking).toHaveBeenCalledOnce();
    });
});
