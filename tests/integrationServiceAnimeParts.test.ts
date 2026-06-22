import { describe, expect, it } from 'vitest';
import { IntegrationService } from '../src/services/IntegrationService';
import type { AnimeDetails } from '../src/services/integrations/types';
import { createMockApp } from './helpers/testHelpers';

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
});
