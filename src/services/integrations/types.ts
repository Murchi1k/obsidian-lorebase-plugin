import type { SearchItem } from '../../modals/IntegrationModals';
import type { AnimeFormat, AnimeStatus, ReadingStatus, VideoStatus } from '../../types';

export type ProviderId = 'rawg' | 'steam' | 'igdb' | 'anilist' | 'shikimori' | 'tmdb' | 'tvmaze' | 'omdb' | 'hardcover' | 'googlebooks' | 'jikan' | 'mangadex';
export type MediaKind = 'games' | 'anime' | 'movies' | 'series' | 'books' | 'manga';

export interface SearchResult extends SearchItem {
    id: string;
    provider: ProviderId;
    image?: string;
    year?: string;
    format?: string;
}

export interface GameDetails {
    kind: 'game';
    name: string;
    description: string;
    poster: string;
    posterHorizontal?: string;
    genres: string[];
    platforms: string[];
    developers: string[];
    publishers: string[];
    rating: string;
    metacritic: string;
    released: string;
    year: string;
    url: string;
}

export interface AnimeDetails {
    kind: 'anime';
    name: string;
    description: string;
    image: string;
    imageHorizontal?: string;
    tags: string[];
    studios: string[];
    year: string;
    imdbRating: string;
    url: string;
    format?: string;
    parts?: IntegrationAnimePart[];
}

export interface VideoDetails {
    kind: 'video';
    name: string;
    description: string;
    poster: string;
    posterHorizontal?: string;
    genres: string[];
    year: string;
    released?: string;
    runtime?: string;
    director?: string;
    actors?: string;
    rating?: string;
    seasons?: string;
    episodeCurrent?: string;
    episodeTotal?: string;
    networks?: string[];
    studios?: string[];
    url: string;
    parts?: IntegrationVideoPart[];
}

export interface BookDetails {
    kind: 'book';
    name: string;
    description: string;
    poster: string;
    posterHorizontal?: string;
    authors: string[];
    publisher?: string;
    genres: string[];
    year: string;
    released?: string;
    pages?: string;
    rating?: string;
    url: string;
}

export interface MangaDetails {
    kind: 'manga';
    name: string;
    description: string;
    poster: string;
    posterHorizontal?: string;
    authors: string[];
    artists: string[];
    genres: string[];
    year: string;
    chapters?: string;
    volumes?: string;
    rating?: string;
    url: string;
    parts?: IntegrationMangaPart[];
}

export interface IntegrationAnimePart {
    id: string;
    kind: AnimeFormat;
    title: string;
    seasonNumber: number | null;
    episodeCurrent: number | null;
    episodeTotal: number | null;
    status: AnimeStatus;
}

export interface IntegrationVideoPart {
    id: string;
    kind: 'movie' | 'season';
    title: string;
    seasonNumber: number | null;
    episodeCurrent: number | null;
    episodeTotal: number | null;
    status: VideoStatus;
}

export interface IntegrationMangaPart {
    id: string;
    kind: 'volume';
    title: string;
    volumeNumber: number | null;
    chapterCurrent: number | null;
    chapterTotal: number | null;
    status: ReadingStatus;
}
