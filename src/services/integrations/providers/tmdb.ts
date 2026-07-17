import { SearchResult, VideoDetails, IntegrationVideoPart } from '../types';
import type { JsonFetcher } from './common';

interface TmdbOptions {
    kind: 'movies' | 'series';
    page?: number;
    pageSize?: number;
}

const TMDB_API_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

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
    const endpoint = options.kind === 'series' ? '/search/tv' : '/search/movie';
    const payload = await fetchJson(buildUrl(endpoint, apiKey, {
        query,
        page,
        include_adult: false,
    }));
    if (!payload || typeof payload !== 'object') return [];
    const results = (payload as Record<string, unknown>).results;
    if (!Array.isArray(results)) return [];

    return results
        .slice(0, options.pageSize ?? 20)
        .map((entry) => {
            const item = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
            const isSeries = options.kind === 'series';
            return {
                id: String(item.id ?? ''),
                title: clean(isSeries ? item.name : item.title) || clean(isSeries ? item.original_name : item.original_title),
                provider: 'tmdb' as const,
                image: imageUrl(item.poster_path),
                year: toYear(isSeries ? item.first_air_date : item.release_date),
                format: isSeries ? 'TV / TMDB' : 'Movie / TMDB',
            };
        })
        .filter((item) => item.id && item.title);
}

export async function getTmdbDetails(
    fetchJson: JsonFetcher,
    id: string,
    apiKey: string,
    kind: 'movies' | 'series'
): Promise<VideoDetails | null> {
    if (!id || !apiKey.trim()) return null;
    const endpoint = kind === 'series' ? `/tv/${encodeURIComponent(id)}` : `/movie/${encodeURIComponent(id)}`;
    const item = await fetchJson(buildUrl(endpoint, apiKey, { append_to_response: 'credits' }));
    if (!item || typeof item !== 'object') return null;
    const show = item as Record<string, unknown>;
    const isSeries = kind === 'series';
    const runtime = isSeries
        ? Array.isArray(show.episode_run_time) ? Number(show.episode_run_time[0]) : NaN
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
        }))
        : [];
    const networks = isSeries ? getArray(show, 'networks').map((network) => clean(network.name)).filter(Boolean) : [];
    const studios = getArray(show, 'production_companies').map((company) => clean(company.name)).filter(Boolean);

    return {
        kind: 'video',
        name: clean(isSeries ? show.name : show.title) || clean(isSeries ? show.original_name : show.original_title) || 'Untitled',
        description: clean(show.overview),
        poster: imageUrl(show.poster_path),
        posterHorizontal: imageUrl(show.backdrop_path, 'w780') || imageUrl(show.poster_path),
        genres: getGenres(show),
        year: toYear(isSeries ? show.first_air_date : show.release_date),
        released: clean(isSeries ? show.first_air_date : show.release_date),
        runtime: Number.isFinite(runtime) && runtime > 0 ? `${runtime} min` : '',
        director: '',
        actors: getCastNames(show),
        rating: Number.isFinite(Number(show.vote_average)) ? Number(show.vote_average).toFixed(1) : '',
        seasons: isSeries ? String(seasons.length || '') : '',
        episodeCurrent: '0',
        episodeTotal: parts.reduce((sum, part) => sum + (part.episodeTotal ?? 0), 0).toString(),
        networks,
        studios,
        url: `https://www.themoviedb.org/${isSeries ? 'tv' : 'movie'}/${id}`,
        parts,
    };
}
