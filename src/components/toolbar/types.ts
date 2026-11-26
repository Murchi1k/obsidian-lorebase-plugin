import { FilterState, LibraryViewState, MediaType, MusicCoverMode, SortField, SortOrder, ViewMode } from '../../types';

export interface ToolbarCallbacks {
    onManageWorkTypes?: () => void;
    onMusicCoverModeChange?: (kind: 'album' | 'track' | 'all', mode: MusicCoverMode) => void;
    onSortChange: (field: SortField, order: SortOrder) => void;
    onFilterChange: (filter: Partial<FilterState>) => void;
    onSearch: (term: string) => void;
    onAdd: () => void;
    onRandom: () => void;
    onStats: () => void;
    onSettings: () => void;
    onReleaseCalendar: () => void;
    onCustomGroups: () => void;
    onViewModeChange: (mode: ViewMode) => void;
    onViewStateChange: (state: LibraryViewState) => void;
    onApplySavedView: (id: string | null) => void;
    onSaveView: (name: string, state: LibraryViewState) => void;
    onUpdateSavedView: (id: string, state: LibraryViewState) => void;
    onRenameSavedView: (id: string, name: string) => void;
    onDeleteSavedView: (id: string) => void;
    onResetView: () => void;
    onMediaTypeChange: (mediaType: MediaType) => void;
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
