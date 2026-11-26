
import { ManualCreateModal, type ManualCreateDraft } from './ManualCreateModal';
import { addMobileModalClose, isMobileInterface } from '../components/MobileModalChrome';
import type { MediaKind } from '../services/integrations/types';
import type { RatingScaleSettings } from '../types';
import type { InlineSyncPresentation } from './inlineSync';
import { inboxText } from '../localization/inbox';
import { referenceText } from '../localization/catalogReference';
import { getSearchCardClassification } from './searchCardMetadata';
import { getMediaWorkTypeColor } from '../utils/mediaWorkType';
import { getMangaWorkTypeOptions, normalizeMangaWorkType } from '../utils/mangaWorkType';
/**
 * LOREBASE - Integration Modals
 * Simple input, choice, and search modals for integrations
 */

import { App, Modal, setIcon } from 'obsidian';
import { i18n, t } from '../localization';
import { createLorebaseDropdown } from '../components/LorebaseDropdown';
import { normalizeTmdbLanguage } from '../services/integrations/providers/tmdb';
import { getTmdbLanguageOptions } from '../utils/tmdbLanguageOptions';
import { getSteamAppIdFromImageUrl, getSteamVerticalImageCandidates } from '../services/integrations/steamImages';
import { fetchBinary } from '../services/integrations/shared';
import { getSearchCardMetadata, getSearchPublicationStatus } from './searchCardMetadata';

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

export type ExistingFileChoice = 'update' | 'separate' | 'skip';

export interface ExistingFilePreview {
    title?: string;
    subtitle?: string;
    meta?: string[];
    image?: string;
}

export class ExistingFileChoiceModal extends Modal {
    private titleText: string;
    private bodyText: string;
    private filePath: string;
    private preview: ExistingFilePreview;
    private resolve?: (value: ExistingFileChoice) => void;
    private hasResolved = false;

    constructor(app: App, titleText: string, bodyText: string, filePath: string, preview: ExistingFilePreview = {}) {
        super(app);
        this.titleText = titleText;
        this.bodyText = bodyText;
        this.filePath = filePath;
        this.preview = preview;
    }

    openAndGetValue(): Promise<ExistingFileChoice> {
        return new Promise(resolve => {
            this.resolve = resolve;
            this.open();
        });
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();

        this.modalEl.addClass('lorebase-existing-file-modal');
        contentEl.createEl('h2', { text: this.titleText, cls: 'lorebase-existing-file-heading' });
        contentEl.createDiv({ text: this.bodyText, cls: 'lorebase-modal-body lorebase-existing-file-body' });

        const card = contentEl.createDiv({ cls: 'lorebase-existing-file-preview' });
        const poster = card.createDiv({ cls: 'lorebase-existing-file-poster' });
        const image = this.preview.image?.trim();
        if (image) {
            poster.setCssStyles({ backgroundImage: `url("${image.replace(/"/g, '\\"')}")` });
        } else {
            poster.addClass('is-empty');
            setIcon(poster, 'image');
        }

        const info = card.createDiv({ cls: 'lorebase-existing-file-info' });
        info.createDiv({ cls: 'lorebase-existing-file-title', text: this.preview.title?.trim() || this.titleText });
        const metaValues = this.preview.meta?.map(value => value.trim()).filter(Boolean) ?? [];
        const subtitle = this.preview.subtitle?.trim();
        if (metaValues.length) {
            const meta = info.createDiv({ cls: 'lorebase-existing-file-meta' });
            for (const value of metaValues) {
                meta.createSpan({ cls: 'lorebase-existing-file-meta-pill', text: value });
            }
        } else if (subtitle) {
            const meta = info.createDiv({ cls: 'lorebase-existing-file-meta' });
            meta.createSpan({ cls: 'lorebase-existing-file-meta-pill', text: subtitle });
        }
        info.createDiv({ cls: 'lorebase-existing-file-path-label', text: this.filePath });

        const actions = contentEl.createDiv({ cls: 'lorebase-modal-actions lorebase-existing-file-actions' });
        const skipBtn = this.createExistingFileAction(actions, t('promptFileExistsSkip'), 'x', 'lorebase-existing-file-secondary lorebase-existing-file-skip');
        const separateBtn = this.createExistingFileAction(actions, t('promptFileExistsSeparate'), 'copy-plus', 'lorebase-existing-file-secondary lorebase-existing-file-separate');
        const updateBtn = this.createExistingFileAction(actions, t('promptFileExistsUpdate'), 'refresh-cw', 'lorebase-btn-primary lorebase-existing-file-primary');

        skipBtn.addEventListener('click', () => this.finish('skip'));
        separateBtn.addEventListener('click', () => this.finish('separate'));
        updateBtn.addEventListener('click', () => this.finish('update'));
    }

    onClose(): void {
        this.modalEl.removeClass('lorebase-existing-file-modal');
        if (!this.hasResolved) {
            this.resolve?.('skip');
        }
        this.contentEl.empty();
    }

    private finish(value: ExistingFileChoice): void {
        this.hasResolved = true;
        this.resolve?.(value);
        this.close();
    }

    private createExistingFileAction(container: HTMLElement, label: string, icon: string, extraClass: string): HTMLButtonElement {
        const button = container.createEl('button', {
            cls: `lorebase-btn lorebase-existing-file-action ${extraClass}`,
            attr: { type: 'button' },
        });
        const iconEl = button.createSpan({ cls: 'lorebase-existing-file-action-icon' });
        setIcon(iconEl, icon);
        button.createSpan({ cls: 'lorebase-existing-file-action-label', text: label });
        return button;
    }
}

export interface SearchItem {
    discovery?: import('../types').DiscoveryContext;
    isAdult?: boolean;
    countryOfOrigin?: string;
    workType?: string;
    workTypeMedia?: 'game' | 'movie' | 'series' | 'manga';
    alreadyInLibrary?: boolean;
    libraryPath?: string;
    directMatch?: boolean;
    id?: string;
    title: string;
    subtitle?: string;
    image?: string;
    year?: string;
    released?: string;
    publicationStatus?: string;
    format?: string;
    status?: string;
    provider?: string;
}

export interface SearchProviderOption {
    id: string;
    label: string;
    disabled?: boolean;
    disabledReason?: string;
    alternateSearch?: boolean;
}

type SearchOptions = {
    includeAdult?: boolean;
    tmdbLanguage?: string;
    includeDlc?: boolean;
    page?: number;
    pageSize?: number;
};
type SearchHandler<T extends SearchItem> = (query: string, providerId?: string, options?: SearchOptions) => Promise<T[]>;
type ImageFallbackResolver<T extends SearchItem> = (item: T) => Promise<string>;

const SEARCH_PAGE_SIZE = 10;
const mangaSearchText = (key: 'all' | 'empty' | 'next'): string => ({
    all: { en: 'All types', ru: 'Все типы', uk: 'Усі типи', 'zh-CN': '所有类型' },
    empty: { en: 'No entries of this type on this page.', ru: 'На этой странице нет произведений выбранного типа.', uk: 'На цій сторінці немає творів вибраного типу.', 'zh-CN': '本页没有此类型的作品。' },
    next: { en: 'Try the next page or choose all types.', ru: 'Перейдите на следующую страницу или выберите все типы.', uk: 'Перейдіть на наступну сторінку або виберіть усі типи.', 'zh-CN': '请尝试下一页或选择所有类型。' },
}[key][i18n.getLanguage()]);

export class MultiSelectSearchModal<T extends SearchItem> extends Modal {
    private searchHandler: SearchHandler<T>;
    private items: T[] = [];
    private selected = new Map<string, T>();
    private placeholder: string;
    private titleText: string;
    private emptyText: string;
    private doneText: string;
    private cancelText: string;
    private titleIcon: string;
    private syncActionText?: string;
    private onSyncAction?: (presentation: InlineSyncPresentation) => void | Promise<void>;
    private onInboxAction?: (presentation: InlineSyncPresentation) => void | Promise<void>;
    private inlineSync?: AbortController;
    private isSyncView = false;
    private manualActionText?: string;
    private onManualAction?: () => void;
    private manualKind?: MediaKind;
    private mediaKind?: MediaKind;
    private manualRatingSettings?: RatingScaleSettings;
    private manualEditor?: ManualCreateModal;
    private manualDraft?: ManualCreateDraft;
    private isManual = false;
    private isReviewing = false;
    private includeDlcToggleText?: string;
    private providerOptions: SearchProviderOption[];
    private alternateProviders: SearchProviderOption[];
    private activeProviderId?: string;
    private resolve?: (value: T[] | null) => void;
    private hasResolved = false;
    private focusedIndex = 0;
    private searchSeq = 0;
    private currentQuery = '';
    private currentPage = 1;
    private includeDlc = false;
    private includeAdult = false;
    private mangaWorkType = '';
    private mangaTypeControl?: HTMLElement;
    private tmdbLanguage?: string;
    private maxSelection?: number;
    private pickOnClick: boolean;
    private onOpenExisting?: (item: T) => void;
    private imageFallbackResolver?: ImageFallbackResolver<T>;
    private publicationStatusResolver?: (item: T) => Promise<string | undefined>;
    private publicationRequests = new Map<string, Promise<string | undefined>>();
    private publicationImages = new Map<string, string>();
    private publicationQueue: Promise<unknown> = Promise.resolve();

    private inputEl?: HTMLInputElement;
    private searchBtn?: HTMLButtonElement;
    private searchBtnIcon?: HTMLElement;
    private providerListEl?: HTMLElement;
    private searchOptionsEl?: HTMLElement;
    private syncAlternateProvider?: () => void;
    private languageControlEl?: HTMLElement;
    private gridEl?: HTMLElement;
    private paginationEl?: HTMLElement;
    private doneBtn?: HTMLButtonElement;
    private lastErrorText = '';
    private isLoading = false;
    private activeSearchKey: string | null = null;
    private hasNextPage = false;
    private objectUrls: string[] = [];
    private previewObjectUrlCache = new Map<string, string>();
    private previewFallbackRequests = new Map<string, Promise<string>>();

    constructor(
        app: App,
        searchHandler: SearchHandler<T>,
        options: {
            titleText: string;
            placeholder: string;
            emptyText: string;
            doneText: string;
            cancelText: string;
            providerOptions?: SearchProviderOption[];
            initialProviderId?: string;
            initialTmdbLanguage?: string;
            titleIcon?: string;
            syncActionText?: string;
            onSyncAction?: (presentation: InlineSyncPresentation) => void | Promise<void>;
            onInboxAction?: (presentation: InlineSyncPresentation) => void | Promise<void>;
            manualKind?: MediaKind;
            mediaKind?: MediaKind;
            manualRatingSettings?: RatingScaleSettings;
            manualActionText?: string;
            onManualAction?: () => void;
            includeDlcToggleText?: string;
            initialQuery?: string;
            maxSelection?: number;
            pickOnClick?: boolean;
            onOpenExisting?: (item: T) => void;
            imageFallbackResolver?: ImageFallbackResolver<T>;
            publicationStatusResolver?: (item: T) => Promise<string | undefined>;
        }
    ) {
        super(app);
        this.searchHandler = searchHandler;
        this.titleText = options.titleText;
        this.placeholder = options.placeholder;
        this.emptyText = options.emptyText;
        this.doneText = options.doneText;
        this.cancelText = options.cancelText;
        this.titleIcon = options.titleIcon ?? 'search';
        this.syncActionText = options.syncActionText;
        this.onSyncAction = options.onSyncAction;
        this.onInboxAction = options.onInboxAction;
        this.manualKind = options.manualKind;
        this.mediaKind = options.mediaKind;
        this.manualRatingSettings = options.manualRatingSettings;
        this.manualActionText = options.manualActionText;
        this.onManualAction = options.onManualAction;
        this.includeDlcToggleText = options.includeDlcToggleText;
        this.providerOptions = (options.providerOptions ?? []).filter(provider => !provider.alternateSearch);
        this.alternateProviders = (options.providerOptions ?? []).filter(provider => provider.alternateSearch && !provider.disabled);
        this.tmdbLanguage = options.initialTmdbLanguage === undefined ? undefined : normalizeTmdbLanguage(options.initialTmdbLanguage);
        this.activeProviderId = this.resolveInitialProvider(options.initialProviderId);
        this.currentQuery = options.initialQuery?.trim() ?? '';
        this.pickOnClick = options.pickOnClick === true;
        this.onOpenExisting = options.onOpenExisting;
        this.maxSelection = this.pickOnClick ? 1 : options.maxSelection;
        this.imageFallbackResolver = options.imageFallbackResolver;
        this.publicationStatusResolver = options.publicationStatusResolver;
    }

    openAndGetValues(): Promise<T[] | null> {
        return new Promise(resolve => {
            this.resolve = resolve;
            this.open();
        });
    }

    onOpen(): void {
        this.modalEl.addClass('lorebase-select-modal-container');
        if (this.manualKind && !this.activeProviderId) this.renderManualView();
        else this.renderSearchView();
        this.modalEl.addEventListener('keydown', this.onKeydown);
    }

    onClose(): void {
        this.inlineSync?.abort();
        this.searchSeq++;
        this.modalEl.removeClass('lorebase-select-modal-container', 'is-lorebase-manual', 'is-lorebase-sync');
        this.modalEl.removeEventListener('keydown', this.onKeydown);
        this.manualEditor?.disposeInline();
        this.revokeObjectUrls();
        if (!this.hasResolved) {
            this.resolve?.(null);
        }
        this.contentEl.empty();
    }

    getManualDraft(): ManualCreateDraft | undefined { return this.manualDraft; }

    private renderManualView(): void {
        if (!this.manualKind) return;
        this.searchSeq++;
        this.activeSearchKey = null;
        this.isLoading = false;
        this.isManual = true;
        this.isReviewing = false;
        this.contentEl.removeClass('is-reviewing');
        this.modalEl.addClass('is-lorebase-manual');
        this.contentEl.addClass('lorebase-add-workspace', 'is-manual');
        this.manualEditor ??= new ManualCreateModal(this.app, this.manualKind, this.manualRatingSettings);
        this.manualEditor.mountInline(this.contentEl, draft => {
            this.manualDraft = draft;
            this.hasResolved = true;
            this.resolve?.([]);
            this.close();
        }, () => this.renderSearchView(), this.currentQuery, () => this.close(), this.onInboxAction
            ? { label: inboxText('title'), action: () => this.renderInboxView() } : undefined);
    }

    private confirmSelection(): void {
        if (!this.selected.size) return;
        this.hasResolved = true;
        this.resolve?.(Array.from(this.selected.values()));
        this.close();
    }

    private renderSearchView(): void {
        this.inlineSync?.abort();
        this.inlineSync = undefined;
        this.isSyncView = false;
        this.isManual = false;
        this.isReviewing = false;
        this.modalEl.removeClass('is-lorebase-manual', 'is-lorebase-sync');
        this.contentEl.removeClass('is-manual', 'is-reviewing', 'is-steam-sync', 'is-inbox');
        this.contentEl.addClass('lorebase-add-workspace');
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('lorebase-select-modal');
        contentEl.addClass('lorebase-select-multi');

        const header = contentEl.createDiv({ cls: 'lorebase-select-header' });
        const titleRow = header.createDiv({ cls: 'lorebase-select-title-row' });
        const titleIcon = titleRow.createSpan({ cls: 'lorebase-select-title-icon' });
        setIcon(titleIcon, this.titleIcon);
        titleRow.createEl('h2', { cls: 'lorebase-select-title', text: this.manualKind ? t('addWorkspaceTitle') : this.titleText });
        const actions = titleRow.createDiv({ cls: 'lorebase-add-header-actions' });
        if (this.onInboxAction) this.createHeaderActionButton(actions, 'inbox', inboxText('title'))
            .addEventListener('click', () => this.renderInboxView());
        const syncBtn = this.onSyncAction && this.syncActionText
            ? this.createHeaderActionButton(actions, 'refresh-cw', this.syncActionText)
            : null;
        const close = addMobileModalClose(this.modalEl, header, () => this.close());

        const searchShell = contentEl.createDiv({ cls: 'lorebase-select-search-shell' });
        const searchWrap = searchShell.createDiv({ cls: 'lorebase-select-search-wrap' });
        const searchField = searchWrap.createDiv({ cls: 'lorebase-select-search-field' });
        const searchIcon = searchField.createSpan({ cls: 'lorebase-select-search-icon' });
        setIcon(searchIcon, 'search');
        this.inputEl = searchField.createEl('input', {
            cls: 'lorebase-select-search',
            attr: { type: 'text', placeholder: this.placeholder }
        });
        this.inputEl.value = this.currentQuery;
        this.languageControlEl = searchField.createDiv({ cls: 'lorebase-select-language-control' });
        this.mangaTypeControl = this.isMangaSearch() ? searchWrap.createDiv({ cls: 'lorebase-select-manga-type' }) : undefined;
        this.renderMangaTypeFilter();
        this.renderAlternateProvider(searchWrap);
        this.searchBtn = searchWrap.createEl('button', {
            cls: 'lorebase-select-search-submit',
            attr: {
                type: 'button',
                'aria-label': t('promptSearchAction'),
                title: t('promptSearchAction'),
            },
        });
        this.searchBtnIcon = this.searchBtn.createSpan({ cls: 'lorebase-select-search-submit-icon' });
        setIcon(this.searchBtnIcon, 'search');
        this.searchBtn.createSpan({ cls: 'lorebase-select-search-submit-label', text: t('promptSearchAction') });
        const searchControls = searchShell.createDiv({ cls: 'lorebase-select-search-controls' });
        searchControls.toggleClass('has-manga-filter', this.isMangaSearch());
        this.providerListEl = searchControls.createDiv({ cls: 'lorebase-select-providers' });
        this.searchOptionsEl = searchControls.createDiv({ cls: 'lorebase-select-search-options' });
        this.renderProviders();
        this.renderSearchOptions();

        this.inputEl.addEventListener('input', () => this.updateSearchDraft());
        this.inputEl.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.isComposing) {
                event.preventDefault();
                void this.runSearch();
            }
        });
        this.searchBtn.addEventListener('click', () => void this.runSearch());
        this.updateSearchButtonState();

        this.gridEl = contentEl.createDiv({ cls: 'lorebase-select-grid lorebase-select-search-grid' });
        this.renderGrid();
        this.paginationEl = contentEl.createDiv({ cls: 'lorebase-select-pagination' });
        this.renderPagination();

        const footer = contentEl.createDiv({ cls: 'lorebase-modal-actions lorebase-select-footer' });
        if (this.pickOnClick) footer.createEl('p', { cls: 'lorebase-source-pick-hint', text: inboxText('pickHint') });
        const manualBtn = (this.manualKind || this.onManualAction) && this.manualActionText
            ? footer.createEl('button', { cls: 'lorebase-select-manual-action', attr: { type: 'button', 'aria-label': this.manualActionText } })
            : null;
        if (manualBtn) {
            setIcon(manualBtn.createSpan(), 'square-pen');
            manualBtn.createSpan({ text: this.manualActionText });
        }
        const cancelBtn = this.createFooterButton(footer, 'x', this.cancelText, 'secondary');
        this.doneBtn = this.pickOnClick ? undefined : this.createFooterButton(footer, 'plus', this.doneText, 'primary');
        this.doneBtn?.setAttribute('aria-live', 'polite');
        this.renderSelected();

        cancelBtn.addEventListener('click', () => {
            this.hasResolved = true;
            this.resolve?.(null);
            this.close();
        });

        syncBtn?.addEventListener('click', () => {
            this.renderSyncView();
        });
        manualBtn?.addEventListener('click', () => {
            if (this.manualKind) { this.renderManualView(); return; }
            this.hasResolved = true;
            this.resolve?.(null);
            this.close();
            this.onManualAction?.();
        });

        this.doneBtn?.addEventListener('click', () => this.renderReviewView());
        if (isMobileInterface(contentEl)) close.focus({ preventScroll: true });
        else this.inputEl.focus();
    }

    private renderSyncView(): void {
        if (this.onSyncAction) this.renderExternalView(this.onSyncAction, this.syncActionText ?? '', false);
    }

    private renderInboxView(): void {
        if (this.onInboxAction) this.renderExternalView(this.onInboxAction, inboxText('title'), true);
    }

    private renderExternalView(action: (presentation: InlineSyncPresentation) => void | Promise<void>, label: string, inbox: boolean): void {
        if (this.isSyncView) return;
        this.currentQuery = this.inputEl?.value.trim() ?? this.currentQuery;
        this.searchSeq++;
        this.activeSearchKey = null;
        this.isLoading = false;
        this.isSyncView = true;
        this.inlineSync = new AbortController();
        const { signal } = this.inlineSync;
        this.contentEl.empty();
        this.modalEl.removeClass('is-lorebase-manual');
        this.modalEl.classList.toggle('is-lorebase-sync', !inbox);
        this.contentEl.removeClass('is-manual', 'is-reviewing');
        this.contentEl.addClass(inbox ? 'is-inbox' : 'is-steam-sync');
        const header = this.contentEl.createDiv({ cls: 'lorebase-select-header' });
        const row = header.createDiv({ cls: 'lorebase-select-title-row' });
        setIcon(row.createSpan({ cls: 'lorebase-select-title-icon' }), this.titleIcon);
        row.createEl('h2', { cls: 'lorebase-select-title', text: t('addWorkspaceTitle') });
        row.createSpan({ cls: 'lorebase-steam-sync-mode', text: label });
        addMobileModalClose(this.modalEl, header, () => this.close());
        const back = this.createHeaderActionButton(row, 'arrow-left', t('commonBack'));
        back.classList.add('lorebase-steam-sync-back');
        const onBack = (): void => { if (!signal.aborted) this.renderSearchView(); };
        back.addEventListener('click', onBack);
        const host = this.contentEl.createDiv({ cls: 'lorebase-steam-sync-host' });
        void Promise.resolve().then(() => {
            if (!signal.aborted) return action({ host, signal, onBack });
        }).catch(error => {
            if (signal.aborted) return;
            host.empty();
            host.createDiv({ cls: 'lorebase-select-empty is-error', attr: { role: 'alert' },
                text: `${t('noticeIntegrationsError')}${error instanceof Error ? `: ${error.message}` : ''}` });
        });
    }

    private renderReviewView(): void {
        if (!this.selected.size) return;
        this.isReviewing = true;
        this.searchSeq++;
        this.activeSearchKey = null;
        this.isLoading = false;
        this.contentEl.addClass('is-reviewing');
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
            text: t('promptReviewSelected'),
        });
        header.createDiv({ cls: 'lorebase-select-review-subtitle', text: t('promptReviewSelectedSubtitle') });
        addMobileModalClose(this.modalEl, header, () => this.close());

        const list = contentEl.createDiv({ cls: 'lorebase-select-grid lorebase-select-search-grid lorebase-select-review-gallery' });
        this.renderPosterCards(list, Array.from(this.selected.values()), true);

        const footer = contentEl.createDiv({ cls: 'lorebase-modal-actions lorebase-select-footer' });
        const backBtn = this.createFooterButton(footer, 'arrow-left', t('commonBack'), 'secondary');
        const confirmBtn = this.createFooterButton(footer, 'check', `${t('promptConfirmSelected')} (${this.selected.size})`, 'primary');
        confirmBtn.disabled = this.selected.size === 0;

        backBtn.addEventListener('click', () => this.renderSearchView());
        confirmBtn.addEventListener('click', () => this.confirmSelection());
        backBtn.focus();
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
        if (item.provider === 'tmdb' && item.id && (item.workTypeMedia === 'movie' || item.workTypeMedia === 'series')) {
            return `${item.provider}:${item.workTypeMedia}:${item.id}`;
        }
        if (item.provider && item.id) return `${item.provider}:${item.id}`;
        if (item.id) return item.id;
        return `${item.title}:${item.subtitle ?? ''}`;
    }

    private resolveInitialProvider(initialProviderId?: string): string | undefined {
        const enabledProviders = [...this.providerOptions.filter(provider => !provider.disabled), ...this.alternateProviders];
        return enabledProviders.find(provider => provider.id === initialProviderId)?.id ?? enabledProviders[0]?.id;
    }

    private updateSearchDraft(): void {
        if (!this.inputEl) return;
        const query = this.inputEl.value.trim();
        if (query !== this.currentQuery) {
            this.searchSeq++;
            this.activeSearchKey = null;
            this.isLoading = false;
            this.currentPage = 1;
            this.items = [];
            this.focusedIndex = 0;
            this.lastErrorText = '';
            this.hasNextPage = false;
        }
        this.currentQuery = query;
        this.updateSearchButtonState();
        this.renderGrid();
        this.renderPagination();
    }

    private async runSearch(): Promise<void> {
        if (!this.inputEl) return;
        const query = this.inputEl.value.trim();
        this.currentQuery = query;
        if (!query) return;
        if (this.providerOptions.length && !this.activeProviderId) {
            this.items = [];
            this.focusedIndex = 0;
            this.hasNextPage = false;
            this.renderGrid();
            this.renderPagination();
            this.updateSearchButtonState();
            return;
        }
        const searchKey = [
            this.activeProviderId ?? '',
            this.activeProviderId === 'tmdb' ? this.tmdbLanguage ?? '' : '',
            query.toLowerCase(),
            this.currentPage,
            this.includeDlc ? 'dlc' : 'base',
            this.includeAdult ? 'adult' : 'safe',
        ].join('|');
        if (this.isLoading && this.activeSearchKey === searchKey) return;

        const seq = ++this.searchSeq;
        this.activeSearchKey = searchKey;
        this.items = [];
        this.focusedIndex = 0;
        this.lastErrorText = '';
        this.hasNextPage = false;
        this.isLoading = true;
        this.updateSearchButtonState();
        this.renderGrid(true);
        this.renderPagination();

        let results: T[] = [];
        try {
            results = await this.searchHandler(query, this.activeProviderId, {
                includeDlc: this.includeDlc,
                includeAdult: this.hasAdultFilter() ? this.includeAdult : undefined,
                tmdbLanguage: this.activeProviderId === 'tmdb' ? this.tmdbLanguage : undefined,
                page: this.currentPage,
                pageSize: SEARCH_PAGE_SIZE,
            });
        } catch (error) {
            if (seq !== this.searchSeq) return;
            const message = error instanceof Error && error.message ? `: ${error.message}` : '';
            this.lastErrorText = `${t('noticeIntegrationsError')}${message}`;
        }
        if (seq !== this.searchSeq) return;
        this.activeSearchKey = null;
        const direct = Array.isArray(results) ? results.find(item => item.directMatch) : undefined;
        if (direct?.provider && [...this.providerOptions, ...this.alternateProviders].some(option => option.id === direct.provider && !option.disabled)) {
            this.activeProviderId = direct.provider;
            this.renderProviders(); this.renderSearchOptions();
        }
        this.items = Array.isArray(results)
            ? results.filter(item => !this.hasAdultFilter() || this.includeAdult || item.isAdult !== true)
            : [];
        this.hasNextPage = this.readHasNextPage(results);
        this.isLoading = false;
        this.renderMangaTypeFilter();
        this.updateSearchButtonState();
        this.focusedIndex = 0;
        this.renderGrid();
        this.renderPagination();
    }

    private renderAlternateProvider(searchRow: HTMLElement): void {
        if (!this.alternateProviders.length) return;
        const container = searchRow.createDiv({ cls: 'lorebase-select-alternate-provider' });
        const control = createLorebaseDropdown(container,
            this.alternateProviders.map(provider => ({ value: provider.id, label: provider.label })),
            '', value => {
                this.selectProvider(value);
                this.inputEl?.focus();
            }, { floating: true, minPanelWidth: 136, buttonLabel: () => '' });
        const button = container.querySelector('button')!;
        const icon = button.createSpan({ cls: 'lorebase-select-alternate-icon', attr: { 'aria-hidden': 'true' } });
        setIcon(icon, 'globe');
        button.prepend(icon);
        this.syncAlternateProvider = () => {
            const provider = this.alternateProviders.find(option => option.id === this.activeProviderId);
            control.setValue(provider?.id ?? '');
            container.toggleClass('is-active', Boolean(provider));
            const label = [t('promptSearchOtherCatalogs'), provider?.label].filter(Boolean).join(' · ');
            button.setAttribute('aria-label', label);
            button.setAttribute('title', label);
        };
        this.syncAlternateProvider();
    }

    private selectProvider(providerId: string): void {
        if (providerId === this.activeProviderId) return;
        this.activeProviderId = providerId;
        this.searchSeq++;
        this.activeSearchKey = null;
        this.isLoading = false;
        this.currentPage = 1;
        this.items = [];
        this.focusedIndex = 0;
        this.lastErrorText = '';
        this.hasNextPage = false;
        this.syncAlternateProvider?.();
        this.renderProviders();
        this.renderSearchOptions();
        this.updateSearchButtonState();
        this.renderGrid();
        this.renderPagination();
        if ((this.mediaKind ?? this.manualKind) === 'anime' && this.inputEl?.value.trim()) void this.runSearch();
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
            const isActive = provider.id === this.activeProviderId;
            const chip = this.providerListEl.createEl('button', {
                cls: 'lorebase-select-provider-chip',
                text: provider.label,
                attr: {
                    type: 'button',
                    'aria-pressed': String(isActive),
                },
            });
            chip.toggleClass('is-active', isActive);
            chip.toggleClass('is-disabled', Boolean(provider.disabled));
            chip.disabled = Boolean(provider.disabled);
            if (provider.disabledReason) {
                chip.setAttr('title', provider.disabledReason);
            }

            chip.addEventListener('click', () => {
                if (!provider.disabled) this.selectProvider(provider.id);
            });
        }
    }

    private async changeTmdbLanguage(value: string): Promise<void> {
        const language = normalizeTmdbLanguage(value);
        if (language === this.tmdbLanguage) return;
        this.tmdbLanguage = language;
        this.searchSeq++;
        this.activeSearchKey = null;
        this.isLoading = false;
        this.currentPage = 1;
        this.items = [];
        this.focusedIndex = 0;
        this.lastErrorText = '';
        this.hasNextPage = false;
        // Selected TMDB cards belonged to the previous language; other providers are unaffected.
        for (const [key, item] of this.selected) {
            if (item.provider === 'tmdb') this.selected.delete(key);
        }
        this.updateSearchButtonState();
        this.renderGrid();
        this.renderPagination();
        this.renderSelected();
        if (this.inputEl?.value.trim()) await this.runSearch();
    }

    private hasAdultFilter(): boolean {
        const kind = this.mediaKind ?? this.manualKind;
        return kind === 'anime' || kind === 'manga';
    }

    private isMangaSearch(): boolean {
        return (this.mediaKind ?? this.manualKind) === 'manga';
    }

    private visibleItems(): T[] {
        if (!this.isMangaSearch() || !this.mangaWorkType) return this.items;
        return this.items.filter(item => item.workType?.trim()
            && normalizeMangaWorkType(item.workType) === this.mangaWorkType);
    }

    private changeMangaType(value: string): void {
        this.mangaWorkType = value;
        this.focusedIndex = 0;
        this.renderMangaTypeFilter();
        this.renderGrid(this.isLoading);
        this.renderPagination();
        this.mangaTypeControl?.querySelector('button')?.focus();
    }

    private renderMangaTypeFilter(): void {
        if (!this.mangaTypeControl) return;
        const control = this.mangaTypeControl;
        control.dataset.active = String(Boolean(this.mangaWorkType));
        control.style.setProperty('--lorebase-type-color', this.mangaWorkType
            ? getMediaWorkTypeColor('manga', this.mangaWorkType) : 'var(--interactive-accent)');
        createLorebaseDropdown(control, [
            { value: '', label: mangaSearchText('all') },
            ...getMangaWorkTypeOptions(i18n.getLanguage(), this.items.flatMap(item => item.workType ? [item.workType] : [])),
        ], this.mangaWorkType, value => this.changeMangaType(value),
        { floating: true, minPanelWidth: 170 });
        const button = control.querySelector('button')!;
        button.setAttribute('aria-label', t('templateFieldWorkType'));
        button.setAttribute('title', t('templateFieldWorkType'));
        const icon = button.createSpan({ cls: 'lorebase-select-type-icon', attr: { 'aria-hidden': 'true' } });
        setIcon(icon, 'list-filter');
        button.prepend(icon);
    }

    private async changeAdultFilter(): Promise<void> {
        this.includeAdult = !this.includeAdult;
        this.searchSeq++;
        this.activeSearchKey = null;
        this.isLoading = false;
        this.currentPage = 1;
        this.items = [];
        this.focusedIndex = 0;
        this.lastErrorText = '';
        this.hasNextPage = false;
        if (!this.includeAdult) {
            for (const [key, item] of this.selected) {
                if (item.isAdult) this.selected.delete(key);
            }
        }
        this.renderSearchOptions();
        this.searchOptionsEl?.querySelector<HTMLButtonElement>('.lorebase-select-adult-toggle')?.focus();
        this.updateSearchButtonState();
        this.renderGrid();
        this.renderPagination();
        this.renderSelected();
        if (this.inputEl?.value.trim()) await this.runSearch();
    }

    private renderSearchOptions(): void {
        if (!this.searchOptionsEl) return;
        this.searchOptionsEl.empty();
        this.languageControlEl?.empty();
        const showAdult = this.hasAdultFilter();
        const showLanguage = !showAdult && this.tmdbLanguage !== undefined && this.activeProviderId === 'tmdb';
        this.languageControlEl?.parentElement?.toggleClass('has-language', showLanguage);
        this.languageControlEl?.toggleClass('is-hidden', !showLanguage);
        this.searchOptionsEl.toggleClass('is-hidden', !showAdult && (!this.includeDlcToggleText || this.activeProviderId !== 'steam'));
        if (showAdult) {
            const language = i18n.getLanguage();
            const label = language === 'ru' ? 'Показывать медиа 18+'
                : language === 'uk' ? 'Показувати медіа 18+'
                    : language === 'zh-CN' ? '显示成人媒体（18+）' : 'Show adult media (18+)';
            const hint = language === 'ru' ? 'Включите, чтобы видеть результаты 18+. Когда выключено, они скрыты.'
                : language === 'uk' ? 'Увімкніть, щоб бачити результати 18+. Коли вимкнено, вони приховані.'
                    : language === 'zh-CN' ? '开启后显示成人搜索结果；关闭时隐藏。' : 'Include adult search results when enabled; hide them when disabled.';
            const button = this.searchOptionsEl.createEl('button', {
                cls: 'lorebase-select-adult-toggle',
                attr: { type: 'button', 'aria-label': label, 'aria-pressed': String(this.includeAdult), title: hint },
            });
            setIcon(button.createSpan({ cls: 'lorebase-select-adult-icon' }), this.includeAdult ? 'check' : 'eye-off');
            button.createSpan({ text: '18+' });
            button.addEventListener('click', () => { void this.changeAdultFilter(); });
            return;
        }
        if (showLanguage && this.languageControlEl) {
            const dropdown = this.languageControlEl.createDiv({ cls: 'lorebase-select-language-dropdown' });
            createLorebaseDropdown(dropdown,
                getTmdbLanguageOptions(i18n.getLanguage()),
                this.tmdbLanguage!, value => { void this.changeTmdbLanguage(value); }, {
                    floating: true,
                    minPanelWidth: 220,
                    maxPanelHeight: 172,
                    panelClass: 'lorebase-language-panel',
                    buttonLabel: value => /^(es|pt|zh)-/.test(value) ? value.toUpperCase() : value.split('-')[0].toUpperCase(),
                });
            dropdown.querySelector('button')?.setAttribute('aria-label', t('settingsTmdbLanguage'));
            return;
        }
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
            this.searchSeq++;
            this.activeSearchKey = null;
            this.isLoading = false;
            this.currentPage = 1;
            this.items = [];
            this.focusedIndex = 0;
            this.lastErrorText = '';
            this.hasNextPage = false;
            this.updateSearchButtonState();
            this.renderGrid();
            this.renderPagination();
        });
    }

    private updateSearchButtonState(): void {
        if (!this.searchBtn) return;
        const hasQuery = Boolean(this.inputEl?.value.trim());
        this.searchBtn.disabled = !hasQuery || this.isLoading;
        this.searchBtn.toggleClass('is-loading', this.isLoading);
        if (this.searchBtnIcon) {
            setIcon(this.searchBtnIcon, this.isLoading ? 'loader-circle' : 'search');
        }
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
        if ((!hasQuery && !this.items.length) || (this.currentPage === 1 && !this.hasNextPage && !this.isLoading)) {
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
        setIcon(previousBtn.createSpan({ cls: 'lorebase-select-page-icon' }), 'chevron-left');

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
        setIcon(nextBtn.createSpan({ cls: 'lorebase-select-page-icon' }), 'chevron-right');

        previousBtn.disabled = this.isLoading || this.currentPage <= 1;
        nextBtn.disabled = this.isLoading || !this.hasNextPage;

        previousBtn.addEventListener('click', () => {
            if (previousBtn.disabled) return;
            this.currentPage = Math.max(1, this.currentPage - 1);
            void this.runSearch();
        });

        nextBtn.addEventListener('click', () => {
            if (nextBtn.disabled) return;
            this.currentPage += 1;
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
            const loadingEl = this.gridEl.createDiv({ cls: 'lorebase-select-empty lorebase-select-loading' });
            const loadingIcon = loadingEl.createSpan({ cls: 'lorebase-select-loading-icon' });
            setIcon(loadingIcon, 'loader-circle');
            loadingEl.createSpan({ text: t('notifyLoading') });
            return;
        }

        if (this.lastErrorText) {
            this.gridEl.createDiv({ cls: 'lorebase-select-empty is-error', text: this.lastErrorText });
            return;
        }

        const visible = this.visibleItems();
        if (!visible.length) {
            if (this.isMangaSearch() && this.mangaWorkType && this.currentQuery) {
                const empty = this.gridEl.createDiv({ cls: 'lorebase-select-empty' });
                empty.createSpan({ text: mangaSearchText('empty') });
                if (this.hasNextPage) empty.createSpan({ cls: 'lorebase-select-type-hint', text: mangaSearchText('next') });
                const clear = empty.createEl('button', { cls: 'lorebase-select-type-clear', text: mangaSearchText('all'),
                    attr: { type: 'button' } });
                clear.addEventListener('click', () => this.changeMangaType(''));
                return;
            }
            this.gridEl.createDiv({ cls: 'lorebase-select-empty', text: this.emptyText });
            return;
        }

        this.renderPosterCards(this.gridEl, visible);
    }

    private renderPosterCards(container: HTMLElement, items: T[], review = false): void {
        items.forEach((item, index) => {
            const card = container.createEl('button', { cls: 'lorebase-select-card', attr: { type: 'button', 'aria-label': item.title, 'aria-pressed': String(this.selected.has(this.getItemKey(item))), title: item.title } });
            card.setAttr('data-index', String(index));
            if (review) {
                card.setAttr('data-action', 'remove-selection');
                card.setAttr('aria-label', `${t('promptRemoveSelected')}: ${item.title}`);
            }
            const key = this.getItemKey(item);
            if (this.selected.has(key)) {
                card.addClass('is-picked');
            }
            if (!review && index === this.focusedIndex) {
                card.addClass('is-focused');
            }

            const image = card.createDiv({ cls: 'lorebase-select-card-image' });
            if (item.image) {
                this.setPreviewBackground(image, item.image, item);
            } else {
                image.addClass('is-empty');
            }

            setIcon(image.createSpan({ cls: 'lorebase-select-empty-poster-icon', attr: { 'aria-hidden': 'true' } }), 'image');
            card.createDiv({ cls: 'lorebase-select-card-check' });

            const fallbackMedia = this.mediaKind === 'games' ? 'game' : this.mediaKind === 'movies' ? 'movie' : this.mediaKind === 'series' || this.mediaKind === 'manga' ? this.mediaKind : undefined;
            const animeCountry = this.mediaKind === 'anime' && item.workTypeMedia !== 'movie' && item.workTypeMedia !== 'series';
            const classification = getSearchCardClassification(item, animeCountry, fallbackMedia);
            if (classification) {
                const badge = image.createSpan({ cls: 'lorebase-select-classification', text: classification, attr: { title: classification } });
                badge.style.setProperty('--lorebase-type-color', getMediaWorkTypeColor(animeCountry ? 'anime' : item.workTypeMedia ?? fallbackMedia ?? '', animeCountry ? item.countryOfOrigin ?? '' : item.workType ?? ''));
            }
            const body = card.createDiv({ cls: 'lorebase-select-card-body' });
            body.createDiv({ cls: 'lorebase-select-card-title', text: item.title });
            if (item.alreadyInLibrary) {
                card.addClass('is-in-library');
                if (this.manualKind && !(item.libraryPath && this.onOpenExisting)) card.setAttribute('aria-disabled', 'true');
                const badge = image.createDiv({ cls: 'lorebase-select-library-badge' });
                badge.setAttr('aria-label', t('promptAlreadyInLibrary'));
                badge.setAttr('title', t('promptAlreadyInLibrary'));
                const icon = badge.createSpan({ cls: 'lorebase-select-library-icon' });
                icon.setAttr('aria-hidden', 'true');
                setIcon(icon, 'book-check');
            }

            const metadata = getSearchCardMetadata(item, true);
            const meta = body.createDiv({ cls: 'lorebase-select-card-meta' });
            const sourceLabel = (item.directMatch ? [...this.providerOptions, ...this.alternateProviders] : this.alternateProviders).find(provider => provider.id === item.provider)?.label;
            const dateText = [metadata.meta, metadata.subtitle, sourceLabel].filter(Boolean).join(' · ');
            if (item.alreadyInLibrary) {
                meta.addClass('has-library-state');
                meta.createSpan({ cls: 'lorebase-select-library-state', text: item.libraryPath && this.onOpenExisting ? referenceText('openExisting') : t('promptInLibraryShort'), attr: { title: t('promptAlreadyInLibrary') } });
                if (dateText) meta.createSpan({ cls: 'lorebase-select-meta-separator', text: '·', attr: { 'aria-hidden': 'true' } });
            }
            meta.createSpan({ cls: 'lorebase-select-meta-details', text: dateText });
            const showPublicationStatus = () => {
                body.querySelector('.lorebase-select-publication-status')?.remove();
                const publication = getSearchPublicationStatus(item.publicationStatus);
                if (publication) body.createSpan({
                    cls: 'lorebase-select-publication-status', text: publication.label,
                    attr: { 'data-status': publication.value },
                });
            };
            showPublicationStatus();
            if (this.publicationStatusResolver && (!item.publicationStatus || item.provider === 'mangaupdates')) {
                const initialImage = item.image;
                let request = this.publicationRequests.get(key);
                if (!request) {
                    // Optional metadata must not delay the search or flood the
                    // catalogue with simultaneous detail requests.
                    request = this.publicationQueue.then(async () => {
                        if (!this.contentEl.isConnected || !this.contentEl.hasChildNodes()) return undefined;
                        const status = await this.publicationStatusResolver?.(item);
                        // The metadata lookup can also replace a small MangaUpdates cover.
                        if (item.provider === 'mangaupdates' && item.image) this.publicationImages.set(key, item.image);
                        return status;
                    }).catch(() => undefined);
                    this.publicationQueue = request;
                    this.publicationRequests.set(key, request);
                }
                void request.then(status => {
                    if (status) item.publicationStatus = status;
                    const poster = this.publicationImages.get(key);
                    if (poster) item.image = poster;
                    if (body.isConnected) showPublicationStatus();
                    if (image.isConnected && item.image && item.image !== initialImage) this.setPreviewBackground(image, item.image, item);
                });
            }

            card.addEventListener('click', () => {
                if (!review) { this.toggleSelection(item); return; }
                this.selected.delete(key);
                if (!this.selected.size) { this.renderSearchView(); return; }
                this.renderReviewView();
                const nextIndex = Math.min(index, this.selected.size - 1);
                this.contentEl.querySelector<HTMLButtonElement>(`[data-action="remove-selection"][data-index="${nextIndex}"]`)?.focus();
            });
            if (!review) card.addEventListener('mouseenter', () => this.updateFocus(index));
        });
    }

    private updateFocus(nextIndex: number): void {
        const max = this.visibleItems().length - 1;
        this.focusedIndex = Math.max(0, Math.min(max, nextIndex));
        this.gridEl?.querySelectorAll<HTMLElement>('.lorebase-select-card').forEach(card => {
            const index = Number(card.dataset.index);
            if (index === this.focusedIndex) card.addClass('is-focused');
            else card.removeClass('is-focused');
        });
    }

    private toggleSelection(item: T): void {
        if (this.hasResolved) return;
        if (item.alreadyInLibrary && item.libraryPath && this.onOpenExisting) { this.close(); this.onOpenExisting(item); return; }
        if (this.manualKind && item.alreadyInLibrary) return;
        const key = this.getItemKey(item);
        let isSelected: boolean;
        if (this.selected.has(key)) {
            this.selected.delete(key);
            isSelected = false;
        } else {
            if (this.maxSelection === 1) this.selected.clear();
            this.selected.set(key, item);
            isSelected = true;
        }
        if (this.pickOnClick && isSelected) { this.confirmSelection(); return; }
        this.renderSelected();
        if (this.maxSelection === 1) {
            this.renderGrid();
            return;
        }
        const index = this.visibleItems().findIndex((candidate) => this.getItemKey(candidate) === key);
        const card = index >= 0
            ? this.gridEl?.querySelector<HTMLElement>(`.lorebase-select-card[data-index="${index}"]`)
            : null;
        card?.toggleClass('is-picked', isSelected);
        card?.setAttribute('aria-pressed', String(isSelected));
    }

    private setPreviewBackground(target: HTMLElement, imageUrl: string, item?: T, allowFallback = true): void {
        const candidates = this.getImageCandidates(imageUrl);
        let index = 0;

        const apply = (): void => {
            const next = candidates[index];
            if (!next) {
                target.setCssStyles({ backgroundImage: '' });
                target.addClass('is-empty');
                if (allowFallback && item && this.imageFallbackResolver) {
                    void this.applyPreviewFallback(target, item);
                }
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

    private async applyPreviewFallback(target: HTMLElement, item: T): Promise<void> {
        if (!this.imageFallbackResolver) return;
        const key = this.getItemKey(item);
        let request = this.previewFallbackRequests.get(key);
        if (!request) {
            request = this.imageFallbackResolver(item).catch(() => '');
            this.previewFallbackRequests.set(key, request);
        }
        const fallback = (await request).trim();
        if (!fallback) return;
        item.image = fallback;
        if (target.isConnected) {
            this.setPreviewBackground(target, fallback, item, false);
        }
    }

    private async setMangaDexPreviewBackground(target: HTMLElement, url: string, onError: () => void): Promise<void> {
        const cached = this.previewObjectUrlCache.get(url);
        if (cached) {
            target.removeClass('is-empty');
            target.setCssStyles({ backgroundImage: `url("${cached}")` });
            return;
        }
        try {
            const response = await fetchBinary(url);
            if (!target.isConnected) return;
            const type = response.headers?.['content-type'] || 'image/jpeg';
            const objectUrl = URL.createObjectURL(new Blob([response.arrayBuffer], { type }));
            this.objectUrls.push(objectUrl);
            this.previewObjectUrlCache.set(url, objectUrl);
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
            `${base}.512.jpg`,
            imageUrl,
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
        this.previewObjectUrlCache.clear();
    }

    private onKeydown = (event: KeyboardEvent): void => {
        if (this.isManual || this.isReviewing || this.isSyncView) return;
        if (event.target instanceof HTMLElement && event.target.closest('button, input, select, textarea')) return;
        if (!this.visibleItems().length) return;
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
            const item = this.visibleItems()[this.focusedIndex];
            if (item) this.toggleSelection(item);
            return;
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            this.close();
        }
    };
}
