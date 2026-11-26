import { setIcon } from 'obsidian';
import type { CommunityRatingIcon, MediaType, RatingBadgeMode, RatingScaleSettings } from '../types';
import { getClassicRatingLevel } from '../classicRatingPresets';
import { formatCommunityRatingValue, formatRatingValue, getRatingBadgeText } from '../utils/rating';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function renderRatingBadgeContent(
    host: HTMLElement, value: number, settings: RatingScaleSettings, classicMode: RatingBadgeMode, media?: MediaType
): void {
    const level = media ? getClassicRatingLevel(settings, media, value) : undefined;
    if (level) {
        host.classList.add('is-themed-rating');
        host.style.setProperty('--lorebase-rating-color', level.color);
        host.createSpan({ cls: 'lorebase-rating-theme-symbol', text: level.emoji, attr: { 'aria-hidden': 'true' } });
        host.createSpan({ cls: 'lorebase-rating-theme-score', text: formatRatingValue(value) });
        host.title = formatRatingValue(value) + ' · ' + level.label;
        host.setAttribute('aria-label', host.title);
        return;
    }
    if (settings.mode === 'classic' && classicMode === 'emoji') host.classList.add('is-emoji');
    if (settings.mode === 'custom' && settings.display === 'custom') {
        const name = settings.icon ?? 'star';
        const icon = host.createSpan({ cls: 'lorebase-rating-badge-icon', attr: { 'aria-hidden': 'true', 'data-rating-icon': name } });
        setIcon(icon, name);
        if (name !== 'star' && !icon.firstElementChild) setIcon(icon, 'star');
        host.append(formatRatingValue(value));
        return;
    }
    host.textContent = getRatingBadgeText(value, settings, classicMode);
}

export function renderCommunityRatingIcon(host: HTMLElement, icon: CommunityRatingIcon): void {
    const wrapper = host.createSpan({
        cls: 'lorebase-rating-badge-icon',
        attr: { 'aria-hidden': 'true', 'data-rating-icon': icon },
    });
    if (icon === 'tomato') {
        const svg = wrapper.ownerDocument.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('viewBox', '0 0 64 64');
        const paths = [
            { d: 'M32 18C18 9 6 21 8 37c2 14 12 21 24 21s22-7 24-21C58 21 46 9 32 18Z', fill: '#ef4444', stroke: '#b91c1c', 'stroke-width': '2' },
            { d: 'M32 20c-7-10-13-9-17-7l10 8-12 4c8 4 14 2 19-2 5 4 11 6 19 2l-12-4 10-8c-4-2-10-3-17 7Z', fill: '#22c55e' },
            { d: 'M32 19V9', stroke: '#15803d', 'stroke-width': '3', 'stroke-linecap': 'round' },
        ];
        for (const attributes of paths) {
            const path = wrapper.ownerDocument.createElementNS(SVG_NS, 'path');
            for (const [key, value] of Object.entries(attributes)) path.setAttribute(key, value);
            svg.appendChild(path);
        }
        wrapper.appendChild(svg);
        return;
    }
    setIcon(wrapper, icon);
}

export function renderCommunityRatingBadgeContent(host: HTMLElement, value: number, icon: CommunityRatingIcon): void {
    renderCommunityRatingIcon(host, icon);
    host.append(formatCommunityRatingValue(value));
}
