import { describe, expect, it } from 'vitest';
import { createLibraryMembership } from '../src/services/integrations/libraryMembership';
import type { SearchResult } from '../src/services/integrations/types';

const game: SearchResult = { id: '1091500', provider: 'steam', title: 'Cyberpunk 2077', year: '2020' };
describe('search library membership', () => {
    it('recognizes renamed notes by provider identity', () => {
        const contains = createLibraryMembership([{ basename: 'Любимая игра', metadata: { integration_provider: 'steam', integration_id: 1091500 } }], 'games');
        expect(contains(game)).toBe(true);
    });
    it('recognizes manual notes and results from another provider by exact title and year', () => {
        const contains = createLibraryMembership([{ basename: 'CP', metadata: { name: 'Cyberpunk 2077', year: 2020, integration_provider: 'rawg', integration_id: 1 } }], 'games');
        expect(contains(game)).toBe(true);
        expect(contains({ ...game, year: '2025' })).toBe(false);
        expect(contains({ ...game, title: 'Cyberpunk 2077: Phantom Liberty' })).toBe(false);
    });
    it('distinguishes catalogue IDs and media types with matching titles', () => {
        const contains = createLibraryMembership([{ basename: 'Cyberpunk 2077', metadata: { integration_provider: 'steam', integration_id: 999 } }], 'games');
        expect(contains(game)).toBe(false);
        const films = createLibraryMembership([{ basename: 'Cyberpunk 2077', metadata: { type: 'movie' } }], 'games');
        expect(films(game)).toBe(false);
    });
    it('handles legacy Steam URLs and manual filenames', () => {
        expect(createLibraryMembership([{ basename: 'Renamed', metadata: { url: 'https://store.steampowered.com/app/1091500/' } }], 'games')(game)).toBe(true);
        expect(createLibraryMembership([{ basename: 'Cyberpunk 2077', metadata: {} }], 'games')(game)).toBe(true);
    });
});


it('recognizes an explicit AniList link on another provider and rejects a conflicting link', () => {
    const contains = createLibraryMembership([{ basename: 'Renamed', metadata: { type: 'anime', title: 'Same title', anilist_id: 21, integration_provider: 'shikimori', integration_id: '999' } }], 'anime');
    expect(contains({ provider: 'anilist', id: '21', title: 'Original title' })).toBe(true);
    expect(contains({ provider: 'anilist', id: '22', title: 'Same title' })).toBe(false);
});

it('distinguishes TMDB films and series with matching IDs and titles inside Anime', () => {
    const contains = createLibraryMembership([{ basename: 'Avatar', metadata: {
        type: 'anime', integration_provider: 'tmdb', integration_id: 17, integration_source_kind: 'series',
    } }], 'anime');
    const result = { id: '17', provider: 'tmdb', title: 'Avatar' } as const;
    expect(contains({ ...result, workTypeMedia: 'series' })).toBe(true);
    expect(contains({ ...result, workTypeMedia: 'movie' })).toBe(false);
});
