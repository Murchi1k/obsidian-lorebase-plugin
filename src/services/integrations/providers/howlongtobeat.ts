import { JsonFetcher, asObject, getArray, getString } from './common';

export interface HowLongToBeatTimes {
    main: number | '';
    main_plus_sides: number | '';
    perfectionist: number | '';
}

interface CandidateScore {
    score: number;
    item: Record<string, unknown>;
}

type TextFetcher = (url: string, headers?: Record<string, string>) => Promise<string>;
const endpointCache = new WeakMap<TextFetcher, { expires: number; value: Promise<string> }>();
const HLTB_ORIGIN = 'https://howlongtobeat.com';

export function extractHltbSearchPath(script: string): string | null {
    const matches = script.matchAll(/fetch\s*\(\s*["'](\/api\/[a-zA-Z0-9_/-]+)["']\s*,\s*\{[^}]*?method\s*:\s*["']POST["'][^}]*\}/gi);
    for (const match of matches) {
        if (/searchTerms|searchOptions|searchType/.test(script.slice(Math.max(0, match.index - 2000), match.index + 2000))) {
            return match[1].replace(/\/+$/, '');
        }
    }
    return null;
}

async function discoverEndpoint(fetchText: TextFetcher): Promise<string> {
    const html = await fetchText(`${HLTB_ORIGIN}/`, HLTB_BASE_HEADERS);
    const urls = new Set<string>();
    for (const match of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) {
        const url = new URL(match[1].replace(/&amp;/g, '&'), HLTB_ORIGIN);
        if (url.origin === HLTB_ORIGIN && url.pathname.startsWith('/_next/static/chunks/')) urls.add(url.href);
    }
    for (const url of Array.from(urls).slice(0, 40)) {
        try {
            const path = extractHltbSearchPath(await fetchText(url, HLTB_BASE_HEADERS));
            if (path) return path;
        } catch (error) {
            if ((error as { status?: number })?.status !== 404) throw error;
        }
    }
    throw new Error('HowLongToBeat search endpoint was not found in site scripts');
}

function getEndpoint(fetchText: TextFetcher): Promise<string> {
    const cached = endpointCache.get(fetchText);
    if (cached && cached.expires > Date.now()) return cached.value;
    const value = discoverEndpoint(fetchText);
    endpointCache.set(fetchText, { expires: Date.now() + 60 * 60 * 1000, value });
    void value.catch(() => {
        if (endpointCache.get(fetchText)?.value === value) endpointCache.delete(fetchText);
    });
    return value;
}

const HLTB_BASE_HEADERS: Record<string, string> = {
    Accept: 'application/json, text/plain, */*',
    Referer: 'https://howlongtobeat.com/',
    Origin: 'https://howlongtobeat.com',
    'User-Agent': 'Mozilla/5.0',
};

export async function getHowLongToBeatTimes(
    fetchJson: JsonFetcher,
    gameName: string,
    year?: string,
    fetchText?: TextFetcher
): Promise<HowLongToBeatTimes | null> {
    if (!normalizeWords(gameName).length) return null;
    for (let attempt = 0; attempt < 2; attempt++) {
        const endpoint = fetchText ? await getEndpoint(fetchText) : '/api/s';
        try {
            return await searchTimes(fetchJson, gameName, year, endpoint);
        } catch (error) {
            if (!fetchText || attempt > 0 || (error as { status?: number })?.status !== 404) throw error;
            endpointCache.delete(fetchText);
        }
    }
    return null;
}

async function searchTimes(fetchJson: JsonFetcher, gameName: string, year: string | undefined, endpoint: string): Promise<HowLongToBeatTimes | null> {
    const terms = normalizeWords(gameName).slice(0, 12);
    if (!terms.length) return null;

    const init = asObject(await fetchJson(
        `${HLTB_ORIGIN}${endpoint}/init?t=${Date.now()}`,
        HLTB_BASE_HEADERS
    ));
    const token = getString(init, 'token');
    const hpKey = getString(init, 'hpKey') || Object.entries(init ?? {}).find(([key]) => /key$/i.test(key))?.[1];
    const hpVal = getString(init, 'hpVal') || Object.entries(init ?? {}).find(([key]) => /val(?:ue)?$/i.test(key))?.[1];
    if (!token) return null;

    const payload: Record<string, unknown> = {
        searchType: 'games',
        searchTerms: terms,
        searchPage: 1,
        size: 20,
        searchOptions: {
            games: {
                userId: 0,
                platform: '',
                sortCategory: 'popular',
                rangeCategory: 'main',
                rangeTime: { min: 0, max: 0 },
                gameplay: { perspective: '', flow: '', genre: '', difficulty: '' },
                rangeYear: { min: '', max: '' },
                modifier: '',
            },
            users: { sortCategory: 'postcount' },
            lists: { sortCategory: 'follows' },
            filter: '',
            sort: 0,
            randomizer: 0,
        },
        useCache: true,
    };
    if (typeof hpKey === 'string' && typeof hpVal === 'string' && hpKey && hpVal) {
        payload[hpKey] = hpVal;
    }

    const search = asObject(await fetchJson(
        `${HLTB_ORIGIN}${endpoint}`,
        {
            ...HLTB_BASE_HEADERS,
            'Content-Type': 'application/json',
            'x-auth-token': token,
            ...(typeof hpKey === 'string' && hpKey ? { 'x-hp-key': hpKey } : {}),
            ...(typeof hpVal === 'string' && hpVal ? { 'x-hp-val': hpVal } : {}),
        },
        'POST',
        JSON.stringify(payload)
    ));
    const candidates = getArray(search, 'data')
        .map((entry) => asObject(entry))
        .filter((entry): entry is Record<string, unknown> => Boolean(entry));
    if (!candidates.length) return null;

    const best = pickBestMatch(candidates, gameName, year);
    if (!best || best.score < 30) return null;

    return {
        main: secondsToHours(best.item.comp_main),
        main_plus_sides: secondsToHours(best.item.comp_plus),
        perfectionist: secondsToHours(best.item.comp_100),
    };
}

function pickBestMatch(items: Record<string, unknown>[], gameName: string, year?: string): CandidateScore | null {
    let best: CandidateScore | null = null;

    for (const item of items) {
        const candidateName = toStringSafe(item.game_name);
        if (!candidateName) continue;
        const score = scoreMatch(gameName, candidateName, year, toStringSafe(item.release_world));
        if (!best || score > best.score) {
            best = { score, item };
        }
    }

    return best;
}

function scoreMatch(query: string, candidate: string, queryYear?: string, candidateYear?: string): number {
    const queryWords = normalizeWords(query);
    const candidateWords = normalizeWords(candidate);
    const queryCompact = queryWords.join('');
    const candidateCompact = candidateWords.join('');
    const queryPart = extractPartNumber(queryWords);
    const candidatePart = extractPartNumber(candidateWords);

    let score = 0;

    if (queryCompact && candidateCompact) {
        if (queryCompact === candidateCompact) {
            score += 100;
        } else if (candidateCompact.startsWith(queryCompact) || queryCompact.startsWith(candidateCompact)) {
            score += 70;
        }
    }

    const overlap = overlapRatio(queryWords, candidateWords);
    score += Math.round(overlap * 40);

    if (queryPart !== null && candidatePart !== null) {
        score += queryPart === candidatePart ? 20 : -35;
    }

    if (queryYear && candidateYear && queryYear === candidateYear) {
        score += 10;
    }

    return score;
}

function normalizeWords(value: string): string[] {
    const normalized = value
        .replace(/[™®©]/g, ' ')
        .normalize('NFKD')
        .toLowerCase()
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\b(tm|trademark)\b/g, ' ')
        .replace(/\b(viii|vii|vi|iv|iii|ii|ix|x|v|i)\b/g, (match) => romanToNumber(match).toString())
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

    if (!normalized) return [];
    return normalized.split(/\s+/).filter(Boolean);
}

function overlapRatio(first: string[], second: string[]): number {
    if (!first.length || !second.length) return 0;
    const secondSet = new Set(second);
    let common = 0;
    for (const token of first) {
        if (secondSet.has(token)) common += 1;
    }
    return common / first.length;
}

function secondsToHours(value: unknown): number | '' {
    const seconds = toNumber(value);
    if (!Number.isFinite(seconds) || seconds <= 0) return '';
    return Math.max(0.1, Math.round((seconds / 3600) * 10) / 10);
}

function toNumber(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : NaN;
    }
    return NaN;
}

function toStringSafe(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return '';
}

function romanToNumber(value: string): number {
    switch (value) {
        case 'i':
            return 1;
        case 'ii':
            return 2;
        case 'iii':
            return 3;
        case 'iv':
            return 4;
        case 'v':
            return 5;
        case 'vi':
            return 6;
        case 'vii':
            return 7;
        case 'viii':
            return 8;
        case 'ix':
            return 9;
        case 'x':
            return 10;
        default:
            return 0;
    }
}

function extractPartNumber(words: string[]): number | null {
    const partIndex = words.indexOf('part');
    if (partIndex < 0) return null;
    const raw = words[partIndex + 1];
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
}
