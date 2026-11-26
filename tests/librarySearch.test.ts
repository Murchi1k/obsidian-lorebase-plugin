import { describe, expect, it } from 'vitest';
import { filterAndSortMedia } from '../src/services/media/filtering';
import { getTitleSearchMatch } from '../src/services/media/titleSearch';
import { addSearchSuggestionRule, collectSearchSuggestions, findSearchSuggestions } from '../src/services/media/searchSuggestions';
import { matchesFilterRule, normalizeLibraryViewState } from '../src/services/media/libraryViewState';
import { AnimeService } from '../src/services/AnimeService';
import { VideoService } from '../src/services/VideoService';
import { ReadingService } from '../src/services/ReadingService';
import { createMockApp, createMockFile, createMetadataService } from './helpers/testHelpers';
import { DEFAULT_SETTINGS } from '../src/constants';

const first = { id: 'first', title: 'Cyberpunk: Edgerunners', alternativeTitles: ['Киберпанк: Бегущие по краю'] };
const second = { id: 'second', title: 'Cyberpunk: Edgerunners 2', alternativeTitles: ['Киберпанк: История второго сезона'] };
const base = { displayName: 'Cyberpunk', nameLower: 'cyberpunk', status: 'planned' as const,
    favorite: false, hasCustomPoster: false, isAdult: false, tags: [], genres: [], year: 2026, userRating: null,
    filePath: 'Cyberpunk.md', parts: [first, second], rawFields: { plot: 'Madhouse hidden description' } };
const search = (query: string, items = [base], sortOrder: 'asc' | 'desc' = 'asc') => filterAndSortMedia({
    items, filter: { searchTerm: query, statuses: [], favoriteOnly: false, adultOnly: false, customOnly: false, tags: [], genres: [] },
    sortField: 'name', sortOrder, isVisible: () => true, getCompletedDate: () => null,
});

describe('predictable library title search', () => {
    it('finds part names and aliases, explains the best match and returns the title once', () => {
        expect(search('edgerunners')).toEqual([base]);
        expect(getTitleSearchMatch(base, '2 edgerunners')).toMatchObject({ source: 'part', partId: 'second', partTitle: second.title });
        expect(getTitleSearchMatch(base, 'второго история')).toMatchObject({ source: 'part-alias', partId: 'second', title: second.alternativeTitles[0] });
        expect(getTitleSearchMatch(base, 'Cyberpunk')).toMatchObject({ source: 'title', rank: 0 });
    });
    it('ignores case, punctuation, spacing and the difference between ё and е', () => {
        const item = { ...base, displayName: 'Ёжик: Beyond—Journey’s End', nameLower: 'ёжик', parts: [] };
        for (const query of ['еЖИК', 'ЁЖИК beyond', 'End   ежик', 'journey s beyond', 'Ёжик!!! beyond']) expect(search(query, [item])).toEqual([item]);
        expect(search('!!!', [item])).toEqual([]);
        expect(search('  ', [item])).toEqual([item]);
    });
    it('requires every word in one title without searching descriptions or credits', () => {
        expect(getTitleSearchMatch(base, 'Madhouse')).toBeNull();
        expect(getTitleSearchMatch(base, 'hidden description')).toBeNull();
        expect(getTitleSearchMatch(base, 'краю второго')).toBeNull();
        expect(getTitleSearchMatch({ ...base, rawFields: { alt_titles: ['First Alias', 'Second Name'] } }, 'First Name')).toBeNull();
    });
    it('ranks exact, prefix and other matches before the selected sort in both directions', () => {
        const items = ['Zed Alpha', 'Alpha Beta', 'Alpha'].map(displayName => ({ ...base, displayName, nameLower: displayName.toLowerCase(), parts: [] }));
        for (const order of ['asc', 'desc'] as const) expect(search('alpha', items, order).map(item => item.displayName)).toEqual(['Alpha', 'Alpha Beta', 'Zed Alpha']);
        expect(search('', items, 'desc').map(item => item.displayName)).toEqual(['Zed Alpha', 'Alpha Beta', 'Alpha']);
    });
    it('still combines part matches with the existing filters', () => {
        expect(filterAndSortMedia({ items: [base], filter: { searchTerm: 'edgerunners', statuses: [], favoriteOnly: true, adultOnly: false, customOnly: false, tags: [], genres: [] },
            sortField: 'name', sortOrder: 'asc', isVisible: () => true, getCompletedDate: () => null })).toEqual([]);
    });
});

describe('explicit credit filters', () => {
    it('suggests saved studios with per-title counts, without changing title search', () => {
        const items = [{ ...base, studios: ['MADHOUSE', 'MADHOUSE'] }, { ...base, studios: ['Madhouse', 'MAPPA'] }];
        const suggestions = collectSearchSuggestions(items, 'anime');
        expect(findSearchSuggestions(suggestions, 'madhouse')).toEqual([{ field: 'studios', value: 'MADHOUSE', count: 2 }]);
        expect(findSearchSuggestions(suggestions, 'm')).toEqual([]);
        expect(search('Madhouse', items)).toEqual([]);
        const rule = addSearchSuggestionRule([], suggestions[0])[0];
        expect(items.every(item => matchesFilterRule(item, rule))).toBe(true);
        expect(matchesFilterRule({ ...base, studios: ['MAPPA'] }, rule)).toBe(false);
    });
    it('supports authors and developers with ordinary serializable rules and no duplicates', () => {
        for (const [media, item, query] of [
            ['book', { ...base, authors: ['J. R. R. Tolkien'] }, 'Tolkien'],
            ['game', { ...base, developer: 'CD PROJEKT RED' }, 'RED PROJEKT'],
        ] as const) {
            const suggestion = findSearchSuggestions(collectSearchSuggestions([item], media), query)[0];
            const rules = addSearchSuggestionRule([], suggestion);
            expect(addSearchSuggestionRule(rules, suggestion)).toEqual(rules);
            const state = normalizeLibraryViewState(JSON.parse(JSON.stringify({ ...DEFAULT_SETTINGS.games.viewState, rules })), DEFAULT_SETTINGS.games.viewState);
            expect(matchesFilterRule(item, state.rules[0])).toBe(true);
        }
    });
});

describe.each(['anime', 'series', 'manga'] as const)('%s part alias persistence', type => {
    it('searches saved part aliases and preserves them when progress is saved', async () => {
        const file = createMockFile('Title.md', 'Title');
        const field = type === 'anime' ? 'anime_parts' : type === 'series' ? 'series_parts' : 'manga_parts';
        const metadata: Record<string, any> = { type, title: 'Collection', [field]: [{ id: 'second', title: second.title,
            kind: type === 'anime' ? 'ona' : type === 'series' ? 'season' : 'volume', volume: 2,
            alt_titles: second.alternativeTitles, aliases: ['Another alias'], status: 'planned', episode_current: 0, episode_total: 10 }] };
        const app = createMockApp({ [file.path]: { frontmatter: metadata } });
        app.vault.getAbstractFileByPath = () => file;
        app.fileManager.processFrontMatter = async (_file, update) => update(metadata);
        const service = type === 'anime' ? new AnimeService(app, createMetadataService(app)) : type === 'series'
            ? new VideoService(app, 'series', '', createMetadataService(app)) : new ReadingService(app, 'manga', '', createMetadataService(app));
        const item = type === 'anime' ? (service as AnimeService).parseAnimeFromCache(file)! : (service as VideoService | ReadingService).parseFromCache(file)!;
        expect(getTitleSearchMatch(item, 'второго')).toMatchObject({ partId: 'second', source: 'part-alias' });
        expect(getTitleSearchMatch(item, 'Another alias')).toMatchObject({ partId: 'second', source: 'part-alias' });
        if (type === 'anime') await (service as AnimeService).updateAnime(item as any, { parts: item.parts as any });
        else await (service as VideoService | ReadingService).updateItem(item as any, { parts: item.parts as any });
        expect(metadata[field][0].alt_titles).toEqual([...second.alternativeTitles, 'Another alias']);
    });
});
