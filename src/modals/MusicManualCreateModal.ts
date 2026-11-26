
import { App, Modal, Notice, setIcon } from 'obsidian';
import { addMobileModalClose } from '../components/MobileModalChrome';
import { createLorebaseDropdown, type LorebaseDropdownHandle } from '../components/LorebaseDropdown';
import { createManualCreateTabs } from '../components/ManualCreateTabs';
import { createManualDate, createManualNotes, createManualToggle, createManualTracking } from '../components/ManualCreateControls';
import { HierarchicalDatePicker, validateDatePickers } from './HierarchicalDatePicker';
import { durationSeconds, formatDuration, musicProgress, statusAfterTrackChange } from '../services/media/music';
import { t } from '../localization';
import { mt } from '../localization/music';
import { emptyMusicItem } from '../services/MusicService';
import { saveManualImageFileToVault } from '../services/integrations/imageStorage';
import { getStatusOptionsForMediaType } from '../views/library/viewOptions';
import { mountTenthsRating, paintRatingStar, updateRatingReadout, validateRatingInputs } from '../components/RatingInput';
import { getRatingMax, getRatingFromStarPosition } from '../utils/rating';
import type { LorebaseSettings, MusicItem, MusicKind, MusicStatus, MusicTrack } from '../types';

/** Uses the same manual-create shell and controls as the other media. */
export class MusicManualCreateModal extends Modal {
    private lifetime = new AbortController();
    private draft: MusicItem;
    private saving = false;
    private activeTab = 'main';
    private trackingOpen = false;
    private dates: HierarchicalDatePicker[] = [];
    private statusDropdown?: LorebaseDropdownHandle<MusicStatus>;
    private posterFile?: File;
    private posterObjectUrl?: string;
    private inlineRoot?: HTMLElement;
    private inlineBack?: () => void;
    private inlineClose?: () => void;
    private inlineSaved?: () => void;
    mountInline(root: HTMLElement, onBack: () => void, onSaved: () => void, initialTitle: string, onClose?: () => void): void {
        if (this.lifetime.signal.aborted) this.lifetime = new AbortController();
        if (this.inlineRoot) this.rememberTrackingState();
        this.inlineRoot = root; this.inlineBack = onBack; this.inlineSaved = onSaved;
        this.inlineClose = onClose;
        if (!this.draft.displayName) this.draft.displayName = initialTitle;
        root.empty(); this.onOpen();
    }
    constructor(app: App, private settings: LorebaseSettings, kind: MusicKind, private saveDraft: (item: MusicItem, signal?: AbortSignal) => Promise<void>) {
        super(app); this.draft = { ...emptyMusicItem(), musicKind: kind };
    }
    onOpen(): void {
        this.dates.forEach(picker => picker.destroy()); this.dates = [];
        if (!this.inlineRoot) this.modalEl.addClass('lorebase-manual-create-container', 'lorebase-music-manual');
        else this.inlineRoot.addClass('lorebase-music-manual');
        const root = this.inlineRoot ?? this.contentEl; root.addClass('lorebase-select-modal', 'lorebase-add-workspace', 'is-manual');
        const header = root.createDiv({ cls: 'lorebase-select-header lorebase-manual-create-header' });
        addMobileModalClose(root.closest<HTMLElement>('.modal') ?? this.inlineRoot ?? this.modalEl, header, () => {
            if (this.inlineClose) this.inlineClose();
            else if (this.inlineBack) this.inlineBack();
            else this.close();
        });
        const title = header.createDiv({ cls: 'lorebase-select-title-row' });
        setIcon(title.createSpan({ cls: 'lorebase-select-title-icon' }), 'file-plus-2');
        title.createEl('h2', { cls: 'lorebase-select-title', text: t('manualCreateTitle') });
        const category = title.createDiv({ cls: 'lorebase-manual-category' });
        createLorebaseDropdown(category, [{ value: 'album', label: mt('album') }, { value: 'track', label: mt('track') }], this.draft.musicKind, value => { this.rememberTrackingState(); this.draft.musicKind = value; this.activeTab = 'main'; root.empty(); this.onOpen(); }, { floating: true, panelClass: 'lorebase-manual-options' });
        const nav = root.createDiv();
        const body = root.createDiv({ cls: 'lorebase-manual-create-body' });
        const tabs = [{ id: 'main', label: t('manualSectionMain') }];
        if (this.draft.musicKind === 'album') tabs.push({ id: 'tracks', label: mt('tracklist') });
        tabs.push({ id: 'extra', label: t('manualSectionExtra') });
        const panels = createManualCreateTabs(nav, body, tabs, this.activeTab, tab => { this.dates.forEach(picker => picker.close()); this.activeTab = tab; });
        const layout = panels.get('main')!.createDiv({ cls: 'lorebase-manual-create-layout' });
        const form = layout.createDiv({ cls: 'lorebase-manual-form' });
        const main = this.section(form, t('manualSectionMain'));
        this.input(main, t('templateFieldName'), this.draft.displayName, value => this.draft.displayName = value, true);
        const coverHost = layout.createEl('aside', { cls: 'lorebase-manual-cover-aside' });
        const cover = coverHost.createDiv({ cls: 'lorebase-manual-cover-panel' });
        const preview = cover.createDiv({ cls: 'lorebase-manual-cover-preview is-empty' });
        const fileInput = cover.createEl('input', { cls: 'lorebase-manual-cover-file', type: 'file', attr: { accept: 'image/*' } });
        const pick = cover.createEl('button', { cls: 'lorebase-flow-btn lorebase-flow-btn-secondary lorebase-manual-cover-pick', attr: { type: 'button' } });
        setIcon(pick.createSpan(), 'upload'); pick.createSpan({ text: t('manualCoverChoose') });
        pick.addEventListener('click', () => fileInput.click());
        const coverTools = cover.createEl('details', { cls: 'lorebase-manual-cover-url-control' });
        coverTools.createEl('summary', { text: t('manualCoverLink') });
        const renderCover = (value: string): void => {
            preview.empty();
            const file = value && !/^https?:\/\//i.test(value) ? this.app.vault.getFileByPath(value) : null;
            const src = this.posterObjectUrl || (file ? this.app.vault.getResourcePath(file) : /^https?:\/\//i.test(value) ? value : '');
            preview.toggleClass('is-empty', !src);
            if (src) preview.createEl('img', { attr: { src: src, alt: mt('cover') } });
            else { setIcon(preview.createSpan({ cls: 'lorebase-manual-cover-empty-icon' }), 'image'); preview.createSpan({ cls: 'lorebase-manual-cover-caption', text: t('manualCoverTitle') }); }
        };
        renderCover(this.draft.poster ?? '');
        const coverInput = this.input(coverTools, mt('cover'), this.draft.poster ?? '', value => {
            this.disposePreview(); this.posterFile = undefined;
            this.draft.poster = value; this.draft.imageUrl = value; renderCover(value);
        }, true);
        preview.setAttr('role', 'button'); preview.setAttr('tabindex', '0'); preview.setAttr('aria-label', mt('cover'));
        preview.addEventListener('click', () => fileInput.click());
        preview.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInput.click(); }
        });
        fileInput.addEventListener('change', () => {
            const file = fileInput.files?.[0]; if (!file) return;
            this.disposePreview(); this.posterFile = file; this.posterObjectUrl = URL.createObjectURL(file);
            this.draft.poster = ''; coverInput.value = ''; renderCover('');
        });
        this.input(main, mt('artist'), this.draft.artist ?? '', value => this.draft.artist = value);
        const year = this.input(main, t('year'), this.draft.year ? String(this.draft.year) : '', value => this.draft.year = value ? Number(value) : null); year.type = 'number'; year.min = '1'; year.max = '9999';
        this.dates.push(createManualDate(main, t('templateFieldReleased'), () => this.draft.releaseDate ?? '', value => this.draft.releaseDate = value || null));
        if (this.draft.musicKind === 'track') {
            this.input(main, mt('album'), this.draft.album, value => this.draft.album = value);
            this.duration(main, this.draft.duration, value => this.draft.duration = value);
        }
        this.statusDropdown = createLorebaseDropdown(this.field(main, t('editStatus')).createDiv(), getStatusOptionsForMediaType('music', this.settings.statusLabels).map(option => ({ value: option.status as MusicStatus, label: option.label })), this.draft.status, value => { this.draft.status = value; }, { floating: true, panelClass: 'lorebase-manual-options' });
        const ratingControls = this.field(main, t('editRating'), true).createDiv({ cls: 'lorebase-manual-rating-controls' });
        const stars = ratingControls.createDiv({ cls: 'lorebase-editmode-stars lorebase-manual-stars' });
        const ratingValue = ratingControls.createSpan({ cls: 'lorebase-manual-rating-value', attr: { 'aria-live': 'polite' } });
        const update = () => {
            updateRatingReadout(ratingValue, this.draft.userRating, this.draft.userRating ? `${this.draft.userRating} / ${getRatingMax(this.settings.ratingScale)}` : t('manualNoRating'));
            stars.querySelectorAll<HTMLButtonElement>('button').forEach(button => paintRatingStar(button, Number(button.dataset.rating), this.draft.userRating, this.settings.ratingScale, 'music'));
        };
        for (let value = 1; value <= getRatingMax(this.settings.ratingScale); value++) {
            const button = stars.createEl('button', { cls: 'lorebase-editmode-star', text: '★', attr: { type: 'button', 'data-rating': String(value), 'aria-label': t('editRating') + ' ' + value } });
            button.addEventListener('click', event => { const rect = button.getBoundingClientRect(); const next = event.detail ? getRatingFromStarPosition(value, event.clientX - rect.left, rect.width, this.settings.ratingScale) : value; this.draft.userRating = this.draft.userRating === next ? null : next; update(); });
        }
        mountTenthsRating(ratingValue, this.settings.ratingScale, () => this.draft.userRating, value => {
            this.draft.userRating = value;
            update();
        });
        update();
        const trackingFields = createManualTracking(panels.get('main')!, this.trackingOpen, open => { this.trackingOpen = open; });
        const options = trackingFields.createDiv({ cls: 'lorebase-manual-tracking-options is-wide' });
        createManualToggle(options, t('editFavorite'), this.draft.favorite, value => this.draft.favorite = value);
        if (panels.has('tracks')) this.renderTracks(panels.get('tracks')!);
        const details = panels.get('extra')!.createDiv({ cls: 'lorebase-manual-details-layout' });
        const extra = details.createDiv({ cls: 'lorebase-manual-section-grid lorebase-manual-music-details' });
        for (const key of ['genres', 'tags'] as const) this.chips(extra, key);
        this.input(extra, 'URL', this.draft.sourceUrl ?? '', value => this.draft.sourceUrl = value, true);
        createManualNotes(details, this.draft.description, this.draft.myNotes ?? '', (key, value) => this.draft[key] = value);
        const footer = root.createDiv({ cls: 'lorebase-modal-actions lorebase-select-footer' });
        this.action(footer, this.inlineRoot ? t('manualBackToSearch') : t('commonCancel'), this.inlineRoot ? 'arrow-left' : 'x', false, () => { this.rememberTrackingState(); this.dates.forEach(picker => picker.destroy()); this.dates = []; if (this.inlineBack) this.inlineBack(); else this.close(); });
        this.action(footer, t('manualCreateAction'), 'plus', true, () => { void this.save(); });
    }
    private rememberTrackingState(): void {
        const details = (this.inlineRoot ?? this.contentEl).querySelector<HTMLDetailsElement>('.lorebase-manual-main-tracking');
        if (details) this.trackingOpen = details.open;
    }
    private duration(parent: HTMLElement, value: number | null, change: (value: number | null) => void): void {
        const input = this.input(parent, mt('duration'), formatDuration(value), value => {
            const parsed = durationSeconds(value); input.setCustomValidity(value.trim() && parsed === null ? mt('invalidDuration') : ''); change(parsed);
        });
        input.placeholder = '0:00';
    }

    private renderTracks(parent: HTMLElement): void {
        const header = parent.createDiv({ cls: 'lorebase-manual-seasons-header' });
        const summary = header.createSpan({ attr: { 'aria-live': 'polite' } });
        const list = parent.createDiv({ cls: 'lorebase-manual-track-list' });
        const sync = (): void => { this.draft.status = statusAfterTrackChange(this.draft.status, this.draft.tracks); this.statusDropdown?.setValue(this.draft.status); summary.textContent = musicProgress(this.draft) || mt('emptyTracks'); };
        const render = (): void => {
            list.empty(); sync();
            this.draft.tracks.forEach((track, index) => {
                const entry = list.createEl('details', { cls: 'lorebase-manual-detail-group' }); entry.open = !track.title;
                const heading = entry.createEl('summary', { text: `${index + 1}. ${track.title || mt('track')}` });
                const fields = entry.createDiv({ cls: 'lorebase-manual-section-grid' });
                this.input(fields, t('templateFieldName'), track.title, value => { track.title = value; heading.textContent = `${index + 1}. ${value || mt('track')}`; });
                this.input(fields, mt('artist'), track.artist, value => track.artist = value);
                this.duration(fields, track.duration, value => track.duration = value);
                const disc = this.input(fields, mt('disc'), String(track.disc), value => track.disc = Math.max(1, Math.trunc(Number(value) || 1))); disc.type = 'number'; disc.min = '1'; disc.step = '1';
                const rating = this.input(fields, t('editPersonalRating'), track.userRating === null ? '' : String(track.userRating), value => track.userRating = value.trim() ? Number(value) : null);
                rating.type = 'number'; rating.min = '0.5'; rating.max = String(getRatingMax(this.settings.ratingScale)); rating.step = String(this.settings.ratingScale.step);
                createManualToggle(fields, mt('listened'), track.listened, value => { track.listened = value; sync(); });
                createManualToggle(fields, t('editFavorite'), track.favorite, value => track.favorite = value);
                const actions = fields.createDiv({ cls: 'lorebase-manual-track-actions is-wide' });
                const move = (delta: number): void => { const next = index + delta; [this.draft.tracks[index], this.draft.tracks[next]] = [this.draft.tracks[next], this.draft.tracks[index]]; render(); };
                const up = actions.createEl('button', { text: '↑', attr: { type: 'button', 'aria-label': mt('up') } }); up.disabled = index === 0; up.addEventListener('click', () => move(-1));
                const down = actions.createEl('button', { text: '↓', attr: { type: 'button', 'aria-label': mt('down') } }); down.disabled = index === this.draft.tracks.length - 1; down.addEventListener('click', () => move(1));
                actions.createEl('button', { text: mt('remove'), attr: { type: 'button' } }).addEventListener('click', () => { this.draft.tracks.splice(index, 1); render(); });
            });
        };
        header.createEl('button', { text: mt('completeAll'), attr: { type: 'button' } }).addEventListener('click', () => { this.draft.tracks.forEach(track => track.listened = true); render(); });
        header.createEl('button', { text: mt('addTrack'), attr: { type: 'button', 'data-action': 'add-track' } }).addEventListener('click', () => {
            const track: MusicTrack = { id: `track-${Date.now()}-${Math.random().toString(36).slice(2)}`, title: '', artist: this.draft.artist, duration: null, disc: 1, listened: false, favorite: false, userRating: null };
            this.draft.tracks.push(track); render(); list.lastElementChild?.querySelector('input')?.focus();
        });
        render();
    }
    private chips(parent: HTMLElement, key: 'genres' | 'tags'): void {
        const field = this.field(parent, t(key), true);
        const list = field.createDiv({ cls: 'lorebase-editmode-chip-row' });
        const row = field.createDiv({ cls: 'lorebase-manual-chip-input-row' });
        const input = row.createEl('input', { cls: 'lorebase-editmode-input lorebase-manual-chip-input', type: 'text', attr: { 'aria-label': t(key), placeholder: t(key) } });
        const render = () => {
            list.empty();
            this.draft[key].forEach((value, index) => {
                const chip = list.createEl('button', { cls: 'lorebase-editmode-chip', text: value + ' ×', attr: { type: 'button' } });
                chip.addEventListener('click', () => { this.draft[key].splice(index, 1); render(); });
            });
        };
        const add = () => { input.value.split(',').map(v => v.trim()).filter(Boolean).forEach(value => { if (!this.draft[key].includes(value)) this.draft[key].push(value); }); input.value = ''; render(); };
        const button = row.createEl('button', { cls: 'lorebase-editmode-chip-add', text: '+', attr: { type: 'button', 'aria-label': t(key) } });
        button.addEventListener('click', add);
        input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); add(); } });
        input.addEventListener('blur', add);
        render();
    }
    private async save(): Promise<void> {
        if (!validateRatingInputs(this.inlineRoot ?? this.contentEl)) return;
        if (this.saving) return;
        if (!validateDatePickers(this.dates)) {
            const root = this.inlineRoot ?? this.contentEl;
            const invalid = root.querySelector<HTMLElement>('.is-invalid');
            const panel = invalid?.closest('[role="tabpanel"]');
            if (panel) root.querySelector<HTMLButtonElement>(`[aria-controls="${panel.id}"]`)?.click();
            invalid?.focus(); return;
        }
        if (!this.draft.displayName.trim()) { new Notice(t('manualTitleRequired')); return; }
        if (this.draft.musicKind === 'album' && this.draft.tracks.some(track => !track.title.trim())) {
            (this.inlineRoot ?? this.contentEl).querySelector<HTMLButtonElement>('[role="tab"][aria-controls$="tracks-panel"]')?.click();
            new Notice(mt('titleRequired')); return;
        }
        const invalid = Array.from((this.inlineRoot ?? this.contentEl).querySelectorAll('input')).find(input => !input.checkValidity());
        if (invalid) {
            const panel = invalid.closest('[role="tabpanel"]');
            if (panel) (this.inlineRoot ?? this.contentEl).querySelector<HTMLButtonElement>(`[aria-controls="${panel.id}"]`)?.click();
            const details = invalid.closest('details'); if (details) details.open = true;
            invalid.reportValidity(); return;
        }
        this.saving = true;
        try {
            this.draft.displayName = this.draft.displayName.trim();
            if (this.posterFile) {
                const poster = await saveManualImageFileToVault(this.app, this.posterFile, { baseFolder: this.settings.integrations?.imageStorage?.folderPath || 'files/lorebase/images', kind: 'music', title: this.draft.displayName, label: 'Cover', signal: this.lifetime.signal });
                this.draft.poster = poster; this.draft.imageUrl = poster; this.posterFile = undefined;
            }
            if (this.lifetime.signal.aborted) return;
            await this.saveDraft(this.draft, this.lifetime.signal); if (this.inlineSaved) this.inlineSaved(); else this.close();
        }
        catch { new Notice(mt('saveError')); }
        finally { this.saving = false; }
    }
    private section(parent: HTMLElement, title: string): HTMLElement {
        const section = parent.createDiv({ cls: 'lorebase-manual-form-section' });
        if (title === t('manualSectionMain')) section.addClass('is-main');
        section.createDiv({ cls: 'lorebase-manual-section-title', text: title }); return section.createDiv({ cls: 'lorebase-manual-section-grid' });
    }
    private field(parent: HTMLElement, label: string, wide = false): HTMLElement {
        const field = parent.createDiv({ cls: 'lorebase-editmode-field' }); field.toggleClass('is-wide', wide); field.createSpan({ cls: 'lorebase-editmode-field-label', text: label }); return field;
    }
    private input(parent: HTMLElement, label: string, value: string, change: (value: string) => void, wide = false): HTMLInputElement {
        const input = this.field(parent, label, wide).createEl('input', { cls: 'lorebase-editmode-input', type: 'text', attr: { 'aria-label': label } }); input.value = value; input.addEventListener('input', () => change(input.value)); return input;
    }
    private action(parent: HTMLElement, label: string, icon: string, primary: boolean, action: () => void): void {
        const button = parent.createEl('button', { cls: 'lorebase-flow-btn lorebase-flow-btn-' + (primary ? 'primary' : 'secondary'), attr: { type: 'button' } }); setIcon(button.createSpan({ cls: 'lorebase-flow-btn-icon' }), icon); button.createSpan({ cls: 'lorebase-flow-btn-label', text: label }); button.addEventListener('click', action);
    }
    disposePreview(): void { if (this.posterObjectUrl) URL.revokeObjectURL(this.posterObjectUrl); this.posterObjectUrl = undefined; }
    disposeInline(): void { this.lifetime.abort(); this.dates.forEach(picker => picker.destroy()); this.dates = []; this.disposePreview(); }
    onClose(): void { this.disposeInline(); this.contentEl.empty(); }
}
