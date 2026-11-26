import type { JsonFetcher } from './common';
import type { SearchResult } from '../types';
import { normalizeTmdbLanguage } from './tmdb';
import { localizedPersonName, localizedRole } from '../../../utils/peopleDisplay';

export interface CastMember { id: string; name: string; role: string; photo: string; }
export interface PersonCredit extends SearchResult { media: 'movie' | 'series'; role: string; character?: string; job?: string; acting: boolean; crew: boolean; }
export interface PersonDetails { id: string; name: string; photo: string; biography: string; birthday: string; deathday: string; birthplace: string; credits: PersonCredit[]; }
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const rows = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.map(object) : [];
const id = (value: unknown): string => /^[1-9]\d*$/.test(String(value ?? '')) ? String(value) : '';
const photo = (value: unknown, size = 'w185'): string => /^\/[A-Za-z0-9_./-]+$/.test(text(value)) ? `https://image.tmdb.org/t/p/${size}${text(value)}` : '';
function url(path: string, key: string, language: string, extra: Record<string, string> = {}): string {
    if (!key.trim()) throw new Error('TMDB is not configured');
    return `https://api.themoviedb.org/3${path}?${new URLSearchParams({ api_key: key, language: normalizeTmdbLanguage(language), ...extra })}`;
}
export function normalizeCast(payload: unknown, language = 'en-US'): CastMember[] {
    const seen = new Set<string>();
    return rows(object(payload).cast).flatMap(value => {
        const personId = id(value.id), name = text(value.name);
        if (!personId || !name || seen.has(personId)) return [];
        seen.add(personId);
        const role = text(value.character) || [...new Set(rows(value.roles).map(role => text(role.character)).filter(Boolean))].join(' / ');
        return [{ id: personId, name: localizedPersonName(name, value.also_known_as, language), role: localizedRole(role, language), photo: photo(value.profile_path) }];
    });
}
export function normalizeCredits(payload: unknown, language = 'en-US'): PersonCredit[] {
    const source = object(payload), result = new Map<string, PersonCredit>();
    for (const [acting, values] of [[true, source.cast], [false, source.crew]] as const) {
        for (const value of rows(values)) {
            const media = value.media_type === 'movie' ? 'movie' : value.media_type === 'tv' ? 'series' : null;
            const titleId = id(value.id), title = text(value.title) || text(value.name);
            if (!media || !titleId || !title || value.adult === true) continue;
            const key = `${media}:${titleId}`, role = localizedRole(acting ? text(value.character) : text(value.job), language);
            const existing = result.get(key);
            if (existing) {
                existing.role = [...new Set([...existing.role.split(' / '), role].filter(Boolean))].join(' / '); existing.acting ||= acting; existing.crew ||= !acting;
                const field = acting ? 'character' : 'job';
                existing[field] = [...new Set([...(existing[field] || '').split(' / '), role].filter(Boolean))].join(' / ');
            } else {
                const released = text(media === 'movie' ? value.release_date : value.first_air_date);
                result.set(key, { provider: 'tmdb', media, id: titleId, title, role, character: acting ? role : '', job: acting ? '' : role, acting, crew: !acting, image: photo(value.poster_path, 'w342'), year: released.slice(0, 4), released });
            }
        }
    }
    return [...result.values()].sort((a, b) => (b.released || '').localeCompare(a.released || '') || a.title.localeCompare(b.title));
}
export async function getTmdbCast(fetch: JsonFetcher, media: 'movie' | 'series', titleId: string, key: string, language: string): Promise<CastMember[]> {
    if (!id(titleId)) throw new Error('Invalid TMDB title');
    const path = media === 'series' ? `/tv/${titleId}` : `/movie/${titleId}`;
    let payload: unknown;
    if (media === 'series') {
        try { payload = await fetch(url(`${path}/aggregate_credits`, key, language)); }
        catch { /* Some series only expose ordinary credits. */ }
    }
    if (!Array.isArray(object(payload).cast)) payload = await fetch(url(`${path}/credits`, key, language));
    if (!Array.isArray(object(payload).cast)) throw new Error('TMDB credits unavailable');
    return normalizeCast(payload, language);
}
/** Resolve the exact show through external IDs, never a fuzzy title/name match. */
export async function getTvmazeCast(fetch: JsonFetcher, showId: string, key: string, language: string): Promise<CastMember[]> {
    if (!id(showId)) throw new Error('Invalid TVmaze show');
    const show = object(await fetch(`https://api.tvmaze.com/shows/${showId}?embed=cast`));
    if (id(show.id) !== showId) throw new Error('TVmaze show unavailable');
    const external = object(show.externals);
    const lookups = [
        [/^tt\d+$/.test(text(external.imdb)) ? text(external.imdb) : '', 'imdb_id'],
        [id(external.thetvdb), 'tvdb_id'],
    ];
    for (const [externalId, source] of lookups) {
        if (!externalId) continue;
        const response = object(await fetch(url(`/find/${externalId}`, key, language, { external_source: source })));
        const matches = rows(response.tv_results).filter(value => id(value.id));
        if (matches.length === 1) {
            const cast = await getTmdbCast(fetch, 'series', id(matches[0].id), key, language);
            if (cast.length) return cast;
        }
    }
    // Unmapped shows still get their own portraits and roles. Their people must
    // be explicitly selected on TMDB rather than treating TVmaze IDs as TMDB IDs.
    const seen = new Set<string>();
    return rows(object(show._embedded).cast).flatMap(value => {
        const person = object(value.person), personId = id(person.id), name = text(person.name);
        if (!personId || !name || seen.has(personId)) return [];
        seen.add(personId);
        const image = text(object(person.image).medium) || text(object(person.image).original);
        const safeImage = /^https:\/\/static\.tvmaze\.com\/uploads\/images\/[A-Za-z0-9_./-]+$/.test(image) ? image : '';
        return [{ id: '', name, photo: safeImage, role: localizedRole(text(object(value.character).name), language) }];
    });
}
export async function searchTmdbPeople(fetch: JsonFetcher, name: string, key: string, language: string): Promise<CastMember[]> {
    const payload = await fetch(url('/search/person', key, language, { query: name, include_adult: 'false' }));
    return rows(object(payload).results).filter(value => value.adult !== true).flatMap(value => id(value.id) && text(value.name)
        ? [{ id: id(value.id), name: localizedPersonName(text(value.name), value.also_known_as, language), role: text(value.known_for_department), photo: photo(value.profile_path) }] : []);
}
export async function getTmdbPersonName(fetch: JsonFetcher, personId: string, key: string, language: string): Promise<string> {
    if (!id(personId)) throw new Error('Invalid TMDB person');
    const data = object(await fetch(url(`/person/${personId}`, key, language)));
    if (id(data.id) !== personId || !text(data.name)) throw new Error('TMDB person unavailable');
    return localizedPersonName(text(data.name), data.also_known_as, language);
}
export async function getTmdbPerson(fetch: JsonFetcher, personId: string, key: string, language: string): Promise<PersonDetails> {
    if (!id(personId)) throw new Error('Invalid TMDB person');
    const data = object(await fetch(url(`/person/${personId}`, key, language, { append_to_response: 'combined_credits' })));
    if (id(data.id) !== personId || !text(data.name)) throw new Error('TMDB person unavailable');
    return { id: personId, name: localizedPersonName(text(data.name), data.also_known_as, language), photo: photo(data.profile_path, 'w342'), biography: text(data.biography),
        birthday: text(data.birthday), deathday: text(data.deathday), birthplace: text(data.place_of_birth), credits: normalizeCredits(data.combined_credits, language) };
}
