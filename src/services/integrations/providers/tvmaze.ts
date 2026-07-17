import { SearchResult, VideoDetails, IntegrationVideoPart } from '../types';
import type { JsonFetcher } from './common';

interface TvmazeOptions {
    kind: 'movies' | 'series';
    page?: number;
    pageSize?: number;
}

function clean(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function toYear(value: unknown): string {
    return clean(value).slice(0, 4);
}

function pickImage(value: unknown): string {
    if (!value || typeof value !== 'object') return '';
    const image = value as Record<string, unknown>;
    return clean(image.original) || clean(image.medium);
}

function stripHtml(value: unknown): string {
    return clean(value).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function normalizeSearchEntries(payload: unknown): Record<string, unknown>[] {
    if (!Array.isArray(payload)) return [];
    return payload
        .map((entry) => entry && typeof entry === 'object' ? (entry as Record<string, unknown>).show : null)
        .filter((show): show is Record<string, unknown> => Boolean(show && typeof show === 'object'));
}

function isMovieType(item: Record<string, unknown>): boolean {
    const type = clean(item.type).toLowerCase();
    return type === 'movie' || type === 'film';
}

function matchesRequestedKind(item: Record<string, unknown>, kind: TvmazeOptions['kind']): boolean {
    const isMovie = isMovieType(item);
    return kind === 'movies' ? isMovie : !isMovie;
}

function normalizeEmbeddedList(source: Record<string, unknown>, key: string): Record<string, unknown>[] {
    const embedded = source._embedded;
    if (!embedded || typeof embedded !== 'object') return [];
    const value = (embedded as Record<string, unknown>)[key];
    return Array.isArray(value)
        ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
        : [];
}

function getChannelNames(item: Record<string, unknown>): string[] {
    return [item.network, item.webChannel]
        .map((value) => value && typeof value === 'object' ? clean((value as Record<string, unknown>).name) : '')
        .filter(Boolean);
}

function getCastNames(item: Record<string, unknown>): string {
    return normalizeEmbeddedList(item, 'cast')
        .map((entry) => entry.person && typeof entry.person === 'object' ? clean((entry.person as Record<string, unknown>).name) : '')
        .filter(Boolean)
        .slice(0, 8)
        .join(', ');
}

export async function searchTvmaze(
    fetchJson: JsonFetcher,
    query: string,
    _apiKey: string,
    options: TvmazeOptions
): Promise<SearchResult[]> {
    if (!query.trim()) return [];
    const payload = await fetchJson(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`);
    return normalizeSearchEntries(payload)
        .filter((item) => matchesRequestedKind(item, options.kind))
        .slice(0, options.pageSize ?? 20)
        .map((item) => ({
            id: String(item.id ?? ''),
            title: clean(item.name),
            provider: 'tvmaze' as const,
            image: pickImage(item.image),
            year: toYear(item.premiered),
            format: options.kind === 'movies' ? 'Movie / TVmaze' : (clean(item.type) || 'Series'),
        }))
        .filter((item) => item.id && item.title);
}

export async function getTvmazeDetails(
    fetchJson: JsonFetcher,
    id: string,
    _apiKey: string,
    kind: 'movies' | 'series'
): Promise<VideoDetails | null> {
    if (!id) return null;
    const item = await fetchJson(`https://api.tvmaze.com/shows/${encodeURIComponent(id)}?embed[]=seasons&embed[]=cast`);
    if (!item || typeof item !== 'object') return null;
    const show = item as Record<string, unknown>;
    if (!matchesRequestedKind(show, kind)) return null;

    const seasons = kind === 'series'
        ? normalizeEmbeddedList(show, 'seasons')
        .filter((season) => Number(season.number) > 0)
        .map((season): IntegrationVideoPart => ({
            id: `season-${season.id ?? season.number}`,
            kind: 'season',
            title: clean(season.name) || `Season ${season.number}`,
            seasonNumber: Number(season.number),
            episodeCurrent: 0,
            episodeTotal: Number.isFinite(Number(season.episodeOrder)) ? Number(season.episodeOrder) : null,
            status: 'planned',
        }))
        : [({
            id: 'main',
            kind: 'movie',
            title: clean(show.name) || 'Movie',
            seasonNumber: null,
            episodeCurrent: 0,
            episodeTotal: 1,
            status: 'planned',
        } satisfies IntegrationVideoPart)];
    const runtime = Number(show.averageRuntime ?? show.runtime);
    const rating = show.rating && typeof show.rating === 'object'
        ? clean((show.rating as Record<string, unknown>).average)
        : '';

    return {
        kind: 'video',
        name: clean(show.name) || 'Untitled',
        description: stripHtml(show.summary),
        poster: pickImage(show.image),
        posterHorizontal: pickImage(show.image),
        genres: Array.isArray(show.genres) ? show.genres.map((genre) => clean(genre)).filter(Boolean) : [],
        year: toYear(show.premiered),
        released: clean(show.premiered),
        runtime: Number.isFinite(runtime) ? `${runtime} min` : '',
        director: '',
        actors: getCastNames(show),
        rating,
        seasons: String(seasons.length || ''),
        episodeCurrent: '0',
        episodeTotal: seasons.reduce((sum, part) => sum + (part.episodeTotal ?? 0), 0).toString(),
        networks: getChannelNames(show),
        studios: getChannelNames(show),
        url: clean(show.officialSite) || clean(show.url),
        parts: seasons,
    };
}
