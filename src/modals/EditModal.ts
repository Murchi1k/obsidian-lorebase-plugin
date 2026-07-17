/**
 * LOREBASE - Edit Modal
 * Cinematic edit mode for game properties
 */

import { App, Menu, Modal, TFile, setIcon } from 'obsidian';
import { GameItem, GameStatus, TagPreset, UserRating } from '../types';
import { DEFAULT_GAME_TAG_PRESETS, STATUS_CONFIG } from '../constants';
import { i18n, t } from '../localization';
import { GenreEditModal } from './GenreEditModal';

/**
 * Modal for editing game properties
 */
export class EditModal extends Modal {
    private game: GameItem;
    private onSave: (updates: Partial<GameItem>) => Promise<void>;
    private onDelete?: () => void;
    private seriesOptions: string[];
    private tagPresets: TagPreset[];

    private selectedRating: UserRating;
    private selectedStatus: GameStatus;
    private favorite: boolean;
    private title: string;
    private year: number | null;
    private description: string;
    private gameSeries: string;
    private dateCompleted: number | null;
    private isAdult: boolean;
    private releaseDate: string;
    private publisher: string;
    private developer: string;
    private tags: string[];
    private genres: string[];

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
        tagPresets: TagPreset[] = []
    ) {
        super(app);
        this.game = game;
        this.onSave = onSave;
        this.seriesOptions = seriesOptions;
        this.onDelete = onDelete;
        this.tagPresets = tagPresets;

        this.selectedRating = game.userRating;
        this.selectedStatus = game.status;
        this.favorite = game.favorite;
        this.title = game.displayName;
        this.year = game.year;
        this.description = game.description;
        this.gameSeries = game.gameSeries;
        this.dateCompleted = game.dateCompleted;
        this.isAdult = game.isAdult;
        this.releaseDate = this.normalizeDateInput(game.releaseDate);
        this.publisher = game.publisher ?? '';
        this.developer = game.developer ?? '';
        this.tags = this.normalizeTags(game.tags ?? []);
        this.genres = this.normalizeGenres(game.genres ?? []);
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
        this.bindQuickSettings(root);
        this.bindStatus(root);
        this.bindRating(root);
        this.bindFields(root);
        this.bindNotes(root);
        this.bindPlanTags(root);
        this.bindTags(root);
        this.bindDates(root);
        this.bindAdvanced(root);
    }

    onClose(): void {
        const { contentEl } = this;
        this.modalEl.removeEventListener('keydown', this.onKeydown);
        contentEl.empty();
        this.modalEl.removeClass('lorebase-editmode-modal-shell');
    }

    private createTemplateFragment(template: string): DocumentFragment {
        const parsed = new DOMParser().parseFromString(template, 'text/html');
        const fragment = this.contentEl.ownerDocument.createDocumentFragment();
        for (const child of Array.from(parsed.body.childNodes)) {
            fragment.appendChild(this.contentEl.ownerDocument.importNode(child, true));
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
                        <section class="lorebase-editmode-panel lorebase-editmode-poster-card" data-component="PosterCard">
                            <div class="lorebase-editmode-panel-title-row">
                                <h3 class="lorebase-editmode-panel-title">${t('editPoster')}</h3>
                            </div>
                            <div class="lorebase-editmode-poster-frame">
                                <img class="lorebase-editmode-poster-image" data-role="poster" alt="${t('templateFieldPoster')}" />
                            </div>
                        </section>

                        <section class="lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-quick-settings" data-component="QuickSettings">
                            <div class="lorebase-editmode-panel-title-row">
                                <h3 class="lorebase-editmode-panel-title">${t('editQuickSettings')}</h3>
                            </div>
                            <div class="lorebase-editmode-toggle-list">
                                <label class="lorebase-editmode-switch-row">
                                    <span class="lorebase-editmode-switch-label">${t('editFavorite')}</span>
                                    <button type="button" class="lorebase-editmode-switch" data-toggle="favorite" aria-pressed="false"><span class="lorebase-editmode-switch-thumb"></span></button>
                                </label>
                                <label class="lorebase-editmode-switch-row">
                                    <span class="lorebase-editmode-switch-label">${t('editAdult')}</span>
                                    <button type="button" class="lorebase-editmode-switch" data-toggle="adult" aria-pressed="false"><span class="lorebase-editmode-switch-thumb"></span></button>
                                </label>
                            </div>
                        </section>

                        <section class="lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-plan-tags" data-component="PlanTags">
                            <div class="lorebase-editmode-panel-title-row">
                                <h3 class="lorebase-editmode-panel-title">${t('plans')}</h3>
                            </div>
                            <div class="lorebase-editmode-chip-row" data-role="plan-tag-chips"></div>
                        </section>

                    </aside>

                    <main class="lorebase-editmode-column lorebase-editmode-column-center">
                        <section class="lorebase-editmode-panel lorebase-editmode-title-meta" data-component="TitleMeta">
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
                            </div>
                        </section>

                        <section class="lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-status-rating" data-component="StatusRating">
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
                                    <button type="button" class="lorebase-editmode-segment" data-status="wishlist">
                                        <span class="lorebase-editmode-segment-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="${STATUS_CONFIG.wishlist.pathD}" /></svg></span>
                                        <span class="lorebase-editmode-segment-label">${t('statusWishlist')}</span>
                                    </button>
                                    <button type="button" class="lorebase-editmode-segment" data-status="sandbox">
                                        <span class="lorebase-editmode-segment-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="${STATUS_CONFIG.sandbox.pathD}" /></svg></span>
                                        <span class="lorebase-editmode-segment-label">${t('statusSandbox')}</span>
                                    </button>
                                </div>
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

                        <section class="lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-notes" data-component="NotesEditor">
                            <div class="lorebase-editmode-panel-title-row"><h3 class="lorebase-editmode-panel-title">${t('editDescription')}</h3></div>
                            <div class="lorebase-editmode-notes-shell">
                                <textarea class="lorebase-editmode-notes-input" data-field="notes" rows="9"></textarea>
                            </div>
                            <div class="lorebase-editmode-notes-footer">
                                <span class="lorebase-editmode-saved-indicator" data-role="saved-indicator">${t('editSaved')}</span>
                                <span class="lorebase-editmode-char-count" data-role="char-count">0 ${t('editCharsShort')}</span>
                            </div>
                        </section>

                    </main>

                    <aside class="lorebase-editmode-column lorebase-editmode-column-right">
                        <section class="lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-progress" data-component="ProgressPanel">
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

                        <details class="lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-advanced" data-component="AdvancedPanel">
                            <summary class="lorebase-editmode-panel-title-row lorebase-editmode-collapsible-summary">
                                <h3 class="lorebase-editmode-panel-title">${t('editAdvanced')}</h3>
                                <span class="lorebase-editmode-collapsible-caret" aria-hidden="true">v</span>
                            </summary>
                            <div class="lorebase-editmode-advanced-grid">
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

                        <section class="lorebase-editmode-panel lorebase-editmode-tags" data-component="TagsBlock">
                            <div class="lorebase-editmode-panel-title-row"><h3 class="lorebase-editmode-panel-title">${t('tags')}</h3></div>
                            <div class="lorebase-editmode-chip-row" data-role="tag-chips"></div>
                            <input class="lorebase-editmode-input lorebase-editmode-tag-input" type="text" data-field="new-tag" placeholder="${t('editTagPlaceholder')}" />
                        </section>

                        <section class="lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-timestamps">
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

        this.renderSeriesCombobox(root);

        const notes = this.qs<HTMLTextAreaElement>(root, '[data-field="notes"]');
        if (notes) notes.value = this.description;

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

        this.renderGenreChips(root);
        this.renderTagChips(root);
        this.renderPlanTagChips(root);
        this.updateQuickSettingSwitches(root);
        this.updateStatusUI(root);
        this.updateRatingUI(root);
        this.updateCharCount(root);
    }

    private bindHeader(root: HTMLElement): void {
        this.qs<HTMLButtonElement>(root, '[data-action="discard"]')?.addEventListener('click', () => this.close());
        this.qs<HTMLButtonElement>(root, '[data-action="save"]')?.addEventListener('click', () => void this.save());
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

    private bindQuickSettings(root: HTMLElement): void {
        root.querySelectorAll<HTMLButtonElement>('.lorebase-editmode-switch').forEach(btn => {
            btn.addEventListener('click', () => {
                const key = btn.dataset.toggle;
                if (key === 'favorite') this.favorite = !this.favorite;
                if (key === 'adult') this.isAdult = !this.isAdult;
                this.updateQuickSettingSwitches(root);
            });
        });

    }

    private bindStatus(root: HTMLElement): void {
        root.querySelectorAll<HTMLButtonElement>('.lorebase-editmode-segment').forEach(btn => {
            btn.addEventListener('click', () => {
                const status = btn.dataset.status as GameStatus | undefined;
                if (!status) return;
                this.selectedStatus = status;
                if (status === 'completed' && !this.dateCompleted) {
                    this.dateCompleted = this.getTodayTimestamp();
                }
                this.updateStatusUI(root);
            });
        });
    }

    private bindRating(root: HTMLElement): void {
        const stars = this.qs<HTMLElement>(root, '[data-role="stars"]');
        if (stars) {
            for (let i = 1; i <= 5; i++) {
                const btn = stars.createEl('button', {
                    cls: 'lorebase-editmode-star',
                    attr: { type: 'button', 'aria-label': `${t('editRating')} ${i}` }
                });
                btn.textContent = String.fromCharCode(9733);
                btn.dataset.rating = String(i);
                btn.addEventListener('click', () => {
                    this.selectedRating = i as UserRating;
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
                return;
            }
            const parsed = parseInt(value, 10);
            this.year = Number.isNaN(parsed) ? null : parsed;
        });

        const title = this.qs<HTMLInputElement>(root, '[data-field="title"]');
        title?.addEventListener('input', () => {
            this.title = title.value.trim();
            const breadcrumb = this.qs<HTMLElement>(root, '[data-role="breadcrumb"]');
            if (breadcrumb) breadcrumb.textContent = `${t('editBreadcrumbGames')} / ${title.value.trim() || this.game.displayName}`;
        });
    }

    private bindNotes(root: HTMLElement): void {
        const notes = this.qs<HTMLTextAreaElement>(root, '[data-field="notes"]');
        notes?.addEventListener('input', () => {
            this.description = notes.value;
            const indicator = this.qs<HTMLElement>(root, '[data-role="saved-indicator"]');
            if (indicator) indicator.textContent = t('editUnsavedChanges');
            this.updateCharCount(root);
        });
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
            node.textContent = text;
            node.removeClass('is-empty');
            return;
        }
        node.textContent = '-';
        node.addClass('is-empty');
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
        this.updateSwitch(root, 'adult', this.isAdult);
    }

    private updateSwitch(root: HTMLElement, key: string, value: boolean): void {
        const node = this.qs<HTMLButtonElement>(root, `[data-toggle="${key}"]`);
        if (!node) return;
        node.setAttr('aria-pressed', String(value));
        node.toggleClass('is-active', value);
    }

    private updateStatusUI(root: HTMLElement): void {
        root.querySelectorAll<HTMLButtonElement>('.lorebase-editmode-segment').forEach(btn => {
            const selected = btn.dataset.status === this.selectedStatus;
            btn.toggleClass('is-active', selected);
            btn.setAttr('aria-pressed', String(selected));
        });
    }

    private updateRatingUI(root: HTMLElement): void {
        root.querySelectorAll<HTMLButtonElement>('.lorebase-editmode-star').forEach(btn => {
            const value = Number(btn.dataset.rating ?? '0');
            const selected = this.selectedRating !== null && value <= this.selectedRating;
            btn.toggleClass('is-active', selected);
        });

        const ratingValue = this.qs<HTMLElement>(root, '[data-role="rating-value"]');
        const ratingLine = this.qs<HTMLElement>(root, '[data-role="rating-line"]');

        const numeric = this.selectedRating ?? 0;
        const pct = Math.round((numeric / 5) * 100);
        if (ratingValue) ratingValue.textContent = `${numeric.toFixed(1)} / 5.0`;
        if (ratingLine) ratingLine.style.width = `${pct}%`;
    }

    private updateCharCount(root: HTMLElement): void {
        const count = this.qs<HTMLElement>(root, '[data-role="char-count"]');
        if (count) count.textContent = `${this.description.length} ${t('editCharsShort')}`;
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
        const cleaned = value.trim().replace(/^#+/, '').toLowerCase();
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

    private formatDateForInput(value: number | null): string {
        if (!value || !Number.isFinite(value)) return '';
        const date = new Date(value);
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    private parseDateInput(value: string): number | null {
        if (!value) return null;
        const parts = value.split('-').map(Number);
        if (parts.length !== 3) return null;
        const [year, month, day] = parts;
        if (!year || !month || !day) return null;
        return Date.UTC(year, month - 1, day);
    }

    private normalizeDateInput(value: string | null | undefined): string {
        if (!value) return '';
        const trimmed = value.trim();
        if (!trimmed) return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
        const parsed = Date.parse(trimmed);
        return Number.isNaN(parsed) ? '' : this.formatDateForInput(parsed);
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

    private async save(): Promise<void> {
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
            isAdult: this.isAdult,
            releaseDate: this.releaseDate || null,
            publisher: this.publisher.trim(),
            developer: this.developer.trim(),
        };

        if (this.selectedStatus === 'completed') {
            updates.dateCompleted = this.dateCompleted;
        }

        await this.onSave(updates);
        this.close();
    }

    private getFile(): TFile | null {
        const file = this.app.vault.getAbstractFileByPath(this.game.filePath);
        return file instanceof TFile ? file : null;
    }
}
