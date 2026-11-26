import { requestUrl } from 'obsidian';
import { requestWithDeadline, RequestTimeoutError } from './requestDeadline';
import { App, TFolder } from 'obsidian';
import type { EpisodeTrackingState, UserRating } from '../../types';
import { episodeFields } from '../media/episodeTracking';
import type { IntegrationTemplateSettings } from '../../types';
import { getHowLongToBeatTimes } from './providers/howlongtobeat';
import type { JsonFetcher } from './providers/common';
import { withAniListHeaders } from './anilistRequest';
import { withMangaDexHeaders } from './mangadexRequest';
import {
    clearIntegrationDiagnostics,
    recordIntegrationDiagnostic,
    type IntegrationCooldownSnapshot,
} from './diagnostics';

type RequestMethod = 'GET' | 'POST';
type PartLike = EpisodeTrackingState & {
    id: string;
    kind: string;
    title: string;
    alternativeTitles?: string[];
    seasonNumber: number | null;
    episodeCurrent: number | null;
    episodeTotal: number | null;
    status: string;
    userRating?: UserRating;
    poster?: string | null;
    year?: number | null;
    episodeDuration?: number | null;
    releaseDate?: string | null;
};

type MangaPartLike = {
    id: string;
    kind: string;
    title: string;
    alternativeTitles?: string[];
    volumeNumber: number | null;
    chapterCurrent: number | null;
    chapterTotal: number | null;
    status: string;
};

interface FetchJsonOptions {
    errorPrefix?: string;
    swallowErrors?: boolean;
    rateLimitMessage?: string;
    htmlJsonMessage?: string;
}

type RequestUrlOptions = Parameters<typeof requestUrl>[0];
type RequestUrlResponse = Awaited<ReturnType<typeof requestUrl>>;

interface RequestState {
    tail: Promise<void>;
    nextAllowedAt: number;
    blockedUntil: number;
    blockedStatus: number | null;
}

const requestStates = new Map<string, RequestState>();
const DEFAULT_REQUEST_INTERVAL_MS = 150;
const DEFAULT_RATE_LIMIT_BLOCK_MS = 60_000;
const DEFAULT_FORBIDDEN_BLOCK_MS = 15 * 60_000;
const MAX_RETRY_AFTER_MS = 30 * 60_000;
const RETRYABLE_STATUS_CODES = new Set([408, 425, 500, 502, 503, 504]);

export class IntegrationRequestError extends Error {
    readonly status: number;
    readonly origin: string;
    readonly retryAfterMs: number;

    constructor(message: string, status: number, origin: string, retryAfterMs = 0) {
        super(message);
        this.name = 'IntegrationRequestError';
        this.status = status;
        this.origin = origin;
        this.retryAfterMs = retryAfterMs;
    }
}

export async function fetchJson(
    url: string,
    headers: Record<string, string> = {},
    method: RequestMethod = 'GET',
    body?: string,
    options: FetchJsonOptions = {}
): Promise<unknown> {
    let response: RequestUrlResponse;
    try {
        const requestOptions: { url: string; method: RequestMethod; headers: Record<string, string>; body?: string } = {
            url,
            method,
            headers: withAniListHeaders(url, headers),
        };
        if (body !== undefined) {
            requestOptions.body = body;
        }
        response = await requestUrlSafely(requestOptions);
    } catch (error) {
        if (options.rateLimitMessage && isRateLimitError(error)) {
            throw preserveHttpMetadata(error, options.rateLimitMessage);
        }
        if (options.swallowErrors) {
            return null;
        }
        throw error;
    }

    try {
        return response.json;
    } catch (error) {
        const text = response.text?.trim() ?? '';
        if (options.htmlJsonMessage && (text.startsWith('<!DOCTYPE') || text.startsWith('<html'))) {
            throw new Error(options.htmlJsonMessage);
        }
        if (options.swallowErrors) {
            return null;
        }
        throw error;
    }
}

export async function fetchText(url: string, headers: Record<string, string> = {}): Promise<string> {
    const response = await requestUrlSafely({ url, method: 'GET', headers });
    return response.text ?? '';
}

export async function fetchBinary(url: string): Promise<{
    arrayBuffer: ArrayBuffer;
    headers: Record<string, string>;
    status: number;
}> {
    const response = await requestUrlSafely({ url, method: 'GET', headers: withMangaDexHeaders(url) });
    const contentType = Object.entries(response.headers ?? {}).find(([key]) => key.toLowerCase() === 'content-type')?.[1];
    if (new URL(url).hostname === 'uploads.mangadex.org' && contentType && !/^image\//i.test(contentType)) {
        throw new Error('MangaDex did not return an image.');
    }
    return {
        arrayBuffer: response.arrayBuffer,
        headers: response.headers,
        status: response.status,
    };
}

export function getJsonFetcher(fetcher: JsonFetcher): JsonFetcher {
    return fetcher;
}

export async function ensureFolder(app: App, folderPath: string): Promise<void> {
    if (!folderPath) return;
    const existing = app.vault.getAbstractFileByPath(folderPath);
    if (existing instanceof TFolder) return;
    if (existing) return;
    await app.vault.createFolder(folderPath);
}

export function shouldLoadHowLongToBeat(mediaSettings: IntegrationTemplateSettings, template = mediaSettings.template): boolean {
    if (!mediaSettings.templateEnabled) return false;
    if (!mediaSettings.howLongToBeatEnabled) return false;

    const mode = mediaSettings.templateMode ?? 'advanced';
    if (mode === 'simple') {
        return true;
    }

    return /\{\{VALUE:(main|main_plus_sides|perfectionist|completionist)\}\}/.test(template);
}

export async function fetchHowLongToBeatValues(
    fetcher: JsonFetcher,
    name: string,
    year: string | undefined,
    logPrefix: string
): Promise<{
    main: number | '';
    main_plus_sides: number | '';
    perfectionist: number | '';
} | null> {
    try {
        return await getHowLongToBeatTimes(fetcher, name, year, fetchText);
    } catch (error) {
        console.warn(`${logPrefix} howlongtobeat failed`, error);
        return null;
    }
}

export function renderPartsYaml(parts: PartLike[]): string {
    if (!parts.length) return '  []';
    return parts.map((part) => [
        `  - id: "${escapeYaml(part.id)}"`,
        `    kind: "${escapeYaml(part.kind)}"`,
        `    title: "${escapeYaml(part.title)}"`,
        ...(part.alternativeTitles?.length ? [`    alt_titles: ${JSON.stringify(part.alternativeTitles)}`] : []),
        `    season: ${part.seasonNumber ?? 'null'}`,
        `    episode_current: ${part.episodeCurrent ?? 0}`,
        `    episode_total: ${part.episodeTotal ?? 'null'}`,
        `    status: "${escapeYaml(part.status)}"`,
        ...(part.userRating != null ? [`    user_rating: ${part.userRating}`] : []),
        ...(part.poster !== undefined ? [`    poster: "${escapeYaml(part.poster)}"`] : []),
        ...(part.year !== undefined ? [`    year: ${part.year ?? 'null'}`] : []),
        ...(part.releaseDate ? [`    released: ${JSON.stringify(part.releaseDate)}`] : []),
        ...(part.episodeDuration !== undefined ? [`    episode_duration: ${part.episodeDuration ?? 'null'}`] : []),
        ...Object.entries(episodeFields(part)).map(([key, value]) => `    ${key}: ${JSON.stringify(value)}`),
    ].join('\n')).join('\n');
}

export function renderMangaPartsYaml(parts: MangaPartLike[]): string {
    if (!parts.length) return '  []';
    return parts.map((part) => [
        `  - id: "${escapeYaml(part.id)}"`,
        `    kind: "${escapeYaml(part.kind)}"`,
        `    title: "${escapeYaml(part.title)}"`,
        ...(part.alternativeTitles?.length ? [`    alt_titles: ${JSON.stringify(part.alternativeTitles)}`] : []),
        `    volume: ${part.volumeNumber ?? 'null'}`,
        `    chapter_current: ${part.chapterCurrent ?? 0}`,
        `    chapter_total: ${part.chapterTotal ?? 'null'}`,
        `    status: "${escapeYaml(part.status)}"`,
    ].join('\n')).join('\n');
}

export async function imageUrlExists(url: string): Promise<boolean> {
    if (!url) return false;

    try {
        const response = await requestUrlSafely({ url, method: 'HEAD' });
        return response.status >= 200 && response.status < 300;
    } catch {
        return false;
    }
}

function escapeYaml(value: unknown): string {
    if (value === null || value === undefined) return '';
    return JSON.stringify(String(value)).slice(1, -1);
}

export function isRateLimitError(error: unknown): boolean {
    return hasHttpStatus(error, 429)
        || errorMessageIncludes(error, ['rate limit', 'too many requests']);
}

export function isProviderBlockedError(error: unknown): boolean {
    return isRateLimitError(error)
        || hasHttpStatus(error, 403)
        || errorMessageIncludes(error, ['temporarily blocked', 'access denied']);
}

/**
 * Clears in-memory request pacing state. Intended for test isolation only.
 */
export function resetIntegrationRequestStateForTests(): void {
    requestStates.clear();
    clearIntegrationDiagnostics();
}

export function getActiveIntegrationCooldowns(now = Date.now()): IntegrationCooldownSnapshot[] {
    const cooldowns: IntegrationCooldownSnapshot[] = [];
    for (const [origin, state] of requestStates) {
        const remainingMs = state.blockedUntil - now;
        if (remainingMs <= 0 || state.blockedStatus === null) continue;
        cooldowns.push({
            provider: getProviderLabel(origin),
            host: safeHostname(origin),
            status: state.blockedStatus,
            until: state.blockedUntil,
            remainingMs,
        });
    }
    return cooldowns.sort((a, b) => a.until - b.until);
}

async function requestUrlSafely(options: RequestUrlOptions): Promise<RequestUrlResponse> {
    const url = typeof options === 'string' ? options : options.url;
    const method = typeof options === 'string' ? 'GET' : options.method ?? 'GET';
    const origin = getRequestOrigin(url);
    const state = getRequestState(origin);
    const release = await acquireRequestSlot(state);

    try {
        try {
            throwIfCircuitOpen(origin, state);
        } catch (error) {
            recordIntegrationDiagnostic({
                url,
                origin,
                method,
                status: readHttpStatus(error),
                outcome: 'blocked',
                durationMs: 0,
                attempt: 1,
                source: 'circuit',
            });
            throw error;
        }
        await waitUntil(state.nextAllowedAt);

        let retryCount = 0;
        while (true) {
            const attemptStartedAt = Date.now();
            try {
                const response = await requestWithDeadline(() => requestUrl(options));
                state.nextAllowedAt = Date.now() + getRequestIntervalMs(origin);
                if (response.status >= 400) {
                    throw createHttpError(response.status, origin, readRetryAfterMs(response.headers));
                }
                state.blockedUntil = 0;
                state.blockedStatus = null;
                recordIntegrationDiagnostic({
                    url,
                    origin,
                    method,
                    status: response.status,
                    outcome: 'success',
                    durationMs: Date.now() - attemptStartedAt,
                    attempt: retryCount + 1,
                });
                return response;
            } catch (error) {
                state.nextAllowedAt = Date.now() + getRequestIntervalMs(origin);
                const normalized = normalizeRequestError(error, origin);
                registerProviderBlock(state, normalized);
                const cancelled = error instanceof Error && error.name === 'AbortError';
                const willRetry = !(error instanceof RequestTimeoutError) && !cancelled
                    && shouldRetryTransient(normalized.status, retryCount, origin);
                const isExpectedProbeMiss = method === 'HEAD' && normalized.status === 404;
                if (!isExpectedProbeMiss) {
                    recordIntegrationDiagnostic({
                        url,
                        origin,
                        method,
                        status: normalized.status,
                        outcome: willRetry
                            ? 'retry'
                            : normalized.status === 403 || normalized.status === 429
                                ? 'blocked'
                                : 'error',
                        durationMs: Date.now() - attemptStartedAt,
                        attempt: retryCount + 1,
                    });
                }
                if (willRetry) {
                    retryCount++;
                    await waitForTransientRetry(retryCount, normalized.status, origin);
                    continue;
                }
                throw normalized;
            }
        }
    } finally {
        release();
    }
}

function getRequestState(origin: string): RequestState {
    const existing = requestStates.get(origin);
    if (existing) return existing;
    const created: RequestState = {
        tail: Promise.resolve(),
        nextAllowedAt: 0,
        blockedUntil: 0,
        blockedStatus: null,
    };
    requestStates.set(origin, created);
    return created;
}

async function acquireRequestSlot(state: RequestState): Promise<() => void> {
    const previous = state.tail;
    let release!: () => void;
    state.tail = new Promise<void>((resolve) => {
        release = resolve;
    });
    await previous.catch(() => undefined);
    return release;
}

function throwIfCircuitOpen(origin: string, state: RequestState): void {
    const remaining = state.blockedUntil - Date.now();
    if (remaining <= 0) {
        state.blockedUntil = 0;
        state.blockedStatus = null;
        return;
    }
    throw createHttpError(state.blockedStatus ?? 429, origin, remaining);
}

function registerProviderBlock(state: RequestState, error: IntegrationRequestError): void {
    if (error.status !== 403 && error.status !== 429) return;
    if (error.status === 403 && safeHostname(error.origin) === 'api.hardcover.app') return;
    const fallback = error.status === 403 ? DEFAULT_FORBIDDEN_BLOCK_MS : DEFAULT_RATE_LIMIT_BLOCK_MS;
    const blockMs = Math.min(MAX_RETRY_AFTER_MS, Math.max(error.retryAfterMs, fallback));
    state.blockedUntil = Math.max(state.blockedUntil, Date.now() + blockMs);
    state.blockedStatus = error.status;
}

function normalizeRequestError(error: unknown, origin: string): IntegrationRequestError {
    if (error instanceof IntegrationRequestError) return error;
    const status = readHttpStatus(error);
    const retryAfterMs = readErrorRetryAfterMs(error);
    if (status > 0) return createHttpError(status, origin, retryAfterMs);
    const message = error instanceof Error && error.message
        ? error.message
        : 'Integration request failed.';
    const normalized = new IntegrationRequestError(message, 0, origin);
    if (error instanceof Error && error.stack) normalized.stack = error.stack;
    return normalized;
}

function createHttpError(status: number, origin: string, retryAfterMs = 0): IntegrationRequestError {
    const provider = getProviderLabel(origin);
    const waitText = retryAfterMs > 0 ? ` Try again in ${formatWaitTime(retryAfterMs)}.` : '';
    if (status === 403) {
        if (safeHostname(origin) === 'api.hardcover.app') {
            return new IntegrationRequestError(
                'Hardcover rejected the API token (HTTP 403). Create or update the token with read:catalog or read:catalog:search permission in Hardcover settings.',
                status,
                origin,
                retryAfterMs
            );
        }
        return new IntegrationRequestError(
            `${provider} temporarily denied requests (HTTP 403). Automatic requests were paused to prevent a longer block.${waitText || ' Try again in about 15 minutes.'}`,
            status,
            origin,
            retryAfterMs
        );
    }
    if (status === 429) {
        return new IntegrationRequestError(
            `${provider} rate limit reached (HTTP 429). Automatic requests were paused.${waitText || ' Try again in about a minute.'}`,
            status,
            origin,
            retryAfterMs
        );
    }
    return new IntegrationRequestError(`${provider} request failed (HTTP ${status}).`, status, origin, retryAfterMs);
}

function preserveHttpMetadata(error: unknown, message: string): Error {
    const status = readHttpStatus(error);
    if (status <= 0) return new Error(message);
    const value = error as { origin?: unknown; retryAfterMs?: unknown };
    return new IntegrationRequestError(
        message,
        status,
        typeof value.origin === 'string' ? value.origin : '',
        typeof value.retryAfterMs === 'number' ? value.retryAfterMs : 0
    );
}

function shouldRetryTransient(status: number, retryCount: number, origin: string): boolean {
    if (safeHostname(origin) === 'api.mangaupdates.com' && (status === 429 || status === 503)) {
        return retryCount < 4;
    }
    return retryCount < 2 && (status === 0 || RETRYABLE_STATUS_CODES.has(status));
}

async function waitForTransientRetry(retryCount: number, status: number, origin: string): Promise<void> {
    const isMangaUpdatesBackoff = safeHostname(origin) === 'api.mangaupdates.com'
        && (status === 429 || status === 503);
    const delayMs = isMangaUpdatesBackoff
        ? [2_000, 4_000, 8_000, 16_000][Math.min(3, Math.max(0, retryCount - 1))]
        : Math.min(4_000, 500 * (2 ** (retryCount - 1)));
    await waitUntil(Date.now() + delayMs);
}

function getRequestIntervalMs(origin: string): number {
    const hostname = safeHostname(origin);
    if (hostname === 'store.steampowered.com') return 750;
    if (hostname.endsWith('steamcommunity.com')) return 750;
    if (hostname.endsWith('steampowered.com')) return 350;
    if (hostname === 'api.vndb.org') return 1_600;
    if (hostname === 'api.mangaupdates.com') return 1_000;
    if (hostname === 'comicvine.gamespot.com') return 1_000;
    if (hostname === 'graphql.anilist.co') return 350;
    if (hostname === 'kitsu.io' || hostname === 'kitsu.app') return 250;
    if (hostname.endsWith('mangadex.org')) return 250;
    if (hostname === 'openlibrary.org') return 1100;
    if (hostname.endsWith('googleapis.com')) return 250;
    return DEFAULT_REQUEST_INTERVAL_MS;
}

function getRequestOrigin(url: string): string {
    try {
        return new URL(url).origin;
    } catch {
        return 'unknown integration';
    }
}

function safeHostname(origin: string): string {
    try {
        return new URL(origin).hostname.toLowerCase();
    } catch {
        return '';
    }
}

function getProviderLabel(origin: string): string {
    const hostname = safeHostname(origin);
    if (hostname.includes('steam')) return 'Steam';
    if (hostname.includes('rawg')) return 'RAWG';
    if (hostname.includes('igdb') || hostname.includes('twitch')) return 'IGDB';
    if (hostname.includes('anilist')) return 'AniList';
    if (hostname.includes('kitsu')) return 'Kitsu';
    if (hostname.includes('shikimori')) return 'Shikimori';
    if (hostname.includes('themoviedb')) return 'TMDB';
    if (hostname.includes('tvmaze')) return 'TVmaze';
    if (hostname.includes('omdbapi')) return 'OMDb';
    if (hostname.includes('hardcover')) return 'Hardcover';
    if (hostname === 'openlibrary.org') return 'Open Library';
    if (hostname.includes('googleapis')) return 'Google Books';
    if (hostname.includes('mangaupdates')) return 'MangaUpdates';
    if (hostname.includes('mangadex')) return 'MangaDex';
    if (hostname === 'comicvine.gamespot.com') return 'Comic Vine';
    return 'Provider';
}

function readHttpStatus(error: unknown): number {
    if (!error || typeof error !== 'object') {
        if (error instanceof Error) return readStatusFromMessage(error.message);
        return 0;
    }
    const value = error as { status?: unknown; statusCode?: unknown; cause?: unknown };
    const direct = Number(value.status ?? value.statusCode);
    if (Number.isInteger(direct) && direct >= 100 && direct <= 599) return direct;
    if (value.cause && value.cause !== error) {
        const caused = readHttpStatus(value.cause);
        if (caused) return caused;
    }
    return error instanceof Error ? readStatusFromMessage(error.message) : 0;
}

function readStatusFromMessage(message: string): number {
    const match = message.match(/\b(?:http(?:\s+status)?|status(?:\s+code)?)\s*:?\s*(\d{3})\b/i);
    return match ? Number(match[1]) : 0;
}

function hasHttpStatus(error: unknown, status: number): boolean {
    return readHttpStatus(error) === status;
}

function errorMessageIncludes(error: unknown, terms: string[]): boolean {
    if (!(error instanceof Error)) return false;
    const message = error.message.toLowerCase();
    return terms.some((term) => message.includes(term));
}

function readErrorRetryAfterMs(error: unknown): number {
    if (!error || typeof error !== 'object') return 0;
    const value = error as {
        retryAfterMs?: unknown;
        headers?: unknown;
        response?: { headers?: unknown };
    };
    if (typeof value.retryAfterMs === 'number') return value.retryAfterMs;
    return readRetryAfterMs(value.headers) || readRetryAfterMs(value.response?.headers);
}

function readRetryAfterMs(headers: unknown): number {
    if (!headers || typeof headers !== 'object') return 0;
    const entries = Object.entries(headers as Record<string, unknown>);
    const raw = entries.find(([key]) => key.toLowerCase() === 'retry-after')?.[1];
    if (raw === undefined || raw === null) return 0;
    const value = String(raw).trim();
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) {
        return Math.min(MAX_RETRY_AFTER_MS, Math.round(seconds * 1000));
    }
    const date = Date.parse(value);
    return Number.isFinite(date)
        ? Math.min(MAX_RETRY_AFTER_MS, Math.max(0, date - Date.now()))
        : 0;
}

function formatWaitTime(milliseconds: number): string {
    const seconds = Math.max(1, Math.ceil(milliseconds / 1000));
    if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;
    const minutes = Math.ceil(seconds / 60);
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

async function waitUntil(timestamp: number): Promise<void> {
    const delayMs = timestamp - Date.now();
    if (delayMs <= 0) return;
    await new Promise<void>((resolve) => window.setTimeout(resolve, delayMs));
}
