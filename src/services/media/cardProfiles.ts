import type { CardOrientation, LorebaseSettings, MediaType } from '../../types';

export const CARD_MEDIA_KEYS = {
    game: 'games', anime: 'anime', movie: 'movies', series: 'series', book: 'books', manga: 'manga', music: 'music',
} as const;

const profileKeys = {
    game: [['overlayTextLayout', 'overlayTextVisibility', 'descriptionLines', 'badges'], ['horizontalOverlayTextLayout', 'horizontalOverlayTextVisibility', 'horizontalDescriptionLines', 'horizontalBadges']],
    anime: [['animeOverlayTextLayout', 'animeOverlayTextVisibility', 'animeDescriptionLines', 'animeBadges'], ['animeHorizontalOverlayTextLayout', 'animeHorizontalOverlayTextVisibility', 'animeHorizontalDescriptionLines', 'animeHorizontalBadges']],
    movie: [['movieOverlayTextLayout', 'movieOverlayTextVisibility', 'movieDescriptionLines', 'movieBadges'], ['movieHorizontalOverlayTextLayout', 'movieHorizontalOverlayTextVisibility', 'movieHorizontalDescriptionLines', 'movieHorizontalBadges']],
    series: [['seriesOverlayTextLayout', 'seriesOverlayTextVisibility', 'seriesDescriptionLines', 'seriesBadges'], ['seriesHorizontalOverlayTextLayout', 'seriesHorizontalOverlayTextVisibility', 'seriesHorizontalDescriptionLines', 'seriesHorizontalBadges']],
    book: [['bookOverlayTextLayout', 'bookOverlayTextVisibility', 'bookDescriptionLines', 'bookBadges'], ['bookHorizontalOverlayTextLayout', 'bookHorizontalOverlayTextVisibility', 'bookHorizontalDescriptionLines', 'bookHorizontalBadges']],
    manga: [['mangaOverlayTextLayout', 'mangaOverlayTextVisibility', 'mangaDescriptionLines', 'mangaBadges'], ['mangaHorizontalOverlayTextLayout', 'mangaHorizontalOverlayTextVisibility', 'mangaHorizontalDescriptionLines', 'mangaHorizontalBadges']],
    music: [['musicOverlayTextLayout', 'musicOverlayTextVisibility', 'musicDescriptionLines', 'musicBadges'], ['musicHorizontalOverlayTextLayout', 'musicHorizontalOverlayTextVisibility', 'musicHorizontalDescriptionLines', 'musicHorizontalBadges']],
} as const;

export type ConfigurableCardMedia = keyof typeof profileKeys;

export function getCardProfile(settings: LorebaseSettings, media: MediaType, orientation: CardOrientation) {
    const [layout, visibility, lines, badges] = profileKeys[media][orientation === 'horizontal' ? 1 : 0];
    return {
        layout: settings[layout],
        visibility: settings[visibility],
        descriptionLines: settings[lines],
        badges: settings[badges],
        setDescriptionLines: (value: number): void => { settings[lines] = value; },
    };
}
