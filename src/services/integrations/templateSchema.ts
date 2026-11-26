import type { MediaKind } from './types';

/** Fields that used to appear only after the first edit or sync. */
export interface DeferredTemplateField {
    key: string;
    yaml: string;
    initial: unknown;
    after: string;
}

export function getDeferredTemplateFields(kind: MediaKind): DeferredTemplateField[] {
    const fields: DeferredTemplateField[] = [
        { key: 'countries', yaml: 'countries', initial: [], after: 'year' },
        { key: 'priority', yaml: 'personal_priority', initial: 'normal', after: 'status' },
        { key: 'started', yaml: 'started', initial: null, after: 'status' },
        { key: 'finished', yaml: 'finished', initial: null, after: 'started' },
        { key: 'detailedRatings', yaml: 'detailed_ratings', initial: null, after: kind === 'games' ? 'userRating' : 'rating' },
        { key: 'relatedMedia', yaml: 'related_media', initial: [], after: 'favorite' },
    ];
    if (kind !== 'books') fields.push({ key: 'repeatCount', yaml: 'repeat_count', initial: 0, after: 'finished' });
    if (kind === 'anime' || kind === 'manga') fields.push({ key: 'anilistId', yaml: 'anilist_id', initial: null, after: 'integrationSource' });
    if (['games', 'movies', 'series'].includes(kind)) fields.push({ key: 'tags', yaml: 'tags', initial: [], after: 'genres' });
    if (kind === 'games') fields.push(
        { key: 'adult', yaml: 'Sex18', initial: false, after: 'workType' },
        { key: 'playedOn', yaml: 'played_on', initial: null, after: 'platforms' },
        { key: 'platformPlaythroughs', yaml: 'platform_playthroughs', initial: [], after: 'playedOn' },
        { key: 'dlc', yaml: 'dlc', initial: [], after: 'gameSeries' },
        { key: 'steamAppId', yaml: 'steamAppId', initial: null, after: 'integrationSource' },
        { key: 'playtime', yaml: 'playtime', initial: null, after: 'steamAppId' },
        { key: 'progressPercent', yaml: 'progress_percent', initial: null, after: 'playtime' },
        { key: 'achievementsUnlocked', yaml: 'achievements_unlocked', initial: null, after: 'progressPercent' },
        { key: 'achievementsTotal', yaml: 'achievements_total', initial: null, after: 'achievementsUnlocked' },
        { key: 'gameModes', yaml: 'game_modes', initial: [], after: 'achievementsTotal' },
    );
    if (kind === 'anime' || kind === 'series') fields.push(
        { key: 'posterMode', yaml: 'poster_mode', initial: 'active-part', after: kind === 'anime' ? 'imageHorizontal' : 'posterHorizontal' },
    );
    if (kind === 'anime') fields.push({ key: 'seasonTotal', yaml: 'season_total', initial: null, after: 'animeParts' });
    if (kind === 'series') fields.push(
        { key: 'seasonCurrent', yaml: 'season_current', initial: null, after: 'seasons' },
        { key: 'networks', yaml: 'networks', initial: [], after: 'actors' },
        { key: 'studios', yaml: 'studios', initial: [], after: 'networks' },
    );
    if (kind === 'movies') fields.push(
        { key: 'episodeCurrent', yaml: 'episode_current', initial: 0, after: 'movieParts' },
        { key: 'episodeTotal', yaml: 'episode_total', initial: null, after: 'episodeCurrent' },
    );
    return fields;
}

/** Insert new fields beside their semantic neighbours, preserving the user's order. */
export function includeDeferredTemplateFields(kind: MediaKind, selected: string[]): string[] {
    const result = [...selected];
    // Older simple video templates silently discarded this selectable field.
    if ((kind === 'movies' || kind === 'series') && !result.includes('workType')) {
        const typeIndex = result.indexOf('type');
        result.splice(typeIndex < 0 ? 0 : typeIndex + 1, 0, 'workType');
    }
    for (const field of getDeferredTemplateFields(kind)) {
        if (result.includes(field.key)) continue;
        const index = result.indexOf(field.after);
        result.splice(index < 0 ? result.length : index + 1, 0, field.key);
    }
    return result;
}

/** Only top-level YAML properties belong to the template's field order. */
export function getTemplateYamlKeys(template: string): string[] {
    const frontmatter = template.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!frontmatter) return [];
    return frontmatter[1].split(/\r?\n/).flatMap(line => {
        const key = readRootYamlKey(line);
        return key ? [key] : [];
    });
}

export function readRootYamlKey(line: string): string | null {
    if (/^(?:\s|[-?]\s|\{\{VALUE:)/.test(line)) return null;
    const match = line.match(/^(?:"((?:[^"\\]|\\.)+)"|'((?:[^']|'')+)'|([^\s:#][^:]*?))\s*:/);
    if (match?.[1]) {
        try { return JSON.parse('"' + match[1] + '"') as string; }
        catch { return match[1]; }
    }
    return match?.[2]?.replace(/''/g, "'") ?? match?.[3] ?? null;
}

const isInternalField = (key: string): boolean => /^lorebase_/i.test(key);

export interface TemplateWriteOptions { compact?: boolean; preserveEmpty?: readonly string[]; }

/** Zero and false are data, rather than missing values. Only inspect the root property. */
export function isEmptyTemplateValue(value: unknown): boolean {
    return value == null || (typeof value === 'string' && !value.trim())
        || (Array.isArray(value) && value.length === 0)
        || (typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).length === 0);
}

function isEmptyYamlBlock(lines: string[]): boolean {
    const scalar = lines[0].match(/^(?:"[^"]+"|'[^']+'|[^:]+):[ \t]*(.*)$/)?.[1] ?? '';
    const head = scalar.replace(/^#.*$|[ \t]+#.*$/, '').trim();
    if (/^[|>][+\-\d]*$/.test(head)) return lines.slice(1).every(line => !line.trim());
    const rest = lines.slice(1).filter(line => line.trim() && !/^\s*#/.test(line)).join('\n').trim();
    const value = head || rest;
    return /^(?:null|~|"[ \t]*"|'[ \t]*'|\[\s*\]|\{\s*\})?$/i.test(value);
}

/** Sort complete YAML blocks after all creation/enrichment steps, leaving the body intact. */
export function orderTemplateContent(content: string, template: string, options: TemplateWriteOptions = {}): string {
    const match = content.match(/^(\uFEFF?---[ \t]*\r?\n)([\s\S]*?)(\r?\n---[ \t]*)(?=\r?\n|$)/);
    if (!match) return content;
    const newline = match[1].includes('\r\n') ? '\r\n' : '\n';
    const prefix: string[] = [];
    const blocks: Array<{ key: string; index: number; lines: string[] }> = [];
    for (const line of match[2].split(/\r?\n/)) {
        const key = readRootYamlKey(line);
        if (key) blocks.push({ key, index: blocks.length, lines: [line] });
        else if (blocks.length) blocks[blocks.length - 1].lines.push(line);
        else prefix.push(line);
    }
    const order = new Map(getTemplateYamlKeys(template).map((key, index) => [key, index]));
    if (options.compact) {
        for (let index = 0; index < blocks.length; index++) {
            const block = blocks[index];
            if (!order.has(block.key) || isInternalField(block.key) || !isEmptyYamlBlock(block.lines)) continue;
            // Standalone comments may document the next property; retain them.
            prefix.push(...block.lines.filter(line => /^#/.test(line)));
            blocks.splice(index, 1);
            index--;
        }
    }
    const position = (key: string): number => isInternalField(key) ? Number.MAX_SAFE_INTEGER : order.get(key) ?? Number.MAX_SAFE_INTEGER - 1;
    blocks.sort((a, b) => position(a.key) - position(b.key) || a.index - b.index);
    return match[1] + [...prefix, ...blocks.flatMap(block => block.lines)].join(newline) + match[3] + content.slice(match[0].length);
}

/** Rebuild insertion order without changing values or removing custom properties. */
export function orderTemplateFrontmatter(frontmatter: Record<string, unknown>, keys: string[], defaults: Record<string, unknown> = {}, options: TemplateWriteOptions = {}): void {
    const ordered = new Map<string, unknown>();
    const managed = new Set(keys);
    // An explicit empty country list overrides legacy origin properties.
    const preserveEmpty = new Set(['countries', ...options.preserveEmpty ?? []]);
    for (const key of keys) {
        if (isInternalField(key)) continue;
        const value = Object.prototype.hasOwnProperty.call(frontmatter, key) ? frontmatter[key] : defaults[key] ?? null;
        if (!options.compact || !isEmptyTemplateValue(value) || preserveEmpty.has(key) && Object.prototype.hasOwnProperty.call(frontmatter, key)) ordered.set(key, value);
    }
    for (const key of Object.keys(frontmatter)) {
        if (ordered.has(key) || isInternalField(key)) continue;
        if (options.compact && managed.has(key) && !preserveEmpty.has(key) && isEmptyTemplateValue(frontmatter[key])) continue;
        ordered.set(key, frontmatter[key]);
    }
    for (const key of Object.keys(frontmatter)) if (isInternalField(key)) ordered.set(key, frontmatter[key]);
    for (const key of Object.keys(frontmatter)) delete frontmatter[key];
    for (const [key, value] of ordered) Object.defineProperty(frontmatter, key, { value, enumerable: true, writable: true, configurable: true });
}
