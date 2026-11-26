export interface StatusReasons { paused?: string; dropped?: string }
export function normalizeStatusReasons(raw: unknown): StatusReasons | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const result: StatusReasons = {};
    for (const key of ['paused','dropped'] as const) {
        const value = (raw as Record<string,unknown>)[key];
        if (typeof value === 'string' && value.trim()) result[key] = value.trim();
    }
    return Object.keys(result).length ? result : undefined;
}
