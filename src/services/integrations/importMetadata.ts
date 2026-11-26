import type { MediaKind } from './types';
import { normalizeCountryMetadata } from '../media/statisticsCountries';
import { parseTemplateFieldAliases } from '../media/templateFieldAliases';
import { readRootYamlKey } from './templateSchema';

/** Retain populated credits/origins when an older template omits them or has empty literals. */
export function completeImportedMetadata(content: string, kind: MediaKind, values: Record<string, unknown>, template: string): string {
    const match = content.match(/^(\uFEFF?---\r?\n)([\s\S]*?)(\r?\n---)(?=\r?\n|$)/);
    if (!match) return content;
    const type = ({ games: 'game', anime: 'anime', movies: 'movie', series: 'series', books: 'book', manga: 'manga' } as const)[kind];
    const aliases = parseTemplateFieldAliases(type, template);
    const fields: Record<string, unknown> = { countries: normalizeCountryMetadata(values.countries) };
    if (kind === 'anime' && values.integrationSourceKind) {
        fields.type = 'anime';
        fields.integration_source_kind = values.integrationSourceKind;
        fields.format = values.format;
        fields.anime_parts = values.animeParts;
    }
    if (kind === 'games') fields.publishers = values.publishers;
    if (kind === 'books') fields.publisher = values.publisher;
    if (kind === 'movies' || kind === 'series') fields.director = values.directors ?? values.director;
    const lines = match[2].split(/\r?\n/), newline = match[1].includes('\r\n') ? '\r\n' : '\n';
    for (const [canonical, value] of Object.entries(fields)) {
        if (value == null || Array.isArray(value) && !value.length || typeof value === 'string' && !value.trim()) continue;
        const key = aliases[canonical] ?? canonical;
        const index = lines.findIndex(line => readRootYamlKey(line) === key);
        let end = index + 1;
        if (index >= 0) {
            while (end < lines.length && (/^\s+\S|^-\s/.test(lines[end]) || !lines[end].trim())) end++;
            const literal = lines[index].slice(lines[index].indexOf(':') + 1).replace(/\s+#.*$/, '').trim();
            if (!/^(?:null|~|"\s*"|'\s*'|\[\s*\]|\{\s*\})?$/i.test(literal) || lines.slice(index + 1, end).some(line => line.trim())) continue;
        }
        const line = (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? key : JSON.stringify(key)) + ': ' + JSON.stringify(value);
        if (index < 0) lines.push(line); else lines.splice(index, end - index, line);
    }
    return match[1] + lines.join(newline) + match[3] + content.slice(match[0].length);
}
