import { App, Modal, Notice, setIcon } from 'obsidian';
import { t } from '../localization';
import { createLorebaseDropdown } from '../components/LorebaseDropdown';
import type { AnimeFormat, AnimePart, AnimeStatus, GameStatus, ReadingStatus, UserRating, VideoStatus } from '../types';
import type { MediaKind } from '../services/integrations/types';

export type AddMode = 'provider' | 'manual';

export interface ManualCreateDraft {
    kind: MediaKind;
    title: string;
    year: string;
    released: string;
    status: GameStatus | AnimeStatus | VideoStatus | ReadingStatus;
    url: string;
    poster: string;
    posterHorizontal: string;
    posterFile: File | null;
    genres: string[];
    tags: string[];
    rating: UserRating;
    gameSeries: string;
    format: AnimeFormat;
    animeParts: AnimePart[];
    activeAnimePartId: string | null;
    seasonNumber: number | null;
    episodeCurrent: number | null;
    episodeTotal: number | null;
    pageCurrent: number | null;
    pageTotal: number | null;
    chapterCurrent: number | null;
    chapterTotal: number | null;
    volumeCurrent: number | null;
    volumeTotal: number | null;
}

export class AddModeModal extends Modal {
    private defaultKind: MediaKind;
    private resolve?: (mode: AddMode | null) => void;
    private hasResolved = false;

    constructor(app: App, defaultKind: MediaKind) {
        super(app);
        this.defaultKind = defaultKind;
    }

    openAndGetValue(): Promise<AddMode | null> {
        return new Promise(resolve => {
            this.resolve = resolve;
            this.open();
        });
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        this.modalEl.addClass('lorebase-manual-add-mode-container');
        contentEl.addClass('lorebase-select-modal');

        const shell = contentEl.createDiv({ cls: 'lorebase-add-mode-shell' });
        const header = shell.createDiv({ cls: 'lorebase-add-mode-header' });
        const titleRow = header.createDiv({ cls: 'lorebase-select-title-row' });
        const icon = titleRow.createSpan({ cls: 'lorebase-select-title-icon lorebase-add-mode-title-icon' });
        setIcon(icon, 'plus');
        titleRow.createEl('h2', { cls: 'lorebase-select-title', text: t('promptAddModeTitle') });
        header.createDiv({ cls: 'lorebase-select-review-subtitle', text: this.getKindLabel(this.defaultKind) });

        const body = shell.createDiv({ cls: 'lorebase-manual-mode-grid' });
        this.createModeButton(body, 'search', t('promptAddModeProvider'), t('promptAddModeProviderDesc'), () => this.resolveMode('provider'));
        this.createModeButton(body, 'file-plus-2', t('promptAddModeManual'), t('promptAddModeManualDesc'), () => this.resolveMode('manual'));

        const footer = shell.createDiv({ cls: 'lorebase-modal-actions lorebase-select-footer lorebase-add-mode-footer' });
        const cancel = footer.createEl('button', { cls: 'lorebase-flow-btn lorebase-flow-btn-secondary', attr: { type: 'button' } });
        const cancelIcon = cancel.createSpan({ cls: 'lorebase-flow-btn-icon' });
        setIcon(cancelIcon, 'x');
        cancel.createSpan({ cls: 'lorebase-flow-btn-label', text: t('commonCancel') });
        cancel.addEventListener('click', () => this.resolveMode(null));
    }

    onClose(): void {
        this.modalEl.removeClass('lorebase-manual-add-mode-container');
        if (!this.hasResolved) this.resolve?.(null);
        this.contentEl.empty();
    }

    private createModeButton(parent: HTMLElement, iconName: string, label: string, description: string, onClick: () => void): void {
        const button = parent.createEl('button', { cls: 'lorebase-manual-mode-card', attr: { type: 'button' } });
        const icon = button.createSpan({ cls: 'lorebase-manual-mode-icon' });
        setIcon(icon, iconName);
        const text = button.createDiv({ cls: 'lorebase-manual-mode-text' });
        text.createSpan({ cls: 'lorebase-manual-mode-label', text: label });
        text.createSpan({ cls: 'lorebase-manual-mode-desc', text: description });
        button.addEventListener('click', onClick);
    }

    private resolveMode(mode: AddMode | null): void {
        this.hasResolved = true;
        this.resolve?.(mode);
        this.close();
    }

    private getKindLabel(kind: MediaKind): string {
        switch (kind) {
            case 'games': return t('settingsGames');
            case 'anime': return t('settingsAnime');
            case 'movies': return t('settingsMovies');
            case 'series': return t('settingsSeries');
            case 'books': return t('settingsBooks');
            case 'manga': return t('settingsManga');
        }
    }
}

export class ManualCreateModal extends Modal {
    private draft: ManualCreateDraft;
    private resolve?: (draft: ManualCreateDraft | null) => void;
    private hasResolved = false;
    private previewObjectUrl: string | null = null;

    constructor(app: App, defaultKind: MediaKind) {
        super(app);
        this.draft = this.createDefaultDraft(defaultKind);
    }

    openAndGetValue(): Promise<ManualCreateDraft | null> {
        return new Promise(resolve => {
            this.resolve = resolve;
            this.open();
        });
    }

    onOpen(): void {
        this.modalEl.addClass('lorebase-manual-create-container');
        this.render();
    }

    onClose(): void {
        this.modalEl.removeClass('lorebase-manual-create-container');
        if (!this.hasResolved) this.resolve?.(null);
        this.revokePreviewUrl();
        this.contentEl.empty();
    }

    private render(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('lorebase-select-modal');

        const header = contentEl.createDiv({ cls: 'lorebase-select-header lorebase-manual-create-header' });
        const titleRow = header.createDiv({ cls: 'lorebase-select-title-row' });
        const titleIcon = titleRow.createSpan({ cls: 'lorebase-select-title-icon' });
        setIcon(titleIcon, 'file-plus-2');
        titleRow.createEl('h2', { cls: 'lorebase-select-title', text: t('manualCreateTitle') });

        const body = contentEl.createDiv({ cls: 'lorebase-manual-create-body' });
        this.renderCoverPanel(body);
        const form = body.createDiv({ cls: 'lorebase-manual-form' });
        this.renderCommonFields(form);
        this.renderSpecificFields(form);

        const footer = contentEl.createDiv({ cls: 'lorebase-modal-actions lorebase-select-footer' });
        const cancel = this.createFooterButton(footer, 'x', t('commonCancel'), 'secondary');
        const create = this.createFooterButton(footer, 'check', t('manualCreateAction'), 'primary');
        cancel.addEventListener('click', () => this.resolveDraft(null));
        create.addEventListener('click', () => {
            if (!this.draft.title.trim()) {
                new Notice(t('manualTitleRequired'));
                return;
            }
            this.resolveDraft(this.normalizeDraft(this.draft));
        });
    }

    private renderCommonFields(parent: HTMLElement): void {
        const main = this.createSection(parent, t('manualSectionMain'));
        this.createSelect(main, t('manualMediaType'), this.draft.kind, [
            ['games', t('settingsGames')],
            ['anime', t('settingsAnime')],
            ['movies', t('settingsMovies')],
            ['series', t('settingsSeries')],
            ['books', t('settingsBooks')],
            ['manga', t('settingsManga')],
        ], (value) => {
            const nextKind = value as MediaKind;
            this.draft = this.switchDraftKind(nextKind);
            this.render();
        });
        this.createInput(main, t('templateFieldName'), this.draft.title, (value) => this.draft.title = value, 'text', true);
        this.createInput(main, t('templateFieldYear'), this.draft.year, (value) => this.draft.year = value, 'number');
        this.createInput(main, t('templateFieldReleased'), this.draft.released, (value) => this.draft.released = value);
        this.createStatusSelect(main);
        this.createRatingStars(main);
    }

    private renderSpecificFields(parent: HTMLElement): void {
        if (this.draft.kind !== 'games') {
            const progress = this.createSection(parent, t('manualSectionProgress'));
            if (this.draft.kind === 'anime') {
                this.renderAnimePartsEditor(progress);
            } else if (this.draft.kind === 'movies' || this.draft.kind === 'series') {
                if (this.draft.kind === 'series') {
                    this.createNumberInput(progress, t('templateFieldSeasons'), this.draft.seasonNumber, (value) => this.draft.seasonNumber = value);
                }
                this.createNumberInput(progress, t('templateFieldEpisodeCurrent'), this.draft.episodeCurrent, (value) => this.draft.episodeCurrent = value);
                this.createNumberInput(progress, t('templateFieldEpisodeTotal'), this.draft.episodeTotal, (value) => this.draft.episodeTotal = value);
            } else if (this.draft.kind === 'books') {
                this.createNumberInput(progress, t('templateFieldPageCurrent'), this.draft.pageCurrent, (value) => this.draft.pageCurrent = value);
                this.createNumberInput(progress, t('templateFieldPageTotal'), this.draft.pageTotal, (value) => this.draft.pageTotal = value);
                this.createNumberInput(progress, t('templateFieldChapterCurrent'), this.draft.chapterCurrent, (value) => this.draft.chapterCurrent = value);
                this.createNumberInput(progress, t('templateFieldChapterTotal'), this.draft.chapterTotal, (value) => this.draft.chapterTotal = value);
            } else {
                this.createNumberInput(progress, t('templateFieldChapterCurrent'), this.draft.chapterCurrent, (value) => this.draft.chapterCurrent = value);
                this.createNumberInput(progress, t('templateFieldChapterTotal'), this.draft.chapterTotal, (value) => this.draft.chapterTotal = value);
                this.createNumberInput(progress, t('templateFieldVolumeCurrent'), this.draft.volumeCurrent, (value) => this.draft.volumeCurrent = value);
                this.createNumberInput(progress, t('templateFieldVolumeTotal'), this.draft.volumeTotal, (value) => this.draft.volumeTotal = value);
            }
        }

        const extra = this.createSection(parent, t('manualSectionExtra'));
        if (this.draft.kind === 'games') {
            this.createInput(extra, t('templateFieldGameSeries'), this.draft.gameSeries, (value) => this.draft.gameSeries = value);
        }
        this.createInput(extra, t('templateFieldUrl'), this.draft.url, (value) => this.draft.url = value);
        this.createChipEditor(extra, t('templateFieldGenres'), this.draft.genres, (values) => this.draft.genres = values);
        this.createChipEditor(extra, t('templateFieldTags'), this.draft.tags, (values) => this.draft.tags = values, '#');
    }

    private renderCoverPanel(parent: HTMLElement): void {
        const panel = parent.createDiv({ cls: 'lorebase-manual-cover-panel' });
        panel.createDiv({ cls: 'lorebase-manual-section-title', text: t('manualCoverTitle') });
        const preview = panel.createDiv({ cls: 'lorebase-manual-cover-preview' });
        const previewUrl = this.getPreviewUrl();
        if (previewUrl) {
            preview.setCssStyles({ backgroundImage: `url("${previewUrl.replace(/"/g, '\\"')}")` });
        } else {
            preview.addClass('is-empty');
            const icon = preview.createSpan({ cls: 'lorebase-manual-cover-empty-icon' });
            setIcon(icon, 'image');
        }

        const coverField = panel.createEl('label', { cls: 'lorebase-editmode-field' });
        coverField.createSpan({ cls: 'lorebase-editmode-field-label', text: t('manualCoverUrl') });
        const coverInput = coverField.createEl('input', { cls: 'lorebase-editmode-input', attr: { type: 'text' } });
        coverInput.value = this.draft.poster;
        coverInput.addEventListener('input', () => {
            const value = coverInput.value.trim();
            this.draft.poster = value;
            this.draft.posterHorizontal = value;
            this.draft.posterFile = null;
            this.revokePreviewUrl();
            preview.toggleClass('is-empty', !value);
            preview.setCssStyles({ backgroundImage: value ? `url("${value.replace(/"/g, '\\"')}")` : '' });
            if (!value && !preview.querySelector('.lorebase-manual-cover-empty-icon')) {
                const icon = preview.createSpan({ cls: 'lorebase-manual-cover-empty-icon' });
                setIcon(icon, 'image');
            } else if (value) {
                preview.querySelector('.lorebase-manual-cover-empty-icon')?.remove();
            }
        });

        const actions = panel.createDiv({ cls: 'lorebase-manual-cover-actions' });
        const fileInput = actions.createEl('input', {
            cls: 'lorebase-manual-cover-file',
            attr: { type: 'file', accept: 'image/*' },
        });
        const pick = actions.createEl('button', { cls: 'lorebase-flow-btn lorebase-flow-btn-secondary', attr: { type: 'button' } });
        const pickIcon = pick.createSpan({ cls: 'lorebase-flow-btn-icon' });
        setIcon(pickIcon, 'folder-open');
        pick.addClass('lorebase-manual-cover-icon-btn');
        pick.setAttr('aria-label', t('manualCoverChoose'));
        pick.setAttr('title', t('manualCoverChoose'));
        pick.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', () => {
            const file = fileInput.files?.[0] ?? null;
            if (!file) return;
            this.draft.posterFile = file;
            this.draft.poster = '';
            this.draft.posterHorizontal = '';
            this.revokePreviewUrl();
            this.previewObjectUrl = URL.createObjectURL(file);
            this.render();
        });

        const clear = actions.createEl('button', { cls: 'lorebase-flow-btn lorebase-flow-btn-secondary', attr: { type: 'button' } });
        const clearIcon = clear.createSpan({ cls: 'lorebase-flow-btn-icon' });
        setIcon(clearIcon, 'x');
        clear.addClass('lorebase-manual-cover-icon-btn');
        clear.setAttr('aria-label', t('manualCoverClear'));
        clear.setAttr('title', t('manualCoverClear'));
        clear.addEventListener('click', () => {
            this.draft.poster = '';
            this.draft.posterHorizontal = '';
            this.draft.posterFile = null;
            this.revokePreviewUrl();
            this.render();
        });
    }

    private createSection(parent: HTMLElement, title: string): HTMLElement {
        const section = parent.createDiv({ cls: 'lorebase-manual-form-section' });
        section.createDiv({ cls: 'lorebase-manual-section-title', text: title });
        return section.createDiv({ cls: 'lorebase-manual-section-grid' });
    }

    private createInput(parent: HTMLElement, label: string, value: string, onInput: (value: string) => void, type = 'text', wide = false): void {
        const field = parent.createEl('label', { cls: 'lorebase-editmode-field' });
        if (wide) field.addClass('is-wide');
        field.createSpan({ cls: 'lorebase-editmode-field-label', text: label });
        const input = field.createEl('input', { cls: 'lorebase-editmode-input', attr: { type } });
        input.value = value;
        input.addEventListener('input', () => onInput(input.value.trim()));
    }

    private createNumberInput(parent: HTMLElement, label: string, value: number | null, onInput: (value: number | null) => void): void {
        const field = parent.createEl('label', { cls: 'lorebase-editmode-field' });
        field.createSpan({ cls: 'lorebase-editmode-field-label', text: label });
        const input = field.createEl('input', { cls: 'lorebase-editmode-input', attr: { type: 'number', inputmode: 'numeric' } });
        input.value = value === null ? '' : String(value);
        input.addEventListener('input', () => onInput(this.parseNumber(input.value)));
    }

    private createRatingStars(parent: HTMLElement): void {
        const field = parent.createDiv({ cls: 'lorebase-editmode-field lorebase-manual-rating-field' });
        field.createSpan({ cls: 'lorebase-editmode-field-label', text: t('editRating') });
        const row = field.createDiv({ cls: 'lorebase-editmode-stars lorebase-manual-stars' });
        const render = (): void => {
            row.empty();
            for (let i = 1; i <= 5; i++) {
                const button = row.createEl('button', {
                    cls: 'lorebase-editmode-star',
                    text: String.fromCharCode(9733),
                    attr: { type: 'button', 'aria-label': `${t('editRating')} ${i}` },
                });
                button.toggleClass('is-active', this.draft.rating !== null && i <= this.draft.rating);
                button.addEventListener('click', () => {
                    this.draft.rating = this.draft.rating === i ? null : i as Exclude<UserRating, null>;
                    render();
                });
            }
        };
        render();
    }

    private createChipEditor(
        parent: HTMLElement,
        label: string,
        values: string[],
        onChange: (values: string[]) => void,
        prefix = ''
    ): void {
        const field = parent.createDiv({ cls: 'lorebase-editmode-field lorebase-manual-chip-field is-wide' });
        field.createSpan({ cls: 'lorebase-editmode-field-label', text: label });
        const chips = field.createDiv({ cls: 'lorebase-editmode-chip-row lorebase-manual-chip-row' });
        const inputRow = field.createDiv({ cls: 'lorebase-manual-chip-input-row' });
        const input = inputRow.createEl('input', {
            cls: 'lorebase-editmode-input lorebase-editmode-tag-input lorebase-manual-chip-input',
            attr: { type: 'text', placeholder: t('editTagPlaceholder') },
        });
        const commit = (): void => {
            const next = this.normalizeList([...values, ...this.splitList(input.value)]);
            input.value = '';
            onChange(next);
            this.render();
        };
        for (const value of values) {
            const chip = chips.createEl('button', {
                cls: 'lorebase-editmode-chip',
                text: `${prefix}${value}`,
                attr: { type: 'button', title: t('editRemoveHint') },
            });
            chip.addEventListener('click', () => {
                onChange(values.filter((entry) => entry !== value));
                this.render();
            });
        }
        const add = inputRow.createEl('button', {
            cls: 'lorebase-editmode-chip lorebase-editmode-chip-add lorebase-manual-chip-add is-action',
            text: '+',
            attr: { type: 'button', 'aria-label': label },
        });
        add.addEventListener('click', () => {
            input.focus();
            commit();
        });
        input.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ',') return;
            event.preventDefault();
            commit();
        });
        input.addEventListener('blur', () => {
            if (input.value.trim()) commit();
        });
    }

    private renderAnimePartsEditor(parent: HTMLElement): void {
        const shell = parent.createDiv({ cls: 'lorebase-manual-anime-parts is-wide' });
        const header = shell.createDiv({ cls: 'lorebase-manual-parts-header' });
        header.createDiv({ cls: 'lorebase-manual-parts-title', text: t('editAnimeParts') });
        const actions = header.createDiv({ cls: 'lorebase-manual-parts-actions' });
        const remove = actions.createEl('button', {
            cls: 'lorebase-editmode-btn lorebase-editmode-btn-tight',
            text: t('editRemovePart'),
            attr: { type: 'button' },
        });
        remove.disabled = this.draft.animeParts.length <= 1;
        remove.toggleClass('is-disabled', remove.disabled);
        remove.addEventListener('click', () => {
            if (this.draft.animeParts.length <= 1) return;
            const active = this.getActiveAnimePart();
            this.draft.animeParts = this.draft.animeParts.filter((part) => part.id !== active.id);
            this.draft.activeAnimePartId = this.draft.animeParts[0]?.id ?? null;
            this.syncAnimeDraftFromActivePart();
            this.render();
        });
        const add = actions.createEl('button', {
            cls: 'lorebase-editmode-btn lorebase-editmode-btn-tight',
            text: t('editAddPart'),
            attr: { type: 'button' },
        });
        add.addEventListener('click', () => {
            const nextIndex = this.draft.animeParts.length + 1;
            const part = this.createAnimePart('tv', `Season ${nextIndex}`, nextIndex);
            this.draft.animeParts.push(part);
            this.draft.activeAnimePartId = part.id;
            this.syncAnimeDraftFromActivePart();
            this.render();
        });

        const strip = shell.createDiv({ cls: 'lorebase-editmode-chip-row lorebase-editmode-part-strip lorebase-manual-part-strip' });
        for (const part of this.draft.animeParts) {
            const chip = strip.createEl('button', {
                cls: `lorebase-editmode-chip lorebase-editmode-part-chip ${part.id === this.draft.activeAnimePartId ? 'is-active' : ''}`,
                text: this.getAnimePartChipLabel(part),
                attr: { type: 'button', 'aria-pressed': String(part.id === this.draft.activeAnimePartId), 'data-status': part.status },
            });
            chip.addEventListener('click', () => {
                this.draft.activeAnimePartId = part.id;
                this.syncAnimeDraftFromActivePart();
                this.render();
            });
        }

        const active = this.getActiveAnimePart();
        const editor = shell.createDiv({ cls: 'lorebase-manual-part-editor' });
        this.createSelect(editor, t('editFormat'), active.kind, this.getFormatOptions().map((option) => [option.value, option.label]), (value) => {
            active.kind = value as AnimeFormat;
            if (active.kind !== 'tv') active.seasonNumber = null;
            this.syncAnimeDraftFromActivePart();
            this.render();
        });
        this.createInput(editor, t('templateFieldName'), active.title, (value) => {
            active.title = value;
        });
        this.createNumberInput(editor, t('editSeasonCurrent'), active.seasonNumber, (value) => {
            active.seasonNumber = value;
            this.syncAnimeDraftFromActivePart();
        });
        this.createNumberInput(editor, t('templateFieldEpisodeCurrent'), active.episodeCurrent, (value) => {
            active.episodeCurrent = value;
            this.syncAnimeDraftFromActivePart();
        });
        this.createNumberInput(editor, t('templateFieldEpisodeTotal'), active.episodeTotal, (value) => {
            active.episodeTotal = value;
            this.syncAnimeDraftFromActivePart();
        });
        this.createSelect(editor, t('templateFieldStatus'), active.status, [
            ['planned', t('statusPlanned')],
            ['watching', t('statusWatching')],
            ['completed', t('statusCompleted')],
        ], (value) => {
            active.status = value as AnimeStatus;
        });
    }

    private createSelect(parent: HTMLElement, label: string, value: string, options: Array<[string, string]>, onChange: (value: string) => void): void {
        const field = parent.createDiv({ cls: 'lorebase-editmode-field' });
        field.createSpan({ cls: 'lorebase-editmode-field-label', text: label });
        const dropdown = field.createDiv({ cls: 'lorebase-editmode-dropdown lorebase-manual-dropdown' });
        createLorebaseDropdown(
            dropdown,
            options.map(([optionValue, optionLabel]) => ({ value: optionValue, label: optionLabel })),
            value,
            onChange
        );
    }

    private createStatusSelect(parent: HTMLElement): void {
        const options = this.getStatusOptions(this.draft.kind);
        this.createSelect(parent, t('templateFieldStatus'), String(this.draft.status), options, (value) => {
            this.draft.status = value as ManualCreateDraft['status'];
        });
    }

    private createRatingSelect(parent: HTMLElement): void {
        this.createSelect(parent, t('editRating'), String(this.draft.rating ?? ''), [
            ['', '-'],
            ['1', '1'],
            ['2', '2'],
            ['3', '3'],
            ['4', '4'],
            ['5', '5'],
        ], (value) => {
            const parsed = this.parseNumber(value);
            this.draft.rating = parsed && parsed >= 1 && parsed <= 5 ? parsed as Exclude<UserRating, null> : null;
        });
    }

    private createFooterButton(parent: HTMLElement, iconName: string, label: string, variant: 'primary' | 'secondary'): HTMLButtonElement {
        const button = parent.createEl('button', {
            cls: variant === 'primary' ? 'lorebase-flow-btn lorebase-flow-btn-primary' : 'lorebase-flow-btn lorebase-flow-btn-secondary',
            attr: { type: 'button' },
        });
        const icon = button.createSpan({ cls: 'lorebase-flow-btn-icon' });
        setIcon(icon, iconName);
        button.createSpan({ cls: 'lorebase-flow-btn-label', text: label });
        return button;
    }

    private getStatusOptions(kind: MediaKind): Array<[string, string]> {
        if (kind === 'games') {
            return [
                ['not_started', t('statusNotStarted')],
                ['playing', t('statusPlaying')],
                ['completed', t('statusPlayed')],
                ['dropped', t('statusDropped')],
                ['wishlist', t('statusWishlist')],
                ['sandbox', t('statusSandbox')],
            ];
        }
        const watchingLabel = kind === 'books' || kind === 'manga' ? t('statusReading') : t('statusWatching');
        const plannedLabel = kind === 'books' || kind === 'manga' ? t('statusPlanToRead') : t('statusPlanned');
        return [
            ['planned', plannedLabel],
            ['watching', watchingLabel],
            ['completed', t('statusCompleted')],
            ['dropped', t('statusDropped')],
            ['paused', t('statusPaused')],
        ];
    }

    private createDefaultDraft(kind: MediaKind): ManualCreateDraft {
        return {
            kind,
            title: '',
            year: '',
            released: '',
            status: kind === 'games' ? 'not_started' : 'planned',
            url: '',
            poster: '',
            posterHorizontal: '',
            posterFile: null,
            genres: [],
            tags: [],
            rating: null,
            gameSeries: '',
            format: 'tv',
            animeParts: [this.createAnimePart('tv', 'Season 1', 1)],
            activeAnimePartId: 'tv-1',
            seasonNumber: kind === 'series' ? 1 : null,
            episodeCurrent: 0,
            episodeTotal: kind === 'movies' ? 1 : null,
            pageCurrent: 0,
            pageTotal: null,
            chapterCurrent: 0,
            chapterTotal: null,
            volumeCurrent: kind === 'manga' ? 1 : null,
            volumeTotal: null,
        };
    }

    private normalizeDraft(draft: ManualCreateDraft): ManualCreateDraft {
        return {
            ...draft,
            title: draft.title.trim(),
            year: draft.year.trim(),
            released: draft.released.trim(),
            url: draft.url.trim(),
            poster: draft.poster.trim(),
            posterHorizontal: (draft.posterHorizontal || draft.poster).trim(),
            genres: this.normalizeList(draft.genres),
            tags: this.normalizeList(draft.tags),
        };
    }

    private switchDraftKind(kind: MediaKind): ManualCreateDraft {
        const next = this.createDefaultDraft(kind);
        return {
            ...next,
            title: this.draft.title,
            year: this.draft.year,
            released: this.draft.released,
            url: this.draft.url,
            poster: this.draft.poster,
            posterHorizontal: this.draft.posterHorizontal,
            posterFile: this.draft.posterFile,
            genres: [...this.draft.genres],
            tags: [...this.draft.tags],
            rating: this.draft.rating,
        };
    }

    private createAnimePart(kind: AnimeFormat, title: string, seasonNumber: number | null): AnimePart {
        const used = new Set(this.draft?.animeParts?.map((part) => part.id) ?? []);
        let index = used.size + 1;
        let id = `${kind}-${index}`;
        while (used.has(id)) {
            index++;
            id = `${kind}-${index}`;
        }
        return {
            id,
            kind,
            title,
            seasonNumber,
            episodeCurrent: 0,
            episodeTotal: null,
            status: 'planned',
        };
    }

    private getActiveAnimePart(): AnimePart {
        return this.draft.animeParts.find((part) => part.id === this.draft.activeAnimePartId)
            ?? this.draft.animeParts[0]
            ?? this.createAnimePart('tv', 'Season 1', 1);
    }

    private syncAnimeDraftFromActivePart(): void {
        const active = this.getActiveAnimePart();
        this.draft.activeAnimePartId = active.id;
        this.draft.format = active.kind;
        this.draft.seasonNumber = active.seasonNumber;
        this.draft.episodeCurrent = active.episodeCurrent;
        this.draft.episodeTotal = active.episodeTotal;
    }

    private getAnimePartChipLabel(part: AnimePart): string {
        if (part.kind === 'tv') return `S${part.seasonNumber ?? '?'} ${part.episodeCurrent ?? 0}/${part.episodeTotal ?? '?'}`;
        return `${this.getFormatLabel(part.kind)} ${part.episodeCurrent ?? 0}/${part.episodeTotal ?? '?'}`;
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

    private getPreviewUrl(): string {
        return this.previewObjectUrl || this.draft.poster;
    }

    private revokePreviewUrl(): void {
        if (!this.previewObjectUrl) return;
        URL.revokeObjectURL(this.previewObjectUrl);
        this.previewObjectUrl = null;
    }

    private splitList(value: string): string[] {
        return this.normalizeList(value.split(/[,;\n]+/));
    }

    private normalizeList(values: string[]): string[] {
        return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
    }

    private parseNumber(value: string): number | null {
        if (!value.trim()) return null;
        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
    }

    private resolveDraft(draft: ManualCreateDraft | null): void {
        this.hasResolved = true;
        this.resolve?.(draft);
        this.close();
    }
}
