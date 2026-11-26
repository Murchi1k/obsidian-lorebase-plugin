import type { FilterRule, Language, MediaType } from '../../types';
import type { FilterableMediaItem } from './libraryViewState';
import { createRuleId, getViewFieldValue } from './libraryViewState';
import { titleSearchRank } from './titleSearch';
import { getCatalogFieldId } from './libraryFieldCatalog';

export type SearchCreditField = 'studios' | 'authors' | 'developer';
export interface SearchFilterSuggestion { field: SearchCreditField; value: string; count: number }
const copy = {
    en: { studios: 'Studio', authors: 'Author', developer: 'Developer', filters: 'Filter suggestions', found: 'Found in title parts', part: 'Part', open: 'Open part', suggestions: 'Search suggestions', searchFor: 'Search for', layoutHint: 'Search with the corrected keyboard layout' },
    ru: { studios: 'Студия', authors: 'Автор', developer: 'Разработчик', filters: 'Подсказки фильтров', found: 'Найдено в составе', part: 'В составе', open: 'Открыть часть', suggestions: 'Подсказки поиска', searchFor: 'Искать', layoutHint: 'Найти с исправленной раскладкой' },
    uk: { studios: 'Студія', authors: 'Автор', developer: 'Розробник', filters: 'Підказки фільтрів', found: 'Знайдено у складі', part: 'У складі', open: 'Відкрити частину', suggestions: 'Підказки пошуку', searchFor: 'Шукати', layoutHint: 'Знайти з виправленою розкладкою' },
    'zh-CN': { studios: '工作室', authors: '作者', developer: '开发商', filters: '筛选建议', found: '在作品分部中找到', part: '分部', open: '打开分部', suggestions: '搜索建议', searchFor: '搜索', layoutHint: '使用修正后的键盘布局搜索' },
};
export const librarySearchCopy = (language: Language) => copy[language] ?? copy.en;

export function searchCreditFields(media: MediaType): SearchCreditField[] {
    return media === 'anime' || media === 'series' ? ['studios']
        : media === 'book' || media === 'manga' ? ['authors'] : media === 'game' ? ['developer'] : [];
}

export function collectSearchSuggestions(items: readonly FilterableMediaItem[], media: MediaType): SearchFilterSuggestion[] {
    const index = new Map<string, SearchFilterSuggestion>();
    for (const item of items) for (const field of searchCreditFields(media)) {
        const raw = getViewFieldValue(item, field);
        const values = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
        const seen = new Set<string>();
        for (const value of values) {
            if (typeof value !== 'string' || !value.trim()) continue;
            const key = `${field}:${value.trim().toLocaleLowerCase()}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const entry = index.get(key);
            if (entry) entry.count++;
            else index.set(key, { field, value: value.trim(), count: 1 });
        }
    }
    return Array.from(index.values());
}

export function findSearchSuggestions(index: readonly SearchFilterSuggestion[], query: string): SearchFilterSuggestion[] {
    if (query.trim().length < 2) return [];
    return index.map(suggestion => ({ suggestion, rank: titleSearchRank(suggestion.value, query) }))
        .filter((entry): entry is { suggestion: SearchFilterSuggestion; rank: number } => entry.rank !== null)
        .sort((a, b) => a.rank - b.rank || a.suggestion.value.localeCompare(b.suggestion.value))
        .slice(0, 8).map(entry => entry.suggestion);
}

export function addSearchSuggestionRule(rules: readonly FilterRule[], suggestion: SearchFilterSuggestion): FilterRule[] {
    const same = rules.some(rule => getCatalogFieldId(rule.field) === suggestion.field
        && (rule.operator === 'equals' && rule.value === suggestion.value
            || ['containsAny', 'containsAll', 'notContains'].includes(rule.operator) && Array.isArray(rule.value)
                && rule.value.some(value => value.toLocaleLowerCase() === suggestion.value.toLocaleLowerCase())));
    if (same) return [...rules];
    const existing = rules.find(rule => getCatalogFieldId(rule.field) === suggestion.field);
    if (existing) return rules.map(rule => rule !== existing ? rule : {
        ...rule, field: suggestion.field, fieldType: 'list',
        operator: ['containsAny', 'containsAll', 'notContains'].includes(rule.operator) ? rule.operator : 'containsAny',
        value: [...(Array.isArray(rule.value) ? rule.value : typeof rule.value === 'string' && rule.value ? [rule.value] : []), suggestion.value],
    });
    return [...rules, { id: createRuleId(), field: suggestion.field,
        fieldType: 'list', operator: 'containsAny', value: [suggestion.value] }];
}
