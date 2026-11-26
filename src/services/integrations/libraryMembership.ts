import type { MediaKind, SearchResult } from './types';
import { readAnimeVideoSourceKind, type AnimeVideoSourceKind } from './animeVideoSources';

export interface LibraryRecord {
    basename: string;
    metadata: Record<string, unknown>;
}

const text = (value: unknown): string => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
const titleKey = (value: unknown): string => text(value).normalize('NFKC').toLocaleLowerCase()
    .replace(/[’‘]/g, "'").replace(/[™®]/g, '').replace(/\s+/g, ' ').trim();
const singular: Record<MediaKind, string> = { games: 'game', anime: 'anime', movies: 'movie', series: 'series', books: 'book', manga: 'manga' };

export function createLibraryMembership(records: LibraryRecord[], kind: MediaKind): (item: SearchResult) => boolean {
    const identities = new Set<string>();
    const titles = new Map<string, Array<{ year: string; provider: string; id: string; steamId?: string; anilistId?: string; sourceKind?: AnimeVideoSourceKind }>>();
    for (const { basename, metadata: fm } of records) {
        const type = text(fm.type).toLowerCase();
        if (type && type !== kind && type !== singular[kind]) continue;
        const provider = text(fm.integration_provider).toLowerCase();
        const id = text(fm.integration_id);
        const sourceKind = kind === 'anime' && provider === 'tmdb'
            ? readAnimeVideoSourceKind(fm.integration_source_kind, text(fm.url ?? fm.source_url), fm.format)
            : undefined;
        if (provider && id) identities.add(sourceKind ? `${provider}:${sourceKind}:${id}` : `${provider}:${id}`);
        const anilistId = text(fm.anilist_id);
        if ((kind === 'anime' || kind === 'manga') && anilistId) identities.add(`anilist:${anilistId}`);
        const steamId = text(fm.steamAppId ?? fm.steam_appid ?? fm.appid)
            || text(fm.url ?? fm.source_url).match(/store\.steampowered\.com\/app\/(\d+)/i)?.[1];
        if (kind === 'games' && steamId) identities.add(`steam:${steamId}`);
        const year = text(fm.year).slice(0, 4);
        const names = [fm.name, fm.title, ...(Array.isArray(fm.aliases) ? fm.aliases : [fm.aliases])];
        if (!text(fm.name) && !text(fm.title)) names.push(basename);
        for (const name of names) {
            const key = titleKey(name);
            if (!key) continue;
            const list = titles.get(key) ?? [];
            list.push({ year, provider, id, steamId, anilistId, sourceKind });
            titles.set(key, list);
        }
    }
    return item => {
        const sourceKind = kind === 'anime' && item.provider === 'tmdb' ? item.workTypeMedia : undefined;
        const key = sourceKind ? `${item.provider}:${sourceKind}:${item.id}` : `${item.provider}:${item.id}`;
        return identities.has(key) || (titles.get(titleKey(item.title)) ?? []).some(record => {
            // A different ID in the same catalogue is a different edition/title.
            if (record.provider === item.provider && record.id && record.id !== item.id) return false;
            if (sourceKind && record.sourceKind && record.sourceKind !== sourceKind) return false;
            if (item.provider === 'steam' && record.steamId && record.steamId !== item.id) return false;
            if (item.provider === 'anilist' && record.anilistId && record.anilistId !== item.id) return false;
            return !record.year || !item.year || record.year === item.year.slice(0, 4);
        });
    };
}
