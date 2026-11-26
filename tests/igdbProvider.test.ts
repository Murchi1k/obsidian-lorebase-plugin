import { describe, expect, it } from 'vitest';
import { getIgdbDetails, getIgdbDlcForGame, searchIgdb } from '../src/services/integrations/providers/igdb';
import type { JsonFetcher } from '../src/services/integrations/providers/common';

describe('IGDB provider', () => {
    it('includes editions for PSN matching while normal searches keep the main-game filter', async () => {
        const queries: string[] = [];
        const fetchJson: JsonFetcher = async (url, _headers, _method, body) => {
            if (url.includes('oauth2/token')) return { access_token: 'token' };
            queries.push(body || ''); return [];
        };
        await searchIgdb(fetchJson, 'Far Cry 3 Classic Edition', 'client', 'secret', { includeVersions: true });
        await searchIgdb(fetchJson, 'Far Cry 3 Classic Edition', 'client', 'secret');
        expect(queries[0]).not.toContain('version_parent = null');
        expect(queries[1]).toContain('version_parent = null');
    });
    it('authenticates with Twitch and maps paged search results', async () => {
        const calls: Array<{ url: string; headers?: Record<string, string>; method?: string; body?: string }> = [];
        const fetchJson: JsonFetcher = async (url, headers, method, body) => {
            calls.push({ url, headers, method, body });
            if (url.includes('oauth2/token')) return { access_token: 'token-123' };
            return [
                { id: 1, name: 'Portal', first_release_date: 1193356800, cover: { image_id: 'portal' } },
                { id: 2, name: 'Portal 2', first_release_date: 1303430400, cover: { image_id: 'portal-2' } },
                { id: 3, name: 'Extra page item' },
            ];
        };

        const results = await searchIgdb(fetchJson, 'Portal "Test"', 'client-id', 'client-secret', { page: 2, pageSize: 2 });

        expect(calls).toHaveLength(2);
        expect(calls[0]).toMatchObject({ method: 'POST' });
        expect(calls[0].body).toContain('client_id=client-id');
        expect(calls[0].body).toContain('client_secret=client-secret');
        expect(calls[1].headers).toMatchObject({
            Authorization: 'Bearer token-123',
            'Client-ID': 'client-id',
        });
        expect(calls[1].body).toContain('search "Portal \\"Test\\"";');
        expect(calls[1].body).toContain('limit 3;');
        expect(calls[1].body).toContain('offset 2;');
        expect(results).toHaveLength(2);
        expect(results[0]).toMatchObject({
            id: '1',
            title: 'Portal',
            provider: 'igdb',
            year: '2007',
            image: 'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/portal.jpg',
        });
        expect((results as typeof results & { hasNext?: boolean }).hasNext).toBe(true);
    });

    it('maps details, companies, ratings, and image variants', async () => {
        const fetchJson: JsonFetcher = async (url, _headers, _method, body) => {
            if (url.includes('oauth2/token')) return { access_token: 'token' };
            expect(body).toContain('company.name,url,slug;');
            return [{
                id: 1,
                name: 'Portal',
                url: 'https://www.igdb.com/games/portal',
                summary: '<b>Puzzle</b> game.',
                first_release_date: 1193356800,
                total_rating: 90.5,
                total_rating_count: 12345,
                aggregated_rating: 88,
                cover: { image_id: 'cover-id' },
                screenshots: [{ image_id: 'screen-id' }],
                genres: [{ name: 'Puzzle' }],
                platforms: [{ name: 'PC' }],
                involved_companies: [
                    { developer: true, company: { name: 'Valve' } },
                    { publisher: true, company: { name: 'Electronic Arts' } },
                ],
                websites: [{ url: 'https://discord.gg/portal' }],
            }];
        };

        const details = await getIgdbDetails(fetchJson, '1', 'client', 'secret');

        expect(details).toMatchObject({
            kind: 'game',
            name: 'Portal',
            description: 'Puzzle game.',
            poster: 'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/cover-id.jpg',
            posterHorizontal: 'https://images.igdb.com/igdb/image/upload/t_screenshot_huge/screen-id.jpg',
            genres: ['Puzzle'],
            platforms: ['PC'],
            developers: ['Valve'],
            publishers: ['Electronic Arts'],
            communityRating: '90.5',
            communityVotes: '12345',
            metacritic: '88',
            released: '2007-10-26',
            url: 'https://www.igdb.com/games/portal',
        });
    });

    it('combines and deduplicates DLC and expansion records', async () => {
        const fetchJson: JsonFetcher = async (url) => {
            if (url.includes('oauth2/token')) return { access_token: 'token' };
            return [{
                dlcs: [
                    { id: 10, name: 'Episode One', slug: 'episode-one', cover: { image_id: 'ep1' } },
                ],
                expansions: [
                    { id: 10, name: 'Duplicate Episode One' },
                    { id: 11, name: 'Episode Two', websites: [{ url: 'https://example.com/ep2' }] },
                ],
            }];
        };

        const dlc = await getIgdbDlcForGame(fetchJson, '1', 'client', 'secret');

        expect(dlc).toHaveLength(2);
        expect(dlc[0]).toMatchObject({ id: '10', provider: 'igdb', title: 'Episode One', url: 'https://www.igdb.com/games/episode-one' });
        expect(dlc[1]).toMatchObject({ id: '11', url: null });
    });
});
