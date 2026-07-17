import { TFile, TFolder } from 'obsidian';

export function getAllMarkdownFiles(folder: TFolder): TFile[] {
    const files: TFile[] = [];
    collectMarkdownFiles(folder, files);
    return files;
}

function collectMarkdownFiles(folder: TFolder, files: TFile[]): void {
    for (const child of folder.children) {
        if (child instanceof TFile && child.extension === 'md') {
            files.push(child);
        } else if (child instanceof TFolder) {
            collectMarkdownFiles(child, files);
        }
    }
}

export function isTruthy(value: unknown): boolean {
    if (value === true) return true;
    if (typeof value === 'string') {
        const v = value.toLowerCase();
        return v === 'true' || v === '1' || v === 'yes' || v === 'on';
    }
    if (typeof value === 'number') return value === 1;
    return false;
}

function normalizeTag(tag: string): string {
    return tag.trim().replace(/^#/, '').toLowerCase();
}

function addTagsFromValue(tagSet: Set<string>, value: unknown): void {
    if (!value) return;

    const addTag = (raw: string): void => {
        const normalized = normalizeTag(raw);
        if (normalized) tagSet.add(normalized);
    };

    if (Array.isArray(value)) {
        for (const entry of value) {
            if (typeof entry === 'string') addTag(entry);
        }
        return;
    }

    if (typeof value === 'string') {
        for (const group of value.split(/[,;\n]+/)) {
            for (const part of group.split(/\s+/)) {
                const trimmed = part.trim();
                if (trimmed) addTag(trimmed);
            }
        }
    }
}

export function normalizeCacheTags(value: unknown): Array<{ tag: string }> | undefined {
    if (!Array.isArray(value)) return undefined;
    const tags: Array<{ tag: string }> = [];
    for (const entry of value) {
        if (isCacheTagEntry(entry) && typeof entry.tag === 'string') {
            tags.push({ tag: entry.tag });
        }
    }
    return tags.length ? tags : undefined;
}

function isCacheTagEntry(value: unknown): value is { tag?: unknown } {
    return typeof value === 'object' && value !== null && 'tag' in value;
}

export function collectTags(metadata: Record<string, unknown>, cacheTags?: Array<{ tag: string }>): string[] {
    const tagSet = new Set<string>();
    addTagsFromValue(tagSet, metadata.tags);

    if (cacheTags) {
        for (const tag of cacheTags) {
            if (tag?.tag) addTagsFromValue(tagSet, tag.tag);
        }
    }

    return Array.from(tagSet.values());
}

export function collectFieldTags(metadata: Record<string, unknown>, keys: string[]): string[] {
    const tagSet = new Set<string>();
    for (const key of keys) {
        addTagsFromValue(tagSet, metadata[key]);
    }
    return Array.from(tagSet.values());
}

function getNameSortGroup(name: string): number {
    const trimmed = name.trim();
    if (!trimmed) return 3;
    const firstChar = trimmed[0];
    if (firstChar >= '0' && firstChar <= '9') return 0;
    if (/[a-z]/i.test(firstChar)) return 1;
    if (/[\u0430-\u044f\u0451]/i.test(firstChar)) return 2;
    return 3;
}

export function compareNames(aName: string, bName: string): number {
    const a = String(aName || '').toLowerCase();
    const b = String(bName || '').toLowerCase();
    const aGroup = getNameSortGroup(a);
    const bGroup = getNameSortGroup(b);
    if (aGroup !== bGroup) return aGroup - bGroup;

    const locale = aGroup === 2 ? 'ru' : 'en';
    return a.localeCompare(b, locale, { numeric: true, sensitivity: 'base' });
}

export function hasAllValues(values: string[] | undefined, required: readonly string[]): boolean {
    if (!values || values.length < required.length) return false;
    if (required.length === 0) return true;

    const valueSet = new Set(values);
    for (const value of required) {
        if (!valueSet.has(value)) return false;
    }
    return true;
}
