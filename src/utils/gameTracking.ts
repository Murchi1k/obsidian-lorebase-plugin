import type { GameItem } from '../types';

export function achievementProgress(unlocked: unknown, total: unknown): number | null {
    const current = trackingNumber(unlocked), count = trackingNumber(total);
    return current !== null && count !== null && count > 0 && current <= count ? Math.round(current / count * 100) : null;
}

export function trackingNumber(value: unknown, max = Number.MAX_SAFE_INTEGER): number | null {
    if (value === '' || value === null || value === undefined || typeof value === 'boolean') return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.min(max, Math.round(number)) : null;
}
export function gameModes(value: unknown): NonNullable<GameItem['gameModes']> {
    const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,;]+/).map(v => v.trim()) : [];
    return [...new Set(values.filter((v): v is 'solo' | 'coop' | 'multiplayer' => ['solo', 'coop', 'multiplayer'].includes(String(v))))];
}
