import { setTooltip } from 'obsidian';

/** Use Obsidian's tooltip without retaining a second, native browser tooltip. */
export function normalizeLorebaseTooltip(element: Element, applyTooltip: typeof setTooltip = setTooltip): void {
    if (!element.closest('[class*="lorebase-"]')) return;
    // Obsidian's tooltip calls HTMLElement.isShown(); SVG elements do not have it.
    if (element.namespaceURI !== 'http://www.w3.org/1999/xhtml') return;
    const title = element.getAttribute('title');
    if (title === null) return;
    element.removeAttribute('title');
    if (title.trim()) applyTooltip(element as HTMLElement, title);
    element.removeAttribute('title');
}

/** Covers settings, cards, dialogs and dynamically rebuilt controls in each window. */
export function registerLorebaseTooltips(doc: Document): () => void {
    const normalizeTree = (root: Element): void => {
        if (root.hasAttribute('title')) normalizeLorebaseTooltip(root);
        root.querySelectorAll('[title]').forEach(element => normalizeLorebaseTooltip(element));
    };
    normalizeTree(doc.documentElement);
    const observer = new MutationObserver(records => {
        for (const record of records) {
            if (record.type === 'attributes') normalizeLorebaseTooltip(record.target as Element);
            else for (const node of Array.from(record.addedNodes)) {
                if (node.nodeType === 1) normalizeTree(node as Element);
            }
        }
    });
    observer.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });
    return () => observer.disconnect();
}
