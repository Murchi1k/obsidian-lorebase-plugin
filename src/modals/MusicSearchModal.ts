
import { App, Modal, Notice, setIcon } from 'obsidian';
import { addMobileModalClose, isMobileInterface } from '../components/MobileModalChrome';
import type { LorebaseSettings, MusicKind } from '../types';
import { DEFAULT_COVER } from '../constants';
import { t } from '../localization';
import { inboxText } from '../localization/inbox';
import { CatalogReferenceError, referenceText } from '../localization/catalogReference';
import { parseCatalogReference } from '../services/integrations/catalogReferences';
import { MusicManualCreateModal } from './MusicManualCreateModal';
import { mt } from '../localization/music';
import { MusicCatalog } from '../services/MusicCatalog';
import { MusicService } from '../services/MusicService';
import type { MusicProvider, MusicSearchResult } from '../services/integrations/providers/music';
import { musicSearchIdentity, organizeMusicResults } from '../services/integrations/providers/music';
import { createLorebaseDropdown } from '../components/LorebaseDropdown';

export class MusicSearchModal extends Modal {
    private readonly lifetime = new AbortController();
    private provider: MusicProvider;
    private kind: MusicKind = 'album';
    private query = '';
    private page = 1;
    private generation = 0;
    private alive = false;
    private selecting = false;
    private reviewing = false;
    private results!: HTMLElement;
    private more!: HTMLButtonElement;
    private catalog: MusicCatalog;
    private selected = new Map<string, MusicSearchResult>();
    private imported = new Set<string>();
    private addButton!: HTMLButtonElement;
    private seen = new Set<string>();
    private manualEditor?: MusicManualCreateModal;
    private manualKind?: MusicKind;
    constructor(app: App, private settings: LorebaseSettings, private service: MusicService, private refresh: () => void, private openInbox?: () => void) {
        super(app);
        this.provider = settings.music.provider;
        this.catalog = new MusicCatalog(() => settings.music.lastfmApiKey, provider => settings.music.providerEnabled?.[provider] !== false);
        if (settings.music.providerEnabled?.[this.provider] === false) this.provider = (['musicbrainz', 'lastfm', 'deezer'] as const).find(value => settings.music.providerEnabled?.[value] !== false) ?? 'musicbrainz';
    }
    onOpen(): void {
        this.reviewing=false;
        this.alive = true;
        this.generation++;
        this.page = 1;
        this.seen.clear();
        this.contentEl.empty();
        this.contentEl.removeClass('is-manual', 'lorebase-music-manual', 'is-reviewing');
        this.modalEl.addClass('lorebase-select-modal-container', 'lorebase-music-search-modal');
        const root = this.contentEl; root.addClass('lorebase-select-modal', 'lorebase-add-workspace', 'lorebase-music-search');
        const header = root.createDiv({ cls: 'lorebase-select-header' });
        const close = addMobileModalClose(this.modalEl, header, () => this.close());
        const title = header.createDiv({ cls: 'lorebase-select-title-row' });
        if (this.openInbox) {
            const inbox = title.createEl('button', { cls: 'lorebase-select-header-action', text: inboxText('title'), attr: { type: 'button' } });
            inbox.addEventListener('click', this.openInbox);
        }
        setIcon(title.createSpan({ cls: 'lorebase-select-title-icon' }), 'music');
        title.createEl('h2', { cls: 'lorebase-select-title', text: mt('add') });
        const shell = root.createDiv({ cls: 'lorebase-select-search-shell' });
        const wrap = shell.createDiv({ cls: 'lorebase-select-search-wrap' });
        setIcon(wrap.createSpan({ cls: 'lorebase-select-search-icon' }), 'search');
        const query = wrap.createEl('input', { cls: 'lorebase-select-search', type: 'search', attr: { placeholder: referenceText('placeholder'), 'aria-label': mt('search') } });
        const search = wrap.createEl('button', { cls: 'lorebase-select-search-submit', attr: { type: 'button', 'aria-label': mt('searchButton'), title: mt('searchButton') } });
        setIcon(search, 'search');
        query.value = this.query;
        const controls = shell.createDiv({ cls: 'lorebase-select-search-controls' });
        const providers = controls.createDiv({ cls: 'lorebase-select-providers' });
        const kinds = controls.createDiv({ cls: 'lorebase-music-search-kind' });
        const reset = (): void => { this.page = 1; this.seen.clear(); this.results.empty(); this.more.hidden = true; this.updateSelection(); this.generation++; };
        const run = (): void => { if (this.selecting) return; this.query = query.value.trim(); reset(); if (this.query) void this.search(); };
        for (const value of ['musicbrainz', 'lastfm', 'deezer'] as const) {
            if (this.settings.music.providerEnabled?.[value] === false) continue;
            const button = providers.createEl('button', { cls: 'lorebase-select-provider-chip', text: value === 'musicbrainz' ? 'MusicBrainz' : value === 'deezer' ? 'Deezer' : 'Last.fm' });
            button.dataset.musicProvider = value;
            button.toggleClass('is-active', value === this.provider);
            button.addEventListener('click', () => { if (this.selecting) return; this.provider = value; providers.querySelectorAll('button').forEach(el => el.toggleClass('is-active', el === button)); run(); });
        }
        createLorebaseDropdown(kinds, [{ value: 'album', label: mt('albums') }, { value: 'track', label: mt('tracks') }], this.kind, value => {
            if (this.selecting) return; this.kind = value; run();
        }, { floating: true });
        query.addEventListener('input', reset);
        query.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); run(); } });
        search.addEventListener('click', run);
        this.results = root.createDiv({ cls: 'lorebase-select-grid lorebase-select-search-grid', attr: { 'aria-live': 'polite' } });
        const pagination = root.createDiv({ cls: 'lorebase-select-pagination' });
        this.more = pagination.createEl('button', { cls: 'lorebase-flow-btn lorebase-flow-btn-secondary', text: mt('more') });
        this.more.hidden = true;
        this.more.addEventListener('click', () => { this.page++; void this.search(); });
        const footer = root.createDiv({ cls: 'lorebase-modal-actions lorebase-select-footer' });
        const manual = footer.createEl('button', { cls: 'lorebase-select-manual-action', attr: { type: 'button', 'aria-label': mt('manual') } });
        setIcon(manual.createSpan(), 'square-pen');
        manual.createSpan({ text: mt('manual') });
        manual.addEventListener('click', () => { this.query = query.value.trim(); this.openManual(); });
        const cancel = footer.createEl('button', { cls: 'lorebase-flow-btn lorebase-flow-btn-secondary', text: t('commonCancel') });
        cancel.addEventListener('click', () => this.close());
        this.addButton = footer.createEl('button', { cls: 'lorebase-flow-btn lorebase-flow-btn-primary', text: mt('add') });
        this.addButton.disabled = true;
        this.addButton.addEventListener('click', () => this.renderReview());
        this.updateSelection();
        if (isMobileInterface(root)) close.focus({ preventScroll: true });
        else query.focus();
        if (this.query) void this.search();
    }
    openManual(): void {
        if (this.selecting) return;
        this.generation++;
        this.contentEl.addClass('is-manual');
        if (!this.manualEditor || this.manualKind !== this.kind) {
            this.manualKind = this.kind;
            this.manualEditor = new MusicManualCreateModal(this.app, this.settings, this.kind, async (draft, signal) => {
                const result = await this.service.createItem(draft, signal);
                if (!this.alive || signal?.aborted) return;
                new Notice(mt(result.created ? 'added' : 'exists')); this.refresh();
            });
        }
        this.manualEditor.mountInline(this.contentEl, () => this.onOpen(), () => this.close(), this.query, () => this.close());
    }
    private async search(): Promise<void> {
        const generation = ++this.generation;
        this.more.hidden = true;
        const loading = this.results.createDiv({ text: '…', attr: { role: 'status' } });
        try {
            const ref = parseCatalogReference(this.query, { kind: 'music', provider: this.provider, musicKind: this.kind });
            const provider = (ref?.provider ?? this.provider) as MusicProvider;
            if (this.settings.music.providerEnabled?.[provider] === false) throw new CatalogReferenceError('unavailable');
            if (provider === 'lastfm' && !this.settings.music.lastfmApiKey.trim()) throw new Error(mt('keyRequired'));
            const found = await this.catalog.search(this.provider, this.kind, this.query, this.page);
            const results = ref ? found : await this.catalog.enrichSearchCovers(this.provider, this.kind, this.query, this.page, found);
            if (!this.alive || generation !== this.generation) return;
            const library = ref ? await this.service.loadItems() : [];
            if (!this.alive || generation !== this.generation) return;
            if (ref) {
                this.provider = provider;
                this.contentEl.querySelectorAll<HTMLElement>('[data-music-provider]').forEach(button => button.toggleClass('is-active', button.dataset.musicProvider === provider));
            }
            loading.remove();
            if (!results.length && this.page === 1) this.results.setText(mt('noResults'));
            for (const result of organizeMusicResults(results, this.query)) {
                const identity = musicSearchIdentity(result);
                if (this.seen.has(identity)) continue;
                this.seen.add(identity);
                const row = this.results.createDiv({ cls: 'lorebase-select-card', attr: { role: 'button', tabindex: '0', 'aria-label': result.title, 'aria-pressed': 'false' } });
                const key = this.resultKey(result); row.dataset.musicKey = key;
                const existing = result.directMatch ? library.find(item => item.musicKind === result.kind && (
                    item.integrationProvider === result.provider && item.integrationId === result.id
                    || musicSearchIdentity({ ...result, title: item.displayName, artist: item.artist }) === musicSearchIdentity(result)
                )) : undefined;
                if (existing) this.imported.add(key);
                row.toggleClass('is-picked', this.selected.has(key));
                row.toggleClass('is-in-library', this.imported.has(key));
                row.setAttribute('aria-pressed', String(this.selected.has(key)));
                const image = row.createDiv({ cls: 'lorebase-select-card-image' });
                const cover = image.createEl('img', { attr: { src: result.image || DEFAULT_COVER, alt: '', loading: 'eager', decoding: 'async' } });
                let fallbackTried = false;
                const recoverCover = async (): Promise<void> => {
                    if (!this.alive || generation !== this.generation) return;
                    if (!fallbackTried && result.fallbackImage) {
                        fallbackTried = true; cover.src = result.fallbackImage; return;
                    }
                    if (cover.getAttribute('src') !== DEFAULT_COVER) cover.src = DEFAULT_COVER;
                };
                cover.addEventListener('error', () => { void recoverCover(); });
                row.setAttribute('title', result.title);
                row.createDiv({ cls: 'lorebase-select-card-check' });
                const info = row.createDiv({ cls: 'lorebase-select-card-body' });
                info.createDiv({ cls: 'lorebase-select-card-title', text: result.title });
                info.createDiv({ cls: 'lorebase-select-card-meta', text: [result.artist, result.year].filter(Boolean).join(' · ') });
                if (existing) info.createDiv({ cls: 'lorebase-select-library-state', text: referenceText('openExisting') });
                const choose = () => {
                    if (!this.selecting && existing) { this.close(); void this.app.workspace.openLinkText(existing.filePath, '', true); return; }
                    if (this.selecting || this.imported.has(key)) return;
                    if (this.selected.has(key)) this.selected.delete(key); else this.selected.set(key, result);
                    row.toggleClass('is-picked', this.selected.has(key));
                    row.setAttribute('aria-pressed', String(this.selected.has(key)));
                    this.updateSelection();
                };
                row.addEventListener('click', choose);
                row.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); } });
            }
            this.more.hidden = Boolean(ref) || results.length < 20;
        } catch (error) {
            if (!this.alive || generation !== this.generation) return;
            loading.remove(); this.results.createDiv({ text: error instanceof CatalogReferenceError || error instanceof Error && error.message === mt('keyRequired') ? error.message : mt('error'), attr: { role: 'alert' } });
            if (this.page > 1) { this.page--; this.more.hidden = false; }
        }
    }
    private resultKey(result: MusicSearchResult): string { return result.provider + ':' + result.kind + ':' + result.id; }
    private renderReview():void {
        if(this.selecting || !this.selected.size) return;
        this.reviewing=true;this.generation++;
        const root=this.contentEl;root.empty();root.addClass('is-reviewing');
        const header=root.createDiv({cls:'lorebase-select-review-header'});
        const title=header.createDiv({cls:'lorebase-select-review-title-row'});
        setIcon(title.createSpan({cls:'lorebase-select-title-icon'}),'check-check');
        title.createEl('h2',{cls:'lorebase-select-title',text:t('promptReviewSelected')});
        addMobileModalClose(this.modalEl,header,()=>this.close());
        this.results=root.createDiv({cls:'lorebase-select-grid lorebase-select-review-gallery'});
        for(const selection of this.selected.values()) {
            const card=this.results.createDiv({cls:'lorebase-select-card is-picked',attr:{'data-music-key':this.resultKey(selection)}});
            card.createDiv({cls:'lorebase-select-card-image'}).createEl('img',{attr:{src:selection.image || DEFAULT_COVER,alt:'',loading:'lazy'}});
            card.createDiv({cls:'lorebase-select-card-title',text:selection.title});
            if(selection.artist) card.createDiv({cls:'lorebase-select-card-subtitle',text:selection.artist});
        }
        const footer=root.createDiv({cls:'lorebase-modal-actions lorebase-select-footer'});
        const back=footer.createEl('button',{cls:'lorebase-flow-btn lorebase-flow-btn-secondary',text:t('commonBack'),attr:{type:'button'}});
        back.addEventListener('click',()=>this.onOpen());
        this.addButton=footer.createEl('button',{cls:'lorebase-flow-btn lorebase-flow-btn-primary',attr:{type:'button'}});
        this.addButton.addEventListener('click',()=>{void this.addSelected();});
        this.updateSelection();back.focus();
    }
    private updateSelection(): void {
        if (!this.addButton) return;
        this.addButton.disabled = this.selecting || this.selected.size === 0;
        this.addButton.textContent = (this.reviewing ? t('promptConfirmSelected') : mt('add')) + (this.selected.size ? ' (' + this.selected.size + ')' : '');
    }
    private async addSelected(): Promise<void> {
        if (this.selecting || !this.selected.size) return;
        this.selecting = true;
        this.contentEl.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button').forEach(element => element.disabled = true);
        let added = 0; let existing = 0; let failed = 0;
        try {
            for (const [key, selection] of Array.from(this.selected)) {
                if (!this.alive) break;
                try {
                    const item = await this.catalog.details(selection);
                    if (!this.alive) break;
                    const result = await this.service.createItem(item, this.lifetime.signal);
                    result.created ? added++ : existing++;
                    this.selected.delete(key); this.imported.add(key);
                    this.results.querySelectorAll<HTMLElement>('[data-music-key]').forEach(row => {
                        if (row.dataset.musicKey === key) { row.removeClass('is-picked'); row.addClass('is-in-library'); row.setAttribute('aria-pressed', 'false'); }
                    });
                } catch { failed++; }
            }
            if (added || existing) { this.refresh(); new Notice(mt(added ? 'added' : 'exists') + ': ' + (added + existing)); }
            if (failed) new Notice(mt('error') + ' (' + failed + ')');
            if (this.alive && !this.selected.size) this.close();
        } finally {
            this.selecting = false;
            if (this.alive) {
                this.contentEl.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button').forEach(element => element.disabled = false);
                this.updateSelection();
            }
        }
    }
    onClose(): void { this.lifetime.abort(); this.alive = false; this.generation++; this.manualEditor?.disposeInline(); this.contentEl.empty(); }
}
