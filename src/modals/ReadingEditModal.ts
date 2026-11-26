import { mountStatusReason } from '../components/StatusReasonField';
import { syncNotesReader } from '../components/NotesReader';
import { normalizeStatusReasons, type StatusReasons } from '../utils/statusReasons';
import { mountDiscovery } from '../components/DiscoveryContext';
import { mountReleaseDate } from '../components/ReleaseDateField';
import { normalizeReleaseDate } from '../utils/releaseDates';
import { normalizeChapterPosition, stepChapterPosition } from '../utils/mangaChapters';
import type { MediaPriority } from '../types';
import { normalizePriority } from '../utils/priority';
import { bindPriority } from '../components/PriorityControl';
import { normalizePersonalDate } from '../utils/personalDates';

import { renderCountriesControl, validateCountriesControl } from '../components/CountriesControl';
import { bindTrackingStatus, syncTrackingStatus, finishTrackingPanel } from '../components/EditTrackingPanel';
import { renderRepeatTracking } from '../components/RepeatTrackingControl';
import { renderWorkTypeControl } from '../components/MediaWorkTypeControl';
import { DetailedRatingEditor } from './DetailedRatingEditor';
import { App, Menu, Modal, setIcon, TFile } from 'obsidian';
import { DEFAULT_COVER } from '../constants';
import { i18n, t } from '../localization';
import { BookItem, MangaItem, MangaPart, RatingScaleSettings, ReadingItem, ReadingStatus, RelatedMediaLink, UserRating } from '../types';
import { GenreEditModal } from './GenreEditModal';
import { CommunityRatingRefresh, renderCommunityRatingPanel } from './CommunityRatingPanel';
import { MediaSourceAction, renderMediaSourcePanel } from './MediaSourcePanel';
import { setupMobileEditor } from './mobileEditor';
import { compactGameText } from '../localization/compactGameEditor';
import { appendEditorTemplate, bindCompactEditorChrome, buildCompactCoverIdentity, buildCompactQuickSettings, buildCompactWorkTypeBadge, buildEditorHeaderActions, buildEditorTimestampRows, buildSummaryNotesPanel, focusSummaryNotes, formatCompactEditorRating } from './compactEditorLayout';
import { bindCompactEditorChips, buildCompactEditorChips } from './compactEditorChips';
import { bindSourceUrlButton } from './sourceUrlButton';
import { extractMarkdownSection } from '../services/markdownSections';
import { RelatedMediaEditor } from './RelatedMediaEditor';
import { HierarchicalDatePicker, validateDatePickers } from './HierarchicalDatePicker';
import { normalizeProgress, stepProgress } from '../utils/progress';
import { CLASSIC_RATING_SETTINGS, getRatingFromStarPosition, getRatingInputHint, getRatingMax, getRatingStarValues } from '../utils/rating';
import { mountTenthsRating, paintRatingStar, updateRatingReadout, validateRatingInputs } from '../components/RatingInput';
import { normalizeMangaWorkType } from '../utils/mangaWorkType';

import { ReadingCycleEditor, type ReadingCycleLibrary } from '../components/ReadingCycleEditor';
import type { ReadingCycleUpdates } from '../services/media/readingCycle';

type ReadingUpdates = Partial<ReadingItem> & Record<string, unknown>;
type NotesMode = 'description' | 'myNotes';
type ReadingReleaseFallbackStatus = Exclude<ReadingStatus, 'to_be_released'>;

export function normalizeReadingProgress(value: number | null, total: number | null): number | null {
    return normalizeProgress(value, total);
}

export function stepReadingProgress(current: number | null, delta: number, total: number | null): number | null {
    return stepProgress(current, delta, total);
}

export class ReadingEditModal extends Modal {
    private countries?: string[];
    private item: ReadingItem;
    private onSave: (updates: ReadingUpdates) => Promise<void>;
    private onDelete: () => void;
    private onRefreshCommunityRating?: CommunityRatingRefresh;

    private title: string;
    private poster: string;
    private horizontalPoster: string;
    private year: number | null;
    private workType: string;
    private statusReasons?: StatusReasons;
    private discovery?: import('../types').DiscoveryContext;
    private selectedPriority: MediaPriority = 'normal';
    private selectedStatus: ReadingStatus;
    private statusBeforeRelease: ReadingReleaseFallbackStatus;
    private selectedRating: UserRating;
    private detailedRatingEditor: DetailedRatingEditor;
    private favorite: boolean;
    private isAdult: boolean;
    private summary: string;
    private myNotes = '';
    private notesMode: NotesMode = 'description';
    private notesExpanded = false;
    private started: string;
    private finished: string;
    private sourceUrl: string;
    private compactChips?: ReturnType<typeof bindCompactEditorChips>;
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
    private ratingSettings: RatingScaleSettings;
    private cycleEditor?: ReadingCycleEditor;

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
        private readonly onChangeSource?: MediaSourceAction,
        ratingSettings: RatingScaleSettings = CLASSIC_RATING_SETTINGS,
        private readonly onManageWorkTypes?: (onChanged: () => void) => void,
        private readonly compact = false,
        private readonly cycleLibrary?: ReadingCycleLibrary,
    ) {
        super(app);
        this.item = item;
        this.onSave = onSave;
        this.onDelete = onDelete;
        this.onRefreshCommunityRating = onRefreshCommunityRating;
        this.ratingSettings = ratingSettings;

        this.title = item.displayName;
        this.poster = item.imageUrl;
        this.horizontalPoster = item.horizontalImageUrl ?? '';
        this.year = item.year;
        this.workType = item.type === 'manga' ? normalizeMangaWorkType(item.workType) : '';
        this.selectedStatus = item.status;
        this.selectedPriority = normalizePriority(item.priority);
        this.discovery = item.discovery ? { ...item.discovery } : undefined;
        this.statusReasons = normalizeStatusReasons(item.statusReasons);
        this.statusBeforeRelease = item.status === 'to_be_released' ? 'planned' : item.status;
        this.selectedRating = item.userRating;
        this.detailedRatingEditor = new DetailedRatingEditor(item.detailedRatings, item.type, ratingSettings);
        this.favorite = item.favorite;
        this.isAdult = item.type === 'manga' && item.isAdult;
        this.summary = item.summary || item.description || '';
        this.started = normalizePersonalDate(item.started);
        this.finished = normalizePersonalDate(item.finished);
        this.sourceUrl = item.sourceUrl ?? '';
        this.genres = this.normalizeList(item.genres);
        this.tags = this.normalizeList(item.tags);
        this.authors = this.normalizeList(item.authors);
        this.publisher = item.type === 'book' ? item.publisher ?? '' : '';
        this.releaseDate = normalizeReleaseDate(item.releaseDate);
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
            incomingRelated,
            compact
        );
    }

    private repeatCount = 0;

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('lorebase-edit-modal', 'lorebase-modal-root');
        this.modalEl.addClass('lorebase-edit-modal-container');
        this.modalEl.addClass('lorebase-editmode-modal-shell');
        this.modalEl.addEventListener('keydown', this.onKeydown);

        const root = contentEl.createDiv({ cls: 'lorebase-editmode-root lorebase-editmode-reading-root lorebase-modal-panel' });
        appendEditorTemplate(root, this.buildTemplate());
        if (this.compact) bindCompactEditorChrome(root, this.modalEl, () => this.close());
        if (this.compact) {
            const progress = root.querySelector('.lorebase-editmode-reading-progress');
            const status = root.querySelector('.lorebase-editmode-status-rating');
            if (progress && status) progress.before(status);
        }
        renderCountriesControl(root, this.item, codes => this.countries = codes);
        this.bindHeader(root);
        this.bindQuickSettings(root);
        this.bindFields(root);
        this.bindNotesDisclosure(root);
        this.bindPlayDates(root);
        this.bindNotes(root);
        void this.loadMyNotes(root);
        bindSourceUrlButton(root);
        this.bindStatus(root);
        this.repeatCount = this.item.repeatCount ?? 0;
        renderRepeatTracking(root, this.item, this.repeatCount, value => this.repeatCount = value);
        this.bindRating(root);
        this.bindProgress(root);
        if (this.compact && this.item.type === 'book' && this.cycleLibrary) {
            this.cycleEditor = new ReadingCycleEditor(this.item, this.cycleLibrary, this.ratingSettings,
                () => this.cycleItem(), updates => this.applyCycleUpdates(root, updates),
                path => { void this.app.workspace.openLinkText(path, this.item.filePath); });
            const center = root.querySelector<HTMLElement>('.lorebase-editmode-column-center')!;
            this.cycleEditor.mount(center);
            const block = center.querySelector('[data-role="reading-cycle"]');
            if (block) center.querySelector('.lorebase-editmode-reading-progress')?.after(block);
        }
        this.relatedMediaEditor.bind(root);
        if (!this.compact) {
            this.renderGenreChips(root);
            this.renderTagChips(root);
        }
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
        this.compactChips?.destroy();
        this.compactChips = undefined;
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

    private buildTemplate(): string {
        const compact = this.compact;
        const notes = buildSummaryNotesPanel(compact);
        const isBook = this.item.type === 'book';
        return `
            <div class="lorebase-editmode-view">
                <header class="lorebase-editmode-header">
                    <div class="lorebase-editmode-header-left">
                        <span class="lorebase-editmode-breadcrumb" data-role="breadcrumb"></span>
                    </div>
                    <div class="lorebase-editmode-header-right">
                        ${buildEditorHeaderActions(compact)}
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
                            ${compact ? `${buildCompactCoverIdentity()}${isBook ? '' : buildCompactWorkTypeBadge()}` : ''}
                        </section>

                        <section class="lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-quick-settings">
                            <div class="lorebase-editmode-panel-title-row">
                                <h3 class="lorebase-editmode-panel-title">${t('editQuickSettings')}</h3>
                            </div>
                            ${compact ? buildCompactQuickSettings([
                                { key: 'favorite', label: t('editFavorite'), icon: 'heart' },
                                ...(!isBook ? [{ key: 'adult', label: t('editAdult'), hint: t('editAdultVisibilityHint') }] : []),
                                { key: 'release', label: t('statusToBeReleased'), icon: 'calendar-clock' },
                            ]) : `<div class="lorebase-editmode-toggle-list">
                                <label class="lorebase-editmode-switch-row">
                                    <span class="lorebase-editmode-switch-label">${t('editFavorite')}</span>
                                    <button type="button" class="lorebase-editmode-switch lorebase-editmode-switch-favorite" data-toggle="favorite" aria-label="${t('editFavorite')}" aria-pressed="false"><span class="lorebase-editmode-switch-thumb"></span></button>
                                </label>
                                <label class="lorebase-editmode-switch-row">
                                    <span class="lorebase-editmode-switch-label">${t('statusToBeReleased')}</span>
                                    <button type="button" class="lorebase-editmode-switch lorebase-editmode-switch-release" data-toggle="release" aria-label="${t('statusToBeReleased')}" aria-pressed="false"><span class="lorebase-editmode-switch-thumb"></span></button>
                                </label>
                                ${isBook ? '' : `
                                <label class="lorebase-editmode-switch-row">
                                    <span class="lorebase-editmode-switch-label" id="lorebase-reading-adult-label">${t('editAdult')}</span>
                                    <button type="button" class="lorebase-editmode-switch lorebase-editmode-switch-adult" data-toggle="adult" aria-labelledby="lorebase-reading-adult-label" aria-describedby="lorebase-reading-adult-tooltip" aria-pressed="false">
                                        <span class="lorebase-editmode-switch-thumb"></span>
                                        <span class="lorebase-editmode-switch-tooltip" id="lorebase-reading-adult-tooltip" role="tooltip">${t('editAdultVisibilityHint')}</span>
                                    </button>
                                </label>`}
                            </div>`}
                        </section>
                    </aside>

                    <main class="lorebase-editmode-column lorebase-editmode-column-center">
                        ${compact ? '' : `<section class="lorebase-editmode-panel lorebase-editmode-title-meta">
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
                        </section>`}

                        ${compact ? '' : notes}

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
                                <h3 class="lorebase-editmode-panel-title">${compact ? compactGameText('statusRating') : `${t('editStatus')} & ${t('editRating')}`}</h3>
                                <span class="lorebase-editmode-status-hint">${t('editTracking')}</span>
                            </div>
                            <div class="lorebase-editmode-status-shell">
                                <div class="lorebase-editmode-segmented" role="tablist" aria-label="${t('editStatus')}" data-role="status-segments"></div>
                            </div>
                            <div class="lorebase-editmode-rating-wrap">
                                <div class="lorebase-editmode-rating-head">
                                    <span class="lorebase-editmode-rating-caption">${t('editPersonalRating')}</span>
                                    <button type="button" class="lorebase-editmode-btn lorebase-editmode-btn-ghost lorebase-editmode-btn-tight" data-action="clear-rating">${compact ? compactGameText('reset') : t('editClear')}</button>
                                </div>
                                <div class="lorebase-editmode-stars" data-role="stars" role="group" aria-label="${t('editPersonalRating')}" title="${getRatingInputHint(this.ratingSettings, i18n.getLanguage())}"></div>
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

                        ${compact ? notes : ''}
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
                            <div class="${compact ? 'lorebase-editmode-advanced-grid' : 'lorebase-editmode-meta-row'}">
                                ${compact ? '<div data-role="compact-countries"></div>' : ''}
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
                                ${compact ? buildEditorTimestampRows() : ''}
                            </div>
                        </details>

                        <section class="lorebase-editmode-panel lorebase-editmode-tags">
                            ${compact ? buildCompactEditorChips() : `<div class="lorebase-editmode-panel-title-row"><h3 class="lorebase-editmode-panel-title">${t('tags')}</h3></div>
                            <div class="lorebase-editmode-chip-row" data-role="tag-chips"></div>
                            <input class="lorebase-editmode-input lorebase-editmode-tag-input" type="text" data-field="new-tag" placeholder="${t('editTagPlaceholder')}" />`}
                        </section>

                        ${compact ? '' : `<section class="lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-timestamps">
                            <div class="lorebase-editmode-panel-title-row"><h3 class="lorebase-editmode-panel-title">${t('editDates')}</h3></div>
                            ${buildEditorTimestampRows()}
                        </section>`}
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
        root.querySelectorAll<HTMLButtonElement>('.lorebase-editmode-quick-settings [data-toggle]').forEach((button) => {
            button.addEventListener('click', () => {
                const key = button.dataset.toggle;
                if (key === 'favorite') this.favorite = !this.favorite;
                if (key === 'adult' && this.item.type === 'manga') this.isAdult = !this.isAdult;
                if (key === 'release') {
                    if (this.selectedStatus === 'to_be_released') this.selectedStatus = this.statusBeforeRelease;
                    else {
                        this.statusBeforeRelease = this.selectedStatus;
                        this.selectedStatus = 'to_be_released';
                    }
                }
                this.updateQuickSettings(root);
                this.updateStatusUI(root);
            });
        });
        this.updateQuickSettings(root);
    }

    private updateQuickSettings(root: HTMLElement): void {
        this.updateQuickSettingSwitch(root, 'favorite', this.favorite);
        this.updateQuickSettingSwitch(root, 'release', this.selectedStatus === 'to_be_released');
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
        this.updateBreadcrumb(root);
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

        this.bindText(root, '[data-field="title"]', (value) => {
            this.title = value;
            this.updateBreadcrumb(root);
        });
        this.bindNumber(root, '[data-field="year"]', (value) => this.year = value);
        if (this.item.type === 'manga') {
            this.renderWorkTypeDropdown(root);
        }
        this.bindText(root, '[data-field="authors"]', (value) => this.authors = this.splitList(value));
        if (this.item.type === 'book') {
            this.bindText(root, '[data-field="publisher"]', (value) => this.publisher = value);
        } else {
            this.bindText(root, '[data-field="artists"]', (value) => this.artists = this.splitList(value));
        }

        if (this.compact) {
            this.compactChips = bindCompactEditorChips(root, {
                tags: { read: () => this.tags, write: values => { this.tags = values; }, normalize: value => this.normalizeTag(value) },
                genres: { read: () => this.genres, write: values => { this.genres = values; }, normalize: value => this.normalizeChip(value) },
            });
        } else this.bindChipInput(root, '[data-field="new-tag"]', this.tags, () => this.renderTagChips(root), true);
    }

    private renderWorkTypeDropdown(root: HTMLElement): void {
        renderWorkTypeControl(root, 'manga', this.workType, value => this.workType = value, this.onManageWorkTypes);
    }
    private bindProgress(root: HTMLElement): void {
        this.renderProgress(root);
    }

    private bindNotesDisclosure(root: HTMLElement): void {
        const button = this.qs<HTMLButtonElement>(root, '[data-action="toggle-notes"]');
        button?.addEventListener('click', () => {
            this.notesExpanded = !this.notesExpanded;
            this.updateNotesDisclosureUI(root);
            if (this.notesExpanded) focusSummaryNotes(root, this.compact);
        });
    }

    private bindPlayDates(root: HTMLElement): void {
        const started = this.qs<HTMLInputElement>(root, '[data-field="started-date"]');
        const finished = this.qs<HTMLInputElement>(root, '[data-field="finished-date"]');
        const startedTrigger = this.qs<HTMLButtonElement>(root, '[data-action="open-started-calendar"]');
        const finishedTrigger = this.qs<HTMLButtonElement>(root, '[data-action="open-finished-calendar"]');

        if (started && startedTrigger) {
            setIcon(startedTrigger, 'calendar-days');
            this.startedDatePicker = new HierarchicalDatePicker(
                started,
                startedTrigger,
                () => this.started,
                (value) => { this.started = value; },
                { allowPartial: true }
            );
            this.startedDatePicker.syncInput(this.started);
        }

        if (finished && finishedTrigger) {
            setIcon(finishedTrigger, 'calendar-days');
            this.finishedDatePicker = new HierarchicalDatePicker(
                finished,
                finishedTrigger,
                () => this.finished,
                (value) => { this.finished = value; },
                { allowPartial: true, allowUnknown: true }
            );
            this.finishedDatePicker.syncInput(this.finished);
        }

        this.releaseDatePicker = mountReleaseDate(root, () => this.releaseDate, value => this.releaseDate = value);

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

    showPart(partId: string): void {
        const part = this.parts.find(candidate => candidate.id === partId);
        if (!part || this.item.type !== 'manga') return;
        this.activePartId = part.id;
        this.volumeCurrent = part.volumeNumber ?? this.volumeCurrent;
        this.chapterCurrent = part.chapterCurrent;
        this.chapterTotal = part.chapterTotal;
        const root = this.contentEl.querySelector<HTMLElement>('.lorebase-editmode-root');
        if (!root) return;
        this.renderProgress(root);
        const editor = root.querySelector<HTMLElement>('[data-role="progress-editor"]');
        editor?.scrollIntoView({ block: 'center' });
        editor?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
    }

    private renderProgress(root: HTMLElement): void {
        this.cycleEditor?.refreshCurrent();
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
            if (part) { this.showPart(part.id); return; }
            this.syncProgressView(root);
        });
        this.createNumberEditor(editor, t('editVolumeTotal'), this.volumeTotal, (value) => {
            this.volumeTotal = value;
            this.syncProgressView(root);
        });

    }

    private syncProgressView(root: HTMLElement): void {
        this.cycleEditor?.refreshCurrent();
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
        if(this.item.type === 'manga' && kind === 'chapters' && current !== null) current=Math.floor(current);
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
        if(this.item.type === 'manga' && kind === 'chapters' && current !== null) current=Math.floor(current);
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
        const fractional=this.item.type === 'manga';
        field.createDiv({ cls: 'lorebase-editmode-field-label', text: label });
        const row = field.createDiv({ cls: 'lorebase-editmode-anime-episode-row' });
        const decrement = row.createEl('button', { cls: 'lorebase-editmode-btn lorebase-editmode-btn-tight', text: '-1', attr: { type: 'button' } });
        const input = row.createEl('input', { cls: 'lorebase-editmode-input', attr: { type: 'number', inputmode: 'numeric' } });
        if(fractional) { input.step='any';input.inputMode='decimal';input.dataset.field='chapter-position'; }
        input.value = current !== null ? String(current) : '';
        const step = (delta: number): void => {
            const value = fractional ? stepChapterPosition(normalizeChapterPosition(input.value),delta,getTotal()) : stepReadingProgress(this.parseNumber(input.value), delta, getTotal());
            input.value = value !== null ? String(value) : '';
            (onStep ?? onInput)(value);
        };
        decrement.addEventListener('click', () => step(-1));
        input.addEventListener('input', () => {
            const value = fractional ? normalizeChapterPosition(input.value,getTotal()) : normalizeReadingProgress(this.parseNumber(input.value), getTotal());
            if(!fractional) input.value = value !== null ? String(value) : '';
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
        bindTrackingStatus(root, this.item.type, this.selectedStatus, status => {
            this.selectedStatus = status;
            if (status !== 'to_be_released') this.statusBeforeRelease = status;
            this.updateStatusUI(root);
        });
    }

    private bindRating(root: HTMLElement): void {
        const ratingWrap = root.querySelector<HTMLElement>('.lorebase-editmode-rating-wrap');
        if (ratingWrap) this.detailedRatingEditor.mount(ratingWrap);
        mountTenthsRating(this.qs<HTMLElement>(root, '[data-role="rating-value"]'), this.ratingSettings,
            () => this.selectedRating, value => {
                this.selectedRating = value;
                this.updateRatingUI(root);
            }, t('editPersonalRating'));
        const stars = this.qs<HTMLElement>(root, '[data-role="stars"]');
        if (!stars) return;
        stars.empty();
        stars.toggleClass('is-custom-scale', this.ratingSettings.mode === 'custom');
        for (const value of getRatingStarValues(this.ratingSettings)) {
            const button = stars.createEl('button', {
                cls: 'lorebase-editmode-star',
                text: String.fromCharCode(9733),
                attr: { type: 'button', 'data-rating': String(value), 'aria-label': `${t('editRating')} ${value}` },
            });
            button.dataset.rating = String(value);
            button.addEventListener('click', (event) => {
                const rect = button.getBoundingClientRect();
                const next = event.detail === 0
                    ? value
                    : getRatingFromStarPosition(value, event.clientX - rect.left, rect.width, this.ratingSettings);
                this.selectedRating = this.selectedRating === next ? null : next;
                this.updateRatingUI(root);
            });
        }
        this.qs<HTMLButtonElement>(root, '[data-action="clear-rating"]')?.addEventListener('click', () => {
            this.selectedRating = null;
            this.updateRatingUI(root);
        });
        this.updateRatingUI(root);
        finishTrackingPanel(root);
        bindPriority(root, this.selectedPriority, value => { this.selectedPriority = value; });
        mountDiscovery(root, this.discovery, value => this.discovery = value, this.app);
        mountStatusReason(root,this.statusReasons,this.selectedStatus,value=>this.statusReasons=value,this.app);
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

    private updateStatusUI(root: HTMLElement): void {
        this.cycleEditor?.refreshCurrent();
        syncTrackingStatus(root, this.selectedStatus);
    }

    private updateRatingUI(root: HTMLElement): void {
        this.cycleEditor?.refreshCurrent();
        root.querySelectorAll<HTMLButtonElement>('.lorebase-editmode-star:not(.lorebase-criterion-star)').forEach(btn => {
            const value = Number(btn.dataset.rating ?? '0');
            paintRatingStar(btn, value, this.selectedRating, this.ratingSettings, this.item.type);
        });
        const numeric = this.selectedRating ?? 0;
        const max = getRatingMax(this.ratingSettings);
        updateRatingReadout(this.qs(root, '[data-role="rating-value"]'), this.selectedRating, this.compact
            ? formatCompactEditorRating(this.selectedRating, max)
            : `${numeric.toFixed(1)} / ${max.toFixed(1)}`);
        this.setText(root, '.lorebase-editmode-rating-hint', getRatingInputHint(this.ratingSettings, i18n.getLanguage()));
        const line = this.qs<HTMLElement>(root, '[data-role="rating-line"]');
        if (line) line.style.width = `${Math.round((numeric / max) * 100)}%`;
    }

    private updateDates(root: HTMLElement): void {
        this.setText(root, '[data-role="ts-added"]', this.formatHumanDate(this.item.dateAdded));
        this.setText(root, '[data-role="ts-updated"]', this.formatHumanDate(this.item.lastModified));
    }

    private updateCharCount(root: HTMLElement): void {
        syncNotesReader(root);
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
        if (title && !this.compact) title.textContent = this.notesMode === 'description' ? t('editDescription') : t('editMyNotes');
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

    private updateBreadcrumb(root: HTMLElement): void {
        const prefix = t(this.item.type === 'book' ? 'editBreadcrumbBooks' : 'editBreadcrumbManga');
        this.setText(root, '[data-role="breadcrumb"]', `${prefix} / ${this.title || this.item.displayName}`);
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
        if (!validateRatingInputs(this.contentEl)) return false;
        if (this.cycleEditor && !this.cycleEditor.prepareSave()) return false;
        if (!validateCountriesControl(this.contentEl)) return false;
        if (!validateDatePickers([this.startedDatePicker, this.finishedDatePicker, this.releaseDatePicker].filter((picker): picker is HierarchicalDatePicker => Boolean(picker)))) return false;
        this.compactChips?.commit();
        const updates: ReadingUpdates = {
            ...(this.countries !== undefined ? { countries: this.countries } : {}),
            displayName: this.title.trim() || this.item.displayName,
            imageUrl: this.poster === DEFAULT_COVER ? '' : this.poster,
            horizontalImageUrl: this.horizontalPoster,
            year: this.year,
            summary: this.summary,
            status: this.selectedStatus,
            userRating: this.selectedRating,
            detailedRatings: this.detailedRatingEditor.getValue(),
            favorite: this.favorite,
            priority: this.selectedPriority,
            statusReasons: this.statusReasons,
            ...(this.discovery || this.item.discovery ? { discovery: this.discovery } : {}),
            ...(this.item.type === 'manga' ? { repeatCount: this.repeatCount } : {}),
            genres: this.genres,
            tags: this.tags,
            sourceUrl: this.sourceUrl,
            releaseDate: this.releaseDate,
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
                workType: normalizeMangaWorkType(this.workType),
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

        const cycleChanges = this.cycleEditor?.getChanges() ?? [];
        Object.assign(updates, cycleChanges.find(change => change.item.filePath === this.item.filePath)?.updates);
        if (this.cycleLibrary) await this.cycleLibrary.save(cycleChanges.filter(change => change.item.filePath !== this.item.filePath));
        await this.onSave(updates);
        this.close();
        return true;
    }

    private normalizeList(values: string[]): string[] {
        return Array.from(new Set((values ?? []).map((value) => value.trim()).filter(Boolean)));
    }

    private cycleItem(): ReadingItem {
        const base = { ...this.item, displayName: this.title, imageUrl: this.poster, status: this.selectedStatus, userRating: this.selectedRating, finished: this.finished || null };
        return this.item.type === 'book'
            ? { ...base, type: 'book', pageCurrent: this.pageCurrent, pageTotal: this.pageTotal, chapterCurrent: this.bookChapterCurrent, chapterTotal: this.bookChapterTotal } as BookItem
            : { ...base, type: 'manga', chapterCurrent: this.chapterCurrent, chapterTotal: this.chapterTotal, volumeCurrent: this.volumeCurrent, volumeTotal: this.volumeTotal, parts: this.parts, activePartId: this.activePartId } as MangaItem;
    }

    private applyCycleUpdates(root: HTMLElement, updates: ReadingCycleUpdates): void {
        const value = { ...this.cycleItem(), ...updates } as ReadingItem;
        this.selectedStatus = value.status; this.selectedRating = value.userRating;
        this.finished = value.finished ?? ''; this.finishedDatePicker?.syncInput(this.finished);
        if (value.type === 'book') {
            this.pageCurrent = value.pageCurrent; this.pageTotal = value.pageTotal;
            this.bookChapterCurrent = value.chapterCurrent; this.bookChapterTotal = value.chapterTotal;
        } else {
            if (value.parts) this.parts = value.parts;
            if ('activePartId' in updates) this.activePartId = value.activePartId ?? null;
            this.chapterCurrent = value.chapterCurrent; this.chapterTotal = value.chapterTotal;
            this.volumeCurrent = value.volumeCurrent; this.volumeTotal = value.volumeTotal;
            const active = this.parts.find(part => part.id === this.activePartId);
            if (active) { active.chapterCurrent = this.chapterCurrent; active.chapterTotal = this.chapterTotal; active.status = this.selectedStatus; }
        }
        this.renderProgress(root); this.updateStatusUI(root); this.updateRatingUI(root);
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


    private getTodayDateInput(): string {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
}
