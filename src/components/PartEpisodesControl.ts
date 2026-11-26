import { setIcon } from 'obsidian';
import { preserveScroll } from '../utils/preserveScroll';
import type { AnimePart, VideoPart, EpisodeInfo } from '../types';
import { i18n } from '../localization';
import { et } from '../localization/episodes';
import { createDropdownLifecycle } from './dropdownLifecycle';
import { enableEpisodeTracking, mergeEpisodeDetails, normalizeEpisodePart, normalizeWatchedEpisodes, watchedEpisodeNumbers, MAX_EPISODE_NUMBER } from '../services/media/episodeTracking';

type Part = AnimePart | VideoPart;
export type EpisodeLoader = (part: Part) => Promise<EpisodeInfo[]>;
export type EpisodeChange = 'progress' | 'mode' | 'metadata';
function node<K extends keyof HTMLElementTagNameMap>(parent: HTMLElement, tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
    const element = parent.ownerDocument.createElement(tag); element.className = cls;
    if (text !== undefined) element.textContent = text;
    parent.appendChild(element); return element;
}
function button(parent: HTMLElement, text: string, action: (event: MouseEvent) => void, cls = ''): HTMLButtonElement {
    const element = node(parent, 'button', cls, text); element.type = 'button'; element.addEventListener('click', action); return element;
}
function icon(parent: HTMLElement, name: string): void { const span = node(parent, 'span', 'lorebase-episodes-icon'); span.setAttribute('aria-hidden', 'true'); setIcon(span, name); }

/** Edits the modal draft only. DOM and asynchronous metadata are bounded to the selected part. */
export class PartEpisodesControl {
    private alive = true; private page = 0; private limit = 60;
    private partRef?: Part; private revision = 0;
    private rangeStart = 1;
    private resizeObserver?: ResizeObserver;
    private closeActions?: () => void;
    private view: 'grid' | 'list' = 'grid'; private loading = false; private version = 0; private message = '';
    constructor(private host: HTMLElement, private getPart: () => Part | null, private changed: (change: EpisodeChange) => void, private load?: EpisodeLoader) {
        host.classList.add('lorebase-part-episodes'); this.update();
        if (typeof ResizeObserver !== 'undefined') { this.resizeObserver = new ResizeObserver(() => this.balanceGrid()); this.resizeObserver.observe(host); }
    }
    destroy(): void { this.alive = false; this.version++; this.closeActions?.(); this.resizeObserver?.disconnect(); this.host.replaceChildren(); }
    update(): void {
        preserveScroll(this.host, () => this.render());
    }
    private render(): void {
        if (!this.alive) return;
        this.closeActions?.(); this.closeActions = undefined;
        this.revision++;
        const part = this.getPart(); this.host.replaceChildren(); this.host.hidden = !part;
        if (!part) return;
        if (part !== this.partRef) { this.partRef = part; this.page = 0; this.limit = 60; this.rangeStart = 1; this.loading = false; this.message = ''; this.version++; }
        const header = node(this.host, 'div', 'lorebase-episodes-header');
        const bar = node(header, 'div', 'lorebase-episodes-mode');
        for (const [value, label] of [['count', et('count')], ['episodes', et('episodes')]] as const) {
            const active = (part.episodeTracking || 'count') === value;
            const toggle = button(bar, label, () => {
                if (value === 'episodes') enableEpisodeTracking(part); else part.episodeTracking = 'count';
                this.page = 0; this.rangeStart = 1; this.notify('mode');
            });
            toggle.setAttribute('aria-pressed', String(active));
        }
        if (part.episodeTracking !== 'episodes') {
            if (part.watchedEpisodes === undefined && (part.episodeCurrent || 0) > 0) node(this.host, 'p', 'lorebase-episodes-hint', et('convert').replace('N', String(part.episodeCurrent)));
            return;
        }
        const selected = new Set(watchedEpisodeNumbers(part));
        const total = part.episodeTotal && part.episodeTotal > 0 ? part.episodeTotal : null;
        const toolbar = node(header, 'div', 'lorebase-episodes-toolbar');
        const views = node(toolbar, 'div', 'lorebase-episodes-views');
        for (const view of ['grid', 'list'] as const) {
            const toggle = button(views, '', () => { this.view = view; this.page = 0; this.update(); });
            icon(toggle, view === 'grid' ? 'layout-grid' : 'list');
            toggle.title = et(view); toggle.setAttribute('aria-label', et(view));
            toggle.setAttribute('aria-pressed', String(this.view === view));
        }
        if (this.load) {
            const hasTitles = part.episodeDetails?.some(info => info.title);
            const label = this.loading ? et('loading') : et(hasTitles ? 'reload' : 'titles');
            const load = button(toolbar, '', () => { void this.loadTitles(part); }, 'lorebase-episodes-load');
            icon(load, this.loading || hasTitles ? 'refresh-cw' : 'cloud-download');
            node(load, 'span', '', label);
            load.disabled = this.loading; load.title = et('internet'); load.setAttribute('aria-label', this.loading ? et('loading') : et(hasTitles ? 'reload' : 'load'));
            load.classList.toggle('is-loading', this.loading);
        }
        this.renderActions(toolbar, part, selected.size, total);
        const meta = node(this.host, 'div', 'lorebase-episodes-meta');
        node(meta, 'span', 'lorebase-episodes-count', `${selected.size}${total ? ` / ${total}` : ''} · ${et('watched').toLocaleLowerCase(i18n.getLanguage())}`);
        const help = node(meta, 'span', 'lorebase-episodes-help', et('shortHint')); help.title = et('hint');
        let highest = 0;
        for (const n of selected) highest = Math.max(highest, n);
        for (const info of part.episodeDetails || []) highest = Math.max(highest, info.number);
        const length = Math.min(MAX_EPISODE_NUMBER, Math.max(total || this.limit, highest));
        const size = 120;
        const pages = Math.max(1, Math.ceil(length / size)); this.page = Math.min(this.page, pages - 1);
        const first = this.page * size + 1, last = Math.min((this.page + 1) * size, length);
        const content = node(this.host, 'div', `lorebase-episodes-${this.view}`);
        const details = new Map((part.episodeDetails || []).map(info => [info.number, info]));
        const next = this.firstUnwatched(selected, length);
        const focusNumber = Number(this.host.dataset.focusEpisode);
        for (let number = first; number <= last; number++) {
            const row = node(content, 'div', 'lorebase-episode-row');
            const info = details.get(number), watched = selected.has(number);
            const title = info?.title || `${et('episode')} ${number}`;
            const entry = button(row, '', event => {
                if (event.shiftKey) {
                    const anchor = Math.min(this.rangeStart, length);
                    for (let n = Math.min(anchor, number); n <= Math.max(anchor, number); n++) selected.add(n);
                } else {
                    this.rangeStart = number;
                    if (watched) selected.delete(number); else selected.add(number);
                }
                part.watchedEpisodes = normalizeWatchedEpisodes([...selected]); part.episodeCurrent = part.watchedEpisodes.length;
                normalizeEpisodePart(part); this.host.dataset.focusEpisode = String(number);
                this.notify();
            }, 'lorebase-episode-entry');
            entry.dataset.episode = String(number); entry.setAttribute('aria-pressed', String(watched));
            entry.classList.toggle('is-next', number === next);
            entry.setAttribute('aria-label', `${et('episode')} ${number}${info?.title ? `: ${title}` : ''} · ${et(watched ? 'watched' : 'notWatched')}`);
            entry.title = [title, info?.airDate].filter(Boolean).join(' · ');
            if (this.view === 'grid') { node(entry, 'span', 'lorebase-episode-tile-number', String(number).padStart(2, '0')); if (watched) icon(entry, 'check'); }
            else {
                icon(entry, watched ? 'circle-check' : 'circle'); node(entry, 'span', 'lorebase-episode-number', String(number).padStart(2, '0'));
                node(entry, 'span', 'lorebase-episode-title', title);
                if (info?.airDate) {
                    const date = new Date(`${info.airDate}T12:00:00Z`);
                    if (!Number.isNaN(date.getTime())) node(entry, 'span', 'lorebase-episode-date', new Intl.DateTimeFormat(i18n.getLanguage(), { dateStyle: 'medium', timeZone: 'UTC' }).format(date));
                }
            }
            if (focusNumber === number) entry.focus({ preventScroll: true });
        }
        delete this.host.dataset.focusEpisode;
        if (pages > 1) {
            const paging = node(this.host, 'div', 'lorebase-episodes-paging');
            const goTo = (page: number): void => {
                this.page = page;
                this.host.dataset.focusEpisode = String(page * size + 1);
                this.update();
                this.host.querySelector('.lorebase-episode-entry')?.scrollIntoView({ block: 'nearest' });
            };
            button(paging, et('previous'), () => goTo(this.page - 1)).disabled = this.page === 0;
            node(paging, 'span', '', `${first}–${last} / ${length}`);
            button(paging, et('next'), () => goTo(this.page + 1)).disabled = this.page + 1 >= pages;
        }
        if (!total) {
            node(this.host, 'small', 'lorebase-episodes-hint', et('unknown'));
            button(this.host, et('more'), () => { this.limit = Math.min(MAX_EPISODE_NUMBER, length + 60); this.page = Math.floor(length / size); this.update(); }).disabled = length >= MAX_EPISODE_NUMBER;
        }
        if (this.message) node(this.host, 'p', 'lorebase-episodes-message', this.message);
        this.balanceGrid();
    }
    private async loadTitles(part: Part): Promise<void> {
        if (!this.load || this.loading) return;
        const version = ++this.version; this.loading = true; this.message = ''; this.update();
        try {
            const details = await this.load(part);
            if (!this.alive || version !== this.version || this.getPart() !== part) return;
            part.episodeDetails = mergeEpisodeDetails(part.episodeDetails, details);
            const highest = part.episodeDetails[part.episodeDetails.length - 1]?.number;
            if (part.episodeTotal && highest > part.episodeTotal) part.episodeTotal = highest;
            this.message = details.some(info => info.title) ? '' : et('empty');
            this.changed('metadata');
        } catch { if (this.alive && version === this.version) this.message = et('failed'); }
        finally { if (this.alive && version === this.version) { this.loading = false; this.update(); } }
    }
    private notify(change: EpisodeChange = 'progress'): void {
        const revision = this.revision; this.changed(change);
        if (revision === this.revision) this.update();
    }
    private firstUnwatched(selected: Set<number>, length: number): number {
        for (let n = 1; n <= length; n++) if (!selected.has(n)) return n;
        return 0;
    }
    private renderActions(toolbar: HTMLElement, part: Part, count: number, total: number | null): void {
        const wrapper = node(toolbar, 'div', 'lorebase-episodes-menu');
        let close = () => {};
        const trigger = button(wrapper, '', () => {
            if (!panel.hidden) { close(); return; }
            panel.hidden = false; trigger.setAttribute('aria-expanded', 'true'); lifecycle.start();
            panel.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
        }, 'lorebase-episodes-menu-trigger');
        icon(trigger, 'ellipsis'); trigger.title = et('actions'); trigger.setAttribute('aria-label', et('actions')); trigger.setAttribute('aria-haspopup', 'menu'); trigger.setAttribute('aria-expanded', 'false');
        const panel = node(wrapper, 'div', 'lorebase-episodes-actions'); panel.hidden = true; panel.setAttribute('role', 'menu');
        const all = button(panel, '', () => {
            if (!total) return;
            part.watchedEpisodes = Array.from({ length: Math.min(total, MAX_EPISODE_NUMBER) }, (_, n) => n + 1);
            part.episodeCurrent = part.watchedEpisodes.length; close(); this.notify();
        }); icon(all, 'check-check'); node(all, 'span', '', et('all')); all.disabled = total === null || count === total;
        const clear = button(panel, '', () => { part.watchedEpisodes = []; part.episodeCurrent = 0; close(); this.notify(); });
        icon(clear, 'rotate-ccw'); node(clear, 'span', '', et('clear')); clear.disabled = count === 0;
        for (const action of [all, clear]) action.setAttribute('role', 'menuitem');
        const lifecycle = createDropdownLifecycle(trigger, panel, () => close(), () => close());
        close = () => { lifecycle.stop(); panel.hidden = true; trigger.setAttribute('aria-expanded', 'false'); };
        panel.addEventListener('keydown', event => {
            if (event.key === 'Escape') { event.preventDefault(); close(); trigger.focus(); }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault(); const entries = Array.from(panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
                const index = entries.indexOf(panel.ownerDocument.activeElement as HTMLButtonElement);
                entries[(index + (event.key === 'ArrowDown' ? 1 : -1) + entries.length) % entries.length]?.focus();
            }
        });
        this.closeActions = close;
    }
    private balanceGrid(): void {
        const grid = this.host.querySelector<HTMLElement>('.lorebase-episodes-grid');
        if (!this.alive || !grid?.childElementCount) return;
        const available = Math.max(1, Math.min(14, Math.floor(((grid.clientWidth || this.host.clientWidth || 480) + 8) / 52)));
        const columns = Math.ceil(grid.childElementCount / Math.ceil(grid.childElementCount / available));
        const value = `repeat(${columns}, minmax(0, 1fr))`;
        if (grid.style.gridTemplateColumns !== value) grid.style.gridTemplateColumns = value;
    }
}
