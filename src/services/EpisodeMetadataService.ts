import type { AnimeItem, SeriesItem, AnimePart, VideoPart, EpisodeInfo, LorebaseSettings } from '../types';
import { fetchJson } from './integrations/shared';
import type { JsonFetcher } from './integrations/providers/common';
import { getTmdbDetails, normalizeTmdbLanguage } from './integrations/providers/tmdb';
import { getTvmazeDetails } from './integrations/providers/tvmaze';
import { getOmdbSeasonEpisodes } from './integrations/providers/omdb';
import { isAnimeVideoProvider } from './integrations/animeVideoSources';
import { normalizeEpisodeDetails } from './media/episodeTracking';
import { resolveKitsuMalId } from './integrations/providers/kitsu';
import { isProviderEnabled } from './integrations/providerSettings';

const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const rows = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.map(object) : [];
const id = (value: unknown): string => /^[1-9]\d*$/.test(String(value || '')) ? String(value) : '';
type RequestLimits = { requestTimeoutMs?: number; loadTimeoutMs?: number };
export type SeriesPartsRefresh = { parts: VideoPart[]; partial: boolean };

export class EpisodeMetadataService {
    private cache = new Map<string, { expires: number; value: Promise<EpisodeInfo[]> }>();
    constructor(private settings: () => LorebaseSettings,
        private fetch: JsonFetcher = (url, headers, method, body) => fetchJson(url, headers, method, body, { swallowErrors: false }),
        private limits: RequestLimits = {}) {}
    load(item: AnimeItem | SeriesItem, part: AnimePart | VideoPart): Promise<EpisodeInfo[]> {
        return this.loadPart(item, part);
    }

    private loadPart(item: AnimeItem | SeriesItem, part: AnimePart | VideoPart, refresh?: { tvmazeSeasonId: string }): Promise<EpisodeInfo[]> {
        const integrations = this.settings().integrations;
        const provider = item.integrationProvider;
        if (!integrations?.enabled || !provider || !isProviderEnabled(integrations, provider === 'jikan' ? 'kitsu' : provider, item.type)) return Promise.resolve([]);
        const language = normalizeTmdbLanguage(integrations.media.series.tmdbLanguage);
        const partKey = item.type === 'series' ? part.seasonNumber : part.id;
        const key = `${item.type}:${provider}:${item.integrationId}:${partKey}:${language}`;
        const hit = this.cache.get(key); if (!refresh && hit && hit.expires > Date.now()) return hit.value;
        if (this.cache.size >= 50) this.cache.delete(this.cache.keys().next().value!);
        const timeout = this.limits.loadTimeoutMs ?? 60_000;
        const value = this.withTimeout(this.request(item, part, language, Date.now() + timeout, refresh?.tvmazeSeasonId), timeout).catch(error => { if (this.cache.get(key)?.value === value) this.cache.delete(key); throw error; });
        this.cache.set(key, { expires: Date.now() + 30 * 60_000, value }); return value;
    }

    canRefreshSeries(item: SeriesItem): boolean {
        const integrations = this.settings().integrations;
        if (!integrations?.enabled || !id(item.integrationId)) return false;
        if (item.integrationProvider === 'tmdb') return Boolean(integrations.providers.tmdb.enabled && integrations.providers.tmdb.apiKey?.trim());
        return item.integrationProvider === 'tvmaze' && integrations.providers.tvmaze.enabled;
    }

    async refreshSeries(item: SeriesItem): Promise<SeriesPartsRefresh> {
        if (!this.canRefreshSeries(item)) return { parts: [], partial: false };
        const integrations = this.settings().integrations!;
        const fetch = this.fetchWithin(Date.now() + (this.limits.loadTimeoutMs ?? 60_000));
        const seriesId = id(item.integrationId);
        const catalog = item.integrationProvider === 'tmdb'
            ? await getTmdbDetails(fetch, seriesId, integrations.providers.tmdb.apiKey ?? '', 'series', integrations.media.series.tmdbLanguage, { includeEpisodeDurations: false })
            : await getTvmazeDetails(fetch, seriesId, '', 'series');
        const seasons = (catalog?.parts ?? []).filter(part => part.kind === 'season' && Number.isInteger(part.seasonNumber));
        const parts: VideoPart[] = [];
        let partial = false;
        for (let offset = 0; offset < seasons.length; offset += 4) {
            const batch = seasons.slice(offset, offset + 4);
            const details = await Promise.allSettled(batch.map(part => {
                const sourceId = item.integrationProvider === 'tvmaze' ? id(part.id.slice('season-'.length)) : '';
                // TVmaze's catalog parser falls back to the season number if the ID is missing.
                const tvmazeSeasonId = sourceId === String(part.seasonNumber) ? '' : sourceId;
                return this.loadPart(item, part, { tvmazeSeasonId });
            }));
            batch.forEach((part, index) => {
                const result = details[index];
                if (result.status === 'fulfilled') parts.push({ ...part, episodeDetails: result.value, episodeTotal: result.value.reduce((max, episode) => Math.max(max, episode.number), part.episodeTotal ?? 0) || null });
                else {
                    partial = true;
                    parts.push(part);
                }
            });
        }
        return { parts, partial };
    }

    private fetchWithin(deadline: number): JsonFetcher {
        return (url, headers, method, body) => {
            const remaining = deadline - Date.now();
            if (remaining <= 0) return Promise.reject(new Error('Episode metadata timed out'));
            return this.withTimeout(Promise.resolve().then(() => this.fetch(url, headers, method, body)), Math.min(remaining, this.limits.requestTimeoutMs ?? 8_000));
        };
    }

    private async request(item: AnimeItem | SeriesItem, part: AnimePart | VideoPart, language: string, deadline: number, tvmazeSeasonId = ''): Promise<EpisodeInfo[]> {
        const fetch = this.fetchWithin(deadline);
        const animeVideo = item.type === 'anime' && isAnimeVideoProvider(item.integrationProvider);
        if (animeVideo && (item.integrationSourceKind !== 'series'
            || part.id !== `${item.integrationProvider}-series-${item.integrationId}-${part.seasonNumber}`)) return [];
        if (item.type === 'series' || animeVideo) {
            if (item.integrationProvider === 'omdb' && animeVideo && /^tt\d+$/.test(item.integrationId ?? '') && part.seasonNumber) {
                const key = this.settings().integrations?.providers.omdb.apiKey?.trim();
                return key ? getOmdbSeasonEpisodes(fetch, item.integrationId!, key, part.seasonNumber) : [];
            }
            const seriesId = id(item.integrationId), season = part.seasonNumber;
            if (!seriesId || season === null || !Number.isInteger(season) || season < 0) return [];
            if (item.integrationProvider === 'tmdb') {
                const key = this.settings().integrations?.providers.tmdb.apiKey?.trim(); if (!key) return [];
                const data = object(await fetch(`https://api.themoviedb.org/3/tv/${seriesId}/season/${season}?${new URLSearchParams({ api_key: key, language })}`));
                if (data.season_number !== season) throw new Error('Unexpected TMDB season');
                if (!Array.isArray(data.episodes)) throw new Error('TMDB episodes unavailable');
                return normalizeEpisodeDetails(rows(data.episodes).map(row => ({ number: row.episode_number, title: row.name, air_date: row.air_date, duration: row.runtime })));
            }
            if (item.integrationProvider === 'tvmaze') {
                if (!tvmazeSeasonId) {
                    const seasons = rows(await fetch(`https://api.tvmaze.com/shows/${seriesId}/seasons`)).filter(row => row.number === season && id(row.id));
                    if (seasons.length !== 1) return [];
                    tvmazeSeasonId = id(seasons[0].id);
                }
                const episodes = await fetch(`https://api.tvmaze.com/seasons/${tvmazeSeasonId}/episodes`);
                if (!Array.isArray(episodes)) throw new Error('TVmaze episodes unavailable');
                return normalizeEpisodeDetails(rows(episodes).filter(row => row.season === season).map(row => ({ number: row.number, title: row.name, air_date: row.airdate, duration: row.runtime })));
            }
            return [];
        }
        // Each related anime part has its own provider identity; never load the
        // root title's episodes for a manually added or unrelated season.
        let mal = part.id.match(/^jikan-(\d+)$/)?.[1] || '';
        let anilist = part.id.match(/^anilist-(\d+)$/)?.[1] || '';
        let shikimori = part.id.match(/^shikimori-(\d+)$/)?.[1] || '';
        let kitsu = part.id.match(/^kitsu-(\d+)$/)?.[1] || '';
        if (part.id === 'legacy-main' || item.parts?.length === 1 && item.parts[0].id === part.id) {
            if (item.integrationProvider === 'jikan' && !mal) mal = id(item.integrationId);
            if (item.integrationProvider === 'anilist' && !anilist) anilist = id(item.integrationId);
            if (item.integrationProvider === 'shikimori' && !shikimori) shikimori = id(item.integrationId);
            if (item.integrationProvider === 'kitsu' && !kitsu) kitsu = id(item.integrationId);
        }
        if (id(kitsu)) return this.loadKitsu(kitsu, language, fetch);
        if (!mal && id(shikimori)) {
            const data = object(await fetch('https://shikimori.net/api/graphql', { 'Content-Type': 'application/json', 'User-Agent': 'LOREBASE/1.0 (Obsidian plugin; metadata search)' }, 'POST', JSON.stringify({
                query: 'query ($ids: String!) { animes(ids: $ids, limit: 1) { id malId } }', variables: { ids: shikimori },
            })));
            if (data.errors) throw new Error('Shikimori lookup failed');
            const matches = rows(object(data.data).animes).filter(row => id(row.id) === shikimori);
            if (matches.length !== 1) throw new Error('Unexpected Shikimori title');
            mal = id(matches[0].malId);
        }
        if (!mal && id(anilist)) {
            const data = object(await fetch('https://graphql.anilist.co', { 'Content-Type': 'application/json' }, 'POST', JSON.stringify({
                query: 'query ($id: Int) { Media(id: $id, type: ANIME) { id idMal } }', variables: { id: Number(anilist) },
            })));
            if (data.errors) throw new Error('AniList lookup failed');
            const media = object(object(data.data).Media);
            if (id(media.id) !== anilist) throw new Error('Unexpected AniList title');
            mal = id(media.idMal);
        }
        if (!id(mal)) return [];
        const mapped = await resolveKitsuMalId(fetch, mal);
        return mapped ? this.loadKitsu(mapped, language, fetch) : [];
    }
    private async loadKitsu(kitsu: string, language: string, fetch: JsonFetcher): Promise<EpisodeInfo[]> {
        const headers = { Accept: 'application/vnd.api+json' };
        const result: unknown[] = [];
        const locale = language.toLowerCase().replace('-', '_'), prefix = locale.split('_')[0];
        for (let page = 0; page < 1000; page++) {
            const params = new URLSearchParams({ 'page[limit]': '20', 'page[offset]': String(page * 20), sort: 'number' });
            const data = object(await fetch(`https://kitsu.io/api/edge/anime/${kitsu}/episodes?${params}`, headers));
            if (!Array.isArray(data.data)) throw new Error('Kitsu episodes unavailable');
            for (const row of rows(data.data).filter(row => row.type === 'episodes')) {
                const attributes = object(row.attributes), titles = object(attributes.titles);
                const title = [titles[locale], titles[prefix], ...Object.keys(titles).filter(key => key.startsWith(`${prefix}_`)).map(key => titles[key]), attributes.canonicalTitle, titles.en_us, titles.en_jp].find(value => typeof value === 'string' && value.trim());
                result.push({ number: attributes.number, title, air_date: attributes.airdate, duration: attributes.length });
            }
            if (!object(data.links).next) return normalizeEpisodeDetails(result);
        }
        throw new Error('Episode catalog exceeds page limit');
    }
    /** Obsidian's requestUrl cannot be aborted. Detach a stalled transport, clear
     * our timers; late responses cannot update the draft. */
    private withTimeout<T>(request: Promise<T>, timeout: number): Promise<T> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Episode metadata timed out')), timeout);
            request.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
        });
    }
}
