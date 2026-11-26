import { setIcon } from 'obsidian';
import { t } from '../localization';
import { groupText as gt } from '../localization/groups';
import { MEDIA_ICONS } from '../mediaPresentation';
import { normalizeGroupDetails } from '../services/media/customGroups';
import { renderCustomGroupIcon } from '../components/CustomGroupIcon';
import type { CustomMediaGroup, MediaItem } from '../types';

export function renderCustomGroupCard(
    parent: HTMLElement,
    initial: CustomMediaGroup,
    items: ReadonlyMap<string, MediaItem>,
    actions?: { open: () => void; contextMenu: (event: MouseEvent | KeyboardEvent) => void }
): { update: (group: CustomMediaGroup, items: ReadonlyMap<string, MediaItem>) => void } {
    const card = parent.createEl('article', { cls: 'lorebase-group-card', attr: { 'data-group-id': initial.id } });
    const open = card.createEl(actions ? 'button' : 'div', { cls: 'lorebase-group-card-open' });
    if (actions) { open.setAttribute('type', 'button'); open.addEventListener('click', actions.open); }
    const covers = open.createDiv({ cls: 'lorebase-group-card-covers', attr: { 'aria-hidden': 'true' } });
    const heading = open.createDiv({ cls: 'lorebase-group-card-heading' });
    const icon = heading.createSpan({ cls: 'lorebase-group-card-icon', attr: { 'aria-hidden': 'true' } });
    const pin = heading.createSpan({ cls: 'lorebase-group-card-pin', attr: { title: gt('pinnedLabel'), 'aria-label': gt('pinnedLabel') } });
    setIcon(pin, 'pin');
    const body = open.createDiv({ cls: 'lorebase-group-card-body' });
    const title = body.createDiv({ cls: 'lorebase-group-card-title' });
    const name = title.createEl('strong');
    const description = body.createDiv({ cls: 'lorebase-group-card-description' });
    const footer = open.createDiv({ cls: 'lorebase-group-card-footer' });
    const count = footer.createSpan();
    if (actions) {
        card.addEventListener('contextmenu', event => { event.preventDefault(); event.stopPropagation(); actions.contextMenu(event); });
        card.addEventListener('keydown', event => {
            if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return;
            event.preventDefault(); event.stopPropagation(); actions.contextMenu(event);
        });
    }
    let coverSignature = '';
    let previousPaths: string[] | undefined;
    let previousLibrary: ReadonlyMap<string, MediaItem> | undefined;
    const update = (group: CustomMediaGroup, library: ReadonlyMap<string, MediaItem>): void => {
        const details = normalizeGroupDetails(group);
        card.style.setProperty('--group-color', details.color);
        name.textContent = group.name;
        name.title = group.name;
        renderCustomGroupIcon(icon, details.icon);
        pin.hidden = !details.pinned;
        description.textContent = details.description || gt('noDescription');
        description.title = details.description;
        description.toggleClass('is-empty', !details.description);
        count.textContent = `${group.itemPaths.length} ${t('customGroupsItems')}`;
        if (actions) open.setAttribute('aria-label', `${group.name} · ${count.textContent}`);
        if (previousPaths === group.itemPaths && previousLibrary === library) return;
        previousPaths = group.itemPaths;
        previousLibrary = library;
        const images: MediaItem[] = [];
        for (const path of group.itemPaths) {
            const item = library.get(path);
            if (item) images.push(item);
            if (images.length === 3) break;
        }
        const signature = JSON.stringify(images.map(item => [item.filePath, item.imageUrl, item.type]));
        if (signature === coverSignature) return;
        coverSignature = signature;
        covers.empty();
        for (let index = 0; index < 3; index++) {
            const item = images[index];
            const poster = covers.createSpan({ cls: `lorebase-group-cover${item ? '' : ' is-placeholder'}` });
            setIcon(poster.createSpan(), item ? MEDIA_ICONS[item.type] : index === 1 ? 'plus' : 'folder');
            if (item?.imageUrl) {
                const image = poster.createEl('img', { attr: { src: item.imageUrl, alt: '', loading: 'lazy', decoding: 'async' } });
                image.addEventListener('error', () => image.remove(), { once: true });
            }
        }
    };
    update(initial, items);
    return { update };
}
