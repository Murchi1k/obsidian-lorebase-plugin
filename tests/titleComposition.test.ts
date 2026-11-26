import { ReadingEditModal } from '../src/modals/ReadingEditModal';
import { getDlcDisplayTitle } from '../src/utils/dlcTitle';
import { EditModal } from '../src/modals/EditModal';
import { CLASSIC_RATING_SETTINGS } from '../src/utils/rating';
// @vitest-environment happy-dom
import { bindMovieDuration } from '../src/components/ViewingDuration';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AnimeEditModal } from '../src/modals/AnimeEditModal';
import { VideoEditModal } from '../src/modals/VideoEditModal';
import { AnimePartsReviewModal } from '../src/modals/AnimePartsReviewModal';
import { i18n } from '../src/localization';
import { toAnimePartsFrontmatter, toVideoPartsFrontmatter } from '../src/services/integrations/enrichment';
import { renderPartsYaml } from '../src/services/integrations/shared';
import { AnimeService } from '../src/services/AnimeService';
import { VideoService } from '../src/services/VideoService';
import { createMockApp, createMetadataService, createMockFile } from './helpers/testHelpers';
import { configureStatusPresentation, getStatusAppearance } from '../src/statusPresentation';
import { renderRepeatTracking } from '../src/components/RepeatTrackingControl';
import { renderPartPosterSetting } from '../src/settings/sections/partPosters';
import { DEFAULT_SETTINGS } from '../src/constants';
import type { PosterMode } from '../src/types';

const contextMenu = vi.hoisted(() => ({ edit: null as (() => void) | null, showAtPosition: vi.fn() }));
vi.mock('obsidian', async importOriginal => ({
    ...await importOriginal<typeof import('obsidian')>(),
    Setting: class {
        settingEl: HTMLElement;
        controlEl: HTMLElement;
        infoEl: HTMLElement;
        constructor(container: HTMLElement) {
            this.settingEl = container.createDiv({ cls: 'setting-item' });
            this.infoEl = this.settingEl.createDiv({ cls: 'setting-item-info' });
            this.controlEl = this.settingEl.createDiv({ cls: 'setting-item-control' });
        }
        setName(name: string) { this.infoEl.createDiv({ cls: 'setting-item-name', text: name }); return this; }
        setDesc(description: string) { this.infoEl.createDiv({ cls: 'setting-item-description', text: description }); return this; }
    },
    Menu: class {
        addItem(build: (item: any) => void) {
            const item = { setTitle: () => item, setIcon: () => item, onClick: (callback: () => void) => { contextMenu.edit = callback; return item; } };
            build(item);
            return this;
        }
        showAtMouseEvent() {}
        showAtPosition = contextMenu.showAtPosition;
    },
}));

beforeAll(() => {
    Object.assign(HTMLElement.prototype, {
        empty() { this.replaceChildren(); },
        addClass(...names: string[]) { this.classList.add(...names); },
        removeClass(...names: string[]) { this.classList.remove(...names); },
        hasClass(name: string) { return this.classList.contains(name); },
        toggleClass(name: string, active: boolean) { this.classList.toggle(name, active); },
        setAttr(name: string, value: string) { this.setAttribute(name, value); },
        setCssStyles(styles: object) { Object.assign(this.style, styles); },
        createEl(tag: string, options: { cls?: string; text?: string; attr?: Record<string, string> } = {}) {
            const node = this.ownerDocument.createElement(tag);
            node.className = options.cls ?? '';
            if (options.text) node.textContent = options.text;
            for (const [key, value] of Object.entries(options.attr ?? {})) node.setAttribute(key, value);
            this.appendChild(node);
            return node;
        },
        createDiv(options: object) { return this.createEl('div', options); },
        createSpan(options: object) { return this.createEl('span', options); },
    });
    Object.assign(globalThis, {
        createEl: (tag: string, options: object) => document.createElement('div').createEl(tag as 'button', options),
        createSvg: (tag: string) => {
            const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
            (element as any).createSvg = (child: string) => document.createElementNS('http://www.w3.org/2000/svg', child);
            return element;
        },
    });
    i18n.setLanguage('ru');
});
afterEach(() => {
    document.body.replaceChildren(); vi.restoreAllMocks(); vi.clearAllMocks();
    contextMenu.edit = null;
    configureStatusPresentation({ statusCustomization: {}, statusLabels: {} });
});

function fixture(type: 'anime' | 'series', posterMode: PosterMode = 'active-part', compact = false, ratingSettings = CLASSIC_RATING_SETTINGS) {
    const app = createMockApp({});
    const parts = [
        { id: 'first', title: 'Первая история', kind: type === 'anime' ? 'tv' : 'season', seasonNumber: 1, episodeCurrent: 8, episodeTotal: 24, status: 'watching', episodeDuration: 24, poster: 'https://cdn.example/first.jpg', year: 2022 },
        { id: 'second', title: 'Продолжение', kind: type === 'anime' ? 'ona' : 'season', seasonNumber: null, episodeCurrent: 0, episodeTotal: null, status: 'planned' },
    ];
    const item = { type, displayName: 'Коллекция', filePath: 'Title.md', imageUrl: 'https://cdn.example/first.jpg', titleImageUrl: 'https://cdn.example/title.jpg', poster: 'Covers/Title.jpg', posterMode, format: 'tv', status: 'watching', userRating: null, favorite: false, isAdult: false, year: 2022, parts, activePartId: 'first', tags: [], genres: [], studios: [], runtime: '', repeatCount: 2 } as any;
    const modal = type === 'anime'
        ? new AnimeEditModal(app, item, vi.fn(), undefined, undefined, undefined, [], undefined, undefined, ratingSettings, undefined, undefined, compact)
        : new VideoEditModal(app, item, vi.fn(), vi.fn(), undefined, [], [], undefined, undefined, ratingSettings,
            undefined, undefined, undefined, undefined, compact);
    const internal = modal as any;
    const root = document.body.createDiv({ cls: 'lorebase-editmode-root' });
    modal.contentEl = root;
    root.innerHTML = internal.buildTemplate();
    internal.repeatCount = item.repeatCount;
    renderRepeatTracking(root, item, internal.repeatCount, next => internal.repeatCount = next);
    if (type === 'anime') {
        internal.renderFormatDropdowns(root);
        internal.renderPartStatusSegments(root);
    } else {
        internal.renderPartKindOptions(root);
        internal.renderStatusSegments(root, '[data-role="part-status-segments"]', internal.getVideoStatusOptions());
    }
    internal.renderPartStrip(root);
    internal.renderActivePartEditor(root);
    internal.updateProgressSummary(root);
    internal.bindParts(root);
    return { modal: internal, root, parts: internal.parts };
}

function editField(root: HTMLElement, field: string, value: string): HTMLInputElement {
    const input = root.querySelector<HTMLInputElement>(`[data-field="${field}"]`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    return input;
}

describe('individual episodes in the real part editors', () => {
    it.each(['anime', 'series'] as const)('removes a %s part from additional settings and protects the remaining part', type => {
        const { modal, root } = fixture(type, 'active-part', true);
        const settings = root.querySelector<HTMLDetailsElement>('.lorebase-part-duration-default')!;
        const remove = settings.querySelector<HTMLButtonElement>('[data-action="remove-part"]')!;
        expect(remove).not.toBeNull();
        expect(root.querySelector('[data-role="part-actions"]')).toBeNull();
        expect(root.querySelectorAll('[data-action="remove-part"]')).toHaveLength(1);
        settings.open = true;
        remove.click();
        expect(modal.parts).toHaveLength(1);
        expect(remove.disabled).toBe(true);
        expect(remove.hidden).toBe(true);
        expect(settings.querySelector('[data-field="part-duration"]')).not.toBeNull();
        modal.episodeControl.destroy();
    });
    it.each(['anime', 'series'] as const)('keeps the rearranged %s episode, rating and rewatch fields connected to their values', type => {
        const { modal, root, parts } = fixture(type, 'active-part', true, { ...CLASSIC_RATING_SETTINGS, mode: 'custom', max: 10, step: 0.5 });
        const current = root.querySelector<HTMLInputElement>('[data-field="part-episode-current"]')!;
        const total = root.querySelector<HTMLInputElement>('[data-field="part-episode-total"]')!;
        expect(current.closest('.lorebase-title-part-episode-count')).toBe(total.closest('.lorebase-title-part-episode-count'));
        expect(current.closest('.lorebase-title-part-metadata')).not.toBeNull();
        expect(root.querySelector('[data-role="part-rating"]')?.closest('.lorebase-title-part-heading')).not.toBeNull();
        expect(root.querySelector('[data-role="part-repeat-tracking"]')?.closest('.lorebase-title-part-tracking')).not.toBeNull();
        expect(current.readOnly).toBe(false);
        root.querySelector<HTMLButtonElement>('[data-action="episode-inc"]')!.click();
        expect(current.value).toBe('9');
        expect(parts[0].episodeCurrent).toBe(9);
        const score = root.querySelector<HTMLInputElement>('[data-role="part-rating"] input')!;
        score.value = '8,5'; score.dispatchEvent(new Event('input'));
        expect(parts[0].userRating).toBe(8.5);
        const repeats = root.querySelector<HTMLInputElement>('[data-role="part-repeat-tracking"] input')!;
        repeats.value = '4'; repeats.dispatchEvent(new Event('input'));
        expect(modal.repeatCount).toBe(4);
        expect(parts[0].episodeCurrent).toBe(9);
        root.querySelectorAll<HTMLButtonElement>('.lorebase-episodes-mode button')[1].click();
        expect(current.readOnly).toBe(true);
        root.querySelector<HTMLButtonElement>('[data-episode="12"]')!.click();
        expect(current.value).toBe('10');
        expect(parts[0].watchedEpisodes).toContain(12);
        expect(total.value).toBe('24');
        root.querySelectorAll<HTMLButtonElement>('.lorebase-episodes-mode button')[0].click();
        expect(current.readOnly).toBe(false);
        root.querySelectorAll<HTMLButtonElement>('[data-role="part-strip"] [role="tab"]')[1].click();
        expect(current.value).toBe('0');
        expect(score.value).toBe('');
        expect(repeats.value).toBe('4');
        expect(parts[0].userRating).toBe(8.5);
        modal.episodeControl.destroy();
    });
    it.each(['anime', 'series'] as const)('keeps %s duration controls under additional settings and removes the duplicate title rating', type => {
        const { modal, root, parts } = fixture(type, 'active-part', true);
        const panel = root.querySelector<HTMLDetailsElement>('.lorebase-part-duration-default')!;
        expect(panel.open).toBe(false);
        expect(panel.querySelector('summary')?.textContent).toContain('Дополнительные настройки');
        expect(root.querySelector('[data-field="part-duration"]')?.closest('details')).toBe(panel);
        expect(root.querySelector('[data-field="common-duration"]')?.closest('details')).toBe(panel);
        expect(root.querySelectorAll('[data-field="part-duration"]')).toHaveLength(1);
        panel.open = true;
        editField(root, 'common-duration', '40');
        expect(parts.map((part: any) => part.episodeDuration)).toEqual([40, 40]);
        editField(root, 'part-duration', '50');
        expect(parts.map((part: any) => part.episodeDuration)).toEqual([50, 40]);
        root.querySelectorAll<HTMLButtonElement>('[data-role="part-strip"] [role="tab"]')[1].click();
        expect(root.querySelector<HTMLInputElement>('[data-field="part-duration"]')!.value).toBe('40');
        panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(panel.open).toBe(false);
        modal.selectedRating = 4; modal.updateRatingUI(root);
        expect(root.querySelector('[data-role="part-card-score"]')).toBeNull();
        expect(root.querySelector('[data-role="rating-value"]')?.textContent).toContain('4');
        expect(root.querySelector('[data-role="part-rating"]')).not.toBeNull();
        modal.episodeControl.destroy();
    });
    it.each(['anime', 'series'] as const)('updates the %s card as the selected part, its metadata and episode checks change', type => {
        const { modal, root, parts } = fixture(type, 'active-part', true);
        const field = <T extends HTMLElement = HTMLElement>(role: string) => root.querySelector<T>(`[data-role="${role}"]`)!;
        expect(field('part-position').textContent).toBe('Часть 1');
        expect(field<HTMLProgressElement>('part-card-progress').value).toBe(33);
        expect(field('watch-progress').closest('details')).toBeNull();
        expect(field('part-strip').compareDocumentPosition(field('watch-progress')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(field('watch-progress').compareDocumentPosition(field('part-editor')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(root.querySelector('[data-field="part-year"]')?.closest('details')).toBeNull();
        editField(root, 'part-year', '2025');
        editField(root, 'part-title', 'Новый заголовок');
        editField(root, 'part-duration', '30');
        expect(field<HTMLInputElement>('part-card-title').value).toBe('Новый заголовок');
        expect(parts[0]).toMatchObject({ year: 2025, episodeDuration: 30 });
        root.querySelectorAll<HTMLButtonElement>('.lorebase-episodes-mode button')[1].click();
        field('part-episodes').querySelector<HTMLButtonElement>('[data-episode="12"]')!.click();
        expect(field('part-card-percent').textContent).toBe('38%');
        expect(parts[0].watchedEpisodes).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 12]);
        Array.from(field('part-status-segments').querySelectorAll<HTMLElement>('[role="option"]'))
            .find(option => option.textContent === 'Просмотрено')!.click();
        const firstTab = field('part-strip').querySelector<HTMLElement>('[role="tab"]')!;
        expect(firstTab.dataset.status).toBe('completed');
        expect(firstTab.style.getPropertyValue('--lorebase-part-status-color')).toBe(getStatusAppearance(type, 'completed').color);
        root.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click();
        expect(field('part-position').textContent).toBe('Часть 2');
        expect(field<HTMLInputElement>('part-card-title').value).toBe('Продолжение');
        expect(field('part-card-progress').getAttribute('aria-valuetext')).toBe('Неизвестно');
        root.querySelector<HTMLButtonElement>('[data-action="add-part"]')!.click();
        expect(document.activeElement).toBe(root.querySelector('[data-field="part-title"]'));
        modal.episodeControl.destroy();
    });
    it.each(['anime', 'series'] as const)('rates and clears a %s part with the same five stars as DLC', type => {
        const { modal, root, parts } = fixture(type, 'active-part', true);
        const stars = root.querySelectorAll<HTMLButtonElement>('[data-role="part-rating"] .lorebase-editmode-dlc-star');
        expect(stars).toHaveLength(5);
        stars[3].click();
        expect(stars[3].getAttribute('aria-pressed')).toBe('true');
        expect(parts[0].userRating).toBe(4);
        const tabs = root.querySelectorAll<HTMLButtonElement>('[data-role="part-strip"] [role="tab"]');
        tabs[1].click();
        expect(stars[3].getAttribute('aria-pressed')).toBe('false');
        expect(parts[1].userRating).toBeUndefined();
        root.querySelector<HTMLButtonElement>('[data-role="part-strip"] [role="tab"]')!.click();
        expect(stars[3].getAttribute('aria-pressed')).toBe('true');
        stars[3].click();
        expect(parts[0].userRating).toBeNull();
        modal.episodeControl.destroy();
    });
    it('keeps a separate part rating with direct entry and half-step DLC controls', async () => {
        const { modal, root, parts } = fixture('anime', 'active-part', true, { ...CLASSIC_RATING_SETTINGS, mode: 'custom', max: 10, step: 0.5 });
        const host = root.querySelector<HTMLElement>('[data-role="part-rating"]')!;
        const input = host.querySelector<HTMLInputElement>('input')!;
        const [lower, higher] = host.querySelectorAll<HTMLButtonElement>('button');
        const enter = (value: string) => { input.value = value; input.dispatchEvent(new Event('input')); };
        expect(host.querySelector('.lorebase-game-dlc-scale')?.textContent).toBe('/ 10');
        expect(lower.disabled).toBe(true);
        enter('8,5');
        expect(parts[0].userRating).toBe(8.5);
        higher.click();
        expect(input.value).toBe('9');
        lower.click();
        expect(input.value).toBe('8,5');
        enter('8,2');
        expect(input.checkValidity()).toBe(false);
        expect(parts[0].userRating).toBe(8.5);
        root.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click();
        expect(input.value).toBe('');
        expect(input.checkValidity()).toBe(true);
        root.querySelectorAll<HTMLButtonElement>('[role="tab"]')[0].click();
        expect(input.value).toBe('8,5');
        modal.applyRefreshedParts(root, { parts: parts.map(part => ({ ...part, userRating: undefined })), activePartId: 'first', status: 'watching' });
        expect(input.value).toBe('8,5');
        enter('');
        expect(modal.parts[0].userRating).toBeNull();
        enter('8,5');
        modal.onSave = vi.fn();
        await modal.save();
        expect(modal.onSave.mock.calls[0][0]).toMatchObject({ userRating: null, parts: [{ userRating: 8.5 }, {}] });
        modal.episodeControl.destroy();
    });
    it('keeps anime geography on an ordinary save and updates it when the left origin control changes', async () => {
        const { modal } = fixture('anime');
        modal.anime.countryOfOrigin = 'JP'; modal.anime.countries = ['JP', 'US']; modal.countryOfOrigin = 'JP';
        modal.onSave = vi.fn().mockResolvedValue(undefined); modal.close = vi.fn();
        await modal.save();
        expect(modal.onSave.mock.calls[0][0]).not.toHaveProperty('countries');
        modal.countryOfOrigin = 'KR'; await modal.save();
        expect(modal.onSave.mock.calls[1][0]).toMatchObject({ countryOfOrigin: 'KR', countries: ['KR'] });
        modal.episodeControl?.destroy();
    });
    it.each(['anime', 'series'] as const)('switching the %s tracking mode does not resume a paused part', type => {
        const { modal, root, parts } = fixture(type); parts[0].status = 'paused';
        root.querySelectorAll<HTMLButtonElement>('.lorebase-episodes-mode button')[1].click();
        expect(parts[0].status).toBe('paused'); modal.episodeControl.destroy();
    });
    it.each(['anime', 'series'] as const)('keeps %s episode gaps in the draft, across part changes, and when saved', async type => {
        const { modal, root, parts } = fixture(type);
        const original = type === 'anime' ? modal.anime : modal.item;
        const persist = vi.fn(async () => {}); modal.onSave = persist;
        const host = root.querySelector<HTMLElement>('[data-role="part-episodes"]')!;
        Array.from(host.querySelectorAll<HTMLButtonElement>('.lorebase-episodes-mode button'))[1].click();
        expect(parts[0].watchedEpisodes).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
        host.querySelector<HTMLButtonElement>('[data-episode="12"]')!.click();
        host.querySelector<HTMLButtonElement>('[data-episode="2"]')!.click();
        expect(parts[0].watchedEpisodes).toEqual([1, 3, 4, 5, 6, 7, 8, 12]);
        expect(parts[0].episodeCurrent).toBe(8);
        expect(persist).not.toHaveBeenCalled(); expect(original.parts[0].watchedEpisodes).toBeUndefined();
        modal.editedPartId = 'second'; modal.renderActivePartEditor(root);
        expect(host.querySelectorAll('[data-episode]')).toHaveLength(0);
        modal.editedPartId = 'first'; modal.renderActivePartEditor(root);
        expect(host.querySelector('[data-episode="12"]')!.getAttribute('aria-pressed')).toBe('true');
        expect(host.querySelector('[data-episode="2"]')!.getAttribute('aria-pressed')).toBe('false');
        expect(await modal.save()).toBe(true);
        expect(persist.mock.calls[0][0].parts[0].watchedEpisodes).toEqual([1, 3, 4, 5, 6, 7, 8, 12]);
        modal.episodeControl.destroy();
    });
});

describe('stable tracking disclosure toolbar', () => {
    it('keeps both toggles in the same toolbar when either panel expands', async () => {
        const { modal, root } = fixture('anime');
        modal.bindStatus(root); modal.renderStars(root); modal.bindRating(root);
        const tools = root.querySelector<HTMLElement>('.lorebase-tracking-tools')!;
        const advanced = tools.querySelector<HTMLButtonElement>('[data-action="toggle-detailed-rating"]')!;
        const dates = tools.querySelector<HTMLButtonElement>('[data-action="toggle-tracking-dates"]')!;
        const footer = tools.parentElement!;
        const datePanel = document.getElementById(dates.getAttribute('aria-controls')!) as HTMLDetailsElement;
        expect(datePanel.hidden).toBe(true);
        dates.click();
        expect(datePanel.hidden).toBe(false);
        expect(dates.getAttribute('aria-expanded')).toBe('true');
        advanced.click();
        await vi.waitFor(() => expect(footer.querySelectorAll('.lorebase-detailed-rating-row')).toHaveLength(3));
        expect(footer.firstElementChild).toBe(tools);
        expect(tools.children[0]).toBe(advanced);
        expect(tools.children[1]).toBe(dates);
        expect(advanced.getAttribute('aria-expanded')).toBe('true');
        dates.click();
        expect(datePanel.hidden).toBe(true);
        expect(advanced.getAttribute('aria-expanded')).toBe('true');
    });
});

describe('compact game and reading tracking', () => {
    it.each(['game','book'] as const)('keeps %s status behavior and date/rating controls', type => {
        const app = createMockApp({});
        const item = { type, displayName: 'Title', filePath: 'Title.md', status: type === 'game' ? 'playing' : 'reading',
            userRating: null, favorite: false, year: null, tags: [], genres: [], platforms: [], dlc: [], authors: [], description: '', gameSeries: '' } as any;
        const modal = (type === 'game' ? new EditModal(app,item,vi.fn()) : new ReadingEditModal(app,item,vi.fn(),vi.fn())) as any;
        const root = document.body.createDiv({}); root.innerHTML = modal.buildTemplate();
        modal.bindStatus(root); modal.bindRating(root);
        const picker = root.querySelector('.lorebase-tracking-status')!;
        if (type === 'game') {
            modal.selectedStatus = 'wishlist'; modal.updateStatusUI(root);
            expect(picker.querySelector<HTMLButtonElement>('button')!.disabled).toBe(true);
            modal.selectedStatus = 'playing'; modal.updateStatusUI(root);
            expect(picker.querySelector<HTMLButtonElement>('button')!.disabled).toBe(false);
        }
        const completed = picker.querySelector<HTMLButtonElement>('[data-status="completed"]')!;
        completed.click();
        expect(modal.selectedStatus).toBe('completed');
        expect(modal.finished).toBe('');
        root.querySelector<HTMLButtonElement>('[data-role="stars"] [data-rating="4"]')!.click();
        expect(modal.selectedRating).toBe(4);
        const dates = root.querySelector<HTMLDetailsElement>('.lorebase-tracking-dates')!;
        root.querySelector<HTMLButtonElement>('[data-action="toggle-tracking-dates"]')!.click();
        expect(dates.open).toBe(true);
        dates.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
        expect(dates.open).toBe(false);
    });
});

describe('DLC display names', () => {
    it.each([
        ['Euro Truck Simulator 2 - Nordic Horizons', 'Euro Truck Simulator 2', 'Nordic Horizons'],
        ['Euro Truck Simulator 2: Cabin Accessories', 'Euro Truck Simulator 2', 'Cabin Accessories'],
        ['METRO EXODUS — Sam’s Story', 'Metro Exodus', 'Sam’s Story'],
        ['Portal 2', 'Portal', 'Portal 2'],
        ['Game - ', 'Game', 'Game -'],
    ])('shows the distinguishing part of %s', (title, game, expected) => {
        expect(getDlcDisplayTitle(title, game)).toBe(expected);
    });
    it.each(['steam','igdb'])('uses actual %s image orientation without changing metadata', provider => {
        const modal = Object.create(EditModal.prototype) as any;
        Object.assign(modal, { game: { displayName: 'Game' }, dlcExpanded: false, ratingSettings: CLASSIC_RATING_SETTINGS,
            dlc: [{ id: '1', title: 'Game - DLC', provider, imageUrl: 'Covers/DLC.jpg', userRating: null }] });
        const root = document.body.createDiv({}); root.innerHTML = '<div data-role="dlc-list"></div><div data-role="dlc-toggle"></div>';
        modal.renderDlc(root);
        const row = root.querySelector<HTMLElement>('.lorebase-editmode-dlc-item')!;
        const image = row.querySelector<HTMLImageElement>('img')!;
        expect(image.getAttribute('src')).toBe('Covers/DLC.jpg');
        expect(row.classList.contains('is-portrait')).toBe(provider === 'igdb');
        Object.defineProperties(image, { naturalWidth: {value:200, configurable:true}, naturalHeight: {value:300, configurable:true} });
        image.dispatchEvent(new Event('load'));
        expect(row.classList.contains('is-portrait')).toBe(true);
        Object.defineProperties(image, { naturalWidth: {value:460, configurable:true}, naturalHeight: {value:215, configurable:true} });
        image.dispatchEvent(new Event('load'));
        expect(row.classList.contains('is-portrait')).toBe(false);
        expect(row.style.getPropertyValue('--lorebase-dlc-cover-ratio')).toBe('460 / 215');
        expect(modal.dlc[0].imageUrl).toBe('Covers/DLC.jpg');
    });
    it('preserves full DLC names in the model and accessible labels', () => {
        const modal = Object.create(EditModal.prototype) as any;
        const full = 'Euro Truck Simulator 2 - Nordic Horizons';
        Object.assign(modal, { game: { displayName: 'Euro Truck Simulator 2' }, dlcExpanded: false, ratingSettings: CLASSIC_RATING_SETTINGS,
            dlc: [{ id: '1', title: full, provider: 'steam', url: 'https://example.com', userRating: null }] });
        const root = document.body.createDiv({}); root.innerHTML = '<div data-role="dlc-list"></div><div data-role="dlc-toggle"></div>';
        modal.renderDlc(root);
        const title = root.querySelector('.lorebase-editmode-related-title')!;
        expect(title.textContent).toBe('Nordic Horizons');
        expect(title.getAttribute('aria-label')).toBe(full);
        expect(title.getAttribute('title')).toBe(full);
        expect(modal.dlc[0].title).toBe(full);
    });
});

describe('compact DLC list', () => {
    it('shows three entries and keeps ratings and removal working when expanded', () => {
        const modal = Object.create(EditModal.prototype) as any;
        Object.assign(modal, { dlcExpanded: false, ratingSettings: CLASSIC_RATING_SETTINGS,
            dlc: [1,2,3,4,5].map(id => ({ id: String(id), title: 'DLC ' + id, provider: 'igdb', userRating: null })) });
        const root = document.body.createDiv({}); root.innerHTML = '<div data-role="dlc-list"></div><div data-role="dlc-toggle"></div>';
        modal.renderDlc(root);
        expect(root.querySelectorAll('.lorebase-editmode-dlc-item')).toHaveLength(3);
        root.querySelector<HTMLButtonElement>('.lorebase-editmode-dlc-toggle')!.click();
        expect(root.querySelectorAll('.lorebase-editmode-dlc-item')).toHaveLength(5);
        root.querySelector<HTMLElement>('[data-role="dlc-list"]')!.scrollTop = 80;
        const list = root.querySelector<HTMLElement>('[data-role="dlc-list"]')!;
        const originalRow = list.firstElementChild;
        const originalCover = list.querySelector('img');
        const star = root.querySelectorAll<HTMLButtonElement>('.lorebase-editmode-dlc-star')[3];
        star.focus();
        root.querySelectorAll<HTMLButtonElement>('.lorebase-editmode-dlc-star')[3].click();
        expect(list.firstElementChild).toBe(originalRow);
        expect(list.querySelector('img')).toBe(originalCover);
        expect(document.activeElement).toBe(star);
        expect(star.classList.contains('is-active')).toBe(true);
        expect(root.querySelector<HTMLElement>('[data-role="dlc-list"]')!.scrollTop).toBe(80);
        expect(modal.dlc[0].userRating).toBe(4);
        root.querySelector<HTMLButtonElement>('.lorebase-editmode-related-remove')!.click();
        expect(modal.dlc.map((item: any) => item.id)).toEqual(['2','3','4','5']);
        root.querySelector<HTMLButtonElement>('.lorebase-editmode-dlc-toggle')!.click();
        expect(root.querySelectorAll('.lorebase-editmode-dlc-item')).toHaveLength(3);
    });
});

describe('movie time estimates and series runtime controls', () => {
    it('omits movie progress and keeps duration in title metadata', () => {
        const modal = Object.create(VideoEditModal.prototype) as any;
        Object.assign(modal, { item: { type: 'movie' }, ratingSettings: CLASSIC_RATING_SETTINGS, parts: [], runtime: '120 min', selectedStatus: 'planned' });
        const root = document.createElement('div'); root.innerHTML = modal.buildTemplate();
        expect(root.querySelector('[data-role="watch-progress"]')).toBeNull();
        expect(root.querySelector('.lorebase-editmode-title-meta [data-role="movie-duration"]')).not.toBeNull();
        modal.updateProgressSummary(root);
        expect(root.querySelector('progress')).toBeNull();
    });
    it('edits movie hours and minutes without a progress panel', () => {
        const modal = Object.create(VideoEditModal.prototype) as any;
        Object.assign(modal, { item: { type: 'movie' }, ratingSettings: CLASSIC_RATING_SETTINGS, parts: [], runtime: '80', selectedStatus: 'planned' });
        const root = document.body.createDiv({}); root.innerHTML = modal.buildTemplate();
        bindMovieDuration(root, 80, value => { modal.runtime = value === null ? '' : String(value); modal.updateProgressSummary(root); });
        expect(root.querySelector<HTMLInputElement>('[data-field="runtime-hours"]')!.value).toBe('1');
        expect(root.querySelector<HTMLInputElement>('[data-field="runtime-minutes"]')!.value).toBe('20');
        editField(root, 'runtime-hours', '2');
        expect(modal.runtime).toBe('140');
        expect(root.querySelector('[data-role="watch-progress"]')).toBeNull();
        editField(root, 'runtime-hours', ''); editField(root, 'runtime-minutes', '');
        expect(modal.runtime).toBe('');
    });
    it('keeps duration out of Additional and omits a movie parts panel', () => {
        const modal = Object.create(VideoEditModal.prototype) as any;
        expect(modal.buildSeriesAdditionalFields()).not.toContain('data-field="runtime"');
        expect(modal.buildMovieAdditionalFields()).not.toContain('data-field="runtime"');
        modal.item = { type: 'movie' };
        expect(modal.buildPartsSection()).toBe('');
        const parts = modal.normalizeParts({ type: 'series', runtime: '45 min', parts: [{ id: 's1', episodeDuration: null }] });
        expect(parts[0].episodeDuration).toBe(45);
    });
});

describe.each(['anime', 'series'] as const)('%s composition', type => {
    it('changes status through familiar buttons and keeps secondary editors accessible', () => {
        const { modal, root, parts } = fixture(type);
        modal.bindStatus(root); modal.renderStars(root); modal.bindRating(root);
        const panel = root.querySelector('.lorebase-compact-tracking')!;
        const picker = panel.querySelector('.lorebase-tracking-status')!;
        expect(picker.querySelectorAll('.lorebase-editmode-segment')).toHaveLength(5);
        expect(picker.querySelector('[role="listbox"]')).toBeNull();
        const completed = picker.querySelector<HTMLButtonElement>('[data-status="completed"]')!;
        completed.click();
        expect(modal.selectedStatus).toBe('completed');
        expect(parts.every((part: any) => part.status === 'completed')).toBe(true);
        expect(parts[0].episodeCurrent).toBe(parts[0].episodeTotal);
        expect(modal.finished).toBe('');
        expect(completed.getAttribute('aria-pressed')).toBe('true');
        expect(picker.getAttribute('aria-label')).toContain('Просмотрено');
        expect(panel.querySelector('.lorebase-tracking-secondary > .lorebase-detailed-rating')).not.toBeNull();
        const dates = panel.querySelector<HTMLDetailsElement>('.lorebase-tracking-dates')!;
        expect(dates.open).toBe(false);
        root.querySelector<HTMLButtonElement>('[data-action="toggle-tracking-dates"]')!.click();
        expect(dates.open).toBe(true);
        expect(dates.querySelector('[data-field="started-date"]')).not.toBeNull();
        panel.querySelector<HTMLButtonElement>('[data-role="stars"] [data-rating="4"]')!.click();
        expect(modal.selectedRating).toBe(4);
        modal.selectedStatus = 'to_be_released'; modal.updateStatusUI(root);
        expect(picker.getAttribute('aria-label')).toContain('Ожидает релиза');
    });
    it('uses one duration for missing seasons, preserves overrides and includes new seasons', () => {
        const { modal, root, parts } = fixture(type);
        expect(parts[1].episodeDuration).toBe(24);
        const defaults = root.querySelector<HTMLDetailsElement>('.lorebase-part-duration-default')!;
        expect(defaults.open).toBe(false);
        expect(defaults.closest('[data-role="part-editor"]')).not.toBeNull();
        defaults.open = true;
        defaults.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(defaults.open).toBe(false);
        defaults.open = true;
        parts.push({ ...parts[0], id: 'override', episodeDuration: 50 });
        editField(root, 'common-duration', '30');
        expect(parts.map((part: any) => part.episodeDuration)).toEqual([30, 30, 50]);
        expect(root.querySelector<HTMLInputElement>('[data-field="part-duration"]')!.value).toBe('30');
        root.querySelector<HTMLButtonElement>('[data-action="add-part"]')!.click();
        expect(modal.parts.at(-1).episodeDuration).toBe(30);
    });
    it('opens a search result part for editing without changing the active part', () => {
        const { modal, root } = fixture(type);
        modal.contentEl = document.body;
        modal.showPart('second');
        expect(modal.editedPartId).toBe('second');
        expect(modal.activePartId).toBe('first');
        expect(root.querySelector<HTMLInputElement>('[data-field="part-title"]')!.value).toBe('Продолжение');
        expect(document.activeElement).toBe(root.querySelector('[data-field="part-title"]'));
    });
    it('keeps rewatches in composition when switching parts and saves the edited count', async () => {
        const { modal, root, parts } = fixture(type);
        const input = root.querySelector<HTMLInputElement>('[data-role="part-repeat-tracking"] input')!;
        expect(input.value).toBe('2');
        expect(root.querySelector('.lorebase-editmode-advanced .lorebase-repeat-pill')).toBeNull();
        input.value = '4'; input.dispatchEvent(new Event('input'));
        root.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click();
        expect(root.querySelector('[data-role="part-repeat-tracking"] input')).toBe(input);
        expect(input.value).toBe('4');
        expect(parts.map((part: any) => part.episodeCurrent)).toEqual([8, 0]);
        await modal.save();
        expect(modal.onSave.mock.calls[0][0].repeatCount).toBe(4);
    });
    it('switches named tabs without replacing the always visible editor or opening a window', () => {
        const { modal, root, parts } = fixture(type);
        const panel = root.querySelector<HTMLElement>('[data-role="part-editor"]')!;
        const parent = panel.parentElement;
        const tabs = root.querySelectorAll<HTMLButtonElement>('[role="tab"]');
        expect(tabs[0].textContent).toBe(parts[0].title);
        expect(tabs[0].getAttribute('aria-selected')).toBe('true');
        expect(root.querySelector('[data-role="part-poster-preview"]')?.getAttribute('src')).toBe(parts[0].poster);
        expect(root.querySelector('[data-role="part-position"]')).toBeNull();
        expect(root.querySelector('[data-field="part-season"]')).toBeNull();
        expect(root.querySelector('.lorebase-part-advanced')).toBeNull();
        expect(root.querySelector('[data-role="part-count"]')?.textContent).toBe('2 части');
        expect(root.querySelector('[role="dialog"]')).toBeNull();
        expect(root.querySelector('.lorebase-part-settings')).toBeNull();
        tabs[1].click();
        expect(modal.editedPartId).toBe('second');
        expect(modal.activePartId).toBe('second');
        expect(panel.parentElement).toBe(parent);
        expect(root.querySelector('[data-role="part-editor"]')).toBe(panel);
        expect(tabs[0].getAttribute('aria-selected')).toBe('false');
        expect(tabs[1].getAttribute('aria-selected')).toBe('true');
        expect(panel.getAttribute('aria-labelledby')).toBe(tabs[1].id);
        expect(root.querySelector<HTMLElement>('[data-role="part-poster-placeholder"]')?.hidden).toBe(false);
        expect(root.querySelectorAll('[data-field="part-episode-current"]')).toHaveLength(1);
        expect(parts[0].episodeCurrent).toBe(8);
    });
    it('marks episodes in one click and with manual input, including completion and undo', () => {
        const { root, parts } = fixture(type);
        const plus = root.querySelector<HTMLButtonElement>('[data-action="episode-inc"]')!;
        const minus = root.querySelector<HTMLButtonElement>('[data-action="episode-dec"]')!;
        plus.click();
        expect(parts[0].episodeCurrent).toBe(9);
        editField(root, 'part-episode-current', '23'); plus.click();
        expect(parts[0].episodeCurrent).toBe(24);
        expect(parts[0].status).toBe('completed');
        expect(plus.disabled).toBe(true);
        minus.click();
        expect(parts[0].episodeCurrent).toBe(23);
        expect(parts[0].status).toBe('watching');
        root.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click();
        plus.click(); plus.click();
        expect(parts[1].episodeCurrent).toBe(2);
        expect(parts[1].status).toBe('watching');
        expect(parts[0].episodeCurrent).toBe(23);
        expect(root.querySelector('.lorebase-watch-progress-heading strong')?.textContent).toBe('25');
        editField(root, 'part-episode-current', '-9');
        expect(parts[1].episodeCurrent).toBe(0);
        expect(minus.disabled).toBe(true);
    });
    it('activates on tab click and offers context editing without changing current tracking', async () => {
        const { modal, root, parts } = fixture(type);
        const tabs = root.querySelectorAll<HTMLButtonElement>('[role="tab"]');
        expect(root.querySelector('[data-action="activate-part"]')).toBeNull();
        tabs[1].click();
        expect(modal.activePartId).toBe('second');
        expect(tabs[1].dataset.active).toBe('true');
        tabs[0].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
        expect(modal.editedPartId).toBe('second');
        expect(contextMenu.edit).not.toBeNull();
        contextMenu.edit!();
        editField(root, 'part-title', 'Исправленное название');
        expect(modal.editedPartId).toBe('first');
        expect(modal.activePartId).toBe('second');
        expect(tabs[0].getAttribute('aria-selected')).toBe('true');
        expect(tabs[0].dataset.active).toBe('false');
        await modal.save();
        const updates = modal.onSave.mock.calls[0][0];
        expect(updates.activePartId).toBe('second');
        expect(updates.episodeCurrent).toBe(parts[1].episodeCurrent);
        expect(updates).not.toHaveProperty('posterMode');
        expect(updates).not.toHaveProperty('imageUrl');
        expect(updates).not.toHaveProperty('poster');
        expect(parts[0].poster).toBe('https://cdn.example/first.jpg');
        tabs[0].click();
        expect(modal.activePartId).toBe('first');
    });
    it('opens editing from the keyboard context menu without activating the part', () => {
        const { modal, root } = fixture(type);
        const tab = root.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1];
        const event = new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true });
        tab.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
        expect(contextMenu.showAtPosition).toHaveBeenCalledOnce();
        contextMenu.edit!();
        expect(modal.editedPartId).toBe('second');
        expect(modal.activePartId).toBe('first');
    });
    it('adds and deletes an edited part without changing a different active part', () => {
        const { modal, root } = fixture(type);
        root.querySelector<HTMLButtonElement>('[data-action="add-part"]')!.click();
        expect(modal.editedPartId).not.toBe('first');
        expect(modal.activePartId).toBe('first');
        root.querySelector<HTMLButtonElement>('[data-action="remove-part"]')!.click();
        expect(modal.activePartId).toBe('first');
        expect(modal.parts).toHaveLength(2);
        root.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click();
        expect(modal.activePartId).toBe('second');
        root.querySelector<HTMLButtonElement>('[data-action="remove-part"]')!.click();
        expect(modal.activePartId).toBe('first');
        expect(modal.editedPartId).toBe('first');
    });
    it('uses the library cover mode without showing or saving a title-specific selector', async () => {
        const { modal, root } = fixture(type, 'title');
        expect(root.querySelector('[data-role="poster-mode"]')).toBeNull();
        expect(modal.posterMode).toBe('title');
        root.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click();
        expect(modal.activePartId).toBe('second');
        expect(modal.posterMode).toBe('title');
        await modal.save();
        const updates = modal.onSave.mock.calls[0][0];
        expect(updates).not.toHaveProperty('posterMode');
        expect(updates).not.toHaveProperty('imageUrl');
        expect(updates).not.toHaveProperty('poster');
    });
    it('updates total progress and time when counters or runtime change', () => {
        const { root, parts } = fixture(type);
        root.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click();
        editField(root, 'part-episode-total', '12');
        const runtime = root.querySelector<HTMLInputElement>('[data-field="part-duration"]')!;
        runtime.focus(); editField(root, 'part-duration', '30');
        expect(document.activeElement).toBe(runtime);
        expect(runtime.closest('.lorebase-part-runtime')).not.toBeNull();
        expect(parts[1].episodeDuration).toBe(30);
        const summary = root.querySelector('[data-role="watch-progress"]')!;
        expect(summary.textContent).toContain('8 / 36');
        expect(summary.textContent).toContain('12 ч 24 мин');
        expect(summary.querySelector<HTMLProgressElement>('progress')?.value).toBe(22);
        root.querySelector<HTMLButtonElement>('[data-action="episode-inc"]')!.click();
        expect(summary.textContent).toContain('9 / 36');
        expect(summary.querySelector<HTMLProgressElement>('progress')?.value).toBe(25);
        expect(summary.querySelector('.lorebase-watch-percent')?.textContent).toBe('25%');
        expect(parts[0].episodeCurrent).toBe(8);
    });
    it('supports horizontal arrow keys and a single tab stop without reordering parts', () => {
        const { modal, root } = fixture(type);
        const tabs = root.querySelectorAll<HTMLButtonElement>('[role="tab"]');
        tabs[0].focus();
        tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        expect(modal.editedPartId).toBe('second');
        expect(modal.activePartId).toBe('second');
        expect(document.activeElement).toBe(tabs[1]);
        expect(tabs[1].tabIndex).toBe(0);
        expect(tabs[0].tabIndex).toBe(-1);
        tabs[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
        expect(modal.editedPartId).toBe('first');
        expect(tabs[0].getAttribute('aria-controls')).toBe(root.querySelector('[data-role="part-editor"]')?.id);
        expect(Array.from(tabs).map(tab => tab.dataset.partId)).toEqual(['first', 'second']);
    });
    it('keeps field focus and updates the selected tab title and metadata', () => {
        const { root, parts } = fixture(type);
        root.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click();
        const title = root.querySelector<HTMLInputElement>('[data-field="part-title"]')!;
        title.focus(); editField(root, 'part-title', 'Новая история');
        expect(document.activeElement).toBe(title);
        expect(root.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Новая история');
        editField(root, 'part-year', '2026');
        expect(parts[1]).toMatchObject({ title: 'Новая история', seasonNumber: null, year: 2026 });
        root.querySelectorAll<HTMLButtonElement>('[role="tab"]')[0].click();
        expect(root.querySelector<HTMLInputElement>('[data-field="part-title"]')).toBe(title);
        expect(title.value).toBe('Первая история');
        expect(root.querySelector<HTMLInputElement>('[data-field="part-year"]')?.value).toBe('2022');
        expect(parts[0].seasonNumber).toBe(1);
    });
    it('edits the cover inline, preserves its input focus, and handles missing or broken images', () => {
        const { root, parts } = fixture(type);
        const toggle = root.querySelector<HTMLButtonElement>('[data-action="edit-part-poster"]')!;
        const source = root.querySelector<HTMLElement>('[data-role="part-poster-source"]')!;
        const image = root.querySelector<HTMLImageElement>('[data-role="part-poster-preview"]')!;
        const placeholder = root.querySelector<HTMLElement>('[data-role="part-poster-placeholder"]')!;
        expect(source.hidden).toBe(true);
        toggle.click();
        expect(source.hidden).toBe(false);
        expect(document.activeElement).toBe(root.querySelector('[data-field="part-poster"]'));
        const input = editField(root, 'part-poster', 'https://cdn.example/new.jpg');
        expect(image.src).toBe('https://cdn.example/new.jpg');
        expect(parts[0].poster).toBe(image.src);
        expect(document.activeElement).toBe(input);
        image.dispatchEvent(new Event('error'));
        expect(image.hidden).toBe(true);
        expect(placeholder.hidden).toBe(false);
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(source.hidden).toBe(true);
        expect(document.activeElement).toBe(toggle);
        toggle.click();
        editField(root, 'part-poster', '');
        expect(parts[0].poster).toBeNull();
        expect(image.hasAttribute('src')).toBe(false);
        root.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click();
        expect(source.hidden).toBe(true);
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
    });
    it('edits the selected format and restores the other part format when switching tabs', () => {
        const { root, parts } = fixture(type);
        root.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click();
        if (type === 'anime') {
            const option = Array.from(root.querySelectorAll<HTMLElement>('[data-field="part-kind"] [role="option"]')).find(node => node.textContent === 'OVA')!;
            option.click();
            expect(parts[1].kind).toBe('ova');
        } else {
            const option = Array.from(root.querySelectorAll<HTMLElement>('[data-field="part-kind"] [role="option"]')).find(node => node.textContent === 'Фильм')!;
            option.click();
            expect(parts[1].kind).toBe('movie');
        }
        root.querySelectorAll<HTMLButtonElement>('[role="tab"]')[0].click();
        if (type === 'anime') expect(root.querySelector('[data-field="part-kind"] .lorebase-settings-dropdown-label')?.textContent).toBe('TV');
        else expect(root.querySelector('[data-field="part-kind"] .lorebase-settings-dropdown-label')?.textContent).toBe('Сериалы');
        expect(parts[0].kind).toBe(type === 'anime' ? 'tv' : 'season');
    });
    it('handles large totals and clamps tracking when the total is reduced', () => {
        const { root, parts } = fixture(type);
        editField(root, 'part-episode-total', '1000');
        editField(root, 'part-episode-current', '2000');
        expect(parts[0].episodeCurrent).toBe(1000);
        expect(root.querySelectorAll('[data-episode]')).toHaveLength(0);
        expect(root.querySelector<HTMLButtonElement>('[data-action="episode-inc"]')?.disabled).toBe(true);
        const total = editField(root, 'part-episode-total', '10');
        total.dispatchEvent(new Event('change'));
        expect(parts[0].episodeCurrent).toBe(10);
        expect(root.querySelector<HTMLInputElement>('[data-field="part-episode-current"]')?.value).toBe('10');
        expect(root.querySelector<HTMLInputElement>('[data-field="part-episode-current"]')?.max).toBe('10');
    });
    it('preserves bindings when adding or removing parts and protects the last part', () => {
        const { modal, root } = fixture(type);
        const panel = root.querySelector('[data-role="part-editor"]');
        const plus = root.querySelector<HTMLButtonElement>('[data-action="episode-inc"]')!;
        root.querySelector<HTMLButtonElement>('[data-action="add-part"]')!.click();
        expect(modal.parts).toHaveLength(3);
        expect(root.querySelector('[data-role="part-count"]')?.textContent).toBe('3 части');
        expect(document.activeElement).toBe(root.querySelector('[data-field="part-title"]'));
        expect(root.querySelector('[data-role="part-editor"]')).toBe(panel);
        plus.click();
        expect(modal.parts[2].episodeCurrent).toBe(1);
        root.querySelector<HTMLButtonElement>('[data-action="remove-part"]')!.click();
        expect(modal.parts).toHaveLength(2);
        plus.click();
        expect(modal.parts[1].episodeCurrent).toBe(1);
        root.querySelector<HTMLButtonElement>('[data-action="remove-part"]')!.click();
        expect(modal.parts).toHaveLength(1);
        expect(modal.activePartId).toBe('first');
        plus.click();
        expect(modal.parts[0].episodeCurrent).toBe(9);
        expect(root.querySelector<HTMLButtonElement>('[data-action="remove-part"]')?.disabled).toBe(true);
        expect(root.querySelector<HTMLButtonElement>('[data-action="remove-part"]')?.hidden).toBe(true);
        expect(root.querySelector('[data-role="part-count"]')?.textContent).toBe('1 часть');
        expect(root.contains(panel)).toBe(true);
    });
    it('does not show misleading percentages or time estimates for unknown data', () => {
        const { modal, root, parts } = fixture(type);
        parts[0].episodeDuration = null;
        modal.updateProgressSummary(root);
        const summary = root.querySelector<HTMLElement>('[data-role="watch-progress"]')!;
        expect(summary.querySelector('strong')?.textContent).toBe('8');
        expect(summary.querySelector('progress')?.hasAttribute('value')).toBe(false);
        expect(summary.querySelector('progress')?.getAttribute('aria-valuetext')).toBe('Неизвестно');
        expect(summary.querySelector('.lorebase-watch-progress-times')?.textContent).toContain('Неизвестно');
        expect(summary.querySelector('.lorebase-watch-time-hint')?.textContent).toContain('длительность');
        root.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click();
        expect(root.querySelector<HTMLInputElement>('[data-field="part-episode-total"]')?.value).toBe('');
        parts[1].episodeTotal = 16;
        modal.updateProgressSummary(root);
        expect(summary.querySelector<HTMLProgressElement>('progress')?.value).toBe(20);
        expect(summary.querySelector('.lorebase-watch-progress-heading')?.textContent).toContain('8 / 40 серий');
    });
    it('completes the selected part through its status and supports undo with one click', () => {
        const { root, parts } = fixture(type);
        const status = root.querySelector<HTMLElement>('[data-role="part-status-segments"]')!;
        Array.from(status.querySelectorAll<HTMLElement>('[role="option"]')).find(option => option.textContent === 'Просмотрено')!.click();
        expect(parts[0].episodeCurrent).toBe(24);
        expect(parts[0].status).toBe('completed');
        expect(root.querySelector<HTMLButtonElement>('[data-action="episode-inc"]')?.disabled).toBe(true);
        root.querySelector<HTMLButtonElement>('[data-action="episode-dec"]')!.click();
        expect(parts[0].episodeCurrent).toBe(23);
        expect(parts[0].status).toBe('watching');
        expect(status.querySelector('.lorebase-settings-dropdown-label')?.textContent).toBe('Смотрю');
        expect(parts[1].episodeCurrent).toBe(0);
    });
    it('updates tab status colors independently, including custom status colors', () => {
        configureStatusPresentation({ statusCustomization: { [type]: { completed: { color: '#238f61' } } }, statusLabels: {} });
        const { root, parts } = fixture(type);
        const tabs = root.querySelectorAll<HTMLButtonElement>('[role="tab"]');
        const color = (index: number) => tabs[index].style.getPropertyValue('--lorebase-part-status-color');
        expect(color(0)).toBe(getStatusAppearance(type, 'watching').color);
        expect(color(1)).toBe(getStatusAppearance(type, 'planned').color);
        const status = root.querySelector<HTMLElement>('[data-role="part-status-segments"]')!;
        Array.from(status.querySelectorAll<HTMLElement>('[role="option"]')).find(option => option.textContent === 'Просмотрено')!.click();
        expect(tabs[0].dataset.status).toBe('completed');
        expect(color(0)).toBe('#238f61');
        expect(color(1)).toBe(getStatusAppearance(type, 'planned').color);
        root.querySelector<HTMLButtonElement>('[data-action="episode-dec"]')!.click();
        expect(tabs[0].dataset.status).toBe('watching');
        expect(color(0)).toBe(getStatusAppearance(type, 'watching').color);
        expect(parts[1].status).toBe('planned');
    });
    it('opens the themed status picker with arrows and consumes Escape before the parent editor', () => {
        const { root, parts } = fixture(type);
        const host = root.querySelector<HTMLElement>('[data-role="part-status-segments"]')!;
        const button = host.querySelector<HTMLButtonElement>('button')!;
        vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({ left: 20, top: 20, right: 200, bottom: 56, width: 180, height: 36 } as DOMRect);
        vi.spyOn(button, 'getClientRects').mockReturnValue([button.getBoundingClientRect()] as any);
        vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(800);
        vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1000);
        const parentEscape = vi.fn(); root.addEventListener('keydown', parentEscape);
        button.focus();
        button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        expect(button.getAttribute('aria-expanded')).toBe('true');
        const panel = document.getElementById(button.getAttribute('aria-controls')!)!;
        expect(panel.parentElement).toBe(document.body);
        expect(document.activeElement?.getAttribute('role')).toBe('option');
        document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
        expect(document.activeElement).toBe(panel.querySelector('[role="option"]:last-child'));
        parentEscape.mockClear();
        document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(parentEscape).not.toHaveBeenCalled();
        expect(button.getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(button);
        expect(panel.parentElement).toBe(host);
        expect(parts[0].episodeCurrent).toBe(8);
    });
});
describe('library cover settings', () => {
    it.each(['anime', 'series'] as const)('saves %s cover mode independently and refreshes library views', async media => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.anime.posterMode = 'title'; settings.series.posterMode = 'title';
        const plugin = { settings, saveSettings: vi.fn().mockResolvedValue(undefined), refreshViews: vi.fn() };
        const root = document.body.createDiv({});
        const updatePreview = vi.fn();
        renderPartPosterSetting({ plugin } as any, root, media, updatePreview);
        expect(root.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Режим обложки');
        expect(root.querySelector('[aria-pressed="true"]')?.textContent).toBe('Весь тайтл');
        root.querySelector<HTMLButtonElement>('button[aria-pressed="false"]')!.click();
        await vi.waitFor(() => expect(plugin.refreshViews).toHaveBeenCalledOnce());
        expect(plugin.saveSettings).toHaveBeenCalledOnce();
        expect(updatePreview).toHaveBeenCalledOnce();
        expect(settings[media].posterMode).toBe('active-part');
        expect(settings[media === 'anime' ? 'series' : 'anime'].posterMode).toBe('title');
        const reopened = document.body.createDiv({});
        renderPartPosterSetting({ plugin } as any, reopened, media, updatePreview);
        expect(reopened.querySelector('[aria-pressed="true"]')?.textContent).toBe('Активная часть');
    });
});

describe('composition persistence', () => {
    it.each(['anime', 'series'] as const)('round trips %s part metadata and rating through YAML and cache parsing', type => {
        const file = createMockFile('Title.md', 'Title');
        const part = { id: 'main', title: 'Part', kind: type === 'anime' ? 'tv' : 'season', seasonNumber: 1, episodeCurrent: 8, episodeTotal: 24, status: 'watching', poster: 'Covers/Part.jpg', episodeDuration: 24, year: 2022, userRating: 8.5 } as any;
        const serialized = type === 'anime' ? toAnimePartsFrontmatter([part]) : toVideoPartsFrontmatter([part]);
        const app = createMockApp({ [file.path]: { frontmatter: { type, [type === 'anime' ? 'anime_parts' : 'series_parts']: serialized, active_part_id: 'main' } } });
        const service = type === 'anime' ? new AnimeService(app, createMetadataService(app)) : new VideoService(app, 'series', '', createMetadataService(app));
        const parsed = type === 'anime' ? (service as AnimeService).parseAnimeFromCache(file) : (service as VideoService).parseFromCache(file);
        expect(parsed?.parts[0]).toMatchObject(part);
        const yaml = renderPartsYaml([part]);
        expect(yaml).toContain('poster: "Covers/Part.jpg"');
        expect(yaml).toContain('episode_duration: 24');
        expect(yaml).toContain('year: 2022');
        expect(yaml).toContain('user_rating: 8.5');
    });
    it('keeps manual parts and local metadata when reviewing refreshed provider relations', () => {
        const saved = { id: 'first', title: 'Local title', kind: 'tv', seasonNumber: 2, status: 'paused', episodeCurrent: 8, episodeTotal: 24, poster: 'Local.jpg', episodeDuration: 27, year: 2020 } as any;
        const manual = { ...saved, id: 'manual', title: 'Manual part' };
        const modal = new AnimePartsReviewModal(createMockApp({}), {
            title: 'Review', existingParts: [saved, manual], providerParts: [{ ...saved, poster: 'Remote.jpg', episodeDuration: 24, title: 'Remote title' }], activePartId: 'manual',
        }) as any;
        expect(modal.parts).toEqual([expect.objectContaining(saved), expect.objectContaining(manual)]);
        expect(modal.selected.size).toBe(2);
        expect(modal.activePartId).toBe('manual');
    });
});
