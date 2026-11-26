import { areOnlineExtrasEnabled, onOnlineExtrasChange } from '../services/onlineExtras';
import { onlineExtrasText } from '../localization/onlineExtras';
import type Hls from 'hls.js';
import { setIcon } from 'obsidian';
import { galleryText } from '../localization/gallery';
import type { SourceTrailer } from '../services/integrations/types';

export function renderGalleryTrailers(root: HTMLElement, trailers: SourceTrailer[]): () => void {
    if (!areOnlineExtrasEnabled()) { root.createDiv({ text: onlineExtrasText('disabled') }); return () => {}; }
    const stage = root.createDiv({ cls: 'lorebase-poster-gallery-trailer' });
    const footer = root.createDiv({ cls: 'lorebase-poster-gallery-trailer-footer' });
    const details = footer.createDiv({ cls: 'lorebase-poster-gallery-trailer-details' });
    const name = details.createEl('strong');
    const position = details.createSpan({ cls: 'lorebase-poster-gallery-trailer-position', attr: { 'aria-live': 'polite' } });
    position.hidden = trailers.length <= 1;
    const external = footer.createEl('a', { text: galleryText('external'), attr: { target: '_blank', rel: 'noopener noreferrer' } });
    const error = root.createDiv({ cls: 'lorebase-poster-gallery-status', text: galleryText('playbackFailed'), attr: { role: 'status' } });
    const labels = trailers.map((trailer, index) => trailer.title || galleryText('trailer') + ' ' + (index + 1));

    let selected = -1;
    let stop: (() => void) | undefined;
    const chooser = trailers.length > 1 ? createTrailerStrip(root, trailers, labels, choose) : undefined;
    const stopExtrasWatch = onOnlineExtrasChange(enabled => {
        if (!enabled) { stop?.(); stop = undefined; stage.empty(); stage.createDiv({ text: onlineExtrasText('disabled') }); }
        else { const index = selected; selected = -1; choose(index); }
    });
    choose(0);
    return () => { stopExtrasWatch(); stop?.(); };

    function choose(index: number): void {
        if (index === selected || index < 0 || index >= trailers.length) return;
        selected = index;
        stop?.();
        stop = undefined;
        stage.empty();
        error.hidden = true;

        const trailer = trailers[index];
        const label = labels[index];
        name.textContent = label;
        position.textContent = (index + 1) + ' / ' + trailers.length;
        external.href = trailer.url;
        chooser?.update(index);
        if (!areOnlineExtrasEnabled()) { stage.createDiv({ text: onlineExtrasText('disabled') }); return; }
        const play = stage.createEl('button', {
            cls: 'lorebase-poster-gallery-play',
            attr: { type: 'button', 'aria-label': galleryText('play'), title: galleryText('play') },
        });
        if (trailer.thumbnail) play.createEl('img', { attr: { src: trailer.thumbnail, alt: '' } });
        setIcon(play.createSpan(), 'play');
        play.addEventListener('click', () => {
            stage.empty();
            stop = startPlayback(stage, trailer, label, () => { error.hidden = false; });
        });
    }
}

function createTrailerStrip(root: HTMLElement, trailers: SourceTrailer[], labels: string[], choose: (index: number) => void) {
    const strip = root.createDiv({ cls: 'lorebase-poster-gallery-trailer-strip', attr: { role: 'group', 'aria-label': galleryText('trailers') } });
    let current = 0;
    const previous = arrow('chevron-left', galleryText('previousTrailer'), -1);
    const track = strip.createDiv({ cls: 'lorebase-poster-gallery-trailer-list' });
    const next = arrow('chevron-right', galleryText('nextTrailer'), 1);

    const cards = trailers.map((trailer, index) => {
        const button = track.createEl('button', {
            attr: { type: 'button', title: labels[index], 'aria-label': labels[index] },
        });
        const preview = button.createSpan({ cls: 'lorebase-poster-gallery-trailer-thumb', attr: { 'aria-hidden': 'true' } });
        if (trailer.thumbnail) preview.createEl('img', { attr: { src: trailer.thumbnail, alt: '', loading: 'lazy', decoding: 'async' } });
        else setIcon(preview, 'film');
        button.createSpan({ cls: 'lorebase-poster-gallery-trailer-caption', text: labels[index] });
        button.addEventListener('click', () => choose(index));
        return button;
    });

    track.addEventListener('keydown', event => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const index = current + (event.key === 'ArrowRight' ? 1 : -1);
        if (cards[index]) {
            choose(index);
            cards[index].focus({ preventScroll: true });
        }
    });

    function arrow(icon: string, label: string, direction: number): HTMLButtonElement {
        const button = strip.createEl('button', {
            cls: 'lorebase-poster-gallery-trailer-arrow',
            attr: { type: 'button', 'aria-label': label, title: label },
        });
        setIcon(button, icon);
        button.addEventListener('click', () => choose(current + direction));
        return button;
    }

    return {
        update(index: number) {
            current = index;
            previous.disabled = index === 0;
            next.disabled = index === cards.length - 1;
            cards.forEach((card, i) => {
                card.setAttribute('aria-pressed', String(i === index));
                card.tabIndex = i === index ? 0 : -1;
            });
            const card = cards[index];
            const left = card.offsetLeft;
            const right = left + card.offsetWidth;
            if (left < track.scrollLeft) track.scrollTo({ left });
            else if (right > track.scrollLeft + track.clientWidth) track.scrollTo({ left: right - track.clientWidth });
        },
    };
}

function startPlayback(stage: HTMLElement, trailer: SourceTrailer, title: string, onError: () => void): (() => void) | undefined {
    if (!areOnlineExtrasEnabled()) { stage.createDiv({ text: onlineExtrasText('disabled') }); return; }
    const playback = trailer.playback;
    if (playback.kind === 'embed') {
        const frame = stage.createEl('iframe', {
            attr: {
                title, src: playback.url, allow: 'autoplay; fullscreen; encrypted-media; picture-in-picture',
                sandbox: 'allow-scripts allow-same-origin allow-presentation',
                referrerpolicy: 'strict-origin-when-cross-origin',
            },
        });
        return () => frame.remove();
    }

    const video = stage.createEl('video', { attr: { controls: '', autoplay: '', playsinline: '' } });
    video.addEventListener('error', onError);
    let hls: Hls | undefined;
    let disposed = false;
    if (playback.kind === 'file' || video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = playback.url;
    } else {
        void import('hls.js').then(({ default: Player }) => {
            if (disposed || !areOnlineExtrasEnabled()) return;
            if (!Player.isSupported()) {
                onError();
                return;
            }
            hls = new Player({ enableWorker: false });
            hls.on(Player.Events.ERROR, (_event, data) => {
                if (data.fatal) {
                    hls?.destroy();
                    hls = undefined;
                    onError();
                }
            });
            hls.attachMedia(video);
            hls.loadSource(playback.url);
        }).catch(() => { if (!disposed) onError(); });
    }
    return () => {
        disposed = true;
        hls?.destroy();
        video.pause();
        video.removeAttribute('src');
        video.load();
    };
}
