import { beforeEach as beforeCoverTest, afterEach as afterCoverTest, vi as coverVi } from 'vitest';
import { onePixelPng } from './helpers/coverImages';
beforeCoverTest(() => coverVi.stubGlobal('createImageBitmap', coverVi.fn(async () => ({ width: 1, height: 1, close() {} }))));
afterCoverTest(() => coverVi.unstubAllGlobals());
import { describe, expect, it, vi } from 'vitest';
import { App, TFile } from 'obsidian';
import { MetadataService } from '../src/services/MetadataService';
import { GameService } from '../src/services/GameService';
import { extractMarkdownSection, upsertMarkdownSection } from '../src/services/markdownSections';
import { renderMangaPartsYaml, renderPartsYaml } from '../src/services/integrations/shared';
import { createCoverImage, coverImageExtension, MAX_COVER_BYTES } from '../src/services/integrations/imageBinary';
import { resolveSourceIdentity, resolveSourceUrl } from '../src/modals/MediaSourcePanel';
import type { GameItem, MediaItem } from '../src/types';

describe('Markdown note integrity', () => {
    it.each(['```', '~~~', '````'])('ignores headings inside %s fences', fence => {
        const value = `Before\n${fence}md\n## Example\n## My Notes\n${fence}\nAfter`;
        const prefix = '---\ntype: game\n---\n\n';
        const suffix = '## Other\n\nLeave this unchanged.  \n';
        const content = `${prefix}## My Notes\n\n${value}\n\n${suffix}`;
        expect(extractMarkdownSection(content)).toBe(value);
        const updated = upsertMarkdownSection(content, 'My Notes', 'New thoughts');
        expect(updated.startsWith(prefix)).toBe(true);
        expect(updated.endsWith(suffix)).toBe(true);
        expect(extractMarkdownSection(updated)).toBe('New thoughts');
    });
    it('leaves a code example containing My Notes unchanged when adding the actual section', () => {
        const original = '# Documentation\n\n```md\n## My Notes\nExample\n```\n';
        expect(extractMarkdownSection(original)).toBe('');
        const result = upsertMarkdownSection(original, 'My Notes', 'Actual notes');
        expect(result.startsWith(original)).toBe(true);
        expect(result.match(/```/g)).toHaveLength(2);
        expect(extractMarkdownSection(result)).toBe('Actual notes');
    });
    it('preserves CRLF and stops at a real heading of the same or shallower level', () => {
        const after = '# Appendix\r\nKeep  \r\n';
        const original = '## My Notes\r\n\r\nOld\r\n### Detail\r\nText\r\n' + after;
        expect(extractMarkdownSection(original)).toBe('Old\r\n### Detail\r\nText');
        const result = upsertMarkdownSection(original, 'My Notes', 'New\ntext');
        expect(result).toContain('New\r\ntext');
        expect(result.endsWith(after)).toBe(true);
    });
    it('does not append personal text into an unclosed fence', () => {
        expect(() => upsertMarkdownSection('# Example\n```md\nExample', 'My Notes', 'Personal')).toThrow(/Close the Markdown/);
    });
    it('uses the latest body when another writer edits the note before acquiring the write lock', async () => {
        const file = new TFile('Games/Example.md', 'Example');
        let body = '---\ntype: game\n---\n\n## My Notes\n\nOld\n';
        const read = vi.fn(() => { throw new Error('An unlocked read would race'); });
        const process = vi.fn(async (_file: TFile, transform: (text: string) => string) => {
            body += '\n## Concurrent change\n\nKeep this edit.\n';
            body = transform(body); return body;
        });
        const app = { metadataCache: { getFileCache: () => ({ frontmatter: { type: 'game' } }) },
            vault: { getAbstractFileByPath: () => file, read, process },
            fileManager: { processFrontMatter: async () => {} } } as unknown as App;
        await new GameService(app, new MetadataService(app)).updateGame({ filePath: file.path } as GameItem, { myNotes: 'Updated' });
        expect(read).not.toHaveBeenCalled(); expect(process).toHaveBeenCalledOnce();
        expect(body).toContain('Keep this edit.'); expect(extractMarkdownSection(body)).toBe('Updated');
    });
});

describe('Safe cover storage', () => {
    const jpeg = onePixelPng;
    function vault() {
        const files = new Map<string, TFile>(); const buffers = new Map<string, ArrayBuffer>();
        const create = vi.fn(async (path: string, data: ArrayBuffer) => {
            if (files.has(path)) throw new Error('File already exists');
            const file = new TFile(path, path.split('/').pop()!); files.set(path, file); buffers.set(path, data); return file;
        });
        const app = { vault: { getAbstractFileByPath: (path: string) => files.get(path) ?? null,
            createBinary: create, readBinary: async (file: TFile) => buffers.get(file.path)! } } as unknown as App;
        return { app, create, buffers };
    }
    it('keeps different images of identically named titles in different files', async () => {
        const test = vault();
        const first = await createCoverImage(test.app, 'Covers', 'Same name', 'Poster', jpeg(1), 'image/jpeg');
        const second = await createCoverImage(test.app, 'Covers', 'Same name', 'Poster', jpeg(2), 'image/jpeg');
        expect(first).not.toBe(second); expect(test.buffers.size).toBe(2);
        expect(test.buffers.get(first)).toEqual(onePixelPng(1));
    });
    it('deduplicates concurrent downloads of identical bytes without overwriting', async () => {
        const test = vault();
        const paths = await Promise.all(Array.from({ length: 4 }, () => createCoverImage(test.app, 'Covers', 'Title', 'Poster', jpeg(1))));
        expect(new Set(paths).size).toBe(1); expect(test.buffers.size).toBe(1);
    });
    it('rejects HTML, unsupported types and oversized buffers before a write', () => {
        expect(() => coverImageExtension(new TextEncoder().encode('<html>Not an image</html>').buffer, 'image/jpeg')).toThrow();
        expect(() => coverImageExtension(jpeg(), 'text/html')).toThrow();
        expect(() => coverImageExtension(new ArrayBuffer(MAX_COVER_BYTES + 1))).toThrow(/20 MB/);
    });
});

describe('Image resolution changes', () => {
    it('ignores a frontmatter callback that executes after plugin unload', async () => {
        const original = { status: 'playing' };
        let update!: (data: typeof original) => void; let finish!: () => void;
        const app = { fileManager: { processFrontMatter: (_file: unknown, callback: typeof update) => {
            update = callback; return new Promise<void>(resolve => { finish = resolve; });
        } } } as unknown as App;
        const metadata = new MetadataService(app);
        const pending = metadata.updateMetadata(new TFile('Game.md', 'Game'), { status: 'completed' });
        metadata.dispose(); update(original); finish(); await pending;
        expect(original.status).toBe('playing');
        await expect(metadata.updateMetadata(new TFile('Game.md', 'Game'), {})).rejects.toMatchObject({ name: 'AbortError' });
    });
    it('does not reuse a cached resource after deletion or modification', () => {
        const file = new TFile('Covers/a.jpg', 'a'); file.extension = 'jpg';
        let present = true;
        const app = { vault: { getAbstractFileByPath: () => present ? file : null,
            getResourcePath: () => `app://cover?v=${file.stat.mtime}`, getFiles: () => present ? [file] : [] } } as unknown as App;
        const service = new MetadataService(app);
        const first = service.getImageUrl(file.path); file.stat.mtime++;
        expect(service.getImageUrl(file.path)).not.toBe(first);
        present = false; expect(service.getImageUrl(file.path)).toBeNull();
    });
    it('does not pick a random cover from ambiguous basenames', () => {
        const files = ['A/cover.jpg', 'B/cover.jpg'].map(path => { const file = new TFile(path, 'cover'); file.extension = 'jpg'; file.name = 'cover.jpg'; return file; });
        const app = { vault: { getAbstractFileByPath: () => null, getFiles: () => files, getResourcePath: (file: TFile) => file.path } } as unknown as App;
        expect(new MetadataService(app).getImageUrl('cover.jpg')).toBeNull();
    });
});

describe('Part YAML and source links', () => {
    it.each([String.raw`C:\temp\new`, 'Quote " and \\ slash', 'First\nSecond\tTabbed', '日本語'])('round trips a YAML-compatible scalar: %s', title => {
        const part = { id: 'part-1', kind: 'tv', title, seasonNumber: 1, episodeCurrent: 0, episodeTotal: 1, status: 'planned' };
        for (const output of [renderPartsYaml([part]), renderMangaPartsYaml([{ ...part, volumeNumber: 1, chapterCurrent: 0, chapterTotal: 1 }])]) {
            const scalar = output.split('\n').find(line => line.trimStart().startsWith('title:'))!.split('title: ')[1];
            expect(JSON.parse(scalar)).toBe(title);
        }
    });
    it('uses manga and anime television namespaces in fallback URLs', () => {
        expect(resolveSourceUrl({ type: 'manga', integrationProvider: 'anilist', integrationId: '12' } as MediaItem)).toBe('https://anilist.co/manga/12');
        expect(resolveSourceUrl({ type: 'anime', integrationProvider: 'tmdb', integrationId: '12', integrationSourceKind: 'series' } as MediaItem)).toBe('https://www.themoviedb.org/tv/12');
    });
    it('leaves malformed imported source URLs editable without throwing', () => {
        expect(() => resolveSourceIdentity({ type: 'game', sourceUrl: 'https://rawg.io/games/bad%ZZ' } as MediaItem)).not.toThrow();
    });
});
