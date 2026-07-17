import { describe, expect, it } from 'vitest';
import { getSteamDetails, searchSteam } from '../src/services/integrations/providers/steam';
import type { JsonFetcher } from '../src/services/integrations/providers/common';

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
    it('filters DLC from Steam search results by default', async () => {
        const { fetchJson } = createSteamSearchFetcher();

        const results = await searchSteam(fetchJson, 'base game');

        expect(results.map((result) => result.title)).toEqual(['Base Game']);
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
        });

        expect(results[0]?.image).toBe('https://cdn.example.com/base-game-grid.jpg');
        expect(calls.some((call) => call.headers?.Authorization === 'Bearer sgdb-key')).toBe(true);
    });

    it('does not replace an existing Steam vertical poster with SteamGridDB search fallback', async () => {
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
