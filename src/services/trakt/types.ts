import type { PreparedVideoImport } from '../integrations/types';

export type TraktKind = 'movie' | 'series';
export type TraktMetadataProvider = 'tmdb' | 'tvmaze' | 'omdb';
export interface TraktState { rating: number | null; watchlist: boolean; watched: boolean; favorite?: boolean; episodes: string[]; }
export interface TraktEntry { key: string; id: string; kind: TraktKind; title: string; year?: number; ids: Record<string, string>; state: TraktState; }
export interface TraktSnapshot { path: string; local: TraktState; remote: TraktState; }
export interface TraktSyncSettings {
    clientId: string;
    accessToken: string; refreshToken: string; expiresAt: number; username: string;
    movieProvider: 'tmdb' | 'omdb'; seriesProvider: 'tvmaze' | 'tmdb';
    twoWay: boolean; autoSyncOnStartup: boolean; lastSynced: Record<string, TraktSnapshot>;
}
export type TraktPreparedVideo = PreparedVideoImport;
export interface TraktPreview {
    entry: TraktEntry; path?: string; matches: string[]; local: TraktState; merged: TraktState;
    conflicts: Array<keyof TraktState>; image?: string; error?: string;
}
export function defaultTraktSettings(): TraktSyncSettings {
    return { clientId: '', accessToken: '', refreshToken: '', expiresAt: 0, username: '', movieProvider: 'tmdb', seriesProvider: 'tvmaze', twoWay: false, autoSyncOnStartup: false, lastSynced: {} };
}
export function normalizeTraktSettings(value: unknown): TraktSyncSettings {
    const raw = value && typeof value === 'object' ? value as Partial<TraktSyncSettings> : {};
    const config = defaultTraktSettings();
    for (const key of ['clientId', 'accessToken', 'refreshToken', 'username'] as const) if (typeof raw[key] === 'string') config[key] = raw[key];
    config.clientId = config.clientId.trim();
    if (Number.isFinite(raw.expiresAt)) config.expiresAt = Number(raw.expiresAt);
    config.movieProvider = raw.movieProvider === 'omdb' ? 'omdb' : 'tmdb';
    config.seriesProvider = raw.seriesProvider === 'tmdb' ? 'tmdb' : 'tvmaze';
    config.twoWay = raw.twoWay === true; config.autoSyncOnStartup = raw.autoSyncOnStartup === true;
    for (const [key, snapshot] of Object.entries(raw.lastSynced ?? {})) if (snapshot && typeof snapshot.path === 'string' && validState(snapshot.local) && validState(snapshot.remote)) config.lastSynced[key] = snapshot;
    return config;
}
function validState(value: unknown): value is TraktState {
    if (!value || typeof value !== 'object') return false;
    const raw = value as TraktState;
    return (raw.rating === null || typeof raw.rating === 'number' && Number.isFinite(raw.rating)) && typeof raw.watched === 'boolean' && typeof raw.watchlist === 'boolean' && (raw.favorite === undefined || typeof raw.favorite === 'boolean') && Array.isArray(raw.episodes) && raw.episodes.every(value => typeof value === 'string');
}
