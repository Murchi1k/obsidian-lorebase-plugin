import type { MediaKind, TemplateKind } from './types';
import { getDeferredTemplateFields, includeDeferredTemplateFields, readRootYamlKey } from './templateSchema';
import type { FrontmatterFieldAliases } from '../media/templateFieldAliases';
import { formatTemplateWikilinks, TEMPLATE_VALUE_PATTERN, WIKILINK_YAML_LIST_ITEM, WIKILINK_YAML_PROPERTY } from './templateValues';

const DEFERRED_TEMPLATE_DEFAULTS = new Map(['games', 'anime', 'movies', 'series', 'books', 'manga'].flatMap(kind =>
    getDeferredTemplateFields(kind as MediaKind).map(field => [field.key === 'adult' ? 'isAdult' : field.key, field.initial] as const)));

export const MUSIC_TEMPLATE_FIELDS = [
    'type', 'music_kind', 'title', 'artist', 'album', 'poster', 'description', 'year', 'released', 'countries',
    'genres', 'tags', 'duration', 'tracks', 'status', 'rating', 'detailed_ratings', 'favorite', 'url',
    'integration_provider', 'integration_id', 'parent_album', 'parent_track_id', 'cssclasses',
] as const;

const GAME_HLTB_TEMPLATE_FIELDS = ['main', 'main_plus_sides', 'perfectionist', 'completionist'];
const NUMERIC_HLTB_TEMPLATE_FIELDS = new Set(['main', 'main_plus_sides', 'perfectionist', 'completionist']);

/** Rename only the former generated field, preserving custom keys and the note body. */
export function migrateAlternativeTitleTemplate(template: string): string {
    return template.replace(/^(---\r?\n)([\s\S]*?)(\r?\n---)(?=\r?\n|$)/, (_match, start: string, yaml: string, end: string) => {
        if (/^(?:alt_titles|"alt_titles"|'alt_titles')\s*:/m.test(yaml)) return start + yaml + end;
        const migrated = yaml.replace(
            /^(?:titles|"titles"|'titles')(?=[ \t]*:[ \t]*["']?\{\{VALUE:alternativeTitles\}\}["']?[ \t]*(?:#[^\r\n]*)?\r?$)/gm,
            'alt_titles'
        );
        return start + migrated + end;
    });
}

export function getDefaultTemplateFields(kind: TemplateKind): string[] {
    if (kind === 'music') return [...MUSIC_TEMPLATE_FIELDS];
    const fields = includeDeferredTemplateFields(kind, getBaseTemplateFields(kind));
    if (kind === 'anime' || kind === 'manga') fields.splice(fields.indexOf('name') + 1, 0, 'alternativeTitles');
    if (kind === 'games') fields.splice(fields.indexOf('integrationSource'), 0, 'main', 'main_plus_sides', 'perfectionist');
    return fields;
}

function getBaseTemplateFields(kind: MediaKind): string[] {
    if (kind === 'games') {
        return [
            'type',
            'workType',
            'name',
            'poster',
            'posterHorizontal',
            'plot',
            'gameSeries',
            'genres',
            'platforms',
            'year',
            'released',
            'developers',
            'publishers',
            'userRating',
            'communityRating',
            'communityVotes',
            'communityRatingProvider',
            'status',
            'favorite',
            'integrationSource',
            'url',
        ];
    }

    if (kind === 'anime') return [
        'type',
        'countryOfOrigin',
        'adult',
        'name',
        'image',
        'imageHorizontal',
        'plot',
        'genres',
        'tags',
        'year',
        'released',
        'studios',
        'format',
        'animeParts',
        'rating',
        'communityRating',
        'communityVotes',
        'communityRatingProvider',
        'status',
        'favorite',
        'integrationSource',
        'url',
    ];

    if (kind === 'movies') {
        return [
            'type',
            'workType',
            'name',
            'poster',
            'posterHorizontal',
            'plot',
            'genres',
            'year',
            'released',
            'runtime',
            'director',
            'actors',
            'rating',
            'communityRating',
            'communityVotes',
            'communityRatingProvider',
            'status',
            'favorite',
            'movieParts',
            'integrationSource',
            'url',
        ];
    }

    if (kind === 'books') {
        return [
            'type',
            'name',
            'poster',
            'posterHorizontal',
            'plot',
            'authors',
            'publisher',
            'genres',
            'tags',
            'year',
            'released',
            'pageCurrent',
            'pageTotal',
            'chapterCurrent',
            'chapterTotal',
            'rating',
            'communityRating',
            'communityVotes',
            'communityRatingProvider',
            'status',
            'favorite',
            'integrationSource',
            'url',
        ];
    }

    if (kind === 'manga') {
        return [
            'type',
            'workType',
            'name',
            'poster',
            'posterHorizontal',
            'plot',
            'authors',
            'artists',
            'genres',
            'tags',
            'year',
            'released',
            'chapterCurrent',
            'chapterTotal',
            'volumeCurrent',
            'volumeTotal',
            'mangaParts',
            'rating',
            'communityRating',
            'communityVotes',
            'communityRatingProvider',
            'status',
            'favorite',
            'adult',
            'integrationSource',
            'url',
        ];
    }

    return [
        'type',
        'workType',
        'name',
        'poster',
        'posterHorizontal',
        'plot',
        'genres',
        'year',
        'released',
        'runtime',
        'director',
        'actors',
        'seasons',
        'episodeCurrent',
        'episodeTotal',
        'seriesParts',
        'rating',
        'communityRating',
        'communityVotes',
        'communityRatingProvider',
        'status',
        'favorite',
        'integrationSource',
        'url',
    ];
}

export function getEffectiveSimpleTemplateFields(
    kind: TemplateKind,
    fields: string[],
    _options: { howLongToBeatEnabled?: boolean } = {}
): string[] {
    const allowed = new Set(getDefaultTemplateFields(kind));
    if (kind === 'anime' || kind === 'manga') allowed.add('alternativeTitles');
    if (kind === 'games') {
        GAME_HLTB_TEMPLATE_FIELDS.forEach((field) => allowed.add(field));
    }

    const normalized: string[] = [];
    for (const key of fields) {
        if (!allowed.has(key)) continue;
        const normalizedKey = key === 'completionist' ? 'perfectionist' : key;
        if (normalized.includes(normalizedKey)) continue;
        normalized.push(normalizedKey);
    }

    return normalized;
}

function getTemplateFieldForYamlKey(kind: MediaKind, yamlKey: string): string | undefined {
    const deferred = getDeferredTemplateFields(kind).find(field => field.yaml === yamlKey);
    if (deferred) return deferred.key;
    const common: Record<string, string> = {
        type: 'type',
        work_type: 'workType',
        country_of_origin: 'countryOfOrigin',
        plot: 'plot',
        year: 'year',
        rating: kind === 'games' ? 'userRating' : 'rating',
        status: 'status',
        favorite: 'favorite',
        Sex18: 'adult',
        integration_provider: 'integrationSource',
        integration_id: 'integrationSource',
        communityRating: 'communityRating',
        communityVotes: 'communityVotes',
        communityRatingProvider: 'communityRatingProvider',
        url: 'url',
    };
    const fieldsByKind: Record<MediaKind, Record<string, string>> = {
        games: {
            name: 'name',
            poster: 'poster',
            poster_b: 'posterHorizontal',
            gameSeries: 'gameSeries',
            genres: 'genres',
            platforms: 'platforms',
            released: 'released',
            developers: 'developers',
            publishers: 'publishers',
            userRating: 'userRating',
            main: 'main',
            main_plus_sides: 'main_plus_sides',
            perfectionist: 'perfectionist',
        },
        anime: {
            alt_titles: 'alternativeTitles',
            title: 'name',
            image: 'image',
            image_b: 'imageHorizontal',
            genres: 'genres',
            tags: 'tags',
            released: 'released',
            studios: 'studios',
            format: 'format',
            season_current: 'animeParts',
            episode_current: 'animeParts',
            episode_total: 'animeParts',
            active_part_id: 'animeParts',
            anime_parts: 'animeParts',
        },
        movies: {
            title: 'name',
            poster: 'poster',
            poster_b: 'posterHorizontal',
            genres: 'genres',
            released: 'released',
            runtime: 'runtime',
            director: 'director',
            directors: 'director',
            actors: 'actors',
            active_part_id: 'movieParts',
            movie_parts: 'movieParts',
        },
        series: {
            title: 'name',
            poster: 'poster',
            poster_b: 'posterHorizontal',
            genres: 'genres',
            released: 'released',
            runtime: 'runtime',
            director: 'director',
            directors: 'director',
            actors: 'actors',
            seasons: 'seasons',
            episode_current: 'episodeCurrent',
            episode_total: 'episodeTotal',
            active_part_id: 'seriesParts',
            series_parts: 'seriesParts',
        },
        books: {
            title: 'name',
            poster: 'poster',
            poster_b: 'posterHorizontal',
            authors: 'authors',
            publisher: 'publisher',
            genres: 'genres',
            tags: 'tags',
            released: 'released',
            page_current: 'pageCurrent',
            page_total: 'pageTotal',
            chapter_current: 'chapterCurrent',
            chapter_total: 'chapterTotal',
        },
        manga: {
            alt_titles: 'alternativeTitles',
            work_type: 'workType',
            title: 'name',
            poster: 'poster',
            poster_b: 'posterHorizontal',
            authors: 'authors',
            artists: 'artists',
            genres: 'genres',
            tags: 'tags',
            released: 'released',
            chapter_current: 'chapterCurrent',
            chapter_total: 'chapterTotal',
            volume_current: 'volumeCurrent',
            volume_total: 'volumeTotal',
            active_part_id: 'mangaParts',
            manga_parts: 'mangaParts',
        },
    };

    return fieldsByKind[kind][yamlKey] ?? common[yamlKey];
}

function applySimpleTemplateFieldOrder(kind: MediaKind, fields: string[], lines: string[]): string[] {
    const fixedLines: string[] = [];
    const blocks: Array<{ field: string; index: number; lines: string[] }> = [];

    for (const line of lines) {
        const match = line.match(/^([A-Za-z0-9_]+)\s*:/);
        const field = match ? getTemplateFieldForYamlKey(kind, match[1]) : undefined;
        if (!field) {
            if (blocks.length && !match) blocks[blocks.length - 1].lines.push(line);
            else fixedLines.push(line);
            continue;
        }

        blocks.push({ field, index: blocks.length, lines: [line] });
    }

    const order = new Map(fields.map((field, index) => [
        field === 'completionist' ? 'perfectionist' : field,
        index,
    ]));
    blocks.sort((left, right) => {
        const leftOrder = order.get(left.field) ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = order.get(right.field) ?? Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder || left.index - right.index;
    });

    const sortedLines = [...fixedLines];
    for (const block of blocks) sortedLines.push(...block.lines);
    return sortedLines;
}

function appendCommunityRatingFields(set: Set<string>, lines: string[]): void {
    if (set.has('communityRating')) lines.push('communityRating: {{VALUE:communityRating}}');
    if (set.has('communityVotes')) lines.push('communityVotes: {{VALUE:communityVotes}}');
    if (set.has('communityRatingProvider')) {
        lines.push('communityRatingProvider: "{{VALUE:communityRatingProvider}}"');
    }
}

const MEDIA_WIKILINK_TOKENS: Record<TemplateKind, Record<string, string>> = {
    games: { developers: 'developers', publishers: 'publishers' },
    anime: { studios: 'studios' },
    movies: { actors: 'actors', director: 'directors' },
    series: { actors: 'actors', director: 'directors' },
    books: { authors: 'authors' },
    manga: { authors: 'authors' },
    music: { artist: 'artist' },
};

export function getSimpleWikilinkTokens(kind: TemplateKind): Record<string, string> {
    return { genres: 'genres', ...MEDIA_WIKILINK_TOKENS[kind] };
}

export function buildSimpleTemplate(
    kind: TemplateKind,
    fields: string[],
    aliases: FrontmatterFieldAliases = {},
    wikilinkFields?: readonly string[],
): string {
    const linkTokens = getSimpleWikilinkTokens(kind);
    const links = new Set(Array.isArray(wikilinkFields) ? wikilinkFields : Object.keys(linkTokens));
    const value = (field: string): string => {
        const token = linkTokens[field];
        return token && links.has(field) ? `{{VALUE:${token}|wikilink}}` : `{{VALUE:${token ?? field}}}`;
    };
    if (kind === 'music') {
        const allowed = new Set<string>(MUSIC_TEMPLATE_FIELDS);
        const lines = fields.filter(field => allowed.has(field)).map(field =>
            formatTemplateYamlKey(aliases[field] ?? field) + ': ' + value(field));
        return ['---', ...lines, '---'].join('\n');
    }
    const set = new Set(fields);
    const lines: string[] = ['---'];
    if (['games', 'movies', 'series'].includes(kind) && set.has('workType')) lines.push('work_type: "{{VALUE:workType}}"');
    if (kind === 'anime') {
        if (set.has('countryOfOrigin')) lines.push('country_of_origin: "{{VALUE:countryOfOrigin}}"');
        if (set.has('adult')) lines.push('Sex18: {{VALUE:isAdult}}');
    }

    if (kind === 'games') {
        if (set.has('type')) lines.push('type: "game"');
        if (set.has('name')) lines.push('name: "{{VALUE:name}}"');
        if (set.has('poster')) lines.push('poster: "{{VALUE:Poster}}"');
        if (set.has('posterHorizontal')) lines.push('poster_b: "{{VALUE:PosterHorizontal}}"');
        if (set.has('plot')) lines.push('plot: "{{VALUE:Plot}}"');
        if (set.has('gameSeries')) lines.push('gameSeries:');
        if (set.has('genres')) lines.push(`genres: "${value('genres')}"`);
        if (set.has('platforms')) lines.push('platforms: "{{VALUE:platforms}}"');
        if (set.has('year')) lines.push('year: {{VALUE:Year}}');
        if (set.has('released')) lines.push('released: "{{VALUE:released}}"');
        if (set.has('developers')) lines.push(`developers: "${value('developers')}"`);
        if (set.has('publishers')) lines.push(`publishers: "${value('publishers')}"`);
        if (set.has('userRating')) lines.push('userRating: {{VALUE:userRating}}');
        appendCommunityRatingFields(set, lines);
        if (set.has('status')) lines.push('status: "{{VALUE:status}}"');
        if (set.has('favorite')) lines.push('favorite: false');
        if (set.has('integrationSource')) {
            lines.push('integration_provider: "{{VALUE:integrationProvider}}"');
            lines.push('integration_id: "{{VALUE:integrationId}}"');
        }
        if (set.has('url')) lines.push('url: "{{VALUE:url}}"');
        if (set.has('main')) lines.push('main: {{VALUE:main}}');
        if (set.has('main_plus_sides')) lines.push('main_plus_sides: {{VALUE:main_plus_sides}}');
        if (set.has('perfectionist') || set.has('completionist')) {
            lines.push('perfectionist: {{VALUE:perfectionist}}');
        }
    } else if (kind === 'anime') {
        if (set.has('type')) lines.push('type: "anime"');
        if (set.has('name')) lines.push('title: "{{VALUE:name}}"');
        if (set.has('alternativeTitles')) lines.push('alt_titles: {{VALUE:alternativeTitles}}');
        if (set.has('image')) lines.push('image: "{{VALUE:image}}"');
        if (set.has('imageHorizontal')) lines.push('image_b: "{{VALUE:ImageHorizontal}}"');
        if (set.has('plot')) lines.push('plot: "{{VALUE:Plot}}"');
        if (set.has('genres')) lines.push(`genres: "${value('genres')}"`);
        if (set.has('tags')) lines.push('tags: "{{VALUE:tags}}"');
        if (set.has('year')) lines.push('year: {{VALUE:Year}}');
        if (set.has('released')) lines.push('released: {{VALUE:released}}');
        if (set.has('studios')) lines.push(`studios: "${value('studios')}"`);
        if (set.has('format')) lines.push('format: "{{VALUE:format}}"');
        if (set.has('animeParts')) {
            lines.push('season_current: {{VALUE:seasonCurrent}}');
            lines.push('episode_current: {{VALUE:episodeCurrent}}');
            lines.push('episode_total: {{VALUE:episodeTotal}}');
            lines.push('active_part_id: "{{VALUE:activePartId}}"');
            lines.push('anime_parts:');
            lines.push('{{VALUE:animePartsYaml}}');
        }
        if (set.has('rating')) lines.push('rating: {{VALUE:rating}}');
        appendCommunityRatingFields(set, lines);
        if (set.has('status')) lines.push('status: "{{VALUE:status}}"');
        if (set.has('favorite')) lines.push('favorite: false');
        if (set.has('integrationSource')) {
            lines.push('integration_provider: "{{VALUE:integrationProvider}}"');
            lines.push('integration_id: "{{VALUE:integrationId}}"');
        }
        if (set.has('url')) lines.push('url: "{{VALUE:url}}"');
    } else if (kind === 'movies' || kind === 'series') {
        if (set.has('type')) lines.push(`type: "${kind === 'movies' ? 'movie' : 'series'}"`);
        if (set.has('name')) lines.push('title: "{{VALUE:name}}"');

        if (set.has('poster')) lines.push('poster: "{{VALUE:Poster}}"');
        if (set.has('posterHorizontal')) lines.push('poster_b: "{{VALUE:PosterHorizontal}}"');
        if (set.has('plot')) lines.push('plot: "{{VALUE:Plot}}"');
        if (set.has('genres')) lines.push(`genres: "${value('genres')}"`);
        if (set.has('year')) lines.push('year: {{VALUE:Year}}');
        if (kind === 'movies') {
            if (set.has('released')) lines.push('released: {{VALUE:released}}');
            if (set.has('runtime')) lines.push('runtime: {{VALUE:runtime}}');
            if (set.has('director')) lines.push(`directors: "${value('director')}"`);
            if (set.has('actors')) lines.push(`actors: "${value('actors')}"`);
            if (set.has('movieParts')) {
                lines.push('active_part_id: "{{VALUE:activePartId}}"');
                lines.push('movie_parts:');
                lines.push('{{VALUE:videoPartsYaml}}');
            }
        } else {
            if (set.has('released')) lines.push('released: {{VALUE:released}}');
            if (set.has('runtime')) lines.push('runtime: {{VALUE:runtime}}');
            if (set.has('director')) lines.push(`directors: "${value('director')}"`);
            if (set.has('actors')) lines.push(`actors: "${value('actors')}"`);
            if (set.has('seasons')) lines.push('seasons: {{VALUE:seasons}}');
            if (set.has('episodeCurrent')) lines.push('episode_current: {{VALUE:episodeCurrent}}');
            if (set.has('episodeTotal')) lines.push('episode_total: {{VALUE:episodeTotal}}');
            if (set.has('seriesParts')) {
                lines.push('active_part_id: "{{VALUE:activePartId}}"');
                lines.push('series_parts:');
                lines.push('{{VALUE:videoPartsYaml}}');
            }
        }
        if (set.has('rating')) lines.push('rating: {{VALUE:rating}}');
        appendCommunityRatingFields(set, lines);
        if (set.has('status')) lines.push('status: "{{VALUE:status}}"');
        if (set.has('favorite')) lines.push('favorite: false');
        if (set.has('integrationSource')) {
            lines.push('integration_provider: "{{VALUE:integrationProvider}}"');
            lines.push('integration_id: "{{VALUE:integrationId}}"');
        }
        if (set.has('url')) lines.push('url: "{{VALUE:url}}"');
    } else {
        if (set.has('type')) lines.push(`type: "${kind === 'books' ? 'book' : 'manga'}"`);
        if (kind === 'manga' && set.has('workType')) lines.push('work_type: "{{VALUE:workType}}"');
        if (set.has('name')) lines.push('title: "{{VALUE:name}}"');
        if (kind === 'manga' && set.has('alternativeTitles')) lines.push('alt_titles: {{VALUE:alternativeTitles}}');
        if (set.has('poster')) lines.push('poster: "{{VALUE:Poster}}"');
        if (set.has('posterHorizontal')) lines.push('poster_b: "{{VALUE:PosterHorizontal}}"');
        if (set.has('plot')) lines.push('plot: "{{VALUE:Plot}}"');
        if (set.has('authors')) lines.push(`authors: "${value('authors')}"`);
        if (kind === 'manga' && set.has('artists')) lines.push('artists: "{{VALUE:artists}}"');
        if (kind === 'books' && set.has('publisher')) lines.push('publisher: "{{VALUE:publisher}}"');
        if (set.has('genres')) lines.push(`genres: "${value('genres')}"`);
        if (set.has('tags')) lines.push('tags: "{{VALUE:tags}}"');
        if (set.has('year')) lines.push('year: {{VALUE:Year}}');
        if (kind === 'books') {
            if (set.has('released')) lines.push('released: {{VALUE:released}}');
            if (set.has('pageCurrent')) lines.push('page_current: {{VALUE:pageCurrent}}');
            if (set.has('pageTotal')) lines.push('page_total: {{VALUE:pageTotal}}');
            if (set.has('chapterCurrent')) lines.push('chapter_current: {{VALUE:chapterCurrent}}');
            if (set.has('chapterTotal')) lines.push('chapter_total: {{VALUE:chapterTotal}}');
        } else {
            if (set.has('released')) lines.push('released: {{VALUE:released}}');
            if (set.has('chapterCurrent')) lines.push('chapter_current: {{VALUE:chapterCurrent}}');
            if (set.has('chapterTotal')) lines.push('chapter_total: {{VALUE:chapterTotal}}');
            if (set.has('volumeCurrent')) lines.push('volume_current: {{VALUE:volumeCurrent}}');
            if (set.has('volumeTotal')) lines.push('volume_total: {{VALUE:volumeTotal}}');
            if (set.has('mangaParts')) {
                lines.push('active_part_id: "{{VALUE:activePartId}}"');
                lines.push('manga_parts:');
                lines.push('{{VALUE:mangaPartsYaml}}');
            }
        }
        if (set.has('rating')) lines.push('rating: {{VALUE:rating}}');
        appendCommunityRatingFields(set, lines);
        if (set.has('status')) lines.push('status: "{{VALUE:status}}"');
        if (set.has('favorite')) lines.push('favorite: false');
        if (kind === 'manga' && set.has('adult')) lines.push('Sex18: {{VALUE:isAdult}}');
        if (set.has('integrationSource')) {
            lines.push('integration_provider: "{{VALUE:integrationProvider}}"');
            lines.push('integration_id: "{{VALUE:integrationId}}"');
        }
        if (set.has('url')) lines.push('url: "{{VALUE:url}}"');
    }

    for (const field of getDeferredTemplateFields(kind)) {
        if (!set.has(field.key)) continue;
        const token = field.key === 'adult' ? 'isAdult' : field.key;
        lines.push(`${field.yaml}: {{VALUE:${token}}}`);
    }
    const orderedLines = applySimpleTemplateFieldOrder(kind, fields, lines);
    orderedLines.push('---');
    return orderedLines.map(line => {
        const match = line.match(/^([A-Za-z0-9_]+):/);
        const target = match && aliases[match[1]];
        if (!match || !target || target === match[1]) return line;
        const yamlKey = formatTemplateYamlKey(target);
        return yamlKey + line.slice(match[1].length);
    }).join('\n');
}

export function formatTemplateYamlKey(key: string): string {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? key : JSON.stringify(key);
}

function hasSiblingTemplateListItem(lines: string[], index: number, indent: string): boolean {
    for (const step of [-1, 1]) {
        for (let cursor = index + step; cursor >= 0 && cursor < lines.length; cursor += step) {
            const line = lines[cursor];
            const content = line.trimStart();
            if (!content || content.startsWith('#')) continue;
            const width = line.length - content.length;
            if (width > indent.length) continue;
            if (width === indent.length && /^-[ \t]/.test(content)) return true;
            break;
        }
    }
    return false;
}

export function renderTemplate(template: string, values: Record<string, unknown>, typedValues = false): string {
    // Reserve deferred fields even when an external catalog has no value for them.
    const deferred = DEFERRED_TEMPLATE_DEFAULTS;
    values = { ...Object.fromEntries(deferred), favorite: false, ...values };
    const valueNames = new Map(Object.keys(values).map(key => [key.toLowerCase(), key]));
    for (const token of template.matchAll(TEMPLATE_VALUE_PATTERN)) {
        if (Object.prototype.hasOwnProperty.call(values, token[1])) continue;
        const canonical = valueNames.get(token[1].toLowerCase());
        if (canonical) values[token[1]] = values[canonical];
    }
    const lines = template.split(/\r?\n/);
    const output: string[] = [];
    const frontmatterEnd = /^\uFEFF?---[ \t]*$/.test(lines[0])
        ? lines.findIndex((line, index) => index > 0 && /^---[ \t]*$/.test(line))
        : -1;
    const yamlValueToken = /^(\s*)("(?:[^"\\]|\\.)+"|'(?:[^']|'')+'|[^:]+):[ \t]*"?\{\{VALUE:[A-Za-z0-9_]+\}\}"?[ \t]*$/;
    const typedYamlValueToken = /^(\s*(?:"(?:[^"\\]|\\.)+"|'(?:[^']|'')+'|[^:]+):[ \t]*)\{\{VALUE:[A-Za-z0-9_]+\}\}([ \t]*(?:#.*)?)$/;

    for (const [index, line] of lines.entries()) {
        const match = line.matchAll(TEMPLATE_VALUE_PATTERN).next().value;
        if (!match) {
            output.push(line);
            continue;
        }

        const key = match[1];
        const inYaml = frontmatterEnd === -1 || index < frontmatterEnd;
        const value = values[key];
        if (match[2] && inYaml) {
            const property = line.match(WIKILINK_YAML_PROPERTY);
            const listItem = line.match(WIKILINK_YAML_LIST_ITEM);
            const formatted = formatTemplateWikilinks(value);
            if (property) {
                output.push(property[1] + JSON.stringify(formatted ?? null) + property[3]);
                continue;
            }
            if (listItem) {
                const [, indent, , comment] = listItem;
                const entries = Array.isArray(formatted) ? formatted : [formatted ?? null];
                if (!entries.length) {
                    if (!hasSiblingTemplateListItem(lines, index, indent)) output.push((indent || '  ') + '[]' + comment);
                    else if (comment.trim()) output.push(indent + comment.trimStart());
                } else {
                    entries.forEach((entry, position) => {
                        output.push(indent + '- ' + JSON.stringify(entry ?? null) + (position === 0 ? comment : ''));
                    });
                }
                continue;
            }
        }

        const deferredField = line.match(typedYamlValueToken);
        if (typedValues && deferredField) {
            output.push(deferredField[1] + JSON.stringify(value ?? null) + deferredField[2]);
            continue;
        }
        if (deferred.has(key) && deferredField) {
            output.push(`${deferredField[1]}${JSON.stringify(value ?? deferred.get(key))}${deferredField[2]}`);
            continue;
        }
        if (typeof value === 'string' && value.includes('\n') && line.trim() === `{{VALUE:${key}}}`) {
            output.push(value);
            continue;
        }

        if (NUMERIC_HLTB_TEMPLATE_FIELDS.has(key) && typeof value === 'number' && Number.isFinite(value)) {
            const numericKeyMatch = line.match(yamlValueToken);
            if (numericKeyMatch) {
                output.push(numericKeyMatch[1] + numericKeyMatch[2] + ": " + value);
                continue;
            }
        }

        if (key === 'released' && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
            const dateKeyMatch = line.match(yamlValueToken);
            if (dateKeyMatch) {
                output.push(dateKeyMatch[1] + dateKeyMatch[2] + ": " + value);
                continue;
            }
        }

        if (Array.isArray(value)) {
            const listItemMatch = line.match(/^(\s*)-\s*"?\{\{VALUE:[A-Za-z0-9_]+\}\}"?\s*$/);
            if (listItemMatch) {
                const indent = listItemMatch[1];
                if (!value.length) {
                    output.push(`${indent}[]`);
                    continue;
                }
                for (const item of value) {
                    output.push(`${indent}- "${escapeYaml(item)}"`);
                }
                continue;
            }

            const keyMatch = line.match(yamlValueToken);
            if (keyMatch) {
                const indent = keyMatch[1];
                const keyName = keyMatch[2].trim();
                if (!value.length) {
                    output.push(`${indent}${keyName}: []`);
                    continue;
                }
                output.push(`${indent}${keyName}:`);
                const childIndent = `${indent}  `;
                for (const item of value) {
                    output.push(`${childIndent}- "${escapeYaml(item)}"`);
                }
                continue;
            }
        }

        const replaced = line.replace(TEMPLATE_VALUE_PATTERN, (_: string, name: string, modifier?: string) => {
            const raw = modifier ? formatTemplateWikilinks(values[name]) : values[name];
            const encode = modifier && !inYaml ? toStringSafe : escapeYaml;
            return Array.isArray(raw) ? raw.map(encode).join(', ') : encode(raw);
        });
        output.push(replaced);
    }

    return output.join('\n');
}

/**
 * Provider identity is operational metadata rather than an optional display
 * field. Keep it in frontmatter even when a device still has an older custom
 * template that predates the integration source fields.
 */
export function ensureIntegrationSourceFrontmatter(
    content: string,
    provider: string,
    id: string,
    aliases: FrontmatterFieldAliases = {}
): string {
    const safeProvider = escapeYaml(provider.trim());
    const safeId = escapeYaml(id.trim());
    if (!safeProvider || !safeId) return content;

    const providerKey = aliases.integration_provider ?? 'integration_provider';
    const idKey = aliases.integration_id ?? 'integration_id';
    const yamlKey = (key: string): string => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? key : JSON.stringify(key);
    const sourceLines = [`${yamlKey(providerKey)}: "${safeProvider}"`, `${yamlKey(idKey)}: "${safeId}"`];
    const frontmatterMatch = content.match(/^(\uFEFF?[ \t]*---[ \t]*\r?\n)([\s\S]*?)(\r?\n---[ \t]*(?:\r?\n|$))/);
    if (!frontmatterMatch) {
        return `---\n${sourceLines.join('\n')}\n---\n${content}`;
    }

    const bodyLines = frontmatterMatch[2].split(/\r?\n/);
    const replaceOrAppend = (key: string, line: string): void => {
        const index = bodyLines.findIndex((candidate) => readRootYamlKey(candidate) === key);
        if (index >= 0) bodyLines[index] = line;
        else bodyLines.push(line);
    };
    replaceOrAppend(providerKey, sourceLines[0]);
    replaceOrAppend(idKey, sourceLines[1]);

    return `${frontmatterMatch[1]}${bodyLines.join('\n')}${frontmatterMatch[3]}${content.slice(frontmatterMatch[0].length)}`;
}

export function sanitizeFileName(name: string): string {
    return name.replace(/[*\\/<>:|?"]/g, '').replace(/\s+/g, ' ').trim();
}

function escapeYaml(value: unknown): string {
    const text = toStringSafe(value);
    return text
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n')
        .replace(/\t/g, '\\t');
}

function toStringSafe(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value);
}
