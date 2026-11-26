import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/constants';
import { IntegrationService } from '../src/services/IntegrationService';
import { MusicCatalog } from '../src/services/MusicCatalog';
import { MultiSelectSearchModal } from '../src/modals/IntegrationModals';
import { CatalogReferenceError, referenceText } from '../src/localization/catalogReference';
import { createMetadataService, createMockApp, createMockFile } from './helpers/testHelpers';
import { ReadingService } from '../src/services/ReadingService';
import { __setRequestUrlMock } from './mocks/obsidian';

function fixture() {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.integrations!.enabled = true;
    for (const entry of Object.values(settings.integrations!.providers)) { entry.enabled = true; entry.apiKey = 'key'; entry.clientSecret = 'secret'; }
    settings.games.folderPath = 'Games';
    const app = createMockApp({}); app.vault.create = vi.fn(); app.vault.modify = vi.fn(); app.vault.getMarkdownFiles = () => [];
    app.workspace = { openLinkText: vi.fn() } as any;
    const service = new IntegrationService(app, () => settings);
    const internal = service as any;
    const details = vi.fn(async () => ({ kind: 'game', name: 'Exact record', poster: '', description: '', genres: [], platforms: [], developers: [], publishers: [], year: '2024', released: '2024-01-02', url: '', rating: '', metacritic: '' }));
    internal.fetchDetails = details;
    const search = vi.fn(async () => []); internal.search = search;
    const fetch = vi.fn(async (): Promise<any> => null); internal.jsonFetcher = fetch;
    return { service, app, settings, details, search, fetch };
}
afterEach(() => { vi.restoreAllMocks(); __setRequestUrlMock(null); });

describe('exact catalog lookup', () => {
    it('looks up the source from the URL and never searches its title or writes a note', async () => {
        const f = fixture();
        const results = await f.service.searchCatalogInput('games', 'https://store.steampowered.com/app/620/Portal_2/', 'rawg');
        expect(results).toHaveLength(1); expect(results[0]).toMatchObject({ provider: 'steam', id: '620', title: 'Exact record', directMatch: true });
        expect((results as any).hasNext).toBe(false);
        expect(f.details).toHaveBeenCalledWith('steam', '620', 'key', 'secret', undefined, expect.objectContaining({ includeParts: false }));
        expect(f.search).not.toHaveBeenCalled(); expect(f.app.vault.create).not.toHaveBeenCalled(); expect(f.app.vault.modify).not.toHaveBeenCalled();
        f.service.dispose();
    });
    it.each([
        ['games', '620', 'steam', 'steam', '620', undefined],
        ['movies', 'tmdb:603', 'omdb', 'tmdb', '603', 'movie'],
        ['series', 'tmdb:tv:1399', 'omdb', 'tmdb', '1399', 'series'],
        ['anime', 'tmdb:movie:129', 'anilist', 'tmdb', '129', 'movie'],
        ['manga', 'anilist:manga:30002', 'mangadex', 'anilist', '30002', undefined],
        ['books', 'googlebooks:AbC_1-XYZ', 'hardcover', 'googlebooks', 'AbC_1-XYZ', undefined],
    ] as const)('uses the correct identity for %s %s', async (kind, input, selected, provider, id, videoKind) => {
        const f = fixture();
        const result = await f.service.searchCatalogInput(kind, input, selected);
        expect(result).toHaveLength(1); expect(result[0]).toMatchObject({ provider, id, ...(videoKind ? { workTypeMedia: videoKind } : {}) });
        expect(f.search).not.toHaveBeenCalled(); f.service.dispose();
    });
    it('resolves a RAWG page slug to the canonical numeric ID', async () => {
        const f = fixture(); f.fetch.mockResolvedValue({ id: 3498, slug: 'the-witcher-3-wild-hunt' });
        expect((await f.service.searchCatalogInput('games', 'https://rawg.io/games/the-witcher-3-wild-hunt', 'steam'))[0].id).toBe('3498');
        expect(f.fetch.mock.calls[0][0]).toContain('/games/the-witcher-3-wild-hunt?');
        expect(f.details.mock.calls[0][1]).toBe('3498'); f.service.dispose();
    });
    it('resolves an IGDB slug by exact API predicate rather than name search', async () => {
        const f = fixture(); f.fetch.mockImplementation(async (url: string) => url.includes('oauth2') ? { access_token: 'test-token', expires_in: 3600 } : [{ id: 1942, slug: 'the-witcher-3-wild-hunt' }]);
        const result = await f.service.searchCatalogInput('games', 'https://www.igdb.com/games/the-witcher-3-wild-hunt', 'steam');
        expect(result[0].id).toBe('1942'); expect(f.fetch.mock.calls.at(-1)[3]).toContain('where slug = "the-witcher-3-wild-hunt"');
        expect(f.search).not.toHaveBeenCalled(); f.service.dispose();
    });
    it('resolves Hardcover and Kitsu page slugs to their own IDs', async () => {
        const f = fixture(); f.fetch.mockResolvedValueOnce({ data: { books: [{ id: 42, slug: 'dune' }] } });
        expect((await f.service.searchCatalogInput('books', 'https://hardcover.app/books/dune', 'googlebooks'))[0].id).toBe('42');
        expect(JSON.parse(f.fetch.mock.calls[0][3]).variables).toEqual({ slug: 'dune' });
        f.fetch.mockResolvedValueOnce({ data: [{ id: '1', type: 'anime', attributes: { slug: 'cowboy-bebop' } }] });
        expect((await f.service.searchCatalogInput('anime', 'https://kitsu.io/anime/cowboy-bebop', 'anilist'))[0].id).toBe('1');
        expect(new URL(f.fetch.mock.calls.at(-1)[0]).searchParams.get('filter[slug]')).toBe('cowboy-bebop'); f.service.dispose();
    });
    it('checks IMDb media type from the exact record without loading seasons', async () => {
        const f = fixture(); f.fetch.mockResolvedValue({ imdbID: 'tt0133093', Title: 'The Matrix', Type: 'movie', Year: '1999' });
        expect((await f.service.searchCatalogInput('movies', 'imdb:tt0133093', 'tmdb'))[0]).toMatchObject({ provider: 'omdb', workTypeMedia: 'movie', title: 'The Matrix' });
        await expect(f.service.searchCatalogInput('series', 'imdb:tt0133093', 'tmdb')).rejects.toThrow(referenceText('wrongMedia'));
        expect(f.fetch.mock.calls.every(call => !String(call[0]).includes('Season='))).toBe(true); f.service.dispose();
    });
    it.each(['https://example.com/app/620', 'https://store.steampowered.com.evil.test/app/620', 'rawg:../bad'])('does not send unsupported input to any network or search: %s', async input => {
        const f = fixture(); await expect(f.service.searchCatalogInput('games', input, 'steam')).rejects.toBeInstanceOf(CatalogReferenceError);
        expect(f.fetch).not.toHaveBeenCalled(); expect(f.details).not.toHaveBeenCalled(); expect(f.search).not.toHaveBeenCalled(); f.service.dispose();
    });
    it('does not silently send a disabled source link to another provider', async () => {
        const f = fixture(); f.settings.integrations!.providers.steam.enabled = false;
        await expect(f.service.searchCatalogInput('games', 'steam:620', 'rawg')).rejects.toThrow(referenceText('unavailable'));
        expect(f.details).not.toHaveBeenCalled(); expect(f.search).not.toHaveBeenCalled(); f.service.dispose();
    });
    it('keeps the existing 18+ filter for exact anime and manga entries', async () => {
        const f = fixture(); f.details.mockResolvedValue({ kind: 'anime', name: 'Adult entry', image: '', isAdult: true } as any);
        await expect(f.service.searchCatalogInput('anime', 'anilist:1', 'anilist')).rejects.toThrow(referenceText('adult'));
        expect(await f.service.searchCatalogInput('anime', 'anilist:1', 'anilist', { includeAdult: true })).toHaveLength(1); f.service.dispose();
    });
    it('preserves title searches, including a way to search titles made of digits', async () => {
        const f = fixture(); await f.service.searchCatalogInput('games', 'CONTROL: Resonant', 'steam');
        expect(f.search.mock.calls[0][1]).toBe('CONTROL: Resonant');
        await f.service.searchCatalogInput('books', 'title:1984', 'googlebooks');
        expect(f.search.mock.calls[1][1]).toBe('1984'); expect(f.details).not.toHaveBeenCalled(); f.service.dispose();
    });
    it('matches an existing library note by its source ID and offers opening it', async () => {
        const f = fixture(); const file = createMockFile('Games/Translation.md', 'Translation');
        f.app.vault.getMarkdownFiles = () => [file];
        f.app.metadataCache.getFileCache = () => ({ frontmatter: { type: 'game', name: 'Other title', integration_provider: 'steam', integration_id: '620' } } as any);
        vi.spyOn(MultiSelectSearchModal.prototype, 'openAndGetValues').mockImplementationOnce(async function (this: any) {
            const results = await this.searchHandler('steam:620', 'rawg');
            expect(results[0]).toMatchObject({ alreadyInLibrary: true, libraryPath: file.path });
            this.onOpenExisting(results[0]); return null;
        });
        await (f.service as any).chooseResults('games', 'rawg', [{ id: 'rawg', label: 'RAWG' }]);
        expect(f.app.workspace.openLinkText).toHaveBeenCalledWith(file.path, '', true);
        expect(f.app.vault.create).not.toHaveBeenCalled(); expect(f.app.vault.modify).not.toHaveBeenCalled(); f.service.dispose();
    });
});

describe('Comic Vine catalogue', () => {
    it('searches volumes and loads comic metadata with a stable identity', async () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.integrations!.enabled = true;
        settings.integrations!.providers.comicvine.apiKey = 'test-key';
        const volume = {
            id: 42, name: 'Batman', start_year: '1940', count_of_issues: 713, description: '<p>Series description</p>',
            site_detail_url: 'https://comicvine.gamespot.com/batman/4050-42/', image: { original_url: 'https://example.test/cover.jpg' },
        };
        const issue = { id: 42, name: 'The Joker', issue_number: '1', volume: { name: 'Batman' }, cover_date: '1940-04-25',
            person_credits: [{ name: 'Bill Finger', role: 'writer' }, { name: 'Bob Kane', role: 'penciler, cover' }] };
        const fetch = vi.fn(async (input: string) => {
            const url = new URL(input);
            expect(url.origin).toBe('https://comicvine.gamespot.com');
            expect(url.searchParams.get('api_key')).toBe('test-key');
            if (url.pathname === '/api/search/') {
                expect(url.searchParams.get('resources')).toBe('volume');
                expect(url.searchParams.get('query')).toBe('Batman');
                expect(url.searchParams.get('page')).toBe('2');
                return { status_code: 1, results: [volume], number_of_total_results: 30 };
            }
            if (url.pathname === '/api/volume/4050-42/') return { status_code: 1, results: volume };
            expect(url.pathname).toBe('/api/issue/4000-42/');
            return { status_code: 1, results: issue };
        });
        const file = createMockFile('Manga/Batman.md', 'Batman');
        const frontmatter: Record<string, unknown> = { type: 'manga' };
        const app = createMockApp({ [file.path]: { frontmatter } });
        const service = new IntegrationService(app, () => settings);
        (service as any).jsonFetcher = fetch;
        const results = await service.searchCatalogInput('manga', 'Batman', 'comicvine', { page: 2 });
        expect(results[0]).toMatchObject({ id: '42', provider: 'comicvine', workType: 'Comics', workTypeMedia: 'manga' });
        expect(results).toHaveProperty('hasNext', true);
        const [directVolume] = await service.searchCatalogInput('manga', volume.site_detail_url, 'anilist');
        expect(directVolume).toMatchObject({ id: '42', directMatch: true });
        const patch = await service.getMediaEnrichment('manga', results[0]);
        expect(patch?.values).toMatchObject({ integration_provider: 'comicvine', integration_id: '42', work_type: 'Comics',
            chapter_total: 713, plot: 'Series description', url: volume.site_detail_url });
        Object.assign(frontmatter, patch!.values);
        const reading = new ReadingService(app, 'manga', 'Manga', createMetadataService(app));
        expect(reading.parseFromCache(file)).toMatchObject({ integrationProvider: 'comicvine', integrationId: '42', workType: 'Comics' });

        const [directIssue] = await service.searchCatalogInput('manga', 'https://comicvine.gamespot.com/the-joker/4000-42/', 'comicvine');
        expect(directIssue).toMatchObject({ id: '4000-42', title: 'Batman #1 — The Joker', released: '1940-04-25', directMatch: true });
        expect((await service.getMediaEnrichment('manga', directIssue))?.values).toMatchObject({
            chapter_total: 1, authors: ['Bill Finger'], artists: ['Bob Kane'],
        });
        await expect(service.searchCatalogInput('anime', volume.site_detail_url, 'anilist')).rejects.toThrow(referenceText('wrongMedia'));
        settings.integrations!.providers.comicvine.apiKey = '';
        await expect(service.testProvider('comicvine', 'manga')).resolves.toEqual({ ok: false, reason: 'missing_key' });
        expect(fetch).toHaveBeenCalledTimes(5);
        service.dispose();
    });
});

describe('exact music lookup', () => {
    beforeEach(() => __setRequestUrlMock(null));
    it('looks up a Deezer album by ID and returns a preview instead of creating a note', async () => {
        const fetch = vi.fn(() => ({ json: { id: 990001, title: 'Exact album', artist: { name: 'Artist' }, release_date: '2024-01-02', tracks: { data: [] }, nb_tracks: 0 } }));
        __setRequestUrlMock(fetch);
        const results = await new MusicCatalog(() => '').search('musicbrainz', 'album', 'https://www.deezer.com/album/990001');
        expect(results[0]).toMatchObject({ id: '990001', provider: 'deezer', kind: 'album', title: 'Exact album', directMatch: true });
        expect(fetch).toHaveBeenCalledOnce(); expect(fetch.mock.calls[0][0].url).toBe('https://api.deezer.com/album/990001');
    });
    it('uses Last.fm artist/title from the link instead of a text search', async () => {
        const fetch = vi.fn(() => ({ json: { album: { name: 'Unique album', artist: 'Artist', tracks: { track: [] } } } }));
        __setRequestUrlMock(fetch);
        const result = await new MusicCatalog(() => 'test-key').search('deezer', 'album', 'https://www.last.fm/music/Artist/Unique+album');
        const url = new URL(fetch.mock.calls[0][0].url);
        expect(url.searchParams.get('method')).toBe('album.getInfo'); expect(url.searchParams.get('artist')).toBe('Artist'); expect(url.searchParams.get('album')).toBe('Unique album');
        expect(result[0].id).toBe(JSON.stringify(['Artist', 'Unique album']));
    });
    it('rejects disabled and mismatched music references before sending a request', async () => {
        const fetch = vi.fn(); __setRequestUrlMock(fetch);
        await expect(new MusicCatalog(() => '', provider => provider !== 'deezer').search('musicbrainz', 'album', 'deezer:990002')).rejects.toThrow(referenceText('unavailable'));
        await expect(new MusicCatalog(() => '').search('deezer', 'album', 'https://www.deezer.com/track/990003')).rejects.toThrow(referenceText('musicKind'));
        expect(fetch).not.toHaveBeenCalled();
    });
});
