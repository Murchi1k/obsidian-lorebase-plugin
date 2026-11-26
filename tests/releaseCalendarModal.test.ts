// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { ReleaseCalendarModal } from '../src/modals/ReleaseCalendarModal';
import { i18n } from '../src/localization';
import { calendarCountdownText } from '../src/localization/releaseCalendar';
import type { Language, MediaItem } from '../src/types';
import { installStatisticsDom } from './helpers/statisticsDom';

beforeAll(installStatisticsDom);
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 16, 15)); i18n.setLanguage('en'); });
afterEach(() => { document.body.replaceChildren(); vi.useRealTimers(); i18n.setLanguage('en'); });

function item(type: MediaItem['type'], name: string, date: string): MediaItem {
    return { type, displayName: name, filePath: `${name}.md`, imageUrl: '', releaseDate: date, rawFields: {} } as MediaItem;
}
const items = [
    item('game', 'Game Alpha', '2026-11-19'), item('movie', 'Movie Beta', '2026-11-20'),
    item('book', 'Book Gamma', '2026-12-04'), item('anime', 'Past Anime', '2025-09-03'),
];
async function fixture(data = items, mode = 'calendar', loader = async () => data) {
    const open = vi.fn(async () => {}), saveTypes = vi.fn(), saveView = vi.fn();
    const modal = new ReleaseCalendarModal({} as App, loader, open, undefined, saveTypes, mode, 'all', saveView);
    modal.modalEl = document.body.createDiv(); modal.modalEl.createDiv({ cls: 'modal-close-button' }); modal.contentEl = modal.modalEl.createDiv();
    modal.onOpen();
    await Promise.resolve(); await Promise.resolve();
    return { modal, root: modal.contentEl, open, saveTypes, saveView };
}
function button(root: HTMLElement, label: string): HTMLButtonElement {
    const found = Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
        .find(node => node.getAttribute('aria-label') === label || node.textContent === label);
    if (!found) throw new Error(`Missing button: ${label}`);
    return found;
}
function titles(root: HTMLElement): string[] { return Array.from(root.querySelectorAll('.lorebase-release-card-title')).map(node => node.textContent!); }

describe('release calendar gallery', () => {
    it('shows a year-only Witcher release beyond the currently open month',async()=>{
        const witcher=item('game','The Witcher IV','2028');
        const {modal,root}=await fixture([item('game','Near release','2026-11-19'),witcher]);
        expect(root.querySelector('[data-date="2026-11-19"]')).not.toBeNull();
        expect(titles(root)).toEqual(['Near release','The Witcher IV']);
        expect(root.querySelector('[data-path="The Witcher IV.md"] time')?.textContent).toContain('2028');
        expect(root.querySelector('[data-path="The Witcher IV.md"] time')?.hasAttribute('datetime')).toBe(false);
        expect(root.querySelector('[data-path="The Witcher IV.md"] .lorebase-release-card-countdown')).toBeNull();
        modal.onClose();
        const only=await fixture([witcher]);
        expect(titles(only.root)).toEqual(['The Witcher IV']);
        expect(only.root.querySelector('.lorebase-release-empty')).toBeNull();
        only.modal.onClose();
    });
    it('keeps approximate dates outside day cells and countdowns in both views',async()=>{
        const data=[item('game','Quarter','2026-Q4'),item('game','Month','2026-11'),item('game','Year','2027'),item('game','Unknown','unknown'),item('game','Exact','2026-11-19')];
        const {modal,root}=await fixture(data);
        expect(root.querySelector('[data-date="2026-11-19"] .lorebase-release-day-event')?.textContent).toBe('Exact');
        expect([...root.querySelectorAll('.lorebase-release-day-event')].map(node=>node.textContent)).toEqual(['Exact']);
        expect(root.querySelectorAll('.lorebase-release-card-date[datetime]')).toHaveLength(1);
        expect(root.querySelectorAll('.lorebase-release-card-countdown')).toHaveLength(1);
        expect(root.textContent).toContain('Without an exact day');
        button(root,'By month').click();
        expect(titles(root)).toHaveLength(5);expect(root.querySelectorAll('.lorebase-release-card-countdown')).toHaveLength(1);
        expect(root.textContent).toContain('Q4 2026');expect(root.textContent).not.toContain('9999');
        modal.onClose();
    });
    it('closes from the in-header editor-style control in both modes', async () => {
        for (const mode of ['calendar', 'agenda']) {
            const { modal, root } = await fixture(items, mode);
            const close = vi.spyOn(modal, 'close').mockImplementation(() => modal.onClose());
            expect(root.querySelectorAll('.lorebase-workspace-close')).toHaveLength(1);
            expect(modal.modalEl.querySelector('.modal-close-button')).toBeNull();
            root.querySelector<HTMLButtonElement>('.lorebase-workspace-close')!.click();
            expect(close).toHaveBeenCalledOnce();
            expect(root.children).toHaveLength(0);
        }
    });
    it('shows upcoming releases across months and filters by day, including multiple releases on one date', async () => {
        const { modal, root } = await fixture([...items, item('manga', 'Manga Delta', '2026-11-19'), item('series', 'Series Epsilon', '2026-11-19')]);
        expect(titles(root)).toEqual(['Game Alpha', 'Manga Delta', 'Series Epsilon', 'Movie Beta', 'Book Gamma']);
        expect(root.querySelectorAll('.lorebase-release-day')).toHaveLength(42);
        expect(root.querySelector('[data-date="2026-11-19"] .lorebase-release-day-count')?.textContent).toBe('+2 more');
        expect(root.querySelector('[data-date="2026-11-19"] .lorebase-release-day-event')?.textContent).toBe('Game Alpha');
        root.querySelector<HTMLButtonElement>('[data-date="2026-11-19"]')!.click();
        expect(titles(root)).toEqual(['Game Alpha', 'Manga Delta', 'Series Epsilon']);
        expect(root.querySelector('[data-date="2026-11-19"]')?.getAttribute('aria-pressed')).toBe('true');
        button(root, 'Upcoming releases').click();
        expect(titles(root)).toHaveLength(5);
        modal.onClose();
    });

    it('navigates months and handles an empty date without opening or changing any note', async () => {
        const { modal, root, open } = await fixture();
        button(root, 'Next month').click();
        expect(root.querySelector('.lorebase-release-sidebar-heading h3')?.textContent).toBe('December 2026');
        root.querySelector<HTMLButtonElement>('[data-date="2026-12-04"]')!.click();
        expect(titles(root)).toEqual(['Book Gamma']);
        root.querySelector<HTMLButtonElement>('[data-date="2026-12-05"]')!.click();
        expect(root.textContent).toContain('No releases on this date');
        expect(open).not.toHaveBeenCalled();
        button(root, 'Today').click();
        expect(root.querySelector('[data-date="2026-11-16"]')?.getAttribute('aria-pressed')).toBe('true');
        expect(root.querySelector('[data-date="2026-11-16"]')?.getAttribute('aria-current')).toBe('date');
        modal.onClose();
    });

    it('searches across months while keeping input focus and offers a clear no-results state', async () => {
        const { modal, root } = await fixture();
        const search = root.querySelector<HTMLInputElement>('input[type="search"]')!;
        search.focus(); search.value = 'Gamma'; search.dispatchEvent(new Event('input'));
        await vi.advanceTimersByTimeAsync(150);
        expect(titles(root)).toEqual(['Book Gamma']);
        expect(document.activeElement).toBe(search);
        search.value = 'missing'; search.dispatchEvent(new Event('input'));
        await vi.advanceTimersByTimeAsync(150);
        expect(root.textContent).toContain('Nothing matches your search');
        search.value = ''; search.dispatchEvent(new Event('input'));
        await vi.advanceTimersByTimeAsync(150);
        expect(titles(root)).toEqual(['Game Alpha', 'Movie Beta', 'Book Gamma']);
        modal.onClose();
    });

    it('preserves media and scope preferences between calendar and monthly views', async () => {
        const { modal, root, saveTypes, saveView } = await fixture();
        root.querySelector<HTMLButtonElement>('[data-type="game"]')!.click();
        expect(titles(root)).toEqual(['Movie Beta', 'Book Gamma']);
        expect(saveTypes).toHaveBeenLastCalledWith(['anime', 'movie', 'series', 'book', 'manga']);
        button(root, 'By month').click();
        expect(root.querySelector('.lorebase-release-timeline')).not.toBeNull();
        expect(root.querySelector('.lorebase-release-sidebar')).toBeNull();
        expect(titles(root)).toEqual(['Past Anime', 'Movie Beta', 'Book Gamma']);
        expect(saveView).toHaveBeenLastCalledWith('agenda', 'all');
        expect(root.querySelector('[data-type="all"]')).toBeNull();
        expect(root.querySelectorAll('.lorebase-release-media-filters button')).toHaveLength(6);
        root.querySelector<HTMLButtonElement>('[data-type="game"]')!.click();
        expect(titles(root)).toEqual(['Past Anime', 'Game Alpha', 'Movie Beta', 'Book Gamma']);
        expect(saveTypes.mock.lastCall?.[0]).toHaveLength(6);
        button(root, 'Upcoming').click();
        expect(root.querySelector('[data-year="2025"]')).toBeNull();
        modal.onClose();
    });

    it('shows all years in one timeline and retains collapsed months after switching modes', async () => {
        const { modal, root } = await fixture(items, 'agenda');
        expect(Array.from(root.querySelectorAll('[data-year]')).map(node => node.getAttribute('data-year'))).toEqual(['2025', '2026']);
        const month = root.querySelector<HTMLButtonElement>('[data-month="2026-11"] .lorebase-release-month-heading')!;
        month.click();
        expect(month.getAttribute('aria-expanded')).toBe('false');
        expect(root.querySelector<HTMLElement>('[data-month="2026-11"] .lorebase-release-month-content')?.hidden).toBe(true);
        button(root, 'Calendar').click();
        button(root, 'By month').click();
        expect(root.querySelector('[data-month="2026-11"] .lorebase-release-month-heading')?.getAttribute('aria-expanded')).toBe('false');
        root.querySelector<HTMLButtonElement>('[data-month="2026-11"] .lorebase-release-month-heading')!.click();
        expect(root.querySelector('[data-month="2026-11"] .lorebase-release-month-heading')?.getAttribute('aria-expanded')).toBe('true');
        expect(titles(root)).toEqual(['Past Anime', 'Game Alpha', 'Movie Beta', 'Book Gamma']);
        modal.onClose();
    });

    it.each(['calendar', 'agenda'])('opens the original library item from a poster in %s mode', async mode => {
        const { modal, root, open } = await fixture(items, mode);
        const close = vi.spyOn(modal, 'close');
        root.querySelector<HTMLButtonElement>('.lorebase-release-card')!.click();
        expect(close).toHaveBeenCalledOnce();
        expect(open).toHaveBeenCalledWith(mode === 'calendar' ? items[0] : items[3]);
        modal.onClose();
    });

    it('keeps a calendar date selected without using it to hide the rest of the timeline', async () => {
        const { modal, root } = await fixture();
        root.querySelector<HTMLButtonElement>('[data-date="2026-11-19"]')!.click();
        button(root, 'By month').click();
        expect(titles(root)).toEqual(['Past Anime', 'Game Alpha', 'Movie Beta', 'Book Gamma']);
        button(root, 'Calendar').click();
        expect(titles(root)).toEqual(['Game Alpha']);
        expect(root.querySelector('.lorebase-release-day[aria-pressed="true"]')?.getAttribute('data-date')).toBe('2026-11-19');
        modal.onClose();
    });

    it('reverses release and month ordering while keeping title filters intact', async () => {
        const { modal, root } = await fixture();
        button(root, 'Oldest first').click();
        expect(titles(root)).toEqual(['Book Gamma', 'Movie Beta', 'Game Alpha']);
        button(root, 'By month').click();
        expect(Array.from(root.querySelectorAll('section[data-month]')).map(node => node.getAttribute('data-month')))
            .toEqual(['2026-12', '2026-11', '2025-09']);
        modal.onClose();
    });

    it('limits initial card creation and appends the next batch in release order', async () => {
        const many = Array.from({ length: 100 }, (_, index) => item('game', `Game ${String(index).padStart(3, '0')}`, '2026-11-19'));
        const { modal, root } = await fixture(many);
        expect(titles(root)).toHaveLength(36);
        root.querySelector<HTMLButtonElement>('.lorebase-release-show-more')!.click();
        expect(titles(root)).toHaveLength(72);
        root.querySelector<HTMLButtonElement>('.lorebase-release-show-more')!.click();
        expect(titles(root)).toEqual(many.map(entry => entry.displayName));
        expect(root.querySelector<HTMLButtonElement>('.lorebase-release-show-more')?.hidden).toBe(true);
        modal.onClose();
    });

    it('ignores a pending load and search timer after closing, including reopening the same modal', async () => {
        const pending: Array<(items: MediaItem[]) => void> = [];
        const { modal, root } = await fixture([], 'calendar', () => new Promise(resolve => pending.push(resolve)));
        modal.onClose(); modal.onOpen();
        pending[1](items); await Promise.resolve(); await Promise.resolve();
        expect(titles(root)).toEqual(['Game Alpha', 'Movie Beta', 'Book Gamma']);
        pending[0]([item('game', 'Stale response', '2026-11-01')]); await Promise.resolve();
        expect(titles(root)).not.toContain('Stale response');
        const search = root.querySelector<HTMLInputElement>('input[type="search"]')!;
        search.value = 'Gamma'; search.dispatchEvent(new Event('input'));
        modal.onClose(); await vi.advanceTimersByTimeAsync(200);
        expect(root.children).toHaveLength(0);
    });

    it('keeps a readable cover fallback when an image is broken', async () => {
        const { modal, root } = await fixture([{ ...items[0], imageUrl: 'app://missing.png' }]);
        const cover = root.querySelector('.lorebase-release-card-cover')!;
        cover.querySelector('img')!.dispatchEvent(new Event('error'));
        expect(cover.querySelector('img')).toBeNull();
        expect(cover.querySelector('.lorebase-release-cover-initial')).not.toBeNull();
        modal.onClose();
    });

    it('shows historical releases only when their date is selected in the calendar', async () => {
        const past = item('movie', 'Earlier this month', '2026-11-03');
        const { modal, root, open } = await fixture([...items, past]);
        expect(titles(root)).not.toContain(past.displayName);
        root.querySelector<HTMLSpanElement>('[data-date="2026-11-03"] .lorebase-release-day-event')!.click();
        expect(titles(root)).toEqual([past.displayName]);
        expect(open).not.toHaveBeenCalled();
        button(root, 'Upcoming releases').click();
        expect(titles(root)).toEqual(['Game Alpha', 'Movie Beta', 'Book Gamma']);
        modal.onClose();
    });

    it('keeps the calendar browsable when the library contains only past releases', async () => {
        const { modal, root } = await fixture([item('book', 'Archive', '2026-11-02')]);
        expect(root.querySelectorAll('.lorebase-release-day')).toHaveLength(42);
        expect(root.textContent).toContain('No upcoming releases');
        root.querySelector<HTMLButtonElement>('[data-date="2026-11-02"]')!.click();
        expect(titles(root)).toEqual(['Archive']);
        modal.onClose();
    });

    it('uses one poster card presentation in both modes, without duplicate headings or layout controls', async () => {
        const { modal, root } = await fixture();
        expect(root.querySelector('.lorebase-release-layout-switch')).toBeNull();
        const card = root.querySelector<HTMLButtonElement>('.lorebase-release-card')!;
        expect(card.querySelector('.lorebase-release-card-type')?.textContent).toBe('Game');
        expect(card.querySelector('.lorebase-release-card-title')?.textContent).toBe('Game Alpha');
        expect(card.querySelector('time')?.dateTime).toBe('2026-11-19');
        expect(card.querySelector('time')?.textContent).toContain('2026');
        root.querySelector<HTMLButtonElement>('[data-date="2026-11-19"]')!.click();
        expect(titles(root)).toEqual(['Game Alpha']);
        button(root, 'By month').click();
        expect(root.querySelector('.lorebase-release-layout-switch')).toBeNull();
        expect(root.querySelector('.lorebase-release-gallery-heading')).toBeNull();
        expect(root.querySelectorAll('h2')).toHaveLength(1);
        expect(titles(root)).toHaveLength(4);
        modal.onClose();
    });

    it('pages long archives by month and appends within an existing year without duplicate year headings', async () => {
        const archive = Array.from({ length: 16 }, (_, index) => {
            const date = new Date(2025, 6 + index, 1);
            return item('book', `Volume ${index}`, `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`);
        });
        const { modal, root } = await fixture(archive, 'agenda');
        expect(root.querySelectorAll('section[data-month]')).toHaveLength(12);
        expect(titles(root)).toHaveLength(12);
        root.querySelector<HTMLButtonElement>('.lorebase-release-more-months')!.click();
        expect(root.querySelectorAll('section[data-month]')).toHaveLength(16);
        expect(titles(root)).toEqual(archive.map(entry => entry.displayName));
        expect(root.querySelectorAll('section[data-year="2026"]')).toHaveLength(1);
        expect(root.querySelector('section[data-year="2026"] > .lorebase-release-timeline-year-heading')?.textContent).toContain('10 releases');
        expect(root.querySelector<HTMLButtonElement>('.lorebase-release-more-months')?.hidden).toBe(true);
        modal.onClose();
    });

    it('bounds the initial DOM for ten thousand releases spread across many months', async () => {
        const archive = Array.from({ length: 10000 }, (_, index) => {
            const date = new Date(2000, index % 200, 1);
            return item('book', `Volume ${index}`, `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`);
        });
        const { modal, root } = await fixture(archive, 'agenda');
        expect(root.querySelectorAll('section[data-month]')).toHaveLength(12);
        expect(titles(root)).toHaveLength(12 * 36);
        expect(root.querySelector('.lorebase-release-subtitle')?.textContent).toBe('10000 releases');
        expect(root.querySelector<HTMLButtonElement>('.lorebase-release-more-months')?.hidden).toBe(false);
        modal.onClose();
    });

    it('keeps both footer actions mounted when a day is selected and cleared', async () => {
        const { modal, root } = await fixture();
        const state = () => {
            const action = root.querySelector('.lorebase-release-date-action')!;
            return [action.querySelector<HTMLElement>('.lorebase-release-sidebar-hint')!.hidden,
                action.querySelector<HTMLButtonElement>('button')!.hidden];
        };
        expect(state()).toEqual([false, true]);
        root.querySelector<HTMLButtonElement>('[data-date="2026-11-19"]')!.click();
        expect(state()).toEqual([true, false]);
        button(root, 'Upcoming releases').click();
        expect(state()).toEqual([false, true]);
        modal.onClose();
    });

    it('labels media toggles with their current action without checkbox icons', async () => {
        const { modal, root, saveTypes } = await fixture();
        const game = root.querySelector<HTMLButtonElement>('[data-type="game"]')!;
        expect(game.title).toContain('Hide this media type');
        expect(game.getAttribute('aria-pressed')).toBe('true');
        expect(game.querySelector('.lorebase-release-filter-state')).toBeNull();
        game.click();
        expect(game.title).toContain('Show this media type');
        expect(game.getAttribute('aria-pressed')).toBe('false');
        game.click();
        expect(game.getAttribute('aria-pressed')).toBe('true');
        expect(saveTypes.mock.lastCall?.[0]).toHaveLength(6);
        modal.onClose();
    });

    it('shows a separate, readable countdown in both calendar and timeline cards', async () => {
        const { modal, root } = await fixture();
        const countdown = () => root.querySelector<HTMLElement>('[data-path="Game Alpha.md"] .lorebase-release-card-countdown')!;
        expect(countdown().textContent).toBe('In 3 days');
        expect(countdown().parentElement?.className).toBe('lorebase-release-card-info');
        button(root, 'By month').click();
        expect(countdown().textContent).toBe('In 3 days');
        expect(root.querySelector('[data-path="Past Anime.md"] .lorebase-release-card-countdown')).toBeNull();
        modal.onClose();
    });

    it('formats countdown units for singular, plural and Slavic number endings', () => {
        const cases: Array<[Language, number, string]> = [
            ['en', 1, 'In 1 day'], ['en', 2, 'In 2 days'], ['ru', 0, 'Сегодня'],
            ['ru', 1, 'Через 1 день'], ['ru', 2, 'Через 2 дня'], ['ru', 5, 'Через 5 дней'],
            ['ru', 11, 'Через 11 дней'], ['ru', 21, 'Через 21 день'], ['ru', 22, 'Через 22 дня'],
            ['uk', 1, 'Через 1 день'], ['uk', 3, 'Через 3 дні'], ['uk', 12, 'Через 12 днів'],
            ['zh-CN', 2, '2 天后'],
        ];
        for (const [language, days, expected] of cases) {
            i18n.setLanguage(language);
            expect(calendarCountdownText(days)).toBe(expected);
        }
    });
});
