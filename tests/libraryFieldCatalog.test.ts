import { describe, expect, it } from 'vitest';
import { getBuiltInFieldDefinitions } from '../src/views/library/viewOptions';
import { buildLibraryFieldCatalog, getCatalogFieldId, getLibraryFieldGroup, populateFilterOptions, reconcileCatalogYamlField } from '../src/services/media/libraryFieldCatalog';
import { collectYamlFieldDefinitions, getViewFieldValue, matchesFilterRule, normalizeLibraryViewState } from '../src/services/media/libraryViewState';
import { addSearchSuggestionRule } from '../src/services/media/searchSuggestions';
import { DEFAULT_SETTINGS } from '../src/constants';
import type { FilterRule, MediaItem } from '../src/types';

const item = (overrides: object = {}) => ({ type: 'anime', displayName: 'Collection', nameLower: 'collection', filePath: 'Collection.md',
    year: 2024, userRating: 8, favorite: false, hasCustomPoster: false, isAdult: false, status: 'watching', tags: [], genres: [], rawFields: {},
    activePartId: 'tv', format: 'tv', communityRating: 8.5,
    parts: [{ id: 'tv', title: 'Season', kind: 'tv', episodeCurrent: 6, episodeTotal: 12 }, { id: 'ova', title: 'Extra', kind: 'ova', episodeCurrent: 0, episodeTotal: 2 }], ...overrides,
}) as unknown as MediaItem;
const rule = (field: string, value: FilterRule['value'], other: Partial<FilterRule> = {}): FilterRule => ({
    id: field, field, fieldType: Array.isArray(value) ? 'list' : 'number', operator: Array.isArray(value) ? 'containsAny' : 'equals', value, ...other,
});

describe('standard library field catalog', () => {
    it('classifies movie credits as title metadata and does not offer multipart format filters for movies', () => {
        const builtins = getBuiltInFieldDefinitions('movie', [], { showAdult: false, showCustom: false });
        const video = item({ type: 'movie', actors: 'Actor A, Actor B', director: 'Director A', runtime: '120 min',
            rawFields: { actors: ['Actor A', 'Actor B'], directors: ['Director A'], runtime: 120 } });
        const fields = buildLibraryFieldCatalog(builtins, [video], [], { actors: 'actors', cast: 'actors', director: 'directors', directors: 'directors' });
        for (const id of ['actors', 'director', 'runtime']) {
            expect(getLibraryFieldGroup(fields.find(field => field.id === id)!)).toBe('title');
            expect(fields.some(field => field.id === `yaml:${id}`)).toBe(false);
        }
        expect(fields.find(field => field.id === 'actors')?.options?.map(option => option.value)).toEqual(['Actor A', 'Actor B']);
        expect(fields.find(field => field.id === 'actors')?.label).not.toContain(' · ');
        expect(getViewFieldValue(video, 'runtime')).toBe(120);
        expect(fields.some(field => ['activePartFormat', 'partFormats'].includes(field.id))).toBe(false);
        expect(getCatalogFieldId('yaml:actors')).toBe('actors');
    });
    it('keeps the custom-cover filter available when no notes have a custom cover', () => {
        const builtins = getBuiltInFieldDefinitions('game', [], { showAdult: true, showCustom: true });
        const plain = item({ type: 'game', hasCustomPoster: false, rawFields: {} });
        const fields = buildLibraryFieldCatalog(builtins, [plain], []);
        expect(fields.find(field => field.id === 'custom')).toMatchObject({ type: 'boolean', noteCount: 0, operators: ['isTrue', 'isFalse'] });
        expect(buildLibraryFieldCatalog(builtins, [], []).some(field => field.id === 'custom')).toBe(true);
        expect(matchesFilterRule(plain, rule('custom', undefined, { fieldType: 'boolean', operator: 'isFalse' }))).toBe(true);
        expect(matchesFilterRule(plain, rule('custom', undefined, { fieldType: 'boolean', operator: 'isTrue' }))).toBe(false);
        expect(matchesFilterRule(item({ hasCustomPoster: true }), rule('custom', undefined, { fieldType: 'boolean', operator: 'isTrue' }))).toBe(true);
    });
    it('provides typed fields without note-property configuration and keeps formats separate', () => {
        const fields = getBuiltInFieldDefinitions('anime', [], { showAdult: true, showCustom: false });
        expect(fields.find(field => field.id === 'studios')?.type).toBe('list');
        for (const id of ['activePartFormat', 'partFormats']) expect(fields.find(field => field.id === id)?.options?.map(option => option.value)).toContain('ova');
        for (const id of ['totalEpisodes', 'watchProgress', 'communityRating']) expect(fields.find(field => field.id === id)?.operators).toContain('between');
        const current = item();
        expect(matchesFilterRule(current, rule('activePartFormat', ['ova']))).toBe(false);
        expect(matchesFilterRule(current, rule('partFormats', ['ova']))).toBe(true);
        expect(matchesFilterRule(item({ activePartId: 'ova' }), rule('activePartFormat', ['ova']))).toBe(true);
        expect(matchesFilterRule(current, rule('partFormats', ['tv', 'ova'], { operator: 'containsAll' }))).toBe(true);
    });
    it('uses the whole composition for episode totals and percentage, preserving unknown totals', () => {
        expect(getViewFieldValue(item(), 'totalEpisodes')).toBe(14);
        expect(getViewFieldValue(item(), 'watchProgress')).toBe(43);
        expect(matchesFilterRule(item(), rule('watchProgress', 40, { operator: 'between', valueTo: 50 }))).toBe(true);
        const unknown = item({ parts: [{ id: 'tv', title: 'A', kind: 'tv', episodeTotal: null, episodeCurrent: 8 }] });
        expect(getViewFieldValue(unknown, 'watchProgress')).toBeNull();
        expect(matchesFilterRule(unknown, rule('totalEpisodes', undefined, { operator: 'empty' }))).toBe(true);
        expect(getViewFieldValue(item({ parts: [], episodeCurrent: 2, episodeTotal: 10 }), 'watchProgress')).toBe(20);
    });
    it('deduplicates full-library choices and retains selections missing from the library', () => {
        const fields = getBuiltInFieldDefinitions('anime', [], { showAdult: true, showCustom: false });
        const items = [item({ studios: ['Madhouse'] }), item({ studios: ['MADHOUSE', 'MAPPA'] })];
        const selected = rule('studios', ['Removed studio']);
        const options = populateFilterOptions(fields, items, [selected]).find(field => field.id === 'studios')!.options!;
        expect(options.map(option => option.value)).toEqual(['Madhouse', 'MAPPA', 'Removed studio']);
        expect(populateFilterOptions(fields, [], [selected]).find(field => field.id === 'studios')!.options).toEqual([{ value: 'Removed studio', label: 'Removed studio' }]);
    });
    it('hides plugin structures, identifiers, images and standard duplicates but keeps custom properties', () => {
        const fields = collectYamlFieldDefinitions([item({ rawFields: { active_part_id: 'tv', anime_parts: [], image: 'https://image', poster_b: 'x', integration_id: '10', anilist_id: '10',
            format: 'TV', communityRating: 8.5, studios: ['Madhouse'], my_studios: ['Madhouse'], priority: 3, mood: ['calm'] } })], ['my_studios']);
        expect(fields.map(field => field.id)).toEqual(['yaml:mood', 'yaml:priority']);
    });
    it('keeps newly added or cleared filters neutral and persists composed numeric filters', () => {
        expect(matchesFilterRule(item(), rule('studios', []))).toBe(true);
        expect(matchesFilterRule(item(), rule('communityRating', ''))).toBe(true);
        const state = normalizeLibraryViewState(JSON.parse(JSON.stringify({ ...DEFAULT_SETTINGS.anime.viewState,
            rules: [rule('communityRating', 8, { operator: 'between', valueTo: 9 }), rule('partFormats', ['ova'])],
        })), DEFAULT_SETTINGS.anime.viewState);
        expect(state.rules.every(filter => matchesFilterRule(item(), filter))).toBe(true);
        expect(state.rules.every(filter => matchesFilterRule(item({ communityRating: 7 }), filter))).toBe(false);
    });
    it('does not offer game modes or retain their obsolete built-in filters', () => {
        const fields = getBuiltInFieldDefinitions('game', [], { showAdult: true, showCustom: true });
        expect(fields.some(field => field.id === 'gameModes')).toBe(false);
        expect(collectYamlFieldDefinitions([item({ rawFields: { game_modes: [] } })])).toEqual([]);
        expect(normalizeLibraryViewState({ ...DEFAULT_SETTINGS.games.viewState, rules: [rule('gameModes', ['solo'])] }, DEFAULT_SETTINGS.games.viewState).rules).toEqual([]);
    });
    it('adds several studio search suggestions to one rule and preserves its id', () => {
        const first = addSearchSuggestionRule([], { field: 'studios', value: 'Madhouse', count: 1 });
        const next = addSearchSuggestionRule(first, { field: 'studios', value: 'MAPPA', count: 1 });
        expect(next).toHaveLength(1);
        expect(next[0]).toMatchObject({ id: first[0].id, value: ['Madhouse', 'MAPPA'] });
        expect(addSearchSuggestionRule(next, { field: 'studios', value: 'MADHOUSE', count: 1 })).toEqual(next);
    });
    it('upgrades old known format rules while preserving partial text rules and unrelated saved filters', () => {
        const state = normalizeLibraryViewState({ ...DEFAULT_SETTINGS.anime.viewState, rules: [
            rule('yaml:format', 'OVA', { fieldType: 'text', operator: 'contains' }),
            rule('yaml:format', 'on', { id: 'partial', fieldType: 'text', operator: 'contains' }),
            rule('yaml:mood', ['calm']),
        ] }, DEFAULT_SETTINGS.anime.viewState);
        expect(state.rules[0]).toMatchObject({ field: 'activePartFormat', operator: 'containsAny', value: ['ova'] });
        expect(state.rules[1]).toMatchObject({ field: 'yaml:format', operator: 'contains', value: 'on' });
        expect(state.rules[2]).toMatchObject({ field: 'yaml:mood', value: ['calm'] });
    });
    it('indexes actual properties, omits empty legacy placeholders and updates counts as notes change', () => {
        const builtins = getBuiltInFieldDefinitions('game', [], { showAdult: true, showCustom: true });
        const empty = item({ type: 'game', communityRating: null, parts: [], rawFields: { playtime: '', metacritic: null, completion_percent: [], lorebase_source_snapshot: [] } });
        const first = buildLibraryFieldCatalog(builtins, [empty], []);
        expect(first.some(field => field.id.startsWith('yaml:'))).toBe(false);
        expect(first.some(field => field.id === 'communityRating')).toBe(false);
        const updated = item({ type: 'game', rawFields: { my_new_field: null, my_empty_list: [], metacritic: '85', project_code: '001', playtime: 0 } });
        const next = buildLibraryFieldCatalog(builtins, [empty, updated], []);
        expect(next.find(field => field.id === 'yaml:my_new_field')).toMatchObject({ type: 'text', noteCount: 1 });
        expect(next.find(field => field.id === 'yaml:my_empty_list')).toMatchObject({ type: 'list', noteCount: 1 });
        expect(next.find(field => field.id === 'yaml:metacritic')).toMatchObject({ type: 'number', noteCount: 2 });
        expect(next.find(field => field.id === 'yaml:project_code')?.type).toBe('text');
        expect(next.find(field => field.id === 'yaml:playtime')?.noteCount).toBe(2);
        expect(reconcileCatalogYamlField('yaml:date:metacritic', next)).toBe('yaml:number:metacritic');
        expect(reconcileCatalogYamlField('yaml:number:deleted', next)).toBe('yaml:number:deleted');
    });
    it('keeps renamed properties unless a real built-in filter already represents them', () => {
        const fields = buildLibraryFieldCatalog(getBuiltInFieldDefinitions('anime', [], { showAdult: true, showCustom: false }),
            [item({ rawFields: { xys: 'cover.jpg', my_studios: ['Madhouse'], hours_to_beat: 10, my_mood: 'calm' } })], [],
            { image: 'xys', studios: 'my_studios', main: 'hours_to_beat', mood: 'my_mood' });
        expect(fields.filter(field => field.source === 'yaml').map(field => field.id)).toEqual(['yaml:hours_to_beat', 'yaml:my_mood', 'yaml:xys']);
    });
});
