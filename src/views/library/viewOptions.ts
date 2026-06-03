import { MediaItem, MediaStatus, MediaType, SortField, StatusLabelSettings } from '../../types';
import { t } from '../../localization';

export function getStatusOptionsForMediaType(
    mediaType: MediaType,
    statusLabels?: StatusLabelSettings
): Array<{ status: MediaStatus; label: string }> {
    const labelFor = (status: MediaStatus, fallback: string): string => {
        const labels = mediaType === 'anime' ? statusLabels?.anime : statusLabels?.games;
        return (labels as Partial<Record<MediaStatus, string>> | undefined)?.[status]?.trim() || fallback;
    };
    if (mediaType === 'anime') {
        return [
            { status: 'planned', label: labelFor('planned', t('statusPlanned')) },
            { status: 'watching', label: labelFor('watching', t('statusWatching')) },
            { status: 'completed', label: labelFor('completed', t('statusCompleted')) },
            { status: 'dropped', label: labelFor('dropped', t('statusDropped')) },
            { status: 'paused', label: labelFor('paused', t('statusPaused')) },
        ];
    }

    return [
        { status: 'completed', label: labelFor('completed', t('statusPlayed')) },
        { status: 'playing', label: labelFor('playing', t('statusPlaying')) },
        { status: 'dropped', label: labelFor('dropped', t('statusDropped')) },
        { status: 'not_started', label: labelFor('not_started', t('statusNotStarted')) },
        { status: 'sandbox', label: labelFor('sandbox', t('statusSandbox')) },
    ];
}

export function getSortOptionsForMediaType(mediaType: MediaType): Array<{ field: SortField; label: string }> {
    if (mediaType === 'anime') {
        return [
            { field: 'name', label: t('sortName') },
            { field: 'rating', label: t('sortRating') },
            { field: 'year', label: t('sortYear') },
            { field: 'dateCompleted', label: t('sortDateWatched') },
        ];
    }

    return [
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
    return { showAdult: true, showCustom: true };
}

export function getRandomLabelForMediaType(mediaType: MediaType): string {
    return mediaType === 'anime' ? t('randomAnime') : t('random');
}

export function getRandomTitleLabelForMediaType(mediaType: MediaType): string {
    return mediaType === 'anime' ? t('randomAnime') : t('randomGame');
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
