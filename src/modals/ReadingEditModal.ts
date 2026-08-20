import { App, Menu, Modal, setIcon, TFile } from 'obsidian';
import { DEFAULT_COVER, STATUS_CONFIG } from '../constants';
import { i18n, t } from '../localization';
import { BookItem, MangaItem, MangaPart, ReadingItem, ReadingStatus, RelatedMediaLink, UserRating } from '../types';
import { GenreEditModal } from './GenreEditModal';
import { CommunityRatingRefresh, renderCommunityRatingPanel } from './CommunityRatingPanel';
import { MediaSourceAction, renderMediaSourcePanel } from './MediaSourcePanel';
import { setupMobileEditor } from './mobileEditor';
import { bindSourceUrlButton } from './sourceUrlButton';
import { extractMarkdownSection } from '../services/markdownSections';
import { RelatedMediaEditor } from './RelatedMediaEditor';
import { HierarchicalDatePicker, validateDatePickers } from './HierarchicalDatePicker';
import { normalizeProgress, stepProgress } from '../utils/progress';

type ReadingUpdates = Partial<ReadingItem> & Record<string, unknown>;
type NotesMode = 'description' | 'myNotes';

export function normalizeReadingProgress(value: number | null, total: number | null): number | null {
    return normalizeProgress(value, total);
}

export function stepReadingProgress(current: number | null, delta: number, total: number | null): number | null {
    return stepProgress(current, delta, total);
}

export class ReadingEditModal extends Modal {
    private item: ReadingItem;
    private onSave: (updates: ReadingUpdates) => Promise<void>;
    private onDelete: () => void;
    private onRefreshCommunityRating?: CommunityRatingRefresh;

    private title: string;
    private poster: string;
    private horizontalPoster: string;
    private year: number | null;
    private selectedStatus: ReadingStatus;
    private selectedRating: UserRating;
    private favorite: boolean;
    private isAdult: boolean;
    private summary: string;
    private myNotes = '';
    private notesMode: NotesMode = 'description';
    private notesExpanded = false;
    private started: string;
    private finished: string;
    private sourceUrl: string;
    private genres: string[];
    private tags: string[];
    private authors: string[];
    private publisher: string;
    private releaseDate: string;
    private artists: string[];
    private pageCurrent: number | null;
    private pageTotal: number | null;
    private bookChapterCurrent: number | null;
    private bookChapterTotal: number | null;
    private chapterCurrent: number | null;
    private chapterTotal: number | null;
    private volumeCurrent: number | null;
    private volumeTotal: number | null;
    private parts: MangaPart[];
    private activePartId: string | null;
    private relatedMediaEditor: RelatedMediaEditor;
    private startedDatePicker?: HierarchicalDatePicker;
    private finishedDatePicker?: HierarchicalDatePicker;
    private releaseDatePicker?: HierarchicalDatePicker;

    private onKeydown = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') {
            event.preventDefault();
            this.close();
            return;
        }
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey) {
            event.preventDefault();
            void this.save();
        }
    };

    constructor(
        app: App,
        item: ReadingItem,
        onSave: (updates: ReadingUpdates) => Promise<void>,
        onDelete: () => void,
        onRefreshCommunityRating?: CommunityRatingRefresh,
        relatedCandidates: RelatedMediaLink[] = [],
        incomingRelated: RelatedMediaLink[] = [],
        private readonly onRefreshSource?: MediaSourceAction,
        private readonly onChangeSource?: MediaSourceAction
    ) {
        super(app);
        this.item = item;
        this.onSave = onSave;
        this.onDelete = onDelete;
        this.onRefreshCommunityRating = onRefreshCommunityRating;

        this.title = item.displayName;
        this.poster = item.imageUrl;
        this.horizontalPoster = item.horizontalImageUrl ?? '';
        this.year = item.year;
        this.selectedStatus = item.status;
        this.selectedRating = item.userRating;
        this.favorite = item.favorite;
        this.isAdult = item.type === 'manga' && item.isAdult;
        this.summary = item.summary || item.description || '';
        this.started = this.normalizeDateInput(item.started);
        this.finished = this.normalizeDateInput(item.finished);
        this.sourceUrl = item.sourceUrl ?? '';
        this.genres = this.normalizeList(item.genres);
        this.tags = this.normalizeList(item.tags);
        this.authors = this.normalizeList(item.authors);
        this.publisher = item.type === 'book' ? item.publisher ?? '' : '';
        this.releaseDate = item.type === 'book' ? this.normalizeDateInput(item.releaseDate) : '';
        this.artists = item.type === 'manga' ? this.normalizeList(item.artists) : [];
        this.pageCurrent = item.type === 'book' ? item.pageCurrent : null;
        this.pageTotal = item.type === 'book' ? item.pageTotal : null;
        this.bookChapterCurrent = item.type === 'book' ? item.chapterCurrent : null;
        this.bookChapterTotal = item.type === 'book' ? item.chapterTotal : null;
        this.chapterCurrent = item.type === 'manga' ? item.chapterCurrent : null;
        this.chapterTotal = item.type === 'manga' ? item.chapterTotal : null;
        this.volumeCurrent = item.type === 'manga' ? item.volumeCurrent : null;
        this.volumeTotal = item.type === 'manga' ? item.volumeTotal : null;
        this.parts = item.type === 'manga' ? (item.parts ?? []).map((part) => ({ ...part })) : [];
        this.activePartId = item.type === 'manga' ? item.activePartId ?? this.parts[0]?.id ?? null : null;
        this.relatedMediaEditor = new RelatedMediaEditor(
            app,
            item.filePath,
            item.relatedMedia ?? [],
            relatedCandidates,
            incomingRelated
        );
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('lorebase-edit-modal', 'lorebase-modal-root');
        this.modalEl.addClass('lorebase-edit-modal-container');
        this.modalEl.addClass('lorebase-editmode-modal-shell');
        this.modalEl.addEventListener('keydown', this.onKeydown);

        const root = contentEl.createDiv({ cls: 'lorebase-editmode-root lorebase-editmode-reading-root lorebase-modal-panel' });
        root.appendChild(this.createTemplateFragment(this.buildTemplate()));
        this.bindHeader(root);
        this.bindQuickSettings(root);
        this.bindFields(root);
        this.bindNotesDisclosure(root);
        this.bindPlayDates(root);
        this.bindNotes(root);
        void this.loadMyNotes(root);
        bindSourceUrlButton(root);
        this.bindStatus(root);
        this.bindRating(root);
        this.bindProgress(root);
        this.relatedMediaEditor.bind(root);
        this.renderGenreChips(root);
        this.renderTagChips(root);
        this.updateDates(root);
        this.updateCharCount(root);
        this.updateNotesDisclosureUI(root);
        this.updateNotesModeUI(root);
        if (this.item.type !== 'book' && this.onRefreshCommunityRating) {
            renderCommunityRatingPanel(root, this.item, this.onRefreshCommunityRating);
        }
        renderMediaSourcePanel(root, this.item, this.onRefreshSource, this.onChangeSource);
        setupMobileEditor(root, () => void this.save());
    }

    onClose(): void {
        this.startedDatePicker?.destroy();
        this.finishedDatePicker?.destroy();
        this.releaseDatePicker?.destroy();
        this.startedDatePicker = undefined;
        this.finishedDatePicker = undefined;
        this.releaseDatePicker = undefined;
        this.modalEl.removeEventListener('keydown', this.onKeydown);
        this.contentEl.empty();
        this.modalEl.removeClass('lorebase-editmode-modal-shell');
    }

    private createTemplateFragment(template: string): DocumentFragment {
        const parsed = new DOMParser().parseFromString(template, 'text/html');
        const fragment = createFragment();
        for (const child of Array.from(parsed.body.childNodes)) {
            fragment.appendChild(child.cloneNode(true));
        }
        return fragment;
    }

    private buildTemplate(): string {
        const isBook = this.item.type === 'book';
        const breadcrumb = isBook ? t('editBreadcrumbBooks') : t('editBreadcrumbManga');
        return `
            <div class="lorebase-editmode-view">
                <header class="lorebase-editmode-header">
                    <div class="lorebase-editmode-header-left">
                        <span class="lorebase-editmode-breadcrumb">${breadcrumb}</span>
                    </div>
                    <div class="lorebase-editmode-header-right">
                        <button type="button" class="lorebase-editmode-btn lorebase-editmode-btn-ghost" data-action="discard">${t('editCancel')}</button>
                        <button type="button" class="lorebase-editmode-btn lorebase-editmode-btn-primary" data-action="save">${t('editSave')}</button>
                        <button type="button" class="lorebase-editmode-icon-btn" data-action="overflow" aria-label="${t('editOverflow')}">...</button>
                    </div>
                </header>

                <div class="lorebase-editmode-grid">
                    <aside class="lorebase-editmode-column lorebase-editmode-column-left">
                        <section class="lorebase-editmode-panel lorebase-editmode-poster-card">
                            <div class="lorebase-editmode-panel-title-row">
                                <h3 class="lorebase-editmode-panel-title">${t('editPoster')}</h3>
                            </div>
                            <div class="lorebase-editmode-poster-frame">
                                <img class="lorebase-editmode-poster-image" data-role="poster" alt="${t('templateFieldPoster')}" />
                            </div>
                        </section>

                        <section class="lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-quick-settings">
                            <div class="lorebase-editmode-panel-title-row">
                                <h3 class="lorebase-editmode-panel-title">${t('editQuickSettings')}</h3>
                            </div>
                            <div class="lorebase-editmode-toggle-list">
                                <label class="lorebase-editmode-switch-row">
                                    <span class="lorebase-editmode-switch-label">${t('editFavorite')}</span>
                                    <button type="button" class="lorebase-editmode-switch lorebase-editmode-switch-favorite" data-toggle="favorite" aria-label="${t('editFavorite')}" aria-pressed="false"><span class="lorebase-editmode-switch-thumb"></span></button>
                                </label>
                                ${isBook ? '' : `
                                <label class="lorebase-editmode-switch-row">
                                    <span class="lorebase-editmode-switch-label" id="lorebase-reading-adult-label">${t('editAdult')}</span>
                                    <button type="button" class="lorebase-editmode-switch lorebase-editmode-switch-adult" data-toggle="adult" aria-labelledby="lorebase-reading-adult-label" aria-describedby="lorebase-reading-adult-tooltip" aria-pressed="false">
                                        <span class="lorebase-editmode-switch-thumb"></span>
                                        <span class="lorebase-editmode-switch-tooltip" id="lorebase-reading-adult-tooltip" role="tooltip">${t('editAdultVisibilityHint')}</span>
                                    </button>
                                </label>`}
                            </div>
                        </section>
                    </aside>

                    <main class="lorebase-editmode-column lorebase-editmode-column-center">
                        <section class="lorebase-editmode-panel lorebase-editmode-title-meta">
                            <div class="lorebase-editmode-title-row">
                                <input class="lorebase-editmode-title-input" data-field="title" type="text" aria-label="${t('templateFieldName')}" />
                            </div>
                            <div class="lorebase-editmode-meta-row">
                                <label class="lorebase-editmode-field">
                                    <span class="lorebase-editmode-field-label">${t('year')}</span>
                                    <input class="lorebase-editmode-input" data-field="year" type="number" inputmode="numeric" placeholder="2026" />
                                </label>
                            </div>
                            <div class="lorebase-editmode-field lorebase-editmode-genres-field">
                                <div class="lorebase-editmode-chip-row" data-role="genre-chips"></div>
                                <div class="lorebase-editmode-title-meta-actions">
                                    <button type="button" class="lorebase-editmode-btn lorebase-editmode-btn-ghost lorebase-editmode-notes-toggle" data-action="toggle-notes" aria-expanded="false">
                                        <span class="lorebase-editmode-notes-toggle-icon" data-role="notes-toggle-icon"></span>
                                        <span>${t('editDescription')}</span>
                                    </button>
                                </div>
                            </div>
                        </section>

                        <section class="lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-notes is-collapsed" data-component="NotesEditor">
                            <div class="lorebase-editmode-panel-title-row">
                                <h3 class="lorebase-editmode-panel-title" data-role="notes-title">${t('editDescription')}</h3>
                                <div class="lorebase-editmode-note-tabs" role="tablist">
                                    <button type="button" class="lorebase-editmode-note-tab is-active" data-mode="description">${t('editDescription')}</button>
                                    <button type="button" class="lorebase-editmode-note-tab" data-mode="myNotes">${t('editMyNotes')}</button>
                                </div>
                            </div>
                            <div class="lorebase-editmode-notes-shell">
                                <textarea class="lorebase-editmode-notes-input" data-field="summary" rows="9"></textarea>
                            </div>
                            <div class="lorebase-editmode-notes-footer">
                                <span class="lorebase-editmode-saved-indicator" data-role="saved-indicator">${t('editSaved')}</span>
                                <span class="lorebase-editmode-char-count" data-role="char-count">0 ${t('editCharsShort')}</span>
                            </div>
                        </section>

                        <section class="lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-reading-progress">
                            <div class="lorebase-editmode-panel-title-row">
                                <h3 class="lorebase-editmode-panel-title">${t('editProgress')}</h3>
                                <span class="lorebase-editmode-status-hint" data-role="progress-summary"></span>
                            </div>
                            <div class="lorebase-reading-progress-meters" data-role="progress-meters"></div>
                            <div class="lorebase-reading-progress-editor" data-role="progress-editor"></div>
                        </section>

                        <section class="lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-status-rating">
                            <div class="lorebase-editmode-panel-title-row">
                                <h3 class="lorebase-editmode-panel-title">${t('editStatus')} & ${t('editRating')}</h3>
                                <span class="lorebase-editmode-status-hint">${t('editTracking')}</span>
                            </div>
                            <div class="lorebase-editmode-status-shell">
                                <div class="lorebase-editmode-segmented" role="tablist" aria-label="${t('editStatus')}" data-role="status-segments"></div>
                            </div>
                            <div class="lorebase-editmode-rating-wrap">
                                <div class="lorebase-editmode-rating-head">
                                    <span class="lorebase-editmode-rating-caption">${t('editPersonalRating')}</span>
                                    <button type="button" class="lorebase-editmode-btn lorebase-editmode-btn-ghost lorebase-editmode-btn-tight" data-action="clear-rating">${t('editClear')}</button>
                                </div>
                                <div class="lorebase-editmode-stars" data-role="stars"></div>
                                <div class="lorebase-editmode-rating-meta">
                                    <span class="lorebase-editmode-rating-value" data-role="rating-value">0.0 / 5.0</span>
                                    <span class="lorebase-editmode-rating-hint">${t('editRatingHint')}</span>
                                </div>
                                <div class="lorebase-editmode-rating-line"><span class="lorebase-editmode-rating-line-fill" data-role="rating-line"></span></div>
                            </div>
                            <div class="lorebase-editmode-play-dates">
                                <label class="lorebase-editmode-date-field">
                                    <span class="lorebase-editmode-field-label">${t('editStarted')}</span>
                                    <div class="lorebase-editmode-date-input-row">
                                        <div class="lorebase-editmode-date-control">
                                            <button type="button" class="lorebase-editmode-date-control-icon" data-action="open-started-calendar" title="${t('editStarted')}" aria-label="${t('editStarted')}"></button>
                                            <input class="lorebase-editmode-input" data-field="started-date" type="text" inputmode="numeric" maxlength="10" />
                                        </div>
                                        <button type="button" class="lorebase-editmode-btn lorebase-editmode-btn-ghost lorebase-editmode-btn-tiny" data-action="today-started">${t('editToday')}</button>
                                    </div>
                                </label>
                                <label class="lorebase-editmode-date-field">
                                    <span class="lorebase-editmode-field-label">${t('editFinished')}</span>
                                    <div class="lorebase-editmode-date-input-row">
                                        <div class="lorebase-editmode-date-control">
                                            <button type="button" class="lorebase-editmode-date-control-icon" data-action="open-finished-calendar" title="${t('editFinished')}" aria-label="${t('editFinished')}"></button>
                                            <input class="lorebase-editmode-input" data-field="finished-date" type="text" inputmode="numeric" maxlength="10" />
                                        </div>
                                        <button type="button" class="lorebase-editmode-btn lorebase-editmode-btn-ghost lorebase-editmode-btn-tiny" data-action="today-finished">${t('editToday')}</button>
                                    </div>
                                </label>
                            </div>
                        </section>

                        <section class="lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-related lorebase-editmode-related-main">
                            <div class="lorebase-editmode-panel-title-row">
                                <h3 class="lorebase-editmode-panel-title">${t('editRelatedMedia')}</h3>
                                <button type="button" class="lorebase-editmode-btn lorebase-editmode-btn-tight" data-action="add-related">${t('editAddRelated')}</button>
                            </div>
                            <div class="lorebase-editmode-related-list" data-role="related-media"></div>
                        </section>
                    </main>

                    <aside class="lorebase-editmode-column lorebase-editmode-column-right">
                        <details class="lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-advanced">
                            <summary class="lorebase-editmode-panel-title-row lorebase-editmode-collapsible-summary">
                                <h3 class="lorebase-editmode-panel-title">${t('editAdvanced')}</h3>
                                <span class="lorebase-editmode-collapsible-caret" aria-hidden="true">v</span>
                            </summary>
                            <div class="lorebase-editmode-meta-row">
                                <label class="lorebase-editmode-field is-wide">
                                    <span class="lorebase-editmode-field-label">${t('templateFieldAuthors')}</span>
                                    <input class="lorebase-editmode-input" data-field="authors" type="text" placeholder="Author A, Author B" />
                                </label>
                                ${isBook ? `
                                <label class="lorebase-editmode-field is-wide">
                                    <span class="lorebase-editmode-field-label">${t('editPublisher')}</span>
                                    <input class="lorebase-editmode-input" data-field="publisher" type="text" placeholder="Publisher A, Publisher B" />
                                </label>
                                ${this.buildReleaseDateField()}` : `
                                <label class="lorebase-editmode-field is-wide">
                                    <span class="lorebase-editmode-field-label">${t('templateFieldArtists')}</span>
                                    <input class="lorebase-editmode-input" data-field="artists" type="text" placeholder="Artist A, Artist B" />
                                </label>`}
                            </div>
                        </details>

                        <section class="lorebase-editmode-panel lorebase-editmode-tags">
                            <div class="lorebase-editmode-panel-title-row"><h3 class="lorebase-editmode-panel-title">${t('tags')}</h3></div>
                            <div class="lorebase-editmode-chip-row" data-role="tag-chips"></div>
                            <input class="lorebase-editmode-input lorebase-editmode-tag-input" type="text" data-field="new-tag" placeholder="${t('editTagPlaceholder')}" />
                        </section>

                        <section class="lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-timestamps">
                            <div class="lorebase-editmode-panel-title-row"><h3 class="lorebase-editmode-panel-title">${t('editDates')}</h3></div>
                            <div class="lorebase-editmode-kv-list">
                                <div class="lorebase-editmode-kv-row"><span class="lorebase-editmode-kv-key">${t('editAdded')}</span><span class="lorebase-editmode-kv-val" data-role="ts-added">-</span></div>
                                <div class="lorebase-editmode-kv-row"><span class="lorebase-editmode-kv-key">${t('editUpdated')}</span><span class="lorebase-editmode-kv-val" data-role="ts-updated">-</span></div>
                            </div>
                        </section>
                    </aside>
                </div>
            </div>
        `;
    }

    private buildReleaseDateField(): string {
        return `
            <label class="lorebase-editmode-date-field is-wide">
                <span class="lorebase-editmode-field-label">${t('editReleaseDate')}</span>
                <div class="lorebase-editmode-date-control">
                    <button type="button" class="lorebase-editmode-date-control-icon" data-action="open-release-calendar" title="${t('editReleaseDate')}" aria-label="${t('editReleaseDate')}"></button>
                    <input class="lorebase-editmode-input" data-field="release-date" type="text" inputmode="numeric" maxlength="10" />
                </div>
            </label>
        `;
    }

    private bindHeader(root: HTMLElement): void {
        this.qs<HTMLButtonElement>(root, '[data-action="discard"]')?.addEventListener('click', () => this.close());
        this.qs<HTMLButtonElement>(root, '[data-action="save"]')?.addEventListener('click', () => void this.save());
        this.qs<HTMLButtonElement>(root, '[data-action="overflow"]')?.addEventListener('click', (event) => {
            const menu = new Menu();
            menu.addItem((item) => item.setTitle(t('contextDelete')).setIcon('trash-2').onClick(() => {
                this.close();
                this.onDelete();
            }));
            const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
            menu.showAtPosition({ x: rect.right, y: rect.bottom });
        });
    }

    private bindQuickSettings(root: HTMLElement): void {
        root.querySelectorAll<HTMLButtonElement>('.lorebase-editmode-switch').forEach((button) => {
            button.addEventListener('click', () => {
                const key = button.dataset.toggle;
                if (key === 'favorite') this.favorite = !this.favorite;
                if (key === 'adult' && this.item.type === 'manga') this.isAdult = !this.isAdult;
                this.updateQuickSettings(root);
            });
        });
        this.updateQuickSettings(root);
    }

    private updateQuickSettings(root: HTMLElement): void {
        this.updateQuickSettingSwitch(root, 'favorite', this.favorite);
        if (this.item.type === 'manga') {
            this.updateQuickSettingSwitch(root, 'adult', this.isAdult);
        }
    }

    private updateQuickSettingSwitch(root: HTMLElement, key: string, value: boolean): void {
        const button = this.qs<HTMLButtonElement>(root, `[data-toggle="${key}"]`);
        if (!button) return;
        button.setAttr('aria-pressed', String(value));
        button.toggleClass('is-active', value);
    }

    private bindFields(root: HTMLElement): void {
        this.setInput(root, '[data-field="title"]', this.title);
        this.setInput(root, '[data-field="year"]', this.year);
        this.setInput(root, '[data-field="summary"]', this.getCurrentNotesValue());
        this.setInput(root, '[data-field="started-date"]', this.started);
        this.setInput(root, '[data-field="finished-date"]', this.finished);
        this.setInput(root, '[data-field="authors"]', this.authors.join(', '));
        this.qs<HTMLImageElement>(root, '[data-role="poster"]')?.setAttr('src', this.poster || DEFAULT_COVER);

        if (this.item.type === 'book') {
            this.setInput(root, '[data-field="publisher"]', this.publisher);
            this.setInput(root, '[data-field="release-date"]', this.releaseDate);
        } else {
            this.setInput(root, '[data-field="artists"]', this.artists.join(', '));
        }

        this.bindText(root, '[data-field="title"]', (value) => this.title = value);
        this.bindNumber(root, '[data-field="year"]', (value) => this.year = value);
        this.bindText(root, '[data-field="authors"]', (value) => this.authors = this.splitList(value));
        if (this.item.type === 'book') {
            this.bindText(root, '[data-field="publisher"]', (value) => this.publisher = value);
        } else {
            this.bindText(root, '[data-field="artists"]', (value) => this.artists = this.splitList(value));
        }

        this.bindChipInput(root, '[data-field="new-tag"]', this.tags, () => this.renderTagChips(root), true);
    }

    private bindProgress(root: HTMLElement): void {
        this.renderProgress(root);
    }

    private bindNotesDisclosure(root: HTMLElement): void {
        const button = this.qs<HTMLButtonElement>(root, '[data-action="toggle-notes"]');
        button?.addEventListener('click', () => {
            this.notesExpanded = !this.notesExpanded;
            this.updateNotesDisclosureUI(root);
            if (this.notesExpanded) {
                window.setTimeout(() => this.qs<HTMLTextAreaElement>(root, '[data-field="summary"]')?.focus(), 0);
            }
        });
    }

    private bindPlayDates(root: HTMLElement): void {
        const started = this.qs<HTMLInputElement>(root, '[data-field="started-date"]');
        const finished = this.qs<HTMLInputElement>(root, '[data-field="finished-date"]');
        const startedTrigger = this.qs<HTMLButtonElement>(root, '[data-action="open-started-calendar"]');
        const finishedTrigger = this.qs<HTMLButtonElement>(root, '[data-action="open-finished-calendar"]');
        const releaseDate = this.qs<HTMLInputElement>(root, '[data-field="release-date"]');
        const releaseTrigger = this.qs<HTMLButtonElement>(root, '[data-action="open-release-calendar"]');

        if (started && startedTrigger) {
            setIcon(startedTrigger, 'calendar-days');
            this.startedDatePicker = new HierarchicalDatePicker(
                started,
                startedTrigger,
                () => this.started,
                (value) => { this.started = value; }
            );
            this.startedDatePicker.syncInput(this.started);
        }

        if (finished && finishedTrigger) {
            setIcon(finishedTrigger, 'calendar-days');
            this.finishedDatePicker = new HierarchicalDatePicker(
                finished,
                finishedTrigger,
                () => this.finished,
                (value) => { this.finished = value; }
            );
            this.finishedDatePicker.syncInput(this.finished);
        }

        if (releaseDate && releaseTrigger) {
            setIcon(releaseTrigger, 'calendar-days');
            this.releaseDatePicker = new HierarchicalDatePicker(
                releaseDate,
                releaseTrigger,
                () => this.releaseDate,
                (value) => { this.releaseDate = value; }
            );
            this.releaseDatePicker.syncInput(this.releaseDate);
        }

        this.qs<HTMLButtonElement>(root, '[data-action="today-started"]')?.addEventListener('click', () => {
            this.started = this.getTodayDateInput();
            this.startedDatePicker?.syncInput(this.started);
        });

        this.qs<HTMLButtonElement>(root, '[data-action="today-finished"]')?.addEventListener('click', () => {
            this.finished = this.getTodayDateInput();
            this.finishedDatePicker?.syncInput(this.finished);
        });
    }

    private bindNotes(root: HTMLElement): void {
        const summary = this.qs<HTMLTextAreaElement>(root, '[data-field="summary"]');
        summary?.addEventListener('input', () => {
            if (this.notesMode === 'description') this.summary = summary.value;
            else this.myNotes = summary.value;
            this.setText(root, '[data-role="saved-indicator"]', t('editUnsavedChanges'));
            this.updateCharCount(root);
        });

        root.querySelectorAll<HTMLButtonElement>('.lorebase-editmode-note-tab').forEach((button) => {
            button.addEventListener('click', () => {
                const mode = button.dataset.mode === 'myNotes' ? 'myNotes' : 'description';
                if (mode === this.notesMode) return;
                this.notesMode = mode;
                if (summary) summary.value = this.getCurrentNotesValue();
                this.updateNotesModeUI(root);
                this.updateCharCount(root);
            });
        });
    }

    private async loadMyNotes(root: HTMLElement): Promise<void> {
        const file = this.getFile();
        if (!file) return;
        try {
            const content = await this.app.vault.read(file);
            this.myNotes = extractMarkdownSection(content);
            if (this.notesMode === 'myNotes') {
                const summary = this.qs<HTMLTextAreaElement>(root, '[data-field="summary"]');
                if (summary) summary.value = this.myNotes;
                this.updateCharCount(root);
            }
        } catch (error) {
            console.warn('[LOREBASE] Failed to load My Notes section.', error);
        }
    }

    private renderProgress(root: HTMLElement): void {
        const meters = this.qs<HTMLElement>(root, '[data-role="progress-meters"]');
        const editor = this.qs<HTMLElement>(root, '[data-role="progress-editor"]');
        if (!meters || !editor) return;
        meters.empty();
        editor.empty();

        if (this.item.type === 'book') {
            this.setText(root, '[data-role="progress-summary"]', 'PAGES');
            this.createProgressMeter(meters, 'pages', t('templateFieldPageCurrent'), this.pageCurrent, this.pageTotal, '#26c6da');
            this.createProgressMeter(meters, 'book-chapters', t('templateFieldChapterCurrent'), this.bookChapterCurrent, this.bookChapterTotal, '#ffb02e');
            this.createStepper(editor, t('editPageCurrent'), this.pageCurrent, () => this.pageTotal, (value) => {
                this.pageCurrent = value;
                this.syncProgressView(root);
            }, (value) => {
                this.pageCurrent = value;
                this.renderProgress(root);
            });
            this.createNumberEditor(editor, t('editPageTotal'), this.pageTotal, (value) => {
                this.pageTotal = value;
                this.syncProgressView(root);
            });
            this.createNumberEditor(editor, t('editChapterCurrent'), this.bookChapterCurrent, (value) => {
                this.bookChapterCurrent = value;
                this.syncProgressView(root);
            });
            this.createNumberEditor(editor, t('editChapterTotal'), this.bookChapterTotal, (value) => {
                this.bookChapterTotal = value;
                this.syncProgressView(root);
            });
            return;
        }

        const active = this.getActivePart();
        this.setText(root, '[data-role="progress-summary"]', `VOLUME ${this.volumeCurrent ?? active?.volumeNumber ?? 1}`);
        this.createProgressMeter(meters, 'chapters', t('templateFieldChapterCurrent'), this.chapterCurrent, this.chapterTotal, '#26c6da');
        this.createProgressMeter(meters, 'volumes', t('templateFieldVolumeCurrent'), this.volumeCurrent, this.volumeTotal, '#ffb02e');
        this.createStepper(editor, t('editChapterCurrent'), this.chapterCurrent, () => this.chapterTotal, (value) => {
            this.chapterCurrent = value;
            this.updateActiveMangaPart({ chapterCurrent: value });
            this.syncProgressView(root);
        }, (value) => {
            this.chapterCurrent = value;
            this.updateActiveMangaPart({ chapterCurrent: value });
            this.renderProgress(root);
        });
        this.createNumberEditor(editor, t('editChapterTotal'), this.chapterTotal, (value) => {
            this.chapterTotal = value;
            this.updateActiveMangaPart({ chapterTotal: value });
            this.syncProgressView(root);
        });
        this.createNumberEditor(editor, t('editVolumeCurrent'), this.volumeCurrent, (value) => {
            this.volumeCurrent = value;
            const part = this.parts.find((candidate) => candidate.volumeNumber === value);
            if (part) this.activePartId = part.id;
            this.syncProgressView(root);
        });
        this.createNumberEditor(editor, t('editVolumeTotal'), this.volumeTotal, (value) => {
            this.volumeTotal = value;
            this.syncProgressView(root);
        });
    }

    private syncProgressView(root: HTMLElement): void {
        if (this.item.type === 'book') {
            this.setText(root, '[data-role="progress-summary"]', 'PAGES');
            this.updateProgressMeter(root, 'pages', this.pageCurrent, this.pageTotal);
            this.updateProgressMeter(root, 'book-chapters', this.bookChapterCurrent, this.bookChapterTotal);
            return;
        }
        const active = this.getActivePart();
        this.setText(root, '[data-role="progress-summary"]', `VOLUME ${this.volumeCurrent ?? active?.volumeNumber ?? 1}`);
        this.updateProgressMeter(root, 'chapters', this.chapterCurrent, this.chapterTotal);
        this.updateProgressMeter(root, 'volumes', this.volumeCurrent, this.volumeTotal);
    }

    private updateProgressMeter(root: HTMLElement, kind: string, current: number | null, total: number | null): void {
        const meter = this.qs<HTMLElement>(root, `[data-progress-kind="${kind}"]`);
        if (!meter) return;
        const percent = total && total > 0 ? Math.max(0, Math.min(100, Math.round(((current ?? 0) / total) * 100))) : 0;
        meter.style.setProperty('--reading-progress', `${percent}%`);
        const currentNode = this.qs<HTMLElement>(meter, '.lorebase-reading-progress-current');
        const totalNode = this.qs<HTMLElement>(meter, '.lorebase-reading-progress-total');
        if (currentNode) currentNode.textContent = String(current ?? 0);
        if (totalNode) totalNode.textContent = ` / ${total ?? '?'}`;
    }

    private createProgressMeter(container: HTMLElement, kind: string, label: string, current: number | null, total: number | null, color: string): void {
        const percent = total && total > 0 ? Math.max(0, Math.min(100, Math.round(((current ?? 0) / total) * 100))) : 0;
        const meter = container.createDiv({ cls: 'lorebase-reading-progress-meter', attr: { 'data-progress-kind': kind } });
        meter.style.setProperty('--reading-progress', `${percent}%`);
        meter.style.setProperty('--reading-progress-color', color);
        meter.createDiv({ cls: 'lorebase-reading-progress-ring' });
        const body = meter.createDiv({ cls: 'lorebase-reading-progress-body' });
        const count = body.createDiv({ cls: 'lorebase-reading-progress-count' });
        count.createSpan({ cls: 'lorebase-reading-progress-current', text: String(current ?? 0) });
        count.createSpan({ cls: 'lorebase-reading-progress-total', text: ` / ${total ?? '?'}` });
        body.createDiv({ cls: 'lorebase-reading-progress-label', text: label });
    }

    private createStepper(
        container: HTMLElement,
        label: string,
        current: number | null,
        getTotal: () => number | null,
        onInput: (value: number | null) => void,
        onStep?: (value: number | null) => void
    ): void {
        const field = container.createDiv({ cls: 'lorebase-reading-progress-field' });
        field.createDiv({ cls: 'lorebase-editmode-field-label', text: label });
        const row = field.createDiv({ cls: 'lorebase-editmode-anime-episode-row' });
        const decrement = row.createEl('button', { cls: 'lorebase-editmode-btn lorebase-editmode-btn-tight', text: '-1', attr: { type: 'button' } });
        const input = row.createEl('input', { cls: 'lorebase-editmode-input', attr: { type: 'number', inputmode: 'numeric' } });
        input.value = current !== null ? String(current) : '';
        const step = (delta: number): void => {
            const value = stepReadingProgress(this.parseNumber(input.value), delta, getTotal());
            input.value = value !== null ? String(value) : '';
            (onStep ?? onInput)(value);
        };
        decrement.addEventListener('click', () => step(-1));
        input.addEventListener('input', () => {
            const value = normalizeReadingProgress(this.parseNumber(input.value), getTotal());
            input.value = value !== null ? String(value) : '';
            onInput(value);
        });
        row.createEl('button', { cls: 'lorebase-editmode-btn lorebase-editmode-btn-tight', text: '+1', attr: { type: 'button' } })
            .addEventListener('click', () => step(1));
    }

    private createNumberEditor(container: HTMLElement, label: string, value: number | null, onChange: (value: number | null) => void): void {
        const field = container.createDiv({ cls: 'lorebase-reading-progress-field lorebase-reading-progress-number-field' });
        field.createDiv({ cls: 'lorebase-editmode-field-label', text: label });
        const input = field.createEl('input', { cls: 'lorebase-editmode-input', attr: { type: 'number', inputmode: 'numeric' } });
        input.value = value !== null ? String(value) : '';
        input.addEventListener('input', () => onChange(this.parseNumber(input.value)));
    }

    private bindStatus(root: HTMLElement): void {
        const host = this.qs<HTMLElement>(root, '[data-role="status-segments"]');
        if (!host) return;
        host.empty();
        for (const option of this.getReadingStatusOptions()) {
            const button = this.createStatusSegment(option.status, option.label);
            button.addEventListener('click', () => {
                this.selectedStatus = option.status;
                if (option.status === 'completed' && !this.finished) {
                    this.finished = this.getTodayDateInput();
                    this.finishedDatePicker?.syncInput(this.finished);
                }
                this.updateStatusUI(root);
            });
            host.appendChild(button);
        }
        this.updateStatusUI(root);
    }

    private bindRating(root: HTMLElement): void {
        const stars = this.qs<HTMLElement>(root, '[data-role="stars"]');
        if (!stars) return;
        stars.empty();
        for (let rawValue = 1; rawValue <= 5; rawValue++) {
            const value = rawValue as Exclude<UserRating, null>;
            const button = stars.createEl('button', {
                cls: 'lorebase-editmode-star',
                text: String.fromCharCode(9733),
                attr: { type: 'button', 'data-rating': String(value), 'aria-label': `${t('editRating')} ${value}` },
            });
            button.dataset.rating = String(value);
            button.addEventListener('click', () => {
                this.selectedRating = this.selectedRating === value ? null : value;
                this.updateRatingUI(root);
            });
        }
        this.qs<HTMLButtonElement>(root, '[data-action="clear-rating"]')?.addEventListener('click', () => {
            this.selectedRating = null;
            this.updateRatingUI(root);
        });
        this.updateRatingUI(root);
    }

    private renderGenreChips(root: HTMLElement): void {
        const container = this.qs<HTMLElement>(root, '[data-role="genre-chips"]');
        if (!container) return;
        container.empty();
        for (const genre of this.genres) {
            const chip = container.createEl('button', {
                cls: 'lorebase-editmode-chip',
                text: genre,
                attr: { type: 'button', title: t('editRemoveHint') },
            });
            chip.addEventListener('click', () => {
                this.genres = this.genres.filter((entry) => entry !== genre);
                this.renderGenreChips(root);
            });
        }
        const add = container.createEl('button', {
            cls: 'lorebase-editmode-chip lorebase-editmode-chip-add is-action',
            text: '+',
            attr: { type: 'button', 'aria-label': t('templateFieldGenres') },
        });
        add.addEventListener('click', () => {
            new GenreEditModal(this.app, this.genres, (values) => {
                this.genres = this.normalizeList(values);
                this.renderGenreChips(root);
            }).open();
        });
    }

    private renderTagChips(root: HTMLElement): void {
        this.renderChipList(root, '[data-role="tag-chips"]', this.tags, (value) => {
            this.tags = this.tags.filter((entry) => entry !== value);
            this.renderTagChips(root);
        }, '#');
    }

    private renderChipList(root: HTMLElement, selector: string, values: string[], onRemove: (value: string) => void, prefix = ''): void {
        const container = this.qs<HTMLElement>(root, selector);
        if (!container) return;
        container.empty();
        for (const value of values) {
            const chip = container.createEl('button', {
                cls: 'lorebase-editmode-chip',
                text: `${prefix}${value}`,
                attr: { type: 'button', title: t('editRemoveHint') },
            });
            chip.addEventListener('click', () => onRemove(value));
        }
    }

    private createStatusSegment(status: ReadingStatus, label: string): HTMLButtonElement {
        const button = createEl('button', {
            cls: 'lorebase-editmode-segment',
            attr: { type: 'button', 'aria-pressed': 'false' },
        });
        button.dataset.status = status;
        const icon = button.createSpan({ cls: 'lorebase-editmode-segment-icon', attr: { 'aria-hidden': 'true' } });
        icon.appendChild(this.createSvgIcon(STATUS_CONFIG[status].pathD));
        button.createSpan({ cls: 'lorebase-editmode-segment-label', text: label });
        return button;
    }

    private updateStatusUI(root: HTMLElement): void {
        root.querySelectorAll<HTMLButtonElement>('[data-role="status-segments"] .lorebase-editmode-segment').forEach(btn => {
            const active = btn.dataset.status === this.selectedStatus;
            btn.toggleClass('is-active', active);
            btn.setAttr('aria-pressed', String(active));
        });
    }

    private updateRatingUI(root: HTMLElement): void {
        root.querySelectorAll<HTMLButtonElement>('.lorebase-editmode-star').forEach(btn => {
            const value = Number(btn.dataset.rating ?? '0');
            btn.toggleClass('is-active', this.selectedRating !== null && value <= this.selectedRating);
        });
        const numeric = this.selectedRating ?? 0;
        this.setText(root, '[data-role="rating-value"]', `${numeric.toFixed(1)} / 5.0`);
        const line = this.qs<HTMLElement>(root, '[data-role="rating-line"]');
        if (line) line.style.width = `${Math.round((numeric / 5) * 100)}%`;
    }

    private updateDates(root: HTMLElement): void {
        this.setText(root, '[data-role="ts-added"]', this.formatHumanDate(this.item.dateAdded));
        this.setText(root, '[data-role="ts-updated"]', this.formatHumanDate(this.item.lastModified));
    }

    private updateCharCount(root: HTMLElement): void {
        this.setText(root, '[data-role="char-count"]', `${this.getCurrentNotesValue().length} ${t('editCharsShort')}`);
    }

    private getCurrentNotesValue(): string {
        return this.notesMode === 'description' ? this.summary : this.myNotes;
    }

    private updateNotesModeUI(root: HTMLElement): void {
        root.querySelectorAll<HTMLButtonElement>('.lorebase-editmode-note-tab').forEach((button) => {
            const mode = button.dataset.mode === 'myNotes' ? 'myNotes' : 'description';
            button.toggleClass('is-active', mode === this.notesMode);
        });
        const title = this.qs<HTMLElement>(root, '[data-role="notes-title"]');
        if (title) title.textContent = this.notesMode === 'description' ? t('editDescription') : t('editMyNotes');
    }

    private updateNotesDisclosureUI(root: HTMLElement): void {
        const panel = this.qs<HTMLElement>(root, '[data-component="NotesEditor"]');
        panel?.toggleClass('is-collapsed', !this.notesExpanded);
        const button = this.qs<HTMLButtonElement>(root, '[data-action="toggle-notes"]');
        if (button) {
            button.setAttr('aria-expanded', String(this.notesExpanded));
            button.toggleClass('is-active', this.notesExpanded);
        }
        const icon = this.qs<HTMLElement>(root, '[data-role="notes-toggle-icon"]');
        if (icon) {
            icon.empty();
            setIcon(icon, this.notesExpanded ? 'chevron-up' : 'chevron-down');
        }
    }

    private getReadingStatusOptions(): Array<{ status: ReadingStatus; label: string }> {
        return [
            { status: 'planned', label: t('statusPlanToRead') },
            { status: 'watching', label: t('statusReading') },
            { status: 'completed', label: t('statusReadCompleted') },
            { status: 'dropped', label: t('statusDropped') },
            { status: 'paused', label: t('statusPaused') },
        ];
    }

    private getActivePart(): MangaPart | null {
        if (!this.parts.length) return null;
        return this.parts.find((part) => part.id === this.activePartId) ?? this.parts[0] ?? null;
    }

    private updateActiveMangaPart(updates: Partial<MangaPart>): void {
        const part = this.parts.find((candidate) => candidate.id === this.activePartId);
        if (!part) return;
        Object.assign(part, updates);
        if ((part.chapterTotal ?? 0) > 0 && (part.chapterCurrent ?? 0) >= (part.chapterTotal ?? 0)) {
            part.status = 'completed';
        }
    }

    private bindText(root: HTMLElement, selector: string, handler: (value: string) => void): void {
        this.qs<HTMLInputElement>(root, selector)?.addEventListener('input', (event) => {
            handler((event.currentTarget as HTMLInputElement).value.trim());
        });
    }

    private bindNumber(root: HTMLElement, selector: string, handler: (value: number | null) => void): void {
        this.qs<HTMLInputElement>(root, selector)?.addEventListener('input', (event) => {
            handler(this.parseNumber((event.currentTarget as HTMLInputElement).value));
        });
    }

    private bindChipInput(root: HTMLElement, selector: string, target: string[], render: () => void, tag = false): void {
        const input = this.qs<HTMLInputElement>(root, selector);
        input?.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            this.addChipFromInput(input, target, render, tag);
        });
    }

    private addChipFromInput(input: HTMLInputElement | null | undefined, target: string[], render: () => void, tag = false): void {
        if (!input) return;
        const normalized = tag ? this.normalizeTag(input.value) : this.normalizeChip(input.value);
        if (!normalized || target.includes(normalized)) return;
        target.push(normalized);
        input.value = '';
        render();
    }

    private setText(root: HTMLElement, selector: string, value: string): void {
        const node = this.qs<HTMLElement>(root, selector);
        if (node) node.textContent = value;
    }

    private setInput(root: HTMLElement, selector: string, value: string | number | null | undefined): void {
        const input = this.qs<HTMLInputElement | HTMLTextAreaElement>(root, selector);
        if (input) input.value = value === null || value === undefined ? '' : String(value);
    }

    private qs<T extends Element>(root: HTMLElement, selector: string): T | null {
        return root.querySelector<T>(selector);
    }

    private getFile(): TFile | null {
        const file = this.app.vault.getAbstractFileByPath(this.item.filePath);
        return file instanceof TFile ? file : null;
    }

    async saveBeforeSourceRefresh(): Promise<boolean> {
        return this.save();
    }

    private async save(): Promise<boolean> {
        if (!validateDatePickers([this.startedDatePicker, this.finishedDatePicker, this.releaseDatePicker].filter((picker): picker is HierarchicalDatePicker => Boolean(picker)))) return false;
        const updates: ReadingUpdates = {
            displayName: this.title.trim() || this.item.displayName,
            imageUrl: this.poster === DEFAULT_COVER ? '' : this.poster,
            horizontalImageUrl: this.horizontalPoster,
            year: this.year,
            summary: this.summary,
            status: this.selectedStatus,
            userRating: this.selectedRating,
            favorite: this.favorite,
            genres: this.genres,
            tags: this.tags,
            sourceUrl: this.sourceUrl,
            started: this.started || null,
            finished: this.finished || null,
            authors: this.authors,
            relatedMedia: this.relatedMediaEditor.getValue(),
            myNotes: this.myNotes,
        };

        if (this.item.type === 'book') {
            Object.assign(updates, {
                publisher: this.publisher,
                releaseDate: this.releaseDate,
                pageCurrent: this.pageCurrent,
                pageTotal: this.pageTotal,
                chapterCurrent: this.bookChapterCurrent,
                chapterTotal: this.bookChapterTotal,
            } satisfies Partial<BookItem>);
        } else {
            Object.assign(updates, {
                artists: this.artists,
                chapterCurrent: this.chapterCurrent,
                chapterTotal: this.chapterTotal,
                volumeCurrent: this.volumeCurrent,
                volumeTotal: this.volumeTotal,
                parts: this.parts,
                activePartId: this.activePartId,
                isAdult: this.isAdult,
            } satisfies Partial<MangaItem>);
        }

        await this.onSave(updates);
        this.close();
        return true;
    }

    private normalizeList(values: string[]): string[] {
        return Array.from(new Set((values ?? []).map((value) => value.trim()).filter(Boolean)));
    }

    private splitList(value: string): string[] {
        return this.normalizeList(value.split(/[,;\n]+/));
    }

    private normalizeChip(value: string): string | null {
        const cleaned = value.trim().toLowerCase();
        return cleaned || null;
    }

    private normalizeTag(value: string): string | null {
        const cleaned = value.trim().replace(/^#+/, '').toLowerCase();
        return cleaned || null;
    }

    private parseNumber(value: string): number | null {
        if (!value.trim()) return null;
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : null;
    }

    private formatHumanDate(timestamp: number): string {
        if (!Number.isFinite(timestamp)) return t('editUnknown');
        const locale = i18n.getLocale();
        return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: '2-digit' }).format(new Date(timestamp));
    }

    private normalizeDateInput(value: string | null | undefined): string {
        const trimmed = String(value ?? '').trim();
        if (!trimmed) return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
        const parsed = Date.parse(trimmed);
        if (Number.isNaN(parsed)) return '';
        const date = new Date(parsed);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    private getTodayDateInput(): string {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    private createSvgIcon(pathD: string): SVGElement {
        const svg = createSvg('svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        const path = svg.createSvg('path');
        path.setAttribute('d', pathD);
        svg.appendChild(path);
        return svg;
    }
}
