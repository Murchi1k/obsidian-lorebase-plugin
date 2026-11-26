import type { FilterableMediaItem } from './libraryViewState';

const TITLE_FIELDS = new Set([
    'name', 'title', 'titles', 'alttitles', 'alias', 'aliases', 'alternativetitle', 'alternativetitles',
    'localizedtitle', 'localizedtitles', 'originaltitle', 'originalname', 'synonyms',
]);

export function normalizeTitleSearch(value: string): string {
    return value.normalize('NFKC').toLowerCase().replace(/ё/g, 'е').replace(/[\p{P}\p{S}\s]+/gu, ' ').trim();
}

export interface TitleSearchMatch {
    rank: number;
    source: 'title' | 'alias' | 'part' | 'part-alias';
    title: string;
    partId?: string;
    partTitle?: string;
}

/** All words must match one title; aliases and parts never contribute partial words to each other. */
export function titleSearchRank(title: string, query: string): number | null {
    const needle = normalizeTitleSearch(query);
    if (!needle) return null;
    return rankTitle(title, needle, needle.split(' '));
}

function rankTitle(title: string, needle: string, words: readonly string[]): number | null {
    const value = normalizeTitleSearch(title);
    if (value === needle) return 0;
    if (value.startsWith(needle)) return 1;
    return words.every(word => value.includes(word)) ? 2 : null;
}

export function getTitleSearchMatch(item: FilterableMediaItem, query: string): TitleSearchMatch | null {
    const normalized = normalizeTitleSearch(query);
    if (!normalized) return null;
    const words = normalized.split(' ');
    let best: TitleSearchMatch | null = null;
    const consider = (value: unknown, source: TitleSearchMatch['source'], part?: { id: string; title: string }): void => {
        if (typeof value !== 'string') return;
        const rank = rankTitle(value, normalized, words);
        if (rank === null || (best && rank >= best.rank)) return;
        best = { rank, source, title: value, ...(part ? { partId: part.id, partTitle: part.title } : {}) };
    };
    consider(item.displayName, 'title');
    consider(item.nameLower, 'title');
    for (const [key, value] of Object.entries(item.rawFields ?? {})) {
        if (!TITLE_FIELDS.has(key.toLowerCase().replace(/[\s_-]/g, ''))) continue;
        if (Array.isArray(value)) value.forEach(alias => consider(alias, 'alias'));
        else consider(value, 'alias');
    }
    for (const part of item.parts ?? []) {
        consider(part.title, 'part', part);
        for (const alias of part.alternativeTitles ?? []) consider(alias, 'part-alias', part);
    }
    return best;
}

