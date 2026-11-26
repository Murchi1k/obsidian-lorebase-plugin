import { describe, expect, it } from 'vitest';
import type { MediaItem } from '../src/types';
import {
    buildReleaseCalendarEntries,
    filterReleaseEntries,
    normalizeReleaseCalendarMediaTypes,
    normalizeReleaseCalendarScope,
    normalizeReleaseCalendarViewMode,
    parseReleaseDate,
    queryReleaseEntries,
    groupReleaseMonths,
} from '../src/views/library/releaseCalendar';

function item(type: MediaItem['type'], name: string, releaseDate?: string): MediaItem {
    return {
        type,
        filePath: `${name}.md`,
        displayName: name,
        nameLower: name.toLowerCase(),
        year: null,
        description: '',
        userRating: null,
        favorite: false,
        poster: null,
        imageUrl: '',
        hasCustomPoster: false,
        isAdult: false,
        status: type === 'game' ? 'not_started' : 'planned',
        releaseDate,
        rawFields: {},
    } as MediaItem;
}

describe('releaseCalendar', () => {
    it('normalizes persisted view and scope preferences', () => {
        expect(normalizeReleaseCalendarViewMode('agenda')).toBe('agenda');
        expect(normalizeReleaseCalendarViewMode('invalid')).toBe('calendar');
        expect(normalizeReleaseCalendarScope('all')).toBe('all');
        expect(normalizeReleaseCalendarScope(undefined)).toBe('upcoming');
    });

    it('normalizes persisted media filters and keeps their canonical order', () => {
        expect(normalizeReleaseCalendarMediaTypes(['manga', 'game', 'manga', 'invalid']))
            .toEqual(['game', 'manga']);
        expect(normalizeReleaseCalendarMediaTypes([])).toEqual([
            'game', 'anime', 'movie', 'series', 'book', 'manga',
        ]);
        expect(normalizeReleaseCalendarMediaTypes(undefined)).toEqual([
            'game', 'anime', 'movie', 'series', 'book', 'manga',
        ]);
    });

    it('parses ISO and localized release dates without timezone shifts', () => {
        expect(parseReleaseDate('2027-02-14')?.getDate()).toBe(14);
        expect(parseReleaseDate('14.02.2027')?.getMonth()).toBe(1);
        expect(parseReleaseDate('2027-02-30')).toBeNull();
        expect(parseReleaseDate('2027')).toBeNull();
    });

    it('collects and sorts releases from different media libraries', () => {
        const entries = buildReleaseCalendarEntries([
            item('movie', 'Later', '2027-03-10'),
            item('game', 'First', '2027-02-03'),
            item('anime', 'No exact date'),
        ]);

        expect(entries.map((entry) => entry.item.displayName)).toEqual(['First', 'Later']);
        expect(entries[0].dateKey).toBe('2027-02-03');
        expect(entries[0].monthKey).toBe('2027-02');
    });

    it('filters the shared calendar by media type', () => {
        const entries = buildReleaseCalendarEntries([
            item('game', 'Game', '2027-02-03'),
            item('book', 'Book', '2027-02-04'),
        ]);

        expect(filterReleaseEntries(entries, new Set(['book'])).map((entry) => entry.item.type)).toEqual(['book']);
    });

    it('reads common release-date aliases used by anime and publishing notes', () => {
        const anime = item('anime', 'Anime without canonical field');
        anime.rawFields = { aired_on: '2027-04-12' };
        const manga = item('manga', 'Manga without canonical field');
        manga.rawFields = { publication_date: '2027-05-03' };

        expect(buildReleaseCalendarEntries([anime, manga]).map((entry) => entry.dateKey))
            .toEqual(['2027-04-12', '2027-05-03']);
    });

    it('combines title search, media selection, local-day scope and date order without mutating the library', () => {
        const entries = buildReleaseCalendarEntries([
            item('game', 'Old GAME', '2027-02-02'),
            item('game', 'Today Game', '2027-02-03'),
            item('game', 'Future game', '2027-04-05'),
            item('movie', 'Game movie', '2027-02-04'),
        ]);
        expect(queryReleaseEntries(entries, new Set(['game']), 'upcoming', 'desc', '  ＧＡＭＥ  ', new Date(2027, 1, 3, 23))
            .map(entry => entry.item.displayName)).toEqual(['Future game', 'Today Game']);
        expect(entries[0].item.displayName).toBe('Old GAME');
    });

    it('groups months across different years in the requested chronological order', () => {
        const entries = buildReleaseCalendarEntries([
            item('book', 'Earlier', '2026-02-01'), item('game', 'Later', '2027-02-01'),
        ]);
        const months = groupReleaseMonths(queryReleaseEntries(entries, new Set(['book', 'game']), 'all', 'desc'));
        expect([...months.keys()]).toEqual(['2027-02', '2026-02']);
        expect(months.get('2026-02')?.[0].item.displayName).toBe('Earlier');
    });
});
