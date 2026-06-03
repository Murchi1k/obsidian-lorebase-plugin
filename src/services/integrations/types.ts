import type { SearchItem } from '../../modals/IntegrationModals';

export type ProviderId = 'rawg' | 'steam' | 'anilist' | 'shikimori';
export type MediaKind = 'games' | 'anime';

export interface SearchResult extends SearchItem {
    id: string;
    provider: ProviderId;
    image?: string;
    year?: string;
    format?: string;
}

export interface GameDetails {
    name: string;
    description: string;
    poster: string;
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
    name: string;
    description: string;
    image: string;
    tags: string[];
    studios: string[];
    year: string;
    imdbRating: string;
    url: string;
    format?: string;
}

