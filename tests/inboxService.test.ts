import { describe, expect, it, vi } from 'vitest';
import { App, TFile } from 'obsidian';
import { DEFAULT_SETTINGS } from '../src/constants';
import { InboxService, normalizeInboxState } from '../src/services/InboxService';

function fixture(contents: Record<string, string>, metadata: Record<string, unknown> = {}) {
    const settings = structuredClone(DEFAULT_SETTINGS);
    const files = Object.keys(contents).map(path => new TFile(path, path.split('/').at(-1)!.replace(/\.md$/, '')));
    const app = { vault: {
        getMarkdownFiles: () => files,
        cachedRead: vi.fn(async (file: TFile) => contents[file.path]),
        modify: vi.fn(), create: vi.fn(),
    }, metadataCache: { getFileCache: (file: TFile) => metadata[file.path] ?? null } } as unknown as App;
    const save = vi.fn(async () => {});
    const service = new InboxService(app, () => settings, save);
    return { app, service, settings, save };
}
describe('inbox scanning and receipts', () => {
    it('only scans opted-in lists outside library folders and never writes source files', async () => {
        const contents = { 'Notes/List.md': '#LB\nGame', 'Notes/Other.md': 'Other game',
            [DEFAULT_SETTINGS.games.folderPath + '/Game.md']: '#LB\nImported game',
            'At root.md': '#LB\nImported at root' };
        const { service, app } = fixture(contents, { 'At root.md': { frontmatter: { type: 'game' } } });
        expect((await service.scan('games')).pending.map(item => item.title)).toEqual(['Game']);
        expect(app.vault.modify).not.toHaveBeenCalled(); expect(app.vault.create).not.toHaveBeenCalled();
        expect(contents['Notes/List.md']).toBe('#LB\nGame');
    });
    it('remembers dismissals across service reloads and can restore them', async () => {
        const { service, app, settings, save } = fixture({ 'List.md': '#lb\nGame' });
        const entry = (await service.scan('games')).pending[0];
        await service.record(entry, 'dismissed');
        const reloaded = new InboxService(app, () => settings, save);
        expect((await reloaded.scan('games')).pending).toEqual([]);
        const handled = (await reloaded.scan('games')).handled;
        expect(handled).toHaveLength(1);
        await reloaded.restore(handled[0]);
        expect((await reloaded.scan('games')).pending).toHaveLength(1);
    });
    it('records all duplicate occurrences and retains new entries in the same source', async () => {
        const contents = { 'A.md': '#LB\nGame', 'B.md': '#lorebase\nGame (note)' };
        const { service } = fixture(contents);
        const entry = (await service.scan('games')).pending[0];
        expect(entry.origins).toHaveLength(2);
        await service.record(entry, 'added', 'Games/Game.md');
        expect((await service.scan('games')).pending).toHaveLength(0);
        contents['A.md'] += '\nNew game';
        expect((await service.scan('games')).pending.map(item => item.title)).toEqual(['New game']);
    });
    it('rejects a stale review after the original line or its opt-in changed', async () => {
        const contents = { 'List.md': '#LB\nGame' };
        const { service } = fixture(contents);
        const entry = (await service.scan('games')).pending[0];
        expect(await service.validate(entry)).toBe(true);
        contents['List.md'] = '#LB\nDifferent game';
        expect(await service.validate(entry)).toBe(false);
        contents['List.md'] = 'Game';
        expect(await service.validate(entry)).toBe(false);
    });
    it('does not lose pending entries when saving receipts fails', async () => {
        const { service, settings, save } = fixture({ 'List.md': '#LB\nGame' });
        const entry = (await service.scan('games')).pending[0];
        save.mockRejectedValueOnce(new Error('disk full'));
        await expect(service.record(entry, 'added', 'Game.md')).rejects.toThrow('disk full');
        expect(settings.inbox).toBeUndefined();
        expect((await service.scan('games')).pending).toHaveLength(1);
        await service.record(entry, 'added', 'Game.md');
        expect((await service.scan('games')).pending).toHaveLength(0);
    });
    it('reports unreadable notes without dropping readable ones', async () => {
        const { app, service } = fixture({ 'A.md': '#lb\nGame', 'B.md': '#lb\nOther' });
        vi.mocked(app.vault.cachedRead).mockRejectedValueOnce(new Error('unavailable'));
        const result = await service.scan('games');
        expect(result.unreadable).toEqual(['A.md']); expect(result.pending).toHaveLength(1);
    });
    it('cancels a scan without changing receipts', async () => {
        const { service, settings } = fixture({ 'A.md': '#lb\nGame' });
        const controller = new AbortController(); controller.abort();
        await expect(service.scan('games', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
        expect(settings.inbox).toBeUndefined();
    });
    it('normalizes damaged persisted state', () => {
        expect(normalizeInboxState(null).receipts).toEqual({});
        expect(normalizeInboxState({ receipts: { a: { state: 'added', at: 4, target: 'Game.md' }, b: null, c: { state: 'other' } } }).receipts)
            .toEqual({ a: { state: 'added', at: 4, target: 'Game.md' } });
    });
});
