import { MediaItem, MediaStatus, MediaType, SortField, StatusLabelSettings } from '../../types';
import { t } from '../../localization';

export function getStatusOptionsForMediaType(
    mediaType: MediaType,
    statusLabels?: StatusLabelSettings
): Array<{ status: MediaStatus; label: string }> {
    const labelFor = (status: MediaStatus, fallback: string): string => {
        const labels = mediaType === 'anime'
            ? statusLabels?.anime
            : mediaType === 'movie'
                ? statusLabels?.movies
                : mediaType === 'series'
                    ? statusLabels?.series
                    : mediaType === 'book'
                        ? statusLabels?.books
                        : mediaType === 'manga'
                            ? statusLabels?.manga
                            : statusLabels?.games;
        return (labels as Partial<Record<MediaStatus, string>> | undefined)?.[status]?.trim() || fallback;
    };
    if (mediaType === 'anime' || mediaType === 'movie' || mediaType === 'series' || mediaType === 'book' || mediaType === 'manga') {
        const plannedLabel = mediaType === 'book' || mediaType === 'manga' ? t('statusPlanToRead') : t('statusPlanned');
        const activeLabel = mediaType === 'book' || mediaType === 'manga' ? t('statusReading') : t('statusWatching');
        return [
            { status: 'planned', label: labelFor('planned', plannedLabel) },
            { status: 'watching', label: labelFor('watching', activeLabel) },
            { status: 'completed', label: labelFor('completed', t('statusCompleted')) },
            { status: 'dropped', label: labelFor('dropped', t('statusDropped')) },
            { status: 'paused', label: labelFor('paused', t('statusPaused')) },
        ];
    }

    return [
        { status: 'completed', label: labelFor('completed', t('statusPlayed')) },
        { status: 'playing', label: labelFor('playing', t('statusPlaying')) },
        { status: 'dropped', label: labelFor('dropped', t('statusDropped')) },
        { status: 'wishlist', label: labelFor('wishlist', t('statusWishlist')) },
        { status: 'not_started', label: labelFor('not_started', t('statusNotStarted')) },
        { status: 'sandbox', label: labelFor('sandbox', t('statusSandbox')) },
    ];
}

export function getSortOptionsForMediaType(mediaType: MediaType): Array<{ field: SortField; label: string }> {
    if (mediaType === 'anime' || mediaType === 'movie' || mediaType === 'series' || mediaType === 'book' || mediaType === 'manga') {
        return [
            { field: 'name', label: t('sortName') },
            { field: 'rating', label: t('sortRating') },
            { field: 'year', label: t('sortYear') },
            { field: 'dateCompleted', label: t('sortDateWatched') },
        ];
    }

    return [
        { field: 'series', label: t('sortSeries') },
        { field: 'name', label: t('sortName') },
        { field: 'rating', label: t('sortRating') },
        { field: 'year', label: t('sortYear') },
        { field: 'dateCompleted', label: t('sortDateCompleted') },
    ];
}

export function getFilterFlagsForMediaType(mediaType: MediaType): { showAdult: boolean; showCustom: boolean } {
    if (mediaType === 'anime') {
        return { showAdult: false, showCustom: false };
    }
    if (mediaType === 'movie' || mediaType === 'series' || mediaType === 'book' || mediaType === 'manga') {
        return { showAdult: false, showCustom: false };
    }
    return { showAdult: true, showCustom: true };
}

export function getRandomLabelForMediaType(mediaType: MediaType): string {
    if (mediaType === 'anime') return t('randomAnime');
    if (mediaType === 'movie') return t('settingsMovies');
    if (mediaType === 'series') return t('settingsSeries');
    if (mediaType === 'book') return t('randomBook');
    if (mediaType === 'manga') return t('randomManga');
    return t('random');
}

export function getRandomTitleLabelForMediaType(mediaType: MediaType): string {
    if (mediaType === 'anime') return t('randomAnime');
    if (mediaType === 'movie') return t('settingsMovies');
    if (mediaType === 'series') return t('settingsSeries');
    if (mediaType === 'book') return t('randomBook');
    if (mediaType === 'manga') return t('randomManga');
    return t('randomGame');
}

type TagSummary = {
    id: string;
    label: string;
    count: number;
};

export function collectToolbarTags(
    items: MediaItem[],
    selected: { tags: string[]; genres: string[] }
): { planTags?: TagSummary[]; tags: TagSummary[]; genres: TagSummary[] } {
    const tagCounts = new Map<string, number>();
    const genreCounts = new Map<string, number>();

    for (const item of items) {
        if (item?.tags) {
            for (const tag of item.tags) {
                tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
            }
        }
        if (item?.genres) {
            for (const genre of item.genres) {
                genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1);
            }
        }
    }

    const buildTagList = (counts: Map<string, number>, selectedValues: string[]): TagSummary[] => {
        const items = Array.from(counts.entries())
            .map(([tag, count]) => ({ id: tag, label: tag, count }))
            .sort((a, b) => a.label.localeCompare(b.label));

        for (const tag of selectedValues) {
            if (!counts.has(tag)) {
                items.push({ id: tag, label: tag, count: 0 });
            }
        }

        return items.sort((a, b) => a.label.localeCompare(b.label));
    };

    return {
        tags: buildTagList(tagCounts, selected.tags),
        genres: buildTagList(genreCounts, selected.genres),
    };
}
