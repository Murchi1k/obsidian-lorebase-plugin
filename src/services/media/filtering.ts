import { priorityRank } from '../../utils/priority';
import { FilterState, MediaStatus, SortField, SortOrder } from '../../types';
import { personalDateSortValue } from '../../utils/personalDates';
import { compareNames, hasAllValues } from './serviceUtils';
import { getTitleSearchMatch, normalizeTitleSearch } from './titleSearch';
import {
    FilterableMediaItem,
    getViewFieldValue,
    matchesFilterRule,
    parseDateValue,
} from './libraryViewState';

export type { FilterableMediaItem } from './libraryViewState';

interface FilterAndSortOptions<T extends FilterableMediaItem> {
    items: T[];
    filter: FilterState;
    sortField: SortField;
    sortOrder: SortOrder;
    isVisible: (item: T, hasGlobalFilters: boolean) => boolean;
    getCompletedDate: (item: T) => number | null | undefined;
}

export function filterAndSortMedia<T extends FilterableMediaItem>(
    options: FilterAndSortOptions<T>
): T[] {
    const { items, filter, sortField, sortOrder, isVisible, getCompletedDate } = options;
    const rawSearch = filter.searchTerm ? filter.searchTerm.trim() : '';
    const isSearching = rawSearch.length > 0;
    const searchLower = isSearching ? normalizeTitleSearch(rawSearch) : '';

    const hasGlobalFilters = isSearching
        || filter.favoriteOnly
        || filter.statuses.length > 0
        || filter.tags.length > 0
        || filter.genres.length > 0
        || Boolean(filter.workTypes?.length)
        || Boolean(filter.rules?.length);

    const statusSet = filter.statuses.length > 0 ? new Set<MediaStatus>(filter.statuses) : null;
    const selectedTags = filter.tags.length > 0 ? filter.tags : null;
    const selectedGenres = filter.genres.length > 0 ? filter.genres : null;
    const selectedWorkTypes = filter.workTypes?.length ? new Set(filter.workTypes.map((value) => value.toLocaleLowerCase())) : null;
    const result: T[] = [];
    const searchRanks = new Map<T, number>();

    for (let i = 0, len = items.length; i < len; i++) {
        const item = items[i];
        if (!item) continue;

        if (isSearching) {
            const match = getTitleSearchMatch(item, searchLower);
            if (!match) continue;
            searchRanks.set(item, match.rank);
        }
        if (!isVisible(item, hasGlobalFilters)) continue;
        if (statusSet && !statusSet.has(item.status)) continue;
        if (filter.favoriteOnly && !item.favorite) continue;
        if (selectedTags && !hasAllValues(item.tags, selectedTags)) continue;
        if (selectedGenres && !hasAllValues(item.genres, selectedGenres)) continue;
        if (selectedWorkTypes && (!item.workType || !selectedWorkTypes.has(item.workType.toLocaleLowerCase()))) continue;
        if (filter.rules?.some((rule) => !matchesFilterRule(item, rule))) continue;

        result.push(item);
    }

    const sorted = sortMediaItemsSafe(result, sortField, sortOrder, getCompletedDate);
    return isSearching ? sorted.sort((a, b) => searchRanks.get(a)! - searchRanks.get(b)!) : sorted;
}

function sortMediaItemsSafe<T extends FilterableMediaItem>(
    items: T[],
    field: SortField,
    order: SortOrder,
    getCompletedDate: (item: T) => number | null | undefined
): T[] {
    try {
        items.sort((a, b) => {
            if (field === 'dateCompleted' || field === 'dateFinished' || field === 'dateStarted' || field.startsWith('yaml:')) {
                const aRaw = field === 'dateCompleted'
                    ? a.finished ?? getCompletedDate(a)
                    : getViewFieldValue(a, field);
                const bRaw = field === 'dateCompleted'
                    ? b.finished ?? getCompletedDate(b)
                    : getViewFieldValue(b, field);
                const yamlType = field.startsWith('yaml:') ? field.slice(5).split(':', 1)[0] : '';
                const aValue = field === 'dateFinished' || field === 'dateStarted' || field === 'dateCompleted' || yamlType === 'date'
                    ? (yamlType === 'date' ? parseDateValue(aRaw) : personalDateSortValue(aRaw))
                    : yamlType === 'number'
                        ? normalizeNumber(aRaw)
                    : normalizeComparable(aRaw);
                const bValue = field === 'dateFinished' || field === 'dateStarted' || field === 'dateCompleted' || yamlType === 'date'
                    ? (yamlType === 'date' ? parseDateValue(bRaw) : personalDateSortValue(bRaw))
                    : yamlType === 'number'
                        ? normalizeNumber(bRaw)
                    : normalizeComparable(bRaw);

                const missingComparison = compareMissing(aValue, bValue);
                if (missingComparison !== null) return missingComparison;

                const comparison = compareComparable(aValue!, bValue!);
                if (comparison !== 0) return order === 'asc' ? comparison : -comparison;
                return compareStable(a, b);
            }

            let comparison = 0;

            switch (field) {
                case 'priority':
                    comparison = priorityRank(a.priority) - priorityRank(b.priority);
                    break;
                case 'name':
                    comparison = compareNames(String(a.nameLower || '').toLowerCase(), String(b.nameLower || '').toLowerCase());
                    break;
                case 'series': {
                    const aSeries = String(a.gameSeries || '').trim();
                    const bSeries = String(b.gameSeries || '').trim();

                    if (!aSeries && bSeries) {
                        comparison = order === 'asc' ? 1 : -1;
                    } else if (aSeries && !bSeries) {
                        comparison = order === 'asc' ? -1 : 1;
                    } else {
                        comparison = compareNames(aSeries, bSeries);
                        if (comparison === 0) {
                            comparison = (Number(a.year) || 0) - (Number(b.year) || 0);
                        }
                        if (comparison === 0) {
                            comparison = compareNames(String(a.nameLower || ''), String(b.nameLower || ''));
                        }
                    }
                    break;
                }
                case 'year':
                    comparison = (Number(a.year) || 0) - (Number(b.year) || 0);
                    break;
                case 'rating':
                    comparison = (Number(a.userRating) || 0) - (Number(b.userRating) || 0);
                    break;
                default:
                    comparison = 0;
            }

            if (comparison !== 0) return order === 'asc' ? comparison : -comparison;
            return compareStable(a, b);
        });
    } catch (e) {
        console.error('Error during sorting:', e);
    }

    return items;
}

function normalizeComparable(value: unknown): string | number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (Array.isArray(value)) return value.length ? value.map(String).join('\u0000').toLocaleLowerCase() : null;
    if (typeof value === 'string' && value.trim()) return value.trim().toLocaleLowerCase();
    return null;
}

function normalizeNumber(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function compareMissing(
    left: string | number | null,
    right: string | number | null
): number | null {
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    return null;
}

function compareComparable(left: string | number, right: string | number): number {
    if (typeof left === 'number' && typeof right === 'number') return left - right;
    return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' });
}

function compareStable(left: FilterableMediaItem, right: FilterableMediaItem): number {
    const name = compareNames(left.nameLower || left.displayName, right.nameLower || right.displayName);
    if (name !== 0) return name;
    return String(left.filePath ?? '').localeCompare(String(right.filePath ?? ''));
}
