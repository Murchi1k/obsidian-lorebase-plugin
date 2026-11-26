import { asError } from '../utils/errors';
import { scheduleTimeout } from '../utils/timers';
import { assertOnlineExtras, runOnlineExtra } from './onlineExtras';
import type { AnimeItem, LorebaseSettings, MovieItem, SeriesItem } from '../types';
import { i18n } from '../localization';
import { fetchJson } from './integrations/shared';
import { asArray, asObject, type JsonFetcher } from './integrations/providers/common';
import { fetchKitsu } from './integrations/providers/kitsu';
import { normalizeTmdbLanguage } from './integrations/providers/tmdb';
import { anilistRecommendations, findRecommendationTmdbId, recommendationId as id, shikimoriRecommendations, tmdbRecommendations, type Recommendations, type RecommendedWork } from './integrations/providers/recommendations';
import type { RecommendationLibraryService } from './RecommendationLibraryService';
import type { SearchResult } from './integrations/types';
import type { TFile } from 'obsidian';
import { isProviderEnabled } from './integrations/providerSettings';

export type RecommendationTitle = AnimeItem | MovieItem | SeriesItem;
type Source = { provider: string; id: string };
const network: JsonFetcher = (url, headers, method, body) => fetchJson(url, headers, method, body, { swallowErrors: false });
/** Recommendation lists come only from public catalogs; library actions are explicit. */
export class RecommendationsService {
    private cache = new Map<string, { expires: number; value: Promise<Recommendations> }>();
    constructor(private settings: () => LorebaseSettings, private fetch: JsonFetcher = network, private library?: RecommendationLibraryService) {
        const baseFetch = this.fetch;
        this.fetch = (...args) => runOnlineExtra(() => baseFetch(...args));
    }
    private selection(item: RecommendationTitle, source: Recommendations['source'], work: RecommendedWork): SearchResult {
        const provider = source === 'TMDB' ? 'tmdb' : source === 'Shikimori' ? 'shikimori' : 'anilist';
        return { id: work.id, title: work.title, year: work.year, image: work.image, provider,
            ...(provider === 'tmdb' && item.type !== 'anime' ? { tmdbLanguage: normalizeTmdbLanguage(this.settings().integrations?.media[item.type === 'movie' ? 'movies' : 'series'].tmdbLanguage) } : {}) };
    }
    libraryIndex(item: RecommendationTitle, source: Recommendations['source']): (work: RecommendedWork) => TFile | null {
        const find = this.library?.index(item.type); return work => find?.(this.selection(item, source, work)) ?? null;
    }
    async add(item: RecommendationTitle, source: Recommendations['source'], work: RecommendedWork): Promise<TFile | null> {
        if (!this.library) throw new Error('Recommendations import unavailable');
        return this.library.add(item.type, this.selection(item, source, work));
    }
    async open(file: TFile): Promise<void> { await this.library?.open(file); }
    private source(item: RecommendationTitle): Source {
        const provider = item.integrationProvider ?? '', linkedId = String(item.integrationId || '');
        if (['tmdb', 'anilist', 'shikimori', 'jikan', 'kitsu', 'tvmaze'].includes(provider) && id(linkedId) || provider === 'omdb' && /^tt\d+$/.test(linkedId)) return { provider, id: linkedId };
        try {
            const url = new URL(item.sourceUrl || ''), host = url.hostname.replace(/^www\./, '');
            if (url.protocol !== 'https:' && url.protocol !== 'http:' || url.username || url.password) throw new Error();
            const sources: Array<[string, string, RegExp]> = item.type === 'anime'
                ? [['anilist.co', 'anilist', /^\/anime\/(\d+)(?:[/-]|$)/], ['myanimelist.net', 'jikan', /^\/anime\/(\d+)(?:[/-]|$)/], ['kitsu.io', 'kitsu', /^\/anime\/(\d+)(?:[/-]|$)/],
                    ...['shikimori.net', 'shikimori.io', 'shikimori.one'].map((host): [string, string, RegExp] => [host, 'shikimori', /^\/animes\/[a-z]?(\d+)(?:[/-]|$)/])]
                : [['themoviedb.org', 'tmdb', item.type === 'movie' ? /^\/movie\/(\d+)(?:[/-]|$)/ : /^\/tv\/(\d+)(?:[/-]|$)/], ['imdb.com', 'omdb', /^\/title\/(tt\d+)(?:\/|$)/], ['tvmaze.com', 'tvmaze', /^\/shows\/(\d+)(?:\/|$)/]];
            for (const [domain, provider, pattern] of sources) if (host === domain) { const match = pattern.exec(url.pathname); if (match && (id(match[1]) || /^tt\d+$/.test(match[1]))) return { provider, id: match[1] }; }
        } catch { /* Unlinked or unsupported source. Never search by an ambiguous title. */ }
        throw new Error('RECOMMENDATIONS_SOURCE');
    }
    load(item: RecommendationTitle): Promise<Recommendations> {
        try {
            assertOnlineExtras();
            const config = this.settings().integrations;
            if (!config?.enabled) throw new Error(item.type === 'anime' ? 'RECOMMENDATIONS_SETUP' : 'RECOMMENDATIONS_TMDB');
            const source = this.source(item), provider = item.type === 'anime' ? source.provider === 'shikimori' ? 'shikimori' : 'anilist' : 'tmdb';
            if (!isProviderEnabled(config, provider, item.type === 'anime' ? 'anime' : undefined) || provider === 'tmdb' && !config.providers.tmdb.apiKey?.trim()) throw new Error(provider === 'tmdb' ? 'RECOMMENDATIONS_TMDB' : 'RECOMMENDATIONS_SETUP');
            if (source.provider === 'kitsu' && !config.providers.kitsu.enabled) throw new Error('RECOMMENDATIONS_SETUP');
            const language = item.type === 'anime' ? i18n.getLanguage() : normalizeTmdbLanguage(config.media[item.type === 'movie' ? 'movies' : 'series'].tmdbLanguage);
            const key = `${item.type}:${source.provider}:${source.id}:${language}:${item.type === 'anime' && item.isAdult}:${config.providers.tmdb.apiKey || ''}`;
            const hit = this.cache.get(key); if (hit && hit.expires > Date.now()) return hit.value;
            let timer: (() => void) | undefined;
            const value = Promise.race([this.read(item, source, language), new Promise<never>((_, reject) => { timer = scheduleTimeout(() => reject(new Error('Recommendations timed out')), 15_000); })])
                .finally(() => { timer?.(); }).catch(error => { if (this.cache.get(key)?.value === value) this.cache.delete(key); throw error; });
            if (this.cache.size >= 80) this.cache.delete(this.cache.keys().next().value!);
            this.cache.set(key, { expires: Date.now() + 15 * 60_000, value }); return value;
        } catch (error) { return Promise.reject(asError(error)); }
    }
    private async read(item: RecommendationTitle, source: Source, language: string): Promise<Recommendations> {
        if (item.type === 'anime') {
            if (source.provider === 'shikimori') return shikimoriRecommendations(this.fetch, source.id, language, item.isAdult);
            let animeId = source.id, mal = source.provider === 'jikan';
            if (source.provider === 'kitsu') {
                const payload = await fetchKitsu(this.fetch, `anime/${source.id}/mappings`);
                const mappings = asArray(asObject(payload)?.data).map(row => asObject(asObject(row)?.attributes));
                const matches = [...new Set(mappings.filter(row => row?.externalSite === 'myanimelist/anime').map(row => id(row?.externalId)).filter(Boolean))];
                if (matches.length !== 1) throw new Error('RECOMMENDATIONS_SOURCE');
                animeId = matches[0]; mal = true;
            } else if (!['anilist', 'jikan'].includes(source.provider)) throw new Error('RECOMMENDATIONS_SOURCE');
            return anilistRecommendations(this.fetch, animeId, mal, item.isAdult);
        }
        const config = this.settings().integrations!, key = config.providers.tmdb.apiKey!.trim();
        let tmdbId = source.provider === 'tmdb' ? source.id : '';
        if (source.provider === 'omdb') tmdbId = await findRecommendationTmdbId(this.fetch, item.type, source.id, 'imdb_id', key, language);
        if (source.provider === 'tvmaze' && item.type === 'series') {
            const show = await this.fetch(`https://api.tvmaze.com/shows/${source.id}`) as { id?: unknown; externals?: { imdb?: string; thetvdb?: number } } | null;
            if (id(show?.id) !== source.id) throw new Error('RECOMMENDATIONS_SOURCE');
            if (show?.externals?.imdb) tmdbId = await findRecommendationTmdbId(this.fetch, item.type, show.externals.imdb, 'imdb_id', key, language);
            if (!tmdbId && show?.externals?.thetvdb) tmdbId = await findRecommendationTmdbId(this.fetch, item.type, String(show.externals.thetvdb), 'tvdb_id', key, language);
        }
        if (!tmdbId) throw new Error('RECOMMENDATIONS_SOURCE');
        return tmdbRecommendations(this.fetch, item.type, tmdbId, key, language);
    }
}
