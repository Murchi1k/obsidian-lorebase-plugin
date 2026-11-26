import { describe, expect, it, vi } from 'vitest';
import type { MediaItem, MediaType } from '../src/types';
import { defaultStatFilters, filterStatRecords, makeStatRecord, rankStatRecords, STAT_MEDIA, statDate, statTimeline, summarizeStatRecords } from '../src/services/media/statistics';
import { loadStatisticsLibrary } from '../src/services/StatisticsService';

export function statItem(type: MediaType, patch: Record<string, unknown> = {}): MediaItem {
    return { type, filePath: `${type}.md`, displayName: type, nameLower: type, status: type === 'game' ? 'not_started' : 'planned', userRating: null, favorite: false, year: null, genres: [], tags: [], rawFields: {}, parts: [], episodeCurrent: 0, episodeTotal: null, pageCurrent: null, pageTotal: null, chapterCurrent: null, chapterTotal: null, volumeCurrent: null, volumeTotal: null, musicKind: 'album', tracks: [], artist: '', duration: null, ...patch } as unknown as MediaItem;
}
describe('global statistics calculations', () => {
    it('keeps all seven media types and does not count parts or DLC as titles', () => {
        const rows = STAT_MEDIA.map(type => makeStatRecord(statItem(type, { parts: [{ episodeCurrent: 0, episodeTotal: 1, chapterCurrent: 0, chapterTotal: 1 }], dlc: [{ id: '1' }] })));
        expect(summarizeStatRecords(rows).total).toBe(7);
    });
    it('uses rated titles only and gives unknown ratings an empty average', () => {
        const rows = [5, null, 3].map((userRating, i) => makeStatRecord(statItem('movie', { filePath: `${i}.md`, userRating })));
        expect(summarizeStatRecords(rows)).toMatchObject({ rated: 2, average: 4 });
        expect(summarizeStatRecords(rows.slice(1, 2)).average).toBeNull();
    });
    it('uses sparse episode marks and exact runtimes, retaining known time from partial catalogs', () => {
        const row = makeStatRecord(statItem('anime', { parts: [
            { episodeCurrent: 99, episodeTotal: 3, watchedEpisodes: [1, 3], episodeDuration: 20, episodeDetails: [{ number: 1, title: 'First', duration: 10 }, { number: 3, title: 'Third', duration: 40 }] },
            { episodeCurrent: 1, episodeTotal: 2, episodeDuration: null },
        ] }));
        expect(row).toMatchObject({ episodes: 3, watched: 50, remaining: 20, partialWatch: true, partialRemaining: true });
        expect(summarizeStatRecords([row])).toMatchObject({ watched: 50, watchUnknown: 1, remainingUnknown: 1 });
    });
    it('keeps game progress, achievement percentages and recorded lifetime time independent', () => {
        const item = statItem('game', { progressPercent: 90, playtimeMinutes: 180, achievementsUnlocked: 3, achievementsTotal: 30, repeatCount: 2 });
        const snapshot = JSON.stringify(item);
        expect(summarizeStatRecords([makeStatRecord(item)])).toMatchObject({ played: 180, achievements: 3, achievementTotal: 30, repeats: 2 });
        expect(JSON.stringify(item)).toBe(snapshot);
        expect(makeStatRecord(statItem('game', { achievementsTotal: 30, achievementsUnlocked: null }))).toMatchObject({ achievementKnown: false, achievementTotal: 0 });
    });
    it('does not turn missing game time into a recorded zero', () => {
        expect(summarizeStatRecords([makeStatRecord(statItem('game'))])).toMatchObject({ played: 0, playedKnown: 0 });
        expect(summarizeStatRecords([makeStatRecord(statItem('game', { playtimeMinutes: 0 }))])).toMatchObject({ played: 0, playedKnown: 1 });
    });
    it('counts film duration once and shows repeats separately', () => {
        expect(summarizeStatRecords([makeStatRecord(statItem('movie', { status: 'completed', runtime: '100 min', repeatCount: 2 }))])).toMatchObject({ watched: 100, repeats: 2, remaining: 0 });
    });
    it('does not count an extracted song twice alongside its listened album track', () => {
        const album = makeStatRecord(statItem('music', { filePath: 'album.md', tracks: [{ id: '1', duration: 120, listened: true, artist: 'Artist' }] }));
        const track = makeStatRecord(statItem('music', { filePath: 'track.md', musicKind: 'track', status: 'completed', duration: 120, parentAlbum: 'album.md', parentTrackId: '1' }));
        expect(summarizeStatRecords([album, track])).toMatchObject({ total: 2, listened: 2 });
        expect(summarizeStatRecords([track]).listened).toBe(2);
    });
    it('uses manga volume progress without adding its parent counters again', () => {
        const row = makeStatRecord(statItem('manga', { chapterCurrent: 999, chapterTotal: 999, parts: [{ chapterCurrent: 10, chapterTotal: 10 }, { chapterCurrent: 5, chapterTotal: 20 }] }));
        expect(row).toMatchObject({ chapters: 15, chapterTotal: 30 });
        expect(makeStatRecord(statItem('book', { pageCurrent: 90, pageTotal: 80 }))).toMatchObject({ pages: 80, pageTotal: 80 });
    });
    it('does not invent completion dates from creation times or invalid calendar dates', () => {
        const ctime = new Date(2026, 9, 1).getTime();
        const row = makeStatRecord(statItem('movie', { status: 'completed', rawFields: { finished: '2026-02-30' } }), ctime);
        expect(row.added).toBe(ctime); expect(row.finished).toBeNull(); expect(statDate('2026')).toBeNull(); expect(statDate(true)).toBeNull();
        expect(summarizeStatRecords([row]).missingDates).toBe(1);
    });
    it('applies media, status, personal rating, facet and date filters together', () => {
        const rows = [
            makeStatRecord(statItem('game', { status: 'playing', favorite: true, userRating: 5, genres: ['RPG'], rawFields: { date_added: '2026-02-01' } })),
            makeStatRecord(statItem('movie', { status: 'completed', favorite: true, userRating: 5, genres: ['RPG'], finished: '2025-02-01', rawFields: { date_added: '2026-02-01' } })),
        ];
        const filters = { ...defaultStatFilters(), type: 'game' as const, status: 'active', rating: 5, favorites: true, year: 2026, facet: { key: 'genres' as const, value: 'rpg' } };
        expect(filterStatRecords(rows, filters)).toEqual([rows[0]]);
        expect(filterStatRecords(rows, { ...defaultStatFilters(), year: 2025, dateField: 'finished' })).toEqual([rows[1]]);
        expect(filterStatRecords(rows, { ...filters, query: 'missing' })).toEqual([]);
    });
    it('keeps custom statuses distinct across media', () => {
        const rows = ['game', 'movie'].map(type => makeStatRecord(statItem(type as MediaType, { status: 'custom_review' })));
        expect(rows.map(row => row.status)).toEqual(['game:custom_review', 'movie:custom_review']);
        expect(filterStatRecords(rows, { ...defaultStatFilters(), status: 'movie:custom_review' })).toHaveLength(1);
    });
    it('counts one title once per entity and exposes the rating sample size', () => {
        const rows = [makeStatRecord(statItem('anime', { genres: ['Action', 'action'], studios: ['Studio', 'studio'], userRating: 5 })), makeStatRecord(statItem('series', { studios: ['Studio'], userRating: null }))];
        expect(rankStatRecords(rows, 'studios')).toEqual([{ name: 'Studio', count: 2, average: 5, rated: 1 }]);
        expect(rankStatRecords(rows, 'genres')).toHaveLength(1);
        expect(rankStatRecords([makeStatRecord(statItem('anime', { studios: ['Unrated'] }))], 'studios', 'rating')).toEqual([]);
        expect(makeStatRecord(statItem('book', { authors: ['Herbert, Frank'] })).facets.authors).toEqual(['Herbert, Frank']);
    });
    it('excludes dropped and unreleased viewing from remaining time', () => {
        const rows = ['planned', 'watching', 'dropped', 'to_be_released', 'completed'].map(status => makeStatRecord(statItem('movie', { status, runtime: '90' })));
        expect(summarizeStatRecords(rows).remaining).toBe(180);
    });
    it('infers missing completed manga counts but preserves an explicit zero', () => {
        expect(makeStatRecord(statItem('manga', { status: 'completed', chapterCurrent: null, chapterTotal: 12 })).chapters).toBe(12);
        expect(makeStatRecord(statItem('manga', { status: 'completed', chapterCurrent: 0, chapterTotal: 12 })).chapters).toBe(0);
    });
    it('builds calendar bins without pretending to know session or undated completion history', () => {
        const rows = [makeStatRecord(statItem('movie', { status: 'completed', rawFields: { date_added: '2026-01-01' }, finished: '2026-02-01' })), makeStatRecord(statItem('game', { status: 'completed' }))];
        const bins = statTimeline(rows, 'month', 2026);
        expect(bins).toHaveLength(12); expect(bins[0]).toEqual({ key: '2026-01', added: 1, finished: 0 }); expect(bins[1].finished).toBe(1);
        expect(statTimeline(rows, 'year', null)).toEqual([{ key: '2026', added: 1, finished: 1 }]);
        expect(statTimeline(rows, 'month', null, new Date(2026, 9, 29))).toHaveLength(12);
    });
    it('loads every library independently and recovers partial failures without duplicate notes', async () => {
        const loaders = Object.fromEntries(STAT_MEDIA.map(type => [type, vi.fn(async () => [statItem(type)])])) as Record<MediaType, () => Promise<MediaItem[]>>;
        loaders.game = async () => [statItem('game', { filePath: 'same.md' })]; loaders.anime = async () => [statItem('anime', { filePath: 'same.md' })]; loaders.series = () => { throw new Error('failure'); };
        const library = await loadStatisticsLibrary(loaders, () => new Date(2026, 0, 1).getTime());
        expect(library.records).toHaveLength(5); expect(library.failedTypes).toEqual(['series']); expect(library.records.every(row => row.added !== null)).toBe(true);
    });
});
