import { describe, expect, it } from 'vitest';
import { GameService } from '../src/services/GameService';
import type { GameItem } from '../src/types';
import { createMockApp, createBaseFilter, createMetadataService, createMockFile } from './helpers/testHelpers';
import { getSortOptionsForMediaType, getStatusOptionsForMediaType } from '../src/views/library/viewOptions';
import { shouldGroupBySeries } from '../src/views/library/rendering';

describe('GameService', () => {
    it('parses frontmatter from cache into game model', () => {
        const file = createMockFile('Games/Mass Effect.md', 'Mass Effect');
        const app = createMockApp({
            [file.path]: {
                frontmatter: {
                    type: 'game',
                    poster: 'https://cdn.example/me.jpg',
                    status: 'played',
                    userRating: '5',
                    year: '2007',
                    plot: 'Sci-fi RPG',
                    favorite: true,
                    Sex18: 'true',
                    gameSeries: 'Mass Effect',
                    dateCompleted: '2024-05-10',
                    genres: ['RPG'],
                    tags: ['Sci-Fi'],
                },
                tags: [{ tag: '#Space' }],
            },
        });

        const service = new GameService(app, createMetadataService(app));
        const parsed = service.parseGameFromCache(file);

        expect(parsed).not.toBeNull();
        expect(parsed?.type).toBe('game');
        expect(parsed?.status).toBe('completed');
        expect(parsed?.userRating).toBe(5);
        expect(parsed?.year).toBe(2007);
        expect(parsed?.isAdult).toBe(true);
        expect(parsed?.tags).toContain('sci-fi');
        expect(parsed?.tags).toContain('space');
        expect(parsed?.genres).toContain('rpg');
        expect(parsed?.dateCompleted).toBeTypeOf('number');
    });

    it('filters and sorts games by rules', () => {
        const app = createMockApp({});
        const service = new GameService(app, createMetadataService(app));
        const games: GameItem[] = [
            {
                type: 'game',
                filePath: 'a.md',
                displayName: 'Bravo',
                nameLower: 'bravo',
                year: 2020,
                description: '',
                userRating: 4,
                favorite: false,
                poster: '',
                imageUrl: '',
                horizontalImageUrl: null,
                hasCustomPoster: false,
                isAdult: false,
                status: 'completed',
                gameSeries: '',
                dateCompleted: null,
                tags: [],
                genres: [],
            },
            {
                type: 'game',
                filePath: 'b.md',
                displayName: 'Alpha',
                nameLower: 'alpha',
                year: 2021,
                description: '',
                userRating: 5,
                favorite: true,
                poster: '',
                imageUrl: '',
                horizontalImageUrl: null,
                hasCustomPoster: true,
                isAdult: false,
                status: 'playing',
                gameSeries: '',
                dateCompleted: null,
                tags: [],
                genres: [],
            },
            {
                type: 'game',
                filePath: 'c.md',
                displayName: 'Charlie',
                nameLower: 'charlie',
                year: 2019,
                description: '',
                userRating: 3,
                favorite: false,
                poster: '',
                imageUrl: '',
                horizontalImageUrl: null,
                hasCustomPoster: false,
                isAdult: true,
                status: 'dropped',
                gameSeries: '',
                dateCompleted: null,
                tags: [],
                genres: [],
            },
        ];

        const base = service.filterAndSort(games, createBaseFilter(), 'name', 'asc', false);
        expect(base.map((item) => item.displayName)).toEqual(['Bravo']);

        const searchFilter = createBaseFilter();
        searchFilter.searchTerm = 'alpha';
        const withSearch = service.filterAndSort(games, searchFilter, 'name', 'asc', false);
        expect(withSearch.map((item) => item.displayName)).toEqual(['Alpha']);
    });

    it('groups only in explicit series sort mode', () => {
        const filter = createBaseFilter();

        expect(shouldGroupBySeries('game', 'name', 'grid', filter, 10)).toBe(false);
        expect(shouldGroupBySeries('game', 'series', 'grid', filter, 10)).toBe(true);
    });

    it('shows series as the primary game sort option', () => {
        expect(getSortOptionsForMediaType('game')[0]).toMatchObject({ field: 'series' });
    });

    it('sorts games chronologically inside series groups', () => {
        const app = createMockApp({});
        const service = new GameService(app, createMetadataService(app));
        const createGame = (displayName: string, year: number): GameItem => ({
            type: 'game',
            filePath: `${displayName}.md`,
            displayName,
            nameLower: displayName.toLowerCase(),
            year,
            description: '',
            userRating: null,
            favorite: false,
            poster: '',
            imageUrl: '',
            horizontalImageUrl: null,
            hasCustomPoster: false,
            isAdult: false,
            status: 'not_started',
            gameSeries: 'Same series',
            dateCompleted: null,
            tags: [],
            genres: [],
        });

        const sortedByName = [
            createGame('Alpha', 2024),
            createGame('Bravo', 1999),
            createGame('Charlie', 2010),
        ];

        const grouped = service.groupBySeries(sortedByName, 'asc');
        const seriesItems = Array.from(grouped.values())[0] ?? [];

        expect(seriesItems.map((item) => item.displayName)).toEqual(['Bravo', 'Charlie', 'Alpha']);
    });

    it('uses custom status labels without changing status values', () => {
        const options = getStatusOptionsForMediaType('game', {
            games: { completed: 'Cleared on easy' },
            anime: {},
        });

        expect(options.find((option) => option.status === 'completed')).toEqual({
            status: 'completed',
            label: 'Cleared on easy',
        });
    });

    it('exposes wishlist as a first-class game status option', () => {
        expect(getStatusOptionsForMediaType('game')).toContainEqual({
            status: 'wishlist',
            label: 'Wishlist',
        });
    });

    it('parses wishlist game status from status field and legacy flag', () => {
        const statusFile = createMockFile('Games/Wish Status.md', 'Wish Status');
        const flagFile = createMockFile('Games/Wish Flag.md', 'Wish Flag');
        const app = createMockApp({
            [statusFile.path]: {
                frontmatter: {
                    status: 'wishlist',
                },
            },
            [flagFile.path]: {
                frontmatter: {
                    wishlist: 'true',
                },
            },
        });

        const service = new GameService(app, createMetadataService(app));

        expect(service.parseGameFromCache(statusFile)?.status).toBe('wishlist');
        expect(service.parseGameFromCache(flagFile)?.status).toBe('wishlist');
    });

    it('counts wishlist games in statistics', () => {
        const app = createMockApp({});
        const service = new GameService(app, createMetadataService(app));
        const baseGame: GameItem = {
            type: 'game',
            filePath: 'wish.md',
            displayName: 'Wish',
            nameLower: 'wish',
            year: 2026,
            description: '',
            userRating: null,
            favorite: false,
            poster: '',
            imageUrl: '',
            horizontalImageUrl: null,
            hasCustomPoster: false,
            isAdult: false,
            status: 'wishlist',
            gameSeries: '',
            dateCompleted: null,
            tags: [],
            genres: [],
        };

        const stats = service.calculateStats([baseGame]);

        expect(stats.wishlist).toBe(1);
        expect(stats.statusPercentages.wishlist).toBe(100);
    });

    it('filters plan presets as regular tags', () => {
        const app = createMockApp({});
        const service = new GameService(app, createMetadataService(app));
        const games: GameItem[] = [
            {
                type: 'game',
                filePath: 'a.md',
                displayName: 'Tagged',
                nameLower: 'tagged',
                year: 2020,
                description: '',
                userRating: null,
                favorite: false,
                poster: '',
                imageUrl: '',
                horizontalImageUrl: null,
                hasCustomPoster: false,
                isAdult: false,
                status: 'not_started',
                gameSeries: '',
                dateCompleted: null,
                tags: ['next in queue'],
                genres: [],
            },
            {
                type: 'game',
                filePath: 'b.md',
                displayName: 'Plain',
                nameLower: 'plain',
                year: 2021,
                description: '',
                userRating: null,
                favorite: false,
                poster: '',
                imageUrl: '',
                horizontalImageUrl: null,
                hasCustomPoster: false,
                isAdult: false,
                status: 'not_started',
                gameSeries: '',
                dateCompleted: null,
                tags: [],
                genres: [],
            },
        ];
        const filter = createBaseFilter();
        filter.tags = ['next in queue'];

        const result = service.filterAndSort(games, filter, 'name', 'asc', true);

        expect(result.map((item) => item.displayName)).toEqual(['Tagged']);
    });

    it('does not treat string false flags as true', () => {
        const file = createMockFile('Games/Test.md', 'Test');
        const app = createMockApp({
            [file.path]: {
                frontmatter: {
                    played: 'false',
                    favorite: 'false',
                },
            },
        });

        const service = new GameService(app, createMetadataService(app));
        const parsed = service.parseGameFromCache(file);

        expect(parsed).not.toBeNull();
        expect(parsed?.status).toBe('not_started');
        expect(parsed?.favorite).toBe(false);
    });

    it('reads release and studio fields from alias frontmatter keys', () => {
        const file = createMockFile('Games/AC2.md', 'AC2');
        const app = createMockApp({
            [file.path]: {
                frontmatter: {
                    type: 'game',
                    released: '2009-11-17',
                    developers: ['Ubisoft Montreal'],
                    publishers: ['Ubisoft Entertainment'],
                },
            },
        });

        const service = new GameService(app, createMetadataService(app));
        const parsed = service.parseGameFromCache(file);

        expect(parsed).not.toBeNull();
        expect(parsed?.releaseDate).toBe('2009-11-17');
        expect(parsed?.developer).toBe('Ubisoft Montreal');
        expect(parsed?.publisher).toBe('Ubisoft Entertainment');
    });
});
