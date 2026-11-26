import { App, Modal, setIcon } from 'obsidian';
import { areOnlineExtrasEnabled, assertOnlineExtras, onOnlineExtrasChange } from '../services/onlineExtras';
import { createGalleryImageBrowser } from '../components/GalleryImageBrowser';
import { renderGalleryTrailers } from '../components/GalleryTrailerPlayer';
import { galleryText as gt } from '../localization/gallery';
import { rt } from '../localization/recommendations';
import type { GalleryImageKind, SourceGallery, SourceImage, SourceTrailer } from '../services/integrations/types';

type GalleryTab = GalleryImageKind | 'trailers';
type State = 'idle' | 'loading' | 'loaded' | 'failed';
type ImageProgress = (images: SourceImage[]) => void;

const tabIcons: Record<GalleryTab, string> = {
    images: 'images', backdrops: 'image', posters: 'rectangle-vertical', trailers: 'film',
};

export function bindPosterGallery(app: App, root: HTMLElement, title: string, gallery?: SourceGallery): (() => void) | undefined {
    if (!gallery) return;
    const poster = root.querySelector<HTMLImageElement>('img[data-role="poster"]');
    if (!poster || poster.parentElement?.classList.contains('lorebase-poster-gallery-trigger')) return;

    const name = gt('title');
    const button = poster.ownerDocument.adoptNode(createEl('button', {
        cls: 'lorebase-poster-gallery-trigger', title: name,
        attr: { type: 'button', 'aria-label': name + ' · ' + title },
    }));
    poster.before(button);
    button.appendChild(poster);
    const icon = button.createSpan({ cls: 'lorebase-poster-gallery-icon', attr: { 'aria-hidden': 'true' } });
    setIcon(icon, 'images');

    const session = cacheGallery(gallery);
    button.disabled = !areOnlineExtrasEnabled();
    const stop = onOnlineExtrasChange(enabled => { button.disabled = !enabled; });
    button.addEventListener('click', () => { if (areOnlineExtrasEnabled()) new PosterGalleryModal(app, title, session).open(); });
    return stop;
}

function cacheGallery(gallery: SourceGallery): SourceGallery {
    let imageRequest: Promise<SourceImage[]> | undefined;
    let trailerRequest: Promise<SourceTrailer[]> | undefined;
    const loadTrailers = gallery.loadTrailers;
    let partial: SourceImage[] = [];
    const listeners = new Set<ImageProgress>();
    return {
        ...gallery,
        loadImages(report) {
            assertOnlineExtras();
            if (report) {
                listeners.add(report);
                if (partial.length) report(partial);
            }
            imageRequest ??= gallery.loadImages(images => {
                partial = images;
                for (const listener of listeners) listener(images);
            }).then(images => {
                partial = images;
                return images;
            }).catch(error => {
                imageRequest = undefined;
                throw error;
            });
            return report ? imageRequest.finally(() => listeners.delete(report)) : imageRequest;
        },
        loadTrailers: loadTrailers && (() => trailerRequest ??= loadTrailers().catch(error => {
            trailerRequest = undefined;
            throw error;
        })),
    };
}

class PosterGalleryModal extends Modal {
    private stopExtrasWatch?: () => void;
    private alive = false;
    private activeTab: GalleryTab = 'images';
    private controls = new Map<GalleryTab, { button: HTMLButtonElement; count: HTMLElement }>();
    private body!: HTMLElement;
    private status!: HTMLElement;
    private imageState: State = 'idle';
    private trailerState: State = 'idle';
    private images: SourceImage[] = [];
    private trailers: SourceTrailer[] = [];
    private imageBrowser?: ReturnType<typeof createGalleryImageBrowser>;
    private stopPlayback?: () => void;

    constructor(app: App, private readonly mediaTitle: string, private readonly gallery: SourceGallery) {
        super(app);
    }

    onOpen(): void {
        if (!areOnlineExtrasEnabled()) { this.close(); return; }
        this.stopExtrasWatch = onOnlineExtrasChange(enabled => { if (!enabled) this.close(); });
        this.alive = true;
        this.modalEl.addClass('lorebase-poster-gallery-modal');
        this.contentEl.empty();

        const header = this.contentEl.createDiv({ cls: 'lorebase-poster-gallery-header' });
        setIcon(header.createSpan({ cls: 'lorebase-poster-gallery-heading-icon', attr: { 'aria-hidden': 'true' } }), 'images');
        const heading = header.createDiv();
        heading.createSpan({ cls: 'lorebase-poster-gallery-eyebrow', text: gt('title') });
        heading.createEl('h2', { cls: 'lorebase-poster-gallery-title', text: this.mediaTitle });

        const help = this.contentEl.createEl('details', { cls: 'lorebase-people-help lorebase-poster-gallery-help' });
        const summary = help.createEl('summary');
        setIcon(summary.createSpan({ cls: 'lorebase-people-icon', attr: { 'aria-hidden': 'true' } }), 'cloud-download');
        summary.createEl('strong', { text: this.gallery.source });
        summary.createSpan({ text: rt('online') });
        setIcon(summary.createSpan({ cls: 'lorebase-people-icon lorebase-people-help-info', attr: { 'aria-hidden': 'true' } }), 'info');
        help.createEl('p', { text: gt('help') });

        const tabs = this.contentEl.createDiv({
            cls: 'lorebase-poster-gallery-tabs', attr: { role: 'group', 'aria-label': gt('title') },
        });
        const categories: GalleryTab[] = [...this.gallery.imageTabs];
        if (this.gallery.loadTrailers) categories.push('trailers');
        for (const category of categories) {
            const button = tabs.createEl('button', { attr: { type: 'button', 'aria-pressed': 'false' } });
            setIcon(button.createSpan({ cls: 'lorebase-people-icon', attr: { 'aria-hidden': 'true' } }), tabIcons[category]);
            button.createSpan({ text: gt(category) });
            const count = button.createSpan({ cls: 'lorebase-poster-gallery-tab-count' });
            this.controls.set(category, { button, count });
            button.addEventListener('click', () => this.showTab(category));
        }

        this.body = this.contentEl.createDiv({ cls: 'lorebase-poster-gallery-body' });
        this.status = this.contentEl.createDiv({ cls: 'lorebase-poster-gallery-status', attr: { role: 'status' } });
        this.showTab(categories[0] ?? 'images');
    }

    onClose(): void {
        this.stopExtrasWatch?.();
        this.alive = false;
        this.clearMedia();
        this.controls.clear();
        this.contentEl.empty();
    }

    private clearMedia(): void {
        this.stopPlayback?.();
        this.stopPlayback = undefined;
        this.imageBrowser?.dispose();
        this.imageBrowser = undefined;
        this.body?.empty();
    }

    private showTab(tab: GalleryTab): void {
        this.clearMedia();
        this.activeTab = tab;
        for (const [category, { button }] of this.controls) {
            button.setAttribute('aria-pressed', String(category === tab));
        }
        if (tab === 'trailers' && this.trailerState === 'idle') void this.loadTrailers();
        else if (tab !== 'trailers' && this.imageState === 'idle') void this.loadImages();
        else this.render();
    }

    private async loadImages(): Promise<void> {
        this.imageState = 'loading';
        this.render();
        try {
            this.images = await this.gallery.loadImages(images => {
                if (!this.alive || images.length < this.images.length) return;
                this.images = images;
                this.render();
            });
            this.imageState = 'loaded';
        } catch {
            this.imageState = 'failed';
        }
        this.render();
    }

    private async loadTrailers(): Promise<void> {
        this.trailerState = 'loading';
        this.render();
        try {
            this.trailers = await this.gallery.loadTrailers?.() ?? [];
            this.trailerState = 'loaded';
        } catch {
            this.trailerState = 'failed';
        }
        this.render();
    }

    private imagesFor(tab: GalleryImageKind): SourceImage[] {
        return tab === 'images' ? this.images : this.images.filter(image => image.kind === tab);
    }

    private render(): void {
        if (!this.alive) return;
        for (const [category, { count }] of this.controls) {
            const quantity = category === 'trailers' ? this.trailers.length : this.imagesFor(category).length;
            count.textContent = quantity ? String(quantity) : '';
            count.hidden = quantity === 0;
        }

        const tab = this.activeTab;
        const isTrailer = tab === 'trailers';
        const state = isTrailer ? this.trailerState : this.imageState;
        const images = isTrailer ? [] : this.imagesFor(tab);
        const hasMedia = isTrailer ? this.trailers.length > 0 : images.length > 0;
        if (isTrailer && hasMedia && !this.stopPlayback) {
            this.stopPlayback = renderGalleryTrailers(this.body, this.trailers);
        }
        if (!isTrailer && hasMedia) {
            this.imageBrowser ??= createGalleryImageBrowser(this.body, this.mediaTitle, tab);
            this.imageBrowser.update(images);
        }

        this.status.empty();
        if (state === 'loading') this.status.textContent = gt('loading');
        else if (state === 'failed') {
            this.status.createSpan({ text: gt('failed') });
            const retry = this.status.createEl('button', { text: gt('retry'), attr: { type: 'button' } });
            retry.addEventListener('click', () => { void (isTrailer ? this.loadTrailers() : this.loadImages()); });
        } else if (state === 'loaded' && !hasMedia) {
            this.status.textContent = gt('empty');
        }
    }
}
