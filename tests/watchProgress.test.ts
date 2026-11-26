import { describe, expect, it } from 'vitest';
import { getWatchProgress, parseEpisodeDuration } from '../src/services/media/watchProgress';

describe('watching time estimates', () => {
    it('weights the watched and remaining runtime of seasons and films separately', () => {
        expect(getWatchProgress([
            { episodeCurrent: 8, episodeTotal: 24, episodeDuration: 24 },
            { episodeCurrent: 1, episodeTotal: 1, episodeDuration: 90 },
        ])).toEqual({ current: 9, total: 25, percent: 36, watchedMinutes: 282, remainingMinutes: 384 });
    });
    it('does not claim a complete collection when a future part has an unknown episode count', () => {
        expect(getWatchProgress([
            { episodeCurrent: 10, episodeTotal: 10, episodeDuration: 24 },
            { episodeCurrent: 0, episodeTotal: null, episodeDuration: 24 },
        ])).toEqual({ current: 10, total: null, percent: null, watchedMinutes: 240, remainingMinutes: null });
    });
    it('keeps only fully calculable time estimates when a runtime is missing', () => {
        expect(getWatchProgress([{ episodeCurrent: 8, episodeTotal: 24 }])).toMatchObject({ percent: 33, watchedMinutes: null, remainingMinutes: null });
        expect(getWatchProgress([{ episodeCurrent: 0, episodeTotal: 24 }])).toMatchObject({ watchedMinutes: 0, remainingMinutes: null });
        expect(getWatchProgress([{ episodeCurrent: 24, episodeTotal: 24 }])).toMatchObject({ watchedMinutes: null, remainingMinutes: 0 });
    });
    it('bounds invalid legacy progress and treats zero totals as unknown', () => {
        expect(getWatchProgress([{ episodeCurrent: 50, episodeTotal: 24, episodeDuration: 24 }])).toMatchObject({ current: 24, percent: 100, remainingMinutes: 0 });
        expect(getWatchProgress([{ episodeCurrent: -5, episodeTotal: 0, episodeDuration: -1 }])).toMatchObject({ current: 0, total: null, remainingMinutes: null });
        expect(getWatchProgress([])).toMatchObject({ total: null, percent: null, watchedMinutes: null });
    });
    it.each([['24 min per ep', 24], ['1 hr 30 min', 90], ['2 hours', 120], [24, 24], ['Unknown', null], [0, null], [Infinity, null]])('reads provider runtime %s', (input, expected) => {
        expect(parseEpisodeDuration(input)).toBe(expected);
    });
});
