import type { RelatedMediaLink, UserRating } from '../../types';

export function parseNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
    return Number.isFinite(parsed) ? parsed : null;
}

export function parseYear(value: unknown): number | null {
    const parsed = parseNumber(value);
    if (parsed !== null) {
        const rounded = Math.trunc(parsed);
        if (rounded > 0) return rounded;
    }

    const text = typeof value === 'string' ? value : '';
    const match = text.match(/\b(19|20)\d{2}\b/);
    return match ? Number(match[0]) : null;
}

export function parseUserRating(value: unknown): UserRating {
    const parsed = parseNumber(value);
    if (parsed === null) return null;
    const rating = Math.trunc(parsed);
    return rating >= 1 && rating <= 5 ? rating as UserRating : null;
}

export function parseRelatedMedia(raw: unknown): RelatedMediaLink[] {
    if (!Array.isArray(raw)) return [];

    const related: RelatedMediaLink[] = [];
    const seen = new Set<string>();
    for (const entry of raw) {
        if (!entry || typeof entry !== 'object') continue;
        const source = entry as Record<string, unknown>;
        const type = typeof source.type === 'string' ? source.type.trim().toLowerCase() : '';
        if (type !== 'anime' && type !== 'movie' && type !== 'series' && type !== 'book' && type !== 'manga' && type !== 'game') continue;
        const path = typeof source.path === 'string' ? source.path.trim() : '';
        if (!path || seen.has(path)) continue;
        const title = typeof source.title === 'string' && source.title.trim()
            ? source.title.trim()
            : path.split('/').pop()?.replace(/\.md$/i, '') || path;
        related.push({ type, path, title });
        seen.add(path);
    }
    return related;
}

export function serializeRelatedMedia(related: RelatedMediaLink[] | undefined): Array<Record<string, unknown>> | null {
    if (!related?.length) return null;
    return related.map((item) => ({
        type: item.type,
        path: item.path,
        title: item.title,
    }));
}

export function getRandomItem<T>(items: T[]): T | null {
    if (!items.length) return null;
    return items[Math.floor(Math.random() * items.length)] ?? null;
}
