import { mountStatusReason, syncStatusReason } from '../components/StatusReasonField';
import { syncNotesReader } from '../components/NotesReader';
import { mountDiscovery } from '../components/DiscoveryContext';
import { mountReleaseDate } from '../components/ReleaseDateField';
import { normalizeReleaseDate } from '../utils/releaseDates';
import { HierarchicalDatePicker, validateDatePickers } from './HierarchicalDatePicker';
import { bindPriority } from '../components/PriorityControl';

import { DeezerInlinePlayer, type DeezerPreviewTarget } from '../components/DeezerInlinePlayer';
import { MusicDiscoveryPanel } from '../components/MusicDiscoveryPanel';
import { TrackArtistCredits } from '../components/TrackArtistCredits';
import { ArtistDiscographyModal } from './ArtistDiscographyModal';
import { renderCountriesControl, validateCountriesControl } from '../components/CountriesControl';
import { preserveScroll } from '../utils/preserveScroll';
import { DetailedRatingEditor } from './DetailedRatingEditor';
import { App, Menu, Modal, Notice, TFile, setIcon } from 'obsidian';
import { DEFAULT_COVER, STATUS_ICON_MAP } from '../constants';
import { finishTrackingPanel } from '../components/EditTrackingPanel';
import { i18n, t } from '../localization';
import { mt } from '../localization/music';
import { compactGameText } from '../localization/compactGameEditor';
import type { LorebaseSettings, MusicItem, MusicTrack } from '../types';
import { MusicCatalog } from '../services/MusicCatalog';
import { trackArtistDeezerId } from '../services/integrations/providers/musicTrackCredits';
import { MusicService } from '../services/MusicService';
import { durationSeconds, formatDuration, formatMusicTotal, musicTrackGroups, musicTrackSummary, statusAfterTrackChange, trackGuestNames } from '../services/media/music';
import { mountTenthsRating, paintRatingStar, updateRatingReadout, validateRatingInputs } from '../components/RatingInput';
import { getRatingMax, getRatingFromStarPosition } from '../utils/rating';
import { setupMobileEditor } from './mobileEditor';
import { appendEditorTemplate, bindCompactEditorChrome, buildCompactCoverIdentity, buildCompactQuickSettings, buildEditorHeaderActions, buildEditorTimestampRows, buildSummaryNotesPanel, focusSummaryNotes, formatCompactEditorRating } from './compactEditorLayout';
import { bindCompactEditorChips, buildCompactEditorChips } from './compactEditorChips';
import { getStatusOptionsForMediaType } from '../views/library/viewOptions';
import { getStatusAppearance } from '../statusPresentation';
import type { MusicStatus } from '../types';

const QUICK_MUSIC_STATUSES: readonly MusicStatus[] = ['to_be_released', 'on_repeat'];

export class MusicEditModal extends Modal {
    private draft: MusicItem;
    private saving = false;
    private detailedRatingEditor: DetailedRatingEditor;
    private ready = false;
    private releaseDatePicker?: HierarchicalDatePicker;
    private alive = false;
    private extract = new Set<string>();
    private trackList!: HTMLElement;
    private progress!: HTMLElement;
    private status!: HTMLElement;
    private lastRegularStatus: MusicStatus = 'planned';
    private readonly compact: boolean;
    private compactChips?: ReturnType<typeof bindCompactEditorChips>;
    private notesDirty = false;
    private discovery?: MusicDiscoveryPanel;
    private player?: DeezerInlinePlayer;
    private trackCredits = new Map<string, TrackArtistCredits>();
    private creditGeneration = 0;
    private readonly onKeydown = (event: KeyboardEvent): void => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && !event.isComposing) {
            event.preventDefault();
            void this.save();
        }
    };
    constructor(app: App, item: MusicItem, private settings: LorebaseSettings, private service: MusicService,
        private persist: (draft: MusicItem) => Promise<void>, private remove?: () => void) {
        super(app);
        this.compact = settings.updatedEditor;
        this.detailedRatingEditor = new DetailedRatingEditor(item.detailedRatings, item.type, settings.ratingScale);
        this.draft = { ...item, tracks: item.tracks.map(track => ({ ...track })), genres: [...item.genres], tags: [...item.tags] };
        this.draft.releaseDate = normalizeReleaseDate(item.releaseDate) || null;
    }
    async onOpen(): Promise<void> {
        this.alive = true;
        this.modalEl.addClass('lorebase-editmode-modal-shell', 'lorebase-edit-modal-container', 'lorebase-music-edit-modal');
        this.modalEl.toggleClass('lorebase-music-compact-modal', this.compact);
        if (this.compact) this.modalEl.addEventListener('keydown', this.onKeydown);
        this.contentEl.addClass('lorebase-edit-modal', 'lorebase-modal-root');
        this.contentEl.empty();
        this.contentEl.createDiv({ text: '…', attr: { role: 'status' } });
        try {
            if (this.draft.filePath) this.draft.myNotes = await this.service.readNotes(this.draft);
            if (!this.alive) return;
            this.ready = true;
            this.render();
            if (!this.draft.description && this.draft.integrationId) void this.loadDescription();
        } catch { if (this.alive) this.contentEl.setText(mt('error')); }
    }
    private async loadDescription(): Promise<void> {
        const provider = this.draft.integrationProvider;
        if ((provider !== 'musicbrainz' && provider !== 'lastfm' && provider !== 'deezer') || !this.draft.integrationId) return;
        try {
            const item = await new MusicCatalog(() => this.settings.music.lastfmApiKey, provider => this.settings.music.providerEnabled?.[provider] !== false).details({
                id: this.draft.integrationId, provider, kind: this.draft.musicKind, title: this.draft.displayName,
                artist: this.draft.artist, image: this.draft.imageUrl, year: String(this.draft.year || ''),
            });
            if (!this.alive || this.saving || this.draft.description) return;
            this.draft.description = item.description;
            const field = this.contentEl.querySelector<HTMLTextAreaElement>('.lorebase-editmode-notes-input');
            if (field && field.getAttribute('aria-label') === t('editDescription')) {
                field.value = item.description;
                this.updateNotesCount(field);
            }
        } catch { /* Existing notes stay editable while the provider is unavailable. */ }
    }
    private render(): void {
        this.releaseDatePicker?.destroy();
        this.creditGeneration++;
        this.clearTrackCredits();
        this.compactChips?.destroy();
        this.discovery?.destroy();
        this.player?.destroy();
        this.player = undefined;
        this.contentEl.empty();
        const root = this.contentEl.createDiv({ cls: 'lorebase-editmode-root lorebase-modal-panel' });
        const view = root.createDiv({ cls: 'lorebase-editmode-view' });
        const breadcrumb = this.renderHeader(view);
        const originalTitle = this.draft.displayName;
        const editTitle = (value: string): void => {
            this.draft.displayName = value;
            breadcrumb.textContent = `${mt('editing')} / ${value.trim() || originalTitle}`;
        };
        const grid = view.createDiv({ cls: 'lorebase-editmode-grid' });
        const left = grid.createEl('aside', { cls: 'lorebase-editmode-column lorebase-editmode-column-left' });
        const center = grid.createEl('main', { cls: 'lorebase-editmode-column lorebase-editmode-column-center' });
        const right = grid.createEl('aside', { cls: 'lorebase-editmode-column lorebase-editmode-column-right' });
        const posterPanel = this.panel(left, t('editPoster'), 'lorebase-editmode-poster-card');
        if (this.compact) posterPanel.querySelector('h3')?.remove();
        const art = posterPanel.createDiv({ cls: 'lorebase-music-editor-art' });
        const mode = this.draft.musicKind === 'album' ? this.settings.music.albumCoverMode : this.settings.music.trackCoverMode;
        art.toggleClass('is-vinyl', mode === 'vinyl');
        art.toggleClass('is-cd', mode === 'cd');
        const image = art.createEl('img', { attr: { src: this.draft.imageUrl || DEFAULT_COVER, alt: this.draft.displayName } });
        art.createDiv({ cls: 'lorebase-music-cd-case', attr: { 'aria-hidden': 'true' } });
        image.addEventListener('error', () => { if (image.getAttribute('src') !== DEFAULT_COVER) image.src = DEFAULT_COVER; });
        const noteToggle = this.compact ? this.renderCoverIdentity(posterPanel, editTitle) : this.renderLegacyIdentity(center, editTitle);
        const extra = right.createEl('details', { cls: 'lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-advanced' });
        const extraHeader = extra.createEl('summary', { cls: 'lorebase-editmode-panel-title-row lorebase-editmode-collapsible-summary' });
        extraHeader.createEl('h3', { cls: 'lorebase-editmode-panel-title', text: t('editAdvanced') });
        extraHeader.createSpan({ cls: 'lorebase-editmode-collapsible-caret', text: 'v', attr: { 'aria-hidden': 'true' } });
        const extraFields = extra.createDiv({ cls: 'lorebase-editmode-advanced-grid' });
        if (this.compact) extraFields.createDiv({ attr: { 'data-role': 'compact-countries' } });
        renderCountriesControl(this.contentEl, this.draft, codes => this.draft.countries = codes);
        if (this.compact && this.draft.musicKind === 'track') {
            this.input(extraFields, mt('album'), this.draft.album, value => this.draft.album = value, 'album');
        }
        this.input(extraFields, mt('cover'), this.draft.poster || '', value => {
            this.draft.poster = value;
            const file = this.app.vault.getFileByPath(value);
            image.src = file ? this.app.vault.getResourcePath(file) : /^(https?:|data:image\/)/i.test(value) ? value : DEFAULT_COVER;
        }, 'poster');
        this.input(extraFields, t('templateFieldReleased'), this.draft.releaseDate || '', value => {
            this.draft.releaseDate = value.trim() || null;
            if (value && !this.draft.year) {
                this.draft.year = Number(value.slice(0, 4)) || null;
                const year = root.querySelector<HTMLInputElement>('[data-field="year"]');
                if (year) year.value = this.draft.year?.toString() ?? '';
            }
        }, 'released');
        this.releaseDatePicker = mountReleaseDate(root, () => this.draft.releaseDate ?? '', value => this.draft.releaseDate = value);
        const sourceInput = this.input(extraFields, 'URL', this.draft.sourceUrl || '', value => {
            this.draft.sourceUrl = value; this.renderSource(source);
        });
        sourceInput.type = 'url';
        if (this.draft.filePath) {
            const path = extraFields.createDiv({ cls: 'lorebase-editmode-path-row' });
            path.createSpan({ cls: 'lorebase-editmode-field-label', text: t('editLocalPath') });
            path.createEl('code', { cls: 'lorebase-editmode-local-path', text: this.draft.filePath });
            this.button(path, t('editOpen'), () => { void this.app.workspace.openLinkText(this.draft.filePath, ''); });
        }
        this.renderQuickSettings(left);
        if (!this.compact) this.renderNotes(center, noteToggle);
        this.renderPersonal(root, center);
        if (this.compact) this.renderNotes(center, noteToggle);
        mountDiscovery(root, this.draft.discovery, value => this.draft.discovery = value, this.app);
        mountStatusReason(root,this.draft.statusReasons,this.draft.status,value=>this.draft.statusReasons=value,this.app);
        if (this.draft.musicKind === 'album') {
            const tracks = this.panel(center, mt('tracklist'), 'lorebase-music-tracklist-panel');
            tracks.dataset.mobilePane = 'personal';
            const trackHeader = tracks.createDiv({ cls: 'lorebase-music-tracklist-header' });
            trackHeader.appendChild(tracks.querySelector('h3')!);
            this.progress = tracks.createDiv({ cls: 'lorebase-music-progress', attr: { 'aria-live': 'polite' } });
            const controls = trackHeader.createDiv({ cls: 'lorebase-music-actions lorebase-music-tracklist-tools' });
            const overflow = this.iconButton(controls, 'ellipsis', mt('listActions'), () => {
                const menu = new Menu();
                const all = this.draft.tracks.length > 0 && this.draft.tracks.every(track => track.listened);
                menu.addItem(item => item.setTitle(mt(all ? 'resetTracks' : 'completeAll')).setIcon('check-check').setDisabled(!this.draft.tracks.length).onClick(() => {
                    this.draft.tracks.forEach(track => track.listened = !all); this.updateProgress(); this.renderTracks();
                }));
                menu.addItem(item => item.setTitle(mt('addTrack')).setIcon('plus').onClick(() => this.addTrack()));
                this.showMusicMenu(menu, overflow);
            });
            this.trackList = tracks.createDiv({ cls: 'lorebase-music-tracklist' });
            this.player = this.createInlinePlayer();
            this.updateProgress(false);
            this.renderTracks();
        }
        if (this.compact) {
            const chips = right.createEl('section', { cls: 'lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-editmode-tags' });
            appendEditorTemplate(chips, buildCompactEditorChips());
            this.compactChips = bindCompactEditorChips(root, {
                tags: { read: () => this.draft.tags, write: values => { this.draft.tags = values; }, normalize: value => value.trim().replace(/^#+/, '').trim() || null },
                genres: { read: () => this.draft.genres, write: values => { this.draft.genres = values; }, normalize: value => value.trim() || null },
            });
        } else {
            const tags = this.panel(right, t('tags'), 'lorebase-editmode-tags');
            this.chips(tags, t('tags'), this.draft.tags, true, true);
        }
        this.discovery = new MusicDiscoveryPanel(this.app, right, this.draft, this.settings, this.service);
        root.querySelectorAll<HTMLInputElement>('[data-field="artist"], [data-field="title"]').forEach(input => {
            input.addEventListener('change', () => {
                this.discovery?.refreshIdentity();
                if (this.draft.musicKind === 'album') {
                    if (input.dataset.field === 'artist') this.renderTracks();
                    void this.loadTrackCredits();
                }
                if (this.draft.musicKind === 'track') this.player?.updateQuery('single', { title: this.draft.displayName, artist: this.draft.artist, deezerId: this.draft.integrationProvider === 'deezer' ? this.draft.integrationId || undefined : undefined });
            });
        });
        const source = this.panel(right, t('editSource'), 'lorebase-editmode-panel-glass lorebase-source-panel');
        this.renderSource(source);
        const file = this.draft.filePath ? this.app.vault.getAbstractFileByPath(this.draft.filePath) : null;
        if (file instanceof TFile) {
            const dates = this.compact ? extraFields : this.panel(right, t('editDates'), 'lorebase-editmode-panel-glass lorebase-editmode-timestamps');
            appendEditorTemplate(dates, buildEditorTimestampRows());
            for (const [role, value] of [['ts-added', file.stat.ctime], ['ts-updated', file.stat.mtime]] as const) {
                dates.querySelector<HTMLElement>(`[data-role="${role}"]`)!.textContent = new Date(value).toLocaleDateString(i18n.getLanguage(), { day: 'numeric', month: 'short', year: 'numeric' });
            }
        }
        if (this.compact) bindCompactEditorChrome(root, this.modalEl, () => this.close());
        setupMobileEditor(root, () => { void this.save(); });
        if (this.draft.musicKind === 'album') void this.loadTrackCredits();
    }

    private renderHeader(view: HTMLElement): HTMLElement {
        const header = view.createEl('header', { cls: 'lorebase-editmode-header' });
        const breadcrumb = header.createDiv({ cls: 'lorebase-editmode-header-left' }).createSpan({
            cls: 'lorebase-editmode-breadcrumb', text: `${mt('editing')} / ${this.draft.displayName}`,
        });
        const actions = header.createDiv({ cls: 'lorebase-editmode-header-right' });
        const showMenu = (button: HTMLElement): void => {
            const menu = new Menu();
            menu.addItem(item => item.setTitle(t('contextDelete')).setIcon('trash-2').onClick(() => { this.close(); this.remove?.(); }));
            const rect = button.getBoundingClientRect(); menu.showAtPosition({ x: rect.right, y: rect.bottom });
        };
        if (this.compact) {
            appendEditorTemplate(actions, buildEditorHeaderActions(true));
            actions.querySelector('[data-action="discard"]')?.addEventListener('click', () => this.close());
            actions.querySelector('[data-action="save"]')?.addEventListener('click', () => void this.save());
            const overflow = actions.querySelector<HTMLButtonElement>('[data-action="overflow"]')!;
            if (this.remove) overflow.addEventListener('click', () => showMenu(overflow));
            else overflow.remove();
        } else {
            this.button(actions, t('editCancel'), () => this.close());
            this.button(actions, t('editSave'), () => void this.save(), true);
            if (this.remove) this.iconButton(actions, 'ellipsis', t('editMore'), () => showMenu(actions));
        }
        return breadcrumb;
    }

    private renderCoverIdentity(poster: HTMLElement, editTitle: (value: string) => void): HTMLButtonElement {
        appendEditorTemplate(poster, buildCompactCoverIdentity('<div class="lorebase-music-cover-meta"></div>'));
        const title = poster.querySelector<HTMLInputElement>('[data-field="title"]')!;
        title.value = this.draft.displayName;
        title.addEventListener('input', () => editTitle(title.value));
        const year = poster.querySelector<HTMLInputElement>('[data-field="year"]')!;
        year.value = this.draft.year?.toString() ?? '';
        year.addEventListener('input', () => this.updateYear(year.value));
        const meta = poster.querySelector<HTMLElement>('.lorebase-music-cover-meta')!;
        const artist = meta.createEl('input', { attr: { type: 'text', 'aria-label': mt('artist'), placeholder: mt('artist'), 'data-field': 'artist' } });
        artist.value = this.draft.artist;
        artist.addEventListener('input', () => { this.draft.artist = artist.value; });
        if (this.draft.musicKind === 'track') {
            const timing = meta.createDiv({ cls: 'lorebase-music-cover-duration' });
            setIcon(timing.createSpan({ attr: { 'aria-hidden': 'true' } }), 'clock-3');
            const duration = this.durationInput(timing, this.draft.duration, value => { this.draft.duration = value; });
            duration.placeholder = 'm:ss';
        }
        const badge = poster.createDiv({ cls: 'lorebase-game-cover-type lorebase-music-cover-kind' });
        if (this.draft.filePath) badge.createSpan({ text: mt(this.draft.musicKind) });
        else this.renderKindSelect(badge);
        return poster.querySelector<HTMLButtonElement>('[data-action="toggle-notes"]')!;
    }

    private updateYear(value: string): void {
        this.draft.year = /^\d{1,4}$/.test(value) ? Number(value) : null;
    }

    private renderKindSelect(parent: HTMLElement): void {
        const kind = this.select(parent, mt('kind'), [['album', mt('album')], ['track', mt('track')]], this.draft.musicKind);
        kind.addEventListener('change', () => {
            this.compactChips?.commit();
            this.draft.musicKind = kind.value === 'track' ? 'track' : 'album';
            this.render();
        });
    }

    private renderLegacyIdentity(center: HTMLElement, editTitle: (value: string) => void): HTMLButtonElement {
        const meta = center.createEl('section', { cls: 'lorebase-editmode-panel lorebase-editmode-title-meta' });
        const title = this.input(meta, t('templateFieldName'), this.draft.displayName, editTitle, 'title');
        title.classList.add('lorebase-editmode-title-input');
        title.parentElement?.addClass('lorebase-music-title-field');
        const row = meta.createDiv({ cls: 'lorebase-editmode-meta-row' });
        this.input(row, mt('artist'), this.draft.artist, value => { this.draft.artist = value; }, 'artist');
        this.input(row, t('year'), this.draft.year?.toString() || '', value => this.updateYear(value), 'year');
        if (!this.draft.filePath) this.renderKindSelect(meta);
        if (this.draft.musicKind === 'track') {
            this.input(meta, mt('album'), this.draft.album, value => { this.draft.album = value; });
            this.durationInput(meta, this.draft.duration, value => { this.draft.duration = value; });
        }
        const genres = meta.createDiv({ cls: 'lorebase-editmode-field lorebase-editmode-genres-field' });
        this.chips(genres, t('genres'), this.draft.genres, false);
        const actions = genres.createDiv({ cls: 'lorebase-editmode-title-meta-actions' });
        return actions.createEl('button', { cls: 'lorebase-editmode-btn lorebase-editmode-btn-ghost lorebase-editmode-notes-toggle',
            text: t('editDescription') + ' ⌄', attr: { type: 'button', 'aria-expanded': 'false' } });
    }

    private renderQuickSettings(left: HTMLElement): void {
        const quick = this.panel(left, t('editQuickSettings'), 'lorebase-editmode-quick-settings');
        if (this.compact) {
            const options = getStatusOptionsForMediaType('music', this.settings.statusLabels);
            const statusButtons = QUICK_MUSIC_STATUSES.map(status => ({
                key: status,
                label: mt(status),
                icon: STATUS_ICON_MAP[status],
            }));
            appendEditorTemplate(quick, buildCompactQuickSettings([
                { key: 'favorite', label: t('editFavorite'), icon: 'heart' }, ...statusButtons,
            ]));
            for (const status of QUICK_MUSIC_STATUSES) {
                const button = quick.querySelector<HTMLButtonElement>(`[data-toggle="${status}"]`)!;
                const appearance = getStatusAppearance('music', status);
                const label = options.find(option => option.status === status)?.label ?? mt(status);
                button.title = label;
                button.setAttribute('aria-label', label);
                button.querySelector('[data-icon]')?.setAttribute('data-icon', appearance.icon);
                button.style.setProperty('--quick-color', appearance.color);
                button.addEventListener('click', () => {
                    this.draft.status = this.draft.status === status ? this.lastRegularStatus : status;
                    this.syncStatus();
                });
            }
        } else {
            const row = quick.createDiv({ cls: 'lorebase-editmode-switch-row' });
            row.createSpan({ cls: 'lorebase-editmode-switch-label', text: t('editFavorite') });
            const button = row.createEl('button', { cls: 'lorebase-editmode-switch lorebase-editmode-switch-favorite', attr: { type: 'button', 'aria-label': t('editFavorite'), 'data-toggle': 'favorite' } });
            button.createSpan({ cls: 'lorebase-editmode-switch-thumb' });
        }
        const favorite = quick.querySelector<HTMLButtonElement>('[data-toggle="favorite"]')!;
        const sync = () => {
            favorite.toggleClass('is-active', this.draft.favorite);
            favorite.setAttribute('aria-pressed', String(this.draft.favorite));
        };
        sync();
        favorite.addEventListener('click', () => { this.draft.favorite = !this.draft.favorite; sync(); });
    }

    private renderNotes(center: HTMLElement, toggle: HTMLButtonElement): void {
        if (this.compact) appendEditorTemplate(center, buildSummaryNotesPanel(true));
        else {
            const notes = this.panel(center, t('editDescription'), 'lorebase-editmode-notes is-collapsed');
            notes.dataset.mobilePane = 'general';
            const tabs = notes.createDiv({ cls: 'lorebase-editmode-note-tabs' });
            for (const [mode, label] of [['description', t('editDescription')], ['myNotes', t('editMyNotes')]]) {
                tabs.createEl('button', { cls: 'lorebase-editmode-btn lorebase-editmode-btn-ghost lorebase-editmode-note-tab', text: label, attr: { type: 'button', 'data-mode': mode } });
            }
            notes.createDiv({ cls: 'lorebase-editmode-notes-shell' }).createEl('textarea', { cls: 'lorebase-editmode-notes-input', attr: { rows: '8' } });
        }
        const notes = center.querySelector<HTMLElement>('.lorebase-editmode-notes')!;
        const input = notes.querySelector<HTMLTextAreaElement>('.lorebase-editmode-notes-input')!;
        const tabs = notes.querySelectorAll<HTMLButtonElement>('[data-mode]');
        let mode: 'description' | 'myNotes' = 'description';
        const select = (next: typeof mode): void => {
            mode = next;
            input.value = this.draft[mode] || '';
            const label = mode === 'description' ? t('editDescription') : this.compact ? compactGameText('myNotes') : t('editMyNotes');
            input.setAttribute('aria-label', label);
            input.placeholder = mode === 'description' ? mt('noDescription') : label;
            tabs.forEach(tab => {
                const active = tab.dataset.mode === mode;
                tab.classList.toggle('is-active', active);
                if (this.compact) { tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', String(active)); }
            });
            this.updateNotesCount(input);
        };
        tabs.forEach(tab => tab.addEventListener('click', () => select(tab.dataset.mode === 'myNotes' ? 'myNotes' : 'description')));
        input.addEventListener('input', () => { this.draft[mode] = input.value; this.notesDirty = true; this.updateNotesCount(input); });
        toggle.addEventListener('click', () => {
            const collapsed = notes.classList.toggle('is-collapsed');
            toggle.setAttribute('aria-expanded', String(!collapsed));
            if (this.compact) {
                toggle.classList.toggle('is-active', !collapsed);
                if (!collapsed) focusSummaryNotes(center, true);
            }
        });
        select('description');
    }

    private updateNotesCount(input: HTMLTextAreaElement): void {
        const notes = input.closest('.lorebase-editmode-notes');
        if (notes) syncNotesReader(notes as HTMLElement);
        const count = notes?.querySelector('[data-role="char-count"]');
        if (count) count.textContent = `${input.value.length} ${t('editCharsShort')}`;
        const indicator = notes?.querySelector('[data-role="saved-indicator"]');
        if (indicator) indicator.textContent = t(this.notesDirty ? 'editUnsavedChanges' : 'editSaved');
    }

    private renderPersonal(root: HTMLElement, center: HTMLElement): void {
        const personal = this.panel(center, this.compact ? compactGameText('statusRating') : t('editStatus') + ' & ' + t('editRating'), 'lorebase-editmode-status-rating');
        if (this.compact) personal.classList.add('lorebase-editmode-panel-glass', 'lorebase-compact-tracking');
        const primary = this.compact ? personal.createDiv({ cls: 'lorebase-tracking-primary' }) : personal;
        this.status = primary.createDiv({ cls: 'lorebase-editmode-segmented', attr: { role: 'group', 'aria-label': t('editStatus') } });
        if (this.compact) this.status.classList.add('lorebase-tracking-status');
        for (const option of getStatusOptionsForMediaType('music', this.settings.statusLabels)) {
            const status = option.status as MusicStatus;
            if (this.compact && QUICK_MUSIC_STATUSES.includes(status)) continue;
            const button = this.status.createEl('button', { cls: 'lorebase-editmode-segment', attr: { type: 'button', 'data-status': status } });
            const appearance = getStatusAppearance('music', status);
            setIcon(button.createSpan({ cls: 'lorebase-editmode-segment-icon', attr: { 'aria-hidden': 'true' } }), appearance.icon);
            button.style.setProperty('--lorebase-status-color', appearance.color);
            button.createSpan({ cls: 'lorebase-editmode-segment-label', text: option.label });
            button.addEventListener('click', () => { this.draft.status = status; this.syncStatus(); });
        }
        this.syncStatus();
        this.starRating(primary);
        if (this.draft.musicKind === 'track') {
            const player = primary.createDiv({ cls: 'lorebase-music-single-player' });
            const play = this.iconButton(player, 'play', mt('listenMusic'), () => { void this.player?.toggle('single'); });
            play.addClass('lorebase-music-track-play');
            player.createSpan({ text: mt('preview30') });
            const host = player.createDiv({ cls: 'lorebase-music-preview-host' });
            this.player = this.createInlinePlayer();
            this.player.mount([{ key: 'single', query: { title: this.draft.displayName, artist: this.draft.artist,
                deezerId: this.draft.integrationProvider === 'deezer' ? this.draft.integrationId || undefined : undefined }, host, button: play }]);
        }
        this.detailedRatingEditor.mount(personal);
        if (this.compact) finishTrackingPanel(root);
        bindPriority(root, this.draft.priority, value => { this.draft.priority = value; });
    }
    private renderSource(panel: HTMLElement): void {
        panel.querySelectorAll('.lorebase-source-compact-row, .lorebase-source-url-row').forEach(el => el.remove());
        const compact = panel.createDiv({ cls: 'lorebase-source-compact-row' });
        const state = compact.createDiv({ cls: 'lorebase-source-state' });
        const connected = Boolean(this.draft.integrationProvider && this.draft.integrationId);
        const status = state.createDiv({ cls: 'lorebase-source-status' });
        setIcon(status.createSpan({ cls: 'lorebase-source-status-icon' }), connected ? 'link-2' : 'unlink');
        status.createSpan({ text: t(connected ? 'editSourceConnected' : 'editSourceNotConnected') });
        if (connected) state.createDiv({ cls: 'lorebase-source-identity',
            text: this.draft.integrationProvider === 'musicbrainz' ? `MusicBrainz · ${this.draft.integrationId!.slice(0, 8)}` : this.draft.integrationProvider === 'deezer' ? `Deezer · ${this.draft.integrationId}` : 'Last.fm',
            attr: { title: this.draft.integrationId! } });
        const row = panel.createDiv({ cls: 'lorebase-source-url-row' });
        row.createSpan({ cls: 'lorebase-source-url-label', text: 'URL' });
        row.createEl('code', { cls: 'lorebase-source-url-value', text: this.draft.sourceUrl || '—', attr: { title: this.draft.sourceUrl || '' } });
        const open = this.iconButton(row, 'external-link', t('editOpen'), () => {
            if (/^https?:\/\//i.test(this.draft.sourceUrl || '')) window.open(this.draft.sourceUrl!, '_blank', 'noopener');
        });
        open.addClass('lorebase-source-url-open', 'lorebase-editmode-btn-tight');
        open.disabled = !/^https?:\/\//i.test(this.draft.sourceUrl || '');
    }
    private syncStatus(): void {
        const sync = (button: HTMLButtonElement, active: boolean): void => {
            button.toggleClass('is-active', active); button.setAttribute('aria-pressed', String(active));
        };
        const current = this.draft.status;
        const root = this.contentEl.querySelector<HTMLElement>('.lorebase-editmode-root');
        if (root) syncStatusReason(root,current);
        this.status.querySelectorAll<HTMLButtonElement>('button').forEach(button => {
            sync(button, button.dataset.status === current);
        });
        if (!this.compact) return;
        if (!QUICK_MUSIC_STATUSES.includes(current)) this.lastRegularStatus = current;
        for (const status of QUICK_MUSIC_STATUSES) {
            const button = this.contentEl.querySelector<HTMLButtonElement>(`[data-toggle="${status}"]`);
            if (button) sync(button, status === current);
        }
    }
    private chips(parent: HTMLElement, label: string, values: string[], showRemove = true, persistentInput = false): void {
        const host = parent.createDiv({ cls: 'lorebase-editmode-chip-row' });
        const render = () => {
            host.empty();
            values.forEach((value, index) => {
                const chip = this.button(host, value + (showRemove ? ' ×' : ''), () => { values.splice(index, 1); render(); });
                chip.addClass('lorebase-editmode-chip');
            });
            if (!persistentInput) {
                const add = this.button(host, '+', () => { field.hidden = !field.hidden; if (!field.hidden) input.focus(); });
                add.addClass('lorebase-editmode-chip-add'); add.setAttribute('aria-label', label);
            }
        };
        const input = this.input(parent, label, '', () => {}); input.placeholder = label;
        const field = input.parentElement!; field.hidden = !persistentInput;
        if (persistentInput) { input.placeholder = t('editTagPlaceholder'); input.addClass('lorebase-editmode-tag-input'); }
        render();
        input.addEventListener('keydown', event => {
            if (event.key !== 'Enter' || !input.value.trim()) return;
            event.preventDefault(); this.split(input.value).forEach(value => { if (!values.includes(value)) values.push(value); });
            input.value = ''; field.hidden = !persistentInput; render();
        });
    }
    private starRating(parent: HTMLElement, target: { userRating: number | null } = this.draft): void {
        const wrap = parent.createDiv({ cls: `lorebase-editmode-rating-wrap${target === this.draft ? '' : ' lorebase-music-song-rating'}` });
        const head = wrap.createDiv({ cls: 'lorebase-editmode-rating-head' });
        head.createSpan({ cls: 'lorebase-editmode-rating-caption', text: t('editPersonalRating') });
        const reset = this.button(head, target === this.draft ? (this.compact ? compactGameText('reset') : t('editClear')) : '', () => { target.userRating = null; refresh(); });
        if (target !== this.draft) { setIcon(reset, 'rotate-ccw'); reset.setAttribute('aria-label', t('editClear')); reset.title = t('editClear'); }
        const stars = wrap.createDiv({ cls: 'lorebase-editmode-stars' });
        const max = getRatingMax(this.settings.ratingScale);
        const meta = this.compact && target === this.draft ? wrap.createDiv({ cls: 'lorebase-editmode-rating-meta' }) : wrap;
        const value = meta.createDiv({ cls: 'lorebase-editmode-rating-value' });
        const line = wrap.createDiv({ cls: 'lorebase-editmode-rating-line' }).createSpan({ cls: 'lorebase-editmode-rating-line-fill' });
        const refresh = () => {
            value.toggleClass('is-unrated', target.userRating === null);
            stars.querySelectorAll<HTMLButtonElement>('button').forEach(button => {
                const fill = paintRatingStar(button, Number(button.dataset.rating), target.userRating, this.settings.ratingScale, 'music');
                button.setAttribute('aria-pressed', String(fill !== 'empty'));
            });
            updateRatingReadout(value, target.userRating, this.compact
                ? formatCompactEditorRating(target.userRating, max)
                : (target.userRating || 0).toFixed(1) + ' / ' + max.toFixed(1));
            line.style.width = ((target.userRating || 0) / max * 100) + '%';
        };
        mountTenthsRating(value, this.settings.ratingScale, () => target.userRating, score => {
            target.userRating = score;
            refresh();
        }, t('editPersonalRating'));
        for (let n = 1; n <= max; n++) {
            const button = stars.createEl('button', { cls: 'lorebase-editmode-star', text: '★', attr: { type: 'button', 'data-rating': String(n), 'aria-label': t('editRating') + ' ' + n } });
            button.addEventListener('click', event => {
                const rect = button.getBoundingClientRect();
                const next = event.detail === 0 ? n : getRatingFromStarPosition(n, event.clientX - rect.left, rect.width, this.settings.ratingScale);
                target.userRating = target.userRating === next ? null : next; refresh();
            });
        }
        refresh();
    }
    private renderTracks(): void {
        preserveScroll(this.trackList, () => this.renderTracksContent());
    }
    private renderTracksContent(): void {
        this.clearTrackCredits();
        const expanded = new Set(Array.from(this.trackList.querySelectorAll<HTMLDetailsElement>('details[open]')).map(row => row.dataset.trackId));
        this.trackList.empty();
        const previews: DeezerPreviewTarget[] = [];
        if (!this.draft.tracks.length) this.trackList.createDiv({ cls: 'setting-item-description', text: mt('emptyTracks') });
        const groups = musicTrackGroups(this.draft.tracks);
        for (const group of groups) {
            if (groups.length > 1) this.trackList.createEl('h4', { cls: 'lorebase-music-disc-heading', text: `${mt('disc')} ${group.disc}` });
            group.tracks.forEach((track, discIndex) => {
                const index = this.draft.tracks.indexOf(track);
                const item = this.trackList.createDiv({ cls: 'lorebase-music-track-item' });
                const row = item.createEl('details', { cls: 'lorebase-music-track-row' });
                row.dataset.trackId = track.id;
                row.open = expanded.has(track.id) || !track.title;
                row.toggleClass('is-listened', track.listened);
                const heading = row.createEl('summary', { cls: 'lorebase-music-track-heading' });
                heading.createSpan({ cls: 'lorebase-music-track-number', text: String(discIndex + 1), attr: { 'aria-hidden': 'true' } });
                const play = this.iconButton(heading, 'play', `${mt('listenMusic')}: ${track.title}`, () => { void this.player?.toggle(track.id); });
                play.addClass('lorebase-music-track-play');
                play.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); });
                const credit = heading.createSpan({ cls: 'lorebase-music-track-credit' });
                const title = credit.createSpan({ cls: 'lorebase-music-track-title', text: track.title || mt('track'), attr: { title: track.title } });
                const artist = credit.createSpan({ cls: 'lorebase-music-track-artist' });
                const credits = new TrackArtistCredits(artist, async (name, current) => {
                    const catalog = new MusicCatalog(() => this.settings.music.lastfmApiKey, provider => this.settings.music.providerEnabled?.[provider] !== false);
                    try {
                        const performer = await catalog.artist(name, trackArtistDeezerId(track, name));
                        if (!this.alive || !current()) return;
                        if (performer?.id) new ArtistDiscographyModal(this.app, performer, catalog, this.service).open();
                        else new Notice(mt('artistMissing'));
                    } catch { if (this.alive && current()) new Notice(mt('error')); }
                });
                this.trackCredits.set(track.id, credits);
                credits.update(trackGuestNames(track, this.draft.artist));
                const duration = heading.createSpan({ cls: 'lorebase-music-track-time', text: formatDuration(track.duration) });
                this.check(heading, `${mt('listened')}: ${track.title}`, track.listened, value => {
                    track.listened = value; row.toggleClass('is-listened', value); this.updateProgress();
                });
                const more = this.iconButton(heading, 'ellipsis', mt('songActions'), () => {
                    const menu = new Menu();
                    menu.addItem(item => item.setTitle(mt('editSong')).setIcon('pencil').onClick(() => { row.open = !row.open; }));
                    menu.addItem(item => item.setTitle(t('statusFavorite')).setIcon('heart').setChecked(track.favorite).onClick(() => {
                        track.favorite = !track.favorite; this.renderTracks();
                    }));
                    menu.addItem(item => item.setTitle(mt(this.extract.has(track.id) ? 'separateQueued' : 'separate')).setIcon('library').onClick(() => {
                        this.extract.has(track.id) ? this.extract.delete(track.id) : this.extract.add(track.id); this.renderTracks();
                    }));
                    menu.addSeparator();
                    menu.addItem(item => item.setTitle(mt('up')).setIcon('arrow-up').setDisabled(discIndex === 0).onClick(() => this.moveTrack(index, this.draft.tracks.indexOf(group.tracks[discIndex - 1]) - index)));
                    menu.addItem(item => item.setTitle(mt('down')).setIcon('arrow-down').setDisabled(discIndex === group.tracks.length - 1).onClick(() => this.moveTrack(index, this.draft.tracks.indexOf(group.tracks[discIndex + 1]) - index)));
                    menu.addSeparator();
                    menu.addItem(item => item.setTitle(mt('remove')).setIcon('trash-2').onClick(() => {
                        this.draft.tracks.splice(index, 1); this.extract.delete(track.id); this.updateProgress(); this.renderTracks();
                    }));
                    this.showMusicMenu(menu, more);
                });
                more.addClass('lorebase-music-track-menu');
                more.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); });
                row.toggleClass('is-extract-queued', this.extract.has(track.id));
                row.toggleClass('is-favorite', track.favorite);
                const body = row.createDiv({ cls: 'lorebase-music-track-body' });
                row.addEventListener('toggle', () => { if (row.open) this.trackList.querySelectorAll<HTMLDetailsElement>('.lorebase-music-track-row[open]').forEach(other => { if (other !== row) other.open = false; }); });
                const host = item.createDiv({ cls: 'lorebase-music-preview-host' });
                previews.push({ key: track.id, query: { title: track.title, artist: track.artist || this.draft.artist, deezerId: track.deezerId }, host, button: play });
                const fields = body.createDiv({ cls: 'lorebase-music-track-fields' });
                this.input(fields, t('templateFieldName'), track.title, value => { track.title = value; track.deezerId = undefined; this.player?.updateQuery(track.id, { title: track.title, artist: track.artist || this.draft.artist }); title.textContent = value || mt('track'); title.title = value; credits.update(trackGuestNames(track, this.draft.artist)); });
                this.input(fields, mt('artist'), track.artist, value => { track.artist = value; track.artists = undefined; track.deezerArtistIds = undefined; track.deezerId = undefined; this.player?.updateQuery(track.id, { title: track.title, artist: track.artist || this.draft.artist }); credits.update(trackGuestNames(track, this.draft.artist)); });
                const footer = body.createDiv({ cls: 'lorebase-music-track-footer' });
                const timing = footer.createDiv({ cls: 'lorebase-music-track-timing' });
                const lengthInput = this.durationInput(timing, track.duration, value => { track.duration = value; duration.textContent = formatDuration(value); this.updateProgress(false); });
                lengthInput.parentElement!.querySelector('span')!.textContent = mt('trackTime');
                const disc = this.input(timing, mt('disc'), String(track.disc), value => track.disc = Math.max(1, Math.floor(Number(value) || 1)));
                disc.type = 'number'; disc.min = '1'; disc.step = '1';
                disc.addEventListener('change', () => this.renderTracks());
                this.starRating(footer, track);
                const actions = footer.createDiv({ cls: 'lorebase-music-actions' });
                const favorite = this.iconButton(actions, 'heart', t('statusFavorite'), () => {
                    track.favorite = !track.favorite; row.toggleClass('is-favorite', track.favorite);
                    favorite.toggleClass('is-active', track.favorite); favorite.setAttribute('aria-pressed', String(track.favorite));
                });
                favorite.addClass('lorebase-music-track-favorite');
                favorite.toggleClass('is-active', track.favorite); favorite.setAttribute('aria-pressed', String(track.favorite));
                this.iconButton(actions, 'chevron-up', mt('closeSong'), () => { row.open = false; heading.focus(); });
            });
        }
        this.player?.mount(previews);
    }
    private showMusicMenu(menu: Menu, button: HTMLElement): void {
        const rect = button.getBoundingClientRect(); menu.showAtPosition({ x: rect.right, y: rect.bottom });
    }
    private addTrack(): void {
        const track: MusicTrack = { id: `track-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title: '', artist: this.draft.artist,
            disc: musicTrackGroups(this.draft.tracks).slice(-1)[0]?.disc ?? 1, duration: null, listened: false, favorite: false, userRating: null };
        this.draft.tracks.push(track); this.updateProgress(); this.renderTracks();
        this.trackList.querySelector<HTMLDetailsElement>(`[data-track-id="${track.id}"]`)?.querySelector<HTMLInputElement>('input[type=text]')?.focus();
    }
    private createInlinePlayer(): DeezerInlinePlayer {
        const catalog = new MusicCatalog(() => '', provider => this.settings.music.providerEnabled?.[provider] !== false);
        return new DeezerInlinePlayer(query => catalog.previews(query));
    }
    private async loadTrackCredits(): Promise<void> {
        const generation = ++this.creditGeneration;
        const identity = `${this.draft.artist}\n${this.draft.displayName}`;
        const signature = (track: MusicTrack) => JSON.stringify([track.title, track.artist, track.artists, track.deezerArtistIds]);
        const snapshot = { ...this.draft, tracks: this.draft.tracks.map(track => ({ ...track })) };
        const originals = new Map(snapshot.tracks.map(track => [track.id, signature(track)]));
        const current = () => this.alive && !this.saving && generation === this.creditGeneration && identity === `${this.draft.artist}\n${this.draft.displayName}`;
        const catalog = new MusicCatalog(() => this.settings.music.lastfmApiKey, provider => this.settings.music.providerEnabled?.[provider] !== false);
        try {
            const credits = await catalog.trackCredits(snapshot, current);
            if (!credits || !current()) return;
            if (credits.deezerArtistId) this.draft.deezerArtistId = credits.deezerArtistId;
            for (const credit of credits.tracks) {
                const track = this.draft.tracks.find(track => track.id === credit.id);
                if (!track || signature(track) !== originals.get(track.id)) continue;
                Object.assign(track, credit);
                this.trackCredits.get(track.id)?.update(trackGuestNames(track, this.draft.artist));
                this.player?.updateQuery(track.id, { title: track.title, artist: track.artist || this.draft.artist, deezerId: track.deezerId });
            }
        } catch { /* Keep stored/manual credits and the editor usable while offline. */ }
    }
    private moveTrack(index: number, delta: number): void {
        const target = index + delta;
        if (target < 0 || target >= this.draft.tracks.length) return;
        [this.draft.tracks[index], this.draft.tracks[target]] = [this.draft.tracks[target], this.draft.tracks[index]];
        this.renderTracks();
    }
    private updateProgress(updateStatus = true): void {
        if (updateStatus) this.draft.status = statusAfterTrackChange(this.draft.status, this.draft.tracks);
        this.syncStatus();
        const summary = musicTrackSummary(this.draft.tracks);
        this.progress.empty();
        const labels = this.progress.createDiv({ cls: 'lorebase-music-progress-labels' });
        labels.createSpan({ text: `${summary.listened} / ${summary.total} · ${mt('listened').toLocaleLowerCase()}` });
        labels.createSpan({ text: summary.duration === null ? mt('unknownDuration') : formatMusicTotal(summary.duration, i18n.getLanguage()) });
        const meter = this.progress.createEl('progress', { attr: { max: String(summary.total || 1), value: String(summary.listened), 'aria-label': mt('listened') } });
        meter.value = summary.listened;

    }
    private async save(): Promise<void> {
        if (!validateDatePickers(this.releaseDatePicker ? [this.releaseDatePicker] : [])) return;
        if (!validateRatingInputs(this.contentEl)) return;
        if (this.saving || !this.ready) return;
        if (!validateCountriesControl(this.contentEl)) return;
        if (!this.draft.displayName.trim() || (this.draft.musicKind === 'album' && this.draft.tracks.some(track => !track.title.trim()))) {
            new Notice(mt('titleRequired')); return;
        }
        const invalid = Array.from(this.contentEl.querySelectorAll<HTMLInputElement>('input')).find(input => !input.checkValidity());
        if (invalid) {
            const row = invalid.closest('details'); if (row) row.open = true;
            const pane = invalid.closest<HTMLElement>('[data-mobile-pane]')?.dataset.mobilePane;
            if (pane) this.contentEl.querySelector<HTMLButtonElement>(`[data-mobile-tab-target="${pane}"]`)?.click();
            invalid.reportValidity(); invalid.focus(); return;
        }
        this.compactChips?.commit();
        this.saving = true;
        this.contentEl.querySelectorAll<HTMLButtonElement>('button').forEach(button => button.disabled = true);
        try {
            this.draft.displayName = this.draft.displayName.trim();
            await this.persist({ ...this.draft, detailedRatings: this.detailedRatingEditor.getValue() });
            for (const track of this.draft.tracks) {
                if (this.extract.has(track.id)) { await this.service.addAlbumTrack(this.draft, track); this.extract.delete(track.id); }
            }
            this.close();
        } catch { new Notice(mt('saveError')); }
        finally { this.saving = false; if (this.alive) this.render(); }
    }
    private panel(parent: HTMLElement, title: string, cls: string): HTMLElement {
        const panel = parent.createEl('section', { cls: `lorebase-editmode-panel ${cls}` });
        panel.createEl('h3', { cls: 'lorebase-editmode-panel-title', text: title }); return panel;
    }
    private input(parent: HTMLElement, label: string, value: string, change: (value: string) => void, field?: string): HTMLInputElement {
        const host = parent.createEl('label', { cls: 'lorebase-music-field lorebase-editmode-field' }); host.createSpan({ cls: 'lorebase-editmode-field-label', text: label });
        const input = host.createEl('input', { cls: 'lorebase-editmode-input', type: 'text', attr: { 'aria-label': label } }); input.value = value;
        if (field) input.dataset.field = field;
        input.addEventListener('input', () => change(input.value)); return input;
    }
    private durationInput(parent: HTMLElement, value: number | null, change: (value: number | null) => void): HTMLInputElement {
        const input = this.input(parent, mt('duration'), formatDuration(value), value => {
            const duration = durationSeconds(value);
            input.setCustomValidity(value.trim() && duration === null ? mt('invalidDuration') : ''); change(duration);
        });
        input.inputMode = 'text';
        return input;
    }
    private select(parent: HTMLElement, label: string, options: string[][], value: string): HTMLSelectElement {
        const host = parent.createEl('label', { cls: 'lorebase-music-field' }); host.createSpan({ text: label });
        const select = host.createEl('select', { cls: 'dropdown', attr: { 'aria-label': label } });
        options.forEach(([value, text]) => select.createEl('option', { value, text })); select.value = value; return select;
    }
    private check(parent: HTMLElement, label: string, value: boolean, change: (value: boolean) => void): void {
        const host = parent.createEl('label', { cls: 'lorebase-music-checkbox' });
        const input = host.createEl('input', { type: 'checkbox', attr: { 'aria-label': label } }); input.checked = value;
        input.addEventListener('click', event => event.stopPropagation());
        host.addEventListener('click', event => event.stopPropagation());
        host.createSpan({ text: label }); input.addEventListener('change', () => change(input.checked));
    }
    private button(parent: HTMLElement, text: string, action: () => void, primary = false): HTMLButtonElement {
        const button = parent.createEl('button', { text, cls: `lorebase-editmode-btn ${primary ? 'lorebase-editmode-btn-primary' : 'lorebase-editmode-btn-ghost'}`, attr: { type: 'button' } });
        button.addEventListener('click', action); return button;
    }
    private iconButton(parent: HTMLElement, icon: string, label: string, action: () => void): HTMLButtonElement {
        const button = this.button(parent, '', action); setIcon(button, icon); button.setAttribute('aria-label', label); button.title = label; return button;
    }
    private split(value: string): string[] { return value.split(',').map(s => s.trim()).filter(Boolean); }
    onClose(): void {
        this.releaseDatePicker?.destroy();
        this.alive = false;
        this.clearTrackCredits();
        this.discovery?.destroy();
        this.player?.destroy();
        this.compactChips?.destroy();
        this.compactChips = undefined;
        this.modalEl.removeEventListener('keydown', this.onKeydown);
        this.contentEl.empty();
    }
    private clearTrackCredits(): void {
        this.trackCredits.forEach(credits => credits.destroy());
        this.trackCredits.clear();
    }
}
