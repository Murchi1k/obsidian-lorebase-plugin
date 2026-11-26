import { describe, expect, it } from 'vitest';
import { parseCatalogReference as parse, type ReferenceContext } from '../src/services/integrations/catalogReferences';
import { CatalogReferenceError, referenceText } from '../src/localization/catalogReference';

const uuid = '391dab2e-3c6c-4a4a-9e0a-2e5b00000001';
const games: ReferenceContext = { kind: 'games', provider: 'rawg' };

describe('catalog URLs and IDs', () => {
    it.each([
        ['https://store.steampowered.com/app/620/Portal_2/?snr=1#reviews', 'games', 'steam', '620'],
        ['steamcommunity.com/app/620', 'games', 'steam', '620'],
        ['steam:620', 'games', 'steam', '620'],
        ['IGDB:1942', 'games', 'igdb', '1942'],
        ['https://www.igdb.com/games/the-witcher-3-wild-hunt', 'games', 'igdb', 'the-witcher-3-wild-hunt'],
        ['https://rawg.io/games/the-witcher-3-wild-hunt', 'games', 'rawg', 'the-witcher-3-wild-hunt'],
        ['https://vndb.org/v17', 'games', 'vndb', 'v17'],
        ['v17', 'games', 'vndb', 'v17'],
        ['vndb:17', 'games', 'vndb', 'v17'],
        ['https://anilist.co/anime/1/Cowboy-Bebop/', 'anime', 'anilist', '1'],
        ['https://anilist.co/manga/30002', 'manga', 'anilist', '30002'],
        ['anilist:manga:30002', 'manga', 'anilist', '30002'],
        ['https://shikimori.one/animes/z1-cowboy-bebop', 'anime', 'shikimori', '1'],
        ['https://shikimori.me/mangas/2-berserk', 'manga', 'shikimori', '2'],
        ['https://kitsu.io/anime/cowboy-bebop', 'anime', 'kitsu', 'cowboy-bebop'],
        ['https://kitsu.app/anime/1', 'anime', 'kitsu', '1'],
        ['https://www.themoviedb.org/movie/603-the-matrix?language=ru', 'movies', 'tmdb', '603'],
        ['tmdb:movie:603', 'movies', 'tmdb', '603'],
        ['https://www.themoviedb.org/tv/1399-game-of-thrones', 'series', 'tmdb', '1399'],
        ['https://www.tvmaze.com/shows/82/game-of-thrones', 'series', 'tvmaze', '82'],
        ['https://www.imdb.com/title/tt0133093/', 'movies', 'omdb', 'tt0133093'],
        ['tt0133093', 'movies', 'omdb', 'tt0133093'],
        ['imdb:tt0133093', 'movies', 'omdb', 'tt0133093'],
        ['https://hardcover.app/books/dune', 'books', 'hardcover', 'dune'],
        ['https://books.google.com/books?id=AbC_1-XYZ', 'books', 'googlebooks', 'AbC_1-XYZ'],
        ['https://books.google.com.ua/books/edition/Dune/AbC_1-XYZ?hl=uk', 'books', 'googlebooks', 'AbC_1-XYZ'],
        ['googlebooks:AbC_1-XYZ', 'books', 'googlebooks', 'AbC_1-XYZ'],
        [`https://mangadex.org/title/${uuid}/name`, 'manga', 'mangadex', uuid],
        ['https://www.mangaupdates.com/series/ttaew4a/title', 'manga', 'mangaupdates', '64897697818'],
        ['mangaupdates:64897697818', 'manga', 'mangaupdates', '64897697818'],
    ] as const)('parses %s', (input, kind, provider, id) => {
        expect(parse(input, { kind, provider: 'rawg' })).toMatchObject({ provider, id });
    });
    it.each(['games', 'anime', 'movies', 'series', 'books', 'manga'] as const)('uses the selected provider for a numeric %s ID', kind => {
        const provider = { games: 'steam', anime: 'anilist', movies: 'tmdb', series: 'tmdb', books: 'hardcover', manga: 'mangaupdates' }[kind];
        expect(parse('123', { kind, provider })).toMatchObject({ provider, id: '123' });
    });
    it('keeps movie and TV identities separate, including in the anime library', () => {
        expect(parse('tmdb:123', { kind: 'movies' })?.videoKind).toBe('movie');
        expect(parse('tmdb:123', { kind: 'series' })?.videoKind).toBe('series');
        expect(parse('tmdb:movie:123', { kind: 'anime' })?.videoKind).toBe('movie');
        expect(parse('tmdb:tv:123', { kind: 'anime' })?.videoKind).toBe('series');
        expect(() => parse('tmdb:123', { kind: 'anime' })).toThrow(referenceText('videoKind'));
    });
    it.each([
        ['https://anilist.co/manga/2', 'anime'], ['https://anilist.co/anime/2', 'manga'],
        ['https://www.themoviedb.org/tv/603', 'movies'], ['tmdb:movie:123', 'series'],
        ['steam:620', 'books'], ['https://kitsu.io/anime/1', 'manga'],
    ] as const)('rejects mismatched media for %s', (input, kind) => expect(() => parse(input, { kind })).toThrow(referenceText('wrongMedia')));
    it.each([
        'https://example.com/app/620', 'https://store.steampowered.com.evil.test/app/620',
        'https://store.steampowered.com@evil.test/app/620', 'https://user:pass@store.steampowered.com/app/620',
        'https://store.steampowered.com:8080/app/620', 'https://store.steampowered.com/bundle/620',
        'file:///C:/secrets', 'https://127.0.0.1/app/620', 'https://anilist.co/user/123',
    ])('rejects unsupported addresses without treating them as title queries: %s', input => expect(() => parse(input, games)).toThrow(CatalogReferenceError));
    it.each(['steam:0', 'steam:-1', 'steam:123/nope', 'igdb:bad";query', 'rawg:../secret', 'steam:', '0'])('rejects malformed ID %s', input => expect(() => parse(input, games)).toThrow(CatalogReferenceError));
    it('keeps ordinary names and explicit numeric titles as ordinary searches', () => {
        for (const title of ['Mortal Shell 2', 'CONTROL Resonant', 'Control: Resonant', 'title:1984', 'title:steam:620']) expect(parse(title, games)).toBeNull();
    });
    it('does not confuse legacy MangaUpdates page IDs with new API IDs', () => {
        expect(() => parse('https://www.mangaupdates.com/series.html?id=71967', { kind: 'manga' })).toThrow(referenceText('legacyMu'));
        expect(parse('https://www.mangaupdates.com/series/3w5e11264sgsf', { kind: 'manga' })?.id).toBe('18446744073709551615');
    });
});

describe('music references', () => {
    it.each([
        [`https://musicbrainz.org/release/${uuid}`, 'album', 'musicbrainz', uuid],
        [`musicbrainz:recording:${uuid}`, 'track', 'musicbrainz', uuid],
        ['https://www.deezer.com/en/album/123', 'album', 'deezer', '123'],
        ['https://www.deezer.com/track/456', 'track', 'deezer', '456'],
        ['deezer:album:123', 'album', 'deezer', '123'],
        ['https://www.last.fm/music/Pink+Floyd/The+Wall', 'album', 'lastfm', JSON.stringify(['Pink Floyd', 'The Wall'])],
        ['https://www.last.fm/music/A+Band/_/A%2BB', 'track', 'lastfm', JSON.stringify(['A Band', 'A+B'])],
        ['lastfm:Pink Floyd|The Wall', 'album', 'lastfm', JSON.stringify(['Pink Floyd', 'The Wall'])],
    ] as const)('parses %s', (input, musicKind, provider, id) => expect(parse(input, { kind: 'music', provider: 'musicbrainz', musicKind })).toMatchObject({ provider, id, musicKind }));
    it('uses the current album/track selector only when the input has no explicit kind', () => {
        expect(parse('123', { kind: 'music', provider: 'deezer', musicKind: 'track' })).toMatchObject({ provider: 'deezer', id: '123', musicKind: 'track' });
        expect(() => parse('https://www.deezer.com/track/456', { kind: 'music', musicKind: 'album' })).toThrow(referenceText('musicKind'));
    });
});
