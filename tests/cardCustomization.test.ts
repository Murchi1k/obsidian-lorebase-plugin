// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/constants';
import { GameCard } from '../src/components/GameCard';
import { CARD_MEDIA_KEYS, getCardProfile } from '../src/services/media/cardProfiles';
import { createDefaultCardGrid, normalizeCardGrid } from '../src/services/media/cardGrid';
import { createCardPreview } from '../src/settings/sections/cardPreview';
import { createCardPreviewItem } from '../src/settings/sections/cardPreviewSamples';
import { renderCardBadgeSettings } from '../src/settings/sections/cardBadges';
import type { SettingsSectionContext } from '../src/settings/sections/types';
import { parseBadges } from '../src/settings/settingsNormalization';
import { LayoutCalculator } from '../src/views/library/LayoutCalculator';
import { snapMusicTextPosition } from '../src/settings/sections/musicTextPosition';
import { i18n } from '../src/localization';
import { installStatisticsDom } from './helpers/statisticsDom';

beforeAll(() => {
    installStatisticsDom(); i18n.setLanguage('en');
    Object.assign(globalThis, { createSvg: (tag: string) => document.createElementNS('http://www.w3.org/2000/svg', tag) });
    Object.assign(SVGElement.prototype, { createSvg(tag: string) { return this.appendChild(document.createElementNS('http://www.w3.org/2000/svg', tag)); } });
});
afterEach(() => { document.body.replaceChildren(); });

describe('card grid defaults', () => {
    it('keeps preview geometry stable when the sidebar narrows the library', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        const host = document.body.createDiv();
        const controller = new AbortController();
        let availableWidth = 1509;
        const context = { signal: controller.signal, plugin: { settings }, app: { workspace: { getLeavesOfType: () => [
            { view: { getCardPreviewReference: () => ({ availableWidth, item: createCardPreviewItem('manga', 4) }) } },
        ] } } } as unknown as SettingsSectionContext;
        const draw = createCardPreview(context, host, {
            moveText: vi.fn(), moveBadge: vi.fn(), toggleText: vi.fn(), toggleBadge: vi.fn(), resizeDescription: vi.fn(),
        });
        draw('manga', 'vertical', true, false);
        const width = host.querySelector<HTMLElement>('.lorebase-card-mini-drawing')!.style.width;
        availableWidth = 1036;
        draw('manga', 'vertical', true, false);
        expect(host.querySelector<HTMLElement>('.lorebase-card-mini-drawing')!.style.width).toBe(width);
        controller.abort();
    });
    it('uses five columns for each library and seven for music and four in landscape', () => {
        for (const key of Object.values(CARD_MEDIA_KEYS)) {
            const expected = key === 'music' ? 7 : 5;
            for (const device of ['desktop', 'mobile'] as const) {
                expect(DEFAULT_SETTINGS[key].cardGrid![device]).toMatchObject({ mode: 'columns', columns: expected, horizontalColumns: 4 });
            }
        }
    });
    it('keeps a selected width mode and spacing, and fits requested columns into narrow panes', () => {
        const grid = createDefaultCardGrid(7);
        grid.desktop.mode = 'size';
        grid.desktop.gap = 29;
        expect(normalizeCardGrid(grid).desktop).toMatchObject({ mode: 'size', gap: 29 });
        const calculator = new LayoutCalculator(() => 390, () => true);
        expect(calculator.getRenderedColumns(calculator.getEffectiveLayout(DEFAULT_SETTINGS.music, 'grid'))).toBe(3);
    });
});

describe('music uses the shared card editor', () => {
    it.each(['2019', 'unknown', '2019-06'])('shows completion %s at its known precision', finished => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        const profile = getCardProfile(settings, 'movie', 'vertical'); profile.badges.status.alwaysShowCompletionDate = true;
        const item = { ...createCardPreviewItem('movie', 4), status: 'completed', finished } as any;
        const card = new GameCard(document.body.createDiv(), item, { onClick() {}, onContextMenu() {} },
            'medium', 'vertical', 'hover', 'name', profile.badges, profile.layout, profile.visibility, 6, null,
            undefined, {}, 'full', settings.ratingScale);
        const label = card.getElement().querySelector('.lorebase-status-badge-text')!.textContent!;
        expect(label).toContain(finished === 'unknown' ? 'Date unknown' : '2019');
        if (finished.length < 10) expect(label).not.toMatch(/Jan 1|January 1|Jun 1/);
        card.destroy();
    });
    const make = (always = false, grouped = false, editable = false) => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        const profile = getCardProfile(settings, 'music', 'vertical');
        profile.badges.status.alwaysShowCompletionDate = always;
        const host = document.body.createDiv();
        const card = new GameCard(host, createCardPreviewItem('music', 4), { onClick() {}, onContextMenu() {} },
            'medium', 'vertical', 'hover', 'name', profile.badges, profile.layout, profile.visibility, 6, null,
            undefined, {}, 'full', settings.ratingScale, null, false, '', editable, grouped);
        return { card, profile, settings };
    };
    it.each([[false, false, false], [true, false, false], [false, true, false]])(
        'never shows a completion date for music (always=%s, grouped=%s)', (always, grouped, expected) => {
            const { card } = make(always, grouped);
            expect(card.getElement().querySelector('.lorebase-status-badge-text')!.textContent!.includes(String(new Date().getFullYear()))).toBe(expected);
            card.destroy();
        },
    );
    it('updates music text immediately and keeps game positions independent', () => {
        const { card, profile, settings } = make(false, false, true);
        const layout = structuredClone(profile.layout);
        layout.title = { x: 20, y: 18 };
        card.updatePreviewOverlay(layout, 6);
        const title = card.getElement().querySelector<HTMLElement>('.lorebase-music-card-title')!;
        expect(title.style.getPropertyValue('--music-text-x')).toBe('20%');
        expect(title.style.getPropertyValue('--music-text-y')).toBe('18%');
        profile.layout.title.x = 35;
        profile.badges.favorite.enabled = false;
        expect(settings.overlayTextLayout.title.x).toBe(7);
        expect(settings.badges.favorite.enabled).toBe(true);
        card.destroy();
    });
    it('keeps the always-show preference through badge normalization', () => {
        const badges = structuredClone(DEFAULT_SETTINGS.musicBadges);
        badges.status.alwaysShowCompletionDate = true;
        expect(parseBadges(badges, DEFAULT_SETTINGS.musicBadges).status.alwaysShowCompletionDate).toBe(true);
        expect(parseBadges({ status: { alwaysShowCompletionDate: 'false' } }, DEFAULT_SETTINGS.musicBadges).status.alwaysShowCompletionDate).toBe(false);
    });
});



describe('community rating badge', () => {
    function make(showCommunityRating: boolean, communityRating: number | null, personalEnabled = true) {
        const settings = structuredClone(DEFAULT_SETTINGS);
        const profile = getCardProfile(settings, 'game', 'vertical');
        profile.badges.communityRating.enabled = showCommunityRating;
        profile.badges.communityRating.position = 'top-right';
        profile.badges.rating.enabled = personalEnabled;
        profile.badges.rating.position = 'top-left';
        const item = { ...createCardPreviewItem('game', 4), communityRating, communityRatingProvider: 'Steam', communityVotes: 1248 };
        const card = new GameCard(document.body.createDiv(), item, { onClick() {}, onContextMenu() {} },
            'medium', 'vertical', 'hover', 'name', profile.badges);
        return { card, item };
    }

    it('displays a compact score in its own corner, with provider and votes in the tooltip', () => {
        const { card } = make(true, 82);
        const element = card.getElement();
        const personal = element.querySelector('.lorebase-card-rating')!;
        const community = element.querySelector<HTMLElement>('.lorebase-card-community-rating')!;
        expect(personal.parentElement?.classList.contains('is-top-left')).toBe(true);
        expect(community.parentElement?.classList.contains('is-top-left')).toBe(true);
        expect(community.parentElement?.firstElementChild).toBe(community);
        expect(community.textContent).toBe('8.2');
        expect(community.querySelector('[data-rating-icon="star"]')).not.toBeNull();
        expect(community.title).toBe('Community rating · 8.2 · Steam · 1,248 votes');
        card.destroy();
    });

    it('hides a missing or disabled score and displays zero independently of the personal badge', () => {
        const disabled = make(false, 86);
        expect(disabled.card.getElement().querySelector('.lorebase-card-community-rating')).toBeNull();
        disabled.card.destroy();

        const { card, item } = make(true, 0, false);
        const element = card.getElement();
        expect(element.querySelector('.lorebase-card-rating')).toBeNull();
        expect(element.querySelector('.lorebase-card-community-rating')?.textContent).toBe('0.0');
        GameCard.refreshElement(element, { ...item, communityRating: null });
        expect(element.querySelector('.lorebase-card-community-rating')).toBeNull();
        card.destroy();
    });

    it.each(['vertical', 'horizontal'] as const)('pins community ratings first in the upper left for every %s media card', (orientation) => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        for (const media of ['game', 'anime', 'movie', 'series', 'book', 'manga', 'music'] as const) {
            const profile = getCardProfile(settings, media, orientation);
            profile.badges.communityRating.enabled = true;
            profile.badges.communityRating.position = 'bottom-right';
            profile.badges.rating.position = 'top-left';
            profile.badges.status.position = 'top-left';
            const normalized = parseBadges(profile.badges, DEFAULT_SETTINGS.badges);
            expect(normalized.communityRating).toMatchObject({ position: 'top-left', x: 8, y: 10 });
            const item = { ...createCardPreviewItem(media, 4), communityRating: 82 };
            const card = new GameCard(document.body.createDiv(), item, { onClick() {}, onContextMenu() {} },
                'medium', orientation, 'hover', 'name', profile.badges);
            const badge = card.getElement().querySelector('.lorebase-card-community-rating')!;
            expect(badge.parentElement?.classList.contains('is-top-left')).toBe(true);
            expect(badge.parentElement?.firstElementChild).toBe(badge);
            card.destroy();
        }
    });

    it('keeps the community badge fixed in the preview while preserving click and keyboard toggles', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        const profile = getCardProfile(settings, 'game', 'vertical');
        const host = document.createElement('div');
        const controller = new AbortController();
        const context = { app: {}, plugin: { settings }, signal: controller.signal } as SettingsSectionContext;
        const moveBadge = vi.fn();
        const toggleBadge = vi.fn();
        const draw = createCardPreview(context, host, {
            moveBadge,
            moveText: vi.fn(), toggleBadge, toggleText: vi.fn(), resizeDescription: vi.fn(),
        });
        draw('game', 'vertical', true, false);

        const viewport = host.querySelector<HTMLElement>('.lorebase-card-mini-viewport')!;
        viewport.setPointerCapture = vi.fn();
        viewport.hasPointerCapture = () => true;
        const image = host.querySelector<HTMLElement>('.lorebase-card-image')!;
        image.getBoundingClientRect = () => new DOMRect(0, 0, 200, 300);
        const badge = host.querySelector<HTMLElement>('.lorebase-card-community-rating')!;
        expect(badge.classList.contains('is-preview-disabled')).toBe(true);
        badge.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, clientX: 20, clientY: 20 }));
        viewport.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 180, clientY: 280 }));
        expect(badge.style.translate).toBe('');
        viewport.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: 180, clientY: 280 }));
        expect(moveBadge).not.toHaveBeenCalled();
        expect(toggleBadge).not.toHaveBeenCalled();
        badge.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 2, clientX: 20, clientY: 20 }));
        viewport.dispatchEvent(new PointerEvent('pointerup', { pointerId: 2, clientX: 20, clientY: 20 }));
        badge.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: ' ' }));
        expect(toggleBadge).toHaveBeenCalledTimes(2);
        expect(toggleBadge).toHaveBeenCalledWith('communityRating');

        expect(profile.badges.communityRating.position).toBe('top-left');
        expect(profile.badges.rating.position).toBe('bottom-right');
        expect(host.querySelector('.is-top-left .lorebase-card-community-rating')).not.toBeNull();
        expect(parseBadges(profile.badges, DEFAULT_SETTINGS.badges).communityRating.position).toBe('top-left');
        controller.abort();
    });

    it('uses the selected classic theme for each card even when its standard badge uses a star', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.ratingScale.classicPreset = 'themed';
        for (const [media, expected, label] of [
            ['game', '👑', 'Masterpiece'], ['anime', '🌺', 'Full Bloom'], ['movie', '🏆', 'Cinema'],
        ] as const) {
            const profile = getCardProfile(settings, media, 'vertical');
            profile.badges.rating.mode = 'star';
            const card = new GameCard(document.body.createDiv(), createCardPreviewItem(media, 5), { onClick() {}, onContextMenu() {} },
                'medium', 'vertical', 'hover', 'name', profile.badges, profile.layout, profile.visibility, 6, null,
                undefined, undefined, undefined, settings.ratingScale);
            const badge = card.getElement().querySelector<HTMLElement>('.lorebase-card-rating')!;
            expect(badge.textContent).toBe(expected + '5');
            expect(badge.title).toBe('5 · ' + label);
            expect(badge.style.getPropertyValue('--lorebase-rating-color')).toBe('#ac96ee');
            card.destroy();
        }
    });

    it.each([
        ['seasonal', '🎄', 'Christmas tree'], ['holiday', '🌟', 'Radiance'],
    ] as const)('applies the global %s preset to every media card', (classicPreset, emoji, label) => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.ratingScale = { ...settings.ratingScale, classicPreset, classicSeason: 'winter', classicHoliday: 'lights' };
        for (const media of ['game', 'anime', 'movie', 'series', 'book', 'manga', 'music'] as const) {
            const profile = getCardProfile(settings, media, 'vertical');
            const card = new GameCard(document.body.createDiv(), createCardPreviewItem(media, 5), { onClick() {}, onContextMenu() {} },
                'medium', 'vertical', 'hover', 'name', profile.badges, profile.layout, profile.visibility, 6, null,
                undefined, undefined, undefined, settings.ratingScale);
            const badge = card.getElement().querySelector<HTMLElement>('.lorebase-card-rating')!;
            expect(badge.textContent).toBe(emoji + '5');
            expect(badge.title).toBe('5 · ' + label);
            card.destroy();
        }
    });

    it('persists a community icon independently and renders both selected icons on the card', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        const profile = getCardProfile(settings, 'game', 'vertical');
        settings.ratingScale = { mode: 'custom', max: 10, step: 0.1, display: 'custom', icon: 'flame' };
        profile.badges.communityRating.enabled = true;
        const host = document.body.createDiv();
        const context = { plugin: { settings } } as SettingsSectionContext;
        const commit = vi.fn();
        renderCardBadgeSettings(context, host, 'game', 'vertical', update => update(profile), commit);

        const choices = host.querySelectorAll<HTMLButtonElement>('.lorebase-badge-community-options button');
        expect(choices).toHaveLength(3);
        expect(choices[1].getAttribute('aria-pressed')).toBe('true');
        choices[2].click();
        expect(choices[2].getAttribute('aria-pressed')).toBe('true');
        expect(choices[1].getAttribute('aria-pressed')).toBe('false');
        expect(commit).toHaveBeenCalledOnce();

        const badges = parseBadges(profile.badges, DEFAULT_SETTINGS.badges);
        expect(badges.communityRating.icon).toBe('tomato');
        const item = createCardPreviewItem('game', 7.3);
        const card = new GameCard(host, item, { onClick() {}, onContextMenu() {} },
            'medium', 'vertical', 'hover', 'name', badges, profile.layout, profile.visibility, 6, null,
            undefined, undefined, undefined, settings.ratingScale);
        const element = card.getElement();
        expect(element.querySelector('.lorebase-card-rating')?.textContent).toBe('7.3');
        expect(element.querySelector('.lorebase-card-rating [data-rating-icon="flame"]')).not.toBeNull();
        expect(element.querySelectorAll('.lorebase-card-community-rating [data-rating-icon="tomato"] svg path')).toHaveLength(3);
        card.destroy();
    });

    it('toggles the community score separately in badge settings and reads the saved setting', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        const profile = getCardProfile(settings, 'game', 'vertical');
        const host = document.body.createDiv();
        const context = { plugin: { settings } } as SettingsSectionContext;
        renderCardBadgeSettings(context, host, 'game', 'vertical', update => update(profile), () => {});
        const control = host.querySelector<HTMLButtonElement>('[role="switch"][aria-label="Community rating"]')!;
        expect(control.getAttribute('aria-checked')).toBe('false');
        control.click();
        expect(control.getAttribute('aria-checked')).toBe('true');
        expect(profile.badges.rating.enabled).toBe(true);
        expect(parseBadges(profile.badges, DEFAULT_SETTINGS.badges).communityRating.enabled).toBe(true);
        const oldProfile = parseBadges({ rating: { showCommunityRating: true, position: 'top-left' } }, DEFAULT_SETTINGS.badges);
        expect(oldProfile.communityRating).toMatchObject({ enabled: true, position: 'top-left' });
    });
});

describe('music text alignment', () => {
    it('snaps close positions to the edge and the other text line', () => {
        const layout = structuredClone(DEFAULT_SETTINGS.musicOverlayTextLayout);
        layout.year.x = 20;
        expect(snapMusicTextPosition('title', { x: 1, y: 1 }, layout, 'vertical', 220, 48)).toEqual({ x: 0, y: 0 });
        expect(snapMusicTextPosition('title', { x: 19, y: 0 }, layout, 'vertical', 220, 48).x).toBe(20);
        expect(snapMusicTextPosition('title', { x: 35, y: 20 }, layout, 'vertical', 220, 48).x).toBe(35);
    });
    it('keeps text inside the footer and gives the artist a stable second row', () => {
        const layout = DEFAULT_SETTINGS.musicOverlayTextLayout;
        expect(snapMusicTextPosition('year', { x: -20, y: 150 }, layout, 'vertical', 220, 48)).toEqual({ x: 0, y: 50 });
        expect(snapMusicTextPosition('year', { x: 0, y: 38 }, layout, 'vertical', 220, 48).y).toBeCloseTo(39.6, 0);
    });
});

describe('discovery badge visibility', () => {
    it.each([false, true])('toggles the icon without changing personal data (bookshelf=%s)', bookshelf => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.books.bookshelfEffect = bookshelf;
        const media = bookshelf ? 'book' : 'anime';
        const item = { ...createCardPreviewItem(media, 4), discovery: { recommendedBy: 'Андрей', reason: 'Совет друга' } };
        const controller = new AbortController();
        const context = { signal: controller.signal, plugin: { settings }, app: { workspace: { getLeavesOfType: () => [
            { view: { getCardPreviewReference: () => ({ availableWidth: 1440, item }) } },
        ] } } } as unknown as SettingsSectionContext;
        const host = document.body.createDiv();
        const preview = document.body.createDiv();
        const draw = createCardPreview(context, preview, {
            moveText: vi.fn(), moveBadge: vi.fn(), toggleText: vi.fn(), toggleBadge: vi.fn(), resizeDescription: vi.fn(),
        });
        const commit = vi.fn(() => draw(media, 'vertical', true, false));
        const profile = getCardProfile(settings, media, 'vertical');
        renderCardBadgeSettings(context, host, media, 'vertical', update => update(profile), commit);
        draw(media, 'vertical', true, false);
        const control = host.querySelector<HTMLButtonElement>('[role="switch"][aria-label="How I found it"]')!;
        expect(control.getAttribute('aria-checked')).toBe('true');
        expect(preview.querySelector('.lorebase-discovery-mark')).not.toBeNull();
        control.click();
        expect(control.getAttribute('aria-checked')).toBe('false');
        expect(preview.querySelector('.lorebase-discovery-mark')).toBeNull();
        expect(JSON.parse(JSON.stringify(settings)).showDiscoveryBadge).toBe(false);
        expect(item.discovery).toEqual({ recommendedBy: 'Андрей', reason: 'Совет друга' });
        // Reopening badge settings retains the saved switch state.
        host.empty();
        renderCardBadgeSettings(context, host, media, 'vertical', update => update(profile), commit);
        const reopened = host.querySelector<HTMLButtonElement>('[role="switch"][aria-label="How I found it"]')!;
        expect(reopened.getAttribute('aria-checked')).toBe('false');
        reopened.click();
        expect(preview.querySelector('.lorebase-discovery-mark')).not.toBeNull();
        expect(commit).toHaveBeenCalledTimes(2);
        controller.abort();
    });
});
