import { describe, expect, it } from 'vitest';
import type { App, TFile } from 'obsidian';
import { VideoService } from '../src/services/VideoService';
import type { MovieItem, SeriesItem } from '../src/types';
import { createMetadataService, createMockApp, createMockFile } from './helpers/testHelpers';

describe('VideoService', () => {
    it('parses movie frontmatter from cache', () => {
        const file = createMockFile('Movies/Blade Runner.md', 'Blade Runner');
        const app = createMockApp({
            [file.path]: {
                frontmatter: {
                    type: 'movie',
                    title: 'Blade Runner',
                    poster: 'https://cdn.example/blade-runner.jpg',
                    poster_b: 'https://cdn.example/blade-runner-wide.jpg',
                    plot: 'Replicants and memory.',
                    status: 'completed',
                    userRating: '5',
                    favorite: 'true',
                    year: '1982',
                    genres: 'Sci-Fi, Noir',
                    tags: ['Cyberpunk'],
                    released: '1982-06-25',
                    runtime: '117 min',
                    director: 'Ridley Scott',
                    actors: 'Harrison Ford',
                    rating: '8.1',
                    integration_provider: 'tmdb',
                    integration_id: 78,
                    related_media: [
                        { type: 'series', path: 'Series/Blade Runner Black Lotus.md', title: 'Black Lotus' },
                    ],
                },
                tags: [{ tag: '#Classic' }],
            },
        });

        const service = new VideoService(app, 'movie', 'Movies', createMetadataService(app));
        const parsed = service.parseFromCache(file);

        expect(parsed).not.toBeNull();
        expect(parsed?.type).toBe('movie');
        expect(parsed?.displayName).toBe('Blade Runner');
        expect(parsed?.status).toBe('completed');
        expect(parsed?.userRating).toBe(5);
        expect(parsed?.favorite).toBe(true);
        expect(parsed?.year).toBe(1982);
        expect(parsed?.imageUrl).toBe('https://cdn.example/blade-runner.jpg');
        expect(parsed?.horizontalImageUrl).toBe('https://cdn.example/blade-runner-wide.jpg');
        expect(parsed?.genres).toContain('sci-fi');
        expect(parsed?.tags).toContain('classic');
        expect((parsed as MovieItem)?.director).toBe('Ridley Scott');
        expect(parsed?.integrationProvider).toBe('tmdb');
        expect(parsed?.integrationId).toBe('78');
        expect(parsed?.relatedMedia).toEqual([
            { type: 'series', path: 'Series/Blade Runner Black Lotus.md', title: 'Black Lotus' },
        ]);
    });

    it('parses series parts and uses the active part for progress', () => {
        const file = createMockFile('Series/Show.md', 'Show');
        const app = createMockApp({
            [file.path]: {
                frontmatter: {
                    type: 'series',
                    title: 'Show',
                    status: 'watching',
                    active_part_id: 'season-2',
                    series_parts: [
                        {
                            id: 'season-1',
                            title: 'Season 1',
                            season: 1,
                            episode_current: 10,
                            episode_total: 10,
                            status: 'completed',
                        },
                        {
                            id: 'season-2',
                            title: 'Season 2',
                            season: 2,
                            episode_current: 3,
                            episode_total: 8,
                            status: 'watching',
                        },
                    ],
                },
            },
        });

        const service = new VideoService(app, 'series', 'Series', createMetadataService(app));
        const parsed = service.parseFromCache(file) as SeriesItem | null;

        expect(parsed).not.toBeNull();
        expect(parsed?.type).toBe('series');
        expect(parsed?.parts).toHaveLength(2);
        expect(parsed?.activePartId).toBe('season-2');
        expect(parsed?.episodeCurrent).toBe(3);
        expect(parsed?.episodeTotal).toBe(8);
        expect(parsed?.seasons).toBe(2);
    });

    it('trashes video notes instead of deleting them directly', async () => {
        const file = createMockFile('Movies/Safe Delete.md', 'Safe Delete');
        let trashedFile: TFile | null = null;
        let deleteCalled = false;
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
                async delete(): Promise<void> {
                    deleteCalled = true;
                },
            },
            fileManager: {
                async trashFile(target: TFile): Promise<void> {
                    trashedFile = target;
                },
            },
        } as unknown as App;

        const service = new VideoService(app, 'movie', 'Movies', createMetadataService(app));
        await service.deleteItem({
            type: 'movie',
            filePath: file.path,
            displayName: 'Safe Delete',
            nameLower: 'safe delete',
            year: null,
            description: '',
            summary: '',
            userRating: null,
            favorite: false,
            poster: null,
            imageUrl: '',
            horizontalImageUrl: null,
            hasCustomPoster: false,
            isAdult: false,
            status: 'planned',
            genres: [],
            tags: [],
            sourceUrl: null,
            integrationProvider: null,
            integrationId: null,
            parts: [],
            activePartId: null,
            relatedMedia: [],
        });

        expect(trashedFile).toBe(file);
        expect(deleteCalled).toBe(false);
    });
});
