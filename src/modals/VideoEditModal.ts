import { mountStatusReason } from '../components/StatusReasonField';
import { syncNotesReader } from '../components/NotesReader';
import { normalizeStatusReasons, type StatusReasons } from '../utils/statusReasons';
import { catalogSource, inspectPartCatalog, applyContinuations } from '../services/media/partCatalog';
import { renderContinuationNotice } from '../components/ContinuationNotice';
import { mountDiscovery } from '../components/DiscoveryContext';
import { normalizeReleaseDate } from '../utils/releaseDates';
import type { MediaPriority } from '../types';
import { normalizePriority } from '../utils/priority';
import { bindPriority } from '../components/PriorityControl';
import { normalizePersonalDate } from '../utils/personalDates';

import { renderCountriesControl, validateCountriesControl } from '../components/CountriesControl';
import { bindTrackingStatus, syncTrackingStatus, finishTrackingPanel } from '../components/EditTrackingPanel';
import { PartEpisodesControl, EpisodeLoader } from '../components/PartEpisodesControl';
import { VideoCastPanel } from '../components/VideoCastPanel';
import { RecommendationsPanel } from '../components/RecommendationsPanel';
import type { RecommendationsService } from '../services/RecommendationsService';
import type { PeopleService } from '../services/PeopleService';
import { bindEpisodeDuration, bindMovieDuration, commonEpisodeDuration, fillMissingEpisodeDurations, syncEpisodeDuration } from '../components/ViewingDuration';
import { PosterMode } from '../types';
import { getPartPoster, normalizePosterMode } from '../services/media/partPoster';
import { cancelPosterLoad, setSmoothPoster } from '../components/SmoothPoster';
import { buildTitlePartsProgress, buildTitlePartsHeader, buildTitlePartEditor, bindTitlePartEditor, bindTitlePartRating, createTitlePartDropdown, updateTitlePartTracking, updateTitlePartPresentation, updatePartEditorActions, updateTitlePartCard, updateTitlePartStatusAppearance } from '../components/TitlePartEditor';
import { LorebaseDropdownHandle } from '../components/LorebaseDropdown';
import { renderRepeatTracking } from '../components/RepeatTrackingControl';
import { renderWorkTypeControl } from '../components/MediaWorkTypeControl';
import { DetailedRatingEditor } from './DetailedRatingEditor';
import { getStatusOptionsForMediaType } from '../views/library/viewOptions';
import { getStatusAppearance } from '../statusPresentation';
import { App, Menu, Modal, Notice, setIcon, TFile } from 'obsidian';
import { DEFAULT_COVER } from '../constants';
import { i18n, t } from '../localization';
import { MovieItem, RatingScaleSettings, RelatedMediaLink, SeriesItem, UserRating, VideoPart, VideoStatus } from '../types';
import { GenreEditModal } from './GenreEditModal';
import { CommunityRatingRefresh, renderCommunityRatingPanel } from './CommunityRatingPanel';
import { MediaSourceAction, renderMediaSourcePanel } from './MediaSourcePanel';
import { setupMobileEditor } from './mobileEditor';
import { compactGameText } from '../localization/compactGameEditor';
import { et } from '../localization/episodes';
import { appendEditorTemplate, bindCompactEditorChrome, buildCompactCoverIdentity, buildCompactQuickSettings, buildCompactWorkTypeBadge, buildEditorHeaderActions, buildEditorTimestampRows, buildSummaryNotesPanel, focusSummaryNotes, formatCompactEditorRating } from './compactEditorLayout';
import { bindCompactEditorChips, buildCompactEditorChips } from './compactEditorChips';
import { RelatedMediaEditor } from './RelatedMediaEditor';
import { bindSourceUrlButton } from './sourceUrlButton';
import { extractMarkdownSection } from '../services/markdownSections';
import { HierarchicalDatePicker, validateDatePickers } from './HierarchicalDatePicker';
import { CLASSIC_RATING_SETTINGS, getRatingFromStarPosition, getRatingInputHint, getRatingMax, getRatingStarValues } from '../utils/rating';
import { mountTenthsRating, paintRatingStar, updateRatingReadout, validateRatingInputs } from '../components/RatingInput';
import { setVideoPartStatus, setPartEpisodeCurrent } from '../services/media/videoProgress';
import { renderPartTabs, renderWatchProgress, resolvePartPoster, watchCopy } from '../components/WatchProgress';
import { parseEpisodeDuration } from '../services/media/watchProgress';
import { mergeEpisodeDetails } from '../services/media/episodeTracking';
import type { SeriesPartsRefresh } from '../services/EpisodeMetadataService';

type VideoItem = MovieItem | SeriesItem;
type VideoUpdates = Partial<VideoItem> & Record<string, unknown>;
type PartDraft = VideoPart;
type RelatedCandidate = RelatedMediaLink;
type NotesMode = 'description' | 'myNotes';
type VideoReleaseFallbackStatus = Exclude<VideoStatus, 'to_be_released'>;

export class VideoEditModal extends Modal {
    private countries?: string[];
    private episodeControl?: PartEpisodesControl;
    private castPanel?: VideoCastPanel;
    private recommendationsPanel?: RecommendationsPanel;
    private item: VideoItem;
    private onSave: (updates: VideoUpdates) => Promise<void>;
    private onDelete: () => void;
    private onRefreshCommunityRating?: CommunityRatingRefresh;

    private workType: string;
    private title: string;
    private poster: string;
    private horizontalPoster: string;
    private year: number | null;
    private statusReasons?: StatusReasons;
    private discovery?: import('../types').DiscoveryContext;
    private partCatalog?: import('../types').PartCatalog;
    private selectedPriority: MediaPriority = 'normal';
    private selectedStatus: VideoStatus;
    private statusBeforeRelease: VideoReleaseFallbackStatus;
    private selectedRating: UserRating;
    private detailedRatingEditor: DetailedRatingEditor;
    private favorite: boolean;
    private summary: string;
    private myNotes = '';
    private notesMode: NotesMode = 'description';
    private notesExpanded = false;
    private started: string;
    private finished: string;
    private sourceUrl: string;
    private compactChips?: ReturnType<typeof bindCompactEditorChips>;
    private compactRelated?: RelatedMediaEditor;
    private genres: string[];
    private tags: string[];

    private releaseDate: string;
    private runtime: string;
    private director: string;
    private actors: string;
    private seasons: number | null;
    private networks: string[];
    private studios: string[];
    private parts: PartDraft[];
    private activePartId: string | null;
    private editedPartId: string | null;
    private posterMode: PosterMode;
    private partKindDropdown?: LorebaseDropdownHandle<PartDraft['kind']>;
    private partStatusDropdown?: LorebaseDropdownHandle<VideoStatus>;
    private partRatingControl?: ReturnType<typeof bindTitlePartRating>;
    private relatedMedia: RelatedMediaLink[];
    private relatedCandidates: RelatedCandidate[];
    private incomingRelated: RelatedMediaLink[];
    private draggedRelatedPath: string | null = null;
    private startedDatePicker?: HierarchicalDatePicker;
    private finishedDatePicker?: HierarchicalDatePicker;
    private releaseDatePicker?: HierarchicalDatePicker;
    private ratingSettings: RatingScaleSettings;

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
        item: VideoItem,
        onSave: (updates: VideoUpdates) => Promise<void>,
        onDelete: () => void,
        onRefreshCommunityRating?: CommunityRatingRefresh,
        incomingRelated: RelatedMediaLink[] = [],
        relatedCandidates: RelatedCandidate[] = [],
        private readonly onRefreshSource?: MediaSourceAction,
        private readonly onChangeSource?: MediaSourceAction,
        ratingSettings: RatingScaleSettings = CLASSIC_RATING_SETTINGS,
        private readonly onManageWorkTypes?: (onChanged: () => void) => void,
        private readonly peopleService?: PeopleService,
        private readonly episodeLoader?: EpisodeLoader,
        private readonly recommendationsService?: RecommendationsService,
        private readonly compact = false,
        private readonly onRefreshSeriesParts?: () => Promise<SeriesPartsRefresh>
    ) {
        super(app);
        this.item = item;
        this.partCatalog = item.partCatalog ? structuredClone(item.partCatalog) : undefined;
        this.onSave = onSave;
        this.onDelete = onDelete;
        this.onRefreshCommunityRating = onRefreshCommunityRating;
        this.ratingSettings = ratingSettings;

        this.workType = item.workType || (this.item.type === 'movie' ? 'Movie' : this.item.type === 'series' ? 'Series' : 'Game');
        this.title = item.displayName;
        this.poster = item.type === 'series' ? item.titleImageUrl || item.imageUrl : item.imageUrl;
        this.horizontalPoster = item.horizontalImageUrl ?? '';
        this.year = item.year;
        this.selectedStatus = item.status;
        this.selectedPriority = normalizePriority(item.priority);
        this.discovery = item.discovery ? { ...item.discovery } : undefined;
        this.statusReasons = normalizeStatusReasons(item.statusReasons);
        this.statusBeforeRelease = item.status === 'to_be_released' ? 'planned' : item.status;
        this.selectedRating = item.userRating;
        this.detailedRatingEditor = new DetailedRatingEditor(item.detailedRatings, item.type, ratingSettings);
        this.favorite = item.favorite;
        this.summary = item.summary || item.description || '';
        this.started = normalizePersonalDate(item.started);
        this.finished = normalizePersonalDate(item.finished);
        this.sourceUrl = item.sourceUrl ?? '';
        this.genres = this.normalizeList(item.genres ?? []);
        this.tags = this.normalizeList(item.tags ?? []);

        this.releaseDate = normalizeReleaseDate(item.releaseDate);
        this.runtime = item.runtime ?? '';
        this.director = item.director ?? '';
        this.actors = item.actors ?? '';
        this.seasons = item.type === 'series' ? item.seasons : null;
        this.networks = item.type === 'series' ? this.normalizeList(item.networks ?? []) : [];
        this.studios = item.type === 'series' ? this.normalizeList(item.studios ?? []) : [];
        this.parts = this.normalizeParts(item);
        fillMissingEpisodeDurations(this.parts);
        this.relatedMedia = this.normalizeRelatedMedia(item.relatedMedia ?? []);
        this.relatedCandidates = relatedCandidates.filter((candidate) => candidate.path !== item.filePath);
        this.incomingRelated = incomingRelated;
        if (compact) this.compactRelated = new RelatedMediaEditor(app, item.filePath, this.relatedMedia, this.relatedCandidates, incomingRelated, true);
        this.activePartId = this.parts.some((part) => part.id === item.activePartId)
            ? item.activePartId ?? this.parts[0]?.id ?? null
            : this.parts[0]?.id ?? null;
        this.editedPartId = this.activePartId;
        this.posterMode = normalizePosterMode(item.type === 'series' ? item.posterMode : 'title');
    }

    private repeatCount = 0;

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('lorebase-edit-modal', 'lorebase-modal-root');
        this.modalEl.addClass('lorebase-edit-modal-container');
        this.modalEl.addClass('lorebase-editmode-modal-shell');
        this.modalEl.addEventListener('keydown', this.onKeydown);

        const root = contentEl.createDiv({ cls: 'lorebase-editmode-root lorebase-editmode-video-root lorebase-modal-panel' });
        appendEditorTemplate(root, this.buildTemplate());
        if (this.compact) bindCompactEditorChrome(root, this.modalEl, () => this.close());
        this.bindStaticContent(root);
        renderCountriesControl(root, this.item, codes => this.countries = codes);
        const castHost = root.querySelector<HTMLElement>('[data-role="cast-panel"]');
        if (castHost && this.peopleService) this.castPanel = new VideoCastPanel(this.app, castHost, this.item, this.peopleService);
        const recommendationsHost = root.querySelector<HTMLElement>('[data-role="recommendations-panel"]');
        if (recommendationsHost && this.recommendationsService) this.recommendationsPanel = new RecommendationsPanel(recommendationsHost, this.item, this.recommendationsService);
        this.bindHeader(root);
        this.bindQuickSettings(root);
        this.bindStatus(root);
        this.repeatCount = this.item.repeatCount ?? 0;
        renderRepeatTracking(root, this.item, this.repeatCount, value => this.repeatCount = value);
        this.bindRating(root);
        this.bindFields(root);
        renderWorkTypeControl(root, this.item.type, this.workType, value => this.workType = value, this.onManageWorkTypes);
        bindSourceUrlButton(root);
        this.bindParts(root);
        this.bindNotesDisclosure(root);
        this.bindPlayDates(root);
        this.bindNotes(root);
        void this.loadMyNotes(root);
        this.bindTags(root);
        if (this.compactRelated) this.compactRelated.bind(root);
        else {
            this.bindRelatedMedia(root);
            this.renderRelatedMedia(root);
        }
        this.bindDates(root);
        if (this.onRefreshCommunityRating) {
            renderCommunityRatingPanel(root, this.item, this.onRefreshCommunityRating);
        }
        renderMediaSourcePanel(root, this.item, this.onRefreshSource, this.onChangeSource);
        setupMobileEditor(root, () => void this.save());
    }

    onClose(): void {
        this.compactChips?.destroy();
        this.compactChips = undefined;
        this.episodeControl?.destroy();
        this.castPanel?.destroy();
        this.recommendationsPanel?.destroy();
        const poster = this.contentEl.querySelector<HTMLImageElement>('[data-role="poster"]');
        if (poster) cancelPosterLoad(poster);
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
        const duration = this.item.type === 'movie' ? '<div class="lorebase-movie-duration-meta" data-role="movie-duration"></div>' : '';
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
                            ${compact ? `${buildCompactCoverIdentity(duration)}${buildCompactWorkTypeBadge()}` : ''}
                        </section>

                        <section class="lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-quick-settings">
                            <div class="lorebase-editmode-panel-title-row">
                                <h3 class="lorebase-editmode-panel-title">${t('editQuickSettings')}</h3>
                            </div>
                            ${compact ? buildCompactQuickSettings([
                                { key: 'favorite', label: t('editFavorite'), icon: 'heart' },
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
                                ${duration}
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
                        <div data-role="cast-panel"></div>
                        <div data-role="recommendations-panel"></div>
                        ${this.buildPartsSection()}

                        <section class="lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-related lorebase-editmode-related-main">
                            <div class="lorebase-editmode-panel-title-row">
                                <h3 class="lorebase-editmode-panel-title">${t('editRelatedMedia')}</h3>
                                <button type="button" class="lorebase-editmode-btn lorebase-editmode-btn-tight" data-action="add-related">${t('editAddRelated')}</button>
                            </div>
                            <div class="lorebase-editmode-related-list" data-role="related-media"></div>
                        </section>

                    </main>

                    <aside class="lorebase-editmode-column lorebase-editmode-column-right">
                        ${this.buildAdditionalPanel()}

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

    private buildPartsSection(): string {
        if (this.item.type === 'movie') return '';
        return `
            <section class="lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-anime-parts lorebase-editmode-series-parts${this.compact ? ' lorebase-title-composition' : ''}">
                ${buildTitlePartsHeader(t('templateFieldSeriesParts'), et('refreshSeasons'))}
                <div class="lorebase-editmode-anime-parts-navigation">
                    <div class="lorebase-part-tabs" data-role="part-strip"></div>
                </div>
                ${this.compact ? buildTitlePartsProgress() : '<div data-role="watch-progress"></div>'}
                ${buildTitlePartEditor(this.compact)}
            </section>
        `;
    }

    private buildAdditionalPanel(): string {
        const body = this.item.type === 'movie'
            ? this.buildMovieAdditionalFields()
            : this.buildSeriesAdditionalFields();
        return `
            <details class="lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-video-advanced lorebase-editmode-advanced">
                <summary class="lorebase-editmode-panel-title-row lorebase-editmode-collapsible-summary">
                    <h3 class="lorebase-editmode-panel-title">${t('editAdvanced')}</h3>
                    <span class="lorebase-editmode-collapsible-caret">⌄</span>
                </summary>
                <div class="lorebase-editmode-kv-list lorebase-editmode-video-advanced-fields${this.compact ? ' lorebase-editmode-advanced-grid' : ''}">
                    ${this.compact ? '<div data-role="compact-countries"></div>' : ''}
                    ${body}
                    ${this.compact ? buildEditorTimestampRows() : ''}
                </div>
            </details>
        `;
    }

    private buildMovieAdditionalFields(): string {
        return `
            ${this.buildReleaseDateField()}
            <label class="lorebase-editmode-field"><span class="lorebase-editmode-field-label">${t('templateFieldDirector')}</span><input class="lorebase-editmode-input" data-field="director" type="text" placeholder="Director A, Director B" /></label>
            <label class="lorebase-editmode-field"><span class="lorebase-editmode-field-label">${t('templateFieldActors')}</span><input class="lorebase-editmode-input" data-field="actors" type="text" placeholder="Actor A, Actor B" /></label>
        `;
    }

    private buildSeriesAdditionalFields(): string {
        return `
            ${this.buildReleaseDateField()}
            <label class="lorebase-editmode-field"><span class="lorebase-editmode-field-label">${t('templateFieldDirector')}</span><input class="lorebase-editmode-input" data-field="director" type="text" placeholder="Director A, Director B" /></label>
            <label class="lorebase-editmode-field"><span class="lorebase-editmode-field-label">${t('templateFieldActors')}</span><input class="lorebase-editmode-input" data-field="actors" type="text" placeholder="Actor A, Actor B" /></label>
        `;
    }

    private buildReleaseDateField(): string {
        return `
            <label class="lorebase-editmode-date-field">
                <span class="lorebase-editmode-field-label">${t('templateFieldReleased')}</span>
                <div class="lorebase-editmode-date-control">
                    <button type="button" class="lorebase-editmode-date-control-icon" data-action="open-release-calendar" data-role="release-date-icon" title="${t('templateFieldReleased')}" aria-label="${t('templateFieldReleased')}"></button>
                    <input class="lorebase-editmode-input" data-field="released" type="text" inputmode="numeric" maxlength="10" />
                </div>
            </label>
        `;
    }

    private bindStaticContent(root: HTMLElement): void {
        this.updateBreadcrumb(root);
        const poster = this.qs<HTMLImageElement>(root, '[data-role="poster"]');
        if (poster) {
            poster.src = this.poster;
            poster.alt = this.item.displayName;
        }
        this.setInput(root, '[data-field="title"]', this.title);
        this.setInput(root, '[data-field="year"]', this.year);
        this.setInput(root, '[data-field="source-url"]', this.sourceUrl);
        this.setInput(root, '[data-field="summary"]', this.getCurrentNotesValue());
        this.setInput(root, '[data-field="started-date"]', this.started);
        this.setInput(root, '[data-field="finished-date"]', this.finished);
        this.setInput(root, '[data-field="released"]', this.releaseDate);
        this.setInput(root, '[data-field="director"]', this.director);
        this.setInput(root, '[data-field="actors"]', this.actors);
        this.setInput(root, '[data-field="seasons"]', this.seasons);
        this.setInput(root, '[data-field="episode-current"]', this.item.type === 'series' ? this.item.episodeCurrent : null);
        this.setInput(root, '[data-field="episode-total"]', this.item.type === 'series' ? this.item.episodeTotal : null);
        this.setInput(root, '[data-field="studios"]', this.studios.join(', '));

        this.renderStatusSegments(root, '[data-role="status-segments"]', this.getVideoStatusOptions().filter((entry) => entry.status !== 'to_be_released'));
        this.renderStatusSegments(root, '[data-role="part-status-segments"]', this.getVideoStatusOptions());
        this.renderStars(root);
        if (!this.compact) {
            this.renderGenreChips(root);
            this.renderTagChips(root);
        }
        this.renderPartKindOptions(root);
        this.renderPartStrip(root);
        this.renderActivePartEditor(root);
        this.updateQuickSettingSwitches(root);
        this.updateStatusUI(root);
        this.updateRatingUI(root);
        this.updatePartStatusUI(root);
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
            menu.addItem((item) => item.setTitle(t('contextDelete')).setIcon('trash-2').onClick(() => {
                this.close();
                this.onDelete();
            }));
            const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
            menu.showAtPosition({ x: rect.right, y: rect.bottom });
        });
    }

    private bindQuickSettings(root: HTMLElement): void {
        root.querySelectorAll<HTMLButtonElement>('.lorebase-editmode-quick-settings [data-toggle]').forEach((button) => button.addEventListener('click', () => {
            if (button.dataset.toggle === 'favorite') this.favorite = !this.favorite;
            if (button.dataset.toggle === 'release') {
                if (this.selectedStatus === 'to_be_released') this.selectedStatus = this.statusBeforeRelease;
                else {
                    this.statusBeforeRelease = this.selectedStatus;
                    this.selectedStatus = 'to_be_released';
                }
            }
            this.updateQuickSettingSwitches(root);
            this.updateStatusUI(root);
        }));
    }

    private bindStatus(root: HTMLElement): void {
        bindTrackingStatus(root, this.item.type, this.selectedStatus, status => {
            this.selectedStatus = status;
            if (status !== 'to_be_released') this.statusBeforeRelease = status;
            if (status === 'completed') {
                for (const part of this.parts) setVideoPartStatus(part, 'completed');
                this.refreshPartsUi(root);
            }
            this.updateStatusUI(root);
            this.updateProgressSummary(root);
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
    }

    private bindFields(root: HTMLElement): void {
        bindMovieDuration(root, parseEpisodeDuration(this.runtime), minutes => {
            this.runtime = minutes === null ? '' : String(minutes);
            this.updateProgressSummary(root);
        });
        this.bindText(root, '[data-field="title"]', (value) => {
            this.title = value || this.item.displayName;
            this.updateBreadcrumb(root);
        });
        this.bindText(root, '[data-field="source-url"]', (value) => { this.sourceUrl = value; });
        this.bindText(root, '[data-field="director"]', (value) => { this.director = value; });
        this.bindText(root, '[data-field="actors"]', (value) => { this.actors = value; });
        this.bindText(root, '[data-field="studios"]', (value) => { this.studios = this.parseList(value); });

        this.qs<HTMLInputElement>(root, '[data-field="year"]')?.addEventListener('input', (event) => {
            this.year = this.parseNumberInput((event.currentTarget as HTMLInputElement).value);
        });
        this.qs<HTMLInputElement>(root, '[data-field="seasons"]')?.addEventListener('input', (event) => {
            this.seasons = this.parseNumberInput((event.currentTarget as HTMLInputElement).value);
        });
    }

    private bindParts(root: HTMLElement): void {
        bindTitlePartEditor(root);
        this.partRatingControl = bindTitlePartRating(root, this.ratingSettings, 'series', () => this.getEditedPart());
        const episodes = root.querySelector<HTMLElement>('[data-role="part-episodes"]');
        if (episodes && this.item.type === 'series') this.episodeControl = new PartEpisodesControl(episodes, () => this.getEditedPart(), change => {
            if (change === 'progress') this.setPartProgress(root, this.getEditedPart()?.episodeCurrent ?? 0);
            else { this.renderPartStrip(root); this.renderActivePartEditor(root); this.updateProgressSummary(root); }
        }, this.episodeLoader);
        bindEpisodeDuration(root, () => this.parts, () => {
            this.renderActivePartEditor(root);
            this.updateProgressSummary(root);
        });
        const refresh = this.qs<HTMLButtonElement>(root, '[data-action="refresh-parts"]');
        if (refresh) {
            setIcon(refresh, 'refresh-cw');
            refresh.disabled = !this.onRefreshSeriesParts;
            refresh.classList.toggle('is-disabled', refresh.disabled);
            refresh.title = et(refresh.disabled ? 'seasonSource' : 'refreshSeasons');
            refresh.addEventListener('click', () => void this.refreshSeriesParts(root, refresh));
        }
        const addPartButton = this.qs<HTMLButtonElement>(root, '[data-action="add-part"]');
        const removePartButton = this.qs<HTMLButtonElement>(root, '[data-action="remove-part"]');

        addPartButton?.addEventListener('click', () => {
            const index = this.parts.length + 1;
            const kind = this.item.type === 'series' ? 'season' : 'movie';
            const part: PartDraft = {
                id: this.createPartId(kind),
                kind,
                title: this.item.type === 'series' ? watchCopy().season + ' ' + index : `Part ${index}`,
                seasonNumber: this.item.type === 'series' ? index : null,
                episodeCurrent: 0,
                episodeTotal: null,
                episodeDuration: commonEpisodeDuration(this.parts),
                status: 'planned',
            };
            this.parts.push(part);
            this.editedPartId = part.id;
            this.refreshPartsUi(root);
            this.qs<HTMLInputElement>(root, '[data-field="part-title"]')?.focus();
        });

        removePartButton?.addEventListener('click', () => {
            if (this.parts.length <= 1) return;
            const active = this.getEditedPart();
            if (!active) return;
            const activeIndex = this.parts.findIndex((part) => part.id === active.id);
            this.parts = this.parts.filter((part) => part.id !== active.id);
            this.editedPartId = this.parts[Math.min(Math.max(activeIndex, 0), this.parts.length - 1)]?.id ?? null;
            if (this.activePartId === active.id) this.activePartId = this.parts[Math.min(Math.max(activeIndex, 0), this.parts.length - 1)]?.id ?? this.parts[0]?.id ?? null;
            this.refreshPartsUi(root);
        });

        this.qs<HTMLButtonElement>(root, '[data-action="episode-dec"]')?.addEventListener('click', () => {
            this.setPartProgress(root, (this.getEditedPart()?.episodeCurrent ?? 0) - 1);
        });
        this.qs<HTMLButtonElement>(root, '[data-action="episode-inc"]')?.addEventListener('click', () => {
            this.setPartProgress(root, (this.getEditedPart()?.episodeCurrent ?? 0) + 1);
        });
        this.bindPartInput(root, '[data-field="part-title"]', (part, value) => { part.title = value; });
        this.bindPartInput(root, '[data-field="part-episode-current"]', (_part, value) => { this.setPartProgress(root, this.parseNumberInput(value) ?? 0); });
        this.bindPartInput(root, '[data-field="part-episode-total"]', (part, value) => { part.episodeTotal = this.parseNumberInput(value); });
        this.bindPartInput(root, '[data-field="part-duration"]', (part, value) => { part.episodeDuration = this.parseNumberInput(value) || null; });
        this.bindPartInput(root, '[data-field="part-year"]', (part, value) => { part.year = this.parseNumberInput(value) || null; });
        this.bindPartInput(root, '[data-field="part-poster"]', (part, value) => {
            part.poster = value || null;
        });
        this.qs<HTMLInputElement>(root, '[data-field="part-episode-total"]')?.addEventListener('change', () => {
            this.setPartProgress(root, this.getEditedPart()?.episodeCurrent ?? 0);
        });
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
        const released = this.qs<HTMLInputElement>(root, '[data-field="released"]');
        const startedTrigger = this.qs<HTMLButtonElement>(root, '[data-action="open-started-calendar"]');
        const finishedTrigger = this.qs<HTMLButtonElement>(root, '[data-action="open-finished-calendar"]');
        const releasedTrigger = this.qs<HTMLButtonElement>(root, '[data-action="open-release-calendar"]');

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

        if (released && releasedTrigger) {
            setIcon(releasedTrigger, 'calendar-days');
            this.releaseDatePicker = new HierarchicalDatePicker(
                released,
                releasedTrigger,
                () => this.releaseDate,
                (value) => { this.releaseDate = value; },
                { allowPartial:true, allowQuarter:true, allowUnknown:true }
            );
            this.releaseDatePicker.syncInput(this.releaseDate);
            released.removeAttribute('maxlength'); released.removeAttribute('inputmode');
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
        if (this.compact) {
            this.compactChips = bindCompactEditorChips(root, {
                tags: { read: () => this.tags, write: values => { this.tags = values; }, normalize: value => this.normalizeChip(value) },
                genres: { read: () => this.genres, write: values => { this.genres = values; }, normalize: value => this.normalizeChip(value) },
            });
        } else this.bindChipInput(root, '[data-field="new-tag"]', this.tags, () => this.renderTagChips(root));
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

    private renderStatusSegments(root: HTMLElement, selector: string, options: Array<{ status: VideoStatus; label: string }>): void {
        const container = this.qs<HTMLElement>(root, selector);
        if (!container) return;
        container.empty();
        if (selector === '[data-role="part-status-segments"]') {
            this.partStatusDropdown = createTitlePartDropdown(container,
                options.map(option => ({ value: option.status, label: option.label })),
                this.getEditedPart()?.status ?? 'planned', value => {
                const part = this.getEditedPart();
                if (!part) return;
                setVideoPartStatus(part, value);
                this.refreshPartsUi(root);
            }, t('editStatus'));
            this.updatePartStatusUI(root);
            return;
        }
        for (const option of options) {
            const button = container.createEl('button', {
                cls: 'lorebase-editmode-segment',
                attr: { type: 'button', 'aria-pressed': 'false' },
            });
            button.dataset.status = option.status;
            const icon = button.createSpan({ cls: 'lorebase-editmode-segment-icon', attr: { 'aria-hidden': 'true' } });
            const appearance = getStatusAppearance(this.item.type, option.status);
        setIcon(icon, appearance.icon);
        button.style.setProperty('--lorebase-status-color', appearance.color);
            button.createSpan({ cls: 'lorebase-editmode-segment-label', text: option.label });
        }
    }

    private renderStars(root: HTMLElement): void {
        const stars = this.qs<HTMLElement>(root, '[data-role="stars"]');
        if (!stars) return;
        stars.empty();
        stars.toggleClass('is-custom-scale', this.ratingSettings.mode === 'custom');
        for (const i of getRatingStarValues(this.ratingSettings)) {
            stars.createEl('button', {
                cls: 'lorebase-editmode-star',
                text: String.fromCharCode(9733),
                attr: { type: 'button', 'data-rating': String(i), 'aria-label': `${t('editRating')} ${i}` },
            }).dataset.rating = String(i);
        }
    }

    private renderPartKindOptions(root: HTMLElement): void {
        const host = this.qs<HTMLElement>(root, '[data-field="part-kind"]');
        if (!host) return;
        const options: Array<{ value: PartDraft['kind']; label: string }> = [
            { value: 'movie', label: t('formatMovie') },
            { value: 'season', label: t('settingsSeries') },
        ];
        this.partKindDropdown = createTitlePartDropdown(host, options, this.getEditedPart()?.kind ?? 'season', value => {
            const part = this.getEditedPart();
            if (part) part.kind = value;
        }, t('editFormat'));
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
            mediaType: 'series',
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
        if (!image || this.item.type !== 'series') return;
        const source = getPartPoster(this.parts, this.activePartId, this.posterMode, this.poster || DEFAULT_COVER, value => resolvePartPoster(this.app, value, this.poster || DEFAULT_COVER));
        setSmoothPoster(image, [source, this.poster]);
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
        updatePartEditorActions(root);
        updateTitlePartCard(root, part, this.parts.indexOf(part));
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

    private renderRelatedMedia(root: HTMLElement): void {
        const container = this.qs<HTMLElement>(root, '[data-role="related-media"]');
        if (!container) return;
        container.empty();
        const outgoingPaths = new Set(this.relatedMedia.map((item) => item.path));
        const incomingOnly = this.incomingRelated.filter((item) => !outgoingPaths.has(item.path));
        const displayItems = this.normalizeRelatedMedia([...this.relatedMedia, ...incomingOnly]);
        if (!displayItems.length) {
            container.createDiv({ cls: 'lorebase-editmode-related-empty', text: t('editRelatedEmpty') });
            return;
        }

        for (const [index, item] of displayItems.entries()) {
            const isOutgoing = outgoingPaths.has(item.path);
            this.renderRelatedCard(container, item, !isOutgoing, isOutgoing ? () => {
                this.relatedMedia = this.relatedMedia.filter((entry) => entry.path !== item.path);
                this.renderRelatedMedia(root);
            } : undefined, {
                canMoveUp: index > 0,
                canMoveDown: index < displayItems.length - 1,
                onMoveUp: () => {
                    this.moveRelatedMediaInList(displayItems, index, -1);
                    this.renderRelatedMedia(root);
                },
                onMoveDown: () => {
                    this.moveRelatedMediaInList(displayItems, index, 1);
                    this.renderRelatedMedia(root);
                },
                onDrop: () => {
                    this.reorderRelatedMediaInList(displayItems, item.path);
                    this.renderRelatedMedia(root);
                },
            });
        }
    }

    private renderRelatedCard(
        container: HTMLElement,
        item: RelatedMediaLink,
        readonly: boolean,
        onRemove?: () => void,
        order?: { canMoveUp: boolean; canMoveDown: boolean; onMoveUp: () => void; onMoveDown: () => void; onDrop: () => void },
    ): void {
        const imageUrl = item.imageUrl || this.relatedCandidates.find((candidate) => candidate.path === item.path)?.imageUrl || DEFAULT_COVER;
        const row = container.createDiv({
            cls: `lorebase-editmode-related-item${readonly ? ' is-readonly' : ''}`,
            attr: { title: item.title || item.path, draggable: 'true', 'data-path': item.path },
        });
        this.bindRelatedDrag(row, item.path, order?.onDrop);
        const image = row.createDiv({ cls: 'lorebase-editmode-related-image lorebase-editmode-related-image-legacy' });
        image.setCssStyles({
            backgroundImage: `url("${imageUrl.replace(/"/g, '\\"')}")`,
        });
        image.createSpan({ cls: 'lorebase-editmode-related-type', text: this.getRelatedTypeLabel(item.type) });
        row.createSpan({ cls: 'lorebase-editmode-related-title', text: item.title || item.path });
        if (!readonly && order) {
            const orderControls = row.createDiv({ cls: 'lorebase-editmode-related-order' });
            const up = orderControls.createEl('button', {
                cls: 'lorebase-editmode-related-order-btn',
                text: '↑',
                attr: { type: 'button', 'aria-label': 'Move up' },
            });
            up.disabled = !order.canMoveUp;
            up.toggleClass('is-disabled', up.disabled);
            up.addEventListener('click', (event) => {
                event.stopPropagation();
                order.onMoveUp();
            });
            const down = orderControls.createEl('button', {
                cls: 'lorebase-editmode-related-order-btn',
                text: '↓',
                attr: { type: 'button', 'aria-label': 'Move down' },
            });
            down.disabled = !order.canMoveDown;
            down.toggleClass('is-disabled', down.disabled);
            down.addEventListener('click', (event) => {
                event.stopPropagation();
                order.onMoveDown();
            });
        }
        if (!readonly && onRemove) {
            const remove = row.createEl('button', {
                cls: 'lorebase-editmode-related-remove',
                text: 'x',
                attr: { type: 'button', 'aria-label': t('editRemoveHint') },
            });
            remove.addEventListener('click', (event) => {
                event.stopPropagation();
                onRemove();
            });
        }
    }

    private bindRelatedDrag(card: HTMLElement, targetPath: string, onDrop?: () => void): void {
        if (!onDrop) return;
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

    private moveRelatedMediaInList(items: RelatedMediaLink[], index: number, direction: -1 | 1): void {
        const target = index + direction;
        if (target < 0 || target >= items.length) return;
        const next = [...items];
        [next[index], next[target]] = [next[target], next[index]];
        this.relatedMedia = this.normalizeRelatedMedia(next);
    }

    private reorderRelatedMediaInList(items: RelatedMediaLink[], targetPath: string): void {
        const draggedPath = this.draggedRelatedPath;
        if (!draggedPath || draggedPath === targetPath) return;
        const next = [...items];
        const from = next.findIndex((item) => item.path === draggedPath);
        const to = next.findIndex((item) => item.path === targetPath);
        if (from < 0 || to < 0) return;
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item);
        this.relatedMedia = this.normalizeRelatedMedia(next);
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

    private updateQuickSettingSwitches(root: HTMLElement): void {
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
        updateTitlePartStatusAppearance(root, 'series', status);
    }

    private updateRatingUI(root: HTMLElement): void {
        root.querySelectorAll<HTMLButtonElement>('.lorebase-editmode-star:not(.lorebase-criterion-star)').forEach(btn => {
            const value = Number(btn.dataset.rating ?? '0');
            paintRatingStar(btn, value, this.selectedRating, this.ratingSettings, this.item.type);
        });
        const numeric = this.selectedRating ?? 0;
        const max = getRatingMax(this.ratingSettings);
        const rating = this.compact
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
        if (host && this.item.type !== 'movie') renderWatchProgress(host, this.parts);
        const part = this.getEditedPart();
        if (part) updateTitlePartCard(root, part, this.parts.indexOf(part));

        const remove = this.qs<HTMLButtonElement>(root, '[data-action="remove-part"]');
        if (remove) {
            remove.disabled = this.parts.length <= 1;
            remove.toggleClass('is-disabled', remove.disabled);
        }
        updatePartEditorActions(root);
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

    private refreshPartsUi(root: HTMLElement): void {
        this.renderPartStrip(root);
        this.renderActivePartEditor(root);
        this.updateProgressSummary(root);
    }

    private async refreshSeriesParts(root: HTMLElement, button: HTMLButtonElement): Promise<void> {
        if (!this.onRefreshSeriesParts || button.disabled) return;
        const existingParts = this.parts.slice();
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        try {
            const { parts, partial } = await this.onRefreshSeriesParts();
            if (!this.contentEl.contains(root)) return;
            if (!parts.length) {
                new Notice(et('seasonsUnavailable'));
                return;
            }
            const scan = inspectPartCatalog(catalogSource(this.item), parts, this.parts, this.partCatalog);
            const completed = this.selectedStatus === 'completed';
            if (completed && scan.candidates.length) {
                renderContinuationNotice(root, scan.candidates, scan.baseline, (selected, resume) => {
                    const applied = applyContinuations(this.parts, scan.candidates, selected, resume);
                    this.parts = applied.parts; this.partCatalog = scan.catalog;
                    if (applied.activeId) { this.activePartId = applied.activeId; this.editedPartId = applied.activeId; }
                    if (resume) { this.selectedStatus = 'watching'; this.updateStatusUI(root); }
                    root.querySelector('.lorebase-continuations')?.remove(); this.refreshPartsUi(root);
                });
            } else this.partCatalog = scan.catalog;
            for (const source of parts) {
                const matchesSeason = (part: PartDraft) => part.kind === 'season'
                    && (part.id === source.id || part.seasonNumber === source.seasonNumber);
                const existing = this.parts.find(matchesSeason);
                if (!existing && (existingParts.some(matchesSeason) || this.parts.some(part => part.id === source.id))) continue;
                if (!existing && completed) continue;
                // A previously declined episode increase stays declined too.
                const keepTotal = completed && existing && (existing.episodeTotal ?? 0) > 0 && (source.episodeTotal ?? 0) > (existing.episodeTotal ?? 0);
                const part = existing ?? { ...source };
                if (!keepTotal && source.episodeDetails?.length) part.episodeDetails = mergeEpisodeDetails(source.episodeDetails, part.episodeDetails ?? []);
                const highestEpisode = source.episodeDetails?.reduce((max, episode) => Math.max(max, episode.number), 0) ?? 0;
                const total = Math.max(source.episodeTotal ?? 0, highestEpisode);
                if (!keepTotal && total > 0) {
                    const watched = part.watchedEpisodes?.reduce((max, number) => Math.max(max, number), 0) ?? 0;
                    part.episodeTotal = Math.max(total, part.episodeCurrent ?? 0, watched);
                }
                if (source.poster) part.poster = source.poster;
                if (!existing) this.parts.push(part);
            }
            this.refreshPartsUi(root);
            new Notice(et(partial ? 'seasonsPartial' : 'seasonsUpdated'));
        } catch {
            if (this.contentEl.contains(root)) new Notice(et('seasonsUnavailable'));
        } finally {
            button.disabled = false;
            button.removeAttribute('aria-busy');
        }
    }

    private getVideoStatusOptions(): Array<{ status: VideoStatus; label: string }> {
        return getStatusOptionsForMediaType(this.item.type).map(option => ({ ...option, status: option.status as VideoStatus }));
    }

    private getEditedPart(): PartDraft | null {
        if (!this.parts.length) return null;
        return this.parts.find((part) => part.id === this.editedPartId) ?? this.getActivePart();
    }

    private getActivePart(): PartDraft | null {
        return this.parts.find(part => part.id === this.activePartId) ?? this.parts[0] ?? null;
    }

    private normalizeParts(item: VideoItem): PartDraft[] {
        if (item.parts?.length) return item.parts.map((part) => ({ ...part, episodeDuration: part.episodeDuration ?? parseEpisodeDuration(item.runtime) }));
        if (item.type === 'series') {
            return [{
                id: 'season-1',
                kind: 'season',
                title: item.displayName,
                seasonNumber: 1,
                episodeCurrent: item.episodeCurrent ?? 0,
                episodeTotal: item.episodeTotal,
                status: item.status,
                episodeDuration: parseEpisodeDuration(item.runtime),
            }];
        }
        return [{
            id: 'movie-1',
            kind: 'movie',
            title: item.displayName,
            seasonNumber: null,
            episodeCurrent: 0,
            episodeTotal: null,
            status: item.status,
        }];
    }

    private createPartId(kind: PartDraft['kind']): string {
        const used = new Set(this.parts.map((part) => part.id));
        let index = this.parts.length + 1;
        let id = `${kind}-${index}`;
        while (used.has(id)) {
            index++;
            id = `${kind}-${index}`;
        }
        return id;
    }

    private bindText(root: HTMLElement, selector: string, handler: (value: string) => void): void {
        this.qs<HTMLInputElement>(root, selector)?.addEventListener('input', (event) => {
            handler((event.currentTarget as HTMLInputElement).value.trim());
        });
    }

    private updateBreadcrumb(root: HTMLElement): void {
        const prefix = t(this.item.type === 'movie' ? 'editBreadcrumbMovies' : 'editBreadcrumbSeries');
        this.setText(root, '[data-role="breadcrumb"]', `${prefix} / ${this.title}`);
    }

    private bindPartInput(root: HTMLElement, selector: string, handler: (part: PartDraft, value: string) => void): void {
        this.qs<HTMLInputElement>(root, selector)?.addEventListener('input', (event) => {
            const part = this.getEditedPart();
            if (!part) return;
            handler(part, (event.currentTarget as HTMLInputElement).value.trim());
            this.renderPartStrip(root);
            this.updateProgressSummary(root);
        });
    }

    private bindChipInput(root: HTMLElement, selector: string, target: string[], render: () => void): void {
        const input = this.qs<HTMLInputElement>(root, selector);
        input?.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            const normalized = this.normalizeChip(input.value);
            if (!normalized || target.includes(normalized)) return;
            target.push(normalized);
            input.value = '';
            render();
        });
    }

    private setText(root: HTMLElement, selector: string, value: string): void {
        const node = this.qs<HTMLElement>(root, selector);
        if (node) node.textContent = value;
    }

    private setInput(root: HTMLElement, selector: string, value: string | number | null | undefined): void {
        const input = this.qs<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(root, selector);
        if (input) input.value = value === null || value === undefined ? '' : String(value);
    }

    private qs<T extends Element>(root: HTMLElement, selector: string): T | null {
        return root.querySelector<T>(selector);
    }

    private parseNumberInput(value: string): number | null {
        if (!value.trim()) return null;
        const parsed = parseInt(value, 10);
        return Number.isNaN(parsed) ? null : Math.max(0, parsed);
    }

    private parseList(value: string): string[] {
        return value.split(/[,;\n]+/).map((entry) => entry.trim()).filter(Boolean);
    }

    private normalizeChip(value: string): string | null {
        const cleaned = value.trim().replace(/^#+/, '').toLowerCase();
        return cleaned || null;
    }

    private normalizeList(values: string[]): string[] {
        const unique = new Set<string>();
        for (const value of values) {
            const normalized = this.normalizeChip(value);
            if (normalized) unique.add(normalized);
        }
        return Array.from(unique.values());
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

    private getFile(): TFile | null {
        const file = this.app.vault.getAbstractFileByPath(this.item.filePath);
        return file instanceof TFile ? file : null;
    }

    async saveBeforeSourceRefresh(): Promise<boolean> {
        return this.save();
    }

    private async save(): Promise<boolean> {
        if (!validateRatingInputs(this.contentEl)) return false;
        if (!validateCountriesControl(this.contentEl)) return false;
        if (!validateDatePickers([this.startedDatePicker, this.finishedDatePicker, this.releaseDatePicker].filter((picker): picker is HierarchicalDatePicker => Boolean(picker)))) return false;
        this.compactChips?.commit();
        const activePart = this.getActivePart();
        const allPartsCompleted = this.item.type === 'series' && this.parts.length > 0 && this.parts.every((part) => part.status === 'completed');
        const status = allPartsCompleted ? 'completed' : this.selectedStatus;

        const updates: VideoUpdates = {
            ...(this.countries !== undefined ? { countries: this.countries } : {}),
            workType: this.workType,
            displayName: this.title,
            year: this.year,
            userRating: this.selectedRating,
            detailedRatings: this.detailedRatingEditor.getValue(),
            status,
            favorite: this.favorite,
            priority: this.selectedPriority,
            statusReasons: this.statusReasons,
            ...(this.discovery || this.item.discovery ? { discovery: this.discovery } : {}),
            ...(this.item.type === 'series' && this.partCatalog ? { partCatalog: this.partCatalog } : {}),
            repeatCount: this.repeatCount,
            summary: this.summary,
            genres: this.genres,
            tags: this.tags,
            sourceUrl: this.sourceUrl || null,
            started: this.started || null,
            finished: this.finished || null,
            relatedMedia: this.compactRelated?.getValue() ?? this.relatedMedia,
            myNotes: this.myNotes,
        };

        if (this.item.type === 'movie') {
            updates.imageUrl = this.poster;
            updates.horizontalImageUrl = this.horizontalPoster;
            updates.releaseDate = this.releaseDate;
            updates.runtime = this.runtime;
            updates.director = this.director;
            updates.actors = this.actors;
        } else {
            updates.parts = this.parts;
            updates.activePartId = activePart?.id ?? this.activePartId;
            updates.releaseDate = this.releaseDate;
            updates.director = this.director;
            updates.actors = this.actors;
            updates.seasons = this.parts.length || this.seasons;
            updates.networks = this.networks;
            updates.studios = this.studios;
            updates.episodeCurrent = activePart?.episodeCurrent ?? null;
            updates.episodeTotal = activePart?.episodeTotal ?? null;
        }

        await this.onSave(updates);
        this.close();
        return true;
    }
}

class RelatedMediaPickerModal extends Modal {
    private candidates: RelatedCandidate[];
    private onPick: (candidates: RelatedCandidate[]) => void;
    private query = '';
    private mediaFilter: RelatedMediaLink['type'] = 'anime';
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
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('lorebase-related-picker', 'lorebase-modal-panel');
        this.modalEl.addClass('lorebase-related-picker-container');

        const header = contentEl.createDiv({ cls: 'lorebase-related-picker-header' });
        header.createEl('h2', { text: t('editRelatedPickerTitle') });

        const search = contentEl.createEl('input', {
            cls: 'lorebase-editmode-input lorebase-related-picker-search',
            attr: { type: 'text', placeholder: t('promptSearchPlaceholder') },
        });
        search.addEventListener('input', () => {
            this.query = search.value.trim().toLowerCase();
            this.renderList();
        });

        const filters = contentEl.createDiv({ cls: 'lorebase-related-picker-filters' });
        const filterOptions: Array<{ value: RelatedMediaLink['type']; label: string }> = [
            { value: 'game', label: t('settingsGames') },
            { value: 'anime', label: t('settingsAnime') },
            { value: 'movie', label: t('settingsMovies') },
            { value: 'series', label: t('settingsSeries') },
            { value: 'book', label: t('settingsBooks') },
            { value: 'manga', label: t('settingsManga') },
        ];
        for (const option of filterOptions) {
            const button = filters.createEl('button', {
                cls: `lorebase-related-picker-filter ${this.mediaFilter === option.value ? 'is-active' : ''}`,
                text: option.label,
                attr: { type: 'button', 'aria-pressed': String(this.mediaFilter === option.value) },
            });
            button.addEventListener('click', () => {
                this.mediaFilter = option.value;
                filters.querySelectorAll<HTMLButtonElement>('.lorebase-related-picker-filter').forEach((entry) => {
                    const active = entry === button;
                    entry.toggleClass('is-active', active);
                    entry.setAttr('aria-pressed', String(active));
                });
                this.renderList();
            });
        }

        this.listEl = contentEl.createDiv({ cls: 'lorebase-related-picker-grid' });
        this.footerEl = contentEl.createDiv({ cls: 'lorebase-related-picker-footer' });
        this.renderList();
        this.renderFooter();
        search.focus();
    }

    onClose(): void {
        this.contentEl.empty();
        this.modalEl.removeClass('lorebase-related-picker-container');
    }

    private renderList(): void {
        if (!this.listEl) return;
        this.listEl.empty();
        const query = this.query;
        const items = this.candidates
            .filter((candidate) => {
                if (!query) return candidate.type === this.mediaFilter;
                return candidate.title.toLowerCase().includes(query) || candidate.path.toLowerCase().includes(query);
            })
            .slice(0, 80);

        if (!items.length) {
            this.listEl.createDiv({ cls: 'lorebase-editmode-related-empty', text: t('editRelatedEmpty') });
            return;
        }

        for (const item of items) {
            const card = this.listEl.createEl('button', {
                cls: `lorebase-related-picker-card ${this.selectedPaths.has(item.path) ? 'is-selected' : ''}`,
                attr: {
                    type: 'button',
                    title: item.path,
                    'aria-pressed': String(this.selectedPaths.has(item.path)),
                },
            });
            const image = card.createDiv({ cls: 'lorebase-related-picker-card-image' });
            const imageUrl = item.imageUrl || DEFAULT_COVER;
            image.setCssStyles({ backgroundImage: `url("${imageUrl.replace(/"/g, '\\"')}")` });
            image.createSpan({ cls: 'lorebase-related-picker-card-type', text: this.getTypeLabel(item.type) });
            card.createSpan({ cls: 'lorebase-related-picker-card-check', text: '✓' });
            const body = card.createDiv({ cls: 'lorebase-related-picker-card-body' });
            body.createDiv({ cls: 'lorebase-related-picker-card-title', text: item.title });
            body.createDiv({ cls: 'lorebase-related-picker-card-path', text: item.path });
            card.addEventListener('click', () => {
                this.toggleCandidate(item.path);
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
}
