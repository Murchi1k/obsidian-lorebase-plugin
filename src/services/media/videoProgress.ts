import { AnimePart, AnimeStatus, VideoPart, VideoStatus } from '../../types';
import { resizeEpisodeSelection, normalizeEpisodePart } from './episodeTracking';

/** Keep manual input, episode buttons and steppers consistent with the part status. */
export function setPartEpisodeCurrent(part: AnimePart | VideoPart, value: number): void {
    if (!Number.isFinite(value)) return;
    normalizeEpisodePart(part);
    const total = part.episodeTotal && part.episodeTotal > 0 ? part.episodeTotal : Infinity;
    const current = Math.min(Math.max(0, Math.trunc(value)), total);
    part.episodeCurrent = current;
    resizeEpisodeSelection(part, current);
    normalizeEpisodePart(part);
    if (current === total) part.status = 'completed';
    else if (part.status === 'completed') part.status = current > 0 ? 'watching' : 'planned';
    else if (current > 0 && (part.status === 'planned' || part.status === 'paused' || part.status === 'to_be_released')) part.status = 'watching';
}

function fillCompletedProgress(part: AnimePart | VideoPart): void {
    if (part.episodeTotal !== null) {
        part.episodeCurrent = part.episodeTotal;
        if (part.watchedEpisodes !== undefined) part.watchedEpisodes = [];
        resizeEpisodeSelection(part, part.episodeTotal);
    }
}

export function completeWatchingParts<T extends AnimePart | VideoPart>(parts: readonly T[]): T[] {
    return parts.map(part => {
        const next = { ...part, ...(part.watchedEpisodes !== undefined ? { watchedEpisodes: [...part.watchedEpisodes] } : {}) };
        next.status = 'completed';
        fillCompletedProgress(next);
        return next;
    });
}

export function setVideoPartStatus(part: VideoPart, status: VideoStatus): void {
    part.status = status;
    if (status === 'completed') fillCompletedProgress(part);
}

export function setAnimePartStatus(part: AnimePart, status: AnimeStatus): void {
    part.status = status;
    if (status === 'completed') fillCompletedProgress(part);
}
