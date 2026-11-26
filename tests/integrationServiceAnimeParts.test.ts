import { beforeEach as beforeCoverTest, afterEach as afterCoverTest, vi as coverVi } from 'vitest';
import { onePixelPng } from './helpers/coverImages';
beforeCoverTest(() => coverVi.stubGlobal('createImageBitmap', coverVi.fn(async () => ({ width: 1, height: 1, close() {} }))));
afterCoverTest(() => coverVi.unstubAllGlobals());
import { describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { IntegrationService } from '../src/services/IntegrationService';
import type { AnimeDetails, GameDetails, MangaDetails, VideoDetails } from '../src/services/integrations/types';
import { createMetadataService, createMockApp, createMockFile } from './helpers/testHelpers';
import { AnimeService } from '../src/services/AnimeService';
import type { ManualCreateDraft } from '../src/modals/ManualCreateModal';
import { saveManualImageFileToVault } from '../src/services/integrations/imageStorage';
import { DEFAULT_SETTINGS } from '../src/constants';
import { completeManualContent } from '../src/services/integrations/manualCreatePersistence';
import { buildSimpleTemplate, getDefaultTemplateFields, renderTemplate } from '../src/services/integrations/templateUtils';

describe('IntegrationService anime parts values', () => {
    it('searches TMDB movies and TV in anime, keeps the catalog type and imports a TV result into Anime', async () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.integrations!.enabled = true;
        settings.integrations!.providers.tmdb = { enabled: true, apiKey: 'key' };
        settings.integrations!.providers.omdb = { enabled: true, apiKey: 'key' };
        settings.integrations!.providers.tvmaze.enabled = true;
        settings.integrations!.media.anime.templateEnabled = true;
        settings.integrations!.media.anime.templateMode = 'advanced';
        settings.integrations!.media.anime.template = '---\ncustom_title: "{{VALUE:name}}"\n---';
        settings.integrations!.media.series.tmdbLanguage = 'ru-RU';
        const app = createMockApp({});
        app.vault.createFolder = vi.fn().mockResolvedValue(undefined);
        app.vault.create = vi.fn(async (path: string) => createMockFile(path, 'Avatar'));
        const service = new IntegrationService(app, () => settings);
        const fetch = vi.fn(async (url: string) => {
            if (url.includes('/search/multi')) return { total_pages: 2, results: [
                { id: 17, media_type: 'movie', title: 'Avatar film', genre_ids: [16] },
                { id: 17, media_type: 'tv', name: 'Avatar: The Last Airbender', first_air_date: '2005-02-21', genre_ids: [16] },
                { id: 18, media_type: 'person', name: 'Person' },
            ] };
            expect(url).toContain('/tv/17?');
            expect(new URL(url).searchParams.get('language')).toBe('ru-RU');
            return { name: 'Avatar: The Last Airbender', overview: 'Description', origin_country: ['US'], first_air_date: '2005-02-21',
                episode_run_time: [24], genres: [{ name: 'Animation' }], seasons: [
                    { id: 700, season_number: 1, name: 'Water', episode_count: 20, poster_path: '/water.jpg' },
                    { id: 701, season_number: 2, name: 'Earth', episode_count: 20 },
                ] };
        });
        const integration = service as any;
        integration.jsonFetcher = fetch;
        expect(integration.getProviderOptions('anime').map(option => option.id)).toEqual(expect.arrayContaining(['anilist', 'tmdb', 'tvmaze', 'omdb']));
        const results = await integration.search('tmdb', 'Avatar', 'key', '', { page: 1 }, 'anime');
        expect(results.hasNext).toBe(true);
        expect(results.map(result => [result.id, result.workTypeMedia])).toEqual([['17', 'movie'], ['17', 'series']]);
        const file = await service.addAnimeSelection(results[1]);
        expect(file?.path).toMatch(/^LOREBASE\/Anime\//);
        const content = vi.mocked(app.vault.create).mock.calls[0][1];
        expect(content).toContain('type: "anime"');
        expect(content).toContain('format: "tv"');
        expect(content).toContain('integration_source_kind: "series"');
        const parts = JSON.parse(content.split('\n').find(line => line.startsWith('anime_parts: '))!.slice('anime_parts: '.length));
        expect(parts).toMatchObject([
            { id: 'tmdb-series-17-1', kind: 'tv', title: 'Water', episode_total: 20, episode_duration: 24, poster: 'https://image.tmdb.org/t/p/w500/water.jpg' },
            { id: 'tmdb-series-17-2', kind: 'tv', title: 'Earth', episode_total: 20 },
        ]);
        const reopenedApp = createMockApp({ [file!.path]: { frontmatter: {
            type: 'anime', title: 'Avatar: The Last Airbender', format: 'movie', integration_provider: 'tmdb',
            integration_id: '17', integration_source_kind: 'series', anime_parts: parts,
        } } });
        const reopened = new AnimeService(reopenedApp, createMetadataService(reopenedApp)).parseAnimeFromCache(file!)!;
        expect(reopened).toMatchObject({ type: 'anime', integrationProvider: 'tmdb', integrationSourceKind: 'series' });
        await expect(service.fetchAnimePartsForItem(reopened)).resolves.toMatchObject([{ episodeTotal: 20 }, { episodeTotal: 20 }]);
    });

    it('adapts an OMDb film to one anime part and TVmaze results to TV seasons', async () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.integrations!.enabled = true;
        settings.integrations!.providers.omdb = { enabled: true, apiKey: 'key' };
        settings.integrations!.providers.tvmaze.enabled = true;
        const service = new IntegrationService(createMockApp({}), () => settings);
        const integration = service as any;
        integration.jsonFetcher = vi.fn(async (url: string) => {
            if (url.includes('omdbapi') && url.includes('&s=')) {
                expect(new URL(url).searchParams.has('type')).toBe(false);
                return { totalResults: '3', Search: [
                    { imdbID: 'tt101', Title: 'Nightmare of the Wolf', Type: 'movie' },
                    { imdbID: 'tt102', Title: 'Series', Type: 'series' },
                    { imdbID: 'tt103', Title: 'Episode', Type: 'episode' },
                ] };
            }
            if (url.includes('omdbapi')) return { Title: 'Nightmare of the Wolf', Type: 'movie', Runtime: '83 min', Country: 'United States' };
            if (url.includes('/search/shows')) return [{ show: { id: 89, name: 'Arcane', type: 'Animation' } }];
            if (url.endsWith('/episodes')) return [{ season: 1, number: 1 }, { season: 1, number: 2 }];
            return { name: 'Arcane', rating: { average: 8.9 }, averageRuntime: 40,
                _embedded: { seasons: [{ id: 10, number: 1, episodeOrder: null, image: { original: 'https://example.com/arcane.jpg' } }] } };
        });
        const films = await integration.search('omdb', 'Wolf', 'key', '', {}, 'anime');
        expect(films.map(result => result.workTypeMedia)).toEqual(['movie', 'series']);
        const film = await service.getMediaEnrichment('anime', films[0]);
        expect(film?.values).toMatchObject({ format: 'movie', integration_source_kind: 'movie', countries: ['US'],
            anime_parts: [{ kind: 'movie', episode_total: 1, episode_duration: 83 }],
        });
        const [series] = await integration.search('tvmaze', 'Arcane', '', '', {}, 'anime');
        const patch = await service.getMediaEnrichment('anime', series);
        expect(patch?.values).toMatchObject({ format: 'tv', integration_source_kind: 'series', communityRating: 89,
            anime_parts: [{ id: 'tvmaze-series-89-1', kind: 'tv', episode_total: 2, episode_duration: 40, poster: 'https://example.com/arcane.jpg' }],
        });
    });
    it.each(['games', 'anime', 'movies', 'series', 'books', 'manga'] as const)('retains all manual %s metadata with reduced and custom templates', kind => {
        const draft: ManualCreateDraft = { ...createManualDraft(kind), workType: kind === 'games' ? 'Game' : kind === 'manga' ? 'Manga' : 'Movie',
            description: 'A description\nwith "quotes": yes', myNotes: 'Personal **notes**', favorite: true, isAdult: true,
            started: '2026-01-02', finished: '2026-02-03', released: '2025-12-10', repeatCount: 2,
            genres: ['Fantasy'], tags: ['personal'], studios: ['Studio'], directors: ['Director'], actors: ['Actor'], networks: ['Network'], runtime: '24 min',
            authors: ['Author'], publisher: 'Publisher', artists: ['Artist'], developers: ['Developer'], publishers: ['Publisher'], platforms: ['PC'],
            pageCurrent: 12, pageTotal: 100, chapterCurrent: 3, chapterTotal: 20, volumeCurrent: 1, volumeTotal: 4,
            platformPlaythroughs: [{ platform: 'PC', selected: true, repeatCount: 3 }],
            detailedRatings: [{ name: 'Story', value: 4.5 }], relatedMedia: [{ type: 'anime', path: 'Anime/Other.md', title: 'Other' }],
        };
        const service = new IntegrationService(createMockApp({}), () => structuredClone(DEFAULT_SETTINGS)) as any;
        for (const template of [buildSimpleTemplate(kind, getDefaultTemplateFields(kind), {}, []), '---\ncustom_title: "{{VALUE:name}}"\ncustom_plot: "{{VALUE:Plot}}"\ncustom_studios: {{VALUE:studios}}\ncustom_value: keep\n---\n\n# Template body']) {
            const content = completeManualContent(renderTemplate(template, service.buildManualValues(draft)), draft, template);
            const read = (key: string) => { const line = content.split('\n').find(line => line.startsWith(key + ': ') || line.startsWith(JSON.stringify(key) + ': ')); return line ? JSON.parse(line.slice(line.indexOf(': ') + 2)) : undefined; };
            expect(read('favorite')).toBe(true);
            expect(read('started')).toBe('2026-01-02'); expect(read('finished')).toBe('2026-02-03');
            expect(read('genres')).toEqual(['Fantasy']); expect(read('tags')).toEqual(['personal']);
            expect(read('detailed_ratings')).toEqual(draft.detailedRatings);
            expect(read('related_media')).toEqual(draft.relatedMedia);
            expect(read(template.includes('custom_plot') ? 'custom_plot' : 'plot')).toBe(draft.description);
            expect(content).toContain('## My Notes\n\nPersonal **notes**');
            if (template.includes('custom_value')) { expect(content).toContain('custom_value: keep'); expect(content).toContain('# Template body'); expect(content).not.toContain('"plot":'); }
            if (kind === 'games') { expect(read('platform_playthroughs')).toEqual([{ platform: 'PC', selected: true, repeat_count: 3 }]); expect(read('repeat_count')).toBe(5); expect(read('developers')).toEqual(['Developer']); }
            if (kind === 'anime' || kind === 'series') expect(read(template.includes('custom_studios') ? 'custom_studios' : 'studios')).toEqual(['Studio']);
            if (kind === 'series') { expect(read('networks')).toEqual(['Network']); expect(read('series_parts')).toHaveLength(1); }
            if (kind === 'movies' || kind === 'series') { expect(read(template.includes('directors:') ? 'directors' : 'director')).toEqual(['Director']); expect(read('actors')).toEqual(['Actor']); expect(read('runtime')).toBe('24 min'); }
            if (kind === 'books' || kind === 'manga') expect(read('authors')).toEqual(['Author']);
            if (kind === 'books') { expect(read('publisher')).toBe('Publisher'); expect(read('page_current')).toBe(12); }
            if (kind === 'manga') { expect(read('artists')).toEqual(['Artist']); expect(read('manga_parts')[0]).toMatchObject({ volume: 1, chapter_current: 3, chapter_total: 20 }); }
        }
    });

    it('keeps links in manual book properties, including renamed fields', () => {
        const template = '---\ntitle: "{{VALUE:name}}"\n"Book authors": {{VALUE:authors|wikilink}}\ngenres: "{{VALUE:genres|wikilink}}"\n---';
        const draft = { ...createManualDraft('books'), authors: ['Frank Herbert'], genres: ['Science Fiction'] };
        const service = new IntegrationService(createMockApp({}), () => structuredClone(DEFAULT_SETTINGS)) as any;
        const content = completeManualContent(renderTemplate(template, service.buildManualValues(draft)), draft, template);
        expect(content).toContain('"Book authors": ["[[Frank Herbert]]"]');
        expect(content).toContain('genres: ["[[Science Fiction]]"]');
        expect(content).not.toMatch(/^authors:/m);
    });

    it('replaces multiline metadata without consuming neighbouring fields, comments or note sections', () => {
        const content = '---\nplot: |\n  Old description\n  More text\n# Preserve this comment\ngenres:\n- Old\ntags: []\ncustom: |\n  Keep me\n---\n\n## My Notes\n\nOld notes\n\n## Other\n\nKeep this too\n';
        const draft = { ...createManualDraft('books'), description: 'New\ntext', myNotes: 'New notes' };
        const updated = completeManualContent(content, draft, '');
        expect(updated).toContain('plot: "New\\ntext"\n# Preserve this comment\ngenres: []\ntags: []\ncustom: |\n  Keep me');
        expect(updated).not.toContain('Old description'); expect(updated).not.toContain('- Old');
        expect(updated).toContain('## My Notes\n\nNew notes'); expect(updated).toContain('## Other\n\nKeep this too');
    });
    it('serializes every manual series season and preserves the active season progress', () => {
        const service = new IntegrationService(createMockApp({}), () => structuredClone(DEFAULT_SETTINGS)) as any;
        const draft: ManualCreateDraft = { ...createManualDraft('series'), activeVideoPartId: 'season-2', videoParts: [
            { id: 'season-1', kind: 'season', title: 'First season', seasonNumber: 1, episodeCurrent: 10, episodeTotal: 10, status: 'completed' },
            { id: 'season-2', kind: 'season', title: 'Second season', seasonNumber: 2, episodeCurrent: 4, episodeTotal: 12, status: 'watching' },
        ] };
        const values = service.buildManualValues(draft);
        expect(values).toMatchObject({ seasons: 2, activePartId: 'season-2', episodeCurrent: 4, episodeTotal: 12 });
        expect(values.videoPartsYaml).toContain('First season');
        expect(values.videoPartsYaml).toContain('Second season');
    });
    it('does not let an unverified Steam search image override resolved SteamGridDB artwork', async () => {
        const service = new IntegrationService(createMockApp({}), () => structuredClone(DEFAULT_SETTINGS));
        const details: GameDetails = {
            kind: 'game',
            name: 'Watch Dogs',
            description: 'Description',
            poster: 'https://cdn2.steamgriddb.com/grid/watch-dogs.png',
            posterHorizontal: 'https://steamstatic.com/header.jpg',
            genres: ['Action'],
            platforms: ['windows'],
            developers: ['Ubisoft'],
            publishers: ['Ubisoft'],
            rating: '',
            metacritic: '77',
            released: 'May 27, 2014',
            year: '2014',
            url: 'https://store.steampowered.com/app/243470/',
        };

        const values = await (service as unknown as {
            buildGameValues(
                details: GameDetails,
                includeHowLongToBeat: boolean,
                fallbackImage: string,
                source: { provider: 'steam'; id: string }
            ): Promise<Record<string, unknown>>;
        }).buildGameValues(
            details,
            false,
            'https://steamstatic.com/steam/apps/243470/library_600x900.jpg',
            { provider: 'steam', id: '243470' }
        );

        expect(values.Poster).toBe('https://cdn2.steamgriddb.com/grid/watch-dogs.png');
    });

    it('fetches anime parts and provider community rating during source synchronization', async () => {
        const service = new IntegrationService(createMockApp({}), () => structuredClone(DEFAULT_SETTINGS));
        let fetchOptions: { includeParts?: boolean } | undefined;
        const details: AnimeDetails = {
            kind: 'anime',
            name: 'Another',
            description: 'Description',
            image: 'poster.jpg',
            imageHorizontal: 'wide.jpg',
            tags: ['Horror'],
            studios: ['P.A. Works'],
            year: '2012',
            imdbRating: '7.1',
            communityRating: '7.1',
            communityVotes: '175583',
            url: 'https://anilist.co/anime/11111',
            format: 'tv',
            parts: [
                { id: 'anilist-11111', kind: 'tv', title: 'Another', seasonNumber: 1, episodeCurrent: 0, episodeTotal: 12, status: 'planned' },
                { id: 'anilist-11701', kind: 'ova', title: 'Another: The Other', seasonNumber: null, episodeCurrent: 0, episodeTotal: 1, status: 'planned' },
            ],
        };
        (service as unknown as {
            fetchDetails(
                provider: string,
                id: string,
                apiKey: string,
                clientSecret: string,
                kind: string | undefined,
                options: { includeParts?: boolean }
            ): Promise<AnimeDetails | null>;
        }).fetchDetails = async (_provider, _id, _apiKey, _clientSecret, _kind, options) => {
            fetchOptions = options;
            return details;
        };

        const patch = await service.getMediaEnrichment('anime', {
            provider: 'anilist',
            id: '11111',
            title: 'Another',
        });

        expect(fetchOptions).toEqual({ includeParts: true });
        expect(patch?.values.integration_provider).toBe('anilist');
        expect(patch?.values.integration_id).toBe('11111');
        expect(patch?.values.anime_parts).toHaveLength(2);
        expect(patch?.values.communityRating).toBe(71);
        expect(patch?.values.communityVotes).toBe(175583);
        expect(patch?.values.communityRatingProvider).toBe('AniList');
    });

    it('keeps initial anime import free of provider parts while saving source identity', () => {
        const service = new IntegrationService(createMockApp({}), () => ({
            integrations: undefined,
        } as never));

        const details: AnimeDetails = {
            name: 'Series',
            description: 'Description',
            image: 'poster.jpg',
            imageHorizontal: 'wide.jpg',
            genres: ['fantasy'],
            tags: [],
            studios: ['Studio'],
            year: '2024',
            released: '2024-04-12',
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
        expect(values.released).toBe('2024-04-12');
        expect(values.genres).toEqual(['fantasy']);
        expect(values.tags).toEqual([]);
        expect(values.activePartId).toBe('');
        expect(values.episodeCurrent).toBe(0);
        expect(values.animePartsYaml).toBe('  []');
    });

    it('keeps manga release dates and contributor lists in template values', () => {
        const service = new IntegrationService(createMockApp({}), () => structuredClone(DEFAULT_SETTINGS));
        const details: MangaDetails = {
            kind: 'manga',
            name: 'Berserk',
            description: '',
            poster: 'poster.jpg',
            authors: ['Kentaro Miura'],
            artists: ['Kentaro Miura'],
            genres: ['Fantasy'],
            year: '1989',
            released: '1989-08-25',
            url: 'https://anilist.co/manga/30013',
        };

        const values = (service as unknown as {
            buildMangaValues(details: MangaDetails, source?: unknown): Record<string, unknown>;
        }).buildMangaValues(details);

        expect(values.released).toBe('1989-08-25');
        expect(values.authors).toEqual(['Kentaro Miura']);
        expect(values.artists).toEqual(['Kentaro Miura']);
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

    it('leaves community values empty until a manual refresh in the editor', () => {
        const service = new IntegrationService(createMockApp({}), () => ({
            integrations: undefined,
        } as never));
        const details: AnimeDetails = {
            name: 'Series',
            description: '',
            image: '',
            tags: [],
            studios: [],
            year: '2024',
            imdbRating: '7.3',
            communityRating: '7.3',
            communityVotes: '262490',
            url: 'https://anilist.co/anime/42',
            format: 'tv',
        };

        const values = (service as unknown as {
            buildAnimeValues(details: AnimeDetails, source: unknown): Record<string, unknown>;
        }).buildAnimeValues(details, {
            provider: 'anilist',
            id: '42',
            parts: [],
        });

        expect(values.communityRating).toBe('');
        expect(values.communityVotes).toBe('');
        expect(values.communityRatingProvider).toBe('');
    });

    it('normalizes imported movie dates and splits comma-separated credits', () => {
        const service = new IntegrationService(createMockApp({}), () => ({
            integrations: undefined,
        } as never));
        const details: VideoDetails = {
            kind: 'video',
            name: 'The Wolf of Wall Street',
            description: '',
            poster: '',
            genres: ['Biography'],
            year: '2013',
            released: '25 Dec 2013',
            director: 'Martin Scorsese, martin scorsese',
            actors: 'Leonardo DiCaprio, Jonah Hill, Margot Robbie, leonardo dicaprio',
            url: 'https://www.imdb.com/title/tt0993846/',
        };

        const values = (service as unknown as {
            buildVideoValues(details: VideoDetails, kind: 'movies'): Record<string, unknown>;
        }).buildVideoValues(details, 'movies');

        expect(values.released).toBe('2013-12-25');
        expect(values.directors).toEqual(['Martin Scorsese']);
        expect(values.director).toEqual(['Martin Scorsese']);
        expect(values.actors).toEqual(['Leonardo DiCaprio', 'Jonah Hill', 'Margot Robbie']);
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

    it('respects an empty simple template field selection', () => {
        const service = new IntegrationService(createMockApp({}), () => ({
            integrations: undefined,
        } as never));
        const getTemplate = (service as unknown as {
            getTemplate(
                kind: 'anime',
                enabled: boolean,
                mode: string | undefined,
                fields: string[] | undefined,
                advancedTemplate: string,
                howLongToBeatEnabled: boolean
            ): string | null;
        }).getTemplate.bind(service);

        const template = getTemplate('anime', true, 'simple', [], '', false);

        expect(template).toBe('---\n---');
    });

    it('builds the effective anime template only from selected simple fields', () => {
        const service = new IntegrationService(createMockApp({}), () => ({
            integrations: undefined,
        } as never));
        const getTemplate = (service as unknown as {
            getTemplate(
                kind: 'anime',
                enabled: boolean,
                mode: string | undefined,
                fields: string[] | undefined,
                advancedTemplate: string,
                howLongToBeatEnabled: boolean
            ): string | null;
        }).getTemplate.bind(service);

        const template = getTemplate('anime', true, 'simple', ['name', 'image'], '', false) ?? '';

        expect(template).toContain('title: "{{VALUE:name}}"');
        expect(template).toContain('image: "{{VALUE:image}}"');
        expect(template).not.toContain('tags:');
        expect(template).not.toContain('year:');
        expect(template).not.toContain('studios:');
        expect(template).not.toContain('format:');
        expect(template).not.toContain('anime_parts:');
        expect(template).not.toContain('rating:');
        expect(template).not.toContain('status:');
        expect(template).not.toContain('integration_provider:');
        expect(template).not.toContain('url:');
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
                async createBinary(path: string, data: ArrayBuffer) { writes.push({ path, data }); },
            },
        } as unknown as App;
        const file = {
            name: 'cover.png',
            type: 'image/png',
            async arrayBuffer() {
                return onePixelPng();
            },
        } as File;

        const path = await saveManualImageFileToVault(app, file, {
            baseFolder: 'files/lorebase/images',
            kind: 'books',
            title: 'Dune',
            label: 'Poster',
        });

        expect(path).toMatch(/^files\/lorebase\/images\/books\/Dune - Poster - [a-f0-9]{64}\.png$/);
        expect(folders).toEqual(['files', 'files/lorebase', 'files/lorebase/images', 'files/lorebase/images/books']);
        expect(writes).toHaveLength(1);
        expect(writes[0].path).toBe(path);
    });

    it('uses the year to disambiguate same-title provider imports', () => {
        const app = createMockApp({});
        const service = new IntegrationService(app, () => ({
            integrations: undefined,
        } as never));
        const reservedPaths = new Set<string>();

        const first = (service as unknown as {
            resolveCreatePath(folderPath: string, title: string, options: unknown): { fullPath: string };
        }).resolveCreatePath('Movies', 'The Running Man', {
            preferYear: true,
            year: '2025',
            provider: 'tmdb',
            id: '123',
            reservedPaths,
        });
        reservedPaths.add(first.fullPath);
        const second = (service as unknown as {
            resolveCreatePath(folderPath: string, title: string, options: unknown): { fullPath: string };
        }).resolveCreatePath('Movies', 'The Running Man', {
            preferYear: true,
            year: '1987',
            provider: 'tmdb',
            id: '456',
            reservedPaths,
        });

        expect(first.fullPath).toBe('Movies/The Running Man 2025.md');
        expect(second.fullPath).toBe('Movies/The Running Man 1987.md');
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
