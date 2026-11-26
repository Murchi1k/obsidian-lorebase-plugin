/** Reveal the caption in place after hovering anywhere on its card. */
export function attachDelayedTitleExpansion(card: HTMLElement, title: HTMLElement, signal: AbortSignal): void {
    const win = card.ownerDocument.defaultView;
    if (!win || signal.aborted) return;
    let timer: number | undefined;
    const collapse = (): void => {
        win.clearTimeout(timer);
        timer = undefined;
        card.classList.remove('is-title-expanded');
    };
    const expand = (): void => {
        // Moving focus inside an already hovered card must not restart the wait.
        if (timer !== undefined || card.classList.contains('is-title-expanded')) return;
        if (title.scrollWidth <= title.clientWidth) return;
        timer = win.setTimeout(() => {
            timer = undefined;
            if (card.isConnected && !signal.aborted) card.classList.add('is-title-expanded');
        }, 500);
    };
    card.addEventListener('mouseenter', expand, { signal });
    card.addEventListener('mouseleave', collapse, { signal });
    card.addEventListener('focusin', expand, { signal });
    card.addEventListener('focusout', event => {
        if (!card.contains(event.relatedTarget as Node | null)) collapse();
    }, { signal });
    card.addEventListener('keydown', event => { if (event.key === 'Escape') collapse(); }, { signal });
    card.addEventListener('pointerdown', collapse, { signal });
    win.addEventListener('resize', collapse, { signal });
    card.ownerDocument.addEventListener('scroll', collapse, { capture: true, signal });
    signal.addEventListener('abort', collapse, { once: true });
}
