import type { TFolder } from 'obsidian';

export function filterFolders(folders: TFolder[], query: string): TFolder[] {
    const normalizedQuery = query.trim().toLowerCase();
    const sorted = [...folders]
        .filter((folder) => Boolean(folder.path))
        .sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: 'base' }));

    if (!normalizedQuery) {
        return sorted;
    }

    return sorted.filter((folder) => folder.path.toLowerCase().includes(normalizedQuery));
}
