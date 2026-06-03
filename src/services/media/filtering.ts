import { FilterState, MediaStatus, SortField, SortOrder, UserRating } from '../../types';
import { compareNames, hasAllValues } from './serviceUtils';

export interface FilterableMediaItem {
    displayName: string;
    nameLower: string;
    year: number | null;
    userRating: UserRating;
    favorite: boolean;
    hasCustomPoster: boolean;
    isAdult: boolean;
    status: MediaStatus;
    tags: string[];
    genres: string[];
}

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
    const searchLower = isSearching ? rawSearch.toLowerCase() : '';

    const hasGlobalFilters = isSearching
        || filter.favoriteOnly
        || filter.statuses.length > 0
        || filter.tags.length > 0
        || filter.genres.length > 0;

    const statusSet = filter.statuses.length > 0 ? new Set<MediaStatus>(filter.statuses) : null;
    const selectedTags = filter.tags.length > 0 ? filter.tags : null;
    const selectedGenres = filter.genres.length > 0 ? filter.genres : null;
    const result: T[] = [];

    for (let i = 0, len = items.length; i < len; i++) {
        const item = items[i];
        if (!item) continue;

        if (isSearching && !(item.nameLower && item.nameLower.includes(searchLower))) continue;
        if (!isVisible(item, hasGlobalFilters)) continue;
        if (statusSet && !statusSet.has(item.status)) continue;
        if (filter.favoriteOnly && !item.favorite) continue;
        if (selectedTags && !hasAllValues(item.tags, selectedTags)) continue;
        if (selectedGenres && !hasAllValues(item.genres, selectedGenres)) continue;

        result.push(item);
    }

    return sortMediaItemsSafe(result, sortField, sortOrder, getCompletedDate);
}

export function sortMediaItemsSafe<T extends FilterableMediaItem>(
    items: T[],
    field: SortField,
    order: SortOrder,
    getCompletedDate: (item: T) => number | null | undefined
): T[] {
    try {
        items.sort((a, b) => {
            if (field === 'dateCompleted') {
                const aDate = Number(getCompletedDate(a));
                const bDate = Number(getCompletedDate(b));
                const aValid = Number.isFinite(aDate) && aDate > 0;
                const bValid = Number.isFinite(bDate) && bDate > 0;

                if (!aValid && !bValid) return 0;
                if (!aValid) return 1;
                if (!bValid) return -1;

                const diff = aDate - bDate;
                return order === 'asc' ? diff : -diff;
            }

            let comparison = 0;

            switch (field) {
                case 'name':
                    comparison = compareNames(String(a.nameLower || '').toLowerCase(), String(b.nameLower || '').toLowerCase());
                    break;
                case 'year':
                    comparison = (Number(a.year) || 0) - (Number(b.year) || 0);
                    break;
                case 'rating':
                    comparison = (Number(a.userRating) || 0) - (Number(b.userRating) || 0);
                    break;
                default:
                    comparison = 0;
            }

            return order === 'asc' ? comparison : -comparison;
        });
    } catch (e) {
        console.error('Error during sorting:', e);
    }

    return items;
}
