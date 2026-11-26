import type { AlternativeTitle } from './alternativeTitles';
import type { EpisodeTrackingState } from '../../types';
import type { SearchItem } from '../../modals/IntegrationModals';
import type { AnimeFormat, AnimeStatus, IntegrationTemplateSettings, ReadingStatus, UserRating, VideoStatus } from '../../types';

export type ProviderId = IntegrationTemplateSettings['provider'];
export type MediaKind = 'games' | 'anime' | 'movies' | 'series' | 'books' | 'manga';
export type TemplateKind = MediaKind | 'music';

export interface SearchResult extends SearchItem {
    malId?: string;
    tmdbLanguage?: string;
    id: string;
    provider: ProviderId;
    image?: string;
    year?: string;
    format?: string;
}

export type GalleryImageKind = 'images' | 'backdrops' | 'posters';

export interface SourceImage {
    url: string;
    thumbnail: string;
    kind?: GalleryImageKind;
}

export interface SourceTrailer {
    title: string;
    url: string;
    thumbnail?: string;
    playback: { kind: 'embed' | 'file' | 'hls'; url: string };
}

export interface SourceGallery {
    source: string;
    imageTabs: readonly GalleryImageKind[];
    loadImages: (onProgress?: (images: SourceImage[]) => void) => Promise<SourceImage[]>;
    loadTrailers?: () => Promise<SourceTrailer[]>;
}

export interface MediaSourceSelection extends SearchResult {
    provider: ProviderId;
}

export interface MediaEnrichmentPatch {
    kind: MediaKind;
    source: MediaSourceSelection;
    values: Record<string, unknown>;
    filledFields: string[];
    skippedFields: string[];
}

export interface GameDetails {
    countries?: string[];
    workType?: string;
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
    communityRating?: string;
    communityVotes?: string;
}

export interface AnimeDetails {
    countries?: string[];
    genres?: string[];
    countryOfOrigin?: string;
    isAdult?: boolean;
    kind: 'anime';
    alternativeTitles?: AlternativeTitle[];
    name: string;
    description: string;
    image: string;
    imageHorizontal?: string;
    tags: string[];
    studios: string[];
    year: string;
    released?: string;
    imdbRating: string;
    url: string;
    format?: string;
    parts?: IntegrationAnimePart[];
    communityRating?: string;
    communityVotes?: string;
}

export interface VideoDetails {
    countries?: string[];
    workType?: string;
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
    communityRating?: string;
    communityVotes?: string;
}

export interface PreparedVideoImport {
    source: SearchResult;
    details: VideoDetails;
    title: string;
    content: string;
    metadata: Record<string, unknown>;
}

export interface BookDetails {
    countries?: string[];
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
    communityRating?: string;
    communityVotes?: string;
}

export interface MangaDetails {
    countries?: string[];
    kind: 'manga';
    publicationStatus?: string;
    alternativeTitles?: AlternativeTitle[];
    workType?: string;
    name: string;
    description: string;
    poster: string;
    posterHorizontal?: string;
    authors: string[];
    artists: string[];
    genres: string[];
    isAdult?: boolean;
    year: string;
    released?: string;
    chapters?: string;
    volumes?: string;
    rating?: string;
    url: string;
    parts?: IntegrationMangaPart[];
    communityRating?: string;
    communityVotes?: string;
}

export interface IntegrationAnimePart extends EpisodeTrackingState {
    id: string;
    kind: AnimeFormat;
    title: string;
    alternativeTitles?: string[];
    seasonNumber: number | null;
    episodeCurrent: number | null;
    episodeTotal: number | null;
    status: AnimeStatus;
    userRating?: UserRating;
    poster?: string | null;
    year?: number | null;
    episodeDuration?: number | null;
    releaseDate?: string | null;
}

export interface IntegrationVideoPart extends EpisodeTrackingState {
    id: string;
    kind: 'movie' | 'season';
    title: string;
    alternativeTitles?: string[];
    seasonNumber: number | null;
    episodeCurrent: number | null;
    episodeTotal: number | null;
    status: VideoStatus;
    userRating?: UserRating;
    poster?: string | null;
    year?: number | null;
    episodeDuration?: number | null;
    releaseDate?: string | null;
}

export interface IntegrationMangaPart {
    id: string;
    kind: 'volume';
    title: string;
    alternativeTitles?: string[];
    volumeNumber: number | null;
    chapterCurrent: number | null;
    chapterTotal: number | null;
    status: ReadingStatus;
}
