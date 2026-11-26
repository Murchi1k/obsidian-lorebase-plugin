import type { LorebaseSettings } from '../../types';
import { getRatingMax, getRatingStep, parseStoredUserRating, roundRatingToStep } from '../../utils/rating';
import { normalizeWatchedEpisodes, readEpisodeFields, watchedEpisodeNumbers } from '../media/episodeTracking';
import { rows, text } from './api';
import type { TraktEntry, TraktSnapshot, TraktState } from './types';

type Data = Record<string, unknown>;
export const TRAKT_STATE_FIELDS: Array<keyof TraktState> = ['rating', 'watchlist', 'watched', 'favorite', 'episodes'];
export const equalTraktValue = (a: unknown, b: unknown): boolean => Array.isArray(a) && Array.isArray(b) ? JSON.stringify([...new Set(a)].sort()) === JSON.stringify([...new Set(b)].sort()) : a === b;
export const equalTraktState = (a: TraktState, b: TraktState): boolean => TRAKT_STATE_FIELDS.every(key => equalTraktValue(a[key], b[key]));
export function localTraktState(fm: Data, entry: TraktEntry, settings: LorebaseSettings): TraktState {
    const rating = parseStoredUserRating(fm.userRating ?? fm.rating_user);
    let episodes: string[] = [];
    if (entry.kind === 'series') {
        episodes = rows(fm.series_parts).flatMap((part, index) => watchedEpisodeNumbers({ episodeCurrent: Number(part.episode_current ?? part.episodeCurrent) || 0,
            episodeTotal: Number(part.episode_total ?? part.episodeTotal) || null, ...readEpisodeFields(part) }).map(episode => `${Number(part.season ?? part.seasonNumber) || (Number(part.season ?? part.seasonNumber) === 0 ? 0 : index + 1)}:${episode}`));
        if (!Array.isArray(fm.series_parts) && Number(fm.episode_current) > 0) episodes = Array.from({ length: Math.min(50000, Number(fm.episode_current)) }, (_, index) => `${Number(fm.season_current) || 1}:${index + 1}`);
    }
    return { rating: rating === null ? null : rating / getRatingMax(settings.ratingScale) * 10, watchlist: fm.status === 'planned', watched: entry.kind === 'movie' && fm.status === 'completed', favorite: fm.favorite === true || fm.favorite === 'true', episodes: [...new Set(episodes)].sort() };
}
export function mergeTraktState(local: TraktState, remote: TraktState, snapshot?: TraktSnapshot): { state: TraktState; conflicts: Array<keyof TraktState> } {
    const state = { ...remote, episodes: [...remote.episodes] }, conflicts: Array<keyof TraktState> = [];
    const empty = (value: unknown) => value === null || value === false || Array.isArray(value) && !value.length;
    for (const field of TRAKT_STATE_FIELDS) {
        const a = local[field], b = remote[field];
        if (b === undefined) continue;
        if (equalTraktValue(a, b)) continue;
        if (!snapshot || snapshot.remote[field] === undefined) {
            if (empty(a)) continue;
            if (!empty(b)) conflicts.push(field);
            Object.assign(state, { [field]: a }); continue;
        }
        const changedLocal = !equalTraktValue(a, snapshot.local[field]), changedRemote = !equalTraktValue(b, snapshot.remote[field]);
        if (changedLocal && changedRemote) conflicts.push(field);
        if (changedLocal) Object.assign(state, { [field]: a });
    }
    return { state, conflicts };
}
export function traktProgressUpdates(fm: Data, entry: TraktEntry, state: TraktState, catalog: Data[], settings: LorebaseSettings): Data {
    const updates: Data = {};
    if (state.favorite !== undefined) updates.favorite = state.favorite;
    const max = getRatingMax(settings.ratingScale), step = getRatingStep(settings.ratingScale);
    updates.userRating = state.rating === null ? null : Math.max(1, Math.min(max, roundRatingToStep(state.rating / 10 * max, step)));
    if (entry.kind === 'movie') { updates.status = state.watched ? 'completed' : state.watchlist ? 'planned' : fm.status === 'completed' ? 'planned' : fm.status || 'planned'; return updates; }
    const parts = rows(fm.series_parts).map(part => ({ ...part }));
    for (const season of catalog) {
        const n = Number(season.number); if (!Number.isInteger(n) || n < 0) continue;
        let part = parts.find((part, index) => Number(part.season ?? part.seasonNumber ?? index + 1) === n);
        const episodes = rows(season.episodes).filter(episode => Number.isInteger(Number(episode.number)) && Number(episode.number) > 0);
        const total = Math.max(Number(season.episode_count ?? season.aired_episodes) || 0, ...episodes.map(episode => Number(episode.number)), 0);
        if (!part) { part = { id: `season-${n}`, kind: 'season', title: n ? `Season ${n}` : 'Specials', season: n, episode_total: total || null }; parts.push(part); }
        else if (!(Number(part.episode_total) > 0) && total > 0) part.episode_total = total;
        if (episodes.length && !Array.isArray(part.episodes)) part.episodes = episodes.map(episode => ({ number: Number(episode.number), title: text(episode.title), ...(episode.first_aired ? { air_date: text(episode.first_aired).slice(0, 10) } : {}), ...(Number(episode.runtime) > 0 ? { duration: Number(episode.runtime) } : {}) }));
        const durations = episodes.map(episode => Number(episode.runtime)).filter(value => value > 0 && Number.isFinite(value));
        if (!(Number(part.episode_duration) > 0) && durations.length) part.episode_duration = Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length);
    }
    for (const key of state.episodes) {
        const [season, episode] = key.split(':').map(Number);
        if (!Number.isInteger(season) || season < 0 || !Number.isInteger(episode) || episode < 1 || episode > 50000) throw new Error('TRAKT_INVALID_EPISODE');
        if (!parts.some((part, index) => Number(part.season ?? part.seasonNumber ?? index + 1) === season)) parts.push({ id: `season-${season}`, kind: 'season', title: season ? `Season ${season}` : 'Specials', season, episode_total: null });
    }
    parts.sort((a, b) => Number(a.season ?? a.seasonNumber) - Number(b.season ?? b.seasonNumber));
    for (const [index, part] of parts.entries()) {
        const season = Number(part.season ?? part.seasonNumber ?? index + 1);
        const watched = normalizeWatchedEpisodes(state.episodes.filter(key => Number(key.split(':')[0]) === season).map(key => Number(key.split(':')[1])));
        part.watched_episodes = watched;
        part.episode_tracking = 'episodes'; part.episode_current = watched.length;
        if (part.episode_total != null) part.episode_total = Math.max(Number(part.episode_total) || 0, ...watched, 0);
        part.status = Number(part.episode_total) > 0 && watched.length >= Number(part.episode_total) ? 'completed' : watched.length ? 'watching' : 'planned';
    }
    if (!parts.length) throw new Error('TRAKT_NO_SEASONS');
    const regular = parts.filter((part, index) => Number(part.season ?? part.seasonNumber ?? index + 1) > 0);
    const started = parts.filter(part => Number(part.episode_current) > 0 && part.status !== 'completed');
    const kept = parts.find(part => part.id === fm.active_part_id && Number(part.episode_current) > 0 && part.status !== 'completed');
    const active = kept ?? started[started.length - 1] ?? regular.find(part => part.status !== 'completed') ?? regular[regular.length - 1] ?? parts[0];
    updates.series_parts = parts; updates.active_part_id = active.id;
    updates.season_current = active.season ?? active.seasonNumber;
    updates.episode_current = active.episode_current; updates.episode_total = active.episode_total;
    updates.seasons = regular.length;
    updates.status = regular.length && regular.every(part => part.status === 'completed') ? 'completed' : state.episodes.length ? 'watching' : 'planned';
    if (typeof fm.status === 'string' && (fm.status.startsWith('custom_') || ['paused', 'dropped'].includes(fm.status))) updates.status = fm.status;
    return updates;
}
