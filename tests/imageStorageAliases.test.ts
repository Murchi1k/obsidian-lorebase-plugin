import { beforeEach as beforeCoverTest, afterEach as afterCoverTest, vi as coverVi } from 'vitest';
import { onePixelPng } from './helpers/coverImages';
beforeCoverTest(() => coverVi.stubGlobal('createImageBitmap', coverVi.fn(async () => ({ width: 1, height: 1, close() {} }))));
afterCoverTest(() => coverVi.unstubAllGlobals());
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App, TFolder } from 'obsidian';
import { __setRequestUrlMock } from './mocks/obsidian';
import { DEFAULT_SETTINGS } from '../src/constants';
import { createMockFile } from './helpers/testHelpers';
import { localizeExistingNoteImages } from '../src/services/integrations/imageStorage';
import { OperationLifetime } from '../src/services/BackgroundOperation';

afterEach(() => __setRequestUrlMock(null));

describe('local image storage with renamed properties', () => {
    it.each(['download', 'queued write'])('does not replace covers when cancelled during %s', async phase => {
        const settings = structuredClone(DEFAULT_SETTINGS), controller = new AbortController();
        const operation = new OperationLifetime().begin(() => '', controller.signal);
        const file = createMockFile(`${settings.games.folderPath}/Game.md`, 'Game');
        const folder = new TFolder(); folder.path = settings.games.folderPath; folder.children = [file];
        const folders = new Map([[folder.path, folder]]), write = vi.fn();
        const fm = { type: 'game', name: 'Game', poster: 'https://fixture.test/cover.png' };
        let finish!: (value: any) => void;
        const app = { vault: { getAbstractFileByPath: (path: string) => folders.get(path) ?? null,
            createFolder: async (path: string) => { const created = new TFolder(); created.path = path; folders.set(path, created); }, createBinary: write },
            metadataCache: { getFileCache: () => ({ frontmatter: fm }) },
            fileManager: { processFrontMatter: async (_file: unknown, callback: (value: Record<string, unknown>) => void) => { controller.abort(); callback(fm); } },
        } as unknown as App;
        const response = { arrayBuffer: onePixelPng(), status: 200, headers: { 'content-type': 'image/png' } };
        __setRequestUrlMock(() => phase === 'download' ? new Promise(resolve => { finish = resolve; }) : response);
        try {
            const pending = localizeExistingNoteImages(app, settings, operation);
            if (phase === 'download') { await vi.waitFor(() => expect(finish).toBeTypeOf('function')); controller.abort(); finish(response); }
            await expect(pending).resolves.toMatchObject({ cancelled: true, updated: 0, failed: 0 });
            expect(fm.poster).toBe('https://fixture.test/cover.png');
            expect(write).toHaveBeenCalledTimes(phase === 'download' ? 0 : 1);
        } finally { operation.close(); }
    });
    it.each([false, true])('localizes music cover aliases without replacing concurrent edits (edited=%s)', async edited => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.music.noteTemplate!.templateMode = 'advanced';
        settings.music.noteTemplate!.template = '---\ntitle: "{{VALUE:name}}"\nartwork: "{{VALUE:Poster}}"\n---';
        const file = createMockFile(`${settings.music.folderPath}/Album.md`, 'Album');
        const folder = new TFolder(); folder.path = settings.music.folderPath; folder.children = [file];
        const folders = new Map([[folder.path, folder]]);
        const fm: Record<string, unknown> = { type: 'music', title: 'Album', artwork: 'https://music.test/cover.jpg' };
        const app = {
            vault: { getAbstractFileByPath: (path: string) => folders.get(path) ?? null,
                createFolder: async (path: string) => { const item = new TFolder(); item.path = path; folders.set(path, item); },
                createBinary: vi.fn(),
            },
            metadataCache: { getFileCache: () => ({ frontmatter: fm }) },
            fileManager: { processFrontMatter: async (_file: unknown, update: (data: Record<string, unknown>) => void) => {
                if (edited) fm.artwork = 'My new cover.jpg'; update(fm);
            } },
        } as unknown as App;
        __setRequestUrlMock(async () => ({ status: 200, arrayBuffer: onePixelPng(),
            headers: { 'content-type': 'image/jpeg' } }));
        const result = await localizeExistingNoteImages(app, settings);
        expect(result.updated).toBe(edited ? 0 : 1);
        if (edited) expect(fm.artwork).toBe('My new cover.jpg');
        else expect(fm.artwork).toMatch(/^files\/lorebase\/images\/music\/Album - Poster - [a-f0-9]{64}\.png$/);
    });
    it('downloads both posters and writes local paths back to their real YAML names', async () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.integrations.media.games.templateMode = 'advanced';
        settings.integrations.media.games.template = '---\nmy_title: "{{VALUE:name}}"\nxys: "{{VALUE:Poster}}"\nwide: "{{VALUE:PosterHorizontal}}"\n---';
        const file = createMockFile(`${settings.games.folderPath}/Metro Exodus.md`, 'Metro Exodus');
        const folder = new TFolder(); folder.path = settings.games.folderPath; folder.children = [file];
        const folders = new Map([[folder.path, folder]]);
        const fm: Record<string, unknown> = { my_title: 'Metro Exodus', xys: 'https://example.test/vertical.jpg', wide: 'https://example.test/horizontal.jpg', custom: true };
        const write = vi.fn();
        const app = {
            metadataCache: { getFileCache: () => ({ frontmatter: fm }) },
            vault: {
                getAbstractFileByPath: (path: string) => folders.get(path) ?? null,
                createFolder: async (path: string) => { const created = new TFolder(); created.path = path; folders.set(path, created); return created; },
                createBinary: write,
            },
            fileManager: { processFrontMatter: async (_file: unknown, callback: (data: Record<string, unknown>) => void) => callback(fm) },
        } as unknown as App;
        __setRequestUrlMock(async () => ({ arrayBuffer: onePixelPng(), headers: { 'Content-Type': 'image/jpeg' }, status: 200 }));
        const result = await localizeExistingNoteImages(app, settings);
        expect(result).toMatchObject({ updated: 1, downloaded: 2, failed: 0 });
        expect(write).toHaveBeenCalledTimes(2);
        expect(fm.xys).toMatch(/^files\/lorebase\/images\/games\/Metro Exodus - Poster - [a-f0-9]{64}\.png$/);
        expect(fm.wide).toMatch(/^files\/lorebase\/images\/games\/Metro Exodus - Horizontal - [a-f0-9]{64}\.png$/);
        expect(fm).not.toHaveProperty('poster');
        expect(fm).not.toHaveProperty('poster_b');
        expect(fm.custom).toBe(true);
    });
});
