import type { MediaKind } from './types';

export function getDefaultTemplateFields(kind: MediaKind): string[] {
    if (kind === 'games') {
        return [
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
            'rating',
            'userRating',
            'status',
            'favorite',
            'url',
        ];
    }

    return [
        'image',
        'imageHorizontal',
        'plot',
        'scoreImdb',
        'tags',
        'year',
        'studios',
        'format',
        'animeParts',
        'rating',
        'status',
        'favorite',
        'integrationSource',
        'url',
    ];
}

export function buildSimpleTemplate(kind: MediaKind, fields: string[]): string {
    const set = new Set(fields);
    const lines: string[] = ['---'];

    if (kind === 'games') {
        if (set.has('poster')) lines.push('poster: "{{VALUE:Poster}}"');
        if (set.has('posterHorizontal')) lines.push('poster_b: "{{VALUE:PosterHorizontal}}"');
        if (set.has('plot')) lines.push('plot: "{{VALUE:Plot}}"');
        if (set.has('gameSeries')) lines.push('gameSeries:');
        if (set.has('genres')) lines.push('genres: "{{VALUE:genres}}"');
        if (set.has('platforms')) lines.push('platforms: "{{VALUE:platforms}}"');
        if (set.has('year')) lines.push('year: "{{VALUE:Year}}"');
        if (set.has('released')) lines.push('released: "{{VALUE:released}}"');
        if (set.has('developers')) lines.push('developers: "{{VALUE:developers}}"');
        if (set.has('publishers')) lines.push('publishers: "{{VALUE:publishers}}"');
        if (set.has('rating')) lines.push('rating: "{{VALUE:rating}}"');
        if (set.has('userRating')) lines.push('userRating:');
        if (set.has('status')) lines.push('status: "{{VALUE:status}}"');
        if (set.has('favorite')) lines.push('favorite: false');
        if (set.has('url')) lines.push('url: "{{VALUE:url}}"');
        if (set.has('main')) lines.push('main: "{{VALUE:main}}"');
        if (set.has('main_plus_sides')) lines.push('main_plus_sides: "{{VALUE:main_plus_sides}}"');
        if (set.has('perfectionist') || set.has('completionist')) {
            lines.push('perfectionist: "{{VALUE:perfectionist}}"');
        }
    } else {
        if (set.has('image')) lines.push('image: "{{VALUE:image}}"');
        if (set.has('imageHorizontal')) lines.push('image_b: "{{VALUE:ImageHorizontal}}"');
        if (set.has('plot')) lines.push('plot: "{{VALUE:Plot}}"');
        if (set.has('scoreImdb')) lines.push('scoreImdb: "{{VALUE:imdbRating}}"');
        if (set.has('tags')) lines.push('tags: "{{VALUE:tags}}"');
        if (set.has('year')) lines.push('year: "{{VALUE:Year}}"');
        if (set.has('studios')) lines.push('studios: "{{VALUE:studios}}"');
        if (set.has('format')) lines.push('format: "{{VALUE:format}}"');
        if (set.has('animeParts')) {
            lines.push('season_current: "{{VALUE:seasonCurrent}}"');
            lines.push('episode_current: "{{VALUE:episodeCurrent}}"');
            lines.push('episode_total: "{{VALUE:episodeTotal}}"');
            lines.push('active_part_id: "{{VALUE:activePartId}}"');
            lines.push('anime_parts:');
            lines.push('{{VALUE:animePartsYaml}}');
        }
        if (set.has('rating')) lines.push('rating:');
        if (set.has('status')) lines.push('status: "{{VALUE:status}}"');
        if (set.has('favorite')) lines.push('favorite: false');
        if (set.has('integrationSource')) {
            lines.push('integration_provider: "{{VALUE:integrationProvider}}"');
            lines.push('integration_id: "{{VALUE:integrationId}}"');
        }
        if (set.has('url')) lines.push('url: "{{VALUE:url}}"');
    }

    lines.push('---');
    return lines.join('\n');
}

export function renderTemplate(template: string, values: Record<string, unknown>): string {
    const lines = template.split(/\r?\n/);
    const output: string[] = [];
    const placeholderRegex = /\{\{VALUE:([A-Za-z0-9_]+)\}\}/g;

    for (const line of lines) {
        const match = line.match(/\{\{VALUE:([A-Za-z0-9_]+)\}\}/);
        if (!match) {
            output.push(line);
            continue;
        }

        const key = match[1];
        const value = values[key];
        if (typeof value === 'string' && value.includes('\n') && line.trim() === `{{VALUE:${key}}}`) {
            output.push(value);
            continue;
        }

        if (Array.isArray(value)) {
            const listItemMatch = line.match(/^(\s*)-\s*"?\{\{VALUE:[A-Za-z0-9_]+\}\}"?\s*$/);
            if (listItemMatch) {
                const indent = listItemMatch[1];
                for (const item of value) {
                    output.push(`${indent}- "${escapeYaml(item)}"`);
                }
                continue;
            }

            const keyMatch = line.match(/^(\s*)([^:]+):\s*"?\{\{VALUE:[A-Za-z0-9_]+\}\}"?\s*$/);
            if (keyMatch) {
                const indent = keyMatch[1];
                const keyName = keyMatch[2].trim();
                output.push(`${indent}${keyName}:`);
                const childIndent = `${indent}  `;
                for (const item of value) {
                    output.push(`${childIndent}- "${escapeYaml(item)}"`);
                }
                continue;
            }
        }

        const replaced = line.replace(placeholderRegex, (_: string, k: string) => {
            const raw = values[k];
            if (Array.isArray(raw)) {
                return raw.map((v) => escapeYaml(v)).join(', ');
            }
            return escapeYaml(toStringSafe(raw));
        });
        output.push(replaced);
    }

    return output.join('\n');
}

export function sanitizeFileName(name: string): string {
    return name.replace(/[*\\\/<>:\|\?"]/g, '').replace(/\s+/g, ' ').trim();
}

function escapeYaml(value: unknown): string {
    const text = toStringSafe(value);
    return text.replace(/"/g, '\\"');
}

function toStringSafe(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value);
}
