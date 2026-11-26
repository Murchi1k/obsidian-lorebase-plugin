import type { ProviderId } from './types';
import type { IntegrationTemplateSettings } from '../../types';

export interface AlternativeTitle {
    title: string;
    /** Unknown-language synonyms are deliberately not guessed from their script. */
    language?: string;
}

const MANGADEX_LANGUAGES = ['en', 'ru', 'uk', 'ja', 'ko', 'zh', 'zh-hk', 'ja-ro', 'ko-ro', 'zh-ro', 'ar', 'bn', 'bg', 'my', 'ca', 'cs', 'da', 'nl', 'eo', 'et', 'fil', 'fi', 'fr', 'de', 'el', 'he', 'hi', 'hu', 'id', 'it', 'kk', 'la', 'lt', 'ms', 'mn', 'ne', 'no', 'fa', 'pl', 'pt', 'pt-br', 'ro', 'sr', 'sk', 'es', 'es-la', 'sv', 'ta', 'te', 'th', 'tr', 'vi'];

const MANGAUPDATES_TITLE_SCRIPTS = new Map<string, RegExp>([
    ['Cyrl', /\p{Script=Cyrillic}/u],
    ['Latn', /\p{Script=Latin}/u],
    ['Hrkt', /[\p{Script=Hiragana}\p{Script=Katakana}]/u],
    ['Hani', /\p{Script=Han}/u],
    ['Hang', /\p{Script=Hangul}/u],
    ['Arab', /\p{Script=Arabic}/u],
    ['Deva', /\p{Script=Devanagari}/u],
    ['Thai', /\p{Script=Thai}/u],
]);

export function getAlternativeTitleOptions(provider: ProviderId): string[] {
    switch (provider) {
        case 'anilist': return ['all', 'en', 'romaji', 'native'];
        case 'shikimori': return ['all', 'ru', 'en', 'ja', 'romaji'];
        case 'jikan': return ['all', 'en', 'ja', 'default'];
        case 'kitsu': return ['all', 'en', 'ja', 'romaji'];
        case 'mangadex': return ['all', ...MANGADEX_LANGUAGES];
        case 'mangaupdates': return ['all', ...MANGAUPDATES_TITLE_SCRIPTS.keys()];
        default: return [];
    }
}

export function getAlternativeTitlePreference(settings?: IntegrationTemplateSettings, provider = settings?.provider) {
    const language = provider ? settings?.alternativeTitleLanguages?.[provider] : undefined;
    return {
        language: language && language !== 'none' ? language : 'all',
        enabled: language !== 'none' && (!provider || settings?.alternativeTitlesDisabled?.[provider] !== true),
    };
}

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function readAlternativeTitles(provider: ProviderId, value: unknown): AlternativeTitle[] {
    const item = record(value);
    const result: AlternativeTitle[] = [];
    const add = (raw: unknown, language?: string): void => {
        if (Array.isArray(raw)) { raw.forEach(entry => add(entry, language)); return; }
        if (typeof raw !== 'string' || !raw.trim()) return;
        const title = raw.trim();
        if (!result.some(entry => entry.title === title && entry.language === language)) result.push({ title, language });
    };
    if (provider === 'anilist') {
        const titles = record(item.title);
        add(titles.english, 'en'); add(titles.romaji, 'romaji'); add(titles.native, 'native');
        add(item.synonyms);
    } else if (provider === 'kitsu') {
        for (const [locale, title] of Object.entries(record(item.titles))) add(title, locale === 'en_jp' ? 'romaji' : locale.split('_')[0]);
        add(item.abbreviatedTitles);
    } else if (provider === 'shikimori') {
        add(item.name, 'romaji'); add(item.russian, 'ru'); add(item.english, 'en'); add(item.japanese, 'ja');
        add(item.synonyms);
    } else if (provider === 'jikan') {
        add(item.title, 'default'); add(item.title_english, 'en'); add(item.title_japanese, 'ja'); add(item.title_synonyms);
        const languages: Record<string, string> = { English: 'en', Japanese: 'ja', Default: 'default' };
        for (const entry of Array.isArray(item.titles) ? item.titles : []) {
            const title = record(entry);
            add(title.title, languages[String(title.type)]);
        }
    } else if (provider === 'mangadex') {
        const localized = [item.title, ...(Array.isArray(item.altTitles) ? item.altTitles : [])];
        for (const titles of localized) for (const [language, title] of Object.entries(record(titles))) add(title, language);
    } else if (provider === 'mangaupdates') {
        add(item.title);
        for (const entry of Array.isArray(item.associated) ? item.associated : []) add(record(entry).title);
    }
    return result;
}

export function selectAlternativeTitles(titles: AlternativeTitle[] | undefined, language = 'all', primaryTitle = ''): string[] {
    if (language === 'none') return [];
    const script = MANGAUPDATES_TITLE_SCRIPTS.get(language);
    const normalize = (text: string): string => text.normalize('NFKC').trim().toLowerCase();
    const seen = new Set([normalize(primaryTitle)]);
    const result: string[] = [];
    for (const entry of titles ?? []) {
        // MangaUpdates sometimes appends an annotation such as "(Ukrainian)" to the title text.
        if (script ? !script.test(entry.title.replace(/\s+\([^()]+\)\s*$/, '')) : language !== 'all' && entry.language !== language) continue;
        const key = normalize(entry.title);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        result.push(entry.title.trim());
    }
    return result;
}

/** Accept saved part aliases without interpreting descriptions or unrelated metadata as names. */
export function readPartAlternativeTitles(source: Record<string, unknown>): string[] {
    const titles: AlternativeTitle[] = [];
    const add = (value: unknown): void => {
        if (Array.isArray(value)) { value.forEach(add); return; }
        const title = typeof value === 'string' ? value : record(value).title;
        if (typeof title === 'string' && title.trim()) titles.push({ title: title.trim() });
    };
    for (const key of ['alternativeTitles', 'alternative_titles', 'alt_titles', 'altTitles', 'titles', 'aliases', 'synonyms', 'original_title', 'originalTitle', 'original_name', 'originalName']) add(source[key]);
    return selectAlternativeTitles(titles, 'all', typeof source.title === 'string' ? source.title : '');
}
