import type { JsonFetcher } from './common';
import { normalizeTmdbLanguage } from './tmdb';

export interface RecommendedWork { id: string; title: string; image: string; year: string; url: string; }
export interface Recommendations { source: 'TMDB' | 'AniList' | 'Shikimori'; items: RecommendedWork[]; }
type Data = Record<string, unknown>;
const object = (value: unknown): Data => value && typeof value === 'object' && !Array.isArray(value) ? value as Data : {};
const rows = (value: unknown): Data[] => Array.isArray(value) ? value.map(object) : [];
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
export const recommendationId = (value: unknown): string => /^[1-9]\d*$/.test(String(value ?? '')) ? String(value) : '';
const year = (value: unknown): string => /^\d{4}/.exec(String(value ?? ''))?.[0] ?? '';
function image(value: unknown, host: RegExp, base?: string): string {
    if (!text(value)) return '';
    try { const url = new URL(text(value), base); return url.protocol === 'https:' && !url.username && !url.password && host.test(url.hostname) ? url.href : ''; } catch { return ''; }
}
function unique(items: RecommendedWork[], self: string): RecommendedWork[] {
    const seen = new Set([self]);
    return items.filter(item => { if (!item.id || !item.title || seen.has(item.id)) return false; seen.add(item.id); return true; }).slice(0, 7);
}
function tmdbUrl(path: string, key: string, language: string, extra: Record<string, string> = {}): string {
    return `https://api.themoviedb.org/3${path}?${new URLSearchParams({ api_key: key, language: normalizeTmdbLanguage(language), ...extra })}`;
}
export async function findRecommendationTmdbId(fetch: JsonFetcher, media: 'movie' | 'series', externalId: string, source: 'imdb_id' | 'tvdb_id', key: string, language: string): Promise<string> {
    if (!(source === 'imdb_id' ? /^tt\d+$/.test(externalId) : recommendationId(externalId))) return '';
    const payload = object(await fetch(tmdbUrl(`/find/${externalId}`, key, language, { external_source: source })));
    const matches = rows(payload[media === 'movie' ? 'movie_results' : 'tv_results']).filter(item => recommendationId(item.id));
    return matches.length === 1 ? recommendationId(matches[0].id) : '';
}
export async function tmdbRecommendations(fetch: JsonFetcher, media: 'movie' | 'series', id: string, key: string, language: string): Promise<Recommendations> {
    const path = `/${media === 'movie' ? 'movie' : 'tv'}/${id}`;
    const read = async (endpoint: string): Promise<RecommendedWork[]> => {
        const payload = object(await fetch(tmdbUrl(`${path}/${endpoint}`, key, language)));
        if (!Array.isArray(payload.results)) throw new Error('Recommendations unavailable');
        return rows(payload.results).filter(item => item.adult !== true).map(item => ({ id: recommendationId(item.id), title: text(item.title) || text(item.name),
            image: /^\/[A-Za-z0-9_./-]+$/.test(text(item.poster_path)) ? `https://image.tmdb.org/t/p/w185${text(item.poster_path)}` : '',
            year: year(item.release_date || item.first_air_date), url: `https://www.themoviedb.org/${media === 'movie' ? 'movie' : 'tv'}/${recommendationId(item.id)}` }));
    };
    let items = unique(await read('recommendations'), id);
    if (items.length < 7) { try { items = unique([...items, ...await read('similar')], id); } catch { /* Keep the recommendations already returned by the source. */ } }
    return { source: 'TMDB', items };
}
export async function anilistRecommendations(fetch: JsonFetcher, id: string, mal: boolean, adult: boolean): Promise<Recommendations> {
    const payload = object(await fetch('https://graphql.anilist.co', { 'Content-Type': 'application/json', Accept: 'application/json' }, 'POST', JSON.stringify({
        query: `query ($id: Int) { Media(${mal ? 'idMal' : 'id'}: $id, type: ANIME) { id recommendations(sort: RATING_DESC, perPage: 25) { nodes { mediaRecommendation { id type isAdult title { romaji english native } coverImage { extraLarge large medium } startDate { year } } } } } }`, variables: { id: Number(id) },
    })));
    const media = object(object(payload.data).Media), recommendations = object(media.recommendations);
    if (Array.isArray(payload.errors) && payload.errors.length || !recommendationId(media.id) || !Array.isArray(recommendations.nodes)) throw new Error('Recommendations unavailable');
    return { source: 'AniList', items: unique(rows(recommendations.nodes).map(node => object(node.mediaRecommendation))
        .filter(item => item.type === 'ANIME' && (adult || item.isAdult !== true)).map(item => {
            const title = object(item.title), cover = object(item.coverImage);
            return { id: recommendationId(item.id), title: text(title.english) || text(title.romaji) || text(title.native),
                image: image(cover.extraLarge, /(^|\.)anilist\.co$/) || image(cover.large, /(^|\.)anilist\.co$/) || image(cover.medium, /(^|\.)anilist\.co$/),
                year: year(object(item.startDate).year), url: `https://anilist.co/anime/${recommendationId(item.id)}` };
        }), recommendationId(media.id)) };
}
export async function shikimoriRecommendations(fetch: JsonFetcher, id: string, language: string, adult: boolean): Promise<Recommendations> {
    let payload: unknown, base = '';
    for (const host of ['https://shikimori.net', 'https://shikimori.io', 'https://shikimori.one']) {
        try { const result = await fetch(`${host}/api/animes/${id}/similar`, { Accept: 'application/json', 'User-Agent': 'Lorebase (Obsidian plugin)' }); if (Array.isArray(result)) { payload = result; base = host; break; } } catch { /* Follow the same public mirrors as the metadata provider. */ }
    }
    if (!Array.isArray(payload)) throw new Error('Recommendations unavailable');
    return { source: 'Shikimori', items: unique(rows(payload).filter(item => adult || !['rx', 'r_plus'].includes(text(item.rating))).map(item => ({
        id: recommendationId(item.id), title: language === 'ru' ? text(item.russian) || text(item.name) : text(item.name) || text(item.russian),
        image: image(object(item.image).original, /(^|\.)shikimori\.(net|io|one)$/, base) || image(object(item.image).preview, /(^|\.)shikimori\.(net|io|one)$/, base), year: year(item.aired_on || item.released_on),
        url: `${base}/animes/${recommendationId(item.id)}`,
    })), id) };
}
