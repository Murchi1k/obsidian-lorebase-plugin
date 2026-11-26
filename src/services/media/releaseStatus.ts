import type { MediaItem, MediaStatus } from '../../types';
import { getReleaseDate, parseReleaseDate } from '../../views/library/releaseCalendar';
import { getItemReleaseWindow, normalizeReleaseDate, parseReleaseWindow } from '../../utils/releaseDates';

export function isFutureReleaseDate(value: unknown, now = new Date()): boolean {
    const window = parseReleaseWindow(normalizeReleaseDate(value));
    if (window) return Boolean(window.start && window.start.getTime() > new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime());
    const exact = parseReleaseDate(value);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (exact) return exact.getTime() > today;
    const partial = typeof value === 'string' ? value.trim().match(/^(\d{4})(?:[-/.](\d{1,2}))?$/) : null;
    if (!partial) return false;
    const month = partial[2] ? Number(partial[2]) : 1;
    if (month < 1 || month > 12) return false;
    return new Date(Number(partial[1]), month - 1, 1).getTime() > today;
}

/** Only waiting and untouched titles participate; progress and user statuses win. */
export function getNextReleaseStatus(item: MediaItem, now = new Date()): MediaStatus {
    const idle = item.type === 'game' ? 'not_started' : 'planned';
    if (item.status !== idle && item.status !== 'to_be_released') return item.status;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const exact = getReleaseDate(item);
    if (exact) return exact.getTime() > today ? 'to_be_released' : idle;
    const window = getItemReleaseWindow(item);
    if (window) {
        if (!window.start || !window.end) return item.status;
        if (window.start.getTime() > today) return 'to_be_released';
        if (window.end.getTime() <= today) return idle;
        return item.status;
    }

    // Partial dates describe a window, not a January 1 release. Do not mark a
    // title released until the whole known window is past.
    const raw = item.releaseDate?.trim() || '';
    const partial = raw.match(/^(\d{4})(?:[-/.](\d{1,2}))?$/);
    const year = partial ? Number(partial[1]) : !raw ? item.year : null;
    const month = partial?.[2] ? Number(partial[2]) : null;
    if (!year || (month !== null && (month < 1 || month > 12))) return item.status;
    const first = new Date(year, month === null ? 0 : month - 1, 1).getTime();
    const end = new Date(year, month === null ? 12 : month, 1).getTime();
    if (first > today) return 'to_be_released';
    if (end <= today) return idle;
    return item.status;
}
