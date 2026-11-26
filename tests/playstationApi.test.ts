import { describe, expect, it, vi } from 'vitest';
import { PlayStationApi, type PsnRequest } from '../src/services/playstation/api';
import { defaultPlayStationSettings, durationMinutes, normalizePlayStationSettings, normalizePlayStationTracking, normalizeTrophySet } from '../src/services/playstation/types';
import { PsnApiError } from '../src/services/playstation/errors';
import { psnError } from '../src/localization/playstation';
import { i18n } from '../src/localization';

const signal = () => new AbortController().signal;
const counts = { bronze: 10, silver: 4, gold: 2, platinum: 1 };
const trophy = { npCommunicationId: 'NPWR00001_00', trophyTitleName: 'PSN game', trophyTitlePlatform: 'PS5',
    earnedTrophies: { bronze: 2, silver: 1, gold: 0, platinum: 0 }, definedTrophies: counts, progress: 18 };
function fixture(scope: 'played' | 'purchased' | 'all' = 'played') {
    const config = { ...defaultPlayStationSettings(), accountId: '12345678901234567', secretId: 'lorebase-psn-test', scope };
    const secrets = new Map([['lorebase-psn-test', 'refresh-secret']]);
    const storage = { getSecret: vi.fn((key: string) => secrets.get(key) ?? null), setSecret: vi.fn((key: string, value: string) => { secrets.set(key, value); }) };
    const request = vi.fn(async (url: string, _signal: AbortSignal, options: any = {}) => {
        const target = new URL(url);
        if (target.pathname.endsWith('/authorize')) return { status: 302, headers: { location: 'com.scee.psxandroid.scecompcall://redirect/?code=access-code' }, data: null };
        if (target.pathname.endsWith('/token')) return { status: 200, headers: {}, data: { access_token: 'access-secret', refresh_token: 'rotated-secret', expires_in: 3600 } };
        if (target.pathname.endsWith('/users/me/profiles')) return { status: 400, headers: {}, data: { error: { code: 123 } } };
        if (target.pathname.endsWith('/users/12345678901234567/profiles')) return { status: 200, headers: {}, data: { onlineId: 'Player' } };
        if (target.pathname.endsWith('/trophySummary')) return { status: 200, headers: {}, data: { accountId: config.accountId || '12345678901234567' } };
        if (target.pathname.includes('/gamelist/')) return { status: 200, headers: {}, data: { titles: [
            { titleId: 'PPSA00001_00', localizedName: 'A game', category: 'ps5_native_game', imageUrl: 'https://image.test/a.jpg', playDuration: 'PT2H30M', lastPlayedDateTime: '2026-11-10T12:00:00Z' },
        ], totalItemCount: 1 } };
        if (target.pathname.endsWith('/users/me/trophyTitles')) return { status: 200, headers: {}, data: { trophyTitles: [], totalItemCount: 0 } };
        if (target.pathname.endsWith('/titles/trophyTitles')) return { status: 200, headers: {}, data: { titles: [{ npTitleId: 'PPSA00001_00', trophyTitles: [trophy] }] } };
        if (target.pathname.includes('/graphql/')) return { status: 200, headers: {}, data: { data: { purchasedTitlesRetrieve: { games: [
            { titleId: 'PPSA00001_00', name: 'A game', platform: 'PS5', image: { url: 'https://image.test/a.jpg' } },
            { titleId: 'CUSA00002_00', name: 'Unplayed purchase', platform: 'PS4', image: { url: 'https://image.test/b.jpg' } },
        ] } } } };
        throw new Error('Unexpected endpoint ' + target.pathname);
    });
    const persist = vi.fn(async () => {});
    const api = new PlayStationApi({ secretStorage: storage } as any, () => config, persist, request as PsnRequest);
    return { api, config, secrets, storage, request, persist };
}
describe('PlayStation authentication and library', () => {
    it('keeps NPSSO out of settings and stores only the refresh token in Secret Storage', async () => {
        const f = fixture(); f.config.accountId = ''; f.config.secretId = '';
        await f.api.connect('a'.repeat(64), signal());
        expect(f.config.accountId).toBe('12345678901234567');
        expect(f.config.onlineId).toBe('Player');
        expect(f.secrets.get(f.config.secretId)).toBe('rotated-secret');
        expect(JSON.stringify(f.config)).not.toContain('rotated-secret');
        expect(JSON.stringify(f.config)).not.toContain('access-secret');
        expect(JSON.stringify(f.config)).not.toContain('a'.repeat(64));
        expect(f.request.mock.calls[0][2]).toMatchObject({ redirect: false, headers: { Cookie: 'npsso=' + 'a'.repeat(64) } });
        expect(f.persist).toHaveBeenCalledOnce();
    });
    it('resolves the numeric account ID before requesting a profile because profiles reject me', async () => {
        const f = fixture(); f.config.accountId = ''; f.config.secretId = '';
        await f.api.connect('a'.repeat(64), signal());
        const paths = f.request.mock.calls.map(([url]) => new URL(url).pathname);
        expect(paths).not.toContain('/api/userProfile/v1/internal/users/me/profiles');
        const summary = paths.indexOf('/api/trophy/v1/users/me/trophySummary');
        const profile = paths.indexOf('/api/userProfile/v1/internal/users/12345678901234567/profiles');
        expect(summary).toBeGreaterThan(0); expect(profile).toBeGreaterThan(summary);
        expect(f.config.onlineId).toBe('Player');
    });
    it('reports the failed login step and HTTP status without exposing response bodies or saving credentials', async () => {
        const f = fixture(), original = f.request.getMockImplementation()!;
        f.config.accountId = ''; f.config.secretId = '';
        f.request.mockImplementation(async (url, sig, opts) => url.endsWith('/trophySummary')
            ? { status: 400, headers: {}, data: { error: { message: 'access-secret private diagnostic' } } } as any : original(url, sig, opts));
        const error = await f.api.connect('a'.repeat(64), signal()).catch(error => error);
        expect(error).toBeInstanceOf(PsnApiError);
        expect(error).toMatchObject({ message: 'PSN_RESPONSE', stage: 'identity', status: 400 });
        i18n.setLanguage('ru');
        const message = psnError(error);
        expect(message).toContain('Определение аккаунта · HTTP 400');
        expect(message).not.toContain('access-secret'); expect(message).not.toContain('private diagnostic');
        expect(f.config.secretId).toBe(''); expect(f.storage.setSecret).not.toHaveBeenCalled();
        expect(f.persist).not.toHaveBeenCalled();
    });
    it.each(['played', 'purchased', 'all'] as const)('imports the selected %s scope with stable PSN IDs and no duplicate played purchases', async scope => {
        const f = fixture(scope), entries = await f.api.entries(signal());
        expect(entries).toHaveLength(scope === 'played' ? 1 : 2);
        expect(entries[0]).toMatchObject({ titleId: 'PPSA00001_00', played: true, playtimeMinutes: 150 });
        if (scope !== 'played') {
            expect(entries[0].owned).toBe(true);
            expect(entries[1].playtimeMinutes).toBeUndefined();
            expect(entries[1].played).toBeUndefined();
        }
        expect(f.storage.setSecret).toHaveBeenCalledWith('lorebase-psn-test', 'rotated-secret');
        expect(f.request.mock.calls.filter(([url]) => url.endsWith('/token'))).toHaveLength(1);
    });
    it('reads every page of purchased games using the documented page size', async () => {
        const f = fixture('purchased'), original = f.request.getMockImplementation()!;
        f.request.mockImplementation(async (url, sig, opts) => {
            if (!url.includes('/graphql/')) return original(url, sig, opts);
            const variables = JSON.parse(new URL(url).searchParams.get('variables')!);
            expect(variables.size).toBe(24);
            const all = Array.from({ length: 25 }, (_, index) => ({ titleId: 'CUSA' + String(index).padStart(5, '0') + '_00', name: 'Game ' + index, platform: 'PS4' }));
            return { status: 200, headers: {}, data: { data: { purchasedTitlesRetrieve: { games: all.slice(variables.start, variables.start + variables.size) } } } } as any;
        });
        expect(await f.api.entries(signal())).toHaveLength(25);
        expect(f.request.mock.calls.filter(([url]) => url.includes('/graphql/')).map(([url]) => JSON.parse(new URL(url).searchParams.get('variables')!).start)).toEqual([0, 24]);
    });
    it('satisfies Apollo CSRF checks when requesting purchased games', async () => {
        const f = fixture('purchased'), original = f.request.getMockImplementation()!;
        f.request.mockImplementation(async (url, sig, opts) => {
            if (url.includes('/graphql/') && (opts?.headers?.['Content-Type'] !== 'application/json'
                || opts?.headers?.['Apollo-Require-Preflight'] !== 'true')) {
                return { status: 400, headers: {}, data: { errors: [{ message: 'CSRF prevention' }] } } as any;
            }
            return original(url, sig, opts);
        });
        expect(await f.api.entries(signal())).toHaveLength(2);
        const games = f.request.mock.calls.find(([url]) => url.includes('/gamelist/'))!;
        expect(new URL(games[0]).searchParams.get('categories')).toBe('ps4_game,ps5_native_game');
    });
    it.each([['/graphql/', 'purchases'], ['/gamelist/', 'played']] as const)('identifies the failed %s import request without exposing server data', async (endpoint, stage) => {
        const f = fixture('purchased'), original = f.request.getMockImplementation()!;
        f.request.mockImplementation(async (url, sig, opts) => url.includes(endpoint)
            ? { status: 400, headers: {}, data: { errors: [{ message: 'private-server-data' }] } } as any : original(url, sig, opts));
        const error = await f.api.entries(signal()).catch(error => error);
        expect(error).toMatchObject({ message: 'PSN_RESPONSE', stage, status: 400 });
        expect(psnError(error)).toContain('HTTP 400'); expect(psnError(error)).not.toContain('private-server-data');
    });
    it('links personal trophy sets by the PSN title ID rather than matching names', async () => {
        const f = fixture(), entry = (await f.api.entries(signal()))[0];
        const value = await f.api.tracking(entry, signal());
        expect(value.trophySets).toEqual([{ id: 'NPWR00001_00', title: 'PSN game', platform: 'PS5', earned: trophy.earnedTrophies, total: counts, progress: 18 }]);
        const request = f.request.mock.calls.find(([url]) => url.includes('/titles/trophyTitles'))!;
        expect(new URL(request[0]).searchParams.get('npTitleIds')).toBe('PPSA00001_00');
        expect(value.partial).toBeUndefined();
    });
    it('preserves earlier trophy values when an endpoint or a count is unavailable', async () => {
        const f = fixture(), entry = (await f.api.entries(signal()))[0], saved = normalizeTrophySet(trophy)!;
        const original = f.request.getMockImplementation()!;
        f.request.mockImplementation(async (url, sig, opts) => url.includes('/titles/trophyTitles')
            ? { status: 403, headers: {}, data: {} } as any : original(url, sig, opts));
        const value = await f.api.tracking({ ...entry, trophySets: [saved] }, signal());
        expect(value.trophySets).toEqual([saved]); expect(value.partial).toBe(true);
        expect(value.playtimeMinutes).toBe(150);
    });
    it('does not turn unavailable purchased-library access into an empty successful import', async () => {
        const f = fixture('purchased'), original = f.request.getMockImplementation()!;
        f.request.mockImplementation(async (url, sig, opts) => url.includes('/graphql/')
            ? { status: 200, headers: {}, data: { data: { purchasedTitlesRetrieve: null } } } as any : original(url, sig, opts));
        await expect(f.api.entries(signal())).rejects.toThrow('PSN_PURCHASES_UNAVAILABLE');
    });
    it('retains modern played games when legacy trophy lists are private', async () => {
        const f = fixture(), original = f.request.getMockImplementation()!;
        f.request.mockImplementation(async (url, sig, opts) => url.endsWith('/users/me/trophyTitles?limit=100&offset=0')
            ? { status: 403, headers: {}, data: {} } as any : original(url, sig, opts));
        const entries = await f.api.entries(signal());
        expect(entries).toHaveLength(1); expect(entries[0]).toMatchObject({ titleId: 'PPSA00001_00', partial: true });
        expect((await f.api.tracking(entries[0], signal())).trophySets?.[0].earned.bronze).toBe(2);
    });
    it('rejects data from another connected account', async () => {
        const f = fixture();
        await expect(f.api.tracking({ accountId: '999', titleId: 'CUSA00001_00', platform: 'PS4' }, signal())).rejects.toThrow('PSN_ACCOUNT_CHANGED');
        expect(f.request).not.toHaveBeenCalled();
    });
    it('does not save rotated credentials after disconnecting during refresh', async () => {
        const f = fixture(); let finish!: (value: any) => void;
        f.request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const pending = f.api.entries(signal());
        await vi.waitFor(() => expect(finish).toBeDefined());
        f.api.disconnect(); finish({ status: 200, headers: {}, data: { access_token: 'new-token', refresh_token: 'new-secret', expires_in: 3600 } });
        await expect(pending).rejects.toThrow('PSN_ACCOUNT_CHANGED');
        expect(f.secrets.get('lorebase-psn-test')).toBe('');
    });
});
describe('PlayStation note values', () => {
    it('parses precise play durations while retaining zero and unknown separately', () => {
        expect(durationMinutes('PT2H30M')).toBe(150);
        expect(durationMinutes('P1DT1H')).toBe(1500);
        expect(durationMinutes('PT0S')).toBe(0);
        expect(durationMinutes('')).toBeUndefined();
        expect(durationMinutes('PT')).toBeUndefined();
    });
    it('rejects invalid counts and retains only recognized settings and account references', () => {
        expect(normalizeTrophySet({ ...trophy, earnedTrophies: { ...counts, bronze: 500 } })).toBeUndefined();
        expect(normalizeTrophySet({ ...trophy, definedTrophies: {} })).toBeUndefined();
        expect(normalizePlayStationTracking({ accountId: '123', titleId: 'PPSA00001_00', playtimeMinutes: 0, trophySets: [trophy] })?.playtimeMinutes).toBe(0);
        expect(normalizePlayStationTracking({ accountId: '123', titleId: '../note' })).toBeUndefined();
        const settings = normalizePlayStationSettings({ accessToken: 'private', npsso: 'private', scope: 'invalid', metadataProvider: 'bad' });
        expect(settings).toEqual(defaultPlayStationSettings());
    });
});
