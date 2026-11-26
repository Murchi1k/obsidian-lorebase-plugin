import type { EpisodeInfo, EpisodeTrackingState } from '../../types';

export const MAX_EPISODE_NUMBER = 50000;
type Part = EpisodeTrackingState & { episodeCurrent: number | null; episodeTotal: number | null };
const number = (value: unknown): number | null => {
    const n = typeof value === 'number' || typeof value === 'string' && value.trim() ? Number(value) : NaN;
    return Number.isInteger(n) && n > 0 && n <= MAX_EPISODE_NUMBER ? n : null;
};
export function normalizeWatchedEpisodes(raw: unknown): number[] {
    return [...new Set((Array.isArray(raw) ? raw : []).map(number).filter((value): value is number => value !== null))].sort((a, b) => a - b);
}
export function normalizeEpisodeRatings(raw: unknown): Record<string, number> {
    const result: Record<string, number> = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
    for (const [key, value] of Object.entries(raw)) {
        const episode = number(key);
        const score = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value.replace(',', '.')) : NaN;
        if (episode && Number.isFinite(score) && score >= 1 && score <= 10 && Math.abs(score * 10 - Math.round(score * 10)) < 0.001) result[String(episode)] = Math.round(score * 10) / 10;
    }
    return result;
}
export function normalizeEpisodeDetails(raw: unknown): EpisodeInfo[] {
    const result = new Map<number, EpisodeInfo>();
    for (const value of Array.isArray(raw) ? raw : []) {
        if (!value || typeof value !== 'object') continue;
        const row = value as Record<string, unknown>, n = number(row.number ?? row.episode_number ?? row.episode);
        if (!n || result.has(n)) continue;
        const duration = Number(row.duration ?? row.runtime);
        result.set(n, { number: n, title: typeof row.title === 'string' ? row.title.trim() : '',
            ...(typeof (row.airDate ?? row.air_date) === 'string' && /^\d{4}-\d{2}-\d{2}/.test(String(row.airDate ?? row.air_date)) ? { airDate: String(row.airDate ?? row.air_date).slice(0, 10) } : {}),
            ...(Number.isFinite(duration) && duration > 0 ? { duration } : {}) });
    }
    return [...result.values()].sort((a, b) => a.number - b.number);
}
export function readEpisodeFields(source: Record<string, unknown>): EpisodeTrackingState {
    const watched = source.watchedEpisodes ?? source.watched_episodes;
    const mode = source.episodeTracking ?? source.episode_tracking;
    const details = source.episodeDetails ?? source.episodes;
    const ratings = source.episodeRatings ?? source.episode_ratings;
    return {
        ...(ratings && typeof ratings === 'object' ? { episodeRatings: normalizeEpisodeRatings(ratings) } : {}),
        ...(mode === 'count' || mode === 'episodes' ? { episodeTracking: mode } : Array.isArray(watched) ? { episodeTracking: 'episodes' as const } : {}),
        ...(Array.isArray(watched) ? { watchedEpisodes: normalizeWatchedEpisodes(watched) } : {}),
        ...(Array.isArray(details) ? { episodeDetails: normalizeEpisodeDetails(details) } : {}),
    };
}
export function episodeFields(part: EpisodeTrackingState): Record<string, unknown> {
    return {
        ...(part.episodeRatings !== undefined ? { episode_ratings: normalizeEpisodeRatings(part.episodeRatings) } : {}),
        ...(part.episodeTracking ? { episode_tracking: part.episodeTracking } : {}),
        ...(part.watchedEpisodes !== undefined ? { watched_episodes: normalizeWatchedEpisodes(part.watchedEpisodes) } : {}),
        ...(part.episodeDetails?.length ? { episodes: normalizeEpisodeDetails(part.episodeDetails).map(info => ({ number: info.number, title: info.title, ...(info.airDate ? { air_date: info.airDate } : {}), ...(info.duration ? { duration: info.duration } : {}) })) } : {}),
    };
}
export function watchedEpisodeNumbers(part: Part): number[] {
    if (part.watchedEpisodes !== undefined) return normalizeWatchedEpisodes(part.watchedEpisodes);
    const current = Math.min(MAX_EPISODE_NUMBER, Math.max(0, Math.trunc(part.episodeCurrent || 0)));
    return Array.from({ length: current }, (_, index) => index + 1);
}
export function enableEpisodeTracking(part: Part): void {
    part.watchedEpisodes = watchedEpisodeNumbers(part); part.episodeCurrent = part.watchedEpisodes.length; part.episodeTracking = 'episodes';
}
/** Counter edits add the earliest missing numbers and remove the highest watched
 * numbers. Existing gaps remain unless the user explicitly changes the count. */
export function resizeEpisodeSelection(part: Part, target: number): void {
    if (part.watchedEpisodes === undefined) return;
    const desired = Math.min(MAX_EPISODE_NUMBER, Math.max(0, Math.trunc(target)));
    const selected = new Set(watchedEpisodeNumbers(part).slice(0, desired));
    for (let n = 1; selected.size < desired && n <= MAX_EPISODE_NUMBER; n++) selected.add(n);
    part.watchedEpisodes = [...selected].sort((a, b) => a - b);
}
/** Never silently hide personal checks when a provider reports a smaller total. */
export function normalizeEpisodePart<T extends Part>(part: T): T {
    if (part.watchedEpisodes !== undefined) {
        part.watchedEpisodes = normalizeWatchedEpisodes(part.watchedEpisodes);
        part.episodeCurrent = part.watchedEpisodes.length;
        const last = part.watchedEpisodes[part.watchedEpisodes.length - 1] || 0;
        if (part.episodeTotal !== null && last > part.episodeTotal) part.episodeTotal = last;
    }
    return part;
}
export function mergeEpisodeDetails(existing: EpisodeInfo[] | undefined, incoming: EpisodeInfo[]): EpisodeInfo[] {
    const result = new Map(normalizeEpisodeDetails(incoming).map(info => [info.number, info]));
    for (const info of normalizeEpisodeDetails(existing)) {
        const received = result.get(info.number);
        result.set(info.number, { ...received, ...info, title: info.title || received?.title || '' });
    }
    return [...result.values()].sort((a, b) => a.number - b.number);
}
