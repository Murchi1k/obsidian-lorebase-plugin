import type { AnimePart, VideoPart, PartCatalog } from '../../types';
export type CatalogPart = AnimePart | VideoPart;
export interface Continuation<P extends CatalogPart = CatalogPart> { part: P; previousTotal: number | null; existing: boolean }
export function catalogSource(item: { type: string; integrationProvider?: string | null; integrationId?: string | null; integrationSourceKind?: string | null }): string {
    return [item.integrationProvider ?? '', item.integrationId ?? '', item.integrationSourceKind ?? item.type].join(':');
}
export function normalizePartCatalog(raw: unknown): PartCatalog | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
    const data = raw as Record<string, unknown>;
    if (typeof data.source !== 'string' || !data.parts || typeof data.parts !== 'object' || Array.isArray(data.parts)) return;
    return { source: data.source, parts: Object.fromEntries(Object.entries(data.parts).filter(([id]) => id && !['__proto__','constructor','prototype'].includes(id)).map(([id, total]) => [id, typeof total === 'number' && Number.isInteger(total) && total > 0 ? total : null])) };
}
export function inspectPartCatalog<P extends CatalogPart>(source: string, provider: P[], existing: P[], previous?: PartCatalog) {
    const baseline = !previous || previous.source !== source;
    const known = baseline ? undefined : previous.parts;
    const catalog: PartCatalog = { source, parts: Object.fromEntries(provider.map(part => [part.id, part.episodeTotal && part.episodeTotal > 0 ? part.episodeTotal : null])) };
    // Retain IDs omitted by a transient/partial provider response.
    if (known) catalog.parts = Object.fromEntries(Object.entries({ ...known, ...catalog.parts }).map(([id, total]) => [id, Math.max(total ?? 0, known[id] ?? 0) || null]));
    const candidates: Continuation<P>[] = [];
    for (const part of new Map(provider.map(part => [part.id, part])).values()) {
        const saved = existing.find(local => local.id === part.id || part.kind === 'season' && local.kind === 'season' && part.seasonNumber != null && local.seasonNumber === part.seasonNumber);
        if (!saved) {
            if (baseline || !Object.prototype.hasOwnProperty.call(known!, part.id)) candidates.push({ part: { ...part, episodeCurrent:0, watchedEpisodes:[], status:'planned', userRating:null, episodeRatings:{} }, previousTotal:null, existing:false });
        } else {
            const oldTotal = Math.max(saved.episodeTotal ?? 0, known?.[part.id] ?? 0);
            if (oldTotal > 0 && (part.episodeTotal ?? 0) > oldTotal) candidates.push({ part: { ...part, id:saved.id }, previousTotal:oldTotal, existing:true });
        }
    }
    return { catalog, candidates, baseline };
}
export function applyContinuations<P extends CatalogPart>(existing: P[], candidates: Continuation<P>[], selected: string[], resume: boolean): { parts:P[]; activeId?:string } {
    const parts = structuredClone(existing), chosen = new Set(selected);
    let activeId: string | undefined;
    for (const candidate of candidates) {
        if (!chosen.has(candidate.part.id)) continue;
        let part = parts.find(part => part.id === candidate.part.id);
        if (part) { part.episodeTotal = Math.max(part.episodeTotal ?? 0, candidate.part.episodeTotal ?? 0); part.releaseDate ||= candidate.part.releaseDate; }
        else { part = structuredClone(candidate.part); parts.push(part); }
        if (resume && !activeId) { activeId = part.id; part.status = 'watching'; }
    }
    return { parts, activeId };
}
