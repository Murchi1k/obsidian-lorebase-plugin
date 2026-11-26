import { i18n, t } from '../localization';
import { compactGameText } from '../localization/compactGameEditor';
import { getClassicRatingLevel } from '../classicRatingPresets';
import type { MediaType, RatingScaleSettings, UserRating } from '../types';
import { getRatingMax, getRatingStarFill, getRatingStep, parseStoredUserRating, roundRatingToStep } from '../utils/rating';

export function mountTenthsRating(
    readout: HTMLElement | null, settings: RatingScaleSettings, current: () => UserRating,
    onChange: (rating: UserRating) => void, label = t('editRating'),
): HTMLInputElement | undefined {
    if (!readout || getRatingStep(settings) !== 0.1) return;
    const max = getRatingMax(settings);
    const step = getRatingStep(settings);
    const hint = compactGameText('scoreRange').replace('{max}', String(max)).replace('{step}', formatScore(step));
    readout.empty();
    readout.classList.add('lorebase-rating-tenths-readout');
    const input = readout.createEl('input', {
        cls: 'lorebase-rating-tenths-input',
        attr: { type: 'text', inputmode: 'decimal', placeholder: '—', 'aria-label': label, title: hint },
    });
    input.dataset.max = String(max);
    input.dataset.step = String(step);
    input.autocomplete = 'off';
    input.addEventListener('focus', () => input.select());
    input.addEventListener('click', () => input.select());
    readout.createEl('span', { text: '/ ' + max, attr: { 'aria-hidden': 'true' } });

    input.addEventListener('input', () => {
        const value = parseInput(input.value, max, step);
        input.setCustomValidity(value === undefined ? hint : '');
        if (value !== undefined) { input.dataset.current = value === null ? '' : String(value); onChange(value); }
    });
    input.addEventListener('blur', () => { if (input.validity.valid) syncInput(input, current()); });
    input.addEventListener('keydown', event => {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            if (input.reportValidity()) input.blur();
            return;
        }
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        event.preventDefault();
        event.stopPropagation();
        const rating = current();
        if (rating === null && event.key === 'ArrowDown') return;
        const delta = event.key === 'ArrowUp' ? step : -step;
        const next = rating === null ? 1 : Math.max(1, Math.min(max, roundRatingToStep(rating + delta, step)));
        syncInput(input, next);
        onChange(next);
    });
    syncInput(input, current());
    return input;
}

export function updateRatingReadout(readout: HTMLElement | null, rating: UserRating, fallback: string): void {
    if (!readout) return;
    const input = readout.querySelector<HTMLInputElement>('.lorebase-rating-tenths-input');
    if (!input) {
        readout.textContent = fallback;
        return;
    }
    const draft = parseInput(input.value, Number(input.dataset.max), Number(input.dataset.step) as 0.1 | 0.5);
    const accepted = input.dataset.current === '' ? null : Number(input.dataset.current);
    if (readout.ownerDocument.activeElement === input && (draft === rating || draft === undefined && accepted === rating)) return;
    syncInput(input, rating);
}

export function validateRatingInputs(root: HTMLElement): boolean {
    return Array.from(root.querySelectorAll<HTMLInputElement>('.lorebase-rating-tenths-input')).every(input => input.reportValidity());
}

export function paintRatingStar(
    button: HTMLElement, starValue: number, rating: UserRating, settings: RatingScaleSettings, media: MediaType
): ReturnType<typeof getRatingStarFill> {
    const level = getClassicRatingLevel(settings, media, starValue);
    if (level) {
        const selected = starValue === rating;
        const title = starValue + ' · ' + level.label;
        button.textContent = level.emoji;
        button.title = title;
        button.setAttribute('aria-label', title);
        button.setAttribute('aria-pressed', String(selected));
        button.classList.add('is-themed-rating');
        button.classList.toggle('is-active', selected);
        button.classList.remove('is-half');
        button.style.setProperty('--lorebase-rating-color', level.color);
        return selected ? 'full' : 'empty';
    }

    const fill = getRatingStarFill(starValue, rating);
    button.classList.toggle('is-active', fill === 'full');
    button.classList.toggle('is-half', fill === 'half');
    if (fill === 'half' && rating !== null) {
        const fraction = rating - starValue + 1;
        const offset = (0.5 - fraction).toFixed(1);
        button.style.setProperty('--lorebase-rating-star-clip', 'calc(50% + ' + offset + 'em)');
    } else {
        button.style.removeProperty('--lorebase-rating-star-clip');
    }
    return fill;
}

function parseInput(raw: string, max: number, step: RatingScaleSettings['step']): UserRating | undefined {
    const text = raw.trim();
    if (!text) return null;
    if (!/^\d+(?:[.,]\d)?$/.test(text)) return undefined;
    const rating = parseStoredUserRating(text);
    return rating !== null && rating <= max && Math.abs(rating - roundRatingToStep(rating, step)) < 0.001 ? rating : undefined;
}

function syncInput(input: HTMLInputElement, rating: UserRating): void {
    input.value = rating === null ? '' : formatScore(rating);
    input.dataset.current = rating === null ? '' : String(rating);
    input.setCustomValidity('');
}

function formatScore(rating: number): string {
    return new Intl.NumberFormat(i18n.getLocale(), { maximumFractionDigits: 1 }).format(rating);
}
