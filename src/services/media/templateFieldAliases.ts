import type { MediaType } from '../../types';
import { readRootYamlKey } from '../integrations/templateSchema';
import { MUSIC_TEMPLATE_FIELDS } from '../integrations/templateUtils';
import { TEMPLATE_VALUE_PATTERN } from '../integrations/templateValues';

export type FrontmatterFieldAliases = Record<string, string>;

const COMMON_TOKEN_FIELDS: Record<string, string[]> = {
    type: ['type'],
    workType: ['work_type', 'workType'],
    countryOfOrigin: ['country_of_origin', 'countryOfOrigin'],
    isAdult: ['Sex18'],
    Plot: ['plot', 'summary', 'description'],
    Year: ['year'],
    status: ['status'],
    priority: ['personal_priority'],
    favorite: ['favorite'],
    started: ['started'],
    finished: ['finished'],
    detailedRatings: ['detailed_ratings'],
    relatedMedia: ['related_media'],
    repeatCount: ['repeat_count'],
    playedOn: ['played_on'],
    platformPlaythroughs: ['platform_playthroughs'],
    posterMode: ['poster_mode'],
    seasonTotal: ['season_total'],
    dlc: ['dlc'],
    steamAppId: ['steamAppId'],
    playtime: ['playtime'],
    anilistId: ['anilist_id'],
    communityRating: ['communityRating'],
    communityVotes: ['communityVotes'],
    communityRatingProvider: ['communityRatingProvider'],
    integrationProvider: ['integration_provider'],
    integrationId: ['integration_id'],
    url: ['url', 'source_url'],
};

const TOKEN_FIELDS: Record<MediaType, Record<string, string[]>> = {
    music: { name: ['title'], Plot: ['description'] },
    game: {
        name: ['name', 'title'], Poster: ['poster', 'image'], PosterHorizontal: ['poster_b', 'image_b', 'horizontal_poster'], genres: ['genres'],
        tags: ['tags'], platforms: ['platforms'], released: ['released'], developers: ['developers'],
        publishers: ['publishers'], gameSeries: ['gameSeries'], userRating: ['userRating'],
        progressPercent: ['progress_percent'], achievementsUnlocked: ['achievements_unlocked'],
        achievementsTotal: ['achievements_total'], gameModes: ['game_modes'],
        main: ['main'], main_plus_sides: ['main_plus_sides'], perfectionist: ['perfectionist'],
    },
    anime: {
        finished: ['finished', 'dateWatched'],
        alternativeTitles: ['alt_titles'],
        name: ['title', 'name'], image: ['image', 'poster'], ImageHorizontal: ['image_b', 'poster_b', 'horizontal_poster'], tags: ['tags'], genres: ['genres'],
        released: ['released', 'release_date', 'releaseDate', 'aired_on', 'air_date', 'premiered'],
        studios: ['studios'], format: ['format'], seasonCurrent: ['season_current'], seasonTotal: ['season_total'],
        episodeCurrent: ['episode_current'], episodeTotal: ['episode_total'], activePartId: ['active_part_id'],
        animePartsYaml: ['anime_parts'], rating: ['rating', 'userRating', 'rating_user'],
    },
    movie: {
        episodeCurrent: ['episode_current'], episodeTotal: ['episode_total'],
        name: ['title', 'name'], Poster: ['poster', 'image'], PosterHorizontal: ['poster_b', 'image_b', 'horizontal_poster'], genres: ['genres'], tags: ['tags'],
        released: ['released', 'release_date', 'releaseDate', 'premiered', 'first_air_date'], runtime: ['runtime'], director: ['director', 'directors'], directors: ['directors', 'director'], actors: ['actors'],
        activePartId: ['active_part_id'], videoPartsYaml: ['movie_parts'], rating: ['rating', 'userRating', 'rating_user'],
    },
    series: {
        name: ['title', 'name'], Poster: ['poster', 'image'], PosterHorizontal: ['poster_b', 'image_b', 'horizontal_poster'], genres: ['genres'], tags: ['tags'],
        released: ['released'], runtime: ['runtime'], director: ['director', 'directors'], directors: ['directors', 'director'], actors: ['actors'],
        seasons: ['seasons'], seasonCurrent: ['season_current'], episodeCurrent: ['episode_current'],
        episodeTotal: ['episode_total'], activePartId: ['active_part_id'], videoPartsYaml: ['series_parts'],
        networks: ['networks'], studios: ['studios'], rating: ['rating', 'userRating', 'rating_user'],
    },
    book: {
        name: ['title', 'name'], Poster: ['poster', 'image'], PosterHorizontal: ['poster_b', 'image_b', 'horizontal_poster'], authors: ['authors', 'author'], publisher: ['publisher', 'publishers'],
        genres: ['genres'], tags: ['tags'], released: ['released', 'release_date', 'releaseDate', 'publishedDate', 'publish_date', 'published', 'publication_date'], pageCurrent: ['page_current'], pageTotal: ['page_total'],
        chapterCurrent: ['chapter_current'], chapterTotal: ['chapter_total'], rating: ['rating', 'userRating', 'rating_user'],
    },
    manga: {
        alternativeTitles: ['alt_titles'],
        name: ['title', 'name'], Poster: ['poster', 'image'], PosterHorizontal: ['poster_b', 'image_b', 'horizontal_poster'], authors: ['authors', 'author'], artists: ['artists', 'artist'],
        workType: ['work_type', 'workType', 'manga_type'],
        released: ['released', 'release_date', 'releaseDate', 'publishedDate', 'publish_date', 'published', 'publication_date'],
        genres: ['genres'], tags: ['tags'], chapterCurrent: ['chapter_current'], chapterTotal: ['chapter_total'],
        volumeCurrent: ['volume_current'], volumeTotal: ['volume_total'], activePartId: ['active_part_id'],
        mangaPartsYaml: ['manga_parts'], rating: ['rating', 'userRating', 'rating_user'], isAdult: ['Sex18'],
    },
};

export function parseTemplateFieldAliases(mediaType: MediaType, template: string): FrontmatterFieldAliases {
    const result: FrontmatterFieldAliases = {};
    let precedingKey: string | null = null;
    const tokenFields = mediaType === 'music' ? TOKEN_FIELDS.music : { ...COMMON_TOKEN_FIELDS, ...TOKEN_FIELDS[mediaType] };
    const tokens = mediaType === 'music' ? [...MUSIC_TEMPLATE_FIELDS, ...Object.keys(tokenFields)] : Object.keys(tokenFields);
    const tokenNames = new Map(tokens.map(key => [key.toLowerCase(), key]));

    const yaml = template.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] ?? template;
    for (const line of yaml.split(/\r?\n/)) {
        const yamlKey = readRootYamlKey(line);
        if (yamlKey) precedingKey = yamlKey;
        if (/^\s*#/.test(line)) continue;
        const matches = [...line.matchAll(TEMPLATE_VALUE_PATTERN)];
        if (!matches.length) continue;
        const alias = yamlKey ?? precedingKey;
        if (!alias) continue;
        for (const match of matches) {
            const token = tokenNames.get(match[1].toLowerCase()) ?? match[1];
            const fields = Object.prototype.hasOwnProperty.call(tokenFields, token) ? tokenFields[token] : [token];
            for (const canonical of fields) {
                Object.defineProperty(result, canonical, { value: alias, enumerable: true, configurable: true, writable: true });
            }
        }
    }
    return result;
}

/** Move an old standard property to its renamed property when the note is saved. */
export function migrateFrontmatterAliases(source: Record<string, unknown>, aliases: FrontmatterFieldAliases): void {
    for (const [canonical, alias] of Object.entries(aliases)) {
        if (canonical === alias || !Object.prototype.hasOwnProperty.call(source, canonical)) continue;
        if (!Object.prototype.hasOwnProperty.call(source, alias)) {
            Object.defineProperty(source, alias, { value: source[canonical], enumerable: true, configurable: true, writable: true });
        }
        if (source[canonical] === source[alias]) delete source[canonical];
    }
}

export function applyFrontmatterAliases(
    source: Record<string, unknown>,
    aliases: FrontmatterFieldAliases
): Record<string, unknown> {
    const normalized = { ...source };
    for (const [canonical, alias] of Object.entries(aliases)) {
        if (canonical === alias || !Object.prototype.hasOwnProperty.call(source, alias)) continue;
        Object.defineProperty(normalized, canonical, {
            value: source[alias],
            enumerable: false,
            configurable: true,
            writable: true,
        });
    }
    return normalized;
}

export function remapFrontmatterUpdates(
    updates: Record<string, unknown>,
    aliases: FrontmatterFieldAliases
): Record<string, unknown> {
    const remapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
        const target = aliases[key] ?? key;
        const deletesValue = value === null || value === undefined || value === '';
        const existingValue = remapped[target];
        const existingIsValue = existingValue !== null && existingValue !== undefined && existingValue !== '';
        // Several legacy field names can intentionally point at one custom key.
        // A cleanup of a legacy key must not erase the value written just before it.
        if (deletesValue && existingIsValue) continue;
        Object.defineProperty(remapped, target, { value, enumerable: true, configurable: true, writable: true });
    }
    return remapped;
}
