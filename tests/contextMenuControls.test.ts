// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { showMediaContextMenu, type MediaContextMenuDeps } from '../src/views/library/contextMenu';
import type { AnimeItem, SeriesItem } from '../src/types';
import { installStatisticsDom } from './helpers/statisticsDom';

const menus = vi.hoisted(() => ({ instances: [] as any[] }));
vi.mock('obsidian', async importOriginal => {
    class Menu {
        items: any[] = [];
        constructor() { menus.instances.push(this); }
        addItem(build: (item: any) => void) {
            const item: any = { title: '', action: () => {}, setTitle(title: any) { this.title = title; return this; }, setIcon() { return this; }, setChecked(value: boolean) { this.checked = value; return this; },
                onClick(action: () => void) { this.action = action; return this; }, setSubmenu() { return this.submenu = new Menu(); } };
            build(item); this.items.push(item); return this;
        }
        addSeparator() { return this; }
        showAtPosition() {}
    }
    return { ...await importOriginal<any>(), Menu };
});
beforeEach(() => {
    installStatisticsDom(); menus.instances.length = 0;
    vi.stubGlobal('createFragment', () => {
        const fragment = document.createDocumentFragment();
        (fragment as any).createSpan = function(options: any) {
            const span = document.createElement('span'); span.className = options.cls ?? ''; span.textContent = options.text ?? ''; this.append(span); return span;
        };
        return fragment;
    });
});
afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); });
function deps() {
    return { isDestroyed: () => false, getStatusOptions: () => [{ status: 'completed', label: 'Completed' }], onItemMutated: vi.fn(),
        onApplyFiltersAndSort: vi.fn(), onEdit: vi.fn(), onOpen: vi.fn(), onDelete: vi.fn(), cardClickAction: 'edit', ratingMode: 'star',
        ratingSettings: { mode: 'custom', max: 10, step: 0.1, display: 'number' }, updateAnime: vi.fn(), updateGame: vi.fn(), updateVideo: vi.fn(),
        customGroups: [], onToggleCustomGroup: vi.fn(), onOpenCustomGroups: vi.fn() } as unknown as MediaContextMenuDeps;
}
describe('card context menu controls', () => {
    it('changes priority through the card menu without changing status or score', () => {
        const item = { type: 'series', status: 'planned', userRating: 4, priority: 'normal', parts: [] } as any;
        const handlers = deps();
        showMediaContextMenu(item, 20, 20, handlers);
        const priority = menus.instances[0].items.find((entry: any) => typeof entry.title === 'string' && entry.title.startsWith('Priority'));
        expect(priority).toBeDefined(); expect(priority.submenu.items[2].checked).toBe(true);
        priority.submenu.items[1].action();
        expect(item.priority).toBe('high'); expect(item.status).toBe('planned'); expect(item.userRating).toBe(4);
        expect(handlers.updateVideo).toHaveBeenCalledWith(item, { priority: 'high' });
        expect(handlers.onApplyFiltersAndSort).toHaveBeenCalled();
    });
    it.each(['2019', 'unknown', '2019-06'])('completes with the chosen %s without substituting today', async date => {
        const item = { type: 'anime', displayName: 'Old favorite', filePath: 'A.md', userRating: null, status: 'planned', parts: [] } as unknown as AnimeItem;
        const actions = deps(); actions.chooseCompletionDate = vi.fn(async () => date);
        showMediaContextMenu(item, 10, 10, actions);
        await menus.instances[0].items[1].submenu.items[0].action();
        expect(actions.chooseCompletionDate).toHaveBeenCalledWith(item);
        expect(item.finished).toBe(date); expect(item.status).toBe('completed');
        expect(actions.updateAnime).toHaveBeenCalledWith(item, expect.objectContaining({ finished: date, status: 'completed' }));
    });
    it('leaves status and progress unchanged when the completion date dialog is cancelled', async () => {
        const item = { type: 'anime', displayName: 'Old favorite', filePath: 'A.md', userRating: null, status: 'watching', episodeCurrent: 2, parts: [] } as unknown as AnimeItem;
        const actions = deps(); actions.chooseCompletionDate = vi.fn(async () => null);
        showMediaContextMenu(item, 10, 10, actions);
        await menus.instances[0].items[1].submenu.items[0].action();
        expect(item.status).toBe('watching'); expect(item.episodeCurrent).toBe(2); expect(item.finished).toBeUndefined();
        expect(actions.updateAnime).not.toHaveBeenCalled(); expect(actions.onItemMutated).not.toHaveBeenCalled();
    });
    it('keeps native menu mousedown from blocking the score input and saves typed values without a slider', () => {
        const item = { type: 'anime', filePath: 'Anime/A.md', userRating: 1.7, status: 'planned', parts: [] } as unknown as AnimeItem;
        const actions = deps(); showMediaContextMenu(item, 10, 10, actions);
        const fragment = menus.instances[0].items[0].submenu.items[0].title as DocumentFragment;
        const menu = document.body.createDiv();
        menu.addEventListener('mousedown', event => event.preventDefault());
        menu.append(fragment);
        const input = document.querySelector<HTMLInputElement>('.lorebase-context-rating-value')!;
        const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
        input.dispatchEvent(down);
        expect(down.defaultPrevented).toBe(false);
        expect(document.querySelector('input[type="range"]')).toBeNull();
        input.value = '8,3'; input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(actions.updateAnime).toHaveBeenLastCalledWith(item, { userRating: 8.3 });
        input.value = '1.5'; input.dispatchEvent(new Event('input'));
        expect(item.userRating).toBe(1.5);
        expect(actions.updateAnime).toHaveBeenCalledTimes(2);
        input.value = '12'; input.dispatchEvent(new Event('change'));
        expect(item.userRating).toBe(1.5);
        expect(actions.updateAnime).toHaveBeenCalledTimes(2);
    });
    it.each(['anime', 'series'] as const)('completes each %s part and checked episode from the status menu', type => {
        const item = { type, filePath: 'A.md', userRating: null, status: 'watching', episodeCurrent: 1, episodeTotal: 3, activePartId: 'a',
            parts: [{ id: 'a', kind: type === 'anime' ? 'tv' : 'season', episodeTotal: 3, episodeCurrent: 1, status: 'watching', watchedEpisodes: [1], episodeTracking: 'episodes' },
                { id: 'b', kind: type === 'anime' ? 'tv' : 'season', episodeTotal: 2, episodeCurrent: 0, status: 'planned' }] } as AnimeItem | SeriesItem;
        const actions = deps(); showMediaContextMenu(item, 10, 10, actions);
        menus.instances[0].items[1].submenu.items[0].action();
        expect(item.status).toBe('completed');
        expect(item.parts?.map(part => [part.status, part.episodeCurrent])).toEqual([['completed', 3], ['completed', 2]]);
        expect(item.parts?.[0].watchedEpisodes).toEqual([1, 2, 3]);
        expect(item.episodeCurrent).toBe(3);
        const update = type === 'anime' ? actions.updateAnime : actions.updateVideo;
        expect(update).toHaveBeenCalledWith(item, expect.objectContaining({ status: 'completed', parts: item.parts, episodeCurrent: 3 }));
    });
});
