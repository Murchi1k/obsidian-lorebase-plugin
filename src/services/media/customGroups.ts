import type { CustomMediaGroup } from '../../types';

export const CUSTOM_GROUP_ICONS = ['folder', 'sparkles', 'star', 'heart', 'gamepad-2', 'music', 'clapperboard', 'book-open', 'tv', 'headphones', 'moon', 'coffee', 'trophy', 'layers', 'bookmark', 'compass', 'flame', 'leaf', 'palette', 'camera', 'disc-3', 'ghost', 'rocket', 'swords', 'gem', 'mountain', 'flower-2', 'sun', 'cloud-moon', 'archive', 'film', 'notebook-pen'] as const;
export const CUSTOM_GROUP_COLORS = ['#9d95bd', '#b892a3', '#b39380', '#ada174', '#91a18c', '#83a5a0', '#829db5', '#a399ad', '#b39aeb', '#dc8fb4', '#d79b78', '#d4bc75', '#9bc184', '#6db3a7', '#7fa5d7', '#b1b1bf'] as const;
export const CUSTOM_GROUP_ICON_MAX_BYTES = 256 * 1024;
const ICON_DATA_MAX_LENGTH = Math.ceil(CUSTOM_GROUP_ICON_MAX_BYTES / 3) * 4 + 100;

export function isCustomGroupImageIcon(value: string): boolean {
    return value.length <= ICON_DATA_MAX_LENGTH && /^data:image\/(?:png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}

/** Keep registered Obsidian icon IDs and embedded images through a settings reload. */
export function normalizeCustomGroupIcon(value: unknown): string {
    if (typeof value !== 'string') return 'folder';
    return /^[a-zA-Z][a-zA-Z0-9:_-]{0,99}$/.test(value) || isCustomGroupImageIcon(value) ? value : 'folder';
}
export type CustomGroupDetails = Required<Pick<CustomMediaGroup, 'name' | 'description' | 'icon' | 'color' | 'pinned'>>;

export function normalizeGroupDetails(value: Partial<CustomMediaGroup>): CustomGroupDetails {
    return {
        name: typeof value.name === 'string' ? value.name.trim() : '',
        description: typeof value.description === 'string' ? value.description.trim() : '',
        icon: normalizeCustomGroupIcon(value.icon),
        color: typeof value.color === 'string' && /^#[\da-f]{6}$/i.test(value.color) ? value.color.toLowerCase() : CUSTOM_GROUP_COLORS[0],
        pinned: value.pinned === true,
    };
}

/** Pinned groups come first; the existing order is stable within each section. */
export function sortedCustomGroups(groups: readonly CustomMediaGroup[]): CustomMediaGroup[] {
    return groups.map((group, index) => ({ group, index }))
        .sort((a, b) => Number(b.group.pinned === true) - Number(a.group.pinned === true) || a.index - b.index)
        .map(entry => entry.group);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeCustomGroups(value: unknown): CustomMediaGroup[] {
    if (!Array.isArray(value)) return [];
    const usedIds = new Set<string>();
    const groups: CustomMediaGroup[] = [];
    for (const entry of value) {
        if (!isRecord(entry)) continue;
        const id = typeof entry.id === 'string' ? entry.id.trim() : '';
        const name = typeof entry.name === 'string' ? entry.name.trim() : '';
        if (!id || !name || usedIds.has(id)) continue;
        usedIds.add(id);
        const paths = Array.isArray(entry.itemPaths)
            ? entry.itemPaths.filter((path): path is string => typeof path === 'string' && path.trim().length > 0)
            : [];
        const createdAt = Number(entry.createdAt);
        const updatedAt = Number(entry.updatedAt);
        const fallbackTime = Number.isFinite(createdAt) ? createdAt : Date.now();
        groups.push({
            ...normalizeGroupDetails(entry),
            id,
            name,
            itemPaths: [...new Set(paths.map((path) => path.trim()))],
            createdAt: fallbackTime,
            updatedAt: Number.isFinite(updatedAt) ? updatedAt : fallbackTime,
        });
    }
    return groups;
}

export function createCustomGroup(name: string, now = Date.now()): CustomMediaGroup {
    return {
        ...normalizeGroupDetails({ name }),
        id: `group-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        name: name.trim(),
        itemPaths: [],
        createdAt: now,
        updatedAt: now,
    };
}

export function setGroupMembership(group: CustomMediaGroup, filePath: string, included: boolean, now = Date.now()): CustomMediaGroup {
    const paths = new Set(group.itemPaths);
    if (included) paths.add(filePath);
    else paths.delete(filePath);
    return { ...group, itemPaths: [...paths], updatedAt: now };
}
