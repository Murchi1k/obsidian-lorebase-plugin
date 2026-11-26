// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { App } from 'obsidian';
import { CustomGroupsModal } from '../src/modals/CustomGroupsModal';
import { t } from '../src/localization';
import { mt } from '../src/localization/music';
import { groupText as gt } from '../src/localization/groups';
import type { CustomMediaGroup, MediaItem } from '../src/types';
import { installStatisticsDom } from './helpers/statisticsDom';
import { normalizeCustomGroups } from '../src/services/media/customGroups';

const menus = vi.hoisted(() => ({ instances: [] as any[] }));
vi.mock('obsidian', async importOriginal => {
    class Menu {
        items: any[] = [];
        position: unknown;
        constructor() { menus.instances.push(this); }
        addItem(build: (item: any) => void) {
            const item: any = {
                title: '', action: () => {}, warning: false,
                setTitle(value: string) { this.title = value; return this; }, setIcon() { return this; },
                setWarning(value: boolean) { this.warning = value; return this; },
                onClick(action: () => void) { this.action = action; return this; },
            };
            build(item); this.items.push(item); return this;
        }
        addSeparator() { return this; }
        showAtMouseEvent(event: MouseEvent) { this.position = { x: event.clientX, y: event.clientY }; }
        showAtPosition(position: unknown) { this.position = position; }
    }
    return { ...await importOriginal<object>(), Menu, getIconIds: () => ['folder', 'music', 'lucide-castle', ...Array.from({ length: 140 }, (_, i) => `icon-${i}`)] };
});

beforeAll(installStatisticsDom);
afterEach(() => { document.body.replaceChildren(); menus.instances.length = 0; });

function media(index: number, type: MediaItem['type'] = 'game'): MediaItem {
    const title = `Title ${String(index).padStart(2, '0')}`;
    return { type, displayName: title, nameLower: title.toLowerCase(), filePath: `${title}.md`, year: 2024, imageUrl: '' } as MediaItem;
}
function group(id: string, itemPaths: string[] = []): CustomMediaGroup {
    return { id, name: id, itemPaths, createdAt: 1, updatedAt: 1 };
}
async function fixture(items = [media(1), media(2)], groups = [group('Favorites')], options: { overview?: boolean; loadItems?: () => Promise<MediaItem[]> } = {}) {
    const save = vi.fn();
    const openItem = vi.fn().mockResolvedValue(undefined);
    const modal = new CustomGroupsModal(new App(), groups, options.loadItems ?? (async () => items), openItem, save);
    modal.modalEl = document.createElement('div');
    modal.modalEl.appendChild(Object.assign(document.createElement('div'), { className: 'modal-close-button' }));
    modal.contentEl = document.createElement('div');
    modal.modalEl.appendChild(modal.contentEl);
    document.body.appendChild(modal.modalEl);
    modal.close = vi.fn(() => modal.onClose());
    modal.onOpen();
    await Promise.resolve();
    if (!options.overview && groups.length) click(modal.contentEl, '.lorebase-group-card-open');
    return { modal, root: modal.contentEl, save, openItem, groups };
}
function click(root: HTMLElement, selector: string): void {
    const button = root.querySelector<HTMLButtonElement>(selector);
    if (!button) throw new Error(`Missing button: ${selector}`);
    button.click();
}
function groupAction(root: HTMLElement, title: string, id?: string): void {
    const card = Array.from(root.querySelectorAll<HTMLElement>('.lorebase-group-card')).find(card => !id || card.dataset.groupId === id);
    if (!card) throw new Error(`Missing group: ${id}`);
    card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    menus.instances[menus.instances.length - 1].items.find((item: any) => item.title === title).action();
}
function result(root: HTMLElement, item: MediaItem): HTMLButtonElement {
    const card = Array.from(root.querySelectorAll<HTMLButtonElement>('.lorebase-groups-result'))
        .find(card => card.dataset.path === item.filePath);
    if (!card) throw new Error(`Missing card: ${item.displayName}`);
    return card;
}

describe('custom group window', () => {
    it('pins from both the overview and the collection without changing membership', async () => {
        const first = group('First'), second = { ...group('Second', [media(1).filePath]), description: 'Keep me' };
        const { root, save, groups } = await fixture([media(1)], [first, second], { overview: true });
        expect(root.querySelectorAll('.lorebase-group-card button')).toHaveLength(2);
        expect(root.querySelector('.lorebase-group-card-edit, .lorebase-group-card-pin-button')).toBeNull();
        groupAction(root, gt('pin'), 'Second');
        expect(root.querySelector('.lorebase-group-card')?.getAttribute('data-group-id')).toBe('Second');
        expect(root.querySelector<HTMLElement>('[data-group-id="Second"] .lorebase-group-card-pin')?.hidden).toBe(false);
        expect(save.mock.lastCall?.[0][1]).toMatchObject({ pinned: true, description: 'Keep me', itemPaths: [media(1).filePath], createdAt: 1 });
        click(root, '[data-group-id="Second"] .lorebase-group-card-open');
        click(root, '.lorebase-groups-pin');
        expect(root.querySelector('.lorebase-groups-pin')?.getAttribute('aria-pressed')).toBe('false');
        expect(root.querySelector('.lorebase-groups-title h3')?.textContent).toBe('Second');
        expect(document.activeElement).toBe(root.querySelector('.lorebase-groups-pin'));
        expect(groups[1]).toEqual(second);
    });

    it('opens a group context menu and deletes only the chosen group', async () => {
        const { root, save, openItem } = await fixture([media(1)], [group('First'), group('Second', [media(1).filePath])], { overview: true });
        const card = root.querySelector<HTMLElement>('[data-group-id="Second"]')!;
        const rightClick = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 25, clientY: 45 });
        card.dispatchEvent(rightClick);
        expect(rightClick.defaultPrevented).toBe(true);
        expect(root.querySelector('.lorebase-groups-title')).toBeNull();
        expect(menus.instances[0].position).toEqual({ x: 25, y: 45 });
        menus.instances[0].items.find((item: any) => item.title === gt('pin')).action();
        root.querySelector('[data-group-id="Second"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }));
        const menu = menus.instances[1];
        expect(menu.items[0].title).toBe(gt('unpin'));
        menu.items.find((item: any) => item.title === t('customGroupsDelete')).action();
        expect(save.mock.lastCall?.[0].map((group: CustomMediaGroup) => group.id)).toEqual(['First']);
        expect(root.querySelectorAll('.lorebase-group-card')).toHaveLength(1);
        expect(openItem).not.toHaveBeenCalled();
    });

    it('chooses icons outside the presets and keeps catalog Escape inside the draft', async () => {
        const { root, save } = await fixture([], [group('First')], { overview: true });
        groupAction(root, gt('editGroup'));
        click(root, '.lorebase-group-icon-actions button');
        expect(root.querySelectorAll('.lorebase-group-icon-results button')).toHaveLength(60);
        click(root, '.lorebase-group-icon-catalog-footer button');
        expect(root.querySelectorAll('.lorebase-group-icon-results button')).toHaveLength(120);
        const search = root.querySelector<HTMLInputElement>('.lorebase-group-icon-search')!;
        search.value = 'music'; search.dispatchEvent(new Event('input'));
        click(root, '.lorebase-group-icon-options [data-icon="music"]');
        expect(root.querySelector('.lorebase-group-icon-results [data-icon="music"]')?.getAttribute('aria-pressed')).toBe('true');
        search.value = 'https://lucide.dev/icons/castle'; search.dispatchEvent(new Event('input'));
        click(root, '.lorebase-group-icon-results [data-icon="lucide-castle"]');
        expect(root.querySelector<HTMLElement>('.lorebase-group-icon-catalog')?.hidden).toBe(true);
        expect(save).not.toHaveBeenCalled();
        click(root, '.lorebase-group-icon-actions button');
        search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        expect(root.querySelector('form')).not.toBeNull();
        click(root, 'button[type="submit"]');
        expect(save.mock.lastCall?.[0][0].icon).toBe('lucide-castle');
        expect(normalizeCustomGroups(save.mock.lastCall![0])[0].icon).toBe('lucide-castle');
    });

    it('previews an uploaded SVG as an image and persists it only on Save', async () => {
        const { root, save } = await fixture([], [group('First')], { overview: true });
        groupAction(root, gt('editGroup'));
        const file = root.querySelector<HTMLInputElement>('.lorebase-group-icon-file')!;
        Object.defineProperty(file, 'files', { value: [new File(['<svg xmlns="http://www.w3.org/2000/svg"><circle r="8"/></svg>'], 'custom.svg', { type: 'image/svg+xml' })] });
        file.dispatchEvent(new Event('change'));
        await vi.waitFor(() => expect(root.querySelector('.lorebase-group-custom-icon')).not.toBeNull());
        expect(root.querySelector('.lorebase-group-card-icon svg')).toBeNull();
        expect(save).not.toHaveBeenCalled();
        const image = root.querySelector<HTMLImageElement>('.lorebase-group-custom-icon')!;
        const name = root.querySelector<HTMLInputElement>('.lorebase-group-name-input')!;
        name.value = 'New name'; name.dispatchEvent(new Event('input'));
        expect(root.querySelector('.lorebase-group-custom-icon')).toBe(image);
        click(root, 'button[type="submit"]');
        const saved = save.mock.lastCall![0];
        expect(saved[0].icon).toMatch(/^data:image\/svg\+xml;base64,/);
        expect(normalizeCustomGroups(JSON.parse(JSON.stringify(saved)))[0].icon).toBe(saved[0].icon);
        expect(root.querySelector('.lorebase-group-custom-icon')?.getAttribute('src')).toBe(saved[0].icon);
    });

    it.each([
        new File(['text'], 'bad.html', { type: 'text/html' }),
        new File([new Uint8Array(256 * 1024 + 1)], 'large.png', { type: 'image/png' }),
    ])('rejects unsuitable icon files without changing the saved icon', async fileToUpload => {
        const { root, save } = await fixture([], [group('First')], { overview: true });
        groupAction(root, gt('editGroup'));
        const file = root.querySelector<HTMLInputElement>('.lorebase-group-icon-file')!;
        Object.defineProperty(file, 'files', { value: [fileToUpload] });
        file.dispatchEvent(new Event('change'));
        expect(root.querySelectorAll<HTMLElement>('[role="alert"]')[1].hidden).toBe(false);
        click(root, 'button[type="submit"]');
        expect(save.mock.lastCall?.[0][0].icon).toBe('folder');
    });

    it('uses one in-header close button on the overview and the group editor', async () => {
        const { root, modal, save } = await fixture([], [], { overview: true });
        click(root, '.lorebase-groups-create-btn');
        expect(root.querySelectorAll('.lorebase-workspace-close')).toHaveLength(1);
        expect(modal.modalEl.querySelector('.modal-close-button')).toBeNull();
        click(root, '.lorebase-workspace-close');
        expect(modal.close).toHaveBeenCalledOnce();
        expect(root.children).toHaveLength(0);
        expect(save).not.toHaveBeenCalled();
    });
    it('opens on collection cards, puts pinned groups first and shows up to three covers', async () => {
        const items = [1, 2, 3, 4].map(index => ({ ...media(index), imageUrl: `app://cover-${index}.jpg` }));
        const { root } = await fixture(items, [group('First', items.map(item => item.filePath)), { ...group('Pinned'), pinned: true, icon: 'star', color: '#83a5a0' }], { overview: true });
        expect(Array.from(root.querySelectorAll('.lorebase-group-card')).map(card => card.getAttribute('data-group-id'))).toEqual(['Pinned', 'First']);
        expect(root.querySelectorAll('[data-group-id="First"] .lorebase-group-cover img')).toHaveLength(3);
        expect(root.querySelectorAll('[data-group-id="Pinned"] .is-placeholder')).toHaveLength(3);
        expect(root.querySelector<HTMLElement>('[data-group-id="Pinned"] .lorebase-group-card-pin')?.hidden).toBe(false);
        expect(root.querySelector('.lorebase-groups-title')).toBeNull();
        click(root, '[data-group-id="First"] .lorebase-group-card-open');
        expect(root.querySelector('.lorebase-groups-title h3')?.textContent).toBe('First');
    });

    it('searches group names and descriptions without losing input focus or saving data', async () => {
        const { root, save } = await fixture([], [group('Favorites'), { ...group('Music'), description: 'Distant worlds and quiet mornings' }], { overview: true });
        const input = root.querySelector<HTMLInputElement>('.lorebase-groups-search')!;
        input.focus(); input.value = 'ＦＡＶ'; input.dispatchEvent(new Event('input'));
        expect(root.querySelectorAll('.lorebase-group-card')).toHaveLength(1);
        expect(root.querySelector('.lorebase-group-card-title strong')?.textContent).toBe('Favorites');
        input.value = 'quiet mornings'; input.dispatchEvent(new Event('input'));
        expect(root.querySelector('.lorebase-group-card-title strong')?.textContent).toBe('Music');
        expect(document.activeElement).toBe(input);
        input.value = 'missing'; input.dispatchEvent(new Event('input'));
        expect(root.textContent).toContain(gt('noResults'));
        expect(save).not.toHaveBeenCalled();
    });

    it('previews appearance in a draft and saves metadata without replacing membership', async () => {
        const initial = { ...group('Favorites', [media(1).filePath]), description: 'Original' };
        const { root, save, groups } = await fixture([media(1)], [initial], { overview: true });
        groupAction(root, gt('editGroup'));
        const input = root.querySelector<HTMLInputElement>('.lorebase-group-name-input')!;
        input.value = 'My albums'; input.dispatchEvent(new Event('input'));
        const description = root.querySelector<HTMLTextAreaElement>('textarea')!;
        description.value = 'Albums, books and games'; description.dispatchEvent(new Event('input'));
        click(root, '[data-icon="music"]');
        const color = root.querySelector<HTMLInputElement>('input[type="color"]')!;
        color.value = '#aabbcc'; color.dispatchEvent(new Event('input'));
        click(root, '[role="switch"]');
        expect(root.querySelector('.lorebase-group-card-title strong')?.textContent).toBe('My albums');
        expect(root.querySelector<HTMLElement>('.lorebase-group-card')?.style.getPropertyValue('--group-color')).toBe('#aabbcc');
        expect(root.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('true');
        expect(save).not.toHaveBeenCalled();
        click(root, 'button[type="submit"]');
        expect(save.mock.lastCall?.[0][0]).toMatchObject({ id: 'Favorites', name: 'My albums', description: 'Albums, books and games', icon: 'music', color: '#aabbcc', pinned: true, itemPaths: [media(1).filePath], createdAt: 1 });
        expect(groups[0]).toEqual(initial);
        expect(root.querySelector('.lorebase-group-card-title strong')?.textContent).toBe('My albums');
    });

    it('cancels edits and creation without persisting the draft or closing the group window', async () => {
        const { modal, root, save } = await fixture([], [group('Favorites')], { overview: true });
        groupAction(root, gt('editGroup'));
        const input = root.querySelector<HTMLInputElement>('.lorebase-group-name-input')!;
        input.value = 'Discarded'; input.dispatchEvent(new Event('input'));
        click(root, '.lorebase-group-editor-footer button[type="button"]');
        expect(root.querySelector('.lorebase-group-card-title strong')?.textContent).toBe('Favorites');
        click(root, '.lorebase-groups-create-btn');
        root.querySelector('form')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(root.querySelector('form')).toBeNull();
        expect(save).not.toHaveBeenCalled();
        expect(modal.close).not.toHaveBeenCalled();
    });

    it('validates empty names and creates unique names with the keyboard shortcut', async () => {
        const { root, save } = await fixture([], [group('Favorites')], { overview: true });
        click(root, '.lorebase-groups-create-btn');
        click(root, 'button[type="submit"]');
        expect(root.querySelector('.lorebase-group-name-input')?.getAttribute('aria-invalid')).toBe('true');
        expect(save).not.toHaveBeenCalled();
        const name = root.querySelector<HTMLInputElement>('.lorebase-group-name-input')!;
        name.value = ' Favorites '; name.dispatchEvent(new Event('input'));
        name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
        expect(save.mock.lastCall?.[0][1].name).toBe('Favorites 2');
        expect(root.querySelector('.lorebase-groups-title h3')?.textContent).toBe('Favorites 2');
    });

    it('returns from the editor to the same group window and restores the invoking control', async () => {
        const { modal, root, save } = await fixture([], [group('First'), group('Second')], { overview: true });
        const window = modal.modalEl;
        groupAction(root, gt('editGroup'), 'Second');
        const input = root.querySelector<HTMLInputElement>('.lorebase-group-name-input')!;
        input.value = 'Discard this'; input.dispatchEvent(new Event('input'));
        click(root, '.lorebase-groups-editor-back');
        expect(modal.modalEl).toBe(window);
        expect(document.activeElement).toBe(root.querySelector('[data-group-id="Second"] .lorebase-group-card-open'));
        expect(root.querySelector('[data-group-id="Second"] strong')?.textContent).toBe('Second');
        expect(save).not.toHaveBeenCalled();
        click(root, '.lorebase-groups-create-btn');
        click(root, '.lorebase-groups-editor-back');
        expect(document.activeElement).toBe(root.querySelector('.lorebase-groups-create-btn'));
        expect(modal.close).not.toHaveBeenCalled();
    });

    it('updates the picker count as media is toggled and returns to the collection with Done', async () => {
        const first = media(1), second = media(2);
        const { root, save } = await fixture([first, second], [group('Favorites', [first.filePath])]);
        click(root, '.lorebase-groups-add-toggle');
        expect(root.querySelector('.lorebase-groups-add-toggle')?.textContent).toBe(gt('done'));
        expect(root.querySelector('.lorebase-groups-picker-count')?.textContent).toBe(`${gt('inGroup')}: 1`);
        result(root, second).click();
        expect(root.querySelector('.lorebase-groups-picker-count')?.textContent).toBe(`${gt('inGroup')}: 2`);
        result(root, first).click();
        expect(root.querySelector('.lorebase-groups-picker-count')?.textContent).toBe(`${gt('inGroup')}: 1`);
        click(root, '.lorebase-groups-add-toggle');
        expect(root.querySelector('.lorebase-groups-add-section')).toBeNull();
        expect(root.querySelectorAll('.lorebase-groups-member')).toHaveLength(1);
        expect(document.activeElement).toBe(root.querySelector('.lorebase-groups-add-toggle'));
        expect(save.mock.lastCall?.[0][0].itemPaths).toEqual([second.filePath]);
    });

    it('keeps a draft and its focus when a pending library load completes', async () => {
        let finish!: (items: MediaItem[]) => void;
        const { root, save } = await fixture([], [group('Favorites')], { overview: true, loadItems: () => new Promise(resolve => finish = resolve) });
        click(root, '.lorebase-groups-create-btn');
        const input = root.querySelector<HTMLInputElement>('.lorebase-group-name-input')!;
        input.value = 'Still typing'; input.dispatchEvent(new Event('input')); input.focus();
        finish([media(1)]); await Promise.resolve(); await Promise.resolve();
        expect(root.querySelector('.lorebase-group-name-input')).toBe(input);
        expect(input.value).toBe('Still typing');
        expect(document.activeElement).toBe(input);
        expect(save).not.toHaveBeenCalled();
    });

    it('ignores late library results after the window closes', async () => {
        let finish!: (items: MediaItem[]) => void;
        const { modal, root, save } = await fixture([], [group('Favorites')], { overview: true, loadItems: () => new Promise(resolve => finish = resolve) });
        modal.onClose(); finish([media(1)]); await Promise.resolve(); await Promise.resolve();
        expect(root.children).toHaveLength(0);
        expect(save).not.toHaveBeenCalled();
    });

    it('loads additional collections in bounded batches', async () => {
        const groups = Array.from({ length: 80 }, (_, index) => group(`Group ${index}`));
        const { root } = await fixture([], groups, { overview: true });
        expect(root.querySelectorAll('.lorebase-group-card')).toHaveLength(36);
        click(root, '.lorebase-groups-show-more');
        expect(root.querySelectorAll('.lorebase-group-card')).toHaveLength(72);
        click(root, '.lorebase-groups-show-more');
        expect(root.querySelectorAll('.lorebase-group-card')).toHaveLength(80);
    });

    it('filters albums and songs, adds music to a group and opens its note', async () => {
        const album = { ...media(1, 'music'), musicKind: 'album' } as MediaItem;
        const track = { ...media(2, 'music'), musicKind: 'track' } as MediaItem;
        const { root, save, openItem } = await fixture([album, track, media(3)]);
        click(root, '.lorebase-groups-add-toggle');
        expect(root.querySelector('.lorebase-groups-add-filter.is-music')?.textContent).toBe(mt('music'));
        expect(result(root, album)).not.toBeNull();
        expect(result(root, track)).not.toBeNull();
        click(root, '.lorebase-groups-add-filter.is-music');
        expect(root.querySelectorAll('.lorebase-groups-result')).toHaveLength(1);
        click(root, '.lorebase-groups-add-filter.is-music');
        result(root, album).click();
        expect(save.mock.lastCall?.[0][0].itemPaths).toEqual([album.filePath]);
        click(root, '.lorebase-groups-add-toggle');
        expect(root.querySelector('.lorebase-select-classification')?.textContent).toBe(mt('music'));
        click(root, '.lorebase-groups-member');
        expect(openItem).toHaveBeenCalledWith(album);
    });

    it('opens member notes and removes members without opening their note', async () => {
        const first = media(1), second = media(2);
        const { root, openItem, save, groups } = await fixture([first, second], [group('Favorites', [first.filePath, second.filePath])]);
        click(root, '.lorebase-groups-member-remove');
        expect(openItem).not.toHaveBeenCalled();
        expect(save.mock.lastCall?.[0][0].itemPaths).toEqual([second.filePath]);
        expect(groups[0].itemPaths).toEqual([first.filePath, second.filePath]);
        click(root, '.lorebase-groups-member');
        expect(openItem).toHaveBeenCalledWith(second);
    });

    it('marks selected cards in place and keeps scroll and focus while membership changes', async () => {
        const item = media(1);
        const { root, save } = await fixture([item, media(2)]);
        click(root, '.lorebase-groups-add-toggle');
        expect(root.querySelector('.lorebase-groups-member-grid')).toBeNull();
        const scroll = root.querySelector<HTMLElement>('.lorebase-groups-results')!;
        scroll.scrollTop = 240;
        result(root, item).click();
        expect(result(root, item).getAttribute('aria-pressed')).toBe('true');
        expect(document.activeElement).toBe(result(root, item));
        expect(root.querySelector('.lorebase-groups-results')?.scrollTop).toBe(240);
        expect(save.mock.lastCall?.[0][0].itemPaths).toEqual([item.filePath]);
        result(root, item).click();
        expect(result(root, item).getAttribute('aria-pressed')).toBe('false');
        expect(save.mock.lastCall?.[0][0].itemPaths).toEqual([]);
    });

    it('makes entries after the first twelve accessible and keeps the page after selection', async () => {
        const items = Array.from({ length: 15 }, (_, index) => media(index + 1));
        const { root, save } = await fixture(items);
        click(root, '.lorebase-groups-add-toggle');
        expect(root.querySelectorAll('.lorebase-groups-result')).toHaveLength(12);
        expect(root.querySelector<HTMLButtonElement>(`[aria-label="${t('promptPreviousPage')}"]`)?.disabled).toBe(true);
        click(root, `[aria-label="${t('promptNextPage')}"]`);
        expect(root.querySelectorAll('.lorebase-groups-result')).toHaveLength(3);
        expect(root.querySelector<HTMLButtonElement>(`[aria-label="${t('promptNextPage')}"]`)?.disabled).toBe(true);
        result(root, items[14]).click();
        expect(result(root, items[14]).getAttribute('aria-pressed')).toBe('true');
        expect(root.querySelector('.lorebase-groups-pagination')?.textContent).toContain('2 / 2');
        expect(save.mock.lastCall?.[0][0].itemPaths).toContain(items[14].filePath);
        click(root, '.lorebase-groups-add-toggle');
        expect(root.querySelector('.lorebase-groups-member')?.dataset.path).toBe(items[14].filePath);
    });

    it('searches the whole library from later pages and combines the query with media filters', async () => {
        const items = Array.from({ length: 13 }, (_, index) => media(index + 1));
        const anime = media(99, 'anime');
        const { root } = await fixture([...items, anime]);
        click(root, '.lorebase-groups-add-toggle');
        click(root, `[aria-label="${t('promptNextPage')}"]`);
        const search = root.querySelector<HTMLInputElement>('.lorebase-groups-search')!;
        search.value = anime.displayName;
        search.dispatchEvent(new Event('input'));
        expect(root.querySelectorAll('.lorebase-groups-result')).toHaveLength(1);
        expect(result(root, anime)).not.toBeNull();
        expect(root.querySelector('.lorebase-groups-pagination')?.textContent).toBe('');
        click(root, '.lorebase-groups-add-filter.is-anime');
        expect(root.querySelectorAll('.lorebase-groups-result')).toHaveLength(0);
        expect(root.querySelector('.lorebase-groups-results-empty')?.textContent).toBe(t('customGroupsNoResults'));
        click(root, '.lorebase-groups-add-filter.is-anime');
        expect(result(root, anime)).not.toBeNull();
        expect(search.value).toBe(anime.displayName);
    });

    it('switches collections without transferring the selected membership', async () => {
        const item = media(1);
        const { root, save } = await fixture([item], [group('First'), group('Second')]);
        click(root, '.lorebase-groups-add-toggle');
        result(root, item).click();
        click(root, `[aria-label="${gt('back')}"]`);
        click(root, '[data-group-id="Second"] .lorebase-group-card-open');
        expect(root.querySelector('.lorebase-groups-title h3')?.textContent).toBe('Second');
        expect(root.querySelector('.lorebase-groups-add-section')).toBeNull();
        click(root, '.lorebase-groups-add-toggle');
        expect(result(root, item).getAttribute('aria-pressed')).toBe('false');
        expect(save.mock.lastCall?.[0][0].itemPaths).toEqual([item.filePath]);
        expect(save.mock.lastCall?.[0][1].itemPaths).toEqual([]);
    });

    it('preserves group creation, renaming and deletion', async () => {
        const { root, save } = await fixture();
        click(root, '.lorebase-groups-create-btn');
        const input = root.querySelector<HTMLInputElement>('.lorebase-group-name-input')!;
        input.value = 'New collection';
        input.dispatchEvent(new Event('input'));
        click(root, 'button[type="submit"]');
        expect(root.querySelector('.lorebase-groups-title h3')?.textContent).toBe('New collection');
        click(root, `[aria-label="${gt('editGroup')}"]`);
        const rename = root.querySelector<HTMLInputElement>('.lorebase-group-name-input')!;
        rename.value = 'Renamed collection';
        rename.dispatchEvent(new Event('input'));
        click(root, 'button[type="submit"]');
        expect(save.mock.lastCall?.[0][1].name).toBe('Renamed collection');
        click(root, `[aria-label="${t('customGroupsDelete')}"]`);
        expect(save.mock.lastCall?.[0]).toHaveLength(1);
        click(root, '.lorebase-group-card-open');
        expect(root.querySelector('.lorebase-groups-title h3')?.textContent).toBe('Favorites');
    });

    it('keeps the title and fallback when a cover cannot load', async () => {
        const item = { ...media(1), imageUrl: 'https://example.invalid/cover.jpg' };
        const { root } = await fixture([item], [group('Favorites', [item.filePath])]);
        root.querySelector('img')!.dispatchEvent(new Event('error'));
        expect(root.querySelector('img')).toBeNull();
        expect(root.querySelector('.lorebase-select-card-image')?.classList.contains('is-empty')).toBe(true);
        expect(root.querySelector('.lorebase-select-card-title')?.textContent).toBe(item.displayName);
    });
});
