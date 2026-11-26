import { describe, expect, it, vi } from 'vitest';
import { App, TFile, TFolder } from 'obsidian';
import { DEFAULT_SETTINGS } from '../src/constants';
import { NoteConversionService } from '../src/services/NoteConversionService';
import { normalizeNoteImportSettings } from '../src/settings/settingsNormalization';

function fixture(frontmatter: Record<string, unknown>) {
    const settings = structuredClone(DEFAULT_SETTINGS); settings.noteImport.sourceFolderPath = 'Legacy'; settings.music.folderPath = 'Music';
    const source = new TFile('Legacy/Album.md', 'Album'); source.extension = 'md';
    const legacy = new TFolder('Legacy'); legacy.children = [source]; const music = new TFolder('Music'); music.children = [];
    const files = new Map<string, TFile | TFolder>([['Legacy', legacy], ['Music', music], [source.path, source]]);
    const metadata = new Map([[source.path, frontmatter]]); const body = '# Personal text\n\n```md\n## Example\n```\n';
    const sourceContent = '---\ntitle: Old\n---\n' + body; let previewFm: Record<string, unknown> = {};
    const create = vi.fn(async (path: string, content: string) => {
        const file = new TFile(path, 'Album'); file.extension = 'md'; files.set(path, file); music.children.push(file);
        metadata.set(path, structuredClone(previewFm)); return file;
    });
    const process = vi.fn(async (_file: TFile, transform: (text: string) => string) => transform(sourceContent));
    const app = { vault: { getAbstractFileByPath: (path: string) => files.get(path) ?? null, read: async () => sourceContent,
        createFolder: async () => {}, create, process }, metadataCache: { getFileCache: (file: TFile) => ({ frontmatter: metadata.get(file.path) }) },
        fileManager: { renameFile: vi.fn(async () => {}) } } as unknown as App;
    return { settings, service: new NoteConversionService(app), create, process, body, app, setPreview: (value: Record<string, unknown>) => { previewFm = value; } };
}

describe('existing music note import', () => {
    it('recognizes an album, maps fields and preserves personal and unknown track data', async () => {
        const f = fixture({ type: 'album', title: 'Legacy Album', performer: 'Artist', score: 0, favorite: false, extra: { keep: true },
            tracklist: [{ id: '001', name: 'Song', userRating: 9, listened: true, unknown: 'keep' }, { title: 'Second', rating: 8, favorite: true }] });
        const item = (await f.service.preview(f.settings)).items[0]; f.setPreview(item.nextFrontmatter);
        expect(item).toMatchObject({ targetMedia: 'music', canImport: true, targetPath: 'Music/Legacy Album.md' });
        expect(item.nextFrontmatter).toMatchObject({ type: 'music', music_kind: 'album', title: 'Legacy Album', artist: 'Artist', rating: 0, favorite: false, extra: { keep: true } });
        expect(item.nextFrontmatter.tracks).toMatchObject([{ id: '001', title: 'Song', userRating: 9, listened: true, unknown: 'keep' }, { id: 'import-track-2', userRating: 8, favorite: true }]);
        await expect(f.service.apply(f.settings, new Set([item.id]))).resolves.toMatchObject({ created: 1, failed: 0 });
        expect(f.create.mock.calls[0][1]).toContain('id: "001"'); expect(f.create.mock.calls[0][1]).toContain(f.body);
        expect((await f.service.preview(f.settings)).items[0]).toMatchObject({ canImport: false, targetPath: item.targetPath });
    });
    it('recognizes a standalone song and preserves its parent link in replace mode', async () => {
        const f = fixture({ type: 'song', title: 'Song', artist: 'Artist', parentAlbum: '[[Music/Album]]', parentTrackId: '0002', rating: 3 });
        f.settings.noteImport.writeMode = 'replace'; const item = (await f.service.preview(f.settings)).items[0];
        expect(item.nextFrontmatter).toMatchObject({ type: 'music', music_kind: 'track', parent_album: '[[Music/Album]]', parent_track_id: '0002', rating: 3 });
        await expect(f.service.apply(f.settings, new Set([item.id]))).resolves.toMatchObject({ updated: 1, failed: 0 });
        expect(f.process).toHaveBeenCalledOnce(); expect(f.create).not.toHaveBeenCalled();
    });
    it.each([{ music_kind: 'unknown' }, { tracks: 'not an array' }, { tracks: [{ id: 'same', title: 'One' }, { id: 'same', title: 'Two' }] }])('rejects invalid music before writing: %j', async extra => {
        const f = fixture({ type: 'music', title: 'Album', ...extra }); const item = (await f.service.preview(f.settings)).items[0];
        expect(item.canImport).toBe(false); expect(item.warnings.join(' ')).toMatch(/invalid/);
        await expect(f.service.apply(f.settings, new Set([item.id]))).resolves.toMatchObject({ created: 0 }); expect(f.create).not.toHaveBeenCalled();
    });
    it('retains a saved music target and does not import after cancellation', async () => {
        expect(normalizeNoteImportSettings({ targetMedia: 'music' }).targetMedia).toBe('music');
        const f = fixture({ title: 'Manual album', type: 'music' }); const signal = new AbortController(); signal.abort();
        await expect(f.service.apply(f.settings, new Set(['Legacy/Album.md']), {}, undefined, signal.signal)).rejects.toMatchObject({ name: 'AbortError' });
        expect(f.create).not.toHaveBeenCalled();
    });
});
