import type { ReadingItem } from '../../types';

export type ReadingCycleUpdates = Partial<ReadingItem> & Record<string, unknown>;
export interface ReadingCycleChange { item: ReadingItem; updates: ReadingCycleUpdates }

export function parseReadingCycle(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((entry): entry is string => typeof entry === 'string').map(entry => {
        const path = entry.trim().replace(/^\[\[|\]\]$/g, '').split('|')[0].split('#')[0].replace(/\\/g, '/');
        if (!path || path.split('/').includes('..')) return '';
        return /\.md$/i.test(path) ? path : path + '.md';
    }).filter(Boolean))];
}

export function serializeReadingCycle(paths: readonly string[]): string[] {
    return parseReadingCycle([...paths]).map(path => '[[' + path.replace(/\.md$/i, '') + ']]');
}

/** Resolve both outgoing and incoming links so an interrupted group save remains usable. */
export function getReadingCycle(items: readonly ReadingItem[], current: ReadingItem): ReadingItem[] {
    const candidates = items.filter(item => item.type === current.type);
    const byPath = new Map(candidates.map(item => [item.filePath, item]));
    byPath.set(current.filePath, current);
    const paths = new Set((current.readingCycle ?? []).filter(path => byPath.has(path)));
    paths.add(current.filePath);
    let changed = true;
    while (changed) {
        changed = false;
        for (const item of byPath.values()) {
            if (!paths.has(item.filePath) && !item.readingCycle?.some(path => paths.has(path))) continue;
            for (const path of [item.filePath, ...(item.readingCycle ?? [])]) {
                if (byPath.has(path) && !paths.has(path)) { paths.add(path); changed = true; }
            }
        }
    }
    return [...paths].map(path => byPath.get(path)!);
}

/** Each note stores the same ordered list; removing one note leaves its progress intact. */
export function planReadingCycleSave(
    initial: readonly ReadingItem[], members: readonly ReadingItem[], drafts: ReadonlyMap<string, ReadingCycleUpdates>,
): ReadingCycleChange[] {
    const paths = members.length > 1 ? members.map(item => item.filePath) : [];
    const included = new Set(paths);
    const affected = new Map([...initial, ...members].map(item => [item.filePath, item]));
    return [...affected.values()].flatMap(item => {
        const remaining = (item.readingCycle ?? []).filter(path => !included.has(path));
        const readingCycle = included.has(item.filePath) ? paths : remaining.length > 1 ? remaining : [];
        const draft = drafts.get(item.filePath) ?? {};
        if (JSON.stringify(item.readingCycle ?? []) === JSON.stringify(readingCycle) && !Object.keys(draft).length) return [];
        return [{ item, updates: { ...draft, readingCycle } }];
    });
}
