import type { MediaKind } from './types';

const GAME_HLTB_TEMPLATE_FIELDS = ['main', 'main_plus_sides', 'perfectionist', 'completionist'];
const NUMERIC_HLTB_TEMPLATE_FIELDS = new Set(['main', 'main_plus_sides', 'perfectionist', 'completionist']);

export function getDefaultTemplateFields(kind: MediaKind): string[] {
  if (kind === 'games') {
    return [
      'type',
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
    'name',
    'image',
    'imageHorizontal',
    'plot',
    'tags',
    'year',
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
      'name',
      'poster',
      'posterHorizontal',
      'plot',
      'authors',
      'artists',
      'genres',
      'tags',
      'year',
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
  kind: MediaKind,
  fields: string[],
  options: { howLongToBeatEnabled?: boolean } = {}
): string[] {
  const allowed = new Set(getDefaultTemplateFields(kind));
  if (kind === 'games' && options.howLongToBeatEnabled) {
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
  const common: Record<string, string> = {
    type: 'type',
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
      title: 'name',
      image: 'image',
      image_b: 'imageHorizontal',
      tags: 'tags',
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
      title: 'name',
      poster: 'poster',
      poster_b: 'posterHorizontal',
      authors: 'authors',
      artists: 'artists',
      genres: 'genres',
      tags: 'tags',
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

export function buildSimpleTemplate(kind: MediaKind, fields: string[]): string {
  const set = new Set(fields);
  const lines: string[] = ['---'];

  if (kind === 'games') {
    if (set.has('type')) lines.push('type: "game"');
    if (set.has('name')) lines.push('name: "{{VALUE:name}}"');
    if (set.has('poster')) lines.push('poster: "{{VALUE:Poster}}"');
    if (set.has('posterHorizontal')) lines.push('poster_b: "{{VALUE:PosterHorizontal}}"');
    if (set.has('plot')) lines.push('plot: "{{VALUE:Plot}}"');
    if (set.has('gameSeries')) lines.push('gameSeries:');
    if (set.has('genres')) lines.push('genres: "{{VALUE:genres}}"');
    if (set.has('platforms')) lines.push('platforms: "{{VALUE:platforms}}"');
    if (set.has('year')) lines.push('year: {{VALUE:Year}}');
    if (set.has('released')) lines.push('released: "{{VALUE:released}}"');
    if (set.has('developers')) lines.push('developers: "{{VALUE:developers}}"');
    if (set.has('publishers')) lines.push('publishers: "{{VALUE:publishers}}"');
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
    if (set.has('image')) lines.push('image: "{{VALUE:image}}"');
    if (set.has('imageHorizontal')) lines.push('image_b: "{{VALUE:ImageHorizontal}}"');
    if (set.has('plot')) lines.push('plot: "{{VALUE:Plot}}"');
    if (set.has('tags')) lines.push('tags: "{{VALUE:tags}}"');
    if (set.has('year')) lines.push('year: {{VALUE:Year}}');
    if (set.has('studios')) lines.push('studios: "{{VALUE:studios}}"');
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
    if (set.has('genres')) lines.push('genres: "{{VALUE:genres}}"');
    if (set.has('year')) lines.push('year: {{VALUE:Year}}');
    if (kind === 'movies') {
      if (set.has('released')) lines.push('released: {{VALUE:released}}');
      if (set.has('runtime')) lines.push('runtime: {{VALUE:runtime}}');
      if (set.has('director')) lines.push('directors: "{{VALUE:directors}}"');
      if (set.has('actors')) lines.push('actors: "{{VALUE:actors}}"');
      if (set.has('movieParts')) {
        lines.push('active_part_id: "{{VALUE:activePartId}}"');
        lines.push('movie_parts:');
        lines.push('{{VALUE:videoPartsYaml}}');
      }
    } else {
      if (set.has('released')) lines.push('released: {{VALUE:released}}');
      if (set.has('runtime')) lines.push('runtime: {{VALUE:runtime}}');
      if (set.has('director')) lines.push('directors: "{{VALUE:directors}}"');
      if (set.has('actors')) lines.push('actors: "{{VALUE:actors}}"');
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
    if (set.has('name')) lines.push('title: "{{VALUE:name}}"');
    if (set.has('poster')) lines.push('poster: "{{VALUE:Poster}}"');
    if (set.has('posterHorizontal')) lines.push('poster_b: "{{VALUE:PosterHorizontal}}"');
    if (set.has('plot')) lines.push('plot: "{{VALUE:Plot}}"');
    if (set.has('authors')) lines.push('authors: "{{VALUE:authors}}"');
    if (kind === 'manga' && set.has('artists')) lines.push('artists: "{{VALUE:artists}}"');
    if (kind === 'books' && set.has('publisher')) lines.push('publisher: "{{VALUE:publisher}}"');
    if (set.has('genres')) lines.push('genres: "{{VALUE:genres}}"');
    if (set.has('tags')) lines.push('tags: "{{VALUE:tags}}"');
    if (set.has('year')) lines.push('year: {{VALUE:Year}}');
    if (kind === 'books') {
      if (set.has('released')) lines.push('released: {{VALUE:released}}');
      if (set.has('pageCurrent')) lines.push('page_current: {{VALUE:pageCurrent}}');
      if (set.has('pageTotal')) lines.push('page_total: {{VALUE:pageTotal}}');
      if (set.has('chapterCurrent')) lines.push('chapter_current: {{VALUE:chapterCurrent}}');
      if (set.has('chapterTotal')) lines.push('chapter_total: {{VALUE:chapterTotal}}');
    } else {
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

  const orderedLines = applySimpleTemplateFieldOrder(kind, fields, lines);
  orderedLines.push('---');
  return orderedLines.join('\n');
}


function applyFilters(value: unknown, filters: string[]): unknown {

  if (Array.isArray(value)) {
    return value.map((item) => applyFilters(item, filters));
  }

  let result = value;

  for (const filter of filters) {
    switch (filter) {
      case 'wikilink':
        if (typeof result === 'string') {
          result = `[[${result}]]`;
        }
        break;
    }
  }

  return result;
}


export function renderTemplate(template: string, values: Record<string, unknown>): string {
  const lines = template.split(/\r?\n/);
  const output: string[] = [];
  const placeholderRegex = /\{\{VALUE:([A-Za-z0-9_]+)\}\}/g;
  const filterRegex = /\{\{VALUE:([A-Za-z0-9_]+)((?:\|[A-Za-z0-9_]+)*)\}\}/;

  for (const line of lines) {

    const filterMatch = line.match(
      filterRegex
    );

    const filters = filterMatch?.[2]
      ? filterMatch[2].split('|').filter(Boolean)
      : [];

    const detectionLine = filterMatch
      ? line.replace(filterMatch[0], `{{VALUE:${filterMatch[1]}}}`)
      : line;

    const match = detectionLine.match(
      /{{VALUE:([A-Za-z0-9_]+)}}/
    );

    if (!match) {
      output.push(line);
      continue;
    }

    const key = match[1];
    const value = values[key];

    const filteredValue = applyFilters(value, filters);

    // Strings
    if (typeof value === 'string' && value.includes('\n') && detectionLine.trim() === `{{VALUE:${key}}}`) {
      output.push(String(filteredValue));
      continue;
    }

    // Numbers
    if (NUMERIC_HLTB_TEMPLATE_FIELDS.has(key) && typeof value === 'number' && Number.isFinite(value)) {
      const numericKeyMatch = detectionLine.match(
        /^(\s*[^:]+:\s*)"?\{\{VALUE:[A-Za-z0-9_]+\}\}"?\s*$/
      );
      if (numericKeyMatch) {
        output.push(`${numericKeyMatch[1]}${filteredValue}`);
        continue;
      }
    }

    // Dates
    if (key === 'released' && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const dateKeyMatch = detectionLine.match(
        /^(\s*[^:]+:\s*)"?\{\{VALUE:released\}\}"?\s*$/
      );
      if (dateKeyMatch) {
        output.push(`${dateKeyMatch[1]}${filteredValue}`);
        continue;
      }
    }

    // Arrays
    if (Array.isArray(value)) {
      // List
      const listItemMatch = detectionLine.match(/^(\s*)-\s*"?\{\{VALUE:[A-Za-z0-9_]+\}\}"?\s*$/);
      if (listItemMatch) {
        const indent = listItemMatch[1];
        if (!value.length) {
          output.push(`${indent}[]`);
          continue;
        }
        for (const item of value) {
          const filteredItem = applyFilters(item, filters)
          output.push(`${indent}- "${escapeYaml(filteredItem)}"`);
        }
        continue;
      }

      // Properties
      const keyMatch = detectionLine.match(/^(\s*)([^:]+):\s*"?\{\{VALUE:[A-Za-z0-9_]+\}\}"?\s*$/);
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
          const filteredItem = applyFilters(item, filters)
          output.push(`${childIndent}- "${escapeYaml(filteredItem)}"`);
        }
        continue;
      }
    }

    // Other
    const replaced = detectionLine.replace(placeholderRegex, (_: string, k: string) => {
      const raw = values[k];
      if (Array.isArray(raw)) {
        return raw.map((v) => escapeYaml(applyFilters(v, filters))).join(', ');
      }
      return escapeYaml(toStringSafe(applyFilters(raw, filters)));
    });
    output.push(replaced);
  }

  console.log(output)
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
  id: string
): string {
  const safeProvider = escapeYaml(provider.trim());
  const safeId = escapeYaml(id.trim());
  if (!safeProvider || !safeId) return content;

  const sourceLines = [
    `integration_provider: "${safeProvider}"`,
    `integration_id: "${safeId}"`,
  ];
  const frontmatterMatch = content.match(/^(\uFEFF?[ \t]*---[ \t]*\r?\n)([\s\S]*?)(\r?\n---[ \t]*(?:\r?\n|$))/);
  if (!frontmatterMatch) {
    return `---\n${sourceLines.join('\n')}\n---\n${content}`;
  }

  const bodyLines = frontmatterMatch[2].split(/\r?\n/);
  const replaceOrAppend = (key: string, line: string): void => {
    const index = bodyLines.findIndex((candidate) => new RegExp(`^\\s*${key}\\s*:`).test(candidate));
    if (index >= 0) bodyLines[index] = line;
    else bodyLines.push(line);
  };
  replaceOrAppend('integration_provider', sourceLines[0]);
  replaceOrAppend('integration_id', sourceLines[1]);

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
