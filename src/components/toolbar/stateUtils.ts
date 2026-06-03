import { FilterState } from '../../types';

export function hasActiveFilters(filter: FilterState): boolean {
    return (
        filter.statuses.length > 0 ||
        filter.favoriteOnly ||
        filter.adultOnly ||
        filter.customOnly
    );
}

export function hasActiveTagFilters(filter: FilterState): boolean {
    return (
        filter.tags.length > 0 ||
        filter.genres.length > 0
    );
}
