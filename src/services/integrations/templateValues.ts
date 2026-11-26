import { readRootYamlKey } from './templateSchema';

export const TEMPLATE_VALUE_PATTERN = /\{\{VALUE:([A-Za-z0-9_]+)(\|wikilink)?\}\}/g;
export const WIKILINK_YAML_PROPERTY = /^(\s*(?:"(?:[^"\\]|\\.)+"|'(?:[^']|'')+'|[^\s:#][^:]*?):[ \t]*)(["']?)\{\{VALUE:[A-Za-z0-9_]+\|wikilink\}\}\2([ \t]*(?:#.*)?)$/;
export const WIKILINK_YAML_LIST_ITEM = /^([ \t]*)-[ \t]+(["']?)\{\{VALUE:[A-Za-z0-9_]+\|wikilink\}\}\2([ \t]*(?:#.*)?)$/;

const WIKILINK = /^\[\[([^\r\n]+)\]\]$/;

export function wikilinkLabel(value: string): string {
    const link = WIKILINK.exec(value.trim());
    if (!link) return value;
    const [target, alias] = link[1].split('|', 2);
    return alias || target;
}

export function formatTemplateWikilinks(value: unknown, previous?: unknown, linkNewValues = true): unknown {
    const oldValues = Array.isArray(previous) ? previous : [previous];
    const links = new Map<string, string>();
    const labelKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, '-');
    for (const old of oldValues) {
        if (typeof old === 'string' && WIKILINK.test(old.trim())) {
            links.set(labelKey(wikilinkLabel(old)), old);
        }
    }
    if (!linkNewValues && !links.size) return value;
    const format = (item: unknown): unknown => {
        if (typeof item !== 'string') return item;
        const title = item.trim().replace(/\s*[\r\n]+\s*/g, ' ');
        if (!title || WIKILINK.test(title)) return item;
        return links.get(labelKey(title)) ?? (linkNewValues ? '[[' + title + ']]' : item);
    };
    return Array.isArray(value) ? value.map(format) : format(value);
}

/** Find whole properties whose link format also applies when their values are written directly. */
export function getWikilinkTemplateKeys(template: string): Set<string> {
    const keys = new Set<string>();
    if (!template.includes('|wikilink')) return keys;
    const yaml = template.match(/^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/)?.[1];
    if (!yaml) return keys;

    let listKey: string | null = null;
    for (const line of yaml.split(/\r?\n/)) {
        const key = readRootYamlKey(line);
        if (key) {
            if (WIKILINK_YAML_PROPERTY.test(line)) keys.add(key);
            listKey = /:[ \t]*(?:#.*)?$/.test(line) ? key : null;
        } else if (listKey && WIKILINK_YAML_LIST_ITEM.test(line)) {
            keys.add(listKey);
        }
    }
    return keys;
}
