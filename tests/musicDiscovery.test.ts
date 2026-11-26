import { describe, expect, it, vi } from 'vitest';
import { TFile, type App } from 'obsidian';
import { getMusicDetails, searchMusic } from '../src/services/integrations/providers/music';
import { getArtistAppearances, getArtistReleases, getListeningStats, getMusicArtist, normalizeListeningStats } from '../src/services/integrations/providers/musicDiscovery';
import { formatMusicTotal } from '../src/services/media/music';
import { emptyMusicItem, MusicService } from '../src/services/MusicService';
import { MetadataService } from '../src/services/MetadataService';

const release = { id: '42', title: 'Album', artist: 'Artist', image: '', year: '', kind: 'album' as const, provider: 'deezer' as const };
const artist = { id: '7', name: 'Artist', image: '', url: 'https://www.deezer.com/artist/7', listeners: null, fans: 123 };

describe('Deezer catalog and music listening data', () => {
    it('searches both catalog types with an encoded query and pagination, without an API key', async () => {
        const fetch = vi.fn(async (_url: string) => ({ data: [{ id: 42, title: 'Album', artist: { name: 'Artist' }, cover_big: 'art' }] }));
        expect(await searchMusic(fetch, 'deezer', 'album', 'A & B', 2)).toEqual([{ ...release, image: 'art' }]);
        const url = new URL(fetch.mock.calls[0][0]);
        expect(url.pathname).toBe('/search/album'); expect(url.searchParams.get('q')).toBe('A & B'); expect(url.searchParams.get('index')).toBe('20');
        await searchMusic(fetch, 'deezer', 'track', 'Song');
        expect(new URL(fetch.mock.calls[1][0]).pathname).toBe('/search/track');
    });
    it('loads remaining album tracks and keeps IDs, disc, duration and artwork', async () => {
        const fetch = vi.fn(async (url: string) => url.includes('/tracks?')
            ? { data: [{ id: 2, title: 'Second', duration: 202, disk_number: 2 }] }
            : { id: 42, title: 'Album', artist: { id: 7, name: 'Artist' }, release_date: '2024-02-03', cover_big: 'art', duration: 303,
                nb_tracks: 2, tracks: { data: [{ id: 1, title: 'First', duration: 101, disk_number: 1 }] }, genres: { data: [{ name: 'Rock' }] } });
        const result = await getMusicDetails(fetch, release);
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(result).toMatchObject({ duration: 303, year: 2024, deezerArtistId: '7', sourceUrl: 'https://www.deezer.com/album/42', poster: 'art', genres: ['Rock'] });
        expect(result.tracks[1]).toMatchObject({ id: 'deezer-2', deezerId: '2', disc: 2, duration: 202, artist: 'Artist', listened: false });
    });
    it('handles a Deezer error object even when HTTP transport succeeded', async () => {
        await expect(searchMusic(async () => ({ error: { code: 4 } }), 'deezer', 'album', 'x')).rejects.toThrow('Deezer');
    });
    it('never follows a supplied pagination URL and maps album, EP and single record types', async () => {
        const fetch = vi.fn(async (_url: string) => ({ data: ['album', 'ep', 'single'].map((record_type, id) => ({ id: id + 1, title: record_type, record_type, release_date: '2020-01-01' })), next: 'https://untrusted.example/page' }));
        const page = await getArtistReleases(fetch, artist, 1);
        expect(page.items.map(item => item.category)).toEqual(['album', 'ep', 'single']);
        expect(page.more).toBe(true);
        expect(fetch.mock.calls[0][0]).toBe('https://api.deezer.com/artist/7/albums?limit=100&index=100');
    });
    it('uses exact identities, keeps fans separate from listeners, and tolerates one unavailable source', async () => {
        const fetch = vi.fn(async (url: string) => {
            if (url.includes('audioscrobbler')) throw new Error('offline');
            if (url.includes('search/artist')) return { data: [{ id: 9, name: 'Other Artist' }, { id: 7, name: 'Artist' }] };
            return { id: 7, name: 'Artist', picture_big: 'photo', nb_fan: 900 };
        });
        expect(await getMusicArtist(fetch, 'Artist', 'key', true)).toMatchObject({ id: '7', image: 'photo', fans: 900, listeners: null });
        expect(await getMusicArtist(async () => ({ data: [{ id: 9, name: 'Other Artist' }] }), 'Artist', '', true)).toBeNull();
    });
    it('counts Last.fm scrobbles for the exact release, including valid zeroes', async () => {
        const fetch = vi.fn(async (_url: string) => ({ album: { name: 'Album', artist: 'Artist', listeners: '13800', playcount: '379100', url: 'https://www.last.fm/music/Artist/Album' } }));
        const stats = await getListeningStats(fetch, 'key', { musicKind: 'album', artist: 'Artist', displayName: 'Album' });
        expect(stats).toMatchObject({ source: 'lastfm', listeners: 13800, plays: 379100 });
        expect(new URL(fetch.mock.calls[0][0]).searchParams.get('autocorrect')).toBe('0');
        expect(await getListeningStats(fetch, 'key', { musicKind: 'album', artist: 'Someone', displayName: 'Album' })).toBeUndefined();
        expect(normalizeListeningStats({ source: 'lastfm', listeners: 0, plays: -3, url: 'javascript:bad' })).toEqual({ source: 'lastfm', listeners: 0, plays: null, url: '' });
        expect(normalizeListeningStats({ source: 'deezer', listeners: 100 })).toBeUndefined();
    });
    it('returns only confirmed co-credited appearances', async () => {
        const fetch = vi.fn(async (url: string) => url.includes('/artist?') ? { artists: [{ id: 'a', name: 'Artist' }] } : {
            'release-group-count': 3, 'release-groups': [
                { id: 'own', title: 'Own', 'artist-credit': [{ name: 'Artist', artist: { id: 'a' } }] },
                { id: 'guest', title: 'Together', 'artist-credit': [{ name: 'Other', joinphrase: ' & ', artist: { id: 'b' } }, { name: 'Artist', artist: { id: 'a' } }] },
                { id: 'wrong', title: 'Wrong', 'artist-credit': [{ artist: { id: 'x' } }, { artist: { id: 'y' } }] },
            ],
        });
        const page = await getArtistAppearances(fetch, 'Artist');
        expect(page.items).toHaveLength(1); expect(page.items[0]).toMatchObject({ id: 'guest', category: 'featured', artist: 'Other & Artist' });
    });
    it('formats album totals in hours and minutes in all four languages', () => {
        expect(formatMusicTotal(3729, 'ru')).toBe('1 ч 2 мин');
        expect(formatMusicTotal(3729, 'en')).toBe('1 hr 2 min');
        expect(formatMusicTotal(3729, 'uk')).toContain('1 год');
        expect(formatMusicTotal(3729, 'zh-CN')).toContain('小时');
        expect(formatMusicTotal(null)).toBe('');
    });
    it('round-trips the provider, artist and listening stats without replacing personal progress', async () => {
        const file = new TFile('Music/A.md', 'A');
        const fm: Record<string, unknown> = { type: 'music', title: 'Album', artist: 'Artist', rating: 4, status: 'listening' };
        const app = { vault: { getAbstractFileByPath: () => file, process: async () => {} }, metadataCache: { getFileCache: () => ({ frontmatter: fm }) }, fileManager: { processFrontMatter: async (_file: TFile, apply: (fm: Record<string, unknown>) => void) => apply(fm) } } as unknown as App;
        const service = new MusicService(app, 'Music', new MetadataService(app));
        await service.updateItem({ ...emptyMusicItem(), filePath: file.path, userRating: 4, status: 'listening' }, {
            integrationProvider: 'deezer', integrationId: '42', deezerArtistId: '7', listeningStats: { source: 'lastfm', listeners: 13800, plays: 379100, url: '' },
            tracks: [{ id: '1', title: 'Song', artist: 'Artist', duration: 90, disc: 1, listened: false, userRating: null, favorite: false }],
        });
        expect(service.parseFromCache(file)).toMatchObject({ integrationProvider: 'deezer', integrationId: '42', deezerArtistId: '7', userRating: 4, status: 'listening', listeningStats: { listeners: 13800, plays: 379100 },
            tracks: [{ listened: false }] });
    });
});
