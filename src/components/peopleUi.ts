
import { setIcon } from 'obsidian';
import { pt } from '../localization/people';

export function peopleElement<K extends keyof HTMLElementTagNameMap>(parent: HTMLElement, tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
    const node = parent.ownerDocument.createElement(tag); node.className = cls;
    if (text !== undefined) node.textContent = text;
    parent.appendChild(node); return node;
}
export function peopleButton(parent: HTMLElement, text: string, action: () => void, cls = ''): HTMLButtonElement {
    const button = peopleElement(parent, 'button', `lorebase-people-button ${cls}`, text); button.type = 'button';
    button.addEventListener('click', action); return button;
}
export function peopleIcon(parent: HTMLElement, name: string, cls = ''): HTMLSpanElement {
    const icon = peopleElement(parent, 'span', `lorebase-people-icon ${cls}`);
    icon.setAttribute('aria-hidden', 'true'); setIcon(icon, name); return icon;
}
export function peopleHelp(parent: HTMLElement): void {
    const help = peopleElement(parent, 'details', 'lorebase-people-help');
    const summary = peopleElement(help, 'summary');
    peopleIcon(summary, 'cloud-download');
    peopleElement(summary, 'strong', '', 'TMDB');
    peopleElement(summary, 'span', '', pt('onlineShort'));
    peopleIcon(summary, 'info', 'lorebase-people-help-info');
    peopleElement(help, 'p', '', pt('storageHelp'));
    peopleElement(help, 'p', '', pt('languageHelp'));
}
export function peopleImage(parent: HTMLElement, url: string, name: string): void {
    const fallback = () => peopleElement(parent, 'span', 'lorebase-people-placeholder', name.slice(0, 1).toUpperCase());
    if (!url) { fallback(); return; }
    const image = peopleElement(parent, 'img'); image.alt = name; image.loading = 'lazy'; image.src = url;
    image.addEventListener('error', () => { image.remove(); fallback(); }, { once: true });
}

