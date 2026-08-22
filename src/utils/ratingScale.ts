/**
 * LOREBASE - Rating scale
 *
 * The user rating scale is configurable (see `LorebaseSettings.ratingScale`).
 * Ratings are stored in frontmatter as a bare number with no scale recorded, so
 * changing the scale reinterprets existing values rather than rewriting them.
 */

import { DEFAULT_RATING_SCALE, RATING_CONFIG, RATING_SCALE_MAX, RATING_SCALE_MIN } from '../constants';

/** Tiers ordered from worst to best, independent of RATING_CONFIG's display order */
const TIERS_ASCENDING = [...RATING_CONFIG].sort((a, b) => a.value - b.value);

/**
 * Holds the active rating scale so render sites can reach it without threading
 * a settings reference through every modal, card and service constructor.
 * Mirrors the `i18n` singleton in `localization`.
 */
class RatingScale {
    private scale: number = DEFAULT_RATING_SCALE;

    /** Set the active scale, clamped to the supported range */
    set(scale: number): void {
        this.scale = normalizeRatingScale(scale);
    }

    /** Get the active scale */
    get(): number {
        return this.scale;
    }
}

/** Global rating scale instance */
export const ratingScale = new RatingScale();

/** Shorthand for the active rating scale */
export const getRatingScale = (): number => ratingScale.get();

/** Coerce any value into a usable rating scale, falling back to the default */
export function normalizeRatingScale(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_RATING_SCALE;
    return Math.max(RATING_SCALE_MIN, Math.min(RATING_SCALE_MAX, Math.round(value)));
}

/**
 * Map a rating onto one of the five sentiment tiers.
 *
 * The scale's endpoints are pinned to the outer tiers and everything between is
 * spread evenly, rather than bucketing on value/scale directly. A plain
 * proportional split cannot reach the bottom tier on a short scale — on a scale
 * of 3 the worst rating is still 33%, which would read as neutral.
 *
 * On a scale of 5 this is the identity mapping, so existing vaults keep the
 * exact emoji and colour they had before the scale became configurable.
 */
export function getRatingTier(value: number, scale: number = getRatingScale()): typeof TIERS_ASCENDING[number] {
    const effectiveScale = Math.max(1, scale);
    const topIndex = TIERS_ASCENDING.length - 1;
    if (effectiveScale <= 1) return TIERS_ASCENDING[topIndex];

    const clamped = Math.max(1, Math.min(value, effectiveScale));
    const index = Math.round(((clamped - 1) / (effectiveScale - 1)) * topIndex);
    return TIERS_ASCENDING[Math.max(0, Math.min(index, topIndex))];
}

/** Emoji representing a rating on the given scale */
export function getRatingEmoji(value: number, scale: number = getRatingScale()): string {
    return getRatingTier(value, scale).emoji;
}

/** Tier colour representing a rating on the given scale */
export function getRatingColor(value: number, scale: number = getRatingScale()): string {
    return getRatingTier(value, scale).color;
}

/** Translation key for the sentiment label of a rating on the given scale */
export function getRatingLabelKey(value: number, scale: number = getRatingScale()): typeof TIERS_ASCENDING[number]['labelKey'] {
    return getRatingTier(value, scale).labelKey;
}

/** Every selectable rating value on the given scale, ascending */
export function getRatingValues(scale: number = getRatingScale()): number[] {
    return Array.from({ length: Math.max(1, scale) }, (_, index) => index + 1);
}

/** Zero-filled rating distribution covering every value on the given scale */
export function createRatingDistribution(scale: number = getRatingScale()): Record<number, number> {
    const distribution: Record<number, number> = {};
    for (const value of getRatingValues(scale)) distribution[value] = 0;
    return distribution;
}
