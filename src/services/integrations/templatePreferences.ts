import type { IntegrationTemplateSettings, MediaType, NoteTemplateSettings } from '../../types';
import { parseTemplateFieldAliases } from '../media/templateFieldAliases';
import { buildSimpleTemplate, getDefaultTemplateFields, getSimpleWikilinkTokens } from './templateUtils';
import { getWikilinkTemplateKeys } from './templateValues';
import type { MediaKind, TemplateKind } from './types';
import { readRootYamlKey } from './templateSchema';

export const TEMPLATE_MEDIA_TYPES: Record<TemplateKind, MediaType> = {
    games: 'game', anime: 'anime', movies: 'movie', series: 'series', books: 'book', manga: 'manga', music: 'music',
};

export function rememberAdvancedTemplate(kind: TemplateKind, settings: NoteTemplateSettings): void {
    const aliases = parseTemplateFieldAliases(TEMPLATE_MEDIA_TYPES[kind], settings.template);
    const previous = settings.fieldAliases ?? parseTemplateFieldAliases(TEMPLATE_MEDIA_TYPES[kind], settings.advancedTemplate ?? '');
    for (const [canonical, oldKey] of Object.entries(previous)) {
        if (oldKey === canonical || oldKey === aliases[canonical] || Object.values(aliases).includes(oldKey)) continue;
        settings.previousFieldAliases ??= {};
        settings.previousFieldAliases[canonical] = [...new Set([oldKey, ...(settings.previousFieldAliases[canonical] ?? [])])];
    }
    settings.advancedTemplate = settings.template;
    settings.fieldAliases = aliases;
}

export function switchTemplateMode(kind: TemplateKind, settings: NoteTemplateSettings, mode: 'simple' | 'advanced'): void {
    if (settings.templateMode === 'advanced') {
        rememberAdvancedTemplate(kind, settings);
        if (mode === 'simple' && settings.wikilinkFields === undefined) {
            const linkedKeys = getWikilinkTemplateKeys(settings.template);
            settings.wikilinkFields = Object.entries(getSimpleWikilinkTokens(kind))
                .filter(([, token]) => linkedKeys.has(settings.fieldAliases?.[token] ?? token))
                .map(([field]) => field);
        }
    }
    settings.templateMode = mode;
    settings.template = mode === 'advanced'
        ? settings.advancedTemplate || buildDefaultAdvancedTemplate(kind, settings.fieldAliases, undefined, settings.wikilinkFields)
        : buildSimpleTemplate(kind, settings.templateFields ?? getDefaultTemplateFields(kind), settings.fieldAliases, settings.wikilinkFields);
}

export function buildDefaultAdvancedTemplate(
    kind: TemplateKind,
    aliases: Record<string, string> = {},
    fields = getDefaultTemplateFields(kind),
    wikilinkFields?: readonly string[],
): string {
    const lines = buildSimpleTemplate(kind, fields, aliases, wikilinkFields).split('\n');
    const yaml = lines.slice(1, -1).map(line => {
        const key = readRootYamlKey(line);
        if (key === (aliases.type ?? 'type') && /: "(?:game|anime|movie|series|book|manga)"$/.test(line)) {
            return line.replace(/: "[^"]+"$/, ': "{{VALUE:type}}"');
        }
        if (key === (aliases.favorite ?? 'favorite') && line.endsWith(': false')) {
            return line.replace(/: false$/, ': {{VALUE:favorite}}');
        }
        if (kind === 'games' && key === (aliases.gameSeries ?? 'gameSeries') && line.endsWith(':')) {
            return line + ' "{{VALUE:gameSeries}}"';
        }
        return line;
    });
    return ['---', ...yaml, '---', '', '## My Notes', ''].join('\n');
}

function blocks(yaml: string): Array<{ key: string; lines: string[] }> {
    const result: Array<{ key: string; lines: string[] }> = [];
    for (const line of yaml.split(/\r?\n/)) {
        const key = readRootYamlKey(line);
        if (key) result.push({ key, lines: [line] });
        else result[result.length - 1]?.lines.push(line);
    }
    return result;
}

/** Add missing fields to an older advanced template without replacing names, values or the body. */
export function completeAdvancedTemplate(kind: TemplateKind, template: string): string {
    const match = template.match(/^(\uFEFF?---\r?\n)([\s\S]*?)(\r?\n---)(?=\r?\n|$)/);
    if (!match) return template; // A body-only template is an intentional custom layout.
    const aliases = parseTemplateFieldAliases(TEMPLATE_MEDIA_TYPES[kind], template);
    const defaults = buildDefaultAdvancedTemplate(kind, aliases).split('\n---', 1)[0].slice(4);
    const expected = blocks(defaults);
    const lines = match[2].split(/\r?\n/);
    const findKey = (key: string): number => lines.findIndex(line => readRootYamlKey(line) === key);
    expected.forEach((block, index) => {
        if (findKey(block.key) >= 0) return;
        const next = expected.slice(index + 1).map(candidate => findKey(candidate.key)).find(position => position >= 0);
        lines.splice(next ?? lines.length, 0, ...block.lines);
    });
    return match[1] + lines.join(match[1].includes('\r\n') ? '\r\n' : '\n') + match[3] + template.slice(match[0].length);
}

/** One-time normalization requested for the complete media templates. */
export function enableCompleteTemplate(kind: MediaKind, settings: IntegrationTemplateSettings): void {
    settings.templateEnabled = true;
    settings.templateFields = getDefaultTemplateFields(kind);
    if (settings.templateMode === 'advanced') {
        settings.template = completeAdvancedTemplate(kind, settings.template);
        rememberAdvancedTemplate(kind, settings);
    } else {
        settings.template = buildSimpleTemplate(kind, settings.templateFields, settings.fieldAliases, settings.wikilinkFields);
    }
}

/** Enable the new game fields once without resetting other field selections or custom layouts. */
export function enableGameTrackingTemplateFields(settings: IntegrationTemplateSettings): void {
    const added = ['progressPercent', 'achievementsUnlocked', 'achievementsTotal', 'gameModes'];
    const selected = [...(settings.templateFields ?? getDefaultTemplateFields('games'))];
    let previous = 'playtime';
    for (const field of added) {
        if (!selected.includes(field)) {
            const index = selected.indexOf(previous);
            selected.splice(index < 0 ? selected.length : index + 1, 0, field);
        }
        previous = field;
    }
    settings.templateFields = selected;
    const complete = (template: string): string => {
        const match = template.match(/^(\uFEFF?---\r?\n)([\s\S]*?)(\r?\n---)(?=\r?\n|$)/);
        if (!match) return template;
        const aliases = parseTemplateFieldAliases('game', template);
        const existing = new Set(blocks(match[2]).map(block => block.key));
        const missing = blocks(buildSimpleTemplate('games', added, aliases).split('\n').slice(1, -1).join('\n'))
            .filter(block => !existing.has(block.key)).flatMap(block => block.lines);
        if (!missing.length) return template;
        const newline = match[1].includes('\r\n') ? '\r\n' : '\n';
        return match[1] + match[2] + newline + missing.join(newline) + match[3] + template.slice(match[0].length);
    };
    if (settings.advancedTemplate) settings.advancedTemplate = complete(settings.advancedTemplate);
    if (settings.templateMode === 'advanced') {
        settings.template = complete(settings.template);
        rememberAdvancedTemplate('games', settings);
    } else settings.template = buildSimpleTemplate('games', selected, settings.fieldAliases, settings.wikilinkFields);
}

/** Add origin metadata once while retaining custom field names, order and note bodies. */
export function enableCountriesTemplateField(kind: MediaKind, settings: IntegrationTemplateSettings): void {
    const selected=[...(settings.templateFields ?? getDefaultTemplateFields(kind))];if(!selected.includes('countries'))selected.splice(Math.max(0,selected.indexOf('year')+1),0,'countries');settings.templateFields=selected;
    const complete=(template:string):string=>{const match=template.match(/^(\uFEFF?---\r?\n)([\s\S]*?)(\r?\n---)(?=\r?\n|$)/);if(!match)return template;const aliases=parseTemplateFieldAliases(TEMPLATE_MEDIA_TYPES[kind],template),key=aliases.countries ?? 'countries';
        if(blocks(match[2]).some(block=>block.key===key))return template;
        const line=buildSimpleTemplate(kind,['countries'],aliases).split('\n').find(line=>line.includes('{{VALUE:countries}}'));if(!line)return template;return match[1]+match[2]+(match[1].includes('\r\n')?'\r\n':'\n')+line+match[3]+template.slice(match[0].length);};
    if(settings.advancedTemplate)settings.advancedTemplate=complete(settings.advancedTemplate);
    if(settings.templateMode==='advanced'){settings.template=complete(settings.template);rememberAdvancedTemplate(kind,settings);}else settings.template=buildSimpleTemplate(kind,selected,settings.fieldAliases,settings.wikilinkFields);
}
