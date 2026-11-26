import type { EpisodeTrackingState } from '../../types';
import { normalizeWatchedEpisodes } from './episodeTracking';

export interface WatchablePart extends EpisodeTrackingState {
    episodeCurrent: number | null;
    episodeTotal: number | null;
    /** Average minutes per episode, or the runtime for a one-episode film. */
    episodeDuration?: number | null;
}

const count = (value: number | null | undefined): number =>
    typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;

/** Unknown totals must not make an unfinished collection appear complete. */
export function getWatchProgress(parts: readonly WatchablePart[]) {
    let current = 0;
    let total = 0;
    let watchedMinutes = 0;
    let remainingMinutes = 0;
    let totalsKnown = parts.length > 0;
    let watchedKnown = parts.length > 0;
    let remainingKnown = parts.length > 0;
    for (const part of parts) {
        const episodes = count(part.episodeTotal);
        const checked = part.watchedEpisodes !== undefined ? new Set(normalizeWatchedEpisodes(part.watchedEpisodes)) : null;
        const recorded = checked ? checked.size : count(part.episodeCurrent);
        const watched = episodes > 0 ? Math.min(recorded, episodes) : recorded;
        const duration = typeof part.episodeDuration === 'number' && Number.isFinite(part.episodeDuration) && part.episodeDuration > 0
            ? part.episodeDuration : null;
        current += watched;
        total += episodes;
        if (!episodes) { totalsKnown = false; remainingKnown = false; }
        if (part.episodeDetails?.length) {
            let watchedTime = duration !== null ? watched * duration : 0;
            let remainingTime = duration !== null ? Math.max(0, episodes - watched) * duration : 0;
            let knownWatched = 0, knownRemaining = 0;
            const seen = new Set<number>();
            for (const info of part.episodeDetails) {
                if (seen.has(info.number) || info.number < 1 || !info.duration || !Number.isFinite(info.duration) || info.duration <= 0) continue;
                seen.add(info.number);
                const isWatched = checked ? checked.has(info.number) : info.number <= watched;
                if (isWatched) { watchedTime += info.duration - (duration || 0); knownWatched++; }
                else if (episodes && info.number <= episodes) { remainingTime += info.duration - (duration || 0); knownRemaining++; }
            }
            watchedMinutes += watchedTime; remainingMinutes += remainingTime;
            if (duration === null && knownWatched < watched) watchedKnown = false;
            if (duration === null && knownRemaining < episodes - watched) remainingKnown = false;
        } else if (duration !== null) {
            watchedMinutes += watched * duration;
            remainingMinutes += Math.max(0, episodes - watched) * duration;
        } else {
            if (watched > 0) watchedKnown = false;
            if (episodes > watched) remainingKnown = false;
        }
    }
    return {
        current,
        total: totalsKnown ? total : null,
        percent: totalsKnown && total > 0 ? Math.round(current / total * 100) : null,
        watchedMinutes: watchedKnown ? Math.round(watchedMinutes) : null,
        remainingMinutes: remainingKnown ? Math.round(remainingMinutes) : null,
    };
}

/** Parse provider runtime strings without interpreting 'Unknown' as zero. */
export function parseEpisodeDuration(value: unknown): number | null {
    if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
    if (typeof value !== 'string') return null;
    const hours = value.match(/(\d+(?:\.\d+)?)\s*(?:hr|hour)/i);
    const minutes = value.match(/(\d+(?:\.\d+)?)\s*min/i);
    const result = hours || minutes
        ? Number(hours?.[1] ?? 0) * 60 + Number(minutes?.[1] ?? 0)
        : /^\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) : NaN;
    return Number.isFinite(result) && result > 0 ? result : null;
}
