
import { getStatusOptionsForMediaType } from '../views/library/viewOptions';
import { addMobileModalClose } from '../components/MobileModalChrome';
import { App, Modal, Notice, setIcon } from 'obsidian';
import { i18n, t } from '../localization';
import { createLorebaseDropdown } from '../components/LorebaseDropdown';
import type { AnimeFormat, AnimePart, AnimeStatus, GameStatus, RatingScaleSettings, UserRating, VideoPart } from '../types';
import { createManualCreateTabs } from '../components/ManualCreateTabs';
import { createManualDate, createManualGroup, createManualNotes, createManualProgress, createManualRepeatCounter, createManualToggle, createManualTracking } from '../components/ManualCreateControls';
import { HierarchicalDatePicker, validateDatePickers } from './HierarchicalDatePicker';
import { createManualGamePlatforms } from '../components/ManualGamePlatforms';
import { trackingText } from '../components/RepeatTrackingControl';
import type { PlatformPlaythrough } from '../utils/repeatTracking';
import type { RatingCriterion, RelatedMediaLink } from '../types';
import { mountTenthsRating, paintRatingStar, updateRatingReadout, validateRatingInputs } from '../components/RatingInput';
import { CLASSIC_RATING_SETTINGS, getRatingMax, getRatingFromStarPosition, getRatingStarValues } from '../utils/rating';
import type { MediaKind } from '../services/integrations/types';
import { normalizeMediaWorkType, getMediaWorkTypeOptions, normalizeCountry, countryFieldLabel, countryOptions } from '../utils/mediaWorkType';

export interface ManualCreateDraft {
    discovery?: import('../types').DiscoveryContext;
    kind: MediaKind;
    title: string;
    year: string;
    released: string;
    workType: string;
    countryOfOrigin?: string;
    isAdult?: boolean;
    status: GameStatus | AnimeStatus;
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
    videoParts?: VideoPart[];
    activeVideoPartId?: string;
    seasonNumber: number | null;
    episodeCurrent: number | null;
    episodeTotal: number | null;
    pageCurrent: number | null;
    pageTotal: number | null;
    chapterCurrent: number | null;
    chapterTotal: number | null;
    volumeCurrent: number | null;
    volumeTotal: number | null;
    description?: string;
    myNotes?: string;
    favorite?: boolean;
    started?: string;
    finished?: string;
    repeatCount?: number;
    detailedRatings?: RatingCriterion[];
    relatedMedia?: RelatedMediaLink[];
    platforms?: string[];
    platformPlaythroughs?: PlatformPlaythrough[];
    developers?: string[];
    publishers?: string[];
    studios?: string[];
    directors?: string[];
    actors?: string[];
    networks?: string[];
    runtime?: string;
    authors?: string[];
    publisher?: string;
    artists?: string[];
}

const manualMediaTypes = ({ games: 'game', anime: 'anime', movies: 'movie', series: 'series', books: 'book', manga: 'manga' } as const);

export class ManualCreateModal extends Modal {
    private draft: ManualCreateDraft;
    private resolve?: (draft: ManualCreateDraft | null) => void;
    private hasResolved = false;
    private previewObjectUrl: string | null = null;
    private activeTab = 'main';
    private trackingOpen = false;
    private datePickers: HierarchicalDatePicker[] = [];
    private embeddedContainer?: HTMLElement;
    private inlineSubmit?: (draft: ManualCreateDraft) => void;
    private inlineBack?: () => void;
    private inlineClose?: () => void;
    private inlineExtraAction?: { label: string; action: () => void };

    mountInline(container: HTMLElement, onSubmit: (draft: ManualCreateDraft) => void, onBack: () => void, initialTitle?: string, onClose?: () => void, extraAction?: { label: string; action: () => void }): void {
        if (initialTitle !== undefined && !this.draft.title) this.draft.title = initialTitle;
        this.embeddedContainer = container;
        this.inlineSubmit = onSubmit;
        this.inlineBack = onBack;
        this.inlineClose = onClose;
        this.inlineExtraAction = extraAction;
        this.render();
    }

    disposeInline(): void {
        this.rememberTrackingState();
        this.destroyDatePickers();
        this.revokePreviewUrl();
        this.embeddedContainer = undefined;
        this.inlineSubmit = undefined;
        this.inlineBack = undefined;
        this.inlineClose = undefined;
        this.inlineExtraAction = undefined;
    }

    constructor(app: App, defaultKind: MediaKind, private readonly ratingSettings: RatingScaleSettings = CLASSIC_RATING_SETTINGS) {
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
        this.destroyDatePickers();
        this.modalEl.removeClass('lorebase-manual-create-container');
        if (!this.hasResolved) this.resolve?.(null);
        this.revokePreviewUrl();
        this.contentEl.empty();
    }

    private render(): void {
        this.rememberTrackingState();
        this.destroyDatePickers();
        const contentEl = this.embeddedContainer ?? this.contentEl;
        contentEl.empty();
        contentEl.addClass('lorebase-select-modal', 'lorebase-add-workspace', 'is-manual');

        const header = contentEl.createDiv({ cls: 'lorebase-select-header lorebase-manual-create-header' });
        addMobileModalClose(contentEl.closest<HTMLElement>('.modal') ?? this.embeddedContainer ?? this.modalEl, header, () => {
            if (this.inlineClose) this.inlineClose();
            else if (this.inlineBack) this.inlineBack();
            else this.close();
        });
        const titleRow = header.createDiv({ cls: 'lorebase-select-title-row' });
        const titleIcon = titleRow.createSpan({ cls: 'lorebase-select-title-icon' });
        setIcon(titleIcon, 'file-plus-2');
        titleRow.createEl('h2', { cls: 'lorebase-select-title', text: t('manualCreateTitle') });
        if (this.inlineExtraAction) {
            const action = this.inlineExtraAction;
            const inbox = titleRow.createEl('button', { cls: 'lorebase-select-header-action', text: action.label, attr: { type: 'button' } });
            inbox.addEventListener('click', action.action);
        }
        const category = titleRow.createDiv({ cls: 'lorebase-manual-category' });
        this.renderMediaSelector(category);

        const nav = contentEl.createDiv();
        const body = contentEl.createDiv({ cls: 'lorebase-manual-create-body' });
        const tabDefinitions = [{ id: 'main', label: t('manualSectionMain') }];
        if (this.draft.kind !== 'games') tabDefinitions.push({ id: 'progress', label: this.draft.kind === 'anime' || this.draft.kind === 'series' ? t('manualSeasonsProgress') : t('manualSectionProgress') });
        tabDefinitions.push({ id: 'extra', label: t('manualSectionExtra') });
        const panels = createManualCreateTabs(nav, body, tabDefinitions, this.activeTab, tab => { this.datePickers.forEach(picker => picker.close()); this.activeTab = tab; });
        const layout = panels.get('main')!.createDiv({ cls: 'lorebase-manual-create-layout' });
        const form = layout.createDiv({ cls: 'lorebase-manual-form' });
        this.renderCommonFields(form);
        const coverHost = layout.createEl('aside', { cls: 'lorebase-manual-cover-aside' });
        this.renderCoverPanel(coverHost);
        this.renderTrackingFields(panels.get('main')!);
        if (panels.has('progress')) this.renderProgressFields(panels.get('progress')!);
        this.renderExtraFields(panels.get('extra')!);

        const footer = contentEl.createDiv({ cls: 'lorebase-modal-actions lorebase-select-footer' });
        const cancel = this.createFooterButton(footer, this.embeddedContainer ? 'arrow-left' : 'x', t('commonCancel'), 'secondary');
        const create = this.createFooterButton(footer, 'plus', t('manualCreateAction'), 'primary');
        if (this.embeddedContainer) {
            const label = cancel.querySelector('.lorebase-flow-btn-label');
            if (label) label.textContent = t('manualBackToSearch');
        }
        cancel.addEventListener('click', () => this.resolveDraft(null));
        create.addEventListener('click', () => {
            if (!validateRatingInputs(contentEl)) return;
            if (!validateDatePickers(this.datePickers)) {
                const invalid = contentEl.querySelector<HTMLElement>('.is-invalid');
                const panel = invalid?.closest('[role="tabpanel"]');
                if (panel) contentEl.querySelector<HTMLButtonElement>(`[aria-controls="${panel.id}"]`)?.click();
                const tracking = invalid?.closest<HTMLDetailsElement>('.lorebase-manual-main-tracking');
                if (tracking) { tracking.open = true; this.trackingOpen = true; }
                invalid?.focus();
                return;
            }
            if (!this.draft.title.trim()) {
                new Notice(t('manualTitleRequired'));
                return;
            }
            this.resolveDraft(this.normalizeDraft(this.draft));
        });
    }

    private renderCommonFields(parent: HTMLElement): void {
        const main = this.createSection(parent, t('manualSectionMain'));
        this.createInput(main, t('templateFieldName'), this.draft.title, value => this.draft.title = value, 'text', true);
        if (['games', 'movies', 'series', 'manga'].includes(this.draft.kind)) {
            const type = this.draft.kind === 'games' ? 'game' : this.draft.kind === 'movies' ? 'movie' : this.draft.kind as 'series' | 'manga';
            this.draft.workType = normalizeMediaWorkType(type, this.draft.workType);
            this.createSelect(main, t('templateFieldWorkType'), this.draft.workType,
                getMediaWorkTypeOptions(type, i18n.getLanguage(), [this.draft.workType]).map(option => [option.value, option.label]),
                value => this.draft.workType = value);
        }
        if (this.draft.kind === 'anime') {
            this.createSelect(main, countryFieldLabel(i18n.getLanguage()), this.draft.countryOfOrigin || '', [['', t('commonNoData')], ...countryOptions(i18n.getLanguage()).map(option => [option.value, option.label] as [string, string])], value => this.draft.countryOfOrigin = normalizeCountry(value));
        }
        this.createInput(main, t('templateFieldYear'), this.draft.year, value => this.draft.year = value, 'number');
        this.datePickers.push(createManualDate(main, t('templateFieldReleased'), () => this.draft.released, value => this.draft.released = value));
        this.createStatusSelect(main);
        if (this.draft.kind === 'books') main.lastElementChild?.addClass('is-wide');
        this.createRatingStars(main);
    }

    private renderMediaSelector(parent: HTMLElement): void {
        this.createSelect(parent, t('manualMediaType'), this.draft.kind, [
            ['games', t('settingsGames')], ['anime', t('settingsAnime')],
            ['movies', t('settingsMovies')], ['series', t('settingsSeries')],
            ['books', t('settingsBooks')], ['manga', t('settingsManga')],
        ], value => {
            this.draft = this.switchDraftKind(value as MediaKind);
            this.activeTab = 'main';
            this.render();
        });
    }

    private renderProgressFields(parent: HTMLElement): void {
        if (this.draft.kind !== 'games') {
            if (this.draft.kind === 'anime' || this.draft.kind === 'series') {
                this.renderPartsEditor(parent, this.draft.kind === 'series');
                return;
            }
            const progress = parent.createDiv({ cls: 'lorebase-manual-progress-grid' });
            const pair = (current: 'episodeCurrent' | 'pageCurrent' | 'chapterCurrent' | 'volumeCurrent', total: 'episodeTotal' | 'pageTotal' | 'chapterTotal' | 'volumeTotal', label: string, totalLabel: string, color: string): void => {
                createManualProgress(progress, label, label, totalLabel, () => this.draft[current], () => this.draft[total], value => this.draft[current] = value, value => this.draft[total] = value, color, this.draft.kind === 'manga' && current === 'chapterCurrent');
            };
            if (this.draft.kind === 'movies') {
                pair('episodeCurrent', 'episodeTotal', t('templateFieldEpisodeCurrent'), t('templateFieldEpisodeTotal'), '#a6a1f5');
            } else if (this.draft.kind === 'books') {
                pair('pageCurrent', 'pageTotal', t('templateFieldPageCurrent'), t('templateFieldPageTotal'), '#26c6da');
                pair('chapterCurrent', 'chapterTotal', t('templateFieldChapterCurrent'), t('templateFieldChapterTotal'), '#ffb02e');
            } else {
                pair('chapterCurrent', 'chapterTotal', t('templateFieldChapterCurrent'), t('templateFieldChapterTotal'), '#26c6da');
                pair('volumeCurrent', 'volumeTotal', t('templateFieldVolumeCurrent'), t('templateFieldVolumeTotal'), '#ffb02e');
            }
        }
    }
    private renderTrackingDates(parent: HTMLElement): void {
        const dates = parent.createDiv({ cls: 'lorebase-manual-tracking-dates lorebase-manual-section-grid' });
        this.datePickers.push(createManualDate(dates, t('editStarted'), () => this.draft.started ?? '', value => this.draft.started = value));
        this.datePickers.push(createManualDate(dates, t('editFinished'), () => this.draft.finished ?? '', value => this.draft.finished = value));
    }

    private renderExtraFields(parent: HTMLElement): void {
        const layout = parent.createDiv({ cls: 'lorebase-manual-details-layout' });
        const extra = createManualGroup(layout, ({ ru: 'Сведения о произведении', uk: 'Відомості про твір', en: 'Work details', 'zh-CN': '作品信息' })[i18n.getLanguage()]);
        const list = (key: 'developers' | 'publishers' | 'studios' | 'directors' | 'actors' | 'networks' | 'authors' | 'artists', label: string): void => {
            this.createInput(extra, label, (this.draft[key] ?? []).join(', '), value => this.draft[key] = this.splitList(value));
        };
        if (this.draft.kind === 'games') {
            this.createInput(extra, t('templateFieldGameSeries'), this.draft.gameSeries, (value) => this.draft.gameSeries = value);
            this.createInput(extra, t('templateFieldUrl'), this.draft.url, value => this.draft.url = value);
            list('developers', t('templateFieldDevelopers')); list('publishers', t('templateFieldPublishers'));
            createManualGamePlatforms(extra, this.draft.platforms ?? [], this.draft.platformPlaythroughs ?? [], (platforms, entries) => {
                this.draft.platforms = platforms;
                this.draft.platformPlaythroughs = entries;
            });
        } else if (this.draft.kind === 'anime') {
            list('studios', t('templateFieldStudios'));
        } else if (this.draft.kind === 'movies' || this.draft.kind === 'series') {
            list('directors', t('templateFieldDirector')); list('actors', t('templateFieldActors'));
            this.createInput(extra, t('templateFieldRuntime'), this.draft.runtime ?? '', value => this.draft.runtime = value);
            if (this.draft.kind === 'series') {
                list('studios', t('templateFieldStudios'));
                list('networks', ({ ru: 'Телеканалы', uk: 'Телеканали', en: 'Networks', 'zh-CN': '电视网' })[i18n.getLanguage()]);
            }
        } else {
            list('authors', t('templateFieldAuthors'));
            if (this.draft.kind === 'books') this.createInput(extra, t('editPublisher'), this.draft.publisher ?? '', value => this.draft.publisher = value);
            else list('artists', t('templateFieldArtists'));
        }
        if (this.draft.kind !== 'games') this.createInput(extra, t('templateFieldUrl'), this.draft.url, value => this.draft.url = value, 'text', this.draft.kind === 'books' || this.draft.kind === 'manga');
        this.createChipEditor(extra, t('templateFieldGenres'), this.draft.genres, (values) => this.draft.genres = values);
        this.createChipEditor(extra, t('templateFieldTags'), this.draft.tags, (values) => this.draft.tags = values, '#');
        createManualNotes(layout, this.draft.description ?? '', this.draft.myNotes ?? '', (key, value) => this.draft[key] = value);
    }

    private renderTrackingFields(parent: HTMLElement): void {
        const tracking = createManualTracking(parent, this.trackingOpen, open => {
            this.trackingOpen = open;
            if (!open) this.datePickers.forEach(picker => picker.close());
        });
        this.renderTrackingDates(tracking);
        const options = tracking.createDiv({ cls: 'lorebase-manual-tracking-options is-wide' });
        createManualToggle(options, t('editFavorite'), this.draft.favorite ?? false, value => this.draft.favorite = value);
        if (['games', 'anime', 'manga'].includes(this.draft.kind)) createManualToggle(options, t('editAdult'), this.draft.isAdult ?? false, value => this.draft.isAdult = value);
        if (this.draft.kind !== 'books') {
            const label = trackingText(this.draft.kind === 'games' ? 'game' : this.draft.kind === 'manga' ? 'manga' : 'watch');
            createManualRepeatCounter(options, label, this.draft.repeatCount ?? 0, value => this.draft.repeatCount = value);
        }
    }

    private rememberTrackingState(): void {
        const details = (this.embeddedContainer ?? this.contentEl).querySelector<HTMLDetailsElement>('.lorebase-manual-main-tracking');
        if (details) this.trackingOpen = details.open;
    }

    private destroyDatePickers(): void {
        this.datePickers.forEach(picker => picker.destroy());
        this.datePickers = [];
    }

    private renderCoverPanel(parent: HTMLElement): void {
        const panel = parent.createDiv({ cls: 'lorebase-manual-cover-panel' });
        const preview = panel.createDiv({ cls: 'lorebase-manual-cover-preview' });
        preview.setAttr('role', 'button');
        preview.setAttr('tabindex', '0');
        preview.setAttr('aria-label', t('manualCoverChoose'));
        preview.setAttr('title', t('manualCoverChoose'));
        const previewUrl = this.getPreviewUrl();
        if (previewUrl) {
            preview.setCssStyles({ backgroundImage: `url("${previewUrl.replace(/"/g, '\\"')}")` });
        } else {
            preview.addClass('is-empty');
            const icon = preview.createSpan({ cls: 'lorebase-manual-cover-empty-icon' });
            setIcon(icon, 'image-plus');
            preview.createSpan({ cls: 'lorebase-manual-cover-caption', text: t('manualCoverTitle') });
        }

        const actions = panel.createDiv({ cls: 'lorebase-manual-cover-actions' });
        const tools = panel.createEl('details', { cls: 'lorebase-manual-cover-url-control' });
        tools.createEl('summary', { text: t('manualCoverLink') });
        const coverField = tools.createEl('label', { cls: 'lorebase-editmode-field is-wide' });
        coverField.createSpan({ cls: 'lorebase-editmode-field-label', text: t('manualCoverUrl') });
        const coverInput = coverField.createEl('input', { cls: 'lorebase-editmode-input', attr: { type: 'text' } });
        coverInput.value = this.draft.poster;
        coverInput.addEventListener('input', () => {
            const value = coverInput.value.trim();
            const previous = this.draft.poster;
            this.draft.poster = value;
            if (!this.draft.posterHorizontal || this.draft.posterHorizontal === previous) this.draft.posterHorizontal = value;
            this.draft.posterFile = null;
            this.revokePreviewUrl();
            clear.hidden = !value;
            preview.toggleClass('is-empty', !value);
            preview.setCssStyles({ backgroundImage: value ? `url("${value.replace(/"/g, '\\"')}")` : '' });
            if (!value && !preview.querySelector('.lorebase-manual-cover-empty-icon')) {
                const icon = preview.createSpan({ cls: 'lorebase-manual-cover-empty-icon' });
                setIcon(icon, 'image');
            } else if (value) {
                preview.querySelector('.lorebase-manual-cover-empty-icon')?.remove();
            }
            preview.querySelector('.lorebase-manual-cover-caption')?.remove();
            if (!value) preview.createSpan({ cls: 'lorebase-manual-cover-caption', text: t('manualCoverTitle') });
        });

        const fileInput = actions.createEl('input', {
            cls: 'lorebase-manual-cover-file',
            attr: { type: 'file', accept: 'image/*' },
        });
        const pick = actions.createEl('button', { cls: 'lorebase-flow-btn lorebase-flow-btn-secondary', attr: { type: 'button' } });
        const pickIcon = pick.createSpan({ cls: 'lorebase-flow-btn-icon' });
        setIcon(pickIcon, 'upload');
        pick.createSpan({ text: t('manualCoverChoose') });
        pick.addClass('lorebase-manual-cover-pick');
        pick.setAttr('aria-label', t('manualCoverChoose'));
        pick.setAttr('title', t('manualCoverChoose'));
        pick.addEventListener('click', () => fileInput.click());
        preview.addEventListener('click', () => fileInput.click());
        preview.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInput.click(); }
        });
        fileInput.addEventListener('change', () => {
            const file = fileInput.files?.[0] ?? null;
            if (!file) return;
            this.draft.posterFile = file;
            if (this.draft.posterHorizontal === this.draft.poster) this.draft.posterHorizontal = '';
            this.draft.poster = '';
            this.revokePreviewUrl();
            this.previewObjectUrl = URL.createObjectURL(file);
            this.render();
        });

        const clear = actions.createEl('button', { cls: 'lorebase-flow-btn lorebase-flow-btn-secondary', attr: { type: 'button' } });
        const clearIcon = clear.createSpan({ cls: 'lorebase-flow-btn-icon' });
        setIcon(clearIcon, 'x');
        clear.addClass('lorebase-manual-cover-icon-btn');
        if (!previewUrl) clear.hidden = true;
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
        if (title === t('manualSectionMain')) section.addClass('is-main');
        section.createDiv({ cls: 'lorebase-manual-section-title', text: title });
        return section.createDiv({ cls: 'lorebase-manual-section-grid' });
    }

    private createInput(
        parent: HTMLElement,
        label: string,
        value: string,
        onInput: (value: string) => void,
        type = 'text',
        wide = false,
        suggestions: Array<{ value: string; label: string }> = []
    ): void {
        const field = parent.createEl('label', { cls: 'lorebase-editmode-field' });
        if (wide) field.addClass('is-wide');
        field.createSpan({ cls: 'lorebase-editmode-field-label', text: label });
        const input = field.createEl('input', { cls: 'lorebase-editmode-input', attr: { type, 'aria-label': label } });
        if (suggestions.length) {
            const listId = `lorebase-work-types-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            input.setAttr('list', listId);
            const list = field.createEl('datalist', { attr: { id: listId } });
            suggestions.forEach((entry) => list.createEl('option', { attr: { value: entry.value, label: entry.label } }));
        }
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
        field.addClass('is-wide');
        field.createSpan({ cls: 'lorebase-editmode-field-label', text: t('editRating') });
        const controls = field.createDiv({ cls: 'lorebase-manual-rating-controls' });
        const row = controls.createDiv({ cls: 'lorebase-editmode-stars lorebase-manual-stars' });
        const media = manualMediaTypes[this.draft.kind];
        const valueLabel = controls.createSpan({ cls: 'lorebase-manual-rating-value', attr: { 'aria-live': 'polite' } });
        row.toggleClass('is-custom-scale', this.ratingSettings.mode === 'custom');
        const render = (): void => {
            updateRatingReadout(valueLabel, this.draft.rating, this.draft.rating ? `${this.draft.rating} / ${getRatingMax(this.ratingSettings)}` : t('manualNoRating'));
            row.empty();
            for (const i of getRatingStarValues(this.ratingSettings)) {
                const button = row.createEl('button', {
                    cls: 'lorebase-editmode-star',
                    text: String.fromCharCode(9733),
                    attr: { type: 'button', 'aria-label': `${t('editRating')} ${i}` },
                });
                paintRatingStar(button, i, this.draft.rating, this.ratingSettings, media);
                button.addEventListener('click', (event) => {
                    const rect = button.getBoundingClientRect();
                    const next = event.detail === 0
                        ? i
                        : getRatingFromStarPosition(i, event.clientX - rect.left, rect.width, this.ratingSettings);
                    this.draft.rating = this.draft.rating === next ? null : next;
                    render();
                });
            }
        };
        mountTenthsRating(valueLabel, this.ratingSettings, () => this.draft.rating, value => {
            this.draft.rating = value;
            render();
        });
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
            attr: { type: 'text', placeholder: label, 'aria-label': label },
        });
        let currentValues = [...values];
        const commit = (): void => {
            const next = this.normalizeList([...currentValues, ...this.splitList(input.value)]);
            input.value = '';
            onChange(next);
            currentValues = next;
            renderChips();
        };
        const renderChips = (): void => {
            chips.empty();
            for (const value of currentValues) {
            const chip = chips.createEl('button', {
                cls: 'lorebase-editmode-chip',
                text: `${prefix}${value}`,
                attr: { type: 'button', title: t('editRemoveHint') },
            });
            chip.addEventListener('click', () => {
                currentValues = currentValues.filter(entry => entry !== value);
                onChange(currentValues);
                renderChips();
            });
            }
        };
        renderChips();
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

    private renderPartsEditor(parent: HTMLElement, series: boolean): void {
        const parts: Array<AnimePart | VideoPart> = series
            ? (this.draft.videoParts ??= [{ id: 'season-1', kind: 'season', title: this.seasonTitle(1), seasonNumber: this.draft.seasonNumber ?? 1, episodeCurrent: this.draft.episodeCurrent, episodeTotal: this.draft.episodeTotal, status: 'planned' }])
            : this.draft.animeParts;
        const activeId = series ? this.draft.activeVideoPartId : this.draft.activeAnimePartId;
        const active = parts.find(part => part.id === activeId) ?? parts[0];
        const sync = (part: AnimePart | VideoPart): void => {
            if (series) this.draft.activeVideoPartId = part.id;
            else { this.draft.activeAnimePartId = part.id; this.draft.format = (part as AnimePart).kind; }
            this.draft.seasonNumber = part.seasonNumber;
            this.draft.episodeCurrent = part.episodeCurrent;
            this.draft.episodeTotal = part.episodeTotal;
        };
        const header = parent.createDiv({ cls: 'lorebase-manual-seasons-header' });
        header.createSpan({ text: t('manualSeasonsProgress') });
        const add = header.createEl('button', { cls: 'lorebase-editmode-btn lorebase-editmode-btn-tight', text: t('editAddPart'), attr: { type: 'button', 'data-action': 'add-part' } });
        add.addEventListener('click', () => {
            const number = Math.max(0, ...parts.map(part => part.seasonNumber ?? 0)) + 1;
            let id = 'season-' + number;
            let suffix = 1;
            while (parts.some(part => part.id === id)) id = 'season-' + number + '-' + suffix++;
            const part: AnimePart | VideoPart = series
                ? { id, kind: 'season', title: this.seasonTitle(number), seasonNumber: number, episodeCurrent: 0, episodeTotal: null, status: 'planned' }
                : this.createAnimePart('tv', this.seasonTitle(number), number);
            parts.push(part); sync(part); this.render();
        });
        const layout = parent.createDiv({ cls: 'lorebase-manual-seasons-layout' });
        const list = layout.createDiv({ cls: 'lorebase-manual-seasons-list', attr: { role: 'group', 'aria-label': t('manualSeasonsProgress') } });
        for (const part of parts) {
            const button = list.createEl('button', { cls: 'lorebase-manual-season-row', attr: { type: 'button', 'aria-pressed': String(part.id === active.id), 'data-part-id': part.id } });
            button.createSpan({ cls: 'lorebase-manual-season-name', text: part.title || this.seasonTitle(part.seasonNumber ?? 1) });
            button.createSpan({ cls: 'lorebase-manual-season-progress', text: String(part.episodeCurrent ?? 0) + ' / ' + String(part.episodeTotal ?? '—') });
            button.addEventListener('click', () => { sync(part); this.render(); });
        }
        const editor = layout.createDiv({ cls: 'lorebase-manual-season-fields' });
        this.createInput(editor, t('templateFieldName'), active.title, value => {
            active.title = value;
            const name = list.querySelector<HTMLElement>('[aria-pressed="true"] .lorebase-manual-season-name');
            if (name) name.textContent = value || this.seasonTitle(active.seasonNumber ?? 1);
        }, 'text', true);
        if (!series) this.createSelect(editor, t('editFormat'), active.kind, this.getFormatOptions().map(option => [option.value, option.label]), value => {
            (active as AnimePart).kind = value as AnimeFormat;
            if (value !== 'tv') active.seasonNumber = null;
            sync(active); this.render();
        });
        if (series || active.kind === 'tv') this.createNumberInput(editor, t('editSeasonCurrent'), active.seasonNumber, value => { active.seasonNumber = value; sync(active); });
        const updateProgress = (): void => {
            sync(active);
            const label = list.querySelector<HTMLElement>('[aria-pressed="true"] .lorebase-manual-season-progress');
            if (label) label.textContent = String(active.episodeCurrent ?? 0) + ' / ' + String(active.episodeTotal ?? '—');
        };
        const episodeProgress = editor.createDiv({ cls: 'is-wide lorebase-manual-episode-progress' });
        createManualProgress(episodeProgress, t('templateFieldEpisodeCurrent'), t('templateFieldEpisodeCurrent'), t('templateFieldEpisodeTotal'),
            () => active.episodeCurrent, () => active.episodeTotal,
            value => { active.episodeCurrent = value; updateProgress(); }, value => { active.episodeTotal = value; updateProgress(); }, '#a6a1f5');
        this.createSelect(editor, t('templateFieldStatus'), active.status, this.getStatusOptions(series ? 'series' : 'anime'), value => { active.status = value as AnimeStatus; });
        const actions = editor.createDiv({ cls: 'lorebase-manual-season-actions is-wide' });
        const remove = actions.createEl('button', { cls: 'lorebase-editmode-btn lorebase-editmode-btn-tight', text: t('editRemovePart'), attr: { type: 'button', 'data-action': 'remove-part' } });
        remove.disabled = parts.length <= 1;
        remove.addEventListener('click', () => {
            if (parts.length <= 1) return;
            parts.splice(parts.findIndex(part => part.id === active.id), 1);
            sync(parts[0]); this.render();
        });
    }

    private seasonTitle(number: number): string {
        return ({ ru: 'Сезон ', uk: 'Сезон ', en: 'Season ', 'zh-CN': '季 ' })[i18n.getLanguage()] + number;
    }

    private createSelect(parent: HTMLElement, label: string, value: string, options: Array<[string, string]>, onChange: (value: string) => void): void {
        const field = parent.createDiv({ cls: 'lorebase-editmode-field' });
        field.createSpan({ cls: 'lorebase-editmode-field-label', text: label });
        const dropdown = field.createDiv({ cls: 'lorebase-editmode-dropdown lorebase-manual-dropdown' });
        createLorebaseDropdown(
            dropdown,
            options.map(([optionValue, optionLabel]) => ({ value: optionValue, label: optionLabel })),
            value,
            onChange,
            { floating: true, panelClass: 'lorebase-manual-options' }
        );
    }

    private createStatusSelect(parent: HTMLElement): void {
        const options = this.getStatusOptions(this.draft.kind);
        this.createSelect(parent, t('templateFieldStatus'), String(this.draft.status), options, (value) => {
            this.draft.status = value as ManualCreateDraft['status'];
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
        const media = manualMediaTypes[kind];
        return getStatusOptionsForMediaType(media).map(option => [option.status, option.label]);
    }

    private createDefaultDraft(kind: MediaKind): ManualCreateDraft {
        const firstPart = this.createAnimePart('tv', this.seasonTitle(1), 1);
        return {
            kind,
            title: '',
            year: '',
            released: '',
            workType: kind === 'games' ? 'Game' : kind === 'movies' ? 'Movie' : kind === 'series' ? 'Series' : kind === 'manga' ? 'Manga' : '',
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
            animeParts: [firstPart],
            activeAnimePartId: firstPart.id,
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
            workType: ['games', 'movies', 'series', 'manga'].includes(draft.kind) ? normalizeMediaWorkType(draft.kind === 'games' ? 'game' : draft.kind === 'movies' ? 'movie' : draft.kind as 'series' | 'manga', draft.workType) : '',
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
            workType: kind === 'games' ? 'Game' : kind === 'movies' ? 'Movie' : kind === 'series' ? 'Series' : kind === 'manga' ? 'Manga' : '',
            url: this.draft.url,
            poster: this.draft.poster,
            posterHorizontal: this.draft.posterHorizontal,
            posterFile: this.draft.posterFile,
            genres: [...this.draft.genres],
            tags: [...this.draft.tags],
            rating: this.draft.rating,
            description: this.draft.description, myNotes: this.draft.myNotes, discovery: this.draft.discovery,
            favorite: this.draft.favorite, started: this.draft.started, finished: this.draft.finished,
            detailedRatings: this.draft.detailedRatings, relatedMedia: this.draft.relatedMedia,
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

    private getFormatOptions(): Array<{ value: AnimeFormat; label: string }> {
        return [
            { value: 'tv', label: t('formatTv') },
            { value: 'movie', label: t('formatMovie') },
            { value: 'ova', label: t('formatOva') },
            { value: 'ona', label: t('formatOna') },
            { value: 'special', label: t('formatSpecial') },
        ];
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
        this.rememberTrackingState();
        if (this.embeddedContainer) {
            if (draft) this.inlineSubmit?.(draft); else this.inlineBack?.();
            return;
        }
        this.hasResolved = true;
        this.resolve?.(draft);
        this.close();
    }
}
