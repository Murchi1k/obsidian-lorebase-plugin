
import { deletionSelection, normalizeStatisticsDeletions, statisticsTimelineWithDeletions } from '../services/media/statisticsDeletions';
import { renderStatisticsDonut, type DonutSegment } from '../components/StatisticsDonut';
import { preserveScroll } from '../utils/preserveScroll';
import { personalDateSortValue } from '../utils/personalDates';
import { boundedMapView, zoomMap } from '../components/StatisticsMapNavigation';
import { App, Modal, setIcon } from 'obsidian';
import type { LorebaseSettings, MediaItem, MediaType } from '../types';
import { i18n } from '../localization';
import { st, statMediaLabel, type StatsText } from '../localization/statistics';
import { MEDIA_ICONS } from '../mediaPresentation';
import { getStatusAppearance } from '../statusPresentation';
import { formatRatingValue, getRatingMax, getRatingValues } from '../utils/rating';
import { getMediaWorkTypeColor } from '../utils/mediaWorkType';
import { createLorebaseDropdown } from '../components/LorebaseDropdown';
import { DEFAULT_COVER } from '../constants';
import { STAT_WORLD } from '../assets/statisticsWorld';
import { statisticsCountryLabel } from '../services/media/statisticsCountries';
import { statisticsTimeByMedia } from '../services/media/statisticsTime';
import { statisticsPeriodRange, statisticsRatingSummary, type StatisticsPeriod } from '../services/media/statisticsOverview';
import { normalizeStatisticsPreferences, STAT_SECTIONS, type StatisticsPreferences, type StatSection } from '../services/media/statisticsPreferences';
import type { StatisticsLibrary } from '../services/StatisticsService';
import { defaultStatFilters, filterStatRecords, rankStatRecords, STAT_FACETS, STAT_MEDIA, statDay, summarizeStatRecords, type StatFacet, type StatFilters, type StatRecord } from '../services/media/statistics';

function el<K extends keyof HTMLElementTagNameMap>(parent: HTMLElement, tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
    const value = parent.ownerDocument.createElement(tag); value.className = cls; if (text !== undefined) value.textContent = text; parent.appendChild(value); return value;
}
function icon(parent: HTMLElement, name: string): void { const value = el(parent, 'span', 'lb-stat-icon'); value.setAttribute('aria-hidden', 'true'); setIcon(value, name); }
function button(parent: HTMLElement, label: string, action: () => void, cls = '', symbol?: string): HTMLButtonElement {
    const value = el(parent, 'button', cls); value.type = 'button'; if (symbol) icon(value, symbol); if (label) el(value, 'span', '', label); value.addEventListener('click', action); return value;
}
interface StatChoice { value: string; parentElement: HTMLElement; close: () => void }
function select(parent: HTMLElement, label: string, choices: Array<[string, string]>, value: string, changed: (value: string) => void): StatChoice {
    const field = el(parent, 'div', 'lb-stat-select'); el(field, 'span', 'lb-stat-label', label);
    const container = el(field, 'div'); let current = value;
    const handle = createLorebaseDropdown(container, choices.map(([value, label]) => ({ value, label })), value, next => { current = next; changed(next); }, { floating: true, panelClass: 'lb-stat-dropdown-panel', minPanelWidth: 190 });
    const trigger = container.querySelector<HTMLButtonElement>('button')!; trigger.setAttribute('aria-label', label);
    const panel = container.querySelector<HTMLElement>('[role="listbox"]')!;
    return { get value() { return current; }, set value(next: string) { current = next; handle.setValue(next); }, parentElement: field, close: () => panel.dispatchEvent(new Event('lorebase-dropdown-close')) };
}
const number = (value: number): string => new Intl.NumberFormat(i18n.getLanguage(), { maximumFractionDigits: 1 }).format(value);
function time(value: number): string { const minutes = Math.round(value); return minutes >= 60 ? `${number(Math.floor(minutes / 60))} ${st('hour')}${minutes % 60 ? ` ${minutes % 60} ${st('minute')}` : ''}` : `${minutes} ${st('minute')}`; }
const mediaColor = (type: MediaType): string => ({ game: getMediaWorkTypeColor('game', 'Game'), anime: getMediaWorkTypeColor('anime', 'JP'), movie: getMediaWorkTypeColor('movie', 'Movie'), series: getMediaWorkTypeColor('series', 'Series'), book: '#e3bf7d', manga: getMediaWorkTypeColor('manga', 'Manga'), music: '#b79be8' })[type];

/** Global, offline statistics. Opening from a media tab never preselects that tab. */
export class StatsModal extends Modal {
    private library: StatisticsLibrary = { records: [], failedTypes: [] };
    private filters = defaultStatFilters();
    private body?: HTMLElement; private chips?: HTMLElement; private filtersEl?: HTMLElement;
    private selects = new Map<string, StatChoice>();
    private choices = new Set<StatChoice>();
    private search?: HTMLInputElement; private favorite?: HTMLButtonElement; private refresh?: HTMLButtonElement;
    private alive = false; private revision = 0; private loading = false; private error = false;
    private timeline: 'month' | 'year' = 'month';
    private page: 'overview' | 'insights' | 'titles' = 'overview';
    private tabs?: HTMLElement; private customization?: HTMLElement; private filterToggle?: HTMLButtonElement;
    private advancedFilters?: HTMLElement; private showFilters = false;
    private preferences: StatisticsPreferences; private preferenceWrites: Promise<void> = Promise.resolve(); private saveError = false;
    private rankLimits = new Map<number, number>(); private timeExpanded = false; private timeMedia: MediaType = 'game';
    private titlePage = 0; private titleSort: 'title' | 'rating' | 'added' | 'finished' | 'short' = 'added';
    private randomPath = '';
    private pageHint?: HTMLElement;
    private periodButtons?: HTMLElement;
    private period: StatisticsPeriod = 'all';
    private countryLimit = 6;
    private calendarOffset = 0;
    private editingLayout = false;
    private dragWidget = '';
    private results?: HTMLElement;
    private resultTrigger?: Element | null;
    private mapView = { x: 0, y: 0, scale: 1 };
    private mapMoved = false;
    constructor(app: App, private loadLibrary: () => Promise<StatisticsLibrary>, private settings: () => LorebaseSettings, private openItem: (item: MediaItem) => void, private savePreferences?: (preferences: StatisticsPreferences) => void | Promise<void>, private resolvePoster?: (value: string) => string | null) { super(app); this.preferences = normalizeStatisticsPreferences(settings().statisticsDashboard); }
    onOpen(): void {
        this.alive = true; this.modalEl.classList.add('lorebase-dashboard-container'); this.contentEl.classList.add('lorebase-dashboard'); this.contentEl.replaceChildren(); this.applyAppearance();
        this.modalEl.querySelectorAll(':scope > .modal-header-button, .modal-close-button').forEach(close => close.remove());
        const header = el(this.contentEl, 'header', 'lb-stat-header');
        const heading = el(header, 'div', 'lb-stat-heading'); icon(heading, 'chart-no-axes-combined');
        const text = el(heading, 'div'); el(text, 'h2', '', st('title')); this.pageHint = el(text, 'p', '', st('overviewHint'));
        const actions = el(header, 'div', 'lb-stat-header-actions');
        button(actions, st('layoutEdit'), () => { this.editingLayout = !this.editingLayout; this.redraw(); }, 'lb-stat-layout-toggle', 'move');
        const customize = button(actions, st('customize'), () => this.toggleCustomization(), 'lb-stat-customize-trigger', 'sliders-horizontal'); customize.setAttribute('aria-expanded', 'false');
        this.refresh = button(actions, '', () => { void this.reload(); }, 'lb-stat-icon-button', 'refresh-cw'); this.refresh.title = st('refresh'); this.refresh.setAttribute('aria-label', st('refresh'));
        const close = button(actions, '', () => this.close(), 'lb-stat-icon-button lb-stat-close', 'x'); close.title = st('close'); close.setAttribute('aria-label', st('close'));
        this.tabs = el(this.contentEl, 'nav', 'lb-stat-tabs'); this.tabs.setAttribute('aria-label', st('title'));
        this.filtersEl = el(this.contentEl, 'div', 'lb-stat-filters'); this.chips = el(this.contentEl, 'div', 'lb-stat-chips');
        this.body = el(this.contentEl, 'div', 'lb-stat-body');
        this.customization = el(this.contentEl, 'aside', 'lb-stat-customization'); this.customization.hidden = true; this.customization.setAttribute('aria-label', st('appearance'));
        this.renderFilters(); void this.reload();
    }
    onClose(): void { this.closeResults(false); this.alive = false; this.revision++; this.choices.forEach(choice => choice.close()); this.choices.clear(); this.contentEl.replaceChildren(); this.selects.clear(); this.body = undefined; }
    private choice(parent: HTMLElement, label: string, choices: Array<[string, string]>, value: string, changed: (value: string) => void): StatChoice {
        const control = select(parent, label, choices, value, changed); this.choices.add(control); return control;
    }
    private cleanChoices(): void { for (const choice of this.choices) if (!choice.parentElement.isConnected) { choice.close(); this.choices.delete(choice); } }
    async reload(): Promise<void> {
        const revision = ++this.revision; this.loading = true; this.error = false; this.redraw();
        try { const library = await this.loadLibrary(); if (!this.alive || revision !== this.revision) return; this.library = library; }
        catch { if (this.alive && revision === this.revision) this.error = true; }
        finally { if (this.alive && revision === this.revision) { this.loading = false; this.renderFilters(); this.redraw(); } }
    }
    private statusLabel(status: string): string {
        if (status.includes(':')) { const [type, id] = status.split(':'); return `${getStatusAppearance(type as MediaType, id as MediaItem['status']).label || id} · ${statMediaLabel(type as MediaType)}`; }
        return st(status as StatsText);
    }

    private renderFilters(): void {
        if (!this.filtersEl) return; this.selects.forEach(choice => choice.close()); this.filtersEl.replaceChildren(); this.selects.clear();
        const primary = el(this.filtersEl, 'div', 'lb-stat-filter-primary');
        this.advancedFilters = el(this.filtersEl, 'div', 'lb-stat-extra-filters'); this.advancedFilters.hidden = !this.showFilters;
        const add = (id: string, label: string, choices: Array<[string, string]>, value: string, changed: (value: string) => void) => this.selects.set(id, this.choice(id === 'type' || id === 'dateField' ? primary : this.advancedFilters!, label, choices, value, changed));
        add('type', st('media'), [['all', st('all')], ...STAT_MEDIA.map(type => [type, statMediaLabel(type)] as [string, string])], this.filters.type, value => this.setFilter({ type: value as StatFilters['type'] }));
        add('dateField', st('dateField'), [['added', st('added')], ['finished', st('finished')]], this.filters.dateField, value => this.setFilter({ dateField: value as 'added' | 'finished' }));
        this.periodButtons = el(primary, 'div', 'lb-stat-period lb-stat-segments'); this.periodButtons.setAttribute('aria-label', st('period'));
        for (const period of ['week', 'month', 'year', 'all'] as const) {
            const choice = button(this.periodButtons, st(({ week: 'periodWeek', month: 'periodMonth', year: 'periodYear', all: 'periodAll' } as const)[period]), () => { this.period = period; this.setFilter({ dateRange: statisticsPeriodRange(period), year: null }); });
            choice.dataset.period = period;
        }
        const search = el(primary, 'label', 'lb-stat-search'); icon(search, 'search');
        this.search = el(search, 'input'); this.search.type = 'search'; this.search.placeholder = st('search'); this.search.setAttribute('aria-label', st('search')); this.search.value = this.filters.query;
        this.search.addEventListener('input', () => this.setFilter({ query: this.search!.value }));
        this.filterToggle = button(primary, st('filters'), () => {
            this.showFilters = !this.showFilters; this.advancedFilters!.hidden = !this.showFilters; this.filterToggle!.setAttribute('aria-expanded', String(this.showFilters));
        }, 'lb-stat-filter-toggle', 'list-filter'); this.filterToggle.setAttribute('aria-expanded', String(this.showFilters));
        el(this.filterToggle, 'span', 'lb-stat-filter-count');
        const statuses = [...new Set(this.library.records.map(row => row.status))].sort((a, b) => this.statusLabel(a).localeCompare(this.statusLabel(b)));
        add('status', st('status'), [['all', st('allStatuses')], ...statuses.map(status => [status, this.statusLabel(status)] as [string, string])], this.filters.status, value => this.setFilter({ status: value }));
        const years = [...new Set(this.library.records.flatMap(row => [row.added !== null ? new Date(row.added).getFullYear() : null, row.finishedYear ?? (row.finished !== null ? new Date(row.finished).getFullYear() : null)]).filter((year): year is number => year !== null))].sort((a, b) => b - a);
        add('year', st('year'), [['all', st('allYears')], ...years.map(year => [String(year), String(year)] as [string, string])], String(this.filters.year ?? 'all'), value => { this.period = 'all'; this.setFilter({ year: value === 'all' ? null : Number(value), dateRange: null }); });
        this.favorite = button(this.advancedFilters, st('favorites'), () => this.setFilter({ favorites: !this.filters.favorites }), 'lb-stat-favorite', 'heart'); this.favorite.setAttribute('aria-label', st('favorites'));
        this.cleanChoices();
    }
    private setFilter(patch: Partial<StatFilters>): void {
        if (patch.year !== undefined) this.calendarOffset=0;
        this.filters = { ...this.filters, ...patch }; this.randomPath = ''; this.titlePage = 0;
        if (patch.facet?.key === 'countries') this.filters.countryUnknown = false;

        this.redraw(); if (this.body) this.body.scrollTop = 0;
    }
    /** Inspect a subset without changing the dashboard selection or active tab. */
    private openTitles(patch: Partial<StatFilters> = {}): void {
        this.closeResults(false); this.resultTrigger = this.contentEl.ownerDocument.activeElement;
        const filters = { ...this.filters, ...patch };
        if (patch.facet?.key === 'countries') filters.countryUnknown = false;
        const rows = filterStatRecords(this.library.records, filters).sort((a,b) => patch.status === 'completed' || patch.completedDate ? (b.finished ?? 0) - (a.finished ?? 0) : a.item.displayName.localeCompare(b.item.displayName, i18n.getLanguage()));
        const label = patch.facet ? this.facetLabel(patch.facet.key, patch.facet.value) : patch.completedDate ? this.historyDateLabel(patch.completedDate) : patch.countryUnknown ? st('noCountryTitles') : patch.rating != null ? st('ratings') + ' · ' + patch.rating : patch.type && patch.type !== 'all' ? statMediaLabel(patch.type) : patch.status ? this.statusLabel(patch.status) : st('inspect');
        this.modalEl.classList.add('has-stat-results');
        const host = this.results = el(this.contentEl, 'aside', 'lb-stat-results'); host.setAttribute('role', 'dialog'); host.setAttribute('aria-label', label); host.tabIndex = -1;
        const sheet=el(host,'section','lb-stat-results-sheet'); sheet.dataset.titleView='grid'; host.setAttribute('aria-modal','true'); host.addEventListener('click',event=>{if(event.target===host)this.closeResults();});
        const head = el(sheet, 'div', 'lb-stat-results-heading'); const text = el(head, 'div'); el(text, 'small', '', st('inspect')); el(text, 'h3', '', label + ' · ' + number(rows.length));
        button(head, st('closeResults'), () => this.closeResults(), 'lb-stat-results-close', 'x').setAttribute('aria-label', st('closeResults'));
        host.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); this.closeResults(); } if(event.key==='Tab'){const controls=Array.from(host.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')).filter(button=>button.getClientRects().length);const index=controls.indexOf(host.ownerDocument.activeElement as HTMLButtonElement);if(event.shiftKey&&index<=0){event.preventDefault();controls[controls.length-1]?.focus();}else if(!event.shiftKey&&(index===controls.length-1||index<0)){event.preventDefault();controls[0]?.focus();}} });
        const list = el(sheet, 'div', 'lb-stat-results-list'); let page = 0;
        const render = () => { list.replaceChildren(); const gallery=el(list,'div','lb-stat-results-gallery'); this.titleRows(gallery, rows.slice(page * 12, (page + 1) * 12)); if (!rows.length) el(list, 'p', 'lb-stat-empty', st('empty'));
            if (rows.length > 12) { const nav = el(list, 'div', 'lb-stat-title-paging'); button(nav, st('previous'), () => { page--; render(); list.scrollTop = 0; }, '', 'chevron-left').disabled = !page;
                el(nav, 'span', '', (page * 12 + 1) + '–' + Math.min((page + 1) * 12, rows.length) + ' / ' + rows.length);
                button(nav, st('next'), () => { page++; render(); list.scrollTop = 0; }, '', 'chevron-right').disabled = (page + 1) * 12 >= rows.length; }
        }; render(); host.focus();
    }
    private closeResults(focus = true): void { this.results?.remove(); this.results = undefined; this.modalEl.classList.remove('has-stat-results'); if (focus && this.resultTrigger instanceof HTMLElement && this.resultTrigger.isConnected) this.resultTrigger.focus({ preventScroll: true }); }
    private widget(grid: HTMLElement, key: string, render: (host: HTMLElement) => void, span: 0.5 | 1 | 2 = 1): void {
        const id = this.page + '-' + key, saved = this.preferences.widgets[id];
        const host = el(grid, 'div', 'lb-stat-widget'); host.dataset.widget = id; host.style.setProperty('--stat-widget-span', String(saved?.span ?? span * 6)); host.style.order = String(saved?.order ?? grid.childElementCount - 1);
        render(host); if (!host.childElementCount) { host.remove(); return; }
        const panel = host.firstElementChild as HTMLElement; const heading = panel.querySelector<HTMLElement>('.lb-stat-panel-heading');
        const sizePanel = (height: number) => { panel.style.setProperty('--stat-widget-height', height + 'px'); host.classList.add('has-explicit-size'); panel.style.setProperty('--stat-chart-height', Math.max(80, height - (key === 'ratings' ? 235 : 185)) + 'px'); };
        if (saved?.height && !saved.collapsed) sizePanel(saved.height);
        host.classList.toggle('is-collapsed', saved?.collapsed ?? false);
        if (heading) { const toggle = button(heading, '', () => this.saveWidget(id, { collapsed: !saved?.collapsed }), 'lb-stat-fold', saved?.collapsed ? 'chevron-down' : 'chevron-up'); toggle.setAttribute('aria-label', st(saved?.collapsed ? 'expand' : 'collapse')); toggle.setAttribute('aria-expanded', String(!saved?.collapsed)); }
        if (!this.editingLayout) return;
        host.classList.add('is-editing');
        const controls = el(host, 'div', 'lb-stat-widget-tools');
        const handle = button(controls, '', () => {}, '', 'grip-vertical'); handle.draggable = true; handle.title = st('layoutEdit'); handle.setAttribute('aria-label', st('layoutEdit'));
        handle.addEventListener('dragstart', event => { this.dragWidget = id; event.dataTransfer?.setData('text/plain', id); if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'; });
        handle.addEventListener('dragend', () => { this.dragWidget = ''; this.contentEl.querySelectorAll('.is-drop-target').forEach(value => value.classList.remove('is-drop-target')); });
        host.addEventListener('dragover', event => { if (this.dragWidget && this.dragWidget !== id) { event.preventDefault(); host.classList.add('is-drop-target'); } });
        host.addEventListener('dragleave', () => host.classList.remove('is-drop-target'));
        host.addEventListener('drop', event => { event.preventDefault(); if (this.dragWidget && this.dragWidget !== id) this.moveWidget(this.dragWidget, id); this.dragWidget = ''; });
        const neighbours = () => Array.from(grid.children).sort((a,b) => Number((a as HTMLElement).style.order) - Number((b as HTMLElement).style.order));
        const move = (delta: number) => { const all = neighbours(), index = all.indexOf(host), target = all[index + delta] as HTMLElement | undefined; if (target) this.moveWidget(id, target.dataset.widget!, delta > 0); };
        button(controls, '', () => move(-1), '', 'arrow-up').setAttribute('aria-label', st('moveUp'));
        button(controls, '', () => move(1), '', 'arrow-down').setAttribute('aria-label', st('moveDown'));
        button(controls, (saved?.span ?? span * 6) === 12 ? st('halfWidth') : st('fullWidth'), () => this.saveWidget(id, { span: (saved?.span ?? span * 6) === 12 ? 6 : 12 }), 'lb-stat-widget-width');
        button(controls, st('resetSize'), () => this.saveWidget(id, { height: null }));
        const resize = button(host, '', () => {}, 'lb-stat-widget-resize', 'move-diagonal-2'); resize.setAttribute('aria-label', st('resize')); resize.title = st('resize');
        resize.addEventListener('pointerdown', event => { event.preventDefault(); resize.setPointerCapture?.(event.pointerId); const start = { x: event.clientX, y: event.clientY, width: host.getBoundingClientRect().width, height: panel.getBoundingClientRect().height }; let nextSpan = saved?.span ?? span * 6, height = start.height;
            const change = (value: PointerEvent) => { nextSpan = Math.max(3, Math.min(12, Math.round((start.width + value.clientX - start.x) / Math.max(1, grid.getBoundingClientRect().width) * 12))); height = Math.max(key.startsWith('kpi-') ? 80 : 120, Math.min(900, start.height + value.clientY - start.y)); host.style.setProperty('--stat-widget-span', String(nextSpan)); sizePanel(height); };
            const finish = () => { resize.removeEventListener('pointermove', change); resize.removeEventListener('pointerup', finish); resize.removeEventListener('pointercancel', finish); this.saveWidget(id, { span: nextSpan, height }); };
            resize.addEventListener('pointermove', change); resize.addEventListener('pointerup', finish); resize.addEventListener('pointercancel', finish);
        });
    }
    private saveWidget(id: string, patch: Partial<StatisticsPreferences['widgets'][string]>): void {
        const host = this.body?.querySelector<HTMLElement>('[data-widget="' + id + '"]');
        this.changePreferences({ widgets: { ...this.preferences.widgets, [id]: { ...(this.preferences.widgets[id] ?? { order: Number(host?.style.order ?? 0), span: Number(host?.style.getPropertyValue('--stat-widget-span') || 12), height: null, collapsed: false }), ...patch } } }, false);
    }
    private moveWidget(id: string, target: string, after = false): void {
        const hosts = Array.from(this.body!.querySelectorAll<HTMLElement>('[data-widget]')).sort((a,b) => Number(a.style.order) - Number(b.style.order));
        const ids = hosts.map(host => host.dataset.widget!).filter(value => value !== id); ids.splice(ids.indexOf(target) + Number(after), 0, id);
        const widgets = { ...this.preferences.widgets }; ids.forEach((key, order) => { const host = hosts.find(host => host.dataset.widget === key)!; widgets[key] = { ...(widgets[key] ?? { span: Number(host.style.getPropertyValue('--stat-widget-span') || 12), height: null, collapsed: false }), order }; });
        this.changePreferences({ widgets }, false);
    }
    private renderTabs(count: number): void {
        if (!this.tabs) return;
        if (!this.tabs.childElementCount) for (const [page, symbol] of [['overview', 'layout-dashboard'], ['insights', 'chart-no-axes-combined'], ['titles', 'library-big']] as const) {
            const tab = button(this.tabs, st(page), () => { this.page = page; this.titlePage = 0; this.redraw(); if (this.body) this.body.scrollTop = 0; }, 'lb-stat-tab', symbol);
            tab.dataset.page = page;
            if (page === 'titles') el(tab, 'span', 'lb-stat-tab-count', number(count));
        }
        this.tabs.querySelectorAll<HTMLButtonElement>('.lb-stat-tab').forEach(tab => tab.setAttribute('aria-current', this.page === tab.dataset.page ? 'page' : 'false'));
        const badge = this.tabs.querySelector('.lb-stat-tab-count'); if (badge) badge.textContent = number(count);
    }
    private visible(section: StatSection): boolean { return !this.preferences.hiddenSections.includes(section); }
    private redraw(): void {
        if (this.body) preserveScroll(this.body, () => this.redrawContent());
    }
    private redrawContent(): void {
        if (!this.alive || !this.body) return;
        this.closeResults(false); this.body.replaceChildren(); this.cleanChoices(); this.chips?.replaceChildren();
        this.body.setAttribute('aria-busy', String(this.loading));
        if (this.refresh) { this.refresh.disabled = this.loading; this.refresh.classList.toggle('is-loading', this.loading); }
        this.selects.get('type')!.value = this.filters.type; this.selects.get('status')!.value = this.filters.status;
        this.selects.get('year')!.value = String(this.filters.year ?? 'all'); this.selects.get('dateField')!.value = this.filters.dateField;
        this.favorite?.setAttribute('aria-pressed', String(this.filters.favorites));
        this.periodButtons?.querySelectorAll<HTMLElement>('[data-period]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.period === this.period)));
        const filterCount = Number(this.filters.status !== 'all') + Number(this.filters.year !== null) + Number(this.filters.favorites);
        const badge = this.filterToggle?.querySelector<HTMLElement>('.lb-stat-filter-count'); if (badge) { badge.textContent = String(filterCount); badge.hidden = !filterCount; }
        const activeFilters = this.filters.type !== 'all' || this.filters.status !== 'all' || this.filters.year !== null || this.filters.query || this.filters.favorites || this.filters.facet || this.filters.rating !== null || this.filters.completedDate || this.filters.dateRange || this.filters.countryUnknown;
        if (this.filters.facet) button(this.chips!, st(this.filters.facet.key) + ': ' + this.facetLabel(this.filters.facet.key, this.filters.facet.value), () => this.setFilter({ facet: null }), 'lb-stat-chip', 'x');
        if (this.filters.rating !== null) button(this.chips!, st('ratings') + ': ' + formatRatingValue(this.filters.rating), () => this.setFilter({ rating: null }), 'lb-stat-chip', 'x');
        if (this.filters.status !== 'all') button(this.chips!, this.statusLabel(this.filters.status), () => this.setFilter({ status: 'all' }), 'lb-stat-chip', 'x');
        if (this.filters.year !== null) button(this.chips!, st(this.filters.dateField) + ': ' + this.filters.year, () => this.setFilter({ year: null }), 'lb-stat-chip', 'x');
        if (this.filters.favorites) button(this.chips!, st('favorites'), () => this.setFilter({ favorites: false }), 'lb-stat-chip', 'x');
        if (this.filters.countryUnknown) button(this.chips!, st('noCountryTitles'), () => this.setFilter({ countryUnknown: false }), 'lb-stat-chip', 'x');
        if (this.filters.completedDate) button(this.chips!, st('finished') + ': ' + this.historyDateLabel(this.filters.completedDate), () => this.setFilter({ completedDate: null }), 'lb-stat-chip', 'x');
        this.chips?.querySelectorAll<HTMLButtonElement>('.lb-stat-chip').forEach(chip => { chip.title = st('removeFilter') + ': ' + chip.textContent; chip.setAttribute('aria-label', chip.title); });
        if (this.filters.dateRange) button(this.chips!, st(this.filters.dateField) + ': ' + this.date(this.filters.dateRange.from) + ' — ' + this.date(this.filters.dateRange.to), () => { this.period = 'all'; this.setFilter({ dateRange: null }); }, 'lb-stat-chip', 'x');
        if (activeFilters) button(this.chips!, st('reset'), () => { this.filters = defaultStatFilters(); this.period = 'all'; this.titlePage = 0; this.randomPath = ''; if (this.search) this.search.value = ''; this.redraw(); if (this.body) this.body.scrollTop = 0; }, 'lb-stat-reset', 'rotate-ccw');
        const rows = filterStatRecords(this.library.records, this.filters), summary = summarizeStatRecords(rows);
        this.renderTabs(rows.length);
        if (this.pageHint) this.pageHint.textContent = st(this.page === 'overview' ? 'overviewHint' : this.page === 'insights' ? 'insightsHint' : 'titlesHint');
        if (this.loading) { el(this.body, 'div', 'lb-stat-empty', st('loading')); return; }
        if (this.error || this.library.failedTypes.length === STAT_MEDIA.length) { el(this.body, 'div', 'lb-stat-empty', st('error')); return; }
        if (this.saveError) el(this.body, 'p', 'lb-stat-warning', st('saveFailed'));
        if (this.library.failedTypes.length) el(this.body, 'p', 'lb-stat-warning', st('partial') + ': ' + this.library.failedTypes.map(statMediaLabel).join(', '));
        const scale = rows.reduce((max, row) => Math.max(max, row.item.userRating ?? 0), getRatingMax(this.settings().ratingScale));
        const layoutToggle = this.contentEl.querySelector<HTMLButtonElement>('.lb-stat-layout-toggle'); if (layoutToggle) { layoutToggle.querySelector('span:last-child')!.textContent = st(this.editingLayout ? 'layoutDone' : 'layoutEdit'); layoutToggle.setAttribute('aria-pressed', String(this.editingLayout)); layoutToggle.hidden = this.page === 'titles'; }
        if (this.page === 'titles') { this.renderTitles(rows); return; }
        if (this.editingLayout) el(this.body, 'p', 'lb-stat-layout-hint', st('layoutHint'));
        const grid = el(this.body, 'div', 'lb-stat-workspace');
        if (this.page === 'overview') {
            if (this.visible('summary')) {
                const ratings=statisticsRatingSummary(rows);
                this.widget(grid,'kpi-total',host=>this.kpi(host,st('total'),number(summary.total),number(summary.active)+' · '+st('active').toLocaleLowerCase(i18n.getLanguage()),'library-big'),0.5);
                this.widget(grid,'kpi-completed',host=>this.kpi(host,st('completed'),(summary.total?Math.round(summary.completed/summary.total*100):0)+'%',number(summary.completed)+' '+st('of')+' '+number(summary.total),'circle-check'),0.5);
                this.widget(grid,'kpi-rating',host=>this.kpi(host,st('average'),summary.average===null?'—':number(summary.average),number(summary.rated)+' '+st('rated')+' · / '+scale+(ratings.median!==null?' · '+st('median')+' '+number(ratings.median):''),'star'),0.5);
                this.widget(grid,'kpi-favorites',host=>this.kpi(host,st('favorites'),number(rows.filter(row=>row.item.favorite).length),st('scope'),'heart'),0.5);
            }
            if (this.visible('distribution')) {
                this.widget(grid, 'statuses', host => this.renderDistribution(host, rows, scale, 'statuses'));
                this.widget(grid, 'ratings', host => this.renderDistribution(host, rows, scale, 'ratings'));
            }
            if (this.visible('journey')) this.widget(grid, 'journey', host => {
                const panel = this.panel(host, st('calendarMonth'), 'calendar-days'); panel.classList.add('lb-stat-calendar-compact'); this.renderCalendar(panel, rows, true);
            });
            if (this.visible('preferences')) this.widget(grid, 'preferences', host => this.renderOverviewGenres(host, rows));
            if (this.visible('time')) this.widget(grid, 'time', host => this.renderTime(rows, host), 2);
            if (this.visible('geography')) this.widget(grid, 'geography', host => this.renderGeography(rows, host), 2);
            if (this.visible('quality')) this.widget(grid, 'quality', host => this.renderQuality(rows, host), 2);
        } else {
            if (this.visible('media')) this.widget(grid, 'media', host => this.renderMedia(host), 2);
            if (this.visible('timeline')) this.widget(grid, 'timeline', host => this.renderTimeline(host, rows));
            if (this.visible('continue')) this.widget(grid, 'continue', host => this.renderContinue(rows, host));
            if (this.visible('preferences')) this.widget(grid, 'preferences', host => this.renderRanks(rows, host), 2);

        }
        if (!rows.length) el(this.body, 'div', 'lb-stat-empty', st('empty'));
        else if (!grid.childElementCount) el(this.body, 'div', 'lb-stat-empty', st('hiddenBlocks'));
    }
    private kpi(host: HTMLElement, label: string, value: string, detail: string, symbol: string): void {
        const card = el(host, 'div', 'lb-stat-kpi'); card.dataset.metric = symbol; const heading = el(card, 'div', 'lb-stat-kpi-label'); icon(heading, symbol); el(heading, 'span', '', label); el(card, 'strong', '', value); el(card, 'small', '', detail);
        if (symbol === 'clock-3') card.title = st('timeHint');
    }
    private panel(host: HTMLElement, title: string, symbol: string): HTMLElement {
        const panel = el(host, 'section', 'lb-stat-panel'); const heading = el(panel, 'div', 'lb-stat-panel-heading'); icon(heading, symbol); if (title) el(heading, 'h3', '', title); return panel;
    }
    private facetLabel(facet: StatFacet, value: string): string { return facet === 'countries' ? statisticsCountryLabel(value, i18n.getLanguage()) : value; }
    private showInsights(anchor?: string): void {
        this.page = 'insights'; this.redraw();
        if (anchor) this.body?.querySelector(anchor)?.scrollIntoView({ block: 'start' }); else if (this.body) this.body.scrollTop = 0;
    }
    private renderOverviewGenres(host: HTMLElement, rows: StatRecord[]): void {
        const panel = this.panel(host, st('overviewGenres'), 'tags'); panel.classList.add('lb-stat-genre-summary');
        const grid = el(panel, 'div', 'lb-stat-genre-tiles');
        const ranks = rankStatRecords(rows, 'genres').slice(0, 4);
        for (const rank of ranks) {
            const entry = button(grid, '', () => this.openTitles({ facet: { key: 'genres', value: rank.name } }), 'lb-stat-genre-tile');
            el(entry, 'strong', 'lb-stat-genre-name', rank.name);
            const track=el(entry,'span','lb-stat-genre-meter');el(track,'span').style.width=rank.count/Math.max(1,ranks[0].count)*100+'%';
            el(entry,'span','lb-stat-genre-measure',(rank.average!==null?'★ '+number(rank.average)+' · ':'')+st('total')+': '+number(rank.count));
            entry.title=st('openTitles')+': '+rank.name+(rank.rated?' · '+rank.rated+' '+st('rated'):'');
        }
        if(!ranks.length)el(grid,'p','lb-stat-empty',st('noData'));
        button(panel,st('exploreInterests'),()=>this.showInsights('.lb-stat-preferences'),'lb-stat-text-link','arrow-right');
    }
    private renderGeography(rows: StatRecord[], host = this.body!): void {
        const panel = this.panel(host, st('geography'), 'globe-2'); panel.classList.add('lb-stat-geography');
        const known = rows.filter(row => row.facets.countries.length > 0).length;
        const stats = el(panel, 'div', 'lb-stat-map-stats');
        const ranks = rankStatRecords(rows, 'countries'), counts = new Map(ranks.map(rank => [rank.name, rank.count]));
        el(stats, 'strong', '', st('countries') + ': ' + ranks.length);
        el(stats, 'span', '', st('countryCoverage') + ': ' + known + ' / ' + rows.length);
        if (known < rows.length) button(stats, st('unknownCountry') + ': ' + (rows.length - known), () => this.openTitles({ countryUnknown: true, facet: null }), 'lb-stat-text-link', 'arrow-right');
        const layout = el(panel, 'div', 'lb-stat-map-layout'), map = el(layout, 'div', 'lb-stat-map');
        const label = el(map, 'div', 'lb-stat-map-label', st('geographyHint')); label.setAttribute('aria-live', 'polite');
        const svg = map.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 1000 470'); svg.setAttribute('role', 'group'); svg.setAttribute('aria-label', st('geography')); map.appendChild(svg);
        const group = map.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g'); svg.appendChild(group);
        const controls = el(map, 'div', 'lb-stat-map-controls');
        const update = () => { this.mapView = boundedMapView(this.mapView); const { x, y, scale } = this.mapView; group.setAttribute('transform', 'translate(' + x + ' ' + y + ') scale(' + scale + ')'); zoomLabel.textContent = Math.round(scale * 100) + '%'; zoomIn.disabled = scale >= 6; zoomOut.disabled = scale <= 1; };
        const zoomOut = button(controls, '', () => { this.mapView = zoomMap(this.mapView, 1 / 1.4); update(); }, '', 'minus'); zoomOut.setAttribute('aria-label', st('zoomOut'));
        const zoomLabel = el(controls, 'span', 'lb-stat-map-zoom');
        const zoomIn = button(controls, '', () => { this.mapView = zoomMap(this.mapView, 1.4); update(); }, '', 'plus'); zoomIn.setAttribute('aria-label', st('zoomIn'));
        button(controls, st('resetMap'), () => { this.mapView = { x: 0, y: 0, scale: 1 }; update(); }, '', 'maximize');
        el(map, 'small', 'lb-stat-map-navigation-hint', st('mapNavigation')); update();
        let drag: { id: number; x: number; y: number; originX: number; originY: number } | null = null;
        svg.addEventListener('pointerdown', event => { if (event.button !== 0) return; this.mapMoved = false; drag = { id: event.pointerId, x: event.clientX, y: event.clientY, originX: this.mapView.x, originY: this.mapView.y }; });
        svg.addEventListener('pointermove', event => { if (!drag || drag.id !== event.pointerId) return; const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
            if (Math.hypot(dx,dy) > 4) { this.mapMoved = true; svg.setPointerCapture?.(event.pointerId); }
            if (this.mapMoved) { const rect = svg.getBoundingClientRect(); this.mapView = { ...this.mapView, x: drag.originX + dx / Math.max(.01,Math.min(rect.width / 1000, rect.height / 470)), y: drag.originY + dy / Math.max(.01,Math.min(rect.width / 1000, rect.height / 470)) }; update(); }
        });
        const endDrag = () => { drag = null; }; svg.addEventListener('pointerup', endDrag); svg.addEventListener('pointercancel', endDrag);
        svg.addEventListener('wheel', event => { if (!event.ctrlKey) return; event.preventDefault(); const rect = svg.getBoundingClientRect(), factor = Math.max(.01,Math.min(rect.width / 1000, rect.height / 470)); this.mapView = zoomMap(this.mapView, event.deltaY < 0 ? 1.15 : 1 / 1.15, (event.clientX - rect.left - (rect.width - 1000 * factor) / 2) / factor, (event.clientY - rect.top - (rect.height - 470 * factor) / 2) / factor); update(); }, { passive: false });
        const max = Math.max(1, ...counts.values());
        for (const country of STAT_WORLD) {
            const path = map.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', country.path); path.classList.add('lb-stat-map-country');
            const count = counts.get(country.code) ?? 0;
            const name = country.code.length === 2 ? statisticsCountryLabel(country.code, i18n.getLanguage()) : country.name;
            path.dataset.level = String(count ? Math.ceil(count / max * 4) : 0);
            const title = map.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'title'); title.textContent = name + ': ' + count; path.appendChild(title);
            if (count) {
                path.setAttribute('role', 'button'); path.setAttribute('tabindex', '0'); path.setAttribute('aria-label', st('openTitles') + ': ' + name + ' · ' + count);
                const open = () => { if (!this.mapMoved) this.openTitles({ facet: { key: 'countries', value: country.code } }); };
                path.addEventListener('click', open); path.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.mapMoved = false; open(); } });
                const show = () => { label.textContent = name + ' · ' + count + ' · ' + st('titleCount'); };
                path.addEventListener('pointerenter', show); path.addEventListener('focus', show);
            } else path.setAttribute('aria-hidden', 'true');
            group.appendChild(path);
        }
        const list = el(layout, 'div', 'lb-stat-country-list');
        for (const rank of ranks.slice(0, this.countryLimit)) {
            const entry = button(list, '', () => this.openTitles({ facet: { key: 'countries', value: rank.name } }), 'lb-stat-country-row');
            el(entry, 'span', '', statisticsCountryLabel(rank.name, i18n.getLanguage())); el(entry, 'strong', '', String(rank.count)); icon(entry, 'arrow-up-right');
        }
        if (ranks.length > this.countryLimit) button(list, st('showMore'), () => { this.countryLimit += 8; this.redraw(); }, 'lb-stat-show-more');
        if (!known) el(list, 'p', 'lb-stat-section-note', st('noCountries'));
        const footer = el(panel, 'div', 'lb-stat-map-footer'); el(footer, 'span', '', st('coProductions'));
        const credit = el(footer, 'a', '', st('mapSource')); credit.href = 'https://data-gis.unep-wcmc.org/server/rest/services/Hosted/UN_Boundaries/MapServer/6'; credit.target = '_blank'; credit.rel = 'noopener noreferrer';
    }
    private renderMedia(host = this.body!): void {
        const context = filterStatRecords(this.library.records, this.filters); if (!context.length) return;
        const panel = this.panel(host, st('composition'), 'library-big'); panel.classList.add('lb-stat-collection');
        const layout = el(panel, 'div', 'lb-stat-collection-layout');
        const visual = el(layout, 'div', 'lb-stat-composition');
        const donut = el(visual, 'div', 'lb-stat-donut'); donut.setAttribute('role', 'group');
        const segments: DonutSegment[] = [], descriptions: string[] = [];
        for (const type of STAT_MEDIA) {
            const count = context.filter(row => row.item.type === type).length; if (!count) continue;
            segments.push({value: count, color: mediaColor(type), label: statMediaLabel(type) + ': ' + count, onSelect: () => this.openTitles({type})});
            descriptions.push(`${statMediaLabel(type)}: ${count}`);
        }
        renderStatisticsDonut(donut, segments);
        donut.setAttribute('aria-label', st('collectionShare') + ': ' + (descriptions.join(', ') || '0'));
        const center = el(donut, 'div'); el(center, 'strong', '', number(context.length)); el(center, 'span', '', st('titleCount'));
        el(visual, 'strong', 'lb-stat-chart-caption', st('collectionShare'));
        const grid = el(layout, 'div', 'lb-stat-media'); grid.classList.toggle('is-single', new Set(context.map(row => row.item.type)).size === 1);
        for (const type of STAT_MEDIA) {
            const rows = context.filter(row => row.item.type === type), completed = rows.filter(row => row.status === 'completed').length;
            if (!rows.length) continue;
            const card = el(grid, 'article', 'lb-stat-media-card'); card.style.setProperty('--stat-color', mediaColor(type));
            const info = el(card, 'div', 'lb-stat-media-name'); icon(info, MEDIA_ICONS[type]); el(info, 'strong', '', statMediaLabel(type));
            el(info, 'span', '', st('total') + ': ' + number(rows.length) + ' · ' + (context.length ? Math.round(rows.length / context.length * 100) : 0) + '%');
            const line = el(card, 'div', 'lb-stat-media-progress');
            el(line, 'span', '', st('completedOf') + ' ' + number(completed) + ' ' + st('of') + ' ' + number(rows.length));
            const link = button(line, st('openTitles'), () => this.openTitles({ type }), 'lb-stat-media-link', 'arrow-right'); link.disabled = !rows.length;
            link.setAttribute('aria-label', st('openTitles') + ': ' + statMediaLabel(type));
            const track = el(card, 'div', 'lb-stat-media-track'); const fill = el(track, 'span'); fill.style.width = (rows.length ? completed / rows.length * 100 : 0) + '%'; track.title = st('completionProgress');
        }
        el(panel, 'p', 'lb-stat-section-note', st('completionMeaning'));
        const genres = rankStatRecords(context, 'genres').slice(0, 3);
        if (genres.length) {
            const interests = el(panel, 'div', 'lb-stat-interest-strip'); el(interests, 'span', '', st('topGenres'));
            for (const genre of genres) button(interests, genre.name + ' · ' + number(genre.count), () => this.openTitles({ facet: { key: 'genres', value: genre.name } }), 'lb-stat-interest-chip', 'arrow-up-right');
            if (this.visible('preferences')) button(interests, st('exploreInterests'), () => this.showInsights('.lb-stat-preferences'), 'lb-stat-text-link', 'arrow-right');
        }
    }
    private renderTime(rows: StatRecord[], host = this.body!): void {
        const panel=this.panel(host,st('time'),'clock-3');panel.classList.add('lb-stat-time-panel');
        const groups=statisticsTimeByMedia(rows);
        const layout=el(panel,'div','lb-stat-time-overview');
        const visual=el(layout,'div','lb-stat-composition lb-stat-time-visual');
        const donut=el(visual,'div','lb-stat-donut lb-stat-time-donut');donut.setAttribute('role','group');
        const timedGroups=groups.filter(group=>!group.reading&&group.minutes!==null&&group.minutes>0);
        const totalMinutes=timedGroups.reduce((sum,group)=>sum+group.minutes!,0);
        const segments:DonutSegment[]=timedGroups.map(group=>({
            value:group.minutes!,color:mediaColor(group.type),label:statMediaLabel(group.type)+': '+time(group.minutes!),
            onSelect:()=>{this.timeMedia=group.type;show();},
        }));
        renderStatisticsDonut(donut,segments);
        donut.setAttribute('aria-label',st('timeShare')+': '+(segments.map(segment=>segment.label).join(', ')||st('noData')));
        const center=el(donut,'div');el(center,'strong','',number(totalMinutes/60));el(center,'span','',st('hour'));
        el(visual,'strong','lb-stat-chart-caption',st('timeShare'));
        const grid=el(layout,'div','lb-stat-time-sources');
        const source=(type:MediaType):StatsText => type==='game'?'gameTimeFormula':type==='music'?'musicTimeFormula':type==='book'||type==='manga'?'readingFormula':type==='movie'?'filmTimeFormula':'episodeTimeFormula';
        if(!groups.some(group=>group.type===this.timeMedia)&&groups.length)this.timeMedia=groups[0].type;
        for(const group of groups){
            const card=button(grid,'',()=>{this.timeMedia=group.type;show();},'lb-stat-time-source');card.dataset.media=group.type;
            card.style.setProperty('--source-color',mediaColor(group.type));
            card.setAttribute('aria-label',statMediaLabel(group.type)+' · '+st('timeBreakdown'));
            const heading=el(card,'span','lb-stat-time-source-heading');icon(heading,MEDIA_ICONS[group.type]);el(heading,'strong','',statMediaLabel(group.type));
            el(heading,'span','lb-stat-time-source-total',group.reading?number(group.current)+' '+st(group.type==='book'?'pageUnit':'chapterUnit'):group.minutes===null?'—':time(group.minutes));
            const share=group.minutes===null||!totalMinutes?null:group.minutes/totalMinutes*100;
            el(card,'span','lb-stat-time-source-note',group.reading?st('readingProgressOnly'):share===null?st('missing'):(share>0&&share<1?'<1':number(share))+'% · '+st(group.type==='game'?'recorded':'estimated'));
            if(!group.reading){const track=el(card,'span','lb-stat-time-share-track');el(track,'span').style.width=(share??0)+'%';}
        }
        el(panel,'p','lb-stat-time-chart-note',st('timeShareHint'));
        const breakdown=el(panel,'div','lb-stat-time-breakdown');
        const details=el(panel,'details','lb-stat-time-details lb-stat-disclosure');details.open=this.timeExpanded;
        const trigger=el(details,'summary');el(trigger,'span','',st('howCalculated'));icon(trigger,'chevron-down');
        const formula=el(details,'p','lb-stat-time-formula');
        el(details,'p','lb-stat-time-scope',st('selectedTimeScope'));
        details.addEventListener('toggle',()=>{this.timeExpanded=details.open;});
        const show=()=>{
            breakdown.replaceChildren();grid.querySelectorAll<HTMLButtonElement>('button').forEach(control=>control.setAttribute('aria-pressed',String(control.dataset.media===this.timeMedia)));
            const group=groups.find(group=>group.type===this.timeMedia);if(!group)return;
            const card=el(breakdown,'article','lb-stat-time-explanation');card.dataset.media=group.type;
            card.style.setProperty('--source-color',mediaColor(group.type));
            const metric=el(card,'div','lb-stat-time-metric');
            el(metric,'span','lb-stat-source-basis',st(group.reading?'progress':group.type==='game'?'played':group.type==='music'?'listened':'watched'));
            const display=el(metric,'b','lb-stat-source-value',group.reading?number(group.current)+' '+st(group.type==='book'?'pageUnit':'chapterUnit'):group.minutes===null?'—':time(group.minutes));
            if(!group.reading&&group.minutes!==null){
                display.replaceChildren();const minutes=Math.round(group.minutes),hours=Math.floor(minutes/60);
                if(hours){const part=el(display,'span','',number(hours));el(part,'small','',' '+st('hour'));}
                if(!hours||minutes%60){const part=el(display,'span','',String(minutes%60));el(part,'small','',' '+st('minute'));}
            }
            el(metric,'small','lb-stat-source-basis',st(group.reading?'progress':group.type==='game'?'recorded':'estimated'));
            const facts=el(card,'div','lb-stat-time-facts');
            if(group.reading){
                el(facts,'strong','',number(group.current)+(group.total!==null?' / '+number(group.total):'')+' '+st(group.type==='book'?'pageUnit':'chapterUnit'));
                if(group.total!==null&&group.total>0){const track=el(facts,'div','lb-stat-reading-track');el(track,'span').style.width=Math.min(100,group.current/group.total*100)+'%';}
            }else{
                el(facts,'span','',st('timeKnown')+': '+group.known+' / '+group.count);
                if(group.type==='anime'||group.type==='series')el(facts,'strong','',number(group.episodeCount)+' '+st('episodeUnit'));
                if(group.type==='music')el(facts,'strong','',number(group.trackCount)+' '+st('tracksUnit'));
                if(group.type==='game'&&group.summary.achievementTotal)el(facts,'strong','',st('achievements')+': '+group.summary.achievements+' / '+group.summary.achievementTotal);
                if(group.remaining!==null)el(facts,'span','',st('remaining')+': '+(group.summary.remainingUnknown?'≈ ':'')+time(group.remaining)+(group.summary.remainingUnknown?' · '+st('missing')+': '+group.summary.remainingUnknown:''));
            }
            if(group.unknown)el(facts,'span','lb-stat-source-missing',st('missing')+': '+group.unknown);
            button(facts,st('viewTitles')+' · '+group.count,()=>this.openTitles({type:group.type}),'lb-stat-text-link','arrow-right');
            formula.textContent=st(source(group.type));
        };show();
    }
    private renderTimeline(host: HTMLElement, rows: StatRecord[]): void {
        const panel = this.panel(host, st('timeline'), 'chart-column'); panel.classList.add('lb-stat-timeline-panel');
        this.choice(panel.querySelector<HTMLElement>('.lb-stat-panel-heading')!, st('timeline'), [['month', st('month')], ['year', st('byYear')]], this.timeline, value => { this.timeline = value as 'month' | 'year'; this.redraw(); }).parentElement.classList.add('is-inline');
        const events=deletionSelection(normalizeStatisticsDeletions(this.settings().statisticsDeletions),this.filters);
        const bins = statisticsTimelineWithDeletions(rows,events,this.timeline,this.filters.year), max = Math.max(1, ...bins.flatMap(bin => [bin.added, bin.finished, bin.deleted]));
        const legend = el(panel, 'div', 'lb-stat-legend'); el(legend, 'span', 'is-added', st('added')); el(legend, 'span', 'is-finished', st('finished')); el(legend,'span','is-deleted',st('deleted'));
        if (this.timeline === 'month') el(legend, 'small', '', this.filters.year !== null ? String(this.filters.year) : st('lastMonths'));
        const plot = el(panel, 'div', 'lb-stat-timeline'); plot.setAttribute('role', 'group'); plot.setAttribute('aria-label', st('timeline'));
        if (!bins.length) el(plot, 'div', 'lb-stat-empty', st('noData'));
        for (const bin of bins) {
            const column = el(plot, 'div', 'lb-stat-time-column'); column.title = `${bin.key}: ${st('added')} ${bin.added} · ${st('finished')} ${bin.finished} · ${st('deleted')} ${bin.deleted}`;
            column.setAttribute('role', 'img'); column.setAttribute('aria-label', column.title); const bars = el(column, 'div', 'lb-stat-time-bars');
            for (const field of ['added', 'finished', 'deleted'] as const) { const bar = el(bars, 'span', `is-${field}`); bar.style.height = `${bin[field] / max * 100}%`; }
            el(column, 'small', '', this.timeline === 'year' ? bin.key : new Intl.DateTimeFormat(i18n.getLanguage(), { month: 'short' }).format(new Date(`${bin.key}-01T12:00:00`)));
        }
        if(this.settings().statisticsDeletionStarted)el(panel,'p','lb-stat-tracking-since',st('deletionTracking')+' '+this.date(this.settings().statisticsDeletionStarted!));
        const help = el(panel, 'details', 'lb-stat-explanation'); el(help, 'summary', '', st('howCalculated')); el(help, 'p', 'lb-stat-note', st('timelineHint'));
    }
    private renderDistribution(host: HTMLElement, rows: StatRecord[], scale: number, part: 'all' | 'statuses' | 'ratings' = 'all'): void {
        const panel=this.panel(host,st(part==='ratings'?'ratings':'statuses'),part==='ratings'?'star':'chart-bar');panel.classList.add('lb-stat-distribution');
        if(part!=='ratings'){
            const groups=[...new Set(rows.map(row=>row.status))].map(status=>({status,rows:rows.filter(row=>row.status===status)})).sort((a,b)=>b.rows.length-a.rows.length);
            const visual=el(panel,'div','lb-stat-status-overview'),ring=el(visual,'div','lb-stat-status-ring'),list=el(visual,'div','lb-stat-statuses');
            const segments:DonutSegment[]=[];
            for(const group of groups){const sample=group.rows[0],appearance=getStatusAppearance(sample.item.type,sample.item.status),count=group.rows.length,percent=rows.length?count/rows.length*100:0;
                segments.push({value:count,color:`color-mix(in srgb,${appearance.color} 85%,var(--text-normal))`,label:this.statusLabel(group.status)+': '+count,onSelect:()=>this.openTitles({status:group.status})});
                const line=button(list,'',()=>this.openTitles({status:group.status}),'lb-stat-bar-row');line.style.setProperty('--status-color',appearance.color);
                icon(line,appearance.icon);
                el(line,'span','lb-stat-bar-label',this.statusLabel(group.status));el(line,'strong','',number(count));el(line,'small','',percent<1?'<1%':Math.round(percent)+'%');
            }
            renderStatisticsDonut(ring,segments);
            ring.setAttribute('role','group');ring.setAttribute('aria-label',st('statuses')+': '+rows.length);
            const center=el(ring,'div');el(center,'strong','',number(rows.length));el(center,'small','',st('titleCount'));
            if(!rows.length)el(panel,'p','lb-stat-empty',st('empty'));
            this.distributionDetails(panel,rows,scale,'status');
            if(part==='statuses')return;
        }
        const rated=rows.filter(row=>(row.item.userRating??0)>0),summary=statisticsRatingSummary(rows);
        const headline=el(panel,'div','lb-stat-rating-headline');
        el(headline,'strong','',rated.length?number(rated.reduce((sum,row)=>sum+row.item.userRating!,0)/rated.length):'—');
        el(headline,'span','','/ '+scale+' · '+rated.length+' '+st('rated')+(summary.median!==null?' · '+st('median')+' '+number(summary.median):''));
        const ratings=el(panel,'div','lb-stat-ratings');
        const values=[...new Set([...getRatingValues(this.settings().ratingScale).filter(Number.isInteger),...rated.map(row=>row.item.userRating!)])].filter(value=>value>0&&value<=scale).sort((a,b)=>a-b);
        const max=Math.max(1,...values.map(value=>rated.filter(row=>row.item.userRating===value).length));
        for(const value of values){const count=rated.filter(row=>row.item.userRating===value).length,cell=button(ratings,'',()=>this.openTitles({rating:value}),'lb-stat-rating');
            cell.disabled=!count;cell.title=formatRatingValue(value)+': '+count;cell.setAttribute('aria-label',cell.title);cell.style.setProperty('--score-color',this.ratingColor(value,scale));
            el(cell,'small','',count?number(count):'');el(cell,'span').style.height=`calc(var(--stat-chart-height, 90px) * ${count/max})`;el(cell,'strong','',formatRatingValue(value));
        }
        if(!rated.length)el(panel,'p','lb-stat-section-note',st('missingRating'));
        this.distributionDetails(panel,rows,scale,'rating');
    }
    private ratingColor(_value:number,_scale:number):string{return 'var(--text-normal)';}
    private distributionDetails(panel: HTMLElement, rows: StatRecord[], scale: number, mode: 'status' | 'rating'): void {
        const details=el(panel,'details','lb-stat-distribution-details lb-stat-disclosure'),trigger=el(details,'summary');icon(trigger,'layout-grid');el(trigger,'span','',st('byMedia'));icon(trigger,'chevron-down');
        const grid=el(details,'div','lb-stat-media-breakdown'),tabs=el(grid,'div','lb-stat-breakdown-tabs'),body=el(grid,'div','lb-stat-breakdown-body');
        const types=STAT_MEDIA.filter(type=>rows.some(row=>row.item.type===type&&(mode==='status'||(row.item.userRating??0)>0)));
        const show=(type:MediaType)=>{
            body.replaceChildren();tabs.querySelectorAll<HTMLButtonElement>('button').forEach(control=>control.setAttribute('aria-pressed',String(control.dataset.media===type)));
            const group=rows.filter(row=>row.item.type===type),rated=group.filter(row=>(row.item.userRating??0)>0);
            const card=el(body,'article','lb-stat-media-breakdown-card');card.style.setProperty('--source-color',mediaColor(type));
            const heading=el(card,'div','lb-stat-breakdown-heading');icon(heading,MEDIA_ICONS[type]);el(heading,'strong','',statMediaLabel(type));
            if(mode==='status'){
                const bar=el(card,'div','lb-stat-breakdown-stack');
                for(const status of [...new Set(group.map(row=>row.status))]){const matching=group.filter(row=>row.status===status),color=getStatusAppearance(type,matching[0].item.status).color;
                    const segment=el(bar,'span');segment.style.width=matching.length/group.length*100+'%';segment.style.background=color;segment.title=this.statusLabel(status)+': '+matching.length;
                    const chip=button(card,'',()=>this.openTitles({type,status}),'lb-stat-breakdown-chip');chip.style.setProperty('--status-color',color);el(chip,'span','',this.statusLabel(status));el(chip,'strong','',String(matching.length));
                }
            }else{
                const mean=rated.reduce((sum,row)=>sum+row.item.userRating!,0)/rated.length;
                const value=button(card,number(mean)+' / '+scale,()=>this.openTitles({type}),'lb-stat-breakdown-average');value.style.color=this.ratingColor(mean,scale);
                el(card,'small','',rated.length+' '+st('rated'));
            }
        };
        for(const type of types){const control=button(tabs,statMediaLabel(type),()=>show(type),'',MEDIA_ICONS[type]);control.dataset.media=type;control.style.setProperty('--tab-color',mediaColor(type));}
        if(types.length)show(types[0]);else el(body,'p','lb-stat-section-note',st('noData'));
    }
    private renderRanks(rows: StatRecord[], host = this.body!): void {
        const panel=this.panel(host,st('rankings'),'tags');panel.classList.add('lb-stat-preferences');
        const controls=el(panel,'div','lb-stat-rank-controls'),modes=el(controls,'div','lb-stat-segments');
        for(const order of ['count','rating'] as const){const control=button(modes,st(order==='count'?'byCount':'byRating'),()=>this.changePreferences({rankOrder:order},false));control.setAttribute('aria-pressed',String(this.preferences.rankOrder===order));}
        const add=button(controls,st('addColumn'),()=>{this.changePreferences({rankColumns:[...this.preferences.rankColumns,STAT_FACETS.find(facet=>!this.preferences.rankColumns.includes(facet))??'genres']},false);},'lb-stat-add-column','plus');add.disabled=this.preferences.rankColumns.length>=8;
        const columns=el(panel,'div','lb-stat-facet-columns');
        this.preferences.rankColumns.forEach((facet,index)=>{
            const card=el(columns,'section','lb-stat-facet-column');card.dataset.facet=facet;
            const heading=el(card,'div','lb-stat-facet-heading');
            this.choice(heading,st('rankings')+' '+(index+1),STAT_FACETS.map(key=>[key,st(key)]),facet,value=>{const rankColumns=[...this.preferences.rankColumns];rankColumns[index]=value as StatFacet;this.rankLimits.delete(index);this.changePreferences({rankColumns,rankFacet:rankColumns[0]},false);}).parentElement.classList.add('is-inline');
            const remove=button(heading,'',()=>{this.rankLimits.clear();this.changePreferences({rankColumns:this.preferences.rankColumns.filter((_,i)=>i!==index)},false);},'lb-stat-remove-column','x');remove.setAttribute('aria-label',st('removeColumn')+' '+(index+1));remove.disabled=this.preferences.rankColumns.length===1;
            const ranks=rankStatRecords(rows,facet,this.preferences.rankOrder),limit=this.rankLimits.get(index)??6;
            const list=el(card,'div','lb-stat-facet-list');
            if(!ranks.length)el(list,'p','lb-stat-empty',st('noData'));
            const max=Math.max(1,...ranks.map(rank=>this.preferences.rankOrder==='rating'?(rank.average??0):rank.count));
            ranks.slice(0,limit).forEach(rank=>{
                const row=button(list,'',()=>this.openTitles({facet:{key:facet,value:rank.name}}),'lb-stat-rank-row');row.setAttribute('aria-label',rank.name+': '+rank.count+' · '+st('viewTitles'));
                el(row,'span','lb-stat-facet-name',this.facetLabel(facet,rank.name));el(row,'b','',number(rank.count));el(row,'small','',rank.average!==null?number(rank.average)+' ★':'—');
                const track=el(row,'span','lb-stat-facet-meter');el(track,'span').style.width=(this.preferences.rankOrder==='rating'?(rank.average??0):rank.count)/max*100+'%';
                row.title=rank.name+(rank.rated?' · '+rank.rated+' '+st('rated'):'');
            });
            if(ranks.length>limit)button(card,st('showMore')+' · '+(ranks.length-limit),()=>{this.rankLimits.set(index,limit+6);this.redraw();},'lb-stat-show-more','chevron-down');
        });
    }
    private renderContinue(rows: StatRecord[], host = this.body!): void {
        const panel=this.panel(host,st('currentShelf'),'library');panel.classList.add('lb-stat-continue');
        const recent=rows.filter(row=>row.status==='active').sort((a,b)=>(b.added??0)-(a.added??0));
        const list=el(panel,'div','lb-stat-continue-list');this.titleRows(list,recent.slice(0,3));
        if(!recent.length)el(list,'p','lb-stat-empty',st('noData'));
        if(recent.length)button(panel,st('viewTitles')+' · '+recent.length,()=>this.openTitles({status:'active'}),'lb-stat-text-link','arrow-right');
    }
    private renderCalendar(panel: HTMLElement, rows: StatRecord[], _compact=false): void {
        const modes=el(panel,'div','lb-stat-calendar-modes lb-stat-segments');modes.setAttribute('aria-label',st('calendarModes'));
        for(const view of ['month','activity','year'] as const){const control=button(modes,st(view==='month'?'monthView':view==='year'?'yearView':'activityView'),()=>this.changePreferences({calendarView:view},false));control.setAttribute('aria-pressed',String(this.preferences.calendarView===view));}
        const now=new Date(),date=new Date(this.filters.year??now.getFullYear(),(this.filters.year===null?now.getMonth():11)+this.calendarOffset,1),year=date.getFullYear(),month=date.getMonth();
        if(this.preferences.calendarView==='activity'){this.renderActivityCalendar(panel,rows,year,month);return;}
        const nav=el(panel,'div','lb-stat-month-nav');
        const step=this.preferences.calendarView==='year'?12:1;
        button(nav,'',()=>{this.calendarOffset-=step;this.redraw();},'','chevron-left').setAttribute('aria-label',st('previous'));
        el(nav,'strong','',this.preferences.calendarView==='year'?String(year):new Intl.DateTimeFormat(i18n.getLanguage(),{month:'long',year:'numeric'}).format(date));
        button(nav,'',()=>{this.calendarOffset+=step;this.redraw();},'','chevron-right').setAttribute('aria-label',st('next'));
        const today=button(nav,st('today'),()=>{this.calendarOffset=(now.getFullYear()-(this.filters.year??now.getFullYear()))*12+now.getMonth()-(this.filters.year===null?now.getMonth():11);this.redraw();},'lb-stat-today-control');
        today.title=this.date(now.getTime());
        if(this.preferences.calendarView==='year'){
            const grid=el(panel,'div','lb-stat-year-grid');
            for(let m=0;m<12;m++){const period=year+'-'+String(m+1).padStart(2,'0'),count=rows.filter(row=>row.status==='completed'&&(row.finishedPeriod===period||row.finished!==null&&new Date(row.finished).getFullYear()===year&&new Date(row.finished).getMonth()===m)).length;
                const cell=button(grid,'',()=>{this.calendarOffset+=(m-month);this.changePreferences({calendarView:'month'},false);},'lb-stat-year-month');
                el(cell,'span','',new Intl.DateTimeFormat(i18n.getLanguage(),{month:'short'}).format(new Date(year,m,1)));el(cell,'strong','',number(count));
                if(year===now.getFullYear()&&m===now.getMonth())cell.classList.add('is-current-month');
            }return;
        }
        el(panel,'p','lb-stat-calendar-date-hint',st('calendarDateHint'));
        const monthPeriod=year+'-'+String(month+1).padStart(2,'0');
        const records=rows.filter(row=>row.status==='completed'&&(row.finishedPeriod===monthPeriod||row.finished!==null&&new Date(row.finished).getFullYear()===year&&new Date(row.finished).getMonth()===month)).sort((a,b)=>(b.finished??0)-(a.finished??0));
        const layout=el(panel,'div','lb-stat-month-layout'),calendar=el(layout,'div','lb-stat-month-calendar');
        const labels=el(calendar,'div','lb-stat-month-weekdays');for(let d=0;d<7;d++)el(labels,'span','',new Intl.DateTimeFormat(i18n.getLanguage(),{weekday:'short'}).format(new Date(2024,0,d+1)));
        const grid=el(calendar,'div','lb-stat-month-grid');grid.setAttribute('role','group');grid.setAttribute('aria-label',st('calendarMonth'));
        for(let i=0;i<(date.getDay()+6)%7;i++)el(grid,'span','lb-stat-month-blank');
        for(let d=1;d<=new Date(year,month+1,0).getDate();d++){
            const day=new Date(year,month,d),key=statDay(day.getTime()),count=records.filter(row=>row.finished!==null&&new Date(row.finished).getDate()===d).length;
            const cell=count?button(grid,'',()=>this.openCompletionDate(key),'lb-stat-calendar-day'):el(grid,'span','lb-stat-calendar-day');el(cell,'span','lb-stat-day-number',String(d));if(count){const marker=el(cell,'strong','lb-stat-day-completions',String(count));marker.setAttribute('aria-hidden','true');}
            cell.dataset.level=count?'4':'0';cell.title=this.date(day.getTime())+': '+count+' · '+st('completed');
            if(day.toDateString()===now.toDateString()){cell.classList.add('is-today');cell.setAttribute('aria-current','date');cell.title+=' · '+st('today');}
            if(count)cell.setAttribute('aria-label',st('openTitles')+' · '+cell.title);
        }
        const todayKey=el(calendar,'div','lb-stat-month-key');el(todayKey,'span','lb-stat-today-key',st('today'));
        const events=el(layout,'div','lb-stat-month-events');el(events,'strong','lb-stat-month-total',number(records.length)+' · '+st('recentCompletions'));
        if(records.length)this.itemList(events,records.slice(0,2),row=>row.finished===null?row.finishedPeriod??'':this.date(row.finished));else el(events,'p','lb-stat-section-note',st('noMonthCompletions'));
        if(records.length)button(events,st('viewTitles')+' · '+records.length,()=>this.openCompletionDate(year+'-'+String(month+1).padStart(2,'0')),'lb-stat-text-link','arrow-right');
    }
    private renderActivityCalendar(panel: HTMLElement, rows: StatRecord[], year:number, month:number):void {
        const range=this.preferences.activityMonths;
        const end=new Date(year,month+1,0),start=new Date(year,month-range+1,1),counts=new Map<string,number>();
        for(const row of rows)if(row.status==='completed'&&row.finished!==null){const key=statDay(row.finished);counts.set(key,(counts.get(key)??0)+1);}
        const heading=el(panel,'div','lb-stat-activity-heading');
        button(heading,'',()=>{this.calendarOffset-=range;this.redraw();},'','chevron-left').setAttribute('aria-label',st('previous'));
        el(heading,'strong','',new Intl.DateTimeFormat(i18n.getLanguage(),{month:'short',year:'numeric'}).format(start)+' — '+new Intl.DateTimeFormat(i18n.getLanguage(),{month:'short',year:'numeric'}).format(end));
        button(heading,'',()=>{this.calendarOffset+=range;this.redraw();},'','chevron-right').setAttribute('aria-label',st('next'));
        const days:Array<{date:Date,count:number}|null>=Array.from({length:(start.getDay()+6)%7},()=>null);
        for(const cursor=new Date(start);cursor<=end;cursor.setDate(cursor.getDate()+1))days.push({date:new Date(cursor),count:counts.get(statDay(cursor.getTime()))??0});
        const wrapper=el(panel,'div','lb-stat-activity-wrapper'),weekdays=el(wrapper,'div','lb-stat-activity-weekdays');
        for(let d=0;d<7;d++)el(weekdays,'small','',new Intl.DateTimeFormat(i18n.getLanguage(),{weekday:'short'}).format(new Date(2024,0,d+1)));
        const grid=el(wrapper,'div','lb-stat-activity-grid');grid.style.setProperty('--activity-weeks',String(Math.ceil(days.length/7)));
        const months=el(wrapper,'div','lb-stat-activity-months');months.style.setProperty('--activity-weeks',String(Math.ceil(days.length/7)));
        days.forEach((day,index)=>{if(day?.date.getDate()===1){const label=el(months,'small','',new Intl.DateTimeFormat(i18n.getLanguage(),{month:'short'}).format(day.date));label.style.gridColumnStart=String(Math.floor(index/7)+1);}});
        const max=Math.max(1,...days.map(day=>day?.count??0));
        for(const day of days){if(!day){el(grid,'span','lb-stat-activity-blank');continue;}const key=statDay(day.date.getTime()),cell=day.count?button(grid,'',()=>this.openCompletionDate(key),'lb-stat-activity-day'):el(grid,'span','lb-stat-activity-day');
            cell.dataset.level=String(day.count?Math.ceil(day.count/max*4):0);cell.title=this.date(day.date.getTime())+': '+day.count+' · '+st('completed');
            if(day.date.toDateString()===new Date().toDateString()){cell.classList.add('is-today');cell.setAttribute('aria-current','date');cell.title+=' · '+st('today');}
            if(day.count)cell.setAttribute('aria-label',st('openTitles')+' · '+cell.title);
        }
        const footer=el(panel,'div','lb-stat-activity-footer');el(footer,'span','',days.reduce((sum,day)=>sum+(day?.count??0),0)+' · '+st('completed'));
        if(days.some(day=>day?.date.toDateString()===new Date().toDateString()))el(footer,'span','lb-stat-today-key',st('today'));
        const legend=el(footer,'div','lb-stat-calendar-legend');el(legend,'small','',st('less'));for(let level=0;level<5;level++)el(legend,'span').dataset.level=String(level);el(legend,'small','',st('more'));
        el(panel,'p','lb-stat-calendar-date-hint',st('calendarActivityHint'));
    }
    private openCompletionDate(date: string): void { this.titleSort = 'finished'; this.openTitles({ status: 'completed', completedDate: date }); }
    private historyDateLabel(value: string): string {
        return new Intl.DateTimeFormat(i18n.getLanguage(), value.length === 7 ? { year: 'numeric', month: 'long' } : { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(value.length === 7 ? value + '-01T12:00:00' : value + 'T12:00:00'));
    }
    private renderQuality(rows: StatRecord[], host = this.body!): void {
        const summary = summarizeStatRecords(rows), panel = el(host, 'section', 'lb-stat-quality-details');
        const heading = el(panel, 'div', 'lb-stat-quality-heading'); icon(heading, 'database'); el(heading, 'span', '', st('data'));
        const quality = el(panel, 'div', 'lb-stat-quality');
        for (const [label, value] of [[st('missingFinished'), summary.missingDates], [st('missingRating'), summary.total - summary.rated], [st('missingDuration'), summary.remainingUnknown]] as const) { const cell = el(quality, 'div'); el(cell, 'span', '', label); el(cell, 'strong', '', number(value)); }
    }
    private renderTitles(rows: StatRecord[]): void {
        this.body!.dataset.titleView='grid';
        const sorted = [...rows].sort((a, b) => {
            const primary = this.titleSort === 'rating' ? (b.item.userRating ?? -1) - (a.item.userRating ?? -1)
                : this.titleSort === 'finished' ? (personalDateSortValue(b.finishedPeriod) ?? b.finished ?? 0) - (personalDateSortValue(a.finishedPeriod) ?? a.finished ?? 0)
                : this.titleSort === 'added' ? (b.added ?? 0) - (a.added ?? 0)
                : this.titleSort === 'short' ? (a.remaining ?? Infinity) - (b.remaining ?? Infinity) : 0;
            return primary || a.item.displayName.localeCompare(b.item.displayName, i18n.getLanguage());
        });
        const heading = el(this.body!, 'div', 'lb-stat-title-toolbar'); const title = el(heading, 'div');
        el(title, 'h3', '', (this.filters.facet ? this.facetLabel(this.filters.facet.key, this.filters.facet.value) : this.filters.completedDate ? this.historyDateLabel(this.filters.completedDate) : st('titles')) + ' · ' + number(rows.length));
        const controls = el(heading, 'div', 'lb-stat-title-controls');
        this.choice(controls, st('sort'), [['added', st('recent')], ['finished', st('recentFinished')], ['rating', st('byRating')], ['title', st('titleName')], ['short', st('short')]], this.titleSort, value => { this.titleSort = value as typeof this.titleSort; this.titlePage = 0; if (value === 'short') this.setFilter({ status: 'planned' }); else this.redraw(); }).parentElement.classList.add('is-inline');
        const candidates = rows.filter(row => row.status === 'planned');
        if (candidates.length) button(controls, st('random'), () => { this.randomPath = candidates[Math.floor(Math.random() * candidates.length)]?.item.filePath || ''; this.redraw(); }, 'lb-stat-random', 'shuffle');
        const chosen = rows.find(row => row.item.filePath === this.randomPath);
        if (chosen) { const pick = el(this.body!, 'div', 'lb-stat-random-choice'); el(pick, 'span', 'lb-stat-label', st('randomChoice')); this.titleRows(pick, [chosen]); }
        if (!sorted.length) { el(this.body!, 'div', 'lb-stat-empty', st('empty')); return; }
        const size = 20, pages = Math.max(1, Math.ceil(sorted.length / size)); this.titlePage = Math.min(this.titlePage, pages - 1);
        const start = this.titlePage * size; const list = el(this.body!, 'div', 'lb-stat-title-list');
        this.titleRows(list, sorted.slice(start, start + size));
        if (pages === 1) return;
        const paging = el(this.body!, 'div', 'lb-stat-title-paging');
        button(paging, st('previous'), () => { this.titlePage--; this.redraw(); if (this.body) this.body.scrollTop = 0; }, '', 'chevron-left').disabled = this.titlePage === 0;
        el(paging, 'span', '', (start + 1) + '–' + Math.min(start + size, sorted.length) + ' / ' + number(sorted.length));
        button(paging, st('next'), () => { this.titlePage++; this.redraw(); if (this.body) this.body.scrollTop = 0; }, '', 'chevron-right').disabled = this.titlePage + 1 >= pages;
    }
    private titleRows(host: HTMLElement, rows: StatRecord[]): void {
        host.classList.add('lb-stat-card-grid');
        for(const row of rows){
            const entry=el(host,'article','lb-stat-title-row');entry.style.setProperty('--media-color',mediaColor(row.item.type));
            const cover=button(entry,'',()=>this.openItem(row.item),'lb-stat-title-cover');cover.setAttribute('aria-label',st('openEditor')+': '+row.item.displayName);this.poster(cover,row.item);
            const content=el(entry,'div','lb-stat-title-content');
            const open=button(content,row.item.displayName,()=>this.openItem(row.item),'lb-stat-title-open');open.title=row.item.displayName;
            const meta=el(content,'div','lb-stat-title-meta');
            if(row.item.year)el(meta,'span','lb-stat-card-year',String(row.item.year));
            const appearance=getStatusAppearance(row.item.type,row.item.status),status=el(meta,'span','lb-stat-title-status',appearance.label||this.statusLabel(row.status));status.style.setProperty('--status-color',appearance.color);
            if(row.status==='active'||row.status==='on_repeat')el(content,'span','lb-stat-card-progress',this.progressLabel(row));
            const kind=el(entry,'span','lb-stat-card-kind',statMediaLabel(row.item.type));kind.style.setProperty('--badge-color',mediaColor(row.item.type));
            if(row.item.userRating){const score=el(entry,'strong','lb-stat-card-score',formatRatingValue(row.item.userRating)+' ★');score.style.color=this.ratingColor(row.item.userRating,getRatingMax(this.settings().ratingScale));}
        }
    }
    private applyAppearance(): void {
        this.modalEl.classList.toggle('is-wide', this.preferences.width === 'wide'); this.contentEl.dataset.density = this.preferences.density;
        this.contentEl.dataset.cardSize = this.preferences.cardSize;
        this.contentEl.dataset.activityRange = String(this.preferences.activityMonths);
    }
    private changePreferences(patch: Partial<StatisticsPreferences>, sync = true): void {
        this.preferences = normalizeStatisticsPreferences({ ...this.preferences, ...patch }); this.applyAppearance(); this.saveError = false; this.redraw();
        if (sync && this.customization && !this.customization.hidden) this.renderCustomization();
        const snapshot = { ...this.preferences, hiddenSections: [...this.preferences.hiddenSections], rankColumns: [...this.preferences.rankColumns], widgets: structuredClone(this.preferences.widgets) };
        this.preferenceWrites = this.preferenceWrites.catch(() => {}).then(() => this.savePreferences?.(snapshot)).catch(() => {
            if (!this.alive) return; this.saveError = true; this.redraw(); if (this.customization && !this.customization.hidden) this.renderCustomization();
        });
    }
    private toggleCustomization(): void {
        if (!this.customization) return; this.customization.hidden = !this.customization.hidden;
        this.contentEl.querySelector('.lb-stat-customize-trigger')?.setAttribute('aria-expanded', String(!this.customization.hidden));
        if (!this.customization.hidden) { this.renderCustomization(); this.customization.tabIndex = -1; this.customization.focus(); }
        else this.contentEl.querySelector<HTMLButtonElement>('.lb-stat-customize-trigger')?.focus();
    }
    private renderCustomization(): void {
        const host = this.customization; if (!host) return; host.replaceChildren(); this.cleanChoices();
        const heading = el(host, 'div', 'lb-stat-config-heading'); el(heading, 'h3', '', st('appearance')); const close = button(heading, '', () => this.toggleCustomization(), 'lb-stat-icon-button', 'x'); close.setAttribute('aria-label', st('close'));
        this.choice(host, st('density'), [['comfortable', st('comfortable')], ['compact', st('compact')]], this.preferences.density, value => this.changePreferences({ density: value as StatisticsPreferences['density'] }, false));
        this.choice(host, st('width'), [['wide', st('wide')], ['standard', st('standard')]], this.preferences.width, value => this.changePreferences({ width: value as StatisticsPreferences['width'] }, false));
        this.choice(host, st('posterSize'), [['small', st('smallSize')], ['medium', st('mediumSize')], ['large', st('largeSize')]], this.preferences.cardSize, value => this.changePreferences({ cardSize: value as StatisticsPreferences['cardSize'] }, false));
        this.choice(host, st('activityRange'), [['3', st('threeMonths')], ['6', st('sixMonths')]], String(this.preferences.activityMonths), value => this.changePreferences({ activityMonths: Number(value) as 3 | 6 }, false));
        const presets = el(host, 'div', 'lb-stat-config-presets');
        button(presets, st('simplePreset'), () => this.changePreferences({ hiddenSections: ['continue', 'quality'] }));
        button(presets, st('fullPreset'), () => this.changePreferences({ hiddenSections: [] }));
        const labels: Record<StatSection, string> = { summary: st('summary'), media: st('composition'), time: st('time'), continue: st('currentShelf'), journey: st('calendarMonth'), timeline: st('timeline'), distribution: st('statuses') + ' / ' + st('ratings'), preferences: st('rankings'), quality: st('data'), geography: st('geography') };
        el(host, 'h4', '', st('visibleBlocks'));
        for (const page of ['overview', 'insights'] as const) {
            const group = el(host, 'fieldset', 'lb-stat-config-group'); el(group, 'legend', '', st(page));
            for (const section of STAT_SECTIONS.filter(section => (page === 'overview' ? ['summary', 'time', 'distribution', 'journey', 'preferences', 'quality', 'geography'] : ['media', 'continue', 'timeline']).includes(section))) {
                const label = el(group, 'label'); const checkbox = el(label, 'input'); checkbox.type = 'checkbox'; checkbox.checked = this.visible(section); checkbox.setAttribute('aria-label', labels[section]);
                el(label, 'span', '', labels[section]); checkbox.addEventListener('change', () => this.changePreferences({ hiddenSections: checkbox.checked ? this.preferences.hiddenSections.filter(value => value !== section) : [...this.preferences.hiddenSections, section] }, false));
            }
        }
        button(host, st('restore'), () => this.changePreferences(normalizeStatisticsPreferences(undefined)), 'lb-stat-text-link', 'rotate-ccw');
        el(host, 'p', 'lb-stat-save-state', st(this.saveError ? 'saveFailed' : 'savedLayout'));
    }
    private itemList(host: HTMLElement, rows: StatRecord[], detail: (row: StatRecord) => string): void {
        if (!rows.length) { el(host, 'p', 'lb-stat-empty', st('noData')); return; }
        for (const row of rows) {
            const entry = button(host, '', () => this.openItem(row.item), 'lb-stat-item'); entry.title = row.item.displayName;
            this.poster(el(entry, 'span', 'lb-stat-item-cover'), row.item);
            const name = el(entry, 'span', 'lb-stat-item-name'); el(name, 'strong', '', row.item.displayName); el(name, 'small', '', statMediaLabel(row.item.type));
            el(entry, 'span', 'lb-stat-item-detail', detail(row));
        }
    }
    private poster(host: HTMLElement, item: MediaItem): void {
        host.classList.add('lb-stat-poster'); host.classList.toggle('is-square', item.type === 'music');
        const fallback = el(host, 'span', 'lb-stat-poster-fallback'); fallback.style.color = mediaColor(item.type); icon(fallback, MEDIA_ICONS[item.type]);
        const ready = (value: string) => /^(https?:\/\/|app:|blob:|data:image\/)/i.test(value);
        const candidates = [...new Set([('titleImageUrl' in item ? item.titleImageUrl : null), item.imageUrl, item.poster].flatMap(value => {
            if (typeof value !== 'string' || !value.trim() || value === DEFAULT_COVER) return [];
            const resolved = ready(value) ? value : this.resolvePoster?.(value); return resolved && ready(resolved) && resolved !== DEFAULT_COVER ? [resolved] : [];
        }))];
        if (!candidates.length) return;
        const image = el(host, 'img'); image.alt = ''; image.loading = 'lazy'; image.decoding = 'async'; image.referrerPolicy = 'no-referrer'; let candidate = 0;
        image.addEventListener('load', () => { fallback.hidden = true; image.classList.add('is-loaded'); });
        image.addEventListener('error', () => { candidate++; if (candidate < candidates.length) image.src = candidates[candidate]; else image.remove(); });
        image.src = candidates[0];
    }
    private progressLabel(row: StatRecord): string {
        if (row.item.type === 'game') return row.item.progressPercent != null ? number(row.item.progressPercent) + '%' : row.played !== null ? time(row.played) : '—';
        if (row.item.type === 'book') return number(row.pages) + (row.pageTotal ? ' / ' + number(row.pageTotal) : '') + ' ' + st('pageUnit');
        if (row.item.type === 'manga') return number(row.chapters) + (row.chapterTotal ? ' / ' + number(row.chapterTotal) : '') + ' ' + st('chapterUnit');
        if (row.item.type === 'anime' || row.item.type === 'series') {
            const parts = row.item.parts;
            const total = parts?.length ? parts.every(part => typeof part.episodeTotal === 'number' && part.episodeTotal > 0) ? parts.reduce((sum, part) => sum + part.episodeTotal!, 0) : null : row.item.episodeTotal;
            return number(row.episodes) + (total ? ' / ' + number(total) : '') + ' ' + st('episodeUnit');
        }
        const minutes = row.item.type === 'movie' ? row.watched : row.listened;
        return minutes !== null ? time(minutes) : '—';
    }
    private date(date: number | null): string { return date === null ? '—' : new Intl.DateTimeFormat(i18n.getLanguage(), { dateStyle: 'medium' }).format(date); }
}
