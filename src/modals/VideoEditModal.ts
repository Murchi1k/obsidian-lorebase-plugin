import { App, Menu, Modal, TFile } from 'obsidian';
import { DEFAULT_COVER, STATUS_CONFIG } from '../constants';
import { i18n, t } from '../localization';
import { MovieItem, RelatedMediaLink, SeriesItem, UserRating, VideoPart, VideoStatus } from '../types';
import { GenreEditModal } from './GenreEditModal';

type VideoItem = MovieItem | SeriesItem;
type VideoUpdates = Partial<VideoItem> & Record<string, unknown>;
type PartDraft = VideoPart;
type RelatedCandidate = RelatedMediaLink;

export class VideoEditModal extends Modal {
    private item: VideoItem;
    private onSave: (updates: VideoUpdates) => Promise<void>;
    private onDelete: () => void;

    private title: string;
    private poster: string;
    private horizontalPoster: string;
    private year: number | null;
    private selectedStatus: VideoStatus;
    private selectedRating: UserRating;
    private favorite: boolean;
    private summary: string;
    private sourceUrl: string;
    private genres: string[];
    private tags: string[];
    private providerRating: string;

    private releaseDate: string;
    private runtime: string;
    private director: string;
    private actors: string;
    private seasons: number | null;
    private networks: string[];
    private studios: string[];
    private parts: PartDraft[];
    private activePartId: string | null;
    private relatedMedia: RelatedMediaLink[];
    private relatedCandidates: RelatedCandidate[];
    private incomingRelated: RelatedMediaLink[];
    private draggedRelatedPath: string | null = null;

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
        incomingRelated: RelatedMediaLink[] = [],
        relatedCandidates: RelatedCandidate[] = []
    ) {
        super(app);
        this.item = item;
        this.onSave = onSave;
        this.onDelete = onDelete;

        this.title = item.displayName;
        this.poster = item.imageUrl;
        this.horizontalPoster = item.horizontalImageUrl ?? '';
        this.year = item.year;
        this.selectedStatus = item.status;
        this.selectedRating = item.userRating;
        this.favorite = item.favorite;
        this.summary = item.summary || item.description || '';
        this.sourceUrl = item.sourceUrl ?? '';
        this.genres = this.normalizeList(item.genres ?? []);
        this.tags = this.normalizeList(item.tags ?? []);
        this.providerRating = item.rating ?? '';

        this.releaseDate = item.releaseDate ?? '';
        this.runtime = item.runtime ?? '';
        this.director = item.director ?? '';
        this.actors = item.actors ?? '';
        this.seasons = item.type === 'series' ? item.seasons : null;
        this.networks = item.type === 'series' ? this.normalizeList(item.networks ?? []) : [];
        this.studios = item.type === 'series' ? this.normalizeList(item.studios ?? []) : [];
        this.parts = this.normalizeParts(item);
        this.relatedMedia = this.normalizeRelatedMedia(item.relatedMedia ?? []);
        this.relatedCandidates = relatedCandidates.filter((candidate) => candidate.path !== item.filePath);
        this.incomingRelated = incomingRelated;
        this.activePartId = this.parts.some((part) => part.id === item.activePartId)
            ? item.activePartId ?? this.parts[0]?.id ?? null
            : this.parts[0]?.id ?? null;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('lorebase-edit-modal', 'lorebase-modal-root');
        this.modalEl.addClass('lorebase-edit-modal-container');
        this.modalEl.addClass('lorebase-editmode-modal-shell');
        this.modalEl.addEventListener('keydown', this.onKeydown);

        const root = contentEl.createDiv({ cls: 'lorebase-editmode-root lorebase-editmode-video-root lorebase-modal-panel' });
        root.appendChild(this.createTemplateFragment(this.buildTemplate()));

        this.bindStaticContent(root);
        this.bindHeader(root);
        this.bindQuickSettings(root);
        this.bindStatus(root);
        this.bindRating(root);
        this.bindFields(root);
        this.bindParts(root);
        this.bindNotes(root);
        this.bindTags(root);
        this.bindRelatedMedia(root);
        this.renderRelatedMedia(root);
        this.bindDates(root);
    }

    onClose(): void {
        this.modalEl.removeEventListener('keydown', this.onKeydown);
        this.contentEl.empty();
        this.modalEl.removeClass('lorebase-editmode-modal-shell');
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
                                    <button type="button" class="lorebase-editmode-switch" data-toggle="favorite" aria-pressed="false"><span class="lorebase-editmode-switch-thumb"></span></button>
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
                                    <span class="lorebase-editmode-field-label">${t('templateFieldRating')}</span>
                                    <input class="lorebase-editmode-input" data-field="provider-rating" type="text" />
                                </label>
                                <label class="lorebase-editmode-field is-wide">
                                    <span class="lorebase-editmode-field-label">${t('editUrl')}</span>
                                    <input class="lorebase-editmode-input" data-field="source-url" type="text" placeholder="https://..." />
                                </label>
                            </div>
                            <div class="lorebase-editmode-field lorebase-editmode-genres-field">
                                <div class="lorebase-editmode-chip-row" data-role="genre-chips"></div>
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
                                    <span class="lorebase-editmode-rating-value" data-role="rating-value">0.0 / 5.0</span>
                                    <span class="lorebase-editmode-rating-hint">${t('editRatingHint')}</span>
                                </div>
                                <div class="lorebase-editmode-rating-line"><span class="lorebase-editmode-rating-line-fill" data-role="rating-line"></span></div>
                            </div>
                        </section>

                        ${this.buildPartsSection()}

                        <section class="lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-related lorebase-editmode-related-main">
                            <div class="lorebase-editmode-panel-title-row">
                                <h3 class="lorebase-editmode-panel-title">${t('editRelatedMedia')}</h3>
                                <button type="button" class="lorebase-editmode-btn lorebase-editmode-btn-tight" data-action="add-related">${t('editAddRelated')}</button>
                            </div>
                            <div class="lorebase-editmode-related-list" data-role="related-media"></div>
                        </section>

                        <section class="lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-notes">
                            <div class="lorebase-editmode-panel-title-row"><h3 class="lorebase-editmode-panel-title">${t('editSummary')}</h3></div>
                            <div class="lorebase-editmode-notes-shell">
                                <textarea class="lorebase-editmode-notes-input" data-field="summary" rows="9"></textarea>
                            </div>
                            <div class="lorebase-editmode-notes-footer">
                                <span class="lorebase-editmode-saved-indicator" data-role="saved-indicator">${t('editSaved')}</span>
                                <span class="lorebase-editmode-char-count" data-role="char-count">0 ${t('editCharsShort')}</span>
                            </div>
                        </section>
                    </main>

                    <aside class="lorebase-editmode-column lorebase-editmode-column-right">
                        ${this.buildProgressPanel()}

                        ${this.buildAdditionalPanel()}

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

    private buildPartsSection(): string {
        if (this.item.type === 'movie') return '';
        return `
            <section class="lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-anime-parts">
                <div class="lorebase-editmode-panel-title-row">
                    <h3 class="lorebase-editmode-panel-title">${t('templateFieldSeriesParts')}</h3>
                    <div class="lorebase-editmode-part-actions">
                        <button type="button" class="lorebase-editmode-btn lorebase-editmode-btn-tight" data-action="remove-part">${t('editRemovePart')}</button>
                        <button type="button" class="lorebase-editmode-btn lorebase-editmode-btn-tight" data-action="add-part">${t('editAddPart')}</button>
                    </div>
                </div>
                <div class="lorebase-editmode-chip-row lorebase-editmode-part-strip" data-role="part-strip"></div>
                <div class="lorebase-editmode-anime-part-editor" data-role="part-editor">
                    <div class="lorebase-editmode-meta-row">
                        <label class="lorebase-editmode-field">
                            <span class="lorebase-editmode-field-label">${t('templateFieldName')}</span>
                            <input class="lorebase-editmode-input" data-field="part-title" type="text" />
                        </label>
                        <label class="lorebase-editmode-field">
                            <span class="lorebase-editmode-field-label">${t('editSeasonCurrent')}</span>
                            <input class="lorebase-editmode-input" data-field="part-season" type="number" inputmode="numeric" />
                        </label>
                    </div>
                    <div class="lorebase-editmode-anime-episode-row">
                        <button type="button" class="lorebase-editmode-btn lorebase-editmode-btn-tight" data-action="episode-dec">-</button>
                        <input class="lorebase-editmode-input" data-field="part-episode-current" type="number" inputmode="numeric" />
                        <span class="lorebase-editmode-anime-slash">/</span>
                        <input class="lorebase-editmode-input" data-field="part-episode-total" type="number" inputmode="numeric" />
                        <button type="button" class="lorebase-editmode-btn lorebase-editmode-btn-tight" data-action="episode-inc">+1</button>
                    </div>
                    <div class="lorebase-editmode-segmented lorebase-editmode-part-status" data-role="part-status-segments"></div>
                </div>
            </section>
        `;
    }

    private buildProgressPanel(): string {
        if (this.item.type === 'movie') return '';
        return `
            <section class="lorebase-editmode-panel lorebase-editmode-panel-glass">
                <div class="lorebase-editmode-panel-title-row"><h3 class="lorebase-editmode-panel-title">${t('editProgress')}</h3></div>
                <div class="lorebase-editmode-kv-list">
                    <div class="lorebase-editmode-kv-row"><span class="lorebase-editmode-kv-key">${t('editTotalEpisodes')}</span><span class="lorebase-editmode-kv-val" data-role="progress-total">-</span></div>
                    <div class="lorebase-editmode-kv-row"><span class="lorebase-editmode-kv-key">${t('editActivePart')}</span><span class="lorebase-editmode-kv-val" data-role="active-part-name">-</span></div>
                </div>
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
                <div class="lorebase-editmode-kv-list lorebase-editmode-video-advanced-fields">
                    ${body}
                </div>
            </details>
        `;
    }

    private buildMovieAdditionalFields(): string {
        return `
            <label class="lorebase-editmode-field"><span class="lorebase-editmode-field-label">${t('templateFieldReleased')}</span><input class="lorebase-editmode-input" data-field="released" type="text" /></label>
            <label class="lorebase-editmode-field"><span class="lorebase-editmode-field-label">${t('templateFieldRuntime')}</span><input class="lorebase-editmode-input" data-field="runtime" type="text" /></label>
            <label class="lorebase-editmode-field"><span class="lorebase-editmode-field-label">${t('templateFieldDirector')}</span><input class="lorebase-editmode-input" data-field="director" type="text" /></label>
            <label class="lorebase-editmode-field"><span class="lorebase-editmode-field-label">${t('templateFieldActors')}</span><input class="lorebase-editmode-input" data-field="actors" type="text" /></label>
        `;
    }

    private buildSeriesAdditionalFields(): string {
        return `
            <label class="lorebase-editmode-field"><span class="lorebase-editmode-field-label">${t('templateFieldReleased')}</span><input class="lorebase-editmode-input" data-field="released" type="text" /></label>
            <label class="lorebase-editmode-field"><span class="lorebase-editmode-field-label">${t('templateFieldRuntime')}</span><input class="lorebase-editmode-input" data-field="runtime" type="text" /></label>
            <label class="lorebase-editmode-field"><span class="lorebase-editmode-field-label">${t('templateFieldDirector')}</span><input class="lorebase-editmode-input" data-field="director" type="text" /></label>
            <label class="lorebase-editmode-field"><span class="lorebase-editmode-field-label">${t('templateFieldActors')}</span><input class="lorebase-editmode-input" data-field="actors" type="text" /></label>
        `;
    }

    private createTemplateFragment(template: string): DocumentFragment {
        const parsed = new DOMParser().parseFromString(template, 'text/html');
        const fragment = this.contentEl.ownerDocument.createDocumentFragment();
        for (const child of Array.from(parsed.body.childNodes)) {
            fragment.appendChild(this.contentEl.ownerDocument.importNode(child, true));
        }
        return fragment;
    }

    private bindStaticContent(root: HTMLElement): void {
        this.setText(root, '[data-role="breadcrumb"]', `${this.item.type === 'movie' ? t('settingsMovies') : t('settingsSeries')} / ${this.item.displayName}`);
        const poster = this.qs<HTMLImageElement>(root, '[data-role="poster"]');
        if (poster) {
            poster.src = this.poster;
            poster.alt = this.item.displayName;
        }
        this.setInput(root, '[data-field="title"]', this.title);
        this.setInput(root, '[data-field="year"]', this.year);
        this.setInput(root, '[data-field="provider-rating"]', this.providerRating);
        this.setInput(root, '[data-field="source-url"]', this.sourceUrl);
        this.setInput(root, '[data-field="summary"]', this.summary);
        this.setInput(root, '[data-field="released"]', this.releaseDate);
        this.setInput(root, '[data-field="runtime"]', this.runtime);
        this.setInput(root, '[data-field="director"]', this.director);
        this.setInput(root, '[data-field="actors"]', this.actors);
        this.setInput(root, '[data-field="seasons"]', this.seasons);
        this.setInput(root, '[data-field="episode-current"]', this.item.type === 'series' ? this.item.episodeCurrent : null);
        this.setInput(root, '[data-field="episode-total"]', this.item.type === 'series' ? this.item.episodeTotal : null);
        this.setInput(root, '[data-field="studios"]', this.studios.join(', '));

        this.renderStatusSegments(root, '[data-role="status-segments"]', this.getVideoStatusOptions());
        this.renderStatusSegments(root, '[data-role="part-status-segments"]', this.getVideoStatusOptions().filter((entry) => entry.status !== 'dropped' && entry.status !== 'paused'));
        this.renderStars(root);
        this.renderGenreChips(root);
        this.renderTagChips(root);
        this.renderPartKindOptions(root);
        this.renderPartStrip(root);
        this.renderActivePartEditor(root);
        this.updateQuickSettingSwitches(root);
        this.updateStatusUI(root);
        this.updateRatingUI(root);
        this.updatePartStatusUI(root);
        this.updateProgressSummary(root);
        this.updateCharCount(root);
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
        this.qs<HTMLButtonElement>(root, '[data-toggle="favorite"]')?.addEventListener('click', () => {
            this.favorite = !this.favorite;
            this.updateQuickSettingSwitches(root);
        });
    }

    private bindStatus(root: HTMLElement): void {
        root.querySelectorAll<HTMLButtonElement>('[data-role="status-segments"] .lorebase-editmode-segment').forEach(btn => {
            btn.addEventListener('click', () => {
                const status = btn.dataset.status as VideoStatus | undefined;
                if (!status) return;
                this.selectedStatus = status;
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
        this.bindText(root, '[data-field="title"]', (value) => { this.title = value || this.item.displayName; });
        this.bindText(root, '[data-field="provider-rating"]', (value) => { this.providerRating = value; });
        this.bindText(root, '[data-field="source-url"]', (value) => { this.sourceUrl = value; });
        this.bindText(root, '[data-field="released"]', (value) => { this.releaseDate = value; });
        this.bindText(root, '[data-field="runtime"]', (value) => { this.runtime = value; });
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
        this.qs<HTMLButtonElement>(root, '[data-action="add-part"]')?.addEventListener('click', () => {
            const index = this.parts.length + 1;
            const kind = this.item.type === 'series' ? 'season' : 'movie';
            const part: PartDraft = {
                id: this.createPartId(kind),
                kind,
                title: this.item.type === 'series' ? `Season ${index}` : `Part ${index}`,
                seasonNumber: this.item.type === 'series' ? index : null,
                episodeCurrent: 0,
                episodeTotal: null,
                status: 'planned',
            };
            this.parts.push(part);
            this.activePartId = part.id;
            this.refreshPartsUi(root);
        });

        this.qs<HTMLButtonElement>(root, '[data-action="remove-part"]')?.addEventListener('click', () => {
            if (this.parts.length <= 1) return;
            const active = this.getActivePart();
            if (!active) return;
            const activeIndex = this.parts.findIndex((part) => part.id === active.id);
            this.parts = this.parts.filter((part) => part.id !== active.id);
            this.activePartId = this.parts[Math.min(Math.max(activeIndex, 0), this.parts.length - 1)]?.id ?? this.parts[0]?.id ?? null;
            this.refreshPartsUi(root);
        });

        this.qs<HTMLButtonElement>(root, '[data-action="episode-dec"]')?.addEventListener('click', () => {
            const part = this.getActivePart();
            if (!part) return;
            part.episodeCurrent = Math.max(0, (part.episodeCurrent ?? 0) - 1);
            this.refreshPartsUi(root);
        });
        this.qs<HTMLButtonElement>(root, '[data-action="episode-inc"]')?.addEventListener('click', () => {
            const part = this.getActivePart();
            if (!part) return;
            part.episodeCurrent = (part.episodeCurrent ?? 0) + 1;
            if (part.status === 'planned') part.status = 'watching';
            if (part.episodeTotal && part.episodeCurrent >= part.episodeTotal) part.status = 'completed';
            if (this.selectedStatus === 'planned') this.selectedStatus = 'watching';
            this.refreshPartsUi(root);
            this.updateStatusUI(root);
        });

        this.bindPartInput(root, '[data-field="part-title"]', (part, value) => { part.title = value; });
        this.bindPartInput(root, '[data-field="part-season"]', (part, value) => { part.seasonNumber = this.parseNumberInput(value); });
        this.bindPartInput(root, '[data-field="part-episode-current"]', (part, value) => { part.episodeCurrent = this.parseNumberInput(value); });
        this.bindPartInput(root, '[data-field="part-episode-total"]', (part, value) => { part.episodeTotal = this.parseNumberInput(value); });

        root.querySelectorAll<HTMLButtonElement>('[data-role="part-status-segments"] .lorebase-editmode-segment').forEach(btn => {
            btn.addEventListener('click', () => {
                const part = this.getActivePart();
                const status = btn.dataset.status as VideoStatus | undefined;
                if (!part || !status) return;
                part.status = status;
                this.refreshPartsUi(root);
            });
        });
    }

    private bindNotes(root: HTMLElement): void {
        const summary = this.qs<HTMLTextAreaElement>(root, '[data-field="summary"]');
        summary?.addEventListener('input', () => {
            this.summary = summary.value;
            this.setText(root, '[data-role="saved-indicator"]', t('editUnsavedChanges'));
            this.updateCharCount(root);
        });
    }

    private bindTags(root: HTMLElement): void {
        this.bindChipInput(root, '[data-field="new-tag"]', this.tags, () => this.renderTagChips(root));
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
        for (const option of options) {
            const button = this.contentEl.ownerDocument.createElement('button');
            button.type = 'button';
            button.className = 'lorebase-editmode-segment';
            button.dataset.status = option.status;
            button.setAttribute('aria-pressed', 'false');
            const icon = button.createSpan({ cls: 'lorebase-editmode-segment-icon', attr: { 'aria-hidden': 'true' } });
            icon.appendChild(this.createSvgIcon(STATUS_CONFIG[option.status].pathD));
            button.createSpan({ cls: 'lorebase-editmode-segment-label', text: option.label });
            container.appendChild(button);
        }
    }

    private renderStars(root: HTMLElement): void {
        const stars = this.qs<HTMLElement>(root, '[data-role="stars"]');
        if (!stars) return;
        stars.empty();
        for (let i = 1; i <= 5; i++) {
            stars.createEl('button', {
                cls: 'lorebase-editmode-star',
                text: String.fromCharCode(9733),
                attr: { type: 'button', 'data-rating': String(i), 'aria-label': `${t('editRating')} ${i}` },
            }).dataset.rating = String(i);
        }
    }

    private renderPartKindOptions(root: HTMLElement): void {
        const select = this.qs<HTMLSelectElement>(root, '[data-field="part-kind"]');
        if (!select) return;
        select.empty();
        const options: Array<{ value: PartDraft['kind']; label: string }> = [
            { value: 'movie', label: t('formatMovie') },
            { value: 'season', label: t('settingsSeries') },
        ];
        for (const option of options) select.createEl('option', { value: option.value, text: option.label });
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
                this.refreshPartsUi(root);
            });
        }
    }

    private renderActivePartEditor(root: HTMLElement): void {
        const part = this.getActivePart();
        const editor = this.qs<HTMLElement>(root, '[data-role="part-editor"]');
        if (editor) editor.toggleClass('is-hidden', !part);
        if (!part) return;
        this.setInput(root, '[data-field="part-kind"]', part.kind);
        this.setInput(root, '[data-field="part-title"]', part.title);
        this.setInput(root, '[data-field="part-season"]', part.seasonNumber);
        this.setInput(root, '[data-field="part-episode-current"]', part.episodeCurrent);
        this.setInput(root, '[data-field="part-episode-total"]', part.episodeTotal);
        this.updatePartStatusUI(root);
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
        const image = row.createDiv({ cls: 'lorebase-editmode-related-image' });
        image.setCssStyles({
            backgroundImage: `url("${imageUrl.replace(/"/g, '\\"')}")`,
            height: '120px',
            minHeight: '120px',
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

    private moveRelatedMedia(index: number, direction: -1 | 1): void {
        const target = index + direction;
        if (target < 0 || target >= this.relatedMedia.length) return;
        const next = [...this.relatedMedia];
        [next[index], next[target]] = [next[target], next[index]];
        this.relatedMedia = next;
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

    private renderIncomingRelated(root: HTMLElement): void {
        const container = this.qs<HTMLElement>(root, '[data-role="incoming-related-media"]');
        if (!container) return;
        container.empty();
        if (!this.incomingRelated.length) {
            container.createDiv({ cls: 'lorebase-editmode-related-empty', text: t('editRelatedEmpty') });
            return;
        }

        for (const item of this.incomingRelated) {
            const row = container.createDiv({ cls: 'lorebase-editmode-related-item is-readonly' });
            const image = row.createDiv({ cls: 'lorebase-editmode-related-image' });
            const imageUrl = item.imageUrl || DEFAULT_COVER;
            image.setCssStyles({
                backgroundImage: `url("${imageUrl.replace(/"/g, '\\"')}")`,
                height: '76px',
                minHeight: '76px',
            });
            image.createSpan({ cls: 'lorebase-editmode-related-type', text: this.getRelatedTypeLabel(item.type) });
            row.createSpan({ cls: 'lorebase-editmode-related-title', text: item.title || item.path });
        }
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
        const numeric = this.selectedRating ?? 0;
        this.setText(root, '[data-role="rating-value"]', `${numeric.toFixed(1)} / 5.0`);
        const line = this.qs<HTMLElement>(root, '[data-role="rating-line"]');
        if (line) line.style.width = `${Math.round((numeric / 5) * 100)}%`;
    }

    private updateProgressSummary(root: HTMLElement): void {
        const current = this.parts.reduce((sum, part) => sum + (part.episodeCurrent ?? 0), 0);
        const total = this.parts.reduce((sum, part) => sum + (part.episodeTotal ?? 0), 0);
        this.setText(root, '[data-role="progress-total"]', this.item.type === 'movie'
            ? String(this.parts.length)
            : total > 0 ? `${current} / ${total}` : `${current}`);
        const active = this.getActivePart();
        this.setText(root, '[data-role="active-part-name"]', active ? this.getPartDisplayName(active) : '-');

        const remove = this.qs<HTMLButtonElement>(root, '[data-action="remove-part"]');
        if (remove) {
            remove.disabled = this.parts.length <= 1;
            remove.toggleClass('is-disabled', remove.disabled);
        }
    }

    private updateCharCount(root: HTMLElement): void {
        this.setText(root, '[data-role="char-count"]', `${this.summary.length} ${t('editCharsShort')}`);
    }

    private refreshPartsUi(root: HTMLElement): void {
        this.renderPartStrip(root);
        this.renderActivePartEditor(root);
        this.updateProgressSummary(root);
    }

    private getVideoStatusOptions(): Array<{ status: VideoStatus; label: string }> {
        return [
            { status: 'planned', label: t('statusPlanned') },
            { status: 'watching', label: t('statusWatching') },
            { status: 'completed', label: t('statusCompleted') },
            { status: 'dropped', label: t('statusDropped') },
            { status: 'paused', label: t('statusPaused') },
        ];
    }

    private getActivePart(): PartDraft | null {
        if (!this.parts.length) return null;
        return this.parts.find((part) => part.id === this.activePartId) ?? this.parts[0] ?? null;
    }

    private normalizeParts(item: VideoItem): PartDraft[] {
        if (item.parts?.length) return item.parts.map((part) => ({ ...part }));
        if (item.type === 'series') {
            return [{
                id: 'season-1',
                kind: 'season',
                title: 'Season 1',
                seasonNumber: 1,
                episodeCurrent: item.episodeCurrent ?? 0,
                episodeTotal: item.episodeTotal,
                status: item.status,
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

    private getPartChipLabel(part: PartDraft): string {
        const current = part.episodeCurrent ?? 0;
        const total = part.episodeTotal ?? '?';
        if (part.kind === 'season') {
            const season = part.seasonNumber ? `S${part.seasonNumber}` : t('settingsSeries');
            return `${season} ${current}/${total}`;
        }
        return part.title || t('formatMovie');
    }

    private getPartDisplayName(part: PartDraft): string {
        const prefix = part.kind === 'season' && part.seasonNumber ? `S${part.seasonNumber}` : this.getPartKindLabel(part.kind);
        return part.title ? `${prefix}: ${part.title}` : prefix;
    }

    private getPartKindLabel(kind: PartDraft['kind']): string {
        return kind === 'season' ? t('settingsSeries') : t('formatMovie');
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

    private createSvgIcon(pathD: string): SVGElement {
        const svg = this.contentEl.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        const path = this.contentEl.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathD);
        svg.appendChild(path);
        return svg;
    }

    private bindText(root: HTMLElement, selector: string, handler: (value: string) => void): void {
        this.qs<HTMLInputElement>(root, selector)?.addEventListener('input', (event) => {
            handler((event.currentTarget as HTMLInputElement).value.trim());
        });
    }

    private bindPartInput(root: HTMLElement, selector: string, handler: (part: PartDraft, value: string) => void): void {
        this.qs<HTMLInputElement>(root, selector)?.addEventListener('input', (event) => {
            const part = this.getActivePart();
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
        const locale = i18n.getLanguage() === 'ru' ? 'ru-RU' : 'en-US';
        return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: '2-digit' }).format(new Date(timestamp));
    }

    private getFile(): TFile | null {
        const file = this.app.vault.getAbstractFileByPath(this.item.filePath);
        return file instanceof TFile ? file : null;
    }

    private async save(): Promise<void> {
        const activePart = this.getActivePart();
        const allPartsCompleted = this.item.type === 'series' && this.parts.length > 0 && this.parts.every((part) => part.status === 'completed');
        const status = allPartsCompleted ? 'completed' : this.selectedStatus;

        const updates: VideoUpdates = {
            displayName: this.title,
            imageUrl: this.poster,
            horizontalImageUrl: this.horizontalPoster,
            year: this.year,
            userRating: this.selectedRating,
            status,
            favorite: this.favorite,
            summary: this.summary,
            genres: this.genres,
            tags: this.tags,
            rating: this.providerRating,
            sourceUrl: this.sourceUrl || null,
            relatedMedia: this.relatedMedia,
        };

        if (this.item.type === 'movie') {
            updates.releaseDate = this.releaseDate;
            updates.runtime = this.runtime;
            updates.director = this.director;
            updates.actors = this.actors;
        } else {
            updates.parts = this.parts;
            updates.activePartId = activePart?.id ?? this.activePartId;
            updates.releaseDate = this.releaseDate;
            updates.runtime = this.runtime;
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
