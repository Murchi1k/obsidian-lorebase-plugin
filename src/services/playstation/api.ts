import { requestUrl } from 'obsidian';
import { type App } from 'obsidian';
import { request as httpsRequest } from 'https';
import { checkPsnAbort, durationMinutes, normalizeTrophySet, object, rows, text, type PlayStationEntry, type PlayStationSyncSettings, type PlayStationTracking } from './types';
import { PsnApiError, type PsnAuthStage } from './errors';

const AUTH = 'https://ca.account.sony.com/api/authz/v3/oauth';
const API = 'https://m.np.playstation.com/api';
const BASIC = 'Basic MDk1MTUxNTktNzIzNy00MzcwLTliNDAtMzgwNmU2N2MwODkxOnVjUGprYTV0bnRCMktxc1A=';
// PSN's web-library operation, documented by the psn-api maintainers:
// https://github.com/achievements-app/psn-api/blob/main/src/graphql/operationHashes.ts
const PURCHASE_HASH = '827a423f6a8ddca4107ac01395af2ec0eafd8396fc7fa204aaf9b7ed2eefa168';
export interface PsnResponse { status: number; headers: Record<string, string>; data: unknown; }
export type PsnRequest = (url: string, signal: AbortSignal, options?: { method?: string; headers?: Record<string, string>; body?: string; redirect?: boolean }) => Promise<PsnResponse>;
export const psnRequest: PsnRequest = async (url, signal, options = {}) => {
    checkPsnAbort(signal);
    // requestUrl follows redirects. The authorization endpoint redirects to a custom app
    // scheme; HTTPS is needed here to read its Location header without following it.
    if (options.redirect === false) {
        if (typeof process === 'undefined' || !process.versions?.node) throw new Error('PSN_DESKTOP_AUTH');
        return await new Promise<PsnResponse>((resolve, reject) => {
            const req = httpsRequest(url, { method: options.method ?? 'GET', headers: options.headers }, response => {
                response.resume();
                resolve({ status: response.statusCode ?? 0, headers: Object.fromEntries(Object.entries(response.headers).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value ?? ''])), data: null });
            });
            const cancel = () => req.destroy(new DOMException('Cancelled', 'AbortError'));
            signal.addEventListener('abort', cancel, { once: true });
            req.once('close', () => signal.removeEventListener('abort', cancel));
            req.on('error', () => reject(signal.aborted ? new DOMException('Cancelled', 'AbortError') : new Error('PSN_NETWORK')));
            req.setTimeout(30_000, () => req.destroy(new Error('PSN_NETWORK')));
            if (signal.aborted) cancel(); else req.end(options.body);
        });
    }
    let timer: ReturnType<typeof setTimeout> | undefined, cancel: (() => void) | undefined;
    try {
        const response = await Promise.race([
            requestUrl({ url, method: options.method ?? 'GET', headers: options.headers, body: options.body, throw: false }),
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error('PSN_NETWORK')), 30_000);
                cancel = () => reject(new DOMException('Cancelled', 'AbortError'));
                signal.addEventListener('abort', cancel, { once: true }); if (signal.aborted) cancel();
            }),
        ]);
        checkPsnAbort(signal);
        let data: unknown;
        try { data = response.json; }
        catch {
            if (response.status >= 200 && response.status < 300) throw new PsnApiError('PSN_RESPONSE', undefined, response.status);
            // Error pages can be HTML. Preserve their status for checked() below.
            data = null;
        }
        return { status: response.status, headers: response.headers, data };
    } catch (error) {
        if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
        if (error instanceof Error && error.message.startsWith('PSN_')) throw error;
        throw new Error('PSN_NETWORK');
    } finally { if (timer) clearTimeout(timer); if (cancel) signal.removeEventListener('abort', cancel); }
};
export class PlayStationApi {
    private token?: { secretId: string; access: string; expires: number };
    private refreshing?: Promise<void>;
    private playedCache?: { secretId: string; until: number; entries: PlayStationEntry[] };
    constructor(private app: Pick<App, 'secretStorage'>, private config: () => PlayStationSyncSettings,
        private persist: () => Promise<void>, private request: PsnRequest = psnRequest) {}
    private storage() { if (!this.app.secretStorage) throw new Error('PSN_SECRET_STORAGE'); return this.app.secretStorage; }
    private async authStep<T>(stage: PsnAuthStage, run: () => Promise<T>): Promise<T> {
        try { return await run(); }
        catch (error) {
            if (error instanceof Error && error.name === 'AbortError') throw error;
            const code = error instanceof Error && /^PSN_[A-Z_]+$/.test(error.message) ? error.message : 'PSN_RESPONSE';
            throw new PsnApiError(code, stage, error instanceof PsnApiError ? error.status : undefined);
        }
    }
    private checked(response: PsnResponse): Record<string, any> {
        if (response.status === 401) throw new PsnApiError('PSN_CONNECT_FIRST', undefined, response.status);
        if (response.status === 403) throw new PsnApiError('PSN_PRIVATE', undefined, response.status);
        if (response.status === 429) throw new PsnApiError('PSN_RATE_LIMIT', undefined, response.status);
        if (object(response.data).error === 'invalid_grant') throw new PsnApiError('PSN_CONNECT_FIRST', undefined, response.status);
        if (response.status < 200 || response.status >= 300 || object(response.data).error || rows(object(response.data).errors).length) throw new PsnApiError('PSN_RESPONSE', undefined, response.status);
        return object(response.data);
    }
    private async exchange(fields: Record<string, string>, signal: AbortSignal) {
        const data = this.checked(await this.request(AUTH + '/token', signal, { method: 'POST',
            headers: { Authorization: BASIC, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token_format: 'jwt', ...fields }).toString() }));
        if (!data.access_token || !data.refresh_token || !(Number(data.expires_in) > 0)) throw new Error('PSN_CONNECT_FIRST');
        return { access: text(data.access_token), refresh: text(data.refresh_token), expires: Date.now() + Number(data.expires_in) * 1000 };
    }
    async connect(npsso: string, signal: AbortSignal): Promise<void> {
        const config = this.config(), storage = this.storage(), oldSecretId = config.secretId;
        if (!/^[A-Za-z0-9_-]{64}$/.test(npsso.trim())) throw new Error('PSN_INVALID_NPSSO');
        const url = new URL(AUTH + '/authorize');
        url.search = new URLSearchParams({ access_type: 'offline', client_id: '09515159-7237-4370-9b40-3806e67c0891',
            redirect_uri: 'com.scee.psxandroid.scecompcall://redirect', response_type: 'code', scope: 'psn:mobile.v2.core psn:clientapp' }).toString();
        const code = await this.authStep('authorization', async () => {
            const response = await this.request(url.toString(), signal, { headers: { Cookie: 'npsso=' + npsso.trim() }, redirect: false });
            const location = response.headers.location ?? response.headers.Location ?? '';
            if (!location.startsWith('com.scee.psxandroid.scecompcall://redirect')) {
                if (response.status >= 400) this.checked(response);
                throw new PsnApiError('PSN_INVALID_NPSSO', undefined, response.status);
            }
            const code = new URL(location).searchParams.get('code');
            if (!code) throw new PsnApiError('PSN_INVALID_NPSSO', undefined, response.status);
            return code;
        });
        const tokens = await this.authStep('token', () => this.exchange({ code, redirect_uri: 'com.scee.psxandroid.scecompcall://redirect', grant_type: 'authorization_code' }, signal));
        // Unlike trophySummary, the profile endpoint does not accept "me".
        // Resolve the authenticated numeric account ID before requesting its profile.
        const accountId = await this.authStep('identity', async () => {
            const summary = this.checked(await this.request(API + '/trophy/v1/users/me/trophySummary', signal, { headers: { Authorization: 'Bearer ' + tokens.access } }));
            const accountId = text(summary.accountId);
            if (!/^\d+$/.test(accountId)) throw new Error('PSN_RESPONSE');
            return accountId;
        });
        const profile = await this.authStep('profile', async () => this.checked(await this.request(API + '/userProfile/v1/internal/users/' + accountId + '/profiles', signal,
            { headers: { Authorization: 'Bearer ' + tokens.access } })));
        checkPsnAbort(signal); if (this.config() !== config || config.secretId !== oldSecretId) throw new Error('PSN_ACCOUNT_CHANGED');
        const secretId = 'lorebase-psn-' + crypto.randomUUID();
        storage.setSecret(secretId, tokens.refresh);
        Object.assign(config, { secretId, accountId, onlineId: text(profile.onlineId ?? object(profile.profile).onlineId) });
        this.token = { secretId, access: tokens.access, expires: tokens.expires }; this.playedCache = undefined;
        await this.persist();
        if (oldSecretId) storage.setSecret(oldSecretId, '');
    }
    disconnect(): void {
        const config = this.config();
        if (config.secretId) this.storage().setSecret(config.secretId, '');
        config.accountId = ''; config.onlineId = ''; config.secretId = '';
        this.token = undefined; this.playedCache = undefined;
    }
    private async ready(signal: AbortSignal): Promise<void> {
        const config = this.config(), secretId = config.secretId;
        if (!secretId || !config.accountId) throw new Error('PSN_CONNECT_FIRST');
        if (this.token?.secretId === secretId && this.token.expires > Date.now() + 60_000) return;
        if (!this.refreshing) this.refreshing = (async () => {
            const refresh = this.storage().getSecret(secretId); if (!refresh) throw new Error('PSN_CONNECT_FIRST');
            const tokens = await this.exchange({ refresh_token: refresh, grant_type: 'refresh_token', scope: 'psn:mobile.v2.core psn:clientapp' }, signal);
            checkPsnAbort(signal); if (this.config() !== config || config.secretId !== secretId) throw new Error('PSN_ACCOUNT_CHANGED');
            const summary = this.checked(await this.request(API + '/trophy/v1/users/me/trophySummary', signal, { headers: { Authorization: 'Bearer ' + tokens.access } }));
            checkPsnAbort(signal);
            if (this.config() !== config || config.secretId !== secretId || text(summary.accountId) !== config.accountId) throw new Error('PSN_ACCOUNT_CHANGED');
            this.storage().setSecret(secretId, tokens.refresh);
            this.token = { secretId, access: tokens.access, expires: tokens.expires };
        })().finally(() => { this.refreshing = undefined; });
        await this.refreshing; checkPsnAbort(signal);
        if (this.config() !== config || config.secretId !== secretId) throw new Error('PSN_ACCOUNT_CHANGED');
    }
    private async get(url: string, signal: AbortSignal): Promise<Record<string, any>> {
        await this.ready(signal); const config = this.config(), secretId = config.secretId;
        const graphql = new URL(url).pathname === '/api/graphql/v1/op';
        const stage: PsnAuthStage = graphql ? 'purchases' : url.includes('/gamelist/') ? 'played' : 'trophies';
        return this.authStep(stage, async () => {
            // Apollo rejects GraphQL GET requests without an explicit non-simple
            // Content-Type or preflight header (HTTP 400, even with a valid token).
            const headers: Record<string, string> = { Authorization: 'Bearer ' + this.token!.access, Accept: 'application/json' };
            if (graphql) Object.assign(headers, { 'Content-Type': 'application/json', 'Apollo-Require-Preflight': 'true' });
            const response = await this.request(url, signal, { headers });
            checkPsnAbort(signal);
            if (this.config() !== config || config.secretId !== secretId) throw new Error('PSN_ACCOUNT_CHANGED');
            if (response.status === 401) this.token = undefined;
            return this.checked(response);
        });
    }
    private async pages(url: string, key: string, signal: AbortSignal): Promise<Record<string, any>[]> {
        const entries: Record<string, any>[] = []; let offset = 0;
        for (;;) {
            checkPsnAbort(signal); const target = new URL(url);
            target.searchParams.set('limit', '100'); target.searchParams.set('offset', String(offset));
            const data = await this.get(target.toString(), signal);
            if (!Array.isArray(data[key])) throw new Error('PSN_RESPONSE');
            const page = rows(data[key]); entries.push(...page);
            if (!page.length || (Number.isFinite(data.totalItemCount) && entries.length >= data.totalItemCount)) break;
            const next = Number(data.nextOffset);
            if (Number.isFinite(next) && next > offset) offset = next;
            else if (page.length < 100) break;
            else offset += page.length;
            if (offset > 100_000) throw new Error('PSN_PAGINATION');
        }
        return entries;
    }
    async played(signal: AbortSignal, fresh = false): Promise<PlayStationEntry[]> {
        const config = this.config(), secretId = config.secretId, accountId = config.accountId;
        if (!fresh && this.playedCache?.secretId === config.secretId && this.playedCache.until > Date.now()) return this.playedCache.entries;
        const raw = await this.pages(API + '/gamelist/v2/users/me/titles?categories=ps4_game,ps5_native_game', 'titles', signal);
        const entries: PlayStationEntry[] = raw.filter(row => /^(?:CUSA|PPSA)/i.test(text(row.titleId))).map(row => ({
            accountId: config.accountId, titleId: text(row.titleId), platform: row.category === 'ps5_native_game' ? 'PS5' : 'PS4',
            conceptId: /^\d+$/.test(text(row.conceptId)) ? text(row.conceptId) : undefined,
            name: text(row.localizedName || row.name), image: text(row.localizedImageUrl || row.imageUrl), played: true,
            playtimeMinutes: durationMinutes(row.playDuration), lastPlayedAt: text(row.lastPlayedDateTime) || undefined,
        }));
        // The played-game endpoint covers PS4/PS5. Legacy trophy lists identify older
        // games by their trophy-set IDs; never guess a CUSA/PPSA link from a title.
        let legacy: Record<string, any>[] = [];
        try { legacy = await this.pages(API + '/trophy/v1/users/me/trophyTitles', 'trophyTitles', signal); }
        catch (error) {
            checkPsnAbort(signal);
            if (error instanceof Error && ['PSN_CONNECT_FIRST', 'PSN_ACCOUNT_CHANGED', 'PSN_RATE_LIMIT'].includes(error.message)) throw error;
            // Older trophy lists can be private while the modern game list is available.
            // Retain that list and report a partial import rather than dropping all games.
            for (const entry of entries) entry.partial = true;
        }
        for (const row of legacy) {
            if (!/PS3|PSVITA|PS VITA/i.test(text(row.trophyTitlePlatform)) || /PS4|PS5/i.test(text(row.trophyTitlePlatform))) continue;
            const set = normalizeTrophySet(row); if (!set) continue;
            entries.push({ accountId: config.accountId, titleId: set.id, platform: set.platform, name: set.title,
                image: text(row.trophyTitleIconUrl), played: true, trophySets: [set] });
        }
        if (this.config() !== config || config.secretId !== secretId || config.accountId !== accountId) throw new Error('PSN_ACCOUNT_CHANGED');
        this.playedCache = { secretId, until: Date.now() + 120_000, entries }; return entries;
    }
    async entries(signal: AbortSignal): Promise<PlayStationEntry[]> {
        const config = this.config(), secretId = config.secretId, accountId = config.accountId;
        const played = await this.played(signal, true), merged = new Map(played.map(entry => [entry.titleId, entry]));
        if (config.scope !== 'played') {
            let start = 0;
            for (;;) {
                const url = new URL('https://web.np.playstation.com/api/graphql/v1/op');
                url.searchParams.set('operationName', 'getPurchasedGameList');
                url.searchParams.set('variables', JSON.stringify({ isActive: true, platform: ['ps4', 'ps5'], size: 24, start, sortBy: 'ACTIVE_DATE', sortDirection: 'desc' }));
                url.searchParams.set('extensions', JSON.stringify({ persistedQuery: { version: 1, sha256Hash: PURCHASE_HASH } }));
                const data = await this.get(url.toString(), signal), list = object(object(data.data).purchasedTitlesRetrieve);
                if (!Array.isArray(list.games)) throw new Error('PSN_PURCHASES_UNAVAILABLE');
                const page = rows(list.games);
                for (const row of page) {
                    const id = text(row.titleId); if (!/^(?:CUSA|PPSA)/i.test(id)) continue;
                    merged.set(id, { ...merged.get(id), accountId: config.accountId, titleId: id,
                        conceptId: /^\d+$/.test(text(row.conceptId)) ? text(row.conceptId) : merged.get(id)?.conceptId,
                        name: merged.get(id)?.name || text(row.name), image: merged.get(id)?.image || text(object(row.image).url),
                        platform: text(row.platform).toUpperCase().includes('5') ? 'PS5' : 'PS4', owned: true });
                }
                if (page.length < 24) break;
                start += page.length; if (start > 100_000) throw new Error('PSN_PAGINATION');
            }
        }
        if (this.config() !== config || config.secretId !== secretId || config.accountId !== accountId) throw new Error('PSN_ACCOUNT_CHANGED');
        return [...merged.values()].filter(entry => config.scope !== 'purchased' || entry.owned === true);
    }
    async tracking(previous: PlayStationTracking, signal: AbortSignal): Promise<PlayStationEntry> {
        const config = this.config(), secretId = config.secretId;
        if (previous.accountId !== config.accountId) throw new Error('PSN_ACCOUNT_CHANGED');
        const played = (await this.played(signal)).find(entry => entry.titleId === previous.titleId);
        const result: PlayStationEntry = { ...previous, ...played, name: played?.name ?? '', image: played?.image ?? '' };
        if (!played && this.config().importPlaytime && previous.played) result.partial = true;
        if (played && !/^NPWR/.test(previous.titleId) && config.importPlaytime && played.playtimeMinutes === undefined) result.partial = true;
        if (/^NPWR/.test(previous.titleId)) {
            if (played?.trophySets) result.trophySets = played.trophySets; else result.partial = true;
        } else if (this.config().importTrophies && (played || previous.played)) {
            try {
                const url = new URL(API + '/trophy/v1/users/me/titles/trophyTitles');
                url.searchParams.set('npTitleIds', previous.titleId);
                const data = await this.get(url.toString(), signal);
                if (!Array.isArray(data.titles)) throw new Error('PSN_RESPONSE');
                const title = rows(data.titles).find(row => row.npTitleId === previous.titleId);
                if (!title || !Array.isArray(title.trophyTitles)) throw new Error('PSN_RESPONSE');
                const sets = rows(title.trophyTitles).map(normalizeTrophySet);
                if (sets.some(set => !set)) throw new Error('PSN_RESPONSE');
                result.trophySets = sets.filter((set): set is NonNullable<typeof set> => Boolean(set));
            } catch (error) { checkPsnAbort(signal); if (this.config().accountId !== previous.accountId) throw new Error('PSN_ACCOUNT_CHANGED'); result.partial = true; }
        }
        checkPsnAbort(signal);
        if (this.config() !== config || config.secretId !== secretId) throw new Error('PSN_ACCOUNT_CHANGED');
        result.updatedAt = new Date().toISOString(); return result;
    }
}
