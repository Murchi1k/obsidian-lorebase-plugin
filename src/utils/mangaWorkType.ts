import type { Language, MediaWorkTypeCatalog, LibraryViewState } from '../types';

const COMICS_ALIAS = /^(?:comics?|комиксы?|комікси?|欧美漫画)$/i;
const canonicalComics = (value: string): string => COMICS_ALIAS.test(value) ? 'Comics' : value;

export const DEFAULT_MANGA_WORK_TYPES = [
    'Manga',
    'Manhwa',
    'Manhua',
    'Light novel',
    'Webtoon',
    'One-shot',
    'Doujinshi',
    'Comics',
] as const;

const LABELS: Record<Language, Record<string, string>> = {
    'zh-CN': {
        Manga: '日漫', Manhwa: '韩漫', Manhua: '国漫', 'Light novel': '轻小说',
        Webtoon: '条漫', 'One-shot': '短篇', Doujinshi: '同人志', Comics: '欧美漫画',
    },
    en: {
        Manga: 'Manga', Manhwa: 'Manhwa', Manhua: 'Manhua', 'Light novel': 'Light novel',
        Webtoon: 'Webtoon', 'One-shot': 'One-shot', Doujinshi: 'Doujinshi', Comics: 'Comics',
    },
    ru: {
        Manga: 'Манга', Manhwa: 'Манхва', Manhua: 'Маньхуа', 'Light novel': 'Ранобэ',
        Webtoon: 'Вебтун', 'One-shot': 'Ваншот', Doujinshi: 'Додзинси', Comics: 'Комиксы',
    },
    uk: {
        Manga: 'Манґа', Manhwa: 'Манхва', Manhua: 'Маньхуа', 'Light novel': 'Ранобе',
        Webtoon: 'Вебтун', 'One-shot': 'Ваншот', Doujinshi: 'Додзінсі', Comics: 'Комікси',
    },
};

export function getMangaWorkTypeLabel(value: string, language: Language): string {
    value = normalizeMangaWorkType(value);
    const label = activeCatalog?.types.find(entry => entry.value === value)?.label;
    if (label) return label;
    return LABELS[language]?.[value] ?? value;
}

let activeCatalog: MediaWorkTypeCatalog | undefined;
export function configureMangaWorkTypes(catalog?: MediaWorkTypeCatalog): void { activeCatalog = catalog; }
export function normalizeWorkTypeCatalog(raw: unknown): MediaWorkTypeCatalog {
    const source = raw && typeof raw === 'object' ? raw as Partial<MediaWorkTypeCatalog> : {};
    const seen = new Set<string>();
    const candidates: MediaWorkTypeCatalog['types'] = Array.isArray(source.types) ? source.types : DEFAULT_MANGA_WORK_TYPES.map(value => ({ value }));
    const types = candidates
        .filter(entry => entry && typeof entry.value === 'string' && entry.value.trim())
        .map(entry => ({ value: entry.value.trim(), ...(typeof entry.label === 'string' && entry.label.trim() ? { label: entry.label.trim() } : {}), ...(typeof entry.color === 'string' && /^#[0-9a-f]{6}$/i.test(entry.color) ? { color: entry.color.toLowerCase() } : {}) }))
        .filter(entry => { const key = entry.value.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; });
    const redirects: Record<string, string> = {};
    if (source.redirects && typeof source.redirects === 'object' && !Array.isArray(source.redirects)) {
        for (const [from, to] of Object.entries(source.redirects)) if (typeof to === 'string' && from !== to && types.some(entry => entry.value === to)) redirects[from] = to;
    }
    return { types: types.length ? types : DEFAULT_MANGA_WORK_TYPES.map(value => ({ value })), redirects };
}
export function addComicsWorkType(catalog: MediaWorkTypeCatalog): MediaWorkTypeCatalog {
    const types = catalog.types.map(entry => ({ ...entry, value: canonicalComics(entry.value) }));
    if (!types.some(entry => entry.value === 'Comics')) types.push({ value: 'Comics' });
    const redirects = { ...catalog.redirects };
    for (const [from, to] of Object.entries(redirects)) {
        if (COMICS_ALIAS.test(from)) delete redirects[from];
        else redirects[from] = canonicalComics(to);
    }
    return normalizeWorkTypeCatalog({ types, redirects });
}
export function getMangaWorkTypeCatalog(discovered: string[] = []): MediaWorkTypeCatalog {
    const catalog = normalizeWorkTypeCatalog(activeCatalog);
    for (const raw of discovered) {
        const value = normalizeMangaWorkType(raw);
        if (!catalog.types.some(entry => entry.value === value)) catalog.types.push({ value });
    }
    return catalog;
}
export function getMangaWorkTypeOptions(language: Language, discovered: string[] = []): Array<{ value: string; label: string }> {
    return getMangaWorkTypeCatalog(discovered).types.map(entry => ({ value: entry.value, label: getMangaWorkTypeLabel(entry.value, language) }));
}
export function getManageWorkTypesLabel(language: Language, countries = false): string {
    if (countries) return ({ ru: 'Настроить страны…', uk: 'Налаштувати країни…', en: 'Manage countries…', 'zh-CN': '管理国家…' })[language];
    return ({ ru: 'Настроить типы…', uk: 'Налаштувати типи…', en: 'Manage types…', 'zh-CN': '管理类型…' })[language];
}
export function replaceWorkTypeInView(state: LibraryViewState, from: string, to: string): void {
    state.workTypes = [...new Set((state.workTypes ?? []).map(value => value === from ? to : value))];
    for (const rule of state.rules) if (rule.field === 'workType') {
        if (Array.isArray(rule.value)) rule.value = [...new Set(rule.value.map(value => value === from ? to : value))];
        else if (rule.value === from) rule.value = to;
    }
}

export function inferMangaWorkType(format?: string | null, countryOrLanguage?: string | null): string {
    const source = `${format ?? ''} ${countryOrLanguage ?? ''}`.trim().toLowerCase().replace(/[\s-]+/g, '_');
    const has = (...values: string[]): boolean => values.some((value) => source === value
        || source.startsWith(`${value}_`)
        || source.endsWith(`_${value}`)
        || source.includes(`_${value}_`));
    if (has('light_novel', 'novel', 'ranobe')) return normalizeMangaWorkType('Light novel');
    if (has('webtoon', 'web_comic', 'webcomic')) return normalizeMangaWorkType('Webtoon');
    if (has('one_shot', 'oneshot')) return normalizeMangaWorkType('One-shot');
    if (has('doujinshi', 'doujin')) return normalizeMangaWorkType('Doujinshi');
    if (has('comic', 'comics')) return normalizeMangaWorkType('Comics');
    if (has('manhwa', 'south_korea', 'korea', 'kr', 'ko')) return normalizeMangaWorkType('Manhwa');
    if (has('manhua', 'china', 'taiwan', 'hong_kong', 'cn', 'tw', 'zh')) return normalizeMangaWorkType('Manhua');
    return normalizeMangaWorkType('Manga');
}

export function normalizeMangaWorkType(value: unknown): string {
    const rawText = String(value ?? '').trim();
    const text = canonicalComics(rawText) || 'Manga';
    const canonical = DEFAULT_MANGA_WORK_TYPES.find((entry) => entry.toLowerCase() === text.toLowerCase());
    const normalized = canonical ?? activeCatalog?.types.find(entry => entry.value.toLowerCase() === text.toLowerCase())?.value ?? text;
    return activeCatalog && Object.prototype.hasOwnProperty.call(activeCatalog.redirects, normalized) ? activeCatalog.redirects[normalized] : normalized;
}
