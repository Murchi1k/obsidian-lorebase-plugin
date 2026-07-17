import { SearchResult, VideoDetails, IntegrationVideoPart } from '../types';
import type { JsonFetcher } from './common';

interface OmdbOptions {
    kind: 'movies' | 'series';
    page?: number;
    pageSize?: number;
}

function cleanPoster(value: unknown): string {
    const text = typeof value === 'string' ? value.trim() : '';
    return text && text !== 'N/A' ? text : '';
}

function clean(value: unknown): string {
    const text = typeof value === 'string' ? value.trim() : '';
    return text && text !== 'N/A' ? text : '';
}

function splitList(value: unknown): string[] {
    return clean(value).split(',').map((entry) => entry.trim()).filter(Boolean);
}

export async function searchOmdb(
    fetchJson: JsonFetcher,
    query: string,
    apiKey: string,
    options: OmdbOptions
): Promise<SearchResult[]> {
    if (!query.trim() || !apiKey.trim()) return [];
    const page = Math.max(1, options.page ?? 1);
    const type = options.kind === 'series' ? 'series' : 'movie';
    const payload = await fetchJson(`https://www.omdbapi.com/?apikey=${encodeURIComponent(apiKey)}&s=${encodeURIComponent(query)}&type=${type}&page=${page}`);
    if (!payload || typeof payload !== 'object') return [];
    const search = (payload as Record<string, unknown>).Search;
    if (!Array.isArray(search)) return [];
    return search
        .slice(0, options.pageSize ?? 10)
        .map((entry) => {
            const item = entry as Record<string, unknown>;
            return {
                id: String(item.imdbID ?? ''),
                title: String(item.Title ?? ''),
                provider: 'omdb' as const,
                image: cleanPoster(item.Poster),
                year: clean(item.Year),
                format: clean(item.Type),
            };
        })
        .filter((item) => item.id && item.title);
}

export async function getOmdbDetails(
    fetchJson: JsonFetcher,
    id: string,
    apiKey: string,
    kind: 'movies' | 'series'
): Promise<VideoDetails | null> {
    if (!id || !apiKey.trim()) return null;
    const payload = await fetchJson(`https://www.omdbapi.com/?apikey=${encodeURIComponent(apiKey)}&i=${encodeURIComponent(id)}&plot=full`);
    if (!payload || typeof payload !== 'object') return null;
    const item = payload as Record<string, unknown>;
    if (item.Response === 'False') return null;
    const totalSeasons = Number.parseInt(clean(item.totalSeasons), 10);
    const parts = kind === 'series' && Number.isFinite(totalSeasons)
        ? await getOmdbSeasons(fetchJson, id, apiKey, totalSeasons)
        : [];

    return {
        kind: 'video',
        name: clean(item.Title) || 'Untitled',
        description: clean(item.Plot),
        poster: cleanPoster(item.Poster),
        posterHorizontal: cleanPoster(item.Poster),
        genres: splitList(item.Genre),
        year: clean(item.Year).slice(0, 4),
        released: clean(item.Released),
        runtime: clean(item.Runtime),
        director: clean(item.Director),
        actors: clean(item.Actors),
        rating: clean(item.imdbRating),
        seasons: Number.isFinite(totalSeasons) ? String(totalSeasons) : '',
        episodeCurrent: '0',
        episodeTotal: parts.reduce((sum, part) => sum + (part.episodeTotal ?? 0), 0).toString(),
        url: `https://www.imdb.com/title/${id}/`,
        parts,
    };
}

async function getOmdbSeasons(
    fetchJson: JsonFetcher,
    id: string,
    apiKey: string,
    totalSeasons: number
): Promise<IntegrationVideoPart[]> {
    const parts: IntegrationVideoPart[] = [];
    for (let season = 1; season <= Math.min(totalSeasons, 100); season++) {
        const payload = await fetchJson(`https://www.omdbapi.com/?apikey=${encodeURIComponent(apiKey)}&i=${encodeURIComponent(id)}&Season=${season}`);
        const episodes = payload && typeof payload === 'object' && Array.isArray((payload as Record<string, unknown>).Episodes)
            ? (payload as Record<string, unknown>).Episodes as unknown[]
            : [];
        parts.push({
            id: `season-${season}`,
            kind: 'season',
            title: `Season ${season}`,
            seasonNumber: season,
            episodeCurrent: 0,
            episodeTotal: episodes.length || null,
            status: 'planned',
        });
    }
    return parts;
}
