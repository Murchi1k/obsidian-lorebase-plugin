import { describe, expect, it, beforeEach } from 'vitest';
import { App, TFile, TFolder, __setRequestUrlMock } from './mocks/obsidian';
import { AniListSyncService } from '../src/services/AniListSyncService';
import { MetadataService } from '../src/services/MetadataService';
import { DEFAULT_SETTINGS } from '../src/constants';
import type { LorebaseSettings } from '../src/types';

function makeSettings(): LorebaseSettings {
    return {
        ...DEFAULT_SETTINGS,
        anime: { ...DEFAULT_SETTINGS.anime, folderPath: 'Anime' },
        manga: { ...DEFAULT_SETTINGS.manga, folderPath: 'Manga' },
        anilistSync: {
            clientId: 'client-id',
            clientSecret: 'client-secret',
            accessToken: 'access-token',
            username: 'tester',
            autoSyncOnStartup: false,
        },
    };
}

function makeApp(): {
    app: App;
    animeFolder: TFolder & { children: TFile[] };
    mangaFolder: TFolder & { children: TFile[] };
    files: Map<string, TFile>;
    frontmatter: Map<string, Record<string, unknown>>;
    created: Map<string, string>;
    requests: Array<{ query: string; variables: Record<string, unknown>; authorization: string }>;
} {
    const animeFolder = new TFolder('Anime') as TFolder & { children: TFile[] };
    const mangaFolder = new TFolder('Manga') as TFolder & { children: TFile[] };
    animeFolder.children = [];
    mangaFolder.children = [];
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
            async createFolder(): Promise<void> { return; },
            async create(path: string, content: string): Promise<TFile> {
                created.set(path, content);
                const file = new TFile(path, path.split('/').pop()?.replace(/\.md$/, '') ?? '');
                files.set(path, file);
                return file;
            },
        },
        fileManager: {
            async processFrontMatter(file: TFile, callback: (value: Record<string, unknown>) => void): Promise<void> {
                const value = frontmatter.get(file.path) ?? {};
                callback(value);
                frontmatter.set(file.path, value);
            },
        },
    } as unknown as App;

    __setRequestUrlMock(async (options) => {
        const request = typeof options === 'string' ? { query: options, variables: {}, authorization: '' } : {
            query: String(options.body ?? ''),
            variables: JSON.parse(String(options.body ?? '{}')).variables ?? {},
            authorization: options.headers?.Authorization ?? '',
        };
        requests.push(request);
        return { json: { data: { Viewer: { name: 'tester' } } } };
    });

    return { app, animeFolder, mangaFolder, files, frontmatter, created, requests };
}

describe('AniListSyncService', () => {
    beforeEach(() => {
        __setRequestUrlMock(null);
    });

    it('authenticates test requests with the configured bearer token', async () => {
        const fixture = makeApp();
        const service = new AniListSyncService(fixture.app, new MetadataService(fixture.app));

        await expect(service.testConnection(makeSettings().anilistSync)).resolves.toBe('tester');
        expect(fixture.requests[0]?.authorization).toBe('Bearer access-token');
    });

    it('builds the AniList implicit authorization URL and captures a pasted redirect token', async () => {
        const settings = makeSettings().anilistSync;
        const fixture = makeApp();
        const service = new AniListSyncService(fixture.app, new MetadataService(fixture.app));
        const url = service.getAuthorizationUrl(settings.clientId);
        expect(url).toContain('client_id=client-id');
        expect(url).not.toContain('redirect_uri=');
        expect(url).toContain('response_type=token');
        expect(service.captureImplicitToken(settings, 'https://anilist.co/api/v2/oauth/pin#access_token=new-access-token&token_type=Bearer')).toBe('new-access-token');
        expect(settings.accessToken).toBe('new-access-token');
    });

    it('exchanges an authorization code using form-encoded OAuth parameters', async () => {
        const settings = makeSettings().anilistSync;
        let request: { headers?: Record<string, string>; body?: string } | null = null;
        __setRequestUrlMock(async (options) => {
            request = typeof options === 'string' ? null : options;
            return { json: { access_token: 'exchanged-token' } };
        });
        const service = new AniListSyncService(new App(), new MetadataService(new App()));

        await expect(service.exchangeAuthorizationCode(settings, 'authorization-code')).resolves.toBe('exchanged-token');
        expect(request?.headers?.['Content-Type']).toBe('application/x-www-form-urlencoded');
        expect(Object.fromEntries(new URLSearchParams(request?.body))).toEqual({
            grant_type: 'authorization_code',
            client_id: 'client-id',
            client_secret: 'client-secret',
            redirect_uri: 'https://anilist.co/api/v2/oauth/pin',
            code: 'authorization-code',
        });
        expect(settings.accessToken).toBe('exchanged-token');
    });

    it('imports one anime and one manga from the authenticated lists', async () => {
        const fixture = makeApp();
        let listRequest = 0;
        __setRequestUrlMock(async (options) => {
            const body = JSON.parse(String(typeof options === 'string' ? '{}' : options.body ?? '{}')) as { query?: string; variables?: { type?: string } };
            if (body.query?.includes('Viewer')) return { json: { data: { Viewer: { name: 'tester' } } } };
            listRequest++;
            const isManga = body.variables?.type === 'MANGA';
            return {
                json: {
                    data: {
                        MediaListCollection: {
                            lists: [{ entries: [{
                                id: isManga ? 2 : 1,
                                status: isManga ? 'CURRENT' : 'COMPLETED',
                                score: isManga ? 80 : 100,
                                progress: isManga ? 12 : 24,
                                media: {
                                    id: isManga ? 200 : 100,
                                    title: { userPreferred: isManga ? 'Manga Item' : 'Anime Item' },
                                    description: 'Description',
                                    episodes: isManga ? null : 24,
                                    chapters: isManga ? 120 : null,
                                    volumes: isManga ? 10 : null,
                                    format: isManga ? 'MANGA' : 'TV',
                                    startDate: { year: 2020 },
                                    coverImage: { large: `https://example.test/${isManga ? 'manga' : 'anime'}.jpg` },
                                    siteUrl: `https://anilist.co/${isManga ? 'manga' : 'anime'}/${isManga ? 200 : 100}`,
                                },
                            }] }],
                        },
                    },
                },
            };
        });

        const settings = makeSettings();
        const service = new AniListSyncService(fixture.app, new MetadataService(fixture.app));
        const result = await service.sync(settings);

        expect(result.imported).toBe(2);
        expect(fixture.created.get('Anime/Anime Item.md')).toContain('integration_id: "100"');
        expect(fixture.created.get('Manga/Manga Item.md')).toContain('chapter_current: 12');
    });

    it('updates linked local anime and manga frontmatter and pushes linked entries', async () => {
        const fixture = makeApp();
        const anime = new TFile('Anime/Existing Anime.md', 'Existing Anime');
        const manga = new TFile('Manga/Existing Manga.md', 'Existing Manga');
        fixture.files.set(anime.path, anime);
        fixture.files.set(manga.path, manga);
        fixture.animeFolder.children.push(anime);
        fixture.mangaFolder.children.push(manga);
        fixture.frontmatter.set(anime.path, { title: 'Existing Anime', integration_provider: 'anilist', integration_id: '100' });
        fixture.frontmatter.set(manga.path, { title: 'Existing Manga', integration_provider: 'anilist', integration_id: '200' });

        let listRequest = 0;
        let mutationCount = 0;
        __setRequestUrlMock(async (options) => {
            const body = JSON.parse(String(typeof options === 'string' ? '{}' : options.body ?? '{}')) as { query?: string; variables?: Record<string, unknown> };
            if (body.query?.includes('SaveMediaListEntry')) {
                mutationCount++;
                return { json: { data: { SaveMediaListEntry: { id: mutationCount } } } };
            }
            listRequest++;
            const isManga = listRequest % 2 === 0;
            return {
                json: {
                    data: {
                        MediaListCollection: {
                            lists: [{ entries: [{
                                id: isManga ? 2 : 1,
                                status: isManga ? 'CURRENT' : 'COMPLETED',
                                score: isManga ? 80 : 100,
                                progress: isManga ? 12 : 24,
                                media: {
                                    id: isManga ? 200 : 100,
                                    title: { userPreferred: isManga ? 'Existing Manga' : 'Existing Anime' },
                                    episodes: isManga ? null : 24,
                                    chapters: isManga ? 120 : null,
                                    volumes: isManga ? 10 : null,
                                    format: isManga ? 'MANGA' : 'TV',
                                    coverImage: {},
                                    siteUrl: `https://anilist.co/${isManga ? 'manga' : 'anime'}/${isManga ? 200 : 100}`,
                                },
                            }] }],
                        },
                    },
                },
            };
        });

        const settings = makeSettings();
        const service = new AniListSyncService(fixture.app, new MetadataService(fixture.app));
        const result = await service.sync(settings);

        expect(result.updatedLocal).toBe(2);
        expect(result.pushed).toBe(0);
        expect(mutationCount).toBe(0);
        expect(fixture.frontmatter.get(anime.path)?.status).toBe('completed');
        expect(fixture.frontmatter.get(manga.path)?.chapter_current).toBe(12);

        fixture.frontmatter.set(anime.path, { ...fixture.frontmatter.get(anime.path), status: 'watching', episode_current: 3 });
        fixture.frontmatter.set(manga.path, { ...fixture.frontmatter.get(manga.path), status: 'planned', chapter_current: 2 });
        const secondResult = await service.sync(settings);

        expect(secondResult.pushed).toBe(2);
        expect(mutationCount).toBe(2);
    });

    it('propagates a deleted local note to AniList instead of re-importing it', async () => {
        const fixture = makeApp();
        const settings = makeSettings();
        settings.anilistSync.lastSynced = {
            'anime:100': { entryId: 9001, status: 'COMPLETED', progress: 24, score: 100, volumeProgress: 0 },
        };
        let deletedEntryId = 0;
        __setRequestUrlMock(async (options) => {
            const body = JSON.parse(String(typeof options === 'string' ? '{}' : options.body ?? '{}')) as { query?: string; variables?: { type?: string; id?: number } };
            if (body.query?.includes('DeleteMediaListEntry')) {
                deletedEntryId = body.variables?.id ?? 0;
                return { json: { data: { DeleteMediaListEntry: true } } };
            }
            if (body.variables?.type === 'ANIME') {
                return { json: { data: { MediaListCollection: { lists: [{ entries: [{ id: 9001, status: 'COMPLETED', score: 100, progress: 24, media: { id: 100, title: { userPreferred: 'Deleted Anime' }, episodes: 24, format: 'TV', coverImage: {}, siteUrl: 'https://anilist.co/anime/100' } }] }] } } } };
            }
            return { json: { data: { MediaListCollection: { lists: [] } } } };
        });

        await new AniListSyncService(fixture.app, new MetadataService(fixture.app)).sync(settings);

        expect(deletedEntryId).toBe(9001);
        expect(settings.anilistSync.lastSynced['anime:100']).toBeUndefined();
        expect(fixture.created.size).toBe(0);
    });
});
