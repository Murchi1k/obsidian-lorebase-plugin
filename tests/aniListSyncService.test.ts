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
            const body = JSON.parse(String(typeof options === 'string' ? '{}' : options.body ?? '{}')) as { query?: string };
            if (body.query?.includes('Viewer')) return { json: { data: { Viewer: { name: 'tester' } } } };
            listRequest++;
            const isManga = body.query?.includes('MediaListCollection') && listRequest === 2;
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

        const result = await new AniListSyncService(fixture.app, new MetadataService(fixture.app)).sync(makeSettings());

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
            const isManga = listRequest === 2;
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

        const result = await new AniListSyncService(fixture.app, new MetadataService(fixture.app)).sync(makeSettings());

        expect(result.updatedLocal).toBe(2);
        expect(result.pushed).toBe(2);
        expect(mutationCount).toBe(2);
        expect(fixture.frontmatter.get(anime.path)?.status).toBe('completed');
        expect(fixture.frontmatter.get(manga.path)?.chapter_current).toBe(12);
    });
});
