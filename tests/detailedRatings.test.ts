import { describe, expect, it } from 'vitest';
import type { MediaType, MediaItem } from '../src/types';
import { GameService } from '../src/services/GameService';
import { AnimeService } from '../src/services/AnimeService';
import { ReadingService } from '../src/services/ReadingService';
import { VideoService } from '../src/services/VideoService';
import { MusicService } from '../src/services/MusicService';
import { MetadataService } from '../src/services/MetadataService';
import { parseDetailedRatings } from '../src/utils/detailedRatings';
import { createMockApp, createMockFile } from './helpers/testHelpers';

describe('independent detailed ratings', () => {
    it('accepts half scores, filters malformed rows, and keeps an explicitly emptied list', () => {
        expect(parseDetailedRatings(undefined)).toBeUndefined();
        expect(parseDetailedRatings([])).toEqual([]);
        expect(parseDetailedRatings([null, { name: ' Story ', value: '8.5' }, { name: 'story', value: 9 }, { name: '', value: 7 }, { name: 'Sound', value: 99 }])).toEqual([
            { name: 'Story', value: 8.5 }, { name: 'Sound', value: null },
        ]);
    });
    it.each<MediaType>(['game', 'anime', 'movie', 'series', 'book', 'manga', 'music'])('%s saves, reloads and deletes criteria without changing the overall score', async type => {
        const file = createMockFile(`Media/${type}.md`, type);
        const fm: Record<string, unknown> = { type, title: 'Title', userRating: 4, rating: 4, status: type === 'game' ? 'not_started' : 'planned' };
        const app = createMockApp({ [file.path]: { frontmatter: fm } });
        app.vault.getAbstractFileByPath = () => file;
        app.fileManager.processFrontMatter = async (_file, callback) => { callback(fm); };
        const metadata = new MetadataService(app);
        const game = new GameService(app, metadata), anime = new AnimeService(app, metadata);
        const reading = new ReadingService(app, type === 'book' ? 'book' : 'manga', 'Media', metadata);
        const video = new VideoService(app, type === 'movie' ? 'movie' : 'series', 'Media', metadata);
        const music = new MusicService(app, 'Media', metadata);
        const parse = (): MediaItem | null => type === 'game' ? game.parseGameFromCache(file) : type === 'anime' ? anime.parseAnimeFromCache(file)
            : type === 'book' || type === 'manga' ? reading.parseFromCache(file) : type === 'music' ? music.parseFromCache(file) : video.parseFromCache(file);
        const save = async (ratings: NonNullable<MediaItem['detailedRatings']>) => {
            const item = parse()!;
            const updates = { detailedRatings: ratings };
            if (item.type === 'game') await game.updateGame(item, updates);
            else if (item.type === 'anime') await anime.updateAnime(item, updates);
            else if (item.type === 'book' || item.type === 'manga') await reading.updateItem(item, updates);
            else if (item.type === 'music') await music.updateItem(item, updates);
            else await video.updateItem(item, updates);
        };
        const ratings = [{ name: 'Мой критерий', value: 7.5 }, { name: 'Сюжет', value: null }];
        await save(ratings);
        expect(parse()?.detailedRatings).toEqual(ratings);
        expect(parse()?.userRating).toBe(4);
        await save([]);
        expect(parse()?.detailedRatings).toEqual([]);
        expect(parse()?.userRating).toBe(4);
    });
});
