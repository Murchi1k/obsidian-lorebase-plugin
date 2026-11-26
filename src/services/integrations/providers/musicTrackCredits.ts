import type { MusicItem, MusicTrack } from '../../../types';
import { asArray, asObject, getString } from './common';
import { deezer, type MusicFetch } from './music';

const obj = (value: unknown) => asObject(value) ?? {};
export const musicCreditKey = (name: string): string => name.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
type AlbumIdentity = Pick<MusicItem, 'artist' | 'displayName' | 'integrationProvider' | 'integrationId'>;
export interface DeezerTrackCredit {
    id: string;
    deezerId: string;
    artists: string[];
    deezerArtistIds: Record<string, string>;
}
export interface DeezerAlbumCredits { deezerArtistId: string; tracks: DeezerTrackCredit[] }

/** An album identity disambiguates artists with identical names; popularity cannot do that. */
export async function findDeezerAlbum(fetch: MusicFetch, item: AlbumIdentity): Promise<Record<string, unknown> | null> {
    const exact = (value: Record<string, unknown>) => musicCreditKey(getString(value, 'title')) === musicCreditKey(item.displayName)
        && musicCreditKey(getString(obj(value.artist), 'name')) === musicCreditKey(item.artist);
    if (item.integrationProvider === 'deezer' && /^\d+$/.test(item.integrationId || '')) {
        const album = await deezer(fetch, `album/${item.integrationId}`);
        return exact(album) ? album : null;
    }
    if (!item.artist.trim() || !item.displayName.trim()) return null;
    const root = await deezer(fetch, `search/album?${new URLSearchParams({ q: `${item.artist} ${item.displayName}`, limit: '25' })}`);
    const matches = [...new Map(asArray(root.data).map(obj).filter(exact).filter(album => /^\d+$/.test(String(album.id))).map(album => [String(album.id), album])).values()];
    // Different editions can have different guests: do not choose one arbitrarily.
    if (matches.length !== 1) return null;
    const album = await deezer(fetch, `album/${matches[0].id}`);
    return exact(album) ? album : null;
}

/** Album tracklists omit contributors. Resolve full track records with bounded concurrency. */
export async function getDeezerAlbumCredits(fetch: MusicFetch, item: AlbumIdentity & Pick<MusicItem, 'musicKind' | 'tracks'>, current: () => boolean = () => true): Promise<DeezerAlbumCredits | null> {
    if (item.musicKind !== 'album' || !item.tracks.length || !current()) return null;
    const album = await findDeezerAlbum(fetch, item);
    if (!album || !current()) return null;
    const values = [...asArray(obj(album.tracks).data)];
    while (values.length < Number(album.nb_tracks) && values.length < 5000 && current()) {
        const page = await deezer(fetch, `album/${album.id}/tracks?limit=100&index=${values.length}`);
        const more = asArray(page.data); if (!more.length) break;
        values.push(...more);
    }
    const source = values.map(obj);
    const tracks: DeezerTrackCredit[] = [];
    let next = 0;
    const load = async () => {
        while (current() && next < item.tracks.length) {
            const track = item.tracks[next++];
            const matches = source.filter(value => musicCreditKey(getString(value, 'title')) === musicCreditKey(track.title)
                && (!value.disk_number || Number(value.disk_number) === track.disc));
            const match = matches.find(value => String(value.id) === track.deezerId) ?? (matches.length === 1 ? matches[0] : undefined);
            if (!match || !/^\d+$/.test(String(match.id))) continue;
            try {
                const full = await deezer(fetch, `track/${match.id}`);
                if (!current()) return;
                if (String(full.id) !== String(match.id) || musicCreditKey(getString(full, 'title')) !== musicCreditKey(track.title)
                    || String(obj(full.album).id) !== String(album.id)) continue;
                const credits = asArray(full.contributors).map(obj).filter(value => value.role === 'Main' || value.role === 'Featured');
                if (!credits.length) continue;
                const performers = new Map(credits.filter(value => getString(value, 'name').trim() && /^\d+$/.test(String(value.id)))
                    .map(value => [getString(value, 'name'), String(value.id)]));
                tracks.push({ id: track.id, deezerId: String(full.id), artists: [...performers.keys()], deezerArtistIds: Object.fromEntries(performers) });
            } catch { /* One unavailable song must not discard the remaining credits. */ }
        }
    };
    await Promise.all(Array.from({ length: Math.min(3, item.tracks.length) }, load));
    return current() ? { deezerArtistId: String(obj(album.artist).id || ''), tracks } : null;
}

export function trackArtistDeezerId(track: Pick<MusicTrack, 'deezerArtistIds'>, name: string): string | undefined {
    return Object.entries(track.deezerArtistIds ?? {}).find(([credit]) => musicCreditKey(credit) === musicCreditKey(name))?.[1];
}
