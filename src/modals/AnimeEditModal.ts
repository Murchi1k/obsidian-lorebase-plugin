import { mountStatusReason } from '../components/StatusReasonField';
import { focusNotesContent, syncNotesReader } from '../components/NotesReader';
import { normalizeStatusReasons, type StatusReasons } from '../utils/statusReasons';
import { applyContinuations } from '../services/media/partCatalog';
import { renderContinuationNotice } from '../components/ContinuationNotice';
import { mountDiscovery } from '../components/DiscoveryContext';
import { mountReleaseDate } from '../components/ReleaseDateField';
import { normalizeReleaseDate } from '../utils/releaseDates';
import { apt } from '../localization/animeParts';
import type { MediaPriority } from '../types';
import { normalizePriority } from '../utils/priority';
import { bindPriority } from '../components/PriorityControl';
import { normalizePersonalDate } from '../utils/personalDates';

import { bindTrackingStatus, syncTrackingStatus, finishTrackingPanel } from '../components/EditTrackingPanel';
import { RecommendationsPanel } from '../components/RecommendationsPanel';
import type { RecommendationsService } from '../services/RecommendationsService';
import { normalizeCountryMetadata } from '../services/media/statisticsCountries';
import { PartEpisodesControl, EpisodeLoader } from '../components/PartEpisodesControl';
import { bindEpisodeDuration, commonEpisodeDuration, fillMissingEpisodeDurations, syncEpisodeDuration } from '../components/ViewingDuration';
import { parseEpisodeDuration } from '../services/media/watchProgress';
import { PosterMode } from '../types';
import { getPartPoster, normalizePosterMode } from '../services/media/partPoster';
import { cancelPosterLoad, setSmoothPoster } from '../components/SmoothPoster';
import { buildTitlePartsProgress, buildTitlePartsHeader, buildTitlePartEditor, bindTitlePartEditor, bindTitlePartRating, createTitlePartDropdown, updateTitlePartTracking, updateTitlePartPresentation, updatePartEditorActions, updateTitlePartCard, updateTitlePartStatusAppearance } from '../components/TitlePartEditor';
import { renderRepeatTracking } from '../components/RepeatTrackingControl';
import { renderAnimeOriginControl } from '../components/MediaWorkTypeControl';
import { DetailedRatingEditor } from './DetailedRatingEditor';
import { getStatusOptionsForMediaType } from '../views/library/viewOptions';
import { getStatusAppearance, isCustomStatus } from '../statusPresentation';
/**
 * LOREBASE - Anime Edit Modal
 * Cinematic edit mode for anime tracking.
 */

import { App, Menu, Modal, Notice, setIcon, TFile } from 'obsidian';
import { AnimeFormat, AnimeItem, AnimePart, AnimeStatus, RatingScaleSettings, RelatedMediaLink, UserRating } from '../types';
import { DEFAULT_COVER } from '../constants';
import { i18n, t } from '../localization';
import { compactGameText } from '../localization/compactGameEditor';
import { bindCompactEditorChrome, buildCompactCoverIdentity, buildCompactQuickSettings, buildEditorHeaderActions, buildEditorTimestampRows, formatCompactEditorRating } from './compactEditorLayout';
import { bindCompactEditorChips, buildCompactEditorChips } from './compactEditorChips';
import { RelatedMediaEditor } from './RelatedMediaEditor';
import { createLorebaseDropdown, LorebaseDropdownHandle } from '../components/LorebaseDropdown';
import { GenreEditModal } from './GenreEditModal';
import { CommunityRatingRefresh, renderCommunityRatingPanel } from './CommunityRatingPanel';
import { MediaSourceAction, renderMediaSourcePanel } from './MediaSourcePanel';
import { setupMobileEditor } from './mobileEditor';
import { extractMarkdownSection } from '../services/markdownSections';
import { HierarchicalDatePicker, validateDatePickers } from './HierarchicalDatePicker';
import { CLASSIC_RATING_SETTINGS, getRatingFromStarPosition, getRatingInputHint, getRatingMax, getRatingStarValues } from '../utils/rating';
import { mountTenthsRating, paintRatingStar, updateRatingReadout, validateRatingInputs } from '../components/RatingInput';
import { setAnimePartStatus, setPartEpisodeCurrent } from '../services/media/videoProgress';
import { renderPartTabs, renderWatchProgress, resolvePartPoster, watchCopy } from '../components/WatchProgress';

type PartDraft = AnimePart;
export interface AnimePartsRefreshRequest { automatic: boolean; parts: AnimePart[]; activePartId: string | null; status: AnimeStatus; partCatalog?: import('../types').PartCatalog }

type AnimePartsRefreshResult = {
    partCatalog?: import('../types').PartCatalog;
    continuations?: import('../services/media/partCatalog').Continuation<AnimePart>[];
    parts: AnimePart[];
    activePartId: string | null;
    status: AnimeStatus;
};

type RelatedCandidate = RelatedMediaLink;
type NotesMode = 'description' | 'myNotes';
type AnimeReleaseFallbackStatus = Exclude<AnimeStatus, 'to_be_released'>;

export class AnimeEditModal extends Modal {
    private isClosed = false;
    private episodeControl?: PartEpisodesControl;
    private compactChips?: ReturnType<typeof bindCompactEditorChips>;
    private compactRelated?: RelatedMediaEditor;
    private recommendationsPanel?: RecommendationsPanel;
    private anime: AnimeItem;
    private onSave: (updates: Partial<AnimeItem>) => Promise<void>;
    private onDelete?: () => void;
    private onRefreshParts?: (request?: AnimePartsRefreshRequest) => Promise<AnimePartsRefreshResult | boolean | void>;
    private onRefreshCommunityRating?: CommunityRatingRefresh;

    private selectedRating: UserRating;
    private detailedRatingEditor: DetailedRatingEditor;
    private statusReasons?: StatusReasons;
    private discovery?: import('../types').DiscoveryContext;
    private selectedPriority: MediaPriority = 'normal';
    private selectedStatus: AnimeStatus;
    private partCatalog?: import('../types').PartCatalog;
    private statusBeforeRelease: AnimeReleaseFallbackStatus;
    private favorite: boolean;
    private countryOfOrigin: string;
    private isAdult: boolean;
    private title: string;
    private year: number | null;
    private summary: string;
    private myNotes = '';
    private notesMode: NotesMode = 'description';
    private notesExpanded = false;
    private started: string;
    private finished: string;
    private format: AnimeFormat;
    private genres: string[];
    private studios: string[];
    private tags: string[];
    private parts: PartDraft[];
    private activePartId: string | null;
    private editedPartId: string | null;
    private posterMode: PosterMode;
    private relatedMedia: RelatedMediaLink[];
    private relatedCandidates: RelatedCandidate[];
    private draggedRelatedPath: string | null = null;
    private formatDropdown?: LorebaseDropdownHandle<AnimeFormat>;
    private partKindDropdown?: LorebaseDropdownHandle<AnimeFormat>;
    private partRatingControl?: ReturnType<typeof bindTitlePartRating>;
    private partStatusDropdown?: LorebaseDropdownHandle<AnimeStatus>;
    private startedDatePicker?: HierarchicalDatePicker;
    private finishedDatePicker?: HierarchicalDatePicker;
    private releaseDatePicker?: HierarchicalDatePicker;
    private releaseDate: string;
    private ratingSettings: RatingScaleSettings;

    private onKeydown = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') {
            event.preventDefault();
            this.close();
            return;
        }

        if (
            event.key === 'Enter'
            && (event.ctrlKey || event.metaKey)
            && !event.shiftKey
            && !event.altKey
        ) {
            event.preventDefault();
            void this.save();
        }
    };

    constructor(
        app: App,
        anime: AnimeItem,
        onSave: (updates: Partial<AnimeItem>) => Promise<void>,
        onDelete?: () => void,
        onRefreshParts?: (request?: AnimePartsRefreshRequest) => Promise<AnimePartsRefreshResult | boolean | void>,
        onRefreshCommunityRating?: CommunityRatingRefresh,
        relatedCandidates: RelatedCandidate[] = [],
        private readonly onRefreshSource?: MediaSourceAction,
        private readonly onChangeSource?: MediaSourceAction,
        ratingSettings: RatingScaleSettings = CLASSIC_RATING_SETTINGS,
        private readonly episodeLoader?: EpisodeLoader,
        private readonly recommendationsService?: RecommendationsService,
        private readonly compactAnimeEditor = false,
        incomingRelated: RelatedMediaLink[] = []
    ) {
        super(app);
        this.anime = anime;
        this.partCatalog = anime.partCatalog ? structuredClone(anime.partCatalog) : undefined;
        this.onSave = onSave;
        this.onDelete = onDelete;
        this.onRefreshParts = onRefreshParts;
        this.onRefreshCommunityRating = onRefreshCommunityRating;
        this.ratingSettings = ratingSettings;

        this.selectedRating = anime.userRating;
        this.detailedRatingEditor = new DetailedRatingEditor(anime.detailedRatings, anime.type, ratingSettings);
        this.selectedStatus = anime.status;
        this.selectedPriority = normalizePriority(anime.priority);
        this.discovery = anime.discovery ? { ...anime.discovery } : undefined;
        this.statusReasons = normalizeStatusReasons(anime.statusReasons);
        this.releaseDate = normalizeReleaseDate(anime.releaseDate);
        this.statusBeforeRelease = anime.status === 'to_be_released' ? 'planned' : anime.status;
        this.favorite = anime.favorite;
        this.countryOfOrigin = anime.countryOfOrigin || '';
        this.isAdult = anime.isAdult;
        this.title = anime.displayName;
        this.year = anime.year;
        this.summary = anime.summary ?? anime.description ?? '';
        this.started = normalizePersonalDate(anime.started);
        this.finished = normalizePersonalDate(anime.finished) || this.formatDateForInput(anime.dateWatched);
        this.format = anime.format ?? 'tv';
        this.genres = this.normalizeGenres(anime.genres ?? []);
        this.studios = this.normalizeDisplayList(anime.studios ?? []);
        this.tags = this.normalizeTags(anime.tags ?? []);
        this.parts = this.normalizeParts(anime.parts);
        fillMissingEpisodeDurations(this.parts);
        this.relatedMedia = this.normalizeRelatedMedia(anime.relatedMedia ?? []);
        this.relatedCandidates = relatedCandidates.filter((candidate) => candidate.path !== anime.filePath);
        if (compactAnimeEditor) this.compactRelated = new RelatedMediaEditor(app, anime.filePath, this.relatedMedia, this.relatedCandidates, incomingRelated, true);
        this.activePartId = this.parts.some((part) => part.id === anime.activePartId)
            ? anime.activePartId ?? this.parts[0]?.id ?? null
            : this.parts[0]?.id ?? null;
        this.editedPartId = this.activePartId;
        this.posterMode = normalizePosterMode(anime.posterMode);
    }

    private repeatCount = 0;

    onOpen(): void {
        this.isClosed = false;
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('lorebase-edit-modal', 'lorebase-modal-root');
        this.modalEl.addClass('lorebase-edit-modal-container');
        this.modalEl.addClass('lorebase-editmode-modal-shell');
        this.modalEl.addEventListener('keydown', this.onKeydown);

        const root = contentEl.createDiv({ cls: 'lorebase-editmode-root lorebase-editmode-anime-root lorebase-modal-panel' });
        root.appendChild(this.createTemplateFragment(this.buildTemplate()));
        if (this.compactAnimeEditor) bindCompactEditorChrome(root, this.modalEl, () => this.close());
        this.bindStaticContent(root);
        const recommendationsHost = root.querySelector<HTMLElement>('[data-role="recommendations-panel"]');
        if (recommendationsHost && this.recommendationsService) this.recommendationsPanel = new RecommendationsPanel(recommendationsHost, this.anime, this.recommendationsService);
        this.bindHeader(root);
        this.bindQuickSettings(root);
        this.bindStatus(root);
        this.repeatCount = this.anime.repeatCount ?? 0;
        renderRepeatTracking(root, this.anime, this.repeatCount, value => this.repeatCount = value);
        this.bindRating(root);
        this.bindFields(root);
        renderAnimeOriginControl(root, this.countryOfOrigin, value => this.countryOfOrigin = value, this.isAdult, value => this.isAdult = value);
        this.bindParts(root);
        this.bindNotesDisclosure(root);
        this.bindPlayDates(root);
        this.bindNotes(root);
        void this.loadMyNotes(root);
        this.bindTags(root);
        if (this.compactRelated) this.compactRelated.bind(root);
        else this.bindRelatedMedia(root);
        this.bindDates(root);
        if (this.onRefreshCommunityRating) {
            renderCommunityRatingPanel(root, this.anime, this.onRefreshCommunityRating);
        }
        renderMediaSourcePanel(root, this.anime, this.onRefreshSource, this.onChangeSource);
        setupMobileEditor(root, () => void this.save());
    }

    onClose(): void {
        this.isClosed = true;
        this.episodeControl?.destroy();
        this.compactChips?.destroy();
        this.compactChips = undefined;
        this.recommendationsPanel?.destroy();
        const poster = this.contentEl.querySelector<HTMLImageElement>('[data-role="poster"]');
        if (poster) cancelPosterLoad(poster);
        this.startedDatePicker?.destroy();
        this.finishedDatePicker?.destroy();
        this.releaseDatePicker?.destroy();
        this.startedDatePicker = undefined;
        this.finishedDatePicker = undefined;
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
        const compact = this.compactAnimeEditor;
        const timestamps = buildEditorTimestampRows();
        const notesPanel = `<section class="lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-notes is-collapsed${compact ? ' lorebase-editmode-game-notes' : ''}" data-component="NotesEditor"${compact ? ' data-mobile-pane="general"' : ''}>
                            <div class="lorebase-editmode-panel-title-row">
                                <h3 class="lorebase-editmode-panel-title" data-role="notes-title">${compact ? compactGameText('descriptionNotes') : t('editDescription')}</h3>
                                <div class="lorebase-editmode-note-tabs" role="tablist">
                                    <button type="button" class="lorebase-editmode-note-tab is-active" data-mode="description">${t('editDescription')}</button>
                                    <button type="button" class="lorebase-editmode-note-tab" data-mode="myNotes">${compact ? compactGameText('myNotes') : t('editMyNotes')}</button>
                                </div>
                            </div>
                            <div class="lorebase-editmode-notes-shell">
                                <textarea class="lorebase-editmode-notes-input" data-field="summary" rows="9"></textarea>
                            </div>
                            <div class="lorebase-editmode-notes-footer">
                                <span class="lorebase-editmode-saved-indicator" data-role="saved-indicator">${t('editSaved')}</span>
                                <span class="lorebase-editmode-char-count" data-role="char-count">0 ${t('editCharsShort')}</span>
                            </div>
                        </section>`;
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
                            ${compact ? `${buildCompactCoverIdentity()}
                            <div class="lorebase-classification-panel lorebase-game-cover-type lorebase-anime-cover-country" role="group" aria-label="${t('templateFieldCountryOfOrigin')}">
                                <div class="lorebase-editmode-dropdown" data-field="country"></div>
                            </div>` : ''}
                        </section>

                        <section class="lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-quick-settings">
                            <div class="lorebase-editmode-panel-title-row">
                                <h3 class="lorebase-editmode-panel-title">${t('editQuickSettings')}</h3>
                            </div>
                            ${compact ? buildCompactQuickSettings([
                                { key: 'favorite', label: t('editFavorite'), icon: 'heart' },
                                { key: 'adult', label: t('editAdult'), hint: t('editAdultVisibilityHint') },
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
                                <label class="lorebase-editmode-field">
                                    <span class="lorebase-editmode-field-label">${t('editFormat')}</span>
                                    <div class="lorebase-editmode-dropdown" data-field="format"></div>
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

                        ${compact ? '' : notesPanel}

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
                                            <button type="button" class="lorebase-editmode-date-control-icon" data-action="open-started-calendar" data-role="started-date-icon" title="${t('editStarted')}" aria-label="${t('editStarted')}"></button>
                                            <input class="lorebase-editmode-input" data-field="started-date" type="text" inputmode="numeric" maxlength="10" />
                                        </div>
                                        <button type="button" class="lorebase-editmode-btn lorebase-editmode-btn-ghost lorebase-editmode-btn-tiny" data-action="today-started">${t('editToday')}</button>
                                    </div>
                                </label>
                                <label class="lorebase-editmode-date-field">
                                    <span class="lorebase-editmode-field-label">${t('editFinished')}</span>
                                    <div class="lorebase-editmode-date-input-row">
                                        <div class="lorebase-editmode-date-control">
                                            <button type="button" class="lorebase-editmode-date-control-icon" data-action="open-finished-calendar" data-role="finished-date-icon" title="${t('editFinished')}" aria-label="${t('editFinished')}"></button>
                                            <input class="lorebase-editmode-input" data-field="finished-date" type="text" inputmode="numeric" maxlength="10" />
                                        </div>
                                        <button type="button" class="lorebase-editmode-btn lorebase-editmode-btn-ghost lorebase-editmode-btn-tiny" data-action="today-finished">${t('editToday')}</button>
                                    </div>
                                </label>
                            </div>
                        </section>

                        ${compact ? notesPanel : ''}
                        <div data-role="recommendations-panel"></div>
                        <section class="lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-anime-parts${compact ? ' lorebase-title-composition' : ''}">
                            ${buildTitlePartsHeader(t('editAnimeParts'), t('animePartsCheck'), apt('autofill'))}
                            <div class="lorebase-editmode-anime-parts-navigation">
                                <div class="lorebase-part-tabs" data-role="part-strip"></div>
                            </div>
                            ${compact ? buildTitlePartsProgress() : '<div data-role="watch-progress"></div>'}
                            ${buildTitlePartEditor(compact)}
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
                            <div class="lorebase-editmode-advanced-grid">
                                ${compact ? `<div class="lorebase-editmode-field">
                                    <span class="lorebase-editmode-field-label">${t('editFormat')}</span>
                                    <div class="lorebase-editmode-dropdown" data-field="format"></div>
                                </div>` : ''}
                                <label class="lorebase-editmode-field">
                                    <span class="lorebase-editmode-field-label">${t('templateFieldStudios')}</span>
                                    <input class="lorebase-editmode-input" data-field="studios" type="text" placeholder="Studio A, Studio B" />
                                </label>
                                <div class="lorebase-editmode-path-row">
                                    <span class="lorebase-editmode-field-label">${t('editLocalPath')}</span>
                                    <code class="lorebase-editmode-local-path" data-role="local-path"></code>
                                    <button type="button" class="lorebase-editmode-btn lorebase-editmode-btn-ghost lorebase-editmode-btn-tight" data-action="browse-file">${t('editOpen')}</button>
                                </div>
                                ${compact ? timestamps : ''}
                            </div>
                        </details>

                        <section class="lorebase-editmode-panel lorebase-editmode-tags">
                            ${compact ? buildCompactEditorChips() : `<div class="lorebase-editmode-panel-title-row"><h3 class="lorebase-editmode-panel-title">${t('tags')}</h3></div>
                            <div class="lorebase-editmode-chip-row" data-role="tag-chips"></div>
                            <input class="lorebase-editmode-input lorebase-editmode-tag-input" type="text" data-field="new-tag" placeholder="${t('editTagPlaceholder')}" />`}
                        </section>

                        ${compact ? '' : `<section class="lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-timestamps">
                            <div class="lorebase-editmode-panel-title-row"><h3 class="lorebase-editmode-panel-title">${t('editDates')}</h3></div>
                            ${timestamps}
                        </section>`}
                    </aside>
                </div>
            </div>
        `;
    }

    private bindStaticContent(root: HTMLElement): void {
        this.setText(root, '[data-role="breadcrumb"]', `${t('editBreadcrumbAnime')} / ${this.anime.displayName}`);
        const poster = this.qs<HTMLImageElement>(root, '[data-role="poster"]');
        if (poster) {
            poster.src = this.anime.titleImageUrl || this.anime.imageUrl || DEFAULT_COVER;
            poster.alt = this.anime.displayName;
        }

        const title = this.qs<HTMLInputElement>(root, '[data-field="title"]');
        if (title) title.value = this.anime.displayName;
        const year = this.qs<HTMLInputElement>(root, '[data-field="year"]');
        if (year) year.value = this.year ? String(this.year) : '';
        const studios = this.qs<HTMLInputElement>(root, '[data-field="studios"]');
        if (studios) studios.value = this.studios.join(', ');
        const path = this.qs<HTMLElement>(root, '[data-role="local-path"]');
        if (path) path.textContent = this.anime.filePath;
        const summary = this.qs<HTMLTextAreaElement>(root, '[data-field="summary"]');
        if (summary) summary.value = this.getCurrentNotesValue();
        this.setInput(root, '[data-field="started-date"]', this.started);
        this.setInput(root, '[data-field="finished-date"]', this.finished);

        this.renderFormatDropdowns(root);
        this.renderStatusSegments(root);
        this.renderPartStatusSegments(root);
        this.renderStars(root);
        this.renderPartStrip(root);
        this.renderActivePartEditor(root);
        if (!this.compactAnimeEditor) {
            this.renderGenreChips(root);
            this.renderTagChips(root);
            this.renderRelatedMedia(root);
        }
        this.updateQuickSettingSwitches(root);
        this.updateStatusUI(root);
        this.updateRatingUI(root);
        this.updateProgressSummary(root);
        this.updateCharCount(root);
        this.updateNotesDisclosureUI(root);
        this.updateNotesModeUI(root);
    }

    private bindHeader(root: HTMLElement): void {
        this.qs<HTMLButtonElement>(root, '[data-action="discard"]')?.addEventListener('click', () => this.close());
        this.qs<HTMLButtonElement>(root, '[data-action="save"]')?.addEventListener('click', () => void this.save());
        this.qs<HTMLButtonElement>(root, '[data-action="overflow"]')?.addEventListener('click', (event) => {
            const menu = new Menu();
            menu.addItem((item) => {
                item.setTitle(t('contextDelete')).setIcon('trash-2').onClick(() => {
                    this.close();
                    this.onDelete?.();
                });
            });
            const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
            menu.showAtPosition({ x: rect.right, y: rect.bottom });
        });
    }

    private bindQuickSettings(root: HTMLElement): void {
        root.querySelectorAll<HTMLButtonElement>('.lorebase-editmode-quick-settings [data-toggle]').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.dataset.toggle === 'favorite') {
                    this.favorite = !this.favorite;
                }
                if (btn.dataset.toggle === 'adult') this.isAdult = !this.isAdult;
                if (btn.dataset.toggle === 'release') {
                    if (this.selectedStatus === 'to_be_released') this.selectedStatus = this.statusBeforeRelease;
                    else {
                        this.statusBeforeRelease = this.selectedStatus;
                        this.selectedStatus = 'to_be_released';
                    }
                }
                this.updateQuickSettingSwitches(root);
                this.updateStatusUI(root);
            });
        });
    }

    private bindStatus(root: HTMLElement): void {
        bindTrackingStatus(root, 'anime', this.selectedStatus, status => {
            this.selectedStatus = status;
            if (status !== 'to_be_released') this.statusBeforeRelease = status;
            if (status === 'completed') {
                for (const part of this.parts) setAnimePartStatus(part, 'completed');
                this.renderPartStatusSegments(root);
                this.renderPartStrip(root);
                this.updateProgressSummary(root);
                this.renderActivePartEditor(root);
            }
            this.updateStatusUI(root);
        });
        if (this.compactAnimeEditor) root.querySelectorAll<HTMLButtonElement>('.lorebase-tracking-status button').forEach(button => {
            button.title = button.textContent?.trim() ?? '';
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
        root.querySelectorAll<HTMLButtonElement>('.lorebase-editmode-star:not(.lorebase-criterion-star)').forEach(btn => {
            btn.addEventListener('click', (event) => {
                const value = Number(btn.dataset.rating);
                const rect = btn.getBoundingClientRect();
                this.selectedRating = event.detail === 0
                    ? value
                    : getRatingFromStarPosition(value, event.clientX - rect.left, rect.width, this.ratingSettings);
                this.updateRatingUI(root);
            });
        });
        this.qs<HTMLButtonElement>(root, '[data-action="clear-rating"]')?.addEventListener('click', () => {
            this.selectedRating = null;
            this.updateRatingUI(root);
        });
        finishTrackingPanel(root);
        bindPriority(root, this.selectedPriority, value => { this.selectedPriority = value; });
        mountDiscovery(root, this.discovery, value => this.discovery = value, this.app);
        mountStatusReason(root,this.statusReasons,this.selectedStatus,value=>this.statusReasons=value,this.app);
        this.releaseDatePicker = mountReleaseDate(root, () => this.releaseDate, value => this.releaseDate = value);
    }

    private bindFields(root: HTMLElement): void {
        const title = this.qs<HTMLInputElement>(root, '[data-field="title"]');
        title?.addEventListener('input', () => {
            this.title = title.value.trim();
            this.setText(
                root,
                '[data-role="breadcrumb"]',
                `${t('editBreadcrumbAnime')} / ${this.title || this.anime.displayName}`
            );
        });

        const year = this.qs<HTMLInputElement>(root, '[data-field="year"]');
        year?.addEventListener('input', () => {
            this.year = this.parseNumberInput(year.value);
        });

        const studios = this.qs<HTMLInputElement>(root, '[data-field="studios"]');
        studios?.addEventListener('input', () => {
            this.studios = this.normalizeDisplayList(studios.value.split(/[,;\n]+/));
        });

        this.qs<HTMLButtonElement>(root, '[data-action="browse-file"]')?.addEventListener('click', () => {
            const file = this.getFile();
            if (file) void this.app.workspace.getLeaf(true).openFile(file);
        });
    }

    private bindParts(root: HTMLElement): void {
        bindTitlePartEditor(root);
        this.partRatingControl = bindTitlePartRating(root, this.ratingSettings, 'anime', () => this.getEditedPart());
        const episodes = root.querySelector<HTMLElement>('[data-role="part-episodes"]');
        if (episodes) this.episodeControl = new PartEpisodesControl(episodes, () => this.getEditedPart(), change => {
            if (change === 'progress') this.setPartProgress(root, this.getEditedPart()?.episodeCurrent ?? 0);
            else { this.renderPartStrip(root); this.renderActivePartEditor(root); this.updateProgressSummary(root); }
        }, this.episodeLoader);
        bindEpisodeDuration(root, () => this.parts, () => {
            this.renderActivePartEditor(root);
            this.updateProgressSummary(root);
        });
        const composition = root.querySelector<HTMLElement>('.lorebase-editmode-anime-parts');
        const refreshButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-action="refresh-parts"], [data-action="autofill-parts"]'));
        for (const refreshButton of refreshButtons) {
            const automatic = refreshButton.dataset.action === 'autofill-parts';
            setIcon(refreshButton.querySelector<HTMLElement>('[data-role="autofill-parts-icon"]') ?? refreshButton, automatic ? 'wand-sparkles' : 'refresh-cw');
            refreshButton.disabled = !this.onRefreshParts;
            refreshButton.addEventListener('click', () => {
                if (!this.onRefreshParts) return;
                const status = this.selectedStatus;
                refreshButtons.forEach(button => button.disabled = true);
                composition?.setAttribute('inert', ''); composition?.setAttribute('aria-busy', 'true');
                void (async () => {
                    try {
                        const result = await this.onRefreshParts?.({ automatic, parts: structuredClone(this.parts), activePartId: this.activePartId, status, partCatalog: this.partCatalog });
                        if (!result || typeof result === 'boolean' || this.isClosed) return;
                        const currentStatus = this.selectedStatus;
                        this.applyRefreshedParts(root, result);
                        if (currentStatus !== status) { this.selectedStatus = currentStatus; this.updateStatusUI(root); }
                        if (automatic && !result.continuations?.length) new Notice(apt('filled'));
                    } catch { if (!this.isClosed) new Notice(apt('failed')); }
                    finally {
                        composition?.removeAttribute('inert'); composition?.removeAttribute('aria-busy');
                        refreshButtons.forEach(button => button.disabled = !this.onRefreshParts);
                    }
                })();
            });
        }


        this.qs<HTMLButtonElement>(root, '[data-action="add-part"]')?.addEventListener('click', () => {
            const nextIndex = this.parts.length + 1;
            const part: PartDraft = {
                id: this.createPartId('tv'),
                kind: 'tv',
                title: `${watchCopy().season} ${nextIndex}`,
                seasonNumber: nextIndex,
                episodeCurrent: 0,
                episodeTotal: null,
                episodeDuration: commonEpisodeDuration(this.parts),
                status: 'planned',
            };
            this.parts.push(part);
            this.editedPartId = part.id;
            this.renderPartStrip(root);
            this.renderActivePartEditor(root);
            this.updateProgressSummary(root);
            this.updatePartActions(root);
            this.qs<HTMLInputElement>(root, '[data-field="part-title"]')?.focus();
        });

        this.qs<HTMLButtonElement>(root, '[data-action="remove-part"]')?.addEventListener('click', () => {
            if (this.parts.length <= 1) return;
            const activePart = this.getEditedPart();
            if (!activePart) return;
            const activeIndex = this.parts.findIndex((part) => part.id === activePart.id);
            this.parts = this.parts.filter((part) => part.id !== activePart.id);
            const nextPart = this.parts[Math.min(Math.max(activeIndex, 0), this.parts.length - 1)] ?? this.parts[0] ?? null;
            this.editedPartId = nextPart?.id ?? null;
            if (this.activePartId === activePart.id) this.activePartId = nextPart?.id ?? null;
            this.renderPartStrip(root);
            this.renderActivePartEditor(root);
            this.updateProgressSummary(root);
            this.updatePartActions(root);
        });

        this.qs<HTMLButtonElement>(root, '[data-action="episode-dec"]')?.addEventListener('click', () => {
            this.setPartProgress(root, (this.getEditedPart()?.episodeCurrent ?? 0) - 1);
        });
        this.qs<HTMLButtonElement>(root, '[data-action="episode-inc"]')?.addEventListener('click', () => {
            this.setPartProgress(root, (this.getEditedPart()?.episodeCurrent ?? 0) + 1);
        });
        const bindPartField = (selector: string, handler: (part: PartDraft, input: HTMLInputElement) => void): void => {
            const input = this.qs<HTMLInputElement>(root, selector);
            input?.addEventListener('input', () => {
                const part = this.getEditedPart();
                if (!part) return;
                handler(part, input);
                this.renderPartStrip(root);
                this.updateProgressSummary(root);
            });
            input?.addEventListener('change', () => {
                const part = this.getEditedPart();
                if (!part) return;
                handler(part, input);
                this.renderPartStrip(root);
                this.updateProgressSummary(root);
            });
        };

        bindPartField('[data-field="part-title"]', (part, input) => {
            part.title = input.value.trim();
        });
        bindPartField('[data-field="part-episode-current"]', (_part, input) => {
            this.setPartProgress(root, this.parseNumberInput(input.value) ?? 0);
        });
        bindPartField('[data-field="part-episode-total"]', (part, input) => {
            part.episodeTotal = this.parseNumberInput(input.value);
        });
        bindPartField('[data-field="part-duration"]', (part, input) => {
            part.episodeDuration = this.parseNumberInput(input.value) || null;
        });
        bindPartField('[data-field="part-year"]', (part, input) => {
            part.year = this.parseNumberInput(input.value) || null;
        });
        bindPartField('[data-field="part-poster"]', (part, input) => {
            part.poster = input.value.trim() || null;
        });
        this.qs<HTMLInputElement>(root, '[data-field="part-episode-total"]')?.addEventListener('change', () => {
            this.setPartProgress(root, this.getEditedPart()?.episodeCurrent ?? 0);
        });
    }

    private applyRefreshedParts(root: HTMLElement, result: AnimePartsRefreshResult): void {
        if (result.continuations?.length) {
            renderContinuationNotice(root, result.continuations, false, (selected, resume) => {
                const applied = applyContinuations(this.parts, result.continuations!, selected, resume);
                this.partCatalog = result.partCatalog;
                root.querySelector('.lorebase-continuations')?.remove();
                this.applyRefreshedParts(root, { parts: applied.parts, activePartId: applied.activeId ?? this.activePartId, status: resume ? 'watching' : this.selectedStatus, partCatalog: this.partCatalog });
                if (applied.activeId) { this.editedPartId = applied.activeId; this.renderActivePartEditor(root); }
            });
        } else {
            this.partCatalog = result.partCatalog ?? this.partCatalog;
            root.querySelector('.lorebase-continuations')?.remove();
        }

        const draftRatings = new Map(this.parts.map(part => [part.id, part.userRating]));
        const draftEpisodeRatings = new Map(this.parts.map(part => [part.id, part.episodeRatings]));
        this.parts = result.parts.map(part => {
            const rating = draftRatings.get(part.id);
            const episodeRatings = draftEpisodeRatings.get(part.id);
            return { ...part, ...(rating === undefined ? {} : { userRating: rating }), ...(episodeRatings === undefined ? {} : { episodeRatings: { ...episodeRatings } }) };
        });
        fillMissingEpisodeDurations(this.parts);
        this.activePartId = result.activePartId && this.parts.some((part) => part.id === result.activePartId)
            ? result.activePartId
            : this.parts[0]?.id ?? null;
        if (!this.parts.some(part => part.id === this.editedPartId)) this.editedPartId = this.activePartId;
        this.selectedStatus = result.status;

        const activePart = this.getActivePart();
        if (activePart) {
            this.format = activePart.kind;
            this.formatDropdown?.setValue(this.format);
        }

        this.renderPartStrip(root);
        this.renderActivePartEditor(root);
        this.updateProgressSummary(root);
        this.updatePartActions(root);
        this.updateStatusUI(root);
    }

    private bindNotesDisclosure(root: HTMLElement): void {
        const button = this.qs<HTMLButtonElement>(root, '[data-action="toggle-notes"]');
        button?.addEventListener('click', () => {
            this.notesExpanded = !this.notesExpanded;
            this.updateNotesDisclosureUI(root);
            if (this.notesExpanded) {
                window.setTimeout(() => {
                    focusNotesContent(root, this.compactAnimeEditor);
                    if (this.compactAnimeEditor) {
                        this.qs<HTMLElement>(root, '[data-component="NotesEditor"]')?.scrollIntoView({ block: 'nearest' });
                    }
                }, 0);
            }
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

    private bindTags(root: HTMLElement): void {
        if (this.compactAnimeEditor) {
            this.compactChips = bindCompactEditorChips(root, {
                tags: { read: () => this.tags, write: values => { this.tags = values; }, normalize: value => this.normalizeTag(value) },
                genres: { read: () => this.genres, write: values => { this.genres = values; }, normalize: value => this.normalizeGenre(value) },
            });
            return;
        }
        const input = this.qs<HTMLInputElement>(root, '[data-field="new-tag"]');
        input?.addEventListener('keydown', event => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            const normalized = this.normalizeTag(input.value);
            if (!normalized || this.tags.includes(normalized)) return;
            this.tags.push(normalized);
            input.value = '';
            this.renderTagChips(root);
        });
    }

    private bindRelatedMedia(root: HTMLElement): void {
        this.qs<HTMLButtonElement>(root, '[data-action="add-related"]')?.addEventListener('click', () => {
            const selected = new Set(this.relatedMedia.map((item) => item.path));
            const candidates = this.relatedCandidates.filter((candidate) => !selected.has(candidate.path));
            new RelatedMediaPickerModal(this.app, candidates, (items) => {
                this.relatedMedia = this.normalizeRelatedMedia([...this.relatedMedia, ...items]);
                this.renderRelatedMedia(root);
            }).open();
        });
    }

    private bindDates(root: HTMLElement): void {
        const file = this.getFile();
        if (!file) return;
        this.setText(root, '[data-role="ts-added"]', this.formatHumanDate(file.stat.ctime));
        this.setText(root, '[data-role="ts-updated"]', this.formatHumanDate(file.stat.mtime));
    }

    private renderStatusSegments(root: HTMLElement): void {
        const container = this.qs<HTMLElement>(root, '[data-role="status-segments"]');
        if (!container) return;
        container.empty();
        for (const option of this.getAnimeStatusOptions().filter((entry) => entry.status !== 'to_be_released')) {
            container.appendChild(this.createStatusSegment(option.status, option.label));
        }
    }

    private renderPartStatusSegments(root: HTMLElement): void {
        const container = this.qs<HTMLElement>(root, '[data-role="part-status-segments"]');
        if (!container) return;
        this.partStatusDropdown = createTitlePartDropdown(container,
            this.getAnimeStatusOptions().map(option => ({ value: option.status, label: option.label })),
            this.getEditedPart()?.status ?? 'planned', value => {
            const part = this.getEditedPart();
            if (!part) return;
            setAnimePartStatus(part, value);
            this.renderActivePartEditor(root);
            this.renderPartStrip(root);
            this.updateProgressSummary(root);
        }, t('editStatus'));
        this.updatePartStatusUI(root);
        this.updatePartActions(root);
    }

    private updatePartActions(root: HTMLElement): void {
        const remove = this.qs<HTMLButtonElement>(root, '[data-action="remove-part"]');
        if (!remove) return;
        const disabled = this.parts.length <= 1;
        remove.disabled = disabled;
        remove.toggleClass('is-disabled', disabled);
        remove.toggleClass('is-hidden', disabled);
        remove.setAttr('aria-label', disabled ? t('editCannotRemoveLastPart') : t('editRemovePart'));
        updatePartEditorActions(root);
    }

    private renderStars(root: HTMLElement): void {
        const stars = this.qs<HTMLElement>(root, '[data-role="stars"]');
        if (!stars) return;
        stars.empty();
        stars.toggleClass('is-custom-scale', this.ratingSettings.mode === 'custom');
        for (const i of getRatingStarValues(this.ratingSettings)) {
            const button = stars.createEl('button', {
                cls: 'lorebase-editmode-star',
                text: String.fromCharCode(9733),
                attr: { type: 'button', 'data-rating': String(i), 'aria-label': `${t('editRating')} ${i}` },
            });
            button.dataset.rating = String(i);
        }
    }

    private setPartProgress(root: HTMLElement, value: number): void {
        const part = this.getEditedPart();
        if (!part) return;
        setPartEpisodeCurrent(part, value);
        if ((this.selectedStatus === 'planned' && (part.episodeCurrent ?? 0) > 0) || (this.selectedStatus === 'completed' && part.status !== 'completed')) this.selectedStatus = part.status;
        this.renderPartStrip(root);
        this.renderActivePartEditor(root);
        this.updateProgressSummary(root);
        this.updateStatusUI(root);
    }

    showPart(partId: string): void {
        if (!this.parts.some(part => part.id === partId)) return;
        this.editedPartId = partId;
        const root = this.contentEl.querySelector<HTMLElement>('.lorebase-editmode-root');
        if (!root) return;
        this.renderPartStrip(root);
        this.renderActivePartEditor(root);
        root.querySelector('[data-role="part-editor"]')?.scrollIntoView({ block: 'center' });
        this.qs<HTMLInputElement>(root, '[data-field="part-title"]')?.focus({ preventScroll: true });
    }

    private renderPartStrip(root: HTMLElement): void {
        const host = this.qs<HTMLElement>(root, '[data-role="part-strip"]');
        if (!host) return;
        const active = this.getEditedPart();
        renderPartTabs({
            host, editor: this.qs<HTMLElement>(root, '[data-role="part-editor"]'),
            mediaType: 'anime',
            parts: this.parts, selectedPartId: active?.id ?? null, activePartId: this.activePartId,
            onSelect: part => {
                this.activePartId = part.id;
                this.editedPartId = part.id;
                this.renderPartStrip(root);
                this.renderActivePartEditor(root);
            },
            onEdit: part => {
                this.editedPartId = part.id;
                this.renderPartStrip(root);
                this.renderActivePartEditor(root);
            },
        });
        updateTitlePartTracking(root, active);
        updateTitlePartPresentation(root, this.app, this.parts, active);
        this.updateMainPoster(root);
    }

    private updateMainPoster(root: HTMLElement): void {
        const image = this.qs<HTMLImageElement>(root, '[data-role="poster"]');
        if (!image) return;
        const titlePoster = this.anime.titleImageUrl || this.anime.imageUrl || DEFAULT_COVER;
        const source = getPartPoster(this.parts, this.activePartId, this.posterMode, titlePoster, value => resolvePartPoster(this.app, value, titlePoster));
        setSmoothPoster(image, [source, titlePoster]);
    }

    private renderActivePartEditor(root: HTMLElement): void {
        const part = this.getEditedPart();
        this.episodeControl?.update();
        updateTitlePartTracking(root, part);
        if (!part) return;
        this.partKindDropdown?.setValue(part.kind);
        this.partRatingControl?.setValue(part.userRating ?? null);
        this.setInput(root, '[data-field="part-title"]', part.title);
        this.setInput(root, '[data-field="part-episode-current"]', part.episodeCurrent);
        this.setInput(root, '[data-field="part-episode-total"]', part.episodeTotal);
        this.setInput(root, '[data-field="part-duration"]', part.episodeDuration ?? null);
        this.setInput(root, '[data-field="part-poster"]', part.poster ?? null);
        this.setInput(root, '[data-field="part-year"]', part.year ?? null);
        this.updatePartStatusUI(root);
        this.updatePartActions(root);
        updateTitlePartCard(root, part, this.parts.indexOf(part));
    }
    private renderTagChips(root: HTMLElement): void {
        const container = this.qs<HTMLElement>(root, '[data-role="tag-chips"]');
        if (!container) return;
        container.empty();
        for (const tag of this.tags) {
            const chip = container.createEl('button', {
                cls: 'lorebase-editmode-chip',
                text: `#${tag}`,
                attr: { type: 'button', title: t('editRemoveHint') },
            });
            chip.addEventListener('click', () => {
                this.tags = this.tags.filter((entry) => entry !== tag);
                this.renderTagChips(root);
            });
        }
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
                this.genres = this.normalizeGenres(values);
                this.renderGenreChips(root);
            }).open();
        });
    }

    private renderRelatedMedia(root: HTMLElement): void {
        const container = this.qs<HTMLElement>(root, '[data-role="related-media"]');
        if (!container) return;
        container.empty();
        if (!this.relatedMedia.length) {
            container.createDiv({ cls: 'lorebase-editmode-related-empty', text: t('editRelatedEmpty') });
            return;
        }

        for (const [index, item] of this.relatedMedia.entries()) {
            const imageUrl = item.imageUrl || this.relatedCandidates.find((candidate) => candidate.path === item.path)?.imageUrl || DEFAULT_COVER;
            const row = container.createDiv({
                cls: 'lorebase-editmode-related-item',
                attr: { title: item.title || item.path, draggable: 'true', 'data-path': item.path },
            });
            this.bindRelatedDrag(row, item.path, () => {
                this.reorderRelatedMedia(item.path);
                this.renderRelatedMedia(root);
            });
            const image = row.createDiv({ cls: 'lorebase-editmode-related-image' });
            image.setCssStyles({
                backgroundImage: `url("${imageUrl.replace(/"/g, '\\"')}")`,
                height: '76px',
                minHeight: '76px',
            });
            image.createSpan({ cls: 'lorebase-editmode-related-type', text: this.getRelatedTypeLabel(item.type) });
            row.createSpan({ cls: 'lorebase-editmode-related-title', text: item.title || item.path });
            const order = row.createDiv({ cls: 'lorebase-editmode-related-order' });
            const up = order.createEl('button', {
                cls: 'lorebase-editmode-related-order-btn',
                text: '↑',
                attr: { type: 'button', 'aria-label': 'Move up' },
            });
            up.disabled = index === 0;
            up.toggleClass('is-disabled', up.disabled);
            up.addEventListener('click', (event) => {
                event.stopPropagation();
                this.moveRelatedMedia(index, -1);
                this.renderRelatedMedia(root);
            });
            const down = order.createEl('button', {
                cls: 'lorebase-editmode-related-order-btn',
                text: '↓',
                attr: { type: 'button', 'aria-label': 'Move down' },
            });
            down.disabled = index === this.relatedMedia.length - 1;
            down.toggleClass('is-disabled', down.disabled);
            down.addEventListener('click', (event) => {
                event.stopPropagation();
                this.moveRelatedMedia(index, 1);
                this.renderRelatedMedia(root);
            });
            const remove = row.createEl('button', {
                cls: 'lorebase-editmode-related-remove',
                text: '×',
                attr: { type: 'button', 'aria-label': t('editRemoveHint') },
            });
            remove.addEventListener('click', (event) => {
                event.stopPropagation();
                this.relatedMedia = this.relatedMedia.filter((entry) => entry.path !== item.path);
                this.renderRelatedMedia(root);
            });
        }
    }

    private bindRelatedDrag(card: HTMLElement, targetPath: string, onDrop: () => void): void {
        card.addEventListener('dragstart', (event) => {
            this.draggedRelatedPath = targetPath;
            card.addClass('is-dragging');
            event.dataTransfer?.setData('text/plain', targetPath);
            if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
        });
        card.addEventListener('dragover', (event) => {
            if (!this.draggedRelatedPath || this.draggedRelatedPath === targetPath) return;
            event.preventDefault();
            card.addClass('is-drop-target');
            if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        });
        card.addEventListener('dragleave', () => {
            card.removeClass('is-drop-target');
        });
        card.addEventListener('drop', (event) => {
            event.preventDefault();
            card.removeClass('is-drop-target');
            if (!this.draggedRelatedPath || this.draggedRelatedPath === targetPath) return;
            onDrop();
        });
        card.addEventListener('dragend', () => {
            this.draggedRelatedPath = null;
            card.removeClass('is-dragging');
            card.removeClass('is-drop-target');
        });
    }

    private reorderRelatedMedia(targetPath: string): void {
        const draggedPath = this.draggedRelatedPath;
        if (!draggedPath || draggedPath === targetPath) return;
        const next = [...this.relatedMedia];
        const from = next.findIndex((item) => item.path === draggedPath);
        const to = next.findIndex((item) => item.path === targetPath);
        if (from < 0 || to < 0) return;
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item);
        this.relatedMedia = next;
    }

    private moveRelatedMedia(index: number, direction: -1 | 1): void {
        const target = index + direction;
        if (target < 0 || target >= this.relatedMedia.length) return;
        const next = [...this.relatedMedia];
        [next[index], next[target]] = [next[target], next[index]];
        this.relatedMedia = next;
    }

    private createStatusSegment(status: AnimeStatus, label: string): HTMLButtonElement {
        const button = createEl('button', {
            cls: 'lorebase-editmode-segment',
            attr: { type: 'button', 'aria-pressed': 'false' },
        });
        button.dataset.status = status;
        const icon = button.createSpan({ cls: 'lorebase-editmode-segment-icon', attr: { 'aria-hidden': 'true' } });
        const appearance = getStatusAppearance('anime', status);
        setIcon(icon, appearance.icon);
        button.style.setProperty('--lorebase-status-color', appearance.color);
        button.createSpan({ cls: 'lorebase-editmode-segment-label', text: label });
        return button;
    }

    private updateQuickSettingSwitches(root: HTMLElement): void {
        const adult = this.qs<HTMLButtonElement>(root, '[data-toggle="adult"]');
        adult?.setAttribute('aria-pressed', String(this.isAdult));
        adult?.classList.toggle('is-active', this.isAdult);
        const favorite = this.qs<HTMLButtonElement>(root, '[data-toggle="favorite"]');
        if (favorite) {
            favorite.setAttr('aria-pressed', String(this.favorite));
            favorite.toggleClass('is-active', this.favorite);
        }
        const release = this.qs<HTMLButtonElement>(root, '[data-toggle="release"]');
        if (release) {
            const active = this.selectedStatus === 'to_be_released';
            release.setAttr('aria-pressed', String(active));
            release.toggleClass('is-active', active);
        }
    }

    private updateStatusUI(root: HTMLElement): void {
        syncTrackingStatus(root, this.selectedStatus);
    }

    private updatePartStatusUI(root: HTMLElement): void {
        const status = this.getEditedPart()?.status ?? 'planned';
        this.partStatusDropdown?.setValue(status);
        updateTitlePartStatusAppearance(root, 'anime', status);
    }

    private updateRatingUI(root: HTMLElement): void {
        root.querySelectorAll<HTMLButtonElement>('.lorebase-editmode-star:not(.lorebase-criterion-star)').forEach(btn => {
            const value = Number(btn.dataset.rating ?? '0');
            paintRatingStar(btn, value, this.selectedRating, this.ratingSettings, 'anime');
        });
        const numeric = this.selectedRating ?? 0;
        const max = getRatingMax(this.ratingSettings);
        const rating = this.compactAnimeEditor
            ? formatCompactEditorRating(this.selectedRating, max)
            : `${numeric.toFixed(1)} / ${max.toFixed(1)}`;
        updateRatingReadout(this.qs(root, '[data-role="rating-value"]'), this.selectedRating, rating);
        this.setText(root, '.lorebase-editmode-rating-hint', getRatingInputHint(this.ratingSettings, i18n.getLanguage()));
        const line = this.qs<HTMLElement>(root, '[data-role="rating-line"]');
        if (line) line.style.width = `${Math.round((numeric / max) * 100)}%`;
    }

    private updateProgressSummary(root: HTMLElement): void {
        syncEpisodeDuration(root, this.parts);
        const host = this.qs<HTMLElement>(root, '[data-role="watch-progress"]');
        if (host) renderWatchProgress(host, this.parts);
        const part = this.getEditedPart();
        if (part) updateTitlePartCard(root, part, this.parts.indexOf(part));
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
        if (title && !this.compactAnimeEditor) title.textContent = this.notesMode === 'description' ? t('editDescription') : t('editMyNotes');
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

    private renderFormatDropdowns(root: HTMLElement): void {
        const formatHost = this.qs<HTMLElement>(root, '[data-field="format"]');
        if (formatHost) {
            this.formatDropdown = createLorebaseDropdown(
                formatHost,
                this.getFormatOptions(),
                this.format,
                (value) => {
                    this.format = value;
                },
                { floating: this.compactAnimeEditor }
            );
        }

        const partKindHost = this.qs<HTMLElement>(root, '[data-field="part-kind"]');
        if (partKindHost) {
            this.partKindDropdown = createTitlePartDropdown(
                partKindHost,
                this.getFormatOptions(),
                this.getEditedPart()?.kind ?? 'tv',
                (value) => {
                    const part = this.getEditedPart();
                    if (!part) return;
                    part.kind = value;
                    this.renderPartStrip(root);
                    this.updateProgressSummary(root);
                }, t('editFormat')
            );
        }
    }

    private getEditedPart(): PartDraft | null {
        if (!this.parts.length) return null;
        return this.parts.find((part) => part.id === this.editedPartId) ?? this.getActivePart();
    }

    private getActivePart(): PartDraft | null {
        return this.parts.find(part => part.id === this.activePartId) ?? this.parts[0] ?? null;
    }

    private normalizeParts(parts: AnimeItem['parts']): PartDraft[] {
        const normalized = parts?.length
            ? parts.map((part) => ({ ...part, episodeDuration: part.episodeDuration ?? parseEpisodeDuration(this.anime.rawFields?.episode_duration ?? this.anime.rawFields?.duration) }))
            : [{
                id: 'legacy-main',
                kind: this.format,
                title: this.anime.displayName,
                seasonNumber: this.anime.seasonCurrent ?? null,
                episodeCurrent: this.anime.episodeCurrent ?? null,
                episodeTotal: this.anime.episodeTotal ?? null,
                status: this.selectedStatus,
                episodeDuration: parseEpisodeDuration(this.anime.rawFields?.episode_duration ?? this.anime.rawFields?.duration),
            }];
        return normalized.length ? normalized : [];
    }

    private createPartId(kind: AnimeFormat): string {
        const used = new Set(this.parts.map((part) => part.id));
        let index = this.parts.length + 1;
        let id = `${kind}-${index}`;
        while (used.has(id)) {
            index++;
            id = `${kind}-${index}`;
        }
        return id;
    }

    private getAnimeStatusOptions(): Array<{ status: AnimeStatus; label: string }> {
        return getStatusOptionsForMediaType('anime').map(option => ({ ...option, status: option.status as AnimeStatus }));
    }

    private getFormatOptions(): Array<{ value: AnimeFormat; label: string }> {
        return [
            { value: 'tv', label: t('formatTv') },
            { value: 'movie', label: t('formatMovie') },
            { value: 'ova', label: t('formatOva') },
            { value: 'ona', label: t('formatOna') },
            { value: 'special', label: t('formatSpecial') },
        ];
    }

    private parseNumberInput(value: string): number | null {
        if (!value.trim()) return null;
        const parsed = parseInt(value, 10);
        return Number.isNaN(parsed) ? null : Math.max(0, parsed);
    }

    private normalizeTag(value: string): string | null {
        const cleaned = value.trim().replace(/^#+/, '').toLowerCase();
        return cleaned || null;
    }

    private normalizeTags(values: string[]): string[] {
        const unique = new Set<string>();
        for (const value of values) {
            const normalized = this.normalizeTag(value);
            if (normalized) unique.add(normalized);
        }
        return Array.from(unique.values());
    }

    private normalizeGenre(value: string): string | null {
        const cleaned = value.trim().toLowerCase();
        return cleaned || null;
    }

    private normalizeGenres(values: string[]): string[] {
        const unique = new Set<string>();
        for (const value of values) {
            const normalized = this.normalizeGenre(value);
            if (normalized) unique.add(normalized);
        }
        return Array.from(unique.values());
    }

    private normalizeDisplayList(values: string[]): string[] {
        const result: string[] = [];
        const seen = new Set<string>();
        for (const value of values) {
            const normalized = value.trim();
            const key = normalized.toLocaleLowerCase();
            if (!normalized || seen.has(key)) continue;
            seen.add(key);
            result.push(normalized);
        }
        return result;
    }

    private normalizeRelatedMedia(values: RelatedMediaLink[]): RelatedMediaLink[] {
        const unique = new Map<string, RelatedMediaLink>();
        for (const value of values) {
            const path = value.path?.trim();
            if (!path) continue;
            unique.set(path, {
                type: value.type,
                path,
                title: value.title?.trim() || path.split('/').pop()?.replace(/\.md$/i, '') || path,
                imageUrl: value.imageUrl ?? null,
            });
        }
        return Array.from(unique.values());
    }

    private getRelatedTypeLabel(type: RelatedMediaLink['type']): string {
        if (type === 'anime') return t('settingsAnime');
        if (type === 'movie') return t('settingsMovies');
        if (type === 'series') return t('settingsSeries');
        if (type === 'book') return t('settingsBooks');
        if (type === 'manga') return t('settingsManga');
        return t('settingsGames');
    }

    private qs<T extends Element>(root: HTMLElement, selector: string): T | null {
        return root.querySelector<T>(selector);
    }

    private setText(root: HTMLElement, selector: string, value: string): void {
        const node = this.qs<HTMLElement>(root, selector);
        if (node) node.textContent = value;
    }

    private setInput(root: HTMLElement, selector: string, value: string | number | null): void {
        const input = this.qs<HTMLInputElement>(root, selector);
        if (input) input.value = value === null || value === undefined ? '' : String(value);
    }

    private formatHumanDate(timestamp: number): string {
        if (!Number.isFinite(timestamp)) return t('editUnknown');
        const locale = i18n.getLocale();
        return new Intl.DateTimeFormat(locale, {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
        }).format(new Date(timestamp));
    }


    private formatDateForInput(timestamp: number | null | undefined): string {
        if (!timestamp || !Number.isFinite(timestamp)) return '';
        const date = new Date(timestamp);
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    private getTodayDateInput(): string {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    private getFile(): TFile | null {
        const file = this.app.vault.getAbstractFileByPath(this.anime.filePath);
        return file instanceof TFile ? file : null;
    }

    async saveBeforeSourceRefresh(): Promise<boolean> {
        return this.save();
    }

    private async save(): Promise<boolean> {
        if (!validateRatingInputs(this.contentEl)) return false;
        if (!validateDatePickers([this.startedDatePicker, this.finishedDatePicker, this.releaseDatePicker].filter((picker): picker is HierarchicalDatePicker => Boolean(picker)))) return false;
        this.compactChips?.commit();
        const activePart = this.getActivePart();
        const allPartsCompleted = this.parts.length > 0 && this.parts.every((part) => part.status === 'completed');
        const status = allPartsCompleted && !isCustomStatus(this.selectedStatus) ? 'completed' : this.selectedStatus;
        const updates: Partial<AnimeItem> = {
            displayName: this.title || this.anime.displayName,
            userRating: this.selectedRating,
            detailedRatings: this.detailedRatingEditor.getValue(),
            status,
            favorite: this.favorite,
            priority: this.selectedPriority,
            statusReasons: this.statusReasons,
            releaseDate: this.releaseDate,
            ...(this.discovery || this.anime.discovery ? { discovery: this.discovery } : {}),
            ...(this.partCatalog ? { partCatalog: this.partCatalog } : {}),
            repeatCount: this.repeatCount,
            countryOfOrigin: this.countryOfOrigin,
            ...(this.countryOfOrigin !== (this.anime.countryOfOrigin || '') ? { countries: normalizeCountryMetadata(this.countryOfOrigin) } : {}),
            isAdult: this.isAdult,
            year: this.year,
            summary: this.summary,
            format: this.format,
            started: this.started || null,
            finished: this.finished || null,
            integrationProvider: this.anime.integrationProvider ?? null,
            integrationId: this.anime.integrationId ?? null,
            genres: this.genres,
            studios: this.studios,
            tags: this.tags,
            parts: this.parts,
            activePartId: activePart?.id ?? this.activePartId,
            relatedMedia: this.compactRelated?.getValue() ?? this.relatedMedia,
            seasonCurrent: activePart?.seasonNumber ?? null,
            episodeCurrent: activePart?.episodeCurrent ?? null,
            episodeTotal: activePart?.episodeTotal ?? null,
            myNotes: this.myNotes,
        };

        await this.onSave(updates);
        this.close();
        return true;
    }
}

class RelatedMediaPickerModal extends Modal {
    private candidates: RelatedCandidate[];
    private onPick: (candidates: RelatedCandidate[]) => void;
    private query = '';
    private mediaFilter: RelatedMediaLink['type'] = 'movie';
    private listEl: HTMLElement | null = null;
    private footerEl: HTMLElement | null = null;
    private selectedPaths = new Set<string>();
    private selectedOrder: string[] = [];

    constructor(app: App, candidates: RelatedCandidate[], onPick: (candidates: RelatedCandidate[]) => void) {
        super(app);
        this.candidates = candidates;
        this.onPick = onPick;
    }

    onOpen(): void {
        this.contentEl.empty();
        this.modalEl.addClass('lorebase-related-picker-container');
        this.contentEl.addClass('lorebase-related-picker', 'lorebase-modal-panel');
        const header = this.contentEl.createDiv({ cls: 'lorebase-related-picker-header' });
        header.createEl('h2', { text: t('editRelatedPickerTitle') });
        const input = this.contentEl.createEl('input', {
            cls: 'lorebase-editmode-input lorebase-related-picker-search',
            attr: { type: 'text', placeholder: t('searchPlaceholder') },
        });
        const filters = this.contentEl.createDiv({ cls: 'lorebase-related-picker-filters' });
        this.createFilterButton(filters, 'game', t('settingsGames'));
        this.createFilterButton(filters, 'movie', t('settingsMovies'));
        this.createFilterButton(filters, 'series', t('settingsSeries'));
        this.createFilterButton(filters, 'book', t('settingsBooks'));
        this.createFilterButton(filters, 'manga', t('settingsManga'));
        this.createFilterButton(filters, 'anime', t('settingsAnime'));
        this.listEl = this.contentEl.createDiv({ cls: 'lorebase-related-picker-grid' });
        this.footerEl = this.contentEl.createDiv({ cls: 'lorebase-related-picker-footer' });
        input.addEventListener('input', () => {
            this.query = input.value.trim().toLowerCase();
            this.renderList();
        });
        this.renderList();
        this.renderFooter();
        input.focus();
    }

    onClose(): void {
        this.contentEl.empty();
        this.modalEl.removeClass('lorebase-related-picker-container');
    }

    private renderList(): void {
        if (!this.listEl) return;
        this.listEl.empty();
        const filtered = this.candidates
            .filter((candidate) => {
                if (!this.query) return true;
                return candidate.title.toLowerCase().includes(this.query)
                    || candidate.path.toLowerCase().includes(this.query);
            })
            .filter((candidate) => this.query || candidate.type === this.mediaFilter)
            .slice(0, 50);

        if (!filtered.length) {
            this.listEl.createDiv({ cls: 'lorebase-select-empty', text: t('noticeNoResults') });
            return;
        }

        for (const candidate of filtered) {
            const row = this.listEl.createEl('button', {
                cls: `lorebase-related-picker-card ${this.selectedPaths.has(candidate.path) ? 'is-selected' : ''}`,
                attr: {
                    type: 'button',
                    title: candidate.path,
                    'aria-pressed': String(this.selectedPaths.has(candidate.path)),
                },
            });
            const image = row.createDiv({ cls: 'lorebase-related-picker-card-image' });
            const imageUrl = candidate.imageUrl || DEFAULT_COVER;
            image.setCssStyles({ backgroundImage: `url("${imageUrl.replace(/"/g, '\\"')}")` });
            image.createSpan({ cls: 'lorebase-related-picker-card-type', text: this.getTypeLabel(candidate.type) });
            row.createSpan({ cls: 'lorebase-related-picker-card-check', text: '✓' });
            const body = row.createDiv({ cls: 'lorebase-related-picker-card-body' });
            body.createSpan({ cls: 'lorebase-related-picker-card-title', text: candidate.title });
            body.createSpan({ cls: 'lorebase-related-picker-card-path', text: candidate.path });
            row.addEventListener('click', () => {
                this.toggleCandidate(candidate.path);
                this.renderList();
                this.renderFooter();
            });
        }
    }

    private toggleCandidate(path: string): void {
        if (this.selectedPaths.has(path)) {
            this.selectedPaths.delete(path);
            this.selectedOrder = this.selectedOrder.filter((entry) => entry !== path);
            return;
        }
        this.selectedPaths.add(path);
        this.selectedOrder.push(path);
    }

    private renderFooter(): void {
        if (!this.footerEl) return;
        this.footerEl.empty();
        const count = this.selectedPaths.size;
        this.footerEl.createSpan({
            cls: 'lorebase-related-picker-selected',
            text: count ? `${t('promptSelectedLabel')}: ${count}` : '',
        });
        const actions = this.footerEl.createDiv({ cls: 'lorebase-related-picker-actions' });
        const cancel = actions.createEl('button', {
            cls: 'lorebase-button lorebase-button-secondary',
            text: t('commonCancel'),
            attr: { type: 'button' },
        });
        cancel.addEventListener('click', () => this.close());
        const add = actions.createEl('button', {
            cls: 'lorebase-button lorebase-button-primary',
            text: count ? `${t('promptAddSelected')} (${count})` : t('promptAddSelected'),
            attr: { type: 'button' },
        });
        add.disabled = count === 0;
        add.toggleClass('is-disabled', add.disabled);
        add.addEventListener('click', () => {
            const picked = this.selectedOrder
                .map((path) => this.candidates.find((candidate) => candidate.path === path))
                .filter((candidate): candidate is RelatedCandidate => Boolean(candidate));
            if (!picked.length) return;
            this.onPick(picked);
            this.close();
        });
    }

    private getTypeLabel(type: RelatedMediaLink['type']): string {
        if (type === 'anime') return t('settingsAnime');
        if (type === 'movie') return t('settingsMovies');
        if (type === 'series') return t('settingsSeries');
        if (type === 'book') return t('settingsBooks');
        if (type === 'manga') return t('settingsManga');
        return t('settingsGames');
    }

    private createFilterButton(parent: HTMLElement, value: RelatedMediaLink['type'], label: string): void {
        const button = parent.createEl('button', {
            cls: `lorebase-related-picker-filter ${this.mediaFilter === value ? 'is-active' : ''}`,
            text: label,
            attr: { type: 'button', 'aria-pressed': String(this.mediaFilter === value) },
        });
        button.addEventListener('click', () => {
            this.mediaFilter = value;
            parent.querySelectorAll<HTMLButtonElement>('.lorebase-related-picker-filter').forEach((entry) => {
                const active = entry === button;
                entry.toggleClass('is-active', active);
                entry.setAttr('aria-pressed', String(active));
            });
            this.renderList();
        });
    }
}
