import type { MusicItem } from '../../types';

type MusicIdentity = Pick<MusicItem, 'musicKind' | 'displayName' | 'artist'>
    & Partial<Pick<MusicItem, 'integrationProvider' | 'integrationId' | 'parentAlbum' | 'parentTrackId'>>;

const normalize = (value: string): string => value.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');

/** Provider IDs survive renames; title/artist also match notes made with another provider or template. */
export function musicIdentityKeys(item: MusicIdentity): string[] {
    const keys: unknown[][] = [];
    if (item.integrationProvider && item.integrationId) keys.push(['source', item.integrationProvider, item.integrationId]);
    if (item.parentAlbum && item.parentTrackId) keys.push(['track', item.parentAlbum, item.parentTrackId]);
    const title = normalize(item.displayName), artist = normalize(item.artist);
    if (title) keys.push(['name', title, artist]);
    return keys.map(key => JSON.stringify([item.musicKind, ...key]));
}
