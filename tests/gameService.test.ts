import { describe, expect, it } from 'vitest';
import { GameService } from '../src/services/GameService';
import type { GameItem } from '../src/types';
import { createMockApp, createBaseFilter, createMockFile } from './helpers/testHelpers';
import { getStatusOptionsForMediaType } from '../src/views/library/viewOptions';

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

        const service = new GameService(app);
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
        const service = new GameService(createMockApp({}));
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

    it('filters plan presets as regular tags', () => {
        const service = new GameService(createMockApp({}));
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

        const service = new GameService(app);
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

        const service = new GameService(app);
        const parsed = service.parseGameFromCache(file);

        expect(parsed).not.toBeNull();
        expect(parsed?.releaseDate).toBe('2009-11-17');
        expect(parsed?.developer).toBe('Ubisoft Montreal');
        expect(parsed?.publisher).toBe('Ubisoft Entertainment');
    });
});
