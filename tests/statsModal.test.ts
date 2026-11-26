// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { StatsModal } from '../src/modals/StatsModal';
import { DEFAULT_SETTINGS } from '../src/constants';
import { makeStatRecord, STAT_MEDIA } from '../src/services/media/statistics';
import type { StatisticsLibrary } from '../src/services/StatisticsService';
import type { MediaItem, MediaType } from '../src/types';
import { installStatisticsDom, chooseStatistic } from './helpers/statisticsDom';
import { normalizeStatisticsPreferences } from '../src/services/media/statisticsPreferences';
import { i18n } from '../src/localization';
const library = (): StatisticsLibrary => ({ records: STAT_MEDIA.map((type, index) => makeStatRecord({ type, filePath: `${type}.md`, displayName: `Title ${type}`, status: index % 2 ? 'completed' : type === 'game' ? 'playing' : 'watching', genres: ['Shared'], tags: [], userRating: index % 2 ? 4 : null, favorite: false, tracks: [], musicKind: 'album', artist: '', episodeCurrent: 0, episodeTotal: 12, parts: [], authors: [], rawFields: {}, year: 2020, runtime: '24', finished: '2026-01-01' } as unknown as MediaItem, new Date(2026, 0, 1).getTime())), failedTypes: [] });
beforeAll(installStatisticsDom);
const modals: StatsModal[] = [];
function fixture(load = async () => library(), resolvePoster?: (value: string) => string | null) {
    i18n.setLanguage('en'); const open = vi.fn();
    const modal = new StatsModal({} as any, load, () => structuredClone(DEFAULT_SETTINGS), open, undefined, resolvePoster);
    modal.modalEl = document.createElement('div'); modal.contentEl = document.createElement('div'); modal.modalEl.append(modal.contentEl); document.body.append(modal.modalEl); modals.push(modal); modal.onOpen();
    return { modal, root: modal.contentEl, open };
}
afterEach(() => { modals.splice(0).forEach(modal => modal.onClose()); document.body.replaceChildren(); i18n.setLanguage('en'); });
describe('global statistics window', () => {
    it('replaces native close buttons with one window close control', () => {
        const modal = new StatsModal({} as any, async () => library(), () => structuredClone(DEFAULT_SETTINGS));
        modal.modalEl = document.body.createDiv();
        modal.modalEl.createDiv({ cls: 'modal-close-button' });
        modal.modalEl.createDiv({ cls: 'modal-close-button' });
        modal.modalEl.createDiv({ cls: 'modal-header-button mod-raised clickable-icon' });
        modal.contentEl = modal.modalEl.createDiv();
        modals.push(modal); modal.onOpen();
        expect(modal.modalEl.querySelectorAll('.modal-close-button')).toHaveLength(0);
        expect(modal.modalEl.querySelectorAll('.modal-header-button')).toHaveLength(0);
        expect(modal.modalEl.querySelectorAll('.lb-stat-header-actions .lb-stat-close')).toHaveLength(1);
    });
    it('keeps the proportional status ring and explicitly labels rare statuses', async () => {
        const base = library().records[0].item;
        const records = Array.from({ length: 1000 }, (_, index) => makeStatRecord({ ...base, filePath: index + '.md', status: index === 999 ? 'paused' : 'not_started' }));
        const { root } = fixture(async () => ({ records, failedTypes: [] }));
        await vi.waitFor(() => expect(root.querySelectorAll('.lb-stat-statuses .lb-stat-bar-row')).toHaveLength(2));
        const rare = root.querySelectorAll<HTMLButtonElement>('.lb-stat-statuses .lb-stat-bar-row')[1];
        expect(rare.querySelector('.lb-stat-bar-label')?.textContent).toBe('Paused');
        expect(rare.querySelector('strong')?.textContent).toBe('1');
        expect(rare.querySelector('small')?.textContent).toBe('<1%');
        expect(root.querySelector('.lb-stat-status-ring strong')?.textContent).toBe('1,000');
        expect(root.querySelector('.lb-stat-status-ring')?.getAttribute('aria-label')).toBe('Status distribution: 1000');
        expect(root.querySelector('.lb-stat-status-track')).toBeNull();
        expect(rare.querySelector('.lb-stat-icon')).not.toBeNull();
        rare.click();
        expect(root.querySelectorAll('.lb-stat-results .lb-stat-title-row')).toHaveLength(1);
    });
    it('highlights ring sectors and opens the matching titles by keyboard or click', async () => {
        const {root}=fixture();await vi.waitFor(()=>expect(root.querySelector('.lb-stat-ring-segment')).not.toBeNull());
        const completed=root.querySelector<SVGElement>('.lb-stat-status-ring [aria-label="Completed: 3"]')!;
        completed.dispatchEvent(new PointerEvent('pointerenter'));
        expect(completed.classList.contains('is-emphasized')).toBe(true);
        expect(completed.closest('svg')?.classList.contains('has-active-segment')).toBe(true);
        expect(root.querySelector<HTMLElement>('.lb-stat-status-ring .lb-stat-ring-tooltip')!.hidden).toBe(false);
        completed.dispatchEvent(new PointerEvent('pointerleave'));
        expect(completed.closest('svg')?.classList.contains('has-active-segment')).toBe(false);
        completed.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
        expect(root.querySelectorAll('.lb-stat-results .lb-stat-title-row')).toHaveLength(3);
        root.querySelector<HTMLButtonElement>('.lb-stat-results-close')!.click();
        root.querySelector<HTMLButtonElement>('[data-page="insights"]')!.click();
        root.querySelector<SVGElement>('.lb-stat-donut [aria-label="Movies: 1"]')!.dispatchEvent(new MouseEvent('click',{bubbles:true}));
        expect(root.querySelectorAll('.lb-stat-results .lb-stat-title-row')).toHaveLength(1);
        expect(root.querySelector('.lb-stat-results .lb-stat-title-open')?.textContent).toBe('Title movie');
        expect(root.querySelector('[data-page="insights"]')?.getAttribute('aria-current')).toBe('page');
    });
    it('also allows selecting a full single-sector ring', async () => {
        const {root}=fixture(async()=>({records:library().records.slice(0,1),failedTypes:[]}));
        await vi.waitFor(()=>expect(root.querySelector('.lb-stat-status-ring circle[role="button"]')).not.toBeNull());
        root.querySelector<SVGElement>('.lb-stat-status-ring circle')!.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}));
        expect(root.querySelectorAll('.lb-stat-results .lb-stat-title-row')).toHaveLength(1);
    });
    it('keeps independent preference columns, supports eight and persists the selection', async () => {
        const settings=structuredClone(DEFAULT_SETTINGS),save=vi.fn(async preferences=>{settings.statisticsDashboard=preferences;});
        const modal=new StatsModal({} as any,async()=>library(),()=>settings,vi.fn(),save);
        modal.modalEl=document.createElement('div');modal.contentEl=document.createElement('div');modal.modalEl.append(modal.contentEl);document.body.append(modal.modalEl);modals.push(modal);modal.onOpen();
        const root=modal.contentEl;
        await vi.waitFor(()=>expect(root.querySelector('.lb-stat-kpi')).not.toBeNull());root.querySelector<HTMLButtonElement>('[data-page="insights"]')!.click();
        const facets=()=>Array.from(root.querySelectorAll<HTMLElement>('.lb-stat-facet-column')).map(column=>column.dataset.facet);
        expect(facets()).toEqual(['genres','studios','directors','authors']);
        chooseStatistic(root,'Your preferences 2','Game platforms');
        expect(facets()).toEqual(['genres','platforms','directors','authors']);
        for(let i=0;i<4;i++)root.querySelector<HTMLButtonElement>('.lb-stat-add-column')!.click();
        expect(facets()).toHaveLength(8);expect(root.querySelector<HTMLButtonElement>('.lb-stat-add-column')!.disabled).toBe(true);
        root.querySelector<HTMLButtonElement>('.lb-stat-remove-column')!.click();
        expect(facets()[0]).toBe('platforms');expect(facets()).toHaveLength(7);
        await vi.waitFor(()=>expect(settings.statisticsDashboard?.rankColumns).toEqual(facets()));
        expect(normalizeStatisticsPreferences(settings.statisticsDashboard).rankColumns).toEqual(facets());
    });
    it('renders completion markers separately from today, including a completed title today', async () => {
        const now=new Date(),base=library().records[1].item;
        const {root}=fixture(async()=>({records:[makeStatRecord({...base,finished:[now.getFullYear(), String(now.getMonth()+1).padStart(2,'0'), String(now.getDate()).padStart(2,'0')].join('-'),status:'completed'})],failedTypes:[]}));
        await vi.waitFor(()=>expect(root.querySelector('.lb-stat-month-grid [aria-current="date"]')).not.toBeNull());
        const today=root.querySelector('.lb-stat-month-grid [aria-current="date"]')!;
        expect(today.querySelector('.lb-stat-day-number')?.textContent).toBe(String(now.getDate()));
        expect(today.querySelector('.lb-stat-day-completions')?.textContent).toBe('1');
        (today as HTMLButtonElement).click();expect(root.querySelectorAll('.lb-stat-results .lb-stat-title-row')).toHaveLength(1);
    });
    it('places an accessible close button next to refresh and preserves scroll when redrawing', async () => {
        const { modal, root } = fixture();
        await vi.waitFor(() => expect(root.querySelector('.lb-stat-kpi')).not.toBeNull());
        const refresh = root.querySelector('[aria-label="Refresh statistics"]');
        const close = root.querySelector<HTMLButtonElement>('.lb-stat-header-actions .lb-stat-close')!;
        expect(close.getAttribute('aria-label')).toBe('Close');
        expect(close.previousElementSibling).toBe(refresh);
        const body = root.querySelector<HTMLElement>('.lb-stat-body')!;
        body.scrollTop = 640;
        const replace = body.replaceChildren.bind(body);
        vi.spyOn(body, 'replaceChildren').mockImplementation((...nodes) => { replace(...nodes); body.scrollTop = 0; });
        root.querySelector<HTMLButtonElement>('.lb-stat-fold')!.click();
        expect(body.scrollTop).toBe(640);
        const closed = vi.spyOn(modal, 'close'); close.click(); expect(closed).toHaveBeenCalledOnce();
    });
    it('applies saved cover sizing and activity period controls', async () => {
        const { root } = fixture();
        await vi.waitFor(() => expect(root.querySelector('.lb-stat-kpi')).not.toBeNull());
        root.querySelector<HTMLButtonElement>('.lb-stat-customize-trigger')!.click();
        const config = root.querySelector<HTMLElement>('.lb-stat-customization')!;
        chooseStatistic(config, 'Cover size', 'Large');
        expect(root.dataset.cardSize).toBe('large');
        chooseStatistic(config, 'Activity period', '3 months · larger cells');
        expect(root.dataset.activityRange).toBe('3');
        root.querySelectorAll<HTMLButtonElement>('.lb-stat-calendar-modes button')[1].click();
        expect(root.querySelectorAll('.lb-stat-activity-day').length).toBeGreaterThan(80);
        expect(root.querySelectorAll('.lb-stat-activity-day').length).toBeLessThan(95);
    });
    it('shows one calculation at a time and switches media without changing dashboard filters', async () => {
        const { root } = fixture();
        await vi.waitFor(() => expect(root.querySelectorAll('.lb-stat-time-source')).toHaveLength(7));
        const details = root.querySelector<HTMLDetailsElement>('.lb-stat-time-details')!;
        expect(details.open).toBe(false);
        const anime = root.querySelector<HTMLButtonElement>('.lb-stat-time-source[data-media="anime"]')!;
        anime.click();
        expect(details.open).toBe(false);
        expect(anime.getAttribute('aria-pressed')).toBe('true');
        expect(root.querySelectorAll('.lb-stat-time-explanation')).toHaveLength(1);
        expect(root.querySelector<HTMLElement>('.lb-stat-time-explanation')?.dataset.media).toBe('anime');
        root.querySelector<HTMLButtonElement>('.lb-stat-time-source[data-media="book"]')!.click();
        expect(anime.getAttribute('aria-pressed')).toBe('false');
        expect(root.querySelectorAll('.lb-stat-time-explanation')).toHaveLength(1);
        expect(root.querySelector<HTMLElement>('.lb-stat-time-explanation')?.dataset.media).toBe('book');
        expect(root.querySelector('.lb-stat-time-formula')?.textContent).toContain('no reading hours');
        expect(root.querySelector('.lb-stat-kpi>strong')?.textContent).toBe('7');
        root.querySelector<HTMLButtonElement>('.lb-stat-time-explanation .lb-stat-text-link')!.click();
        expect(root.querySelectorAll('.lb-stat-results .lb-stat-title-row')).toHaveLength(1);
        expect(root.querySelector('.lb-stat-results .lb-stat-title-open')?.textContent).toBe('Title book');
    });
    it('compares all timed media in one ring and keeps reading progress beside it', async () => {
        const records = [
            makeStatRecord({ ...library().records[0].item, filePath: 'played.md', playtimeMinutes: 120 } as MediaItem),
            library().records[0],
            makeStatRecord({ ...library().records.find(row => row.item.type === 'anime')!.item, episodeCurrent: 3, episodeTotal: 12, rawFields: { episode_duration: 20 } } as MediaItem),
            makeStatRecord({ ...library().records.find(row => row.item.type === 'movie')!.item, status: 'completed', runtime: '60' } as MediaItem),
            makeStatRecord({ ...library().records.find(row => row.item.type === 'series')!.item, episodeCurrent: 2, runtime: '30' } as MediaItem),
            makeStatRecord({ ...library().records.find(row => row.item.type === 'book')!.item, pageCurrent: 30, pageTotal: 100 } as MediaItem),
            makeStatRecord({ ...library().records.find(row => row.item.type === 'manga')!.item, chapterCurrent: 12, chapterTotal: null } as MediaItem),
            makeStatRecord({ ...library().records.find(row => row.item.type === 'music')!.item, status: 'completed', musicKind: 'track', duration: 3600 } as MediaItem),
        ];
        const { root } = fixture(async () => ({ records, failedTypes: [] }));
        await vi.waitFor(() => expect(root.querySelector('.lb-stat-time-donut strong')?.textContent).toBe('6'));
        const ring = root.querySelector('.lb-stat-time-donut')!;
        expect(root.querySelectorAll('.lb-stat-time-source')).toHaveLength(7);
        expect(ring.querySelectorAll('path')).toHaveLength(5);
        expect(ring.getAttribute('aria-label')).toBe('Time by media: Games: 2 h, Anime: 1 h, Movies: 1 h, Series: 1 h, Music: 1 h');
        expect(root.querySelector('.lb-stat-time-source[data-media="game"] .lb-stat-time-source-note')?.textContent).toContain('33.3%');
        expect(root.querySelector('.lb-stat-time-metric')?.textContent).toContain('2 h');
        ring.querySelector<SVGElement>('[aria-label="Anime: 1 h"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(root.querySelector<HTMLElement>('.lb-stat-time-explanation')?.dataset.media).toBe('anime');
        root.querySelector<HTMLButtonElement>('.lb-stat-time-source[data-media="book"]')!.click();
        expect(root.querySelector('.lb-stat-time-donut')).toBe(ring);
        expect(root.querySelector('.lb-stat-time-source[data-media="book"] .lb-stat-time-source-total')?.textContent).toBe('30 pages');
        expect(root.querySelector('.lb-stat-reading-track>span')?.getAttribute('style')).toContain('30%');
        root.querySelector<HTMLButtonElement>('.lb-stat-time-source[data-media="manga"]')!.click();
        expect(root.querySelector('.lb-stat-time-donut strong')?.textContent).toBe('6');
        expect(root.querySelector('.lb-stat-time-metric')?.textContent).toContain('12 chapters');
        expect(root.querySelector('.lb-stat-reading-track')).toBeNull();
        chooseStatistic(root, 'Media', 'Games');
        expect(root.querySelector('.lb-stat-time-donut strong')?.textContent).toBe('2');
        expect(root.querySelectorAll('.lb-stat-time-source')).toHaveLength(1);
        expect(root.querySelector('.lb-stat-time-donut circle[role="button"]')).not.toBeNull();
    });
    it('shows a neutral time ring when only reading progress or unknown time is available', async () => {
        const { root } = fixture(async () => ({ records: [library().records[0], library().records.find(row => row.item.type === 'book')!], failedTypes: [] }));
        await vi.waitFor(() => expect(root.querySelector('.lb-stat-time-donut strong')?.textContent).toBe('0'));
        expect(root.querySelector('.lb-stat-time-donut')?.getAttribute('aria-label')).toBe('Time by media: Not enough data yet');
        expect(root.querySelector('.lb-stat-time-donut circle')?.getAttribute('stroke')).toBe('var(--background-modifier-border)');
        expect(root.querySelector('.lb-stat-time-source[data-media="game"] .lb-stat-time-source-total')?.textContent).toBe('—');
        expect(root.querySelectorAll('.lb-stat-time-source')).toHaveLength(2);
    });
    it('opens with all seven media and filters/reset without being tied to an originating tab', async () => {
        const { root } = fixture(); await vi.waitFor(() => expect(root.querySelector('.lb-stat-kpi>strong')?.textContent).toBe('7'));
        expect(root.querySelector('.lb-stat-kpi>strong')?.textContent).toBe('7');
        chooseStatistic(root, 'Media', 'Movies');
        expect(root.querySelector('.lb-stat-kpi>strong')?.textContent).toBe('1');
        root.querySelector<HTMLButtonElement>('.lb-stat-reset')!.click(); expect(root.querySelector('[aria-label="Media"]')?.textContent).toContain('All media'); expect(root.querySelector('.lb-stat-kpi>strong')?.textContent).toBe('7');
    });
    it('preserves the focused search input while typing and handles an empty selection', async () => {
        const { root } = fixture(); await vi.waitFor(() => expect(root.querySelector('.lb-stat-kpi')).not.toBeNull());
        const input = root.querySelector<HTMLInputElement>('input[type="search"]')!; input.focus(); input.value = 'not a title'; input.dispatchEvent(new Event('input'));
        expect(document.activeElement).toBe(input); expect(root.textContent).toContain('No titles match');
        root.querySelector<HTMLButtonElement>('.lb-stat-reset')!.click(); expect(input.value).toBe('');
    });
    it('drills into a ranking and opens the selected note through the supplied action', async () => {
        const { root, open } = fixture(); await vi.waitFor(() => expect(root.querySelector('.lb-stat-kpi')).not.toBeNull()); root.querySelector<HTMLButtonElement>('[data-page="insights"]')!.click();
        root.querySelector<HTMLButtonElement>('.lb-stat-rank-row')!.click(); expect(root.querySelector('.lb-stat-results-heading h3')?.textContent).toContain('Shared'); expect(root.querySelector('[data-page="insights"]')?.getAttribute('aria-current')).toBe('page');
        root.querySelector<HTMLButtonElement>('.lb-stat-title-open')!.click(); expect(open).toHaveBeenCalledWith(expect.objectContaining({ filePath: expect.any(String) }));
    });
    it('reports partial failures while retaining the available data', async () => {
        const { root } = fixture(async () => ({ ...library(), failedTypes: ['anime'] as MediaType[] }));
        await vi.waitFor(() => expect(root.querySelector('.lb-stat-warning')?.textContent).toContain('Anime'));
        expect(root.querySelector('.lb-stat-kpi>strong')?.textContent).toBe('7');
    });
    it('ignores older responses and results arriving after close', async () => {
        const resolutions: Array<(value: StatisticsLibrary) => void> = [];
        const { modal, root } = fixture(() => new Promise(resolve => resolutions.push(resolve)));
        const reload = modal.reload(); resolutions[1]({ records: [], failedTypes: [] }); await reload;
        resolutions[0](library()); await Promise.resolve(); expect(root.querySelector('.lb-stat-kpi>strong')?.textContent).toBe('0');
        const closing = modal.reload(); modal.onClose(); resolutions[2](library()); await closing; expect(root.childElementCount).toBe(0);
    });
    it('keeps the overview short and defers detailed charts to Insights', async () => {
        const { root } = fixture(); await vi.waitFor(() => expect(root.querySelector('.lb-stat-kpi')).not.toBeNull());
        expect(root.querySelector('.lb-stat-timeline')).toBeNull(); expect(root.querySelector('.lb-stat-rank-row')).toBeNull();
        expect(root.querySelectorAll('.lb-stat-distribution')).toHaveLength(2);
        expect(root.querySelector<HTMLDetailsElement>('.lb-stat-time-details')?.open).toBe(false);
        root.querySelector<HTMLButtonElement>('[data-page="insights"]')!.click(); expect(root.querySelector('.lb-stat-timeline')).not.toBeNull();
        expect(root.querySelector('.lb-stat-time-details')).toBeNull(); expect(root.querySelector('.lb-stat-distribution')).toBeNull();
    });
    it('opens every title in a genre, including subsequent pages', async () => {
        const base = library().records[0].item;
        const { root, open } = fixture(async () => ({ records: Array.from({ length: 23 }, (_, i) => makeStatRecord({ ...base, filePath: i + '.md', displayName: 'Fantasy ' + i, genres: ['fantasy'] })), failedTypes: [] }));
        await vi.waitFor(() => expect(root.querySelector('.lb-stat-kpi')).not.toBeNull());
        root.querySelector<HTMLButtonElement>('[data-page="insights"]')!.click(); root.querySelector<HTMLButtonElement>('.lb-stat-rank-row')!.click();
        expect(root.querySelector('[data-page="insights"]')?.getAttribute('aria-current')).toBe('page');
        expect(root.querySelector('.lb-stat-results-heading h3')?.textContent).toContain('23'); expect(root.querySelectorAll('.lb-stat-results-list .lb-stat-title-row')).toHaveLength(12);
        root.querySelectorAll<HTMLButtonElement>('.lb-stat-title-paging button')[1].click(); expect(root.querySelectorAll('.lb-stat-results-list .lb-stat-title-row')).toHaveLength(11);
        root.querySelector<HTMLButtonElement>('.lb-stat-title-open')!.click(); expect(open).toHaveBeenCalledOnce();
    });
    it('persists layout settings and restores them when a new window is opened', async () => {
        const settings = structuredClone(DEFAULT_SETTINGS), save = vi.fn(async preferences => { settings.statisticsDashboard = preferences; });
        const modal = new StatsModal({} as any, async () => library(), () => settings, vi.fn(), save);
        modal.modalEl = document.createElement('div'); modal.contentEl = document.createElement('div'); modal.modalEl.append(modal.contentEl); document.body.append(modal.modalEl); modals.push(modal); modal.onOpen();
        await vi.waitFor(() => expect(modal.contentEl.querySelector('.lb-stat-kpi')).not.toBeNull());
        modal.contentEl.querySelector<HTMLButtonElement>('.lb-stat-customize-trigger')!.click();
        const checkbox = modal.contentEl.querySelector<HTMLInputElement>('input[aria-label="Your collection"]')!; checkbox.checked = false; checkbox.dispatchEvent(new Event('change'));
        expect(modal.contentEl.querySelector('.lb-stat-media')).toBeNull(); await vi.waitFor(() => expect(save).toHaveBeenCalled());
        chooseStatistic(modal.contentEl.querySelector<HTMLElement>('.lb-stat-customization')!, 'Text and spacing', 'Compact');
        await vi.waitFor(() => expect(settings.statisticsDashboard?.density).toBe('compact'));
        Array.from(modal.contentEl.querySelectorAll<HTMLButtonElement>('.lb-stat-calendar-modes button')).find(control=>control.textContent==='Activity')!.click();
        await vi.waitFor(() => expect(settings.statisticsDashboard?.calendarView).toBe('activity'));
        modal.onClose(); const reopened = new StatsModal({} as any, async () => library(), () => settings, vi.fn());
        reopened.modalEl = document.createElement('div'); reopened.contentEl = document.createElement('div'); reopened.modalEl.append(reopened.contentEl); document.body.append(reopened.modalEl); modals.push(reopened); reopened.onOpen();
        await vi.waitFor(() => expect(reopened.contentEl.querySelector('.lb-stat-kpi')).not.toBeNull()); expect(reopened.contentEl.dataset.density).toBe('compact'); expect(reopened.contentEl.querySelector('.lb-stat-media')).toBeNull();
        expect(reopened.contentEl.querySelector('.lb-stat-activity-grid')).not.toBeNull();
    });
    it('normalizes saved customization without accepting unknown sections', () => {
        expect(normalizeStatisticsPreferences({ density: 'broken', width: 'huge', hiddenSections: ['media', 'media', 'not-a-section'], rankFacet: 'bad', titleView:'list', calendarView:'bad', cardSize:'huge', activityMonths:900 })).toEqual({ density: 'comfortable', width: 'wide', hiddenSections: ['media'], rankFacet: 'genres', rankColumns: ['genres','studios','directors','authors'], rankOrder: 'count', calendarView: 'month', titleView: 'grid', cardSize: 'medium', activityMonths:6, widgets: {} });
    });
    it('opens an explicitly labelled media list without silently changing the overview', async () => {
        const { root } = fixture(); await vi.waitFor(() => expect(root.querySelector('.lb-stat-kpi')).not.toBeNull()); root.querySelector<HTMLButtonElement>('[data-page="insights"]')!.click();
        expect(root.querySelectorAll('.lb-stat-media-card')).toHaveLength(7);
        expect(root.querySelector('.lb-stat-donut')?.getAttribute('aria-label')).toContain('Movies: 1');
        root.querySelector<HTMLButtonElement>('.lb-stat-media-link[aria-label="Open titles: Movies"]')!.click();
        expect(root.querySelector('[data-page="insights"]')?.getAttribute('aria-current')).toBe('page');
        expect(root.querySelectorAll('.lb-stat-results-list .lb-stat-title-row')).toHaveLength(1);
        expect(root.querySelector('.lb-stat-results .lb-stat-title-open')?.textContent).toContain('movie');
    });
    it('loads resolved local covers, tries the next candidate on failure and retains a fallback', async () => {
        const item = { ...library().records[0].item, imageUrl: '[[covers/game.jpg]]', poster: 'https://example.com/game.jpg' };
        const resolve = vi.fn(value => value.startsWith('[[') ? 'app://local/game.jpg' : null);
        const { root } = fixture(async () => ({ records: [makeStatRecord(item)], failedTypes: [] }), resolve);
        await vi.waitFor(() => expect(root.querySelector('.lb-stat-kpi')).not.toBeNull()); root.querySelector<HTMLButtonElement>('[data-page="titles"]')!.click();
        const cover = root.querySelector('.lb-stat-title-cover')!, image = cover.querySelector('img')!;
        expect(image.getAttribute('src')).toBe('app://local/game.jpg'); expect(image.loading).toBe('lazy');
        image.dispatchEvent(new Event('error')); expect(image.src).toBe('https://example.com/game.jpg');
        image.dispatchEvent(new Event('error')); expect(cover.querySelector('img')).toBeNull();
        expect((cover.querySelector('.lb-stat-poster-fallback') as HTMLElement).hidden).toBe(false);
    });
    it('keeps unsafe image sources out of title covers', async () => {
        const item = { ...library().records[0].item, imageUrl: 'javascript:alert(1)', poster: null };
        const { root } = fixture(async () => ({ records: [makeStatRecord(item)], failedTypes: [] }));
        await vi.waitFor(() => expect(root.querySelector('.lb-stat-kpi')).not.toBeNull()); root.querySelector<HTMLButtonElement>('[data-page="titles"]')!.click();
        expect(root.querySelector('.lb-stat-title-cover img')).toBeNull();
    });
    it('opens only the dated completed titles for a selected calendar day', async () => {
        const base = library().records[0].item;
        const records = [
            makeStatRecord({ ...base, status: 'completed', finished: new Date().getFullYear() + '-' + String(new Date().getMonth()+1).padStart(2,'0') + '-02', displayName: 'Finished A', filePath: 'a.md' }),
            makeStatRecord({ ...base, status: 'completed', finished: new Date().getFullYear() + '-' + String(new Date().getMonth()+1).padStart(2,'0') + '-03', displayName: 'Finished B', filePath: 'b.md' }),
            makeStatRecord({ ...base, status: 'playing', finished: new Date().getFullYear() + '-' + String(new Date().getMonth()+1).padStart(2,'0') + '-02', displayName: 'Not completed', filePath: 'c.md' }),
        ];
        const { root } = fixture(async () => ({ records, failedTypes: [] }));
        await vi.waitFor(() => expect(root.querySelector('.lb-stat-kpi')).not.toBeNull());
        const day = Array.from(root.querySelectorAll<HTMLButtonElement>('button.lb-stat-calendar-day')).find(button => button.title.includes(': 1') && button.title.startsWith(new Intl.DateTimeFormat('en', {dateStyle:'medium'}).format(new Date(new Date().getFullYear(),new Date().getMonth(),2))))!;
        expect(day).toBeDefined(); day.click();
        expect(root.querySelectorAll('.lb-stat-results-list .lb-stat-title-row')).toHaveLength(1);
        expect(root.querySelector('.lb-stat-title-open')?.textContent).toBe('Finished A');
    });
    it('keeps retry available after a loader failure', async () => {
        const load = vi.fn().mockRejectedValueOnce(new Error('failed')).mockResolvedValue(library());
        const { modal, root } = fixture(load); await vi.waitFor(() => expect(root.textContent).toContain('Could not load statistics'));
        await modal.reload(); expect(root.querySelector('.lb-stat-kpi>strong')?.textContent).toBe('7');
    });
    it('opens exactly the titles in a highlighted map country, including keyboard activation', async () => {
        const base = library().records[0].item;
        const { root } = fixture(async () => ({ records: [makeStatRecord({ ...base, filePath: 'fr.md', displayName: 'French title', rawFields: { countries: ['FR'] } }), makeStatRecord({ ...base, filePath: 'jp.md', rawFields: { countries: ['JP'] } }), makeStatRecord({ ...base, filePath: 'unknown.md' })], failedTypes: [] }));
        await vi.waitFor(() => expect(root.querySelector('.lb-stat-map-country[aria-label*="France"]')).not.toBeNull());
        root.querySelector('.lb-stat-map-country[aria-label*="France"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(root.querySelector('.lb-stat-results-heading h3')?.textContent).toContain('France');
        expect(root.querySelectorAll('.lb-stat-title-row')).toHaveLength(1); expect(root.querySelector('.lb-stat-title-open')?.textContent).toBe('French title');
    });
    it('shows only poster cards in the catalogue and in chart selections', async () => {
        const { root } = fixture(); await vi.waitFor(() => expect(root.querySelector('.lb-stat-kpi')).not.toBeNull()); root.querySelector<HTMLButtonElement>('[data-page="titles"]')!.click();
        expect(root.querySelectorAll('.lb-stat-title-row>.lb-stat-title-detail')).toHaveLength(0);
        expect(root.querySelector('.lb-stat-title-row>.lb-stat-card-kind')).not.toBeNull();
        expect(root.querySelector('.lb-stat-title-views')).toBeNull();
        expect(root.querySelector('.lb-stat-catalogue-head')).toBeNull();
        expect(root.querySelector('.lb-stat-body')?.getAttribute('data-title-view')).toBe('grid');
        expect(root.querySelector('.lb-stat-title-arrow')).toBeNull();
    });
    it('offers three calendar modes, visibly identifies today, and opens a year month', async () => {
        const { root } = fixture(); await vi.waitFor(() => expect(root.querySelector('.lb-stat-kpi')).not.toBeNull());
        expect(root.querySelector('.lb-stat-month-grid [aria-current="date"]')?.getAttribute('title')).toContain('Today');
        const mode = (text: string) => Array.from(root.querySelectorAll<HTMLButtonElement>('.lb-stat-calendar-modes button')).find(button => button.textContent === text)!;
        mode('Activity').click(); expect(root.querySelectorAll('.lb-stat-activity-day').length).toBeGreaterThan(170);
        mode('Year').click(); expect(root.querySelectorAll('.lb-stat-year-month')).toHaveLength(12);
        root.querySelector<HTMLButtonElement>('.lb-stat-year-month')!.click();
        expect(root.querySelector('.lb-stat-month-nav>strong')?.textContent).toContain('January');
        expect(root.querySelector('.lb-stat-month-grid')).not.toBeNull();
        root.querySelector<HTMLButtonElement>('[data-page="insights"]')!.click();
        expect(root.querySelector('[data-widget="insights-journey"]')).toBeNull();
        expect(root.querySelector('.lb-stat-history')).toBeNull();
    });
    it('switches the media inside a status breakdown without changing the dashboard filters', async () => {
        const { root } = fixture(); await vi.waitFor(() => expect(root.querySelector('.lb-stat-kpi')).not.toBeNull());
        const panel=root.querySelector<HTMLElement>('[data-widget="overview-statuses"]')!;
        panel.querySelector<HTMLDetailsElement>('details')!.open=true;
        Array.from(panel.querySelectorAll<HTMLButtonElement>('.lb-stat-breakdown-tabs button')).find(control=>control.textContent==='Anime')!.click();
        expect(panel.querySelector('.lb-stat-breakdown-heading')?.textContent).toBe('Anime');
        panel.querySelector<HTMLButtonElement>('.lb-stat-breakdown-chip')!.click();
        expect(root.querySelectorAll('.lb-stat-results .lb-stat-title-row')).toHaveLength(1);
        expect(root.querySelector('.lb-stat-results .lb-stat-title-open')?.textContent).toContain('anime');
        expect(root.querySelector('.lb-stat-kpi>strong')?.textContent).toBe('7');
        expect(root.querySelector('.lb-stat-chip')).toBeNull();
    });
    it('inspects a status without changing filters, scroll position or the active tab, then restores focus', async () => {
        const { root } = fixture(); await vi.waitFor(() => expect(root.querySelector('.lb-stat-kpi')).not.toBeNull());
        const body = root.querySelector<HTMLElement>('.lb-stat-body')!; body.scrollTop = 100;
        const status = root.querySelector<HTMLButtonElement>('.lb-stat-statuses button')!; status.focus(); status.click();
        expect(root.querySelector('[data-page="overview"]')?.getAttribute('aria-current')).toBe('page');
        expect(root.querySelector('.lb-stat-kpi>strong')?.textContent).toBe('7');
        expect(root.querySelector('.lb-stat-chip')).toBeNull(); expect(body.scrollTop).toBe(100);
        expect(root.querySelector('.lb-stat-results')).not.toBeNull();
        root.querySelector('.lb-stat-results')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(root.querySelector('.lb-stat-results')).toBeNull(); expect(document.activeElement).toBe(status);
    });
    it('persists block order, resizing and collapsing through reopening the window', async () => {
        const settings = structuredClone(DEFAULT_SETTINGS), save = vi.fn(async preferences => { settings.statisticsDashboard = preferences; });
        const mount = () => { const modal = new StatsModal({} as any, async () => library(), () => settings, vi.fn(), save);
            modal.modalEl = document.createElement('div'); modal.contentEl = document.createElement('div'); modal.modalEl.append(modal.contentEl); document.body.append(modal.modalEl); modals.push(modal); modal.onOpen(); return modal; };
        const modal = mount(), root = modal.contentEl;
        await vi.waitFor(() => expect(root.querySelector('.lb-stat-kpi')).not.toBeNull()); root.querySelector<HTMLButtonElement>('.lb-stat-layout-toggle')!.click();
        const widget = () => root.querySelector<HTMLElement>('[data-widget="overview-time"]')!;
        widget().querySelector<HTMLButtonElement>('[aria-label="Move later"]')!.click();
        const order = Number(widget().style.order); expect(order).toBeGreaterThan(Number(root.querySelector<HTMLElement>('[data-widget="overview-statuses"]')!.style.order));
        const grid = root.querySelector<HTMLElement>('.lb-stat-workspace')!, panel = widget().querySelector<HTMLElement>('.lb-stat-panel')!;
        grid.getBoundingClientRect = () => ({ width: 1000 } as DOMRect); widget().getBoundingClientRect = () => ({ width: 1000 } as DOMRect); panel.getBoundingClientRect = () => ({ height: 220 } as DOMRect);
        const resize = widget().querySelector('.lb-stat-widget-resize')!;
        resize.dispatchEvent(new PointerEvent('pointerdown', { clientX: 1000, clientY: 220, pointerId: 1 }));
        resize.dispatchEvent(new PointerEvent('pointermove', { clientX: 500, clientY: 420, pointerId: 1 }));
        resize.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
        const span = (element: HTMLElement) => element.style.getPropertyValue('--stat-widget-span');
        expect(span(widget())).toBe('6');
        expect(widget().querySelector<HTMLElement>('.lb-stat-panel')!.style.getPropertyValue('--stat-widget-height')).toBe('420px');
        widget().querySelector<HTMLButtonElement>('.lb-stat-widget-width')!.click(); expect(span(widget())).toBe('12');
        widget().querySelector<HTMLButtonElement>('.lb-stat-widget-width')!.click(); expect(span(widget())).toBe('6');
        widget().querySelector<HTMLButtonElement>('.lb-stat-fold')!.click();
        await vi.waitFor(() => expect(settings.statisticsDashboard?.widgets['overview-time']).toMatchObject({ order, span: 6, height: 420, collapsed: true }));
        modal.onClose(); const reopened = mount(); await vi.waitFor(() => expect(reopened.contentEl.querySelector('.lb-stat-kpi')).not.toBeNull());
        const restored = reopened.contentEl.querySelector<HTMLElement>('[data-widget="overview-time"]')!;
        expect(restored.classList.contains('is-collapsed')).toBe(true); expect(span(restored)).toBe('6'); expect(Number(restored.style.order)).toBe(order);
        expect(reopened.contentEl.querySelector('.lb-stat-widget-tools')).toBeNull();
    });
    it('zooms and pans the map, suppresses country activation after dragging and resets the view', async () => {
        const item = { ...library().records[0].item, rawFields: { countries: ['FR'] } };
        const { root } = fixture(async () => ({ records: [makeStatRecord(item)], failedTypes: [] }));
        await vi.waitFor(() => expect(root.querySelector('.lb-stat-map svg')).not.toBeNull());
        root.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')!.click(); expect(root.querySelector('.lb-stat-map-zoom')?.textContent).toBe('140%');
        const svg = root.querySelector<SVGSVGElement>('.lb-stat-map svg')!; svg.getBoundingClientRect = () => ({ width: 1000, height: 470 } as DOMRect);
        const original = svg.querySelector('g')!.getAttribute('transform');
        svg.dispatchEvent(new PointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerId: 1, button: 0 }));
        svg.dispatchEvent(new PointerEvent('pointermove', { clientX: 170, clientY: 100, pointerId: 1 })); svg.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
        expect(svg.querySelector('g')!.getAttribute('transform')).not.toBe(original);
        svg.querySelector('.lb-stat-map-country[role="button"]')!.dispatchEvent(new MouseEvent('click')); expect(root.querySelector('.lb-stat-results')).toBeNull();
        root.querySelector<HTMLButtonElement>('.lb-stat-map-controls button:last-child')!.click(); expect(svg.querySelector('g')!.getAttribute('transform')).toBe('translate(0 0) scale(1)');
    });
});
