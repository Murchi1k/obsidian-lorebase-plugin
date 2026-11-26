import { asArray, asObject, getString } from '../integrations/providers/common';
import { deezer, type MusicFetch } from '../integrations/providers/music';

export interface MusicPreviewQuery { title: string; artist: string; deezerId?: string }
export interface MusicPreview { id: string; title: string; artist: string; album: string; preview: string; url: string }

export function validDeezerPreview(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password && !url.port
            && (url.hostname.endsWith('.dzcdn.net') || url.hostname.endsWith('.deezer.com')) ? url.href : undefined;
    } catch { return undefined; }
}
export async function loadDeezerPreviews(fetch: MusicFetch, query: MusicPreviewQuery): Promise<MusicPreview[]> {
    const knownId = /^\d+$/.test(query.deezerId || '') ? query.deezerId : undefined;
    const data = await deezer(fetch, knownId ? `track/${knownId}` : `search/track?${new URLSearchParams({ q: `${query.artist} ${query.title}`.trim(), limit: '10' })}`);
    const rows = knownId ? [data] : asArray(data.data);
    return rows.flatMap(value => {
        const o = asObject(value); const preview = validDeezerPreview(o?.preview);
        if (!o || !preview || !/^\d+$/.test(String(o.id))) return [];
        return [{ id: String(o.id), title: getString(o, 'title'), artist: getString(asObject(o.artist), 'name'),
            album: getString(asObject(o.album), 'title'), preview, url: `https://www.deezer.com/track/${o.id}` }];
    });
}
const normalized = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
export function exactMusicPreview(items: MusicPreview[], query: MusicPreviewQuery): MusicPreview | undefined {
    const matches = items.filter(item => normalized(item.title) === normalized(query.title) && normalized(item.artist) === normalized(query.artist));
    return matches.length === 1 ? matches[0] : undefined;
}
