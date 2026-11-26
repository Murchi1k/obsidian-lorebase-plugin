import type { App, TFile } from 'obsidian';
import type { MediaItem } from '../types';
import { MetadataService } from './MetadataService';
import { getNextReleaseStatus } from './media/releaseStatus';

export interface ReleaseStatusSource {
    folder: string;
    parse: (file: TFile) => MediaItem | null;
}

/** Reads current metadata, including titles outside the currently open library. */
export async function synchronizeReleaseStatuses(app: App, metadata: MetadataService, sources: ReleaseStatusSource[], now = new Date(), changedFiles?: readonly TFile[]): Promise<boolean> {
    let changed = false;
    const folders = sources.map(source => ({ ...source, folder: source.folder.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') }))
        .sort((a, b) => b.folder.length - a.folder.length);
    let processed = 0;
    for (const file of changedFiles ?? app.vault.getMarkdownFiles()) {
        if (++processed % 100 === 0) await new Promise<void>(resolve => window.setTimeout(resolve, 0));
        const matching = folders.filter(source => !source.folder || file.path.startsWith(`${source.folder}/`));
        for (const source of matching) {
            const cached = app.metadataCache.getFileCache(file)?.frontmatter;
            if (!cached) continue;
            const item = source.parse(file);
            if (!item) continue;
            // In shared folders the explicit type must win over the game parser's legacy fallback.
            const resolved = metadata.resolveFrontmatter(item.type, cached);
            if (resolved.type && String(resolved.type).toLowerCase() !== item.type) continue;
            const next = getNextReleaseStatus(item, now);
            if (next === item.status) break;
            const expected = { ...cached };
            const updates: Record<string, unknown> = { status: next };
            if (item.type === 'game') for (const key of ['played', 'playing', 'dropped', 'sandbox', 'wishlist']) updates[key] = null;
            try {
                await metadata.updateMetadata(file, updates, item.type, current => {
                    // A status/date edited while this scan was awaiting disk must win.
                    const keys = new Set([...Object.keys(expected), ...Object.keys(current)]);
                    keys.delete('position');
                    if ([...keys].some(key => JSON.stringify(expected[key]) !== JSON.stringify(current[key]))) return false;
                    changed = true;
                    return true;
                });
            } catch (error) {
                console.error(`Could not update release status: ${file.path}`, error);
            }
            break;
        }
    }
    return changed;
}
