import { inferVideoWorkType } from '../workTypeInference';
import { SearchResult, VideoDetails, IntegrationVideoPart, type SourceImage } from '../types';
import type { JsonFetcher } from './common';
import { normalizeCountryMetadata } from '../../media/statisticsCountries';

interface TmdbOptions {
    kind: 'movies' | 'series' | 'mixed';
    language?: string;
    page?: number;
    pageSize?: number;
}

const TMDB_API_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

export const TMDB_LANGUAGES = [
    'en-US', 'uk-UA', 'ru-RU', 'de-DE', 'fr-FR', 'es-ES', 'es-MX', 'it-IT',
    'pt-BR', 'pt-PT', 'pl-PL', 'cs-CZ', 'sk-SK', 'nl-NL', 'da-DK', 'sv-SE',
    'nb-NO', 'fi-FI', 'el-GR', 'tr-TR', 'ro-RO', 'hu-HU', 'bg-BG', 'hr-HR',
    'sr-RS', 'sl-SI', 'lt-LT', 'lv-LV', 'et-EE', 'ar-SA', 'he-IL', 'fa-IR',
    'hi-IN', 'bn-BD', 'ta-IN', 'th-TH', 'vi-VN', 'id-ID', 'ms-MY',
    'ja-JP', 'ko-KR', 'zh-CN', 'zh-TW',
];

export function normalizeTmdbLanguage(value: unknown): string {
    if (typeof value !== 'string') return 'en-US';
    return TMDB_LANGUAGES.find(language => language.toLowerCase() === value.trim().toLowerCase()) ?? 'en-US';
}

function clean(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function toYear(value: unknown): string {
    return clean(value).slice(0, 4);
}

function imageUrl(path: unknown, size = 'w500'): string {
    const text = clean(path);
    if (!text) return '';
    if (/^https?:\/\//i.test(text)) return text;
    return `${TMDB_IMAGE_BASE}/${size}${text.startsWith('/') ? text : `/${text}`}`;
}

function getArray(source: Record<string, unknown>, key: string): Record<string, unknown>[] {
    const value = source[key];
    return Array.isArray(value)
        ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
        : [];
}

function getGenres(item: Record<string, unknown>): string[] {
    return getArray(item, 'genres')
        .map((genre) => clean(genre.name))
        .filter(Boolean);
}

function getCastNames(item: Record<string, unknown>): string {
    const credits = item.credits && typeof item.credits === 'object'
        ? item.credits as Record<string, unknown>
        : {};
    return getArray(credits, 'cast')
        .map((entry) => clean(entry.name))
        .filter(Boolean)
        .slice(0, 8)
        .join(', ');
}

function getDirectorNames(item: Record<string, unknown>): string {
    const names = new Set<string>();
    for (const key of ['credits', 'aggregate_credits']) {
        const credits = item[key];
        if (!credits || typeof credits !== 'object') continue;
        for (const person of getArray(credits as Record<string, unknown>, 'crew')) {
            const directed = clean(person.job) === 'Director' || getArray(person, 'jobs').some(job => clean(job.job) === 'Director');
            if (directed && clean(person.name)) names.add(clean(person.name));
        }
    }
    return [...names].join(', ');
}

function buildUrl(path: string, apiKey: string, params: Record<string, string | number | boolean> = {}): string {
    const search = new URLSearchParams({
        api_key: apiKey,
        language: 'en-US',
    });
    for (const [key, value] of Object.entries(params)) {
        search.set(key, String(value));
    }
    return `${TMDB_API_BASE}${path}?${search.toString()}`;
}

export async function searchTmdb(
    fetchJson: JsonFetcher,
    query: string,
    apiKey: string,
    options: TmdbOptions
): Promise<SearchResult[]> {
    if (!query.trim() || !apiKey.trim()) return [];
    const page = Math.max(1, options.page ?? 1);
    const endpoint = options.kind === 'mixed' ? '/search/multi' : options.kind === 'series' ? '/search/tv' : '/search/movie';
    const payload = await fetchJson(buildUrl(endpoint, apiKey, {
        language: normalizeTmdbLanguage(options.language),
        query,
        page,
        include_adult: false,
    }));
    if (!payload || typeof payload !== 'object') return [];
    const results = (payload as Record<string, unknown>).results;
    if (!Array.isArray(results)) return [];

    const items = results
        .flatMap((entry): SearchResult[] => {
            const item = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
            if (options.kind === 'mixed' && item.media_type !== 'tv' && item.media_type !== 'movie') return [];
            const isSeries = options.kind === 'series' || options.kind === 'mixed' && item.media_type === 'tv';
            return [{
                id: String(item.id ?? ''),
                title: clean(isSeries ? item.name : item.title) || clean(isSeries ? item.original_name : item.original_title),
                provider: 'tmdb' as const,
                image: imageUrl(item.poster_path),
                year: toYear(isSeries ? item.first_air_date : item.release_date),
                released: clean(isSeries ? item.first_air_date : item.release_date),
                workType: inferVideoWorkType(isSeries ? 'series' : 'movies', item),
                workTypeMedia: isSeries ? 'series' as const : 'movie' as const,
            }];
        })
        .filter((item) => item.id && item.title);
    if (options.kind === 'mixed') {
        // A TMDB page has up to 20 results. Keep the full page so none are skipped.
        return Object.assign(items, { hasNext: page < Number((payload as Record<string, unknown>).total_pages) });
    }
    return items.slice(0, options.pageSize ?? 20);
}

export async function getTmdbDetails(
    fetchJson: JsonFetcher,
    id: string,
    apiKey: string,
    kind: 'movies' | 'series',
    language = 'en-US',
    options: { includeEpisodeDurations?: boolean } = {}
): Promise<VideoDetails | null> {
    if (!id || !apiKey.trim()) return null;
    const endpoint = kind === 'series' ? `/tv/${encodeURIComponent(id)}` : `/movie/${encodeURIComponent(id)}`;
    const item = await fetchJson(buildUrl(endpoint, apiKey, {
        append_to_response: kind === 'series' ? 'credits,aggregate_credits' : 'credits',
        language: normalizeTmdbLanguage(language),
    }));
    if (!item || typeof item !== 'object') return null;
    const show = item as Record<string, unknown>;
    const isSeries = kind === 'series';
    const runtime = isSeries
        ? Array.isArray(show.episode_run_time) ? show.episode_run_time.map(Number).find(value => Number.isFinite(value) && value > 0) ?? NaN : NaN
        : Number(show.runtime);
    const seasons = isSeries ? getArray(show, 'seasons').filter((season) => Number(season.season_number) > 0) : [];
    const parts: IntegrationVideoPart[] = isSeries
        ? seasons.map((season) => ({
            id: `season-${season.id ?? season.season_number}`,
            kind: 'season',
            title: clean(season.name) || `Season ${season.season_number}`,
            seasonNumber: Number(season.season_number),
            episodeCurrent: 0,
            episodeTotal: Number.isFinite(Number(season.episode_count)) ? Number(season.episode_count) : null,
            status: 'planned',
            poster: imageUrl(season.poster_path) || null,
            year: Number(toYear(season.air_date)) || null,
            releaseDate: typeof season.air_date === 'string' ? season.air_date : null,
            episodeDuration: Number.isFinite(runtime) && runtime > 0 ? runtime : null,
        }))
        : [];
    // Some shows have no series runtime, but their season episodes do.
    if (isSeries && !(runtime > 0) && options.includeEpisodeDurations !== false) {
        for (const part of parts) {
            try {
                const details = await fetchJson(buildUrl(`${endpoint}/season/${part.seasonNumber}`, apiKey, {
                    language: normalizeTmdbLanguage(language),
                }));
                const episodes = details && typeof details === 'object'
                    ? getArray(details as Record<string, unknown>, 'episodes') : [];
                const durations = episodes.map(episode => Number(episode.runtime)).filter(value => Number.isFinite(value) && value > 0);
                if (durations.length) part.episodeDuration = Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length);
            } catch {
                // Runtime enrichment is optional; keep the title and season metadata usable.
            }
        }
    }
    const networks = isSeries ? getArray(show, 'networks').map((network) => clean(network.name)).filter(Boolean) : [];
    const studios = getArray(show, 'production_companies').map((company) => clean(company.name)).filter(Boolean);

    return {
        kind: 'video',
        workType: inferVideoWorkType(kind, show),
        name: clean(isSeries ? show.name : show.title) || clean(isSeries ? show.original_name : show.original_title) || 'Untitled',
        description: clean(show.overview),
        poster: imageUrl(show.poster_path),
        posterHorizontal: imageUrl(show.backdrop_path, 'w780') || imageUrl(show.poster_path),
        genres: getGenres(show),
        year: toYear(isSeries ? show.first_air_date : show.release_date),
        released: clean(isSeries ? show.first_air_date : show.release_date),
        runtime: Number.isFinite(runtime) && runtime > 0 ? `${runtime} min` : '',
        director: getDirectorNames(show),
        actors: getCastNames(show),
        rating: Number.isFinite(Number(show.vote_average)) ? Number(show.vote_average).toFixed(1) : '',
        communityRating: Number.isFinite(Number(show.vote_average)) ? Number(show.vote_average).toFixed(1) : '',
        communityVotes: Number.isFinite(Number(show.vote_count)) ? String(Math.trunc(Number(show.vote_count))) : '',
        seasons: isSeries ? String(seasons.length || '') : '',
        episodeCurrent: '0',
        episodeTotal: parts.reduce((sum, part) => sum + (part.episodeTotal ?? 0), 0).toString(),
        networks,
        studios,
        countries: normalizeCountryMetadata([show.production_countries, show.origin_country]),
        url: `https://www.themoviedb.org/${isSeries ? 'tv' : 'movie'}/${id}`,
        parts,
    };
}

export async function getTmdbGallery(fetch: JsonFetcher, id: string, apiKey: string, kind: 'movie' | 'tv'): Promise<SourceImage[]> {
    if (!/^[1-9]\d*$/.test(id)) return [];
    const params = new URLSearchParams({ api_key: apiKey });
    const raw = await fetch(`${TMDB_API_BASE}/${kind}/${id}/images?${params}`);
    if (!raw || typeof raw !== 'object') return [];
    const result = raw as Record<string, unknown>;
    return (['backdrops', 'posters'] as const).flatMap(kind => getArray(result, kind).map(image => ({
        url: imageUrl(image.file_path, 'original'),
        thumbnail: imageUrl(image.file_path, 'w300'),
        kind,
    })));
}

export async function getTmdbTrailerEntries(
    fetch: JsonFetcher, id: string, apiKey: string, kind: 'movie' | 'tv', language: string
): Promise<Record<string, unknown>[]> {
    if (!/^[1-9]\d*$/.test(id)) return [];
    const languages = [...new Set([normalizeTmdbLanguage(language), 'en-US'])];
    const results = await Promise.allSettled(languages.map(async locale => {
        const params = new URLSearchParams({ api_key: apiKey, language: locale });
        const raw = await fetch(`${TMDB_API_BASE}/${kind}/${id}/videos?${params}`);
        return raw && typeof raw === 'object' ? getArray(raw as Record<string, unknown>, 'results') : [];
    }));
    const successful = results.filter(result => result.status === 'fulfilled');
    if (!successful.length && results[0]?.status === 'rejected') throw results[0].reason;
    return successful.flatMap(result => result.value);
}

export async function findTmdbGalleryId(
    fetch: JsonFetcher, id: string, apiKey: string, kind: 'movie' | 'tv', externalSource: 'imdb_id' | 'tvdb_id'
): Promise<string | null> {
    if (!(externalSource === 'imdb_id' ? /^tt\d+$/ : /^[1-9]\d*$/).test(id)) return null;
    const params = new URLSearchParams({ api_key: apiKey, external_source: externalSource });
    const raw = await fetch(`${TMDB_API_BASE}/find/${id}?${params}`);
    if (!raw || typeof raw !== 'object') return null;
    const results = getArray(raw as Record<string, unknown>, kind === 'movie' ? 'movie_results' : 'tv_results');
    return results.length === 1 && /^[1-9]\d*$/.test(String(results[0].id)) ? String(results[0].id) : null;
}
