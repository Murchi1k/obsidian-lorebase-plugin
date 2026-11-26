
import { renderImportCardMetadata, createImportFilter, importReviewHint } from './importReviewControls';
import { App, Modal, setIcon } from 'obsidian';
import { t } from '../localization';
import type { Language } from '../types';
import type { AniListImportCandidate } from '../services/AniListSyncService';
import type { InlineSyncPresentation } from './inlineSync';

type Filter = 'all' | 'anime' | 'manga';
const PAGE_SIZE = 20;
const COPY = {
    ru: { title: 'Импорт из AniList', search: 'Поиск в списке AniList…', all: 'Все', anime: 'Аниме', manga: 'Манга', select: 'Выбрать найденные', clear: 'Снять выбор', import: 'Импорт', entries: 'записей', empty: 'Подходящих записей нет.', linked: 'В библиотеке', progress: 'Прогресс' },
    uk: { title: 'Імпорт з AniList', search: 'Пошук у списку AniList…', all: 'Усе', anime: 'Аніме', manga: 'Манґа', select: 'Вибрати знайдені', clear: 'Зняти вибір', import: 'Імпорт', entries: 'записів', empty: 'Відповідних записів немає.', linked: 'У бібліотеці', progress: 'Прогрес' },
    en: { title: 'Import from AniList', search: 'Search your AniList collection…', all: 'All', anime: 'Anime', manga: 'Manga', select: 'Select matching entries', clear: 'Clear selection', import: 'Import', entries: 'entries', empty: 'No matching entries.', linked: 'In library', progress: 'Progress' },
    'zh-CN': { title: '从 AniList 导入', search: '搜索 AniList 收藏…', all: '全部', anime: '动画', manga: '漫画', select: '选择匹配条目', clear: '清除选择', import: '导入', entries: '个条目', empty: '没有匹配条目。', linked: '已在资料库', progress: '进度' },
};

export class AniListImportReviewModal extends Modal {
    private selected = new Set<string>();
    private filter: Filter = 'all';
    private query = '';
    private page = 1;
    private resolve?: (value: Set<string> | null) => void;
    private resolved = false;
    private inline?: InlineSyncPresentation;
    private removeAbort?: () => void;
    private listEl?: HTMLElement;
    private filtersEl?: HTMLElement;
    private countEl?: HTMLElement;
    private paginationEl?: HTMLElement;
    private importButton?: HTMLButtonElement;
    private selectAllButton?: HTMLButtonElement;
    private clearButton?: HTMLButtonElement;
    private get root(): HTMLElement { return this.inline?.host ?? this.contentEl; }
    private get copy() { return COPY[this.language]; }

    constructor(app: App, private readonly candidates: AniListImportCandidate[], private readonly language: Language) { super(app); }

    openAndGetValue(): Promise<Set<string> | null> {
        return new Promise(resolve => { this.resolve = resolve; this.open(); });
    }

    mountInline(presentation: InlineSyncPresentation): Promise<Set<string> | null> {
        this.inline = presentation;
        return new Promise(resolve => {
            this.resolve = resolve;
            const abort = () => this.onClose();
            presentation.signal.addEventListener('abort', abort, { once: true });
            this.removeAbort = () => presentation.signal.removeEventListener('abort', abort);
            if (presentation.signal.aborted) { this.onClose(); return; }
            this.render();
        });
    }

    onOpen(): void {
        this.modalEl.addClass('lorebase-select-modal-container');
        this.contentEl.addClass('lorebase-select-modal', 'lorebase-add-workspace');
        this.render();
    }

    onClose(): void {
        this.removeAbort?.();
        if (!this.resolved) { this.resolved = true; this.resolve?.(null); }
        this.root.empty();
    }

    private finish(value: Set<string> | null): void {
        if (this.resolved) return;
        this.resolved = true;
        this.removeAbort?.();
        this.resolve?.(value);
        if (!this.inline) this.close();
    }

    private render(): void {
        const root = this.root;
        root.empty();
        root.addClass('lorebase-steam-sync-review', 'lorebase-anilist-import-review');
        if (!this.inline) {
            const title = root.createDiv({ cls: 'lorebase-select-header' }).createDiv({ cls: 'lorebase-select-title-row' });
            setIcon(title.createSpan({ cls: 'lorebase-select-title-icon' }), 'download');
            title.createEl('h2', { cls: 'lorebase-select-title', text: this.copy.title });
        }
        const shell = root.createDiv({ cls: 'lorebase-select-search-shell' });
        const field = shell.createDiv({ cls: 'lorebase-select-search-wrap' }).createDiv({ cls: 'lorebase-select-search-field' });
        setIcon(field.createSpan({ cls: 'lorebase-select-search-icon' }), 'search');
        const search = field.createEl('input', { cls: 'lorebase-select-search', attr: { type: 'search', placeholder: this.copy.search, 'aria-label': this.copy.search } });
        search.value = this.query;
        search.addEventListener('input', () => { this.query = search.value.trim().toLocaleLowerCase(); this.page = 1; this.renderList(); });
        const controls = shell.createDiv({ cls: 'lorebase-steam-sync-controls' });
        this.filtersEl = controls.createDiv({ cls: 'lorebase-select-providers lorebase-steam-filters' });
        this.renderFilters();
        const actions = controls.createDiv({ cls: 'lorebase-steam-bulk-actions' });
        this.selectAllButton = this.action(actions, 'check-check', this.copy.select, () => { this.filtered().forEach(item => this.selected.add(item.key)); this.renderList(); });
        this.clearButton = this.action(actions, 'x', this.copy.clear, () => { this.selected.clear(); this.renderList(); });
        this.listEl = root.createDiv({ cls: 'lorebase-select-grid lorebase-select-search-grid lorebase-steam-gallery' });
        this.paginationEl = root.createDiv({ cls: 'lorebase-select-pagination' });
        const footer = root.createDiv({ cls: 'lorebase-modal-actions lorebase-select-footer' });
        this.countEl = footer.createDiv({ cls: 'lorebase-steam-selection-count', attr: { 'aria-live': 'polite' } });
        this.action(footer, 'x', t('commonCancel'), () => this.finish(null), 'lorebase-flow-btn lorebase-flow-btn-secondary');
        this.importButton = this.action(footer, 'download', this.copy.import, () => this.finish(new Set(this.selected)), 'lorebase-flow-btn lorebase-flow-btn-primary');
        this.importButton.dataset.action = 'import-anilist';
        this.renderList();
        search.focus();
    }

    private renderFilters(): void {
        this.filtersEl!.empty();
        for (const id of ['all', 'anime', 'manga'] as const) {
            createImportFilter(this.filtersEl!, { id, label: this.copy[id],
                count: this.candidates.filter(item => id === 'all' || item.kind === id).length,
                icon: id === 'all' ? 'layers-2' : id === 'anime' ? 'clapperboard' : 'book-open',
                active: this.filter === id, hint: importReviewHint(this.language, id),
                select: () => { this.filter = id; this.page = 1; this.renderFilters(); this.renderList(); } });
        }
    }

    private renderList(): void {
        if (!this.listEl || !this.paginationEl) return;
        const items = this.filtered(), pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
        this.page = Math.min(this.page, pages);
        this.listEl.empty();
        if (!items.length) this.listEl.createDiv({ cls: 'lorebase-select-empty', text: this.copy.empty });
        for (const item of items.slice((this.page - 1) * PAGE_SIZE, this.page * PAGE_SIZE)) {
            const card = this.listEl.createEl('button', { cls: 'lorebase-select-card', attr: { type: 'button', 'data-key': item.key, 'aria-label': item.title, title: item.title, 'aria-pressed': String(this.selected.has(item.key)) } });
            card.toggleClass('is-picked', this.selected.has(item.key));
            const art = card.createDiv({ cls: 'lorebase-select-card-image is-empty' });
            setIcon(art.createSpan({ cls: 'lorebase-select-empty-poster-icon', attr: { 'aria-hidden': 'true' } }), item.kind === 'anime' ? 'clapperboard' : 'book-open');
            if (item.image) {
                const image = art.createEl('img', { cls: 'lorebase-steam-poster', attr: { src: item.image, loading: 'lazy', alt: '' } });
                image.addEventListener('load', () => art.removeClass('is-empty'));
                image.addEventListener('error', () => image.remove(), { once: true });
            }
            if (this.filter === 'all') art.createSpan({ cls: 'lorebase-select-classification', text: this.copy[item.kind] });
            card.createDiv({ cls: 'lorebase-select-card-check' });
            const body = card.createDiv({ cls: 'lorebase-select-card-body' });
            body.createDiv({ cls: 'lorebase-select-card-title', text: item.title });
            renderImportCardMetadata(card, art, body, Boolean(item.alreadyInLibrary || item.linked), `${this.copy.progress} ${item.progress}`);
            card.addEventListener('click', () => {
                if (this.selected.has(item.key)) this.selected.delete(item.key); else this.selected.add(item.key);
                card.toggleClass('is-picked', this.selected.has(item.key));
                card.setAttribute('aria-pressed', String(this.selected.has(item.key)));
                this.updateCount();
            });
        }
        this.paginationEl.empty(); this.paginationEl.hidden = pages <= 1;
        if (pages > 1) {
            this.action(this.paginationEl, 'chevron-left', t('promptPreviousPage'), () => { this.page--; this.renderList(); }).disabled = this.page === 1;
            this.paginationEl.createSpan({ text: `${this.page} / ${pages}` });
            this.action(this.paginationEl, 'chevron-right', t('promptNextPage'), () => { this.page++; this.renderList(); }).disabled = this.page === pages;
        }
        this.updateCount(); this.listEl.scrollTop = 0;
    }

    private filtered(): AniListImportCandidate[] {
        return this.candidates.filter(item => (this.filter === 'all' || item.kind === this.filter) && (!this.query || item.title.toLocaleLowerCase().includes(this.query)));
    }
    private updateCount(): void {
        if (this.clearButton) this.clearButton.disabled = this.selected.size === 0;
        if (this.selectAllButton) this.selectAllButton.disabled = !this.filtered().some(item => !this.selected.has(item.key));
        this.countEl?.setText(`${this.filtered().length} ${this.copy.entries}`);
        if (!this.importButton) return;
        this.importButton.disabled = this.selected.size === 0;
        this.importButton.querySelector('.lorebase-flow-btn-label')?.setText(`${this.copy.import}${this.selected.size ? ` (${this.selected.size})` : ''}`);
    }
    private action(host: HTMLElement, icon: string, label: string, click: () => void, cls = 'lorebase-steam-bulk-action'): HTMLButtonElement {
        const button = host.createEl('button', { cls, attr: { type: 'button', 'aria-label': label, title: label === this.copy.select ? importReviewHint(this.language, 'select') : label === this.copy.clear ? importReviewHint(this.language, 'clear') : label } });
        setIcon(button.createSpan({ cls: 'lorebase-flow-btn-icon' }), icon);
        button.createSpan({ cls: 'lorebase-flow-btn-label', text: label });
        button.addEventListener('click', click);
        return button;
    }
}
