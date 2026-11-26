import type { Language, MediaType, MediaWorkTypeCatalog } from '../types';
import { DEFAULT_MANGA_WORK_TYPES, configureMangaWorkTypes, getMangaWorkTypeCatalog, getMangaWorkTypeLabel, normalizeMangaWorkType, normalizeWorkTypeCatalog } from './mangaWorkType';

export type WorkTypeMedia = 'game' | 'movie' | 'series' | 'manga';
/** Muted accents based on the release calendar palette, keyed by stable values rather than translated labels. */
export function getMediaWorkTypeColor(type: string, raw: string): string {
    const value = type === 'anime' ? normalizeCountry(raw) : supportsWorkTypes(type) ? normalizeMediaWorkType(type, raw) : raw;
    const custom = catalogs[type as MediaType]?.types.find(entry => entry.value === value)?.color;
    if (custom && /^#[0-9a-f]{6}$/i.test(custom)) return custom;
    const colors: Record<string, Record<string, string>> = {
        game: { Game: '#f2a66f', 'Visual novel': '#c19af0' },
        movie: { Movie: '#8f9df5', Animation: '#e4ae6c', Documentary: '#79c8b2' },
        series: { Series: '#74b9e8', 'Animated series': '#bb9aea', 'Documentary series': '#79c8b2', 'TV show': '#e3bd72' },
        manga: { Manga: '#9fc87b', Manhwa: '#79c8bd', Manhua: '#e6b378', 'Light novel': '#b59ae6', Webtoon: '#83b9ea', 'One-shot': '#e49ebc', Doujinshi: '#d8a3dc', Comics: '#e99c81' },
        anime: { JP: '#e687ba', CN: '#e4b472', KR: '#7bc8bd', US: '#83b4ed', TW: '#bc9ee5', FR: '#8f9df5', GB: '#da9c91', CA: '#9fc87b' },
    };
    if (colors[type]?.[value]) return colors[type][value];
    if (!value) return '#a6a6b9';
    let hash = 0;
    for (const character of `${type}:${value.toLowerCase()}`) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) | 0;
    const hue = ((hash >>> 0) % 360) / 30;
    const channel = (offset: number): string => {
        const k = (offset + hue) % 12;
        return Math.round((0.73 - 0.58 * 0.27 * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255).toString(16).padStart(2, '0');
    };
    return `#${channel(0)}${channel(8)}${channel(4)}`;
}
export const WORK_TYPE_DEFAULTS: Record<WorkTypeMedia, readonly string[]> = {
    game: ['Game', 'Visual novel'], movie: ['Movie', 'Animation', 'Documentary'],
    series: ['Series', 'Animated series', 'Documentary series', 'TV show'],
    manga: DEFAULT_MANGA_WORK_TYPES,
};
const labels: Record<string, [string, string, string]> = {
    Game: ['Игра', 'Гра', '游戏'], 'Visual novel': ['Визуальная новелла', 'Візуальна новела', '视觉小说'],
    Movie: ['Фильм', 'Фільм', '电影'], Animation: ['Мультфильм', 'Мультфільм', '动画电影'],
    Documentary: ['Документальный фильм', 'Документальний фільм', '纪录电影'],
    Series: ['Сериал', 'Серіал', '剧集'], 'Animated series': ['Мультсериал', 'Мультсеріал', '动画剧集'],
    'Documentary series': ['Документальный сериал', 'Документальний серіал', '纪录剧集'], 'TV show': ['Телешоу', 'Телешоу', '电视节目'],
};
let catalogs: Partial<Record<MediaType, MediaWorkTypeCatalog>> = {};
export function supportsWorkTypes(type: string): type is WorkTypeMedia { return Object.prototype.hasOwnProperty.call(WORK_TYPE_DEFAULTS, type); }
export function configureMediaWorkTypes(value: typeof catalogs = {}): void {
    catalogs = { ...value, anime: normalizeAnimeCountryCatalog(value.anime) }; configureMangaWorkTypes(value.manga);
}
export function normalizeMediaWorkTypeCatalog(type: WorkTypeMedia, raw?: unknown): MediaWorkTypeCatalog {
    const source = raw && typeof raw === 'object' ? raw as Partial<MediaWorkTypeCatalog> : {};
    return normalizeWorkTypeCatalog({ ...source, types: Array.isArray(source.types) && source.types.length ? source.types : WORK_TYPE_DEFAULTS[type].map(value => ({ value })) });
}
export function normalizeMediaWorkType(type: WorkTypeMedia, raw: unknown): string {
    if (type === 'manga') return normalizeMangaWorkType(raw);
    const catalog = normalizeMediaWorkTypeCatalog(type, catalogs[type]);
    const text = String(raw ?? '').trim() || WORK_TYPE_DEFAULTS[type][0];
    const canonical = catalog.types.find(entry => entry.value.toLowerCase() === text.toLowerCase())?.value ?? text;
    return Object.prototype.hasOwnProperty.call(catalog.redirects, canonical) ? catalog.redirects[canonical] : canonical;
}
export function getMediaWorkTypeCatalog(type: WorkTypeMedia, discovered: string[] = []): MediaWorkTypeCatalog {
    if (type === 'manga') return getMangaWorkTypeCatalog(discovered);
    const catalog = normalizeMediaWorkTypeCatalog(type, catalogs[type]);
    for (const raw of discovered) {
        const value = normalizeMediaWorkType(type, raw);
        if (!catalog.types.some(entry => entry.value === value)) catalog.types.push({ value });
    }
    return catalog;
}
export function getMediaWorkTypeLabel(type: MediaType, value: string, language: Language): string {
    if (type === 'anime') return countryLabel(value, language);
    if (!supportsWorkTypes(type)) return value;
    value = normalizeMediaWorkType(type, value);
    const custom = catalogs[type]?.types.find(entry => entry.value === value)?.label;
    if (custom) return custom;
    const translated = labels[value];
    if (translated) return language === 'ru' ? translated[0] : language === 'uk' ? translated[1] : language === 'zh-CN' ? translated[2] : value;
    return type === 'manga' ? getMangaWorkTypeLabel(value, language) : value;
}
export function getMediaWorkTypeOptions(type: WorkTypeMedia, language: Language, discovered: string[] = []) {
    return getMediaWorkTypeCatalog(type, discovered).types.map(entry => ({ value: entry.value, label: getMediaWorkTypeLabel(type, entry.value, language) }));
}
export function normalizeCountry(value: unknown): string {
    const text = String(value ?? '').trim();
    const aliases: Record<string, string> = { japan: 'JP', china: 'CN', 'south korea': 'KR', korea: 'KR', taiwan: 'TW', 'япония': 'JP', 'китай': 'CN', 'южная корея': 'KR', 'японія': 'JP', 'південна корея': 'KR' };
    return aliases[text.toLowerCase()] ?? (/^[a-z]{2}$/i.test(text) ? text.toUpperCase() : text);
}
export function countryLabel(value: string, language: Language): string {
    if (!value) return '';
    const custom = catalogs.anime?.types.find(entry => entry.value === normalizeCountry(value))?.label;
    if (custom) return custom;
    try { return new Intl.DisplayNames([language], { type: 'region' }).of(value) || value; } catch { return value; }
}
export const MAIN_ANIME_COUNTRIES = ['JP', 'CN', 'KR', 'US', 'TW', 'FR', 'GB', 'CA'] as const;
export function countryOptions(language: Language, discovered: string[] = []) {
    return getAnimeCountryCatalog(discovered).types.map(entry => ({ value: entry.value, label: countryLabel(entry.value, language) }));
}
export function normalizeAnimeCountryCatalog(raw?: unknown): MediaWorkTypeCatalog {
    const source = raw && typeof raw === 'object' ? raw as Partial<MediaWorkTypeCatalog> : {};
    const entries: MediaWorkTypeCatalog['types'] = Array.isArray(source.types) && source.types.length ? source.types : MAIN_ANIME_COUNTRIES.map(value => ({ value }));
    const seen = new Set<string>();
    const types = entries.filter(entry => entry && typeof entry.value === 'string').map(entry => ({
        value: normalizeCountry(entry.value),
        ...(typeof entry.label === 'string' && entry.label.trim() ? { label: entry.label.trim() } : {}),
        ...(typeof entry.color === 'string' && /^#[0-9a-f]{6}$/i.test(entry.color) ? { color: entry.color.toLowerCase() } : {}),
    })).filter(entry => /^[A-Z]{2}$/.test(entry.value) && !seen.has(entry.value) && Boolean(seen.add(entry.value)));
    const hidden = Array.isArray(source.hidden) ? [...new Set(source.hidden.filter((value): value is string => typeof value === 'string').map(normalizeCountry).filter(value => /^[A-Z]{2}$/.test(value) && !types.some(entry => entry.value === value)))] : [];
    return { types: types.length ? types : MAIN_ANIME_COUNTRIES.map(value => ({ value })), redirects: {}, ...(hidden.length ? { hidden } : {}) };
}
export function getAnimeCountryCatalog(discovered: string[] = []): MediaWorkTypeCatalog {
    const catalog = normalizeAnimeCountryCatalog(catalogs.anime);
    for (const raw of discovered) {
        const value = normalizeCountry(raw);
        if (/^[A-Z]{2}$/.test(value) && !catalog.hidden?.includes(value) && !catalog.types.some(entry => entry.value === value)) catalog.types.push({ value });
    }
    return catalog;
}
export function countryFieldLabel(language: Language): string { return language === 'ru' ? 'Страна' : language === 'uk' ? 'Країна' : language === 'zh-CN' ? '国家' : 'Country'; }
