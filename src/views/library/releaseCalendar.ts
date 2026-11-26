import type { MediaItem, MediaType } from '../../types';
import { getItemReleaseWindow, normalizeReleaseDate, parseReleaseWindow, type ReleasePrecision } from '../../utils/releaseDates';

export const RELEASE_CALENDAR_MEDIA_TYPES: readonly MediaType[] = [
    'game', 'anime', 'movie', 'series', 'book', 'manga',
];

export type ReleaseCalendarViewMode = 'calendar' | 'agenda';
export type ReleaseCalendarScope = 'upcoming' | 'all';
export type ReleaseDateOrder = 'asc' | 'desc';

export function normalizeReleaseCalendarViewMode(value: unknown): ReleaseCalendarViewMode {
    return value === 'agenda' ? 'agenda' : 'calendar';
}

export function normalizeReleaseCalendarScope(value: unknown): ReleaseCalendarScope {
    return value === 'all' ? 'all' : 'upcoming';
}

export function normalizeReleaseCalendarMediaTypes(value: unknown): MediaType[] {
    if (!Array.isArray(value)) return [...RELEASE_CALENDAR_MEDIA_TYPES];
    const selected = RELEASE_CALENDAR_MEDIA_TYPES.filter((type) => value.includes(type));
    return selected.length > 0 ? selected : [...RELEASE_CALENDAR_MEDIA_TYPES];
}

export interface ReleaseCalendarEntry {
    item: MediaItem;
    date: Date;
    dateKey: string;
    monthKey: string;
    precision?: ReleasePrecision;
    releaseValue?: string;
    endDate?: Date | null;
}


function validDate(year: number, month: number, day: number): Date | null {
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
        ? date
        : null;
}

export function parseReleaseDate(value: unknown): Date | null {
    const window = parseReleaseWindow(normalizeReleaseDate(value));
    if (window) return window.precision === 'day' ? window.start : null;
    if (value instanceof Date && Number.isFinite(value.getTime())) {
        return validDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
    }
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const text = String(value).trim();
    if (!text) return null;
    if (/^\d{4}(?:[-/.]\d{1,2})?$/.test(text)) return null;

    const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
    if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

    const local = text.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
    if (local) return validDate(Number(local[3]), Number(local[2]), Number(local[1]));

    const timestamp = Date.parse(text);
    if (!Number.isFinite(timestamp)) return null;
    const parsed = new Date(timestamp);
    return validDate(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
}

export function dateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function getReleaseDate(item: MediaItem): Date | null {
    const window = getItemReleaseWindow(item);
    return window?.precision === 'day' ? window.start : null;
}

export function buildReleaseCalendarEntries(items: MediaItem[]): ReleaseCalendarEntry[] {
    return items.flatMap((item) => {
        const window = getItemReleaseWindow(item) ?? (item.status === 'to_be_released'
            ? parseReleaseWindow(item.year) ?? parseReleaseWindow('unknown') : null);
        if (!window) return [];
        const date = window.start ?? new Date(9999,11,31);
        return window.precision === 'day'
            ? [{ item, date, dateKey: dateKey(date), monthKey: dateKey(date).slice(0,7) }]
            : [{ item, date, dateKey: window.value, monthKey: window.value, precision: window.precision, releaseValue: window.value, endDate: window.end }];
    }).sort((left, right) => left.date.getTime() - right.date.getTime()
        || left.item.displayName.localeCompare(right.item.displayName));
}

export function filterReleaseEntries(entries: ReleaseCalendarEntry[], mediaTypes: Set<MediaType>): ReleaseCalendarEntry[] {
    return entries.filter((entry) => mediaTypes.has(entry.item.type));
}

/** Shared by both views so search, counts and navigation describe the same releases. */
export function queryReleaseEntries(
    entries: ReleaseCalendarEntry[],
    mediaTypes: Set<MediaType>,
    scope: ReleaseCalendarScope,
    order: ReleaseDateOrder,
    query = '',
    now = new Date()
): ReleaseCalendarEntry[] {
    const search = query.trim().normalize('NFKC').toLocaleLowerCase();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return entries.filter(entry => mediaTypes.has(entry.item.type)
        && (scope === 'all' || entry.precision === 'unknown' || (entry.precision ? (entry.endDate?.getTime() ?? 0) > today : entry.date.getTime() >= today))
        && (!search || entry.item.displayName.normalize('NFKC').toLocaleLowerCase().includes(search)))
        .sort((a, b) => (order === 'asc' ? 1 : -1) * (a.date.getTime() - b.date.getTime())
            || a.item.displayName.localeCompare(b.item.displayName));
}

export function groupReleaseMonths(entries: ReleaseCalendarEntry[]): Map<string, ReleaseCalendarEntry[]> {
    const months = new Map<string, ReleaseCalendarEntry[]>();
    for (const entry of entries) {
        const group = months.get(entry.monthKey);
        if (group) group.push(entry);
        else months.set(entry.monthKey, [entry]);
    }
    return months;
}
