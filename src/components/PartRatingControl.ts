import { setIcon } from 'obsidian';
import { i18n, t } from '../localization';
import { compactGameText } from '../localization/compactGameEditor';
import type { MediaType, RatingScaleSettings, UserRating } from '../types';
import { paintRatingStar } from './RatingInput';
import { getRatingFromStarPosition, getRatingMax, getRatingStarValues, getRatingStep, getRatingValues } from '../utils/rating';

export function mountPartRating(
    host: HTMLElement, settings: RatingScaleSettings, initial: UserRating, label: string,
    onChange: (rating: UserRating) => void, numeric = settings.mode !== 'classic', media: MediaType = 'game',
): { setValue: (rating: UserRating) => void } {
    if (numeric) return mountScoreStepper(host, settings, initial, label, onChange);

    const control = host.createDiv({ cls: 'lorebase-editmode-dlc-rating', attr: { role: 'group', 'aria-label': label } });
    let rating = initial;
    const stars = getRatingStarValues(settings).map(value => {
        const button = control.createEl('button', {
            cls: 'lorebase-editmode-dlc-star', text: '★',
            attr: { type: 'button', 'aria-label': `${t('editRating')} ${value}` },
        });
        button.addEventListener('click', event => {
            event.stopPropagation();
            const rect = button.getBoundingClientRect();
            const next = event.detail === 0 ? value : getRatingFromStarPosition(value, event.clientX - rect.left, rect.width, settings);
            setValue(rating === next ? null : next);
            onChange(rating);
        });
        return { button, value };
    });
    const setValue = (next: UserRating): void => {
        rating = next;
        for (const { button, value } of stars) {
            paintRatingStar(button, value, rating, settings, media);
            button.setAttribute('aria-pressed', String(rating === value));
        }
    };
    setValue(initial);
    return { setValue };
}

function mountScoreStepper(
    host: HTMLElement, settings: RatingScaleSettings, initial: UserRating, label: string,
    onChange: (rating: UserRating) => void,
): { setValue: (rating: UserRating) => void } {
    let rating = initial;
    const max = getRatingMax(settings);
    const format = new Intl.NumberFormat(i18n.getLocale(), { maximumFractionDigits: 1 });
    const values = getRatingValues(settings);
    const descending = values.slice().reverse();
    const range = compactGameText('scoreRange').replace('{max}', String(max)).replace('{step}', format.format(getRatingStep(settings)));
    const control = host.createDiv({ cls: 'lorebase-game-dlc-score', attr: { role: 'group', 'aria-label': label } });
    const lower = control.createEl('button', {
        attr: { type: 'button', 'aria-label': compactGameText('lowerScore'), title: compactGameText('lowerScore') },
    });
    setIcon(lower, 'minus');
    const readout = control.createDiv({ cls: 'lorebase-game-dlc-readout' });
    setIcon(readout.createSpan({ cls: 'lorebase-game-dlc-star-icon', attr: { 'aria-hidden': 'true' } }), 'star');
    const input = readout.createEl('input', { attr: { type: 'text', inputmode: 'decimal', placeholder: '—', 'aria-label': label, title: range } });
    readout.createSpan({ cls: 'lorebase-game-dlc-scale', text: `/ ${max}` });
    const higher = control.createEl('button', {
        attr: { type: 'button', 'aria-label': compactGameText('higherScore'), title: compactGameText('higherScore') },
    });
    setIcon(higher, 'plus');

    const step = (direction: -1 | 1): number | undefined => direction === 1
        ? values.find(value => value > (rating ?? 0))
        : descending.find(value => value < (rating ?? 0));
    const syncButtons = (): void => {
        lower.disabled = step(-1) === undefined;
        higher.disabled = step(1) === undefined;
    };
    const setValue = (next: UserRating): void => {
        rating = next;
        input.value = rating === null ? '' : format.format(rating);
        input.setCustomValidity('');
        syncButtons();
    };
    const adjust = (direction: -1 | 1): void => {
        const next = step(direction);
        if (next === undefined) return;
        setValue(next);
        onChange(rating);
    };
    lower.addEventListener('click', () => adjust(-1));
    higher.addEventListener('click', () => adjust(1));
    input.addEventListener('input', () => {
        const raw = input.value.trim();
        const score = Number(raw.replace(',', '.'));
        if (raw && (!/^\d+(?:[.,]\d+)?$/.test(raw) || !values.includes(score))) {
            input.setCustomValidity(range);
            return;
        }
        input.setCustomValidity('');
        rating = raw ? score : null;
        onChange(rating);
        syncButtons();
    });
    input.addEventListener('keydown', event => {
        if (event.key !== 'Enter' || event.ctrlKey || event.metaKey) return;
        event.preventDefault();
        if (input.reportValidity()) input.blur();
    });
    setValue(initial);
    return { setValue };
}
