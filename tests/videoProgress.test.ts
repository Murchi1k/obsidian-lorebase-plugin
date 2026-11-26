import { describe, expect, it } from 'vitest';
import { AnimePart, VideoPart } from '../src/types';
import { setAnimePartStatus, setVideoPartStatus } from '../src/services/media/videoProgress';

function createSeason(current: number | null, total: number | null): VideoPart {
    return {
        id: 'season-1',
        kind: 'season',
        title: 'Season 1',
        seasonNumber: 1,
        episodeCurrent: current,
        episodeTotal: total,
        status: 'planned',
    };
}

describe('video part progress', () => {
    it('fills watched episodes when a season is completed', () => {
        const season = createSeason(0, 22);

        setVideoPartStatus(season, 'completed');

        expect(season.status).toBe('completed');
        expect(season.episodeCurrent).toBe(22);
    });

    it('keeps progress unchanged when the episode total is unknown', () => {
        const season = createSeason(4, null);

        setVideoPartStatus(season, 'completed');

        expect(season.episodeCurrent).toBe(4);
    });

    it('fills watched episodes when an anime part is completed', () => {
        const part: AnimePart = {
            id: 'tv-1',
            title: 'TV',
            kind: 'TV',
            seasonNumber: 1,
            episodeCurrent: 0,
            episodeTotal: 24,
            status: 'planned',
        };

        setAnimePartStatus(part, 'completed');

        expect(part.status).toBe('completed');
        expect(part.episodeCurrent).toBe(24);
    });
});
