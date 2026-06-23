import type { TFolder } from 'obsidian';

/**
 * Sort folders by path, and (when a query is given) keep only those whose path
 * contains the query, case-insensitively. Pure helper — no Obsidian runtime deps.
 */
export function filterFolders(folders: TFolder[], query: string): TFolder[] {
    const sorted = [...folders].sort((a, b) => a.path.localeCompare(b.path));
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
        return sorted;
    }
    return sorted.filter((folder) => folder.path.toLowerCase().includes(trimmed));
}
