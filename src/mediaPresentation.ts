import type { MediaType } from './types';

export type MediaSettingsKey = 'games' | 'anime' | 'movies' | 'series' | 'books' | 'manga';

export const MEDIA_ICONS: Record<MediaType, string> = {
    music: 'music',
    game: 'gamepad-2',
    anime: 'sparkles',
    movie: 'clapperboard',
    series: 'tv',
    book: 'book-open',
    manga: 'book-image',
};

export const MEDIA_SETTINGS_ICONS: Record<MediaSettingsKey, string> = {
    games: MEDIA_ICONS.game,
    anime: MEDIA_ICONS.anime,
    movies: MEDIA_ICONS.movie,
    series: MEDIA_ICONS.series,
    books: MEDIA_ICONS.book,
    manga: MEDIA_ICONS.manga,
};
