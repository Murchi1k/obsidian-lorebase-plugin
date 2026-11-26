/** Replacing a long subtree can clamp every scrolling ancestor, not just the list. */
export function preserveScroll<T>(host: HTMLElement, update: () => T): T {
    const positions: Array<{ node: HTMLElement; top: number; left: number }> = [];
    for (let node: HTMLElement | null = host; node; node = node.parentElement) {
        if (node.scrollTop || node.scrollLeft) {
            positions.push({ node, top: node.scrollTop, left: node.scrollLeft });
            // These renders restore the viewport explicitly. Native anchoring would
            // apply a second adjustment after this task, once replacement nodes lay out.
            node.classList.add('lorebase-preserve-scroll');
        }
    }
    try { return update(); }
    finally {
        for (const { node, top, left } of positions.reverse()) {
            if (node.isConnected) { node.scrollTop = top; node.scrollLeft = left; }
        }
    }
}
