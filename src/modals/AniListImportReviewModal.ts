import { App, Modal, setIcon } from 'obsidian';
import type { AniListImportCandidate } from '../services/AniListSyncService';

type Filter = 'all' | 'anime' | 'manga';

export class AniListImportReviewModal extends Modal {
    private readonly candidates: AniListImportCandidate[];
    private selected = new Set<string>();
    private filter: Filter = 'all';
    private query = '';
    private resolve?: (value: Set<string> | null) => void;
    private resolved = false;
    private listEl?: HTMLElement;
    private countEl?: HTMLElement;
    private importButton?: HTMLButtonElement;

    constructor(app: App, candidates: AniListImportCandidate[]) {
        super(app);
        this.candidates = candidates;
    }

    openAndGetValue(): Promise<Set<string> | null> {
        return new Promise(resolve => { this.resolve = resolve; this.open(); });
    }

    onOpen(): void {
        this.modalEl.addClass('lorebase-steam-review-modal-container');
        this.render();
    }

    onClose(): void {
        if (!this.resolved) this.resolve?.(null);
        this.contentEl.empty();
    }

    private render(): void {
        this.contentEl.empty();
        this.contentEl.addClass('lorebase-steam-review-modal');
        const header = this.contentEl.createDiv({ cls: 'lorebase-sr-header' });
        const title = header.createDiv({ cls: 'lorebase-sr-title-row' });
        const icon = title.createSpan({ cls: 'lorebase-sr-title-icon' });
        setIcon(icon, 'download');
        title.createSpan({ cls: 'lorebase-sr-title-text', text: 'AniList Import' });
        header.createDiv({ cls: 'lorebase-sr-subtitle', text: 'Select the anime and manga you want to create or update in LOREBASE.' });

        const toolbar = this.contentEl.createDiv({ cls: 'lorebase-sr-toolbar' });
        const searchWrap = toolbar.createDiv({ cls: 'lorebase-sr-search-wrap' });
        const searchIcon = searchWrap.createSpan({ cls: 'lorebase-sr-search-icon' });
        setIcon(searchIcon, 'search');
        const search = searchWrap.createEl('input', { cls: 'lorebase-sr-search', attr: { type: 'text', placeholder: 'Search anime and manga...' } });
        search.value = this.query;
        search.addEventListener('input', () => { this.query = search.value.trim().toLowerCase(); this.renderList(); });

        const actions = toolbar.createDiv({ cls: 'lorebase-sr-actions' });
        this.action(actions, 'layers-2', 'All', () => { this.candidates.forEach(item => this.selected.add(item.key)); this.refresh(); });
        this.action(actions, 'clapperboard', 'Anime', () => { this.candidates.filter(item => item.kind === 'anime').forEach(item => this.selected.add(item.key)); this.refresh(); });
        this.action(actions, 'book-open', 'Manga', () => { this.candidates.filter(item => item.kind === 'manga').forEach(item => this.selected.add(item.key)); this.refresh(); });
        this.action(actions, 'x', 'Clear', () => { this.selected.clear(); this.refresh(); });

        const filters = this.contentEl.createDiv({ cls: 'lorebase-sr-filters' });
        for (const filter of [{ id: 'all', text: 'All' }, { id: 'anime', text: 'Anime' }, { id: 'manga', text: 'Manga' }] as const) {
            const button = filters.createEl('button', { cls: 'lorebase-sr-filter', text: filter.text, attr: { type: 'button' } });
            button.toggleClass('is-active', this.filter === filter.id);
            button.addEventListener('click', () => { this.filter = filter.id; this.refresh(); });
        }
        this.countEl = this.contentEl.createDiv({ cls: 'lorebase-sr-count' });
        this.listEl = this.contentEl.createDiv({ cls: 'lorebase-sr-list' });
        this.renderList();

        const footer = this.contentEl.createDiv({ cls: 'lorebase-sr-footer lorebase-select-footer' });
        const cancel = footer.createEl('button', { cls: 'lorebase-flow-btn lorebase-flow-btn-secondary', text: 'Cancel', attr: { type: 'button' } });
        this.importButton = footer.createEl('button', { cls: 'lorebase-flow-btn lorebase-flow-btn-primary', attr: { type: 'button' } });
        cancel.addEventListener('click', () => { this.resolved = true; this.resolve?.(null); this.close(); });
        this.importButton.addEventListener('click', () => { this.resolved = true; this.resolve?.(new Set(this.selected)); this.close(); });
        this.updateImportButton();
        search.focus();
    }

    private renderList(): void {
        if (!this.listEl || !this.countEl) return;
        const items = this.candidates.filter(item => (this.filter === 'all' || item.kind === this.filter) && (!this.query || item.title.toLowerCase().includes(this.query)));
        this.countEl.setText(`${this.selected.size} selected / ${items.length} shown / ${this.candidates.length} total`);
        this.listEl.empty();
        if (!items.length) {
            this.listEl.createDiv({ cls: 'lorebase-sr-empty', text: 'No entries match the current search.' });
            return;
        }
        for (const item of items) {
            const checked = this.selected.has(item.key);
            const row = this.listEl.createDiv({ cls: 'lorebase-sr-row', attr: { role: 'checkbox', tabindex: '0', 'aria-checked': String(checked) } });
            const checkbox = row.createEl('input', { cls: 'lorebase-sr-checkbox', attr: { type: 'checkbox' } });
            checkbox.checked = checked;
            const info = row.createDiv({ cls: 'lorebase-sr-info' });
            info.createDiv({ cls: 'lorebase-sr-name', text: item.title });
            info.createDiv({ cls: 'lorebase-sr-meta', text: `${item.kind} · ${item.status} · progress ${item.progress}${item.linked ? ' · linked' : ''}` });
            const toggle = (): void => { if (this.selected.has(item.key)) this.selected.delete(item.key); else this.selected.add(item.key); this.refresh(); };
            checkbox.addEventListener('click', event => event.stopPropagation());
            checkbox.addEventListener('change', toggle);
            row.addEventListener('click', toggle);
            row.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); } });
        }
        this.updateImportButton();
    }

    private action(container: HTMLElement, iconId: string, text: string, callback: () => void): void {
        const button = container.createEl('button', { cls: 'lorebase-sr-action', attr: { type: 'button', title: text } });
        setIcon(button, iconId);
        button.createSpan({ text });
        button.addEventListener('click', callback);
    }

    private refresh(): void { this.render(); }

    private updateImportButton(): void {
        if (!this.importButton) return;
        this.importButton.setText(this.selected.size ? `Import ${this.selected.size}` : 'Import selected');
        this.importButton.disabled = this.selected.size === 0;
    }
}
