import { App, Modal, setIcon } from 'obsidian';
import type { SteamImportCandidate } from '../services/SteamSyncService';
import type { Language } from '../types';

type SteamReviewFilter = 'all' | 'played' | 'wishlist' | 'selected';

type SteamReviewTextKey =
    | 'title'
    | 'subtitle'
    | 'searchPlaceholder'
    | 'played'
    | 'wishlist'
    | 'all'
    | 'clear'
    | 'selected'
    | 'shown'
    | 'total'
    | 'empty'
    | 'cancel'
    | 'import'
    | 'library'
    | 'libraryWishlist'
    | 'hours';

const STEAM_REVIEW_TEXT: Record<Language, Record<SteamReviewTextKey, string>> = {
    en: {
        title: 'Steam Sync',
        subtitle: 'Nothing is selected by default. Pick only the games you want to create or update in LOREBASE.',
        searchPlaceholder: 'Search games...',
        played: 'Played',
        wishlist: 'Wishlist',
        all: 'All',
        clear: 'Clear',
        selected: 'Selected',
        shown: 'shown',
        total: 'total',
        empty: 'No games match the current search.',
        cancel: 'Cancel',
        import: 'Import',
        library: 'library',
        libraryWishlist: 'library + wishlist',
        hours: 'h',
    },
    ru: {
        title: '\u0421\u0438\u043d\u0445\u0440\u043e\u043d\u0438\u0437\u0430\u0446\u0438\u044f Steam',
        subtitle: '\u041f\u043e \u0443\u043c\u043e\u043b\u0447\u0430\u043d\u0438\u044e \u043d\u0438\u0447\u0435\u0433\u043e \u043d\u0435 \u0432\u044b\u0431\u0440\u0430\u043d\u043e. \u041e\u0442\u043c\u0435\u0442\u044c\u0442\u0435 \u0442\u043e\u043b\u044c\u043a\u043e \u0438\u0433\u0440\u044b, \u043a\u043e\u0442\u043e\u0440\u044b\u0435 \u043d\u0443\u0436\u043d\u043e \u0441\u043e\u0437\u0434\u0430\u0442\u044c \u0438\u043b\u0438 \u043e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u0432 LOREBASE.',
        searchPlaceholder: '\u041f\u043e\u0438\u0441\u043a \u0438\u0433\u0440...',
        played: '\u0421 \u043f\u0440\u043e\u0433\u0440\u0435\u0441\u0441\u043e\u043c',
        wishlist: '\u0412\u0438\u0448\u043b\u0438\u0441\u0442',
        all: '\u0412\u0441\u0435',
        clear: '\u041e\u0447\u0438\u0441\u0442\u0438\u0442\u044c',
        selected: '\u0412\u044b\u0431\u0440\u0430\u043d\u043e',
        shown: '\u043f\u043e\u043a\u0430\u0437\u0430\u043d\u043e',
        total: '\u0432\u0441\u0435\u0433\u043e',
        empty: '\u041d\u0435\u0442 \u0438\u0433\u0440 \u043f\u043e\u0434 \u0442\u0435\u043a\u0443\u0449\u0438\u0439 \u043f\u043e\u0438\u0441\u043a.',
        cancel: '\u041e\u0442\u043c\u0435\u043d\u0430',
        import: '\u0418\u043c\u043f\u043e\u0440\u0442',
        library: '\u0431\u0438\u0431\u043b\u0438\u043e\u0442\u0435\u043a\u0430',
        libraryWishlist: '\u0431\u0438\u0431\u043b\u0438\u043e\u0442\u0435\u043a\u0430 + \u0432\u0438\u0448\u043b\u0438\u0441\u0442',
        hours: '\u0447',
    },
    uk: {
        title: 'Синхронізація Steam',
        subtitle: 'За замовчуванням нічого не вибрано. Позначте тільки ігри, які потрібно створити або оновити в LOREBASE.',
        searchPlaceholder: 'Пошук ігор...',
        played: 'З прогресом',
        wishlist: 'Бажане',
        all: 'Усе',
        clear: 'Очистити',
        selected: 'Вибрано',
        shown: 'показано',
        total: 'усього',
        empty: 'Немає ігор під поточний пошук.',
        cancel: 'Скасувати',
        import: 'Імпорт',
        library: 'бібліотека',
        libraryWishlist: 'бібліотека + бажане',
        hours: 'год',
    },
    'zh-CN': {
        title: 'Steam 同步',
        subtitle: '默认不选择任何游戏。请只选择要在 LOREBASE 中创建或更新的游戏。',
        searchPlaceholder: '搜索游戏…',
        played: '玩过',
        wishlist: '愿望单',
        all: '全部',
        clear: '清除',
        selected: '已选择',
        shown: '当前显示',
        total: '总计',
        empty: '没有符合当前搜索条件的游戏。',
        cancel: '取消',
        import: '导入',
        library: '游戏库',
        libraryWishlist: '游戏库 + 愿望单',
        hours: '小时',
    },
};

export class SteamSyncReviewModal extends Modal {
    private candidates: SteamImportCandidate[];
    private language: Language;
    private selected = new Set<number>();
    private resolve?: (value: Set<number> | null) => void;
    private hasResolved = false;
    private query = '';
    private activeFilter: SteamReviewFilter = 'all';
    private listEl?: HTMLElement;
    private countEl?: HTMLElement;
    private filterEl?: HTMLElement;
    private importBtn?: HTMLButtonElement;
    private searchTimerId: number | null = null;
    private rows = new Map<number, HTMLElement>();
    private filterCounts = new Map<SteamReviewFilter, HTMLElement>();

    constructor(app: App, candidates: SteamImportCandidate[], language: Language = 'en') {
        super(app);
        this.candidates = candidates;
        this.language = language;
    }

    openAndGetValue(): Promise<Set<number> | null> {
        return new Promise(resolve => {
            this.resolve = resolve;
            this.open();
        });
    }

    onOpen(): void {
        this.modalEl.addClass('lorebase-steam-review-modal-container');
        this.render();
    }

    onClose(): void {
        if (this.searchTimerId !== null) {
            window.clearTimeout(this.searchTimerId);
            this.searchTimerId = null;
        }
        this.modalEl.removeClass('lorebase-steam-review-modal-container');
        if (!this.hasResolved) {
            this.resolve?.(null);
        }
        this.contentEl.empty();
    }

    private render(): void {
        this.contentEl.empty();
        this.contentEl.addClass('lorebase-steam-review-modal');

        const header = this.contentEl.createDiv({ cls: 'lorebase-sr-header' });
        const titleRow = header.createDiv({ cls: 'lorebase-sr-title-row' });
        const titleIcon = titleRow.createSpan({ cls: 'lorebase-sr-title-icon' });
        setIcon(titleIcon, 'download');
        titleRow.createSpan({ cls: 'lorebase-sr-title-text', text: this.text('title') });
        header.createDiv({
            cls: 'lorebase-sr-subtitle',
            text: this.text('subtitle'),
        });

        const toolbar = this.contentEl.createDiv({ cls: 'lorebase-sr-toolbar' });
        const searchWrap = toolbar.createDiv({ cls: 'lorebase-sr-search-wrap' });
        const searchIcon = searchWrap.createSpan({ cls: 'lorebase-sr-search-icon' });
        setIcon(searchIcon, 'search');
        const search = searchWrap.createEl('input', {
            cls: 'lorebase-sr-search',
            attr: { type: 'text', placeholder: this.text('searchPlaceholder') },
        });
        search.value = this.query;
        search.addEventListener('input', () => {
            this.query = search.value.trim().toLowerCase();
            if (this.searchTimerId !== null) window.clearTimeout(this.searchTimerId);
            this.searchTimerId = window.setTimeout(() => {
                this.searchTimerId = null;
                this.renderList();
            }, 100);
        });

        const actions = toolbar.createDiv({ cls: 'lorebase-sr-actions' });
        this.createActionPill(actions, 'gamepad-2', this.text('played'), () => {
            this.selected.clear();
            for (const c of this.candidates) {
                if (c.playtimeForever > 0) this.selected.add(c.appId);
            }
            this.refresh();
        });
        this.createActionPill(actions, 'heart', this.text('wishlist'), () => {
            this.selected.clear();
            for (const c of this.candidates) {
                if (c.source === 'wishlist' || c.source === 'owned_wishlist') this.selected.add(c.appId);
            }
            this.refresh();
        });
        this.createActionPill(actions, 'check-check', this.text('all'), () => {
            for (const c of this.candidates) this.selected.add(c.appId);
            this.refresh();
        });
        this.createActionPill(actions, 'x', this.text('clear'), () => {
            this.selected.clear();
            this.refresh();
        });

        this.filterEl = this.contentEl.createDiv({ cls: 'lorebase-sr-filters' });
        this.renderFilters();

        this.countEl = this.contentEl.createDiv({ cls: 'lorebase-sr-count' });

        this.listEl = this.contentEl.createDiv({ cls: 'lorebase-sr-list' });
        this.renderList();

        const footer = this.contentEl.createDiv({ cls: 'lorebase-sr-footer lorebase-select-footer' });
        const cancelBtn = footer.createEl('button', {
            cls: 'lorebase-flow-btn lorebase-flow-btn-secondary',
            attr: { type: 'button' },
        });
        const cancelIcon = cancelBtn.createSpan({ cls: 'lorebase-flow-btn-icon' });
        setIcon(cancelIcon, 'x');
        cancelBtn.createSpan({ cls: 'lorebase-flow-btn-label', text: this.text('cancel') });
        this.importBtn = footer.createEl('button', {
            cls: 'lorebase-flow-btn lorebase-flow-btn-primary lorebase-sr-btn-import',
            attr: { type: 'button' },
        });
        this.updateImportButton();

        cancelBtn.addEventListener('click', () => {
            this.hasResolved = true;
            this.resolve?.(null);
            this.close();
        });

        this.importBtn.addEventListener('click', () => {
            this.hasResolved = true;
            this.resolve?.(new Set(this.selected));
            this.close();
        });

        search.focus();
    }

    private renderList(): void {
        if (!this.listEl || !this.countEl) return;

        const filtered = this.getFilteredCandidates();
        this.countEl.setText(`${this.selected.size} ${this.text('selected').toLowerCase()} В· ${filtered.length} ${this.text('shown')} В· ${this.candidates.length} ${this.text('total')}`);
        this.updateCount(filtered.length);
        this.listEl.empty();
        this.rows.clear();

        if (!filtered.length) {
            const empty = this.listEl.createDiv({ cls: 'lorebase-sr-empty' });
            const emptyIcon = empty.createSpan({ cls: 'lorebase-sr-empty-icon' });
            setIcon(emptyIcon, 'search-x');
            empty.createSpan({ text: this.text('empty') });
            return;
        }

        for (const candidate of filtered) {
            const checked = this.selected.has(candidate.appId);
            const row = this.listEl.createDiv({
                cls: 'lorebase-sr-row',
                attr: {
                    role: 'checkbox',
                    tabindex: '0',
                    'aria-checked': String(checked),
                },
            });
            row.toggleClass('is-selected', checked);
            this.rows.set(candidate.appId, row);

            const thumb = row.createDiv({ cls: 'lorebase-sr-thumb' });
            const imageUrls = this.getImageUrls(candidate);
            const img = thumb.createEl('img', {
                attr: {
                    src: imageUrls[0] ?? '',
                    alt: candidate.name,
                    loading: 'lazy',
                },
            });
            let imageIndex = 0;
            img.addEventListener('error', () => {
                imageIndex++;
                const nextUrl = imageUrls[imageIndex];
                if (nextUrl) {
                    img.src = nextUrl;
                    return;
                }
                img.addClass('is-hidden');
                thumb.addClass('is-fallback');
                if (!thumb.querySelector('.lorebase-sr-thumb-fallback')) {
                    const fallbackIcon = thumb.createSpan({ cls: 'lorebase-sr-thumb-fallback' });
                    setIcon(fallbackIcon, 'gamepad-2');
                }
            });

            const body = row.createDiv({ cls: 'lorebase-sr-body' });
            body.createDiv({ cls: 'lorebase-sr-game-title', text: candidate.name });

            const metaRow = body.createDiv({ cls: 'lorebase-sr-meta' });

            const sourceBadge = metaRow.createSpan({ cls: 'lorebase-sr-badge' });
            const sourceLabel = this.formatSource(candidate.source);
            if (candidate.source === 'wishlist' || candidate.source === 'owned_wishlist') {
                sourceBadge.addClass('is-wishlist');
            }
            sourceBadge.setText(sourceLabel);

            const ptBadge = metaRow.createSpan({ cls: 'lorebase-sr-badge is-playtime' });
            const ptIcon = ptBadge.createSpan({ cls: 'lorebase-sr-badge-icon' });
            setIcon(ptIcon, 'clock');
            ptBadge.createSpan({ text: candidate.playtimeForever > 0 ? this.formatPlaytime(candidate.playtimeForever) : `0${this.text('hours')}` });

            const checkbox = row.createDiv({ cls: 'lorebase-sr-checkbox' });
            checkbox.toggleClass('is-checked', checked);
            const checkIcon = checkbox.createSpan({ cls: 'lorebase-sr-check-icon' });
            setIcon(checkIcon, 'check');

            const toggle = (): void => {
                if (this.selected.has(candidate.appId)) {
                    this.selected.delete(candidate.appId);
                } else {
                    this.selected.add(candidate.appId);
                }
                this.updateSelectedRow(candidate.appId, row);
            };

            row.addEventListener('click', toggle);
            row.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                toggle();
            });
        }
    }

    private renderFilters(): void {
        if (!this.filterEl) return;
        this.filterEl.empty();
        this.filterCounts.clear();
        const filters: Array<{ id: SteamReviewFilter; label: string; count: number; icon: string }> = [
            { id: 'all', label: this.text('all'), count: this.candidates.length, icon: 'layout-grid' },
            { id: 'played', label: this.text('played'), count: this.candidates.filter(c => c.playtimeForever > 0).length, icon: 'gamepad-2' },
            { id: 'wishlist', label: this.text('wishlist'), count: this.candidates.filter(c => c.source === 'wishlist' || c.source === 'owned_wishlist').length, icon: 'heart' },
            { id: 'selected', label: this.text('selected'), count: this.selected.size, icon: 'check-circle' },
        ];

        for (const filter of filters) {
            const chip = this.filterEl.createEl('button', {
                cls: 'lorebase-sr-filter-chip',
                attr: { type: 'button' },
            });
            chip.toggleClass('is-active', filter.id === this.activeFilter);

            const chipLabel = chip.createSpan({ text: filter.label });
            chipLabel.addClass('lorebase-sr-filter-label');

            const count = chip.createSpan({ cls: 'lorebase-sr-filter-count', text: String(filter.count) });
            this.filterCounts.set(filter.id, count);

            chip.addEventListener('click', () => {
                this.activeFilter = filter.id;
                this.renderFilters();
                this.renderList();
            });
        }
    }

    private refresh(): void {
        this.renderFilters();
        if (this.activeFilter === 'selected') {
            this.renderList();
        } else {
            for (const [appId, row] of this.rows) {
                const checked = this.selected.has(appId);
                row.toggleClass('is-selected', checked);
                row.setAttr('aria-checked', String(checked));
                row.querySelector<HTMLElement>('.lorebase-sr-checkbox')?.toggleClass('is-checked', checked);
            }
            this.updateCount();
        }
        this.updateImportButton();
    }

    private updateSelectedRow(appId: number, row: HTMLElement): void {
        const checked = this.selected.has(appId);
        row.toggleClass('is-selected', checked);
        row.setAttr('aria-checked', String(checked));
        row.querySelector<HTMLElement>('.lorebase-sr-checkbox')?.toggleClass('is-checked', checked);

        if (this.activeFilter === 'selected' && !checked) {
            row.remove();
            this.rows.delete(appId);
        }

        this.filterCounts.get('selected')?.setText(String(this.selected.size));
        this.updateCount();
        this.updateImportButton();
    }

    private updateCount(filteredCount = this.getFilteredCandidates().length): void {
        if (!this.countEl) return;
        this.countEl.setText([
            `${this.selected.size} ${this.text('selected').toLowerCase()}`,
            `${filteredCount} ${this.text('shown')}`,
            `${this.candidates.length} ${this.text('total')}`,
        ].join(' / '));
    }

    private updateImportButton(): void {
        if (!this.importBtn) return;
        const count = this.selected.size;
        this.importBtn.empty();
        const icon = this.importBtn.createSpan({ cls: 'lorebase-flow-btn-icon lorebase-sr-btn-icon' });
        setIcon(icon, 'download');
        const label = this.text('import');
        this.importBtn.createSpan({ cls: 'lorebase-flow-btn-label', text: count > 0 ? `${label} (${count})` : label });
        this.importBtn.disabled = count === 0;
    }

    private getFilteredCandidates(): SteamImportCandidate[] {
        return this.candidates.filter((candidate) => {
            if (this.activeFilter === 'selected' && !this.selected.has(candidate.appId)) return false;
            if (this.activeFilter === 'played' && candidate.playtimeForever <= 0) return false;
            if (this.activeFilter === 'wishlist' && candidate.source !== 'wishlist' && candidate.source !== 'owned_wishlist') return false;
            if (!this.query) return true;
            return candidate.name.toLowerCase().includes(this.query)
                || String(candidate.appId).includes(this.query);
        });
    }

    private createActionPill(container: HTMLElement, iconName: string, text: string, onClick: () => void): void {
        const btn = container.createEl('button', { cls: 'lorebase-sr-action-pill', attr: { type: 'button' } });
        const icon = btn.createSpan({ cls: 'lorebase-sr-action-icon' });
        setIcon(icon, iconName);
        btn.createSpan({ text });
        btn.addEventListener('click', onClick);
    }

    private formatSource(source: SteamImportCandidate['source']): string {
        if (source === 'owned_wishlist') return this.text('libraryWishlist');
        if (source === 'wishlist') return this.text('wishlist').toLowerCase();
        return this.text('library');
    }

    private formatPlaytime(minutes: number): string {
        const hours = Math.round((minutes / 60) * 10) / 10;
        return `${hours}${this.text('hours')}`;
    }

    private getImageUrls(candidate: SteamImportCandidate): string[] {
        return [
            candidate.poster,
            candidate.posterHorizontal,
            this.getCdnImageUrl(candidate.appId, 'header.jpg'),
            this.getStoreAssetImageUrl(candidate.appId, 'header.jpg'),
            this.getCdnImageUrl(candidate.appId, 'capsule_616x353.jpg'),
            this.getStoreAssetImageUrl(candidate.appId, 'capsule_616x353.jpg'),
            this.getCdnImageUrl(candidate.appId, 'capsule_231x87.jpg'),
            this.getStoreAssetImageUrl(candidate.appId, 'capsule_231x87.jpg'),
        ].filter((url, index, urls): url is string => Boolean(url) && urls.indexOf(url) === index);
    }

    private getCdnImageUrl(appId: number, fileName: string): string {
        return `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/${fileName}`;
    }

    private getStoreAssetImageUrl(appId: number, fileName: string): string {
        return `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/${fileName}`;
    }

    private text(key: SteamReviewTextKey): string {
        return STEAM_REVIEW_TEXT[this.language]?.[key] ?? STEAM_REVIEW_TEXT.en[key];
    }
}
