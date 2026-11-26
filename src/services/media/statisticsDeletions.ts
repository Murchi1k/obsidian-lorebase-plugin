import type { MediaItem, MediaType } from '../../types';
import { makeStatRecord, STAT_MEDIA, statTimeline, type StatFilters, type StatRecord } from './statistics';
import { normalizePersonalDate, personalDateYear } from '../../utils/personalDates';
export interface StatisticsDeletion {
    path: string;
    title: string;
    type: MediaType;
    at: number;
    added: number | null;
    finished: number | null;
    finishedPeriod?: string;
    finishedYear?: number | null;
    status: string;
    genres: string[];
    favorite: boolean;
    rating: number | null;
}
export function normalizeStatisticsDeletions(value:unknown):StatisticsDeletion[] {
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is StatisticsDeletion => !!v && typeof v === 'object'
        && typeof v.path === 'string' && typeof v.title === 'string' && STAT_MEDIA.includes(v.type)
        && Number.isFinite(v.at) && v.at > 0).map(v => ({
        path: v.path, title: v.title, type: v.type, at: v.at,
        added: Number.isFinite(v.added) ? v.added : null,
        finished: Number.isFinite(v.finished) ? v.finished : null,
        ...(typeof v.finishedPeriod === 'string' && normalizePersonalDate(v.finishedPeriod) ? { finishedPeriod: normalizePersonalDate(v.finishedPeriod), finishedYear: personalDateYear(v.finishedPeriod) } : {}),
        status: typeof v.status === 'string' ? v.status : 'planned',
        genres: Array.isArray(v.genres) ? v.genres.filter(g => typeof g === 'string') : [],
        favorite: v.favorite === true,
        rating: typeof v.rating === 'number' && Number.isFinite(v.rating) ? v.rating : null,
    }));
}
/** Observe real files while they exist; a missing file on startup never implies a deletion. */
export class StatisticsDeletionJournal {
    private known = new Map<string, Omit<StatisticsDeletion, 'at'>>();
    readonly events: StatisticsDeletion[];
    constructor(events: unknown, private persist: (events: StatisticsDeletion[]) => void) {
        this.events = normalizeStatisticsDeletions(events);
    }
    observe(item: MediaItem, created?: number): void {
        const row = makeStatRecord(item, created);
        this.known.set(item.filePath, {
            path: item.filePath, title: item.displayName, type: item.type,
            added: row.added, finished: row.finished, status: row.status,
            ...(row.finishedPeriod ? { finishedPeriod: row.finishedPeriod, finishedYear: row.finishedYear } : {}),
            genres: [...row.facets.genres], favorite: item.favorite, rating: item.userRating,
        });
    }
    forget(path: string): void { this.known.delete(path); }
    rename(oldPath: string, path: string): void {
        const value = this.known.get(oldPath);
        if (!value) return;
        this.known.delete(oldPath);
        this.known.set(path, { ...value, path });
    }
    remove(path: string, at = Date.now()): boolean {
        const value = this.known.get(path);
        if (!value) return false;
        this.known.delete(path);
        this.events.push({ ...value, at });
        this.persist(this.events.map(v => ({ ...v, genres: [...v.genres] })));
        return true;
    }
}
export function deletionSelection(events: StatisticsDeletion[], filters: StatFilters): StatisticsDeletion[] {
    return events.filter(e => (!filters.dateRange || e.at >= filters.dateRange.from && e.at <= filters.dateRange.to)
        && (filters.type === 'all' || e.type === filters.type)
        && (filters.status === 'all' || e.status === filters.status)
        && (!filters.favorites || e.favorite)
        && (!filters.query || e.title.toLocaleLowerCase().includes(filters.query.toLocaleLowerCase()))
        && (filters.rating === null || e.rating === filters.rating)
        && (!filters.facet || filters.facet.key === 'genres' && e.genres.some(g => g.toLocaleLowerCase() === filters.facet!.value.toLocaleLowerCase())));
}
export function statisticsTimelineWithDeletions(rows:StatRecord[],events:StatisticsDeletion[],mode:'month'|'year',year:number|null,now=new Date()){
    // A restored note keeps its original addition/completion; repeated removals remain separate events.
    const existing = new Set(rows.map(r => r.item.filePath + '|' + r.added));
    const archived = events.filter((e, i) => !existing.has(e.path + '|' + e.added)
        && events.findIndex(other => other.path === e.path && other.added === e.added) === i);
    const bins = statTimeline([...rows, ...archived], mode, year, now).map(bin => ({ ...bin, deleted: 0 }));
    for (const event of events) {
        const date = new Date(event.at);
        const key = mode === 'year' ? String(date.getFullYear()) : date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
        let bin = bins.find(bin => bin.key === key);
        if (!bin && mode === 'year') { bin = { key, added: 0, finished: 0, deleted: 0 }; bins.push(bin); }
        if (bin) bin.deleted++;
    }
    return bins.filter(bin => year === null || bin.key.startsWith(String(year))).sort((a, b) => a.key.localeCompare(b.key));
}
