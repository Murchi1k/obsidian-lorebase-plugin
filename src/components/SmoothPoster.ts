
import { DEFAULT_COVER } from '../constants';

type PosterLoad = { key: string; cancel: () => void; setPriority: (priority: 'high' | 'low') => void };
const loads = new WeakMap<HTMLImageElement, PosterLoad>();

export function cancelPosterLoad(image: HTMLImageElement): void {
    loads.get(image)?.cancel();
    loads.delete(image);
}

export function setPosterLoadPriority(image: HTMLImageElement, priority: 'high' | 'low'): void {
    loads.get(image)?.setPriority(priority);
}

/** Keep the current decoded image visible until its replacement is ready. */
export function setSmoothPoster(image: HTMLImageElement, sources: readonly (string | null | undefined)[], onDisplayed?: (source: string) => void): void {
    const candidates = [...new Set([...sources.filter((source): source is string => Boolean(source)), DEFAULT_COVER])];
    const key = JSON.stringify(candidates);
    if (loads.get(image)?.key === key) return;
    cancelPosterLoad(image);
    const view = image.ownerDocument.defaultView;
    if (!view) return;
    let cancelled = false;
    let loader: HTMLImageElement | null = null;
    let overlay: HTMLImageElement | null = null;
    let animation: Animation | null = null;
    let priority = image.getAttribute('fetchpriority') || 'auto';
    const state: PosterLoad = { key, cancel: () => {
        cancelled = true;
        if (loader) { loader.onload = null; loader.onerror = null; loader.removeAttribute('src'); }
        animation?.cancel();
        overlay?.remove();
    }, setPriority: value => { priority = value; loader?.setAttribute('fetchpriority', value); } };
    loads.set(image, state);
    if (!image.getAttribute('src')) image.src = DEFAULT_COVER;
    let index = 0;
    const next = (): void => {
        if (cancelled || index >= candidates.length) return;
        const source = candidates[index++];
        if (source === image.getAttribute('src') && image.complete && image.naturalWidth > 0) { onDisplayed?.(source); return; }
        loader = image.ownerDocument.createElement('img');
        loader.decoding = 'async';
        loader.setAttribute('fetchpriority', priority);
        loader.onerror = next;
        loader.onload = () => {
            const loaded = loader!;
            void (async () => {
                try { await loaded.decode?.(); } catch { /* A successful load can still be usable without decode(). */ }
                // A virtual card can be detached in the bounded scroll cache.
                // Its owner cancels explicitly when evicted or destroyed.
                if (cancelled) return;
                const oldSource = image.getAttribute('src');
                const reducedMotion = view.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
                if (image.isConnected && oldSource && oldSource !== DEFAULT_COVER && oldSource !== source && !reducedMotion && typeof image.animate === 'function') {
                    overlay = image.cloneNode(false) as HTMLImageElement;
                    overlay.removeAttribute('id');
                    overlay.removeAttribute('data-role');
                    overlay.alt = '';
                    overlay.setAttribute('aria-hidden', 'true');
                    overlay.classList.add('lorebase-poster-transition');
                    image.after(overlay);
                }
                image.src = source;
                onDisplayed?.(source);
                if (overlay) {
                    const previous = overlay;
                    animation = previous.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: 'ease-out', fill: 'forwards' });
                    void animation.finished.catch(() => {});
                    animation.onfinish = () => { previous.remove(); if (overlay === previous) overlay = null; };
                }
                loaded.onload = null;
                loaded.onerror = null;
            })();
        };
        loader.src = source;
    };
    next();
}
