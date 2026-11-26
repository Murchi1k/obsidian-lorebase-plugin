// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MultiSelectSearchModal } from '../src/modals/IntegrationModals';
import { MusicSearchModal } from '../src/modals/MusicSearchModal';
import { AniListImportReviewModal } from '../src/modals/AniListImportReviewModal';
import { AniListLinkModal } from '../src/modals/AniListLinkModal';
import { SteamSyncReviewModal } from '../src/modals/SteamSyncReviewModal';
import { SteamSyncProgressModal } from '../src/modals/SteamSyncProgressModal';
import { waitForInlinePreview } from '../src/modals/inlineSync';
import * as imageStorage from '../src/services/integrations/imageStorage';
import { AnimeCountriesEditor } from '../src/components/AnimeCountriesEditor';
import { MangaWorkTypesEditor } from '../src/components/MangaWorkTypesEditor';
import { configureMediaWorkTypes, getMediaWorkTypeColor } from '../src/utils/mediaWorkType';
import { DEFAULT_SETTINGS } from '../src/constants';
import { t, i18n } from '../src/localization';
import { mt } from '../src/localization/music';
import { inboxText } from '../src/localization/inbox';
import { createMockApp } from './helpers/testHelpers';

beforeAll(() => {
    Object.assign(HTMLElement.prototype, {
        empty() { this.replaceChildren(); },
        addClass(...names: string[]) { this.classList.add(...names); },
        removeClass(...names: string[]) { this.classList.remove(...names); },
        hasClass(name: string) { return this.classList.contains(name); },
        toggleClass(name: string, value: boolean) { this.classList.toggle(name, value); },
        setAttr(name: string, value: string) { this.setAttribute(name, value); },
        setText(value: string) { this.textContent = value; },
        setCssStyles(styles: object) { Object.assign(this.style, styles); },
        createEl(tag: string, options: any = {}) {
            const element = document.createElement(tag);
            if (options.cls) element.className = options.cls;
            if (options.text) element.textContent = options.text;
            for (const [key, value] of Object.entries(options.attr ?? {})) element.setAttribute(key, String(value));
            if (options.type) element.setAttribute('type', options.type);
            this.appendChild(element);
            return element;
        },
        createDiv(options: any) { return this.createEl('div', options); },
        createSpan(options: any) { return this.createEl('span', options); },
        getBoundingClientRect() { return { left: 20, top: 20, right: 180, bottom: 60, width: 160, height: 40 }; },
        getClientRects() {
            if (!this.isConnected) return [];
            for (let node: HTMLElement | null = this; node; node = node.parentElement) if (node.hidden || getComputedStyle(node).display === 'none') return [];
            return [this.getBoundingClientRect()];
        },
    });
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 1000 });
    Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, value: 800 });
    i18n.setLanguage('ru');
});
afterEach(() => document.body.replaceChildren());

function fixture(options: Record<string, unknown> = {}, handler = vi.fn(async () => [
    { id: '1', provider: 'igdb', title: 'A very long game title', year: '2020', workType: 'Game', workTypeMedia: 'game' },
    { id: '2', provider: 'igdb', title: 'Another title', year: '2021', workType: 'Visual Novel', workTypeMedia: 'game' },
])) {
    const modal = new MultiSelectSearchModal(createMockApp({}), handler as any, {
        titleText: 'Добавить игру', placeholder: 'Название', emptyText: 'Нет результатов', doneText: 'Добавить', cancelText: 'Отмена',
        providerOptions: [{ id: 'igdb', label: 'IGDB' }], initialProviderId: 'igdb', initialQuery: 'Game',
        manualKind: 'games', mediaKind: 'games', manualActionText: 'Создать вручную', ...options,
    } as any) as any;
    modal.modalEl = document.body.createDiv();
    modal.contentEl = modal.modalEl.createDiv();
    modal.close = vi.fn(() => modal.onClose());
    modal.onOpen();
    return { modal, root: modal.contentEl as HTMLElement, handler };
}

function field(root: HTMLElement, label: string): HTMLInputElement {
    return Array.from(root.querySelectorAll('input')).find(element => element.getAttribute('aria-label') === label)
        ?? Array.from(root.querySelectorAll('label')).find(element => element.textContent === label)!.querySelector('input')!;
}

describe('unified add dialog', () => {
    it('confirms the original selection without a discovery field or extra search',()=>{
        const handler=vi.fn(async()=>[]),f=fixture({},handler as any);
        expect(f.root.querySelector('.lorebase-discovery-add-input')).toBeNull();
        const selected={id:'1',provider:'igdb',title:'Example'};f.modal.selected.set('igdb:1',selected);f.modal.renderReviewView();
        expect(f.root.querySelector('.lorebase-discovery-add-input')).toBeNull();
        expect(handler).not.toHaveBeenCalled();
        const resolve=vi.fn();f.modal.resolve=resolve;f.modal.confirmSelection();
        expect(resolve).toHaveBeenCalledWith([selected]);expect(selected).not.toHaveProperty('discovery');
    });

    const chooseMangaType = (root: HTMLElement, label: string): void => {
        root.querySelector<HTMLButtonElement>('.lorebase-select-manga-type button')!.click();
        const option = Array.from(document.querySelectorAll<HTMLElement>('.lorebase-settings-dropdown-panel.is-open [role="option"]'))
            .find(element => element.textContent === label)!;
        option.click();
    };
    it('puts the Comics type filter next to the manga search field', async () => {
        const handler = vi.fn(async () => [{ id: '1', provider: 'comicvine', title: 'Batman', workType: 'Comics', workTypeMedia: 'manga' }]);
        const { root, modal } = fixture({ mediaKind: 'manga', manualKind: 'manga',
            providerOptions: [{ id: 'comicvine', label: 'Comic Vine' }], initialProviderId: 'comicvine' }, handler as any);
        expect(root.querySelector('.lorebase-select-search-wrap > .lorebase-select-manga-type')).not.toBeNull();
        expect(root.querySelector('.lorebase-select-search-options .lorebase-select-manga-type')).toBeNull();
        await modal.runSearch();
        chooseMangaType(root, 'Комиксы');
        expect(root.querySelector('.lorebase-select-card')?.getAttribute('title')).toBe('Batman');
        modal.onClose();
    });
    it.each(['anilist', 'shikimori', 'mangaupdates', 'mangadex'])('filters %s manga search cards while preserving selections and keyboard indices', async provider => {
        const handler = vi.fn(async () => [
            { id: 'manga', provider, title: 'Japanese manga', workType: 'Manga', workTypeMedia: 'manga' },
            { id: 'manhwa', provider, title: 'Korean manhwa', workType: 'Manhwa', workTypeMedia: 'manga' },
            { id: 'manhua', provider, title: 'Chinese manhua', workType: 'Manhua', workTypeMedia: 'manga' },
        ]);
        const { root, modal } = fixture({ mediaKind: 'manga', manualKind: 'manga',
            initialProviderId: provider, providerOptions: [{ id: provider, label: provider }] }, handler as any);
        await modal.runSearch();
        expect(root.querySelectorAll('.lorebase-select-card')).toHaveLength(3);
        chooseMangaType(root, 'Манхва');
        expect(root.querySelectorAll('.lorebase-select-card')).toHaveLength(1);
        expect(root.querySelector('.lorebase-select-card')?.getAttribute('title')).toBe('Korean manhwa');
        modal.modalEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect([...modal.selected.values()].map((item: any) => item.id)).toEqual(['manhwa']);
        chooseMangaType(root, 'Маньхуа');
        root.querySelector<HTMLButtonElement>('.lorebase-select-card')!.click();
        chooseMangaType(root, 'Все типы');
        expect(root.querySelectorAll('.lorebase-select-card')).toHaveLength(3);
        expect(root.querySelectorAll('.lorebase-select-card[aria-pressed="true"]')).toHaveLength(2);
        expect(handler).toHaveBeenCalledOnce();
        modal.onClose();
    });
    it('keeps manga pagination available when the selected type is absent from a source page', async () => {
        const handler = vi.fn(async (_query: string, provider: string, options: { page: number }) => Object.assign([
            options.page === 1
                ? { id: '1', provider, title: 'Manga page', workType: 'Manga', workTypeMedia: 'manga' }
                : { id: '2', provider, title: 'Manhua page', workType: 'Manhua', workTypeMedia: 'manga' },
        ], { hasNext: options.page === 1 }));
        const { root, modal } = fixture({ mediaKind: 'manga', manualKind: 'manga',
            initialProviderId: 'mangaupdates', providerOptions: [{ id: 'mangaupdates', label: 'MangaUpdates' }] }, handler as any);
        await modal.runSearch();
        chooseMangaType(root, 'Маньхуа');
        expect(root.querySelectorAll('.lorebase-select-card')).toHaveLength(0);
        expect(root.querySelector('.lorebase-select-type-hint')?.textContent).toContain('следующую страницу');
        root.querySelector<HTMLButtonElement>('[aria-label="' + t('promptNextPage') + '"]')!.click();
        await vi.waitFor(() => expect(root.querySelector('.lorebase-select-card')?.getAttribute('title')).toBe('Manhua page'));
        expect(root.querySelector('.lorebase-select-manga-type button')?.textContent).toBe('Маньхуа');
        root.querySelector<HTMLButtonElement>('[aria-label="' + t('promptPreviousPage') + '"]')!.click();
        await vi.waitFor(() => expect(root.querySelector('.lorebase-select-type-clear')).not.toBeNull());
        root.querySelector<HTMLButtonElement>('.lorebase-select-type-clear')!.click();
        expect(root.querySelector('.lorebase-select-card')?.getAttribute('title')).toBe('Manga page');
        expect(handler).toHaveBeenCalledTimes(3);
        modal.onClose();
    });
    it.each(['anime', 'manga'])('filters adult %s results and removes hidden selections when switched off', async kind => {
        const handler = vi.fn(async () => Object.assign([
            { id: 'safe', provider: 'anilist', title: 'Safe entry', isAdult: false },
            { id: 'adult', provider: 'anilist', title: 'Adult entry', isAdult: true },
        ], { hasNext: true }));
        const { root, modal } = fixture({ mediaKind: kind, manualKind: kind, initialProviderId: 'anilist', providerOptions: [{ id: 'anilist', label: 'AniList' }, { id: 'shikimori', label: 'Shikimori' }] }, handler as any);
        const toggle = () => root.querySelector<HTMLButtonElement>('.lorebase-select-adult-toggle')!;
        expect(toggle().getAttribute('aria-pressed')).toBe('false');
        await modal.runSearch();
        expect(modal.items.map((item: any) => item.id)).toEqual(['safe']);
        expect(modal.hasNextPage).toBe(true);
        toggle().click();
        await vi.waitFor(() => expect(modal.items).toHaveLength(2));
        expect(toggle().getAttribute('aria-pressed')).toBe('true');
        root.querySelector<HTMLButtonElement>('.lorebase-select-card[title="Adult entry"]')!.click();
        root.querySelector<HTMLButtonElement>('.lorebase-select-card[title="Safe entry"]')!.click();
        expect(modal.selected.size).toBe(2);
        toggle().click();
        await vi.waitFor(() => expect(modal.items).toHaveLength(1));
        expect([...modal.selected.values()].map((item: any) => item.id)).toEqual(['safe']);
        expect(handler.mock.calls.at(-1)).toEqual(['Game', 'anilist', expect.objectContaining({ includeAdult: false, page: 1 })]);
        toggle().click();
        await vi.waitFor(() => expect(modal.items).toHaveLength(2));
        Array.from(root.querySelectorAll<HTMLButtonElement>('.lorebase-select-provider-chip')).find(button => button.textContent === 'Shikimori')!.click();
        expect(toggle().getAttribute('aria-pressed')).toBe('true');
        await modal.runSearch();
        expect(handler.mock.calls.at(-1)).toEqual(['Game', 'shikimori', expect.objectContaining({ includeAdult: true })]);
        modal.onClose();
    });
    it('ignores an adult-enabled search that finishes after the toggle is switched off', async () => {
        let finish!: (items: any[]) => void;
        const handler = vi.fn().mockResolvedValueOnce([]).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce([{ id: 'safe', title: 'Safe', isAdult: false }]);
        const { root, modal } = fixture({ mediaKind: 'anime', manualKind: 'anime' }, handler);
        await modal.runSearch();
        const old = modal.changeAdultFilter();
        await modal.changeAdultFilter();
        finish([{ id: 'adult', title: 'Adult', isAdult: true }]);
        await old;
        expect(modal.items.map((item: any) => item.id)).toEqual(['safe']);
        expect(root.querySelector('.lorebase-select-adult-toggle')?.getAttribute('aria-pressed')).toBe('false');
        modal.onClose();
    });
    it('does not show the adult toggle for games', () => {
        const { root, modal } = fixture();
        expect(root.querySelector('.lorebase-select-adult-toggle')).toBeNull();
        modal.onClose();
    });

    it('refreshes a low resolution manga cover even when its publication state is already known', async () => {
        let finish!: () => void;
        const resolver = vi.fn(async (item: any) => {
            await new Promise<void>(resolve => { finish = resolve; });
            item.image = 'https://uploads.mangadex.org/covers/exact/original.jpg';
            return 'completed';
        });
        const handler = vi.fn(async () => [{ id: 'poster', title: 'Manga', provider: 'mangaupdates', publicationStatus: 'completed', image: 'https://cdn.mangaupdates.com/image/small.jpg' }]);
        const { root, modal } = fixture({ mediaKind: 'manga', manualKind: 'manga', publicationStatusResolver: resolver }, handler as any);
        const render = vi.spyOn(modal, 'setPreviewBackground').mockImplementation(() => undefined);
        await modal.runSearch();
        await vi.waitFor(() => expect(resolver).toHaveBeenCalledOnce());
        expect(root.querySelectorAll('.lorebase-select-card')).toHaveLength(1);
        finish();
        await vi.waitFor(() => expect(render).toHaveBeenLastCalledWith(expect.anything(), 'https://uploads.mangadex.org/covers/exact/original.jpg', expect.anything()));
        modal.items = [{ ...modal.items[0], image: 'https://cdn.mangaupdates.com/image/small.jpg' }];
        modal.renderGrid();
        await vi.waitFor(() => expect(modal.items[0].image).toBe('https://uploads.mangadex.org/covers/exact/original.jpg'));
        expect(resolver).toHaveBeenCalledOnce();
        modal.onClose();
    });
    it('loads optional publication states without delaying selection and shares them with the preview', async () => {
        let finish!: (status: string) => void;
        const resolver = vi.fn().mockImplementationOnce(() => new Promise<string>(resolve => { finish = resolve; })).mockResolvedValue('ongoing');
        const { root, modal } = fixture({ manualKind: 'manga', mediaKind: 'manga', publicationStatusResolver: resolver });
        await modal.runSearch();
        await vi.waitFor(() => expect(resolver).toHaveBeenCalledTimes(1));
        root.querySelector<HTMLButtonElement>('.lorebase-select-card')!.click();
        root.querySelector<HTMLButtonElement>('.lorebase-flow-btn-primary')!.click();
        expect(root.querySelector('.lorebase-select-review-gallery')).not.toBeNull();
        finish('completed');
        await vi.waitFor(() => expect(root.querySelector('.lorebase-select-publication-status[data-status="completed"]')?.textContent).toBe('Завершено'));
        expect(root.querySelectorAll('.lorebase-select-publication-status')).toHaveLength(1);
        root.querySelector<HTMLButtonElement>('.lorebase-flow-btn-secondary')!.click();
        await vi.waitFor(() => expect(root.querySelectorAll('.lorebase-select-publication-status')).toHaveLength(2));
        expect(resolver).toHaveBeenCalledTimes(2);
        modal.onClose();
    });
    it('collapses tracking without losing values and remembers its state when the season form is rebuilt', () => {
        const { root, modal } = fixture({ manualKind: 'anime', mediaKind: 'anime', providerOptions: [] });
        const tracking = () => root.querySelector<HTMLDetailsElement>('details.lorebase-manual-main-tracking')!;
        expect(tracking().open).toBe(false);
        expect(tracking().querySelector('summary')?.textContent).toBe(t('editTracking'));
        tracking().open = true;
        const date = field(root, t('editStarted')); date.value = '01.02.2026'; date.dispatchEvent(new Event('input'));
        tracking().querySelector<HTMLButtonElement>(`[aria-label="${t('editFavorite')}"]`)!.click();
        root.querySelector<HTMLButtonElement>('[data-action="add-part"]')!.click();
        expect(tracking().open).toBe(true);
        tracking().open = false;
        root.querySelector<HTMLButtonElement>('[role="tab"][aria-controls$="extra-panel"]')!.click();
        root.querySelector<HTMLButtonElement>('[role="tab"][aria-controls$="main-panel"]')!.click();
        expect(tracking().open).toBe(false);
        root.querySelector<HTMLButtonElement>('[data-action="add-part"]')!.click();
        expect(tracking().open).toBe(false);
        tracking().open = true;
        expect(field(root, t('editStarted')).value).toBe('01.02.2026');
        expect(tracking().querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('true');
        root.querySelector<HTMLButtonElement>('.lorebase-select-footer .lorebase-flow-btn-primary')!.click();
        expect(modal.getManualDraft()).toMatchObject({ started: '2026-02-01', favorite: true });
    });
    it.each(['games', 'anime', 'movies', 'series', 'books', 'manga'])('keeps %s manual creation focused and moves tracking to Main', kind => {
        const { root, modal } = fixture({ manualKind: kind, mediaKind: kind, providerOptions: [] });
        const main = root.querySelector<HTMLElement>('[role="tabpanel"][id$="main-panel"]')!;
        const extra = root.querySelector<HTMLElement>('[role="tabpanel"][id$="extra-panel"]')!;
        expect(field(main, t('editStarted'))).not.toBeNull();
        expect(field(main, t('editFinished'))).not.toBeNull();
        expect(main.querySelector(`[role="switch"][aria-label="${t('editFavorite')}"]`)).not.toBeNull();
        expect(extra.querySelector('.lorebase-manual-tracking-options')).toBeNull();
        expect(root.querySelector('.lorebase-detailed-rating')).toBeNull();
        expect(root.querySelector(`[aria-label="${t('templateFieldPosterHorizontal')}"]`)).toBeNull();
        expect(root.querySelector('[data-action="add-related"]')).toBeNull();
        expect(extra.querySelectorAll('textarea')).toHaveLength(1);
        expect(root.querySelectorAll('input[aria-label="' + t('editStarted') + '"]')).toHaveLength(1);
        modal.onClose();
    });
    it('adds each game platform once, marks played-on choices and removes them without resetting other fields', () => {
        const { root, modal } = fixture({ providerOptions: [] });
        const input = field(root, t('templateFieldPlatforms'));
        input.value = 'PC, PlayStation 5'; input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        input.value = 'pc'; input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(root.querySelectorAll('.lorebase-manual-platform')).toHaveLength(2);
        expect(root.querySelectorAll('.lorebase-editmode-platform-chips')).toHaveLength(0);
        root.querySelector<HTMLButtonElement>('[data-platform="PC"]')!.click();
        expect(root.querySelector('[data-platform="PC"]')?.getAttribute('aria-pressed')).toBe('true');
        root.querySelectorAll<HTMLButtonElement>('.lorebase-manual-platform-remove')[1].click();
        expect(root.querySelectorAll('.lorebase-manual-platform')).toHaveLength(1);
        const repeats = root.querySelector<HTMLInputElement>('.lorebase-manual-counter input')!;
        const plus = repeats.nextElementSibling as HTMLButtonElement;
        plus.click(); plus.click();
        expect(repeats.value).toBe('2');
        root.querySelector<HTMLButtonElement>('.lorebase-select-footer .lorebase-flow-btn-primary')!.click();
        expect(modal.getManualDraft()).toMatchObject({ title: 'Game', platforms: ['PC'], platformPlaythroughs: [{ platform: 'PC', selected: true, repeatCount: 0 }], repeatCount: 2 });
    });
    it('retains description and personal notes independently when changing modes and rebuilding the season form', () => {
        const { root, modal } = fixture({ manualKind: 'anime', mediaKind: 'anime', providerOptions: [] });
        const edit = (value: string) => { const input = root.querySelector<HTMLTextAreaElement>('.lorebase-manual-notes textarea')!; input.value = value; input.dispatchEvent(new Event('input')); };
        edit('A description');
        root.querySelector<HTMLButtonElement>('[data-note-mode="myNotes"]')!.click(); edit('My notes');
        root.querySelector<HTMLButtonElement>('[data-action="add-part"]')!.click();
        expect(root.querySelector<HTMLTextAreaElement>('.lorebase-manual-notes textarea')!.value).toBe('A description');
        root.querySelector<HTMLButtonElement>('[data-note-mode="myNotes"]')!.click();
        expect(root.querySelector<HTMLTextAreaElement>('.lorebase-manual-notes textarea')!.value).toBe('My notes');
        root.querySelector<HTMLButtonElement>('.lorebase-select-footer .lorebase-flow-btn-primary')!.click();
        expect(modal.getManualDraft()).toMatchObject({ description: 'A description', myNotes: 'My notes' });
    });
    it.each([
        ['games', 'templateFieldDevelopers', 'developers'], ['anime', 'templateFieldStudios', 'studios'],
        ['movies', 'templateFieldDirector', 'directors'], ['series', 'templateFieldActors', 'actors'],
        ['books', 'templateFieldAuthors', 'authors'], ['manga', 'templateFieldArtists', 'artists'],
    ] as const)('submits %s creator metadata, description, personal flags and calendar dates', (kind, key, property) => {
        const { modal, root } = fixture({ manualKind: kind, mediaKind: kind, providerOptions: [] });
        const enter = (label: string, value: string) => { const input = field(root, label); input.value = value; input.dispatchEvent(new Event('input')); };
        enter(t(key), 'First, Second');
        enter(t('templateFieldReleased'), '10.12.2025');
        enter(t('editStarted'), '02.01.2026');
        enter(t('editFinished'), '03.02.2026');
        const text = root.querySelector<HTMLTextAreaElement>(`textarea[aria-label="${t('editDescription')}"]`)!;
        text.value = 'Description\nwith lines'; text.dispatchEvent(new Event('input'));
        root.querySelector<HTMLButtonElement>(`[role="switch"][aria-label="${t('editFavorite')}"]`)!.click();
        const release = field(root, t('templateFieldReleased'));
        expect(release.type).toBe('text'); expect(release.getAttribute('aria-haspopup')).toBe('dialog');
        release.parentElement!.querySelector<HTMLButtonElement>('button')!.click();
        expect(document.querySelector('.lorebase-date-picker-popover')).not.toBeNull();
        root.querySelector<HTMLButtonElement>('[role="tab"]')!.click();
        expect(document.querySelector('.lorebase-date-picker-popover')).toBeNull();
        root.querySelector<HTMLButtonElement>('.lorebase-select-footer .lorebase-flow-btn-primary')!.click();
        expect(modal.getManualDraft()).toMatchObject({ [property]: ['First', 'Second'], description: 'Description\nwith lines', favorite: true,
            released: '2025-12-10', started: '2026-01-02', finished: '2026-02-03' });
    });
    it('blocks an invalid date and reveals its tab instead of discarding it', () => {
        const { modal, root } = fixture({ manualKind: 'manga', mediaKind: 'manga', providerOptions: [] });
        root.querySelector<HTMLButtonElement>('[role="tab"][aria-controls$="extra-panel"]')!.click();
        const date = field(root, t('editStarted')); date.value = '31.02.2026'; date.dispatchEvent(new Event('input'));
        root.querySelector<HTMLButtonElement>('.lorebase-select-footer .lorebase-flow-btn-primary')!.click();
        expect(modal.getManualDraft()).toBeFalsy(); expect(date.classList.contains('is-invalid')).toBe(true);
        expect(root.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe(t('manualSectionMain'));
        expect(root.querySelector<HTMLDetailsElement>('.lorebase-manual-main-tracking')?.open).toBe(true);
        modal.onClose();
    });
    it.each(['books', 'manga'] as const)('updates %s reading rings and bounded steppers without losing the draft', kind => {
        const { modal, root } = fixture({ manualKind: kind, mediaKind: kind, providerOptions: [] });
        const currentLabel = kind === 'books' ? t('templateFieldPageCurrent') : t('templateFieldChapterCurrent');
        const totalLabel = kind === 'books' ? t('templateFieldPageTotal') : t('templateFieldChapterTotal');
        const total = field(root, totalLabel); total.value = '2'; total.dispatchEvent(new Event('input'));
        const plus = root.querySelector<HTMLButtonElement>(`button[aria-label="${currentLabel} +1"]`)!;
        plus.click(); plus.click(); plus.click();
        expect(field(root, currentLabel).value).toBe('2'); expect(plus.disabled).toBe(true);
        expect(root.querySelector('.lorebase-reading-progress-meter')?.getAttribute('style')).toContain('100%');
        total.value = '1'; total.dispatchEvent(new Event('input')); expect(field(root, currentLabel).value).toBe('1');
        root.querySelector<HTMLButtonElement>('.lorebase-select-footer .lorebase-flow-btn-primary')!.click();
        expect(modal.getManualDraft()).toMatchObject(kind === 'books' ? { pageCurrent: 1, pageTotal: 1 } : { chapterCurrent: 1, chapterTotal: 1 });
    });
    it.each(['anime', 'series'])('keeps %s season edits across tabs, switching parts and removal', kind => {
        const { modal, root } = fixture({ manualKind: kind, mediaKind: kind, providerOptions: [] });
        const tab = (label: string) => Array.from(root.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(button => button.textContent === label)!.click();
        tab(t('manualSeasonsProgress'));
        expect(root.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe(t('manualSeasonsProgress'));
        root.querySelector<HTMLButtonElement>('[data-action="add-part"]')!.click();
        expect(root.querySelectorAll('.lorebase-manual-season-row')).toHaveLength(2);
        const editor = root.querySelector<HTMLElement>('.lorebase-manual-season-fields')!;
        const name = field(editor, t('templateFieldName')); name.value = 'Second season'; name.dispatchEvent(new Event('input'));
        const current = field(editor, t('templateFieldEpisodeCurrent')); current.value = '4'; current.dispatchEvent(new Event('input'));
        const total = field(editor, t('templateFieldEpisodeTotal')); total.value = '12'; total.dispatchEvent(new Event('input'));
        tab(t('manualSectionExtra'));
        expect(root.querySelector('[role="tabpanel"]:not([hidden])')?.querySelector('.lorebase-manual-seasons-layout')).toBeNull();
        tab(t('manualSeasonsProgress'));
        root.querySelector<HTMLButtonElement>('.lorebase-manual-season-row')!.click();
        const rows = root.querySelectorAll<HTMLButtonElement>('.lorebase-manual-season-row'); rows[1].click();
        expect(field(root.querySelector('.lorebase-manual-season-fields')!, t('templateFieldEpisodeCurrent')).value).toBe('4');
        expect(root.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe(t('manualSeasonsProgress'));
        root.querySelector<HTMLButtonElement>('.lorebase-select-footer .lorebase-flow-btn-primary')!.click();
        const draft = modal.getManualDraft();
        const parts = kind === 'anime' ? draft.animeParts : draft.videoParts;
        expect(parts).toHaveLength(2);
        expect(parts[1]).toMatchObject({ title: 'Second season', episodeCurrent: 4, episodeTotal: 12 });
    });
    it('removes only the selected season and keeps at least one season', () => {
        const { root } = fixture({ manualKind: 'series', mediaKind: 'series', providerOptions: [] });
        Array.from(root.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(button => button.textContent === t('manualSeasonsProgress'))!.click();
        root.querySelector<HTMLButtonElement>('[data-action="add-part"]')!.click();
        root.querySelector<HTMLButtonElement>('[data-action="remove-part"]')!.click();
        expect(root.querySelectorAll('.lorebase-manual-season-row')).toHaveLength(1);
        expect(root.querySelector<HTMLButtonElement>('[data-action="remove-part"]')!.disabled).toBe(true);
    });
    it('retains manual metadata and URL cover in the cover-preview layout', () => {
        const { modal, root } = fixture({ providerOptions: [] });
        expect(root.querySelector('.lorebase-manual-create-layout > .lorebase-manual-cover-aside')).not.toBeNull();
        const enter = (label: string, value: string) => { const input = field(root, label); input.value = value; input.dispatchEvent(new Event('input')); };
        enter(t('templateFieldName'), 'Manual game');
        enter(t('templateFieldYear'), '2026');
        enter(t('templateFieldReleased'), '2026-11-20');
        enter(t('manualCoverUrl'), 'https://example.com/cover.jpg');
        root.querySelector<HTMLButtonElement>('.lorebase-select-footer .lorebase-flow-btn-primary')!.click();
        expect(modal.getManualDraft()).toMatchObject({ title: 'Manual game', year: '2026', released: '2026-11-20', poster: 'https://example.com/cover.jpg' });
    });
    it('changes the manual category to anime with a country control and preserves the title', () => {
        const { root } = fixture({ providerOptions: [] });
        root.querySelector<HTMLButtonElement>('.lorebase-manual-category button')!.click();
        const option = Array.from(document.querySelectorAll<HTMLElement>('.lorebase-settings-dropdown-panel.is-open [role="option"]')).find(el => el.textContent === t('settingsAnime'))!;
        option.click();
        expect(field(root, t('templateFieldName')).value).toBe('Game');
        expect(Array.from(root.querySelectorAll('.lorebase-manual-form .lorebase-editmode-field-label')).some(el => el.textContent === 'Страна')).toBe(true);
        expect(root.querySelector('.lorebase-manual-cover-aside')).not.toBeNull();
    });
    it('saves a manually selected music cover in the vault before creating the item', async () => {
        const store = vi.spyOn(imageStorage, 'saveManualImageFileToVault').mockResolvedValue('files/lorebase/images/music/My album - Cover.png');
        const createItem = vi.fn(async (draft: unknown) => ({ item: draft, created: true }));
        const modal = new MusicSearchModal(createMockApp({}), structuredClone(DEFAULT_SETTINGS), { createItem } as any, vi.fn()) as any;
        modal.modalEl = document.body.createDiv(); modal.contentEl = modal.modalEl.createDiv(); modal.onOpen();
        const root = modal.contentEl as HTMLElement;
        root.querySelector<HTMLButtonElement>('.lorebase-select-manual-action')!.click();
        const title = field(root, t('templateFieldName')); title.value = 'My album'; title.dispatchEvent(new Event('input'));
        const file = new File(['image'], 'cover.png', { type: 'image/png' });
        const input = root.querySelector<HTMLInputElement>('input[type="file"]')!;
        Object.defineProperty(input, 'files', { value: [file] }); input.dispatchEvent(new Event('change'));
        root.querySelector<HTMLButtonElement>('.lorebase-select-footer .lorebase-flow-btn-primary')!.click();
        await vi.waitFor(() => expect(createItem).toHaveBeenCalledOnce());
        expect(store).toHaveBeenCalledWith(expect.anything(), file, expect.objectContaining({ kind: 'music', title: 'My album' }));
        expect(createItem.mock.calls[0][0]).toMatchObject({ poster: 'files/lorebase/images/music/My album - Cover.png' });
        modal.onClose(); store.mockRestore();
    });
    it('creates a manual music album with release date, notes, credits and editable tracks', async () => {
        const createItem = vi.fn(async (draft: unknown) => ({ item: draft, created: true }));
        const modal = new MusicSearchModal(createMockApp({}), structuredClone(DEFAULT_SETTINGS), { createItem } as any, vi.fn()) as any;
        modal.modalEl = document.body.createDiv(); modal.contentEl = modal.modalEl.createDiv(); modal.onOpen();
        modal.query = 'My album'; modal.openManual();
        const root = modal.contentEl as HTMLElement;
        const enter = (host: HTMLElement, label: string, value: string) => { const input = field(host, label); input.value = value; input.dispatchEvent(new Event('input')); };
        enter(root, mt('artist'), 'Artist');
        enter(root, t('templateFieldReleased'), '10.12.2025');
        root.querySelector<HTMLButtonElement>('[data-note-mode="myNotes"]')!.click();
        const notes = root.querySelector<HTMLTextAreaElement>('.lorebase-manual-notes textarea')!;
        notes.value = 'Album notes'; notes.dispatchEvent(new Event('input'));
        root.querySelector<HTMLButtonElement>('[data-action="add-track"]')!.click();
        const track = root.querySelector<HTMLElement>('.lorebase-manual-track-list details')!;
        enter(track, t('templateFieldName'), 'First track');
        enter(track, mt('duration'), '3:25');
        track.querySelector<HTMLButtonElement>(`[role="switch"][aria-label="${mt('listened')}"]`)!.click();
        root.querySelector<HTMLButtonElement>('.lorebase-select-footer .lorebase-flow-btn-primary')!.click();
        await vi.waitFor(() => expect(createItem).toHaveBeenCalled());
        expect(createItem.mock.calls[0][0]).toMatchObject({ displayName: 'My album', artist: 'Artist', releaseDate: '2025-12-10', myNotes: 'Album notes', status: 'completed',
            tracks: [{ title: 'First track', artist: 'Artist', duration: 205, listened: true }] });
    });
    it('saves type and country colors from the settings controls and uses them in search badges', async () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        const saveSettings = vi.fn(async () => {});
        const plugin = { settings, saveSettings, refreshViews: vi.fn(),
            getGameService: () => ({ invalidateCache: vi.fn(), loadGames: async () => [] }),
            getAnimeService: () => ({ loadAnime: async () => [] }),
        } as any;
        const root = document.body.createDiv();
        const editor = new MangaWorkTypesEditor(root, plugin, undefined, 'game') as any;
        await editor.load();
        const color = root.querySelector<HTMLInputElement>('input[type="color"]')!;
        expect(color.parentElement?.classList.contains('lorebase-work-type-color-control')).toBe(true);
        color.value = '#123456'; color.dispatchEvent(new Event('change'));
        await vi.waitFor(() => expect(saveSettings).toHaveBeenCalledTimes(1));
        expect(getMediaWorkTypeColor('game', 'Game')).toBe('#123456');
        const countryRoot = document.body.createDiv();
        const countries = new AnimeCountriesEditor(countryRoot, plugin) as any;
        await countries.load();
        const countryColor = countryRoot.querySelector<HTMLInputElement>('input[type="color"]')!;
        countryColor.value = '#987654'; countryColor.dispatchEvent(new Event('change'));
        await vi.waitFor(() => expect(saveSettings).toHaveBeenCalledTimes(2));
        const { modal, root: search } = fixture({ manualKind: 'anime', mediaKind: 'anime' }, vi.fn(async () => [{ id: '1', provider: 'anilist', title: 'Anime', countryOfOrigin: 'JP' }]) as any);
        await modal.runSearch();
        expect(search.querySelector<HTMLElement>('.lorebase-select-classification')?.style.getPropertyValue('--lorebase-type-color')).toBe('#987654');
        expect(settings.mediaWorkTypes?.anime?.types[0]).toMatchObject({ value: 'JP', color: '#987654' });
        await countries.removeCountry('JP');
        expect(settings.mediaWorkTypes?.anime?.types.some(entry => entry.value === 'JP')).toBe(false);
        expect(settings.mediaWorkTypes?.anime?.hidden).toContain('JP');
        await countries.load();
        expect(countryRoot.querySelector('input[aria-label="Япония"]')).toBeNull();
        configureMediaWorkTypes();
    });
    it('labels ordinary series as well as animated series', async () => {
        const { modal, root } = fixture({ manualKind: 'series', mediaKind: 'series' }, vi.fn(async () => [
            { id: '1', provider: 'tmdb', title: 'The Boys', workTypeMedia: 'series' },
            { id: '2', provider: 'tmdb', title: 'Diabolical', workTypeMedia: 'series', workType: 'Animated series' },
        ]) as any);
        await modal.runSearch();
        expect(Array.from(root.querySelectorAll('.lorebase-select-classification')).map(el => el.textContent)).toEqual(['Сериал', 'Мультсериал']);
    });
    it('clearly marks existing titles and prevents selecting duplicates in the add flow', async () => {
        const { modal, root } = fixture({}, vi.fn(async () => [{ id: '1', provider: 'steam', title: 'Cyberpunk', alreadyInLibrary: true }]) as any);
        await modal.runSearch();
        const card = root.querySelector<HTMLButtonElement>('.lorebase-select-card')!;
        expect(card.getAttribute('aria-disabled')).toBe('true');
        expect(card.querySelector('.lorebase-select-library-badge')?.getAttribute('aria-label')).toBe(t('promptAlreadyInLibrary'));
        expect(card.querySelector('.lorebase-select-card-meta .lorebase-select-library-state')?.textContent).toBe(t('promptInLibraryShort'));
        expect(card.querySelector('.lorebase-select-classification')?.textContent).toBe('Игра');
        card.click();
        expect(card.getAttribute('aria-pressed')).toBe('false');
    });
    it('ignores a pending provider response after opening manual creation', async () => {
        let finish!: (items: any[]) => void;
        const { modal, root } = fixture({}, vi.fn(() => new Promise<any[]>(resolve => finish = resolve)) as any);
        const pending = modal.runSearch();
        root.querySelector<HTMLButtonElement>('.lorebase-select-manual-action')!.click();
        finish([{ id: 'late', title: 'Late response' }]);
        await pending;
        expect(root.classList.contains('is-manual')).toBe(true);
        expect(field(root, t('templateFieldName')).value).toBe('Game');
        expect(root.querySelector('.lorebase-select-search-grid')).toBeNull();
    });
    it('also embeds the music form and preserves its title when returning', () => {
        const modal = new MusicSearchModal(createMockApp({}), structuredClone(DEFAULT_SETTINGS), {} as any, vi.fn()) as any;
        modal.modalEl = document.body.createDiv();
        modal.contentEl = modal.modalEl.createDiv();
        modal.onOpen();
        const root = modal.contentEl as HTMLElement;
        root.querySelector<HTMLButtonElement>('.lorebase-select-manual-action')!.click();
        const title = field(root, t('templateFieldName'));
        title.value = 'My album'; title.dispatchEvent(new Event('input'));
        const tracking = root.querySelector<HTMLDetailsElement>('.lorebase-manual-main-tracking')!;
        expect(tracking.open).toBe(false);
        tracking.open = true;
        root.querySelector<HTMLButtonElement>('.lorebase-select-footer button')!.click();
        expect(root.classList.contains('is-manual')).toBe(false);
        root.querySelector<HTMLButtonElement>('.lorebase-select-manual-action')!.click();
        expect(field(root, t('templateFieldName')).value).toBe('My album');
        expect(root.querySelector<HTMLDetailsElement>('.lorebase-manual-main-tracking')?.open).toBe(true);
        modal.onClose();
    });
    it('closes the whole add window from the phone close control during manual creation', () => {
        const { root, modal } = fixture();
        root.querySelector<HTMLButtonElement>('.lorebase-select-manual-action')!.click();
        expect(root.classList.contains('is-manual')).toBe(true);
        root.querySelector<HTMLButtonElement>('.lorebase-mobile-inline-close')!.click();
        expect(modal.close).toHaveBeenCalledOnce();
    });
    it('retains search and selection when switching to manual creation and back', async () => {
        const { modal, root } = fixture();
        await modal.runSearch();
        expect(root.querySelector('.lorebase-select-footer .lorebase-select-manual-action')).not.toBeNull();
        expect(root.querySelector('.lorebase-select-header .lorebase-select-manual-action')).toBeNull();
        expect(root.querySelector('.lorebase-select-selection-count')).toBeNull();
        expect(root.querySelector('.lorebase-select-search-wrap .lorebase-select-manual-action')).toBeNull();
        expect(root.querySelector('.lorebase-select-category-name')).toBeNull();
        root.querySelector<HTMLButtonElement>('.lorebase-select-card')!.click();
        expect(root.querySelector('.lorebase-select-card')?.getAttribute('aria-pressed')).toBe('true');
        root.querySelector<HTMLButtonElement>('.lorebase-select-manual-action')!.click();
        expect(root.classList.contains('is-manual')).toBe(true);
        field(root, t('templateFieldName')).value = 'My draft';
        field(root, t('templateFieldName')).dispatchEvent(new Event('input'));
        root.querySelector<HTMLButtonElement>('.lorebase-select-footer button')!.click();
        expect(root.classList.contains('is-manual')).toBe(false);
        expect(root.querySelector<HTMLInputElement>('.lorebase-select-search')?.value).toBe('Game');
        expect(root.querySelector('.lorebase-select-card')?.getAttribute('aria-pressed')).toBe('true');
        root.querySelector<HTMLButtonElement>('.lorebase-select-manual-action')!.click();
        expect(field(root, t('templateFieldName')).value).toBe('My draft');
    });
    it('collects a manual draft through the same modal and does not reopen a second modal', () => {
        const { modal, root } = fixture();
        const resolve = vi.fn(); modal.resolve = resolve;
        root.querySelector<HTMLButtonElement>('.lorebase-select-manual-action')!.click();
        const title = field(root, t('templateFieldName'));
        title.value = 'Created by hand'; title.dispatchEvent(new Event('input'));
        root.querySelector<HTMLButtonElement>('.lorebase-select-footer .lorebase-flow-btn-primary')!.click();
        expect(modal.getManualDraft()).toMatchObject({ title: 'Created by hand', kind: 'games' });
        expect(resolve).toHaveBeenCalledWith([]);
        expect(modal.close).toHaveBeenCalledOnce();
    });
    it('opens manual creation when integrations are unavailable', () => {
        const { root } = fixture({ providerOptions: [] });
        expect(root.classList.contains('is-manual')).toBe(true);
        expect(field(root, t('templateFieldName'))).toBeTruthy();
    });
    it.each(['games', 'anime', 'movies', 'series', 'books', 'manga'])('previews selected %s before confirming the import', async kind => {
        const { modal, root } = fixture({ manualKind: kind, mediaKind: kind }); const resolve = vi.fn(); modal.resolve = resolve;
        await modal.runSearch();
        root.querySelector<HTMLButtonElement>('.lorebase-select-card')!.click();
        root.querySelector<HTMLButtonElement>('.lorebase-select-footer .lorebase-flow-btn-primary')!.click();
        expect(resolve).not.toHaveBeenCalled();
        expect(modal.close).not.toHaveBeenCalled();
        expect(root.querySelector('.lorebase-select-review-gallery .lorebase-select-card-title')?.textContent).toBe('A very long game title');
        expect(root.querySelector('.lorebase-select-review-gallery .lorebase-select-card-meta')?.textContent).toContain('2020');
        expect(root.querySelectorAll('.lorebase-select-review-gallery .lorebase-select-card')).toHaveLength(1);
        root.querySelector<HTMLButtonElement>('.lorebase-select-footer .lorebase-flow-btn-primary')!.click();
        expect(resolve).toHaveBeenCalledWith([expect.objectContaining({ id: '1' })]);
        expect(modal.close).toHaveBeenCalledOnce();
    });
    it('returns from preview with the query and selection intact and removes unwanted entries before importing', async () => {
        const { modal, root } = fixture(); const resolve = vi.fn(); modal.resolve = resolve;
        await modal.runSearch();
        root.querySelectorAll<HTMLButtonElement>('.lorebase-select-card').forEach(card => card.click());
        const next = () => root.querySelector<HTMLButtonElement>('.lorebase-select-footer .lorebase-flow-btn-primary')!.click();
        next();
        root.querySelector<HTMLButtonElement>('.lorebase-select-footer .lorebase-flow-btn-secondary')!.click();
        expect(root.querySelector<HTMLInputElement>('.lorebase-select-search')?.value).toBe('Game');
        expect(root.querySelectorAll('.lorebase-select-card[aria-pressed="true"]')).toHaveLength(2);
        next();
        root.querySelector<HTMLButtonElement>('[data-action="remove-selection"]')!.click();
        expect(root.querySelectorAll('.lorebase-select-review-gallery .lorebase-select-card')).toHaveLength(1);
        expect(root.querySelector('.lorebase-flow-btn-primary')?.textContent).toContain('(1)');
        // Grid keyboard shortcuts must not change the selection in the preview.
        modal.onKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
        next();
        expect(resolve).toHaveBeenCalledWith([expect.objectContaining({ id: '2' })]);
    });
    it('keeps the poster overlay, type badge and empty-cover fallback in the selection preview', async () => {
        const { modal, root } = fixture();
        await modal.runSearch();
        root.querySelector<HTMLButtonElement>('.lorebase-select-card')!.click();
        const searchCard = root.querySelector('.lorebase-select-card')!;
        const badge = searchCard.querySelector<HTMLElement>('.lorebase-select-classification')!;
        const metadata = searchCard.querySelector('.lorebase-select-card-meta')!.textContent;
        root.querySelector<HTMLButtonElement>('.lorebase-flow-btn-primary')!.click();
        const preview = root.querySelector('.lorebase-select-review-gallery.lorebase-select-search-grid')!;
        const card = preview.querySelector('.lorebase-select-card.is-picked[aria-pressed="true"]')!;
        expect(card.querySelector('.lorebase-select-classification')?.textContent).toBe(badge.textContent);
        expect(card.querySelector<HTMLElement>('.lorebase-select-classification')?.style.cssText).toBe(badge.style.cssText);
        expect(card.querySelector('.lorebase-select-card-meta')?.textContent).toBe(metadata);
        expect(card.querySelector('.lorebase-select-card-body .lorebase-select-card-title')).not.toBeNull();
        expect(card.querySelector('.lorebase-select-card-image.is-empty .lorebase-select-empty-poster-icon')).not.toBeNull();
        expect(card.querySelector('.lorebase-select-card-check')).not.toBeNull();
        expect(card.getAttribute('aria-label')).toContain(t('promptRemoveSelected'));
    });
    it('returns to search after removing the last preview item and does not import on close', async () => {
        const { modal, root } = fixture(); const resolve = vi.fn(); modal.resolve = resolve;
        await modal.runSearch();
        root.querySelector<HTMLButtonElement>('.lorebase-select-card')!.click();
        root.querySelector<HTMLButtonElement>('.lorebase-flow-btn-primary')!.click();
        root.querySelector<HTMLButtonElement>('[data-action="remove-selection"]')!.click();
        expect(root.querySelector('.lorebase-select-search')).not.toBeNull();
        expect(root.querySelector<HTMLButtonElement>('.lorebase-flow-btn-primary')?.disabled).toBe(true);
        expect(resolve).not.toHaveBeenCalled();
        root.querySelector<HTMLButtonElement>('.lorebase-select-card')!.click();
        root.querySelector<HTMLButtonElement>('.lorebase-flow-btn-primary')!.click();
        modal.close();
        expect(resolve).toHaveBeenCalledWith(null);
    });
    it('shows country badges for anime and full titles on poster controls', async () => {
        const { modal, root } = fixture({ manualKind: 'anime', mediaKind: 'anime' }, vi.fn(async () => [
            { id: '1', provider: 'anilist', title: 'Long anime title', countryOfOrigin: 'JP', year: '2014', format: 'TV' },
        ]) as any);
        await modal.runSearch();
        expect(root.querySelector('.lorebase-select-classification')?.textContent).toBe('Япония');
        expect(root.querySelector('.lorebase-select-card')?.getAttribute('title')).toBe('Long anime title');
        expect(root.querySelector('.lorebase-select-card-meta')?.textContent).toBe('2014 / TV');
    });
    it('chooses one alternate anime catalog from the search row and keeps its results selectable', async () => {
        const handler = vi.fn(async (_query: string, provider: string) => {
            if (provider === 'tvmaze') return [{ id: '555', provider, title: 'Avatar on TVmaze', workTypeMedia: 'series' }];
            if (provider !== 'tmdb') return [];
            return [
                { id: '17', provider, title: 'Avatar film', workType: 'Animation', workTypeMedia: 'movie' },
                { id: '17', provider, title: 'Avatar series', workType: 'Animated series', workTypeMedia: 'series' },
            ];
        });
        const { modal, root } = fixture({ manualKind: 'anime', mediaKind: 'anime', initialQuery: 'Avatar', initialProviderId: 'anilist',
            providerOptions: [
                { id: 'anilist', label: 'AniList' },
                { id: 'tmdb', label: 'TMDB', alternateSearch: true },
                { id: 'tvmaze', label: 'TVmaze', alternateSearch: true },
                { id: 'omdb', label: 'OMDb', alternateSearch: true },
            ],
        }, handler as any);
        await modal.runSearch();
        expect(handler.mock.calls).toEqual([['Avatar', 'anilist', expect.anything()]]);
        expect([...root.querySelectorAll('.lorebase-select-provider-chip')].map(chip => chip.textContent)).toEqual(['AniList']);
        const button = root.querySelector<HTMLButtonElement>('.lorebase-select-search-wrap .lorebase-select-alternate-provider button')!;
        expect(button.getAttribute('aria-label')).toBe('Поиск в других каталогах');
        button.click();
        const options = () => [...document.querySelectorAll<HTMLElement>('.lorebase-settings-dropdown-panel.is-open [role="option"]')];
        expect(options().map(option => option.textContent)).toEqual(['TMDB', 'TVmaze', 'OMDb']);
        expect(handler).toHaveBeenCalledOnce();
        options()[0].click();
        await vi.waitFor(() => expect(root.querySelectorAll('.lorebase-select-card')).toHaveLength(2));
        expect(handler.mock.calls.slice(1)).toEqual([['Avatar', 'tmdb', expect.objectContaining({ page: 1 })]]);
        expect(button.getAttribute('aria-label')).toContain('TMDB');
        expect([...root.querySelectorAll('.lorebase-select-classification')].map(badge => badge.textContent)).toEqual(['Мультфильм', 'Мультсериал']);
        root.querySelectorAll<HTMLButtonElement>('.lorebase-select-card').forEach(card => card.click());
        expect(root.querySelectorAll('.lorebase-select-card[aria-pressed="true"]')).toHaveLength(2);
        button.click();
        expect(options()[0].getAttribute('aria-selected')).toBe('true');
        options()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        await vi.waitFor(() => expect(root.querySelector('.lorebase-select-card-meta')?.textContent).toContain('TVmaze'));
        expect(handler).toHaveBeenLastCalledWith('Avatar', 'tvmaze', expect.objectContaining({ page: 1 }));
        root.querySelector<HTMLButtonElement>('.lorebase-select-provider-chip')!.click();
        await vi.waitFor(() => expect(root.querySelector('.lorebase-select-provider-chip')?.getAttribute('aria-pressed')).toBe('true'));
        expect(button.getAttribute('aria-label')).toBe('Поиск в других каталогах');
        expect(handler).toHaveBeenLastCalledWith('Avatar', 'anilist', expect.anything());
    });
    it('keeps anime search available when only an alternate catalog is enabled', async () => {
        const handler = vi.fn(async () => []);
        const { root } = fixture({ manualKind: 'anime', mediaKind: 'anime', initialQuery: '',
            providerOptions: [{ id: 'tvmaze', label: 'TVmaze', alternateSearch: true }],
        }, handler as any);
        const button = root.querySelector<HTMLButtonElement>('.lorebase-select-alternate-provider button')!;
        expect(button.disabled).toBe(false);
        expect(button.getAttribute('aria-label')).toContain('TVmaze');
        const input = root.querySelector<HTMLInputElement>('.lorebase-select-search')!;
        input.value = 'Arcane';
        input.dispatchEvent(new Event('input'));
        root.querySelector<HTMLButtonElement>('.lorebase-select-search-submit')!.click();
        expect(handler).toHaveBeenCalledWith('Arcane', 'tvmaze', expect.anything());
    });
    it.each([false, true])('opens the inbox from search or manual entry (manual: %s)', async manual => {
        const inbox = vi.fn();
        const { modal, root } = fixture({ onInboxAction: inbox, ...(manual ? { providerOptions: [], initialProviderId: undefined } : {}) });
        const button = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent === inboxText('title'))!;
        expect(button).toBeDefined(); button.click(); await Promise.resolve();
        expect(inbox).toHaveBeenCalledOnce(); expect(root.classList.contains('is-inbox')).toBe(true);
        const presentation = inbox.mock.calls[0][0];
        expect(presentation.signal.aborted).toBe(false);
        presentation.onBack();
        expect(presentation.signal.aborted).toBe(true); expect(root.classList.contains('is-inbox')).toBe(false);
        expect(modal.close).not.toHaveBeenCalled(); modal.onClose();
    });
    it('keeps Inbox immediately left of Steam Sync in one header group', () => {
        const { modal, root } = fixture({ onInboxAction: vi.fn(), syncActionText: 'Steam Sync', onSyncAction: vi.fn() });
        const actions = root.querySelector('.lorebase-add-header-actions')!;
        expect([...actions.querySelectorAll('button')].map(button => button.textContent)).toEqual([inboxText('title'), 'Steam Sync']);
        expect(root.querySelectorAll('.lorebase-add-header-actions')).toHaveLength(1); modal.onClose();
    });
    it('switches the visible provider for a direct link without adding or closing the dialog', async () => {
        const handler = vi.fn(async () => Object.assign([{ id: '620', provider: 'steam', title: 'Portal 2', directMatch: true }], { hasNext: false }));
        const { modal, root } = fixture({ initialQuery: 'https://store.steampowered.com/app/620/',
            providerOptions: [{ id: 'rawg', label: 'RAWG' }, { id: 'steam', label: 'Steam' }], initialProviderId: 'rawg' }, handler);
        await Promise.resolve(); expect(handler).not.toHaveBeenCalled();
        await modal.runSearch();
        expect(root.querySelector('.lorebase-select-provider-chip.is-active')?.textContent).toBe('Steam');
        expect(root.querySelectorAll('.lorebase-select-card')).toHaveLength(1);
        expect(modal.selected.size).toBe(0); expect(modal.close).not.toHaveBeenCalled(); modal.onClose();
    });
    it('opens a direct result already in the library without selecting or adding it', async () => {
        const open = vi.fn();
        const handler = vi.fn(async () => [{ id: '620', provider: 'steam', title: 'Portal 2', directMatch: true, alreadyInLibrary: true, libraryPath: 'Games/Portal.md' }]);
        const { modal, root } = fixture({ onOpenExisting: open }, handler);
        await modal.runSearch();
        const card = root.querySelector<HTMLButtonElement>('.lorebase-select-card')!;
        expect(card.getAttribute('aria-disabled')).not.toBe('true'); card.click();
        expect(open).toHaveBeenCalledWith(expect.objectContaining({ libraryPath: 'Games/Portal.md' }));
        expect(modal.selected.size).toBe(0); expect(modal.close).toHaveBeenCalledOnce();
    });
    it('waits for an explicit search and returns a clicked inbox result as a selection', async () => {
        const { modal, root, handler } = fixture({ manualKind: undefined, pickOnClick: true });
        const resolved = vi.fn(); modal.resolve = resolved;
        await Promise.resolve();
        expect(handler).not.toHaveBeenCalled(); expect(root.querySelectorAll('.lorebase-select-card')).toHaveLength(0);
        expect(root.querySelector<HTMLInputElement>('.lorebase-select-search')!.value).toBe('Game');
        root.querySelector<HTMLButtonElement>('.lorebase-select-search-submit')!.click();
        await vi.waitFor(() => expect(root.querySelectorAll('.lorebase-select-card')).toHaveLength(2));
        expect(handler).toHaveBeenCalledOnce();
        expect(root.querySelector('.lorebase-select-footer .lorebase-flow-btn-primary')).toBeNull();
        expect(root.textContent).toContain(inboxText('pickHint'));
        root.querySelector<HTMLButtonElement>('.lorebase-select-card')!.click();
        expect(resolved).toHaveBeenCalledWith([expect.objectContaining({ id: '1' })]);
        expect(modal.close).toHaveBeenCalledOnce(); expect(root.querySelector('.lorebase-select-review-gallery')).toBeNull();
    });
    it('opens Steam Sync inside the same add dialog and restores search without resolving it', async () => {
        const sync = vi.fn();
        const { modal, root } = fixture({ syncActionText: 'Steam Sync', onSyncAction: sync });
        await modal.runSearch();
        root.querySelector<HTMLButtonElement>('.lorebase-select-card')!.click();
        root.querySelector<HTMLButtonElement>('.lorebase-select-header-action')!.click();
        await Promise.resolve();
        expect(sync).toHaveBeenCalledOnce(); expect(modal.close).not.toHaveBeenCalled();
        expect(root.querySelector('.lorebase-steam-sync-host')).not.toBeNull();
        const context = sync.mock.calls[0][0];
        expect(context.signal.aborted).toBe(false);
        root.querySelector<HTMLButtonElement>('.lorebase-steam-sync-back')!.click();
        expect(context.signal.aborted).toBe(true);
        expect(root.querySelector<HTMLInputElement>('.lorebase-select-search')!.value).toBe('Game');
        expect(root.querySelectorAll('.lorebase-select-card.is-picked')).toHaveLength(1);
        expect(modal.close).not.toHaveBeenCalled();
        expect(modal.hasResolved).toBe(false);
    });

    it('aborts inline sync when the add window closes', async () => {
        const sync = vi.fn();
        const { modal, root } = fixture({ syncActionText: 'Steam Sync', onSyncAction: sync });
        root.querySelector<HTMLButtonElement>('.lorebase-select-header-action')!.click();
        await Promise.resolve();
        modal.onClose();
        expect(sync.mock.calls[0][0].signal.aborted).toBe(true);
        expect(root.childElementCount).toBe(0);
    });
});

describe('Steam import inside the add workspace', () => {
    const candidates = [
        { appId: 10, name: 'Portal', playtimeForever: 120, source: 'owned' as const },
        { appId: 20, name: 'Half-Life', playtimeForever: 0, source: 'owned' as const },
        { appId: 30, name: 'Wishlist game', playtimeForever: 0, source: 'wishlist' as const },
        { appId: 40, name: 'Both lists', playtimeForever: 60, source: 'owned_wishlist' as const },
    ];
    function mount(items = candidates, resolver?: (ids: number[]) => Promise<Record<number, string>>) {
        const host = document.body.createDiv({ cls: 'lorebase-add-workspace' });
        const controller = new AbortController();
        const context = { host, signal: controller.signal, onBack: vi.fn() };
        const review = new SteamSyncReviewModal(createMockApp({}), items, 'ru', resolver);
        const open = vi.spyOn(review, 'open');
        const result = review.mountInline(context);
        return { host, controller, context, review, result, open };
    }
    it('starts without selections and preserves choices across search and Steam filters', async () => {
        const { host, result, open } = mount();
        expect(open).not.toHaveBeenCalled();
        expect(host.querySelectorAll('.lorebase-select-card')).toHaveLength(4);
        expect(host.querySelector('[data-filter="selected"]')).toBeNull();
        expect(host.querySelector('.lorebase-steam-selection-count')?.textContent).not.toContain('Выбрано');
        expect(host.querySelector<HTMLButtonElement>('[data-action="import-steam"]')!.disabled).toBe(true);
        host.querySelector<HTMLButtonElement>('[data-app-id="10"]')!.click();
        host.querySelector<HTMLButtonElement>('[data-filter="wishlist"]')!.click();
        expect(host.querySelectorAll('.lorebase-select-card')).toHaveLength(2);
        host.querySelector<HTMLButtonElement>('.lorebase-steam-bulk-action')!.click();
        host.querySelector<HTMLButtonElement>('[data-filter="all"]')!.click();
        const search = host.querySelector<HTMLInputElement>('input')!;
        search.value = 'Half'; search.dispatchEvent(new Event('input'));
        expect(host.querySelectorAll('.lorebase-select-card')).toHaveLength(1);
        host.querySelector<HTMLButtonElement>('[data-app-id="20"]')!.click();
        host.querySelector<HTMLButtonElement>('[data-action="import-steam"]')!.click();
        expect(await result).toEqual(new Set([10, 20, 30, 40]));
    });
    it('keeps selections across pages and selects only the currently matching filter', async () => {
        const items = Array.from({ length: 25 }, (_, i) => ({ appId: i + 1, name: `Game ${i + 1}`, playtimeForever: 0, source: 'owned' as const }));
        const { host, result } = mount(items);
        expect(host.querySelectorAll('.lorebase-select-card')).toHaveLength(20);
        host.querySelector<HTMLButtonElement>('[data-app-id="1"]')!.click();
        const pages = host.querySelectorAll<HTMLButtonElement>('.lorebase-select-pagination button');
        pages[1].click();
        expect(host.querySelectorAll('.lorebase-select-card')).toHaveLength(5);
        host.querySelector<HTMLButtonElement>('[data-app-id="25"]')!.click();
        host.querySelectorAll<HTMLButtonElement>('.lorebase-select-pagination button')[0].click();
        expect(host.querySelectorAll('.lorebase-select-card.is-picked')).toHaveLength(1);
        host.querySelector<HTMLButtonElement>('[data-app-id="1"]')!.click();
        host.querySelector<HTMLButtonElement>('[data-action="import-steam"]')!.click();
        expect(await result).toEqual(new Set([25]));
    });
    it('cancels selection when leaving the inline view', async () => {
        const { host, controller, result } = mount();
        host.querySelector<HTMLButtonElement>('[data-app-id="10"]')!.click();
        controller.abort();
        expect(await result).toBeNull();
        expect(host.childElementCount).toBe(0);
    });
    it('replaces Steam App placeholders in the background without losing selection and makes titles searchable', async () => {
        let complete!: (names: Record<number, string>) => void;
        const resolver = vi.fn(() => new Promise<Record<number, string>>(resolve => { complete = resolve; }));
        const { host, result } = mount([{ appId: 1040200, name: 'Steam App 1040200', source: 'owned', playtimeForever: 0 }], resolver);
        expect(host.textContent).not.toContain('Steam App');
        expect(host.textContent).toContain('Получаем название');
        host.querySelector<HTMLButtonElement>('.lorebase-select-card')!.click();
        const input = host.querySelector<HTMLInputElement>('input')!;
        input.value = 'Crime Scene'; input.dispatchEvent(new Event('input'));
        expect(host.querySelector('.lorebase-select-card')).toBeNull();
        complete({ 1040200: 'Crime Scene Cleaner' });
        await vi.waitFor(() => expect(host.querySelector('.lorebase-select-card-title')?.textContent).toBe('Crime Scene Cleaner'));
        expect(host.querySelector('.lorebase-select-card.is-picked')).not.toBeNull();
        host.querySelector<HTMLButtonElement>('[data-action="import-steam"]')!.click();
        expect(await result).toEqual(new Set([1040200]));
    });
    it('uses a readable fallback when Steam cannot supply a name', async () => {
        const { host, controller } = mount([{ appId: 1040200, name: 'Steam App 1040200', source: 'owned', playtimeForever: 0 }], async () => { throw new Error('offline'); });
        await vi.waitFor(() => expect(host.querySelector('.lorebase-select-card-title')?.textContent).toBe('Игра из Steam'));
        expect(host.innerHTML).not.toContain('Steam App');
        controller.abort();
    });
    it('does not update a closed review or continue fetching title batches', async () => {
        let complete!: (names: Record<number, string>) => void;
        const resolver = vi.fn(() => new Promise<Record<number, string>>(resolve => { complete = resolve; }));
        const items = Array.from({ length: 45 }, (_, index) => ({ appId: index + 1, name: `Steam App ${index + 1}`, playtimeForever: 0, source: 'owned' as const }));
        const { host, controller } = mount(items, resolver);
        expect(resolver.mock.calls[0][0]).toHaveLength(40);
        controller.abort(); complete({ 1: 'Portal' });
        await Promise.resolve(); await Promise.resolve();
        expect(resolver).toHaveBeenCalledOnce();
        expect(host.childElementCount).toBe(0);
    });
    it('ignores a late Steam preview after returning to search', async () => {
        let complete!: (items: typeof candidates) => void;
        const controller = new AbortController();
        const work = new Promise<typeof candidates>(resolve => { complete = resolve; });
        const result = waitForInlinePreview(work, controller.signal);
        controller.abort();
        expect(await result).toBeUndefined();
        complete(candidates);
        await Promise.resolve();
        expect(await result).toBeUndefined();
    });
    it('runs progress, pause and cancellation inline and shows updated counts', async () => {
        const host = document.body.createDiv();
        const controller = new AbortController();
        const progress = new SteamSyncProgressModal(createMockApp({}), candidates, 'ru');
        const open = vi.spyOn(progress, 'open');
        progress.mountInline({ host, signal: controller.signal, onBack: vi.fn() });
        expect(open).not.toHaveBeenCalled();
        progress.setCurrent(candidates[0], 0, candidates.length);
        progress.addResult({ appId: 10, name: 'Portal', outcome: 'updated', durationMs: 5 });
        expect(host.querySelector('.is-updated .lorebase-sp-summary-value')?.textContent).toBe('1');
        host.querySelector<HTMLButtonElement>('.lorebase-sp-btn.is-secondary')!.click();
        expect(progress.getController().isPaused()).toBe(true);
        host.querySelector<HTMLButtonElement>('.lorebase-sp-btn.is-secondary')!.click();
        expect(host.querySelector('.lorebase-sp-status')?.textContent).toBe('Portal');
        host.querySelector<HTMLButtonElement>('.lorebase-sp-btn.is-secondary')!.click();
        const waiting = progress.getController().waitIfPaused();
        controller.abort(); await waiting;
        expect(progress.getController().isCancelled()).toBe(true);
        expect(host.childElementCount).toBe(0);
    });
    it('returns from completed progress without closing the add modal', () => {
        const host = document.body.createDiv();
        const context = { host, signal: new AbortController().signal, onBack: vi.fn() };
        const progress = new SteamSyncProgressModal(createMockApp({}), candidates, 'ru');
        const close = vi.spyOn(progress, 'close');
        progress.mountInline(context);
        progress.complete({ created: 1, updated: 2, skipped: 1, failed: 0 });
        expect(host.querySelector<HTMLButtonElement>('.lorebase-sp-btn.is-secondary')!.hidden).toBe(true);
        expect(host.querySelector<HTMLButtonElement>('.lorebase-sp-btn.is-danger')!.hidden).toBe(true);
        expect(host.querySelector<HTMLButtonElement>('.lorebase-sp-btn.is-primary')!.hidden).toBe(false);
        expect(host.querySelectorAll('.lorebase-sp-summary-item')).toHaveLength(3);
        host.querySelector<HTMLButtonElement>('.lorebase-sp-btn.is-primary')!.click();
        expect(context.onBack).toHaveBeenCalledOnce();
        expect(close).not.toHaveBeenCalled();
    });
    it('shows an honest error result and hides inactive controls on failure', () => {
        const host = document.body.createDiv();
        const progress = new SteamSyncProgressModal(createMockApp({}), candidates, 'ru');
        progress.mountInline({ host, signal: new AbortController().signal, onBack: vi.fn() });
        progress.fail(new Error('offline'));
        expect(host.dataset.state).toBe('failed');
        expect(host.querySelector('.lorebase-sp-status')?.textContent).toContain('offline');
        expect(host.querySelector('.lorebase-sp-title')?.textContent).toContain('ошибкой');
        expect(host.querySelector<HTMLButtonElement>('.lorebase-sp-btn.is-primary')!.hidden).toBe(false);
        expect(host.querySelector('.lorebase-sp-appid')).toBeNull();
    });
    it('keeps a skipped-game explanation with its title and status in the result', () => {
        const host = document.body.createDiv();
        const progress = new SteamSyncProgressModal(createMockApp({}), [candidates[0]], 'ru');
        progress.mountInline({ host, signal: new AbortController().signal, onBack: vi.fn() });
        progress.addResult({ appId: 10, name: 'Portal', outcome: 'skipped', durationMs: 5, detail: 'Игра уже есть в LOREBASE.' });
        progress.complete({ created: 0, updated: 0, skipped: 1, failed: 0 });
        const info = host.querySelector('.lorebase-sp-row-info')!;
        expect(info.querySelector('.lorebase-sp-game')?.textContent).toBe('Portal');
        expect(info.querySelector('.lorebase-sp-row-status')?.textContent).toBe('Пропущено');
        expect(info.querySelector('.lorebase-sp-row-detail')?.textContent).toBe('Игра уже есть в LOREBASE.');
        expect(host.querySelector('.lorebase-sp-row')?.hasAttribute('title')).toBe(false);
    });
    it('distinguishes a finished batch containing errors from a successful import', () => {
        const host = document.body.createDiv();
        const progress = new SteamSyncProgressModal(createMockApp({}), candidates, 'ru');
        progress.mountInline({ host, signal: new AbortController().signal, onBack: vi.fn() });
        progress.complete({ created: 1, updated: 0, skipped: 0, failed: 1 });
        expect(host.querySelector('.lorebase-sp-title')?.textContent).toBe('Импорт завершён с ошибками.');
    });
});


describe('AniList import and linking workspace', () => {
    const entries = [
        { key: 'anime:21', kind: 'anime' as const, title: 'ONE PIECE', status: 'watching' as const, progress: 7, image: '', linked: true },
        { key: 'manga:21', kind: 'manga' as const, title: 'Frieren', status: 'planned' as const, progress: 0, image: '', linked: false },
    ];
    it('opens AniList import in place and restores the search and its selection', async () => {
        const sync = vi.fn();
        const { root, modal } = fixture({ manualKind: 'anime', mediaKind: 'anime', syncActionText: 'AniList Import', onSyncAction: sync });
        await modal.runSearch();
        root.querySelector<HTMLButtonElement>('.lorebase-select-card')!.click();
        root.querySelector<HTMLButtonElement>('.lorebase-select-header-action')!.click();
        await Promise.resolve();
        expect(root.querySelector('.lorebase-steam-sync-mode')?.textContent).toBe('AniList Import');
        expect(modal.close).not.toHaveBeenCalled();
        sync.mock.calls[0][0].onBack();
        expect(root.querySelectorAll('.lorebase-select-card.is-picked')).toHaveLength(1);
    });
    it('preserves selections across anime/manga filters and search without confusing identical IDs', async () => {
        const host = document.body.createDiv(), controller = new AbortController();
        const review = new AniListImportReviewModal(createMockApp({}), entries, 'ru');
        const result = review.mountInline({ host, signal: controller.signal, onBack: vi.fn() });
        expect(host.querySelector<HTMLButtonElement>('[data-action="import-anilist"]')?.disabled).toBe(true);
        host.querySelector<HTMLButtonElement>('[data-key="anime:21"]')!.click();
        host.querySelector<HTMLButtonElement>('[data-filter="manga"]')!.click();
        expect(host.querySelectorAll('.lorebase-select-card')).toHaveLength(1);
        host.querySelector<HTMLButtonElement>('[data-key="manga:21"]')!.click();
        host.querySelector<HTMLButtonElement>('[data-action="import-anilist"]')!.click();
        expect(await result).toEqual(new Set(['anime:21', 'manga:21']));
        controller.abort();
        // Finishing the review removes its abort handler before progress takes over.
        expect(host.querySelector('.lorebase-select-card')).not.toBeNull();
    });
    it('resolves an abandoned inline review without applying any selection', async () => {
        const host = document.body.createDiv(), controller = new AbortController();
        const review = new AniListImportReviewModal(createMockApp({}), entries, 'ru');
        const result = review.mountInline({ host, signal: controller.signal, onBack: vi.fn() });
        host.querySelector<HTMLButtonElement>('.lorebase-select-card')!.click();
        controller.abort(); expect(await result).toBeNull(); expect(host.childElementCount).toBe(0);
    });
    it('uses AniList copy and never requests Steam covers for an AniList progress fallback', () => {
        const host = document.body.createDiv();
        const progress = new SteamSyncProgressModal(createMockApp({}), [{ appId: 1, name: 'Frieren', playtimeForever: 0, source: 'owned' }], 'ru', 'anilist');
        progress.mountInline({ host, signal: new AbortController().signal, onBack: vi.fn() });
        expect(host.textContent).toContain('Импорт из AniList');
        expect(host.querySelector('img')).toBeNull();
    });
    function linkFixture(search = vi.fn(async () => [{ id: 21, title: 'ONE PIECE', year: 1999, format: 'TV', image: '' }])) {
        const notes = [{ filePath: 'Anime/One.md', title: 'One', kind: 'anime', provider: 'shikimori' }, { filePath: 'Manga/Two.md', title: 'Two', kind: 'manga', provider: 'mangadex' }];
        const service = { getUnlinkedItems: vi.fn(() => notes), searchLinkMatches: search, linkExisting: vi.fn(async () => {}) };
        const save = vi.fn(async () => {});
        const modal = new AniListLinkModal(createMockApp({}), service as any, { ...structuredClone(DEFAULT_SETTINGS), language: 'ru' }, save);
        modal.modalEl = document.body.createDiv(); modal.contentEl = modal.modalEl.createDiv(); modal.onOpen();
        return { modal, root: modal.contentEl, service, save };
    }
    it('requires an explicit match and confirmation before linking the selected local note', async () => {
        const { root, modal, service, save } = linkFixture();
        const confirm = root.querySelector<HTMLButtonElement>('[data-action="confirm-link"]')!;
        expect(confirm.disabled).toBe(true);
        root.querySelector<HTMLButtonElement>('.lorebase-anilist-link-search button')!.click();
        await vi.waitFor(() => expect(root.querySelectorAll('.lorebase-anilist-match-grid .lorebase-select-card')).toHaveLength(1));
        expect(service.linkExisting).not.toHaveBeenCalled();
        root.querySelector<HTMLButtonElement>('[data-id="21"]')!.click();
        expect(confirm.disabled).toBe(false);
        expect(root.querySelector('.lorebase-anilist-link-confirmation')?.textContent).toBe('ONE PIECE');
        confirm.click();
        await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
        expect(service.linkExisting).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ filePath: 'Anime/One.md' }), 21);
        modal.onClose();
    });
    it('discards stale AniList results after switching media', async () => {
        let finish!: (items: any[]) => void;
        const search = vi.fn(() => new Promise<any[]>(resolve => { finish = resolve; }));
        const { root, modal } = linkFixture(search as any);
        root.querySelector<HTMLButtonElement>('.lorebase-anilist-link-search button')!.click();
        root.querySelector<HTMLButtonElement>('[data-kind="manga"]')!.click();
        finish([{ id: 21, title: 'Old anime result', year: 1999, format: 'TV' }]);
        await Promise.resolve(); await Promise.resolve();
        expect(root.textContent).not.toContain('Old anime result');
        expect(root.querySelector('.lorebase-anilist-local-title')?.textContent).toBe('Two');
        expect(root.querySelector<HTMLButtonElement>('[data-action="confirm-link"]')!.disabled).toBe(true);
        modal.onClose();
    });
});


describe('import library state and clear filters', () => {
    it('keeps existing Steam games selectable with an independent library indicator', async () => {
        const host = document.body.createDiv(), controller = new AbortController();
        const review = new SteamSyncReviewModal(createMockApp({}), [{ appId: 10, name: 'Portal', playtimeForever: 60, source: 'owned', alreadyInLibrary: true }, { appId: 20, name: 'New', playtimeForever: 0, source: 'owned' }], 'ru');
        const result = review.mountInline({ host, signal: controller.signal, onBack: vi.fn() });
        const card = host.querySelector<HTMLButtonElement>('[data-app-id="10"]')!;
        expect(card.classList.contains('is-in-library')).toBe(true);
        expect(card.querySelector('.lorebase-select-library-badge')).not.toBeNull();
        expect(card.querySelector('.lorebase-select-library-state')?.textContent).toBe(t('promptInLibraryShort'));
        expect(host.querySelector('[data-app-id="20"]')?.classList.contains('is-in-library')).toBe(false);
        card.click();
        expect(card.getAttribute('aria-pressed')).toBe('true');
        expect(card.querySelector('.lorebase-select-library-badge')).not.toBeNull();
        expect(host.querySelector('[data-filter="played"]')?.getAttribute('title')).toContain('больше нуля');
        host.querySelector<HTMLButtonElement>('[data-filter="played"]')!.click();
        expect(document.activeElement).toBe(host.querySelector('[data-filter="played"]'));
        host.querySelector<HTMLButtonElement>('[data-action="import-steam"]')!.click();
        expect(await result).toEqual(new Set([10]));
    });
    it('shows AniList library indicators for linked and matched notes while keeping selection separate', async () => {
        const host = document.body.createDiv(), controller = new AbortController();
        const review = new AniListImportReviewModal(createMockApp({}), [
            { key: 'anime:1', kind: 'anime', title: 'Linked', status: 'watching', progress: 1, image: '', linked: true },
            { key: 'manga:2', kind: 'manga', title: 'Manual match', status: 'planned', progress: 0, image: '', linked: false, alreadyInLibrary: true },
        ], 'ru');
        const result = review.mountInline({ host, signal: controller.signal, onBack: vi.fn() });
        expect(host.querySelectorAll('.is-in-library')).toHaveLength(2);
        expect(host.querySelectorAll('.lorebase-select-library-badge')).toHaveLength(2);
        const clear = host.querySelectorAll<HTMLButtonElement>('.lorebase-steam-bulk-action')[1];
        expect(clear.disabled).toBe(true);
        host.querySelector<HTMLButtonElement>('.lorebase-steam-bulk-action')!.click();
        expect(clear.disabled).toBe(false);
        clear.click();
        expect(host.querySelectorAll('.is-picked')).toHaveLength(0);
        expect(host.querySelectorAll('.is-in-library')).toHaveLength(2);
        controller.abort(); expect(await result).toBeNull();
    });
});
