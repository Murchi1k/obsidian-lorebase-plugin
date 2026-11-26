import type { FilterableMediaItem } from './libraryViewState';
import { getWatchProgress } from './watchProgress';

export function normalizePartFormat(value: unknown): string {
    const text = String(value ?? '').trim().toLowerCase();
    return ({ film: 'movie', 'tv series': 'tv', tv_special: 'special' } as Record<string, string>)[text] ?? text;
}

export function getWatchableParts(item: FilterableMediaItem) {
    const parts = item.parts?.filter(part => 'episodeTotal' in part || 'episodeCurrent' in part);
    return parts?.length ? parts.map(part => ({
        episodeCurrent: part.episodeCurrent ?? null, episodeTotal: part.episodeTotal ?? null,
    })) : [{ episodeCurrent: item.episodeCurrent ?? null, episodeTotal: item.episodeTotal ?? null }];
}

export function getActivePartFormat(item: FilterableMediaItem): string {
    const part = item.parts?.find(part => part.id === item.activePartId) ?? item.parts?.[0];
    return normalizePartFormat(part?.kind ?? item.format ?? (item.type === 'series' ? 'season' : item.type === 'movie' ? 'movie' : ''));
}

export function getPartFormats(item: FilterableMediaItem): string[] {
    return [...new Set(item.parts?.length
        ? item.parts.map(part => normalizePartFormat(part.kind)).filter(Boolean)
        : [getActivePartFormat(item)].filter(Boolean))];
}

export function getStandardFieldValue(item: FilterableMediaItem, field: string): unknown {
    switch (field) {
        case 'activePartFormat': return [getActivePartFormat(item)].filter(Boolean);
        case 'partFormats': return getPartFormats(item);
        case 'totalEpisodes': return getWatchProgress(getWatchableParts(item)).total;
        case 'watchProgress': return getWatchProgress(getWatchableParts(item)).percent;
        case 'communityRating': return item.communityRating ?? null;
        default: return undefined;
    }
}
