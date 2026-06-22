import { describe, expect, it } from 'vitest';
import { getHowLongToBeatTimes } from '../src/services/integrations/providers/howlongtobeat';

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
            if (url.includes('/api/bleed/init')) {
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

        expect(calls[0].url).toContain('/api/bleed/init');
        expect(searchCall.url).toBe('https://howlongtobeat.com/api/bleed');
        expect(searchCall.method).toBe('POST');
        expect(searchCall.headers?.['x-auth-token']).toBe('token-1');
        expect(searchCall.headers?.['x-hp-key']).toBe('ign_test');
        expect(searchCall.headers?.['x-hp-val']).toBe('hp-value');
        expect(payload.ign_test).toBe('hp-value');
        expect(result).toEqual({
            main: '3 Hours',
            main_plus_sides: '5 Hours',
            perfectionist: '10 Hours',
        });
    });
});
