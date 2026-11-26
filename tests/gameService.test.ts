import { describe, expect, it } from 'vitest';
import { TFolder } from 'obsidian';
import { extractMarkdownSection, GameService, upsertMarkdownSection } from '../src/services/GameService';
import type { GameItem } from '../src/types';
import { DEFAULT_SETTINGS } from '../src/constants';
import { createMockApp, createBaseFilter, createMetadataService, createMockFile } from './helpers/testHelpers';
import { getSortOptionsForMediaType, getStatusOptionsForMediaType } from '../src/views/library/viewOptions';
import { groupMediaItems } from '../src/services/media/libraryViewState';

describe('GameService', () => {
    it('parses frontmatter from cache into game model', () => {
        const file = createMockFile('Games/Mass Effect.md', 'Mass Effect');
        const app = createMockApp({
            [file.path]: {
                frontmatter: {
                    type: 'game',
                    poster: 'https://cdn.example/me.jpg',
                    status: 'played',
                    userRating: '7.3',
                    detailed_ratings: [{ name: 'Story', value: 8.4 }],
                    year: '2007',
                    plot: 'Sci-fi RPG',
                    favorite: true,
                    Sex18: 'true',
                    gameSeries: 'Mass Effect',
                    dateCompleted: '2024-05-10',
                    started: '2024-04-01',
                    finished: '2024-05-10',
                    dlc: [
                        {
                            id: '123',
                            provider: 'steam',
                            title: 'Citadel',
                            image: 'https://cdn.example/dlc.jpg',
                            url: 'https://store.steampowered.com/app/123/',
                            userRating: 4,
                        },
                    ],
                    related_media: [
                        {
                            type: 'manga',
                            path: 'Manga/Mass Effect - Redemption.md',
                            title: 'Mass Effect: Redemption',
                        },
                    ],
                    genres: ['RPG'],
                    platforms: ['Windows PC', 'PlayStation 5'],
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
        expect(parsed?.userRating).toBe(7.3);
        expect(parsed?.detailedRatings).toEqual([{ name: 'Story', value: 8.4 }]);
        expect(parsed?.year).toBe(2007);
        expect(parsed?.isAdult).toBe(true);
        expect(parsed?.tags).toContain('sci-fi');
        expect(parsed?.tags).toContain('space');
        expect(parsed?.genres).toContain('rpg');
        expect(parsed?.platforms).toEqual(['Windows PC', 'PlayStation 5']);
        expect(parsed?.dateCompleted).toBeTypeOf('number');
        expect(parsed?.started).toBe('2024-04-01');
        expect(parsed?.finished).toBe('2024-05-10');
        expect(parsed?.dlc).toEqual([
            {
                id: '123',
                provider: 'steam',
                title: 'Citadel',
                imageUrl: 'https://cdn.example/dlc.jpg',
                url: 'https://store.steampowered.com/app/123/',
                userRating: 4,
                owned: undefined,
            },
        ]);
        expect(parsed?.relatedMedia).toEqual([
            {
                type: 'manga',
                path: 'Manga/Mass Effect - Redemption.md',
                title: 'Mass Effect: Redemption',
            },
        ]);
    });


    it('loads only games and untyped notes from a shared media folder', async () => {
        const entries = [
            { title: 'Typed game', type: 'game' },
            { title: 'Game with padded type', type: ' GAME ' },
            { title: 'Legacy game' },
            { title: 'Blank type', type: '  ' },
            { title: 'Series', type: 'series' },
            { title: 'Movie', type: 'movie' },
            { title: 'Anime', type: 'anime' },
            { title: 'Book', type: 'book' },
            { title: 'Manga', type: 'manga' },
            { title: 'Music', type: 'music' },
        ];
        const files = entries.map(({ title }) => createMockFile(`Shared/${title}.md`, title));
        const app = createMockApp(Object.fromEntries(files.map((file, index) => [
            file.path, { frontmatter: entries[index] },
        ])));
        const folder = Object.assign(new TFolder('Shared'), { children: files });
        app.vault.getAbstractFileByPath = path => path === folder.path ? folder : null;
        const service = new GameService(app, createMetadataService(app));
        service.setFolderPath(folder.path);

        const games = await service.loadGames();
        expect(games.map(game => game.displayName)).toEqual(['Typed game', 'Game with padded type', 'Legacy game', 'Blank type']);
    });

    it('serializes related media when a game is edited', async () => {
        const file = createMockFile('Games/Mass Effect.md', 'Mass Effect');
        const frontmatter: Record<string, unknown> = { type: 'game', name: 'Mass Effect' };
        const app = createMockApp({
            [file.path]: { frontmatter },
        });
        app.vault.getAbstractFileByPath = () => file;
        app.fileManager.processFrontMatter = async (_file, handler) => {
            handler(frontmatter);
        };

        const service = new GameService(app, createMetadataService(app));
        const game = service.parseGameFromCache(file);
        expect(game).not.toBeNull();

        await service.updateGame(game!, {
            relatedMedia: [
                {
                    type: 'book',
                    path: 'Books/Mass Effect - Revelation.md',
                    title: 'Mass Effect: Revelation',
                },
            ],
        });

        expect(frontmatter.related_media).toEqual([
            {
                type: 'book',
                path: 'Books/Mass Effect - Revelation.md',
                title: 'Mass Effect: Revelation',
            },
        ]);
    });

    it('extracts and updates the My Notes markdown section', () => {
        const content = [
            '---',
            'name: "Game"',
            '---',
            '',
            '# Game',
            '',
            '## My Notes',
            '',
            'Line one.',
            'Line two.',
            '',
            '## Other',
            '',
            'Keep me.',
        ].join('\n');

        expect(extractMarkdownSection(content)).toBe('Line one.\nLine two.');

        const updated = upsertMarkdownSection(content, 'My Notes', 'New note');
        expect(updated).toContain('## My Notes\n\nNew note');
        expect(updated).toContain('## Other\n\nKeep me.');
    });

    it('keeps local poster paths available when direct resource resolution is not ready', () => {
        const file = createMockFile('Games/Cyberpunk 2077.md', 'Cyberpunk 2077');
        const posterPath = 'files/lorebase/images/games/Cyberpunk 2077 - Poster.jpg';
        const app = createMockApp({
            [file.path]: {
                frontmatter: {
                    type: 'game',
                    name: 'Cyberpunk 2077',
                    poster: posterPath,
                },
            },
        });

        const service = new GameService(app, createMetadataService(app));
        const parsed = service.parseGameFromCache(file);

        expect(parsed?.imageUrl).toBe(posterPath);
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
        expect(base.map((item) => item.displayName)).toEqual(['Alpha', 'Bravo']);

        const showEverything = service.filterAndSort(games, createBaseFilter(), 'name', 'asc', true);
        expect(showEverything.map((item) => item.displayName)).toEqual(['Alpha', 'Bravo', 'Charlie']);

        const defaultViewFilter = createBaseFilter();
        defaultViewFilter.rules = DEFAULT_SETTINGS.games.viewState.rules;
        const defaultView = service.filterAndSort(games, defaultViewFilter, 'name', 'asc', true);
        expect(defaultView.map((item) => item.displayName)).toEqual(['Bravo']);

        const searchFilter = createBaseFilter();
        searchFilter.searchTerm = 'alpha';
        const withSearch = service.filterAndSort(games, searchFilter, 'name', 'asc', false);
        expect(withSearch.map((item) => item.displayName)).toEqual(['Alpha']);
    });

    it('shows series as the primary game sort option', () => {
        expect(getSortOptionsForMediaType('game')[0]).toMatchObject({ field: 'series' });
    });

    it('keeps the selected game sort inside library series groups', () => {
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

        const items = [
            createGame('Alpha', 2024),
            createGame('Bravo', 1999),
            createGame('Charlie', 2010),
        ];

        const sortedByYear = service.filterAndSort(items, createBaseFilter(), 'year', 'asc', true);
        const grouped = groupMediaItems(sortedByYear, 'series', 'asc', 'en-US');
        expect(grouped[0].label).toBe('Same series');
        expect(grouped[0].items.map(item => item.displayName)).toEqual(['Bravo', 'Charlie', 'Alpha']);
        const sortedByName = service.filterAndSort(items, createBaseFilter(), 'name', 'desc', true);
        expect(groupMediaItems(sortedByName, 'series', 'asc', 'en-US')[0].items.map(item => item.displayName))
            .toEqual(['Charlie', 'Bravo', 'Alpha']);
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
                tags: ['next-in-queue'],
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
        filter.tags = ['next-in-queue'];

        const result = service.filterAndSort(games, filter, 'name', 'asc', true);

        expect(result.map((item) => item.displayName)).toEqual(['Tagged']);
    });

    it('normalizes legacy plan tags with spaces from frontmatter', () => {
        const file = createMockFile('Games/Plans.md', 'Plans');
        const app = createMockApp({
            [file.path]: {
                frontmatter: {
                    name: 'Plans',
                    tags: ['play soon', 'wait early access'],
                },
            },
        });
        const service = new GameService(app, createMetadataService(app));

        const parsed = service.parseGameFromCache(file);

        expect(parsed?.tags).toContain('play-soon');
        expect(parsed?.tags).toContain('wait-early-access');
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

    it('stores comma-separated developers and publishers as YAML lists', async () => {
        const file = createMockFile('Games/Black Flag.md', 'Black Flag');
        const frontmatter: Record<string, unknown> = {
            type: 'game',
            name: 'Black Flag',
            developer: 'Ubisoft Montreal',
            publisher: 'Ubisoft',
        };
        const app = createMockApp({ [file.path]: { frontmatter } });
        app.vault.getAbstractFileByPath = () => file;
        app.fileManager.processFrontMatter = async (_file, handler) => handler(frontmatter);

        const service = new GameService(app, createMetadataService(app));
        const game = service.parseGameFromCache(file);
        expect(game).not.toBeNull();

        await service.updateGame(game!, {
            developer: 'Ubisoft Montreal, Ubisoft',
            publisher: 'Ubisoft, Ubisoft Entertainment',
        });

        expect(frontmatter.developers).toEqual(['Ubisoft Montreal', 'Ubisoft']);
        expect(frontmatter.publishers).toEqual(['Ubisoft', 'Ubisoft Entertainment']);
        expect(frontmatter.developer).toBeUndefined();
        expect(frontmatter.publisher).toBeUndefined();
    });

    it('stores edited platforms as a YAML list', async () => {
        const file = createMockFile('Games/Platforms.md', 'Platforms');
        const frontmatter: Record<string, unknown> = {
            type: 'game',
            name: 'Platforms',
            platform: 'Windows PC',
        };
        const app = createMockApp({ [file.path]: { frontmatter } });
        app.vault.getAbstractFileByPath = () => file;
        app.fileManager.processFrontMatter = async (_file, handler) => handler(frontmatter);

        const service = new GameService(app, createMetadataService(app));
        const game = service.parseGameFromCache(file);
        expect(game?.platforms).toEqual(['Windows PC']);

        await service.updateGame(game!, {
            platforms: ['Windows PC', 'Xbox Series X|S'],
        });

        expect(frontmatter.platform).toEqual(['Windows PC', 'Xbox Series X|S']);
    });
});
