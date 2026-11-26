import type { AnimePart } from '../../types';
import type { IntegrationAnimePart } from './types';
import { readEpisodeFields, episodeFields } from '../media/episodeTracking';

function names(part: IntegrationAnimePart): Set<string> {
    return new Set([part.title, ...(part.alternativeTitles ?? [])].map(value => value.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean));
}
function sameWork(a: IntegrationAnimePart, b: IntegrationAnimePart): boolean {
    if (a.kind !== b.kind || a.year && b.year && a.year !== b.year) return false;
    const titles = names(a); return [...names(b)].some(title => titles.has(title));
}
function emptyPlaceholder(part: IntegrationAnimePart): boolean {
    return !(part.episodeTotal && part.episodeTotal > 0) && !(part.episodeCurrent && part.episodeCurrent > 0)
        && !part.watchedEpisodes?.length && !Object.keys(part.episodeRatings ?? {}).length && !part.episodeDetails?.length
        && part.userRating == null && part.status === 'planned';
}

/** Match old root/legacy parts to a unique provider work before retaining local-only parts. */
export function reconcileAnimeParts(providerParts: IntegrationAnimePart[], existingParts: AnimePart[] = [], activePartId?: string | null) {
    const used = new Set<string>(), existingIds = new Set<string>(), providerIds = new Set<string>();
    const remap = new Map<string, string>();
    const parts: IntegrationAnimePart[] = [];
    for (const incoming of providerParts) {
        if (providerIds.has(incoming.id)) continue;
        providerIds.add(incoming.id);
        let saved = existingParts.find(part => part.id === incoming.id && !used.has(part.id));
        if (!saved) {
            const matches = existingParts.filter(part => !used.has(part.id) && sameWork(part, incoming));
            const providerMatches = providerParts.filter(part => sameWork(part, incoming));
            if (matches.length === 1 && providerMatches.length === 1) saved = matches[0];
        }
        if (!saved) { parts.push({ ...incoming, alternativeTitles: incoming.alternativeTitles ?? [], ...readEpisodeFields(episodeFields(incoming)) }); continue; }
        used.add(saved.id); remap.set(saved.id, incoming.id); existingIds.add(incoming.id);
        parts.push({
            ...incoming, title: saved.title || incoming.title,
            alternativeTitles: [...new Set([...(saved.alternativeTitles ?? []), incoming.title, ...(incoming.alternativeTitles ?? [])])].filter(title => title !== (saved.title || incoming.title)),
            kind: saved.kind, seasonNumber: saved.seasonNumber ?? incoming.seasonNumber,
            poster: saved.poster || incoming.poster, year: saved.year ?? incoming.year,
            episodeDuration: saved.episodeDuration ?? incoming.episodeDuration,
            releaseDate: incoming.releaseDate || saved.releaseDate,
            episodeTotal: saved.episodeTotal && saved.episodeTotal > 0 ? saved.episodeTotal : incoming.episodeTotal,
            episodeCurrent: saved.episodeCurrent ?? incoming.episodeCurrent ?? 0, status: saved.status,
            ...(saved.userRating !== undefined ? { userRating: saved.userRating } : {}),
            ...readEpisodeFields(episodeFields(saved)),
        });
    }
    for (const local of existingParts) {
        if (used.has(local.id)) continue;
        const matches = parts.filter(part => providerIds.has(part.id) && sameWork(part, local));
        if (emptyPlaceholder(local) && matches.length === 1) {
            remap.set(local.id, matches[0].id); existingIds.add(matches[0].id); continue;
        }
        if (parts.some(part => part.id === local.id)) continue;
        parts.push({ ...local, ...readEpisodeFields(episodeFields(local)) }); existingIds.add(local.id);
    }
    const active = activePartId ? remap.get(activePartId) ?? activePartId : null;
    return { parts, existingIds, providerIds, activePartId: active && parts.some(part => part.id === active) ? active : parts[0]?.id ?? null };
}
