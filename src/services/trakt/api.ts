import { scheduleTimeout } from '../../utils/timers';
import { requestUrl } from 'obsidian';
import type { TraktEntry, TraktState, TraktSyncSettings } from './types';

type Data = Record<string, unknown>;
export const object = (value: unknown): Data => value && typeof value === 'object' && !Array.isArray(value) ? value as Data : {};
export const rows = (value: unknown): Data[] => Array.isArray(value) ? value.map(object) : [];
export const text = (value: unknown): string => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
export function checkTraktAbort(signal: AbortSignal): void { if (signal.aborted) throw new DOMException('Cancelled', 'AbortError'); }
export async function waitTraktWork<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
    let timer: (() => void) | undefined, abort: (() => void) | undefined;
    try {
        return await Promise.race([work, new Promise<never>((_, reject) => {
            timer = scheduleTimeout(() => reject(new Error('TRAKT_NETWORK')), 30_000);
            abort = () => reject(new DOMException('Cancelled', 'AbortError')); signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort();
        })]);
    } finally { timer?.(); if (abort) signal.removeEventListener('abort', abort); }
}
export class TraktHttpError extends Error { constructor(readonly status: number, readonly retryAfter = 0) { super(`Trakt HTTP ${status}`); } }
export async function traktRequest(url: string, signal: AbortSignal, options: { method?: string; headers?: Record<string, string>; body?: unknown } = {}): Promise<{ data: unknown; headers: Record<string, string> }> {
    checkTraktAbort(signal);
    let timer: (() => void) | undefined, abort: (() => void) | undefined;
    try {
        const response = await Promise.race([
            requestUrl({ url, method: options.method ?? (options.body === undefined ? 'GET' : 'POST'), headers: { Accept: 'application/json', 'User-Agent': 'Lorebase/4.0.0 (Obsidian plugin)', ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }), ...options.headers }, body: options.body === undefined ? undefined : JSON.stringify(options.body), throw: false }),
            new Promise<never>((_, reject) => {
                timer = scheduleTimeout(() => reject(new Error('Request timed out')), 30_000);
                abort = () => reject(new DOMException('Cancelled', 'AbortError')); signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort();
            }),
        ]);
        checkTraktAbort(signal);
        if (response.status < 200 || response.status >= 300) throw new TraktHttpError(response.status, Number(response.headers['retry-after'] ?? response.headers['Retry-After']) || 0);
        return { data: response.status === 204 ? null : response.json, headers: response.headers };
    } catch (error) {
        if (error instanceof TraktHttpError || error instanceof DOMException && error.name === 'AbortError') throw error;
        throw new Error('TRAKT_NETWORK');
    } finally { timer?.(); if (abort) signal.removeEventListener('abort', abort); }
}
export type TraktRequest = typeof traktRequest;
export interface TraktDeviceCode { code: string; url: string; expiresAt: number; interval: number; poll(signal: AbortSignal): Promise<TraktSyncSettings | null>; }
const API = 'https://api.trakt.tv', AUTH = 'https://auth.trakt.tv';
export class TraktApi {
    private refreshing?: Promise<void>;
    private sessions = new WeakMap<TraktSyncSettings, { accessToken: string; refreshToken: string; account: string; identity: object }>();
    constructor(private config: () => TraktSyncSettings, private request: TraktRequest = traktRequest, private persist: () => Promise<void> = async () => {}) {}
    /** Opaque identity stays stable for our own token refresh, but changes for an account edit. */
    getSessionIdentity(): object {
        const config = this.config(), account = JSON.stringify([config.username, config.clientId]);
        let session = this.sessions.get(config);
        if (!session || session.accessToken !== config.accessToken || session.refreshToken !== config.refreshToken || session.account !== account) {
            session = { accessToken: config.accessToken, refreshToken: config.refreshToken, account, identity: {} };
            this.sessions.set(config, session);
        }
        return session.identity;
    }
    private requireApplication(config = this.config()): string { const id = config.clientId.trim(); if (!id) throw new Error('TRAKT_APPLICATION_NOT_CONFIGURED'); return id; }
    private headers(config = this.config()): Record<string, string> { return { 'trakt-api-version': '2', 'trakt-api-key': this.requireApplication(config), Authorization: `Bearer ${config.accessToken}` }; }
    private tokens(config: TraktSyncSettings, data: Data): TraktSyncSettings {
        if (!data.access_token || !data.refresh_token) throw new Error('TRAKT_INVALID_TOKEN');
        return { ...config, accessToken: text(data.access_token), refreshToken: text(data.refresh_token), expiresAt: Date.now() + (Number(data.expires_in) || 604800) * 1000 };
    }
    async beginLogin(signal: AbortSignal): Promise<TraktDeviceCode> {
        const base = this.config(), clientId = this.requireApplication(base);
        const response = await this.request(`${AUTH}/oauth/device/code`, signal, { body: { client_id: clientId } });
        const data = object(response.data);
        if (!data.user_code || !data.device_code || !data.verification_url) throw new Error('TRAKT_INVALID_CODE');
        const expiresAt = Date.now() + (Number(data.expires_in) || 600) * 1000;
        const interval = Math.max(5, Number(data.interval) || 5); let nextPoll = 0;
        return { code: text(data.user_code), url: text(data.verification_url), expiresAt, interval, poll: async pollSignal => {
            if (this.config() !== base || base.clientId.trim() !== clientId) throw new Error('TRAKT_ACCOUNT_CHANGED');
            if (Date.now() >= expiresAt) throw new Error('TRAKT_CODE_EXPIRED');
            if (Date.now() < nextPoll) return null;
            try {
                const result = await this.request(`${AUTH}/oauth/device/token`, pollSignal, { body: { code: data.device_code, client_id: clientId } });
                const connected = this.tokens(base, object(result.data));
                const profile = await this.request(`${API}/users/settings`, pollSignal, { headers: this.headers(connected) });
                if (this.config() !== base || base.clientId.trim() !== clientId) throw new Error('TRAKT_ACCOUNT_CHANGED');
                connected.username = text(object(object(profile.data).user).username); connected.lastSynced = {};
                return connected;
            } catch (error) {
                if (error instanceof TraktHttpError && [400, 429].includes(error.status)) { nextPoll = Date.now() + Math.max(interval, error.retryAfter, error.status === 429 ? interval + 5 : interval) * 1000; return null; }
                throw error;
            }
        } };
    }
    private async ready(signal: AbortSignal): Promise<void> {
        const config = this.config(), clientId = this.requireApplication(config);
        const session = this.getSessionIdentity();
        if (!config.accessToken) throw new Error('TRAKT_CONNECT_FIRST');
        if (!config.expiresAt || config.expiresAt > Date.now() + 60_000) return;
        if (!this.refreshing) {
            this.refreshing = (async () => {
                const { data } = await this.request(`${AUTH}/oauth/token`, signal, { body: { client_id: clientId, refresh_token: config.refreshToken, grant_type: 'refresh_token', redirect_uri: 'urn:ietf:wg:oauth:2.0:oob' } });
                checkTraktAbort(signal); if (this.config() !== config || this.getSessionIdentity() !== session) throw new Error('TRAKT_ACCOUNT_CHANGED');
                Object.assign(config, this.tokens(config, object(data)));
                Object.assign(this.sessions.get(config)!, { accessToken: config.accessToken, refreshToken: config.refreshToken });
                await this.persist();
            })().finally(() => { this.refreshing = undefined; });
        }
        await this.refreshing; checkTraktAbort(signal);
    }
    private async pages(path: string, signal: AbortSignal): Promise<Data[]> {
        const result: Data[] = [], seen = new Set<string>();
        for (let page = 1; ; page++) {
            const response = await this.request(`${API}${path}${path.includes('?') ? '&' : '?'}page=${page}&limit=100`, signal, { headers: this.headers() });
            if (!Array.isArray(response.data)) throw new Error('TRAKT_INVALID_LIST');
            const items = rows(response.data), signature = JSON.stringify(items);
            if (items.length && seen.has(signature)) throw new Error('TRAKT_REPEATED_PAGE');
            seen.add(signature); result.push(...items);
            const count = Number(response.headers['x-pagination-page-count'] ?? response.headers['X-Pagination-Page-Count']);
            const limit = Number(response.headers['x-pagination-limit'] ?? response.headers['X-Pagination-Limit']) || 100;
            if (count > 0 ? page >= count : items.length < limit) return result;
        }
    }
    async entries(signal: AbortSignal): Promise<TraktEntry[]> {
        await this.ready(signal); const entries = new Map<string, TraktEntry>();
        const add = (raw: Data): TraktEntry | undefined => {
            const value = object(raw.movie ?? raw.show), kind = raw.movie ? 'movie' : 'series';
            const ids = object(value.ids);
            const traktId = text(ids.trakt);
            if (!traktId || !value.title) return;
            const key = `${kind}:${traktId}`;
            if (!entries.has(key)) entries.set(key, { key, id: traktId, kind, title: text(value.title), year: Number(value.year) || undefined,
                ids: Object.fromEntries(Object.entries(ids).filter(([, value]) => value !== null && value !== undefined && value !== '').map(([key, value]) => [key, text(value)])),
                state: { rating: null, watchlist: false, watched: false, favorite: false, episodes: [] } });
            return entries.get(key);
        };
        const [movies, shows, watchlist, ratings, favorites] = await Promise.all([
            this.pages('/sync/watched/movies', signal), this.pages('/sync/watched/shows?extended=progress', signal),
            this.pages('/sync/watchlist', signal), this.pages('/sync/ratings', signal), this.pages('/sync/favorites', signal),
        ]);
        for (const raw of movies) { const entry = add(raw); if (entry) entry.state.watched = true; }
        for (const raw of shows) {
            if (Number(raw.plays) > 0 && !Array.isArray(raw.seasons)) throw new Error('TRAKT_PROGRESS_UNAVAILABLE');
            const entry = add(raw); if (entry) entry.state.episodes = [...new Set(rows(raw.seasons).flatMap(season => rows(season.episodes).filter(episode => Number(episode.plays) > 0).map(episode => `${text(season.number)}:${text(episode.number)}`)))].sort();
        }
        for (const raw of watchlist) { if (!raw.movie && !raw.show) continue; const entry = add(raw); if (entry) entry.state.watchlist = true; }
        for (const raw of ratings) { if (!raw.movie && !raw.show) continue; const entry = add(raw); if (entry) entry.state.rating = Number(raw.rating) > 0 ? Math.min(10, Number(raw.rating)) : null; }
        for (const raw of favorites) { if (!raw.movie && !raw.show) continue; const entry = add(raw); if (entry) entry.state.favorite = true; }
        return [...entries.values()];
    }
    async seasons(id: string, signal: AbortSignal): Promise<Data[]> {
        await this.ready(signal); const response = await this.request(`${API}/shows/${encodeURIComponent(id)}/seasons?extended=episodes,full`, signal, { headers: this.headers() });
        if (!Array.isArray(response.data)) throw new Error('TRAKT_INVALID_SEASONS'); return rows(response.data);
    }
    async push(entry: TraktEntry, desired: TraktState, signal: AbortSignal): Promise<void> {
        const config = this.config(), session = this.getSessionIdentity();
        await this.ready(signal);
        const group = entry.kind === 'movie' ? 'movies' : 'shows', id = { ids: { trakt: Number(entry.id) } };
        const send = async (path: string, body: unknown) => {
            checkTraktAbort(signal);
            if (this.config() !== config || this.getSessionIdentity() !== session || !config.accessToken) throw new Error('TRAKT_ACCOUNT_CHANGED');
            const response = await this.request(API + path, signal, { headers: this.headers(config), body });
            if (Object.values(object(object(response.data).not_found)).some(value => Array.isArray(value) && value.length)) throw new Error('TRAKT_TITLE_NOT_FOUND');
        };
        if (desired.rating !== entry.state.rating) await send(desired.rating === null ? '/sync/ratings/remove' : '/sync/ratings', { [group]: [{ ...id, ...(desired.rating === null ? {} : { rating: desired.rating }) }] });
        if (desired.watchlist !== entry.state.watchlist) await send(desired.watchlist ? '/sync/watchlist' : '/sync/watchlist/remove', { [group]: [id] });
        if (desired.favorite !== undefined && desired.favorite !== entry.state.favorite) await send(desired.favorite ? '/sync/favorites' : '/sync/favorites/remove', { [group]: [id] });
        if (entry.kind === 'movie' && desired.watched !== entry.state.watched) await send(desired.watched ? '/sync/history' : '/sync/history/remove', { movies: [{ ...id, ...(desired.watched ? { watched_at: 'unknown' } : {}) }] });
        if (entry.kind === 'series') {
            const current = new Set(desired.episodes), before = new Set(entry.state.episodes);
            for (const adding of [true, false]) {
                const changes = [...(adding ? current : before)].filter(episode => !(adding ? before : current).has(episode));
                if (!changes.length) continue;
                const seasons = new Map<number, Data[]>();
                for (const key of changes) { const [season, episode] = key.split(':').map(Number); if (!Number.isInteger(season) || season < 0 || !Number.isInteger(episode) || episode < 1) throw new Error('TRAKT_INVALID_EPISODE'); const list = seasons.get(season) ?? []; list.push({ number: episode, ...(adding ? { watched_at: 'unknown' } : {}) }); seasons.set(season, list); }
                await send(adding ? '/sync/history' : '/sync/history/remove', { shows: [{ ...id, seasons: [...seasons].map(([number, episodes]) => ({ number, episodes })) }] });
            }
        }
    }
}
