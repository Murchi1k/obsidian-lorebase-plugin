// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { installStatisticsDom } from './helpers/statisticsDom';
import { ArtistDiscographyModal } from '../src/modals/ArtistDiscographyModal';
import type { MusicCatalog } from '../src/services/MusicCatalog';
import { emptyMusicItem, type MusicService } from '../src/services/MusicService';

beforeAll(installStatisticsDom);
afterEach(() => document.body.replaceChildren());
const artist = { id: '7', name: 'Artist', image: '', url: 'https://www.deezer.com/artist/7', listeners: 100, fans: 200 };
const albums = [
    { id: '1', title: 'Album', artist: 'Artist', provider: 'deezer', kind: 'album', image: '', year: '2020', released: '2020', category: 'album' },
    { id: '2', title: 'An EP', artist: 'Artist', provider: 'deezer', kind: 'album', image: '', year: '2021', released: '2021', category: 'ep' },
];
function fixture(overrides = {}, library: ReturnType<typeof emptyMusicItem>[] = []) {
    const catalog = { releases: vi.fn(async () => ({ items: albums, more: false })), appearances: vi.fn(async () => ({ items: [], more: false })), releaseDetails: vi.fn(async () => emptyMusicItem()), ...overrides };
    const service = {
        loadItems: vi.fn(async () => library),
        createItem: vi.fn(async (draft: ReturnType<typeof emptyMusicItem>, _signal?: AbortSignal) => {
            const item = { ...draft, filePath: 'Music/Album.md' };
            library.push(item);
            return { created: true, item };
        }),
    };
    const modal = new ArtistDiscographyModal({} as App, artist, catalog as unknown as MusicCatalog, service as unknown as MusicService);
    modal.modalEl = document.body.createDiv(); modal.contentEl = modal.modalEl.createDiv(); modal.onOpen();
    return { modal, root: modal.contentEl, catalog, service };
}
describe('artist discography browsing and imports', () => {
    it('browses release categories and filters titles without creating notes', async () => {
        const { modal, root, service, catalog } = fixture();
        await vi.waitFor(() => expect(root.querySelectorAll('article')).toHaveLength(1));
        expect(root.querySelector('article strong')?.textContent).toBe('Album');
        root.querySelector<HTMLButtonElement>('[data-category="ep"]')!.click();
        expect(root.querySelector('article strong')?.textContent).toBe('An EP');
        const search = root.querySelector<HTMLInputElement>('input')!;
        search.value = 'missing'; search.dispatchEvent(new Event('input'));
        expect(root.querySelector('article')).toBeNull();
        expect(catalog.releases).toHaveBeenCalledOnce(); expect(service.createItem).not.toHaveBeenCalled();
        modal.onClose();
    });
    it('imports only the clicked release and blocks duplicate clicks', async () => {
        let finish!: (value: ReturnType<typeof emptyMusicItem>) => void;
        const details = vi.fn(() => new Promise(done => finish = done));
        const { modal, root, catalog, service } = fixture({ releaseDetails: details });
        await vi.waitFor(() => expect(root.querySelector('article button')).not.toBeNull());
        const add = root.querySelector<HTMLButtonElement>('article button')!;
        add.click(); add.click();
        expect(catalog.releaseDetails).toHaveBeenCalledOnce(); expect(service.createItem).not.toHaveBeenCalled();
        finish(emptyMusicItem());
        await vi.waitFor(() => expect(service.createItem).toHaveBeenCalledOnce());
        expect(root.querySelector<HTMLButtonElement>('article button')?.disabled).toBe(true);
        modal.onClose();
    });
    it('ignores a late discography response after close', async () => {
        let finish!: (value: { items: typeof albums; more: boolean }) => void;
        const { modal, root, service } = fixture({ releases: vi.fn(() => new Promise(done => finish = done)) });
        modal.onClose(); finish({ items: albums, more: false });
        await Promise.resolve(); await Promise.resolve();
        expect(root.children).toHaveLength(0); expect(service.createItem).not.toHaveBeenCalled();
    });
    it('recognizes a stored provider ID even after the note was renamed', async () => {
        const { modal, root, service } = fixture({}, [{ ...emptyMusicItem(), displayName: 'My title', artist: 'Custom artist', integrationProvider: 'deezer', integrationId: '1' }]);
        await vi.waitFor(() => expect(root.querySelector('article')).not.toBeNull());
        expect(root.querySelector<HTMLButtonElement>('article button')!.disabled).toBe(true);
        expect(root.querySelector('article')!.classList.contains('is-in-library')).toBe(true);
        root.querySelector<HTMLButtonElement>('article button')!.click();
        expect(service.createItem).not.toHaveBeenCalled();
        modal.onClose();
    });
    it('keeps an imported album recognized when the discography is reopened', async () => {
        const library: ReturnType<typeof emptyMusicItem>[] = [];
        const saved = { ...emptyMusicItem(), displayName: 'Album', artist: 'Artist', integrationProvider: 'deezer' as const, integrationId: '1' };
        const first = fixture({ releaseDetails: vi.fn(async () => saved) }, library);
        await vi.waitFor(() => expect(first.root.querySelector('article button')).not.toBeNull());
        first.root.querySelector<HTMLButtonElement>('article button')!.click();
        await vi.waitFor(() => expect(library).toHaveLength(1));
        first.modal.onClose();
        const second = fixture({}, library);
        await vi.waitFor(() => expect(second.root.querySelector('article button')).not.toBeNull());
        expect(second.root.querySelector<HTMLButtonElement>('article button')!.disabled).toBe(true);
        second.modal.onClose();
    });
    it('recognizes matching title/artist from an older note without provider metadata', async () => {
        const { modal, root } = fixture({}, [{ ...emptyMusicItem(), displayName: ' Ａｌｂｕｍ ', artist: '  ARTIST ' }]);
        await vi.waitFor(() => expect(root.querySelector('article button')).not.toBeNull());
        expect(root.querySelector<HTMLButtonElement>('article button')!.disabled).toBe(true);
        modal.onClose();
    });
    it.each([
        { artist: 'Another artist', musicKind: 'album' as const },
        { artist: 'Artist', musicKind: 'track' as const },
    ])('does not confuse an album with another artist or a track: %s', async differences => {
        const { modal, root } = fixture({}, [{ ...emptyMusicItem(), displayName: 'Album', ...differences }]);
        await vi.waitFor(() => expect(root.querySelector('article button')).not.toBeNull());
        expect(root.querySelector<HTMLButtonElement>('article button')!.disabled).toBe(false);
        modal.onClose();
    });
    it('does not create a note when closed before release details arrive', async () => {
        let finish!: (value: ReturnType<typeof emptyMusicItem>) => void;
        const { modal, root, service } = fixture({ releaseDetails: vi.fn(() => new Promise(done => finish = done)) });
        await vi.waitFor(() => expect(root.querySelector('article button')).not.toBeNull());
        root.querySelector<HTMLButtonElement>('article button')!.click();
        modal.onClose(); finish(emptyMusicItem());
        await Promise.resolve(); await Promise.resolve();
        expect(service.createItem).not.toHaveBeenCalled();
    });
});
