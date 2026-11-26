import { describe, expect, it, vi } from 'vitest';
import { extractHltbSearchPath, getHowLongToBeatTimes } from '../src/services/integrations/providers/howlongtobeat';

describe('HowLongToBeat provider', () => {
    it('uses the current find API token and honeypot headers', async () => {
        const calls: Array<{
            url: string;
            headers?: Record<string, string>;
            method?: 'GET' | 'POST';
            body?: string;
        }> = [];
        const fetchJson = async (
            url: string,
            headers?: Record<string, string>,
            method?: 'GET' | 'POST',
            body?: string
        ): Promise<unknown> => {
            calls.push({ url, headers, method, body });
            if (url.includes('/api/s/init')) {
                return { token: 'token-1', hpKey: 'ign_test', hpVal: 'hp-value' };
            }
            return {
                data: [
                    {
                        game_name: 'Portal',
                        release_world: 2007,
                        comp_main: 10800,
                        comp_plus: 18000,
                        comp_100: 36000,
                    },
                ],
            };
        };

        const result = await getHowLongToBeatTimes(fetchJson, 'Portal', '2007');
        const searchCall = calls[1];
        const payload = JSON.parse(searchCall.body ?? '{}') as Record<string, unknown>;

        expect(calls[0].url).toContain('/api/s/init');
        expect(searchCall.url).toBe('https://howlongtobeat.com/api/s');
        expect(searchCall.method).toBe('POST');
        expect(searchCall.headers?.['x-auth-token']).toBe('token-1');
        expect(searchCall.headers?.['x-hp-key']).toBe('ign_test');
        expect(searchCall.headers?.['x-hp-val']).toBe('hp-value');
        expect(payload.ign_test).toBe('hp-value');
        expect(result).toEqual({
            main: 3,
            main_plus_sides: 5,
            perfectionist: 10,
        });
    });

    it('discovers and caches the endpoint from same-origin application scripts', async () => {
        const text = vi.fn(async (url: string) => url.endsWith('/')
            ? '<script src="https://example.com/_next/static/chunks/foreign.js"></script><script src="/_next/static/chunks/app.js"></script>'
            : 'const payload={searchTerms:terms};fetch("/api/new/search",{method:"POST",body:JSON.stringify(payload)})');
        const json = vi.fn(async (url: string) => url.includes('/init?') ? { token: 'test' } : { data: [] });
        await getHowLongToBeatTimes(json, 'Portal', undefined, text);
        await getHowLongToBeatTimes(json, 'Half Life', undefined, text);
        expect(text).toHaveBeenCalledTimes(2);
        expect(json.mock.calls[0][0]).toContain('/api/new/search/init?');
        expect(json.mock.calls[1][0]).toBe('https://howlongtobeat.com/api/new/search');
    });

    it('rediscovers once on a cached endpoint 404, including search failures', async () => {
        let endpoint = 'old';
        const text = vi.fn(async (url: string) => url.endsWith('/') ? '<script src="/_next/static/chunks/app.js"></script>'
            : `const searchTerms=[];fetch("/api/${endpoint}",{method:"POST",body:JSON.stringify(searchTerms)})`);
        const json = vi.fn(async (url: string) => {
            if (url.includes('/init?')) return { token: 'test' };
            if (endpoint === 'new' && url.endsWith('/old')) throw Object.assign(new Error('gone'), { status: 404 });
            return { data: [] };
        });
        await getHowLongToBeatTimes(json, 'Portal', undefined, text);
        endpoint = 'new';
        await getHowLongToBeatTimes(json, 'Portal', undefined, text);
        expect(text).toHaveBeenCalledTimes(4);
        expect(json.mock.calls[json.mock.calls.length - 1][0]).toBe('https://howlongtobeat.com/api/new');
    });

    it('does not interpret GET calls or arbitrary API strings as search endpoints', () => {
        expect(extractHltbSearchPath('const searchTerms=[];fetch("/api/foo",{method:"GET"})')).toBeNull();
        expect(extractHltbSearchPath('fetch("/api/analytics",{method:"POST"})')).toBeNull();
    });
});
