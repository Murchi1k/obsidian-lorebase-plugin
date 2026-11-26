
import { setIcon } from 'obsidian';
import { galleryText } from '../localization/gallery';
import type { GalleryImageKind, SourceImage } from '../services/integrations/types';

const PAGE_SIZE = 12;
type Browser = { update(images: SourceImage[]): void; dispose(): void };

export function createGalleryImageBrowser(root: HTMLElement, title: string, kind: GalleryImageKind): Browser {
    const preview = root.createDiv({ cls: 'lorebase-poster-gallery-preview' });
    const photo = preview.createEl('img', { attr: { decoding: 'async' } });
    const nav = root.createDiv({ cls: 'lorebase-poster-gallery-nav' });
    const previousPage = control('chevrons-left', galleryText('previousPage'), () => jumpPage(-1));
    const previous = control('chevron-left', galleryText('previous'), () => select(selected - 1));
    const count = nav.createSpan({ cls: 'lorebase-poster-gallery-count', attr: { 'aria-live': 'polite' } });
    const next = control('chevron-right', galleryText('next'), () => select(selected + 1));
    const nextPage = control('chevrons-right', galleryText('nextPage'), () => jumpPage(1));
    const grid = root.createDiv({ cls: 'lorebase-poster-gallery-thumbnails' });
    grid.dataset.kind = kind;

    let images: SourceImage[] = [];
    let selected = 0;
    let drawn: SourceImage[] = [];
    let drawnPage = -1;
    let current: SourceImage | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let original: HTMLImageElement | undefined;

    function control(icon: string, label: string, action: () => void): HTMLButtonElement {
        const button = nav.createEl('button', { attr: { type: 'button', 'aria-label': label, title: label } });
        setIcon(button, icon);
        button.addEventListener('click', action);
        return button;
    }

    function dispose(): void {
        clearTimeout(timer);
        if (original) {
            original.onload = null;
            original.removeAttribute('src');
            original = undefined;
        }
    }

    function updatePreview(image: SourceImage): void {
        if (current?.url === image.url && current.thumbnail === image.thumbnail) return;
        dispose();
        current = image;
        photo.alt = title + ' · ' + (selected + 1);
        photo.src = image.thumbnail;
        if (image.thumbnail === image.url) return;
        timer = setTimeout(() => {
            const pending = photo.ownerDocument.createElement('img');
            original = pending;
            pending.decoding = 'async';
            pending.onload = () => {
                if (original === pending) photo.src = image.url;
                original = undefined;
            };
            pending.src = image.url;
        }, 120);
    }

    function select(index: number): void {
        if (index < 0 || index >= images.length) return;
        selected = index;
        const page = Math.floor(selected / PAGE_SIZE);
        const start = page * PAGE_SIZE;
        const visible = images.slice(start, start + PAGE_SIZE);
        if (page !== drawnPage || visible.length !== drawn.length || visible.some((image, i) => image.url !== drawn[i].url)) {
            drawn = visible;
            drawnPage = page;
            grid.empty();
            for (const [offset, image] of visible.entries()) {
                const target = start + offset;
                const label = title + ' · ' + (target + 1);
                const button = grid.createEl('button', { attr: { type: 'button', 'aria-label': label } });
                const thumb = button.createEl('img', { attr: { alt: '', decoding: 'async', loading: 'lazy' } });
                thumb.src = image.thumbnail;
                button.addEventListener('click', () => select(target));
            }
        }
        for (const [offset, button] of Array.from(grid.children).entries()) {
            button.setAttribute('aria-pressed', String(start + offset === selected));
        }
        updatePreview(images[selected]);
        count.textContent = (selected + 1) + ' / ' + images.length;
        previous.disabled = selected === 0;
        next.disabled = selected === images.length - 1;
        previousPage.disabled = page === 0;
        nextPage.disabled = start + PAGE_SIZE >= images.length;
        previousPage.hidden = nextPage.hidden = images.length <= PAGE_SIZE;
        grid.hidden = images.length <= 1;
    }

    function jumpPage(direction: number): void {
        select((Math.floor(selected / PAGE_SIZE) + direction) * PAGE_SIZE);
    }

    root.addEventListener('keydown', event => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            select(selected + (event.key === 'ArrowRight' ? 1 : -1));
        }
    });
    return {
        update(nextImages) {
            images = nextImages;
            select(Math.min(selected, images.length - 1));
        },
        dispose,
    };
}
