import { afterEach, describe, expect, it } from 'vitest';
import { CLASSIC_RATING_HOLIDAYS, CLASSIC_RATING_SEASONS, getClassicRatingLevel } from '../src/classicRatingPresets';
import type { MediaType, RatingScaleSettings } from '../src/types';
import { i18n } from '../src/localization';
import { ratingPresetLevel, ratingPresetName } from '../src/localization/ratingPresets';
import {
    getRatingBadgeText,
    getRatingFromStarPosition,
    getRatingMax,
    getRatingValues,
    getRatingStarFill,
    normalizeRatingSettings,
    parseStoredUserRating,
    roundRatingToStep,
} from '../src/utils/rating';

afterEach(() => i18n.setLanguage('en'));

describe('rating preset translations', () => {
    it.each([
        ['en', ['Masterpiece', 'Full Bloom', 'Cinema', 'Legend', 'Platinum', 'Volcano', 'Perfect', 'Splendor', 'Paradise', 'Golden autumn', 'Christmas tree', 'Miracle', 'Pumpkin', 'Celebration', 'Radiance']],
        ['ru', ['Шедевр', 'Расцвет', 'Большое кино', 'Легенда', 'Платина', 'Вулкан', 'Идеально', 'Великолепие', 'Рай', 'Золотая осень', 'Ёлочка', 'Чудо', 'Тыква', 'Праздник', 'Сияние']],
        ['uk', ['Шедевр', 'Розквіт', 'Велике кіно', 'Легенда', 'Платина', 'Вулкан', 'Ідеально', 'Пишнота', 'Рай', 'Золота осінь', 'Ялиночка', 'Диво', 'Гарбуз', 'Свято', 'Сяйво']],
        ['zh-CN', ['杰作', '盛放', '影坛经典', '传奇', '白金唱片', '火山', '完美', '绚烂', '天堂', '金秋', '小圣诞树', '奇迹', '南瓜', '庆典', '光辉']],
    ] as const)('translates every preset in %s and updates when the language changes', (language, expected) => {
        i18n.setLanguage(language);
        const presets = ['game', 'anime', 'movie', 'series', 'music', 'book', 'manga', 'spring', 'summer', 'autumn', 'winter', 'christmas', 'halloween', 'easter', 'lights'] as const;
        expect(presets.map(preset => ratingPresetLevel(preset, 5))).toEqual(expected);
        for (const preset of presets) expect(ratingPresetName(preset).trim()).not.toBe('');
        if (language !== 'en') {
            i18n.setLanguage('en');
            expect(getClassicRatingLevel(normalizeRatingSettings({ classicPreset: 'themed' }), 'game', 4)?.label).toBe('Great');
        }
    });

    it.each([
        ['spring', ['Увядание', 'Росток', 'Цветение', 'Сакура', 'Великолепие']],
        ['summer', ['Испорчено', 'Пасмурно', 'Тепло', 'Жарко', 'Рай']],
        ['autumn', ['Ненастье', 'Дождь', 'Туман', 'Листопад', 'Золотая осень']],
        ['winter', ['Слякоть', 'Первый снег', 'Снежинка', 'Снеговик', 'Ёлочка']],
    ] as const)('uses the requested Russian names for %s', (classicSeason, labels) => {
        i18n.setLanguage('ru');
        const scale = normalizeRatingSettings({ classicPreset: 'seasonal', classicSeason });
        expect([1, 2, 3, 4, 5].map(score => getClassicRatingLevel(scale, 'game', score)?.label)).toEqual(labels);
    });
});

describe('rating scale', () => {
    it('keeps the existing five-level scale as the default', () => {
        const settings = normalizeRatingSettings(undefined);
        expect(settings.mode).toBe('classic');
        expect(settings.classicPreset).toBe('standard');
        expect(getRatingMax(settings)).toBe(5);
        expect(getRatingValues(settings)).toEqual([1, 2, 3, 4, 5]);
        expect(getRatingBadgeText(5, settings, 'emoji')).toBe('😍');
    });

    it('creates half-step custom values up to the configured maximum', () => {
        const settings = normalizeRatingSettings({ mode: 'custom', max: 10, step: 0.5, display: 'number' });
        const values = getRatingValues(settings);
        expect(values).toHaveLength(19);
        expect(values.slice(0, 3)).toEqual([1, 1.5, 2]);
        expect(values.at(-1)).toBe(10);
        expect(getRatingBadgeText(7.5, settings, 'emoji')).toBe('7.5/10');
    });

    it('generates exact tenths and retains the whole-star shortcut', () => {
        const settings = normalizeRatingSettings({ mode: 'custom', max: 10, step: 0.1 });
        const values = getRatingValues(settings);
        expect(values).toHaveLength(91);
        expect(values[63]).toBe(7.3);
        expect(values.at(-1)).toBe(10);
        expect(getRatingFromStarPosition(8, 4, 20, settings)).toBe(7.5);
        expect(getRatingFromStarPosition(2, 4, 20, settings)).toBe(1.5);
        expect(getRatingFromStarPosition(8, 16, 20, settings)).toBe(8);
        expect(roundRatingToStep(7.2 + 0.1, settings.step)).toBe(7.3);
        expect(getRatingBadgeText(7.3, settings, 'star')).toBe('7.3/10');
        expect(getRatingStarFill(8, 7.3)).toBe('half');
    });

    it('reads stored integers, half steps, and tenths without truncating them', () => {
        expect(parseStoredUserRating('7.3')).toBe(7.3);
        expect(parseStoredUserRating('7,3')).toBe(7.3);
        expect(parseStoredUserRating('7.5')).toBe(7.5);
        expect(parseStoredUserRating(10)).toBe(10);
        expect(parseStoredUserRating('7.25')).toBeNull();
        expect(parseStoredUserRating(11)).toBeNull();
    });

    it('turns the left half of a star into a half-step score', () => {
        const settings = normalizeRatingSettings({ mode: 'custom', max: 10, step: 0.5 });
        expect(getRatingFromStarPosition(8, 4, 20, settings)).toBe(7.5);
        expect(getRatingFromStarPosition(8, 16, 20, settings)).toBe(8);
        expect(getRatingStarFill(8, 7.5)).toBe('half');
        expect(getRatingStarFill(7, 7.5)).toBe('full');
    });

    it('keeps the selected Lucide icon and uses a numeric label for custom badges', () => {
        const settings = normalizeRatingSettings({ mode: 'custom', max: 10, display: 'custom', icon: 'circle-check', classicPreset: 'themed' });
        expect(settings).toMatchObject({ display: 'custom', icon: 'circle-check' });
        expect(getRatingBadgeText(7.3, settings, 'star')).toBe('7.3');
    });

    it('clamps invalid custom maxima', () => {
        expect(normalizeRatingSettings({ mode: 'custom', max: 99 }).max).toBe(10);
        expect(normalizeRatingSettings({ mode: 'custom', max: 1 }).max).toBe(2);
    });

    it('persists preset choices through normalization and defaults invalid choices', () => {
        const stored = { mode: 'classic', classicPreset: 'seasonal', classicSeason: 'winter', classicHoliday: 'lights' } as const;
        const settings = normalizeRatingSettings(JSON.parse(JSON.stringify(stored)));
        expect(settings).toMatchObject(stored);
        expect(normalizeRatingSettings({ ...stored, classicPreset: 'holiday' }).classicPreset).toBe('holiday');
        expect(normalizeRatingSettings({ classicPreset: 'bad', classicSeason: 'bad', classicHoliday: 'bad' } as unknown as RatingScaleSettings))
            .toMatchObject({ classicPreset: 'standard', classicSeason: 'spring', classicHoliday: 'christmas' });
    });

    it.each(Object.keys(CLASSIC_RATING_SEASONS) as (keyof typeof CLASSIC_RATING_SEASONS)[])(
        'uses the same %s season across all media', (classicSeason) => {
            const settings = normalizeRatingSettings({ classicPreset: 'seasonal', classicSeason });
            const media: MediaType[] = ['game', 'anime', 'movie', 'series', 'book', 'manga', 'music'];
            for (const type of media) {
                const emojis = [1, 2, 3, 4, 5].map(score => getClassicRatingLevel(settings, type, score)?.emoji);
                expect(emojis).toEqual(CLASSIC_RATING_SEASONS[classicSeason]);
            }
            expect(getClassicRatingLevel(settings, 'game', 0)).toBeUndefined();
            expect(getClassicRatingLevel(settings, 'game', 3.5)).toBeUndefined();
            expect(getClassicRatingLevel({ ...settings, mode: 'custom' }, 'game', 4)).toBeUndefined();
        },
    );

    it.each(Object.keys(CLASSIC_RATING_HOLIDAYS) as (keyof typeof CLASSIC_RATING_HOLIDAYS)[])(
        'uses the same %s holiday across all media', (classicHoliday) => {
            const settings = normalizeRatingSettings({ classicPreset: 'holiday', classicHoliday });
            for (const type of ['game', 'anime', 'movie', 'series', 'book', 'manga', 'music'] as const) {
                for (const [index, emoji] of CLASSIC_RATING_HOLIDAYS[classicHoliday].entries()) {
                    const label = ratingPresetLevel(classicHoliday, index + 1);
                    expect(getClassicRatingLevel(settings, type, index + 1)).toMatchObject({ emoji, label });
                }
            }
        },
    );
});
