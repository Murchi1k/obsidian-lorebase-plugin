import { JsonFetcher, asObject, getArray, getString } from './common';

export interface HowLongToBeatTimes {
    main: string;
    main_plus_sides: string;
    perfectionist: string;
}

interface CandidateScore {
    score: number;
    item: Record<string, unknown>;
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
    year?: string
): Promise<HowLongToBeatTimes | null> {
    const terms = normalizeWords(gameName).slice(0, 12);
    if (!terms.length) return null;

    const init = asObject(await fetchJson(
        `https://howlongtobeat.com/api/finder/init?t=${Date.now()}`,
        HLTB_BASE_HEADERS
    ));
    const token = getString(init, 'token');
    if (!token) return null;

    const payload = {
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

    const search = asObject(await fetchJson(
        'https://howlongtobeat.com/api/finder',
        {
            ...HLTB_BASE_HEADERS,
            'Content-Type': 'application/json',
            'x-auth-token': token,
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
        main: formatSecondsToDuration(best.item.comp_main),
        main_plus_sides: formatSecondsToDuration(best.item.comp_plus),
        perfectionist: formatSecondsToDuration(best.item.comp_100),
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

function formatSecondsToDuration(value: unknown): string {
    const seconds = toNumber(value);
    if (!Number.isFinite(seconds) || seconds <= 0) return '';

    if (seconds < 3600) {
        const mins = Math.max(1, Math.round(seconds / 60));
        return `${mins} ${mins === 1 ? 'Min' : 'Mins'}`;
    }

    const hours = Math.max(1, Math.round(seconds / 3600));
    return `${hours} ${hours === 1 ? 'Hour' : 'Hours'}`;
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
