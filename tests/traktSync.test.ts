import { afterEach, describe, expect, it, vi } from 'vitest';
import { App, TFile, TFolder, __setRequestUrlMock } from './mocks/obsidian';
import { DEFAULT_SETTINGS } from '../src/constants';
import { MetadataService } from '../src/services/MetadataService';
import { IntegrationService } from '../src/services/IntegrationService';
import { TraktSyncService } from '../src/services/TraktSyncService';
import { TraktApi, TraktHttpError, traktRequest, type TraktRequest } from '../src/services/trakt/api';
import { defaultTraktSettings, normalizeTraktSettings, type TraktEntry } from '../src/services/trakt/types';
import { localTraktState, mergeTraktState, traktProgressUpdates } from '../src/services/trakt/state';
vi.mock('obsidian', async original => ({ ...await original<object>(), parseYaml: (text: string) => JSON.parse(text) }));
const signal = () => new AbortController().signal;
const series = (episodes: string[] = []): TraktEntry => ({ key: 'series:2177', id: '2177', title: 'South Park', kind: 'series', year: 1997, ids: { trakt: '2177', imdb: 'tt0121955', tmdb: '2190', tvdb: '75897' }, state: { rating: null, watchlist: true, watched: false, episodes } });
const seasonCatalog = [{ number: 1, episodes: [{ number: 1, title: 'One' }, { number: 2, title: 'Two' }, { number: 3, title: 'Three' }] }, { number: 2, episodes: [{ number: 1 }, { number: 2 }] }];
function fixture(entry = series()) {
    const settings = structuredClone(DEFAULT_SETTINGS); settings.traktSync = { ...defaultTraktSettings(), accessToken: 'token' }; settings.series.folderPath = 'Series'; settings.movies.folderPath = 'Movies';
    settings.integrations!.enabled = true; settings.integrations!.providers.tvmaze.enabled = true; settings.integrations!.imageStorage.enabled = false;
    const frontmatter = new Map<string, Record<string, any>>(), files = new Map<string, TFile>(), content = new Map<string, string>();
    const folders = new Map(['Series', 'Movies'].map(path => [path, Object.assign(new TFolder(path), { children: [] as TFile[] })]));
    const app = { vault: {
        getAbstractFileByPath: (path: string) => files.get(path) ?? folders.get(path) ?? null,
        cachedRead: async (file: TFile) => frontmatter.has(file.path) ? `---\n${JSON.stringify(frontmatter.get(file.path))}\n---\nPersonal notes` : '',
        createFolder: vi.fn(), create: vi.fn(async (path: string, body: string) => { const file = new TFile(path, path.split('/').pop()!.slice(0, -3)); files.set(path, file); folders.get(path.split('/')[0])!.children.push(file); content.set(path, body); return file; }),
    }, metadataCache: { getFileCache: (file: TFile) => ({ frontmatter: frontmatter.get(file.path) }) }, fileManager: {
        processFrontMatter: async (file: TFile, callback: (fm: Record<string, any>) => void) => { const fm = frontmatter.get(file.path) ?? {}; callback(fm); frontmatter.set(file.path, fm); },
    } } as unknown as App;
    const integration = new IntegrationService(app, () => settings);
    const fetch = vi.fn(async (url: string) => url.includes('/lookup/') ? { id: 670 } : { id: 670, name: 'South Park', type: 'Animation', premiered: '1997-08-13', averageRuntime: 22,
        summary: '<p>Satirical animated series</p>', genres: ['Animation', 'Comedy'], image: { original: 'https://cover.test/show.jpg' }, officialSite: 'https://southpark.test', network: { name: 'Comedy Central' },
        _embedded: { seasons: [{ id: 10, number: 1, episodeOrder: 3 }, { id: 20, number: 2, episodeOrder: 2 }], cast: [{ person: { name: 'Trey Parker' } }], crew: [] } });
    (integration as any).jsonFetcher = fetch;
    const api = { entries: vi.fn(async () => [structuredClone(entry)]), seasons: vi.fn(async () => seasonCatalog), push: vi.fn(), beginLogin: vi.fn() } as unknown as TraktApi;
    const persist = vi.fn(async () => {}), metadata = new MetadataService(app as any, () => settings);
    const service = new TraktSyncService(app as any, () => settings, metadata, integration, persist, api);
    const seed = (path: string, fm: Record<string, any>) => { const file = new TFile(path, path.split('/').pop()!.slice(0, -3)); files.set(path, file); folders.get(path.split('/')[0])!.children.push(file); frontmatter.set(path, fm); content.set(path, 'Personal notes'); return fm; };
    return { settings, service, integration, api, app, fetch, persist, seed, frontmatter, files, content };
}
afterEach(() => { vi.useRealTimers(); __setRequestUrlMock(null); });
describe('Trakt import through the selected metadata API', () => {
    it('repairs zero-progress snapshots and imports the favorite heart into the note', async () => {
        const entry = series(['1:1', '1:2', '1:3', '2:1', '2:2']); entry.state.favorite = true;
        const test = fixture(entry);
        const fm = test.seed('Series/South Park.md', { type: 'series', title: 'South Park', status: 'planned', favorite: false, series_parts: [{ id: 'old-season', season: 1, episode_current: 0, episode_total: 3 }] });
        const old = { ...series().state, watchlist: false };
        test.settings.traktSync.lastSynced[entry.key] = { path: 'Series/South Park.md', local: { ...old }, remote: { ...old } };
        const [row] = await test.service.preview(signal()); expect(row.conflicts).toEqual([]);
        expect(await test.service.apply([{ row }], signal())).toMatchObject({ updated: 1, failed: 0 });
        expect(fm).toMatchObject({ favorite: true, status: 'completed', season_current: 2, episode_current: 2 });
        expect(fm.series_parts.map((part: any) => part.watched_episodes)).toEqual([[1, 2, 3], [1, 2]]);
        expect(localTraktState(fm, entry, test.settings).favorite).toBe(true);
        expect(test.api.push).not.toHaveBeenCalled();
    });
    it('updates a complete linked note without fetching its metadata again', async () => {
        const test = fixture(series(['1:1']));
        const fm = test.seed('Series/South Park.md', { type: 'series', title: 'South Park', status: 'planned', integration_provider: 'tvmaze', integration_id: '670', poster: 'https://cover.test/show.jpg', plot: 'Existing description', series_parts: [{ id: 'one', season: 1, episode_current: 0, episode_total: 3 }] });
        test.settings.integrations!.providers.tvmaze.enabled = false;
        const [row] = await test.service.preview(signal());
        expect(await test.service.apply([{ row }], signal())).toMatchObject({ updated: 1, failed: 0 });
        expect(fm.series_parts[0].watched_episodes).toEqual([1]); expect(test.fetch).not.toHaveBeenCalled();
    });
    it('loads TMDB artwork without a request for every season and uses Trakt episode durations', async () => {
        const test = fixture(series(['1:1'])); test.settings.traktSync.seriesProvider = 'tmdb';
        Object.assign(test.settings.integrations!.providers.tmdb, { enabled: true, apiKey: 'key' });
        test.fetch.mockImplementation(async () => ({ id: 2190, name: 'South Park', episode_run_time: [], poster_path: '/poster.jpg', seasons: Array.from({ length: 28 }, (_, index) => ({ id: index + 1, season_number: index + 1, episode_count: 3 })) }) as any);
        vi.mocked(test.api.seasons).mockResolvedValue([{ number: 1, episodes: [{ number: 1, runtime: 22 }, { number: 2, runtime: 24 }, { number: 3, runtime: 23 }] }]);
        const [row] = await test.service.preview(signal());
        expect(await test.service.previewImage(row, signal())).toContain('poster.jpg');
        expect(test.fetch).toHaveBeenCalledTimes(1);
        expect(await test.service.apply([{ row }], signal())).toMatchObject({ created: 1, failed: 0 });
        expect(test.fetch).toHaveBeenCalledTimes(1);
        expect(test.frontmatter.get('Series/South Park.md')!.series_parts[0].episode_duration).toBe(23);
    });
    it('creates all seasons for an unplayed watchlist entry, with credits and normal metadata source', async () => {
        const test = fixture(), [row] = await test.service.preview(signal());
        expect(await test.service.apply([{ row }], signal())).toMatchObject({ created: 1, failed: 0 });
        const body = test.content.get('Series/South Park.md')!, fm = test.frontmatter.get('Series/South Park.md')!;
        expect(body).toContain('Trey Parker'); expect(body).toContain('Comedy Central'); expect(body).toContain('1997-08-13');
        expect(body).toContain('integration_provider: "tvmaze"'); expect(body).toContain('integration_id: "670"');
        expect(body).toContain('Satirical animated series'); expect(body).toContain('poster_b: "https://cover.test/show.jpg"');
        expect(fm).toMatchObject({ trakt_id: '2177', seasons: 2, season_current: 1, episode_current: 0, episode_total: 3, status: 'planned', active_part_id: 'season-10' });
        expect(fm.series_parts).toHaveLength(2); expect(fm.series_parts.map((part: any) => part.episode_total)).toEqual([3, 2]);
        expect(fm.external_sync).toBeUndefined(); expect(test.api.push).not.toHaveBeenCalled();
        expect(test.fetch.mock.calls[0][0]).toBe('https://api.tvmaze.com/lookup/shows?imdb=tt0121955');
    });
    it('transfers exact episodes and complete seasons while root counters describe the active season', async () => {
        const test = fixture(series(['1:1', '1:2', '1:3', '2:2'])), [row] = await test.service.preview(signal());
        expect(await test.service.apply([{ row }], signal())).toMatchObject({ created: 1, failed: 0 });
        const fm = test.frontmatter.get('Series/South Park.md')!;
        expect(fm.series_parts[0]).toMatchObject({ status: 'completed', watched_episodes: [1, 2, 3] });
        expect(fm.series_parts[1]).toMatchObject({ status: 'watching', watched_episodes: [2] });
        expect(fm).toMatchObject({ season_current: 2, episode_current: 1, episode_total: 2, active_part_id: 'season-20', status: 'watching' });
    });
    it('repairs the old incomplete Trakt note without replacing its body or populated metadata', async () => {
        const test = fixture();
        const fm = test.seed('Series/South Park.md', { type: 'series', title: 'South Park', year: 1997, plot: 'Моё описание', status: 'planned', external_sync: { 'trakt:series:series:2177': { service: 'trakt', id: 'series:2177', ids: { trakt: '2177' } }, keep: { service: 'other' } } });
        const [row] = await test.service.preview(signal()); expect(row.path).toBe('Series/South Park.md');
        expect(await test.service.apply([{ row }], signal())).toMatchObject({ updated: 1, created: 0, failed: 0 });
        expect(fm).toMatchObject({ plot: 'Моё описание', integration_provider: 'tvmaze', integration_id: '670', actors: ['[[Trey Parker]]'], networks: ['Comedy Central'], trakt_id: '2177' });
        expect(fm.series_parts).toHaveLength(2); expect(fm.external_sync).toEqual({ keep: { service: 'other' } }); expect(test.content.get(row.path!)).toBe('Personal notes');
    });
    it('refuses a partial new note when the selected metadata provider is unavailable', async () => {
        const test = fixture(); test.settings.integrations!.providers.tvmaze.enabled = false;
        const [row] = await test.service.preview(signal());
        expect(await test.service.apply([{ row }], signal())).toMatchObject({ created: 0, failed: 1 });
        expect(test.app.vault.create).not.toHaveBeenCalled(); expect(test.api.push).not.toHaveBeenCalled();
    });
    it('matches external source IDs even when the local title is translated', async () => {
        const test = fixture(); test.seed('Series/Южный парк.md', { type: 'series', title: 'Южный парк', integration_provider: 'tmdb', integration_id: '2190', status: 'planned' });
        expect((await test.service.preview(signal()))[0].path).toBe('Series/Южный парк.md');
    });
    it('does not overwrite edits made locally or remotely after the preview', async () => {
        const test = fixture(series(['1:1']));
        const fm = test.seed('Series/South Park.md', { type: 'series', title: 'South Park', status: 'watching', series_parts: [{ id: 'one', season: 1, episode_current: 1, watched_episodes: [1] }] });
        const [row] = await test.service.preview(signal()); fm.series_parts[0].watched_episodes = [1, 2];
        expect(await test.service.apply([{ row }], signal())).toMatchObject({ failed: 1, updated: 0 });
        const next = (await test.service.preview(signal()))[0];
        vi.mocked(test.api.entries).mockResolvedValue([series(['1:3'])]);
        expect((await test.service.apply([{ row: next, resolution: 'remote' }], signal())).errors[0]).toContain('TRAKT_REMOTE_CHANGED');
        expect(test.api.push).not.toHaveBeenCalled();
    });
    it('pushes local episode changes only in two-way mode and preserves season titles and source IDs', async () => {
        const test = fixture(series(['1:1']));
        const fm = test.seed('Series/South Park.md', { type: 'series', title: 'South Park', status: 'watching', integration_provider: 'tvmaze', integration_id: '670', series_parts: [{ id: 'mine', title: 'Мой сезон', season: 1, episode_current: 1, episode_total: 3, watched_episodes: [1] }] });
        let [row] = await test.service.preview(signal()); expect(await test.service.apply([{ row }], signal())).toMatchObject({ updated: 1, failed: 0 });
        fm.series_parts[0].watched_episodes = [1, 3]; fm.series_parts[0].episode_current = 2; test.settings.traktSync.twoWay = true;
        [row] = await test.service.preview(signal()); expect(await test.service.apply([{ row }], signal())).toMatchObject({ pushed: 1, failed: 0 });
        expect(test.api.push).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ episodes: ['1:1', '1:3'] }), expect.anything());
        expect(fm.series_parts[0]).toMatchObject({ id: 'mine', title: 'Мой сезон' }); expect(fm.integration_id).toBe('670');
    });
    it('does not delete remote history when a linked note disappears', async () => {
        const test = fixture(); test.seed('Series/South Park.md', { type: 'series', title: 'South Park', status: 'planned' });
        const [row] = await test.service.preview(signal()); test.files.clear(); (test.app.vault.getAbstractFileByPath('Series') as any).children.length = 0;
        expect(await test.service.apply([{ row }], signal())).toMatchObject({ failed: 1 }); expect(test.api.push).not.toHaveBeenCalled();
    });
    it('uses TMDB directly by ID when selected and retains its language and complete season data', async () => {
        const test = fixture(); test.settings.traktSync.seriesProvider = 'tmdb';
        Object.assign(test.settings.integrations!.providers.tmdb, { enabled: true, apiKey: 'key' }); test.settings.integrations!.media.series.tmdbLanguage = 'ru-RU';
        test.fetch.mockImplementation(async (url: string) => ({ id: 2190, name: 'Южный парк', first_air_date: '1997-08-13', overview: 'Описание', episode_run_time: [22], poster_path: '/poster.jpg', backdrop_path: '/wide.jpg',
            genres: [{ name: 'Комедия' }], seasons: [{ id: 10, season_number: 1, episode_count: 3 }, { id: 20, season_number: 2, episode_count: 2 }], credits: { cast: [{ name: 'Актёр' }], crew: [] }, networks: [{ name: 'Comedy Central' }], production_companies: [{ name: 'Studio' }] } as any));
        const [row] = await test.service.preview(signal()); expect(await test.service.apply([{ row }], signal())).toMatchObject({ created: 1, failed: 0 });
        const body = test.content.get('Series/Южный парк.md')!;
        expect(body).toContain('integration_provider: "tmdb"'); expect(body).toContain('integration_id: "2190"'); expect(body).toContain('Актёр'); expect(body).toContain('Studio');
        expect(test.fetch.mock.calls[0][0]).toContain('/tv/2190?'); expect(test.fetch.mock.calls[0][0]).toContain('language=ru-RU');
    });
    it('rejects account changes made with an import window open', async () => {
        const test = fixture(), [row] = await test.service.preview(signal()); test.settings.traktSync = { ...defaultTraktSettings(), accessToken: 'other' };
        await expect(test.service.apply([{ row }], signal())).rejects.toThrow('TRAKT_ACCOUNT_CHANGED'); expect(test.app.vault.create).not.toHaveBeenCalled();
    });
    it('rejects in-place credential changes after preview', async () => {
        const test = fixture(), [row] = await test.service.preview(signal());
        test.settings.traktSync.accessToken = 'other-account';
        await expect(test.service.apply([{ row }], signal())).rejects.toThrow('TRAKT_ACCOUNT_CHANGED');
        expect(test.app.vault.create).not.toHaveBeenCalled();
    });
    it('checks cancellation inside a queued frontmatter write', async () => {
        const test = fixture(series(['1:1'])), controller = new AbortController();
        const fm = test.seed('Series/South Park.md', { type: 'series', title: 'South Park', status: 'planned', integration_provider: 'tvmaze', integration_id: '670', poster: 'https://cover.test/show.jpg', plot: 'Description', series_parts: [{ id: 'one', season: 1, episode_current: 0, episode_total: 3 }] });
        const original = JSON.stringify(fm), [row] = await test.service.preview(controller.signal);
        test.app.fileManager.processFrontMatter = async (_file, callback) => { controller.abort(); callback(fm); };
        await expect(test.service.apply([{ row }], controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
        expect(JSON.stringify(fm)).toBe(original); expect(test.settings.traktSync.lastSynced).toEqual({});
    });
});
describe('Trakt progress state', () => {
    it('keeps independent changes and flags conflicting episode selections', () => {
        const a = series(['1:1']).state, b = { ...a, rating: 8 }, local = { ...a, episodes: ['1:1', '1:3'] };
        expect(mergeTraktState(local, b, { path: 'file', local: a, remote: a })).toMatchObject({ conflicts: [], state: { episodes: ['1:1', '1:3'], rating: 8 } });
        expect(mergeTraktState(local, { ...a, episodes: ['1:2'] }, { path: 'file', local: a, remote: a }).conflicts).toEqual(['episodes']);
    });
    it('does not push a representational difference when neither side changed', () => {
        const remote = series().state, local = { ...remote, watchlist: false };
        expect(mergeTraktState(local, remote, { path: 'file', local, remote }).state.watchlist).toBe(true);
    });
    it('supports season zero without renumbering specials', () => {
        const test = fixture(series(['0:2'])); const updates = traktProgressUpdates({}, series(['0:2']), series(['0:2']).state, [{ number: 0, episodes: [{ number: 1 }, { number: 2 }] }, ...seasonCatalog], test.settings);
        expect(updates.series_parts[0]).toMatchObject({ season: 0, watched_episodes: [2] });
        expect(localTraktState(updates, series(['0:2']), test.settings).episodes).toEqual(['0:2']);
    });
    it('normalizes missing account settings without sharing snapshots', () => {
        const first = normalizeTraktSettings(undefined), second = normalizeTraktSettings({ accessToken: 123, expiresAt: Infinity, lastSynced: { invalid: {} } });
        expect(second.accessToken).toBe(''); expect(second.expiresAt).toBe(0); expect(second.lastSynced).toEqual({}); expect(first.lastSynced).not.toBe(second.lastSynced);
        expect(first.clientId).toBe(''); expect(normalizeTraktSettings({ clientId: '  user-app  ' }).clientId).toBe('user-app');
    });
});
describe('Trakt protocol', () => {
    it('requests current watched progress, follows reduced page limits and imports favorites-only titles', async () => {
        const config = { ...defaultTraktSettings(), clientId: 'user-app', accessToken: 'token' };
        const request: TraktRequest = vi.fn(async url => {
            const parsed = new URL(url), page = Number(parsed.searchParams.get('page'));
            if (parsed.pathname === '/sync/watched/shows') {
                const show = { title: `Show ${page}`, ids: { trakt: page } };
                return { data: [{ show, plays: 2, ...(parsed.searchParams.get('extended') === 'progress' ? { seasons: [{ number: page, episodes: [{ number: 1, plays: 1 }, { number: 2, plays: 0 }, { number: 3, plays: 1 }] }] } : {}) }], headers: page < 2 ? { 'x-pagination-limit': '1' } : {} };
            }
            if (parsed.pathname === '/sync/favorites') return { data: [{ type: 'show', show: { title: 'Only favorite', ids: { trakt: 3 } } }, { type: 'show', show: { title: 'Show 1', ids: { trakt: 1 } } }], headers: {} };
            return { data: [], headers: {} };
        });
        const entries = await new TraktApi(() => config, request).entries(signal());
        expect(entries).toHaveLength(3);
        expect(entries[0].state).toMatchObject({ episodes: ['1:1', '1:3'], favorite: true });
        expect(entries[1].state).toMatchObject({ episodes: ['2:1', '2:3'], favorite: false });
        expect(entries[2].state).toMatchObject({ episodes: [], favorite: true });
        expect(request).toHaveBeenCalledWith(expect.stringContaining('extended=progress'), expect.anything(), expect.anything());
    });
    it('refuses to treat missing episode details as zero watched episodes', async () => {
        const config = { ...defaultTraktSettings(), clientId: 'user-app', accessToken: 'token' };
        const request: TraktRequest = vi.fn(async url => ({ data: url.includes('/watched/shows') ? [{ show: { title: 'Watched show', ids: { trakt: 1 } }, plays: 335 }] : [], headers: {} }));
        await expect(new TraktApi(() => config, request).entries(signal())).rejects.toThrow('TRAKT_PROGRESS_UNAVAILABLE');
    });
    it('sends favorite additions and removals independently of ratings and history', async () => {
        const config = { ...defaultTraktSettings(), clientId: 'user-app', accessToken: 'token' }, request: TraktRequest = vi.fn(async () => ({ data: {}, headers: {} }));
        const api = new TraktApi(() => config, request), entry = series(); entry.state.favorite = false;
        await api.push(entry, { ...entry.state, favorite: true }, signal());
        expect(request).toHaveBeenCalledWith('https://api.trakt.tv/sync/favorites', expect.anything(), expect.objectContaining({ body: { shows: [{ ids: { trakt: 2177 } }] } }));
        entry.state.favorite = true; await api.push(entry, { ...entry.state, favorite: false }, signal());
        expect(request).toHaveBeenLastCalledWith('https://api.trakt.tv/sync/favorites/remove', expect.anything(), expect.objectContaining({ body: { shows: [{ ids: { trakt: 2177 } }] } }));
        expect(request).toHaveBeenCalledTimes(2);
    });
    it('reads a changed Client ID without restarting and rejects the old device session', async () => {
        let config = { ...defaultTraktSettings(), clientId: 'first-app' };
        const request: TraktRequest = vi.fn(async () => ({ data: { user_code: 'CODE', device_code: 'device', verification_url: 'https://trakt.tv/activate' }, headers: {} }));
        const api = new TraktApi(() => config, request), first = await api.beginLogin(signal());
        config = { ...defaultTraktSettings(), clientId: 'second-app' };
        await expect(first.poll(signal())).rejects.toThrow('TRAKT_ACCOUNT_CHANGED');
        await api.beginLogin(signal());
        expect(request).toHaveBeenLastCalledWith(expect.stringContaining('/device/code'), expect.anything(), { body: { client_id: 'second-app' } });
    });
    it('uses the user application ID when refreshing credentials', async () => {
        const config = { ...defaultTraktSettings(), clientId: 'user-app', accessToken: 'old', refreshToken: 'refresh', expiresAt: 1 };
        const persist = vi.fn(async () => {});
        const request: TraktRequest = vi.fn(async url => ({ data: url.endsWith('/oauth/token') ? { access_token: 'new', refresh_token: 'next', expires_in: 3600 } : [], headers: {} }));
        const api = new TraktApi(() => config, request, persist), identity = api.getSessionIdentity();
        await api.entries(signal()); expect(api.getSessionIdentity()).toBe(identity);
        expect(identity).toEqual({});
        expect(request).toHaveBeenCalledWith(expect.stringContaining('/oauth/token'), expect.anything(), { body: expect.objectContaining({ client_id: 'user-app', refresh_token: 'refresh' }) });
        expect(request).toHaveBeenCalledWith(expect.stringContaining('/sync/ratings'), expect.anything(), { headers: expect.objectContaining({ 'trakt-api-key': 'user-app', Authorization: 'Bearer new' }) });
        expect(persist).toHaveBeenCalledOnce();
    });
    it('does not overwrite credentials changed during a pending token refresh', async () => {
        const config = { ...defaultTraktSettings(), clientId: 'user-app', accessToken: 'old', refreshToken: 'old-refresh', expiresAt: 1 };
        let finish!: (value: any) => void;
        const request: TraktRequest = vi.fn(() => new Promise(resolve => { finish = resolve; }));
        const persist = vi.fn(async () => {}), api = new TraktApi(() => config, request, persist);
        const pending = api.entries(signal()); config.accessToken = 'other-account';
        finish({ data: { access_token: 'late-old-token', refresh_token: 'late-old-refresh' }, headers: {} });
        await expect(pending).rejects.toThrow('TRAKT_ACCOUNT_CHANGED');
        expect(config.accessToken).toBe('other-account'); expect(persist).not.toHaveBeenCalled();
    });
    it('uses the configured Client ID for device login and account requests', async () => {
        vi.useFakeTimers(); const config = { ...defaultTraktSettings(), clientId: 'user-app' }; let polls = 0;
        const request: TraktRequest = vi.fn(async url => ({ headers: {}, data: url.endsWith('/device/code') ? { user_code: 'ABCD1234', device_code: 'private-code', verification_url: 'https://trakt.tv/activate', interval: 5, expires_in: 600 }
            : url.endsWith('/users/settings') ? { user: { username: 'User' } } : ++polls === 1 ? (() => { throw new TraktHttpError(400); })() : { access_token: 'new', refresh_token: 'next', expires_in: 3600 } }));
        const login = await new TraktApi(() => config, request).beginLogin(signal());
        expect(login.code).toBe('ABCD1234'); expect(await login.poll(signal())).toBeNull(); expect(await login.poll(signal())).toBeNull(); expect(polls).toBe(1);
        await vi.advanceTimersByTimeAsync(5000); expect(await login.poll(signal())).toMatchObject({ accessToken: 'new', username: 'User' });
        expect(request).toHaveBeenCalledWith(expect.stringContaining('/device/code'), expect.anything(), { body: { client_id: 'user-app' } });
        expect(request).toHaveBeenCalledWith(expect.stringContaining('/device/token'), expect.anything(), { body: { code: 'private-code', client_id: 'user-app' } });
        expect(request).toHaveBeenLastCalledWith(expect.stringContaining('/users/settings'), expect.anything(), { headers: expect.objectContaining({ 'trakt-api-key': 'user-app' }) });
    });
    it('loads all watched items and paginated watchlists and reads exact watched episodes', async () => {
        const config = { ...defaultTraktSettings(), clientId: 'user-app', accessToken: 'token' };
        const request: TraktRequest = vi.fn(async url => {
            const show = { title: 'South Park', ids: { trakt: 2177, tmdb: 2190 } };
            if (url.includes('/watched/shows')) return { data: [{ show, seasons: [{ number: 1, episodes: [{ number: 1, plays: 1 }, { number: 3, plays: 1 }] }] }], headers: {} };
            if (url.includes('/watchlist')) return { data: [{ movie: { title: 'Movie', ids: { trakt: new URL(url).searchParams.get('page') } } }], headers: { 'x-pagination-page-count': '2' } };
            return { data: [], headers: {} };
        });
        const entries = await new TraktApi(() => config, request).entries(signal());
        expect(entries).toHaveLength(3); expect(entries[0].state.episodes).toEqual(['1:1', '1:3']);
    });
    it('sends only added and removed episode checks with the original season numbers', async () => {
        const config = { ...defaultTraktSettings(), clientId: 'user-app', accessToken: 'token' }, request: TraktRequest = vi.fn(async () => ({ data: {}, headers: {} }));
        await new TraktApi(() => config, request).push(series(['1:1', '2:1']), { ...series().state, episodes: ['1:1', '2:3'] }, signal());
        expect(request).toHaveBeenCalledWith('https://api.trakt.tv/sync/history', expect.anything(), expect.objectContaining({ body: { shows: [{ ids: { trakt: 2177 }, seasons: [{ number: 2, episodes: [{ number: 3, watched_at: 'unknown' }] }] }] } }));
        expect(request).toHaveBeenCalledWith('https://api.trakt.tv/sync/history/remove', expect.anything(), expect.objectContaining({ body: { shows: [{ ids: { trakt: 2177 }, seasons: [{ number: 2, episodes: [{ number: 1 }] }] }] } }));
    });
    it('cancels stalled requests and hides URLs in network errors', async () => {
        __setRequestUrlMock(() => new Promise(() => {})); const controller = new AbortController(); const pending = traktRequest('https://api.trakt.tv/test', controller.signal); controller.abort(); await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
        __setRequestUrlMock(() => { throw Error('https://provider.test?key=private'); }); await expect(traktRequest('https://provider.test', signal())).rejects.toThrow('TRAKT_NETWORK');
    });
});
