import { describe, expect, it } from 'vitest';
import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import { AnimeService } from '../src/services/AnimeService';
import type { AnimeItem } from '../src/types';
import { createMockApp, createBaseFilter, createMetadataService, createMockFile } from './helpers/testHelpers';

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
                    integration_provider: 'anilist',
                    integration_id: '12345',
                },
                tags: [{ tag: '#Classic' }],
            },
        });

        const service = new AnimeService(app, createMetadataService(app));
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
        expect(parsed?.integrationProvider).toBe('anilist');
        expect(parsed?.integrationId).toBe('12345');
    });

    it('uses frontmatter title or name as display name before file basename', () => {
        const titleFile = createMockFile('Anime/Attack_on_Titan.md', 'Attack_on_Titan');
        const nameFile = createMockFile('Anime/Fullmetal_Alchemist.md', 'Fullmetal_Alchemist');
        const fallbackFile = createMockFile('Anime/Fallback_Title.md', 'Fallback_Title');
        const app = createMockApp({
            [titleFile.path]: {
                frontmatter: {
                    title: 'Attack on Titan',
                },
            },
            [nameFile.path]: {
                frontmatter: {
                    name: 'Fullmetal Alchemist',
                },
            },
            [fallbackFile.path]: {
                frontmatter: {},
            },
        });

        const service = new AnimeService(app, createMetadataService(app));

        expect(service.parseAnimeFromCache(titleFile)?.displayName).toBe('Attack on Titan');
        expect(service.parseAnimeFromCache(nameFile)?.displayName).toBe('Fullmetal Alchemist');
        expect(service.parseAnimeFromCache(fallbackFile)?.displayName).toBe('Fallback_Title');
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

        const service = new AnimeService(app, createMetadataService(app));
        const parsed = service.parseAnimeFromCache(file);

        expect(parsed?.parts).toHaveLength(2);
        expect(parsed?.activePartId).toBe('ova-1');
        expect(parsed?.episodeCurrent).toBe(1);
        expect(parsed?.episodeTotal).toBe(2);
        expect(parsed?.parts?.[1].kind).toBe('ova');
    });

    it('parses related media links from frontmatter', () => {
        const file = createMockFile('Anime/Linked.md', 'Linked');
        const app = createMockApp({
            [file.path]: {
                frontmatter: {
                    type: 'anime',
                    related_media: [
                        { type: 'movie', path: 'Movies/Film.md', title: 'Film' },
                        { type: 'series', path: 'Series/Show.md' },
                        { type: 'unknown', path: 'Bad.md', title: 'Bad' },
                    ],
                },
            },
        });

        const service = new AnimeService(app, createMetadataService(app));
        const parsed = service.parseAnimeFromCache(file);

        expect(parsed?.relatedMedia).toEqual([
            { type: 'movie', path: 'Movies/Film.md', title: 'Film' },
            { type: 'series', path: 'Series/Show.md', title: 'Show' },
        ]);
    });

    it('writes related media links when updating anime', async () => {
        const file = createMockFile('Anime/Related.md', 'Related');
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

        const service = new AnimeService(app, createMetadataService(app));
        const item = {
            type: 'anime',
            filePath: file.path,
            displayName: 'Related',
            nameLower: 'related',
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
        } satisfies AnimeItem;

        await service.updateAnime(item, {
            relatedMedia: [
                { type: 'movie', path: 'Movies/Film.md', title: 'Film' },
            ],
        });

        expect(written.related_media).toEqual([
            { type: 'movie', path: 'Movies/Film.md', title: 'Film' },
        ]);
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

        const service = new AnimeService(app, createMetadataService(app));
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

        const service = new AnimeService(app, createMetadataService(app));
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
            integrationProvider: 'shikimori',
            integrationId: '777',
        } satisfies AnimeItem;

        await service.updateAnime(item, {
            activePartId: 'ova-1',
            integrationProvider: 'anilist',
            integrationId: '42',
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
        expect(written.integration_provider).toBe('anilist');
        expect(written.integration_id).toBe('42');
    });

    it('filters hidden custom posters by default and sorts by rating', () => {
        const app = createMockApp({});
        const service = new AnimeService(app, createMetadataService(app));
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
