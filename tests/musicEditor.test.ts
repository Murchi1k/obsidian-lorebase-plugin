// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { App, TFile } from 'obsidian';
import { MusicEditModal } from '../src/modals/MusicEditModal';
import { MusicService, emptyMusicItem } from '../src/services/MusicService';
import { normalizeMusicTracks } from '../src/services/media/music';
import { DEFAULT_SETTINGS } from '../src/constants';
import type { MusicItem } from '../src/types';
import { MusicCatalog } from '../src/services/MusicCatalog';
import { ArtistDiscographyModal } from '../src/modals/ArtistDiscographyModal';

const menus = vi.hoisted(() => ({ items: [] as { title: string; action?: () => void; disabled?: boolean }[] }));
vi.mock('obsidian', async () => {
    const original = await import('./mocks/obsidian');
    return { ...original, Menu: class {
        items: typeof menus.items = [];
        addItem(build: (item: any) => void) {
            const item = { title: '', disabled: false, action: undefined as (() => void) | undefined,
                setTitle(value: string) { this.title = value; return this; }, setIcon() { return this; }, setChecked() { return this; },
                setDisabled(value: boolean) { this.disabled = value; return this; }, onClick(action: () => void) { this.action = action; return this; } };
            build(item); this.items.push(item); return this;
        }
        addSeparator() { return this; }
        showAtPosition() { menus.items = this.items; }
    } };
});

beforeAll(() => {
    vi.stubGlobal('createEl', (tag: string) => document.createElement(tag));
    vi.stubGlobal('createDiv', () => document.createElement('div'));
    vi.stubGlobal('createSpan', () => document.createElement('span'));
    Object.assign(HTMLElement.prototype, {
        empty() { this.replaceChildren(); },
        addClass(...names: string[]) { this.classList.add(...names); },
        removeClass(...names: string[]) { this.classList.remove(...names); },
        hasClass(name: string) { return this.classList.contains(name); },
        toggleClass(name: string, value: boolean) { this.classList.toggle(name, value); },
        setText(text: string) { this.textContent = text; },
        createEl(tag: string, options: any = {}) {
            const node = document.createElement(tag);
            if (options.cls) node.className = options.cls;
            if (options.text) node.textContent = options.text;
            if (options.type) node.setAttribute('type', options.type);
            for (const [key, value] of Object.entries(options.attr ?? {})) node.setAttribute(key, String(value));
            this.appendChild(node); return node;
        },
        createDiv(options: any) { return this.createEl('div', options); },
        createSpan(options: any) { return this.createEl('span', options); },
    });
});
afterEach(() => document.body.replaceChildren());

async function fixture(existing = false, updatedEditor = false, values: Partial<MusicItem> = {}, music = DEFAULT_SETTINGS.music) {
    const file = new TFile('Music/Album.md', 'Album');
    const original = { ...emptyMusicItem(), filePath: existing ? file.path : '', displayName: 'Album', artist: 'Artist', tracks: normalizeMusicTracks([
        { id: 'first', title: 'First', duration: 100, disc: 1, userRating: 4 },
        { id: 'second', title: 'Second', duration: 200, disc: 2, favorite: true },
    ]), ...values };
    const persist = vi.fn(async () => {});
    const app = { vault: { getAbstractFileByPath: () => file }, workspace: { openLinkText: vi.fn() } } as unknown as App;
    const settings = { ...DEFAULT_SETTINGS, music, updatedEditor };
    const modal = new MusicEditModal(app, original, settings, { readNotes: async () => '' } as MusicService, persist);
    modal.modalEl = document.body.createDiv(); modal.contentEl = modal.modalEl.createDiv();
    await modal.onOpen();
    return { modal, original, root: modal.contentEl, persist };
}

describe('music editor track interactions', () => {
    it('hydrates saved track guests, opens their source ID, and saves credits without changing personal progress', async () => {
        let resolve!: (value: any) => void;
        const load = vi.spyOn(MusicCatalog.prototype, 'trackCredits').mockImplementation(() => new Promise(done => resolve = done));
        const artist = vi.spyOn(MusicCatalog.prototype, 'artist').mockResolvedValue(null);
        try {
            const { modal, root, original, persist } = await fixture(false, true, { tracks: normalizeMusicTracks([{ id: 'saved', title: 'Song', artist: 'Artist', listened: true, favorite: true, userRating: 4 }]) });
            resolve({ deezerArtistId: '7', tracks: [{ id: 'saved', deezerId: '42', artists: ['Artist', 'Guest'], deezerArtistIds: { Artist: '7', Guest: '8' } }] });
            await vi.waitFor(() => expect(root.querySelector('.lorebase-music-track-artist')?.textContent).toBe('feat. Guest'));
            expect(original.tracks[0].artists).toBeUndefined();
            root.querySelector<HTMLButtonElement>('.lorebase-music-track-artist button')!.click();
            expect(artist).toHaveBeenLastCalledWith('Guest', '8');
            root.querySelector<HTMLButtonElement>('[data-action=save]')!.click();
            await vi.waitFor(() => expect(persist).toHaveBeenCalledOnce());
            expect(persist.mock.calls[0][0].tracks[0]).toMatchObject({ listened: true, favorite: true, userRating: 4, artists: ['Artist', 'Guest'], deezerArtistIds: { Guest: '8' } });
            modal.onClose();
        } finally { load.mockRestore(); artist.mockRestore(); }
    });
    it('does not overwrite a performer edited while guest credits are loading', async () => {
        let resolve!: (value: any) => void;
        const load = vi.spyOn(MusicCatalog.prototype, 'trackCredits').mockImplementation(() => new Promise(done => resolve = done));
        try {
            const { modal, root } = await fixture(false, true, { tracks: normalizeMusicTracks([{ id: 'saved', title: 'Song', artist: 'Artist' }]) });
            const input = root.querySelectorAll<HTMLInputElement>('[data-track-id=saved] .lorebase-music-track-fields input')[1];
            input.value = 'Artist feat. Manual'; input.dispatchEvent(new Event('input'));
            resolve({ deezerArtistId: '7', tracks: [{ id: 'saved', artists: ['Artist', 'Fetched'], deezerId: '42', deezerArtistIds: {} }] });
            await Promise.resolve(); await Promise.resolve();
            expect(root.querySelector('.lorebase-music-track-artist')?.textContent).toBe('feat. Manual');
            modal.onClose();
        } finally { load.mockRestore(); }
    });
    it('opens the clicked performer, expands long credits without editing the song, and ignores late clicks after closing', async () => {
        let resolve!: (value: any) => void;
        const artist = vi.spyOn(MusicCatalog.prototype, 'artist').mockImplementation(() => new Promise(done => resolve = done));
        const open = vi.spyOn(ArtistDiscographyModal.prototype, 'open').mockImplementation(() => {});
        try {
            const { modal, root } = await fixture(false, true, { artist: 'Main', tracks: normalizeMusicTracks([{ id: 'feat', title: 'Song', artist: 'Main feat. Guest, Third, Fourth' }]) });
            const row = root.querySelector<HTMLDetailsElement>('[data-track-id=feat]')!;
            expect(row.querySelectorAll('.lorebase-music-artist-link')).toHaveLength(2);
            row.querySelector<HTMLButtonElement>('.lorebase-music-artists-more')!.click();
            expect(row.open).toBe(false);
            expect(row.querySelectorAll('.lorebase-music-artist-link')).toHaveLength(3);
            expect(row.querySelector('.lorebase-music-track-artist')?.textContent).toContain('feat. Guest, Third, Fourth');
            expect(row.querySelector('.lorebase-music-track-artist')?.textContent).not.toContain('Main');
            const third = row.querySelectorAll<HTMLButtonElement>('.lorebase-music-artist-link')[1];
            third.click();
            expect(artist).toHaveBeenLastCalledWith('Third', undefined);
            expect(row.open).toBe(false);
            resolve({ id: '3', name: 'Third', image: '', url: '', listeners: null, fans: null });
            await vi.waitFor(() => expect(open).toHaveBeenCalledOnce());
            third.click(); modal.onClose();
            resolve({ id: '3', name: 'Third', image: '', url: '', listeners: null, fans: null });
            await Promise.resolve(); await Promise.resolve();
            expect(open).toHaveBeenCalledOnce();
        } finally { artist.mockRestore(); open.mockRestore(); }
    });
    it('omits feat. entirely when the track has no guests', async () => {
        const { modal, root } = await fixture(false, true, { artist: 'Artist', tracks: normalizeMusicTracks([{ id: 'solo', title: 'Solo', artist: 'Artist' }]) });
        expect(root.querySelector('[data-track-id=solo] .lorebase-music-track-artist')?.textContent).toBe('');
        expect(root.querySelector('[data-track-id=solo] .lorebase-music-artist-link')).toBeNull();
        modal.onClose();
    });
    it('keeps batch and reorder actions in menus while preserving the listened count', async () => {
        const { modal, root } = await fixture();
        root.querySelector<HTMLButtonElement>('.lorebase-music-tracklist-tools button:last-child')!.click();
        menus.items.find(item => item.title === 'Mark all listened')!.action!();
        expect(root.querySelector('progress')?.value).toBe(2);
        root.querySelector<HTMLButtonElement>('[data-track-id="first"] .lorebase-music-track-menu')!.click();
        menus.items.find(item => item.title === 'Add to library')!.action!();
        expect(root.querySelector('[data-track-id="first"]')?.classList.contains('is-extract-queued')).toBe(true);
        root.querySelector<HTMLButtonElement>('.lorebase-music-tracklist-tools button:last-child')!.click();
        menus.items.find(item => item.title === 'Add song')!.action!();
        const rows = root.querySelectorAll<HTMLDetailsElement>('.lorebase-music-track-row');
        expect(rows).toHaveLength(3); expect(rows[2].open).toBe(true);
        modal.onClose();
    });

    it('shows listening counts and an artist card, saving new statistics only with the draft', async () => {
        const counts = { source: 'lastfm' as const, listeners: 13800, plays: 379100, url: 'https://www.last.fm/music/Artist/Album' };
        const stats = vi.spyOn(MusicCatalog.prototype, 'listeningStats').mockResolvedValue(counts);
        const artist = vi.spyOn(MusicCatalog.prototype, 'artist').mockResolvedValue({ id: '7', name: 'Artist', image: '', url: 'https://www.deezer.com/artist/7', listeners: 13800, fans: 100 });
        try {
            const { modal, original, root, persist } = await fixture(false, true, {}, { ...DEFAULT_SETTINGS.music, lastfmApiKey: 'key' });
            await vi.waitFor(() => expect(root.querySelector('.lorebase-music-count-row')?.textContent).toContain('13.8K'));
            expect(root.querySelector('.lorebase-music-artist-card strong')?.textContent).toBe('Artist');
            expect(original.listeningStats).toBeUndefined();
            root.querySelector<HTMLButtonElement>('[data-action="save"]')!.click();
            await vi.waitFor(() => expect(persist).toHaveBeenCalledOnce());
            expect(persist.mock.calls[0][0]).toMatchObject({ listeningStats: counts, deezerArtistId: '7', tracks: [{ listened: false }, { listened: false }] });
            modal.onClose();
        } finally { stats.mockRestore(); artist.mockRestore(); }
    });
    it('does not apply a late artist response after the editor closes', async () => {
        let resolve!: (value: null) => void;
        const artist = vi.spyOn(MusicCatalog.prototype, 'artist').mockImplementation(() => new Promise(done => resolve = done));
        try {
            const { modal, root, persist } = await fixture();
            modal.onClose(); resolve(null);
            await Promise.resolve(); await Promise.resolve();
            expect(root.querySelector('.lorebase-music-artist-card')).toBeNull();
            expect(persist).not.toHaveBeenCalled();
        } finally { artist.mockRestore(); }
    });
    it('uses the shared right-column panels and visible tag input without a music-note panel', async () => {
        const { modal, root } = await fixture(true);
        expect(root.querySelector('.lorebase-editmode-advanced .lorebase-editmode-collapsible-summary')).not.toBeNull();
        expect(root.querySelector('.lorebase-editmode-local-path')?.textContent).toBe('Music/Album.md');
        expect(root.querySelector<HTMLInputElement>('.lorebase-editmode-tag-input')?.parentElement?.hidden).toBe(false);
        expect(root.querySelector('.lorebase-source-url-row')).not.toBeNull();
        expect(root.querySelectorAll('.lorebase-editmode-timestamps .lorebase-editmode-kv-row')).toHaveLength(2);
        expect(root.querySelector('.lorebase-editmode-status-rating [data-status="on_repeat"]')).not.toBeNull();
        expect(root.querySelector('.lorebase-editmode-status-rating [data-status="to_be_released"]')).not.toBeNull();
        expect(root.querySelector('.lorebase-music-note-help')).toBeNull();
        modal.onClose();
    });
    it('keeps edits in a draft, groups discs, and preserves unrelated song fields when saved', async () => {
        const { modal, original, root, persist } = await fixture();
        expect(root.querySelectorAll('.lorebase-music-disc-heading')).toHaveLength(2);
        const first = root.querySelector<HTMLDetailsElement>('[data-track-id="first"]')!;
        expect(first.open).toBe(false);
        first.querySelector<HTMLButtonElement>('.lorebase-music-track-favorite')!.click();
        const listened = first.querySelector<HTMLInputElement>('input[type=checkbox]')!;
        listened.checked = true; listened.dispatchEvent(new Event('change'));
        expect(original.tracks[0]).toMatchObject({ listened: false, favorite: false });
        expect(root.querySelector('progress')?.value).toBe(1);
        root.querySelector<HTMLButtonElement>('.lorebase-editmode-header-right .lorebase-editmode-btn-primary')!.click();
        await vi.waitFor(() => expect(persist).toHaveBeenCalledOnce());
        expect(persist.mock.calls[0][0].tracks[0]).toMatchObject({ listened: true, favorite: true, userRating: 4 });
        expect(persist.mock.calls[0][0].tracks[1]).toMatchObject({ favorite: true, listened: false });
        modal.onClose();
    });
    it('updates duration totals without changing an explicit album status', async () => {
        const { modal, root } = await fixture();
        const planned = root.querySelector<HTMLButtonElement>('[data-status="planned"]')!;
        planned.click();
        const duration = root.querySelector<HTMLInputElement>('.lorebase-music-track-body input[aria-label*="m:ss"]')!;
        duration.value = '2:00'; duration.dispatchEvent(new Event('input'));
        expect(root.querySelector('.lorebase-music-progress-labels')?.textContent).toContain('5 min');
        expect(planned.getAttribute('aria-pressed')).toBe('true');
        modal.onClose();
    });
});

describe('updated music editor', () => {
    it('keeps release and repeat together with Favorite and restores the last listening status', async () => {
        const { modal, root, original, persist } = await fixture(true, true, { status: 'listening' });
        const quick = root.querySelector('.lorebase-editmode-quick-settings')!;
        const release = quick.querySelector<HTMLButtonElement>('[data-toggle="to_be_released"]')!;
        const repeat = quick.querySelector<HTMLButtonElement>('[data-toggle="on_repeat"]')!;
        expect(quick.querySelectorAll('[data-toggle]')).toHaveLength(3);
        expect(root.querySelector('[data-status="to_be_released"], [data-status="on_repeat"]')).toBeNull();
        release.click();
        expect(release.getAttribute('aria-pressed')).toBe('true');
        repeat.click();
        expect(release.getAttribute('aria-pressed')).toBe('false');
        expect(repeat.getAttribute('aria-pressed')).toBe('true');
        repeat.click();
        expect(root.querySelector('[data-status="listening"]')?.getAttribute('aria-pressed')).toBe('true');

        release.click();
        root.querySelector<HTMLButtonElement>('[data-status="paused"]')!.click();
        expect(release.getAttribute('aria-pressed')).toBe('false');
        repeat.click();
        root.querySelector<HTMLButtonElement>('[data-action="save"]')!.click();
        await vi.waitFor(() => expect(persist).toHaveBeenCalledWith(expect.objectContaining({ status: 'on_repeat' })));
        expect(original.status).toBe('listening');
        modal.onClose();
    });

    it.each(['to_be_released', 'on_repeat'] as const)('shows the saved %s status in Quick settings', async status => {
        const { modal, root } = await fixture(true, true, { status });
        const toggle = root.querySelector<HTMLButtonElement>(`[data-toggle="${status}"]`)!;
        expect(toggle.getAttribute('aria-pressed')).toBe('true');
        toggle.click();
        expect(root.querySelector('[data-status="planned"]')?.getAttribute('aria-pressed')).toBe('true');
        modal.onClose();
    });

    it('moves album fields to the cover and saves notes, tags and tracklist changes in the same draft', async () => {
        const { modal, original, root, persist } = await fixture(true, true, { year: 2020, tags: ['library'], genres: ['Rock'] });
        const poster = root.querySelector('.lorebase-editmode-poster-card')!;
        const title = poster.querySelector<HTMLInputElement>('[data-field="title"]')!;
        expect(title.value).toBe('Album');
        expect(poster.querySelector<HTMLInputElement>('[data-field="artist"]')?.value).toBe('Artist');
        expect(poster.querySelector<HTMLInputElement>('[data-field="year"]')?.value).toBe('2020');
        expect(poster.querySelector('.lorebase-music-cover-kind')?.textContent).toBe('Album');
        expect(root.querySelector('.lorebase-editmode-title-meta')).toBeNull();
        expect(root.querySelectorAll('.lorebase-editmode-advanced .lorebase-editmode-kv-row')).toHaveLength(2);
        expect(root.querySelector('.lorebase-editmode-status-rating [data-action="toggle-detailed-rating"]')).not.toBeNull();

        poster.querySelector<HTMLButtonElement>('[data-action="edit-cover-title"]')!.click();
        expect(document.activeElement).toBe(title);
        title.value = 'Updated album';
        title.dispatchEvent(new Event('input'));
        expect(root.querySelector('.lorebase-editmode-breadcrumb')?.textContent).toBe('Editing / Music / Updated album');
        const toggle = poster.querySelector<HTMLButtonElement>('[data-action="toggle-notes"]')!;
        toggle.click();
        const notes = root.querySelector<HTMLElement>('[data-component="NotesEditor"]')!;
        expect(notes.dataset.mobilePane).toBe('general');
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
        const textarea = notes.querySelector<HTMLTextAreaElement>('.lorebase-editmode-notes-input')!;
        await vi.waitFor(() => expect(document.activeElement).toBe(notes.querySelector('article')));
        notes.querySelector<HTMLButtonElement>('[data-action="edit-description"]')!.click();
        await vi.waitFor(() => expect(document.activeElement).toBe(textarea));
        textarea.value = 'Updated description';
        textarea.dispatchEvent(new Event('input'));
        notes.querySelector<HTMLButtonElement>('[data-mode="myNotes"]')!.click();
        expect(textarea.hidden).toBe(true);
        notes.querySelector<HTMLButtonElement>('[data-action="add-my-notes"]')!.click();
        textarea.value = 'Personal note';
        textarea.dispatchEvent(new Event('input'));

        root.querySelector<HTMLButtonElement>('[data-toggle="favorite"]')!.click();
        root.querySelector<HTMLButtonElement>('[data-chip-kind="genres"]')!.click();
        root.querySelector<HTMLButtonElement>('[data-action="toggle-tag-input"]')!.click();
        const genre = root.querySelector<HTMLInputElement>('[data-field="new-tag"]')!;
        genre.value = 'Jazz';
        const listened = root.querySelector<HTMLInputElement>('[data-track-id="first"] input[type="checkbox"]')!;
        listened.checked = true;
        listened.dispatchEvent(new Event('change'));
        genre.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
        await vi.waitFor(() => expect(persist).toHaveBeenCalledOnce());
        expect(persist.mock.calls[0][0]).toMatchObject({ displayName: 'Updated album', description: 'Updated description', myNotes: 'Personal note',
            favorite: true, genres: ['Rock', 'Jazz'], tags: ['library'], tracks: [{ listened: true }, { listened: false }] });
        expect(original.tracks[0].listened).toBe(false);
        modal.onClose();
    });

    it('validates and saves the duration from a song cover', async () => {
        const { modal, root, persist } = await fixture(true, true, { musicKind: 'track', tracks: [], album: 'Original album', duration: 100 });
        const duration = root.querySelector<HTMLInputElement>('.lorebase-music-cover-duration input')!;
        expect(duration.value).toBe('1:40');
        const album = root.querySelector<HTMLInputElement>('.lorebase-editmode-advanced [data-field="album"]')!;
        expect(album.value).toBe('Original album');
        expect(root.querySelector('.lorebase-music-tracklist')).toBeNull();
        const save = root.querySelector<HTMLButtonElement>('[data-action="save"]')!;
        duration.value = 'invalid';
        duration.dispatchEvent(new Event('input'));
        save.click();
        expect(persist).not.toHaveBeenCalled();
        duration.value = '3:05';
        duration.dispatchEvent(new Event('input'));
        save.click();
        await vi.waitFor(() => expect(persist).toHaveBeenCalledOnce());
        expect(persist.mock.calls[0][0]).toMatchObject({ musicKind: 'track', album: 'Original album', duration: 185 });
        modal.onClose();
    });
});
