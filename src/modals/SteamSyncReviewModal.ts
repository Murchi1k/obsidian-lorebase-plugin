
import { renderImportCardMetadata, createImportFilter, importReviewHint } from './importReviewControls';
import { App, Modal, setIcon } from 'obsidian';
import { t } from '../localization';
import type { SteamImportCandidate } from '../services/SteamSyncService';
import { getSteamVerticalImageCandidates } from '../services/integrations/steamImages';
import { getSteamImportDisplayName, isSteamPlaceholderName, type SteamPreviewNameResolver } from '../services/integrations/steamPreview';
import type { Language } from '../types';
import type { InlineSyncPresentation } from './inlineSync';

type SteamReviewFilter = 'all' | 'played' | 'wishlist';
const PAGE_SIZE = 20;
const LABELS = {
    ru: { games: 'игр', loadingName: 'Получаем название…' }, uk: { games: 'ігор', loadingName: 'Отримуємо назву…' },
    en: { games: 'games', loadingName: 'Loading title…' }, 'zh-CN': { games: '款游戏', loadingName: '正在获取名称…' },
};
const TEXT = {
    en: { title: 'Steam Sync', subtitle: 'Choose the games to add or update. Nothing is selected automatically.', searchPlaceholder: 'Search your Steam library…', played: 'Played', wishlist: 'Wishlist', all: 'All', clear: 'Clear selection', selected: 'Selected', empty: 'No matching games.', cancel: 'Cancel', import: 'Import', library: 'In Steam', libraryWishlist: 'Steam + wishlist', hours: 'h', selectShown: 'Select matching games' },
    ru: { title: 'Steam Sync', subtitle: 'Выберите игры для добавления или обновления. Автоматически ничего не выбрано.', searchPlaceholder: 'Поиск в библиотеке Steam…', played: 'Играл', wishlist: 'Вишлист', all: 'Все', clear: 'Снять выбор', selected: 'Выбрано', empty: 'Подходящих игр нет.', cancel: 'Отмена', import: 'Импорт', library: 'В Steam', libraryWishlist: 'Steam + вишлист', hours: 'ч', selectShown: 'Выбрать найденные' },
    uk: { title: 'Steam Sync', subtitle: 'Виберіть ігри для додавання або оновлення. Автоматично нічого не вибрано.', searchPlaceholder: 'Пошук у бібліотеці Steam…', played: 'Грав', wishlist: 'Бажане', all: 'Усе', clear: 'Зняти вибір', selected: 'Вибрано', empty: 'Відповідних ігор немає.', cancel: 'Скасувати', import: 'Імпорт', library: 'У Steam', libraryWishlist: 'Steam + бажане', hours: 'год', selectShown: 'Вибрати знайдені' },
    'zh-CN': { title: 'Steam 同步', subtitle: '选择要添加或更新的游戏，默认不选择任何游戏。', searchPlaceholder: '搜索 Steam 游戏库…', played: '玩过', wishlist: '愿望单', all: '全部', clear: '清除选择', selected: '已选择', empty: '没有匹配的游戏。', cancel: '取消', import: '导入', library: 'Steam 游戏库', libraryWishlist: 'Steam + 愿望单', hours: '小时', selectShown: '选择匹配的游戏' },
};

export class SteamSyncReviewModal extends Modal {
    private selected = new Set<number>();
    private resolve?: (value: Set<number> | null) => void;
    private hasResolved = false;
    private query = '';
    private activeFilter: SteamReviewFilter = 'all';
    private page = 1;
    private listEl?: HTMLElement;
    private countEl?: HTMLElement;
    private filterEl?: HTMLElement;
    private paginationEl?: HTMLElement;
    private importBtn?: HTMLButtonElement;
    private selectAllButton?: HTMLButtonElement;
    private clearButton?: HTMLButtonElement;
    private rows = new Map<number, HTMLElement>();
    private pendingNames = new Set<number>();
    private namesStarted = false;
    private inline?: InlineSyncPresentation;
    private removeAbort?: () => void;

    constructor(app: App, private candidates: SteamImportCandidate[], private language: Language = 'en', private nameResolver?: SteamPreviewNameResolver) {
        super(app);
        if (nameResolver) candidates.filter(item => isSteamPlaceholderName(item.name)).forEach(item => this.pendingNames.add(item.appId));
    }
    private get root(): HTMLElement { return this.inline?.host ?? this.contentEl; }
    private text(key: keyof typeof TEXT.en): string { return TEXT[this.language][key]; }

    openAndGetValue(): Promise<Set<number> | null> {
        return new Promise(resolve => { this.resolve = resolve; this.open(); });
    }

    mountInline(presentation: InlineSyncPresentation): Promise<Set<number> | null> {
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
        if (!this.hasResolved) { this.hasResolved = true; this.resolve?.(null); }
        this.rows.clear();
        this.root.empty();
    }

    private finish(value: Set<number> | null): void {
        if (this.hasResolved) return;
        this.hasResolved = true;
        this.removeAbort?.();
        this.resolve?.(value);
        if (!this.inline) this.close();
    }

    private render(): void {
        const root = this.root;
        root.empty();
        root.addClass('lorebase-steam-sync-review');
        if (!this.inline) {
            const header = root.createDiv({ cls: 'lorebase-select-header' });
            const title = header.createDiv({ cls: 'lorebase-select-title-row' });
            setIcon(title.createSpan({ cls: 'lorebase-select-title-icon' }), 'download');
            title.createEl('h2', { cls: 'lorebase-select-title', text: this.text('title') });
        }
        const shell = root.createDiv({ cls: 'lorebase-select-search-shell' });
        const wrap = shell.createDiv({ cls: 'lorebase-select-search-wrap' });
        const field = wrap.createDiv({ cls: 'lorebase-select-search-field' });
        setIcon(field.createSpan({ cls: 'lorebase-select-search-icon' }), 'search');
        const search = field.createEl('input', { cls: 'lorebase-select-search', attr: { type: 'search', placeholder: this.text('searchPlaceholder'), 'aria-label': this.text('searchPlaceholder') } });
        search.value = this.query;
        search.addEventListener('input', () => { this.query = search.value.trim().toLocaleLowerCase(); this.page = 1; this.renderList(); });

        const controls = shell.createDiv({ cls: 'lorebase-steam-sync-controls' });
        this.filterEl = controls.createDiv({ cls: 'lorebase-select-providers lorebase-steam-filters' });
        this.renderFilters();
        const actions = controls.createDiv({ cls: 'lorebase-steam-bulk-actions' });
        this.selectAllButton = this.action(actions, 'check-check', this.text('selectShown'), () => {
            this.getFilteredCandidates().forEach(candidate => this.selected.add(candidate.appId));
            this.refreshSelection();
        });
        this.clearButton = this.action(actions, 'x', this.text('clear'), () => { this.selected.clear(); this.refreshSelection(); });

        this.listEl = root.createDiv({ cls: 'lorebase-select-grid lorebase-select-search-grid lorebase-steam-gallery' });
        this.paginationEl = root.createDiv({ cls: 'lorebase-select-pagination' });
        const footer = root.createDiv({ cls: 'lorebase-modal-actions lorebase-select-footer' });
        this.countEl = footer.createDiv({ cls: 'lorebase-steam-selection-count', attr: { 'aria-live': 'polite', title: this.text('subtitle') } });
        const cancel = this.action(footer, 'x', this.text('cancel'), () => this.finish(null), 'lorebase-flow-btn lorebase-flow-btn-secondary');
        cancel.dataset.action = 'cancel-steam';
        this.importBtn = this.action(footer, 'download', this.text('import'), () => this.finish(new Set(this.selected)), 'lorebase-flow-btn lorebase-flow-btn-primary');
        this.importBtn.dataset.action = 'import-steam';
        this.renderList();
        search.focus();
        void this.hydrateNames();
    }

    private action(host: HTMLElement, iconName: string, label: string, click: () => void, cls = 'lorebase-steam-bulk-action'): HTMLButtonElement {
        const button = host.createEl('button', { cls, attr: { type: 'button', title: label === this.text('selectShown') ? importReviewHint(this.language, 'select') : label === this.text('clear') ? importReviewHint(this.language, 'clear') : label, 'aria-label': label } });
        setIcon(button.createSpan({ cls: 'lorebase-flow-btn-icon' }), iconName);
        button.createSpan({ cls: 'lorebase-flow-btn-label', text: label });
        button.addEventListener('click', click);
        return button;
    }

    private renderFilters(): void {
        if (!this.filterEl) return;
        this.filterEl.empty();
        const counts = {
            all: this.candidates.length, played: this.candidates.filter(c => c.playtimeForever > 0).length,
            wishlist: this.candidates.filter(c => c.source !== 'owned').length,
        };
        for (const id of ['all', 'played', 'wishlist'] as const) {
            createImportFilter(this.filterEl, { id, label: this.text(id), count: counts[id],
                icon: id === 'all' ? 'layers-2' : id === 'played' ? 'gamepad-2' : 'heart',
                active: id === this.activeFilter, hint: importReviewHint(this.language, id),
                select: () => { this.activeFilter = id; this.page = 1; this.renderFilters(); this.renderList(); } });
        }
    }

    private renderList(): void {
        if (!this.listEl) return;
        const filtered = this.getFilteredCandidates();
        const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
        this.page = Math.min(this.page, pages);
        this.listEl.empty();
        this.rows.clear();
        if (!filtered.length) this.listEl.createDiv({ cls: 'lorebase-select-empty', text: this.text('empty') });
        for (const candidate of filtered.slice((this.page - 1) * PAGE_SIZE, this.page * PAGE_SIZE)) {
            const checked = this.selected.has(candidate.appId);
            const name = this.displayName(candidate);
            const card = this.listEl.createEl('button', { cls: 'lorebase-select-card', attr: { type: 'button', 'data-app-id': String(candidate.appId), 'aria-label': name, 'aria-pressed': String(checked), title: name } });
            card.toggleClass('is-picked', checked);
            this.rows.set(candidate.appId, card);
            const art = card.createDiv({ cls: 'lorebase-select-card-image is-empty' });
            setIcon(art.createSpan({ cls: 'lorebase-select-empty-poster-icon', attr: { 'aria-hidden': 'true' } }), 'image');
            const urls = Array.from(new Set([candidate.poster, ...getSteamVerticalImageCandidates(candidate.appId), candidate.posterHorizontal,
                `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${candidate.appId}/header.jpg`].filter((url): url is string => !!url)));
            const image = art.createEl('img', { cls: 'lorebase-steam-poster', attr: { src: urls[0], loading: 'lazy', alt: '' } });
            let imageIndex = 0;
            image.addEventListener('load', () => art.removeClass('is-empty'));
            image.addEventListener('error', () => { const next = urls[++imageIndex]; if (next) image.src = next; else { image.remove(); art.addClass('is-empty'); } });
            const source = candidate.source === 'owned' ? this.text('library') : candidate.source === 'owned_wishlist' ? this.text('libraryWishlist') : this.text('wishlist');
            if (this.activeFilter === 'all') art.createSpan({ cls: 'lorebase-select-classification', text: source });
            card.createDiv({ cls: 'lorebase-select-card-check' });
            const body = card.createDiv({ cls: 'lorebase-select-card-body' });
            body.createDiv({ cls: 'lorebase-select-card-title', text: name });
            card.toggleClass('is-title-loading', this.pendingNames.has(candidate.appId));
            const hours = Math.round(candidate.playtimeForever / 6) / 10;
            renderImportCardMetadata(card, art, body, Boolean(candidate.alreadyInLibrary), hours > 0 ? `${hours} ${this.text('hours')}` : '');
            card.addEventListener('click', () => {
                if (this.selected.has(candidate.appId)) this.selected.delete(candidate.appId);
                else this.selected.add(candidate.appId);
                card.toggleClass('is-picked', this.selected.has(candidate.appId));
                card.setAttribute('aria-pressed', String(this.selected.has(candidate.appId)));
                this.updateCount();
            });
        }
        if (this.paginationEl) {
            this.paginationEl.empty();
            this.paginationEl.hidden = pages <= 1;
            if (pages > 1) {
                const previous = this.action(this.paginationEl, 'chevron-left', t('promptPreviousPage'), () => { this.page--; this.renderList(); });
                previous.disabled = this.page <= 1;
                this.paginationEl.createSpan({ text: `${this.page} / ${pages}` });
                const next = this.action(this.paginationEl, 'chevron-right', t('promptNextPage'), () => { this.page++; this.renderList(); });
                next.disabled = this.page >= pages;
            }
        }
        this.updateCount();
        this.listEl.scrollTop = 0;
    }

    private refreshSelection(): void {
        for (const [appId, card] of this.rows) {
            card.toggleClass('is-picked', this.selected.has(appId));
            card.setAttribute('aria-pressed', String(this.selected.has(appId)));
        }
        this.updateCount();
    }

    private updateCount(): void {
        if (this.clearButton) this.clearButton.disabled = this.selected.size === 0;
        if (this.selectAllButton) this.selectAllButton.disabled = !this.getFilteredCandidates().some(item => !this.selected.has(item.appId));
        this.countEl?.setText(`${this.getFilteredCandidates().length} ${LABELS[this.language].games}`);
        if (this.importBtn) {
            this.importBtn.disabled = this.selected.size === 0;
            this.importBtn.querySelector('.lorebase-flow-btn-label')?.setText(`${this.text('import')}${this.selected.size ? ` (${this.selected.size})` : ''}`);
        }
    }

    private getFilteredCandidates(): SteamImportCandidate[] {
        return this.candidates.filter(candidate => {
            if (this.activeFilter === 'played' && candidate.playtimeForever <= 0) return false;
            if (this.activeFilter === 'wishlist' && candidate.source === 'owned') return false;
            return !this.query || candidate.name.toLocaleLowerCase().includes(this.query) || String(candidate.appId).includes(this.query);
        });
    }

    private displayName(candidate: SteamImportCandidate): string {
        return this.pendingNames.has(candidate.appId) ? LABELS[this.language].loadingName : getSteamImportDisplayName(candidate.name, this.language);
    }

    private async hydrateNames(): Promise<void> {
        if (!this.nameResolver || this.namesStarted) return;
        this.namesStarted = true;
        const ids = [...this.pendingNames];
        for (let offset = 0; offset < ids.length && !this.hasResolved && !this.inline?.signal.aborted; offset += 40) {
            const batch = ids.slice(offset, offset + 40);
            const names = await this.nameResolver(batch).catch((): Record<number, string> => ({}));
            if (this.hasResolved || this.inline?.signal.aborted) return;
            for (const candidate of this.candidates) {
                if (!batch.includes(candidate.appId)) continue;
                const name = names[candidate.appId];
                if (name && !isSteamPlaceholderName(name)) candidate.name = name;
                this.pendingNames.delete(candidate.appId);
                const card = this.rows.get(candidate.appId);
                if (card) {
                    const title = this.displayName(candidate);
                    card.querySelector('.lorebase-select-card-title')?.setText(title);
                    card.setAttribute('aria-label', title);
                    card.setAttribute('title', title);
                    card.removeClass('is-title-loading');
                }
            }
            // Searching also finds titles which arrived after the query was entered.
            if (this.query) this.renderList();
        }
    }
}
