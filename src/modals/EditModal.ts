/**
 * LOREBASE - Edit Modal
 * Cinematic edit mode for game properties
 */

import { App, Menu, Modal, Notice, TFile, setIcon } from 'obsidian';
import { GameDlc, GameItem, GameStatus, RelatedMediaLink, TagPreset, UserRating } from '../types';
import { DEFAULT_COVER, DEFAULT_GAME_TAG_PRESETS, STATUS_CONFIG } from '../constants';
import { i18n, t } from '../localization';
import { getRatingScale, getRatingValues } from '../utils/ratingScale';
import { GenreEditModal } from './GenreEditModal';
import { CommunityRatingRefresh, renderCommunityRatingPanel } from './CommunityRatingPanel';
import { MediaSourceAction, renderMediaSourcePanel } from './MediaSourcePanel';
import { extractMarkdownSection } from '../services/GameService';
import { normalizeObsidianTag } from '../settings/settingsNormalization';
import { RelatedMediaEditor } from './RelatedMediaEditor';
import { HierarchicalDatePicker, validateDatePickers } from './HierarchicalDatePicker';

type GameDlcRefresh = (existing: GameDlc[]) => Promise<GameDlc[] | null>;
type NotesMode = 'description' | 'myNotes';
type RegularGameStatus = Exclude<GameStatus, 'wishlist'>;

/**
 * Modal for editing game properties
 */
export class EditModal extends Modal {
    private game: GameItem;
    private onSave: (updates: Partial<GameItem>) => Promise<void>;
    private onDelete?: () => void;
    private onRefreshCommunityRating?: CommunityRatingRefresh;
    private onRefreshDlc?: GameDlcRefresh;
    private seriesOptions: string[];
    private tagPresets: TagPreset[];

    private selectedRating: UserRating;
    private selectedStatus: GameStatus;
    private statusBeforeWishlist: RegularGameStatus;
    private favorite: boolean;
    private title: string;
    private year: number | null;
    private description: string;
    private myNotes: string;
    private notesMode: NotesMode = 'description';
    private notesExpanded = false;
    private gameSeries: string;
    private started: string;
    private finished: string;
    private isAdult: boolean;
    private releaseDate: string;
    private publisher: string;
    private developer: string;
    private tags: string[];
    private genres: string[];
    private platforms: string[];
    private dlc: GameDlc[];
    private dlcExpanded = false;
    private relatedMediaEditor: RelatedMediaEditor;
    private datePickers: HierarchicalDatePicker[] = [];

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
        game: GameItem,
        onSave: (updates: Partial<GameItem>) => Promise<void>,
        seriesOptions: string[] = [],
        onDelete?: () => void,
        tagPresets: TagPreset[] = [],
        onRefreshCommunityRating?: CommunityRatingRefresh,
        onRefreshDlc?: GameDlcRefresh,
        relatedCandidates: RelatedMediaLink[] = [],
        incomingRelated: RelatedMediaLink[] = [],
        private readonly onRefreshSource?: MediaSourceAction,
        private readonly onChangeSource?: MediaSourceAction
    ) {
        super(app);
        this.game = game;
        this.onSave = onSave;
        this.seriesOptions = seriesOptions;
        this.onDelete = onDelete;
        this.tagPresets = tagPresets;
        this.onRefreshCommunityRating = onRefreshCommunityRating;
        this.onRefreshDlc = onRefreshDlc;

        this.selectedRating = game.userRating;
        this.selectedStatus = game.status;
        this.statusBeforeWishlist = game.status === 'wishlist' ? 'not_started' : game.status;
        this.favorite = game.favorite;
        this.title = game.displayName;
        this.year = game.year;
        this.description = game.description;
        this.myNotes = game.myNotes ?? '';
        this.gameSeries = game.gameSeries;
        this.started = this.normalizeDateInput(game.started);
        this.finished = this.normalizeDateInput(game.finished);
        this.isAdult = game.isAdult;
        this.releaseDate = this.normalizeDateInput(game.releaseDate);
        this.publisher = game.publisher ?? '';
        this.developer = game.developer ?? '';
        this.tags = this.normalizeTags(game.tags ?? []);
        this.genres = this.normalizeGenres(game.genres ?? []);
        this.platforms = this.normalizePlatforms(game.platforms ?? []);
        this.dlc = this.normalizeDlc(game.dlc ?? []);
        this.relatedMediaEditor = new RelatedMediaEditor(
            app,
            game.filePath,
            game.relatedMedia ?? [],
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

        const root = contentEl.createDiv({ cls: 'lorebase-editmode-root lorebase-modal-panel' });
        root.appendChild(this.createTemplateFragment(this.buildTemplate()));
        this.bindStaticContent(root);
        this.bindHeader(root);
        this.bindMobileNavigation(root);
        this.bindQuickSettings(root);
        this.bindStatus(root);
        this.bindRating(root);
        this.bindFields(root);
        this.bindPlayDates(root);
        this.bindDlc(root);
        this.relatedMediaEditor.bind(root);
        this.bindNotesDisclosure(root);
        this.bindNotes(root);
        this.bindPlanTags(root);
        this.bindTags(root);
        this.bindDates(root);
        this.bindAdvanced(root);
        if (this.onRefreshCommunityRating) {
            renderCommunityRatingPanel(root, this.game, this.onRefreshCommunityRating);
        }
        renderMediaSourcePanel(root, this.game, this.onRefreshSource, this.onChangeSource);
        void this.loadMyNotes(root);
    }

    onClose(): void {
        const { contentEl } = this;
        this.datePickers.forEach((picker) => picker.destroy());
        this.datePickers = [];
        this.modalEl.removeEventListener('keydown', this.onKeydown);
        contentEl.empty();
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
        return `
            <div class="lorebase-editmode-view" data-mobile-tab="general">
                <header class="lorebase-editmode-header">
                    <div class="lorebase-editmode-header-left">
                        <span class="lorebase-editmode-breadcrumb" data-role="breadcrumb"></span>
                    </div>
                    <div class="lorebase-editmode-header-right">
                        <button type="button" class="lorebase-editmode-btn lorebase-editmode-btn-ghost" data-action="discard">${t('editCancel')}</button>
                        <button type="button" class="lorebase-editmode-btn lorebase-editmode-btn-primary" data-action="save">${t('editSave')}</button>
                        <button type="button" class="lorebase-editmode-icon-btn" data-action="overflow" aria-label="${t('editOverflow')}">...</button>
                    </div>
                </header>

                <nav class="lorebase-editmode-mobile-tabs" aria-label="${t('editGeneral')}">
                    <button type="button" class="lorebase-editmode-mobile-tab is-active" data-mobile-tab-target="general">${t('editGeneral')}</button>
                    <button type="button" class="lorebase-editmode-mobile-tab" data-mobile-tab-target="personal">${t('editPersonal')}</button>
                    <button type="button" class="lorebase-editmode-mobile-tab" data-mobile-tab-target="more">${t('editMore')}</button>
                </nav>

                <div class="lorebase-editmode-grid">
                    <aside class="lorebase-editmode-column lorebase-editmode-column-left">
                        <section class="lorebase-editmode-panel lorebase-editmode-poster-card" data-component="PosterCard" data-mobile-pane="general">
                            <div class="lorebase-editmode-panel-title-row">
                                <h3 class="lorebase-editmode-panel-title">${t('editPoster')}</h3>
                            </div>
                            <div class="lorebase-editmode-poster-frame">
                                <img class="lorebase-editmode-poster-image" data-role="poster" alt="${t('templateFieldPoster')}" />
                            </div>
                            <div class="lorebase-editmode-mobile-summary">
                                <strong data-role="mobile-summary-title"></strong>
                                <span data-role="mobile-summary-meta"></span>
                            </div>
                        </section>

                        <section class="lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-quick-settings" data-component="QuickSettings" data-mobile-pane="personal">
                            <div class="lorebase-editmode-panel-title-row">
                                <h3 class="lorebase-editmode-panel-title">${t('editQuickSettings')}</h3>
                            </div>
                            <div class="lorebase-editmode-toggle-list">
                                <label class="lorebase-editmode-switch-row">
                                    <span class="lorebase-editmode-switch-label">${t('editFavorite')}</span>
                                    <button type="button" class="lorebase-editmode-switch lorebase-editmode-switch-favorite" data-toggle="favorite" aria-label="${t('editFavorite')}" aria-pressed="false"><span class="lorebase-editmode-switch-thumb"></span></button>
                                </label>
                                <label class="lorebase-editmode-switch-row">
                                    <span class="lorebase-editmode-switch-label" id="lorebase-game-adult-label">${t('editAdult')}</span>
                                    <button type="button" class="lorebase-editmode-switch lorebase-editmode-switch-adult" data-toggle="adult" aria-labelledby="lorebase-game-adult-label" aria-describedby="lorebase-game-adult-tooltip" aria-pressed="false">
                                        <span class="lorebase-editmode-switch-thumb"></span>
                                        <span class="lorebase-editmode-switch-tooltip" id="lorebase-game-adult-tooltip" role="tooltip">${t('editAdultVisibilityHint')}</span>
                                    </button>
                                </label>
                                <div class="lorebase-editmode-switch-row">
                                    <span class="lorebase-editmode-switch-label-row">
                                        <span class="lorebase-editmode-switch-label" id="lorebase-wishlist-label">${t('statusWishlist')}</span>
                                        <button type="button" class="lorebase-editmode-help" aria-labelledby="lorebase-wishlist-label" aria-describedby="lorebase-wishlist-tooltip">
                                            <span aria-hidden="true">?</span>
                                            <span class="lorebase-editmode-help-tooltip" id="lorebase-wishlist-tooltip" role="tooltip">${t('editWishlistStatusLock')}</span>
                                        </button>
                                    </span>
                                    <button type="button" class="lorebase-editmode-switch lorebase-editmode-switch-wishlist" data-toggle="wishlist" aria-labelledby="lorebase-wishlist-label" aria-pressed="false"><span class="lorebase-editmode-switch-thumb"></span></button>
                                </div>
                            </div>
                        </section>

                        <section class="lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-plan-tags" data-component="PlanTags" data-mobile-pane="personal">
                            <div class="lorebase-editmode-panel-title-row">
                                <h3 class="lorebase-editmode-panel-title">${t('plans')}</h3>
                            </div>
                            <div class="lorebase-editmode-chip-row" data-role="plan-tag-chips"></div>
                        </section>

                    </aside>

                    <main class="lorebase-editmode-column lorebase-editmode-column-center">
                        <section class="lorebase-editmode-panel lorebase-editmode-title-meta" data-component="TitleMeta" data-mobile-pane="general">
                            <div class="lorebase-editmode-title-row">
                                <input class="lorebase-editmode-title-input" data-field="title" type="text" aria-label="${t('templateFieldName')}" />
                            </div>
                            <div class="lorebase-editmode-meta-row">
                                <label class="lorebase-editmode-field">
                                    <span class="lorebase-editmode-field-label">${t('year')}</span>
                                    <input class="lorebase-editmode-input" data-field="year" type="number" inputmode="numeric" placeholder="2026" />
                                </label>
                                <label class="lorebase-editmode-field">
                                    <span class="lorebase-editmode-field-label">${t('editSeries')}</span>
                                    <div class="lorebase-editmode-combobox" data-field="series"></div>
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

                        <section class="lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-notes lorebase-editmode-game-notes is-collapsed" data-component="NotesEditor" data-mobile-pane="personal">
                            <div class="lorebase-editmode-panel-title-row">
                                <h3 class="lorebase-editmode-panel-title" data-role="notes-title">${t('editDescription')}</h3>
                                <div class="lorebase-editmode-note-tabs" role="tablist">
                                    <button type="button" class="lorebase-editmode-note-tab is-active" data-mode="description">${t('editDescription')}</button>
                                    <button type="button" class="lorebase-editmode-note-tab" data-mode="myNotes">${t('editMyNotes')}</button>
                                </div>
                            </div>
                            <div class="lorebase-editmode-notes-shell">
                                <textarea class="lorebase-editmode-notes-input" data-field="notes" rows="9"></textarea>
                            </div>
                            <div class="lorebase-editmode-notes-footer">
                                <span class="lorebase-editmode-saved-indicator" data-role="saved-indicator"><span class="lorebase-editmode-saved-dot" aria-hidden="true"></span><span data-role="saved-text">${t('editSaved')}</span></span>
                                <span class="lorebase-editmode-char-count" data-role="char-count">0 ${t('editCharsShort')}</span>
                            </div>
                        </section>

                        <section class="lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-status-rating" data-component="StatusRating" data-mobile-pane="general">
                            <div class="lorebase-editmode-panel-title-row">
                                <h3 class="lorebase-editmode-panel-title">${t('editStatus')} & ${t('editRating')}</h3>
                                <span class="lorebase-editmode-status-hint">${t('editTracking')}</span>
                            </div>
                            <div class="lorebase-editmode-status-shell">
                                <div class="lorebase-editmode-segmented" role="tablist" aria-label="${t('editStatus')}">
                                    <button type="button" class="lorebase-editmode-segment" data-status="not_started">
                                        <span class="lorebase-editmode-segment-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="${STATUS_CONFIG.not_started.pathD}" /></svg></span>
                                        <span class="lorebase-editmode-segment-label">${t('statusNotStarted')}</span>
                                    </button>
                                    <button type="button" class="lorebase-editmode-segment" data-status="playing">
                                        <span class="lorebase-editmode-segment-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="${STATUS_CONFIG.playing.pathD}" /></svg></span>
                                        <span class="lorebase-editmode-segment-label">${t('statusPlaying')}</span>
                                    </button>
                                    <button type="button" class="lorebase-editmode-segment" data-status="completed">
                                        <span class="lorebase-editmode-segment-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="${STATUS_CONFIG.completed.pathD}" /></svg></span>
                                        <span class="lorebase-editmode-segment-label">${t('statusPlayed')}</span>
                                    </button>
                                    <button type="button" class="lorebase-editmode-segment" data-status="dropped">
                                        <span class="lorebase-editmode-segment-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="${STATUS_CONFIG.dropped.pathD}" /></svg></span>
                                        <span class="lorebase-editmode-segment-label">${t('statusDropped')}</span>
                                    </button>
                                    <button type="button" class="lorebase-editmode-segment" data-status="sandbox">
                                        <span class="lorebase-editmode-segment-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="${STATUS_CONFIG.sandbox.pathD}" /></svg></span>
                                        <span class="lorebase-editmode-segment-label">${t('statusSandbox')}</span>
                                    </button>
                                </div>
                                <div class="lorebase-editmode-status-lock-note" data-role="status-lock-note" hidden>${t('editWishlistStatusLocked')}</div>
                            </div>
                            <div class="lorebase-editmode-rating-wrap">
                                <div class="lorebase-editmode-rating-head">
                                    <span class="lorebase-editmode-rating-caption">${t('editPersonalRating')}</span>
                                    <button type="button" class="lorebase-editmode-btn lorebase-editmode-btn-ghost lorebase-editmode-btn-tight" data-action="clear-rating">${t('editClear')}</button>
                                </div>
                                <div class="lorebase-editmode-stars" data-role="stars"></div>
                                <div class="lorebase-editmode-rating-meta">
                                    <span class="lorebase-editmode-rating-value" data-role="rating-value">0.0 / ${getRatingScale().toFixed(1)}</span>
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

                        <section class="lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-dlc" data-component="DlcPanel" data-mobile-pane="more">
                            <div class="lorebase-editmode-panel-title-row">
                                <h3 class="lorebase-editmode-panel-title">${t('editDlc')}</h3>
                                <button type="button" class="lorebase-editmode-btn lorebase-editmode-btn-tight" data-action="refresh-dlc">${t('editRefreshDlc')}</button>
                            </div>
                            <div class="lorebase-editmode-related-list lorebase-editmode-dlc-list" data-role="dlc-list"></div>
                            <div class="lorebase-editmode-dlc-toggle-row" data-role="dlc-toggle"></div>
                        </section>

                        <section class="lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-related lorebase-editmode-related-main" data-mobile-pane="more">
                            <div class="lorebase-editmode-panel-title-row">
                                <h3 class="lorebase-editmode-panel-title">${t('editRelatedMedia')}</h3>
                                <button type="button" class="lorebase-editmode-btn lorebase-editmode-btn-tight" data-action="add-related">${t('editAddRelated')}</button>
                            </div>
                            <div class="lorebase-editmode-related-list" data-role="related-media"></div>
                        </section>

                    </main>

                    <aside class="lorebase-editmode-column lorebase-editmode-column-right">
                        <section class="lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-progress" data-component="ProgressPanel" data-mobile-pane="more">
                            <div class="lorebase-editmode-panel-title-row"><h3 class="lorebase-editmode-panel-title">${t('editProgress')}</h3></div>
                            <div class="lorebase-editmode-kv-list">
                                <div class="lorebase-editmode-kv-row">
                                    <span class="lorebase-editmode-kv-key">${t('editProgressMain')}</span>
                                    <span class="lorebase-editmode-kv-val is-empty" data-role="progress-main">-</span>
                                </div>
                                <div class="lorebase-editmode-kv-row">
                                    <span class="lorebase-editmode-kv-key">${t('editProgressMainPlusSides')}</span>
                                    <span class="lorebase-editmode-kv-val is-empty" data-role="progress-main-plus-sides">-</span>
                                </div>
                                <div class="lorebase-editmode-kv-row">
                                    <span class="lorebase-editmode-kv-key">${t('editProgressPerfectionist')}</span>
                                    <span class="lorebase-editmode-kv-val is-empty" data-role="progress-completionist">-</span>
                                </div>
                            </div>
                        </section>

                        <details class="lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-advanced" data-component="AdvancedPanel" data-mobile-pane="more">
                            <summary class="lorebase-editmode-panel-title-row lorebase-editmode-collapsible-summary">
                                <h3 class="lorebase-editmode-panel-title">${t('editAdvanced')}</h3>
                                <span class="lorebase-editmode-collapsible-caret" aria-hidden="true">v</span>
                            </summary>
                            <div class="lorebase-editmode-advanced-grid">
                                <div class="lorebase-editmode-field lorebase-editmode-platforms-field">
                                    <span class="lorebase-editmode-field-label">${t('templateFieldPlatforms')}</span>
                                    <div class="lorebase-editmode-platform-chips" data-role="platform-chips"></div>
                                    <div class="lorebase-editmode-platform-add-row">
                                        <span class="lorebase-editmode-platform-add-icon" data-role="platform-add-icon" aria-hidden="true"></span>
                                        <input class="lorebase-editmode-input lorebase-editmode-platform-input" data-field="new-platform" type="text" placeholder="${t('editPlatformPlaceholder')}" />
                                        <button type="button" class="lorebase-editmode-btn lorebase-editmode-btn-ghost lorebase-editmode-platform-add" data-action="add-platform" aria-label="${t('editAddPlatform')}">
                                            <span data-role="platform-add-button-icon" aria-hidden="true"></span>
                                        </button>
                                    </div>
                                </div>
                                <label class="lorebase-editmode-field"><span class="lorebase-editmode-field-label">${t('editReleaseDate')}</span><input class="lorebase-editmode-input" data-field="release-date" type="date" /></label>
                                <label class="lorebase-editmode-field"><span class="lorebase-editmode-field-label">${t('editPublisher')}</span><input class="lorebase-editmode-input" data-field="publisher" type="text" placeholder="${t('editPublisher')}" /></label>
                                <label class="lorebase-editmode-field"><span class="lorebase-editmode-field-label">${t('editDeveloper')}</span><input class="lorebase-editmode-input" data-field="developer" type="text" placeholder="${t('editDeveloper')}" /></label>
                                <div class="lorebase-editmode-path-row">
                                    <span class="lorebase-editmode-field-label">${t('editLocalPath')}</span>
                                    <code class="lorebase-editmode-local-path" data-role="local-path"></code>
                                    <button type="button" class="lorebase-editmode-btn lorebase-editmode-btn-ghost lorebase-editmode-btn-tight" data-action="browse-file">${t('editOpen')}</button>
                                </div>
                            </div>
                        </details>

                        <section class="lorebase-editmode-panel lorebase-editmode-tags" data-component="TagsBlock" data-mobile-pane="personal">
                            <div class="lorebase-editmode-panel-title-row"><h3 class="lorebase-editmode-panel-title">${t('tags')}</h3></div>
                            <div class="lorebase-editmode-chip-row" data-role="tag-chips"></div>
                            <input class="lorebase-editmode-input lorebase-editmode-tag-input" type="text" data-field="new-tag" placeholder="${t('editTagPlaceholder')}" />
                        </section>

                        <section class="lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-timestamps" data-mobile-pane="more">
                            <div class="lorebase-editmode-panel-title-row">
                                <h3 class="lorebase-editmode-panel-title">${t('editDates')}</h3>
                            </div>
                            <div class="lorebase-editmode-kv-list">
                                <div class="lorebase-editmode-kv-row"><span class="lorebase-editmode-kv-key">${t('editAdded')}</span><span class="lorebase-editmode-kv-val" data-role="ts-added">-</span></div>
                                <div class="lorebase-editmode-kv-row"><span class="lorebase-editmode-kv-key">${t('editUpdated')}</span><span class="lorebase-editmode-kv-val" data-role="ts-updated">-</span></div>
                            </div>
                        </section>

                    </aside>
                </div>
                <footer class="lorebase-editmode-mobile-footer">
                    <button type="button" class="lorebase-editmode-btn lorebase-editmode-btn-primary" data-action="save">${t('editSave')}</button>
                </footer>
            </div>
        `;
    }

    private bindStaticContent(root: HTMLElement): void {
        const breadcrumb = this.qs<HTMLElement>(root, '[data-role="breadcrumb"]');
        if (breadcrumb) breadcrumb.textContent = `${t('editBreadcrumbGames')} / ${this.game.displayName}`;

        const poster = this.qs<HTMLImageElement>(root, '[data-role="poster"]');
        if (poster) {
            poster.src = this.game.imageUrl;
            poster.alt = this.game.displayName;
        }

        const title = this.qs<HTMLInputElement>(root, '[data-field="title"]');
        if (title) title.value = this.game.displayName;

        const year = this.qs<HTMLInputElement>(root, '[data-field="year"]');
        if (year) year.value = this.year ? String(this.year) : '';
        this.updateMobileSummary(root);

        this.renderSeriesCombobox(root);

        const notes = this.qs<HTMLTextAreaElement>(root, '[data-field="notes"]');
        if (notes) {
            notes.value = this.getCurrentNotesValue();
            this.updateNotesPlaceholder(notes);
            this.autoResizeNotes(notes);
        }

        const startedInput = this.qs<HTMLInputElement>(root, '[data-field="started-date"]');
        if (startedInput) this.syncDateInput(startedInput, this.started);

        const finishedInput = this.qs<HTMLInputElement>(root, '[data-field="finished-date"]');
        if (finishedInput) this.syncDateInput(finishedInput, this.finished);

        const startedIcon = this.qs<HTMLElement>(root, '[data-role="started-date-icon"]');
        if (startedIcon) setIcon(startedIcon, 'calendar-days');
        const finishedIcon = this.qs<HTMLElement>(root, '[data-role="finished-date-icon"]');
        if (finishedIcon) setIcon(finishedIcon, 'calendar-days');

        const file = this.getFile();
        const frontmatter = file ? this.app.metadataCache.getFileCache(file)?.frontmatter : null;
        this.bindProgress(root, frontmatter);

        const releaseDateInput = this.qs<HTMLInputElement>(root, '[data-field="release-date"]');
        if (releaseDateInput) {
            const releaseDateValue = this.releaseDate || this.getFrontmatterValue(frontmatter, ['releaseDate', 'release_date', 'released', 'release']) || '';
            releaseDateInput.value = this.normalizeDateInput(releaseDateValue);
            this.releaseDate = releaseDateInput.value;
        }

        const publisherInput = this.qs<HTMLInputElement>(root, '[data-field="publisher"]');
        if (publisherInput) {
            const publisherValue = this.publisher || this.getFrontmatterValue(frontmatter, ['publisher', 'publishers']) || '';
            publisherInput.value = publisherValue;
            this.publisher = publisherValue;
        }

        const developerInput = this.qs<HTMLInputElement>(root, '[data-field="developer"]');
        if (developerInput) {
            const developerValue = this.developer || this.getFrontmatterValue(frontmatter, ['developer', 'developers']) || '';
            developerInput.value = developerValue;
            this.developer = developerValue;
        }

        const path = this.qs<HTMLElement>(root, '[data-role="local-path"]');
        if (path) path.textContent = this.game.filePath;

        this.renderPlatformChips(root);
        this.renderGenreChips(root);
        this.renderTagChips(root);
        this.renderPlanTagChips(root);
        this.renderDlc(root);
        this.updateQuickSettingSwitches(root);
        this.updateStatusUI(root);
        this.updateRatingUI(root);
        this.updateNotesDisclosureUI(root);
        this.updateNotesModeUI(root);
        this.updateCharCount(root);
    }

    private bindHeader(root: HTMLElement): void {
        this.qs<HTMLButtonElement>(root, '[data-action="discard"]')?.addEventListener('click', () => this.close());
        root.querySelectorAll<HTMLButtonElement>('[data-action="save"]').forEach((button) => {
            button.addEventListener('click', () => void this.save());
        });
        this.qs<HTMLButtonElement>(root, '[data-action="overflow"]')?.addEventListener('click', (event) => {
            const menu = new Menu();
            menu.addItem((item) => {
                item
                    .setTitle(t('contextDelete'))
                    .setIcon('trash-2')
                    .onClick(() => {
                        this.close();
                        this.onDelete?.();
                    });
            });
            const target = event.currentTarget as HTMLElement;
            const rect = target.getBoundingClientRect();
            menu.showAtPosition({ x: rect.right, y: rect.bottom });
        });
    }

    private bindMobileNavigation(root: HTMLElement): void {
        const view = this.qs<HTMLElement>(root, '.lorebase-editmode-view');
        if (!view) return;
        root.querySelectorAll<HTMLButtonElement>('[data-mobile-tab-target]').forEach((button) => {
            button.addEventListener('click', () => {
                const target = button.dataset.mobileTabTarget;
                if (!target) return;
                view.dataset.mobileTab = target;
                root.querySelectorAll<HTMLButtonElement>('[data-mobile-tab-target]').forEach((tab) => {
                    const active = tab === button;
                    tab.toggleClass('is-active', active);
                    tab.setAttribute('aria-selected', String(active));
                });
                this.qs<HTMLElement>(root, '.lorebase-editmode-grid')?.scrollTo({ top: 0, behavior: 'smooth' });
            });
        });
    }

    private bindQuickSettings(root: HTMLElement): void {
        root.querySelectorAll<HTMLButtonElement>('.lorebase-editmode-switch').forEach(btn => {
            btn.addEventListener('click', () => {
                const key = btn.dataset.toggle;
                if (key === 'favorite') this.favorite = !this.favorite;
                if (key === 'adult') this.isAdult = !this.isAdult;
                if (key === 'wishlist') {
                    if (this.selectedStatus === 'wishlist') {
                        this.selectedStatus = this.statusBeforeWishlist;
                    } else {
                        this.statusBeforeWishlist = this.selectedStatus;
                        this.selectedStatus = 'wishlist';
                    }
                }
                this.updateQuickSettingSwitches(root);
                this.updateStatusUI(root);
            });
        });

    }

    private bindStatus(root: HTMLElement): void {
        root.querySelectorAll<HTMLButtonElement>('.lorebase-editmode-segment').forEach(btn => {
            btn.addEventListener('click', () => {
                if (this.selectedStatus === 'wishlist') return;
                const status = btn.dataset.status as GameStatus | undefined;
                if (!status) return;
                this.selectedStatus = status;
                if (status === 'completed' && !this.finished) {
                    this.finished = this.getTodayDateInput();
                    const finished = this.qs<HTMLInputElement>(root, '[data-field="finished-date"]');
                    if (finished) this.syncDateInput(finished, this.finished);
                }
                this.updateStatusUI(root);
            });
        });
    }

    private bindRating(root: HTMLElement): void {
        const stars = this.qs<HTMLElement>(root, '[data-role="stars"]');
        if (stars) {
            stars.empty();
            for (const value of getRatingValues()) {
                const btn = stars.createEl('button', {
                    cls: 'lorebase-editmode-star',
                    attr: { type: 'button', 'aria-label': `${t('editRating')} ${value}` }
                });
                btn.textContent = String.fromCharCode(9733);
                btn.dataset.rating = String(value);
                btn.addEventListener('click', () => {
                    this.selectedRating = value;
                    this.updateRatingUI(root);
                });
            }
        }

        this.qs<HTMLButtonElement>(root, '[data-action="clear-rating"]')?.addEventListener('click', () => {
            this.selectedRating = null;
            this.updateRatingUI(root);
        });

        this.updateRatingUI(root);
    }

    private bindFields(root: HTMLElement): void {
        const year = this.qs<HTMLInputElement>(root, '[data-field="year"]');
        year?.addEventListener('input', () => {
            const value = year.value.trim();
            if (!value) {
                this.year = null;
                this.updateMobileSummary(root);
                return;
            }
            const parsed = parseInt(value, 10);
            this.year = Number.isNaN(parsed) ? null : parsed;
            this.updateMobileSummary(root);
        });

        const title = this.qs<HTMLInputElement>(root, '[data-field="title"]');
        title?.addEventListener('input', () => {
            this.title = title.value.trim();
            const breadcrumb = this.qs<HTMLElement>(root, '[data-role="breadcrumb"]');
            if (breadcrumb) breadcrumb.textContent = `${t('editBreadcrumbGames')} / ${title.value.trim() || this.game.displayName}`;
            this.updateMobileSummary(root);
        });
    }

    private updateMobileSummary(root: HTMLElement): void {
        const title = this.qs<HTMLElement>(root, '[data-role="mobile-summary-title"]');
        const meta = this.qs<HTMLElement>(root, '[data-role="mobile-summary-meta"]');
        if (title) title.textContent = this.title || this.game.displayName;
        if (meta) {
            const parts = [this.year ? String(this.year) : '', this.game.integrationProvider?.toUpperCase() ?? ''].filter(Boolean);
            meta.textContent = parts.join(' · ');
        }
    }

    private bindPlayDates(root: HTMLElement): void {
        const started = this.qs<HTMLInputElement>(root, '[data-field="started-date"]');
        const finished = this.qs<HTMLInputElement>(root, '[data-field="finished-date"]');
        const startedTrigger = this.qs<HTMLButtonElement>(root, '[data-action="open-started-calendar"]');
        const finishedTrigger = this.qs<HTMLButtonElement>(root, '[data-action="open-finished-calendar"]');
        let startedPicker: HierarchicalDatePicker | null = null;
        let finishedPicker: HierarchicalDatePicker | null = null;

        if (started && startedTrigger) {
            startedPicker = new HierarchicalDatePicker(
                started,
                startedTrigger,
                () => this.started,
                (value) => { this.started = value; }
            );
            startedPicker.syncInput(this.started);
            this.datePickers.push(startedPicker);
        }

        if (finished && finishedTrigger) {
            finishedPicker = new HierarchicalDatePicker(
                finished,
                finishedTrigger,
                () => this.finished,
                (value) => { this.finished = value; }
            );
            finishedPicker.syncInput(this.finished);
            this.datePickers.push(finishedPicker);
        }

        this.qs<HTMLButtonElement>(root, '[data-action="today-started"]')?.addEventListener('click', () => {
            this.started = this.getTodayDateInput();
            if (startedPicker) startedPicker.syncInput(this.started);
            else if (started) this.syncDateInput(started, this.started);
        });

        this.qs<HTMLButtonElement>(root, '[data-action="today-finished"]')?.addEventListener('click', () => {
            this.finished = this.getTodayDateInput();
            if (finishedPicker) finishedPicker.syncInput(this.finished);
            else if (finished) this.syncDateInput(finished, this.finished);
        });
    }

    private bindDlc(root: HTMLElement): void {
        this.qs<HTMLButtonElement>(root, '[data-action="refresh-dlc"]')?.addEventListener('click', (event) => {
            if (!this.onRefreshDlc) {
                new Notice(t('noticeProviderDisabled'));
                return;
            }
            const button = event.currentTarget as HTMLButtonElement;
            button.disabled = true;
            void this.onRefreshDlc(this.dlc)
                .then((items) => {
                    if (!items) {
                        new Notice(t('noticeNoResults'));
                        return;
                    }
                    this.dlc = this.normalizeDlc(items);
                    this.renderDlc(root);
                })
                .finally(() => {
                    button.disabled = false;
                });
        });
    }

    private bindNotesDisclosure(root: HTMLElement): void {
        const button = this.qs<HTMLButtonElement>(root, '[data-action="toggle-notes"]');
        button?.addEventListener('click', () => {
            this.notesExpanded = !this.notesExpanded;
            this.updateNotesDisclosureUI(root);
            if (this.notesExpanded) {
                window.setTimeout(() => this.qs<HTMLTextAreaElement>(root, '[data-field="notes"]')?.focus(), 0);
            }
        });
    }

    private bindNotes(root: HTMLElement): void {
        const notes = this.qs<HTMLTextAreaElement>(root, '[data-field="notes"]');
        notes?.addEventListener('input', () => {
            if (this.notesMode === 'description') this.description = notes.value;
            else this.myNotes = notes.value;
            const indicator = this.qs<HTMLElement>(root, '[data-role="saved-text"]');
            if (indicator) indicator.textContent = t('editUnsavedChanges');
            this.autoResizeNotes(notes);
            this.updateCharCount(root);
        });

        root.querySelectorAll<HTMLButtonElement>('.lorebase-editmode-note-tab').forEach((button) => {
            button.addEventListener('click', () => {
                const mode = button.dataset.mode === 'myNotes' ? 'myNotes' : 'description';
                if (mode === this.notesMode) return;
                this.notesMode = mode;
                if (notes) {
                    notes.value = this.getCurrentNotesValue();
                    this.updateNotesPlaceholder(notes);
                    this.autoResizeNotes(notes);
                }
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
                const notes = this.qs<HTMLTextAreaElement>(root, '[data-field="notes"]');
                if (notes) {
                    notes.value = this.myNotes;
                    this.autoResizeNotes(notes);
                }
                this.updateCharCount(root);
            }
        } catch (error) {
            console.warn('[LOREBASE] Failed to load My Notes section.', error);
        }
    }

    private getCurrentNotesValue(): string {
        return this.notesMode === 'description' ? this.description : this.myNotes;
    }

    private updateNotesModeUI(root: HTMLElement): void {
        root.querySelectorAll<HTMLButtonElement>('.lorebase-editmode-note-tab').forEach((button) => {
            const mode = button.dataset.mode === 'myNotes' ? 'myNotes' : 'description';
            button.toggleClass('is-active', mode === this.notesMode);
        });
        const title = this.qs<HTMLElement>(root, '[data-role="notes-title"]');
        if (title) title.textContent = this.notesMode === 'description' ? t('editDescription') : t('editMyNotes');
        const notes = this.qs<HTMLTextAreaElement>(root, '[data-field="notes"]');
        if (notes) this.updateNotesPlaceholder(notes);
        const panel = this.qs<HTMLElement>(root, '[data-component="NotesEditor"]');
        panel?.toggleClass('is-my-notes', this.notesMode === 'myNotes');
    }

    private updateNotesPlaceholder(notes: HTMLTextAreaElement): void {
        notes.placeholder = this.notesMode === 'description'
            ? t('editDescriptionPlaceholder')
            : t('editMyNotesPlaceholder');
    }

    private autoResizeNotes(notes: HTMLTextAreaElement): void {
        notes.setCssStyles({ height: 'auto' });
        const nextHeight = Math.min(Math.max(notes.scrollHeight, 132), 320);
        notes.setCssStyles({ height: `${nextHeight}px` });
    }

    private updateNotesDisclosureUI(root: HTMLElement): void {
        const panel = this.qs<HTMLElement>(root, '[data-component="NotesEditor"]');
        panel?.toggleClass('is-collapsed', !this.notesExpanded);
        if (this.notesExpanded) {
            const notes = this.qs<HTMLTextAreaElement>(root, '[data-field="notes"]');
            if (notes) window.requestAnimationFrame(() => this.autoResizeNotes(notes));
        }
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

    private bindTags(root: HTMLElement): void {
        const input = this.qs<HTMLInputElement>(root, '[data-field="new-tag"]');
        input?.addEventListener('keydown', event => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            const normalized = this.normalizeTag(input.value);
            if (!normalized || this.tags.includes(normalized)) return;
            this.tags.push(normalized);
            this.renderTagChips(root);
            input.value = '';
        });
    }

    private bindPlanTags(root: HTMLElement): void {
        this.renderPlanTagChips(root);
    }

    private bindDates(root: HTMLElement): void {
        const file = this.getFile();
        if (file) {
            this.setText(root, '[data-role="ts-added"]', this.formatHumanDate(file.stat.ctime));
            this.setText(root, '[data-role="ts-updated"]', this.formatHumanDate(file.stat.mtime));
        }
    }

    private bindProgress(root: HTMLElement, frontmatter: Record<string, unknown> | null | undefined): void {
        const main = this.getFrontmatterValue(frontmatter, ['main', 'main_story', 'mainStory']);
        const mainPlusSides = this.getFrontmatterValue(frontmatter, [
            'main_plus_sides',
            'main_plus_extra',
            'mainPlusSides',
            'mainExtra',
        ]);
        const perfectionist = this.getFrontmatterValue(frontmatter, [
            'perfectionist',
            'completionist',
            'comp_100',
            'hundred_percent',
        ]);

        this.setProgressValue(root, '[data-role="progress-main"]', main);
        this.setProgressValue(root, '[data-role="progress-main-plus-sides"]', mainPlusSides);
        this.setProgressValue(root, '[data-role="progress-completionist"]', perfectionist);
    }

    private bindAdvanced(root: HTMLElement): void {
        this.qs<HTMLButtonElement>(root, '[data-action="browse-file"]')?.addEventListener('click', () => {
            const file = this.getFile();
            if (!file) return;
            void this.app.workspace.getLeaf(true).openFile(file);
        });

        const releaseDateInput = this.qs<HTMLInputElement>(root, '[data-field="release-date"]');
        releaseDateInput?.addEventListener('change', () => {
            this.releaseDate = this.normalizeDateInput(releaseDateInput.value);
            releaseDateInput.value = this.releaseDate;
        });

        const publisherInput = this.qs<HTMLInputElement>(root, '[data-field="publisher"]');
        publisherInput?.addEventListener('input', () => {
            this.publisher = publisherInput.value;
        });

        const developerInput = this.qs<HTMLInputElement>(root, '[data-field="developer"]');
        developerInput?.addEventListener('input', () => {
            this.developer = developerInput.value;
        });

        const platformInput = this.qs<HTMLInputElement>(root, '[data-field="new-platform"]');
        const addPlatform = (): void => {
            if (!platformInput) return;
            const values = platformInput.value.split(/[,;\n]+/);
            const next = this.normalizePlatforms([...this.platforms, ...values]);
            if (next.length === this.platforms.length) return;
            this.platforms = next;
            platformInput.value = '';
            this.renderPlatformChips(root);
        };
        platformInput?.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            addPlatform();
        });
        this.qs<HTMLButtonElement>(root, '[data-action="add-platform"]')?.addEventListener('click', addPlatform);

        const addIcon = this.qs<HTMLElement>(root, '[data-role="platform-add-icon"]');
        if (addIcon) setIcon(addIcon, 'gamepad-2');
        const addButtonIcon = this.qs<HTMLElement>(root, '[data-role="platform-add-button-icon"]');
        if (addButtonIcon) setIcon(addButtonIcon, 'plus');
    }

    private renderSeriesCombobox(root: HTMLElement): void {
        const host = this.qs<HTMLElement>(root, '[data-field="series"]');
        if (!host) return;
        host.empty();
        host.addClass('lorebase-settings-dropdown');

        const input = host.createEl('input', {
            cls: 'lorebase-editmode-input lorebase-editmode-combobox-input',
            attr: {
                type: 'text',
                placeholder: t('editSeries'),
                'aria-haspopup': 'listbox',
                'aria-expanded': 'false',
            },
        });
        input.value = this.gameSeries;

        const toggle = host.createEl('button', {
            cls: 'lorebase-editmode-combobox-toggle',
            attr: { type: 'button', 'aria-label': t('editSeries') },
        });
        setIcon(toggle, 'chevron-down');

        const panel = host.createDiv({
            cls: 'lorebase-settings-dropdown-panel lorebase-editmode-combobox-panel',
            attr: { role: 'listbox' },
        });

        const uniqueSeries = Array.from(new Set(
            this.seriesOptions
                .map((series) => series.trim())
                .filter((series) => series.length > 0)
        ));

        const close = (): void => {
            panel.removeClass('is-open');
            toggle.removeClass('is-open');
            input.setAttribute('aria-expanded', 'false');
        };

        const open = (): void => {
            panel.addClass('is-open');
            toggle.addClass('is-open');
            input.setAttribute('aria-expanded', 'true');
        };

        const selectValue = (value: string): void => {
            this.gameSeries = value.trim();
            input.value = this.gameSeries;
            close();
        };

        const renderOptions = (): void => {
            panel.empty();
            const query = input.value.trim().toLowerCase();
            const values = uniqueSeries.filter((series) => series.toLowerCase().includes(query));
            const clear = panel.createDiv({
                cls: 'lorebase-settings-dropdown-option',
                attr: {
                    role: 'option',
                    tabindex: '0',
                    'aria-selected': String(this.gameSeries.length === 0),
                },
            });
            clear.toggleClass('is-selected', this.gameSeries.length === 0);
            clear.createSpan({ cls: 'lorebase-settings-dropdown-option-label', text: t('editNoSeries') });
            if (this.gameSeries.length === 0) {
                const check = clear.createSpan({ cls: 'lorebase-settings-dropdown-option-check' });
                setIcon(check, 'check');
            }
            clear.addEventListener('click', () => selectValue(''));
            clear.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                selectValue('');
            });

            for (const value of values) {
                const option = panel.createDiv({
                    cls: 'lorebase-settings-dropdown-option',
                    attr: {
                        role: 'option',
                        tabindex: '0',
                        'aria-selected': String(value === this.gameSeries),
                    },
                });
                option.toggleClass('is-selected', value === this.gameSeries);
                option.createSpan({ cls: 'lorebase-settings-dropdown-option-label', text: value });
                if (value === this.gameSeries) {
                    const check = option.createSpan({ cls: 'lorebase-settings-dropdown-option-check' });
                    setIcon(check, 'check');
                }
                option.addEventListener('click', () => selectValue(value));
                option.addEventListener('keydown', (event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    selectValue(value);
                });
            }
        };

        input.addEventListener('input', () => {
            this.gameSeries = input.value.trim();
            renderOptions();
            open();
        });
        input.addEventListener('focus', () => {
            renderOptions();
            open();
        });
        toggle.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            renderOptions();
            if (panel.hasClass('is-open')) close();
            else open();
        });

        const onDocumentClick = (event: MouseEvent): void => {
            const ownerDocument = host.ownerDocument;
            if (!host.isConnected) {
                ownerDocument.removeEventListener('click', onDocumentClick);
                ownerDocument.removeEventListener('keydown', onKeydown);
                return;
            }
            if (!host.contains(event.target as Node)) close();
        };
        const onKeydown = (event: KeyboardEvent): void => {
            const ownerDocument = host.ownerDocument;
            if (!host.isConnected) {
                ownerDocument.removeEventListener('click', onDocumentClick);
                ownerDocument.removeEventListener('keydown', onKeydown);
                return;
            }
            if (event.key === 'Escape') close();
        };

        host.ownerDocument.addEventListener('click', onDocumentClick);
        host.ownerDocument.addEventListener('keydown', onKeydown);
        renderOptions();
    }

    private qs<T extends Element>(root: HTMLElement, selector: string): T | null {
        return root.querySelector<T>(selector);
    }

    private setText(root: HTMLElement, selector: string, value: string): void {
        const node = this.qs<HTMLElement>(root, selector);
        if (node) node.textContent = value;
    }

    private setProgressValue(root: HTMLElement, selector: string, value: string | null): void {
        const node = this.qs<HTMLElement>(root, selector);
        if (!node) return;
        const text = (value ?? '').trim();
        if (text) {
            node.textContent = this.formatProgressHours(text);
            node.removeClass('is-empty');
            return;
        }
        node.textContent = '-';
        node.addClass('is-empty');
    }

    private formatProgressHours(value: string): string {
        if (!/^\d+(?:[.,]\d+)?$/.test(value)) return value;
        const language = i18n.getLanguage();
        if (language === 'ru') return `${value} ч`;
        if (language === 'uk') return `${value} год`;
        const numeric = Number(value.replace(',', '.'));
        return `${value} ${numeric === 1 ? 'Hour' : 'Hours'}`;
    }

    private renderTagChips(root: HTMLElement): void {
        const container = this.qs<HTMLElement>(root, '[data-role="tag-chips"]');
        if (!container) return;
        container.empty();
        const planTags = new Set(this.tagPresets.map((preset) => preset.tag));

        this.tags.forEach((tag) => {
            if (planTags.has(tag)) return;
            this.createRemovableChip(container, `#${tag}`, () => {
                this.tags = this.tags.filter((entry) => entry !== tag);
                this.renderTagChips(root);
                this.renderPlanTagChips(root);
            });
        });
    }

    private renderPlanTagChips(root: HTMLElement): void {
        const container = this.qs<HTMLElement>(root, '[data-role="plan-tag-chips"]');
        if (!container) return;
        container.empty();

        for (const preset of this.tagPresets) {
            const active = this.tags.includes(preset.tag);
            const chip = container.createEl('button', {
                cls: `lorebase-editmode-chip ${active ? 'is-active' : ''}`,
                text: this.getPlanPresetLabel(preset),
                attr: { type: 'button', 'aria-pressed': String(active) }
            });
            chip.addEventListener('click', () => {
                if (this.tags.includes(preset.tag)) {
                    this.tags = this.tags.filter((entry) => entry !== preset.tag);
                } else {
                    this.tags.push(preset.tag);
                }
                this.renderPlanTagChips(root);
                this.renderTagChips(root);
            });
        }
    }

    private renderGenreChips(root: HTMLElement): void {
        const container = this.qs<HTMLElement>(root, '[data-role="genre-chips"]');
        if (!container) return;
        container.empty();

        this.genres.forEach((genre) => {
            this.createRemovableChip(container, genre, () => {
                this.genres = this.genres.filter((entry) => entry !== genre);
                this.renderGenreChips(root);
            });
        });
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

    private renderPlatformChips(root: HTMLElement): void {
        const container = this.qs<HTMLElement>(root, '[data-role="platform-chips"]');
        if (!container) return;
        container.empty();

        if (!this.platforms.length) {
            container.createSpan({
                cls: 'lorebase-editmode-platform-empty',
                text: t('editNoPlatforms'),
            });
            return;
        }

        for (const platform of this.platforms) {
            const family = this.getPlatformFamily(platform);
            const chip = container.createEl('button', {
                cls: 'lorebase-editmode-platform-chip',
                attr: {
                    type: 'button',
                    title: t('editRemoveHint'),
                    'data-platform-family': family,
                    'aria-label': `${platform}: ${t('editRemoveHint')}`,
                },
            });
            const icon = chip.createSpan({ cls: 'lorebase-editmode-platform-chip-icon', attr: { 'aria-hidden': 'true' } });
            setIcon(icon, this.getPlatformIcon(family));
            chip.createSpan({ cls: 'lorebase-editmode-platform-chip-label', text: platform });
            const remove = chip.createSpan({ cls: 'lorebase-editmode-platform-chip-remove', attr: { 'aria-hidden': 'true' } });
            setIcon(remove, 'x');
            chip.addEventListener('click', () => {
                this.platforms = this.platforms.filter((entry) => entry !== platform);
                this.renderPlatformChips(root);
            });
        }
    }

    private getPlatformFamily(platform: string): string {
        const value = platform.toLocaleLowerCase();
        if (/playstation|\bps\s*[1-5]\b|\bpsp\b|vita/.test(value)) return 'playstation';
        if (/xbox/.test(value)) return 'xbox';
        if (/nintendo|switch|\bwii\b|gamecube|\b3ds\b|\bds\b/.test(value)) return 'nintendo';
        if (/android|\bios\b|iphone|ipad|mobile/.test(value)) return 'mobile';
        if (/mac|apple/.test(value)) return 'mac';
        if (/linux|steam\s*deck/.test(value)) return 'linux';
        if (/windows|\bpc\b/.test(value)) return 'pc';
        return 'other';
    }

    private getPlatformIcon(family: string): string {
        if (family === 'mobile') return 'smartphone';
        if (family === 'mac') return 'laptop';
        if (family === 'linux') return 'terminal';
        if (family === 'pc') return 'monitor';
        return 'gamepad-2';
    }

    private renderDlc(root: HTMLElement): void {
        const container = this.qs<HTMLElement>(root, '[data-role="dlc-list"]');
        if (!container) return;
        container.empty();

        if (!this.dlc.length) {
            container.createDiv({ cls: 'lorebase-editmode-related-empty', text: t('editNoDlc') });
            this.renderDlcToggle(root, 0);
            return;
        }

        const visibleCount = this.dlcExpanded ? this.dlc.length : Math.min(this.dlc.length, this.getDlcCollapsedCount(container));
        for (const item of this.dlc.slice(0, visibleCount)) {
            const row = container.createDiv({
                cls: 'lorebase-editmode-related-item lorebase-editmode-dlc-item',
                attr: { title: item.url || item.title },
            });
            const image = row.createDiv({
                cls: `lorebase-editmode-related-image lorebase-editmode-dlc-image ${item.provider === 'igdb' ? 'is-poster' : 'is-wide'}`,
            });
            const imageUrl = item.imageUrl || DEFAULT_COVER;
            image.setCssStyles({
                backgroundImage: `url("${imageUrl.replace(/"/g, '\\"')}")`,
            });
            image.createSpan({ cls: 'lorebase-editmode-related-type', text: t('editDlc') });

            const title = row.createSpan({ cls: 'lorebase-editmode-related-title', text: item.title });
            title.addEventListener('click', () => {
                if (item.url) window.open(item.url, '_blank', 'noopener');
            });

            const rating = row.createDiv({ cls: 'lorebase-editmode-dlc-rating', attr: { 'aria-label': t('editPersonalRating') } });
            for (const value of getRatingValues()) {
                const star = rating.createEl('button', {
                    cls: 'lorebase-editmode-dlc-star',
                    text: String.fromCharCode(9733),
                    attr: { type: 'button', 'aria-label': `${t('editRating')} ${value}` },
                });
                star.toggleClass('is-active', item.userRating !== null && item.userRating !== undefined && value <= item.userRating);
                star.addEventListener('click', (event) => {
                    event.stopPropagation();
                    item.userRating = item.userRating === value ? null : value;
                    this.renderDlc(root);
                });
            }

            const remove = row.createEl('button', {
                cls: 'lorebase-editmode-related-remove',
                text: String.fromCharCode(215),
                attr: { type: 'button', 'aria-label': t('editRemoveHint') },
            });
            remove.addEventListener('click', (event) => {
                event.stopPropagation();
                this.dlc = this.dlc.filter((entry) => entry.id !== item.id);
                this.renderDlc(root);
            });
        }

        this.renderDlcToggle(root, this.dlc.length - visibleCount);
    }

    private renderDlcToggle(root: HTMLElement, hiddenCount: number): void {
        const container = this.qs<HTMLElement>(root, '[data-role="dlc-toggle"]');
        if (!container) return;
        container.empty();
        if (this.dlc.length <= this.getDlcCollapsedCount(this.qs<HTMLElement>(root, '[data-role="dlc-list"]'))) return;

        const button = container.createEl('button', {
            cls: 'lorebase-editmode-dlc-toggle',
            attr: { type: 'button', 'aria-expanded': String(this.dlcExpanded) },
        });
        button.createSpan({
            cls: 'lorebase-editmode-dlc-toggle-label',
            text: this.dlcExpanded ? t('editCollapseDlc') : `+ ${Math.max(0, hiddenCount)} DLC`,
        });
        button.createSpan({
            cls: 'lorebase-editmode-dlc-toggle-icon',
            text: this.dlcExpanded ? String.fromCharCode(9650) : String.fromCharCode(9660),
        });
        button.addEventListener('click', () => {
            this.dlcExpanded = !this.dlcExpanded;
            this.renderDlc(root);
        });
    }

    private getDlcCollapsedCount(container: HTMLElement | null): number {
        if (!container) return 4;
        const columns = getComputedStyle(container).gridTemplateColumns
            .split(' ')
            .filter((column) => column.trim().length > 0).length;
        if (columns > 0 && getComputedStyle(container).gridTemplateColumns !== 'none') return columns;
        return 4;
    }

    private createRemovableChip(container: HTMLElement, label: string, onRemove: () => void): void {
        const chip = container.createEl('button', {
            cls: 'lorebase-editmode-chip',
            text: label,
            attr: { type: 'button', title: t('editRemoveHint') }
        });
        chip.addEventListener('click', onRemove);
    }

    private getPlanPresetLabel(preset: TagPreset): string {
        const labels: Record<string, string> = {
            'check-later': t('planCheckLater'),
            'play-soon': t('planPlaySoon'),
            'wait-early-access': t('planWaitEarlyAccess'),
            'next-playthrough': t('planNextInQueue'),
        };
        const defaultPreset = DEFAULT_GAME_TAG_PRESETS.find((entry) => entry.id === preset.id);
        return defaultPreset && preset.label === defaultPreset.label
            ? labels[preset.id] ?? preset.label
            : preset.label;
    }

    private updateQuickSettingSwitches(root: HTMLElement): void {
        this.updateSwitch(root, 'favorite', this.favorite);
        this.updateSwitch(root, 'wishlist', this.selectedStatus === 'wishlist');
        this.updateSwitch(root, 'adult', this.isAdult);
    }

    private updateSwitch(root: HTMLElement, key: string, value: boolean): void {
        const node = this.qs<HTMLButtonElement>(root, `[data-toggle="${key}"]`);
        if (!node) return;
        node.setAttr('aria-pressed', String(value));
        node.toggleClass('is-active', value);
    }

    private updateStatusUI(root: HTMLElement): void {
        const locked = this.selectedStatus === 'wishlist';
        root.querySelectorAll<HTMLButtonElement>('.lorebase-editmode-segment').forEach(btn => {
            const selected = btn.dataset.status === this.selectedStatus;
            btn.toggleClass('is-active', selected);
            btn.setAttr('aria-pressed', String(selected));
            btn.disabled = locked;
            btn.setAttr('aria-disabled', String(locked));
        });
        const shell = this.qs<HTMLElement>(root, '.lorebase-editmode-status-shell');
        shell?.toggleClass('is-wishlist-locked', locked);
        const note = this.qs<HTMLElement>(root, '[data-role="status-lock-note"]');
        if (note) note.hidden = !locked;
    }

    private updateRatingUI(root: HTMLElement): void {
        root.querySelectorAll<HTMLButtonElement>('.lorebase-editmode-star').forEach(btn => {
            const value = Number(btn.dataset.rating ?? '0');
            const selected = this.selectedRating !== null && value <= this.selectedRating;
            btn.toggleClass('is-active', selected);
        });

        const ratingValue = this.qs<HTMLElement>(root, '[data-role="rating-value"]');
        const ratingLine = this.qs<HTMLElement>(root, '[data-role="rating-line"]');

        const scale = getRatingScale();
        const numeric = this.selectedRating ?? 0;
        const pct = Math.min(100, Math.round((numeric / scale) * 100));
        if (ratingValue) ratingValue.textContent = `${numeric.toFixed(1)} / ${scale.toFixed(1)}`;
        if (ratingLine) ratingLine.style.width = `${pct}%`;
    }

    private updateCharCount(root: HTMLElement): void {
        const count = this.qs<HTMLElement>(root, '[data-role="char-count"]');
        if (count) count.textContent = `${this.getCurrentNotesValue().length} ${t('editCharsShort')}`;
    }

    private getFrontmatterValue(frontmatter: Record<string, unknown> | null | undefined, keys: string[]): string | null {
        if (!frontmatter) return null;
        for (const key of keys) {
            const value = frontmatter[key];
            if (value === undefined || value === null) continue;
            const normalized = Array.isArray(value)
                ? value.map(item => String(item).trim()).filter(Boolean).join(', ')
                : String(value).trim();
            if (normalized.length > 0) return normalized;
        }
        return null;
    }

    private normalizeTag(value: string): string | null {
        const cleaned = normalizeObsidianTag(value);
        return cleaned || null;
    }

    private normalizeTags(values: string[]): string[] {
        const unique = new Set<string>();
        values.forEach((value) => {
            const normalized = this.normalizeTag(value);
            if (normalized) unique.add(normalized);
        });
        return Array.from(unique.values());
    }

    private normalizeGenre(value: string): string | null {
        const cleaned = value.trim().toLowerCase();
        return cleaned || null;
    }

    private normalizeGenres(values: string[]): string[] {
        const unique = new Set<string>();
        values.forEach((value) => {
            const normalized = this.normalizeGenre(value);
            if (normalized) unique.add(normalized);
        });
        return Array.from(unique.values());
    }

    private normalizePlatforms(values: string[]): string[] {
        const unique = new Map<string, string>();
        values.forEach((value) => {
            const normalized = String(value ?? '').trim().replace(/\s+/g, ' ');
            const key = normalized.toLocaleLowerCase();
            if (normalized && !unique.has(key)) unique.set(key, normalized);
        });
        return Array.from(unique.values());
    }

    private normalizeDlc(values: GameDlc[]): GameDlc[] {
        const byId = new Map<string, GameDlc>();
        for (const item of values) {
            const id = String(item.id ?? '').trim();
            const title = String(item.title ?? '').trim();
            if (!id || !title || byId.has(id)) continue;
            byId.set(id, {
                id,
                provider: item.provider === 'igdb' ? 'igdb' : 'steam',
                title,
                imageUrl: item.imageUrl ?? null,
                url: item.url ?? null,
                userRating: item.userRating ?? null,
                owned: item.owned,
            });
        }
        return Array.from(byId.values());
    }

    private formatDateForInput(value: number | null): string {
        if (!value || !Number.isFinite(value)) return '';
        const date = new Date(value);
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    private normalizeDateInput(value: string | null | undefined): string {
        if (!value) return '';
        const trimmed = value.trim();
        if (!trimmed) return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
        const parsed = Date.parse(trimmed);
        return Number.isNaN(parsed) ? '' : this.formatDateForInput(parsed);
    }

    private syncDateInput(input: HTMLInputElement, value: string): void {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
        const isDayFirst = i18n.getLanguage() === 'ru' || i18n.getLanguage() === 'uk';
        input.placeholder = isDayFirst ? 'дд.мм.гггг' : 'mm/dd/yyyy';
        input.value = match
            ? isDayFirst
                ? `${match[3]}.${match[2]}.${match[1]}`
                : `${match[2]}/${match[3]}/${match[1]}`
            : '';
        input.toggleClass('is-empty', !match);
    }

    private formatHumanDate(timestamp: number): string {
        if (!Number.isFinite(timestamp)) return t('editUnknown');
        const locale = i18n.getLanguage() === 'ru' ? 'ru-RU' : 'en-US';
        return new Intl.DateTimeFormat(locale, {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
        }).format(new Date(timestamp));
    }

    private getTodayTimestamp(): number {
        const now = new Date();
        return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    }

    private getTodayDateInput(): string {
        return this.formatDateForInput(this.getTodayTimestamp());
    }

    async saveBeforeSourceRefresh(): Promise<boolean> {
        return this.save();
    }

    private async save(): Promise<boolean> {
        if (!validateDatePickers(this.datePickers)) return false;
        const updates: Partial<GameItem> = {
            userRating: this.selectedRating,
            status: this.selectedStatus,
            favorite: this.favorite,
            displayName: this.title || this.game.displayName,
            year: this.year,
            description: this.description,
            gameSeries: this.gameSeries,
            tags: this.tags,
            genres: this.genres,
            platforms: this.platforms,
            isAdult: this.isAdult,
            releaseDate: this.releaseDate || null,
            started: this.started || null,
            finished: this.finished || null,
            publisher: this.publisher.trim(),
            developer: this.developer.trim(),
            dlc: this.dlc,
            relatedMedia: this.relatedMediaEditor.getValue(),
            myNotes: this.myNotes,
        };

        if (this.selectedStatus === 'completed') {
            updates.finished = updates.finished || this.getTodayDateInput();
        }

        await this.onSave(updates);
        this.close();
        return true;
    }

    private getFile(): TFile | null {
        const file = this.app.vault.getAbstractFileByPath(this.game.filePath);
        return file instanceof TFile ? file : null;
    }
}
