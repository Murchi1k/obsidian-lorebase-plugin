import { TFile, TFolder } from 'obsidian';
import { normalizeObsidianTag } from '../../settings/settingsNormalization';
import { wikilinkLabel } from '../integrations/templateValues';

export function getAllMarkdownFiles(folder: TFolder): TFile[] {
    const files: TFile[] = [];
    collectMarkdownFiles(folder, files);
    return files;
}

export async function mapInFrameBatches<TInput, TOutput>(
    items: readonly TInput[],
    mapper: (item: TInput) => TOutput | null,
    batchSize?: number
): Promise<TOutput[]> {
    const output: TOutput[] = [];
    const maximumBatch = batchSize !== undefined && Number.isFinite(batchSize)
        ? Math.max(1, Math.trunc(batchSize)) : 512;
    let started = performance.now(), processed = 0;
    for (let index = 0; index < items.length; index++) {
        const mapped = mapper(items[index]);
        if (mapped !== null) output.push(mapped);
        processed++;
        // Spend at most a small part of a frame parsing, rather than pausing after every 12 notes.
        if (index + 1 < items.length && (processed >= maximumBatch || performance.now() - started >= 4)) {
            await yieldToNextFrame();
            started = performance.now();
            processed = 0;
        }
    }

    return output;
}

function yieldToNextFrame(): Promise<void> {
    return new Promise((resolve) => {
        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
            let frame: number | undefined;
            const finish = (): void => {
                clearTimeout(timer);
                if (frame !== undefined) window.cancelAnimationFrame(frame);
                resolve();
            };
            // Chromium suspends animation frames in hidden windows; loading must still finish there.
            const timer = setTimeout(finish, 32);
            frame = window.requestAnimationFrame(finish);
            return;
        }
        setTimeout(resolve, 0);
    });
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
    return normalizeObsidianTag(tag);
}

function addTagsFromValue(tagSet: Set<string>, value: unknown, readLabel?: (value: string) => string): void {
    if (!value) return;

    const addTag = (raw: string): void => {
        const normalized = normalizeTag(readLabel ? readLabel(raw) : raw);
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
        const value = metadata[key];
        const entries = typeof value === 'string' && wikilinkLabel(value) !== value ? [value] : value;
        addTagsFromValue(tagSet, entries, wikilinkLabel);
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
