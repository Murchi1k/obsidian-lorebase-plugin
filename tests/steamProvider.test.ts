import { describe, expect, it, vi } from 'vitest';
import { getSteamDetails, getSteamDlcForGame, searchSteam } from '../src/services/integrations/providers/steam';
import type { JsonFetcher } from '../src/services/integrations/providers/common';
import { getSteamGridDbPoster } from '../src/services/integrations/providers/steamgriddb';

function steamSearchHtml(items: Array<{ id: number; name: string; released?: string }>): string {
    return items.map((item) => `
<a data-ds-appid="${item.id}" href="https://store.steampowered.com/app/${item.id}/">
  <span class="title">${item.name}</span>
  <div class="col search_released responsive_secondrow">${item.released ?? ''}</div>
</a>`).join('');
}

function createSteamSearchFetcher(): { fetchJson: JsonFetcher; calls: string[] } {
    const calls: string[] = [];
    const fetchJson: JsonFetcher = async (url) => {
        calls.push(url);
        if (url.includes('/search/results/')) {
            return {
                total_count: 50,
                results_html: steamSearchHtml([
                    { id: 10, name: 'Base Game', released: 'Jan 1, 2020' },
                    { id: 20, name: 'Base Game - Soundtrack', released: 'Jan 2, 2020' },
                    { id: 40, name: 'Base Game REDkit', released: 'Jan 4, 2020' },
                ]),
            };
        }
        if (url.includes('/api/appdetails')) {
            const id = new URL(url).searchParams.get('appids') ?? '';
            return {
                [id]: {
                    success: true,
                    data: id === '20'
                        ? { type: 'music', fullgame: { appid: '10', name: 'Base Game' } }
                        : { type: 'game' },
                },
            };
        }
        return {};
    };

    return { fetchJson, calls };
}

describe('Steam provider', () => {
    it('reads game details keyed by an edition ID using the payload app ID', async () => {
        const fetchJson: JsonFetcher = async () => ({
            2441600: { success: true, data: {
                steam_appid: 1091500, name: 'Cyberpunk 2077',
                short_description: 'An open-world RPG.',
                genres: [{ description: 'RPG' }],
                platforms: { windows: true, mac: false },
                developers: ['CD PROJEKT RED'], publishers: ['CD PROJEKT RED'],
                release_date: { date: 'Dec 10, 2020' }, header_image: 'https://example.com/header.jpg',
            } },
        });
        const details = await getSteamDetails(fetchJson, '1091500');
        expect(details).toMatchObject({
            name: 'Cyberpunk 2077', description: 'An open-world RPG.',
            genres: ['RPG'], platforms: ['windows'], developers: ['CD PROJEKT RED'],
            publishers: ['CD PROJEKT RED'], released: 'Dec 10, 2020', year: '2020',
            posterHorizontal: 'https://example.com/header.jpg',
            url: 'https://store.steampowered.com/app/1091500/',
        });
    });

    it('does not use another game or an unsuccessful payload as fallback details', async () => {
        for (const data of [
            { 2441600: { success: true, data: { steam_appid: 2441600, name: 'Other Game' } } },
            { 2441600: { success: false, data: { steam_appid: 1091500, name: 'Cyberpunk 2077' } } },
        ]) {
            expect(await getSteamDetails(async () => data, '1091500')).toBeNull();
        }
    });

    it('reads DLC lists and DLC details keyed by edition IDs', async () => {
        const fetchJson: JsonFetcher = async (url) => {
            const id = new URL(url).searchParams.get('appids');
            return id === '99300'
                ? { 99400: { success: true, data: { steam_appid: 99300, dlc: [99301] } } }
                : { 99401: { success: true, data: { steam_appid: 99301, name: 'Expansion', header_image: 'header.jpg' } } };
        };
        const dlc = await getSteamDlcForGame(fetchJson, '99300');
        expect(dlc).toHaveLength(1);
        expect(dlc[0]).toMatchObject({ id: '99301', title: 'Expansion' });
    });

    it('reuses existing DLC metadata instead of refetching every DLC', async () => {
        const calls: string[] = [];
        const fetchJson: JsonFetcher = async (url) => {
            calls.push(url);
            return {
                99100: {
                    success: true,
                    data: { dlc: [99101, 99102] },
                },
            };
        };

        const result = await getSteamDlcForGame(fetchJson, '99100', {
            existing: [
                { id: '99101', provider: 'steam', title: 'Known One', imageUrl: 'one.jpg', url: '', userRating: 4 },
                { id: '99102', provider: 'steam', title: 'Known Two', imageUrl: 'two.jpg', url: '', userRating: null },
            ],
        });

        expect(result.map((entry) => entry.title)).toEqual(['Known One', 'Known Two']);
        expect(calls).toHaveLength(1);
    });

    it('limits new Steam DLC detail requests to four at a time', async () => {
        const parentId = '99200';
        const dlcIds = Array.from({ length: 12 }, (_, index) => 99201 + index);
        let active = 0;
        let maxActive = 0;
        const fetchJson: JsonFetcher = async (url) => {
            const id = new URL(url).searchParams.get('appids') ?? '';
            if (id === parentId) {
                return { [parentId]: { success: true, data: { dlc: dlcIds } } };
            }

            active++;
            maxActive = Math.max(maxActive, active);
            await new Promise((resolve) => setTimeout(resolve, 5));
            active--;
            return {
                [id]: {
                    success: true,
                    data: { name: `DLC ${id}`, header_image: `${id}.jpg` },
                },
            };
        };

        const result = await getSteamDlcForGame(fetchJson, parentId);

        expect(maxActive).toBe(4);
        expect(result.map((entry) => entry.id)).toEqual(dlcIds.map(String));
    });

    it('silently treats a SteamGridDB HTTP 404 as a missing poster', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const fetchJson: JsonFetcher = async () => {
            throw new Error('Steam request failed (HTTP 404).');
        };

        try {
            await expect(getSteamGridDbPoster(fetchJson, '3512480', {
                enabled: true,
                apiKey: 'sgdb-key',
            })).resolves.toBe('');
            expect(warn).not.toHaveBeenCalled();
        } finally {
            warn.mockRestore();
        }
    });

    it('filters DLC from Steam search results by default', async () => {
        const { fetchJson, calls } = createSteamSearchFetcher();

        const results = await searchSteam(fetchJson, 'base game');

        expect(results.map((result) => result.title)).toEqual(['Base Game']);
        expect(calls.filter((url) => url.includes('/api/appdetails'))).toHaveLength(0);
    });

    it('keeps DLC in Steam search results when requested', async () => {
        const { fetchJson, calls } = createSteamSearchFetcher();

        const results = await searchSteam(fetchJson, 'base game', { includeDlc: true });

        expect(results.map((result) => result.title)).toEqual([
            'Base Game',
            'Base Game - Soundtrack',
            'Base Game REDkit',
        ]);
        expect(calls.some((url) => url.includes('/api/appdetails'))).toBe(false);
    });

    it('keeps Steam 600x900 preview URLs when SteamGridDB is disabled', async () => {
        const { fetchJson } = createSteamSearchFetcher();

        const results = await searchSteam(fetchJson, 'base game');

        expect(results[0]?.image).toBe(
            'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/10/library_600x900.jpg'
        );
    });

    it('falls back to the Steam 600x900 preview when SteamGridDB has no grid', async () => {
        const fetchJson: JsonFetcher = async (url) => {
            if (url.includes('/search/results/')) {
                return {
                    total_count: 1,
                    results_html: steamSearchHtml([{ id: 10, name: 'Base Game' }]),
                };
            }
            if (url.includes('/api/v2/grids/steam/10')) return { data: [] };
            return {};
        };

        const results = await searchSteam(fetchJson, 'base game', {
            steamGridDb: { enabled: true, apiKey: 'sgdb-key' },
        });

        expect(results[0]?.image).toBe(
            'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/10/library_600x900.jpg'
        );
    });

    it('passes Steam search pagination through the web search endpoint', async () => {
        const { fetchJson, calls } = createSteamSearchFetcher();

        await searchSteam(fetchJson, 'base game', { page: 2, pageSize: 10 });

        const searchUrl = calls.find((url) => url.includes('/search/results/'));
        expect(searchUrl).toBeTruthy();
        expect(new URL(searchUrl!).searchParams.get('page')).toBe('2');
    });

    it('uses SteamGridDB 600x900 posters when configured', async () => {
        const calls: Array<{ url: string; headers?: Record<string, string> }> = [];
        const fetchJson: JsonFetcher = async (url, headers) => {
            calls.push({ url, headers });
            if (url.includes('/search/results/')) {
                return {
                    total_count: 1,
                    results_html: steamSearchHtml([{ id: 10, name: 'Base Game', released: 'Jan 1, 2020' }]),
                };
            }
            if (url.includes('/api/appdetails')) {
                return { 10: { success: true, data: { type: 'game' } } };
            }
            if (url.includes('steamgriddb.com/api/v2/grids/steam/10')) {
                return {
                    data: [
                        { url: 'https://cdn.example.com/base-game-grid.jpg', width: 600, height: 900 },
                    ],
                };
            }
            return {};
        };

        const results = await searchSteam(fetchJson, 'base game', {
            steamGridDb: { enabled: true, apiKey: 'sgdb-key' },
            imageExists: async () => false,
        });

        expect(results[0]?.image).toBe('https://cdn.example.com/base-game-grid.jpg');
        expect(calls.some((call) => call.headers?.Authorization === 'Bearer sgdb-key')).toBe(true);
    });

    it('uses SteamGridDB when Steam search has no validated vertical artwork', async () => {
        const calls: string[] = [];
        const fetchJson: JsonFetcher = async (url) => {
            calls.push(url);
            if (url.includes('/search/results/')) {
                return {
                    total_count: 1,
                    results_html: steamSearchHtml([{ id: 243470, name: 'Watch Dogs', released: 'May 27, 2014' }]),
                };
            }
            if (url.includes('/api/v2/grids/steam/243470')) {
                return {
                    data: [
                        { url: 'https://cdn.example.com/watch-dogs-grid.jpg', width: 600, height: 900 },
                    ],
                };
            }
            return {};
        };

        const results = await searchSteam(fetchJson, 'Watch Dogs', {
            steamGridDb: { enabled: true, apiKey: 'sgdb-key' },
        });

        expect(results[0]?.image).toBe('https://cdn.example.com/watch-dogs-grid.jpg');
        expect(calls.some((url) => url.includes('/api/v2/grids/steam/243470'))).toBe(true);
    });

    it('does not replace an existing Steam vertical poster with SteamGridDB search fallback', async () => {
        let steamGridDbCalls = 0;
        const fetchJson: JsonFetcher = async (url) => {
            if (url.includes('/search/results/')) {
                return {
                    total_count: 1,
                    results_html: steamSearchHtml([{ id: 10, name: 'Base Game', released: 'Jan 1, 2020' }]),
                };
            }
            if (url.includes('/api/appdetails')) {
                return { 10: { success: true, data: { type: 'game' } } };
            }
            if (url.includes('steamgriddb.com/api/v2/grids/steam/10')) {
                steamGridDbCalls++;
                return {
                    data: [
                        { url: 'https://cdn.example.com/top-grid.jpg', width: 600, height: 900 },
                    ],
                };
            }
            return {};
        };

        const results = await searchSteam(fetchJson, 'base game', {
            steamGridDb: { enabled: true, apiKey: 'sgdb-key' },
            imageExists: async (url) => url.endsWith('/library_600x900.jpg'),
        });

        expect(results[0]?.image).toBe('https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/10/library_600x900.jpg');
        expect(steamGridDbCalls).toBe(0);
    });

    it('uses SteamGridDB poster in Steam details when configured', async () => {
        const fetchJson: JsonFetcher = async (url) => {
            if (url.includes('steamgriddb.com/api/v2/grids/steam/10')) {
                return {
                    data: [
                        { url: 'https://cdn.example.com/detail-grid.jpg', width: 600, height: 900 },
                    ],
                };
            }
            return {
                10: {
                    success: true,
                    data: {
                        name: 'Base Game',
                        type: 'game',
                        short_description: 'Description',
                        release_date: { date: 'Jan 1, 2020' },
                    },
                },
            };
        };

        const details = await getSteamDetails(fetchJson, '10', {
            steamGridDb: { enabled: true, apiKey: 'sgdb-key' },
        });

        expect(details?.poster).toBe('https://cdn.example.com/detail-grid.jpg');
    });

    it('prefers an existing Steam vertical poster over SteamGridDB details fallback', async () => {
        const fetchJson: JsonFetcher = async (url) => {
            if (url.includes('steamgriddb.com/api/v2/grids/steam/10')) {
                return {
                    data: [
                        { url: 'https://cdn.example.com/top-grid.jpg', width: 600, height: 900 },
                    ],
                };
            }
            return {
                10: {
                    success: true,
                    data: {
                        name: 'Base Game',
                        type: 'game',
                        short_description: 'Description',
                        release_date: { date: 'Jan 1, 2020' },
                    },
                },
            };
        };

        const details = await getSteamDetails(fetchJson, '10', {
            steamGridDb: { enabled: true, apiKey: 'sgdb-key' },
            imageExists: async (url) => url.endsWith('/library_600x900.jpg'),
        });

        expect(details?.poster).toBe('https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/10/library_600x900.jpg');
    });

    it('does not use header_image as a vertical poster when poster candidates fail', async () => {
        const fetchJson: JsonFetcher = async () => ({
            10: {
                success: true,
                data: {
                    name: 'Base Game',
                    type: 'game',
                    short_description: 'Description',
                    header_image: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/10/abc123/header.jpg',
                    release_date: { date: 'Jan 1, 2020' },
                },
            },
        });

        const details = await getSteamDetails(fetchJson, '10', {
            imageExists: async () => false,
        });

        expect(details?.poster).toBe('');
        expect(details?.posterHorizontal).toBe('https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/10/abc123/header.jpg');
    });

    it('returns empty poster when vertical poster candidates fail', async () => {
        const fetchJson: JsonFetcher = async () => ({
            10: {
                success: true,
                data: {
                    name: 'Base Game',
                    type: 'game',
                    short_description: 'Description',
                    release_date: { date: 'Jan 1, 2020' },
                },
            },
        });

        const details = await getSteamDetails(fetchJson, '10', {
            imageExists: async () => false,
        });

        expect(details?.poster).toBe('');
    });

    it('uses generated Steam poster URLs only after URL validation succeeds', async () => {
        const fetchJson: JsonFetcher = async () => ({
            10: {
                success: true,
                data: {
                    name: 'Base Game',
                    type: 'game',
                    short_description: 'Description',
                    release_date: { date: 'Jan 1, 2020' },
                },
            },
        });

        const details = await getSteamDetails(fetchJson, '10', {
            imageExists: async (url) => url.includes('shared.akamai.steamstatic.com'),
        });

        expect(details?.poster).toBe('https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/10/library_600x900.jpg');
    });
});
