import { describe, expect, it } from 'vitest';
import type { App } from 'obsidian';
import { IntegrationService } from '../src/services/IntegrationService';
import type { AnimeDetails } from '../src/services/integrations/types';
import { createMockApp } from './helpers/testHelpers';
import type { ManualCreateDraft } from '../src/modals/ManualCreateModal';
import { saveManualImageFileToVault } from '../src/services/integrations/imageStorage';

describe('IntegrationService anime parts values', () => {
    it('keeps initial anime import free of provider parts while saving source identity', () => {
        const service = new IntegrationService(createMockApp({}), () => ({
            integrations: undefined,
        } as never));

        const details: AnimeDetails = {
            name: 'Series',
            description: 'Description',
            image: 'poster.jpg',
            imageHorizontal: 'wide.jpg',
            tags: ['fantasy'],
            studios: ['Studio'],
            year: '2024',
            imdbRating: '8.5',
            url: 'https://anilist.co/anime/42',
            format: 'tv',
            parts: [
                { id: 'anilist-1', kind: 'tv', title: 'Season 1', seasonNumber: 1, episodeCurrent: 0, episodeTotal: 12, status: 'planned' },
                { id: 'anilist-2', kind: 'ova', title: 'OVA', seasonNumber: null, episodeCurrent: 0, episodeTotal: 1, status: 'planned' },
            ],
        };

        const values = (service as unknown as {
            buildAnimeValues(details: AnimeDetails, source: unknown): Record<string, unknown>;
        }).buildAnimeValues(details, {
            provider: 'anilist',
            id: '42',
            parts: [],
        });

        expect(values.integrationProvider).toBe('anilist');
        expect(values.integrationId).toBe('42');
        expect(values.activePartId).toBe('');
        expect(values.episodeCurrent).toBe('');
        expect(values.animePartsYaml).toBe('  []');
    });

    it('builds anime template values from reviewed parts and source identity', () => {
        const service = new IntegrationService(createMockApp({}), () => ({
            integrations: undefined,
        } as never));

        const details: AnimeDetails = {
            name: 'Series',
            description: 'Description',
            image: 'poster.jpg',
            imageHorizontal: 'wide.jpg',
            tags: ['fantasy'],
            studios: ['Studio'],
            year: '2024',
            imdbRating: '8.5',
            url: 'https://anilist.co/anime/42',
            format: 'tv',
            parts: [
                { id: 'anilist-1', kind: 'tv', title: 'Season 1', seasonNumber: 1, episodeCurrent: 0, episodeTotal: 12, status: 'planned' },
                { id: 'anilist-2', kind: 'ova', title: 'OVA', seasonNumber: null, episodeCurrent: 0, episodeTotal: 1, status: 'planned' },
            ],
        };

        const values = (service as unknown as {
            buildAnimeValues(details: AnimeDetails, source: unknown): Record<string, unknown>;
        }).buildAnimeValues(details, {
            parts: [
                { id: 'anilist-2', kind: 'ova', title: 'OVA', seasonNumber: null, episodeCurrent: 1, episodeTotal: 1, status: 'completed' },
            ],
            activePartId: 'anilist-2',
            status: 'watching',
            provider: 'anilist',
            id: '42',
        });

        expect(values.activePartId).toBe('anilist-2');
        expect(values.episodeCurrent).toBe(1);
        expect(values.status).toBe('watching');
        expect(values.integrationProvider).toBe('anilist');
        expect(values.integrationId).toBe('42');
        expect(values.animePartsYaml).toContain('id: "anilist-2"');
        expect(values.animePartsYaml).not.toContain('id: "anilist-1"');
    });

    it('maps manual cover values to anime image fields and poster-based media fields', () => {
        const service = new IntegrationService(createMockApp({}), () => ({
            integrations: undefined,
        } as never));
        const buildManualValues = (service as unknown as {
            buildManualValues(draft: ManualCreateDraft): Record<string, unknown>;
        }).buildManualValues.bind(service);

        const animeValues = buildManualValues({
            ...createManualDraft('anime'),
            poster: 'covers/frieren.jpg',
            posterHorizontal: 'covers/frieren-wide.jpg',
        });
        const bookValues = buildManualValues({
            ...createManualDraft('books'),
            poster: 'covers/dune.jpg',
            posterHorizontal: 'covers/dune-wide.jpg',
        });

        expect(animeValues.image).toBe('covers/frieren.jpg');
        expect(animeValues.ImageHorizontal).toBe('covers/frieren-wide.jpg');
        expect(bookValues.Poster).toBe('covers/dune.jpg');
        expect(bookValues.PosterHorizontal).toBe('covers/dune-wide.jpg');
    });

    it('copies a manually selected cover file into the configured vault image folder', async () => {
        const writes: Array<{ path: string; data: ArrayBuffer }> = [];
        const folders: string[] = [];
        const app = {
            vault: {
                getAbstractFileByPath() {
                    return null;
                },
                async createFolder(path: string) {
                    folders.push(path);
                },
                adapter: {
                    async writeBinary(path: string, data: ArrayBuffer) {
                        writes.push({ path, data });
                    },
                },
            },
        } as unknown as App;
        const file = {
            name: 'cover.png',
            type: 'image/png',
            async arrayBuffer() {
                return new Uint8Array([1, 2, 3]).buffer;
            },
        } as File;

        const path = await saveManualImageFileToVault(app, file, {
            baseFolder: 'files/lorebase/images',
            kind: 'books',
            title: 'Dune',
            label: 'Poster',
        });

        expect(path).toBe('files/lorebase/images/books/Dune - Poster.png');
        expect(folders).toEqual(['files', 'files/lorebase', 'files/lorebase/images', 'files/lorebase/images/books']);
        expect(writes).toHaveLength(1);
        expect(writes[0].path).toBe(path);
    });
});

function createManualDraft(kind: ManualCreateDraft['kind']): ManualCreateDraft {
    return {
        kind,
        title: 'Manual',
        year: '',
        released: '',
        status: kind === 'games' ? 'not_started' : 'planned',
        url: '',
        poster: '',
        posterHorizontal: '',
        posterFile: null,
        genres: [],
        tags: [],
        rating: null,
        gameSeries: '',
        format: 'tv',
        animeParts: [{ id: 'tv-1', kind: 'tv', title: 'Season 1', seasonNumber: 1, episodeCurrent: 0, episodeTotal: null, status: 'planned' }],
        activeAnimePartId: 'tv-1',
        seasonNumber: kind === 'series' ? 1 : null,
        episodeCurrent: 0,
        episodeTotal: kind === 'movies' ? 1 : null,
        pageCurrent: 0,
        pageTotal: null,
        chapterCurrent: 0,
        chapterTotal: null,
        volumeCurrent: kind === 'manga' ? 1 : null,
        volumeTotal: null,
    };
}
