import { STATUS_ICON_MAP } from './constants';
import type { CustomMediaStatus, LorebaseSettings, MediaStatus, MediaType } from './types';

let activeSettings: Pick<LorebaseSettings, 'statusCustomization' | 'statusLabels'> | undefined;
export const statusSettingsKey = (media: MediaType) => ({ game: 'games', anime: 'anime', movie: 'movies', series: 'series', book: 'books', manga: 'manga', music: 'music' } as const)[media];
export function configureStatusPresentation(settings: Pick<LorebaseSettings, 'statusCustomization' | 'statusLabels'>): void {
    activeSettings = settings;
}
export function isCustomStatus(value: unknown): value is CustomMediaStatus {
    return typeof value === 'string' && /^custom_[a-z0-9_-]+$/.test(value);
}
export function getCustomStatuses(media: MediaType): Array<{ status: MediaStatus; label: string }> {
    return Object.entries(activeSettings?.statusCustomization?.[media] ?? {})
        .filter(([id]) => isCustomStatus(id))
        .map(([id, appearance]) => ({ status: id as MediaStatus, label: appearance.label?.trim() || id }));
}
export function countCustomStatus(stats: { customStatusCounts?: Record<string, number> }, status: MediaStatus): void {
    if (!isCustomStatus(status)) return;
    const counts = stats.customStatusCounts ??= {};
    counts[status] = (counts[status] || 0) + 1;
}
export function normalizeStatusCustomization(value: unknown): NonNullable<LorebaseSettings['statusCustomization']> {
    const result: NonNullable<LorebaseSettings['statusCustomization']> = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
    for (const media of ['game', 'anime', 'movie', 'series', 'book', 'manga', 'music'] as const) {
        const entries = (value as Record<string, unknown>)[media];
        if (!entries || typeof entries !== 'object' || Array.isArray(entries)) continue;
        const target: Record<string, { label?: string; icon?: string; color?: string }> = {};
        for (const [id, raw] of Object.entries(entries)) {
            if ((!isCustomStatus(id) && !Object.prototype.hasOwnProperty.call(STATUS_ICON_MAP, id)) || !raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
            const entry = raw as Record<string, unknown>;
            const clean: { label?: string; icon?: string; color?: string } = {};
            if (typeof entry.label === 'string' && entry.label.trim()) clean.label = entry.label.trim().slice(0, 200);
            if (typeof entry.icon === 'string' && /^[a-z0-9-]+$/.test(entry.icon)) clean.icon = entry.icon;
            if (typeof entry.color === 'string' && /^#[a-f0-9]{6}$/i.test(entry.color)) clean.color = entry.color;
            target[id] = clean;
        }
        result[media] = target;
    }
    return result;
}
export function getStatusAppearance(media: MediaType, status: MediaStatus): { icon: string; color: string; label?: string } {
    const custom = activeSettings?.statusCustomization?.[media]?.[status];
    const defaults: Record<string, string> = { completed: '#3fffb2', playing: '#00c4ff', watching: '#00c4ff', listening: '#59b5ff',
        dropped: '#ff8c40', sandbox: '#ffeb3b', wishlist: '#b08cff', paused: '#ffeb3b', to_be_released: '#d99cff', on_repeat: '#ba8cff' };
    const color = custom?.color && /^#[0-9a-f]{6}$/i.test(custom.color) ? custom.color : defaults[status] || '#e7e7e7';
    const labels = activeSettings?.statusLabels?.[statusSettingsKey(media)] as Partial<Record<MediaStatus, string>> | undefined;
    const label = custom?.label?.trim() || labels?.[status]?.trim();
    return { icon: custom?.icon || STATUS_ICON_MAP[status] || 'circle', color, label };
}
