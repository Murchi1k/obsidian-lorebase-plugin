import { describe, expect, it } from 'vitest';
import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import { AnimeService } from '../src/services/AnimeService';
import type { AnimeItem } from '../src/types';
import { createMockApp, createBaseFilter, createMockFile } from './helpers/testHelpers';

describe('AnimeService', () => {
    it('parses frontmatter from cache into anime model', () => {
        const file = createMockFile('Anime/Naruto.md', 'Naruto');
        file.stat = { ctime: 1_700_000_000_000, mtime: 1_700_000_100_000, size: 0 };

        const app = createMockApp({
            [file.path]: {
                frontmatter: {
                    type: 'anime',
                    image: 'https://cdn.example/naruto.jpg',
                    status: 'watching',
                    rating: '4',
                    year: '2002',
                    summary: 'Ninja story',
                    favorite: 'yes',
                    format: 'movie',
                    dateWatched: '2025-01-02',
                    genres: 'Action, Adventure',
                    tags: ['Shonen'],
                },
                tags: [{ tag: '#Classic' }],
            },
        });

        const service = new AnimeService(app);
        const parsed = service.parseAnimeFromCache(file);

        expect(parsed).not.toBeNull();
        expect(parsed?.displayName).toBe('Naruto');
        expect(parsed?.status).toBe('watching');
        expect(parsed?.format).toBe('movie');
        expect(parsed?.userRating).toBe(4);
        expect(parsed?.favorite).toBe(true);
        expect(parsed?.year).toBe(2002);
        expect(parsed?.genres).toContain('action');
        expect(parsed?.tags).toContain('classic');
        expect(parsed?.dateWatched).toBeTypeOf('number');
    });

    it('parses anime_parts and uses the active part for legacy progress fields', () => {
        const file = createMockFile('Anime/Series.md', 'Series');
        const app = createMockApp({
            [file.path]: {
                frontmatter: {
                    type: 'anime',
                    status: 'watching',
                    format: 'tv',
                    active_part_id: 'ova-1',
                    anime_parts: [
                        {
                            id: 'tv-1',
                            kind: 'tv',
                            title: 'Season 1',
                            season: 1,
                            episode_current: 8,
                            episode_total: 12,
                            status: 'watching',
                        },
                        {
                            id: 'ova-1',
                            kind: 'ova',
                            title: 'OVA',
                            episode_current: 1,
                            episode_total: 2,
                            status: 'planned',
                        },
                    ],
                },
            },
        });

        const service = new AnimeService(app);
        const parsed = service.parseAnimeFromCache(file);

        expect(parsed?.parts).toHaveLength(2);
        expect(parsed?.activePartId).toBe('ova-1');
        expect(parsed?.episodeCurrent).toBe(1);
        expect(parsed?.episodeTotal).toBe(2);
        expect(parsed?.parts?.[1].kind).toBe('ova');
    });

    it('builds a legacy anime part when anime_parts is missing', () => {
        const file = createMockFile('Anime/Legacy.md', 'Legacy');
        const app = createMockApp({
            [file.path]: {
                frontmatter: {
                    type: 'anime',
                    status: 'watching',
                    format: 'tv',
                    season_current: 2,
                    episode_current: 4,
                    episode_total: 12,
                },
            },
        });

        const service = new AnimeService(app);
        const parsed = service.parseAnimeFromCache(file);

        expect(parsed?.parts).toHaveLength(1);
        expect(parsed?.parts?.[0]).toMatchObject({
            id: 'legacy-main',
            kind: 'tv',
            seasonNumber: 2,
            episodeCurrent: 4,
            episodeTotal: 12,
        });
    });

    it('syncs active anime part to legacy progress fields when updating', async () => {
        const file = createMockFile('Anime/Sync.md', 'Sync');
        let written: Record<string, unknown> = {};
        const app = {
            metadataCache: {
                getFileCache(): unknown {
                    return { frontmatter: {} };
                },
            },
            vault: {
                getAbstractFileByPath(path: string): TFile | null {
                    return path === file.path ? file : null;
                },
                getFiles(): TFile[] {
                    return [];
                },
                getResourcePath(): string {
                    return '';
                },
            },
            fileManager: {
                async processFrontMatter(_file: TFile, callback: (frontmatter: Record<string, unknown>) => void): Promise<void> {
                    const frontmatter: Record<string, unknown> = {};
                    callback(frontmatter);
                    written = frontmatter;
                },
            },
        } as unknown as App;

        const service = new AnimeService(app);
        const item = {
            type: 'anime',
            filePath: file.path,
            displayName: 'Sync',
            nameLower: 'sync',
            year: null,
            description: '',
            summary: '',
            userRating: null,
            favorite: false,
            poster: '',
            imageUrl: '',
            horizontalImageUrl: null,
            hasCustomPoster: false,
            isAdult: false,
            format: 'tv',
            status: 'watching',
            seasonCurrent: 1,
            seasonTotal: null,
            episodeCurrent: 1,
            episodeTotal: 12,
            genres: [],
            dateAdded: 1,
            dateWatched: null,
            tags: [],
            sourceUrl: null,
        } satisfies AnimeItem;

        await service.updateAnime(item, {
            activePartId: 'ova-1',
            parts: [
                { id: 'tv-1', kind: 'tv', title: 'Season 1', seasonNumber: 1, episodeCurrent: 12, episodeTotal: 12, status: 'completed' },
                { id: 'ova-1', kind: 'ova', title: 'OVA', seasonNumber: null, episodeCurrent: 2, episodeTotal: 2, status: 'completed' },
            ],
        });

        expect(written.active_part_id).toBe('ova-1');
        expect(written.episode_current).toBe(2);
        expect(written.episode_total).toBe(2);
        expect(written.status).toBe('completed');
        expect(written.anime_parts).toBeTypeOf('object');
    });

    it('filters hidden custom posters by default and sorts by rating', () => {
        const service = new AnimeService(createMockApp({}));
        const items: AnimeItem[] = [
            {
                type: 'anime',
                filePath: 'a.md',
                displayName: 'Zeta',
                nameLower: 'zeta',
                year: 2010,
                description: '',
                summary: '',
                userRating: 5,
                favorite: false,
                poster: '',
                imageUrl: '',
                horizontalImageUrl: null,
                hasCustomPoster: true,
                isAdult: false,
                format: 'tv',
                status: 'planned',
                seasonCurrent: null,
                seasonTotal: null,
                episodeCurrent: null,
                episodeTotal: null,
                genres: [],
                dateAdded: 1,
                dateWatched: null,
                tags: [],
                sourceUrl: null,
            },
            {
                type: 'anime',
                filePath: 'b.md',
                displayName: 'Alpha',
                nameLower: 'alpha',
                year: 2012,
                description: '',
                summary: '',
                userRating: 3,
                favorite: false,
                poster: '',
                imageUrl: '',
                horizontalImageUrl: null,
                hasCustomPoster: false,
                isAdult: false,
                format: 'tv',
                status: 'completed',
                seasonCurrent: null,
                seasonTotal: null,
                episodeCurrent: null,
                episodeTotal: null,
                genres: [],
                dateAdded: 2,
                dateWatched: null,
                tags: [],
                sourceUrl: null,
            },
        ];

        const base = service.filterAndSort(items, createBaseFilter(), 'rating', 'desc');
        expect(base.map((item) => item.displayName)).toEqual(['Alpha']);

        const customFilter = createBaseFilter();
        customFilter.customOnly = true;
        const customOnly = service.filterAndSort(items, customFilter, 'rating', 'desc');
        expect(customOnly.map((item) => item.displayName)).toEqual(['Zeta']);
    });
});
