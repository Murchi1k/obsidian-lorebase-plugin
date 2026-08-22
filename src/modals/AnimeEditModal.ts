/**
 * LOREBASE - Anime Edit Modal
 * Cinematic edit mode for anime tracking.
 */

import { App, Menu, Modal, setIcon, TFile } from 'obsidian';
import { AnimeFormat, AnimeItem, AnimePart, AnimeStatus, RelatedMediaLink, UserRating } from '../types';
import { DEFAULT_COVER, STATUS_CONFIG } from '../constants';
import { i18n, t } from '../localization';
import { getRatingScale, getRatingValues } from '../utils/ratingScale';
import { createLorebaseDropdown, LorebaseDropdownHandle } from '../components/LorebaseDropdown';
import { GenreEditModal } from './GenreEditModal';
import { CommunityRatingRefresh, renderCommunityRatingPanel } from './CommunityRatingPanel';
import { MediaSourceAction, renderMediaSourcePanel } from './MediaSourcePanel';
import { setupMobileEditor } from './mobileEditor';
import { extractMarkdownSection } from '../services/markdownSections';
import { HierarchicalDatePicker, validateDatePickers } from './HierarchicalDatePicker';

type PartDraft = AnimePart;
type AnimePartsRefreshResult = {
    parts: AnimePart[];
    activePartId: string | null;
    status: AnimeStatus;
};

type RelatedCandidate = RelatedMediaLink;
type NotesMode = 'description' | 'myNotes';

export class AnimeEditModal extends Modal {
    private anime: AnimeItem;
    private onSave: (updates: Partial<AnimeItem>) => Promise<void>;
    private onDelete?: () => void;
    private onRefreshParts?: () => Promise<AnimePartsRefreshResult | boolean | void>;
    private onRefreshCommunityRating?: CommunityRatingRefresh;

    private selectedRating: UserRating;
    private selectedStatus: AnimeStatus;
    private favorite: boolean;
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
    private relatedMedia: RelatedMediaLink[];
    private relatedCandidates: RelatedCandidate[];
    private draggedRelatedPath: string | null = null;
    private formatDropdown?: LorebaseDropdownHandle<AnimeFormat>;
    private partKindDropdown?: LorebaseDropdownHandle<AnimeFormat>;
    private startedDatePicker?: HierarchicalDatePicker;
    private finishedDatePicker?: HierarchicalDatePicker;

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
        onRefreshParts?: () => Promise<AnimePartsRefreshResult | boolean | void>,
        onRefreshCommunityRating?: CommunityRatingRefresh,
        relatedCandidates: RelatedCandidate[] = [],
        private readonly onRefreshSource?: MediaSourceAction,
        private readonly onChangeSource?: MediaSourceAction
    ) {
        super(app);
        this.anime = anime;
        this.onSave = onSave;
        this.onDelete = onDelete;
        this.onRefreshParts = onRefreshParts;
        this.onRefreshCommunityRating = onRefreshCommunityRating;

        this.selectedRating = anime.userRating;
        this.selectedStatus = anime.status;
        this.favorite = anime.favorite;
        this.title = anime.displayName;
        this.year = anime.year;
        this.summary = anime.summary ?? anime.description ?? '';
        this.started = this.normalizeDateInput(anime.started);
        this.finished = this.normalizeDateInput(anime.finished) || this.formatDateForInput(anime.dateWatched);
        this.format = anime.format ?? 'tv';
        this.genres = this.normalizeGenres(anime.genres ?? []);
        this.studios = this.normalizeDisplayList(anime.studios ?? []);
        this.tags = this.normalizeTags(anime.tags ?? []);
        this.parts = this.normalizeParts(anime.parts);
        this.relatedMedia = this.normalizeRelatedMedia(anime.relatedMedia ?? []);
        this.relatedCandidates = relatedCandidates.filter((candidate) => candidate.path !== anime.filePath);
        this.activePartId = this.parts.some((part) => part.id === anime.activePartId)
            ? anime.activePartId ?? this.parts[0]?.id ?? null
            : this.parts[0]?.id ?? null;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('lorebase-edit-modal', 'lorebase-modal-root');
        this.modalEl.addClass('lorebase-edit-modal-container');
        this.modalEl.addClass('lorebase-editmode-modal-shell');
        this.modalEl.addEventListener('keydown', this.onKeydown);

        const root = contentEl.createDiv({ cls: 'lorebase-editmode-root lorebase-editmode-anime-root lorebase-modal-panel' });
        root.appendChild(this.createTemplateFragment(this.buildTemplate()));
        this.bindStaticContent(root);
        this.bindHeader(root);
        this.bindQuickSettings(root);
        this.bindStatus(root);
        this.bindRating(root);
        this.bindFields(root);
        this.bindParts(root);
        this.bindNotesDisclosure(root);
        this.bindPlayDates(root);
        this.bindNotes(root);
        void this.loadMyNotes(root);
        this.bindTags(root);
        this.bindRelatedMedia(root);
        this.bindDates(root);
        if (this.onRefreshCommunityRating) {
            renderCommunityRatingPanel(root, this.anime, this.onRefreshCommunityRating);
        }
        renderMediaSourcePanel(root, this.anime, this.onRefreshSource, this.onChangeSource);
        setupMobileEditor(root, () => void this.save());
    }

    onClose(): void {
        this.startedDatePicker?.destroy();
        this.finishedDatePicker?.destroy();
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
        return `
            <div class="lorebase-editmode-view">
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

                        <section class="lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-anime-parts">
                            <div class="lorebase-editmode-panel-title-row">
                                <h3 class="lorebase-editmode-panel-title">${t('editAnimeParts')}</h3>
                                <button type="button" class="lorebase-editmode-anime-parts-icon-action" data-action="refresh-parts" aria-label="${t('animePartsCheck')}"></button>
                            </div>
                            <div class="lorebase-editmode-anime-parts-navigation">
                                <div class="lorebase-editmode-chip-row lorebase-editmode-part-strip" data-role="part-strip"></div>
                                <div class="lorebase-editmode-anime-part-inline-actions">
                                    <button type="button" class="lorebase-editmode-anime-parts-icon-action" data-action="add-part" aria-label="${t('editAddPart')}"></button>
                                    <button type="button" class="lorebase-editmode-anime-parts-icon-action is-danger" data-action="remove-part" aria-label="${t('editRemovePart')}"></button>
                                </div>
                            </div>
                            <div class="lorebase-editmode-anime-part-summary">
                                <div class="lorebase-editmode-anime-part-stat">
                                    <span class="lorebase-editmode-anime-part-stat-label">${t('editTotalEpisodes')}</span>
                                    <strong class="lorebase-editmode-anime-part-stat-value" data-role="progress-total">-</strong>
                                </div>
                                <div class="lorebase-editmode-anime-part-stat">
                                    <span class="lorebase-editmode-anime-part-stat-label">${t('editActivePart')}</span>
                                    <strong class="lorebase-editmode-anime-part-stat-value" data-role="active-part-name">-</strong>
                                </div>
                            </div>
                            <div class="lorebase-editmode-anime-part-editor" data-role="part-editor">
                                <div class="lorebase-editmode-anime-part-identity-row">
                                    <label class="lorebase-editmode-field lorebase-editmode-anime-part-title-field">
                                        <span class="lorebase-editmode-field-label">${t('templateFieldName')}</span>
                                        <input class="lorebase-editmode-input" data-field="part-title" type="text" />
                                    </label>
                                    <div class="lorebase-editmode-anime-part-meta-rail">
                                        <label class="lorebase-editmode-field lorebase-editmode-anime-part-meta-field lorebase-editmode-anime-part-format-field">
                                            <span class="lorebase-editmode-field-label">${t('editFormat')}</span>
                                            <div class="lorebase-editmode-dropdown" data-field="part-kind"></div>
                                        </label>
                                        <label class="lorebase-editmode-field lorebase-editmode-anime-part-meta-field lorebase-editmode-anime-part-season-field">
                                            <span class="lorebase-editmode-field-label">${t('editSeasonCurrent')}</span>
                                            <input class="lorebase-editmode-input" data-field="part-season" type="number" inputmode="numeric" />
                                        </label>
                                        <div class="lorebase-editmode-field lorebase-editmode-anime-part-meta-field lorebase-editmode-anime-episodes-field">
                                            <span class="lorebase-editmode-field-label">${t('editEpisodes')}</span>
                                            <div class="lorebase-editmode-anime-episode-stepper">
                                                <button type="button" class="lorebase-editmode-anime-stepper-button" data-action="episode-dec" aria-label="${t('editEpisodeCurrent')}">−</button>
                                                <input class="lorebase-editmode-input lorebase-editmode-anime-stepper-input" data-field="part-episode-current" type="number" inputmode="numeric" aria-label="${t('editEpisodeCurrent')}" />
                                                <span class="lorebase-editmode-anime-slash">/</span>
                                                <input class="lorebase-editmode-input lorebase-editmode-anime-stepper-input" data-field="part-episode-total" type="number" inputmode="numeric" aria-label="${t('editEpisodeTotal')}" />
                                                <button type="button" class="lorebase-editmode-anime-stepper-button" data-action="episode-inc" aria-label="${t('editEpisodeInc')}">+</button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="lorebase-editmode-anime-part-tracking-row">
                                    <div class="lorebase-editmode-anime-part-status-field">
                                        <span class="lorebase-editmode-field-label">${t('editStatus')}</span>
                                        <div class="lorebase-editmode-segmented lorebase-editmode-part-status" data-role="part-status-segments"></div>
                                    </div>
                                </div>
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
                            <div class="lorebase-editmode-advanced-grid">
                                <label class="lorebase-editmode-field">
                                    <span class="lorebase-editmode-field-label">${t('templateFieldStudios')}</span>
                                    <input class="lorebase-editmode-input" data-field="studios" type="text" placeholder="Studio A, Studio B" />
                                </label>
                                <div class="lorebase-editmode-path-row">
                                    <span class="lorebase-editmode-field-label">${t('editLocalPath')}</span>
                                    <code class="lorebase-editmode-local-path" data-role="local-path"></code>
                                    <button type="button" class="lorebase-editmode-btn lorebase-editmode-btn-ghost lorebase-editmode-btn-tight" data-action="browse-file">${t('editOpen')}</button>
                                </div>
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

    private bindStaticContent(root: HTMLElement): void {
        this.setText(root, '[data-role="breadcrumb"]', `${t('editBreadcrumbAnime')} / ${this.anime.displayName}`);
        const poster = this.qs<HTMLImageElement>(root, '[data-role="poster"]');
        if (poster) {
            poster.src = this.anime.imageUrl;
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
        this.renderGenreChips(root);
        this.renderTagChips(root);
        this.renderRelatedMedia(root);
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
        root.querySelectorAll<HTMLButtonElement>('.lorebase-editmode-switch').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.dataset.toggle === 'favorite') {
                    this.favorite = !this.favorite;
                    this.updateQuickSettingSwitches(root);
                }
            });
        });
    }

    private bindStatus(root: HTMLElement): void {
        root.querySelectorAll<HTMLButtonElement>('[data-role="status-segments"] .lorebase-editmode-segment').forEach(btn => {
            btn.addEventListener('click', () => {
                const status = btn.dataset.status as AnimeStatus | undefined;
                if (!status) return;
                this.selectedStatus = status;
                if (status === 'completed' && !this.finished) {
                    this.finished = this.getTodayDateInput();
                    this.finishedDatePicker?.syncInput(this.finished);
                }
                this.updateStatusUI(root);
            });
        });
    }

    private bindRating(root: HTMLElement): void {
        root.querySelectorAll<HTMLButtonElement>('.lorebase-editmode-star').forEach(btn => {
            btn.addEventListener('click', () => {
                this.selectedRating = Number(btn.dataset.rating) as UserRating;
                this.updateRatingUI(root);
            });
        });
        this.qs<HTMLButtonElement>(root, '[data-action="clear-rating"]')?.addEventListener('click', () => {
            this.selectedRating = null;
            this.updateRatingUI(root);
        });
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
        const refreshButton = this.qs<HTMLButtonElement>(root, '[data-action="refresh-parts"]');
        const addButton = this.qs<HTMLButtonElement>(root, '[data-action="add-part"]');
        const removeButton = this.qs<HTMLButtonElement>(root, '[data-action="remove-part"]');
        if (refreshButton) setIcon(refreshButton, 'refresh-cw');
        if (addButton) setIcon(addButton, 'plus');
        if (removeButton) setIcon(removeButton, 'trash-2');

        if (refreshButton) {
            refreshButton.disabled = !this.onRefreshParts;
            refreshButton.toggleClass('is-disabled', !this.onRefreshParts);
            refreshButton.addEventListener('click', () => {
                if (!this.onRefreshParts) return;
                void (async (): Promise<void> => {
                    refreshButton.disabled = true;
                    refreshButton.addClass('is-loading');
                    try {
                        const result = await this.onRefreshParts?.();
                        if (!result || typeof result === 'boolean') return;
                        this.applyRefreshedParts(root, result);
                    } finally {
                        refreshButton.disabled = !this.onRefreshParts;
                        refreshButton.removeClass('is-loading');
                    }
                })();
            });
        }

        this.qs<HTMLButtonElement>(root, '[data-action="add-part"]')?.addEventListener('click', () => {
            const nextIndex = this.parts.length + 1;
            const part: PartDraft = {
                id: this.createPartId('tv'),
                kind: 'tv',
                title: `Season ${nextIndex}`,
                seasonNumber: nextIndex,
                episodeCurrent: 0,
                episodeTotal: null,
                status: 'planned',
            };
            this.parts.push(part);
            this.activePartId = part.id;
            this.renderPartStrip(root);
            this.renderActivePartEditor(root);
            this.updateProgressSummary(root);
            this.updatePartActions(root);
        });

        this.qs<HTMLButtonElement>(root, '[data-action="remove-part"]')?.addEventListener('click', () => {
            if (this.parts.length <= 1) return;
            const activePart = this.getActivePart();
            if (!activePart) return;
            const activeIndex = this.parts.findIndex((part) => part.id === activePart.id);
            this.parts = this.parts.filter((part) => part.id !== activePart.id);
            const nextPart = this.parts[Math.min(Math.max(activeIndex, 0), this.parts.length - 1)] ?? this.parts[0] ?? null;
            this.activePartId = nextPart?.id ?? null;
            this.renderPartStrip(root);
            this.renderActivePartEditor(root);
            this.updateProgressSummary(root);
            this.updatePartActions(root);
        });

        this.qs<HTMLButtonElement>(root, '[data-action="episode-dec"]')?.addEventListener('click', () => {
            const part = this.getActivePart();
            if (!part) return;
            part.episodeCurrent = Math.max(0, (part.episodeCurrent ?? 0) - 1);
            this.renderActivePartEditor(root);
            this.renderPartStrip(root);
            this.updateProgressSummary(root);
        });

        this.qs<HTMLButtonElement>(root, '[data-action="episode-inc"]')?.addEventListener('click', () => {
            const part = this.getActivePart();
            if (!part) return;
            part.episodeCurrent = (part.episodeCurrent ?? 0) + 1;
            if (part.status === 'planned') part.status = 'watching';
            if (part.episodeTotal && part.episodeCurrent >= part.episodeTotal) part.status = 'completed';
            if (this.selectedStatus === 'planned') this.selectedStatus = 'watching';
            this.renderActivePartEditor(root);
            this.renderPartStrip(root);
            this.updateStatusUI(root);
            this.updateProgressSummary(root);
        });

        const bindPartField = (selector: string, handler: (part: PartDraft, input: HTMLInputElement) => void): void => {
            const input = this.qs<HTMLInputElement>(root, selector);
            input?.addEventListener('input', () => {
                const part = this.getActivePart();
                if (!part) return;
                handler(part, input);
                this.renderPartStrip(root);
                this.updateProgressSummary(root);
            });
            input?.addEventListener('change', () => {
                const part = this.getActivePart();
                if (!part) return;
                handler(part, input);
                this.renderPartStrip(root);
                this.updateProgressSummary(root);
            });
        };

        bindPartField('[data-field="part-title"]', (part, input) => {
            part.title = input.value.trim();
        });
        bindPartField('[data-field="part-season"]', (part, input) => {
            part.seasonNumber = this.parseNumberInput(input.value);
        });
        bindPartField('[data-field="part-episode-current"]', (part, input) => {
            part.episodeCurrent = this.parseNumberInput(input.value);
        });
        bindPartField('[data-field="part-episode-total"]', (part, input) => {
            part.episodeTotal = this.parseNumberInput(input.value);
        });
    }

    private applyRefreshedParts(root: HTMLElement, result: AnimePartsRefreshResult): void {
        this.parts = result.parts.map((part) => ({ ...part }));
        this.activePartId = result.activePartId && this.parts.some((part) => part.id === result.activePartId)
            ? result.activePartId
            : this.parts[0]?.id ?? null;
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
                window.setTimeout(() => this.qs<HTMLTextAreaElement>(root, '[data-field="summary"]')?.focus(), 0);
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
        for (const option of this.getAnimeStatusOptions()) {
            container.appendChild(this.createStatusSegment(option.status, option.label));
        }
    }

    private renderPartStatusSegments(root: HTMLElement): void {
        const container = this.qs<HTMLElement>(root, '[data-role="part-status-segments"]');
        if (!container) return;
        container.empty();
        for (const option of this.getAnimeStatusOptions().filter((entry) => entry.status !== 'dropped' && entry.status !== 'paused')) {
            const button = this.createStatusSegment(option.status, option.label);
            button.addEventListener('click', () => {
                const part = this.getActivePart();
                if (!part) return;
                part.status = option.status;
                this.renderPartStatusSegments(root);
                this.renderPartStrip(root);
                this.updateProgressSummary(root);
            });
            container.appendChild(button);
        }
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
    }

    private renderStars(root: HTMLElement): void {
        const stars = this.qs<HTMLElement>(root, '[data-role="stars"]');
        if (!stars) return;
        stars.empty();
        for (const value of getRatingValues()) {
            const button = stars.createEl('button', {
                cls: 'lorebase-editmode-star',
                text: String.fromCharCode(9733),
                attr: { type: 'button', 'data-rating': String(value), 'aria-label': `${t('editRating')} ${value}` },
            });
            button.dataset.rating = String(value);
        }
    }

    private renderPartStrip(root: HTMLElement): void {
        const container = this.qs<HTMLElement>(root, '[data-role="part-strip"]');
        if (!container) return;
        container.empty();
        for (const part of this.parts) {
            const active = part.id === this.activePartId;
            const chip = container.createEl('button', {
                cls: `lorebase-editmode-chip lorebase-editmode-part-chip ${active ? 'is-active' : ''}`,
                text: this.getPartChipLabel(part),
                attr: { type: 'button', 'aria-pressed': String(active), 'data-status': part.status },
            });
            chip.addEventListener('click', () => {
                this.activePartId = part.id;
                this.renderPartStrip(root);
                this.renderActivePartEditor(root);
                this.updateProgressSummary(root);
            });
        }
    }

    private renderActivePartEditor(root: HTMLElement): void {
        const part = this.getActivePart();
        if (!part) return;
        this.partKindDropdown?.setValue(part.kind);
        this.setInput(root, '[data-field="part-title"]', part.title);
        this.setInput(root, '[data-field="part-season"]', part.seasonNumber);
        this.setInput(root, '[data-field="part-episode-current"]', part.episodeCurrent);
        this.setInput(root, '[data-field="part-episode-total"]', part.episodeTotal);
        this.updatePartStatusUI(root);
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
        icon.appendChild(this.createSvgIcon(STATUS_CONFIG[status].pathD));
        button.createSpan({ cls: 'lorebase-editmode-segment-label', text: label });
        return button;
    }

    private createSvgIcon(pathD: string): SVGElement {
        const svg = createSvg('svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        const path = svg.createSvg('path');
        path.setAttribute('d', pathD);
        svg.appendChild(path);
        return svg;
    }

    private updateQuickSettingSwitches(root: HTMLElement): void {
        const favorite = this.qs<HTMLButtonElement>(root, '[data-toggle="favorite"]');
        if (!favorite) return;
        favorite.setAttr('aria-pressed', String(this.favorite));
        favorite.toggleClass('is-active', this.favorite);
    }

    private updateStatusUI(root: HTMLElement): void {
        root.querySelectorAll<HTMLButtonElement>('[data-role="status-segments"] .lorebase-editmode-segment').forEach(btn => {
            const active = btn.dataset.status === this.selectedStatus;
            btn.toggleClass('is-active', active);
            btn.setAttr('aria-pressed', String(active));
        });
    }

    private updatePartStatusUI(root: HTMLElement): void {
        const part = this.getActivePart();
        root.querySelectorAll<HTMLButtonElement>('[data-role="part-status-segments"] .lorebase-editmode-segment').forEach(btn => {
            const active = btn.dataset.status === part?.status;
            btn.toggleClass('is-active', active);
            btn.setAttr('aria-pressed', String(active));
        });
    }

    private updateRatingUI(root: HTMLElement): void {
        root.querySelectorAll<HTMLButtonElement>('.lorebase-editmode-star').forEach(btn => {
            const value = Number(btn.dataset.rating ?? '0');
            btn.toggleClass('is-active', this.selectedRating !== null && value <= this.selectedRating);
        });
        const scale = getRatingScale();
        const numeric = this.selectedRating ?? 0;
        this.setText(root, '[data-role="rating-value"]', `${numeric.toFixed(1)} / ${scale.toFixed(1)}`);
        const line = this.qs<HTMLElement>(root, '[data-role="rating-line"]');
        if (line) line.style.width = `${Math.min(100, Math.round((numeric / scale) * 100))}%`;
    }

    private updateProgressSummary(root: HTMLElement): void {
        const current = this.parts.reduce((sum, part) => sum + (part.episodeCurrent ?? 0), 0);
        const total = this.parts.reduce((sum, part) => sum + (part.episodeTotal ?? 0), 0);
        this.setText(root, '[data-role="progress-total"]', total > 0 ? `${current} / ${total}` : `${current}`);
        const activePart = this.getActivePart();
        this.setText(root, '[data-role="active-part-name"]', activePart ? this.getPartDisplayName(activePart) : '-');
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

    private renderFormatDropdowns(root: HTMLElement): void {
        const formatHost = this.qs<HTMLElement>(root, '[data-field="format"]');
        if (formatHost) {
            this.formatDropdown = createLorebaseDropdown(
                formatHost,
                this.getFormatOptions(),
                this.format,
                (value) => {
                    this.format = value;
                }
            );
        }

        const partKindHost = this.qs<HTMLElement>(root, '[data-field="part-kind"]');
        if (partKindHost) {
            this.partKindDropdown = createLorebaseDropdown(
                partKindHost,
                this.getFormatOptions(),
                this.getActivePart()?.kind ?? 'tv',
                (value) => {
                    const part = this.getActivePart();
                    if (!part) return;
                    part.kind = value;
                    this.renderPartStrip(root);
                    this.updateProgressSummary(root);
                }
            );
        }
    }

    private getActivePart(): PartDraft | null {
        if (!this.parts.length) return null;
        return this.parts.find((part) => part.id === this.activePartId) ?? this.parts[0] ?? null;
    }

    private normalizeParts(parts: AnimeItem['parts']): PartDraft[] {
        const normalized = parts?.length
            ? parts.map((part) => ({ ...part }))
            : [{
                id: 'legacy-main',
                kind: this.format,
                title: this.format === 'tv' && this.anime.seasonCurrent ? `Season ${this.anime.seasonCurrent}` : this.getFormatLabel(this.format),
                seasonNumber: this.anime.seasonCurrent ?? null,
                episodeCurrent: this.anime.episodeCurrent ?? null,
                episodeTotal: this.anime.episodeTotal ?? null,
                status: this.selectedStatus,
            }];
        return normalized.length ? normalized : [];
    }

    private getPartChipLabel(part: PartDraft): string {
        const current = part.episodeCurrent ?? 0;
        const total = part.episodeTotal ?? '?';
        if (part.kind === 'tv') {
            const season = part.seasonNumber ? `S${part.seasonNumber}` : 'TV';
            return `${season} ${current}/${total}`;
        }
        return `${this.getFormatLabel(part.kind)} ${current}/${total}`;
    }

    private getPartDisplayName(part: PartDraft): string {
        const prefix = part.kind === 'tv' && part.seasonNumber ? `TV S${part.seasonNumber}` : this.getFormatLabel(part.kind);
        return part.title ? `${prefix}: ${part.title}` : prefix;
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
        return [
            { status: 'planned', label: t('statusPlanned') },
            { status: 'watching', label: t('statusWatching') },
            { status: 'completed', label: t('statusCompleted') },
            { status: 'dropped', label: t('statusDropped') },
            { status: 'paused', label: t('statusPaused') },
        ];
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

    private getFormatLabel(format: AnimeFormat): string {
        return this.getFormatOptions().find((option) => option.value === format)?.label ?? t('formatTv');
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
        const locale = i18n.getLanguage() === 'ru' ? 'ru-RU' : 'en-US';
        return new Intl.DateTimeFormat(locale, {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
        }).format(new Date(timestamp));
    }

    private normalizeDateInput(value: string | null | undefined): string {
        const trimmed = String(value ?? '').trim();
        if (!trimmed) return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
        const parsed = Date.parse(trimmed);
        return Number.isNaN(parsed) ? '' : this.formatDateForInput(parsed);
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
        if (!validateDatePickers([this.startedDatePicker, this.finishedDatePicker].filter((picker): picker is HierarchicalDatePicker => Boolean(picker)))) return false;
        const activePart = this.getActivePart();
        const allPartsCompleted = this.parts.length > 0 && this.parts.every((part) => part.status === 'completed');
        const status = allPartsCompleted ? 'completed' : this.selectedStatus;
        const updates: Partial<AnimeItem> = {
            displayName: this.title || this.anime.displayName,
            userRating: this.selectedRating,
            status,
            favorite: this.favorite,
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
            relatedMedia: this.relatedMedia,
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
