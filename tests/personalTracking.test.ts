import { describe, expect, it } from 'vitest';
import { GameService } from '../src/services/GameService';
import { AnimeService } from '../src/services/AnimeService';
import { VideoService } from '../src/services/VideoService';
import { ReadingService } from '../src/services/ReadingService';
import { createMetadataService, createMockApp, createMockFile } from './helpers/testHelpers';

describe('personal completion tracking', () => {
    it('stores per-platform repeats and preserves them when provider metadata changes', async () => {
        const file = createMockFile('Games/Test.md', 'Test');
        const frontmatter: Record<string, unknown> = { type: 'game', platforms: ['PC', 'PS5'], played_on: 'PC', repeat_count: 2 };
        const app = createMockApp({ [file.path]: { frontmatter } });
        app.vault.getAbstractFileByPath = () => file;
        app.fileManager.processFrontMatter = async (_file, handler) => handler(frontmatter);
        const service = new GameService(app, createMetadataService(app));
        const item = service.parseGameFromCache(file)!;
        expect(item.platformPlaythroughs).toEqual([{ platform: 'PC', selected: true, repeatCount: 2 }]);
        const platformPlaythroughs = [
            { platform: 'PC', selected: true, repeatCount: 2 },
            { platform: 'PS5', selected: true, repeatCount: 1 },
            { platform: 'Xbox', selected: false, repeatCount: 4 },
        ];
        await service.updateGame(item, { platformPlaythroughs });
        expect(frontmatter.repeat_count).toBe(3);
        await service.updateGame(item, { platforms: ['PS5'] });
        const reopened = service.parseGameFromCache(file)!;
        expect(reopened.platformPlaythroughs).toEqual(platformPlaythroughs);
        expect(reopened.repeatCount).toBe(3);
        expect(reopened.platforms).toEqual(['PS5']);
    });
    it('keeps provider platforms separate from the selected playthrough platform across updates', async () => {
        const file = createMockFile('Games/Test.md', 'Test');
        const frontmatter = { type: 'game', status: 'playing', platforms: ['PC', 'PS5'], played_on: 'PS5', repeat_count: 2 };
        const app = createMockApp({ [file.path]: { frontmatter } });
        app.vault.getAbstractFileByPath = () => file;
        app.fileManager.processFrontMatter = async (_file, handler) => handler(frontmatter);
        const service = new GameService(app, createMetadataService(app));
        const item = service.parseGameFromCache(file)!;
        expect(item.playedOn).toBe('PS5');
        expect(item.repeatCount).toBe(2);
        await service.updateGame(item, { platforms: ['PC', 'PS5', 'Xbox'] });
        expect(frontmatter.played_on).toBe('PS5');
        await service.updateGame(item, { playedOn: 'Steam Deck', repeatCount: 3 });
        expect(frontmatter).toMatchObject({ platforms: ['PC', 'PS5', 'Xbox'], played_on: 'Steam Deck', repeat_count: 3, status: 'playing' });
        await service.updateGame(item, { playedOn: '' });
        expect(frontmatter).not.toHaveProperty('played_on');
    });

    it.each(['anime', 'movie', 'series', 'manga'] as const)('round-trips repeats for %s without changing current progress', async type => {
        const file = createMockFile(`Library/${type}.md`, type);
        const frontmatter = { type, repeat_count: '2', episode_current: 4, chapter_current: 7 };
        const app = createMockApp({ [file.path]: { frontmatter } });
        app.vault.getAbstractFileByPath = () => file;
        app.fileManager.processFrontMatter = async (_file, handler) => handler(frontmatter);
        const metadata = createMetadataService(app);
        if (type === 'anime') {
            const service = new AnimeService(app, metadata);
            const item = service.parseAnimeFromCache(file)!;
            expect(item.repeatCount).toBe(2);
            await service.updateAnime(item, { repeatCount: 3 });
            expect(service.parseAnimeFromCache(file)?.repeatCount).toBe(3);
        } else if (type === 'manga') {
            const service = new ReadingService(app, type, 'Library', metadata);
            const item = service.parseFromCache(file)!;
            expect(item.repeatCount).toBe(2);
            await service.updateItem(item, { repeatCount: 3 });
            expect(service.parseFromCache(file)?.repeatCount).toBe(3);
        } else {
            const service = new VideoService(app, type, 'Library', metadata);
            const item = service.parseFromCache(file)!;
            expect(item.repeatCount).toBe(2);
            await service.updateItem(item, { repeatCount: 3 });
            expect(service.parseFromCache(file)?.repeatCount).toBe(3);
        }
        expect(frontmatter).toMatchObject({ repeat_count: 3, episode_current: 4, chapter_current: 7 });
    });

    it('does not read or write repeat counts for books', async () => {
        const file = createMockFile('Books/Test.md', 'Test');
        const frontmatter = { type: 'book' };
        const app = createMockApp({ [file.path]: { frontmatter } });
        app.vault.getAbstractFileByPath = () => file;
        app.fileManager.processFrontMatter = async (_file, handler) => handler(frontmatter);
        const service = new ReadingService(app, 'book', 'Books', createMetadataService(app));
        const item = service.parseFromCache(file)!;
        expect(item.repeatCount).toBeUndefined();
        await service.updateItem(item, { repeatCount: 3 });
        expect(frontmatter).not.toHaveProperty('repeat_count');
    });
});
