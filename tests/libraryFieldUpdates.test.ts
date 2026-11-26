// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
vi.mock('obsidian', async importOriginal => ({ ...await importOriginal<object>(), ItemView: class {} }));
import { LibraryView } from '../src/views/LibraryView';
import { DEFAULT_SETTINGS } from '../src/constants';
import { createMockFile } from './helpers/testHelpers';

it('discovers new custom fields and removes deleted ones after a metadata change, even with no matching cards', () => {
    const view = Object.create(LibraryView.prototype) as any;
    const settings = structuredClone(DEFAULT_SETTINGS);
    const file = createMockFile('LOREBASE/Games/Test.md', 'Test');
    const base = { type: 'game', filePath: file.path, displayName: 'Test', nameLower: 'test', gameSeries: '', status: 'playing',
        year: 2024, userRating: null, favorite: false, isAdult: false, hasCustomPoster: false, tags: [], genres: [], rawFields: {} };
    let parsed = base;
    const updateFields = vi.fn();
    Object.assign(view, {
        isDestroyed: false, mediaType: 'game', games: [base], gameIndex: new Map([[file.path, 0]]), filteredGames: [], tagsDirty: true,
        viewState: structuredClone(settings.games.viewState), filter: { tags: [], genres: [] },
        plugin: { settings, getMetadataService: () => null },
        getActiveSettings: () => ({ ...settings.games, folderPath: 'LOREBASE/Games' }), getStatusOptions: () => [],
        getFilterFlags: () => ({ showAdult: true, showCustom: true }),
        invalidateActiveServiceCache: vi.fn(), parseActiveItemFromCache: () => parsed,
        shouldSuppressOptimisticMetadataRender: () => false, getEditScrollRestore: () => null,
        toolbar: { beginUpdate: vi.fn(), endUpdate: vi.fn(), updateSearchItems: vi.fn(), updateTags: vi.fn(), updateFieldDefinitions: updateFields },
        applyFiltersAndSort: () => view.updateToolbarTags(),
    });
    view.updateToolbarTags();
    expect(updateFields.mock.lastCall![0].some((field: any) => field.id === 'yaml:my_priority')).toBe(false);
    parsed = { ...base, rawFields: { my_priority: 3, new_empty_property: null } };
    view.handleMetadataChange(file);
    expect(updateFields.mock.lastCall![0]).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'yaml:my_priority', type: 'number', noteCount: 1 }),
        expect.objectContaining({ id: 'yaml:new_empty_property', type: 'text', noteCount: 1 }),
    ]));
    parsed = base;
    view.handleMetadataChange(file);
    expect(updateFields.mock.lastCall![0].some((field: any) => field.id === 'yaml:my_priority')).toBe(false);
    expect(view.filteredGames).toEqual([]);
});

describe('discovery context changes', () => {
    it.each(['game', 'anime', 'movie', 'series', 'book', 'manga', 'music'])('refreshes %s cards after clearing either field or the entire block', type => {
        const view = Object.create(LibraryView.prototype) as any;
        const file = createMockFile('Media/Test.md', 'Test');
        const base = { type, filePath: file.path, displayName: 'Test', tags: [], genres: [], rawFields: {},
            discovery: { recommendedBy: 'Андрей', reason: 'Совет друга' } };
        let parsed: any = base;
        let rendered = base;
        const render = vi.fn(() => { rendered = view.games[0]; });
        Object.assign(view, {
            isDestroyed: false, games: [base], gameIndex: new Map([[file.path, 0]]),
            invalidateActiveServiceCache: vi.fn(), parseActiveItemFromCache: () => parsed,
            getActiveSettings: () => ({ folderPath: 'Media' }), shouldSuppressOptimisticMetadataRender: () => false,
            getEditScrollRestore: () => null, applyFiltersAndSort: render,
        });
        for (const discovery of [
            { recommendedBy: '', reason: 'Совет друга' },
            { recommendedBy: 'Андрей', reason: '' },
            undefined,
        ]) {
            parsed = { ...base, discovery };
            render.mockClear();
            view.handleMetadataChange(file);
            expect(render).toHaveBeenCalledTimes(1);
            // The rendered card supplies this item when its editor is reopened.
            expect(rendered.discovery).toEqual(discovery);
            view.handleMetadataChange(file);
            expect(render).toHaveBeenCalledTimes(1);
        }
    });
});
