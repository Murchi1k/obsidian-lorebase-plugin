import { FilterState, SortField, SortOrder, ViewMode } from '../../types';

export interface ToolbarCallbacks {
    onSortChange: (field: SortField, order: SortOrder) => void;
    onFilterChange: (filter: Partial<FilterState>) => void;
    onSearch: (term: string) => void;
    onAdd: () => void;
    onRandom: () => void;
    onStats: () => void;
    onSettings: () => void;
    onViewModeChange: (mode: ViewMode) => void;
}

export type TagSummary = {
    id: string;
    label: string;
    count: number;
};

export type TagGroups = {
    planTags?: TagSummary[];
    tags: TagSummary[];
    genres: TagSummary[];
};
