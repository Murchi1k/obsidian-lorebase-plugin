import { setIcon } from 'obsidian';
import { isCustomGroupImageIcon } from '../services/media/customGroups';
const rendered = new WeakMap<HTMLElement, string>();

/** Embedded images stay in an img element, including uploaded SVG icons. */
export function renderCustomGroupIcon(element: HTMLElement, icon: string): void {
    if (rendered.get(element) === icon) return;
    rendered.set(element, icon);
    element.empty();
    if (!isCustomGroupImageIcon(icon)) { setIcon(element, icon); return; }
    const image = element.createEl('img', { cls: 'lorebase-group-custom-icon', attr: { src: icon, alt: '', decoding: 'async' } });
    image.addEventListener('error', () => {
        if (!element.contains(image)) return;
        image.remove();
        setIcon(element, 'folder');
    }, { once: true });
}
