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

type SimpleFieldValue = string | number | boolean | string[] | null;

export interface FilterableMediaItem {
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
    started?: string | null;
    finished?: string | null;
    dateCompleted?: number | null;
    rawFields?: Record<string, SimpleFieldValue>;
}

const BUILTIN_FIELDS = new Set([
    'type', 'title', 'name', 'status', 'favorite', 'adult', 'isadult', 'sex18', 'cm_poster',
    'started', 'datestarted', 'start_date', 'finished', 'datefinished', 'finish_date',
    'datecompleted', 'dateread', 'readdate', 'completeddate', 'datewatched', 'watched',
    'tags', 'genres', 'genre', 'year', 'rating', 'userrating', 'rating_user', 'gameseries',
]);

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

export function collectYamlFieldDefinitions(items: MediaItem[]): FieldDefinition[] {
    const samples = new Map<string, SimpleFieldValue[]>();
    for (const item of items) {
        for (const [key, value] of Object.entries(item.rawFields ?? {})) {
            if (BUILTIN_FIELDS.has(key.toLocaleLowerCase())) continue;
            const values = samples.get(key) ?? [];
            if (value !== null && values.length < 20) values.push(value);
            samples.set(key, values);
        }
    }

    return Array.from(samples.entries())
        .map(([key, values]) => {
            const type = inferFieldType(values);
            return {
                id: `yaml:${key}`,
                label: key,
                icon: iconForType(type),
                type,
                source: 'yaml' as const,
                operators: operatorsForType(type),
            };
        })
        .sort((a, b) => a.label.localeCompare(b.label));
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
    switch (field) {
        case 'name': return item.displayName;
        case 'series': return item.gameSeries ?? null;
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

export function groupMediaItems(
    items: MediaItem[],
    mode: GroupMode,
    order: SortOrder,
    locale: string
): Array<{ key: string; label: string; items: MediaItem[]; missing: boolean }> {
    if (mode === 'none') return [];
    const groups = new Map<string, { label: string; timestamp: number; items: MediaItem[]; missing: boolean }>();
    const missingLabel = locale.startsWith('ru')
        ? 'Без даты'
        : locale.startsWith('uk')
            ? 'Без дати'
            : locale.startsWith('zh')
                ? '无日期'
                : 'No date';

    for (const item of items) {
        let key = '';
        let label = '';
        let timestamp = 0;
        let missing = false;
        if (mode === 'series') {
            const series = item.type === 'game' ? item.gameSeries.trim() : '';
            key = series || '__missing__';
            label = series || (locale.startsWith('ru')
                ? 'Без серии'
                : locale.startsWith('uk')
                    ? 'Без серії'
                    : locale.startsWith('zh')
                        ? '无系列'
                        : 'No series');
            missing = !series;
        } else {
            const dateValue = parseDateValue(item.finished ?? (item.type === 'game' ? item.dateCompleted : null));
            if (dateValue === null) {
                key = '__missing__';
                label = missingLabel;
                missing = true;
            } else {
                const date = new Date(dateValue);
                const year = date.getFullYear();
                const month = date.getMonth();
                timestamp = mode === 'finishedYear'
                    ? new Date(year, 0, 1).getTime()
                    : new Date(year, month, 1).getTime();
                key = String(timestamp);
                label = mode === 'finishedYear'
                    ? String(year)
                    : new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(date);
            }
        }
        const group = groups.get(key) ?? { label, timestamp, items: [], missing };
        group.items.push(item);
        groups.set(key, group);
    }

    return Array.from(groups.entries())
        .map(([key, group]) => ({ key, ...group }))
        .sort((left, right) => {
            if (left.missing !== right.missing) return left.missing ? 1 : -1;
            if (mode === 'series') {
                const comparison = left.label.localeCompare(right.label, locale, { numeric: true });
                return order === 'asc' ? comparison : -comparison;
            }
            return order === 'asc' ? left.timestamp - right.timestamp : right.timestamp - left.timestamp;
        });
}

function normalizeRules(raw: unknown): FilterRule[] {
    if (!Array.isArray(raw)) return [];
    const rules: FilterRule[] = [];
    for (const entry of raw) {
        const record = asRecord(entry);
        const id = typeof record?.id === 'string' ? record.id : '';
        const field = typeof record?.field === 'string' ? record.field : '';
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
        rules.push({ id, field, fieldType, operator, value, valueTo: normalizeRuleScalar(record?.valueTo) });
    }
    return rules;
}

function normalizeSortField(value: unknown, fallback: SortField): SortField {
    if (value === 'dateCompleted') return 'dateFinished';
    if (
        value === 'name' || value === 'series' || value === 'year' || value === 'rating'
        || value === 'dateStarted' || value === 'dateFinished'
        || (typeof value === 'string' && value.startsWith('yaml:') && value.length > 5)
    ) return value as SortField;
    return fallback === 'dateCompleted' ? 'dateFinished' : fallback;
}

function normalizeOrder(value: unknown, fallback: SortOrder): SortOrder {
    return value === 'asc' || value === 'desc' ? value : fallback;
}

function normalizeGroupMode(value: unknown, fallback: GroupMode): GroupMode {
    return value === 'none' || value === 'series' || value === 'finishedMonth' || value === 'finishedYear'
        ? value
        : fallback;
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
    if (values.length && values.every((value) => typeof value === 'number')) return 'number';
    if (values.length && values.every((value) => typeof value === 'string' && parseDateValue(value) !== null)) return 'date';
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
