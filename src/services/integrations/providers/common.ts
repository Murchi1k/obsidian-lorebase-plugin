import { t } from '../../../localization';

type JsonMap = Record<string, unknown>;

export type JsonFetcher = (
    url: string,
    headers?: Record<string, string>,
    method?: 'GET' | 'POST',
    body?: string
) => Promise<unknown>;

export function asObject(value: unknown): JsonMap | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return null;
    }
    return value as JsonMap;
}

export function asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

export function getArray(source: JsonMap | null, key: string): unknown[] {
    if (!source) return [];
    return asArray(source[key]);
}

export function getObject(source: JsonMap | null, key: string): JsonMap | null {
    if (!source) return null;
    return asObject(source[key]);
}

export function getString(source: JsonMap | null, key: string): string {
    if (!source) return '';
    return toStringSafe(source[key]);
}

export function mapStringList(items: unknown[], picker: (item: unknown) => unknown): string[] {
    const values: string[] = [];
    for (const item of items) {
        const raw = picker(item);
        if (raw === null || raw === undefined) continue;
        const text = String(raw).trim();
        if (text) values.push(text);
    }
    return values;
}

export function toStringSafe(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return '';
}

export function stripHtml(value: string): string {
    return value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

export function extractYear(value: string): string {
    const match = value.match(/\d{4}/);
    return match ? match[0] : '';
}

export function pickAnimeTitle(title: unknown): string {
    const entry = asObject(title);
    return (
        getString(entry, 'userPreferred')
        || getString(entry, 'english')
        || getString(entry, 'romaji')
        || getString(entry, 'native')
        || 'Unknown'
    );
}

export function mapAnimeFormat(raw: string): string {
    const value = raw.toLowerCase();
    if (value === 'tv' || value === 'tv_short') return t('formatTv');
    if (value === 'movie') return t('formatMovie');
    if (value === 'ova') return t('formatOva');
    if (value === 'ona') return t('formatOna');
    if (value === 'special') return t('formatSpecial');
    return raw ? raw.replace(/_/g, ' ').toUpperCase() : '';
}
