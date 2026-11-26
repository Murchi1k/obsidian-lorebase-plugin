import type { Language, RatingBadgeMode, RatingScaleSettings, RatingScaleStep, UserRating } from '../types';
import { RATING_EMOJI } from '../constants';

export const CLASSIC_RATING_SETTINGS: RatingScaleSettings = {
    mode: 'classic',
    max: 5,
    step: 1,
    display: 'number',
};

export function normalizeRatingSettings(value: Partial<RatingScaleSettings> | null | undefined): RatingScaleSettings {
    const mode = value?.mode === 'custom' ? 'custom' : 'classic';
    const maxValue = Number(value?.max);
    const max = Number.isFinite(maxValue) ? Math.min(10, Math.max(2, Math.round(maxValue))) : 5;
    return {
        mode,
        max,
        classicPreset: value?.classicPreset === 'themed' || value?.classicPreset === 'seasonal' || value?.classicPreset === 'holiday'
            ? value.classicPreset : 'standard',
        classicSeason: value?.classicSeason === 'summer' || value?.classicSeason === 'autumn' || value?.classicSeason === 'winter'
            ? value.classicSeason : 'spring',
        classicHoliday: value?.classicHoliday === 'halloween' || value?.classicHoliday === 'easter' || value?.classicHoliday === 'lights'
            ? value.classicHoliday : 'christmas',
        step: value?.step === 0.5 || value?.step === 0.1 ? value.step : 1,
        display: value?.display === 'stars' || value?.display === 'custom' ? value.display : 'number',
        ...(typeof value?.icon === 'string' && /^[a-z0-9-]+$/.test(value.icon) ? { icon: value.icon } : {}),
    };
}

export function getRatingMax(settings: RatingScaleSettings): number {
    return settings.mode === 'classic' ? 5 : settings.max;
}

export function getRatingStep(settings: RatingScaleSettings): RatingScaleStep {
    return settings.mode === 'classic' ? 1 : settings.step;
}

export function getRatingValues(settings: RatingScaleSettings): number[] {
    const tick = Math.round(getRatingStep(settings) * 10);
    const max = getRatingMax(settings);
    return Array.from({ length: ((max - 1) * 10) / tick + 1 }, (_, index) => (10 + index * tick) / 10);
}

export function roundRatingToStep(value: number, step: RatingScaleStep): number {
    const tick = Math.round(step * 10);
    return (Math.round((value * 10) / tick) * tick) / 10;
}

export function getRatingStarValues(settings: RatingScaleSettings): number[] {
    return Array.from({ length: getRatingMax(settings) }, (_, index) => index + 1);
}

export function getRatingFromStarPosition(
    starValue: number,
    relativeX: number,
    width: number,
    settings: RatingScaleSettings
): number {
    if (getRatingStep(settings) === 1 || starValue === 1 || width <= 0) return starValue;
    return relativeX < width / 2 ? starValue - 0.5 : starValue;
}

export function getRatingStarFill(starValue: number, rating: UserRating): 'empty' | 'half' | 'full' {
    if (rating === null || rating <= starValue - 1) return 'empty';
    if (rating < starValue) return 'half';
    return 'full';
}

export function getRatingInputHint(settings: RatingScaleSettings, language: Language): string {
    if (getRatingStep(settings) === 0.1) {
        if (language === 'ru') return 'Левая половина звезды — x,5. Точную оценку введите в поле.';
        if (language === 'uk') return 'Ліва половина зірки — x,5. Точну оцінку введіть у полі.';
        if (language === 'zh-CN') return '点击星标左半侧选择半分，也可在输入框中输入精确评分。';
        return 'Click the left half for a half point, or enter a precise score in the field.';
    }
    if (getRatingStep(settings) === 0.5) {
        if (language === 'ru') return 'Левая половина — x.5, правая — целая оценка';
        if (language === 'uk') return 'Ліва половина — x.5, права — ціла оцінка';
        return 'Left half — x.5, right half — whole score';
    }
    if (language === 'ru') return 'Нажмите на звезду, чтобы выбрать оценку';
    if (language === 'uk') return 'Натисніть на зірку, щоб вибрати оцінку';
    return 'Click a star to choose a score';
}

export function parseStoredUserRating(value: unknown): UserRating {
    if (value === null || value === undefined || value === '') return null;
    const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value).replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 10) return null;
    const rounded = roundRatingToStep(parsed, 0.1);
    return Math.abs(parsed - rounded) < 0.001 ? rounded : null;
}

export function formatRatingValue(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function formatCommunityRatingValue(value: number): string {
    return (Math.round(value) / 10).toFixed(1);
}

export function getRatingBadgeText(value: number, settings: RatingScaleSettings, classicMode: RatingBadgeMode): string {
    if (settings.mode === 'classic') {
        return classicMode === 'emoji' && RATING_EMOJI[value]
            ? RATING_EMOJI[value]
            : `\u2605${formatRatingValue(value)}`;
    }
    if (settings.display === 'custom') return formatRatingValue(value);
    if (settings.display === 'stars') return `\u2605${formatRatingValue(value)}`;
    return `${formatRatingValue(value)}/${getRatingMax(settings)}`;
}
