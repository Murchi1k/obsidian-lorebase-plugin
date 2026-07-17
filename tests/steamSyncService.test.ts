import { beforeEach, describe, expect, it } from 'vitest';
import { TFile, TFolder, __setRequestUrlMock } from './mocks/obsidian';
import { DEFAULT_SETTINGS } from '../src/constants';
import { SteamSyncService } from '../src/services/SteamSyncService';
import { MetadataService } from '../src/services/MetadataService';
import type { LorebaseSettings } from '../src/types';

type CacheEntry = { frontmatter: Record<string, unknown> };
type MockApp = {
    metadataCache: {
        getFileCache(file: TFile): CacheEntry | null;
    };
    vault: {
        getFiles(): TFile[];
        getAbstractFileByPath(path: string): TFile | TFolder | null;
        create(path: string, content: string): Promise<TFile>;
        createFolder(path: string): Promise<void>;
        created: Record<string, string>;
    };
    fileManager: {
        processFrontMatter(file: TFile, callback: (frontmatter: Record<string, unknown>) => void): Promise<void>;
    };
};

const TEST_STEAM_ID64 = '76561198445048905';
const STEAM_PROFILE_URL = 'https://steamcommunity.com/id/MURcHIIK/';

function mockVanityResolution(url: string): { json: unknown; text: string } | null {
    if (!url.includes('steamcommunity.com/id/MURcHIIK')) return null;
    return {
        json: {},
        text: `<profile><steamID64>${TEST_STEAM_ID64}</steamID64></profile>`,
    };
}

function cloneSettings(): LorebaseSettings {
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as LorebaseSettings;
}

function createFile(path: string): TFile {
    const name = path.split('/').pop() ?? path;
    const basename = name.replace(/\.md$/, '');
    const file = new TFile(path, basename);
    file.path = path;
    file.name = name;
    file.basename = basename;
    file.extension = 'md';
    return file;
}

function createMockApp(initialFiles: Array<{ path: string; frontmatter: Record<string, unknown> }> = []): MockApp {
    const files = initialFiles.map((entry) => createFile(entry.path));
    const cache = new Map<string, CacheEntry>();
    initialFiles.forEach((entry) => {
        cache.set(entry.path, { frontmatter: { ...entry.frontmatter } });
    });
    const folders = new Set<string>(['Games']);
    const created: Record<string, string> = {};

    return {
        metadataCache: {
            getFileCache(file: TFile): CacheEntry | null {
                return cache.get(file.path) ?? null;
            },
        },
        vault: {
            getFiles(): TFile[] {
                return files;
            },
            getAbstractFileByPath(path: string): TFile | TFolder | null {
                const file = files.find((entry) => entry.path === path);
                if (file) return file;
                if (folders.has(path)) return new TFolder(path);
                return null;
            },
            async create(path: string, content: string): Promise<TFile> {
                const file = createFile(path);
                files.push(file);
                created[path] = content;
                cache.set(path, { frontmatter: {} });
                return file;
            },
            async createFolder(path: string): Promise<void> {
                folders.add(path);
            },
            created,
        },
        fileManager: {
            async processFrontMatter(file: TFile, callback: (frontmatter: Record<string, unknown>) => void): Promise<void> {
                let entry = cache.get(file.path);
                if (!entry) {
                    entry = { frontmatter: {} };
                    cache.set(file.path, entry);
                }
                callback(entry.frontmatter);
            },
        },
    };
}

function createSteamSyncService(app: MockApp = createMockApp()): SteamSyncService {
    const appForService = app as unknown as never;
    return new SteamSyncService(appForService, new MetadataService(appForService));
}

function mockSteamResponses(apps: Array<{ appid: number; name: string; playtime_forever?: number }>, wishlist: Record<string, unknown> = {}): void {
    __setRequestUrlMock((options) => {
        const url = typeof options === 'string' ? options : options.url;
        const vanity = mockVanityResolution(url);
        if (vanity) return vanity;
        if (url.includes('GetOwnedGames')) {
            return {
                json: {
                    response: {
                        games: apps,
                    },
                },
            };
        }
        if (url.includes('wishlistdata')) {
            return { json: wishlist };
        }
        if (url.includes('appdetails')) {
            const appid = new URL(url).searchParams.get('appids') ?? '';
            const app = apps.find((entry) => String(entry.appid) === appid);
            return {
                json: {
                    [appid]: {
                        success: true,
                        data: {
                            name: app?.name ?? `App ${appid}`,
                            short_description: `Description ${appid}`,
                            genres: [{ description: 'RPG' }],
                            platforms: { windows: true, mac: false, linux: true },
                            developers: ['Dev'],
                            publishers: ['Pub'],
                            release_date: { date: 'Jan 1, 2020' },
                            header_image: `https://cdn.example/${appid}.jpg`,
                        },
                    },
                },
            };
        }
        return { json: {} };
    });
}

function mockSteamResponsesWithWishlistHtml(apps: Array<{ appid: number; name: string; playtime_forever?: number }>): void {
    __setRequestUrlMock((options) => {
        const url = typeof options === 'string' ? options : options.url;
        const vanity = mockVanityResolution(url);
        if (vanity) return vanity;
        if (url.includes('GetOwnedGames')) {
            return {
                json: {
                    response: {
                        games: apps,
                    },
                },
            };
        }
        if (url.includes('wishlistdata')) {
            const response = { text: '<!DOCTYPE html><html></html>' } as { json: unknown; text: string };
            Object.defineProperty(response, 'json', {
                get() {
                    throw new SyntaxError('Unexpected token <');
                },
            });
            return response;
        }
        if (url.includes('/wishlist/profiles/')) {
            return {
                json: {},
                text: 'g_rgWishlistData = [{"appid":30,"name":"Wish One"},{"appid":40,"name":"Wish Two"}];',
            };
        }
        if (url.includes('appdetails')) {
            const appid = new URL(url).searchParams.get('appids') ?? '';
            const app = apps.find((entry) => String(entry.appid) === appid);
            return {
                json: {
                    [appid]: {
                        success: true,
                        data: {
                            name: app?.name ?? `App ${appid}`,
                            short_description: `Description ${appid}`,
                            genres: [{ description: 'RPG' }],
                            platforms: { windows: true },
                            developers: ['Dev'],
                            publishers: ['Pub'],
                            release_date: { date: 'Jan 1, 2020' },
                        },
                    },
                },
            };
        }
        return { json: {} };
    });
}

function mockWishlistPages(): void {
    __setRequestUrlMock((options) => {
        const url = typeof options === 'string' ? options : options.url;
        const vanity = mockVanityResolution(url);
        if (vanity) return vanity;
        if (url.includes('p=0')) {
            return {
                json: {
                    10: { name: 'First Wish' },
                    20: { name: 'Second Wish' },
                },
            };
        }
        if (url.includes('p=1')) {
            return {
                json: {
                    30: { name: 'Third Wish' },
                },
            };
        }
        return { json: {} };
    });
}

function mockWishlistRateLimit(apps: Array<{ appid: number; name: string; playtime_forever?: number }>): void {
    __setRequestUrlMock((options) => {
        const url = typeof options === 'string' ? options : options.url;
        const vanity = mockVanityResolution(url);
        if (vanity) return vanity;
        if (url.includes('GetOwnedGames')) {
            return {
                json: {
                    response: {
                        games: apps,
                    },
                },
            };
        }
        if (url.includes('wishlist')) {
            throw new Error('Request failed, status 429');
        }
        return { json: {} };
    });
}

function mockOfficialWishlist(): void {
    __setRequestUrlMock((options) => {
        const url = typeof options === 'string' ? options : options.url;
        const vanity = mockVanityResolution(url);
        if (vanity) return vanity;
        if (url.includes('IWishlistService/GetWishlist')) {
            return {
                json: {
                    response: {
                        items: [
                            { appid: 219990 },
                            { appid: 335300 },
                        ],
                    },
                },
            };
        }
        return { json: {} };
    });
}

function mockOfficialWishlistWithDetails(): void {
    __setRequestUrlMock((options) => {
        const url = typeof options === 'string' ? options : options.url;
        const vanity = mockVanityResolution(url);
        if (vanity) return vanity;
        if (url.includes('IWishlistService/GetWishlist')) {
            return {
                json: {
                    response: {
                        items: [
                            { appid: 1030300 },
                        ],
                    },
                },
            };
        }
        if (url.includes('appdetails')) {
            return {
                json: {
                    1030300: {
                        success: true,
                        data: {
                            name: 'Hollow Knight: Silksong',
                            short_description: 'Adventure',
                            genres: [],
                            platforms: { windows: true },
                            developers: [],
                            publishers: [],
                            release_date: { date: 'Sep 4, 2025' },
                        },
                    },
                },
            };
        }
        return { json: {} };
    });
}

function mockOwnedUnauthorizedWithWishlist(): void {
    __setRequestUrlMock((options) => {
        const url = typeof options === 'string' ? options : options.url;
        const vanity = mockVanityResolution(url);
        if (vanity) return vanity;
        if (url.includes('GetOwnedGames')) {
            throw new Error('Request failed, status 401');
        }
        if (url.includes('IWishlistService/GetWishlist')) {
            return {
                json: {
                    response: {
                        items: [
                            { appid: 1030300 },
                        ],
                    },
                },
            };
        }
        if (url.includes('appdetails')) {
            return {
                json: {
                    1030300: {
                        success: true,
                        data: {
                            name: 'Hollow Knight: Silksong',
                            short_description: 'Adventure',
                            genres: [],
                            platforms: { windows: true },
                            developers: [],
                            publishers: [],
                            release_date: { date: 'Sep 4, 2025' },
                        },
                    },
                },
            };
        }
        return { json: {} };
    });
}

function mockVanityProfileWithWishlist(): void {
    __setRequestUrlMock((options) => {
        const url = typeof options === 'string' ? options : options.url;
        const vanity = mockVanityResolution(url);
        if (vanity) return vanity;
        if (url.includes('IWishlistService/GetWishlist')) {
            expect(url).toContain(`steamid=${TEST_STEAM_ID64}`);
            return {
                json: {
                    response: {
                        items: [
                            { appid: 1030300 },
                        ],
                    },
                },
            };
        }
        if (url.includes('appdetails')) {
            return {
                json: {
                    1030300: {
                        success: true,
                        data: {
                            name: 'Hollow Knight: Silksong',
                            short_description: 'Adventure',
                            genres: [],
                            platforms: { windows: true },
                            developers: [],
                            publishers: [],
                            release_date: { date: 'Sep 4, 2025' },
                        },
                    },
                },
            };
        }
        return { json: {} };
    });
}

describe('SteamSyncService', () => {
    beforeEach(() => {
        __setRequestUrlMock(null);
    });

    it('maps Steam playtime and wishlist statuses', () => {
        const service = createSteamSyncService();
        const settings = cloneSettings().steamSync;

        expect(service.mapOwnedStatus(25, settings)).toBe('not_started');
        expect(service.mapOwnedStatus(0, settings)).toBe('not_started');
        expect(service.mapWishlistStatus(settings)).toBe('wishlist');
    });

    it('loads owned games with playtime in minutes', async () => {
        mockSteamResponses([{ appid: 10, name: 'Portal', playtime_forever: 123 }]);
        const service = createSteamSyncService();

        const games = await service.getOwnedGames(STEAM_PROFILE_URL);

        expect(games).toEqual([
            {
                appId: 10,
                name: 'Portal',
                playtimeForever: 123,
                iconUrl: '',
            },
        ]);
    });

    it('creates a new markdown note through the game template', async () => {
        mockSteamResponses([{ appid: 10, name: 'Portal', playtime_forever: 123 }]);
        const app = createMockApp();
        const settings = cloneSettings();
        settings.steamSync.steamId = STEAM_PROFILE_URL;
        settings.steamSync.importWishlist = false;

        const service = createSteamSyncService(app);
        const result = await service.sync(settings);

        expect(result).toEqual({ created: 1, updated: 0, skipped: 0, failed: 0 });
        const content = app.vault.created['Games/Portal.md'];
        expect(content).toContain('poster: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/10/library_600x900.jpg"');
        expect(content).toContain('status: "not_started"');
        expect(content).toContain('steamAppId: 10');
        expect(content).toContain('playtime: 123');
    });

    it('fills HowLongToBeat fields during Steam import when enabled', async () => {
        __setRequestUrlMock((options) => {
            const url = typeof options === 'string' ? options : options.url;
            const vanity = mockVanityResolution(url);
            if (vanity) return vanity;
            if (url.includes('GetOwnedGames')) {
                return {
                    json: {
                        response: {
                            games: [{ appid: 10, name: 'Portal', playtime_forever: 123 }],
                        },
                    },
                };
            }
            if (url.includes('appdetails')) {
                return {
                    json: {
                        10: {
                            success: true,
                            data: {
                                name: 'Portal',
                                short_description: 'Description 10',
                                genres: [{ description: 'Puzzle' }],
                                platforms: { windows: true },
                                developers: ['Valve'],
                                publishers: ['Valve'],
                                release_date: { date: 'Oct 10, 2007' },
                            },
                        },
                    },
                };
            }
            if (url.includes('/api/bleed/init')) {
                return { json: { token: 'token-1', hpKey: 'ign_test', hpVal: 'hp-value' } };
            }
            if (url === 'https://howlongtobeat.com/api/bleed') {
                expect(typeof options === 'string' ? undefined : options.headers?.['x-auth-token']).toBe('token-1');
                return {
                    json: {
                        data: [
                            {
                                game_name: 'Portal',
                                release_world: 2007,
                                comp_main: 10800,
                                comp_plus: 18000,
                                comp_100: 36000,
                            },
                        ],
                    },
                };
            }
            return { json: {} };
        });
        const app = createMockApp();
        const settings = cloneSettings();
        settings.steamSync.steamId = STEAM_PROFILE_URL;
        settings.steamSync.importWishlist = false;
        settings.integrations!.media.games.howLongToBeatEnabled = true;

        const service = createSteamSyncService(app);
        const result = await service.sync(settings);
        const content = app.vault.created['Games/Portal.md'];

        expect(result).toEqual({ created: 1, updated: 0, skipped: 0, failed: 0 });
        expect(content).toContain('main: "3 Hours"');
        expect(content).toContain('main_plus_sides: "5 Hours"');
        expect(content).toContain('perfectionist: "10 Hours"');
    });

    it('skips duplicates in skip mode', async () => {
        mockSteamResponses([{ appid: 10, name: 'Portal', playtime_forever: 123 }]);
        const app = createMockApp([{ path: 'Games/Portal.md', frontmatter: { steamAppId: 10, playtime: 1 } }]);
        const settings = cloneSettings();
        settings.steamSync.steamId = STEAM_PROFILE_URL;
        settings.steamSync.importWishlist = false;
        settings.steamSync.duplicateMode = 'skip';

        const service = createSteamSyncService(app);
        const result = await service.sync(settings);

        expect(result).toEqual({ created: 0, updated: 0, skipped: 1, failed: 0 });
        expect(app.metadataCache.getFileCache(app.vault.getFiles()[0])?.frontmatter.playtime).toBe(1);
    });

    it('updates only Steam fields for duplicates in update mode', async () => {
        mockSteamResponses([{ appid: 10, name: 'Portal', playtime_forever: 123 }]);
        const app = createMockApp([
            {
                path: 'Games/Portal.md',
                frontmatter: {
                    steamAppId: 10,
                    playtime: 1,
                    status: 'completed',
                    userRating: 5,
                    favorite: true,
                },
            },
        ]);
        const settings = cloneSettings();
        settings.steamSync.steamId = STEAM_PROFILE_URL;
        settings.steamSync.importWishlist = false;
        settings.steamSync.duplicateMode = 'update';

        const service = createSteamSyncService(app);
        const result = await service.sync(settings);
        const frontmatter = app.metadataCache.getFileCache(app.vault.getFiles()[0])?.frontmatter;

        expect(result).toEqual({ created: 0, updated: 1, skipped: 0, failed: 0 });
        expect(frontmatter?.playtime).toBe(123);
        expect(frontmatter?.genres).toEqual(['RPG']);
        expect(frontmatter?.released).toBe('Jan 1, 2020');
        expect(frontmatter?.status).toBe('completed');
        expect(frontmatter?.userRating).toBe(5);
        expect(frontmatter?.favorite).toBe(true);
    });

    it('uses one summary decision for ask duplicates', async () => {
        mockSteamResponses([
            { appid: 10, name: 'Portal', playtime_forever: 123 },
            { appid: 20, name: 'Half Life', playtime_forever: 55 },
        ]);
        const app = createMockApp([
            { path: 'Games/Portal.md', frontmatter: { steamAppId: 10, playtime: 1 } },
            { path: 'Games/Half Life.md', frontmatter: { steamAppId: 20, playtime: 2 } },
        ]);
        const settings = cloneSettings();
        settings.steamSync.steamId = STEAM_PROFILE_URL;
        settings.steamSync.importWishlist = false;
        settings.steamSync.duplicateMode = 'ask';

        let askedCount = 0;
        const service = createSteamSyncService(app);
        const result = await service.sync(settings, {
            confirmDuplicateUpdate: async (count) => {
                askedCount = count;
                return true;
            },
        });

        expect(askedCount).toBe(2);
        expect(result).toEqual({ created: 0, updated: 2, skipped: 0, failed: 0 });
        expect(app.metadataCache.getFileCache(app.vault.getFiles()[0])?.frontmatter.playtime).toBe(123);
        expect(app.metadataCache.getFileCache(app.vault.getFiles()[1])?.frontmatter.playtime).toBe(55);
    });

    it('continues library import when wishlist returns HTML', async () => {
        mockSteamResponsesWithWishlistHtml([{ appid: 10, name: 'Portal', playtime_forever: 123 }]);
        const app = createMockApp();
        const settings = cloneSettings();
        settings.steamSync.steamId = STEAM_PROFILE_URL;
        settings.steamSync.importOwnedGames = true;
        settings.steamSync.importWishlist = true;

        const service = createSteamSyncService(app);
        const wishlist = await service.getWishlist(settings.steamSync.steamId);
        const result = await service.sync(settings);

        expect(wishlist).toEqual([
            { appId: 30, name: 'Wish One' },
            { appId: 40, name: 'Wish Two' },
        ]);
        expect(result).toEqual({ created: 3, updated: 0, skipped: 0, failed: 0 });
        expect(app.vault.created['Games/Portal.md']).toContain('steamAppId: 10');
    });

    it('loads wishlist from multiple wishlistdata pages', async () => {
        mockWishlistPages();
        const service = createSteamSyncService();

        const wishlist = await service.getWishlist(STEAM_PROFILE_URL);

        expect(wishlist).toEqual([
            { appId: 10, name: 'First Wish' },
            { appId: 20, name: 'Second Wish' },
            { appId: 30, name: 'Third Wish' },
        ]);
    });

    it('does not fail connection test when wishlist is rate limited', async () => {
        mockWishlistRateLimit([{ appid: 10, name: 'Portal', playtime_forever: 123 }]);
        const settings = cloneSettings();
        settings.steamSync.steamId = STEAM_PROFILE_URL;
        settings.steamSync.importOwnedGames = true;
        settings.steamSync.importWishlist = true;
        const service = createSteamSyncService();

        await expect(service.testConnection(settings.steamSync)).resolves.toBe(1);
        await expect(service.getWishlist(settings.steamSync.steamId)).resolves.toEqual([]);
    });

    it('loads wishlist from IWishlistService before store wishlistdata fallback', async () => {
        mockOfficialWishlist();
        const service = createSteamSyncService();

        const wishlist = await service.getWishlist(STEAM_PROFILE_URL);

        expect(wishlist).toEqual([
            { appId: 219990, name: 'Steam App 219990' },
            { appId: 335300, name: 'Steam App 335300' },
        ]);
    });

    it('keeps preview import lightweight without appdetails enrichment', async () => {
        mockOfficialWishlistWithDetails();
        const settings = cloneSettings().steamSync;
        settings.steamId = STEAM_PROFILE_URL;
        settings.importOwnedGames = false;
        settings.importWishlist = true;
        const service = createSteamSyncService();

        const candidates = await service.previewImport(settings);

        expect(candidates).toEqual([
            {
                appId: 1030300,
                name: 'Steam App 1030300',
                playtimeForever: 0,
                posterHorizontal: 'https://cdn.akamai.steamstatic.com/steam/apps/1030300/header.jpg',
                source: 'wishlist',
            },
        ]);
    });

    it('skips owned games without api key when Steam returns 401 and keeps wishlist', async () => {
        mockOwnedUnauthorizedWithWishlist();
        const settings = cloneSettings().steamSync;
        settings.steamId = STEAM_PROFILE_URL;
        settings.apiKey = '';
        settings.importOwnedGames = true;
        settings.importWishlist = true;
        const service = createSteamSyncService();

        await expect(service.getOwnedGames(settings.steamId, settings.apiKey)).resolves.toEqual([]);
        expect(service.consumeWarnings()).toEqual([
            'Steam library requires an API Key for this profile. Wishlist can still be imported.',
        ]);
        await expect(service.previewImport(settings)).resolves.toEqual([
            {
                appId: 1030300,
                name: 'Steam App 1030300',
                playtimeForever: 0,
                posterHorizontal: 'https://cdn.akamai.steamstatic.com/steam/apps/1030300/header.jpg',
                source: 'wishlist',
            },
        ]);
        expect(service.consumeWarnings()).toEqual([
            'Steam library requires an API Key for this profile. Wishlist can still be imported.',
        ]);
    });

    it('accepts steamcommunity id URL and resolves it to SteamID64', async () => {
        mockVanityProfileWithWishlist();
        const settings = cloneSettings().steamSync;
        settings.steamId = 'https://steamcommunity.com/id/MURcHIIK/';
        settings.importOwnedGames = false;
        settings.importWishlist = true;
        const service = createSteamSyncService();

        const candidates = await service.previewImport(settings);

        expect(candidates).toEqual([
            {
                appId: 1030300,
                name: 'Steam App 1030300',
                playtimeForever: 0,
                posterHorizontal: 'https://cdn.akamai.steamstatic.com/steam/apps/1030300/header.jpg',
                source: 'wishlist',
            },
        ]);
    });

    it('accepts steamcommunity profiles URL directly', async () => {
        mockOfficialWishlist();
        const service = createSteamSyncService();

        const wishlist = await service.getWishlist(`https://steamcommunity.com/profiles/${TEST_STEAM_ID64}/`);

        expect(wishlist).toEqual([
            { appId: 219990, name: 'Steam App 219990' },
            { appId: 335300, name: 'Steam App 335300' },
        ]);
    });

    it('rejects raw SteamID64 values', async () => {
        const service = createSteamSyncService();

        await expect(service.getWishlist('00000000000000000')).rejects.toThrow(
            'Steam profile must be a steamcommunity.com/profiles URL or steamcommunity.com/id URL.'
        );
    });
});
