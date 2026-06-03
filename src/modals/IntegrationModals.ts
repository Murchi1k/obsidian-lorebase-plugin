/**
 * LOREBASE - Integration Modals
 * Simple input, choice, and search modals for integrations
 */

import { App, Modal, setIcon } from 'obsidian';
import { t } from '../localization';

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

type SearchHandler<T extends SearchItem> = (query: string, providerId?: string) => Promise<T[]>;

const AUTO_SEARCH_DEBOUNCE_MS = 350;

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
    private providerOptions: SearchProviderOption[];
    private activeProviderId?: string;
    private resolve?: (value: T[] | null) => void;
    private hasResolved = false;
    private focusedIndex = 0;
    private searchSeq = 0;
    private searchTimer: number | null = null;
    private currentQuery = '';
    private isReviewing = false;

    private inputEl?: HTMLInputElement;
    private providerListEl?: HTMLElement;
    private gridEl?: HTMLElement;
    private doneBtn?: HTMLButtonElement;
    private lastErrorText = '';

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

        contentEl.createEl('h2', { cls: 'lorebase-select-title', text: this.titleText });

        const searchShell = contentEl.createDiv({ cls: 'lorebase-select-search-shell' });
        this.inputEl = searchShell.createEl('input', {
            cls: 'lorebase-select-search',
            attr: { type: 'text', placeholder: this.placeholder }
        });
        this.inputEl.value = this.currentQuery;
        this.providerListEl = searchShell.createDiv({ cls: 'lorebase-select-providers' });
        this.renderProviders();

        this.inputEl.addEventListener('input', () => this.scheduleSearch());
        this.inputEl.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                this.clearSearchTimer();
                void this.runSearch();
            }
        });

        this.gridEl = contentEl.createDiv({ cls: 'lorebase-select-grid' });
        this.renderGrid();

        const footer = contentEl.createDiv({ cls: 'lorebase-modal-actions' });
        const cancelBtn = footer.createEl('button', { text: this.cancelText, cls: 'lorebase-btn' });
        this.doneBtn = footer.createEl('button', { text: this.doneText, cls: 'lorebase-btn lorebase-btn-primary' });
        this.renderSelected();

        cancelBtn.addEventListener('click', () => {
            this.hasResolved = true;
            this.resolve?.(null);
            this.close();
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

        contentEl.createEl('h2', {
            cls: 'lorebase-select-title',
            text: `${t('promptReviewSelected')}: ${this.selected.size}`,
        });

        const list = contentEl.createDiv({ cls: 'lorebase-select-review-list' });
        for (const item of this.selected.values()) {
            const row = list.createDiv({ cls: 'lorebase-select-review-item' });
            const image = row.createDiv({ cls: 'lorebase-select-review-image' });
            if (item.image) {
                image.style.backgroundImage = `url(\"${item.image}\")`;
            } else {
                image.addClass('is-empty');
            }

            const body = row.createDiv({ cls: 'lorebase-select-review-body' });
            body.createDiv({ cls: 'lorebase-select-review-title', text: item.title });
            const metaParts = [item.year, item.format, item.status, item.subtitle].filter(Boolean);
            if (metaParts.length) {
                body.createDiv({ cls: 'lorebase-select-review-meta', text: metaParts.join(' / ') });
            }

            const remove = row.createEl('button', {
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
        }

        if (!this.selected.size) {
            list.createDiv({ cls: 'lorebase-select-empty', text: this.emptyText });
        }

        const footer = contentEl.createDiv({ cls: 'lorebase-modal-actions' });
        const backBtn = footer.createEl('button', { text: t('commonBack'), cls: 'lorebase-btn' });
        const confirmBtn = footer.createEl('button', {
            text: t('promptConfirmSelected'),
            cls: 'lorebase-btn lorebase-btn-primary',
        });
        confirmBtn.disabled = this.selected.size === 0;

        backBtn.addEventListener('click', () => this.renderSearchView());
        confirmBtn.addEventListener('click', () => {
            this.hasResolved = true;
            this.resolve?.(Array.from(this.selected.values()));
            this.close();
        });
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
        this.currentQuery = query;
        this.clearSearchTimer();

        if (!query) {
            this.searchSeq++;
            this.items = [];
            this.focusedIndex = 0;
            this.renderGrid();
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
            this.renderGrid();
            return;
        }
        const seq = ++this.searchSeq;
        this.items = [];
        this.focusedIndex = 0;
        this.lastErrorText = '';
        this.renderGrid(true);

        let results: T[] = [];
        try {
            results = await this.searchHandler(query, this.activeProviderId);
        } catch (error) {
            console.error('Integration search error:', error);
            this.lastErrorText = t('noticeIntegrationsError');
        }
        if (seq !== this.searchSeq) return;
        this.items = Array.isArray(results) ? results : [];
        this.focusedIndex = 0;
        this.renderGrid();
    }

    private renderProviders(): void {
        if (!this.providerListEl) return;
        this.providerListEl.empty();

        if (!this.providerOptions.length) {
            this.providerListEl.style.display = 'none';
            return;
        }

        this.providerListEl.style.display = '';
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
                this.renderProviders();
                this.scheduleSearch();
            });
        }
    }

    private renderSelected(): void {
        if (this.doneBtn) {
            const count = this.selected.size;
            this.doneBtn.disabled = count === 0;
            this.doneBtn.textContent = count > 0 ? `${this.doneText} (${count})` : this.doneText;
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
            if (item.provider === 'rawg') {
                card.addClass('is-wide-art');
            }
            const key = this.getItemKey(item);
            if (this.selected.has(key)) {
                card.addClass('is-picked');
            }
            if (index === this.focusedIndex) {
                card.addClass('is-focused');
            }

            const image = card.createDiv({ cls: 'lorebase-select-card-image' });
            if (item.image) {
                image.style.backgroundImage = `url(\"${item.image}\")`;
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
