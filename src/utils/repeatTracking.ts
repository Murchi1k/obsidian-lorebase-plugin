/** Only completed repeats beyond the initial completion are counted. */
export function normalizeRepeatCount(value: unknown): number {
    const count = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : 0;
    return Number.isFinite(count) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.trunc(count))) : 0;
}

export interface PlatformPlaythrough {
    platform: string;
    repeatCount: number;
    selected: boolean;
}

export function normalizePlatformPlaythroughs(raw: unknown, legacyPlatform?: string, legacyCount?: number): PlatformPlaythrough[] {
    if (!Array.isArray(raw)) return legacyPlatform?.trim()
        ? [{ platform: legacyPlatform.trim(), repeatCount: normalizeRepeatCount(legacyCount), selected: true }]
        : [];
    const result: PlatformPlaythrough[] = [];
    const seen = new Set<string>();
    for (const value of raw) {
        if (!value || typeof value !== 'object') continue;
        const entry = value as Record<string, unknown>;
        const platform = typeof entry.platform === 'string' ? entry.platform.trim() : '';
        if (!platform || seen.has(platform.toLowerCase())) continue;
        seen.add(platform.toLowerCase());
        result.push({ platform, repeatCount: normalizeRepeatCount(entry.repeatCount ?? entry.repeat_count), selected: entry.selected !== false });
    }
    return result;
}

export function totalPlatformRepeats(entries: PlatformPlaythrough[]): number {
    return normalizeRepeatCount(entries.reduce((total, entry) => total + (entry.selected ? entry.repeatCount : 0), 0));
}
