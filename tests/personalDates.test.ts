import { describe, expect, it } from 'vitest';
import { normalizePersonalDate, personalDateTimestamp, personalDateYear, readPersonalDate } from '../src/utils/personalDates';
import { GameService } from '../src/services/GameService';
import { AnimeService } from '../src/services/AnimeService';
import { VideoService } from '../src/services/VideoService';
import { ReadingService } from '../src/services/ReadingService';
import { createMockApp, createMockFile, createMetadataService } from './helpers/testHelpers';
import { defaultStatFilters, makeStatRecord, filterStatRecords, statTimeline, summarizeStatRecords } from '../src/services/media/statistics';
import { groupMediaItems, matchesFilterRule } from '../src/services/media/libraryViewState';
import { StatisticsDeletionJournal, statisticsTimelineWithDeletions } from '../src/services/media/statisticsDeletions';
import type { MediaItem } from '../src/types';

describe('personal dates retain known precision', () => {
    it.each(['unknown', '2019', '2019-06', '2019-06-18'])('keeps %s unchanged', value => expect(normalizePersonalDate(value)).toBe(value));
    it('reads an unquoted YAML year without interpreting it as a timestamp', () => {
        expect(readPersonalDate({ finished: 2019 }, ['finished'])).toBe('2019');
        expect(personalDateTimestamp(2019)).toBeNull(); expect(personalDateYear(2019)).toBe(2019);
    });
    it.each(['2019-13', '2019-00', '2019-02-29', '2020-02-30', 'bad'])('rejects invalid date %s', value => expect(normalizePersonalDate(value)).toBe(''));
    it.each(['unknown', '2019', '2019-06'])('never assigns a diary day to %s', value => expect(personalDateTimestamp(value)).toBeNull());
    it('does not revive a stale legacy date after an explicit unknown date or clearing', () => {
        expect(readPersonalDate({ finished: 'unknown', dateWatched: '2026-11-18' }, ['finished', 'dateWatched'])).toBe('unknown');
        expect(readPersonalDate({ finished: null, dateWatched: '2026-11-18' }, ['finished', 'dateWatched'])).toBeNull();
    });
});

function fixture(type: 'game' | 'anime' | 'movie' | 'series' | 'book' | 'manga', finished: unknown) {
    const file = createMockFile('Library/Test.md', 'Test');
    const fm: Record<string, unknown> = { type, name: 'Test', title: 'Test', status: 'completed', finished, dateCompleted: '2026-11-18', dateWatched: '2026-11-18' };
    const app = createMockApp({ [file.path]: { frontmatter: fm } });
    app.vault.getAbstractFileByPath = () => file;
    app.fileManager.processFrontMatter = async (_file, fn) => fn(fm);
    const metadata = createMetadataService(app);
    const service = type === 'game' ? new GameService(app, metadata) : type === 'anime' ? new AnimeService(app, metadata)
        : type === 'movie' || type === 'series' ? new VideoService(app, type, 'Library', metadata) : new ReadingService(app, type, 'Library', metadata);
    const parse = (): MediaItem => type === 'game' ? (service as GameService).parseGameFromCache(file)!
        : type === 'anime' ? (service as AnimeService).parseAnimeFromCache(file)! : (service as ReadingService | VideoService).parseFromCache(file)!;
    const save = async (updates: any) => type === 'game' ? (service as GameService).updateGame(parse() as any, updates)
        : type === 'anime' ? (service as AnimeService).updateAnime(parse() as any, updates) : (service as ReadingService).updateItem(parse() as any, updates);
    return { parse, save, fm };
}
describe.each(['game', 'anime', 'movie', 'series', 'book', 'manga'] as const)('%s completion persistence', type => {
    it.each(['unknown', '2019', '2019-06', 2019])('reads, saves and reopens %s without guessing a day', async finished => {
        const f = fixture(type, finished); const date = String(finished);
        expect(f.parse().finished).toBe(date);
        const parsed = f.parse() as any;
        if (type === 'game') expect(parsed.dateCompleted).toBeNull();
        if (type === 'anime') expect(parsed.dateWatched).toBeNull();
        await f.save({ finished: date, userRating: 4 });
        expect(f.fm.finished).toBe(date); expect(f.parse().finished).toBe(date);
        await f.save({ favorite: true }); expect(f.parse().finished).toBe(date);
    });
    it('replaces a partial date with a real day and can explicitly clear it again', async () => {
        const f = fixture(type, '2019'); await f.save({ finished: '2019-05-10' });
        expect(f.parse().finished).toBe('2019-05-10');
        await f.save({ finished: null }); expect(f.parse().finished).toBeNull();
    });
});

describe('year-only completion in statistics and library views', () => {
    const rows = () => ['2019', 'unknown', '2019-05-10', '2019-06'].map((finished, index) => makeStatRecord({
        type: 'movie', filePath: `Movies/${index}.md`, displayName: String(index), nameLower: String(index), status: 'completed',
        finished, year: 2025, userRating: null, favorite: false, genres: [], tags: [], parts: [], rawFields: {}, runtime: '90',
    } as any));
    it('includes the known year in annual counts while leaving all daily and unknown-year counts honest', () => {
        const records = rows();
        expect(records.map(row => row.finishedYear)).toEqual([2019, null, 2019, 2019]);
        expect(records[0].finished).toBeNull(); expect(records[1].finished).toBeNull();
        expect(filterStatRecords(records, { ...defaultStatFilters(), dateField: 'finished', year: 2019 })).toHaveLength(3);
        expect(filterStatRecords(records, { ...defaultStatFilters(), completedDate: '2019-01-01' })).toHaveLength(0);
        expect(statTimeline(records, 'year', null)).toEqual([{ key: '2019', added: 0, finished: 3 }]);
        const months = statTimeline(records, 'month', 2019);
        expect(months[0].finished).toBe(0); expect(months[4].finished).toBe(1); expect(months[5].finished).toBe(1);
        expect(months.reduce((n, month) => n + month.finished, 0)).toBe(2);
        expect(summarizeStatRecords(records)).toMatchObject({ completed: 4, missingDates: 1 });
    });
    it('includes partial dates in a range only if the whole known period is included', () => {
        const records = rows(); const range = (from: string, to: string) => filterStatRecords(records, { ...defaultStatFilters(), dateField: 'finished', dateRange: { from: new Date(from).getTime(), to: new Date(to).getTime() } });
        expect(range('2019-01-01T00:00:00', '2019-12-31T23:59:59.999')).toHaveLength(3);
        expect(range('2019-01-01T00:00:00', '2019-01-31T23:59:59.999')).toHaveLength(0);
    });
    it('groups the known year with that year, without placing it in January or a day', () => {
        const items = rows().map(row => row.item);
        const years = groupMediaItems(items, 'finishedYear', 'asc', 'en-US');
        expect(years.find(group => group.label === '2019')?.items).toHaveLength(3);
        const months = groupMediaItems(items, 'finishedMonth', 'asc', 'en-US');
        expect(months.find(group => group.label === '2019')?.items).toHaveLength(1);
        expect(months.some(group => group.label.includes('January'))).toBe(false);
    });
    it('does not match an unknown month/day with a date filter', () => {
        const item = rows()[0].item;
        const rule = (operator: string, value?: string) => ({ id: 'd', field: 'dateFinished', fieldType: 'date', operator, value }) as any;
        expect(matchesFilterRule(item, rule('thisYear'), new Date(2019, 0, 10))).toBe(true);
        expect(matchesFilterRule(item, rule('thisMonth'), new Date(2019, 0, 10))).toBe(false);
        expect(matchesFilterRule(item, rule('equals', '2019-01-01'))).toBe(false);
        expect(matchesFilterRule(item, rule('equals', '2019'))).toBe(true);
    });
    it('retains known precision when the existing statistics journal archives a removed note', () => {
        const journal = new StatisticsDeletionJournal([], () => {});
        journal.observe(rows()[0].item); journal.remove(rows()[0].item.filePath);
        const restored = new StatisticsDeletionJournal(journal.events, () => {});
        expect(statisticsTimelineWithDeletions([], restored.events, 'year', 2019)[0].finished).toBe(1);
        expect(statisticsTimelineWithDeletions([], restored.events, 'month', 2019).every(month => month.finished === 0)).toBe(true);
    });
});
