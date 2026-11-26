import { parseEpisodeDuration } from '../media/watchProgress';
import type { AnimeDetails, IntegrationAnimePart, ProviderId, VideoDetails } from './types';

export type AnimeVideoProvider = Extract<ProviderId, 'tmdb' | 'tvmaze' | 'omdb'>;
export type AnimeVideoSourceKind = 'movie' | 'series';

export function isAnimeVideoProvider(provider: unknown): provider is AnimeVideoProvider {
    return provider === 'tmdb' || provider === 'tvmaze' || provider === 'omdb';
}

export function readAnimeVideoSourceKind(value: unknown, url: string, format: unknown): AnimeVideoSourceKind {
    if (value === 'movie' || value === 'series') return value;
    const tmdbType = url.match(/themoviedb\.org\/(movie|tv)\/\d+/i)?.[1]?.toLowerCase();
    if (tmdbType) return tmdbType === 'movie' ? 'movie' : 'series';
    return String(format ?? '').trim().toLowerCase() === 'movie' ? 'movie' : 'series';
}

export function adaptVideoToAnime(details: VideoDetails, provider: AnimeVideoProvider, id: string, sourceKind: AnimeVideoSourceKind): AnimeDetails {
    const isMovie = sourceKind === 'movie';
    const format = isMovie ? 'movie' : 'tv';
    const runtime = parseEpisodeDuration(details.runtime);
    const fallbackTotal = Number(details.episodeTotal);
    const main: IntegrationAnimePart = {
        id: `${provider}-${sourceKind}-${id}${isMovie ? '' : '-1'}`,
        kind: format,
        title: details.name,
        poster: details.poster || null,
        year: Number(details.year) || null,
        seasonNumber: isMovie ? null : 1,
        episodeCurrent: 0,
        episodeTotal: isMovie ? 1 : Number.isInteger(fallbackTotal) && fallbackTotal > 0 ? fallbackTotal : null,
        episodeDuration: runtime,
        status: 'planned',
    };
    const seasons = isMovie ? [] : (details.parts ?? []).filter(part => part.seasonNumber !== null && part.seasonNumber > 0);
    const parts: IntegrationAnimePart[] = seasons.length ? seasons.map(part => ({
        ...part,
        id: `${provider}-series-${id}-${part.seasonNumber}`,
        kind: 'tv',
        status: 'planned',
        episodeDuration: part.episodeDuration ?? runtime,
    })) : [main];

    return {
        kind: 'anime', name: details.name, format, parts,
        description: details.description, image: details.poster, imageHorizontal: details.posterHorizontal,
        genres: details.genres, tags: [], studios: details.studios ?? [],
        countries: details.countries, countryOfOrigin: details.countries?.[0],
        year: details.year, released: details.released, url: details.url,
        imdbRating: details.rating ?? '', communityRating: details.communityRating, communityVotes: details.communityVotes,
    };
}
