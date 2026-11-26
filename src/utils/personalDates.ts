/** Personal dates retain their precision. `unknown` is an explicit choice, not today's date. */
export const UNKNOWN_DATE = 'unknown';
export function normalizePersonalDate(value: unknown): string {
    if (value === null || value === undefined || value === '') return '';
    if (typeof value === 'number' && value >= 1000 && value <= 9999 && Number.isInteger(value)) return String(value);
    const text = String(value).trim();
    if (text.toLowerCase() === UNKNOWN_DATE) return UNKNOWN_DATE;
    if (/^[1-9]\d{3}$/.test(text)) return text;
    const month = /^([1-9]\d{3})-(\d{2})$/.exec(text);
    if (month) return Number(month[2]) >= 1 && Number(month[2]) <= 12 ? text : '';
    const day = /^([1-9]\d{3})-(\d{2})-(\d{2})$/.exec(text);
    if (day) {
        const date = new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]));
        return date.getFullYear() === Number(day[1]) && date.getMonth() === Number(day[2]) - 1 && date.getDate() === Number(day[3]) ? text : '';
    }
    const timestamp = value instanceof Date ? value.getTime() : typeof value === 'number' ? value > 1e12 ? value : value > 1e9 ? value * 1000 : NaN : Date.parse(text);
    if (!Number.isFinite(timestamp)) return '';
    const date = new Date(timestamp);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}
export function isPartialPersonalDate(value: unknown): boolean {
    const date = normalizePersonalDate(value);
    return date === UNKNOWN_DATE || /^\d{4}(?:-\d{2})?$/.test(date);
}
export function personalDateTimestamp(value: unknown): number | null {
    const date = normalizePersonalDate(value);
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00`).getTime() : null;
}
export function personalDateYear(value: unknown): number | null {
    const date = normalizePersonalDate(value);
    return /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : null;
}
/** A bound for sorting only; it is never shown or persisted as a completion day. */
export function personalDateSortValue(value: unknown): number | null {
    const date = normalizePersonalDate(value);
    if (!date || date === UNKNOWN_DATE) return null;
    const full = date.length === 4 ? date + '-01-01' : date.length === 7 ? date + '-01' : date;
    return new Date(`${full}T12:00:00`).getTime();
}
export function readPersonalDate(source: Record<string, unknown>, keys: readonly string[]): string | null {
    for (const key of keys) {
        if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
        if (source[key] === null || source[key] === '') { if (key === keys[0]) return null; continue; }
        const date = normalizePersonalDate(source[key]);
        if (date) return date;
    }
    return null;
}
