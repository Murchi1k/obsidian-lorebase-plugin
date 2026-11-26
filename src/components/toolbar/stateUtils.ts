import { FilterState } from '../../types';

export function hasActiveTagFilters(filter: FilterState): boolean {
    return (
        filter.tags.length > 0 ||
        filter.genres.length > 0
    );
}
