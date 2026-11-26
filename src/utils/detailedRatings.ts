import type { RatingCriterion } from '../types';
import { parseStoredUserRating } from './rating';

export function parseDetailedRatings(value: unknown): RatingCriterion[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const result: RatingCriterion[] = [];
    const seen = new Set<string>();
    for (const entry of value) {
        if (!entry || typeof entry !== 'object') continue;
        const row = entry as Record<string, unknown>;
        const name = typeof row.name === 'string' ? row.name.trim() : '';
        const key = name.toLocaleLowerCase();
        if (!name || seen.has(key)) continue;
        seen.add(key);
        result.push({ name, value: parseStoredUserRating(row.value) });
    }
    return result;
}
