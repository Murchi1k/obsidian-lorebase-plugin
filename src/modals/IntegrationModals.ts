/**
 * LOREBASE - Integration Modals
 * Simple input, choice, and search modals for integrations
 */

import { App, Modal, requestUrl, setIcon } from 'obsidian';
import { t } from '../localization';
import { getSteamAppIdFromImageUrl, getSteamVerticalImageCandidates } from '../services/integrations/steamImages';

export class ChoiceModal extends Modal {
    private titleText: string;
    private bodyText: string;
    private confirmText: string;
    private cancelText: string;
    private resolve?: (value: boolean) => void;
    private hasResolved = false;

    constructor(
        app: App,
        titleText: string,
        bodyText: string,
        confirmText: string,
        cancelText: string
    ) {
        super(app);
        this.titleText = titleText;
        this.bodyText = bodyText;
        this.confirmText = confirmText;
        this.cancelText = cancelText;
    }

    openAndGetValue(): Promise<boolean> {
        return new Promise(resolve => {
            this.resolve = resolve;
            this.open();
        });
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: this.titleText });
        contentEl.createDiv({ text: this.bodyText, cls: 'lorebase-modal-body' });

        const actions = contentEl.createDiv({ cls: 'lorebase-modal-actions' });
        const cancelBtn = actions.createEl('button', { text: this.cancelText, cls: 'lorebase-btn' });
        const confirmBtn = actions.createEl('button', { text: this.confirmText, cls: 'lorebase-btn lorebase-btn-primary' });

        cancelBtn.addEventListener('click', () => {
            this.hasResolved = true;
            this.resolve?.(false);
            this.close();
        });

        confirmBtn.addEventListener('click', () => {
            this.hasResolved = true;
            this.resolve?.(true);
            this.close();
        });
    }

    onClose(): void {
        if (!this.hasResolved) {
            this.resolve?.(false);
        }
        const { contentEl } = this;
        contentEl.empty();
    }
}

export interface SearchItem {
    id?: string;
    title: string;
    subtitle?: string;
    image?: string;
    year?: string;
    format?: string;
    status?: string;
    provider?: string;
}

export interface SearchProviderOption {
    id: string;
    label: string;
    disabled?: boolean;
    disabledReason?: string;
}

type SearchOptions = {
    includeDlc?: boolean;
    page?: number;
    pageSize?: number;
};
type SearchHandler<T extends SearchItem> = (query: string, providerId?: string, options?: SearchOptions) => Promise<T[]>;

const AUTO_SEARCH_DEBOUNCE_MS = 350;
const SEARCH_PAGE_SIZE = 10;

export class MultiSelectSearchModal<T extends SearchItem> extends Modal {
    private searchHandler: SearchHandler<T>;
    private items: T[] = [];
    private selected = new Map<string, T>();
    private placeholder: string;
    private titleText: string;
    private emptyText: string;
    private doneText: string;
    private cancelText: string;
    private selectedLabelText: string;
    private titleIcon: string;
    private syncActionText?: string;
    private onSyncAction?: () => void;
    private manualActionText?: string;
    private onManualAction?: () => void;
    private includeDlcToggleText?: string;
    private providerOptions: SearchProviderOption[];
    private activeProviderId?: string;
    private resolve?: (value: T[] | null) => void;
    private hasResolved = false;
    private focusedIndex = 0;
    private searchSeq = 0;
    private searchTimer: number | null = null;
    private currentQuery = '';
    private currentPage = 1;
    private isReviewing = false;
    private includeDlc = false;

    private inputEl?: HTMLInputElement;
    private providerListEl?: HTMLElement;
    private searchOptionsEl?: HTMLElement;
    private gridEl?: HTMLElement;
    private paginationEl?: HTMLElement;
    private doneBtn?: HTMLButtonElement;
    private lastErrorText = '';
    private lastResultCount = 0;
    private isLoading = false;
    private hasNextPage = false;
    private objectUrls: string[] = [];

    constructor(
        app: App,
        searchHandler: SearchHandler<T>,
        options: {
            titleText: string;
            placeholder: string;
            emptyText: string;
            doneText: string;
            cancelText: string;
            selectedLabelText: string;
            providerOptions?: SearchProviderOption[];
            initialProviderId?: string;
            titleIcon?: string;
            syncActionText?: string;
            onSyncAction?: () => void;
            manualActionText?: string;
            onManualAction?: () => void;
            includeDlcToggleText?: string;
        }
    ) {
        super(app);
        this.searchHandler = searchHandler;
        this.titleText = options.titleText;
        this.placeholder = options.placeholder;
        this.emptyText = options.emptyText;
        this.doneText = options.doneText;
        this.cancelText = options.cancelText;
        this.selectedLabelText = options.selectedLabelText;
        this.titleIcon = options.titleIcon ?? 'search';
        this.syncActionText = options.syncActionText;
        this.onSyncAction = options.onSyncAction;
        this.manualActionText = options.manualActionText;
        this.onManualAction = options.onManualAction;
        this.includeDlcToggleText = options.includeDlcToggleText;
        this.providerOptions = options.providerOptions ?? [];
        this.activeProviderId = this.resolveInitialProvider(options.initialProviderId);
    }

    openAndGetValues(): Promise<T[] | null> {
        return new Promise(resolve => {
            this.resolve = resolve;
            this.open();
        });
    }

    onOpen(): void {
        this.modalEl.addClass('lorebase-select-modal-container');
        this.renderSearchView();
        this.modalEl.addEventListener('keydown', this.onKeydown);
    }

    onClose(): void {
        this.modalEl.removeClass('lorebase-select-modal-container');
        this.modalEl.removeEventListener('keydown', this.onKeydown);
        this.clearSearchTimer();
        this.revokeObjectUrls();
        if (!this.hasResolved) {
            this.resolve?.(null);
        }
        this.contentEl.empty();
    }

    private renderSearchView(): void {
        this.isReviewing = false;
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('lorebase-select-modal');
        contentEl.addClass('lorebase-select-multi');

        const header = contentEl.createDiv({ cls: 'lorebase-select-header' });
        const titleRow = header.createDiv({ cls: 'lorebase-select-title-row' });
        const titleIcon = titleRow.createSpan({ cls: 'lorebase-select-title-icon' });
        setIcon(titleIcon, this.titleIcon);
        titleRow.createEl('h2', { cls: 'lorebase-select-title', text: this.titleText });
        const syncBtn = this.onSyncAction && this.syncActionText
            ? this.createHeaderActionButton(titleRow, 'refresh-cw', this.syncActionText)
            : null;
        const manualBtn = this.onManualAction && this.manualActionText
            ? this.createHeaderActionButton(titleRow, 'file-plus-2', this.manualActionText)
            : null;

        const searchShell = contentEl.createDiv({ cls: 'lorebase-select-search-shell' });
        const searchWrap = searchShell.createDiv({ cls: 'lorebase-select-search-wrap' });
        const searchIcon = searchWrap.createSpan({ cls: 'lorebase-select-search-icon' });
        setIcon(searchIcon, 'search');
        this.inputEl = searchWrap.createEl('input', {
            cls: 'lorebase-select-search',
            attr: { type: 'text', placeholder: this.placeholder }
        });
        this.inputEl.value = this.currentQuery;
        const searchControls = searchShell.createDiv({ cls: 'lorebase-select-search-controls' });
        this.providerListEl = searchControls.createDiv({ cls: 'lorebase-select-providers' });
        this.searchOptionsEl = searchControls.createDiv({ cls: 'lorebase-select-search-options' });
        this.renderProviders();
        this.renderSearchOptions();

        this.inputEl.addEventListener('input', () => this.scheduleSearch());
        this.inputEl.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                this.clearSearchTimer();
                void this.runSearch();
            }
        });

        this.gridEl = contentEl.createDiv({ cls: 'lorebase-select-grid lorebase-select-search-grid' });
        this.renderGrid();
        this.paginationEl = contentEl.createDiv({ cls: 'lorebase-select-pagination' });
        this.renderPagination();

        const footer = contentEl.createDiv({ cls: 'lorebase-modal-actions lorebase-select-footer' });
        const cancelBtn = this.createFooterButton(footer, 'x', this.cancelText, 'secondary');
        this.doneBtn = this.createFooterButton(footer, 'check-check', this.doneText, 'primary');
        this.renderSelected();

        cancelBtn.addEventListener('click', () => {
            this.hasResolved = true;
            this.resolve?.(null);
            this.close();
        });

        syncBtn?.addEventListener('click', () => {
            this.hasResolved = true;
            this.resolve?.(null);
            this.close();
            this.onSyncAction?.();
        });
        manualBtn?.addEventListener('click', () => {
            this.hasResolved = true;
            this.resolve?.(null);
            this.close();
            this.onManualAction?.();
        });

        this.doneBtn.addEventListener('click', () => this.renderReviewView());
        this.inputEl.focus();
    }

    private renderReviewView(): void {
        this.isReviewing = true;
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('lorebase-select-modal');
        contentEl.addClass('lorebase-select-multi');

        const header = contentEl.createDiv({ cls: 'lorebase-select-review-header' });
        const titleRow = header.createDiv({ cls: 'lorebase-select-review-title-row' });
        const titleIcon = titleRow.createSpan({ cls: 'lorebase-select-title-icon' });
        setIcon(titleIcon, 'check-check');
        titleRow.createEl('h2', {
            cls: 'lorebase-select-title lorebase-select-review-heading',
            text: `${t('promptReviewSelected')}: ${this.selected.size}`,
        });
        header.createDiv({ cls: 'lorebase-select-review-subtitle', text: t('promptReviewSelectedSubtitle') });

        const list = contentEl.createDiv({ cls: 'lorebase-select-review-gallery' });
        for (const item of this.selected.values()) {
            const card = list.createDiv({ cls: 'lorebase-select-review-card' });
            const image = card.createDiv({ cls: 'lorebase-select-review-poster' });
            if (item.image) {
                image.setCssStyles({ backgroundImage: `url("${item.image}")` });
            } else {
                image.addClass('is-empty');
                const emptyIcon = image.createSpan({ cls: 'lorebase-select-review-empty-icon' });
                setIcon(emptyIcon, 'image-off');
                if (item.provider) {
                    image.createSpan({
                        cls: 'lorebase-select-review-empty-provider',
                        text: this.formatProvider(item.provider),
                    });
                }
            }

            if (item.provider && item.image) {
                image.createSpan({
                    cls: 'lorebase-select-review-provider',
                    text: this.formatProvider(item.provider),
                });
            }

            const remove = card.createEl('button', {
                cls: 'lorebase-select-review-remove',
                attr: {
                    type: 'button',
                    'aria-label': t('promptRemoveSelected'),
                    title: t('promptRemoveSelected'),
                },
            });
            setIcon(remove, 'trash-2');
            remove.addEventListener('click', () => {
                this.selected.delete(this.getItemKey(item));
                this.renderReviewView();
            });

            const body = card.createDiv({ cls: 'lorebase-select-review-body' });
            body.createDiv({ cls: 'lorebase-select-review-title', text: item.title });
            const metaParts = [item.year, item.format, item.status].filter(Boolean);
            if (metaParts.length) {
                body.createDiv({ cls: 'lorebase-select-review-meta', text: metaParts.join(' / ') });
            }
            if (item.subtitle) {
                body.createDiv({ cls: 'lorebase-select-review-subtitle-text', text: item.subtitle });
            }
        }

        if (!this.selected.size) {
            list.createDiv({ cls: 'lorebase-select-empty', text: this.emptyText });
        }

        const footer = contentEl.createDiv({ cls: 'lorebase-modal-actions lorebase-select-footer' });
        const backBtn = this.createFooterButton(footer, 'arrow-left', t('commonBack'), 'secondary');
        const confirmBtn = this.createFooterButton(footer, 'check', `${t('promptConfirmSelected')} (${this.selected.size})`, 'primary');
        confirmBtn.disabled = this.selected.size === 0;

        backBtn.addEventListener('click', () => this.renderSearchView());
        confirmBtn.addEventListener('click', () => {
            this.hasResolved = true;
            this.resolve?.(Array.from(this.selected.values()));
            this.close();
        });
    }

    private formatProvider(provider?: string): string {
        if (!provider) return '';
        return provider.toUpperCase();
    }

    private createFooterButton(
        container: HTMLElement,
        iconName: string,
        text: string,
        variant: 'primary' | 'secondary'
    ): HTMLButtonElement {
        const button = container.createEl('button', {
            cls: variant === 'primary' ? 'lorebase-flow-btn lorebase-flow-btn-primary' : 'lorebase-flow-btn lorebase-flow-btn-secondary',
            attr: { type: 'button' },
        });
        const icon = button.createSpan({ cls: 'lorebase-flow-btn-icon' });
        setIcon(icon, iconName);
        button.createSpan({ cls: 'lorebase-flow-btn-label', text });
        return button;
    }

    private createHeaderActionButton(container: HTMLElement, iconName: string, text: string): HTMLButtonElement {
        const button = container.createEl('button', {
            cls: 'lorebase-select-header-action',
            attr: { type: 'button' },
        });
        const icon = button.createSpan({ cls: 'lorebase-select-header-action-icon' });
        setIcon(icon, iconName);
        button.createSpan({ text });
        return button;
    }

    private getItemKey(item: T): string {
        if (item.provider && item.id) return `${item.provider}:${item.id}`;
        if (item.id) return item.id;
        return `${item.title}:${item.subtitle ?? ''}`;
    }

    private resolveInitialProvider(initialProviderId?: string): string | undefined {
        if (!this.providerOptions.length) return undefined;
        const enabledProviders = this.providerOptions.filter((provider) => !provider.disabled);
        if (!enabledProviders.length) return undefined;
        if (initialProviderId && enabledProviders.some((provider) => provider.id === initialProviderId)) {
            return initialProviderId;
        }
        return enabledProviders[0].id;
    }

    private clearSearchTimer(): void {
        if (this.searchTimer === null) return;
        window.clearTimeout(this.searchTimer);
        this.searchTimer = null;
    }

    private scheduleSearch(): void {
        if (!this.inputEl) return;
        const query = this.inputEl.value.trim();
        if (query !== this.currentQuery) {
            this.currentPage = 1;
            this.lastResultCount = 0;
            this.hasNextPage = false;
        }
        this.currentQuery = query;
        this.clearSearchTimer();

        if (!query) {
            this.searchSeq++;
            this.items = [];
            this.focusedIndex = 0;
            this.currentPage = 1;
            this.lastResultCount = 0;
            this.hasNextPage = false;
            this.renderGrid();
            this.renderPagination();
            return;
        }

        this.searchTimer = window.setTimeout(() => {
            this.searchTimer = null;
            void this.runSearch();
        }, AUTO_SEARCH_DEBOUNCE_MS);
    }

    private async runSearch(): Promise<void> {
        if (!this.inputEl) return;
        const query = this.inputEl.value.trim();
        this.currentQuery = query;
        if (!query) return;
        if (this.providerOptions.length && !this.activeProviderId) {
            this.items = [];
            this.focusedIndex = 0;
            this.lastResultCount = 0;
            this.hasNextPage = false;
            this.renderGrid();
            this.renderPagination();
            return;
        }
        const seq = ++this.searchSeq;
        this.items = [];
        this.focusedIndex = 0;
        this.lastErrorText = '';
        this.lastResultCount = 0;
        this.hasNextPage = false;
        this.isLoading = true;
        this.renderGrid(true);
        this.renderPagination();

        let results: T[] = [];
        try {
            results = await this.searchHandler(query, this.activeProviderId, {
                includeDlc: this.includeDlc,
                page: this.currentPage,
                pageSize: SEARCH_PAGE_SIZE,
            });
        } catch (error) {
            const message = error instanceof Error && error.message ? `: ${error.message}` : '';
            this.lastErrorText = `${t('noticeIntegrationsError')}${message}`;
        }
        if (seq !== this.searchSeq) return;
        this.items = Array.isArray(results) ? results : [];
        this.lastResultCount = this.items.length;
        this.hasNextPage = this.readHasNextPage(results);
        this.isLoading = false;
        this.focusedIndex = 0;
        this.renderGrid();
        this.renderPagination();
    }

    private renderProviders(): void {
        if (!this.providerListEl) return;
        this.providerListEl.empty();

        if (!this.providerOptions.length) {
            this.providerListEl.addClass('is-hidden');
            return;
        }

        this.providerListEl.removeClass('is-hidden');
        for (const provider of this.providerOptions) {
            const chip = this.providerListEl.createEl('button', {
                cls: 'lorebase-select-provider-chip',
                text: provider.label,
                attr: {
                    type: 'button',
                    'aria-pressed': String(provider.id === this.activeProviderId),
                },
            });
            chip.toggleClass('is-active', provider.id === this.activeProviderId);
            chip.toggleClass('is-disabled', Boolean(provider.disabled));
            chip.disabled = Boolean(provider.disabled);
            if (provider.disabledReason) {
                chip.setAttr('title', provider.disabledReason);
            }

            chip.addEventListener('click', () => {
                if (provider.disabled || provider.id === this.activeProviderId) return;
                this.activeProviderId = provider.id;
                this.currentPage = 1;
                this.lastResultCount = 0;
                this.hasNextPage = false;
                this.renderProviders();
                this.renderSearchOptions();
                this.scheduleSearch();
            });
        }
    }

    private renderSearchOptions(): void {
        if (!this.searchOptionsEl) return;
        this.searchOptionsEl.empty();
        this.searchOptionsEl.toggleClass('is-hidden', !this.includeDlcToggleText || this.activeProviderId !== 'steam');
        if (!this.includeDlcToggleText || this.activeProviderId !== 'steam') return;

        const label = this.searchOptionsEl.createEl('label', { cls: 'lorebase-select-dlc-toggle' });
        const input = label.createEl('input', {
            attr: {
                type: 'checkbox',
            },
        });
        input.checked = this.includeDlc;
        label.createSpan({ text: this.includeDlcToggleText });

        input.addEventListener('change', () => {
            this.includeDlc = input.checked;
            this.currentPage = 1;
            this.lastResultCount = 0;
            this.hasNextPage = false;
            this.clearSearchTimer();
            void this.runSearch();
        });
    }

    private readHasNextPage(results: T[]): boolean {
        const metadata = results as T[] & { hasNext?: boolean };
        return typeof metadata.hasNext === 'boolean'
            ? metadata.hasNext
            : results.length >= SEARCH_PAGE_SIZE;
    }

    private renderPagination(): void {
        if (!this.paginationEl) return;
        this.paginationEl.empty();

        const hasQuery = Boolean(this.currentQuery.trim());
        if (!hasQuery && !this.items.length) {
            this.paginationEl.addClass('is-hidden');
            return;
        }

        this.paginationEl.removeClass('is-hidden');
        const previousBtn = this.paginationEl.createEl('button', {
            cls: 'lorebase-select-page-btn',
            attr: {
                type: 'button',
                'aria-label': t('promptPreviousPage'),
            },
        });
        setIcon(previousBtn.createSpan({ cls: 'lorebase-select-page-icon' }), 'arrow-left');
        previousBtn.createSpan({ text: t('promptPreviousPage') });

        const pageLabel = this.paginationEl.createDiv({
            cls: 'lorebase-select-page-label',
            text: `${t('promptPage')} ${this.currentPage}`,
        });
        pageLabel.setAttr('aria-live', 'polite');

        const nextBtn = this.paginationEl.createEl('button', {
            cls: 'lorebase-select-page-btn',
            attr: {
                type: 'button',
                'aria-label': t('promptNextPage'),
            },
        });
        nextBtn.createSpan({ text: t('promptNextPage') });
        setIcon(nextBtn.createSpan({ cls: 'lorebase-select-page-icon' }), 'arrow-right');

        previousBtn.disabled = this.isLoading || this.currentPage <= 1;
        nextBtn.disabled = this.isLoading || !this.hasNextPage;

        previousBtn.addEventListener('click', () => {
            if (previousBtn.disabled) return;
            this.currentPage = Math.max(1, this.currentPage - 1);
            this.clearSearchTimer();
            void this.runSearch();
        });

        nextBtn.addEventListener('click', () => {
            if (nextBtn.disabled) return;
            this.currentPage += 1;
            this.clearSearchTimer();
            void this.runSearch();
        });
    }

    private renderSelected(): void {
        if (this.doneBtn) {
            const count = this.selected.size;
            this.doneBtn.disabled = count === 0;
            const label = this.doneBtn.querySelector<HTMLElement>('.lorebase-flow-btn-label');
            if (label) {
                label.setText(count > 0 ? `${this.doneText} (${count})` : this.doneText);
            }
        }
    }

    private renderGrid(loading: boolean = false): void {
        if (!this.gridEl) return;
        this.gridEl.empty();

        if (loading) {
            this.gridEl.createDiv({ cls: 'lorebase-select-empty', text: t('notifyLoading') });
            return;
        }

        if (this.lastErrorText) {
            this.gridEl.createDiv({ cls: 'lorebase-select-empty is-error', text: this.lastErrorText });
            return;
        }

        if (!this.items.length) {
            this.gridEl.createDiv({ cls: 'lorebase-select-empty', text: this.emptyText });
            return;
        }

        this.items.forEach((item, index) => {
            const card = this.gridEl!.createDiv({ cls: 'lorebase-select-card' });
            card.setAttr('data-index', String(index));
            const key = this.getItemKey(item);
            if (this.selected.has(key)) {
                card.addClass('is-picked');
            }
            if (index === this.focusedIndex) {
                card.addClass('is-focused');
            }

            const image = card.createDiv({ cls: 'lorebase-select-card-image' });
            if (item.image) {
                this.setPreviewBackground(image, item.image);
            } else {
                image.addClass('is-empty');
            }

            card.createDiv({ cls: 'lorebase-select-card-check' });

            const body = card.createDiv({ cls: 'lorebase-select-card-body' });
            body.createDiv({ cls: 'lorebase-select-card-title', text: item.title });

            const metaParts = [item.year, item.format, item.status].filter(Boolean);
            if (metaParts.length) {
                body.createDiv({ cls: 'lorebase-select-card-meta', text: metaParts.join(' / ') });
            }

            if (item.subtitle) {
                body.createDiv({ cls: 'lorebase-select-card-subtitle', text: item.subtitle });
            }

            card.addEventListener('click', () => this.toggleSelection(item));
            card.addEventListener('mouseenter', () => this.updateFocus(index));
        });
    }

    private updateFocus(nextIndex: number): void {
        const max = this.items.length - 1;
        this.focusedIndex = Math.max(0, Math.min(max, nextIndex));
        this.gridEl?.querySelectorAll<HTMLElement>('.lorebase-select-card').forEach(card => {
            const index = Number(card.dataset.index);
            if (index === this.focusedIndex) card.addClass('is-focused');
            else card.removeClass('is-focused');
        });
    }

    private toggleSelection(item: T): void {
        const key = this.getItemKey(item);
        if (this.selected.has(key)) {
            this.selected.delete(key);
        } else {
            this.selected.set(key, item);
        }
        this.renderSelected();
        this.renderGrid();
    }

    private setPreviewBackground(target: HTMLElement, imageUrl: string): void {
        const candidates = this.getImageCandidates(imageUrl);
        let index = 0;

        const apply = (): void => {
            const next = candidates[index];
            if (!next) {
                target.setCssStyles({ backgroundImage: '' });
                target.addClass('is-empty');
                return;
            }

            if (this.isMangaDexImage(next)) {
                void this.setMangaDexPreviewBackground(target, next, () => {
                    index++;
                    apply();
                });
                return;
            }

            const probe = new Image();
            probe.onload = () => {
                target.removeClass('is-empty');
                target.setCssStyles({ backgroundImage: `url("${next}")` });
            };
            probe.onerror = () => {
                index++;
                apply();
            };
            probe.src = next;
        };

        apply();
    }

    private async setMangaDexPreviewBackground(target: HTMLElement, url: string, onError: () => void): Promise<void> {
        try {
            const response = await requestUrl({ url, method: 'GET' });
            const type = response.headers?.['content-type'] || 'image/jpeg';
            const objectUrl = URL.createObjectURL(new Blob([response.arrayBuffer], { type }));
            this.objectUrls.push(objectUrl);
            target.removeClass('is-empty');
            target.setCssStyles({ backgroundImage: `url("${objectUrl}")` });
        } catch {
            onError();
        }
    }

    private getImageCandidates(imageUrl: string): string[] {
        const appId = getSteamAppIdFromImageUrl(imageUrl);
        const mangaDexCandidates = this.getMangaDexImageCandidates(imageUrl);
        if (mangaDexCandidates.length) return mangaDexCandidates;
        return appId
            ? getSteamVerticalImageCandidates(appId, imageUrl)
            : [imageUrl].filter(Boolean);
    }

    private getMangaDexImageCandidates(imageUrl: string): string[] {
        if (!this.isMangaDexImage(imageUrl)) return [];
        const base = imageUrl
            .replace(/\.512\.jpg$/i, '')
            .replace(/\.256\.jpg$/i, '');
        return Array.from(new Set([
            imageUrl,
            `${base}.512.jpg`,
            `${base}.256.jpg`,
            base,
        ].filter(Boolean)));
    }

    private isMangaDexImage(imageUrl: string): boolean {
        return imageUrl.includes('uploads.mangadex.org/covers/');
    }

    private revokeObjectUrls(): void {
        for (const url of this.objectUrls) URL.revokeObjectURL(url);
        this.objectUrls = [];
    }

    private onKeydown = (event: KeyboardEvent): void => {
        if (this.isReviewing) {
            if (event.key === 'Escape') {
                event.preventDefault();
                this.renderSearchView();
            }
            return;
        }
        if (!this.items.length) return;
        if (event.target === this.inputEl) return;

        if (event.key === 'ArrowRight') {
            event.preventDefault();
            this.updateFocus(this.focusedIndex + 1);
            return;
        }
        if (event.key === 'ArrowLeft') {
            event.preventDefault();
            this.updateFocus(this.focusedIndex - 1);
            return;
        }
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            this.updateFocus(this.focusedIndex + 1);
            return;
        }
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            this.updateFocus(this.focusedIndex - 1);
            return;
        }
        if (event.key === 'Enter') {
            event.preventDefault();
            const item = this.items[this.focusedIndex];
            if (item) this.toggleSelection(item);
            return;
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            this.close();
        }
    };
}
