// @vitest-environment happy-dom
import { App, Modal } from 'obsidian';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { i18n } from '../src/localization';
import { bindPosterGallery } from '../src/modals/PosterGalleryModal';
import { fetchSourceGallery } from '../src/services/integrations/sourceGallery';
import { fetchSourceTrailers } from '../src/services/integrations/sourceTrailers';
import type { SourceImage, SourceTrailer } from '../src/services/integrations/types';
import { installStatisticsDom } from './helpers/statisticsDom';

beforeAll(() => {
    installStatisticsDom();
    i18n.setLanguage('en');
});
afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
});

it('uses Steam storefront screenshots and discards duplicate or invalid URLs', async () => {
    const fetch = vi.fn(async () => ({
        '1091500': { success: true, data: { screenshots: [
            { path_full: 'https://steam.example/full.jpg', path_thumbnail: 'https://steam.example/thumb.jpg' },
            { path_full: 'https://steam.example/full.jpg' },
            { path_full: 'file:///local.jpg' },
        ] } },
    }));
    expect(await fetchSourceGallery(fetch, { provider: 'steam', id: '1091500', videoKind: 'tv' }))
        .toEqual([{ url: 'https://steam.example/full.jpg', thumbnail: 'https://steam.example/thumb.jpg' }]);
    expect(fetch).toHaveBeenCalledWith('https://store.steampowered.com/api/appdetails?appids=1091500&filters=screenshots');
});

it('resolves Shikimori thumbnails and originals against the catalog', async () => {
    const fetch = vi.fn(async () => [{ original: '/images/full.jpg', preview: '/images/thumb.jpg' }]);
    expect(await fetchSourceGallery(fetch, { provider: 'shikimori', id: '1', videoKind: 'tv' }))
        .toEqual([{ url: 'https://shikimori.net/images/full.jpg', thumbnail: 'https://shikimori.net/images/thumb.jpg' }]);
});

it('keeps loading RAWG pages until the source has no next page', async () => {
    const fetch = vi.fn(async (url: string) => {
        const page = new URL(url).searchParams.get('page');
        return page === '1'
            ? { results: [{ image: 'https://rawg.example/1.jpg' }], next: 'https://api.rawg.io/api/games/12/screenshots?page=2' }
            : { results: [{ image: 'https://rawg.example/2.jpg' }], next: null };
    });
    const progress = vi.fn();
    const images = await fetchSourceGallery(fetch, { provider: 'rawg', id: '12', apiKey: 'key', videoKind: 'tv' }, progress);
    expect(progress).toHaveBeenCalledWith([{ url: 'https://rawg.example/1.jpg', thumbnail: 'https://rawg.example/1.jpg' }]);
    expect(images.map(image => image.url)).toEqual(['https://rawg.example/1.jpg', 'https://rawg.example/2.jpg']);
    expect(fetch).toHaveBeenCalledTimes(2);
});

function mockGalleryOpen() {
    return vi.spyOn(Modal.prototype, 'open').mockImplementation(function (this: Modal) {
        this.modalEl = document.body.createDiv();
        this.contentEl = this.modalEl.createDiv();
        (this as Modal & { onOpen(): void }).onOpen();
    });
}

it('opens from the poster, loads on demand, and navigates the full set of images', async () => {
    const open = mockGalleryOpen();
    const editor = document.body.createDiv();
    const poster = editor.createEl('img', { attr: { 'data-role': 'poster' } });
    const load = vi.fn(async () => [
        { url: 'https://example.com/1.jpg', thumbnail: 'https://example.com/thumb1.jpg' },
        { url: 'https://example.com/2.jpg', thumbnail: 'https://example.com/thumb2.jpg' },
        { url: 'https://example.com/3.jpg', thumbnail: 'https://example.com/thumb3.jpg' },
    ]);
    bindPosterGallery(new App(), editor, 'Test game', { source: 'Steam', imageTabs: ['images'], loadImages: load });
    expect(load).not.toHaveBeenCalled();
    poster.click();
    expect(open).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledOnce();

    const gallery = document.querySelector<HTMLElement>('.lorebase-poster-gallery-modal')!;
    const preview = () => gallery.querySelector<HTMLImageElement>('.lorebase-poster-gallery-preview img')?.src;
    await vi.waitFor(() => expect(preview()).toBe('https://example.com/thumb1.jpg'));

    gallery.querySelector<HTMLButtonElement>('[aria-label="Next image"]')!.click();
    expect(preview()).toBe('https://example.com/thumb2.jpg');
    const third = gallery.querySelector<HTMLButtonElement>('.lorebase-poster-gallery-thumbnails button:last-child')!;
    third.click();
    expect(preview()).toBe('https://example.com/thumb3.jpg');
    expect(third.getAttribute('aria-pressed')).toBe('true');
    expect(gallery.querySelector('[aria-live]')?.textContent).toBe('3 / 3');
});

it('shows partial results immediately and keeps the thumbnail window bounded', async () => {
    mockGalleryOpen();
    const editor = document.body.createDiv();
    const poster = editor.createEl('img', { attr: { 'data-role': 'poster' } });
    const images = Array.from({ length: 27 }, (_, i) => ({ url: 'https://example.com/' + i, thumbnail: 'https://example.com/thumb' + i }));
    let complete!: (images: SourceImage[]) => void;
    const loadImages = (progress?: (images: SourceImage[]) => void) => {
        progress?.(images.slice(0, 14));
        return new Promise<SourceImage[]>(resolve => { complete = resolve; });
    };
    bindPosterGallery(new App(), editor, 'Test game', { source: 'Steam', imageTabs: ['images'], loadImages });
    poster.click();
    const modal = document.querySelector<HTMLElement>('.lorebase-poster-gallery-modal')!;
    const count = () => modal.querySelector('.lorebase-poster-gallery-count')?.textContent;
    expect(count()).toBe('1 / 14');
    expect(modal.querySelectorAll('.lorebase-poster-gallery-thumbnails button')).toHaveLength(12);
    modal.querySelector<HTMLButtonElement>('[aria-label="Next thumbnails"]')!.click();
    expect(count()).toBe('13 / 14');
    complete(images);
    await vi.waitFor(() => expect(count()).toBe('13 / 27'));
    expect(modal.querySelectorAll('.lorebase-poster-gallery-thumbnails button')).toHaveLength(12);
});

it('separates backdrops and posters and opens a trailer player only after pressing play', async () => {
    mockGalleryOpen();
    const editor = document.body.createDiv();
    const poster = editor.createEl('img', { attr: { 'data-role': 'poster' } });
    const images: SourceImage[] = [
        { kind: 'backdrops', url: 'https://example.com/backdrop', thumbnail: 'https://example.com/backdrop' },
        { kind: 'posters', url: 'https://example.com/poster', thumbnail: 'https://example.com/poster' },
    ];
    const trailers: SourceTrailer[] = [{
        title: 'Teaser', url: 'https://www.youtube.com/watch?v=abcdefghijk',
        thumbnail: 'https://example.com/teaser.jpg',
        playback: { kind: 'embed', url: 'https://www.youtube-nocookie.com/embed/abcdefghijk?autoplay=1' },
    }, {
        title: 'Official Trailer', url: 'https://www.youtube.com/watch?v=zyxwvutsrqp',
        playback: { kind: 'embed', url: 'https://www.youtube-nocookie.com/embed/zyxwvutsrqp?autoplay=1' },
    }];
    const loadTrailers = vi.fn(async () => trailers);
    bindPosterGallery(new App(), editor, 'Test series', { source: 'TMDB', imageTabs: ['backdrops', 'posters'], loadImages: async () => images, loadTrailers });
    poster.click();
    const modal = document.querySelector<HTMLElement>('.lorebase-poster-gallery-modal')!;
    const preview = () => modal.querySelector<HTMLImageElement>('.lorebase-poster-gallery-preview img')?.src;
    const tab = (title: string) => Array.from(modal.querySelectorAll<HTMLButtonElement>('.lorebase-poster-gallery-tabs button'))
        .find(button => button.textContent?.startsWith(title))!;
    await vi.waitFor(() => expect(preview()).toBe('https://example.com/backdrop'));
    expect(modal.querySelector('details')?.textContent).toContain('Internet required');
    tab('Posters').click();
    expect(preview()).toBe('https://example.com/poster');
    expect(loadTrailers).not.toHaveBeenCalled();

    tab('Trailers').click();
    await vi.waitFor(() => expect(modal.querySelector('[aria-label="Play trailer"]')).not.toBeNull());
    expect(modal.querySelector('iframe')).toBeNull();
    const cards = modal.querySelectorAll<HTMLButtonElement>('.lorebase-poster-gallery-trailer-list > button');
    const count = modal.querySelector('.lorebase-poster-gallery-trailer-position');
    const next = modal.querySelector<HTMLButtonElement>('[aria-label="Next trailer"]')!;
    expect(cards[0].querySelector('img')?.src).toBe(trailers[0].thumbnail);
    expect(cards[0].getAttribute('aria-pressed')).toBe('true');
    next.click();
    expect(cards[1].getAttribute('aria-pressed')).toBe('true');
    expect(count?.textContent).toBe('2 / 2');
    expect(next.disabled).toBe(true);
    expect(modal.querySelector('.lorebase-poster-gallery-trailer-footer a')?.getAttribute('href')).toBe(trailers[1].url);

    const createElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag, options) => {
        const element = createElement(tag, options);
        if (tag === 'iframe') element.setAttribute('srcdoc', '');
        return element;
    });
    modal.querySelector<HTMLButtonElement>('[aria-label="Play trailer"]')!.click();
    expect(modal.querySelector('iframe')?.src).toBe(trailers[1].playback.url);
    cards[1].click();
    expect(modal.querySelector('iframe')?.src).toBe(trailers[1].playback.url);
    cards[0].click();
    expect(modal.querySelector('iframe')).toBeNull();
    expect(count?.textContent).toBe('1 / 2');
    tab('Backdrops').click();
    expect(modal.querySelector('iframe')).toBeNull();
});

it('maps current Steam trailers to HLS and filters unrelated TMDB videos', async () => {
    const steam = vi.fn(async () => ({
        '1091500': { success: true, data: { movies: [
            { name: 'Launch trailer', hls_h264: 'https://video.steamstatic.com/stream.m3u8' },
        ] } },
    }));
    expect(await fetchSourceTrailers(steam, { provider: 'steam', id: '1091500', language: 'en-US', videoKind: 'tv' }))
        .toMatchObject([{ title: 'Launch trailer', playback: { kind: 'hls', url: 'https://video.steamstatic.com/stream.m3u8' } }]);

    const tmdb = vi.fn(async () => ({
        results: [
            { name: 'Launch trailer', type: 'Trailer', site: 'YouTube', key: 'abcdefghijk' },
            { name: 'Interview', type: 'Featurette', site: 'YouTube', key: 'zzzzzzzzzzz' },
        ],
    }));
    const clips = await fetchSourceTrailers(tmdb, { provider: 'tmdb', id: '123', videoKind: 'tv', language: 'ru-RU' });
    expect(clips).toHaveLength(1);
    expect(clips[0].playback.url).toBe('https://www.youtube-nocookie.com/embed/abcdefghijk?autoplay=1');
    expect(tmdb).toHaveBeenCalledTimes(2);
});
