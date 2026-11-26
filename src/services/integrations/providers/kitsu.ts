import type { AnimeDetails, IntegrationAnimePart, MangaDetails, SearchResult } from '../types';
import { readAlternativeTitles, selectAlternativeTitles } from '../alternativeTitles';
import { asObject, getArray, getObject, getString, mapAnimeFormat, stripHtml, type JsonFetcher } from './common';
import type { AnimeFormat } from '../../../types';

export const KITSU_BASE = 'https://kitsu.io/api/edge';
export const KITSU_HEADERS = { Accept: 'application/vnd.api+json' };
type RecordValue = Record<string, unknown>;
const validId = (value: unknown): string => /^[1-9]\d*$/.test(String(value ?? '')) ? String(value) : '';
const attributes = (row: RecordValue | null): RecordValue => getObject(row, 'attributes') ?? {};
const positive = (value: unknown): number | null => value !== null && value !== '' && Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;

/** Bound public catalog requests, including requests queued by the shared transport. */
export async function fetchKitsu(fetch: JsonFetcher, path: string): Promise<unknown> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            Promise.resolve().then(() => fetch(`${KITSU_BASE}/${path}`, KITSU_HEADERS)),
            new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Kitsu request timed out')), 8_000); }),
        ]);
    } finally { clearTimeout(timer); }
}
export function kitsuTitle(row: RecordValue | null): string {
    const data = attributes(row), titles = getObject(data, 'titles');
    return getString(data, 'canonicalTitle') || getString(titles, 'en') || getString(titles, 'en_us') || getString(titles, 'en_jp') || getString(titles, 'ja_jp');
}
function image(row: RecordValue | null, key = 'posterImage'): string {
    const images = getObject(attributes(row), key);
    return getString(images, 'large') || getString(images, 'original') || getString(images, 'medium');
}
function rating(row: RecordValue): { score: string; votes: string } {
    const data = attributes(row), average = positive(data.averageRating);
    const frequencies = getObject(data, 'ratingFrequencies');
    const votes = frequencies ? Object.values(frequencies).reduce<number>((sum, value) => sum + (positive(value) ?? 0), 0) : 0;
    return { score: average !== null && average <= 100 ? String(Math.round(average * 10) / 100) : '', votes: votes > 0 ? String(votes) : '' };
}
export async function searchKitsu(fetch: JsonFetcher, query: string, options: { includeAdult?: boolean; page?: number; pageSize?: number } = {}): Promise<SearchResult[]> {
    if (!query.trim()) return [];
    const size = Math.min(20, Math.max(1, Math.trunc(options.pageSize ?? 12))), page = Math.max(1, Math.trunc(options.page ?? 1));
    const params = new URLSearchParams({ 'filter[text]': query.trim(), 'page[limit]': String(size), 'page[offset]': String((page - 1) * size) });
    const root = asObject(await fetchKitsu(fetch, `anime?${params}`));
    if (!Array.isArray(root?.data)) throw new Error('Kitsu search unavailable');
    const result = getArray(root, 'data').map(asObject).filter((row): row is RecordValue => row?.type === 'anime' && Boolean(validId(row.id)) && Boolean(kitsuTitle(row))).map(row => {
        const data = attributes(row), titles = getObject(data, 'titles'), title = kitsuTitle(row);
        return { id: validId(row.id), provider: 'kitsu' as const, isAdult: data.nsfw === true || data.ageRating === 'R18', title, subtitle: [getString(titles, 'en'), getString(titles, 'en_jp'), getString(titles, 'ja_jp')].find(value => value && value !== title) || '', image: image(row), year: getString(data, 'startDate').slice(0, 4), released: getString(data, 'startDate'), format: mapAnimeFormat(getString(data, 'subtype')) };
    });
    Object.defineProperty(result, 'hasNext', { value: Boolean(getObject(root, 'links')?.next), enumerable: false, configurable: true });
    return result;
}
/** Keep MAL and Kitsu identities distinct, including notes from older versions. */
export async function resolveKitsuMalId(fetch: JsonFetcher, mal: string, kind: 'anime' | 'manga' = 'anime'): Promise<string | null> {
    if (!validId(mal)) return null;
    const params = new URLSearchParams({ 'filter[externalSite]': `myanimelist/${kind}`, 'filter[externalId]': mal, include: 'item' });
    const root = asObject(await fetchKitsu(fetch, `mappings?${params}`));
    if (!Array.isArray(root?.data)) throw new Error('Kitsu mapping unavailable');
    const matches = getArray(root, 'data').map(asObject).filter(row => row?.type === 'mappings' && attributes(row).externalSite === `myanimelist/${kind}` && validId(attributes(row).externalId) === mal)
        .map(row => getObject(getObject(getObject(row, 'relationships'), 'item'), 'data'))
        .filter(row => row?.type === kind && validId(row.id)).map(row => validId(row!.id));
    const unique = [...new Set(matches)];
    return unique.length === 1 ? unique[0] : null;
}
function part(row: RecordValue): IntegrationAnimePart {
    const data = attributes(row), raw = getString(data, 'subtype').toLowerCase();
    const kind: AnimeFormat = raw === 'movie' || raw === 'ova' || raw === 'ona' ? raw : raw === 'special' || raw === 'music' ? 'special' : 'tv';
    return { id: `kitsu-${validId(row.id)}`, kind, title: kitsuTitle(row), alternativeTitles: selectAlternativeTitles(readAlternativeTitles('kitsu', data), 'all', kitsuTitle(row)), seasonNumber: kind === 'tv' ? 1 : null, episodeCurrent: 0, episodeTotal: positive(data.episodeCount), status: 'planned', poster: image(row) || null, year: positive(getString(data, 'startDate').slice(0, 4)), episodeDuration: positive(data.episodeLength), releaseDate: getString(data, 'startDate') };
}
export async function getKitsuDetails(fetch: JsonFetcher, id: string, options: { includeParts?: boolean } = {}): Promise<AnimeDetails | null> {
    if (!validId(id)) return null;
    const include = ['categories', 'animeProductions.producer', ...(options.includeParts === false ? [] : ['mediaRelationships.destination'])].join(',');
    const root = asObject(await fetchKitsu(fetch, `anime/${id}?${new URLSearchParams({ include })}`)), row = getObject(root, 'data');
    if (row?.type !== 'anime' || validId(row.id) !== id) return null;
    const data = attributes(row), included = getArray(root, 'included').map(asObject).filter((value): value is RecordValue => Boolean(value));
    const references = (relation: string): RecordValue[] => getArray(getObject(getObject(row, 'relationships'), relation), 'data').map(asObject).filter((value): value is RecordValue => Boolean(value));
    const resolve = (refs: RecordValue[]) => included.filter(value => refs.some(ref => ref.type === value.type && ref.id === value.id));
    const genres = resolve(references('categories')).map(value => getString(attributes(value), 'title')).filter(Boolean);
    const studioRefs = resolve(references('animeProductions')).filter(value => attributes(value).role === 'studio').map(value => getObject(getObject(getObject(value, 'relationships'), 'producer'), 'data')).filter((value): value is RecordValue => Boolean(value));
    const studios = resolve(studioRefs).map(value => getString(attributes(value), 'name')).filter(Boolean);
    const parts = new Map([[id, row]]);
    const roles = new Set(['sequel', 'prequel', 'side_story', 'parent_story', 'full_story', 'summary', 'alternative_setting', 'alternative_version', 'spin_off']);
    for (const relation of resolve(references('mediaRelationships'))) {
        if (!roles.has(getString(attributes(relation), 'role'))) continue;
        const destination = getObject(getObject(getObject(relation, 'relationships'), 'destination'), 'data');
        if (destination?.type !== 'anime') continue;
        const related = included.find(value => value.type === 'anime' && value.id === destination.id);
        if (related && validId(related.id) && kitsuTitle(related) && parts.size < 24) parts.set(validId(related.id), related);
    }
    let season = 0;
    const composition = [...parts.values()].sort((a, b) => (getString(attributes(a), 'startDate') || '9999').localeCompare(getString(attributes(b), 'startDate') || '9999')).map(value => { const result = part(value); if (result.kind === 'tv') result.seasonNumber = ++season; return result; });
    const score = rating(row);
    return { kind: 'anime', name: kitsuTitle(row), alternativeTitles: readAlternativeTitles('kitsu', data), description: stripHtml(getString(data, 'synopsis')), image: image(row), imageHorizontal: image(row, 'coverImage'), genres, tags: [], studios, year: getString(data, 'startDate').slice(0, 4), released: getString(data, 'startDate'), imdbRating: score.score, communityRating: score.score, communityVotes: score.votes, url: `https://kitsu.io/anime/${id}`, format: mapAnimeFormat(getString(data, 'subtype')), isAdult: data.nsfw === true || data.ageRating === 'R18', parts: options.includeParts === false ? [] : composition };
}

export async function resolveKitsuSlug(fetch: JsonFetcher, slug: string): Promise<string | null> {
    if (!/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/i.test(slug)) return null;
    const root = asObject(await fetchKitsu(fetch, `anime?${new URLSearchParams({ 'filter[slug]': slug, 'page[limit]': '2' })}`));
    const matches = getArray(root, 'data').map(asObject).filter(row => row?.type === 'anime' && getString(attributes(row), 'slug') === slug && validId(row.id));
    return matches.length === 1 ? validId(matches[0]!.id) : null;
}
export async function getLegacyMalAnimeDetails(fetch: JsonFetcher, mal: string, options: { includeParts?: boolean } = {}): Promise<AnimeDetails | null> {
    const id = await resolveKitsuMalId(fetch, mal);
    if (!id) return null;
    const details = await getKitsuDetails(fetch, id, options);
    // Retain the old root-part key so metadata refresh merges personal progress.
    if (details?.parts) details.parts = details.parts.map(value => value.id === `kitsu-${id}` ? { ...value, id: `jikan-${mal}` } : value);
    return details;
}
export async function getLegacyMalMangaDetails(fetch: JsonFetcher, mal: string): Promise<MangaDetails | null> {
    const id = await resolveKitsuMalId(fetch, mal, 'manga');
    if (!id) return null;
    const root = asObject(await fetchKitsu(fetch, `manga/${id}?include=categories`)), row = getObject(root, 'data');
    if (row?.type !== 'manga' || validId(row.id) !== id) return null;
    const data = attributes(row), score = rating(row);
    return { kind: 'manga', name: kitsuTitle(row), alternativeTitles: readAlternativeTitles('kitsu', data), description: stripHtml(getString(data, 'synopsis')), poster: image(row), authors: [], artists: [], genres: getArray(root, 'included').map(asObject).filter(value => value?.type === 'categories').map(value => getString(attributes(value), 'title')).filter(Boolean), year: getString(data, 'startDate').slice(0, 4), released: getString(data, 'startDate'), chapters: String(positive(data.chapterCount) ?? ''), volumes: String(positive(data.volumeCount) ?? ''), rating: score.score, communityRating: score.score, communityVotes: score.votes, url: `https://kitsu.io/manga/${id}`, isAdult: data.nsfw === true || data.ageRating === 'R18' };
}
