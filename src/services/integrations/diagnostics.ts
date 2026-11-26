export type IntegrationDiagnosticOutcome =
    | 'success'
    | 'error'
    | 'blocked'
    | 'retry'
    | 'created'
    | 'updated'
    | 'skipped'
    | 'cancelled';

export interface IntegrationDiagnosticEvent {
    id: number;
    timestamp: number;
    provider: string;
    host: string;
    method: string;
    endpoint: string;
    status: number;
    outcome: IntegrationDiagnosticOutcome;
    durationMs: number;
    attempt: number;
    source: 'network' | 'circuit';
    kind: 'request' | 'process';
    operation: string;
    itemLabel: string;
    itemId: string;
    detail: string;
}

export interface IntegrationDiagnosticInput {
    timestamp?: number;
    url: string;
    origin: string;
    method: string;
    status: number;
    outcome: IntegrationDiagnosticOutcome;
    durationMs: number;
    attempt: number;
    source?: 'network' | 'circuit';
    kind?: 'request' | 'process';
    operation?: string;
    itemLabel?: string;
    itemId?: string;
    detail?: string;
}

export interface IntegrationCooldownSnapshot {
    provider: string;
    host: string;
    status: number;
    until: number;
    remainingMs: number;
}

const MAX_DIAGNOSTIC_EVENTS = 2_000;
const diagnosticEvents: IntegrationDiagnosticEvent[] = [];
const SAFE_ENDPOINT_SEGMENTS = new Set([
    'api', 'v1', 'v2', 'v3', 'v4', 'graphql', 'search', 'results',
    'app', 'apps', 'appdetails', 'details', 'games', 'animes', 'mangas', 'manga',
    'movie', 'tv', 'shows', 'books', 'volumes', 'wishlist', 'profiles', 'wishlistdata',
    'cover', 'covers', 'aggregate', 'related', 'seasons', 'episodes', 'oauth2', 'token',
    'grids', 'steam', 'iwishlistservice', 'getwishlist', 'isteamuserstats', 'getownedgames',
    'manga.php',
]);
let nextDiagnosticId = 1;

export function recordIntegrationDiagnostic(input: IntegrationDiagnosticInput): void {
    const host = safeHostname(input.origin);
    diagnosticEvents.push({
        id: nextDiagnosticId++,
        timestamp: input.timestamp ?? Date.now(),
        provider: getDiagnosticProviderLabel(host),
        host,
        method: normalizeMethod(input.method),
        endpoint: sanitizeDiagnosticEndpoint(input.url),
        status: normalizeStatus(input.status),
        outcome: input.outcome,
        durationMs: Math.max(0, Math.round(input.durationMs)),
        attempt: Math.max(1, Math.round(input.attempt)),
        source: input.source ?? 'network',
        kind: input.kind ?? 'request',
        operation: sanitizeDiagnosticLabel(input.operation ?? '', 48),
        itemLabel: sanitizeDiagnosticLabel(input.itemLabel ?? '', 120),
        itemId: sanitizeDiagnosticId(input.itemId ?? ''),
        detail: sanitizeDiagnosticDetail(input.detail ?? ''),
    });
    if (diagnosticEvents.length > MAX_DIAGNOSTIC_EVENTS) {
        diagnosticEvents.splice(0, diagnosticEvents.length - MAX_DIAGNOSTIC_EVENTS);
    }
}

export function getIntegrationDiagnostics(): IntegrationDiagnosticEvent[] {
    return diagnosticEvents.map((event) => ({ ...event }));
}

export function clearIntegrationDiagnostics(): void {
    diagnosticEvents.length = 0;
}

export function buildIntegrationDiagnosticReport(
    cooldowns: IntegrationCooldownSnapshot[] = [],
    now = Date.now(),
    events: IntegrationDiagnosticEvent[] = diagnosticEvents
): string {
    const lines = [
        'LOREBASE Integration Diagnostics',
        `Generated: ${new Date(now).toISOString()}`,
        `Events: ${events.length}`,
        '',
        'Active cooldowns:',
    ];

    if (!cooldowns.length) {
        lines.push('- none');
    } else {
        for (const cooldown of cooldowns) {
            lines.push(
                `- ${cooldown.provider} (${cooldown.host}) · HTTP ${cooldown.status} · ${formatDuration(cooldown.remainingMs)} remaining`
            );
        }
    }

    lines.push('', 'Recent requests and imports:');
    if (!events.length) {
        lines.push('- none');
    } else {
        for (const event of events) {
            const status = event.status > 0 ? `HTTP ${event.status}` : 'network';
            if (event.kind === 'process') {
                const item = event.itemLabel
                    ? ` · ${event.itemLabel}${event.itemId ? ` (${event.itemId})` : ''}`
                    : '';
                const detail = event.detail ? ` · ${event.detail}` : '';
                lines.push(
                    `- ${new Date(event.timestamp).toISOString()} · ${event.provider} · ${event.operation || 'process'}${item} · ${event.outcome} · ${event.durationMs}ms${detail}`
                );
            } else {
                lines.push(
                    `- ${new Date(event.timestamp).toISOString()} · ${event.provider} · ${event.method} ${event.endpoint} · ${event.outcome} · ${status} · ${event.durationMs}ms · attempt ${event.attempt}${event.source === 'circuit' ? ' · local circuit' : ''}`
                );
            }
        }
    }

    lines.push('', 'Privacy: query parameters, search terms, request bodies, headers, API keys, and tokens are not recorded.');
    return lines.join('\n');
}

export function sanitizeDiagnosticEndpoint(url: string): string {
    try {
        const parsed = new URL(url);
        const path = parsed.pathname || '/';
        return path
            .split('/')
            .map((segment) => sanitizePathSegment(segment))
            .join('/')
            .slice(0, 180) || '/';
    } catch {
        return '/';
    }
}

export function getDiagnosticProviderLabel(host: string): string {
    const normalized = host.toLowerCase();
    if (normalized.includes('steamgriddb')) return 'SteamGridDB';
    if (normalized.includes('steam')) return 'Steam';
    if (normalized.includes('rawg')) return 'RAWG';
    if (normalized.includes('igdb') || normalized.includes('twitch')) return 'IGDB';
    if (normalized.includes('anilist')) return 'AniList';
    if (normalized.includes('kitsu')) return 'Kitsu';
    if (normalized.includes('shikimori')) return 'Shikimori';
    if (normalized.includes('themoviedb')) return 'TMDB';
    if (normalized.includes('tvmaze')) return 'TVmaze';
    if (normalized.includes('omdbapi')) return 'OMDb';
    if (normalized.includes('hardcover')) return 'Hardcover';
    if (normalized.includes('googleapis')) return 'Google Books';
    if (normalized.includes('mangaupdates')) return 'MangaUpdates';
    if (normalized.includes('mangadex')) return 'MangaDex';
    if (normalized === 'comicvine.gamespot.com') return 'Comic Vine';
    if (normalized.includes('myanimelist')) return 'MyAnimeList';
    if (normalized.includes('howlongtobeat')) return 'HowLongToBeat';
    return normalized || 'Provider';
}

function sanitizePathSegment(segment: string): string {
    if (!segment) return '';
    const decoded = safeDecode(segment);
    if (/^\d+$/.test(decoded)) return ':id';
    if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(decoded)) return ':id';
    if (/^[0-9a-f]{20,}$/i.test(decoded)) return ':id';
    if (decoded.length > 48) return ':value';
    const normalized = decoded.replace(/[^\w.@()+~-]/g, '_');
    return SAFE_ENDPOINT_SEGMENTS.has(normalized.toLowerCase()) ? normalized : ':value';
}

function safeDecode(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function safeHostname(origin: string): string {
    try {
        return new URL(origin).hostname.toLowerCase();
    } catch {
        return '';
    }
}

function normalizeMethod(method: string): string {
    const normalized = method.trim().toUpperCase();
    return /^(GET|POST|HEAD)$/.test(normalized) ? normalized : 'GET';
}

function normalizeStatus(status: number): number {
    return Number.isInteger(status) && status >= 100 && status <= 599 ? status : 0;
}

function sanitizeDiagnosticLabel(value: string, maxLength: number): string {
    return value
        .split('')
        .map((character) => isControlCharacter(character) ? ' ' : character)
        .join('')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);
}

function isControlCharacter(character: string): boolean {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
}

function sanitizeDiagnosticId(value: string): string {
    const normalized = value.trim();
    return /^[\w.-]{1,64}$/.test(normalized) ? normalized : '';
}

function sanitizeDiagnosticDetail(value: string): string {
    const withoutUrls = value.replace(/https?:\/\/[^\s)]+/gi, '[request URL omitted]');
    const withoutCredentials = withoutUrls.replace(
        /\b(api[_ -]?key|token|authorization|client[_ -]?secret|password)\b\s*[:=]\s*[^\s,;]+/gi,
        '$1=[hidden]'
    );
    return sanitizeDiagnosticLabel(withoutCredentials, 240);
}

function formatDuration(milliseconds: number): string {
    const seconds = Math.max(1, Math.ceil(milliseconds / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.ceil(seconds / 60);
    return `${minutes}m`;
}
