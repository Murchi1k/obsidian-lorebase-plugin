import { App, Menu, Modal } from 'obsidian';
import { DEFAULT_COVER, STATUS_CONFIG } from '../constants';
import { i18n, t } from '../localization';
import { BookItem, MangaItem, MangaPart, ReadingItem, ReadingStatus, UserRating } from '../types';
import { GenreEditModal } from './GenreEditModal';

type ReadingUpdates = Partial<ReadingItem> & Record<string, unknown>;

export class ReadingEditModal extends Modal {
    private item: ReadingItem;
    private onSave: (updates: ReadingUpdates) => Promise<void>;
    private onDelete: () => void;

    private title: string;
    private poster: string;
    private horizontalPoster: string;
    private year: number | null;
    private selectedStatus: ReadingStatus;
    private selectedRating: UserRating;
    private favorite: boolean;
    private summary: string;
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
        onDelete: () => void
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
        this.genres = this.normalizeList(item.genres);
        this.tags = this.normalizeList(item.tags);
        this.authors = this.normalizeList(item.authors);
        this.publisher = item.type === 'book' ? item.publisher ?? '' : '';
        this.releaseDate = item.type === 'book' ? item.releaseDate ?? '' : '';
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
        this.bindStatus(root);
        this.bindRating(root);
        this.bindProgress(root);
        this.renderGenreChips(root);
        this.renderTagChips(root);
        this.updateDates(root);
        this.updateCharCount(root);
    }

    onClose(): void {
        this.modalEl.removeEventListener('keydown', this.onKeydown);
        this.contentEl.empty();
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
        const isBook = this.item.type === 'book';
        const breadcrumb = isBook ? t('editBreadcrumbBooks') : t('editBreadcrumbManga');
        const heading = isBook ? t('editBookTitle') : t('editMangaTitle');
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
                                <label class="lorebase-editmode-field is-wide">
                                    <span class="lorebase-editmode-field-label">${t('editUrl')}</span>
                                    <input class="lorebase-editmode-input" data-field="source-url" type="text" placeholder="https://..." />
                                </label>
                            </div>
                            <div class="lorebase-editmode-field lorebase-editmode-genres-field">
                                <div class="lorebase-editmode-chip-row" data-role="genre-chips"></div>
                            </div>
                        </section>

                        <section class="lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-reading-progress">
                            <div class="lorebase-editmode-panel-title-row">
                                <h3 class="lorebase-editmode-panel-title">${t('editProgress')}</h3>
                                <span class="lorebase-editmode-status-hint" data-role="progress-summary"></span>
                            </div>
                            <div class="lorebase-reading-progress-meters" data-role="progress-meters"></div>
                            <div class="lorebase-editmode-chip-row lorebase-editmode-part-strip" data-role="volume-strip"></div>
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
                        <section class="lorebase-editmode-panel lorebase-editmode-panel-glass">
                            <div class="lorebase-editmode-panel-title-row"><h3 class="lorebase-editmode-panel-title">${heading}</h3></div>
                            <div class="lorebase-editmode-meta-row">
                                <label class="lorebase-editmode-field is-wide">
                                    <span class="lorebase-editmode-field-label">${t('templateFieldAuthors')}</span>
                                    <input class="lorebase-editmode-input" data-field="authors" type="text" />
                                </label>
                                ${isBook ? `
                                <label class="lorebase-editmode-field is-wide">
                                    <span class="lorebase-editmode-field-label">${t('editPublisher')}</span>
                                    <input class="lorebase-editmode-input" data-field="publisher" type="text" />
                                </label>
                                <label class="lorebase-editmode-field is-wide">
                                    <span class="lorebase-editmode-field-label">${t('editReleaseDate')}</span>
                                    <input class="lorebase-editmode-input" data-field="release-date" type="text" />
                                </label>` : `
                                <label class="lorebase-editmode-field is-wide">
                                    <span class="lorebase-editmode-field-label">${t('templateFieldArtists')}</span>
                                    <input class="lorebase-editmode-input" data-field="artists" type="text" />
                                </label>`}
                                <label class="lorebase-editmode-field is-wide">
                                    <span class="lorebase-editmode-field-label">${t('editPoster')}</span>
                                    <input class="lorebase-editmode-input" data-field="poster" type="text" />
                                </label>
                                <label class="lorebase-editmode-field is-wide">
                                    <span class="lorebase-editmode-field-label">${t('templateFieldPosterHorizontal')}</span>
                                    <input class="lorebase-editmode-input" data-field="poster-horizontal" type="text" />
                                </label>
                            </div>
                        </section>

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
        const favorite = this.qs<HTMLButtonElement>(root, '[data-toggle="favorite"]');
        if (!favorite) return;
        const sync = (): void => {
            favorite.setAttr('aria-pressed', String(this.favorite));
            favorite.toggleClass('is-active', this.favorite);
        };
        favorite.addEventListener('click', () => {
            this.favorite = !this.favorite;
            sync();
        });
        sync();
    }

    private bindFields(root: HTMLElement): void {
        this.setInput(root, '[data-field="title"]', this.title);
        this.setInput(root, '[data-field="year"]', this.year);
        this.setInput(root, '[data-field="source-url"]', this.sourceUrl);
        this.setInput(root, '[data-field="summary"]', this.summary);
        this.setInput(root, '[data-field="authors"]', this.authors.join(', '));
        this.setInput(root, '[data-field="poster"]', this.poster === DEFAULT_COVER ? '' : this.poster);
        this.setInput(root, '[data-field="poster-horizontal"]', this.horizontalPoster);
        this.qs<HTMLImageElement>(root, '[data-role="poster"]')?.setAttr('src', this.poster || DEFAULT_COVER);

        if (this.item.type === 'book') {
            this.setInput(root, '[data-field="publisher"]', this.publisher);
            this.setInput(root, '[data-field="release-date"]', this.releaseDate);
        } else {
            this.setInput(root, '[data-field="artists"]', this.artists.join(', '));
        }

        this.bindText(root, '[data-field="title"]', (value) => this.title = value);
        this.bindNumber(root, '[data-field="year"]', (value) => this.year = value);
        this.bindText(root, '[data-field="source-url"]', (value) => this.sourceUrl = value);
        this.bindText(root, '[data-field="authors"]', (value) => this.authors = this.splitList(value));
        this.bindText(root, '[data-field="poster"]', (value) => {
            this.poster = value;
            const image = this.qs<HTMLImageElement>(root, '[data-role="poster"]');
            if (image) image.src = value || DEFAULT_COVER;
        });
        this.bindText(root, '[data-field="poster-horizontal"]', (value) => this.horizontalPoster = value);
        this.bindTextarea(root, '[data-field="summary"]', (value) => {
            this.summary = value;
            this.updateCharCount(root);
        });

        if (this.item.type === 'book') {
            this.bindText(root, '[data-field="publisher"]', (value) => this.publisher = value);
            this.bindText(root, '[data-field="release-date"]', (value) => this.releaseDate = value);
        } else {
            this.bindText(root, '[data-field="artists"]', (value) => this.artists = this.splitList(value));
        }

        this.bindChipInput(root, '[data-field="new-tag"]', this.tags, () => this.renderTagChips(root), true);
    }

    private bindProgress(root: HTMLElement): void {
        this.renderProgress(root);
    }

    private renderProgress(root: HTMLElement): void {
        const meters = this.qs<HTMLElement>(root, '[data-role="progress-meters"]');
        const strip = this.qs<HTMLElement>(root, '[data-role="volume-strip"]');
        const editor = this.qs<HTMLElement>(root, '[data-role="progress-editor"]');
        if (!meters || !strip || !editor) return;
        meters.empty();
        strip.empty();
        editor.empty();

        if (this.item.type === 'book') {
            this.setText(root, '[data-role="progress-summary"]', 'PAGES');
            this.createProgressMeter(meters, 'pages', t('templateFieldPageCurrent'), this.pageCurrent, this.pageTotal, '#26c6da');
            this.createProgressMeter(meters, 'book-chapters', t('templateFieldChapterCurrent'), this.bookChapterCurrent, this.bookChapterTotal, '#ffb02e');
            this.createStepper(editor, t('editPageCurrent'), this.pageCurrent, this.pageTotal, (value) => {
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
        this.renderVolumeStrip(root);
        this.createStepper(editor, t('editChapterCurrent'), this.chapterCurrent, this.chapterTotal, (value) => {
            this.chapterCurrent = value;
            this.updateActiveMangaPart({ chapterCurrent: value });
            this.syncProgressView(root, true);
        }, (value) => {
            this.chapterCurrent = value;
            this.updateActiveMangaPart({ chapterCurrent: value });
            this.renderProgress(root);
        });
        this.createNumberEditor(editor, t('editChapterTotal'), this.chapterTotal, (value) => {
            this.chapterTotal = value;
            this.updateActiveMangaPart({ chapterTotal: value });
            this.syncProgressView(root, true);
        });
        this.createNumberEditor(editor, t('editVolumeCurrent'), this.volumeCurrent, (value) => {
            this.volumeCurrent = value;
            const part = this.parts.find((candidate) => candidate.volumeNumber === value);
            if (part) this.activePartId = part.id;
            this.syncProgressView(root, true);
        });
        this.createNumberEditor(editor, t('editVolumeTotal'), this.volumeTotal, (value) => {
            this.volumeTotal = value;
            this.syncProgressView(root, true);
        });
    }

    private renderVolumeStrip(root: HTMLElement): void {
        const strip = this.qs<HTMLElement>(root, '[data-role="volume-strip"]');
        if (!strip) return;
        strip.empty();
        const volumeButtons = this.getVolumeButtons();
        for (const part of volumeButtons) {
            const chip = strip.createEl('button', {
                cls: 'lorebase-editmode-part-chip',
                text: String(part.volumeNumber ?? part.index),
                attr: { type: 'button', 'data-status': part.status ?? 'planned' },
            });
            chip.toggleClass('is-active', part.active);
            chip.addEventListener('click', () => {
                if (part.id) this.selectMangaPart(part.id);
                else this.volumeCurrent = part.volumeNumber;
                this.renderProgress(root);
            });
        }
    }

    private syncProgressView(root: HTMLElement, refreshStrip = false): void {
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
        if (refreshStrip) this.renderVolumeStrip(root);
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
        total: number | null,
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
            const value = this.normalizeProgress((this.parseNumber(input.value) ?? 0) + delta, null);
            input.value = value !== null ? String(value) : '';
            (onStep ?? onInput)(value);
        };
        decrement.addEventListener('click', () => step(-1));
        input.addEventListener('input', () => onInput(this.normalizeProgress(this.parseNumber(input.value), null)));
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
        const button = this.contentEl.ownerDocument.createElement('button');
        button.type = 'button';
        button.className = 'lorebase-editmode-segment';
        button.dataset.status = status;
        button.setAttribute('aria-pressed', 'false');
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
        this.setText(root, '[data-role="char-count"]', `${this.summary.length} ${t('editCharsShort')}`);
    }

    private getReadingStatusOptions(): Array<{ status: ReadingStatus; label: string }> {
        return [
            { status: 'planned', label: t('statusPlanToRead') },
            { status: 'watching', label: t('statusReading') },
            { status: 'completed', label: t('statusCompleted') },
            { status: 'dropped', label: t('statusDropped') },
            { status: 'paused', label: t('statusPaused') },
        ];
    }

    private getActivePart(): MangaPart | null {
        if (!this.parts.length) return null;
        return this.parts.find((part) => part.id === this.activePartId) ?? this.parts[0] ?? null;
    }

    private getVolumeButtons(): Array<{ id: string | null; index: number; volumeNumber: number | null; status?: MangaPart['status']; active: boolean }> {
        const total = Math.max(0, Math.min(80, this.volumeTotal ?? this.parts.length));
        if (this.parts.length) {
            return Array.from({ length: total }, (_, index) => {
                const part = this.parts[index];
                const volumeNumber = part?.volumeNumber ?? index + 1;
                return {
                    id: part?.id ?? null,
                    index: index + 1,
                    volumeNumber,
                    status: part?.status ?? 'planned',
                    active: part ? part.id === this.activePartId : volumeNumber === this.volumeCurrent,
                };
            });
        }
        return Array.from({ length: total }, (_, index) => {
            const volumeNumber = index + 1;
            return {
                id: null,
                index: volumeNumber,
                volumeNumber,
                status: 'planned' as const,
                active: volumeNumber === (this.volumeCurrent ?? 1),
            };
        });
    }

    private selectMangaPart(id: string): void {
        const part = this.parts.find((candidate) => candidate.id === id);
        if (!part) return;
        this.activePartId = part.id;
        this.chapterCurrent = part.chapterCurrent;
        this.chapterTotal = part.chapterTotal;
        this.volumeCurrent = part.volumeNumber;
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

    private bindTextarea(root: HTMLElement, selector: string, handler: (value: string) => void): void {
        this.qs<HTMLTextAreaElement>(root, selector)?.addEventListener('input', (event) => {
            handler((event.currentTarget as HTMLTextAreaElement).value);
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

    private async save(): Promise<void> {
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
            authors: this.authors,
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
            } satisfies Partial<MangaItem>);
        }

        await this.onSave(updates);
        this.close();
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

    private normalizeProgress(value: number | null, total: number | null): number | null {
        if (value === null) return null;
        const normalized = Math.max(0, Math.trunc(value));
        return total && total > 0 ? Math.min(normalized, total) : normalized;
    }

    private formatHumanDate(timestamp: number): string {
        if (!Number.isFinite(timestamp)) return t('editUnknown');
        const locale = i18n.getLanguage() === 'ru' ? 'ru-RU' : 'en-US';
        return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: '2-digit' }).format(new Date(timestamp));
    }

    private createSvgIcon(pathD: string): SVGElement {
        const svg = this.contentEl.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        const path = this.contentEl.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathD);
        svg.appendChild(path);
        return svg;
    }
}
