import { normalizeCountryMetadata } from '../../media/statisticsCountries';
import { normalizeEpisodeDetails } from '../../media/episodeTracking';
import type { EpisodeInfo } from '../../../types';
import { inferVideoWorkType } from '../workTypeInference';
import { SearchResult, VideoDetails, IntegrationVideoPart } from '../types';
import type { JsonFetcher } from './common';

interface OmdbOptions {
    kind: 'movies' | 'series' | 'mixed';
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
    const type = options.kind === 'mixed' ? '' : options.kind === 'series' ? '&type=series' : '&type=movie';
    const payload = await fetchJson(`https://www.omdbapi.com/?apikey=${encodeURIComponent(apiKey)}&s=${encodeURIComponent(query)}${type}&page=${page}`);
    if (!payload || typeof payload !== 'object') return [];
    const search = (payload as Record<string, unknown>).Search;
    if (!Array.isArray(search)) return [];
    const items = search
        .flatMap((entry): SearchResult[] => {
            const item = entry as Record<string, unknown>;
            if (options.kind === 'mixed' && item.Type !== 'series' && item.Type !== 'movie') return [];
            const isSeries = options.kind === 'series' || options.kind === 'mixed' && item.Type === 'series';
            return [{
                id: String(item.imdbID ?? ''),
                title: String(item.Title ?? ''),
                provider: 'omdb' as const,
                image: cleanPoster(item.Poster),
                year: clean(item.Year),
                workType: inferVideoWorkType(isSeries ? 'series' : 'movies', item),
                workTypeMedia: isSeries ? 'series' as const : 'movie' as const,
            }];
        })
        .filter((item) => item.id && item.title);
    if (options.kind === 'mixed') return Object.assign(items, { hasNext: page < Math.min(100, Math.ceil(Number((payload as Record<string, unknown>).totalResults) / 10)) });
    return items.slice(0, options.pageSize ?? 10);
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
        countries: normalizeCountryMetadata(item.Country),
        workType: inferVideoWorkType(kind, item),
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
        communityRating: clean(item.imdbRating),
        communityVotes: clean(item.imdbVotes).replace(/,/g, ''),
        seasons: Number.isFinite(totalSeasons) ? String(totalSeasons) : '',
        episodeCurrent: '0',
        episodeTotal: parts.reduce((sum, part) => sum + (part.episodeTotal ?? 0), 0).toString(),
        url: `https://www.imdb.com/title/${id}/`,
        parts,
    };
}

/** Exact IMDb lookup without loading seasons or treating a series as a movie. */
export async function lookupOmdbRecord(fetchJson: JsonFetcher, id: string, apiKey: string): Promise<SearchResult | null> {
    if (!/^tt\d{5,12}$/i.test(id) || !apiKey.trim()) return null;
    const payload = await fetchJson(`https://www.omdbapi.com/?apikey=${encodeURIComponent(apiKey)}&i=${encodeURIComponent(id)}&plot=short`);
    if (!payload || typeof payload !== 'object') return null;
    const item = payload as Record<string, unknown>;
    if (item.Response === 'False' || clean(item.imdbID).toLowerCase() !== id.toLowerCase() || !clean(item.Title) || !['movie', 'series'].includes(clean(item.Type))) return null;
    const kind = item.Type === 'series' ? 'series' : 'movies';
    return { id: clean(item.imdbID), provider: 'omdb', title: clean(item.Title), image: cleanPoster(item.Poster), year: clean(item.Year).slice(0, 4),
        workType: inferVideoWorkType(kind, item), workTypeMedia: kind === 'series' ? 'series' : 'movie' };
}

async function getOmdbSeasons(
    fetchJson: JsonFetcher,
    id: string,
    apiKey: string,
    totalSeasons: number
): Promise<IntegrationVideoPart[]> {
    const seasons = Array.from({ length: Math.min(totalSeasons, 100) }, (_, index) => index + 1);
    const parts: IntegrationVideoPart[] = [];
    const concurrency = 6;

    for (let index = 0; index < seasons.length; index += concurrency) {
        const batch = seasons.slice(index, index + concurrency);
        parts.push(...await Promise.all(batch.map(async (season): Promise<IntegrationVideoPart> => {
            const episodes = await requestOmdbSeason(fetchJson, id, apiKey, season);
            return {
                id: `season-${season}`,
                kind: 'season',
                title: `Season ${season}`,
                seasonNumber: season,
                episodeCurrent: 0,
                episodeTotal: episodes.length || null,
                status: 'planned',
            };
        })));
    }

    return parts;
}

async function requestOmdbSeason(fetchJson: JsonFetcher, id: string, apiKey: string, season: number): Promise<unknown[]> {
    const payload = await fetchJson(`https://www.omdbapi.com/?apikey=${encodeURIComponent(apiKey)}&i=${encodeURIComponent(id)}&Season=${season}`);
    const episodes = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).Episodes : null;
    return Array.isArray(episodes) ? episodes : [];
}

export async function getOmdbSeasonEpisodes(fetchJson: JsonFetcher, id: string, apiKey: string, season: number): Promise<EpisodeInfo[]> {
    const episodes = await requestOmdbSeason(fetchJson, id, apiKey, season);
    return normalizeEpisodeDetails(episodes.flatMap(value => {
        if (!value || typeof value !== 'object') return [];
        const row = value as Record<string, unknown>;
        return [{ number: row.Episode, title: clean(row.Title), airDate: clean(row.Released) }];
    }));
}
