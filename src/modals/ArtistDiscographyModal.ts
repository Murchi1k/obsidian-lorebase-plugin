
import { App, Modal, Notice, setIcon } from 'obsidian';
import { areOnlineExtrasEnabled, onOnlineExtrasChange } from '../services/onlineExtras';
import { DEFAULT_COVER } from '../constants';
import { i18n } from '../localization';
import { mt } from '../localization/music';
import { MusicCatalog } from '../services/MusicCatalog';
import { MusicService } from '../services/MusicService';
import type { MusicArtist, MusicRelease } from '../services/integrations/providers/musicDiscovery';
import { musicIdentityKeys } from '../services/media/musicIdentity';
import { isOperationCancelled } from '../services/BackgroundOperation';

export const musicCompactCount = (count: number): string => new Intl.NumberFormat(i18n.getLanguage(), {
    notation: 'compact', maximumFractionDigits: 1,
}).format(count);

export class ArtistDiscographyModal extends Modal {
    private stopExtrasWatch?: () => void;
    private alive = false;
    private generation = 0;
    private category: MusicRelease['category'] = 'album';
    private items: MusicRelease[] = [];
    private pages = { main: 0, featured: 0 };
    private morePages = { main: true, featured: true };
    private loaded = { main: false, featured: false };
    private busy = false;
    private query = '';
    private grid!: HTMLElement;
    private tabs!: HTMLElement;
    private more!: HTMLButtonElement;
    private status!: HTMLElement;
    private imported = new Set<string>();
    private importing = new Set<string>();
    private libraryKeys = new Set<string>();
    private lifetime = new AbortController();
    constructor(app: App, private artist: MusicArtist, private catalog: MusicCatalog, private service: MusicService) { super(app); }
    onOpen(): void {
        if (!areOnlineExtrasEnabled()) { this.close(); return; }
        this.stopExtrasWatch = onOnlineExtrasChange(enabled => { if (!enabled) this.close(); });
        this.alive = true;
        this.lifetime = new AbortController();
        this.modalEl.addClass('lorebase-artist-modal');
        this.contentEl.empty();
        const header = this.contentEl.createDiv({ cls: 'lorebase-artist-header' });
        this.image(header, this.artist.image, this.artist.name);
        const identity = header.createDiv();
        identity.createSpan({ cls: 'lorebase-artist-eyebrow', text: mt('discography') });
        identity.createEl('h2', { text: this.artist.name });
        const count = this.artist.listeners ?? this.artist.fans;
        identity.createSpan({ cls: 'lorebase-artist-subtitle', text: count === null ? 'Deezer' : `${musicCompactCount(count)} ${mt(this.artist.listeners === null ? 'fans' : 'listeners').toLocaleLowerCase()} · ${this.artist.listeners === null ? 'Deezer' : 'Last.fm'}` });
        const source = header.createEl('a', { cls: 'lorebase-artist-source', attr: { href: this.artist.url, target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Deezer' } });
        setIcon(source, 'external-link');
        this.contentEl.createDiv({ cls: 'lorebase-music-online-notice', text: mt('onlineMusic') });
        const toolbar = this.contentEl.createDiv({ cls: 'lorebase-discography-toolbar' });
        this.tabs = toolbar.createDiv({ cls: 'lorebase-discography-tabs', attr: { role: 'tablist', 'aria-label': mt('discography') } });
        for (const [value, label] of [['album', 'albums'], ['ep', 'eps'], ['single', 'singles'], ['featured', 'featured']] as const) {
            const button = this.tabs.createEl('button', { attr: { type: 'button', role: 'tab', 'data-category': value } });
            button.createSpan({ text: mt(label) }); button.createSpan({ cls: 'lorebase-discography-tab-count' });
            button.addEventListener('click', () => {
                this.category = value; this.render();
                if (!this.loaded[value === 'featured' ? 'featured' : 'main']) void this.load();
            });
        }
        const search = toolbar.createEl('input', { type: 'search', attr: { placeholder: mt('search'), 'aria-label': mt('search') } });
        search.addEventListener('input', () => { this.query = search.value; this.render(); });
        this.status = this.contentEl.createDiv({ cls: 'lorebase-discography-status', attr: { role: 'status', 'aria-live': 'polite' } });
        this.grid = this.contentEl.createDiv({ cls: 'lorebase-discography-grid' });
        const footer = this.contentEl.createDiv({ cls: 'lorebase-discography-footer' });
        this.more = footer.createEl('button', { text: mt('more'), attr: { type: 'button' } });
        this.more.addEventListener('click', () => { void this.load(); });
        this.render(); void this.load();
    }
    private async load(): Promise<void> {
        // Tabs remain usable during a request; a subsequent tab loads after it finishes.
        if (this.busy) return;
        const group = this.category === 'featured' ? 'featured' : 'main';
        const generation = ++this.generation;
        this.busy = true; this.status.textContent = mt('loading'); this.more.disabled = true;
        let failed = false;
        try {
            const [result, library] = await Promise.all([
                group === 'featured'
                    ? this.catalog.appearances(this.artist.name, this.pages[group])
                    : this.catalog.releases(this.artist, this.pages[group]),
                this.service.loadItems(),
            ]);
            if (!this.alive || generation !== this.generation) return;
            this.libraryKeys = new Set(library.flatMap(musicIdentityKeys));
            const known = new Set(this.items.map(item => `${item.provider}:${item.id}`));
            this.items.push(...result.items.filter(item => !known.has(`${item.provider}:${item.id}`)));
            this.pages[group]++; this.loaded[group] = true; this.morePages[group] = result.more;
        } catch { failed = true; if (this.alive && generation === this.generation) this.status.textContent = mt('error'); }
        finally {
            if (this.alive && generation === this.generation) {
                this.busy = false; this.render(failed);
                const current = this.category === 'featured' ? 'featured' : 'main';
                if (current !== group && !this.loaded[current]) void this.load();
            }
        }
    }
    private render(failed = false): void {
        this.tabs.querySelectorAll<HTMLButtonElement>('button').forEach(button => {
            const category = button.dataset.category;
            button.setAttribute('aria-selected', String(category === this.category));
            const count = this.items.filter(item => item.category === category).length;
            button.querySelector('span:last-child')!.textContent = count ? String(count) : '';
        });
        const group = this.category === 'featured' ? 'featured' : 'main';
        const items = this.items.filter(item => item.category === this.category && `${item.title} ${item.artist}`.toLocaleLowerCase().includes(this.query.trim().toLocaleLowerCase()))
            .sort((a, b) => b.released.localeCompare(a.released) || a.title.localeCompare(b.title));
        if (!failed) this.status.textContent = this.busy ? mt('loading') : this.category === 'featured' ? mt('featuredHelp') : items.length ? '' : mt('noResults');
        this.grid.empty();
        for (const item of items) {
            const card = this.grid.createEl('article', { cls: 'lorebase-discography-release' });
            const art = card.createEl('a', { cls: 'lorebase-discography-art', attr: { href: item.provider === 'deezer' ? `https://www.deezer.com/album/${item.id}` : `https://musicbrainz.org/release-group/${item.id}`, target: '_blank', rel: 'noopener noreferrer', 'aria-label': item.title } });
            this.image(art, item.image, item.title);
            card.createEl('strong', { text: item.title, attr: { title: item.title } });
            card.createSpan({ cls: 'lorebase-discography-release-meta', text: `${item.year || '—'}${this.category === 'featured' ? ` · ${item.artist}` : ''}` });
            const key = `${item.provider}:${item.id}`;
            const exists = this.isInLibrary(item);
            card.toggleClass('is-in-library', exists);
            const add = card.createEl('button', { text: mt(exists ? 'exists' : this.importing.has(key) ? 'loading' : 'addRelease'), attr: { type: 'button' } });
            add.disabled = exists || this.importing.has(key);
            add.addEventListener('click', () => { void this.addRelease(item, key); });
        }
        this.more.hidden = !this.morePages[group];
        this.more.disabled = this.busy;
    }
    private isInLibrary(item: MusicRelease): boolean {
        return this.imported.has(`${item.provider}:${item.id}`) || musicIdentityKeys({
            musicKind: item.kind, displayName: item.title, artist: item.artist,
            integrationProvider: item.provider, integrationId: item.id,
        }).some(key => this.libraryKeys.has(key));
    }
    private async addRelease(item: MusicRelease, key: string): Promise<void> {
        if (!this.alive || this.importing.has(key) || this.isInLibrary(item)) return;
        const signal = this.lifetime.signal;
        this.importing.add(key); this.render();
        try {
            const details = await this.catalog.releaseDetails(item);
            if (signal.aborted) return;
            const result = await this.service.createItem(details, signal);
            if (signal.aborted) return;
            musicIdentityKeys(result.item).forEach(identity => this.libraryKeys.add(identity));
            this.imported.add(key); new Notice(mt(result.created ? 'added' : 'exists'));
        } catch (error) { if (!signal.aborted && !isOperationCancelled(error)) new Notice(mt('error')); }
        finally { this.importing.delete(key); if (this.alive) this.render(); }
    }
    private image(parent: HTMLElement, url: string, alt: string): void {
        const image = parent.createEl('img', { attr: { src: url || DEFAULT_COVER, alt, loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' } });
        image.addEventListener('error', () => { if (image.src !== DEFAULT_COVER) image.src = DEFAULT_COVER; }, { once: true });
    }
    onClose(): void { this.stopExtrasWatch?.(); this.alive = false; this.lifetime.abort(); this.generation++; this.contentEl.empty(); }
}
