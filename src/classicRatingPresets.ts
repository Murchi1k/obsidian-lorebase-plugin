import type { ClassicRatingHoliday, ClassicRatingSeason, MediaType, RatingScaleSettings } from './types';
import { ratingPresetLevel, type RatingPresetId } from './localization/ratingPresets';

const colors = ['#df7885', '#dfa06d', '#d8bd69', '#75c7a5', '#ac96ee'] as const;
type EmojiLevels = readonly [string, string, string, string, string];

export const CLASSIC_RATING_THEMES = {
    game: ['💩', '😴', '🎯', '🔥', '👑'],
    anime: ['🥀', '🍂', '🌼', '🌸', '🌺'],
    movie: ['🍅', '🥱', '🍿', '👏', '🏆'],
    series: ['🚫', '📺', '🍿', '🎭', '🏆'],
    music: ['🔇', '🔉', '🎵', '🎶', '📀'],
    book: ['🧊', '💧', '🍵', '☕', '🌋'],
    manga: ['🦠', '🥣', '🍜', '🍱', '🍣'],
} as const satisfies Record<MediaType, EmojiLevels>;

export const CLASSIC_RATING_SEASONS = {
    spring: ['🍂', '🌱', '🌷', '🌸', '🌺'],
    summer: ['🌧️', '☁️', '🌤️', '☀️', '🏝️'],
    autumn: ['⛈️', '🌧️', '🌫️', '🍂', '🍁'],
    winter: ['💧', '🌨️', '❄️', '☃️', '🎄'],
} as const satisfies Record<ClassicRatingSeason, EmojiLevels>;

export const CLASSIC_RATING_HOLIDAYS = {
    christmas: ['❄️', '🧦', '🎁', '🎄', '🎅'],
    halloween: ['🕸️', '🦇', '👻', '💀', '🎃'],
    easter: ['🥚', '🐣', '🐰', '🧺', '🌷'],
    lights: ['🕯️', '✨', '🏮', '🎇', '🌟'],
} as const satisfies Record<ClassicRatingHoliday, EmojiLevels>;

export function hasClassicRatingPreset(settings: RatingScaleSettings): boolean {
    return settings.mode === 'classic'
        && (settings.classicPreset === 'themed' || settings.classicPreset === 'seasonal' || settings.classicPreset === 'holiday');
}

export function getClassicRatingLevel(settings: RatingScaleSettings, media: MediaType, score: number) {
    if (!hasClassicRatingPreset(settings) || !Number.isInteger(score) || score < 1 || score > 5) return undefined;
    const preset: RatingPresetId = settings.classicPreset === 'seasonal' ? settings.classicSeason ?? 'spring'
        : settings.classicPreset === 'holiday' ? settings.classicHoliday ?? 'christmas' : media;
    const levels: EmojiLevels = settings.classicPreset === 'seasonal' ? CLASSIC_RATING_SEASONS[settings.classicSeason ?? 'spring']
        : settings.classicPreset === 'holiday' ? CLASSIC_RATING_HOLIDAYS[settings.classicHoliday ?? 'christmas'] : CLASSIC_RATING_THEMES[media];
    return { emoji: levels[score - 1], label: ratingPresetLevel(preset, score), color: colors[score - 1] };
}
