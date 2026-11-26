import { describe, expect, it } from 'vitest';
import { filterAndSortMedia } from '../src/services/media/filtering';
import {
    collectYamlFieldDefinitions,
    extractSimpleFrontmatter,
    groupMediaItems,
    matchesFilterRule,
    normalizeLibraryViewState,
    parseDateValue,
} from '../src/services/media/libraryViewState';
import { FilterRule, LibraryViewState, MediaItem } from '../src/types';
import { normalizeLibraryViewSettings } from '../src/settings/settingsNormalization';

function item(overrides: Record<string, unknown> = {}) {
    return {
        filePath: String(overrides.filePath ?? 'Books/Item.md'),
        displayName: String(overrides.displayName ?? 'Item'),
        nameLower: String(overrides.displayName ?? 'Item').toLowerCase(),
        gameSeries: '',
        year: 2024,
        userRating: 4,
        favorite: false,
        hasCustomPoster: false,
        isAdult: false,
        status: 'completed' as const,
        tags: ['fiction', 'priority'],
        genres: ['fantasy'],
        started: '2024-01-10',
        finished: '2024-02-20',
        rawFields: {},
        ...overrides,
    };
}

function rule(overrides: Partial<FilterRule>): FilterRule {
    return {
        id: 'rule-1',
        field: 'name',
        fieldType: 'text',
        operator: 'contains',
        value: 'item',
        ...overrides,
    };
}

describe('library view rule engine', () => {
    it('combines rules with AND and supports list operators', () => {
        const source = [item(), item({ displayName: 'Other', tags: ['fiction'] })];
        const filtered = filterAndSortMedia({
            items: source,
            filter: {
                statuses: [], favoriteOnly: false, adultOnly: false, customOnly: false,
                searchTerm: '', tags: [], genres: [],
                rules: [
                    rule({ field: 'tags', fieldType: 'list', operator: 'containsAll', value: ['fiction', 'priority'] }),
                    rule({ id: 'rule-2', field: 'rating', fieldType: 'number', operator: 'greater', value: 3 }),
                ],
            },
            sortField: 'name',
            sortOrder: 'asc',
            isVisible: () => true,
            getCompletedDate: () => null,
        });
        expect(filtered.map((entry) => entry.displayName)).toEqual(['Item']);
    });


    it('matches linked credits by their display names while keeping the original YAML value', () => {
        const source = item({
            rawFields: {
                developers: ['[[Studios/Developer|Developer]]'],
                publishers: ['[[Publisher]]'],
                studios: ['[[Animation Studio]]'],
                actors: ['[[Lead Actor]]'],
                directors: '[[Directors/Name|Surname, Name]]',
            },
        });
        for (const [field, label] of [
            ['developer', 'Developer'], ['publisher', 'Publisher'], ['studios', 'Animation Studio'],
            ['actors', 'Lead Actor'], ['director', 'Surname, Name'],
        ]) {
            expect(matchesFilterRule(source, rule({
                field, fieldType: 'list', operator: 'containsAny', value: [label],
            }))).toBe(true);
        }
        expect(source.rawFields).toMatchObject({ directors: '[[Directors/Name|Surname, Name]]' });
    });

    it('evaluates dynamic calendar month and year rules', () => {
        const current = item({ finished: '2026-07-12' });
        expect(matchesFilterRule(current, rule({
            field: 'dateFinished', fieldType: 'date', operator: 'thisMonth',
        }), new Date(2026, 6, 27))).toBe(true);
        expect(matchesFilterRule(current, rule({
            field: 'dateFinished', fieldType: 'date', operator: 'thisYear',
        }), new Date(2026, 6, 27))).toBe(true);
    });

    it('uses inclusive local-day boundaries for date ranges', () => {
        expect(matchesFilterRule(item({ finished: '2024-02-20' }), rule({
            field: 'dateFinished',
            fieldType: 'date',
            operator: 'between',
            value: '2024-02-01',
            valueTo: '2024-02-20',
        }))).toBe(true);
        expect(parseDateValue('2024-02-31')).toBeNull();
    });

    it('keeps missing values last for both custom sort directions', () => {
        const source = [
            item({ displayName: 'Missing', rawFields: {} }),
            item({ displayName: 'Ten', rawFields: { priority: 10 } }),
            item({ displayName: 'Two', rawFields: { priority: 2 } }),
        ];
        const filter = {
            statuses: [], favoriteOnly: false, adultOnly: false, customOnly: false,
            searchTerm: '', tags: [], genres: [], rules: [],
        };
        const descending = filterAndSortMedia({
            items: source, filter, sortField: 'yaml:priority', sortOrder: 'desc',
            isVisible: () => true, getCompletedDate: () => null,
        });
        expect(descending.map((entry) => entry.displayName)).toEqual(['Ten', 'Two', 'Missing']);
    });

    it('sorts inferred custom date fields chronologically', () => {
        const source = [
            item({ displayName: 'Later', rawFields: { read_on: 'July 20, 2026' } }),
            item({ displayName: 'Earlier', rawFields: { read_on: 'January 10, 2026' } }),
        ];
        const sorted = filterAndSortMedia({
            items: source,
            filter: {
                statuses: [], favoriteOnly: false, adultOnly: false, customOnly: false,
                searchTerm: '', tags: [], genres: [], rules: [],
            },
            sortField: 'yaml:date:read_on',
            sortOrder: 'asc',
            isVisible: () => true,
            getCompletedDate: () => null,
        });
        expect(sorted.map((entry) => entry.displayName)).toEqual(['Earlier', 'Later']);
    });
});

describe('library view metadata and persistence', () => {
    it('indexes scalar YAML values and ignores nested objects', () => {
        const raw = extractSimpleFrontmatter({
            priority: 3,
            mood: ['calm', 'dark'],
            published: '2026-07-01',
            nested: { value: 1 },
        });
        expect(raw).toEqual({ priority: 3, mood: ['calm', 'dark'], published: '2026-07-01' });
        const definitions = collectYamlFieldDefinitions([
            item({ rawFields: raw }) as unknown as MediaItem,
        ]);
        expect(definitions.map((entry) => [entry.id, entry.type])).toEqual([
            ['yaml:mood', 'list'],
            ['yaml:priority', 'number'],
            ['yaml:published', 'date'],
        ]);
    });

    it('migrates legacy completion sorting', () => {
        const fallback: LibraryViewState = {
            sort: { field: 'name', order: 'asc' },
            group: { mode: 'none', order: 'desc' },
            rules: [], tags: [], genres: [],
        };
        const normalized = normalizeLibraryViewState({
            sort: { field: 'dateCompleted', order: 'desc' },
        }, fallback);
        expect(normalized.sort).toEqual({ field: 'dateFinished', order: 'desc' });
        const settings = normalizeLibraryViewSettings({
            sortField: 'dateCompleted',
            sortOrder: 'desc',
        }, fallback);
        expect(settings.viewState.sort).toEqual({ field: 'dateFinished', order: 'desc' });
        expect(settings.viewState.group.mode).toBe('none');
    });

    it('normalizes multi-select work types and migrates the former single value', () => {
        const fallback: LibraryViewState = {
            sort: { field: 'name', order: 'asc' },
            group: { mode: 'none', order: 'desc' },
            rules: [], tags: [], genres: [], workTypes: [],
        };
        expect(normalizeLibraryViewState({ workTypes: ['Manhwa', 'Webtoon', 'Manhwa'] }, fallback).workTypes)
            .toEqual(['Manhwa', 'Webtoon']);
        expect(normalizeLibraryViewState({ workType: 'Manhua' }, fallback).workTypes)
            .toEqual(['Manhua']);
    });

    it('groups completed items by month and keeps missing dates last', () => {
        const grouped = groupMediaItems([
            item({ displayName: 'June', finished: '2026-06-03' }),
            item({ displayName: 'July', finished: '2026-07-04' }),
            item({ displayName: 'Missing', finished: null }),
        ] as unknown as MediaItem[], 'finishedMonth', 'desc', 'en-US');
        expect(grouped.map((entry) => entry.label)).toEqual(['July 2026', 'June 2026', 'No date']);
        expect(grouped.map((entry) => entry.items.length)).toEqual([1, 1, 1]);
    });


    it('groups start and finish dates by calendar day while preserving the order of cards inside each group', () => {
        const source = [
            item({ displayName: 'First card', started: '2026-11-08', finished: '2026-11-09' }),
            item({ displayName: 'Second card', started: '2026-11-08T23:55:00', finished: '2026-11-08' }),
            item({ displayName: 'Third card', started: '2026-11-07', finished: '2026-11-09' }),
            item({ displayName: 'Without dates', started: null, finished: '2026-11-31' }),
        ] as unknown as MediaItem[];
        const started = groupMediaItems(source, 'dateStarted', 'desc', 'en-US');
        expect(started.map(group => [group.label, ...group.items.map(entry => entry.displayName)])).toEqual([
            ['November 8, 2026', 'First card', 'Second card'], ['November 7, 2026', 'Third card'], ['No date', 'Without dates'],
        ]);
        const finished = groupMediaItems(source, 'dateFinished', 'asc', 'en-US');
        expect(finished.map(group => group.label)).toEqual(['November 8, 2026', 'November 9, 2026', 'No date']);
    });

    it('uses library status labels and orders personal ratings numerically', () => {
        const source = [
            item({ status: 'completed', userRating: 10 }),
            item({ status: 'playing', userRating: 2 }),
            item({ status: 'playing', userRating: null }),
        ] as unknown as MediaItem[];
        const statuses = [{ status: 'completed', label: 'Finished' }, { status: 'playing', label: 'Active' }] as const;
        expect(groupMediaItems(source, 'status', 'asc', 'en-US', statuses).map(group => group.label)).toEqual(['Finished', 'Active']);
        expect(groupMediaItems(source, 'rating', 'asc', 'en-US').map(group => group.label)).toEqual(['2', '10', 'No value']);
    });

    it('restores YAML grouping from saved views and separates missing values from zero and false', () => {
        const fallback: LibraryViewState = {
            sort: { field: 'name', order: 'asc' }, group: { mode: 'none', order: 'desc' },
            rules: [], tags: [], genres: [],
        };
        const saved = { ...fallback, group: { mode: 'yaml:number:priority', order: 'asc' } };
        const settings = normalizeLibraryViewSettings({
            savedViews: [{ id: 'priority', name: 'Priority', state: saved }], activeSavedViewId: 'priority',
        }, fallback);
        const { mode, order } = settings.savedViews[0].state.group;
        expect(mode).toBe('yaml:number:priority');
        const source = [
            item({ rawFields: { priority: '10', queued: true, mood: ['Warm', 'Calm'] } }),
            item({ rawFields: { priority: 0, queued: false, mood: ['calm', 'warm'] } }),
            item({ rawFields: { priority: ' ', queued: null, mood: [] } }),
        ] as unknown as MediaItem[];
        expect(groupMediaItems(source, mode, order, 'en-US').map(group => group.label)).toEqual(['0', '10', 'No value']);
        expect(groupMediaItems(source, mode, 'desc', 'en-US').map(group => group.label)).toEqual(['10', '0', 'No value']);
        expect(groupMediaItems(source, 'yaml:boolean:queued', 'asc', 'en-US').map(group => group.label)).toEqual(['No', 'Yes', 'No value']);
        expect(groupMediaItems(source, 'yaml:list:mood', 'asc', 'en-US').map(group => group.items.length)).toEqual([2, 1]);
    });
    it('filters manga through the dedicated work type selector', () => {
        const filtered = filterAndSortMedia({
            items: [
                item({ type: 'manga', displayName: 'A', workType: 'Manhwa' }),
                item({ type: 'manga', displayName: 'B', workType: 'Graphic novel' }),
                item({ type: 'manga', displayName: 'C', workType: 'Manhwa' }),
            ],
            filter: {
                statuses: [], favoriteOnly: false, adultOnly: false, customOnly: false,
                searchTerm: '', tags: [], genres: [], workTypes: ['Manhwa'], rules: [],
            },
            sortField: 'name', sortOrder: 'asc', isVisible: () => true, getCompletedDate: () => null,
        });
        expect(filtered.map((entry) => entry.displayName)).toEqual(['A', 'C']);
    });
});
