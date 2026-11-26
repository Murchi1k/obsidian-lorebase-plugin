import type { LorebaseSettings, NoteTemplateSettings } from '../../types';
import type { TemplateKind } from './types';
import { TEMPLATE_MEDIA_TYPES } from './templatePreferences';
import { buildSimpleTemplate, getDefaultTemplateFields, getSimpleWikilinkTokens } from './templateUtils';
import { TEMPLATE_VALUE_PATTERN } from './templateValues';

function templates(settings: LorebaseSettings): Array<[TemplateKind, NoteTemplateSettings]> {
    return (Object.keys(TEMPLATE_MEDIA_TYPES) as TemplateKind[]).flatMap(kind => {
        const config = kind === 'music' ? settings.music.noteTemplate : settings.integrations?.media[kind];
        return config ? [[kind, config] as [TemplateKind, NoteTemplateSettings]] : [];
    });
}

const supportedTokens = (kind: TemplateKind): Set<string> => {
    const fields = getSimpleWikilinkTokens(kind);
    return new Set([...Object.keys(fields), ...Object.values(fields)].map(token => token.toLowerCase()));
};

/** Change only supported value tokens; preserve aliases, literal values and custom Markdown. */
export function updateTemplateWikilinks(template: string, kind: TemplateKind, enabled: boolean): string {
    return updateTemplateWikilinkFields(template, kind, enabled ? Object.keys(getSimpleWikilinkTokens(kind)) : []);
}

function updateTemplateWikilinkFields(template: string, kind: TemplateKind, fields: readonly string[]): string {
    const definitions = getSimpleWikilinkTokens(kind), selected = new Set(fields);
    const tokens = new Map<string, boolean>();
    for (const [field, token] of Object.entries(definitions)) {
        tokens.set(field.toLowerCase(), selected.has(field));
        tokens.set(token.toLowerCase(), selected.has(field));
    }
    return template.replace(TEMPLATE_VALUE_PATTERN, (original: string, token: string) =>
        tokens.has(token.toLowerCase()) ? `{{VALUE:${token}${tokens.get(token.toLowerCase()) ? '|wikilink' : ''}}}` : original);
}

/** Keep individual choices in both the current template and its saved advanced version. */
export function setTemplateWikilinkFields(config: NoteTemplateSettings, kind: TemplateKind, fields: readonly string[]): void {
    const supported = getSimpleWikilinkTokens(kind);
    config.wikilinkFields = [...new Set(fields)].filter(field => Object.prototype.hasOwnProperty.call(supported, field));
    if (config.templateMode === 'advanced') {
        config.template = updateTemplateWikilinkFields(config.template, kind, config.wikilinkFields);
        config.advancedTemplate = config.template;
    } else {
        config.template = buildSimpleTemplate(kind, config.templateFields ?? getDefaultTemplateFields(kind), config.fieldAliases, config.wikilinkFields);
        if (config.advancedTemplate !== undefined) config.advancedTemplate = updateTemplateWikilinkFields(config.advancedTemplate, kind, config.wikilinkFields);
    }
}

export function getAllTemplateWikilinksState(settings: LorebaseSettings): 'on' | 'off' | 'mixed' {
    const values: boolean[] = [];
    for (const [kind, config] of templates(settings)) {
        const fields = Object.keys(getSimpleWikilinkTokens(kind));
        const configured = new Set(config.wikilinkFields ?? fields);
        if (config.templateMode !== 'advanced' || config.wikilinkFields !== undefined) {
            values.push(...fields.map(field => configured.has(field)));
        }
        if (config.templateMode === 'advanced') {
            const tokens = supportedTokens(kind);
            for (const match of config.template.matchAll(TEMPLATE_VALUE_PATTERN)) {
                if (tokens.has(match[1].toLowerCase())) values.push(Boolean(match[2]));
            }
        }
    }
    return values.length && values.every(Boolean) ? 'on' : values.some(Boolean) ? 'mixed' : 'off';
}

/** Apply to all media, including disabled templates and saved advanced layouts. */
export function setAllTemplateWikilinks(settings: LorebaseSettings, enabled: boolean): void {
    for (const [kind, config] of templates(settings)) {
        setTemplateWikilinkFields(config, kind, enabled ? Object.keys(getSimpleWikilinkTokens(kind)) : []);
    }
}
