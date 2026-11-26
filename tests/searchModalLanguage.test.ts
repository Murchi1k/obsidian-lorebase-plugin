import { expect, it, vi } from 'vitest';
import { MultiSelectSearchModal } from '../src/modals/IntegrationModals';
import { createMockApp } from './helpers/testHelpers';

function modal(handler: (...args: any[]) => Promise<any[]>) {
    const result = new MultiSelectSearchModal(createMockApp({}), handler, {
        titleText: '', placeholder: '', emptyText: '', doneText: '', cancelText: '',
        initialProviderId: 'tmdb', initialTmdbLanguage: 'uk-UA',
        providerOptions: [{ id: 'tmdb', label: 'TMDB' }, { id: 'omdb', label: 'OMDb' }],
    }) as any;
    result.inputEl = { value: 'Dune' };
    return result;
}

it('uses the initial language and restarts on page one when the language changes', async () => {
    const handler = vi.fn(async (_query, _provider, options) => [{ id: '1', provider: 'tmdb', title: options.tmdbLanguage }]);
    const search = modal(handler);
    await search.runSearch();
    expect(handler.mock.calls[0][2].tmdbLanguage).toBe('uk-UA');
    search.currentPage = 3;
    search.selected.set('tmdb:1', { id: '1', provider: 'tmdb', title: 'Old language' });
    search.selected.set('omdb:2', { id: '2', provider: 'omdb', title: 'Other provider' });
    await search.changeTmdbLanguage('ja-JP');
    expect(handler.mock.calls[1][2]).toMatchObject({ tmdbLanguage: 'ja-JP', page: 1 });
    expect(search.items[0].title).toBe('ja-JP');
    expect([...search.selected.keys()]).toEqual(['omdb:2']);
    search.activeProviderId = 'omdb';
    await search.runSearch();
    expect(handler.mock.calls[2][2].tmdbLanguage).toBeUndefined();
});

it('ignores an obsolete response or error after switching language', async () => {
    let rejectOld!: (error: Error) => void;
    const search = modal(async (_query, _provider, options) => {
        if (options.tmdbLanguage === 'uk-UA') return new Promise((_resolve, reject) => { rejectOld = reject; });
        return [{ id: '1', provider: 'tmdb', title: 'New language' }];
    });
    const old = search.runSearch();
    await search.changeTmdbLanguage('en-US');
    rejectOld(new Error('Old request failed'));
    await old;
    expect(search.items[0].title).toBe('New language');
    expect(search.lastErrorText).toBe('');
    expect(search.isLoading).toBe(false);
});
