import { describe, expect, it, vi } from 'vitest';
import { emptyMusicItem } from '../src/services/MusicService';
import { normalizeMusicTracks, trackGuestNames } from '../src/services/media/music';
import { findDeezerAlbum, getDeezerAlbumCredits, trackArtistDeezerId } from '../src/services/integrations/providers/musicTrackCredits';
import { getMusicArtist } from '../src/services/integrations/providers/musicDiscovery';

const item = () => ({ ...emptyMusicItem(), artist: 'Pharaoh', displayName: 'Pink Phloyd', tracks: normalizeMusicTracks([
    { id: 'a', title: 'Solo', artist: 'Pharaoh' }, { id: 'b', title: 'School', artist: 'Pharaoh', favorite: true, listened: true, userRating: 4 },
]) });
const album = { id: 42, title: 'Pink Phloyd', artist: { id: 7, name: 'Pharaoh' }, nb_tracks: 2,
    tracks: { data: [{ id: 1, title: 'Solo' }, { id: 2, title: 'School' }] } };
const fetchCredits = vi.fn(async (url: string): Promise<unknown> => {
    if (url.includes('search/album')) return { data: [album] };
    if (url.endsWith('/album/42')) return album;
    const id = url.endsWith('/track/1') ? 1 : 2;
    return { id, title: id === 1 ? 'Solo' : 'School', album: { id: 42 }, contributors: [
        { id: 7, name: 'Pharaoh', role: 'Main' },
        ...(id === 2 ? [{ id: 8, name: 'Morty Mort', role: 'Featured' }, { id: 9, name: '39', role: 'Featured' }, { id: 99, name: 'Writer', role: 'Composer' }] : []),
    ] };
});

describe('provider guest credits', () => {
    it('loads full song contributors missing from an album list and preserves progress', async () => {
        const original = item();
        const credits = await getDeezerAlbumCredits(fetchCredits, original);
        expect(credits?.deezerArtistId).toBe('7');
        expect(original.tracks[1]).toMatchObject({ listened: true, favorite: true, userRating: 4 });
        expect(original.tracks[1].artists).toBeUndefined();
        const enriched = normalizeMusicTracks(original.tracks.map(track => ({ ...track, ...credits?.tracks.find(credit => credit.id === track.id) })));
        expect(trackGuestNames(enriched[0], 'Pharaoh')).toEqual([]);
        expect(trackGuestNames(enriched[1], 'Pharaoh')).toEqual(['Morty Mort', '39']);
        expect(trackArtistDeezerId(enriched[1], 'MORTY MORT')).toBe('8');
        expect(enriched[1]).toMatchObject({ listened: true, favorite: true, userRating: 4 });
    });
    it('disambiguates identical artist names by the exact album, without choosing the most popular', async () => {
        const fetch = vi.fn(async (url: string) => {
            if (url.includes('search/artist')) return { data: [{ id: 99, name: 'Pharaoh', nb_fan: 999999 }, { id: 7, name: 'Pharaoh', nb_fan: 1 }] };
            if (url.endsWith('/artist/7')) return { id: 7, name: 'Pharaoh', picture_big: 'photo' };
            return fetchCredits(url);
        });
        expect(await getMusicArtist(fetch, 'Pharaoh', '', true, undefined, 'Pink Phloyd')).toMatchObject({ id: '7', image: 'photo' });
        expect(await getMusicArtist(fetch, 'Pharaoh', '', true)).toBeNull();
    });
    it('does not take credits from another album or an ambiguous edition', async () => {
        expect(await findDeezerAlbum(async () => ({ data: [{ ...album, id: 43 }, album] }), item())).toBeNull();
        const fetch = async (url: string) => url.includes('/track/')
            ? { id: url.endsWith('/1') ? 1 : 2, title: url.endsWith('/1') ? 'Solo' : 'School', album: { id: 99 }, contributors: [{ id: 8, name: 'Wrong', role: 'Featured' }] }
            : fetchCredits(url);
        expect((await getDeezerAlbumCredits(fetch, item()))?.tracks).toEqual([]);
    });
    it('limits parallel song requests and stops scheduling after closing', async () => {
        let active = 0, peak = 0, current = true, calls = 0;
        const tracks = Array.from({ length: 10 }, (_, index) => ({ id: index + 1, title: `Song ${index}` }));
        const original = { ...item(), tracks: normalizeMusicTracks(tracks) };
        const fetch = async (url: string): Promise<unknown> => {
            if (url.includes('search/album')) return { data: [album] };
            if (url.includes('/album/42')) return { ...album, nb_tracks: 10, tracks: { data: tracks } };
            active++; peak = Math.max(peak, active); calls++;
            await new Promise(resolve => setTimeout(resolve, 1));
            active--; current = false; return {};
        };
        expect(await getDeezerAlbumCredits(fetch, original, () => current)).toBeNull();
        expect(peak).toBe(3); expect(calls).toBe(3);
    });
});
