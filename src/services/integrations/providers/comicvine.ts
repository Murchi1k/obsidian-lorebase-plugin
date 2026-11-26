import { normalizeMangaWorkType } from '../../../utils/mangaWorkType';
import type { MangaDetails, SearchResult } from '../types';
import { asObject, getArray, getObject, getString, stripHtml, type JsonFetcher } from './common';

const ORIGIN = 'https://comicvine.gamespot.com';
const HEADERS = { Accept: 'application/json', 'User-Agent': 'Lorebase (Obsidian plugin)' };
const VOLUME_FIELDS = 'id,name,start_year,image,description,deck,count_of_issues,site_detail_url';
const ISSUE_FIELDS = 'id,name,issue_number,volume,cover_date,store_date,image,description,deck,person_credits,site_detail_url';

export function normalizeComicVineId(value: string): string | null {
    return /^(?:(?:4000|4050)-)?[1-9]\d{0,19}$/.test(value) ? value.replace(/^4050-/, '') : null;
}

export function comicVineIdFromPath(path: string): string | null {
    const id = path.match(/\/(40(?:00|50)-[1-9]\d{0,19})(?:\/|$)/)?.[1];
    return id ? normalizeComicVineId(id) : null;
}

export function comicVineSourceUrl(value: string): string | null {
    const id = normalizeComicVineId(value);
    if (!id) return null;
    const resource = id.startsWith('4000-') ? `issue/${id}` : `volume/4050-${id}`;
    return `${ORIGIN}/${resource}/`;
}

async function request(fetchJson: JsonFetcher, path: string, apiKey: string, params: Record<string, string>) {
    const url = new URL(`/api/${path}/`, ORIGIN);
    url.search = new URLSearchParams({ ...params, api_key: apiKey.trim(), format: 'json' }).toString();
    const response = asObject(await fetchJson(url.toString(), HEADERS));
    const status = getString(response, 'status_code');
    if (status === '101') return null;
    if (status === '100') throw new Error('Comic Vine rejected the API key.');
    if (status !== '1') throw new Error('Comic Vine returned an unexpected response.');
    return response;
}

function httpsImage(image: Record<string, unknown> | null, ...keys: string[]): string {
    return keys.map(key => getString(image, key)).find(value => /^https?:\/\//i.test(value))?.replace(/^http:/i, 'https:') ?? '';
}

export async function searchComicVine(fetchJson: JsonFetcher, query: string, apiKey: string,
    options: { page?: number; pageSize?: number } = {}): Promise<SearchResult[]> {
    if (!query.trim()) return [];
    const page = Math.max(1, Math.trunc(options.page || 1));
    const limit = Math.max(1, Math.min(100, Math.trunc(options.pageSize || 10)));
    const root = await request(fetchJson, 'search', apiKey, {
        resources: 'volume', query: query.trim(), page: String(page), limit: String(limit),
        field_list: 'id,name,start_year,image',
    });
    const rows = getArray(root, 'results');
    const workType = normalizeMangaWorkType('Comics');
    const results: SearchResult[] = [];
    for (const raw of rows) {
        const row = asObject(raw);
        const id = normalizeComicVineId(getString(row, 'id'));
        const title = getString(row, 'name').trim();
        if (!id || !title) continue;
        results.push({ id, title, provider: 'comicvine', workType, workTypeMedia: 'manga',
            year: getString(row, 'start_year'), image: httpsImage(getObject(row, 'image'), 'medium_url', 'small_url', 'original_url') });
    }
    const total = getString(root, 'number_of_total_results');
    const hasNext = total ? page * limit < Number(total) : rows.length === limit;
    return Object.assign(results, { hasNext });
}

export async function getComicVineDetails(fetchJson: JsonFetcher, rawId: string, apiKey: string): Promise<MangaDetails | null> {
    const id = normalizeComicVineId(rawId);
    if (!id) return null;
    const issue = id.startsWith('4000-');
    const resource = issue ? `issue/${id}` : `volume/4050-${id}`;
    const root = await request(fetchJson, resource, apiKey, { field_list: issue ? ISSUE_FIELDS : VOLUME_FIELDS });
    const row = getObject(root, 'results');
    const returnedId = getString(row, 'id');
    if (returnedId !== (issue ? id.slice('4000-'.length) : id)) return null;
    const title = getString(row, 'name').trim();
    const volume = getString(getObject(row, 'volume'), 'name').trim();
    const issueNumber = getString(row, 'issue_number').trim();
    const issueTitle = [volume, issueNumber ? `#${issueNumber}` : ''].filter(Boolean).join(' ');
    const name = issue ? [issueTitle, title === volume ? '' : title].filter(Boolean).join(' — ') : title;
    if (!name) return null;
    const released = issue ? getString(row, 'cover_date') || getString(row, 'store_date') : '';
    const credits = getArray(row, 'person_credits').map(asObject);
    const people = (role: RegExp): string[] => [...new Set(credits.filter(person => role.test(getString(person, 'role')))
        .map(person => getString(person, 'name').trim()).filter(Boolean))];
    const count = getString(row, 'count_of_issues');
    const sourceUrl = getString(row, 'site_detail_url');
    const description = getString(row, 'description') || getString(row, 'deck');
    return {
        kind: 'manga', workType: normalizeMangaWorkType('Comics'), name,
        description: stripHtml(description.replace(/<\/(?:p|div|li|h[1-6])>|<br\s*\/?>/gi, ' ')),
        poster: httpsImage(getObject(row, 'image'), 'original_url', 'super_url', 'medium_url'),
        authors: people(/\bwriter\b/i), artists: people(/\b(?:artist|penciler|inker|colorist)\b/i), genres: [],
        year: released.slice(0, 4) || getString(row, 'start_year'), released,
        chapters: issue ? '1' : /^[1-9]\d*$/.test(count) ? count : '',
        url: /^https?:\/\/comicvine\.gamespot\.com\//i.test(sourceUrl)
            ? sourceUrl.replace(/^http:/i, 'https:') : comicVineSourceUrl(id)!,
    };
}
