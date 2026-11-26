import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App, TFile, TFolder, __setRequestUrlMock } from './mocks/obsidian';
import { DEFAULT_SETTINGS } from '../src/constants';
import { AniListSyncService } from '../src/services/AniListSyncService';
import { MetadataService } from '../src/services/MetadataService';
import { ANILIST_USER_AGENT } from '../src/services/integrations/anilistRequest';
import type { LorebaseSettings } from '../src/types';

function linkedFixture(remoteOverrides: Record<string, unknown> = {}) {
    const test = fixture();
    const config = settings();
    const remote = {
        id: 11, status: 'CURRENT', score: 80, progress: 7, progressVolumes: 0,
        startedAt: null, completedAt: null, notes: '',
        media: { id: 21, title: { userPreferred: 'ONE PIECE' }, episodes: 100 },
        ...remoteOverrides,
    };
    const mutations: Array<Record<string, unknown>> = [];
    test.seed('Anime/ONE PIECE.md', {
        integration_provider: 'anilist', integration_id: '21',
        status: 'watching', rating: 4, episode_current: 7,
    }, '---\ntype: anime\n---\n\n## Other\nKeep this section.');
    config.anilistSync.lastSynced['anime:21'] = {
        entryId: 11, status: 'CURRENT', score: 80, progress: 7, volumeProgress: 0,
    };
    __setRequestUrlMock(async (options) => {
        const body = JSON.parse(String(typeof options === 'string' ? '{}' : options.body ?? '{}'));
        if (body.query.includes('SaveMediaListEntry')) {
            expect(body.query).toContain('scoreRaw: $scoreRaw');
            expect(body.query).not.toContain('$score:');
            mutations.push(body.variables);
            Object.assign(remote, {
                score: body.variables.scoreRaw, status: body.variables.status,
                progress: body.variables.progress, startedAt: body.variables.startedAt,
                completedAt: body.variables.completedAt, notes: body.variables.notes,
            });
            return { json: { data: { SaveMediaListEntry: { id: 11 } } } };
        }
        expect(body.query).toContain('startedAt { year month day }');
        return { json: { data: { MediaListCollection: { hasNextChunk: false, lists: [{
            entries: body.variables.type === 'ANIME' ? [remote] : [],
        }] } } } };
    });
    return { ...test, config, remote, mutations,
        service: new AniListSyncService(test.app, new MetadataService(test.app)),
        data: test.frontmatter.get('Anime/ONE PIECE.md')!,
    };
}

describe('AniList personal data synchronization', () => {
    it('updates remote counts without erasing exact local episode checks', async () => {
        const test = linkedFixture({ progress: 3 });
        Object.assign(test.data, { episode_current: 2, active_part_id: 'anilist-21', anime_parts: [{ id: 'anilist-21', episode_current: 2, episode_total: 100, watched_episodes: [2, 6], episode_tracking: 'episodes' }] });
        test.config.anilistSync.lastSynced['anime:21'].progress = 2;
        await test.service.sync(test.config);
        expect(test.data.episode_current).toBe(3);
        expect((test.data.anime_parts as any[])[0]).toMatchObject({ watched_episodes: [1, 2, 6], episode_current: 3, episode_tracking: 'episodes' });
    });
    it.each(['shikimori', 'jikan', 'mangadex', 'mangaupdates', 'manual'])(
        'syncs an explicit %s link while preserving source identity and URL', async (provider) => {
            const test = linkedFixture();
            Object.assign(test.data, {
                integration_provider: provider, integration_id: 'original-123',
                anilist_id: '21', url: 'https://source.test/original-123', rating: 3,
            });
            delete test.config.anilistSync.lastSynced['anime:21'];
            expect((await test.service.sync(test.config)).pushed).toBe(1);
            expect(test.mutations[0]).toMatchObject({ mediaId: 21, scoreRaw: 60 });
            Object.assign(test.remote, { progress: 10, score: 100, notes: 'Remote review' });
            expect((await test.service.sync(test.config)).updatedLocal).toBe(1);
            expect(test.data).toMatchObject({
                integration_provider: provider, integration_id: 'original-123',
                anilist_id: '21', url: 'https://source.test/original-123', episode_current: 10, rating: 5,
            });
            expect(test.created.get('Anime/ONE PIECE.md')).toContain('Remote review');
        }
    );

    it('links manga from another provider only after a validated selection and rejects duplicates', async () => {
        const test = fixture();
        const config = settings();
        const source = { type: 'manga', title: 'Manga', integration_provider: 'mangadex', integration_id: 'uuid-123' };
        test.seed('Manga/One.md', { ...source });
        test.seed('Manga/Two.md', { ...source });
        __setRequestUrlMock(async () => ({ json: { data: { Media: { id: 123, type: 'MANGA' } } } }));
        const service = new AniListSyncService(test.app, new MetadataService(test.app));
        const candidates = service.getUnlinkedItems(config);
        expect(candidates).toHaveLength(2);
        await service.linkExisting(config, candidates[0], 123);
        expect(test.frontmatter.get('Manga/One.md')).toMatchObject({ ...source, anilist_id: '123' });
        expect(service.getUnlinkedItems(config)).toHaveLength(1);
        await expect(service.linkExisting(config, candidates[1], 123)).rejects.toThrow('Already linked');
        expect(test.frontmatter.get('Manga/Two.md')).not.toHaveProperty('anilist_id');
    });

    it('does not use an unrelated provider ID as an AniList ID', async () => {
        const test = fixture();
        test.seed('Anime/Other.md', { type: 'anime', integration_provider: 'shikimori', integration_id: '21' });
        __setRequestUrlMock(async () => ({ json: { data: { MediaListCollection: { hasNextChunk: false, lists: [] } } } }));
        const service = new AniListSyncService(test.app, new MetadataService(test.app));
        const result = await service.sync(settings());
        expect(result.pushed).toBe(0);
        expect(service.getUnlinkedItems(settings())).toHaveLength(1);
    });

    it('syncs manga chapters, volumes and notes without replacing the MangaDex source', async () => {
        const test = fixture();
        const config = settings();
        test.seed('Manga/One.md', {
            type: 'manga', integration_provider: 'mangadex', integration_id: 'uuid-123',
            anilist_id: '123', url: 'https://mangadex.org/title/uuid-123',
            status: 'watching', chapter_current: 15, volume_current: 3, rating: 4,
        }, '## My Notes\n\nLocal manga review');
        const mutations: Array<Record<string, unknown>> = [];
        const remote = {
            id: 999, status: 'PLANNING', score: 0, progress: 0, progressVolumes: 0,
            notes: '', media: { id: 123, chapters: 100, volumes: 20 },
        };
        __setRequestUrlMock(async (options) => {
            const body = JSON.parse(String(typeof options === 'string' ? '{}' : options.body ?? '{}'));
            if (body.query.includes('SaveMediaListEntry')) {
                mutations.push(body.variables);
                Object.assign(remote, { status: body.variables.status, score: body.variables.scoreRaw,
                    progress: body.variables.progress, progressVolumes: body.variables.progressVolumes,
                    notes: body.variables.notes });
                return { json: { data: { SaveMediaListEntry: { id: 999 } } } };
            }
            return { json: { data: { MediaListCollection: { hasNextChunk: false, lists: [{
                entries: body.variables.type === 'MANGA' ? [remote] : [],
            }] } } } };
        });
        const service = new AniListSyncService(test.app, new MetadataService(test.app));
        const first = await service.sync(config);
        expect(first.imported).toBe(0);
        expect(first.pushed).toBe(1);
        expect(mutations[0]).toMatchObject({ mediaId: 123, progress: 15, progressVolumes: 3,
            scoreRaw: 80, notes: 'Local manga review' });
        Object.assign(remote, { progress: 20, progressVolumes: 4, notes: 'Review from AniList' });
        expect((await service.sync(config)).updatedLocal).toBe(1);
        expect(test.frontmatter.get('Manga/One.md')).toMatchObject({
            integration_provider: 'mangadex', integration_id: 'uuid-123', anilist_id: '123',
            url: 'https://mangadex.org/title/uuid-123', chapter_current: 20, volume_current: 4,
        });
        expect(test.created.get('Manga/One.md')).toContain('Review from AniList');
        await service.sync(config);
        expect(mutations).toHaveLength(1);
    });

    it('rejects a link to the wrong media type', async () => {
        const test = fixture();
        test.seed('Manga/One.md', { type: 'manga', integration_provider: 'mangadex', integration_id: 'uuid-123' });
        const service = new AniListSyncService(test.app, new MetadataService(test.app));
        __setRequestUrlMock(async () => ({ json: { data: { Media: { id: 21, type: 'ANIME' } } } }));
        await expect(service.linkExisting(settings(), service.getUnlinkedItems(settings())[0], 21)).rejects.toThrow('media type');
        expect(test.frontmatter.get('Manga/One.md')).not.toHaveProperty('anilist_id');
    });

    it('backfills dates and My Notes for old snapshots without changing other Markdown', async () => {
        const test = linkedFixture({
            startedAt: { year: 2026, month: 1, day: 2 },
            completedAt: { year: 2026, month: 2, day: 3 }, notes: 'My **review**\nSecond line.',
        });
        expect((await test.service.sync(test.config)).updatedLocal).toBe(1);
        expect(test.data.started).toBe('2026-01-02');
        expect(test.data.finished).toBe('2026-02-03');
        expect(test.data.dateWatched).toBe('2026-02-03');
        const content = test.created.get('Anime/ONE PIECE.md');
        expect(content).toContain('## My Notes\n\nMy **review**\nSecond line.');
        expect(content).toContain('## Other\nKeep this section.');
        expect((await test.service.sync(test.config)).updatedLocal).toBe(0);
        expect(test.mutations).toHaveLength(0);
    });

    it.each([
        [5, 1, 3, 60], [10, 1, 7, 70], [10, 0.5, 7.5, 75], [5, 1, null, 0],
    ] as const)('sends rating %s/%s/%s as scoreRaw %s', async (max, step, rating, expected) => {
        const test = linkedFixture();
        test.config.ratingScale = { mode: 'custom', max, step, display: 'number' };
        test.data.rating = rating;
        expect((await test.service.sync(test.config)).pushed).toBe(1);
        expect(test.mutations[0].scoreRaw).toBe(expected);
        expect(test.mutations[0]).not.toHaveProperty('score');
        await test.service.sync(test.config);
        expect(test.mutations).toHaveLength(1);
    });

    it('merges a local rating and notes with remote dates and preserves rounded remote scores', async () => {
        const test = linkedFixture({ startedAt: { year: 2026, month: 3, day: 4 } });
        test.data.rating = 3;
        test.created.set('Anime/ONE PIECE.md', '## My Notes\n\nLocal review');
        await test.service.sync(test.config);
        expect(test.mutations[0]).toMatchObject({
            scoreRaw: 60, startedAt: { year: 2026, month: 3, day: 4 }, notes: 'Local review',
        });
        expect(test.data.started).toBe('2026-03-04');
        await test.service.sync(test.config);
        expect(test.mutations).toHaveLength(1);
    });

    it('does not push a rounded score back unless the local rating actually changes', async () => {
        const test = linkedFixture({ score: 73 });
        test.config.anilistSync.lastSynced['anime:21'].score = 73;
        await test.service.sync(test.config);
        expect(test.mutations).toHaveLength(0);
        test.created.set('Anime/ONE PIECE.md', '## My Notes\n\nNew note');
        await test.service.sync(test.config);
        expect(test.mutations[0].scoreRaw).toBe(73);
    });

    it('sends local dates, clears them and clears My Notes without deleting other text', async () => {
        const test = linkedFixture();
        test.data.started = '2026-02-01';
        test.data.finished = '2026-03-01';
        test.created.set('Anime/ONE PIECE.md', '## My Notes\n\nLocal note\n\n## Other\nKeep');
        await test.service.sync(test.config);
        expect(test.mutations[0]).toMatchObject({
            startedAt: { year: 2026, month: 2, day: 1 },
            completedAt: { year: 2026, month: 3, day: 1 }, notes: 'Local note',
        });
        delete test.data.started;
        delete test.data.finished;
        delete test.data.dateWatched;
        test.created.set('Anime/ONE PIECE.md', '## Other\nKeep');
        await test.service.sync(test.config);
        expect(test.mutations[1]).toMatchObject({
            startedAt: { year: null, month: null, day: null },
            completedAt: { year: null, month: null, day: null }, notes: '',
        });
    });

    it('preserves partial AniList dates when changing another field', async () => {
        const test = linkedFixture({ startedAt: { year: 2025, month: 6, day: null } });
        await test.service.sync(test.config);
        expect(test.data.started).toBe('2025-06-00');
        test.data.rating = 3;
        await test.service.sync(test.config);
        expect(test.mutations[0].startedAt).toEqual({ year: 2025, month: 6, day: null });
    });

    it('applies remote clearing of dates and notes to existing notes', async () => {
        const test = linkedFixture({
            startedAt: { year: 2025, month: 6, day: 1 },
            completedAt: { year: 2025, month: 7, day: 1 }, notes: 'Old review',
        });
        await test.service.sync(test.config);
        Object.assign(test.remote, { startedAt: null, completedAt: null, notes: '' });
        await test.service.sync(test.config);
        expect(test.data).not.toHaveProperty('started');
        expect(test.data).not.toHaveProperty('finished');
        expect(test.data).not.toHaveProperty('dateWatched');
        expect(test.created.get('Anime/ONE PIECE.md')).not.toContain('## My Notes');
        expect(test.created.get('Anime/ONE PIECE.md')).toContain('Keep this section.');
        expect(test.mutations).toHaveLength(0);
    });
});

describe('AniList deletion safeguards', () => {
    it('stops with no mutations if the configured folder is unavailable', async () => {
        const test = linkedFixture(); test.config.anime.folderPath = 'Missing/Anime';
        test.config.anilistSync.syncDeletions = true;
        await expect(test.service.sync(test.config)).rejects.toThrow(/folder is unavailable/);
        expect(test.mutations).toHaveLength(0);
        expect(test.config.anilistSync.lastSynced['anime:21']).toBeDefined();
    });
    it('stops if local metadata is not yet indexed', async () => {
        const test = linkedFixture();
        vi.spyOn(test.app.metadataCache, 'getFileCache').mockReturnValue(null);
        await expect(test.service.sync(test.config)).rejects.toThrow(/metadata is still loading/);
        expect(test.mutations).toHaveLength(0);
    });
    it('does not interpret unlinking a note as a remote deletion', async () => {
        const test = linkedFixture(); test.config.anilistSync.syncDeletions = true;
        delete test.data.integration_id;
        const result = await test.service.sync(test.config);
        expect(result.skipped).toBe(1); expect(test.mutations).toHaveLength(0);
        expect(test.config.anilistSync.lastSynced['anime:21']).toBeDefined();
    });
    it('keeps an unchanged local note when its remote entry is absent by default', async () => {
        const test = linkedFixture(); await test.service.sync(test.config);
        const trash = vi.spyOn(test.app.fileManager, 'trashFile');
        __setRequestUrlMock(() => ({ json: { data: { MediaListCollection: { hasNextChunk: false, lists: [] } } } }));
        const result = await test.service.sync(test.config);
        expect(result.skipped).toBe(1); expect(trash).not.toHaveBeenCalled();
    });
    it('uses the configured Obsidian trash only after deletion sync is explicitly enabled', async () => {
        const test = linkedFixture(); await test.service.sync(test.config);
        test.config.anilistSync.syncDeletions = true;
        const trash = vi.spyOn(test.app.fileManager, 'trashFile');
        __setRequestUrlMock(() => ({ json: { data: { MediaListCollection: { hasNextChunk: false, lists: [] } } } }));
        await test.service.sync(test.config);
        expect(trash).toHaveBeenCalledOnce();
    });
    it('renames tracked paths, including an entire folder, without creating tombstones', async () => {
        const test = linkedFixture(); await test.service.sync(test.config);
        expect(test.service.recordLocalRename(test.config.anilistSync, 'Anime', 'Archive/Anime')).toBe(true);
        expect(test.config.anilistSync.lastSynced['anime:21']).toMatchObject({ localPath: 'Archive/Anime/ONE PIECE.md', localDeleted: false });
        expect(test.service.recordLocalDeletion(test.config.anilistSync, 'Anime/ONE PIECE.md')).toBe(false);
    });
    it('requires a real vault-delete tombstone to remove the remote entry', async () => {
        const test = linkedFixture(); await test.service.sync(test.config);
        test.config.anilistSync.syncDeletions = true;
        const folder = test.app.vault.getAbstractFileByPath('Anime') as TFolder; folder.children = [];
        const get = test.app.vault.getAbstractFileByPath.bind(test.app.vault);
        vi.spyOn(test.app.vault, 'getAbstractFileByPath').mockImplementation(path => path === 'Anime/ONE PIECE.md' ? null : get(path));
        const requests: string[] = [];
        __setRequestUrlMock(options => {
            const body = JSON.parse(String(typeof options === 'string' ? '' : options.body)); requests.push(body.query);
            return { json: { data: body.query.includes('DeleteMediaListEntry') ? { DeleteMediaListEntry: { deleted: true } }
                : { MediaListCollection: { hasNextChunk: false, lists: [{ entries: body.variables.type === 'ANIME' ? [test.remote] : [] }] } } } };
        });
        expect((await test.service.sync(test.config)).skipped).toBe(1);
        expect(requests.some(query => query.includes('DeleteMediaListEntry'))).toBe(false);
        test.service.recordLocalDeletion(test.config.anilistSync, 'Anime/ONE PIECE.md');
        expect((await test.service.sync(test.config)).pushed).toBe(1);
        expect(requests.filter(query => query.includes('DeleteMediaListEntry'))).toHaveLength(1);
    });
    it('refuses incomplete remote collections instead of treating them as an empty list', async () => {
        const test = linkedFixture();
        __setRequestUrlMock(() => ({ json: { data: {} } }));
        await expect(test.service.sync(test.config)).rejects.toThrow(/incomplete library/);
        expect(test.config.anilistSync.lastSynced['anime:21']).toBeDefined();
    });
});

function settings(): LorebaseSettings {
    const value = structuredClone(DEFAULT_SETTINGS);
    value.anilistSync = {
        clientId: 'client-id',
        accessToken: 'access-token',
        username: 'tester',
        autoSyncOnStartup: false,
        lastSynced: {},
    };
    value.anime.folderPath = 'Anime';
    value.manga.folderPath = 'Manga';
    return value;
}

function fixture(): {
    app: App;
    seed: (path: string, data: Record<string, unknown>, content?: string) => void;
    frontmatter: Map<string, Record<string, unknown>>;
    created: Map<string, string>;
    requests: Array<{ query: string; variables: Record<string, unknown>; authorization: string }>;
} {
    const animeFolder = Object.assign(new TFolder('Anime'), { children: [] as TFile[] });
    const mangaFolder = Object.assign(new TFolder('Manga'), { children: [] as TFile[] });
    const files = new Map<string, TFile>();
    const frontmatter = new Map<string, Record<string, unknown>>();
    const created = new Map<string, string>();
    const requests: Array<{ query: string; variables: Record<string, unknown>; authorization: string }> = [];
    const app = {
        metadataCache: {
            getFileCache(file: TFile): { frontmatter?: Record<string, unknown> } {
                return { frontmatter: frontmatter.get(file.path) };
            },
        },
        vault: {
            getAbstractFileByPath(path: string): TFolder | TFile | null {
                if (path === 'Anime') return animeFolder;
                if (path === 'Manga') return mangaFolder;
                return files.get(path) ?? null;
            },
            async createFolder(): Promise<void> {},
            async create(path: string, content: string): Promise<TFile> {
                created.set(path, content);
                const file = new TFile(path, path.split('/').pop()?.replace(/\.md$/, '') ?? '');
                files.set(path, file);
                return file;
            },
            async read(file: TFile): Promise<string> { return created.get(file.path) ?? ''; },
            async modify(file: TFile, content: string): Promise<void> { created.set(file.path, content); },
            async process(file: TFile, transform: (content: string) => string): Promise<string> {
                const next = transform(created.get(file.path) ?? ''); created.set(file.path, next); return next;
            },
            async trash(): Promise<void> {},
        },
        fileManager: {
            async trashFile(file: TFile): Promise<void> { files.delete(file.path); created.delete(file.path); frontmatter.delete(file.path); },
            async processFrontMatter(file: TFile, callback: (data: Record<string, unknown>) => void): Promise<void> {
                const data = frontmatter.get(file.path) ?? {};
                callback(data);
                frontmatter.set(file.path, data);
            },
        },
    } as unknown as App;

    __setRequestUrlMock(async (options) => {
        const body = JSON.parse(String(typeof options === 'string' ? '{}' : options.body ?? '{}')) as {
            query?: string;
            variables?: Record<string, unknown>;
        };
        requests.push({
            query: body.query ?? '',
            variables: body.variables ?? {},
            authorization: typeof options === 'string' ? '' : options.headers?.Authorization ?? '',
        });
        return { json: { data: { Viewer: { name: 'tester' } } } };
    });
    const seed = (path: string, data: Record<string, unknown>, content = ''): void => {
        const file = new TFile(path, path.split('/').pop()?.replace(/\.md$/, '') ?? '');
        files.set(path, file);
        (path.startsWith('Anime/') ? animeFolder : mangaFolder).children.push(file);
        frontmatter.set(path, data);
        created.set(path, content);
    };
    return { app, created, requests, seed, frontmatter };
}

describe('AniListSyncService', () => {
    beforeEach(() => __setRequestUrlMock(null));

    it('sends the API User-Agent while preserving authorization and GraphQL payload', async () => {
        const test = fixture();
        const config = settings().anilistSync;
        __setRequestUrlMock((options) => {
            expect(options).toMatchObject({
                method: 'POST', throw: false,
                headers: { 'User-Agent': ANILIST_USER_AGENT, Authorization: `Bearer ${config.accessToken}` },
            });
            const payload = JSON.parse(String(typeof options === 'string' ? '' : options.body));
            expect(payload.query).toContain('Viewer');
            return { json: { data: { Viewer: { name: 'tester' } } } };
        });
        await expect(new AniListSyncService(test.app, new MetadataService(test.app)).testConnection(config)).resolves.toBe('tester');
    });

    it.each([403, 401, 500])('handles HTTP %s before reading an HTML error as JSON', async (status) => {
        const test = fixture();
        let calls = 0;
        __setRequestUrlMock(() => {
            calls++;
            return { status, text: '<html>Access denied</html>', get json(): never { throw new SyntaxError('HTML is not JSON'); } };
        });
        await expect(new AniListSyncService(test.app, new MetadataService(test.app)).testConnection(settings().anilistSync))
            .rejects.toThrow(`HTTP ${status}`);
        expect(calls).toBe(1);
    });

    it('builds the AniList authorization URL and sends the configured access token', async () => {
        const test = fixture();
        const service = new AniListSyncService(test.app, new MetadataService(test.app));
        const config = settings().anilistSync;
        expect(service.getAuthorizationUrl(config.clientId)).toContain('response_type=token');
        config.accessToken = 'new-token';
        await expect(service.testConnection(config)).resolves.toBe('tester');
        expect(test.requests[0]?.authorization).toBe('Bearer new-token');
    });

    it('imports anime and manga with the fields used by current LOREBASE parsers', async () => {
        const test = fixture();
        __setRequestUrlMock(async (options) => {
            const body = JSON.parse(String(typeof options === 'string' ? '{}' : options.body ?? '{}')) as {
                variables?: { type?: string };
            };
            const manga = body.variables?.type === 'MANGA';
            return {
                json: {
                    data: {
                        MediaListCollection: { hasNextChunk: false,
                            lists: [{ entries: [{
                                id: manga ? 22 : 11,
                                status: manga ? 'CURRENT' : 'COMPLETED',
                                score: manga ? 80 : 100,
                                progress: manga ? 12 : 24,
                                progressVolumes: manga ? 2 : 0,
                                startedAt: { year: 2024, month: 1, day: 2 },
                                completedAt: { year: 2024, month: 2, day: 3 },
                                notes: 'Imported review',
                                media: {
                                    id: manga ? 200 : 100,
                                    title: { userPreferred: manga ? 'Manga Item' : 'Anime Item' },
                                    description: 'First<br><br><b>second</b>',
                                    genres: ['Action', 'Adventure'],
                                    studios: { nodes: [{ name: 'Toei Animation' }] },
                                    episodes: manga ? null : 24,
                                    chapters: manga ? 120 : null,
                                    volumes: manga ? 10 : null,
                                    format: manga ? 'MANHWA' : 'TV',
                                    countryOfOrigin: manga ? 'KR' : 'JP',
                                    startDate: { year: 2020, month: 10, day: 20 },
                                    coverImage: { large: 'https://example.test/cover.jpg' },
                                    siteUrl: `https://anilist.co/${manga ? 'manga' : 'anime'}/${manga ? 200 : 100}`,
                                },
                            }] }],
                        },
                    },
                },
            };
        });
        const value = settings();
        const result = await new AniListSyncService(test.app, new MetadataService(test.app)).sync(value);
        expect(result.imported).toBe(2);
        const anime = test.created.get('Anime/Anime Item.md')!;
        expect(anime).toContain('image_b: "https://example.test/cover.jpg"');
        expect(anime).toContain('plot: "First second"');
        expect(anime).not.toContain('<br>');
        expect(anime).toContain('genres: ["[[Action]]","[[Adventure]]"]');
        expect(anime).not.toContain('tags:\n  - "Action"');
        expect(anime).toContain('studios: ["[[Toei Animation]]"]');
        expect(anime).toContain('released: 2020-10-20');
        expect(anime).toContain('format: "TV"');
        expect(anime).toContain('season_current: 0');
        expect(anime).toContain('episode_current: 24');
        expect(anime).toContain('episode_total: 24');
        expect(anime).toContain('anime_parts:\n  []');
        expect(anime).toContain('active_part_id: ""');
        expect(anime).toContain('communityRatingProvider: ""');
        expect(anime).toContain('status: "completed"');
        expect(anime).toContain('rating: 5');
        expect(anime).toContain('started: "2024-01-02"');
        expect(anime).toContain('finished: "2024-02-03"');
        expect(anime).not.toContain('dateWatched:');
        expect(anime.indexOf('started:')).toBeLessThan(anime.indexOf('favorite:'));
        expect(anime).toContain('## My Notes\n\nImported review');
        expect(test.created.get('Anime/Anime Item.md')).toContain('type: "anime"');
        expect(test.created.get('Manga/Manga Item.md')).toContain('work_type: "Manhwa"');
        expect(test.created.get('Manga/Manga Item.md')).toContain('chapter_total: 120');
    });
    it.each(['default', 'simple', 'advanced', 'body-only'] as const)(
        'uses the %s template for selected imports without losing the AniList identity', async (mode) => {
            const test = fixture();
            __setRequestUrlMock(async (options) => {
                const body = JSON.parse(String(typeof options === 'string' ? '{}' : options.body ?? '{}'));
                return { json: { data: { MediaListCollection: { hasNextChunk: false, lists: [{ entries:
                    body.variables.type === 'MANGA' ? [] : [{
                        id: 21, status: 'CURRENT', score: 0, progress: 7,
                        media: { id: 21, title: { userPreferred: 'ONE PIECE' }, episodes: null, format: 'TV' },
                    }],
                }] } } } };
            });
            const config = settings();
            const template = config.integrations.media.anime;
            if (mode === 'simple') template.templateFields = ['type', 'name', 'animeParts', 'rating', 'status'];
            if (mode === 'advanced' || mode === 'body-only') {
                template.templateMode = 'advanced';
                template.template = mode === 'advanced'
                    ? '---\ntype: anime\ntitle: "{{VALUE:name}}"\nepisode_current: {{VALUE:episodeCurrent}}\nstatus: "{{VALUE:status}}"\n---\nMy notes'
                    : '# {{VALUE:name}}\nMy notes';
            }
            const result = await new AniListSyncService(test.app, new MetadataService(test.app))
                .importSelected(config, new Set(['anime:21']));
            expect(result.imported).toBe(1);
            const content = test.created.get('Anime/ONE PIECE.md')!;
            expect(content).toContain('integration_provider: "anilist"');
            expect(content).toContain('integration_id: "21"');
            expect(content).toContain('episode_current: 7');
            expect(content).toContain('status: "watching"');
            expect(content).not.toContain('{{VALUE:');
            if (mode === 'default' || mode === 'body-only') {
                expect(content).toContain('episode_total: 0');
                expect(content).toContain('rating: 0');
            }
            if (mode === 'simple') expect(content).not.toContain('image_b:');
            if (mode === 'advanced' || mode === 'body-only') expect(content).toContain('My notes');
        }
    );

});


describe('AniList selected import progress', () => {
    it('reports actual per-entry outcomes and fetches only the selected media type', async () => {
        const { service, config } = linkedFixture();
        const fetch = vi.spyOn(service as any, 'fetchEntries');
        const start = vi.fn(), result = vi.fn();
        const imported = await service.importSelected(config, new Set(['anime:21']), { onItemStart: start, onItemResult: result });
        expect(imported.updatedLocal).toBe(1);
        expect(fetch).toHaveBeenCalledOnce();
        expect(fetch.mock.calls[0][2]).toBe('ANIME');
        expect(start).toHaveBeenCalledExactlyOnceWith('anime:21');
        expect(result).toHaveBeenCalledExactlyOnceWith('anime:21', 'updated');
    });
    it('honors cancellation after waiting and does not write or report unprocessed entries', async () => {
        const { service, config } = linkedFixture();
        const update = vi.spyOn(service as any, 'updateLocal');
        let cancelled = false;
        const result = vi.fn();
        const imported = await service.importSelected(config, new Set(['anime:21']), {
            control: { isCancelled: () => cancelled, waitIfPaused: async () => { cancelled = true; } }, onItemResult: result,
        });
        expect(update).not.toHaveBeenCalled(); expect(result).not.toHaveBeenCalled();
        expect(imported.updatedLocal).toBe(0);
    });
});


it('marks a manual AniList preview match as in the library without claiming it is linked', async () => {
    const test = fixture(), config = settings();
    test.seed('Anime/Local.md', { type: 'anime', title: 'ONE PIECE', integration_provider: 'manual' });
    __setRequestUrlMock(async options => {
        const body = JSON.parse(String(typeof options === 'string' ? '{}' : options.body ?? '{}'));
        return { json: { data: { MediaListCollection: { hasNextChunk: false, lists: [{ entries: body.variables.type === 'ANIME' ? [{
            id: 1, status: 'CURRENT', score: 0, progress: 7, media: { id: 21, title: { userPreferred: 'ONE PIECE' } },
        }] : [] }] } } } };
    });
    const preview = await new AniListSyncService(test.app, new MetadataService(test.app)).previewImport(config);
    expect(preview[0]).toMatchObject({ key: 'anime:21', linked: false, alreadyInLibrary: true });
});
