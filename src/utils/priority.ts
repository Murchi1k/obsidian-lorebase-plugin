import type { MediaPriority } from '../types';
export const MEDIA_PRIORITIES = ['low', 'normal', 'high', 'highest'] as const;

export function normalizePriority(value: unknown): MediaPriority {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return normalized === 'high' || normalized === 'low' || normalized === 'highest' ? normalized : 'normal';
}
export function priorityRank(value: unknown): number {
    return { highest: 4, high: 3, normal: 2, low: 1 }[normalizePriority(value)];
}
