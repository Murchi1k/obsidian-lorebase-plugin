

export const TROPHY_GRADES = ['bronze', 'silver', 'gold', 'platinum'] as const;
export type TrophyGrade = typeof TROPHY_GRADES[number];
export type TrophyCounts = Record<TrophyGrade, number>;
export interface PlayStationTrophySet {
    id: string;
    title: string;
    platform: string;
    earned: TrophyCounts;
    total: TrophyCounts;
    progress: number;
}
export interface PlayStationTracking {
    accountId: string;
    titleId: string;
    platform: string;
    conceptId?: string;
    playtimeMinutes?: number;
    played?: boolean;
    owned?: boolean;
    lastPlayedAt?: string;
    trophySets?: PlayStationTrophySet[];
    updatedAt?: string;
}
export interface PlayStationEntry extends PlayStationTracking {
    name: string;
    image: string;
    partial?: boolean;
}
export interface PlayStationSyncSettings {
    secretId: string;
    accountId: string;
    onlineId: string;
    scope: 'played' | 'purchased' | 'all';
    metadataProvider: 'psn' | 'igdb' | 'rawg';
    importPlaytime: boolean;
    importTrophies: boolean;
    autoSyncOnStartup: boolean;
    showProgress: boolean;
}
export const defaultPlayStationSettings = (): PlayStationSyncSettings => ({
    secretId: '', accountId: '', onlineId: '', scope: 'played', metadataProvider: 'psn',
    importPlaytime: true, importTrophies: true, autoSyncOnStartup: false, showProgress: true,
});
export function normalizePlayStationSettings(value: unknown): PlayStationSyncSettings {
    const raw = object(value), result = defaultPlayStationSettings();
    result.secretId = /^lorebase-psn-[a-z0-9-]+$/.test(text(raw.secretId)) ? text(raw.secretId) : '';
    result.accountId = /^\d+$/.test(text(raw.accountId)) ? text(raw.accountId) : '';
    result.onlineId = text(raw.onlineId);
    result.scope = raw.scope === 'purchased' || raw.scope === 'all' ? raw.scope : 'played';
    result.metadataProvider = raw.metadataProvider === 'igdb' || raw.metadataProvider === 'rawg' ? raw.metadataProvider : 'psn';
    for (const key of ['importPlaytime', 'importTrophies', 'autoSyncOnStartup', 'showProgress'] as const) if (typeof raw[key] === 'boolean') result[key] = raw[key];
    return result;
}
export function object(value: unknown): Record<string, any> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}; }
export function text(value: unknown): string { return typeof value === 'string' || typeof value === 'number' ? String(value) : ''; }
export function rows(value: unknown): Record<string, any>[] { return Array.isArray(value) ? value.map(object) : []; }
const count = (value: unknown): number | undefined => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
export function trophyCounts(value: unknown): TrophyCounts | undefined {
    const source = object(value);
    if (!TROPHY_GRADES.every(key => count(source[key]) !== undefined)) return undefined;
    return Object.fromEntries(TROPHY_GRADES.map(key => [key, source[key]])) as TrophyCounts;
}
export function normalizeTrophySet(value: unknown): PlayStationTrophySet | undefined {
    const source = object(value), earned = trophyCounts(source.earned ?? source.earnedTrophies), total = trophyCounts(source.total ?? source.definedTrophies);
    const id = text(source.id ?? source.npCommunicationId);
    if (!/^NPWR\d+_\d+$/.test(id) || !earned || !total || TROPHY_GRADES.some(key => earned[key] > total[key])) return undefined;
    return { id, title: text(source.title ?? source.trophyTitleName), platform: text(source.platform ?? source.trophyTitlePlatform),
        earned, total, progress: Math.max(0, Math.min(100, Number(source.progress) || 0)) };
}
export function normalizePlayStationTracking(value: unknown): PlayStationTracking | undefined {
    const source = object(value), accountId = text(source.accountId), titleId = text(source.titleId);
    if (!/^\d+$/.test(accountId) || !/^(?:CUSA|PPSA|NPWR|NPU|NPB|PC)[A-Z0-9_-]+$/i.test(titleId)) return undefined;
    const result: PlayStationTracking = { accountId, titleId, platform: text(source.platform) };
    if (/^\d+$/.test(text(source.conceptId))) result.conceptId = text(source.conceptId);
    if (count(source.playtimeMinutes) !== undefined) result.playtimeMinutes = source.playtimeMinutes;
    for (const key of ['played', 'owned'] as const) if (typeof source[key] === 'boolean') result[key] = source[key];
    for (const key of ['lastPlayedAt', 'updatedAt'] as const) if (typeof source[key] === 'string' && Number.isFinite(Date.parse(source[key]))) result[key] = source[key];
    if (Array.isArray(source.trophySets)) result.trophySets = rows(source.trophySets).map(normalizeTrophySet).filter((set): set is PlayStationTrophySet => Boolean(set));
    return result;
}
export function durationMinutes(value: unknown): number | undefined {
    if (typeof value !== 'string') return undefined;
    const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(value);
    if (!match || !match.slice(1).some(Boolean)) return undefined;
    return Math.round(Number(match[1] || 0) * 1440 + Number(match[2] || 0) * 60 + Number(match[3] || 0) + Number(match[4] || 0) / 60);
}
export function checkPsnAbort(signal: AbortSignal): void { if (signal.aborted) throw new DOMException('Cancelled', 'AbortError'); }
