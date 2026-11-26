
import { App, Modal, setIcon } from 'obsidian';
import { t } from '../localization';
import { tt, traktError } from '../localization/trakt';
import { createLorebaseDropdown } from '../components/LorebaseDropdown';
import type { TraktSyncService, TraktSyncResult } from '../services/TraktSyncService';
import { equalTraktValue } from '../services/trakt/state';
import type { TraktPreview, TraktState } from '../services/trakt/types';

const PAGE_SIZE = 20;
export class TraktImportModal extends Modal {
    private controller = new AbortController();
    private rows: TraktPreview[] = [];
    private selected = new Set<string>();
    private expanded = new Set<string>();
    private resolutions = new Map<string, 'local' | 'remote'>();
    private images = new Map<string, Promise<string | undefined>>();
    private query = '';
    private filter = 'all';
    private page = 1;
    private applying = false;
    private imageRevision = 0;
    private list?: HTMLElement;
    private pagination?: HTMLElement;
    private selectionCount?: HTMLElement;
    private applyButton?: HTMLButtonElement;
    private applyText?: HTMLElement;
    constructor(app: App, private service: TraktSyncService, private persist: () => Promise<void>, private refresh: () => void, private dispose: () => void) { super(app); }
    onOpen(): void { this.modalEl.addClass('lorebase-trakt-review-container'); this.contentEl.addClass('lorebase-trakt-review', 'lorebase-add-workspace'); void this.load(); }
    onClose(): void { this.controller.abort(); this.contentEl.empty(); this.dispose(); }
    private heading(root: HTMLElement, title: string, description: string, icon = 'download'): void {
        const header = root.createDiv({ cls: 'lorebase-trakt-header' });
        setIcon(header.createSpan({ cls: 'lorebase-trakt-header-icon', attr: { 'aria-hidden': 'true' } }), icon);
        const copy = header.createDiv(); copy.createEl('h2', { text: title }); copy.createDiv({ cls: 'lorebase-trakt-message', text: description });
    }
    private action(host: HTMLElement, label: string, icon: string, run: () => void, cls = ''): HTMLButtonElement {
        const button = host.createEl('button', { cls: `lorebase-trakt-button ${cls}`, attr: { type: 'button' } });
        setIcon(button.createSpan({ attr: { 'aria-hidden': 'true' } }), icon); button.createSpan({ text: label }); button.addEventListener('click', run); return button;
    }
    private async load(): Promise<void> {
        this.imageRevision++; this.modalEl.addClass('is-result');
        const root = this.contentEl; root.empty(); root.removeClass('has-errors', 'is-finished'); this.heading(root, tt('review'), tt('loading'));
        const status = root.createDiv({ cls: 'lorebase-trakt-loading', attr: { role: 'status' } }); setIcon(status, 'loader-circle'); status.addClass('lorebase-trakt-spinner');
        try {
            this.rows = await this.service.preview(this.controller.signal);
            if (!this.controller.signal.aborted) { this.images.clear(); this.selected.clear(); this.expanded.clear(); this.resolutions.clear(); this.render(); }
        } catch (error) {
            if (!this.controller.signal.aborted) { status.removeClass('lorebase-trakt-spinner'); status.empty(); status.addClass('lorebase-trakt-error'); status.textContent = traktError(error); this.action(root.createDiv({ cls: 'lorebase-trakt-actions' }), tt('retry'), 'refresh-cw', () => void this.load()); }
        } finally { await this.persist(); }
    }
    private render(): void {
        const root = this.contentEl; root.empty(); this.modalEl.removeClass('is-result'); this.modalEl.toggleClass('is-single-entry', this.rows.length === 1); this.modalEl.toggleClass('has-few-items', this.rows.length > 1 && this.rows.length <= 3);
        this.heading(root, tt('review'), tt('reviewHint'));
        const toolbar = root.createDiv({ cls: 'lorebase-trakt-toolbar' });
        const field = toolbar.createDiv({ cls: 'lorebase-trakt-search' }); setIcon(field.createSpan({ attr: { 'aria-hidden': 'true' } }), 'search');
        const search = field.createEl('input', { attr: { type: 'search', placeholder: tt('search'), 'aria-label': tt('search') } }); search.value = this.query;
        search.addEventListener('input', () => { this.query = search.value; this.page = 1; this.renderList(); });
        const filters = toolbar.createDiv({ cls: 'lorebase-trakt-filters' });
        for (const [value, label] of [['all', tt('all')], ['movie', tt('movies')], ['series', tt('series')]]) {
            const count = this.rows.filter(row => value === 'all' || row.entry.kind === value).length;
            const button = filters.createEl('button', { attr: { type: 'button', 'aria-pressed': String(this.filter === value) } }); button.createSpan({ text: label }); button.createSpan({ cls: 'lorebase-trakt-filter-count', text: String(count) });
            button.addEventListener('click', () => { this.filter = value; this.page = 1; for (const other of Array.from(filters.querySelectorAll('[aria-pressed]'))) other.setAttribute('aria-pressed', String(other === button)); this.renderList(); });
        }
        const bulk = root.createDiv({ cls: 'lorebase-trakt-bulk' });
        bulk.createSpan({ cls: 'lorebase-trakt-message', text: `${tt('entries')}: ${this.rows.length}` });
        this.action(bulk, tt('select'), 'list-checks', () => { for (const row of this.visible()) if (this.ready(row)) this.selected.add(row.entry.key); this.renderList(); });
        this.action(bulk, tt('clear'), 'x', () => { this.selected.clear(); this.renderList(); });
        this.list = root.createDiv({ cls: 'lorebase-trakt-items lorebase-select-search-grid', attr: { 'aria-label': tt('entries') } });
        this.pagination = root.createDiv({ cls: 'lorebase-trakt-pagination' });
        const footer = root.createDiv({ cls: 'lorebase-trakt-footer' });
        this.selectionCount = footer.createSpan({ cls: 'lorebase-trakt-message', attr: { role: 'status' } });
        this.action(footer, tt('cancel'), 'x', () => this.close());
        this.applyButton = this.action(footer, tt('apply'), 'download', () => void this.apply(), 'mod-cta'); this.applyText = this.applyButton.lastElementChild as HTMLElement;
        this.renderList(); search.focus({ preventScroll: true });
    }
    private filtered(): TraktPreview[] { const query = this.query.trim().toLocaleLowerCase(); return this.rows.filter(row => (this.filter === 'all' || row.entry.kind === this.filter) && (!query || row.entry.title.toLocaleLowerCase().includes(query))); }
    private visible(): TraktPreview[] { return this.filtered().slice((this.page - 1) * PAGE_SIZE, this.page * PAGE_SIZE); }
    private ready(row: TraktPreview): boolean { return (row.matches.length <= 1 || Boolean(row.path)) && (!row.conflicts.length || this.resolutions.has(row.entry.key)); }
    private fact(host: HTMLElement, icon: string, value: string, label: string, cls = ''): void {
        const fact = host.createSpan({ cls: `lorebase-trakt-fact ${cls}`, attr: { 'aria-label': value === label || value.includes(':') ? value : `${label}: ${value}`, title: label } });
        setIcon(fact.createSpan({ attr: { 'aria-hidden': 'true' } }), icon); fact.createSpan({ text: value });
    }
    private renderList(): void {
        if (!this.list || !this.pagination) return; const scrollTop = this.list.scrollTop; this.list.empty(); this.pagination.empty();
        const filtered = this.filtered(), pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)); this.page = Math.min(this.page, pages);
        if (!filtered.length) this.list.createDiv({ cls: 'lorebase-trakt-empty', text: tt('empty') });
        this.list.style.setProperty('--lb-trakt-columns', String(Math.max(1, Math.min(4, filtered.length))));
        for (const row of this.visible()) this.renderItem(row);
        this.pagination.hidden = pages <= 1;
        if (pages > 1) {
            const previous = this.action(this.pagination, t('promptPreviousPage'), 'chevron-left', () => { this.page--; this.renderList(); }); previous.disabled = this.page === 1;
            this.pagination.createSpan({ text: `${t('promptPage')} ${this.page} / ${pages}` });
            const next = this.action(this.pagination, t('promptNextPage'), 'chevron-right', () => { this.page++; this.renderList(); }); next.disabled = this.page >= pages;
        }
        this.list.scrollTop = scrollTop; this.updateApply(); void this.loadImages(this.visible());
    }
    private renderItem(row: TraktPreview): void {
        const key = row.entry.key, picked = this.selected.has(key);
        const item = this.list!.createEl('article', { cls: `lorebase-trakt-item${picked ? ' has-selection' : ''}${!this.ready(row) ? ' needs-review' : ''}` });
        const select = item.createEl('button', { cls: `lorebase-select-card lorebase-trakt-item-select${picked ? ' is-picked' : ''}`, attr: { type: 'button', title: row.entry.title, 'aria-label': row.entry.title, 'aria-pressed': String(picked) } });
        const image = select.createDiv({ cls: 'lorebase-select-card-image lorebase-trakt-art is-empty' }); image.dataset.key = key;
        setIcon(image.createSpan({ cls: 'lorebase-select-empty-poster-icon', attr: { 'aria-hidden': 'true' } }), row.entry.kind === 'series' ? 'tv' : 'clapperboard'); if (row.image) this.paintImage(image, row.image);
        image.createSpan({ cls: 'lorebase-select-classification', text: tt(row.entry.kind === 'series' ? 'series' : 'movies') });
        if (row.entry.state.favorite) setIcon(image.createSpan({ cls: 'lorebase-trakt-favorite lorebase-trakt-poster-favorite', attr: { 'aria-label': tt('favorite'), title: tt('favorite') } }), 'heart');
        const copy = select.createDiv({ cls: 'lorebase-select-card-body lorebase-trakt-item-copy' });
        copy.createEl('h3', { cls: 'lorebase-select-card-title', text: row.entry.title });
        copy.createDiv({ cls: 'lorebase-select-card-meta', text: row.entry.year ? String(row.entry.year) : '' });
        const facts = copy.createDiv({ cls: 'lorebase-trakt-facts' });
        if (row.entry.kind === 'series') {
            this.fact(facts, 'check-check', `${tt('episodesLabel')}: ${row.entry.state.episodes.length}`, tt('watchedShort'));
            this.fact(facts, 'layers', `${tt('seasonsLabel')}: ${new Set(row.entry.state.episodes.map(episode => episode.split(':')[0])).size}`, tt('seasons'));
        } else if (row.entry.state.watched) this.fact(facts, 'check-check', tt('watched'), tt('watched'));
        if (row.entry.state.rating !== null) this.fact(facts, 'star', `${row.entry.state.rating} / 10`, tt('rating'));
        if (row.entry.state.watchlist) this.fact(facts, 'bookmark', tt('watchlist'), tt('watchlist'));
        const target = copy.createDiv({ cls: `lorebase-trakt-item-target${row.path ? ' is-linked' : ''}${!this.ready(row) ? ' is-warning' : ''}` });
        setIcon(target.createSpan({ attr: { 'aria-hidden': 'true' } }), !this.ready(row) ? 'circle-alert' : row.path ? 'file-check' : 'file-plus'); target.createSpan({ text: tt(!this.ready(row) ? 'needsReview' : row.path ? 'linkedNote' : 'newNote') });
        select.createDiv({ cls: 'lorebase-select-card-check', attr: { 'aria-hidden': 'true' } });
        const bottom = item.createDiv({ cls: 'lorebase-trakt-item-bottom' });
        const toggle = bottom.createEl('button', { cls: 'lorebase-trakt-details-toggle', attr: { type: 'button', 'aria-expanded': String(this.expanded.has(key)) } });
        const toggleText = toggle.createSpan(), toggleIcon = toggle.createSpan({ attr: { 'aria-hidden': 'true' } });
        const details = item.createDiv({ cls: 'lorebase-trakt-item-details' }); details.dataset.detailKey = key;
        const expand = (open: boolean, reveal = false) => {
            if (open) this.expanded.add(key); else this.expanded.delete(key);
            details.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); toggleText.textContent = tt(open ? 'hideDetails' : 'details'); setIcon(toggleIcon, open ? 'chevron-up' : 'chevron-down');
            if (open) { this.renderDetail(row, details); if (reveal) details.scrollIntoView({ block: 'nearest' }); }
        };
        expand(this.expanded.has(key));
        toggle.addEventListener('click', () => expand(!this.expanded.has(key), true));
        select.addEventListener('click', () => {
            if (this.applying) return; if (!this.ready(row)) { expand(true, true); return; }
            if (this.selected.has(key)) this.selected.delete(key); else this.selected.add(key);
            item.toggleClass('has-selection', this.selected.has(key)); select.toggleClass('is-picked', this.selected.has(key)); select.setAttribute('aria-pressed', String(this.selected.has(key))); this.updateApply();
        });
    }
    private paintImage(host: HTMLElement, url: string): void {
        const image = host.createEl('img', { attr: { src: url, alt: '', loading: 'lazy' } });
        image.addEventListener('load', () => host.removeClass('is-empty'), { once: true }); image.addEventListener('error', () => image.remove(), { once: true });
    }
    private async loadImages(rows: TraktPreview[]): Promise<void> {
        const queue = [...rows], revision = this.imageRevision;
        const worker = async () => {
            while (queue.length && !this.controller.signal.aborted && revision === this.imageRevision) {
                const row = queue.shift()!; if (row.image) continue;
                let pending = this.images.get(row.entry.key);
                if (!pending) {
                    pending = this.service.previewImage(row, this.controller.signal).catch(error => {
                        if (!this.controller.signal.aborted && revision === this.imageRevision) {
                            row.error = traktError(error);
                            if (this.expanded.has(row.entry.key) && !this.applying) for (const host of Array.from(this.list?.querySelectorAll<HTMLElement>('[data-detail-key]') ?? [])) if (host.dataset.detailKey === row.entry.key) this.renderDetail(row, host);
                        }
                        return undefined;
                    }); this.images.set(row.entry.key, pending);
                }
                const url = await pending; if (!url || this.controller.signal.aborted || revision !== this.imageRevision) continue;
                for (const host of Array.from(this.list?.querySelectorAll<HTMLElement>('[data-key]') ?? [])) if (host.dataset.key === row.entry.key && !host.querySelector('img')) this.paintImage(host, url);
            }
        };
        await Promise.all([worker(), worker(), worker()]);
    }
    private renderDetail(row: TraktPreview, host: HTMLElement): void {
        host.empty();
        const field = host.createDiv({ cls: 'lorebase-trakt-field' }); field.createEl('label', { text: tt('note') });
        const options = [{ value: '', label: tt('create') }, ...this.service.targets(row.entry.kind).map(target => ({ value: target.path, label: target.title }))];
        if (row.matches.length > 1 && !row.path) options.unshift({ value: '__choose__', label: tt('choose') });
        createLorebaseDropdown(field.createDiv(), options, row.path || (row.matches.length > 1 ? '__choose__' : ''), value => {
            if (this.applying || value === '__choose__') return; this.service.bind(row, value || undefined); this.resolutions.delete(row.entry.key); this.selected.delete(row.entry.key); this.renderList();
        }, { floating: true });
        const stats = host.createDiv({ cls: 'lorebase-trakt-stats' });
        for (const key of [row.entry.kind === 'series' ? 'episodes' : 'watched', 'favorite', 'rating', 'watchlist'] as const) {
            const change = stats.createDiv({ cls: `lorebase-trakt-change${row.conflicts.includes(key) ? ' is-conflict' : ''}` });
            const line = change.createDiv({ cls: 'lorebase-trakt-stat-line' }); line.createSpan({ text: tt(key) }); line.createEl('strong', { text: this.value(row.entry.state[key]) });
            if (row.path && !equalTraktValue(row.local[key], row.entry.state[key])) change.createDiv({ cls: 'lorebase-trakt-note-value', text: `${tt('noteValue')}: ${this.value(row.local[key])}` });
        }
        if (row.entry.kind === 'series' && row.entry.state.episodes.length) {
            const seasons = new Map<string, number[]>();
            for (const episode of row.entry.state.episodes) { const [season, n] = episode.split(':'); const list = seasons.get(season) ?? []; list.push(Number(n)); seasons.set(season, list); }
            const details = host.createEl('details', { cls: 'lorebase-trakt-seasons' }); details.createEl('summary', { text: `${tt('bySeason')} · ${seasons.size}` });
            const list = details.createDiv({ cls: 'lorebase-trakt-season-list' });
            for (const [season, numbers] of [...seasons].sort(([a], [b]) => Number(a) - Number(b))) {
                numbers.sort((a, b) => a - b); const ranges: string[] = [];
                for (let i = 0; i < numbers.length; i++) { const start = numbers[i]; while (i + 1 < numbers.length && numbers[i + 1] === numbers[i] + 1) i++; ranges.push(start === numbers[i] ? String(start) : `${start}–${numbers[i]}`); }
                const item = list.createDiv({ cls: 'lorebase-trakt-season' }); item.createSpan({ text: `${tt('season')} ${season}` }); item.createSpan({ text: ranges.join(', '), attr: { title: `${tt('episodes')}: ${numbers.length}` } });
            }
        }
        if (row.conflicts.length) {
            const choice = host.createDiv({ cls: 'lorebase-trakt-field' }); choice.createEl('label', { text: tt('conflict') });
            createLorebaseDropdown(choice.createDiv(), [{ value: '', label: tt('conflict') }, { value: 'local', label: tt('local') }, { value: 'remote', label: tt('remote') }], this.resolutions.get(row.entry.key) || '', value => {
                if (this.applying) return; if (value === 'local' || value === 'remote') this.resolutions.set(row.entry.key, value); else this.resolutions.delete(row.entry.key); this.renderList();
            }, { floating: true });
        }
        if (row.error) host.createDiv({ cls: 'lorebase-trakt-error', text: row.error });
    }
    private value(value: TraktState[keyof TraktState]): string { return value == null ? '—' : Array.isArray(value) ? String(value.length) : typeof value === 'boolean' ? tt(value ? 'yes' : 'no') : `${Math.round(value * 100) / 100} / 10`; }
    private updateApply(): void {
        if (this.selectionCount) this.selectionCount.textContent = `${tt('selected')}: ${this.selected.size} / ${this.rows.length}`;
        if (this.applyButton) this.applyButton.disabled = this.applying || !this.selected.size;
        if (this.applyText) this.applyText.textContent = `${tt('apply')}${this.selected.size ? ` · ${this.selected.size}` : ''}`;
    }
    private renderResult(result: TraktSyncResult): void {
        const root = this.contentEl; root.empty(); root.addClass('is-finished'); root.toggleClass('has-errors', Boolean(result.failed));
        this.heading(root, tt(result.failed ? 'resultErrors' : 'done'), tt(result.failed ? 'resultErrorsHint' : 'resultHint'), result.failed ? 'circle-alert' : 'check-check');
        const counts = root.createDiv({ cls: 'lorebase-trakt-result-counts', attr: { role: 'status' } });
        for (const [label, count, icon] of [[tt('created'), result.created, 'file-plus'], [tt('updated'), result.updated, 'file-check'], [tt('errors'), result.failed, 'circle-alert']] as const) {
            const stat = counts.createDiv(); setIcon(stat.createSpan({ attr: { 'aria-hidden': 'true' } }), icon); stat.createEl('strong', { text: String(count) }); stat.createSpan({ text: label });
        }
        if (result.errors.length) {
            const errors = root.createEl('details', { cls: 'lorebase-trakt-result-errors', attr: { open: '' } }); errors.createEl('summary', { text: `${tt('errors')} · ${result.errors.length}` });
            for (const error of result.errors) errors.createDiv({ cls: 'lorebase-trakt-error', text: traktError(error) });
        }
        const actions = root.createDiv({ cls: 'lorebase-trakt-footer' });
        this.action(actions, tt('backToList'), 'arrow-left', () => void this.load()); this.action(actions, tt('close'), 'check', () => this.close(), 'mod-cta');
    }
    private async apply(): Promise<void> {
        if (this.applying || !this.selected.size) return; this.applying = true;
        const selections = this.rows.filter(row => this.selected.has(row.entry.key) && this.ready(row)).map(row => ({ row, resolution: this.resolutions.get(row.entry.key) }));
        this.modalEl.addClass('is-result'); const root = this.contentEl; root.empty(); this.applyButton = undefined; this.applyText = undefined; this.selectionCount = undefined;
        this.heading(root, tt('syncing'), tt('syncingHint'), 'refresh-cw');
        const status = root.createDiv({ cls: 'lorebase-trakt-import-progress' });
        const line = status.createDiv({ cls: 'lorebase-trakt-progress-line' }), current = line.createSpan({ cls: 'lorebase-trakt-current', attr: { role: 'status' } }), count = line.createSpan({ cls: 'lorebase-trakt-message', text: `0 / ${selections.length}` });
        const progress = status.createEl('progress', { cls: 'lorebase-trakt-progress', attr: { max: String(selections.length), value: '0', 'aria-label': tt('syncing') } });
        this.action(root.createDiv({ cls: 'lorebase-trakt-actions' }), tt('cancel'), 'x', () => this.close());
        try {
            const result = await this.service.apply(selections, this.controller.signal, (done, total, title) => { if (this.controller.signal.aborted) return; progress.value = done; count.textContent = `${done} / ${total}`; if (title) current.textContent = title; });
            if (!this.controller.signal.aborted) this.renderResult(result);
        } catch (error) { if (!this.controller.signal.aborted) this.renderResult({ created: 0, updated: 0, pushed: 0, skipped: 0, failed: 1, errors: [error instanceof Error ? error.message : 'TRAKT_FAILED'] }); }
        finally { this.applying = false; this.updateApply(); await this.persist(); this.refresh(); }
    }
}
