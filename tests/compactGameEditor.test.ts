// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Modal } from 'obsidian';
import { DEFAULT_SETTINGS } from '../src/constants';
import { EditModal } from '../src/modals/EditModal';
import { AnimeEditModal } from '../src/modals/AnimeEditModal';
import { ReadingEditModal } from '../src/modals/ReadingEditModal';
import { VideoEditModal } from '../src/modals/VideoEditModal';
import { renderGeneralSettings } from '../src/settings/sections/general';
import { i18n } from '../src/localization';
import { migrateUpdatedEditorSetting } from '../src/settings/settingsNormalization';
import type { SettingsSectionContext } from '../src/settings/sections/types';
import type { AnimeItem, BookItem, GameItem, MangaItem, MovieItem, RatingScaleSettings, RelatedMediaLink, SeriesItem } from '../src/types';
import type { RefreshGameTracking } from '../src/components/GameTrackingPanel';
import type { SeriesPartsRefresh } from '../src/services/EpisodeMetadataService';
import { createMockApp } from './helpers/testHelpers';
import { installStatisticsDom } from './helpers/statisticsDom';

vi.mock('../src/settings/sections/cardCustomization', () => ({ renderCardWorkspace: vi.fn() }));

beforeEach(() => {
    installStatisticsDom();
    Object.assign(HTMLElement.prototype, {
        setAttr(name: string, value: string) { this.setAttribute(name, value); },
        setText(value: string) { this.textContent = value; },
    });
    vi.stubGlobal('createFragment', () => document.createDocumentFragment());
    vi.stubGlobal('createEl', (tag: string) => document.createElement(tag));
    vi.stubGlobal('createDiv', () => document.createElement('div'));
    vi.stubGlobal('createSpan', () => document.createElement('span'));
});

describe('compact anime editor', () => {
    it.each(['failure', 'closed'] as const)('keeps anime draft safe when auto-fill is %s', async outcome => {
        const anime = { type: 'anime', filePath: 'Anime/Example.md', displayName: 'Example', year: 2006, format: 'tv', status: 'watching', userRating: null, favorite: false, isAdult: false, genres: [], tags: [], parts: [{ id: 'main', title: 'Example', kind: 'tv', status: 'watching', episodeCurrent: 3, episodeTotal: null }], activePartId: 'main' } as AnimeItem;
        let finish!: (value: any) => void, fail!: (reason: Error) => void;
        const request = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
        const persist = vi.fn();
        const modal = new AnimeEditModal(createMockApp({}), anime, persist, undefined, () => request as any, undefined, [], undefined, undefined, undefined, undefined, undefined, true);
        mount(modal);
        const button = modal.contentEl.querySelector<HTMLButtonElement>('[data-action="autofill-parts"]')!;
        button.click(); expect(button.disabled).toBe(true);
        if (outcome === 'closed') { modal.close(); finish({ parts: [{ ...anime.parts![0], episodeTotal: 12 }], activePartId: 'main', status: 'watching' }); }
        else { fail(new Error('Offline')); }
        await vi.waitFor(() => expect(button.disabled).toBe(false));
        expect(persist).not.toHaveBeenCalled(); expect(anime.parts![0].episodeTotal).toBeNull();
        if (outcome === 'failure') {
            expect(modal.contentEl.querySelector<HTMLInputElement>('[data-field="part-episode-current"]')!.value).toBe('3');
            expect(await modal.saveBeforeSourceRefresh()).toBe(true);
            expect(persist).toHaveBeenCalledWith(expect.objectContaining({ parts: [expect.objectContaining({ episodeCurrent: 3, episodeTotal: null })] }));
            modal.close();
        } else expect(modal.contentEl.childElementCount).toBe(0);
    });

    it('auto-fills the current anime draft in one click and waits for Save', async () => {
        const anime = { type: 'anime', filePath: 'Anime/Black Lagoon.md', displayName: 'Black Lagoon', year: 2006, format: 'tv', status: 'watching', userRating: null, favorite: false, isAdult: false, genres: [], tags: [], parts: [{ id: 'main', title: 'Black Lagoon', kind: 'tv', status: 'watching', episodeCurrent: 2, episodeTotal: null }], activePartId: 'main' } as AnimeItem;
        const persist = vi.fn();
        const refresh = vi.fn(async (request: any) => ({ parts: [{ ...request.parts[0], id: 'anilist-889', episodeTotal: 12 }, { id: 'anilist-1519', title: 'The Second Barrage', kind: 'tv', status: 'planned', episodeCurrent: 0, episodeTotal: 12 }], activePartId: 'anilist-889', status: request.status }));
        const modal = new AnimeEditModal(createMockApp({}), anime, persist, undefined, refresh as any, undefined, [], undefined, undefined, undefined, undefined, undefined, true);
        mount(modal);
        const root = modal.contentEl;
        expect(root.querySelector('.lorebase-priority-control')?.previousElementSibling?.classList.contains('lorebase-editmode-quick-settings')).toBe(true);
        const title = root.querySelector<HTMLInputElement>('[data-field="part-title"]')!;
        title.value = 'My Lagoon'; title.dispatchEvent(new Event('input'));
        const autofill = root.querySelector<HTMLButtonElement>('[data-action="autofill-parts"]')!;
        expect(autofill.textContent).toBe(''); expect(autofill.getAttribute('aria-label')).toBe('Auto-fill');
        expect(autofill.nextElementSibling?.getAttribute('data-action')).toBe('refresh-parts');
        expect(autofill.classList.contains('lorebase-editmode-anime-parts-icon-action')).toBe(true);
        autofill.click();
        await vi.waitFor(() => expect(root.querySelector<HTMLInputElement>('[data-field="part-episode-total"]')!.value).toBe('12'));
        expect(refresh).toHaveBeenCalledWith(expect.objectContaining({ automatic: true, parts: [expect.objectContaining({ title: 'My Lagoon', episodeCurrent: 2 })] }));
        expect(persist).not.toHaveBeenCalled(); expect(anime.parts![0].episodeTotal).toBeNull();
        expect(await modal.saveBeforeSourceRefresh()).toBe(true);
        expect(persist).toHaveBeenCalledWith(expect.objectContaining({ parts: [expect.objectContaining({ id: 'anilist-889', title: 'My Lagoon', episodeCurrent: 2 }), expect.objectContaining({ id: 'anilist-1519' })] }));
        modal.close();
    });

    it('saves the moved fields around the anime part card', async () => {
        const anime = {
            type: 'anime', filePath: 'Anime/Example.md', displayName: 'Example', year: 2006, format: 'tv',
            status: 'watching', userRating: null, favorite: false, isAdult: false,
            countryOfOrigin: 'JP', countries: ['JP'], genres: ['action'], tags: ['watching'],
            parts: [{ id: 'first', title: 'Example', kind: 'tv', status: 'watching', episodeCurrent: 2, episodeTotal: 12 }],
            activePartId: 'first',
        } as AnimeItem;
        const open = (compact: boolean, save = vi.fn()) => {
            const modal = new AnimeEditModal(createMockApp({}), anime, save, undefined, undefined, undefined,
                [], undefined, undefined, undefined, undefined, undefined, compact);
            mount(modal);
            return modal;
        };
        const legacy = open(false);
        expect(legacy.contentEl.querySelector('.lorebase-title-part-card')).toBeNull();
        expect(legacy.contentEl.querySelector('.lorebase-editmode-title-meta [data-field="format"]')).not.toBeNull();
        legacy.close();

        const persist = vi.fn();
        const compact = open(true, persist);
        const field = <T extends HTMLElement = HTMLButtonElement>(selector: string): T => compact.contentEl.querySelector<T>(selector)!;
        const poster = field('.lorebase-editmode-poster-card');
        expect(poster.querySelector('[data-field="title"]')).not.toBeNull();
        expect(poster.querySelector('[data-field="year"]')).not.toBeNull();
        expect(poster.querySelector('[data-field="country"] .lorebase-card-work-type')?.textContent).toContain('Japan');
        expect(field('.lorebase-editmode-advanced [data-field="format"] button').textContent).toContain('TV');
        expect(Array.from(compact.contentEl.querySelectorAll<HTMLElement>('.lorebase-game-quick-actions [data-toggle]'), button => button.dataset.toggle))
            .toEqual(['favorite', 'adult', 'release']);
        expect(field('.lorebase-editmode-advanced [data-role="ts-updated"]')).not.toBeNull();
        expect(field<HTMLInputElement>('.lorebase-title-part-card [data-role="part-card-title"]').value).toBe('Example');
        expect(field('[data-role="part-card-percent"]').textContent).toBe('17%');
        const choose = (selector: string, label: string): void => {
            const trigger = field(`${selector} button`);
            vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 140, 30));
            trigger.click();
            Array.from(document.querySelectorAll<HTMLElement>('.lorebase-settings-dropdown-panel.is-open [role="option"]'))
                .find(option => option.textContent === label)!.click();
        };
        field('.lorebase-editmode-advanced > summary').click();
        choose('.lorebase-editmode-advanced [data-field="format"]', 'Movie');
        choose('.lorebase-editmode-poster-card [data-field="country"]', 'South Korea');
        field('[data-action="edit-cover-title"]').click();
        expect(document.activeElement).toBe(field('[data-field="title"]'));
        const title = field<HTMLInputElement>('[data-field="title"]');
        title.value = 'Updated';
        title.dispatchEvent(new Event('input'));
        field('[data-action="toggle-notes"]').click();
        const notes = field<HTMLTextAreaElement>('[data-field="summary"]');
        await vi.waitFor(() => expect(document.activeElement).toBe(field('.lorebase-notes-reader-content')));
        field('[data-action="edit-description"]').click();
        await vi.waitFor(() => expect(document.activeElement).toBe(notes));
        notes.value = 'Updated description';
        notes.dispatchEvent(new Event('input'));
        field('[data-toggle="adult"]').click();
        field('[data-chip-kind="genres"]').click();
        field('[data-action="toggle-tag-input"]').click();
        field<HTMLInputElement>('[data-field="new-tag"]').value = 'Drama';
        await compact.saveBeforeSourceRefresh();
        expect(persist).toHaveBeenCalledWith(expect.objectContaining({
            displayName: 'Updated', summary: 'Updated description', isAdult: true, genres: ['action', 'drama'], tags: ['watching'], activePartId: 'first',
            format: 'movie', countryOfOrigin: 'KR', countries: ['KR'],
        }));
        expect(persist.mock.calls[0][0].parts[0]).toMatchObject({ id: 'first', kind: 'tv', episodeCurrent: 2, episodeTotal: 12 });
    });
});

describe('updated editor setting', () => {
    it.each([
        [{ compactGameEditor: false, compactAnimeEditor: true }, true],
        [{ compactVideoEditor: true }, true],
        [{ compactReadingEditor: true }, true],
        [{ compactGameEditor: false, compactReadingEditor: false }, false],
        [{ updatedEditor: false, compactVideoEditor: true }, false],
    ] as const)('migrates %o to %s and drops the old keys', (legacy, enabled) => {
        const settings = { ...legacy, cardClickAction: 'open' };
        expect(migrateUpdatedEditorSetting(settings)).toBe(true);
        expect(settings).toEqual({ updatedEditor: enabled, cardClickAction: 'open' });
        expect(migrateUpdatedEditorSetting(settings)).toBe(false);
    });
});

describe('compact movie, series, book and manga editors', () => {
    const common = { filePath: 'Example.md', displayName: 'Example', year: 2020, genres: ['action'], tags: ['example'] };

    function openVideo(item: MovieItem | SeriesItem, compact: boolean, persist = vi.fn(), refresh?: () => Promise<SeriesPartsRefresh>) {
        const modal = new VideoEditModal(createMockApp({}), item, persist, vi.fn(), undefined,
            [], [], undefined, undefined, undefined, undefined, undefined, undefined, undefined, compact, refresh);
        mount(modal);
        return modal;
    }

    it('moves the editable movie duration to the cover and saves minutes', async () => {
        const movie = { ...common, type: 'movie', status: 'planned', runtime: '93' } as MovieItem;
        const legacy = openVideo(movie, false);
        expect(legacy.contentEl.querySelector('[data-role="breadcrumb"]')?.textContent).toBe('Editing / Movies / Example');
        expect(legacy.contentEl.querySelector('.lorebase-editmode-title-meta [data-role="movie-duration"]')).not.toBeNull();
        legacy.close();

        const persist = vi.fn();
        const compact = openVideo(movie, true, persist);
        const poster = compact.contentEl.querySelector('.lorebase-editmode-poster-card')!;
        const title = poster.querySelector<HTMLInputElement>('[data-field="title"]')!;
        expect(title.value).toBe('Example');
        const breadcrumb = compact.contentEl.querySelector('[data-role="breadcrumb"]');
        expect(breadcrumb?.textContent).toBe('Editing / Movies / Example');
        title.value = ' Updated movie ';
        title.dispatchEvent(new Event('input'));
        expect(breadcrumb?.textContent).toBe('Editing / Movies / Updated movie');
        expect(poster.querySelector<HTMLInputElement>('[data-field="year"]')?.value).toBe('2020');
        expect(poster.querySelector('[data-field="work-type"] button')).not.toBeNull();
        expect(poster.getAttribute('data-mobile-pane')).toBe('general');
        expect(compact.contentEl.querySelector('[data-component="NotesEditor"]')?.getAttribute('data-mobile-pane')).toBe('general');
        poster.querySelector<HTMLButtonElement>('[data-action="toggle-notes"]')!.click();
        expect(compact.contentEl.querySelector('[data-component="NotesEditor"]')?.classList.contains('is-collapsed')).toBe(false);
        expect(poster.querySelector('[data-field="runtime-hours"]')).toHaveProperty('value', '1');
        const minutes = poster.querySelector<HTMLInputElement>('[data-field="runtime-minutes"]')!;
        expect(minutes.value).toBe('33');
        minutes.value = '45';
        minutes.dispatchEvent(new Event('input'));
        expect(compact.contentEl.querySelectorAll('[data-role="movie-duration"]')).toHaveLength(1);
        expect(compact.contentEl.querySelector('[data-action="refresh-parts"]')).toBeNull();
        await compact.saveBeforeSourceRefresh();
        expect(persist).toHaveBeenCalledWith(expect.objectContaining({ runtime: '105' }));
    });

    it('uses the shared title composition card only in the updated series editor', () => {
        const series = {
            ...common, type: 'series', status: 'watching', activePartId: 'first',
            parts: [{ id: 'first', title: 'First season', kind: 'season', status: 'watching', episodeCurrent: 2, episodeTotal: 12 }],
        } as SeriesItem;
        const parts = (modal: VideoEditModal) => modal.contentEl.querySelector('.lorebase-editmode-series-parts')!;
        const legacy = openVideo(series, false);
        expect(parts(legacy).querySelector('.lorebase-part-details')).not.toBeNull();
        expect(parts(legacy).querySelector('[data-role="part-rating"]')).toBeNull();
        legacy.close();
        const compact = openVideo(series, true);
        expect(parts(compact).classList.contains('lorebase-title-composition')).toBe(true);
        expect(parts(compact).querySelector('.lorebase-title-part-card [data-role="part-rating"]')).not.toBeNull();
        expect(parts(compact).querySelector('.lorebase-part-details')).toBeNull();
        expect(compact.contentEl.querySelector('[data-role="breadcrumb"]')?.textContent).toBe('Editing / Series / Example');
        expect(compact.contentEl.querySelector('.lorebase-editmode-poster-card [data-field="title"]')).not.toBeNull();
        expect(compact.contentEl.querySelector('[data-role="movie-duration"]')).toBeNull();
    });

    it('refreshes season metadata without losing episode checks or a rating made during refresh', async () => {
        const season = {
            id: 'local-first', title: 'My season title', kind: 'season', seasonNumber: 1, status: 'watching',
            episodeTracking: 'episodes', episodeCurrent: 2, episodeTotal: 12, watchedEpisodes: [2, 10],
            episodeDetails: [{ number: 2, title: 'Old title' }], poster: 'old.jpg', repeatCount: 2,
        } as NonNullable<SeriesItem['parts']>[number];
        const series = { ...common, type: 'series', status: 'watching', activePartId: season.id, parts: [season] } as SeriesItem;
        let finish!: (result: SeriesPartsRefresh) => void;
        const refresh = vi.fn(() => new Promise<SeriesPartsRefresh>(resolve => { finish = resolve; }));
        const persist = vi.fn();
        const modal = openVideo(series, true, persist, refresh);
        const root = modal.contentEl;
        const refreshButton = root.querySelector<HTMLButtonElement>('[data-action="refresh-parts"]')!;
        expect(refreshButton.previousElementSibling?.getAttribute('data-action')).toBe('add-part');
        refreshButton.click();
        expect(refreshButton.disabled).toBe(true);
        root.querySelector<HTMLButtonElement>('[data-episode="7"]')!.click();
        root.querySelectorAll<HTMLButtonElement>('[data-role="part-rating"] .lorebase-editmode-dlc-star')[3].click();
        finish({ parts: [
            { id: 'provider-first', title: 'Season 1', kind: 'season', seasonNumber: 1, status: 'planned',
                episodeCurrent: 0, episodeTotal: 8, poster: 'new.jpg', episodeDetails: [{ number: 2, title: 'New title' }] },
            { id: 'provider-second', title: 'Season 2', kind: 'season', seasonNumber: 2, status: 'planned', episodeCurrent: 0, episodeTotal: 16 },
        ], partial: false });
        await vi.waitFor(() => expect(refreshButton.disabled).toBe(false));
        expect(root.querySelector('[data-episode="10"]')?.getAttribute('aria-pressed')).toBe('true');
        expect(root.querySelector<HTMLInputElement>('[data-field="part-poster"]')?.value).toBe('new.jpg');
        expect(persist).not.toHaveBeenCalled();
        await modal.saveBeforeSourceRefresh();
        expect(persist).toHaveBeenCalledWith(expect.objectContaining({ activePartId: season.id, parts: [
            expect.objectContaining({ ...season, episodeCurrent: 3, episodeTotal: 10, watchedEpisodes: [2, 7, 10],
                poster: 'new.jpg', episodeDetails: [{ number: 2, title: 'New title' }], userRating: 4 }),
            expect.objectContaining({ seasonNumber: 2, episodeTotal: 16, episodeCurrent: 0 }),
        ] }));
    });

    it.each(['book', 'manga'] as const)('moves %s fields and leaves its reading counters in place', async type => {
        const item = {
            ...common, type, status: 'reading', chapterCurrent: 2, chapterTotal: 12,
            ...(type === 'book' ? { pageCurrent: 14, pageTotal: 200 } : { volumeCurrent: 1, volumeTotal: 5, workType: 'manhwa' }),
        } as BookItem | MangaItem;
        const persist = vi.fn();
        const open = (compact: boolean) => {
            const modal = new ReadingEditModal(createMockApp({}), item, persist, vi.fn(), undefined,
                [], [], undefined, undefined, undefined, undefined, compact);
            mount(modal);
            return modal;
        };
        const progress = (modal: ReadingEditModal) => modal.contentEl.querySelector('[data-role="progress-editor"]')!.innerHTML;
        const legacy = open(false);
        const legacyProgress = progress(legacy);
        legacy.close();
        const compact = open(true);
        const root = compact.contentEl;
        const title = root.querySelector<HTMLInputElement>('.lorebase-editmode-poster-card [data-field="title"]')!;
        const breadcrumb = root.querySelector('[data-role="breadcrumb"]');
        const category = type === 'book' ? 'Books' : 'Manga';
        expect(breadcrumb?.textContent).toBe(`Editing / ${category} / Example`);
        title.value = 'Updated title';
        title.dispatchEvent(new Event('input'));
        expect(breadcrumb?.textContent).toBe(`Editing / ${category} / Updated title`);
        title.value = ' ';
        title.dispatchEvent(new Event('input'));
        expect(breadcrumb?.textContent).toBe(`Editing / ${category} / Example`);
        expect(!!root.querySelector('.lorebase-editmode-poster-card [data-field="work-type"] button')).toBe(type === 'manga');
        expect(root.querySelector('.lorebase-editmode-advanced [data-role="ts-updated"]')).not.toBeNull();
        expect(root.querySelector('[data-chip-kind="genres"]')).not.toBeNull();
        expect(progress(compact)).toBe(legacyProgress);
        await compact.saveBeforeSourceRefresh();
        expect(persist).toHaveBeenCalledWith(expect.objectContaining({ chapterCurrent: 2, chapterTotal: 12 }));
    });
});

describe('personal dates in media editors', () => {
    it.each(['anime', 'movie', 'series', 'book', 'manga'] as const)('preserves a year-only %s completion through open and save', async type => {
        i18n.setLanguage('en');
        const item = { type, filePath: 'Example.md', displayName: 'Old favorite', status: 'completed', finished: '2019',
            year: 2000, userRating: null, favorite: false, isAdult: false, genres: [], tags: [], parts: [],
            summary: '', description: '', format: 'tv', authors: [], artists: [], studios: [], episodeCurrent: 0, episodeTotal: null,
            pageCurrent: null, pageTotal: null, chapterCurrent: null, chapterTotal: null, volumeCurrent: null, volumeTotal: null } as any;
        const persist = vi.fn(async () => {}), app = createMockApp({});
        const modal = type === 'anime' ? new AnimeEditModal(app, item, persist)
            : type === 'movie' || type === 'series' ? new VideoEditModal(app, item, persist, vi.fn()) : new ReadingEditModal(app, item, persist, vi.fn());
        mount(modal);
        expect(modal.contentEl.querySelector<HTMLInputElement>('[data-field="finished-date"]')!.value).toBe('2019');
        expect(await modal.saveBeforeSourceRefresh()).toBe(true);
        expect(persist).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed', finished: '2019' }));
    });
});

afterEach(() => {
    i18n.setLanguage('en');
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

function mount(modal: Modal & { onOpen(): void; onClose(): void }): void {
    modal.modalEl = document.body.appendChild(document.createElement('div'));
    modal.contentEl = modal.modalEl.appendChild(document.createElement('div'));
    vi.spyOn(modal, 'close').mockImplementation(() => {
        modal.onClose();
        modal.modalEl.remove();
    });
    modal.onOpen();
}

function openEditor(options: {
    compact?: boolean;
    values?: Partial<GameItem>;
    scale?: RatingScaleSettings;
    refresh?: RefreshGameTracking;
    candidates?: RelatedMediaLink[];
    incoming?: RelatedMediaLink[];
} = {}) {
    const game = {
        type: 'game', filePath: 'Games/Example.md', displayName: 'Example', status: 'playing',
        userRating: null, year: 2024, description: '', gameSeries: '', tags: [], genres: [],
        favorite: false, isAdult: false, platforms: ['Windows', 'PS5'], steamAppId: '42',
        ...options.values,
    } as GameItem;
    const onSave = vi.fn(async (_updates: Partial<GameItem>) => {});
    const modal = new EditModal(createMockApp({}), game, onSave, [], undefined, [], undefined, undefined,
        options.candidates, options.incoming, undefined, undefined, options.scale, undefined, options.refresh, options.compact);
    mount(modal);
    const field = <T extends HTMLElement = HTMLButtonElement>(selector: string): T => modal.contentEl.querySelector<T>(selector)!;
    return { modal, field, onSave, game };
}

describe('compact game editor', () => {
    it.each(['2019', 'unknown', '2019-06'])('keeps a completed game with personal date %s when saving', async finished => {
        const editor = openEditor({ compact: true, values: { status: 'completed', finished } });
        const input = editor.field<HTMLInputElement>('[data-field="finished-date"]');
        expect(input.value).toBe(finished === 'unknown' ? 'Date unknown' : finished);
        expect(await editor.modal.saveBeforeSourceRefresh()).toBe(true);
        expect(editor.onSave).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed', finished }));
    });
    it('does not supply today when a game is marked completed or saved without a date', async () => {
        const editor = openEditor({ compact: true });
        editor.field<HTMLButtonElement>('.lorebase-tracking-status [data-status="completed"]').click();
        expect(editor.field<HTMLInputElement>('[data-field="finished-date"]').value).toBe('');
        expect(await editor.modal.saveBeforeSourceRefresh()).toBe(true);
        expect(editor.onSave).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed', finished: null }));
    });
    it('keeps Today as an explicit action instead of a completion side effect', async () => {
        const editor = openEditor({ compact: true, values: { status: 'completed', finished: 'unknown' } });
        editor.field<HTMLButtonElement>('[data-action="today-finished"]').click();
        const now = new Date(), today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        expect(await editor.modal.saveBeforeSourceRefresh()).toBe(true);
        expect(editor.onSave).toHaveBeenCalledWith(expect.objectContaining({ finished: today }));
    });
    it('accepts half-star clicks on a tenth scale and preserves invalid input for correction', async () => {
        const editor = openEditor({ compact: true, scale: { mode: 'custom', max: 10, step: 0.1, display: 'stars' } });
        const second = editor.field('[data-role="stars"] [data-rating="2"]');
        vi.spyOn(second, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 0, 20, 20));
        second.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1, clientX: 14 }));
        const input = editor.field<HTMLInputElement>('.lorebase-rating-tenths-input');
        expect(input.value).toBe('1.5');
        input.focus();
        expect(input.selectionStart).toBe(0); expect(input.selectionEnd).toBe(3);
        input.setSelectionRange(3, 3);
        input.click();
        expect(input.selectionStart).toBe(0); expect(input.selectionEnd).toBe(3);
        input.value = '7.45'; input.dispatchEvent(new Event('input')); input.blur();
        expect(input.value).toBe('7.45');
        expect(await editor.modal.saveBeforeSourceRefresh()).toBe(false);
        expect(editor.onSave).not.toHaveBeenCalled();
        input.value = '7,3'; input.dispatchEvent(new Event('input'));
        expect(await editor.modal.saveBeforeSourceRefresh()).toBe(true);
        expect(editor.onSave).toHaveBeenCalledWith(expect.objectContaining({ userRating: 7.3 }));
    });
    it('previews each rating step without saving the sample as a preference', () => {
        i18n.setLanguage('en');
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.ratingScale = { ...settings.ratingScale, mode: 'custom', max: 10, step: 0.1, display: 'number' };
        const saveSettings = vi.fn(async () => {});
        const context = { plugin: { settings, saveSettings, refreshViews: vi.fn() }, createSectionHeader: vi.fn() } as unknown as SettingsSectionContext;
        const root = document.body.createDiv();
        renderGeneralSettings(context, root);
        const slider = root.querySelector<HTMLInputElement>('.lorebase-rating-preview-input')!;
        const choices = root.querySelector('[aria-label="Score step"]')!;
        for (const [step, count] of [['1', 10], ['0.5', 19], ['0.1', 91]] as const) {
            Array.from(choices.querySelectorAll('button')).find(button => button.textContent === step)!.click();
            expect(slider.step).toBe(step);
            expect(root.querySelectorAll('.lorebase-rating-mark')).toHaveLength(count);
            expect(root.querySelectorAll('.lorebase-rating-mark.is-whole')).toHaveLength(10);
        }
        expect(root.querySelectorAll('.lorebase-rating-mark.is-half')).toHaveLength(9);
        expect(saveSettings).toHaveBeenCalledTimes(3);
        slider.value = '6.7';
        slider.dispatchEvent(new Event('input'));
        expect(root.querySelector('.lorebase-rating-sample')!.textContent).toContain('6.7');
        expect(slider.getAttribute('aria-valuetext')).toBe('6.7 / 10');
        slider.value = '6.8';
        slider.dispatchEvent(new Event('input'));
        expect(root.querySelector('.lorebase-rating-sample')!.textContent).toContain('6.8');
        expect(saveSettings).toHaveBeenCalledTimes(3);
    });

    it.each([
        ['en', 'Cherry Blossom', '3 · Blossom'],
        ['ru', 'Цветение сакуры', '3 · Цветение'],
        ['uk', 'Цвітіння сакури', '3 · Цвітіння'],
        ['zh-CN', '樱花盛开', '3 · 绽放'],
    ] as const)('localizes the preset preview and personal rating editor in %s', (language, name, title) => {
        i18n.setLanguage(language);
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.ratingScale.classicPreset = 'seasonal';
        settings.ratingScale.classicSeason = 'spring';
        const context = { plugin: { settings }, createSectionHeader: vi.fn() } as unknown as SettingsSectionContext;
        const root = document.body.createDiv();
        renderGeneralSettings(context, root);
        const pickers = root.querySelectorAll('.lorebase-rating-theme-picker button');
        expect(pickers[1].getAttribute('title')).toBe(name);
        const level = root.querySelectorAll<HTMLElement>('.lorebase-rating-theme-level')[2];
        expect(level.title).toBe(title);
        const editor = openEditor({ scale: settings.ratingScale, values: { userRating: 3 } });
        expect(editor.field('[data-role="stars"] [data-rating="3"]').title).toBe(title);
        expect(editor.field('[data-role="stars"] [data-rating="3"]').textContent).toBe('🌷');
        editor.modal.close();
    });

    it('keeps one compact preview while applying the preset to every media', async () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        const saveSettings = vi.fn(async () => {});
        const refreshViews = vi.fn();
        const context = { plugin: { settings, saveSettings, refreshViews }, createSectionHeader: vi.fn() } as unknown as SettingsSectionContext;
        const root = document.body.createDiv();
        renderGeneralSettings(context, root);
        const choose = (label: string, value: string) => {
            const button = root.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
            vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 140, 30));
            button.click();
            const option = Array.from(document.querySelectorAll<HTMLElement>('.lorebase-settings-dropdown-panel.is-open [role="option"]'))
                .find(option => option.textContent === value)!;
            expect(option).toBeDefined();
            option.click();
        };
        const preview = root.querySelector<HTMLElement>('.lorebase-rating-theme-preview')!;
        expect(preview.hidden).toBe(true);

        choose('Preset', 'Themed');
        expect(settings.ratingScale.classicPreset).toBe('themed');
        expect(preview.hidden).toBe(false);
        expect(preview.querySelectorAll('.lorebase-rating-theme-level')).toHaveLength(5);
        expect(preview.textContent).toContain('😴2');
        const media = preview.querySelector<HTMLButtonElement>('[aria-label="Preview media"]')!;
        vi.spyOn(media, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 140, 30));
        media.click();
        const books = Array.from(document.querySelectorAll<HTMLElement>('.lorebase-settings-dropdown-panel.is-open [role="option"]'))
            .find(option => option.textContent === 'Books')!;
        books.click();
        expect(preview.dataset.media).toBe('book');
        expect(preview.textContent).toContain('🍵3');
        expect(settings.ratingScale.classicPreset).toBe('themed');
        expect(saveSettings).toHaveBeenCalledTimes(1);
        const editor = openEditor({ scale: settings.ratingScale, values: { userRating: 4 } });
        const fourth = editor.field('[data-role="stars"] [data-rating="4"]');
        expect(fourth.textContent).toBe('🔥');
        expect(fourth.title).toBe('4 · Great');
        expect(fourth.style.getPropertyValue('--lorebase-rating-color')).toBe('#75c7a5');
        expect(fourth.getAttribute('aria-pressed')).toBe('true');
        editor.modal.close();

        choose('Preset', 'Seasonal');
        expect(settings.ratingScale.classicPreset).toBe('seasonal');
        expect(preview.querySelector<HTMLElement>('.lorebase-rating-theme-picker')!.hidden).toBe(true);
        choose('Season', 'Winter');
        expect(settings.ratingScale.classicSeason).toBe('winter');
        expect(preview.textContent).toContain('🎄5');
        const winter = openEditor({ scale: settings.ratingScale, values: { userRating: 4 } });
        expect(winter.field('[data-role="stars"] [data-rating="4"]').textContent).toBe('☃️');
        winter.modal.close();

        choose('Preset', 'Holiday');
        choose('Holiday', 'Halloween');
        expect(settings.ratingScale.classicHoliday).toBe('halloween');
        expect(preview.textContent).toContain('🎃5');
        const halloween = openEditor({ scale: settings.ratingScale, values: { userRating: 4 } });
        expect(halloween.field('[data-role="stars"] [data-rating="4"]').title).toBe('4 · Horror');
        halloween.modal.close();

        choose('Preset', 'Seasonal');
        expect(preview.textContent).toContain('🎄5');
        expect(root.querySelector<HTMLButtonElement>('[aria-label="Season"]')!.textContent).toBe('Winter');
        choose('Preset', 'Standard');
        expect(settings.ratingScale.classicPreset).toBe('standard');
        expect(preview.hidden).toBe(true);
        await vi.waitFor(() => expect(refreshViews).toHaveBeenCalledTimes(7));
        expect(saveSettings).toHaveBeenCalledTimes(7);
    });

    it('saves the opt-in and opens either game layout through the same modal', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        const saveSettings = vi.fn(async () => settings.updatedEditor);
        const context = { plugin: { settings, saveSettings }, createSectionHeader: vi.fn() } as unknown as SettingsSectionContext;
        const root = document.body.createDiv();
        renderGeneralSettings(context, root);
        const editorSwitches = root.querySelectorAll<HTMLButtonElement>('[role="switch"][aria-label*="editor"]');
        expect(editorSwitches).toHaveLength(1);
        const toggle = editorSwitches[0];
        expect(toggle.getAttribute('aria-label')).toBe('Updated editor');
        expect(toggle.getAttribute('aria-checked')).toBe('false');
        const classic = openEditor({ compact: settings.updatedEditor });
        expect(classic.field('input.lorebase-game-progress-number')).not.toBeNull();
        expect(classic.field('[data-role="cover-work-type"]')).toBeNull();
        classic.modal.close();

        toggle.click();
        expect(settings.updatedEditor).toBe(true);
        expect(toggle.getAttribute('aria-checked')).toBe('true');
        const compact = openEditor({ compact: settings.updatedEditor, values: { countries: ['UA'] } });
        expect(compact.field('[role="slider"]')).not.toBeNull();
        expect(compact.field('[data-role="cover-work-type"] button')).not.toBeNull();
        expect(compact.field('[data-component="PosterCard"] [data-field="title"]')).not.toBeNull();
        expect(compact.field('[data-component="PosterCard"] [data-field="year"]')).not.toBeNull();
        expect(compact.field('[data-component="AdvancedPanel"] [data-field="series"]')).not.toBeNull();
        expect(compact.field('[data-role="personal-game-tracking"]').nextElementSibling).toBe(compact.field('[data-component="NotesEditor"]'));
        expect(compact.field('[data-component="PosterCard"] [data-action="toggle-notes"]')).not.toBeNull();
        expect(compact.field('.lorebase-country-chip strong').textContent).toBe('UA');
        expect(compact.field('.lorebase-editmode-advanced [data-role="ts-added"]')).not.toBeNull();
        expect(compact.field('[data-component="NotesEditor"]').dataset.mobilePane).toBe('general');
        compact.modal.close();

        toggle.click();
        expect(settings.updatedEditor).toBe(false);
        expect(saveSettings).toHaveBeenCalledTimes(2);
    });

    it('opens the center notes from the poster and focuses the title from its pencil', async () => {
        const { modal, field } = openEditor({ compact: true });
        const button = field('[data-component="PosterCard"] [data-action="toggle-notes"]');
        const panel = field('[data-component="NotesEditor"]');
        expect(panel.classList.contains('is-collapsed')).toBe(true);
        button.click();
        expect(button.getAttribute('aria-expanded')).toBe('true');
        expect(panel.classList.contains('is-collapsed')).toBe(false);
        await vi.waitFor(() => expect(document.activeElement).toBe(field('.lorebase-notes-reader-content')));
        button.click();
        expect(panel.classList.contains('is-collapsed')).toBe(true);
        field('[data-action="edit-cover-title"]').click();
        expect(document.activeElement).toBe(field('[data-field="title"]'));
        modal.close();
    });

    it('keeps empty progress distinct from zero and saves manual ring edits', async () => {
        const { modal, field, onSave } = openEditor({ compact: true, values: { progressPercent: null } });
        const slider = field('[role="slider"]');
        expect(field<HTMLOutputElement>('output').value).toBe('—');
        slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
        expect(slider.getAttribute('aria-valuetext')).toBe('0%');
        const context = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
        slider.dispatchEvent(context);
        expect(context.defaultPrevented).toBe(true);
        expect(slider.getAttribute('aria-valuetext')).toBe('—');
        slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        const entry = field<HTMLInputElement>('.lorebase-game-ring-input');
        expect(entry.hidden).toBe(false);
        entry.value = '100';
        entry.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(entry.hidden).toBe(true);
        expect(field<HTMLOutputElement>('output').value).toBe('100%');
        expect(await modal.saveBeforeSourceRefresh()).toBe(true);
        expect(onSave.mock.calls[0][0].progressPercent).toBe(100);

        const reset = openEditor({ compact: true, values: { progressPercent: 58 } });
        reset.field('[role="slider"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
        await reset.modal.saveBeforeSourceRefresh();
        expect(reset.onSave.mock.calls[0][0].progressPercent).toBeNull();
    });

    it('edits progress along the ring without wrapping when a drag crosses the top', async () => {
        const { modal, field, onSave } = openEditor({ compact: true, values: { progressPercent: 58 } });
        const ring = field('[role="slider"]');
        vi.spyOn(ring, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 80, 80));
        const capture = vi.fn();
        Object.defineProperty(ring, 'setPointerCapture', { value: capture });
        const pointer = (type: string, percent: number): void => {
            const angle = percent / 100 * 2 * Math.PI;
            ring.dispatchEvent(new PointerEvent(type, { pointerId: 1, button: 0, clientX: 40 + 34 * Math.sin(angle), clientY: 40 - 34 * Math.cos(angle) }));
        };
        pointer('pointerdown', 25);
        expect(ring.getAttribute('aria-valuenow')).toBe('25');
        pointer('pointerup', 25);
        pointer('pointerdown', 97);
        pointer('pointermove', 2);
        expect(ring.getAttribute('aria-valuenow')).toBe('100');
        pointer('pointermove', 99);
        expect(ring.getAttribute('aria-valuenow')).toBe('99');
        pointer('pointerup', 99);
        pointer('pointermove', 75);
        expect(ring.getAttribute('aria-valuenow')).toBe('99');
        expect(capture).toHaveBeenCalledWith(1);
        await modal.saveBeforeSourceRefresh();
        expect(onSave.mock.calls[0][0].progressPercent).toBe(99);
    });

    it('keeps saved progress on a partial Steam response and discards ring edits on cancel', async () => {
        const fixture = { compact: true, values: { progressPercent: 58, achievementsTotal: 20 }, refresh: vi.fn(async () => ({ playtimeMinutes: 42, partial: true })) };
        const { modal, field, onSave } = openEditor(fixture);
        field('.lorebase-game-steam-refresh').click();
        await vi.waitFor(() => expect(field('.lorebase-game-steam-refresh').disabled).toBe(false));
        expect(field<HTMLOutputElement>('output').value).toBe('58%');
        expect(field('.is-time .lorebase-game-stat-value').textContent).toBe('0 h 42 min');
        expect(field('.is-achievements .lorebase-game-stat-value').textContent).toBe('—/20');
        expect(field('.lorebase-game-steam-refresh').dataset.state).toBe('partial');
        expect(field('.lorebase-game-tracking-status').classList.contains('is-steam-feedback')).toBe(true);
        expect(field('.lorebase-game-apply-progress').hidden).toBe(true);
        await modal.saveBeforeSourceRefresh();
        expect(onSave.mock.calls[0][0]).toHaveProperty('playtimeMinutes', 42);
        expect(onSave.mock.calls[0][0]).not.toHaveProperty('achievementsTotal');
        expect(onSave.mock.calls[0][0]).not.toHaveProperty('progressPercent');

        const cancelled = openEditor(fixture);
        cancelled.field('[role="slider"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
        cancelled.field('[data-action="discard"]').click();
        expect(cancelled.onSave).not.toHaveBeenCalled();
        expect(cancelled.game.progressPercent).toBe(58);
    });

    it('applies the rounded achievement estimate to the ring only on request', async () => {
        const refresh = vi.fn(async () => ({ achievementsUnlocked: 44, achievementsTotal: 57, partial: true }));
        const { modal, field, onSave } = openEditor({ compact: true, refresh, values: {
            progressPercent: 58, achievementsUnlocked: 33, achievementsTotal: 57,
        } });
        const ring = field('[role="slider"]');
        const apply = field('.lorebase-game-apply-progress');
        expect(apply.textContent).toBe('≈ 58%');
        expect(apply.previousElementSibling).toBe(field('.is-achievements .lorebase-game-stat-value'));
        expect(apply.hidden).toBe(true);
        field('.lorebase-game-steam-refresh').click();
        await vi.waitFor(() => expect(apply.textContent).toBe('≈ 77%'));
        expect(apply.hidden).toBe(false);
        expect(ring.getAttribute('aria-valuenow')).toBe('58');
        apply.click();
        expect(ring.getAttribute('aria-valuenow')).toBe('77');
        expect(apply.hidden).toBe(true);
        expect(document.activeElement).toBe(ring);
        ring.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
        expect(apply.hidden).toBe(false);
        ring.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
        expect(apply.hidden).toBe(true);
        expect(field<HTMLDetailsElement>('details.is-achievements').open).toBe(false);
        await modal.saveBeforeSourceRefresh();
        expect(onSave.mock.calls[0][0]).toMatchObject({ progressPercent: 77, achievementsUnlocked: 44, achievementsTotal: 57 });
    });

    it('shows stats in collapsed cards and opens invalid fields on save', async () => {
        const { modal, field, onSave } = openEditor({ compact: true, values: { playtimeMinutes: 10807, achievementsUnlocked: 33, achievementsTotal: 57, gameModes: ['solo'] } });
        const time = field<HTMLDetailsElement>('details.is-time');
        const achievements = field<HTMLDetailsElement>('details.is-achievements');
        expect(time.open).toBe(false);
        expect(achievements.open).toBe(false);
        expect(time.querySelector('strong')?.textContent).toBe('180 h 7 min');
        expect(achievements.querySelector('strong')?.textContent).toBe('33/57');
        const hours = time.querySelector<HTMLInputElement>('input')!;
        time.open = true;
        hours.value = '181';
        hours.dispatchEvent(new Event('input'));
        expect(time.querySelector('strong')?.textContent).toBe('181 h 7 min');
        const unlocked = achievements.querySelector<HTMLInputElement>('input')!;
        unlocked.value = '0';
        unlocked.dispatchEvent(new Event('input'));
        expect(field('.lorebase-game-apply-progress').hidden).toBe(false);
        expect(field('.lorebase-game-apply-progress').textContent).toContain('0%');
        field('[role="slider"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
        expect(field('.lorebase-game-apply-progress').hidden).toBe(true);
        field('[role="slider"]').dispatchEvent(new MouseEvent('contextmenu'));
        expect(field('.lorebase-game-apply-progress').hidden).toBe(false);
        unlocked.value = '58';
        unlocked.dispatchEvent(new Event('input'));
        expect(field('.lorebase-game-apply-progress').hidden).toBe(true);
        expect(await modal.saveBeforeSourceRefresh()).toBe(false);
        expect(achievements.open).toBe(true);
        unlocked.value = '57';
        unlocked.dispatchEvent(new Event('input'));
        expect(achievements.querySelector('strong')?.textContent).toBe('57/57');
        const mode = field('[data-mode="coop"]');
        mode.click();
        expect(mode.getAttribute('aria-pressed')).toBe('true');
        expect(await modal.saveBeforeSourceRefresh()).toBe(true);
        expect(onSave.mock.calls[0][0]).toMatchObject({ playtimeMinutes: 10867, achievementsUnlocked: 57, gameModes: ['solo', 'coop'] });
    });

    it('manages platforms in progress and retains unselected replay history', async () => {
        const { modal, field, onSave } = openEditor({ compact: true, values: {
            repeatCount: 3, platformPlaythroughs: [{ platform: 'Windows', repeatCount: 3, selected: true }],
        } });
        expect(field('.lorebase-editmode-advanced [data-role="platform-chips"]')).toBeNull();
        expect(field('[data-role="compact-played-platforms"] [data-field="new-platform"]')).not.toBeNull();
        expect(field('.lorebase-played-hint').textContent).toBe('Click the counter to log replays');
        const counter = field<HTMLInputElement>('.lorebase-played-row input');
        expect(counter.value).toBe('3');
        counter.value = '4';
        counter.dispatchEvent(new Event('input'));
        const windows = '[data-played-platform="windows"]';
        field('.lorebase-played-toggle').click();
        const search = field<HTMLInputElement>('[data-field="new-platform"]');
        search.value = 'ps5';
        search.dispatchEvent(new Event('input'));
        expect(field('[data-platform-name="windows"]').hidden).toBe(true);
        search.value = '';
        search.dispatchEvent(new Event('input'));
        field(windows).click();
        expect(field('.lorebase-played-row input')).toBeNull();
        field(windows).click();
        expect(field<HTMLInputElement>('.lorebase-played-row input').value).toBe('4');
        field(windows).click();
        await modal.saveBeforeSourceRefresh();
        expect(onSave.mock.calls[0][0].platformPlaythroughs).toEqual([{ platform: 'Windows', repeatCount: 4, selected: false }]);
        expect(onSave.mock.calls[0][0].repeatCount).toBe(0);
    });

    it('creates a tag in its inline badge, cancels with Escape and commits a pending tag on save', async () => {
        const { modal, field, onSave } = openEditor({ compact: true, values: { tags: ['existing'], genres: ['rpg'] } });
        const composer = field('[data-role="tag-composer"]');
        const toggle = field('[data-action="toggle-tag-input"]');
        const input = field<HTMLInputElement>('[data-field="new-tag"]');
        expect(composer.hidden).toBe(true);
        toggle.click();
        expect(composer.parentElement).toBe(field('[data-role="tag-chips"]'));
        expect(composer.hidden).toBe(false);
        input.value = 'discarded';
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(composer.hidden).toBe(true);
        toggle.click();
        input.value = 'new-tag';
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(composer.parentElement?.textContent).toContain('#new-tag');
        toggle.click();
        input.value = 'pending';
        field('[data-chip-kind="genres"]').click();
        expect(composer.parentElement?.textContent).toContain('rpg');
        expect(composer.parentElement?.textContent).not.toContain('#existing');
        toggle.click();
        input.value = 'Adventure';
        await modal.saveBeforeSourceRefresh();
        expect(onSave.mock.calls[0][0].tags).toEqual(['existing', 'new-tag', 'pending']);
        expect(onSave.mock.calls[0][0].genres).toEqual(['rpg', 'adventure']);
    });

    it.each([{ max: 5, step: 1, score: 4 }, { max: 10, step: 0.5, score: 8.5 }] as const)('edits DLC using a $max-point scale with step $step', async ({ max, step, score }) => {
        const { modal, field, onSave } = openEditor({ compact: true, scale: { mode: 'custom', max, step, display: 'number' }, values: {
            dlc: [1, 2, 3, 4, 5].map(id => ({ id: String(id), title: `Example DLC ${id}`, provider: 'steam', userRating: id === 2 ? 3 : null })),
        } });
        const rowCount = () => modal.contentEl.querySelectorAll('.lorebase-game-dlc-score').length;
        expect(rowCount()).toBe(4);
        field('.lorebase-editmode-dlc-toggle').click();
        expect(rowCount()).toBe(5);
        const [first, second] = Array.from(modal.contentEl.querySelectorAll<HTMLInputElement>('.lorebase-game-dlc-score input'));
        second.closest('.lorebase-game-dlc-score')?.querySelector<HTMLButtonElement>('button:last-child')?.click();
        expect(second.value).toBe(String(3 + step));
        first.value = String(max + 1);
        first.dispatchEvent(new Event('input'));
        expect(await modal.saveBeforeSourceRefresh()).toBe(false);
        first.value = String(score).replace('.', ',');
        first.dispatchEvent(new Event('input'));
        second.value = '';
        second.dispatchEvent(new Event('input'));
        await modal.saveBeforeSourceRefresh();
        expect(onSave.mock.calls[0][0].dlc?.map(item => item.userRating)).toEqual([score, null, null, null, null]);
    });

    it.each(['standard', 'themed', 'seasonal', 'holiday'] as const)('keeps DLC ratings as stars with the %s preset and clears a repeated choice', async (classicPreset) => {
        const scale: RatingScaleSettings = { mode: 'classic', max: 5, step: 1, display: 'number', classicPreset };
        const { modal, field, onSave } = openEditor({ compact: true, scale, values: {
            dlc: [{ id: '42', title: 'Example DLC', provider: 'steam', userRating: 3 }],
        } });
        expect(field('.lorebase-game-dlc-score')).toBeNull();
        const stars = modal.contentEl.querySelectorAll<HTMLButtonElement>('.lorebase-editmode-dlc-star');
        expect(stars).toHaveLength(5);
        expect([...stars].every(star => star.textContent === '★' && !star.classList.contains('is-themed-rating'))).toBe(true);
        expect(scale.classicPreset).toBe(classicPreset);
        const mainStar = field('[data-role="stars"] [data-rating="4"]');
        expect(mainStar.textContent).toBe(({ standard: '★', themed: '🔥', seasonal: '🌸', holiday: '🎄' } as const)[classicPreset]);
        stars[2].click();
        expect(stars[2].classList.contains('is-active')).toBe(false);
        stars[3].click();
        expect(stars[3].classList.contains('is-active')).toBe(true);
        await modal.saveBeforeSourceRefresh();
        expect(onSave.mock.calls[0][0].dlc?.[0].userRating).toBe(4);
    });

    it('keeps selected links across media filters and separates incoming links', async () => {
        const game: RelatedMediaLink = { path: 'Games/Next.md', type: 'game', title: 'Next' };
        const anime: RelatedMediaLink = { path: 'Anime/Next.md', type: 'anime', title: 'Next Anime' };
        const incoming: RelatedMediaLink = { path: 'Anime/Incoming.md', type: 'anime', title: 'Incoming title' };
        vi.spyOn(Modal.prototype, 'open').mockImplementation(function (this: Modal & { onOpen(): void; onClose(): void }) { mount(this); });
        const { modal, field, onSave } = openEditor({ compact: true, candidates: [game, anime], incoming: [incoming] });
        field('[data-action="add-related"]').click();
        const picker = document.querySelector('.lorebase-compact-related-picker')!;
        expect(picker.querySelector('.lorebase-add-workspace')).not.toBeNull();
        expect(picker.querySelectorAll('.lorebase-select-search-grid .lorebase-select-card')).toHaveLength(2);
        expect(picker.querySelector('.lorebase-related-picker-filter.is-game [aria-hidden="true"]')).not.toBeNull();
        expect(picker.querySelector('.lorebase-related-picker-card-type')?.textContent).toBe('Games');
        const add = picker.querySelector<HTMLButtonElement>('.lorebase-related-picker-actions .lorebase-flow-btn-primary')!;
        expect(add.disabled).toBe(true);
        const pick = (path: string) => picker.querySelector<HTMLButtonElement>(`button[title="${path}"]`)!;
        const filter = (text: string) => Array.from(picker.querySelectorAll<HTMLButtonElement>('.lorebase-related-picker-filter')).find(node => node.textContent === text)!;
        pick(game.path).click();
        expect(pick(game.path).classList.contains('is-picked')).toBe(true);
        expect(add.disabled).toBe(false);
        filter('Anime').click();
        expect(pick(game.path)).toBeNull();
        pick(anime.path).click();
        filter('All').click();
        expect(pick(game.path).getAttribute('aria-pressed')).toBe('true');
        add.click();
        expect(field('.is-readonly .lorebase-game-related-meta').textContent).toContain('Incoming');
        await modal.saveBeforeSourceRefresh();
        expect(onSave.mock.calls[0][0].relatedMedia?.map(item => item.path)).toEqual([game.path, anime.path]);
    });
});
