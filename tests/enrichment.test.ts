import { describe, expect, it } from 'vitest';
import {
    mergeProviderMetadata,
    normalizeCommunityRating,
    SOURCE_SNAPSHOT_FIELD,
    synchronizeProviderMetadata,
} from '../src/services/integrations/enrichment';

describe('media enrichment merge', () => {
    it('fills missing provider fields while preserving personal and custom fields', () => {
        const current = {
            Name: 'Gothic 1 Remake',
            Platform: 'PC',
            Status: 'beaten',
            Storefront: 'steam',
            hours: 45.4,
            comment: 'Keep this',
            poster: '',
        };
        const result = mergeProviderMetadata(current, {
            name: 'Gothic 1 Remake',
            poster: 'https://example.com/gothic.jpg',
            plot: 'Provider description',
            year: 2026,
            integration_provider: 'steam',
            integration_id: '1297900',
        });

        expect(result.values).toMatchObject({
            Name: 'Gothic 1 Remake',
            Platform: 'PC',
            Status: 'beaten',
            Storefront: 'steam',
            hours: 45.4,
            comment: 'Keep this',
            poster: 'https://example.com/gothic.jpg',
            plot: 'Provider description',
            year: 2026,
            integration_provider: 'steam',
            integration_id: '1297900',
        });
        expect(result.patch).not.toHaveProperty('name');
        expect(result.patch).not.toHaveProperty('Status');
    });

    it('respects blacklist except for explicitly selected source identity', () => {
        const result = mergeProviderMetadata({}, {
            poster: 'cover.jpg',
            plot: 'Description',
            integration_provider: 'anilist',
            integration_id: '123',
        }, ['poster', 'integration_provider', 'integration_id']);

        expect(result.values).not.toHaveProperty('poster');
        expect(result.values).toMatchObject({
            plot: 'Description',
            integration_provider: 'anilist',
            integration_id: '123',
        });
    });

    it('merges parts by structural fallback and preserves progress', () => {
        const result = mergeProviderMetadata({
            anime_parts: [{
                id: 'manual-season-one',
                kind: 'tv',
                title: 'Season 1',
                season: 1,
                episode_current: 6,
                episode_total: null,
                status: 'watching',
            }],
        }, {
            anime_parts: [
                {
                    id: 'provider-100',
                    kind: 'tv',
                    title: 'Season 1',
                    season: 1,
                    episode_current: 0,
                    episode_total: 12,
                    status: 'planned',
                },
                {
                    id: 'provider-200',
                    kind: 'tv',
                    title: 'Season 2',
                    season: 2,
                    episode_current: 0,
                    episode_total: 12,
                    status: 'planned',
                },
            ],
        });

        const parts = result.values.anime_parts as Array<Record<string, unknown>>;
        expect(parts).toHaveLength(2);
        expect(parts[0]).toMatchObject({
            id: 'manual-season-one',
            episode_current: 6,
            episode_total: 12,
            status: 'watching',
        });
        expect(parts[1]).toMatchObject({ id: 'provider-200', season: 2 });
    });

    it('replaces provider metadata in synchronization mode while preserving custom fields', () => {
        const result = mergeProviderMetadata({
            Name: 'Old title',
            plot: 'Old description',
            Platform: ['PC'],
            status: 'completed',
            favorite: true,
            my_notes: 'Keep me',
        }, {
            name: 'New title',
            plot: 'New description',
            platforms: ['PC', 'PlayStation 5'],
            integration_provider: 'rawg',
            integration_id: '42',
        }, [], { overwriteProviderFields: true });

        expect(result.values).toMatchObject({
            Name: 'New title',
            plot: 'New description',
            Platform: ['PC', 'PlayStation 5'],
            status: 'completed',
            favorite: true,
            my_notes: 'Keep me',
            integration_provider: 'rawg',
            integration_id: '42',
        });
        expect(result.patch).not.toHaveProperty('status');
        expect(result.patch).not.toHaveProperty('favorite');
        expect(result.patch).not.toHaveProperty('my_notes');
    });

    it('synchronizes structured provider fields, adds new parts, and preserves personal progress', () => {
        const result = mergeProviderMetadata({
            anime_parts: [{
                id: 'local-season-one',
                kind: 'tv',
                title: 'Season One',
                season: 1,
                episode_current: 6,
                episode_total: 12,
                status: 'watching',
            }],
        }, {
            anime_parts: [
                {
                    id: 'provider-season-one',
                    kind: 'tv',
                    title: 'Season One Remastered',
                    season: 1,
                    episode_current: 0,
                    episode_total: 13,
                    status: 'planned',
                },
                {
                    id: 'provider-season-two',
                    kind: 'tv',
                    title: 'Season Two',
                    season: 2,
                    episode_current: 0,
                    episode_total: 24,
                    status: 'planned',
                },
            ],
        }, [], { overwriteProviderFields: true });

        const parts = result.values.anime_parts as Array<Record<string, unknown>>;
        expect(parts).toHaveLength(2);
        expect(parts[0]).toMatchObject({
            id: 'local-season-one',
            title: 'Season One Remastered',
            episode_current: 6,
            episode_total: 13,
            status: 'watching',
        });
        expect(parts[1]).toMatchObject({ id: 'provider-season-two', season: 2, episode_total: 24 });
    });

    it('preserves custom list additions and intentional removals across source updates', () => {
        const source = { provider: 'anilist' as const, id: '42' };
        const first = synchronizeProviderMetadata({
            genres: ['Любимое'],
        }, {
            integration_provider: 'anilist',
            integration_id: '42',
            genres: ['Action', 'RPG'],
        }, source);

        expect(first.values.genres).toEqual(['Action', 'RPG', 'Любимое']);
        expect(first.values).toHaveProperty(SOURCE_SNAPSHOT_FIELD);

        const secondCurrent = {
            ...first.values,
            genres: ['RPG', 'Любимое', 'Мрачное'],
        };
        const second = synchronizeProviderMetadata(secondCurrent, {
            integration_provider: 'anilist',
            integration_id: '42',
            genres: ['Action', 'RPG', 'Adventure'],
        }, source);

        expect(second.values.genres).toEqual(['RPG', 'Adventure', 'Любимое', 'Мрачное']);
    });

    it('updates untouched scalar fields but preserves scalars edited after the previous source snapshot', () => {
        const source = { provider: 'tmdb' as const, id: '100' };
        const first = synchronizeProviderMetadata({
            plot: 'Old provider plot',
            year: 2020,
        }, {
            integration_provider: 'tmdb',
            integration_id: '100',
            plot: 'First provider plot',
            year: 2021,
        }, source);

        expect(first.values.plot).toBe('First provider plot');
        expect(first.values.year).toBe(2021);

        const second = synchronizeProviderMetadata({
            ...first.values,
            plot: 'Моё описание',
        }, {
            integration_provider: 'tmdb',
            integration_id: '100',
            plot: 'Second provider plot',
            year: 2022,
        }, source);

        expect(second.values.plot).toBe('Моё описание');
        expect(second.values.year).toBe(2022);
    });

    it('replaces the previous generated IGDB website URL with the game page', () => {
        const source = { provider: 'igdb' as const, id: '1877' };
        const oldUrl = 'https://discord.gg/cyberpunkgame';
        const url = 'https://www.igdb.com/games/cyberpunk-2077';
        const original = synchronizeProviderMetadata({}, { url: oldUrl }, source);

        expect(synchronizeProviderMetadata({ url: oldUrl }, { url }, source).patch.url).toBe(url);
        expect(synchronizeProviderMetadata(original.values, { url }, source).patch.url).toBe(url);
        const customUrl = 'https://example.org/my-cyberpunk-link';
        const edited = synchronizeProviderMetadata({ ...original.values, url: customUrl }, { url }, source);
        expect(edited.values.url).toBe(customUrl);
    });

    it('uses the previous provider snapshot when changing sources so custom values survive relinking', () => {
        const oldSource = { provider: 'tmdb' as const, id: '100' };
        const first = synchronizeProviderMetadata({}, {
            integration_provider: 'tmdb',
            integration_id: '100',
            name: 'Provider title',
            genres: ['Drama', 'Crime'],
        }, oldSource);

        const relinked = synchronizeProviderMetadata({
            ...first.values,
            name: 'Моё название',
            genres: ['Drama', 'Любимое'],
        }, {
            integration_provider: 'omdb',
            integration_id: 'tt100',
            name: 'New source title',
            genres: ['Drama', 'Thriller'],
        }, { provider: 'omdb', id: 'tt100' });

        expect(relinked.values.name).toBe('Моё название');
        expect(relinked.values.genres).toEqual(['Drama', 'Thriller', 'Любимое']);
        expect(relinked.values.integration_provider).toBe('omdb');
    });

    it('preserves edited part titles while refreshing provider totals and adding new parts', () => {
        const source = { provider: 'anilist' as const, id: '42' };
        const first = synchronizeProviderMetadata({}, {
            integration_provider: 'anilist',
            integration_id: '42',
            anime_parts: [{
                id: 'season-1', kind: 'tv', title: 'Season 1', season: 1,
                episode_current: 0, episode_total: 12, status: 'planned',
            }],
        }, source);
        const currentParts = structuredClone(first.values.anime_parts) as Array<Record<string, unknown>>;
        currentParts[0].title = 'Мой первый сезон';
        currentParts[0].episode_current = 7;
        currentParts[0].status = 'watching';

        const second = synchronizeProviderMetadata({
            ...first.values,
            anime_parts: currentParts,
        }, {
            integration_provider: 'anilist',
            integration_id: '42',
            anime_parts: [
                {
                    id: 'season-1', kind: 'tv', title: 'Season One', season: 1,
                    episode_current: 0, episode_total: 13, status: 'planned',
                },
                {
                    id: 'season-2', kind: 'tv', title: 'Season 2', season: 2,
                    episode_current: 0, episode_total: 24, status: 'planned',
                },
            ],
        }, source);

        const parts = second.values.anime_parts as Array<Record<string, unknown>>;
        expect(parts).toHaveLength(2);
        expect(parts[0]).toMatchObject({
            title: 'Мой первый сезон',
            episode_current: 7,
            episode_total: 13,
            status: 'watching',
        });
    });

    it('normalizes provider rating scales consistently', () => {
        expect(normalizeCommunityRating('rawg', 4.42)).toBe(88.4);
        expect(normalizeCommunityRating('anilist', 84)).toBe(84);
        expect(normalizeCommunityRating('igdb', 9)).toBe(9);
        expect(normalizeCommunityRating('shikimori', 6.52)).toBe(65.2);
    });
});
