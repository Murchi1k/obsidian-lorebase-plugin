/** Global listeners and detached panels must live only as long as the open dropdown. */
export function createDropdownLifecycle(
    trigger: HTMLElement,
    panel: HTMLElement,
    close: () => void,
    reposition: () => void
): { start: () => void; stop: () => void } {
    const doc = trigger.ownerDocument;
    const view = doc.defaultView!;
    let observer: MutationObserver | undefined;
    let listening = false;

    const checkOwner = (): boolean => {
        if (!trigger.isConnected || !panel.isConnected || !trigger.getClientRects().length
            || view.getComputedStyle(trigger).visibility === 'hidden') {
            close();
            return false;
        }
        return true;
    };
    const onClick = (event: MouseEvent): void => {
        const path = event.composedPath();
        if (!path.includes(trigger) && !path.includes(panel)) close();
    };
    const onKeydown = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') close();
    };
    const onViewportChange = (event: Event): void => {
        if (event.composedPath().includes(panel)) return;
        if (checkOwner()) reposition();
    };
    const stop = (): void => {
        observer?.disconnect();
        observer = undefined;
        if (!listening) return;
        listening = false;
        doc.removeEventListener('click', onClick, true);
        doc.removeEventListener('keydown', onKeydown, true);
        doc.removeEventListener('scroll', onViewportChange, true);
        view.removeEventListener('resize', onViewportChange);
    };
    return {
        start: () => {
            stop();
            if (!checkOwner()) return;
            listening = true;
            doc.addEventListener('click', onClick, true);
            doc.addEventListener('keydown', onKeydown, true);
            doc.addEventListener('scroll', onViewportChange, true);
            view.addEventListener('resize', onViewportChange);
            // Watch the owner too: a modal can disappear without a click or key event.
            observer = new view.MutationObserver(() => { checkOwner(); });
            observer.observe(doc.documentElement, {
                childList: true, subtree: true, attributes: true,
                attributeFilter: ['class', 'style', 'hidden'],
            });
        },
        stop,
    };
}
