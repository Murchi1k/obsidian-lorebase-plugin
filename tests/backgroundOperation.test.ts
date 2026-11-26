import { afterEach, describe, expect, it, vi } from 'vitest';
import { OperationLifetime } from '../src/services/BackgroundOperation';
import { DEFAULT_SETTINGS } from '../src/constants';
import { AniListSyncService } from '../src/services/AniListSyncService';
import { MetadataService } from '../src/services/MetadataService';
import { SteamSyncService } from '../src/services/SteamSyncService';
import { MusicService, emptyMusicItem } from '../src/services/MusicService';
import { App, TFolder, __setRequestUrlMock } from './mocks/obsidian';

afterEach(() => { vi.useRealTimers(); __setRequestUrlMock(null); });

describe('background operation boundaries', () => {
    it('rejects a late result after account identity changes without leaking its value', async () => {
        vi.useFakeTimers(); let identity = 'private-A'; let finish!: (value: string) => void;
        const operation = new OperationLifetime().begin(() => identity);
        const pending = operation.wait(() => new Promise<string>(resolve => { finish = resolve; }));
        const check = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
        identity = 'private-B'; await vi.advanceTimersByTimeAsync(100); await check;
        finish('old response'); operation.close(); expect(vi.getTimerCount()).toBe(0);
    });
    it('does not start work after parent cancellation or service unload', async () => {
        const parent = new AbortController(); const lifetime = new OperationLifetime(); parent.abort();
        const operation = lifetime.begin(() => '', parent.signal); const work = vi.fn(async () => 1);
        await expect(operation.wait(work)).rejects.toMatchObject({ name: 'AbortError' }); operation.close();
        lifetime.dispose(); const second = lifetime.begin();
        expect(() => second.check()).toThrow(); second.close(); expect(work).not.toHaveBeenCalled();
    });
    it.each(['in-place', 'replacement'])('does not apply an AniList response after %s account change', async mode => {
        let settings = structuredClone(DEFAULT_SETTINGS); settings.anilistSync.username = 'fixture'; settings.anilistSync.accessToken = 'first';
        const original = settings; let finish!: (value: unknown) => void;
        __setRequestUrlMock(() => new Promise(resolve => { finish = resolve; }));
        const app = {} as App; const service = new AniListSyncService(app, {} as MetadataService, () => settings);
        const pending = service.sync(original); await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
        if (mode === 'replacement') settings = structuredClone(settings);
        settings.anilistSync.accessToken = 'second';
        finish({ json: { data: { MediaListCollection: { hasNextChunk: false, lists: [{ entries: [{ id: 1, media: { id: 2 } }] }] } } } });
        await expect(pending).resolves.toMatchObject({ cancelled: true, imported: 0, pushed: 0, updatedLocal: 0, failed: 0 });
        expect(settings.anilistSync.lastSynced).toEqual({});
    });
    it('stops Steam import when cancel happens during metadata enrichment', async () => {
        const settings = structuredClone(DEFAULT_SETTINGS); settings.games.folderPath = 'Games'; settings.steamSync.duplicateMode = 'skip';
        const folder = new TFolder('Games'); const create = vi.fn(); let cancelled = false; let finish!: (value: unknown) => void;
        const app = { vault: { getFiles: () => [], getMarkdownFiles: () => [], getAbstractFileByPath: (path: string) => path === 'Games' ? folder : null,
            createFolder: vi.fn(), create } } as unknown as App;
        const service = new SteamSyncService(app, {} as MetadataService, () => settings);
        vi.spyOn(service as any, 'enrichGame').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
        const halt = vi.fn(); const pending = service.sync(settings, { candidates: [{ appId: 1, name: 'Fixture', playtimeForever: 0, source: 'owned' }],
            control: { isCancelled: () => cancelled, waitIfPaused: async () => {} }, onHalt: halt });
        await vi.waitFor(() => expect(finish).toBeTypeOf('function')); cancelled = true; finish({ name: 'Fixture' });
        await expect(pending).resolves.toMatchObject({ created: 0, updated: 0, failed: 0, cancelled: true });
        expect(create).not.toHaveBeenCalled(); expect(halt).toHaveBeenCalledWith('cancelled');
    });
    it('does not create a queued music note after its modal closes', async () => {
        let finish!: (value: never[]) => void; const create = vi.fn();
        const service = new MusicService({ vault: { create } } as unknown as App, 'Music', {} as MetadataService);
        vi.spyOn(service, 'loadItems').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
        const parent = new AbortController(); const pending = service.createItem(emptyMusicItem('album'), parent.signal);
        const check = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
        await vi.waitFor(() => expect(finish).toBeTypeOf('function')); parent.abort(); finish([]); await check;
        expect(create).not.toHaveBeenCalled();
    });
});
