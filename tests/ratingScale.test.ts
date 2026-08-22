import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_RATING_SCALE, RATING_CONFIG, RATING_SCALE_MAX, RATING_SCALE_MIN, RATING_VALUE_CEILING } from '../src/constants';
import {
    createRatingDistribution,
    getRatingColor,
    getRatingEmoji,
    getRatingTier,
    getRatingValues,
    normalizeRatingScale,
    ratingScale,
} from '../src/utils/ratingScale';
import { parseUserRating } from '../src/services/media/parsers';

describe('normalizeRatingScale', () => {
    it('falls back to the default for anything unusable', () => {
        expect(normalizeRatingScale(undefined)).toBe(DEFAULT_RATING_SCALE);
        expect(normalizeRatingScale(null)).toBe(DEFAULT_RATING_SCALE);
        expect(normalizeRatingScale('10')).toBe(DEFAULT_RATING_SCALE);
        expect(normalizeRatingScale(NaN)).toBe(DEFAULT_RATING_SCALE);
        expect(normalizeRatingScale(Infinity)).toBe(DEFAULT_RATING_SCALE);
    });

    it('clamps to the supported range and rounds', () => {
        expect(normalizeRatingScale(0)).toBe(RATING_SCALE_MIN);
        expect(normalizeRatingScale(-4)).toBe(RATING_SCALE_MIN);
        expect(normalizeRatingScale(1000)).toBe(RATING_SCALE_MAX);
        expect(normalizeRatingScale(7.4)).toBe(7);
        expect(normalizeRatingScale(7.6)).toBe(8);
    });
});

describe('getRatingTier', () => {
    it('is the identity mapping on a scale of 5', () => {
        // Guarantees existing vaults keep the exact emoji and colour they had
        // before the scale became configurable.
        for (const config of RATING_CONFIG) {
            const tier = getRatingTier(config.value, 5);
            expect(tier.value).toBe(config.value);
            expect(tier.emoji).toBe(config.emoji);
            expect(tier.color).toBe(config.color);
        }
    });

    it('spreads evenly across the tiers on a scale of 10', () => {
        expect(getRatingTier(1, 10).value).toBe(1);
        expect(getRatingTier(2, 10).value).toBe(1);
        expect(getRatingTier(3, 10).value).toBe(2);
        expect(getRatingTier(5, 10).value).toBe(3);
        expect(getRatingTier(7, 10).value).toBe(4);
        expect(getRatingTier(10, 10).value).toBe(5);
    });

    it('spans every tier on any scale', () => {
        for (let scale = RATING_SCALE_MIN; scale <= RATING_SCALE_MAX; scale++) {
            expect(getRatingTier(1, scale).value).toBe(1);
            expect(getRatingTier(scale, scale).value).toBe(5);
        }
    });

    it('clamps out-of-range values instead of returning undefined', () => {
        expect(getRatingTier(99, 5).value).toBe(5);
        expect(getRatingTier(0, 5).value).toBe(1);
        expect(getRatingTier(-3, 5).value).toBe(1);
    });

    it('backs the emoji and colour helpers', () => {
        expect(getRatingEmoji(7, 10)).toBe(getRatingTier(7, 10).emoji);
        expect(getRatingColor(7, 10)).toBe(getRatingTier(7, 10).color);
    });
});

describe('parseUserRating', () => {
    it('keeps ratings recorded on a larger scale', () => {
        // The whole point of the "no rewrite" migration: dropping the scale from
        // 10 to 5 must not null out a stored 8 and write that back to the note.
        ratingScale.set(5);
        expect(parseUserRating(8)).toBe(8);
        expect(parseUserRating('9')).toBe(9);
    });

    it('still rejects values outside the absolute bounds', () => {
        expect(parseUserRating(0)).toBeNull();
        expect(parseUserRating(-2)).toBeNull();
        expect(parseUserRating(RATING_VALUE_CEILING + 1)).toBeNull();
        expect(parseUserRating('not a rating')).toBeNull();
        expect(parseUserRating(null)).toBeNull();
    });

    it('truncates fractional values as before', () => {
        expect(parseUserRating(3.7)).toBe(3);
    });
});

describe('scale-driven collections', () => {
    beforeEach(() => {
        ratingScale.set(DEFAULT_RATING_SCALE);
    });

    it('lists every selectable value ascending', () => {
        expect(getRatingValues(5)).toEqual([1, 2, 3, 4, 5]);
        expect(getRatingValues(10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    it('seeds a zero-filled distribution across the scale', () => {
        expect(createRatingDistribution(3)).toEqual({ 1: 0, 2: 0, 3: 0 });
        expect(Object.keys(createRatingDistribution(10))).toHaveLength(10);
    });

    it('reads the active scale when no scale is passed', () => {
        ratingScale.set(10);
        expect(getRatingValues()).toHaveLength(10);
        expect(getRatingTier(10).value).toBe(5);

        ratingScale.set(5);
        expect(getRatingValues()).toHaveLength(5);
        expect(getRatingTier(5).value).toBe(5);
    });

    it('clamps whatever it is handed', () => {
        ratingScale.set(999);
        expect(getRatingValues()).toHaveLength(RATING_SCALE_MAX);
    });
});
