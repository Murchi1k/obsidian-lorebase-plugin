import type { App } from 'obsidian';
import { normalizeDiscovery } from './discovery';

/** Suggestions come only from locally cached recommendation names. */
export function collectRecommenders(app?: App, current = ''): string[] {
    const names = new Map<string, string>();
    const add = (raw: string): void => {
        const name = raw.trim().replace(/\s+/g, ' ');
        const key = name.normalize('NFKC').toLocaleLowerCase();
        if (name && !names.has(key)) names.set(key, name);
    };
    add(current);
    const files = app?.vault.getMarkdownFiles?.() ?? app?.vault.getFiles?.() ?? [];
    for (const file of files) {
        const name = normalizeDiscovery(app?.metadataCache.getFileCache(file)?.frontmatter?.discovery_context)?.recommendedBy;
        if (name) add(name);
    }
    return [...names.values()].sort((a, b) => a.localeCompare(b));
}
