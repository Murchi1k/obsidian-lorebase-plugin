import type { MediaType } from '../types';
import { normalizePlayStationTracking, object, text, type PlayStationTracking } from '../services/playstation/types';

export interface SyncSource { provider: 'playstation' | 'trakt'; id: string; url: string; }
export function playStationUrl(tracking: Pick<PlayStationTracking, 'conceptId'>): string {
    return tracking.conceptId ? 'https://store.playstation.com/concept/' + tracking.conceptId : 'https://library.playstation.com/recently-played';
}
export function syncSourceFromFrontmatter(type: MediaType, fm: Record<string, unknown>): SyncSource | undefined {
    if (type === 'game') {
        const psn = normalizePlayStationTracking(fm.playstation);
        if (psn) return { provider: 'playstation', id: psn.titleId, url: playStationUrl(psn) };
    }
    if (type === 'movie' || type === 'series') {
        const legacy = Object.values(object(fm.external_sync)).map(object).find(ref => ref.service === 'trakt');
        const id = text(fm.trakt_id || object(legacy?.ids).trakt || text(legacy?.id).split(':')[1]);
        const slug = text(fm.trakt_slug || object(legacy?.ids).slug);
        if (/^\d+$/.test(id)) return { provider: 'trakt', id, url: `https://trakt.tv/${type === 'series' ? 'shows' : 'movies'}/${encodeURIComponent(slug || id)}` };
    }
    return undefined;
}

/** Keep the sync origin as the note URL and retain catalog URLs independently. */
export function withSyncSourceUrl(type: MediaType, current: Record<string, unknown>, updates: Record<string, unknown>): Record<string, unknown> {
    const next = { ...current, ...updates }, source = syncSourceFromFrontmatter(type, next);
    if (!source) return updates;
    const result = { ...updates, url: source.url };
    const candidate = text(updates.url ?? current.url ?? current.source_url);
    if (/^https?:\/\//i.test(candidate) && !isSyncUrl(candidate)) Object.assign(result, { metadata_url: candidate });
    return result;
}
export function isSyncUrl(value: string): boolean {
    try { return /(^|\.)(playstation\.com|trakt\.tv)$/.test(new URL(value).hostname); } catch { return false; }
}
