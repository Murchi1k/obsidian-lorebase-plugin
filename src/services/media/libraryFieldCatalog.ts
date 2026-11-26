import type { FieldDefinition, FilterRule, Language, MediaItem, MediaType } from '../../types';
import { collectYamlFieldDefinitions, getViewFieldValue } from './libraryViewState';

const COPY = {
    ru: { activePartFormat: 'Формат активной части', partFormats: 'Есть часть формата…', totalEpisodes: 'Всего эпизодов', watchProgress: 'Прогресс просмотра', communityRating: 'Оценка сообщества',
        movie: 'Фильм', season: 'Сезон', special: 'Спецвыпуск', allParts: 'По всем частям тайтла. Если общее число серий неизвестно, значение не задано.', noValues: 'В библиотеке пока нет значений', noMatches: 'Ничего не найдено', selected: 'Выбрано', percent: '%' },
    en: { activePartFormat: 'Active part format', partFormats: 'Has a part with format…', totalEpisodes: 'Total episodes', watchProgress: 'Watch progress', communityRating: 'Community rating',
        movie: 'Movie', season: 'Season', special: 'Special', allParts: 'Across all title parts. Unavailable when the total episode count is unknown.', noValues: 'No values in the library yet', noMatches: 'No matches', selected: 'Selected', percent: '%' },
    uk: { activePartFormat: 'Формат активної частини', partFormats: 'Є частина формату…', totalEpisodes: 'Усього епізодів', watchProgress: 'Прогрес перегляду', communityRating: 'Оцінка спільноти',
        movie: 'Фільм', season: 'Сезон', special: 'Спецвипуск', allParts: 'За всіма частинами тайтлу. Якщо загальна кількість серій невідома, значення не задано.', noValues: 'У бібліотеці поки немає значень', noMatches: 'Нічого не знайдено', selected: 'Вибрано', percent: '%' },
    'zh-CN': { activePartFormat: '当前分部格式', partFormats: '包含以下格式的分部…', totalEpisodes: '总集数', watchProgress: '观看进度', communityRating: '社区评分',
        movie: '电影', season: '季', special: '特别篇', allParts: '按全部分部计算。总集数未知时不提供数值。', noValues: '资料库中暂无值', noMatches: '无匹配项', selected: '已选', percent: '%' },
};
export const libraryFieldCopy = (language: Language) => COPY[language];
const NUMBER_OPERATORS: FieldDefinition['operators'] = ['equals', 'greater', 'less', 'between', 'empty', 'notEmpty'];
const LIST_OPERATORS: FieldDefinition['operators'] = ['containsAny', 'containsAll', 'notContains', 'empty', 'notEmpty'];

export function getStandardFilterDefinitions(mediaType: MediaType, language: Language): FieldDefinition[] {
    const copy = COPY[language];
    const fields: FieldDefinition[] = [{ id: 'communityRating', label: copy.communityRating, icon: 'users', type: 'number', source: 'builtin', operators: [...NUMBER_OPERATORS], min: 0, step: 'any' }];
    const labels = libraryCatalogCopy(language);
    if (mediaType !== 'music') fields.push({ id: 'releaseDate', label: labels.released, icon: 'calendar-days', type: 'date', source: 'builtin',
        operators: ['thisMonth', 'thisYear', 'between', 'equals', 'greater', 'less', 'empty', 'notEmpty'] });
    if (mediaType === 'game') fields.push({ id: 'platforms', label: labels.platforms, icon: 'monitor', type: 'list', source: 'builtin', operators: [...LIST_OPERATORS], options: [] });
    if (['game', 'book', 'manga'].includes(mediaType)) fields.push({ id: 'publisher', label: labels.publisher, icon: 'building-2', type: 'list', source: 'builtin', operators: [...LIST_OPERATORS], options: [] });
    if (['game', 'anime', 'movie', 'series', 'manga'].includes(mediaType)) fields.push({ id: 'repeatCount', label: labels.repeat, icon: 'repeat-2', type: 'number', source: 'builtin', operators: [...NUMBER_OPERATORS], min: 0, step: 1 });
    if (mediaType === 'movie' || mediaType === 'series') {
        const credits = { ru: ['Актёры', 'Режиссёры', 'Длительность (мин)'], en: ['Actors', 'Directors', 'Runtime (min)'], uk: ['Актори', 'Режисери', 'Тривалість (хв)'], 'zh-CN': ['演员', '导演', '时长（分钟）'] }[language];
        fields.push({ id: 'actors', label: credits[0], icon: 'users', type: 'list', source: 'builtin', operators: [...LIST_OPERATORS], options: [] },
            { id: 'director', label: credits[1], icon: 'clapperboard', type: 'list', source: 'builtin', operators: [...LIST_OPERATORS], options: [] },
            { id: 'runtime', label: credits[2], icon: 'clock', type: 'number', source: 'builtin', operators: [...NUMBER_OPERATORS], min: 0, step: 'any' });
    }
    if (mediaType === 'anime' || mediaType === 'series') {
        const options = (mediaType === 'anime' ? ['tv', 'ona', 'ova', 'movie', 'special'] : ['season', 'movie'])
            .map(value => ({ value, label: value in copy ? copy[value as 'movie' | 'season' | 'special'] : value.toUpperCase() }));
        fields.push(...(['activePartFormat', 'partFormats'] as const).map(id => ({
            id, label: copy[id], icon: 'layers', type: 'list' as const, source: 'builtin' as const,
            operators: id === 'activePartFormat' ? ['containsAny', 'notContains', 'empty', 'notEmpty'] as FieldDefinition['operators'] : [...LIST_OPERATORS], options,
        })));
    }
    if (mediaType === 'anime' || mediaType === 'series') {
        fields.push(...(['totalEpisodes', 'watchProgress'] as const).map(id => ({
            id, label: copy[id], icon: id === 'watchProgress' ? 'chart-no-axes-combined' : 'list-ordered',
            type: 'number' as const, source: 'builtin' as const, operators: [...NUMBER_OPERATORS],
            description: copy.allParts, min: 0, step: 1, ...(id === 'watchProgress' ? { max: 100, unit: '%' } : {}),
        })));
    }
    return fields;
}

/** Keep old saved YAML rules readable without changing their meaning or deleting them. */
export function getCatalogFieldId(field: string): string {
    if (!field.startsWith('yaml:')) return field;
    const key = field.slice(5).replace(/^(text|number|list|boolean|date):/, '').replace(/[_-]/g, '').toLowerCase();
    return ({ format: 'activePartFormat', studios: 'studios', studio: 'studios', authors: 'authors', author: 'authors', developer: 'developer', developers: 'developer',
        communityrating: 'communityRating', actors: 'actors', cast: 'actors', directors: 'director', director: 'director', runtime: 'runtime',
    } as Record<string, string>)[key] ?? field;
}

export type LibraryFieldGroup = 'title' | 'personal' | 'progress' | 'ratings' | 'dates' | 'note';
const CATALOG_COPY = {
    ru: { title: 'О тайтле', personal: 'Личное', progress: 'Прогресс', ratings: 'Оценки', dates: 'Даты', note: 'Поля заметок',
        search: 'Найти поле…', choose: 'Выберите поле', notes: 'Заметок', customHint: 'Новые свойства заметок появляются здесь автоматически.',
        text: 'Текст', number: 'Число', date: 'Дата', boolean: 'Да / нет', list: 'Список', noMatches: 'Поля не найдены', unavailable: 'Поле отсутствует в заметках',
        released: 'Дата выхода', platforms: 'Платформы', publisher: 'Издатель', repeat: 'Повторы' },
    en: { title: 'About the title', personal: 'Personal', progress: 'Progress', ratings: 'Ratings', dates: 'Dates', note: 'Note properties',
        search: 'Find a field…', choose: 'Choose a field', notes: 'Notes', customHint: 'New note properties appear here automatically.',
        text: 'Text', number: 'Number', date: 'Date', boolean: 'Yes / no', list: 'List', noMatches: 'No fields found', unavailable: 'Field not found in notes',
        released: 'Release date', platforms: 'Platforms', publisher: 'Publisher', repeat: 'Repeats' },
    uk: { title: 'Про тайтл', personal: 'Особисте', progress: 'Прогрес', ratings: 'Оцінки', dates: 'Дати', note: 'Поля нотаток',
        search: 'Знайти поле…', choose: 'Виберіть поле', notes: 'Нотаток', customHint: 'Нові властивості нотаток з’являються тут автоматично.',
        text: 'Текст', number: 'Число', date: 'Дата', boolean: 'Так / ні', list: 'Список', noMatches: 'Поля не знайдено', unavailable: 'Поле відсутнє в нотатках',
        released: 'Дата виходу', platforms: 'Платформи', publisher: 'Видавець', repeat: 'Повтори' },
    'zh-CN': { title: '作品信息', personal: '个人', progress: '进度', ratings: '评分', dates: '日期', note: '笔记属性',
        search: '查找字段…', choose: '选择字段', notes: '笔记数', customHint: '新增的笔记属性会自动显示在此处。',
        text: '文本', number: '数字', date: '日期', boolean: '是 / 否', list: '列表', noMatches: '未找到字段', unavailable: '笔记中没有此字段',
        released: '发行日期', platforms: '平台', publisher: '出版商', repeat: '重复次数' },
};
export const libraryCatalogCopy = (language: Language) => CATALOG_COPY[language];
export const LIBRARY_FIELD_GROUPS: LibraryFieldGroup[] = ['title', 'personal', 'progress', 'ratings', 'dates', 'note'];

export function getLibraryFieldGroup(field: FieldDefinition): LibraryFieldGroup {
    if (field.source === 'yaml') return 'note';
    if (['status', 'favorite', 'priority', 'custom', 'repeatCount'].includes(field.id)) return 'personal';
    if (['rating', 'communityRating'].includes(field.id)) return 'ratings';
    if (['dateStarted', 'dateFinished', 'finishedMonth', 'finishedYear', 'releaseDate'].includes(field.id)) return 'dates';
    if (['totalEpisodes', 'watchProgress'].includes(field.id)) return 'progress';
    return 'title';
}

export function reconcileCatalogYamlField<T extends string>(field: T, definitions: FieldDefinition[]): T | `yaml:${string}` {
    if (!field.startsWith('yaml:')) return field;
    const key = field.slice(5).replace(/^(text|number|date|boolean|list):/, '');
    const definition = definitions.find(entry => entry.source === 'yaml' && entry.id === `yaml:${key}`);
    return definition ? `yaml:${definition.type}:${key}` : field;
}

const FIELD_KEYS: Record<string, string[]> = {
    status: ['status', 'completed', 'playing', 'dropped', 'sandbox', 'wishlist', 'not_started'], favorite: ['favorite'], priority: ['personal_priority'],
    year: ['year'], rating: ['rating', 'userRating', 'rating_user'], series: ['gameSeries'],
    studios: ['studios', 'studio'], authors: ['authors', 'author'], developer: ['developers', 'developer'],
    actors: ['actors', 'cast'], director: ['director', 'directors'], runtime: ['runtime'],
    communityRating: ['communityRating', 'community_rating'], dateStarted: ['started', 'dateStarted', 'start_date'],
    dateFinished: ['finished', 'dateFinished', 'finish_date', 'dateCompleted', 'dateWatched', 'dateRead'],
    adult: ['Sex18', 'isAdult', 'adult'], custom: ['cm_poster'],
    activePartFormat: ['format', 'anime_parts', 'series_parts', 'movie_parts'], partFormats: ['format', 'anime_parts', 'series_parts', 'movie_parts'],
    totalEpisodes: ['episode_total', 'anime_parts', 'series_parts'], watchProgress: ['episode_current', 'episode_total', 'anime_parts', 'series_parts'],
    platforms: ['platforms', 'platform'], publisher: ['publisher', 'publishers'], releaseDate: ['released', 'releaseDate', 'release_date', 'premiered', 'publishedDate'], repeatCount: ['repeat_count'],
};

/** Match the current library's actual properties, not an imagined template schema. */
export function buildLibraryFieldCatalog(builtins: FieldDefinition[], items: readonly MediaItem[], rules: readonly FilterRule[], aliases: Record<string, string> = {}): FieldDefinition[] {
    // Only hide aliases already represented by a real built-in filter. A renamed
    // poster (for example xys) must remain available as an actual note property.
    const representedKeys = new Set(builtins.flatMap(field => FIELD_KEYS[field.id] ?? []));
    const managedKeys = Object.entries(aliases).filter(([canonical]) => representedKeys.has(canonical)).map(([, alias]) => alias);
    const rawKeys = items.map(item => new Set(Object.keys(item.rawFields ?? {}).map(key => key.toLowerCase().replace(/[_-]/g, ''))));
    const definitions = builtins.map(field => {
        const keys = (FIELD_KEYS[field.id] ?? []).flatMap(key => [key, aliases[key] ?? key]).map(key => key.toLowerCase().replace(/[_-]/g, ''));
        const noteCount = items.filter((item, index) => {
            if (keys.some(key => rawKeys[index].has(key))) return true;
            const value = getViewFieldValue(item, field.id);
            if (field.id === 'repeatCount' && value === 0) return false;
            if (typeof value === 'boolean') return value;
            return value !== null && value !== undefined && value !== '' && (!Array.isArray(value) || value.length > 0);
        }).length;
        const standardKeys = FIELD_KEYS[field.id] ?? [];
        const renamed = [...new Set(standardKeys.map(key => aliases[key]).filter(alias => alias && !standardKeys.includes(alias)))];
        return { ...field, label: renamed.length ? `${field.label} · ${renamed.join(', ')}` : field.label, noteCount };
    }).filter(field => field.noteCount > 0 || ['status', 'favorite', 'priority', 'year', 'rating', 'custom'].includes(field.id)
        || rules.some(rule => getCatalogFieldId(rule.field) === field.id));
    return populateFilterOptions([...definitions, ...collectYamlFieldDefinitions([...items], managedKeys)], items, rules);
}

/** Called with the full library, never with filtered results. Preserve stale selections too. */
export function populateFilterOptions(definitions: FieldDefinition[], items: readonly MediaItem[], rules: readonly FilterRule[]): FieldDefinition[] {
    return definitions.map(field => {
        if (field.type !== 'list') return field;
        const values = new Map((field.options ?? []).map(option => [option.value.toLocaleLowerCase(), option]));
        const presets = [...values.values()];
        const presetKeys = new Set(values.keys());
        const add = (value: unknown): void => {
            if (typeof value !== 'string' || !value.trim()) return;
            const text = value.trim(), key = text.toLocaleLowerCase();
            if (!values.has(key)) values.set(key, { value: text, label: text });
        };
        for (const item of items) {
            const raw = getViewFieldValue(item, field.id);
            (Array.isArray(raw) ? raw : [raw]).forEach(add);
        }
        for (const rule of rules.filter(rule => getCatalogFieldId(rule.field) === field.id)) {
            (Array.isArray(rule.value) ? rule.value : [rule.value]).forEach(add);
        }
        return { ...field, options: [...presets, ...[...values].filter(([key]) => !presetKeys.has(key)).map(([, option]) => option)
            .sort((a, b) => a.label.localeCompare(b.label))] };
    });
}
