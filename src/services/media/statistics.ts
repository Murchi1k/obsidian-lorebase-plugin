import type { MediaItem, MediaType } from '../../types';
import { getWatchProgress, parseEpisodeDuration } from './watchProgress';
import { musicCredits } from './music';
import { normalizeRepeatCount } from '../../utils/repeatTracking';
import { statisticsCountryCodes } from './statisticsCountries';
import { normalizePersonalDate, personalDateTimestamp, personalDateYear, readPersonalDate } from '../../utils/personalDates';

export const STAT_MEDIA: MediaType[] = ['game', 'anime', 'movie', 'series', 'book', 'manga', 'music'];
export type StatFacet = 'genres' | 'studios' | 'directors' | 'authors' | 'artists' | 'developers' | 'platforms' | 'tags' | 'years' | 'countries';
export const STAT_FACETS: StatFacet[] = ['genres', 'studios', 'directors', 'authors', 'artists', 'developers', 'platforms', 'tags', 'years', 'countries'];
export interface StatRecord {
    item: MediaItem; added: number | null; finished: number | null; status: string;
    /** Known completion period, retained separately from an exact diary timestamp. */
    finishedPeriod?: string | null;
    finishedYear?: number | null;
    facets: Record<StatFacet, string[]>;
    played: number | null; watched: number | null; listened: number | null; remaining: number | null;
    partialWatch: boolean; partialRemaining: boolean;
    episodes: number; pages: number; chapters: number; volumes: number;
    pageTotal: number | null; chapterTotal: number | null;
    achievements: number; achievementTotal: number; achievementKnown: boolean;
}
export interface StatFilters {
    type: MediaType | 'all'; status: string; year: number | null; dateField: 'added' | 'finished';
    favorites: boolean; query: string; rating: number | null; facet: { key: StatFacet; value: string } | null;
    /** A local completion day (YYYY-MM-DD) or month (YYYY-MM), selected in history. */
    completedDate?: string | null;
    dateRange?: { from: number; to: number } | null;
    countryUnknown?: boolean;
}
export const defaultStatFilters = (): StatFilters => ({ type: 'all', status: 'all', year: null, dateField: 'added', favorites: false, query: '', rating: null, facet: null });
const finite = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const count = (value: unknown): number => Math.trunc(finite(value) ?? 0);
const total = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
const key = (value: string): string => value.normalize('NFKC').trim().toLocaleLowerCase();
export function statDate(value: unknown): number | null {
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
    if (typeof value === 'number') return value > 100_000_000 && value < 32_503_680_000_000 ? value : null;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value)) return null;
    const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
    if (!Number.isFinite(date.getTime())) return null;
    const [year, month, day] = value.slice(0, 10).split('-').map(Number);
    if (new Date(year, month - 1, day).getMonth() !== month - 1) return null;
    return date.getTime();
}
export function statStatus(item: MediaItem): string {
    if (item.status.startsWith('custom_')) return `${item.type}:${item.status}`;
    if (['watching', 'playing', 'listening'].includes(item.status)) return 'active';
    if (['not_started', 'planned', 'wishlist'].includes(item.status)) return 'planned';
    return item.status;
}
function names(...values: unknown[]): string[] {
    const result = new Map<string, string>();
    const add = (value: unknown, split = true): void => {
        if (Array.isArray(value)) { value.forEach(entry => add(entry, false)); return; }
        if (typeof value !== 'string') return;
        for (const name of (split ? value.split(/[,;\n]\s*/) : [value]).map(value => value.replace(/^\[\[|\]\]$/g, '').trim()).filter(Boolean)) if (!result.has(key(name))) result.set(key(name), name);
    };
    values.forEach(value => add(value)); return [...result.values()];
}
function firstDate(...values: unknown[]): number | null {
    for (const value of values) { const date = statDate(value); if (date !== null) return date; }
    return null;
}
/** One parsed note is one library entry; parts and attached DLC are not new titles. */
export function makeStatRecord(item: MediaItem, ctime?: number): StatRecord {
    const raw = item.rawFields ?? {};
    const finishedPeriod = item.finished !== null && item.finished !== undefined && item.finished !== '' ? normalizePersonalDate(item.finished)
        : readPersonalDate(raw, ['finished', 'dateFinished', 'date_completed', 'dateWatched', 'listen_date'])
            ?? normalizePersonalDate('dateCompleted' in item ? item.dateCompleted : 'dateWatched' in item ? item.dateWatched : null);
    const record: StatRecord = {
        item, status: statStatus(item),
        added: firstDate(raw.date_added, raw.dateAdded, raw.added, raw.created, raw.created_at, 'dateAdded' in item ? item.dateAdded : null, ctime),
        finished: personalDateTimestamp(finishedPeriod), finishedPeriod, finishedYear: personalDateYear(finishedPeriod),
        facets: { countries: statisticsCountryCodes(item), genres: names(item.genres), tags: names(item.tags), studios: names('studios' in item ? item.studios : null, raw.studios, raw.production_companies), directors: names('director' in item ? item.director : null, raw.directors), authors: names('authors' in item ? item.authors : null), artists: item.type === 'music' ? musicCredits(item).artists : names('artists' in item ? item.artists : null), developers: names(item.type === 'game' ? item.developer : null, raw.developers), platforms: names(item.type === 'game' ? item.platforms : null), years: item.year ? [String(item.year)] : [] },
        played: null, watched: null, listened: null, remaining: null, partialWatch: false, partialRemaining: false,
        episodes: 0, pages: 0, chapters: 0, volumes: 0, pageTotal: null, chapterTotal: null,
        achievements: 0, achievementTotal: 0, achievementKnown: false,
    };
    if (item.type === 'game') {
        record.played = finite(item.playtimeMinutes);
        record.achievementKnown = total(item.achievementsTotal) !== null && finite(item.achievementsUnlocked) !== null;
        record.achievementTotal = record.achievementKnown ? count(item.achievementsTotal) : 0;
        record.achievements = Math.min(count(item.achievementsUnlocked), record.achievementTotal);
    }
    if (item.type === 'anime' || item.type === 'series' || item.type === 'movie') {
        const average = parseEpisodeDuration(item.type === 'anime' ? raw.episode_duration ?? raw.duration : item.runtime);
        const parts = item.parts?.length ? item.parts.map(part => ({ ...part, episodeDuration: part.episodeDuration ?? average }))
            : [{ episodeCurrent: item.type === 'movie' ? (item.status === 'completed' ? 1 : 0) : item.episodeCurrent, episodeTotal: item.type === 'movie' ? 1 : item.episodeTotal, episodeDuration: average }];
        let watched = 0, remaining = 0, watchedKnown = false, remainingKnown = false;
        for (const part of parts) {
            const progress = getWatchProgress([part]);
            record.episodes += item.type === 'movie' ? 0 : progress.current;
            if (progress.watchedMinutes !== null) { watched += progress.watchedMinutes; watchedKnown = true; } else record.partialWatch = true;
            if (progress.remainingMinutes !== null) { remaining += progress.remainingMinutes; remainingKnown = true; } else record.partialRemaining = true;
        }
        record.watched = watchedKnown ? watched : null;
        record.remaining = remainingKnown ? remaining : null;
    }
    if (item.type === 'book') {
        record.pageTotal = total(item.pageTotal);
        record.pages = Math.min(count(item.pageCurrent ?? (item.status === 'completed' ? record.pageTotal : null)), record.pageTotal ?? Infinity);
        record.chapterTotal = total(item.chapterTotal);
        record.chapters = Math.min(count(item.chapterCurrent), record.chapterTotal ?? Infinity);
    }
    if (item.type === 'manga') {
        const parts: Array<{ chapterCurrent: number | null; chapterTotal: number | null; status?: string }> = item.parts?.length ? item.parts : [{ chapterCurrent: item.chapterCurrent, chapterTotal: item.chapterTotal, status: item.status }];
        record.chapters = parts.reduce((sum, part) => sum + Math.min(count(part.chapterCurrent ?? (part.status === 'completed' ? part.chapterTotal : null)), total(part.chapterTotal) ?? Infinity), 0);
        record.chapterTotal = parts.every(part => total(part.chapterTotal) !== null) ? parts.reduce((sum, part) => sum + count(part.chapterTotal), 0) : null;
        record.volumes = count(item.volumeCurrent);
    }
    if (item.type === 'music') {
        if (item.musicKind === 'album' && item.tracks.length) {
            const tracks = item.tracks.filter(track => track.listened);
            const known = tracks.filter(track => finite(track.duration) !== null);
            record.listened = !tracks.length || known.length ? known.reduce((sum, track) => sum + (track.duration ?? 0), 0) / 60 : null;
        } else record.listened = item.status === 'completed' || item.status === 'on_repeat' ? finite(item.duration) === null ? null : item.duration! / 60 : 0;
    }
    return record;
}
export function filterStatRecords(records: StatRecord[], filters: StatFilters): StatRecord[] {
    const query = key(filters.query);
    return records.filter(row => (filters.type === 'all' || row.item.type === filters.type)
        && (filters.status === 'all' || row.status === filters.status)
        && (!filters.favorites || row.item.favorite)
        && (!filters.countryUnknown || row.facets.countries.length === 0)
        && (filters.rating === null || row.item.userRating === filters.rating)
        && (!filters.dateRange || (filters.dateField !== 'finished' || row.status === 'completed') && (row[filters.dateField] !== null
            ? row[filters.dateField]! >= filters.dateRange.from && row[filters.dateField]! <= filters.dateRange.to
            : filters.dateField === 'finished' && partialPeriodWithin(row.finishedPeriod, filters.dateRange)))
        && (!filters.completedDate || row.status === 'completed' && (row.finished !== null && statDay(row.finished).startsWith(filters.completedDate)
            || row.finishedPeriod?.length === 7 && filters.completedDate.length === 7 && row.finishedPeriod === filters.completedDate))
        && (filters.year === null || (filters.dateField !== 'finished' || row.status === 'completed')
            && (filters.dateField === 'finished' ? row.finishedYear ?? (row.finished !== null ? new Date(row.finished).getFullYear() : null)
                : row.added !== null ? new Date(row.added).getFullYear() : null) === filters.year)
        && (!query || key([row.item.displayName, ...row.facets.authors, ...row.facets.artists].join(' ')).includes(query))
        && (!filters.facet || row.facets[filters.facet.key].some(value => key(value) === key(filters.facet!.value))));
}
function partialPeriodWithin(period: string | null | undefined, range: { from: number; to: number }): boolean {
    if (!period || !/^\d{4}(?:-\d{2})?$/.test(period)) return false;
    const year = Number(period.slice(0, 4)), month = period.length === 7 ? Number(period.slice(5)) - 1 : 0;
    const start = new Date(year, month, 1).getTime();
    const end = new Date(year, period.length === 7 ? month + 1 : 12, 1).getTime() - 1;
    return start >= range.from && end <= range.to;
}
export function statDay(timestamp: number): string {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export interface StatRank { name: string; count: number; rated: number; average: number | null }
export function rankStatRecords(records: StatRecord[], facet: StatFacet, order: 'count' | 'rating' = 'count'): StatRank[] {
    const groups = new Map<string, { name: string; count: number; ratings: number[] }>();
    for (const record of records) for (const name of record.facets[facet]) {
        const group = groups.get(key(name)) ?? { name, count: 0, ratings: [] }; group.count++;
        if (finite(record.item.userRating) !== null && record.item.userRating! > 0) group.ratings.push(record.item.userRating!);
        groups.set(key(name), group);
    }
    return [...groups.values()].map(group => ({ name: group.name, count: group.count, rated: group.ratings.length, average: group.ratings.length ? group.ratings.reduce((sum, value) => sum + value, 0) / group.ratings.length : null }))
        .filter(group => order !== 'rating' || group.average !== null)
        .sort((a, b) => (order === 'rating' ? (b.average ?? 0) - (a.average ?? 0) : b.count - a.count) || b.count - a.count || a.name.localeCompare(b.name));
}
export function summarizeStatRecords(records: StatRecord[]) {
    const rated = records.filter(record => finite(record.item.userRating) !== null && record.item.userRating! > 0);
    const sum = (field: 'played' | 'watched' | 'remaining') => records.reduce((sum, row) => sum + (row[field] ?? 0), 0);
    const music = records.filter(row => row.item.type === 'music');
    const musicByPath = new Map(music.map(row => [row.item.filePath, row]));
    const listened = music.reduce((sum, row) => {
        const item = row.item;
        if (item.type === 'music' && item.parentAlbum && item.parentTrackId) {
            const parent = musicByPath.get(item.parentAlbum);
            if (parent?.item.type === 'music' && parent.item.tracks.some(track => track.id === item.parentTrackId && track.listened)) return sum;
        }
        return sum + (row.listened ?? 0);
    }, 0);
    return { total: records.length, completed: records.filter(row => row.status === 'completed').length,
        active: records.filter(row => row.status === 'active' || row.status === 'on_repeat').length,
        favorites: records.filter(row => row.item.favorite).length, rated: rated.length,
        average: rated.length ? rated.reduce((sum, row) => sum + row.item.userRating!, 0) / rated.length : null,
        played: sum('played'), watched: sum('watched'), remaining: records.filter(row => !['completed', 'dropped', 'to_be_released'].includes(row.status)).reduce((sum, row) => sum + (row.remaining ?? 0), 0), listened,
        playedKnown: records.filter(row => row.played !== null).length,
        watchUnknown: records.filter(row => ['anime', 'movie', 'series'].includes(row.item.type) && (row.watched === null || row.partialWatch)).length,
        remainingUnknown: records.filter(row => ['anime', 'movie', 'series'].includes(row.item.type) && !['completed', 'dropped', 'to_be_released'].includes(row.status) && (row.remaining === null || row.partialRemaining)).length,
        musicUnknown: music.filter(row => row.listened === null || row.item.type === 'music' && row.item.tracks.some(track => track.listened && track.duration === null)).length,
        episodes: records.reduce((sum, row) => sum + row.episodes, 0), pages: records.reduce((sum, row) => sum + row.pages, 0), chapters: records.filter(row => row.item.type === 'manga').reduce((sum, row) => sum + row.chapters, 0),
        pageTotal: records.reduce((sum, row) => sum + (row.pageTotal ?? 0), 0), chapterTotal: records.filter(row => row.item.type === 'manga').reduce((sum, row) => sum + (row.chapterTotal ?? 0), 0),
        achievements: records.reduce((sum, row) => sum + row.achievements, 0), achievementTotal: records.reduce((sum, row) => sum + row.achievementTotal, 0),
        repeats: records.filter(row => row.item.type !== 'book' && row.item.type !== 'music').reduce((sum, row) => sum + normalizeRepeatCount(row.item.repeatCount), 0),
        missingDates: records.filter(row => row.status === 'completed' && row.finished === null && !row.finishedYear).length,
    };
}
export function statTimeline(records: ReadonlyArray<Pick<StatRecord,'added'|'finished'|'status'|'finishedPeriod'|'finishedYear'>>, mode: 'month' | 'year', year: number | null, now = new Date()) {
    const bucket = (date: number) => { const value = new Date(date); return mode === 'year' ? String(value.getFullYear()) : `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`; };
    const bins = new Map<string, { key: string; added: number; finished: number }>();
    if (mode === 'month') for (let i = 0; i < 12; i++) { const date = year !== null ? new Date(year, i, 1) : new Date(now.getFullYear(), now.getMonth() - 11 + i, 1); const id = bucket(date.getTime()); bins.set(id, { key: id, added: 0, finished: 0 }); }
    for (const row of records) for (const field of ['added', 'finished'] as const) {
        if (field === 'finished' && row.status !== 'completed') continue;
        const date = row[field];
        const id = field === 'finished' && mode === 'year' && row.finishedYear ? String(row.finishedYear)
            : field === 'finished' && mode === 'month' && row.finishedPeriod?.length === 7 ? row.finishedPeriod
                : date !== null ? bucket(date) : null;
        if (id === null || mode === 'month' && !bins.has(id)) continue;
        const bin = bins.get(id) ?? { key: id, added: 0, finished: 0 }; bin[field]++; bins.set(id, bin);
    }
    return [...bins.values()].sort((a, b) => a.key.localeCompare(b.key));
}
