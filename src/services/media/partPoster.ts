import type { PosterMode } from '../../types';

export function normalizePosterMode(value: unknown): PosterMode {
    return value === 'title' ? 'title' : 'active-part';
}

export function getPartPoster(
    parts: readonly { id: string; poster?: string | null }[] | undefined,
    activePartId: string | null | undefined,
    mode: PosterMode | undefined,
    titlePoster: string,
    resolve: (value: string) => string | null = value => value,
): string {
    if (normalizePosterMode(mode) === 'title') return titlePoster;
    const active = parts?.find(part => part.id === activePartId) ?? parts?.[0];
    const poster = active?.poster?.trim();
    if (!poster) return titlePoster;
    if (/^(?:data:image\/|app:|blob:)/i.test(poster)) return poster;
    return resolve(poster) || titlePoster;
}
