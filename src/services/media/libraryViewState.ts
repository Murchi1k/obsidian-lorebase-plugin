import { pt } from '../../localization/priority';
import { priorityRank } from '../../utils/priority';
import { normalizePriority } from '../../utils/priority';
import { wikilinkLabel } from '../integrations/templateValues';
import { isPartialPersonalDate, normalizePersonalDate, personalDateSortValue } from '../../utils/personalDates';
import {
    FieldDefinition,
    FilterOperator,
    FilterRule,
    GroupMode,
    LibraryFieldType,
    LibraryViewState,
    MediaItem,
    MediaStatus,
    SavedLibraryView,
    SortField,
    SortOrder,
} from '../../types';

import { musicCredits } from './music';
import { getStandardFieldValue, normalizePartFormat } from './libraryFieldValues';
import { parseEpisodeDuration } from './watchProgress';

type SimpleFieldValue = string | number | boolean | string[] | null;

export interface FilterableMediaItem {
    priority?: import('../../types').MediaPriority;
    type?: string;
    format?: string;
    activePartId?: string | null;
    episodeCurrent?: number | null;
    episodeTotal?: number | null;
    communityRating?: number | null;
    platforms?: string[];
    publisher?: string;
    releaseDate?: string | null;
    repeatCount?: number;
    musicKind?: string;
    artist?: string;
    tracks?: { artist: string }[];
    displayName: string;
    nameLower: string;
    filePath?: string;
    gameSeries?: string;
    year: number | null;
    userRating: number | null;
    favorite: boolean;
    hasCustomPoster: boolean;
    isAdult: boolean;
    status: MediaStatus;
    tags: string[];
    genres: string[];
    workType?: string;
    started?: string | null;
    finished?: string | null;
    dateCompleted?: number | null;
    rawFields?: Record<string, SimpleFieldValue>;
    parts?: readonly { id: string; title: string; alternativeTitles?: readonly string[]; kind?: string; episodeCurrent?: number | null; episodeTotal?: number | null }[];
    studios?: string[];
    authors?: string[];
    developer?: string;
    actors?: string;
    director?: string;
    runtime?: string;
}

const BUILTIN_FIELDS = new Set([
    'music_kind', 'musickind',
    'type', 'title', 'name', 'status', 'favorite', 'personal_priority', 'adult', 'isadult', 'sex18', 'cm_poster',
    'started', 'datestarted', 'start_date', 'finished', 'datefinished', 'finish_date',
    'datecompleted', 'dateread', 'readdate', 'completeddate', 'datewatched', 'watched',
    'tags', 'genres', 'genre', 'year', 'rating', 'userrating', 'rating_user', 'gameseries',
    'work_type', 'worktype', 'manga_type', 'country_of_origin', 'countryoforigin',
    'format', 'studios', 'studio', 'authors', 'author', 'developer', 'developers',
    'actors', 'cast', 'director', 'directors', 'runtime',
    'communityrating', 'community_rating', 'communityvotes', 'community_votes', 'communityratingprovider', 'community_rating_provider',
    'episode_current', 'episode_total', 'season_current', 'season_total', 'seasons',
    'game_modes', 'gamemodes', 'modes', 'mode', 'singleplayer', 'single_player', 'single', 'solo', 'coop', 'co_op', 'cooperative', 'multiplayer', 'multi',
    'discovery_context', 'part_catalog', 'status_reasons', 'extra_chapters',
    'active_part_id', 'activepartid', 'anime_parts', 'series_parts', 'movie_parts', 'manga_parts',
    'poster', 'poster_b', 'image', 'image_b', 'horizontal_poster', 'poster_mode', 'title_image_url', 'imageurl', 'horizontalimageurl',
    'integration_id', 'integration_provider', 'steam_appid', 'steamappid', 'steam_app_id',
    'url', 'source_url', 'sourceurl', 'related_media', 'dlc', 'detailed_ratings', 'platform_playthroughs',
    'alt_titles', 'alternative_titles', 'alternativetitles',
    'activepartformat', 'partformats', 'totalepisodes', 'watchprogress',
    'image_horizontal', 'poster_horizontal', 'poster_path', 'image_path',
    'plot', 'summary', 'description', 'my_notes', 'platforms', 'platform', 'publisher', 'publishers',
    'released', 'releaseDate', 'release_date', 'premiered', 'publishedDate', 'repeat_count',
]);

const normalizedReservedFields = new Set([...BUILTIN_FIELDS].map(key => key.replace(/[_-]/g, '').toLocaleLowerCase()));
export function isReservedLibraryField(key: string): boolean {
    return normalizedReservedFields.has(key.replace(/[_-]/g, '').toLocaleLowerCase()) || /^lorebase[_-]/i.test(key)
        || /^(?:anilist|mal|shikimori|tmdb|tvmaze|igdb|rawg|steam|vndb)[_-]?(?:id|url|appid)$/i.test(key);
}

const TEXT_OPERATORS: FilterOperator[] = ['contains', 'equals', 'notEquals', 'empty', 'notEmpty'];
const RANGE_OPERATORS: FilterOperator[] = ['equals', 'greater', 'less', 'between', 'empty', 'notEmpty'];
const DATE_OPERATORS: FilterOperator[] = [
    'thisMonth', 'thisYear', 'between', 'equals', 'greater', 'less', 'empty', 'notEmpty',
];
const LIST_OPERATORS: FilterOperator[] = ['containsAny', 'containsAll', 'notContains', 'empty', 'notEmpty'];
const BOOLEAN_OPERATORS: FilterOperator[] = ['isTrue', 'isFalse'];

export function cloneLibraryViewState(state: LibraryViewState): LibraryViewState {
    return {
        sort: { ...state.sort },
        group: { ...state.group },
        workTypes: normalizeStrings(state.workTypes),
        rules: state.rules.map((rule) => ({
            ...rule,
            value: Array.isArray(rule.value) ? [...rule.value] : rule.value,
        })),
        tags: [...state.tags],
        genres: [...state.genres],
    };
}

export function normalizeLibraryViewState(raw: unknown, fallback: LibraryViewState): LibraryViewState {
    const record = asRecord(raw);
    if (!record) return cloneLibraryViewState(fallback);
    const sort = asRecord(record.sort);
    const group = asRecord(record.group);
    return {
        sort: {
            field: normalizeSortField(sort?.field ?? record.sortField, fallback.sort.field),
            order: normalizeOrder(sort?.order ?? record.sortOrder, fallback.sort.order),
        },
        group: {
            mode: normalizeGroupMode(group?.mode, fallback.group.mode),
            order: normalizeOrder(group?.order, fallback.group.order),
        },
        workTypes: normalizeStrings(
            Array.isArray(record.workTypes)
                ? record.workTypes
                : typeof record.workType === 'string'
                    ? [record.workType]
                    : []
        ),
        rules: normalizeRules(record.rules),
        tags: normalizeStrings(record.tags),
        genres: normalizeStrings(record.genres),
    };
}

export function normalizeSavedLibraryViews(raw: unknown, fallback: LibraryViewState): SavedLibraryView[] {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const result: SavedLibraryView[] = [];
    for (const entry of raw) {
        const record = asRecord(entry);
        const id = typeof record?.id === 'string' ? record.id.trim() : '';
        const name = typeof record?.name === 'string' ? record.name.trim() : '';
        if (!id || !name || seen.has(id)) continue;
        seen.add(id);
        result.push({
            id,
            name,
            state: normalizeLibraryViewState(record?.state, fallback),
            readonly: Boolean(record?.readonly),
        });
    }
    return result;
}

export function libraryViewStatesEqual(left: LibraryViewState, right: LibraryViewState): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

export function createRuleId(): string {
    return `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function extractSimpleFrontmatter(raw: Record<string, unknown>): Record<string, SimpleFieldValue> {
    const result: Record<string, SimpleFieldValue> = {};
    for (const [key, value] of Object.entries(raw)) {
        if (!key || key === 'position') continue;
        const simple = toSimpleValue(value);
        if (simple !== undefined) result[key] = simple;
    }
    return result;
}

export function collectYamlFieldDefinitions(items: MediaItem[], managedKeys: readonly string[] = []): FieldDefinition[] {
    const samples = new Map<string, SimpleFieldValue[]>();
    const fieldKey = (key: string) => key.replace(/[_-]/g, '').toLocaleLowerCase();
    const excluded = new Set(managedKeys.map(fieldKey));
    for (const item of items) {
        for (const [key, value] of Object.entries(item.rawFields ?? {})) {
            if (excluded.has(fieldKey(key)) || isReservedLibraryField(key)) continue;
            const values = samples.get(key) ?? [];
            if (value !== null && value !== '' && values.length < 100) values.push(value);
            samples.set(key, values);
        }
    }

    return Array.from(samples.entries())
        .filter(([key, values]) => !['playtime', 'completion_percent', 'metacritic'].includes(key.toLowerCase())
            || values.some(value => typeof value === 'string' ? value.trim().length > 0 : !Array.isArray(value) || value.length > 0))
        .map(([key, values]) => {
            const type = inferFieldType(values);
            return {
                id: `yaml:${key}`,
                label: key,
                icon: iconForType(type),
                type,
                source: 'yaml' as const,
                operators: operatorsForType(type),
                noteCount: items.filter(item => Object.prototype.hasOwnProperty.call(item.rawFields ?? {}, key)).length,
            };
        })
        .sort((a, b) => a.label.localeCompare(b.label));
}

function readCreditLabels(value: unknown): unknown {
    if (typeof value === 'string') return wikilinkLabel(value);
    if (Array.isArray(value)) return value.map(entry => typeof entry === 'string' ? wikilinkLabel(entry) : entry);
    return value;
}

export function getViewFieldValue(item: FilterableMediaItem, field: string): unknown {
    if (field.startsWith('yaml:')) {
        const payload = field.slice(5);
        const separator = payload.indexOf(':');
        const prefix = separator > 0 ? payload.slice(0, separator) : '';
        const key = ['text', 'number', 'date', 'boolean', 'list'].includes(prefix)
            ? payload.slice(separator + 1)
            : payload;
        return item.rawFields?.[key] ?? null;
    }
    const standardValue = getStandardFieldValue(item, field);
    if (standardValue !== undefined) return standardValue;
    switch (field) {
        case 'priority': return normalizePriority(item.priority);
        case 'name': return item.displayName;
        case 'studios': return readCreditLabels(item.studios ?? item.rawFields?.studios ?? item.rawFields?.studio ?? null);
        case 'authors': return item.authors ?? item.rawFields?.authors ?? item.rawFields?.author ?? null;
        case 'developer': return readCreditLabels(Array.isArray(item.rawFields?.developers) ? item.rawFields.developers : item.developer ?? null);
        case 'actors':
        case 'director': {
            const value = field === 'actors'
                ? item.rawFields?.actors ?? item.rawFields?.cast ?? item.actors
                : item.rawFields?.directors ?? item.rawFields?.director ?? item.director;
            const labels = readCreditLabels(value);
            if (Array.isArray(labels)) return labels;
            if (typeof labels !== 'string') return null;
            return labels !== value ? [labels] : labels.split(',').map(entry => entry.trim()).filter(Boolean);
        }
        case 'runtime': return parseEpisodeDuration(item.runtime ?? item.rawFields?.runtime);
        case 'platforms': return item.platforms ?? item.rawFields?.platforms ?? null;
        case 'publisher': return readCreditLabels(item.rawFields?.publishers ?? item.publisher ?? item.rawFields?.publisher ?? null);
        case 'releaseDate': return item.releaseDate ?? item.rawFields?.released ?? item.rawFields?.release_date ?? null;
        case 'repeatCount': return item.repeatCount ?? item.rawFields?.repeat_count ?? null;
        case 'series': return item.gameSeries ?? null;
        case 'musicKind': return item.musicKind ? [item.musicKind] : [];
        case 'musicArtists': return musicCredits(item).artists;
        case 'musicGuests': return musicCredits(item).guests;
        case 'workType': return item.workType ? [item.workType] : [];
        case 'year': return item.year;
        case 'rating': return item.userRating;
        case 'status': return item.status;
        case 'favorite': return item.favorite;
        case 'adult': return item.isAdult;
        case 'custom': return item.hasCustomPoster;
        case 'tags': return item.tags;
        case 'genres': return item.genres;
        case 'dateStarted': return item.started ?? null;
        case 'dateCompleted':
        case 'dateFinished': return item.finished ?? item.dateCompleted ?? null;
        default: return null;
    }
}

export function matchesFilterRule(item: FilterableMediaItem, rule: FilterRule, now = new Date()): boolean {
    if (!['empty', 'notEmpty', 'isTrue', 'isFalse', 'thisMonth', 'thisYear'].includes(rule.operator)) {
        // A newly added or cleared filter remains neutral until its value is chosen.
        if (rule.value === undefined || rule.value === null || rule.value === '' || (Array.isArray(rule.value) && !rule.value.length)) return true;
        if (rule.operator === 'between' && (rule.valueTo === undefined || rule.valueTo === null || rule.valueTo === '')) return true;
    }
    const raw = getViewFieldValue(item, rule.field);
    const empty = isEmpty(raw);
    if (rule.operator === 'empty') return empty;
    if (rule.operator === 'notEmpty') return !empty;
    if (empty) return false;

    if (rule.operator === 'isTrue') return raw === true || String(raw).toLowerCase() === 'true';
    if (rule.operator === 'isFalse') return raw === false || String(raw).toLowerCase() === 'false';

    if (rule.fieldType === 'list' || Array.isArray(raw)) {
        const actual = (Array.isArray(raw) ? raw : [raw]).map(normalizeText);
        const expected = (Array.isArray(rule.value) ? rule.value : [rule.value]).map(normalizeText).filter(Boolean);
        if (rule.operator === 'containsAll') return expected.every((value) => actual.includes(value));
        if (rule.operator === 'notContains') return expected.every((value) => !actual.includes(value));
        return expected.some((value) => actual.includes(value));
    }

    if (rule.fieldType === 'date') {
        if (['dateFinished', 'dateCompleted', 'dateStarted'].includes(rule.field) && isPartialPersonalDate(raw)) {
            const period = normalizePersonalDate(raw);
            if (period === 'unknown') return false;
            if (rule.operator === 'thisYear') return Number(period.slice(0, 4)) === now.getFullYear();
            if (rule.operator === 'thisMonth') return period.length === 7 && period === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            if (rule.operator === 'equals') return period === normalizePersonalDate(rule.value);
            if (rule.operator === 'notEquals') return period !== normalizePersonalDate(rule.value);
            // A partial period cannot prove an exact-day range comparison.
            return false;
        }
        const actual = parseDateValue(raw);
        if (actual === null) return false;
        if (rule.operator === 'thisMonth') {
            return actual >= new Date(now.getFullYear(), now.getMonth(), 1).getTime()
                && actual < new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
        }
        if (rule.operator === 'thisYear') {
            return actual >= new Date(now.getFullYear(), 0, 1).getTime()
                && actual < new Date(now.getFullYear() + 1, 0, 1).getTime();
        }
        return compareRange(actual, parseDateValue(rule.value), parseDateValue(rule.valueTo), rule.operator, true);
    }

    if (rule.fieldType === 'number') {
        const actual = toFiniteNumber(raw);
        return actual !== null
            && compareRange(actual, toFiniteNumber(rule.value), toFiniteNumber(rule.valueTo), rule.operator, false);
    }

    const actual = normalizeText(raw);
    const expected = normalizeText(rule.value);
    if (rule.operator === 'equals') return actual === expected;
    if (rule.operator === 'notEquals') return actual !== expected;
    return actual.includes(expected);
}

export function parseDateValue(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
    if (value instanceof Date && Number.isFinite(value.getTime())) return value.getTime();
    if (typeof value !== 'string' || !value.trim()) return null;
    const text = value.trim();
    const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (isoDate) {
        const year = Number(isoDate[1]);
        const month = Number(isoDate[2]) - 1;
        const day = Number(isoDate[3]);
        const date = new Date(year, month, day);
        return Number.isFinite(date.getTime())
            && date.getFullYear() === year
            && date.getMonth() === month
            && date.getDate() === day
            ? date.getTime()
            : null;
    }
    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? parsed : null;
}

interface GroupValue {
    key: string;
    label: string;
    rank?: number;
}

const GROUP_VALUE_LABELS = {
    ru: { missing: 'Без значения', date: 'Без даты', series: 'Без серии', artist: 'Без исполнителя', yes: 'Да', no: 'Нет' },
    uk: { missing: 'Без значення', date: 'Без дати', series: 'Без серії', artist: 'Без виконавця', yes: 'Так', no: 'Ні' },
    zh: { missing: '无值', date: '无日期', series: '无系列', artist: '无艺术家', yes: '是', no: '否' },
    en: { missing: 'No value', date: 'No date', series: 'No series', artist: 'No artist', yes: 'Yes', no: 'No' },
};

export function groupMediaItems(
    items: MediaItem[],
    mode: GroupMode,
    order: SortOrder,
    locale: string,
    statuses: ReadonlyArray<{ status: MediaStatus; label: string }> = [],
): Array<{ key: string; label: string; items: MediaItem[]; missing: boolean }> {
    if (mode === 'none') return [];
    const language = locale.split('-')[0];
    const labels = GROUP_VALUE_LABELS[language as keyof typeof GROUP_VALUE_LABELS] ?? GROUP_VALUE_LABELS.en;
    const yamlType = mode.startsWith('yaml:') ? mode.split(':', 2)[1] : '';
    const isDate = mode === 'dateStarted' || mode === 'dateFinished'
        || mode === 'finishedMonth' || mode === 'finishedYear' || yamlType === 'date';
    const dateFormatter = isDate && mode !== 'finishedYear' ? new Intl.DateTimeFormat(locale,
        mode === 'finishedMonth' ? { month: 'long', year: 'numeric' } : { dateStyle: 'long' }
    ) : null;
    const statusGroups = new Map(statuses.map(({ status, label }, index) => [status, { key: status, label, rank: index }]));
    const missingLabel = isDate ? labels.date : mode === 'series' ? labels.series : mode === 'artist' ? labels.artist : labels.missing;
    const groups = new Map<string, GroupValue & { items: MediaItem[]; missing: boolean }>();

    for (const item of items) {
        let value: GroupValue | null = null;
        if (mode === 'artist') {
            const artist = item.type === 'music' ? item.artist.split(/\s+(?:feat\.?|ft\.?|featuring)\s+/i)[0].trim().replace(/\s+/g, ' ') : '';
            if (artist) value = { key: 'artist:' + artist.normalize('NFKC').toLocaleLowerCase(), label: artist };
        } else if (mode === 'series') {
            const series = item.type === 'game' ? item.gameSeries.trim() : '';
            if (series) value = { key: 'series:' + series, label: series };
        } else if (mode === 'priority') {
            const priority = normalizePriority(item.priority);
            value = { key: 'priority:' + priority, label: pt(priority, locale), rank: priorityRank(priority) };
        } else if (mode === 'status') {
            if (item.status) value = statusGroups.get(item.status) ?? { key: item.status, label: item.status, rank: statuses.length };
        } else if (isDate) {
            const raw = mode === 'finishedMonth' || mode === 'finishedYear'
                ? item.finished ?? (item.type === 'game' ? item.dateCompleted : null)
                : getViewFieldValue(item, mode);
            const personal = mode === 'dateStarted' || mode === 'dateFinished' || mode === 'finishedMonth' || mode === 'finishedYear';
            const partial = personal ? normalizePersonalDate(raw) : '';
            if (/^\d{4}(?:-\d{2})?$/.test(partial)) {
                if (mode === 'finishedYear') {
                    const rank = new Date(Number(partial.slice(0, 4)), 0, 1).getTime();
                    value = { key: String(rank), label: partial.slice(0, 4), rank };
                } else {
                    value = { key: 'partial:' + partial, label: partial.length === 4 ? partial : new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long' }).format(new Date(partial + '-01T12:00:00')), rank: personalDateSortValue(partial) ?? 0 };
                }
            }
            const timestamp = value ? null : parseDateValue(raw);
            if (timestamp !== null) {
                const date = new Date(timestamp);
                if (Number.isFinite(date.getTime())) {
                    date.setHours(0, 0, 0, 0);
                    if (mode === 'finishedMonth') date.setDate(1);
                    if (mode === 'finishedYear') date.setMonth(0, 1);
                    const day = date.getTime();
                    value = { key: String(day), label: dateFormatter?.format(date) ?? String(date.getFullYear()), rank: day };
                }
            }
        } else {
            value = groupPropertyValue(getViewFieldValue(item, mode), mode === 'rating' ? 'number' : yamlType, labels);
        }

        const bucket = value ?? { key: '__missing__', label: missingLabel };
        const group = groups.get(bucket.key) ?? { ...bucket, items: [], missing: !value };
        group.items.push(item);
        groups.set(bucket.key, group);
    }

    return Array.from(groups.values())
        .sort((left, right) => {
            if (left.missing !== right.missing) return left.missing ? 1 : -1;
            const comparison = (left.rank ?? 0) - (right.rank ?? 0)
                || left.label.localeCompare(right.label, locale, { numeric: true });
            return order === 'asc' ? comparison : -comparison;
        })
        .map(({ key, label, items, missing }) => ({ key, label, items, missing }));
}

function groupPropertyValue(
    raw: unknown,
    type: string,
    labels: { yes: string; no: string },
): GroupValue | null {
    if (type === 'number') {
        const value = typeof raw === 'number' || typeof raw === 'string' && raw.trim() ? toFiniteNumber(raw) : null;
        return value === null ? null : { key: String(value), label: String(value), rank: value };
    }
    if (type === 'boolean') {
        if (typeof raw !== 'boolean') return null;
        return { key: String(raw), label: raw ? labels.yes : labels.no, rank: Number(raw) };
    }
    if (Array.isArray(raw)) {
        // A list represents one set of values, so a card belongs to one group.
        const values = new Map<string, string>();
        for (const entry of raw) {
            const label = String(entry).trim();
            if (label) values.set(normalizeText(label), label);
        }
        const keys = [...values.keys()].sort();
        if (!keys.length) return null;
        const label = keys.map(key => values.get(key)).join(', ');
        return { key: 'list:' + JSON.stringify(keys), label };
    }
    if (isEmpty(raw)) return null;
    const label = String(raw).trim();
    return label ? { key: 'text:' + normalizeText(label), label } : null;
}

function normalizeRules(raw: unknown): FilterRule[] {
    if (!Array.isArray(raw)) return [];
    const rules: FilterRule[] = [];
    for (const entry of raw) {
        const record = asRecord(entry);
        const id = typeof record?.id === 'string' ? record.id : '';
        const field = typeof record?.field === 'string' ? record.field : '';
        if (field === 'gameModes') continue;
        const fieldType = normalizeFieldType(record?.fieldType);
        const operator = normalizeOperator(record?.operator);
        if (!id || !field || !fieldType || !operator) continue;
        const value = Array.isArray(record?.value)
            ? record.value.map(String)
            : typeof record?.value === 'string'
                || typeof record?.value === 'number'
                || typeof record?.value === 'boolean'
                || record?.value === null
                ? record.value
                : undefined;
        // Older versions exposed the known anime format as a free-text YAML field.
        // Upgrade exact known formats (or an unfinished row), while retaining partial-text rules.
        const format = normalizePartFormat(value);
        if (/^yaml:(?:text:)?format$/i.test(field) && ['contains', 'equals', 'notEquals'].includes(operator)
            && (value === '' || value === undefined || ['tv', 'ona', 'ova', 'movie', 'special'].includes(format))) {
            rules.push({ id, field: 'activePartFormat', fieldType: 'list', operator: operator === 'notEquals' ? 'notContains' : 'containsAny', value: format ? [format] : [] });
        } else rules.push({ id, field, fieldType, operator, value, valueTo: normalizeRuleScalar(record?.valueTo) });
    }
    return rules;
}

function normalizeSortField(value: unknown, fallback: SortField): SortField {
    if (value === 'dateCompleted') return 'dateFinished';
    if (
        value === 'name' || value === 'series' || value === 'year' || value === 'rating' || value === 'priority'
        || value === 'dateStarted' || value === 'dateFinished'
        || (typeof value === 'string' && value.startsWith('yaml:') && value.length > 5)
    ) return value as SortField;
    return fallback === 'dateCompleted' ? 'dateFinished' : fallback;
}

function normalizeOrder(value: unknown, fallback: SortOrder): SortOrder {
    return value === 'asc' || value === 'desc' ? value : fallback;
}

function normalizeGroupMode(value: unknown, fallback: GroupMode): GroupMode {
    if (value === 'none' || value === 'series' || value === 'artist' || value === 'status' || value === 'rating' || value === 'priority'
        || value === 'dateStarted' || value === 'dateFinished' || value === 'finishedMonth' || value === 'finishedYear'
        || typeof value === 'string' && /^yaml:(?:text|number|date|boolean|list):.+$/.test(value)) {
        return value as GroupMode;
    }
    return fallback;
}

function normalizeFieldType(value: unknown): LibraryFieldType | null {
    return value === 'text' || value === 'number' || value === 'date' || value === 'boolean' || value === 'list'
        ? value
        : null;
}

function normalizeOperator(value: unknown): FilterOperator | null {
    const all: FilterOperator[] = [
        ...TEXT_OPERATORS, ...RANGE_OPERATORS, ...DATE_OPERATORS, ...LIST_OPERATORS, ...BOOLEAN_OPERATORS,
    ];
    return typeof value === 'string' && all.includes(value as FilterOperator) ? value as FilterOperator : null;
}

function normalizeRuleScalar(value: unknown): string | number | null | undefined {
    return typeof value === 'string' || typeof value === 'number' || value === null ? value : undefined;
}

function normalizeStrings(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value.map(String).map((entry) => entry.trim()).filter(Boolean)));
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function toSimpleValue(value: unknown): SimpleFieldValue | undefined {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value) && value.every((entry) => ['string', 'number', 'boolean'].includes(typeof entry))) {
        return value.map(String);
    }
    return undefined;
}

function inferFieldType(values: SimpleFieldValue[]): LibraryFieldType {
    if (values.some(Array.isArray)) return values.every(Array.isArray) ? 'list' : 'text';
    if (values.length && values.every((value) => typeof value === 'boolean')) return 'boolean';
    if (values.length && values.every((value) => typeof value === 'number' || typeof value === 'string' && /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value.trim()))) return 'number';
    if (values.length && values.every((value) => typeof value === 'string' && !/^\d+$/.test(value.trim()) && parseDateValue(value) !== null)) return 'date';
    return 'text';
}

function operatorsForType(type: LibraryFieldType): FilterOperator[] {
    if (type === 'number') return [...RANGE_OPERATORS];
    if (type === 'date') return [...DATE_OPERATORS];
    if (type === 'boolean') return [...BOOLEAN_OPERATORS];
    if (type === 'list') return [...LIST_OPERATORS];
    return [...TEXT_OPERATORS];
}

function iconForType(type: LibraryFieldType): string {
    if (type === 'number') return 'hash';
    if (type === 'date') return 'calendar';
    if (type === 'boolean') return 'toggle-left';
    if (type === 'list') return 'list';
    return 'type';
}

function isEmpty(value: unknown): boolean {
    return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
}

function normalizeText(value: unknown): string {
    return String(value ?? '').trim().toLocaleLowerCase();
}

function toFiniteNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function compareRange(
    actual: number,
    from: number | null,
    to: number | null,
    operator: FilterOperator,
    inclusiveEndOfDay: boolean
): boolean {
    if (operator === 'greater') return from !== null && actual > from;
    if (operator === 'less') return from !== null && actual < from;
    if (operator === 'between') {
        const upper = to !== null && inclusiveEndOfDay ? to + 86_399_999 : to;
        return from !== null && upper !== null && actual >= from && actual <= upper;
    }
    return from !== null && (inclusiveEndOfDay ? actual >= from && actual <= from + 86_399_999 : actual === from);
}
