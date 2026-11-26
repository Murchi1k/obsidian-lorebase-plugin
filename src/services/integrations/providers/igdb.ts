import { inferGameWorkType } from '../workTypeInference';
import { normalizeReleaseDate, parseReleaseWindow } from '../../../utils/releaseDates';
import type { GameDlc } from '../../../types';
import type { GameDetails, SearchResult, SourceImage } from '../types';
import { JsonFetcher, asObject, getArray, getString, mapStringList, stripHtml, toStringSafe } from './common';

const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const IGDB_GAMES_URL = 'https://api.igdb.com/v4/games';

interface SearchPageOptions {
    page?: number;
    pageSize?: number;
    includeVersions?: boolean;
}

function withHasNext<T>(items: T[], hasNext: boolean): T[] {
    Object.defineProperty(items, 'hasNext', {
        value: hasNext,
        enumerable: false,
        configurable: true,
    });
    return items;
}

function getNumber(source: Record<string, unknown> | null, key: string): number | null {
    if (!source) return null;
    const value = source[key];
    return typeof value === 'number' ? value : null;
}

function formatVoteCount(value: number | null): string {
    return value === null ? '' : String(Math.max(0, Math.trunc(value)));
}

function getIgdbPageUrl(item: Record<string, unknown>): string {
    const url = getString(item, 'url').trim();
    if (/^https?:\/\/(?:www\.)?igdb\.com\/games\/[^/?#\s]+(?:[/?#]|$)/i.test(url)) return url;
    const slug = getString(item, 'slug').trim();
    return slug ? 'https://www.igdb.com/games/' + encodeURIComponent(slug) : '';
}

function mapIgdbDlc(rawItems: unknown[]): GameDlc[] {
    const seen = new Set<string>();
    const mapped: GameDlc[] = [];

    for (const raw of rawItems) {
        const item = asObject(raw);
        if (!item) continue;
        const id = getString(item, 'id');
        const title = getString(item, 'name');
        if (!id || !title || seen.has(id)) continue;
        seen.add(id);

        const cover = asObject(item.cover);
        mapped.push({
            id,
            provider: 'igdb',
            title,
            imageUrl: getIgdbImageUrl(getString(cover, 'image_id'), 'cover_big_2x') || null,
            url: getIgdbPageUrl(item) || null,
            userRating: null,
        });
    }

    return mapped;
}

function formatDate(timestamp: number | null): string {
    if (!timestamp) return '';
    return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

function getYear(timestamp: number | null): string {
    if (!timestamp) return '';
    return new Date(timestamp * 1000).getUTCFullYear().toString();
}

/** IGDB timestamps also represent release windows; date_format supplies the precision. */
export function getIgdbReleaseDate(item: Record<string,unknown> | null): string {
    const first=getNumber(item,'first_release_date');
    const rows=getArray(item,'release_dates').map(asObject).filter((row):row is Record<string,unknown>=>Boolean(row));
    const release=rows.find(row=>first !== null && getNumber(row,'date')===first)
        ?? rows.sort((a,b)=>(getNumber(a,'date') ?? Infinity)-(getNumber(b,'date') ?? Infinity))[0];
    if(!release) return formatDate(first);
    const timestamp=getNumber(release,'date');
    const date=formatDate(timestamp);
    const year=getNumber(release,'y') ?? (date ? Number(date.slice(0,4)) : null);
    const month=getNumber(release,'m') ?? (date ? Number(date.slice(5,7)) : null);
    const format=getString(asObject(release.date_format),'format').toUpperCase().replace(/[-_\s]/g,'');
    const legacy=getNumber(release,'category');
    if(format==='TBD' || format==='TBA' || legacy===7) return 'unknown';
    if(!year) return '';
    const quarter=/Q([1-4])/.exec(format)?.[1] ?? (legacy !== null && legacy>=3 && legacy<=6 ? String(legacy-2) : '');
    if(quarter) return normalizeReleaseDate(`${year}-Q${quarter}`);
    if(format==='YYYY' || legacy===2) return normalizeReleaseDate(String(year));
    if(format==='YYYYMMMM' || format==='YYYYMM' || legacy===1) return normalizeReleaseDate(`${year}-${month}`);
    const day=getNumber(release,'d');
    if(!format && legacy===null && timestamp===null) return normalizeReleaseDate(day && month ? `${year}-${month}-${day}` : month ? `${year}-${month}` : String(year));
    return normalizeReleaseDate(day && month ? `${year}-${month}-${day}` : date)
        || parseReleaseWindow(first ? formatDate(first) : String(year))?.value || '';
}

function getIgdbImageUrl(imageId: string, size: 'cover_big_2x' | 'screenshot_huge' | 'screenshot_med'): string {
    return imageId ? `https://images.igdb.com/igdb/image/upload/t_${size}/${imageId}.jpg` : '';
}

function escapeIgdbString(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function getAccessToken(fetchJson: JsonFetcher, clientId: string, clientSecret: string): Promise<string> {
    const params = new URLSearchParams();
    params.set('client_id', clientId);
    params.set('client_secret', clientSecret);
    params.set('grant_type', 'client_credentials');

    const token = asObject(await fetchJson(
        TWITCH_TOKEN_URL,
        { 'Content-Type': 'application/x-www-form-urlencoded' },
        'POST',
        params.toString()
    ));

    return getString(token, 'access_token');
}

async function fetchIgdbGames(
    fetchJson: JsonFetcher,
    clientId: string,
    clientSecret: string,
    body: string
): Promise<unknown[]> {
    const token = await getAccessToken(fetchJson, clientId, clientSecret);
    if (!token) return [];

    const result: unknown = await fetchJson(
        IGDB_GAMES_URL,
        {
            'Accept': 'application/json',
            'Authorization': `Bearer ${token}`,
            'Client-ID': clientId,
            'Content-Type': 'text/plain',
        },
        'POST',
        body
    );

    return Array.isArray(result) ? (result as unknown[]) : [];
}

export async function searchIgdb(
    fetchJson: JsonFetcher,
    query: string,
    clientId: string,
    clientSecret: string,
    options: SearchPageOptions = {}
): Promise<SearchResult[]> {
    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.max(1, options.pageSize ?? 10);
    const body = [
        'fields name,first_release_date,cover.image_id,genres.name,release_dates.date,release_dates.y,release_dates.m,release_dates.d,release_dates.date_format.format;',
        `search "${escapeIgdbString(query)}";`,
        ...(options.includeVersions ? [] : ['where version_parent = null;']),
        `limit ${pageSize + 1};`,
        `offset ${(page - 1) * pageSize};`,
    ].join('\n');

    const results = await fetchIgdbGames(fetchJson, clientId, clientSecret, body);
    const hasNext = results.length > pageSize;

    const mapped = results.slice(0, pageSize).map((item) => {
        const record = asObject(item);
        const released = getNumber(record, 'first_release_date');
        const cover = asObject(record?.cover);
        const date = getIgdbReleaseDate(record);
        const year = /^\d{4}/.test(date) ? date.slice(0,4) : getYear(released);

        return {
            id: getString(record, 'id'),
            title: getString(record, 'name') || 'Unknown',
            subtitle: year,
            year,
            released: date,
            image: getIgdbImageUrl(getString(cover, 'image_id'), 'cover_big_2x'),
            provider: 'igdb' as const,
            workType: inferGameWorkType(record),
            workTypeMedia: 'game' as const,
        };
    });

    return withHasNext(mapped, hasNext);
}

export async function getIgdbDetails(
    fetchJson: JsonFetcher,
    id: string,
    clientId: string,
    clientSecret: string
): Promise<GameDetails | null> {
    const numericId = Number(id);
    if (!Number.isFinite(numericId) || numericId <= 0) return null;

    const body = [
        'fields name,summary,storyline,first_release_date,total_rating,total_rating_count,aggregated_rating,aggregated_rating_count,rating,rating_count,',
        'cover.image_id,screenshots.image_id,genres.name,platforms.name,release_dates.date,release_dates.y,release_dates.m,release_dates.d,release_dates.date_format.format,',
        'involved_companies.developer,involved_companies.publisher,involved_companies.company.name,url,slug;',
        `where id = ${numericId};`,
        'limit 1;',
    ].join('\n');

    const [rawItem] = await fetchIgdbGames(fetchJson, clientId, clientSecret, body);
    const item = asObject(rawItem);
    if (!item) return null;

    const released = getNumber(item, 'first_release_date');
    const involvedCompanies = getArray(item, 'involved_companies');
    const developers = mapStringList(
        involvedCompanies.filter((entry) => Boolean(asObject(entry)?.developer)),
        (entry) => getString(asObject(asObject(entry)?.company), 'name')
    );
    const publishers = mapStringList(
        involvedCompanies.filter((entry) => Boolean(asObject(entry)?.publisher)),
        (entry) => getString(asObject(asObject(entry)?.company), 'name')
    );
    const cover = asObject(item.cover);
    const screenshots = getArray(item, 'screenshots');
    const firstScreenshot = asObject(screenshots[0]);

    return {
        kind: 'game',
        name: getString(item, 'name') || 'Unknown',
        description: stripHtml(getString(item, 'summary') || getString(item, 'storyline')),
        poster: getIgdbImageUrl(getString(cover, 'image_id'), 'cover_big_2x'),
        posterHorizontal: getIgdbImageUrl(getString(firstScreenshot, 'image_id'), 'screenshot_huge'),
        genres: mapStringList(getArray(item, 'genres'), (entry) => getString(asObject(entry), 'name')),
        workType: inferGameWorkType(item),
        platforms: mapStringList(getArray(item, 'platforms'), (entry) => getString(asObject(entry), 'name')),
        developers,
        publishers,
        rating: toStringSafe(item.total_rating || item.rating),
        metacritic: toStringSafe(item.aggregated_rating),
        released: getIgdbReleaseDate(item),
        year: /^\d{4}/.test(getIgdbReleaseDate(item)) ? getIgdbReleaseDate(item).slice(0,4) : getYear(released),
        url: getIgdbPageUrl(item),
        communityRating: toStringSafe(item.total_rating || item.rating),
        communityVotes: formatVoteCount(
            getNumber(item, 'total_rating_count')
            ?? getNumber(item, 'rating_count')
            ?? getNumber(item, 'aggregated_rating_count')
        ),
    };
}

export async function resolveIgdbSlug(fetchJson: JsonFetcher, slug: string, clientId: string, clientSecret: string): Promise<string | null> {
    if (!/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/i.test(slug)) return null;
    const records = await fetchIgdbGames(fetchJson, clientId, clientSecret, `fields id,slug; where slug = "${slug}"; limit 2;`);
    const matches = records.map(asObject).filter(item => getString(item, 'slug') === slug && /^[1-9]\d*$/.test(getString(item, 'id')));
    return matches.length === 1 ? getString(matches[0], 'id') : null;
}

export async function getIgdbDlcForGame(
    fetchJson: JsonFetcher,
    id: string,
    clientId: string,
    clientSecret: string
): Promise<GameDlc[]> {
    const numericId = Number(id);
    if (!Number.isFinite(numericId) || numericId <= 0) return [];

    const body = [
        'fields dlcs.id,dlcs.name,dlcs.cover.image_id,dlcs.url,dlcs.slug,',
        'expansions.id,expansions.name,expansions.cover.image_id,expansions.url,expansions.slug;',
        `where id = ${numericId};`,
        'limit 1;',
    ].join('\n');

    const [rawItem] = await fetchIgdbGames(fetchJson, clientId, clientSecret, body);
    const item = asObject(rawItem);
    if (!item) return [];

    return mapIgdbDlc([
        ...getArray(item, 'dlcs'),
        ...getArray(item, 'expansions'),
    ]);
}

export async function getIgdbGallery(fetchJson: JsonFetcher, id: string, apiKey: string, secret: string): Promise<SourceImage[]> {
    if (!/^[1-9]\d*$/.test(id)) return [];
    const [raw] = await fetchIgdbGames(fetchJson, apiKey, secret,
        `fields screenshots.image_id; where id = ${id}; limit 1;`);
    return getArray(asObject(raw), 'screenshots').map(shot => {
        const imageId = getString(asObject(shot), 'image_id');
        return {
            url: getIgdbImageUrl(imageId, 'screenshot_huge'),
            thumbnail: getIgdbImageUrl(imageId, 'screenshot_med'),
        };
    });
}

export async function getIgdbTrailerEntries(fetchJson: JsonFetcher, id: string, apiKey: string, secret: string): Promise<unknown[]> {
    if (!/^[1-9]\d*$/.test(id)) return [];
    const [raw] = await fetchIgdbGames(fetchJson, apiKey, secret,
        `fields videos.name,videos.video_id; where id = ${id}; limit 1;`);
    return getArray(asObject(raw), 'videos');
}
