import { describe, expect, it } from 'vitest';
import type { App, TFile } from 'obsidian';
import { TFolder } from 'obsidian';
import { ReadingService } from '../src/services/ReadingService';
import type { MangaItem } from '../src/types';
import { createBaseFilter, createMetadataService, createMockApp, createMockFile } from './helpers/testHelpers';

describe('ReadingService', () => {
    it('parses book notes without type and rejects explicit mismatched types', () => {
        const bookFile = createMockFile('Books/Dune.md', 'Dune');
        const wrongFile = createMockFile('Books/Wrong.md', 'Wrong');
        const app = createMockApp({
            [bookFile.path]: {
                frontmatter: {
                    title: 'Dune',
                    authors: 'Frank Herbert',
                    publisher: 'Chilton Books',
                    released: '1965-08-01',
                    page_current: 120,
                    page_total: 412,
                    chapter_current: 8,
                    chapter_total: 20,
                    status: 'watching',
                    integration_provider: 'hardcover',
                    integration_id: '123',
                    related_media: [
                        { type: 'manga', path: 'Manga/Dune.md', title: 'Dune Manga' },
                    ],
                },
                tags: [{ tag: '#SciFi' }],
            },
            [wrongFile.path]: {
                frontmatter: {
                    type: 'manga',
                    title: 'Wrong Shelf',
                },
            },
        });

        const service = new ReadingService(app, 'book', 'Books', createMetadataService(app));
        const parsed = service.parseFromCache(bookFile);

        expect(parsed).toMatchObject({
            type: 'book',
            displayName: 'Dune',
            status: 'watching',
            pageCurrent: 120,
            pageTotal: 412,
            chapterCurrent: 8,
            chapterTotal: 20,
            publisher: 'Chilton Books',
            integrationProvider: 'hardcover',
            integrationId: '123',
        });
        expect(parsed?.authors).toEqual(['Frank Herbert']);
        expect(parsed?.tags).toContain('scifi');
        expect(parsed?.relatedMedia).toEqual([
            { type: 'manga', path: 'Manga/Dune.md', title: 'Dune Manga' },
        ]);
        expect(service.parseFromCache(wrongFile)).toBeNull();
    });

    it('parses manga parts, uses the active part, filters, sorts, and calculates stats', () => {
        const activeFile = createMockFile('Manga/Akame.md', 'Akame');
        const plannedFile = createMockFile('Manga/Berserk.md', 'Berserk');
        const app = createMockApp({
            [activeFile.path]: {
                frontmatter: {
                    type: 'manga',
                    title: 'Akame ga Kill!',
                    authors: ['Takahiro'],
                    artists: ['Tetsuya Tashiro'],
                    status: 'watching',
                    rating: 4,
                    favorite: true,
                    active_part_id: 'vol-2',
                    manga_parts: [
                        { id: 'vol-1', title: 'Volume 1', volume: 1, chapter_current: 10, chapter_total: 10, status: 'completed' },
                        { id: 'vol-2', title: 'Volume 2', volume: 2, chapter_current: 9, chapter_total: 10, status: 'watching' },
                    ],
                    volume_total: 15,
                    genres: 'Action',
                    integration_provider: 'mangadex',
                    integration_id: 'abc',
                },
            },
            [plannedFile.path]: {
                frontmatter: {
                    type: 'manga',
                    title: 'Berserk',
                    status: 'planned',
                    chapter_current: 0,
                    chapter_total: 364,
                    volume_current: 1,
                    volume_total: 41,
                },
            },
        });

        const service = new ReadingService(app, 'manga', 'Manga', createMetadataService(app));
        const parsed = service.parseFromCache(activeFile) as MangaItem | null;
        const items = [parsed, service.parseFromCache(plannedFile)].filter((item): item is MangaItem => Boolean(item));
        const filtered = service.filterAndSort(items, { ...createBaseFilter(), statuses: ['watching'] }, 'rating', 'desc');
        const stats = service.calculateStats(items);

        expect(parsed).toMatchObject({
            type: 'manga',
            displayName: 'Akame ga Kill!',
            chapterCurrent: 9,
            chapterTotal: 10,
            volumeCurrent: 2,
            volumeTotal: 15,
            activePartId: 'vol-2',
            integrationProvider: 'mangadex',
        });
        expect(parsed?.parts).toHaveLength(2);
        expect(parsed?.artists).toEqual(['Tetsuya Tashiro']);
        expect(filtered.map((item) => item.displayName)).toEqual(['Akame ga Kill!']);
        expect(stats.total).toBe(2);
        expect(stats.watching).toBe(1);
        expect(stats.planned).toBe(1);
        expect(stats.favorite).toBe(1);
        expect(stats.avgRating).toBe(4);
    });

    it('normalizes progress updates, auto-completes, and serializes manga parts', async () => {
        const bookFile = createMockFile('Books/Complete.md', 'Complete');
        const mangaFile = createMockFile('Manga/Complete.md', 'Complete');
        const frontmatterByPath: Record<string, Record<string, unknown>> = {
            [bookFile.path]: { type: 'book', title: 'Complete', status: 'watching', page_total: 100, chapter_total: 10 },
            [mangaFile.path]: {
                type: 'manga',
                title: 'Complete Manga',
                status: 'watching',
                active_part_id: 'vol-1',
                manga_parts: [{ id: 'vol-1', kind: 'volume', title: 'Volume 1', volume: 1, chapter_current: 0, chapter_total: 10, status: 'watching' }],
            },
        };
        const files = new Map<string, TFile>([
            [bookFile.path, bookFile],
            [mangaFile.path, mangaFile],
        ]);
        const app = {
            metadataCache: {
                getFileCache(file: TFile) {
                    return { frontmatter: frontmatterByPath[file.path] };
                },
            },
            vault: {
                getAbstractFileByPath(path: string) {
                    return files.get(path) ?? null;
                },
                getFiles() {
                    return [];
                },
                getResourcePath() {
                    return '';
                },
            },
            fileManager: {
                async processFrontMatter(file: TFile, handler: (frontmatter: Record<string, unknown>) => void) {
                    handler(frontmatterByPath[file.path]);
                },
                async trashFile() {
                    return;
                },
            },
        } as unknown as App;

        const bookService = new ReadingService(app, 'book', 'Books', createMetadataService(app));
        const mangaService = new ReadingService(app, 'manga', 'Manga', createMetadataService(app));
        const book = bookService.parseFromCache(bookFile);
        const manga = mangaService.parseFromCache(mangaFile);

        expect(book).not.toBeNull();
        expect(manga).not.toBeNull();
        await bookService.updateItem(book!, { pageCurrent: 150, pageTotal: 100, chapterCurrent: 10, chapterTotal: 10 });
        await mangaService.updateItem(manga!, { chapterCurrent: 10, chapterTotal: 10 });

        expect(frontmatterByPath[bookFile.path]).toMatchObject({
            page_current: 100,
            page_total: 100,
            chapter_current: 10,
            chapter_total: 10,
            status: 'completed',
        });
        expect(frontmatterByPath[mangaFile.path].status).toBe('completed');
        expect(frontmatterByPath[mangaFile.path].active_part_id).toBe('vol-1');
        expect(frontmatterByPath[mangaFile.path].manga_parts).toEqual([
            {
                id: 'vol-1',
                kind: 'volume',
                title: 'Volume 1',
                volume: 1,
                chapter_current: 10,
                chapter_total: 10,
                status: 'completed',
            },
        ]);
    });

    it('loads only notes from the configured reading folder', async () => {
        const file = createMockFile('Books/Folder Note.md', 'Folder Note');
        const folder = new TFolder('Books') as TFolder & { children: TFile[] };
        folder.children = [file];
        const app = createMockApp({
            [file.path]: {
                frontmatter: {
                    title: 'Folder Note',
                    page_total: 50,
                },
            },
        }) as App & {
            vault: App['vault'] & {
                getAbstractFileByPath(path: string): TFolder | null;
            };
        };
        app.vault.getAbstractFileByPath = (path: string) => path === 'Books' ? folder : null;

        const service = new ReadingService(app, 'book', 'Books', createMetadataService(app));
        const items = await service.loadItems();

        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({ type: 'book', displayName: 'Folder Note' });
    });
});
