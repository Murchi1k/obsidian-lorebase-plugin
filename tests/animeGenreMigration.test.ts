import { describe, expect, it } from 'vitest';
import { animeGenreMigration } from '../src/utils/animeGenreMigration';
import { createMetadataService, createMockApp, createMockFile } from './helpers/testHelpers';
import { AnimeService } from '../src/services/AnimeService';

describe('legacy anime genres', () => {
    it('merges genres without duplicates and retains personal tags', () => {
        expect(animeGenreMigration({ genres: ['Action'], tags: ['action', 'Sci-Fi', 'Психологическое', 'my-favorites', 'watch/with-friend'] })).toEqual({
            genres: ['Action', 'Sci-Fi', 'Психологическое'], tags: ['my-favorites', 'watch/with-friend'], lorebase_anime_genres_migrated: true,
        });
    });
    it('recovers provider genres from a source snapshot, including unrecognized names', () => {
        expect(animeGenreMigration({ tags: ['Custom Provider Genre', 'personal'], lorebase_source_snapshot: { lists: { tags: ['Custom Provider Genre'] } } })).toMatchObject({ genres: ['Custom Provider Genre'], tags: ['personal'] });
    });
    it('runs once so later personal tags are never reclassified', () => {
        expect(animeGenreMigration({ tags: ['Action'], lorebase_anime_genres_migrated: true })).toBeNull();
        expect(animeGenreMigration({ tags: ['personal'] })).toEqual({ lorebase_anime_genres_migrated: true });
    });
    it('persists the migration while preserving inline tags and unrelated frontmatter', async () => {
        const file = createMockFile('Anime/Test.md', 'Test');
        const frontmatter = { type: 'anime', tags: ['Action', 'Fantasy', 'personal'], genres: ['Drama'], episode_current: 5 };
        const app = createMockApp({ [file.path]: { frontmatter, tags: [{ tag: '#inline' }] } });
        app.fileManager.processFrontMatter = async (_file, handler) => handler(frontmatter);
        const metadata = createMetadataService(app);
        await metadata.migrateAnimeGenres(file);
        const first = JSON.stringify(frontmatter);
        await metadata.migrateAnimeGenres(file);
        expect(JSON.stringify(frontmatter)).toBe(first);
        expect(frontmatter).toMatchObject({ tags: ['personal'], genres: ['Drama', 'Action', 'Fantasy'], episode_current: 5 });
        const parsed = new AnimeService(app, metadata).parseAnimeFromCache(file)!;
        expect(parsed.tags).toEqual(['personal', 'inline']);
        expect(parsed.genres).toEqual(['drama', 'action', 'fantasy']);
    });
});
