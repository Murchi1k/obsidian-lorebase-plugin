import { normalizePartCatalog } from '../media/partCatalog';
import { episodeFields } from '../media/episodeTracking';
import type {
    IntegrationAnimePart,
    IntegrationMangaPart,
    IntegrationVideoPart,
    MediaKind,
    MediaSourceSelection,
    ProviderId,
} from './types';

export interface EnrichmentMergeResult {
    values: Record<string, unknown>;
    patch: Record<string, unknown>;
    filledFields: string[];
    skippedFields: string[];
}

export interface EnrichmentMergeOptions {
    /** Replace non-empty provider-owned fields instead of only filling gaps. */
    overwriteProviderFields?: boolean;
    previousSourceSnapshot?: ProviderSourceSnapshot | null;
    forceProviderFields?: boolean;
}

export interface ProviderSourceSnapshot {
    version: 1;
    provider: ProviderId;
    id: string;
    hashes: Record<string, string>;
    lists: Record<string, unknown[]>;
}

export const SOURCE_SNAPSHOT_FIELD = 'lorebase_source_snapshot';

const FIELD_ALIASES: Record<string, string[]> = {
    name: ['name', 'Name', 'title', 'Title'],
    poster: ['poster', 'image', 'cover', 'thumbnail'],
    poster_b: ['poster_b', 'image_b', 'horizontal_poster', 'backdrop', 'banner'],
    plot: ['plot', 'summary', 'description'],
    genres: ['genres', 'genre', 'Genre'],
    tags: ['tags', 'tag', 'Tags'],
    platforms: ['platforms', 'platform', 'Platform'],
    studios: ['studios', 'studio'],
    networks: ['networks', 'network'],
    countries: ['countries', 'production_countries', 'origin_country', 'country'],
    year: ['year', 'Year'],
    released: ['released', 'releaseDate', 'release_date', 'date'],
    url: ['url', 'source_url', 'source', 'link'],
    developers: ['developers', 'developer'],
    publishers: ['publishers', 'publisher'],
    publisher: ['publisher', 'publishers'],
    authors: ['authors', 'author'],
    artists: ['artists', 'artist'],
    work_type: ['work_type', 'workType', 'manga_type'],
    country_of_origin: ['country_of_origin', 'countryOfOrigin'],
    Sex18: ['Sex18', 'isAdult'],
    director: ['director', 'directors'],
    actors: ['actors', 'cast'],
    episode_total: ['episode_total', 'episodeTotal'],
    season_total: ['season_total', 'seasonTotal'],
    page_total: ['page_total', 'pageTotal', 'pages', 'pageCount', 'number_of_pages'],
    chapter_total: ['chapter_total', 'chapterTotal', 'chapters'],
    volume_total: ['volume_total', 'volumeTotal', 'volumes'],
    communityRating: ['communityRating', 'community_rating'],
    communityVotes: ['communityVotes', 'community_votes'],
    communityRatingProvider: ['communityRatingProvider', 'community_rating_provider'],
};

const ZERO_IS_EMPTY = new Set([
    'season_total',
    'episode_total',
    'seasons',
    'page_total',
    'chapter_total',
    'volume_total',
    'runtime',
]);

const IDENTITY_FIELDS = new Set(['integration_provider', 'integration_id', 'integration_source_kind']);

export function normalizeCommunityRating(provider: ProviderId, value: unknown): number | null {
    const raw = toFiniteNumber(value);
    if (raw === null) return null;
    let percent = raw;
    if (provider === 'rawg' || provider === 'googlebooks' || provider === 'hardcover' || provider === 'openlibrary') {
        percent = raw <= 5 ? raw * 20 : raw;
    } else if (provider !== 'steam' && provider !== 'igdb') {
        percent = raw <= 10 ? raw * 10 : raw;
    }
    return Math.max(0, Math.min(100, Math.round(percent * 10) / 10));
}

export function mergeProviderMetadata(
    current: Record<string, unknown>,
    incoming: Record<string, unknown>,
    blacklist: Iterable<string> = [],
    options: EnrichmentMergeOptions = {}
): EnrichmentMergeResult {
    const denied = new Set(Array.from(blacklist, (value) => value.trim()).filter(Boolean));
    const values = { ...current };
    const patch: Record<string, unknown> = {};
    const filledFields: string[] = [];
    const skippedFields: string[] = [];

    for (const [key, originalValue] of Object.entries(incoming)) {
        let value = originalValue;
        if (key === 'discovery_context' || key === 'part_catalog' || key === 'status_reasons' || key === 'extra_chapters') continue;
        if (!IDENTITY_FIELDS.has(key) && denied.has(key)) {
            skippedFields.push(key);
            continue;
        }
        if (isEmptyIncoming(value) || isMissingCredit(key, value)) continue;

        if (IDENTITY_FIELDS.has(key)) {
            values[key] = value;
            patch[key] = value;
            filledFields.push(key);
            continue;
        }

        const existingKey = findExistingAlias(current, key);
        const existing = existingKey ? current[existingKey] : undefined;
        if (isPartField(key) && Array.isArray(value)) {
            let providerParts: unknown[] = value;
            const catalog = normalizePartCatalog(current.part_catalog);
            const source = catalog?.source.split(':');
            const sameSource = source && (!incoming.integration_provider || incoming.integration_provider === source[0]) && (!incoming.integration_id || String(incoming.integration_id) === source[1]) && (!incoming.integration_source_kind || incoming.integration_source_kind === source[2]);
            if (sameSource && (key === 'anime_parts' || key === 'series_parts')) {
                const saved = Array.isArray(existing) ? existing.filter(row => row && typeof row === 'object') as Record<string, unknown>[] : [];
                providerParts = providerParts.filter(row => {
                    const part = row && typeof row === 'object' ? row as Record<string, unknown> : {};
                    const included = saved.some(local => local.id === part.id || key === 'series_parts' && (local.season ?? local.seasonNumber) != null && (local.season ?? local.seasonNumber) === (part.season ?? part.seasonNumber));
                    return included || current.status !== 'completed' && !Object.prototype.hasOwnProperty.call(catalog!.parts, String(part.id));
                });
                if (current.status === 'completed') providerParts = providerParts.map(row => {
                    if (!row || typeof row !== 'object') return row;
                    const part = row as Record<string, unknown>;
                    const local = saved.find(local => local.id === part.id || key === 'series_parts' && (local.season ?? local.seasonNumber) != null && (local.season ?? local.seasonNumber) === (part.season ?? part.seasonNumber));
                    const previousTotal = Number(local?.episode_total ?? local?.episodeTotal);
                    const nextTotal = Number(part.episode_total ?? part.episodeTotal);
                    if (!(previousTotal > 0 && nextTotal > previousTotal)) return row;
                    return { ...part, ...('episode_total' in part ? { episode_total: previousTotal } : {}), ...('episodeTotal' in part ? { episodeTotal: previousTotal } : {}) };
                });

            }

            const merged = mergeStructuredList(
                existing,
                providerParts,
                key,
                options.overwriteProviderFields === true,
                options.previousSourceSnapshot?.lists[key],
                options.forceProviderFields === true
            );
            if (merged.changed) {
                const outputKey = existingKey ?? key;
                values[outputKey] = merged.value;
                patch[outputKey] = merged.value;
                filledFields.push(outputKey);
            } else {
                skippedFields.push(existingKey ?? key);
            }
            continue;
        }

        if (options.overwriteProviderFields) {
            const outputKey = existingKey ?? key;
            let synchronizedValue = value;
            if (Array.isArray(value)) {
                synchronizedValue = mergeProviderList(
                    existing,
                    value,
                    options.previousSourceSnapshot?.lists[key],
                    options.forceProviderFields === true
                );
            } else if (options.previousSourceSnapshot && !options.forceProviderFields) {
                const previousHash = options.previousSourceSnapshot.hashes[key];
                if (previousHash) {
                    if (valueHash(existing) !== previousHash) {
                        skippedFields.push(outputKey);
                        continue;
                    }
                } else if (!isEmptyExisting(existing, key)) {
                    skippedFields.push(outputKey);
                    continue;
                }
            }
            if (valuesEqual(existing, synchronizedValue)) {
                skippedFields.push(outputKey);
                continue;
            }
            values[outputKey] = synchronizedValue;
            patch[outputKey] = synchronizedValue;
            filledFields.push(outputKey);
            continue;
        }

        if (!isEmptyExisting(existing, key)) {
            skippedFields.push(existingKey ?? key);
            continue;
        }

        const outputKey = existingKey ?? key;
        values[outputKey] = value;
        patch[outputKey] = value;
        filledFields.push(outputKey);
    }

    return { values, patch, filledFields, skippedFields };
}

export function synchronizeProviderMetadata(
    current: Record<string, unknown>,
    incoming: Record<string, unknown>,
    source: Pick<MediaSourceSelection, 'provider' | 'id'>,
    options: { forceProviderFields?: boolean } = {}
): EnrichmentMergeResult {
    const previousSourceSnapshot = readSourceSnapshot(current[SOURCE_SNAPSHOT_FIELD]);
    const result = mergeProviderMetadata(current, incoming, [], {
        overwriteProviderFields: true,
        previousSourceSnapshot,
        forceProviderFields: options.forceProviderFields === true,
    });
    const nextSnapshot = createSourceSnapshot(incoming, source);
    result.values[SOURCE_SNAPSHOT_FIELD] = nextSnapshot;
    if (!valuesEqual(current[SOURCE_SNAPSHOT_FIELD], nextSnapshot)) {
        result.patch[SOURCE_SNAPSHOT_FIELD] = nextSnapshot;
    }
    return result;
}

export function toVideoPartsFrontmatter(parts: IntegrationVideoPart[] | undefined): Record<string, unknown>[] {
    return (parts ?? []).map((part) => ({
        id: part.id,
        kind: part.kind,
        title: part.title,
        ...(part.alternativeTitles?.length ? { alt_titles: part.alternativeTitles } : {}),
        season: part.seasonNumber,
        episode_current: part.episodeCurrent,
        episode_total: part.episodeTotal,
        status: part.status,
        poster: part.poster ?? null,
        year: part.year ?? null,
        episode_duration: part.episodeDuration ?? null,
        ...(part.releaseDate ? { released: part.releaseDate } : {}),
        ...(part.userRating != null ? { user_rating: part.userRating } : {}),
        ...episodeFields(part),
    }));
}

export function toAnimePartsFrontmatter(parts: IntegrationAnimePart[] | undefined): Record<string, unknown>[] {
    return (parts ?? []).map((part) => ({
        id: part.id,
        kind: part.kind,
        title: part.title,
        ...(part.alternativeTitles?.length ? { alt_titles: part.alternativeTitles } : {}),
        season: part.seasonNumber,
        episode_current: part.episodeCurrent,
        episode_total: part.episodeTotal,
        status: part.status,
        ...(part.userRating != null ? { user_rating: part.userRating } : {}),
        poster: part.poster ?? null,
        year: part.year ?? null,
        episode_duration: part.episodeDuration ?? null,
        ...episodeFields(part),
    }));
}

export function toMangaPartsFrontmatter(parts: IntegrationMangaPart[] | undefined): Record<string, unknown>[] {
    return (parts ?? []).map((part) => ({
        id: part.id,
        kind: part.kind,
        title: part.title,
        ...(part.alternativeTitles?.length ? { alt_titles: part.alternativeTitles } : {}),
        volume: part.volumeNumber,
        chapter_current: part.chapterCurrent,
        chapter_total: part.chapterTotal,
        status: part.status,
    }));
}

export function sourceIdentity(source: MediaSourceSelection): Record<string, unknown> {
    return {
        integration_provider: source.provider,
        integration_id: source.id,
    };
}

export function mediaTypeToKind(type: string): MediaKind | null {
    if (type === 'game') return 'games';
    if (type === 'anime') return 'anime';
    if (type === 'movie') return 'movies';
    if (type === 'series') return 'series';
    if (type === 'book') return 'books';
    if (type === 'manga') return 'manga';
    return null;
}

function findExistingAlias(current: Record<string, unknown>, key: string): string | null {
    const aliases = FIELD_ALIASES[key] ?? [key];
    const entries = Object.keys(current);
    for (const alias of aliases) {
        const exact = entries.find((candidate) => candidate === alias);
        if (exact) return exact;
    }
    const lowerAliases = new Set(aliases.map((alias) => alias.toLowerCase()));
    return entries.find((candidate) => lowerAliases.has(candidate.toLowerCase())) ?? null;
}

function isEmptyIncoming(value: unknown): boolean {
    return value === undefined
        || value === null
        || (typeof value === 'string' && !value.trim())
        || (Array.isArray(value) && value.length === 0);
}

function isEmptyExisting(value: unknown, key: string): boolean {
    if (isEmptyIncoming(value) || isMissingCredit(key, value)) return true;
    return ZERO_IS_EMPTY.has(key) && typeof value === 'number' && value === 0;
}

function isMissingCredit(key: string, value: unknown): boolean {
    if (!['director', 'directors', 'publisher', 'publishers', 'countries'].includes(key)) return false;
    if (Array.isArray(value)) return value.length > 0 && value.every(entry => isMissingCredit(key, entry));
    return typeof value === 'string' && /^(?:n\/?a|—|-)$/i.test(value.trim());
}

function isPartField(key: string): boolean {
    return key === 'anime_parts' || key === 'series_parts' || key === 'movie_parts' || key === 'manga_parts' || key === 'dlc';
}

function mergeStructuredList(
    existing: unknown,
    incoming: unknown[],
    field: string,
    overwriteProviderFields: boolean,
    previousProviderList: unknown[] | undefined,
    forceProviderFields: boolean
): { value: unknown[]; changed: boolean } {
    if (!Array.isArray(existing) || existing.length === 0) {
        return { value: incoming, changed: incoming.length > 0 };
    }
    const result = existing.map((entry) => cloneRecord(entry));
    let changed = false;

    for (const candidate of incoming) {
        const candidateRecord = asRecord(candidate);
        if (!candidateRecord) continue;
        const index = findStructuredIndex(result, candidateRecord, field);
        if (index < 0) {
            result.push(candidateRecord);
            changed = true;
            continue;
        }
        const current = asRecord(result[index]) ?? {};
        const previousIndex = previousProviderList
            ? findStructuredIndex(previousProviderList, candidateRecord, field)
            : -1;
        const previous = previousIndex >= 0
            ? asRecord(previousProviderList?.[previousIndex])
            : null;
        const next = { ...current };
        for (const [childKey, childValue] of Object.entries(candidateRecord)) {
            if (isPersonalStructuredField(childKey)) continue;
            if (isEmptyIncoming(childValue)) continue;
            // Keep stable local identifiers so active_part_id and personal progress
            // continue to point at the same entry after a provider refresh.
            if (childKey === 'id' && !isEmptyExisting(current[childKey], childKey)) continue;
            if (!overwriteProviderFields && !isEmptyExisting(current[childKey], childKey)) continue;
            if (
                overwriteProviderFields
                && previous
                && !forceProviderFields
                && Object.prototype.hasOwnProperty.call(previous, childKey)
                && valueHash(current[childKey]) !== valueHash(previous[childKey])
            ) continue;
            if (valuesEqual(current[childKey], childValue)) continue;
            next[childKey] = childValue;
            changed = true;
        }
        result[index] = next;
    }

    return { value: result, changed };
}

function mergeProviderList(
    existing: unknown,
    incoming: unknown[],
    previous: unknown[] | undefined,
    forceProviderFields: boolean
): unknown[] {
    if (forceProviderFields || !Array.isArray(existing)) return incoming;

    const current = existing;
    if (!previous) return unionLists(incoming, current);

    const currentKeys = new Set(current.map(listValueKey));
    const previousKeys = new Set(previous.map(listValueKey));
    const removedByUser = new Set(
        previous
            .map(listValueKey)
            .filter((key) => !currentKeys.has(key))
    );
    const userAdded = current.filter((value) => !previousKeys.has(listValueKey(value)));
    return unionLists(
        incoming.filter((value) => !removedByUser.has(listValueKey(value))),
        userAdded
    );
}

function unionLists(primary: unknown[], additions: unknown[]): unknown[] {
    const result = [...primary];
    const seen = new Set(result.map(listValueKey));
    for (const value of additions) {
        const key = listValueKey(value);
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(value);
    }
    return result;
}

function listValueKey(value: unknown): string {
    if (typeof value === 'string') return `s:${value.trim().toLocaleLowerCase()}`;
    return `j:${stableStringify(value)}`;
}

function findStructuredIndex(existing: unknown[], candidate: Record<string, unknown>, field: string): number {
    const id = String(candidate.id ?? '').trim();
    if (id) {
        const byId = existing.findIndex((entry) => String(asRecord(entry)?.id ?? '').trim() === id);
        if (byId >= 0) return byId;
    }
    const numberedKey = structuredNumberKey(candidate, field);
    if (numberedKey) {
        const byNumber = existing.findIndex((entry) => structuredNumberKey(asRecord(entry) ?? {}, field) === numberedKey);
        if (byNumber >= 0) return byNumber;
    }
    const fallback = structuredFallbackKey(candidate, field);
    return existing.findIndex((entry) => structuredFallbackKey(asRecord(entry) ?? {}, field) === fallback);
}

function structuredNumberKey(value: Record<string, unknown>, field: string): string | null {
    const kind = String(value.kind ?? field).trim().toLowerCase();
    const number = value.season ?? value.seasonNumber ?? value.volume ?? value.volumeNumber;
    if (number === null || number === undefined || String(number).trim() === '') return null;
    return `${kind}:${String(number).trim()}`;
}

function structuredFallbackKey(value: Record<string, unknown>, field: string): string {
    const kind = String(value.kind ?? field).trim().toLowerCase();
    const number = value.season ?? value.seasonNumber ?? value.volume ?? value.volumeNumber ?? '';
    const title = String(value.title ?? value.name ?? '').trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    return `${kind}:${String(number)}:${title}`;
}

function isPersonalStructuredField(key: string): boolean {
    return key === 'status'
        || key === 'extra_chapters' || key === 'extraChapters'
        || ['episode_ratings', 'episodeRatings', 'watched_episodes', 'watchedEpisodes', 'episode_tracking', 'episodeTracking', 'episodes', 'episodeDetails'].includes(key)
        || key.endsWith('_current')
        || key === 'episodeCurrent'
        || key === 'chapterCurrent'
        || key === 'userRating'
        || key === 'user_rating'
        || key === 'owned';
}

function cloneRecord(value: unknown): unknown {
    const record = asRecord(value);
    return record ? { ...record } : value;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function toFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (value === null || value === undefined) return null;
    const parsed = Number.parseFloat(String(value).replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : null;
}

function valuesEqual(left: unknown, right: unknown): boolean {
    if (Object.is(left, right)) return true;
    if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null) return false;
    try {
        return JSON.stringify(left) === JSON.stringify(right);
    } catch {
        return false;
    }
}

function valueHash(value: unknown): string {
    const text = stableStringify(value);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index++) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

function stableStringify(value: unknown): string {
    if (!value || typeof value !== 'object') return JSON.stringify(value) ?? String(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

function createSourceSnapshot(
    incoming: Record<string, unknown>,
    source: Pick<MediaSourceSelection, 'provider' | 'id'>
): ProviderSourceSnapshot {
    const hashes: Record<string, string> = {};
    const lists: Record<string, unknown[]> = {};
    for (const [key, value] of Object.entries(incoming)) {
        if (IDENTITY_FIELDS.has(key) || isEmptyIncoming(value)) continue;
        if (Array.isArray(value)) lists[key] = value;
        else hashes[key] = valueHash(value);
    }
    return {
        version: 1,
        provider: source.provider,
        id: String(source.id),
        hashes,
        lists,
    };
}

function readSourceSnapshot(
    value: unknown
): ProviderSourceSnapshot | null {
    const record = asRecord(value);
    if (!record || record.version !== 1) return null;
    if (typeof record.provider !== 'string' || !record.provider || !String(record.id ?? '')) return null;
    const hashes = asRecord(record.hashes);
    const lists = asRecord(record.lists);
    if (!hashes || !lists) return null;
    const normalizedHashes: Record<string, string> = {};
    for (const [key, entry] of Object.entries(hashes)) {
        if (typeof entry === 'string') normalizedHashes[key] = entry;
    }
    const normalizedLists: Record<string, unknown[]> = {};
    for (const [key, entry] of Object.entries(lists)) {
        if (Array.isArray(entry)) normalizedLists[key] = entry;
    }
    return {
        version: 1,
        provider: record.provider as ProviderId,
        id: String(record.id),
        hashes: normalizedHashes,
        lists: normalizedLists,
    };
}
