
import { App, Modal, setIcon } from 'obsidian';
import { t } from '../localization';
import { gt } from '../localization/gameTracking';
import { pt, psnError } from '../localization/playstation';
import { PlayStationMatchModal } from './PlayStationMatchModal';
import type { PlayStationPreview, PlayStationSyncService } from '../services/PlayStationSyncService';

const PAGE_SIZE = 20;
export class PlayStationImportModal extends Modal {
    private controller = new AbortController();
    private rows: PlayStationPreview[] = [];
    private selected = new Set<string>();
    private matching?: PlayStationMatchModal;
    private query = '';
    private filter = '';
    private page = 1;
    private applying = false;
    private list!: HTMLElement;
    private pagination!: HTMLElement;
    private footer!: HTMLElement;
    private message!: HTMLElement;
    private count!: HTMLElement;
    constructor(app: App, private service: PlayStationSyncService, private refresh: () => void, private dispose: () => void) { super(app); }
    onOpen(): void {
        this.modalEl.addClass('lorebase-trakt-review-container', 'lorebase-psn-import-container');
        this.contentEl.addClass('lorebase-trakt-review', 'lorebase-add-workspace', 'lorebase-psn-import');
        const header = this.contentEl.createDiv({ cls: 'lorebase-trakt-header' });
        setIcon(header.createSpan({ cls: 'lorebase-trakt-header-icon', attr: { 'aria-hidden': 'true' } }), 'download');
        const copy = header.createDiv(); copy.createEl('h2', { text: pt('import') });
        copy.createDiv({ cls: 'lorebase-trakt-message', text: pt('reviewHint') });
        this.message = this.contentEl.createDiv({ cls: 'lorebase-psn-message', text: pt('loading'), attr: { role: 'status' } });
        void this.load();
    }
    onClose(): void { this.controller.abort(); this.matching?.close(); this.refresh(); this.dispose(); }
    private async load(): Promise<void> {
        try {
            this.rows = await this.service.preview(this.controller.signal);
            if (this.controller.signal.aborted) return;
            this.message.textContent = '';
            this.modalEl.toggleClass('is-single-entry', this.rows.length === 1);
            const toolbar = this.contentEl.createDiv({ cls: 'lorebase-trakt-toolbar' });
            const field = toolbar.createDiv({ cls: 'lorebase-trakt-search' }); setIcon(field.createSpan({ attr: { 'aria-hidden': 'true' } }), 'search');
            const search = field.createEl('input', { attr: { type: 'search', placeholder: pt('search'), 'aria-label': pt('search') } });
            search.addEventListener('input', () => { this.query = search.value.trim().toLocaleLowerCase(); this.page = 1; this.render(); });
            const filters = toolbar.createDiv({ cls: 'lorebase-trakt-filters' });
            for (const [value, label] of [['', pt('allGames')], ['PS4', 'PS4'], ['PS5', 'PS5']]) {
                const count = this.rows.filter(row => !value || row.entry.platform.includes(value)).length;
                if (value && !count) continue;
                const button = filters.createEl('button', { text: label, attr: { type: 'button', 'aria-pressed': String(value === this.filter) } });
                button.createSpan({ cls: 'lorebase-trakt-filter-count', text: String(value ? count : this.rows.length) });
                button.addEventListener('click', () => {
                    this.filter = value; this.page = 1;
                    filters.querySelectorAll('button').forEach(other => other.setAttribute('aria-pressed', String(other === button))); this.render();
                });
            }
            const tools = this.contentEl.createDiv({ cls: 'lorebase-trakt-bulk lorebase-psn-import-tools' });
            this.count = tools.createSpan({ cls: 'lorebase-trakt-message' });
            this.button(tools, pt('selectPage'), () => { for (const row of this.visible()) this.selected.add(row.entry.titleId); this.render(); }, 'list-checks');
            this.button(tools, pt('clear'), () => { this.selected.clear(); this.render(); }, 'x');
            this.list = this.contentEl.createDiv({ cls: 'lorebase-trakt-items lorebase-select-search-grid', attr: { 'aria-label': pt('games') } });
            this.pagination = this.contentEl.createDiv({ cls: 'lorebase-trakt-pagination' });
            this.footer = this.contentEl.createDiv({ cls: 'lorebase-trakt-footer' }); this.render();
        } catch (error) {
            if (!this.controller.signal.aborted) {
                this.message.textContent = psnError(error);
                this.button(this.contentEl, pt('refreshShort'), () => { this.contentEl.empty(); this.onOpen(); }, 'refresh-cw');
            }
        }
    }
    private shown(): PlayStationPreview[] { return this.rows.filter(row => (!this.filter || row.entry.platform.includes(this.filter)) && (row.entry.name + ' ' + row.entry.platform).toLocaleLowerCase().includes(this.query)); }
    private visible(): PlayStationPreview[] { return this.shown().slice((this.page - 1) * PAGE_SIZE, this.page * PAGE_SIZE); }
    private button(host: HTMLElement, title: string, action: () => void, icon?: string): HTMLButtonElement {
        const button = host.createEl('button', { cls: 'lorebase-trakt-button', attr: { type: 'button' } });
        if (icon) setIcon(button.createSpan({ attr: { 'aria-hidden': 'true' } }), icon);
        button.createSpan({ text: title }); button.addEventListener('click', action); return button;
    }
    private ready(row: PlayStationPreview): boolean { return row.targetChosen && Boolean(row.path || row.psnOnly || row.source); }
    private render(): void {
        const scrollTop = this.list.scrollTop; this.list.empty(); this.footer.empty(); this.pagination.empty();
        const shown = this.shown(), maxPage = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
        this.page = Math.min(this.page, maxPage); this.count.textContent = pt('games') + ': ' + shown.length;
        this.list.style.setProperty('--lb-trakt-columns', String(Math.max(1, Math.min(4, shown.length))));
        if (!shown.length) this.list.createDiv({ cls: 'lorebase-trakt-empty', text: pt('empty') });
        for (const row of this.visible()) this.renderCard(row);
        this.list.scrollTop = scrollTop; this.pagination.hidden = maxPage <= 1;
        if (maxPage > 1) {
            const previous = this.button(this.pagination, '‹', () => { this.page--; this.render(); }); previous.setAttribute('aria-label', t('promptPreviousPage'));
            previous.disabled = this.applying || this.page <= 1;
            this.pagination.createSpan({ text: this.page + ' / ' + maxPage });
            const next = this.button(this.pagination, '›', () => { this.page++; this.render(); }); next.setAttribute('aria-label', t('promptNextPage'));
            next.disabled = this.applying || this.page >= maxPage;
        }
        const selection = this.footer.createSpan({ cls: 'lorebase-trakt-message', text: pt('selected') + ': ' + this.selected.size + ' / ' + this.rows.length });
        const pending = this.rows.filter(row => this.selected.has(row.entry.titleId) && !this.ready(row)).length;
        if (pending) selection.createSpan({ cls: 'lorebase-psn-review-warning', text: pt('needsReview') + ': ' + pending });
        this.button(this.footer, t('commonCancel'), () => this.close(), 'x');
        const apply = this.button(this.footer, pt('apply') + (this.selected.size ? ' · ' + this.selected.size : ''), () => { void this.apply(); }, 'download');
        apply.classList.add('mod-cta'); apply.disabled = this.applying || !this.selected.size || this.rows.some(row => this.selected.has(row.entry.titleId) && !this.ready(row));
    }
    private renderCard(row: PlayStationPreview): void {
        const key = row.entry.titleId, picked = this.selected.has(key);
        const card = this.list.createEl('article', { cls: 'lorebase-trakt-item' + (picked ? ' has-selection' : ''), attr: { 'data-title-id': key } });
        const select = card.createEl('button', { cls: 'lorebase-select-card lorebase-trakt-item-select' + (picked ? ' is-picked' : ''), attr: { type: 'button', 'aria-label': row.entry.name, 'aria-pressed': String(picked) } });
        select.disabled = this.applying;
        const image = select.createDiv({ cls: 'lorebase-select-card-image lorebase-trakt-art is-empty' });
        setIcon(image.createSpan({ cls: 'lorebase-select-empty-poster-icon', attr: { 'aria-hidden': 'true' } }), 'gamepad-2');
        if (row.entry.image) {
            const poster = image.createEl('img', { attr: { src: row.entry.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' } });
            poster.addEventListener('load', () => image.removeClass('is-empty'), { once: true }); poster.addEventListener('error', () => poster.remove(), { once: true });
        }
        image.createSpan({ cls: 'lorebase-select-classification', text: row.entry.platform });
        const copy = select.createDiv({ cls: 'lorebase-select-card-body lorebase-trakt-item-copy' });
        copy.createEl('h3', { cls: 'lorebase-select-card-title', text: row.entry.name });
        const facts = copy.createDiv({ cls: 'lorebase-trakt-facts' });
        const fact = (icon: string, text: string) => { const value = facts.createDiv({ cls: 'lorebase-trakt-fact' }); setIcon(value.createSpan({ attr: { 'aria-hidden': 'true' } }), icon); value.createSpan({ text }); };
        if (row.entry.playtimeMinutes !== undefined) fact('clock-3', Math.floor(row.entry.playtimeMinutes / 60) + ' ' + gt('hoursShort') + ' ' + row.entry.playtimeMinutes % 60 + ' ' + gt('minutesShort'));
        if (row.entry.played) fact('gamepad-2', pt('played'));
        if (row.entry.owned) fact('shopping-bag', pt('libraryShort'));
        const target = copy.createDiv({ cls: 'lorebase-trakt-item-target' + (row.path ? ' is-linked' : '') + (!this.ready(row) ? ' is-warning' : '') });
        setIcon(target.createSpan({ attr: { 'aria-hidden': 'true' } }), this.ready(row) ? row.path ? 'file-check' : 'file-plus' : 'circle-alert');
        target.createSpan({ text: pt(!this.ready(row) ? 'needsReview' : row.path ? 'linkedNote' : 'newNoteShort') });
        if (row.source && !row.psnOnly) {
            const match = copy.createDiv({ cls: 'lorebase-psn-card-match', attr: { title: row.source.provider.toUpperCase() + ' · ' + row.source.title } });
            setIcon(match.createSpan({ attr: { 'aria-hidden': 'true' } }), 'check-check');
            match.createSpan({ text: row.source.provider.toUpperCase() + ' · ' + pt('matched') });
        }
        select.createDiv({ cls: 'lorebase-select-card-check', attr: { 'aria-hidden': 'true' } });
        const bottom = card.createDiv({ cls: 'lorebase-trakt-item-bottom' });
        const details = this.button(bottom, pt('details'), () => this.openMatch(row));
        details.classList.add('lorebase-trakt-details-toggle'); details.disabled = this.applying;
        setIcon(details.createSpan({ attr: { 'aria-hidden': 'true' } }), 'sliders-horizontal');
        select.addEventListener('click', () => {
            if (this.applying) return;
            if (this.selected.has(key)) this.selected.delete(key);
            else this.selected.add(key);
            this.render();
            if (this.selected.has(key) && !this.ready(row)) this.openMatch(row);
        });
    }
    private openMatch(row: PlayStationPreview): void {
        if (this.applying || this.matching) return;
        this.matching = new PlayStationMatchModal(this.app, row, this.service, draft => {
            this.matching = undefined;
            if (this.controller.signal.aborted) return;
            if (draft) Object.assign(row, draft);
            this.render();
        });
        this.matching.open();
    }
    private async apply(): Promise<void> {
        if (this.applying) return; this.applying = true;
        this.contentEl.querySelectorAll<HTMLInputElement>('input[type=search]').forEach(input => { input.disabled = true; });
        this.contentEl.querySelectorAll<HTMLButtonElement>('.lorebase-trakt-toolbar button, .lorebase-psn-import-tools button').forEach(button => { button.disabled = true; });
        this.render();
        try {
            const result = await this.service.apply(this.rows.filter(row => this.selected.has(row.entry.titleId)), this.controller.signal,
                (done, total, title) => { if (!this.controller.signal.aborted) this.message.textContent = done + ' / ' + total + ' · ' + title; });
            if (this.controller.signal.aborted) return;
            this.message.textContent = pt('created') + ': ' + result.created + ' · ' + pt('updated') + ': ' + result.updated + ' · ' + pt('errors') + ': ' + result.failed
                + (result.partial ? '\n' + pt('partial') : '') + (result.errors.length ? '\n' + result.errors.join('\n') : '');
            this.rows = this.rows.filter(row => !this.selected.has(row.entry.titleId) || result.failedIds.includes(row.entry.titleId)); this.selected.clear(); this.refresh();
        } catch (error) { if (!this.controller.signal.aborted) this.message.textContent = psnError(error); }
        finally {
            this.applying = false;
            if (!this.controller.signal.aborted) {
                this.contentEl.querySelectorAll<HTMLInputElement>('input[type=search]').forEach(input => { input.disabled = false; });
                this.contentEl.querySelectorAll<HTMLButtonElement>('.lorebase-trakt-toolbar button, .lorebase-psn-import-tools button').forEach(button => { button.disabled = false; });
                this.render();
            }
        }
    }
}
