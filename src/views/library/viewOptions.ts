import { pt } from '../../localization/priority';
import { mt } from '../../localization/music';
import { MUSIC_STATUSES } from '../../services/media/music';
import { FieldDefinition, MediaItem, MediaStatus, MediaType, SortField, StatusLabelSettings } from '../../types';
import { i18n, t } from '../../localization';
import { getMediaWorkTypeOptions, supportsWorkTypes, countryOptions, countryFieldLabel } from '../../utils/mediaWorkType';
import { getCustomStatuses, getStatusAppearance } from '../../statusPresentation';
import { librarySearchCopy, searchCreditFields } from '../../services/media/searchSuggestions';
import { getStandardFilterDefinitions } from '../../services/media/libraryFieldCatalog';

export function getStatusOptionsForMediaType(
    mediaType: MediaType,
    statusLabels?: StatusLabelSettings
): Array<{ status: MediaStatus; label: string }> {
    if (mediaType === 'music') return [...MUSIC_STATUSES.map(status => ({ status, label: getStatusAppearance(mediaType, status).label || statusLabels?.music?.[status]?.trim() || mt(status) })), ...getCustomStatuses(mediaType)];
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
        const labelMap: Partial<Record<MediaStatus, string>> | undefined = labels;
        return getStatusAppearance(mediaType, status).label || labelMap?.[status]?.trim() || fallback;
    };
    if (mediaType === 'anime' || mediaType === 'movie' || mediaType === 'series' || mediaType === 'book' || mediaType === 'manga') {
        const plannedLabel = mediaType === 'book' || mediaType === 'manga' ? t('statusPlanToRead') : t('statusPlanned');
        const activeLabel = mediaType === 'book' || mediaType === 'manga' ? t('statusReading') : t('statusWatching');
        const completedLabel = mediaType === 'book' || mediaType === 'manga' ? t('statusReadCompleted') : t('statusCompleted');
        return [
            { status: 'to_be_released', label: labelFor('to_be_released', t('statusToBeReleased')) },
            { status: 'planned', label: labelFor('planned', plannedLabel) },
            { status: 'watching', label: labelFor('watching', activeLabel) },
            { status: 'completed', label: labelFor('completed', completedLabel) },
            { status: 'dropped', label: labelFor('dropped', t('statusDropped')) },
            { status: 'paused', label: labelFor('paused', t('statusPaused')) },
            ...getCustomStatuses(mediaType),
        ];
    }

    return [
        { status: 'to_be_released', label: labelFor('to_be_released', t('statusToBeReleased')) },
        { status: 'completed', label: labelFor('completed', t('statusPlayed')) },
        { status: 'playing', label: labelFor('playing', t('statusPlaying')) },
        { status: 'dropped', label: labelFor('dropped', t('statusDropped')) },
        { status: 'wishlist', label: labelFor('wishlist', t('statusWishlist')) },
        { status: 'not_started', label: labelFor('not_started', t('statusNotStarted')) },
        { status: 'sandbox', label: labelFor('sandbox', t('statusSandbox')) },
        ...getCustomStatuses(mediaType),
    ];
}

export function getSortOptionsForMediaType(mediaType: MediaType): Array<{ field: SortField; label: string }> {
    if (mediaType === 'music') return [{ field: 'name', label: t('sortName') }, { field: 'rating', label: t('sortRating') }, { field: 'priority', label: pt('priority') }, { field: 'year', label: t('sortYear') }];
    if (mediaType === 'anime' || mediaType === 'movie' || mediaType === 'series' || mediaType === 'book' || mediaType === 'manga') {
        const dateLabel = mediaType === 'book' || mediaType === 'manga'
            ? t('sortDateRead')
            : t('sortDateWatched');
        return [
            { field: 'name', label: t('sortName') },
            { field: 'rating', label: t('sortRating') }, { field: 'priority', label: pt('priority') },
            { field: 'year', label: t('sortYear') },
            { field: 'dateStarted', label: dateSortLabel(true) },
            { field: 'dateFinished', label: dateLabel },
        ];
    }

    return [
        { field: 'series', label: t('sortSeries') },
        { field: 'name', label: t('sortName') },
        { field: 'rating', label: t('sortRating') }, { field: 'priority', label: pt('priority') },
        { field: 'year', label: t('sortYear') },
        { field: 'dateStarted', label: dateSortLabel(true) },
        { field: 'dateFinished', label: t('sortDateCompleted') },
    ];
}

export function getBuiltInFieldDefinitions(
    mediaType: MediaType,
    statuses: Array<{ status: MediaStatus; label: string }>,
    flags: { showAdult: boolean; showCustom: boolean },
    mangaWorkTypes: string[] = []
): FieldDefinition[] {
    const language = i18n.getLanguage();
    const startedLabel = language === 'ru' ? 'Дата начала' : language === 'uk' ? 'Дата початку' : language === 'zh-CN' ? '开始日期' : 'Start date';
    const finishedLabel = language === 'ru' ? 'Дата окончания' : language === 'uk' ? 'Дата завершення' : language === 'zh-CN' ? '结束日期' : 'Finish date';
    const definitions: FieldDefinition[] = [
        { id: 'priority', label: pt('priority'), icon: 'flag', type: 'list', source: 'builtin', operators: ['containsAny', 'notContains'], options: (['highest', 'high', 'normal', 'low'] as const).map(value => ({ value, label: pt(value) })) },
        {
            id: 'status', label: t('status'), icon: 'circle-dot', type: 'list', source: 'builtin',
            operators: ['containsAny', 'notContains'],
            options: statuses.map((entry) => ({ value: entry.status, label: entry.label })),
        },
        {
            id: 'favorite', label: t('statusFavorite'), icon: 'heart', type: 'boolean', source: 'builtin',
            operators: ['isTrue', 'isFalse'],
        },
        {
            id: 'year', label: t('year'), icon: 'calendar-days', type: 'number', source: 'builtin',
            operators: ['equals', 'greater', 'less', 'between', 'empty', 'notEmpty'],
        },
        {
            id: 'rating', label: t('editRating'), icon: 'star', type: 'number', source: 'builtin',
            operators: ['equals', 'greater', 'less', 'between', 'empty', 'notEmpty'],
        },
        {
            id: 'dateStarted', label: startedLabel, icon: 'calendar-clock', type: 'date', source: 'builtin',
            operators: ['thisMonth', 'thisYear', 'between', 'equals', 'greater', 'less', 'empty', 'notEmpty'],
        },
        {
            id: 'dateFinished', label: finishedLabel, icon: 'calendar-check', type: 'date', source: 'builtin',
            operators: ['thisMonth', 'thisYear', 'between', 'equals', 'greater', 'less', 'empty', 'notEmpty'],
        },
    ];
    for (const field of searchCreditFields(mediaType)) {
        definitions.push({ id: field, label: librarySearchCopy(language)[field], icon: field === 'studios' ? 'building-2' : field === 'authors' ? 'pen-line' : 'code-2',
            type: 'list', source: 'builtin',
            operators: ['containsAny', 'containsAll', 'notContains', 'empty', 'notEmpty'],
            options: [],
        });
    }
    definitions.push(...getStandardFilterDefinitions(mediaType, language));
    if (mediaType === 'game') {
        definitions.splice(1, 0, {
            id: 'series', label: t('sortSeries'), icon: 'layers', type: 'text', source: 'builtin',
            operators: ['contains', 'equals', 'notEquals', 'empty', 'notEmpty'],
        });
    }
    if (supportsWorkTypes(mediaType) || mediaType === 'anime') {
        definitions.splice(1, 0, {
            id: 'workType', label: mediaType === 'anime' ? countryFieldLabel(language) : t('templateFieldWorkType'), icon: 'book-type', type: 'list', source: 'builtin',
            operators: ['containsAny', 'notContains', 'empty', 'notEmpty'],
            options: mediaType === 'anime' ? countryOptions(language, mangaWorkTypes) : getMediaWorkTypeOptions(mediaType as 'game' | 'movie' | 'series' | 'manga', language, mangaWorkTypes),
        });
    }
    if (flags.showAdult) {
        definitions.push({
            id: 'adult', label: t('filterAdult'), icon: 'shield-alert', type: 'boolean', source: 'builtin',
            operators: ['isTrue', 'isFalse'],
        });
    }
    if (flags.showCustom) {
        definitions.push({
            id: 'custom', label: t('modeCustom'), icon: 'image', type: 'boolean', source: 'builtin',
            operators: ['isTrue', 'isFalse'],
        });
    }
    if (mediaType === 'music') {
        return [...definitions.filter(field => !['dateStarted', 'dateFinished'].includes(field.id)), {
            id: 'musicKind', label: mt('kind'), icon: 'music', type: 'list', source: 'builtin', operators: ['containsAny', 'notContains'],
            options: [{ value: 'album', label: mt('albums') }, { value: 'track', label: mt('tracks') }],
        }, {
            id: 'musicArtists', label: mt('artists'), icon: 'mic', type: 'list', source: 'builtin',
            operators: ['containsAny', 'containsAll', 'notContains', 'empty', 'notEmpty'], options: [],
        }, {
            id: 'musicGuests', label: mt('guests'), icon: 'users', type: 'list', source: 'builtin',
            operators: ['containsAny', 'containsAll', 'notContains', 'empty', 'notEmpty'], options: [],
        }];
    }
    return definitions;
}

function dateSortLabel(started: boolean): string {
    const language = i18n.getLanguage();
    if (language === 'ru') return started ? 'Дата начала' : 'Дата окончания';
    if (language === 'uk') return started ? 'Дата початку' : 'Дата завершення';
    return started ? 'Date started' : 'Date finished';
}

export function getFilterFlagsForMediaType(mediaType: MediaType): { showAdult: boolean; showCustom: boolean } {
    if (mediaType === 'music') return { showAdult: false, showCustom: false };
    if (mediaType === 'anime') {
        return { showAdult: true, showCustom: false };
    }
    if (mediaType === 'manga') {
        return { showAdult: true, showCustom: false };
    }
    if (mediaType === 'movie' || mediaType === 'series' || mediaType === 'book') {
        return { showAdult: false, showCustom: false };
    }
    return { showAdult: true, showCustom: true };
}

export function getRandomLabelForMediaType(mediaType: MediaType): string {
    if (mediaType === 'music') return mt('music');
    if (mediaType === 'anime') return t('randomAnime');
    if (mediaType === 'movie') return t('settingsMovies');
    if (mediaType === 'series') return t('settingsSeries');
    if (mediaType === 'book') return t('randomBook');
    if (mediaType === 'manga') return t('randomManga');
    return t('random');
}

export function getRandomTitleLabelForMediaType(mediaType: MediaType): string {
    if (mediaType === 'music') return mt('music');
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
