import { describe, expect, it, vi } from 'vitest';
import { App, TFile } from 'obsidian';
import { MusicService, emptyMusicItem } from '../src/services/MusicService';
import { MetadataService } from '../src/services/MetadataService';
import { MusicCatalog } from '../src/services/MusicCatalog';
import { durationSeconds, formatDuration, normalizeMusicTracks, statusAfterTrackChange, musicCredits, trackArtistNames, trackGuestNames } from '../src/services/media/music';
import { matchesFilterRule, groupMediaItems } from '../src/services/media/libraryViewState';
import { findMusicBrainzArtwork, findMusicBrainzReleaseDate, getMusicDetails, mergeMusicBrainzArtwork, searchMusic, MusicSearchResult, organizeMusicResults, musicSearchIdentity } from '../src/services/integrations/providers/music';
import { DEFAULT_SETTINGS } from '../src/constants';
import { rememberAdvancedTemplate, switchTemplateMode } from '../src/services/integrations/templatePreferences';
import { normalizeLibraryViewSettings } from '../src/settings/settingsNormalization';
import { getBuiltInFieldDefinitions, getSortOptionsForMediaType, getStatusOptionsForMediaType } from '../src/views/library/viewOptions';
import { LayoutCalculator } from '../src/views/library/LayoutCalculator';
import type { MusicItem, MusicTrack } from '../src/types';

vi.mock('obsidian', async () => {
    const original = await import('./mocks/obsidian');
    return { ...original, normalizePath: (value: string) => value.replace(/\\/g, '/').replace(/\/+$/, ''),
        stringifyYaml: (value: unknown) => `${JSON.stringify(value)}\n` };
});
const track = (overrides: Partial<MusicTrack> = {}): MusicTrack => ({ id: 't1', title: 'Song', artist: 'Artist', disc: 1,
    duration: 200, listened: false, favorite: false, userRating: null, ...overrides });
const selection = (overrides: Partial<MusicSearchResult> = {}): MusicSearchResult => ({ id: 'release-1', title: 'Album', artist: 'Artist',
    year: '', image: '', provider: 'musicbrainz', kind: 'album', ...overrides });

describe('music progress and saved views', () => {
    it('shows only guests after feat. and leaves solo tracks without a credit', () => {
        expect(trackGuestNames(track({ artist: 'Pharaoh' }), 'PHARAOH')).toEqual([]);
        expect(trackGuestNames(track({ artist: 'Pharaoh feat. Oxxxymiron, ЛСП' }), 'Pharaoh')).toEqual(['Oxxxymiron', 'ЛСП']);
        expect(trackGuestNames(track({ artist: 'Pharaoh', artists: ['Pharaoh', 'ЛСП', 'Oxxxymiron'] }), 'Pharaoh')).toEqual(['ЛСП', 'Oxxxymiron']);
        expect(trackGuestNames(track({ artist: 'Pharaoh', title: 'Song (feat. ЛСП)' }), 'Pharaoh')).toEqual(['ЛСП']);
        expect(trackGuestNames(track({ artist: 'Florence & The Machine' }), 'Florence & The Machine')).toEqual([]);
        expect(trackGuestNames(track({ artist: 'Artist feat. Guest' }))).toEqual(['Guest']);
    });
    it('reads separate performer credits and title features without breaking band names', () => {
        expect(trackArtistNames(track({ artist: 'Florence & The Machine', title: 'Song (feat. Oxxxymiron & ЛСП)' }))).toEqual(['Florence & The Machine', 'Oxxxymiron', 'ЛСП']);
        expect(trackArtistNames(track({ artist: 'Artist feat. Guest', title: 'Song (ft. guest, Other)' }))).toEqual(['Artist', 'guest', 'Other']);
        const saved = normalizeMusicTracks([{ title: 'Song', artist: 'A & B', artists: ['A & B', 'Guest', 7, ''] }])[0];
        expect(saved.artists).toEqual(['A & B', 'Guest']);
        expect(trackArtistNames(saved)).toEqual(['A & B', 'Guest']);
        expect(trackArtistNames(track({ artist: '' }), 'Album Artist')).toEqual(['Album Artist']);
    });
    it('groups albums and songs by artist, combines case variants and keeps missing artists last', () => {
        const items = [
            { ...emptyMusicItem(), artist: 'Pharaoh' },
            { ...emptyMusicItem(), musicKind: 'track' as const, artist: 'PHARAOH feat. Guest' },
            { ...emptyMusicItem(), artist: '' },
            { ...emptyMusicItem(), artist: 'Adele' },
        ];
        const groups = groupMediaItems(items, 'artist', 'asc', 'ru');
        expect(groups.map(group => group.label)).toEqual(['Adele', 'Pharaoh', 'Без исполнителя']);
        expect(groups[1].items).toHaveLength(2);
        expect(groupMediaItems(items, 'artist', 'desc', 'ru').map(group => group.label)).toEqual(['Pharaoh', 'Adele', 'Без исполнителя']);
        const state = normalizeLibraryViewSettings({ viewState: { ...DEFAULT_SETTINGS.music.viewState, group: { mode: 'artist', order: 'desc' } } }, DEFAULT_SETTINGS.music.viewState);
        expect(state.viewState.group).toEqual({ mode: 'artist', order: 'desc' });
    });
    it('filters album performers and guests from track credits without matching partial names', () => {
        const item = { ...emptyMusicItem(), artist: 'PHARAOH', tracks: [track({ artist: 'Pharaoh feat. Big Baby Tape' }), track({ artist: 'PHARAOH, Boulevard Depo' })] };
        const credits = musicCredits(item);
        expect(credits.guests).toEqual(['Big Baby Tape', 'Boulevard Depo']);
        const rule = { id: 'guest', field: 'musicGuests', fieldType: 'list' as const, operator: 'containsAny' as const, value: ['big baby tape'] };
        expect(matchesFilterRule(item, rule)).toBe(true);
        expect(matchesFilterRule(item, { ...rule, value: ['Tape'] })).toBe(false);
        expect(matchesFilterRule(item, { ...rule, field: 'musicArtists', value: ['pharaoh'] })).toBe(true);
        expect(musicCredits({ artist: 'AC/DC' }).artists).toEqual(['AC/DC']);
        expect(musicCredits({ musicKind: 'album', tracks: [track({ artist: 'Artist ft. Guest' })] })).toEqual({ artists: ['Artist', 'Guest'], guests: ['Guest'] });
    });
    it('completes nonempty albums, reverses completion, and preserves repeat', () => {
        expect(statusAfterTrackChange('planned', [])).toBe('planned');
        expect(statusAfterTrackChange('completed', [])).toBe('completed');
        expect(statusAfterTrackChange('planned', [track({ listened: true }), track({ id: 't2' })])).toBe('listening');
        expect(statusAfterTrackChange('listening', [track({ listened: true })])).toBe('completed');
        expect(statusAfterTrackChange('completed', [track()])).toBe('planned');
        expect(statusAfterTrackChange('completed', [track(), track({ id: 't2', listened: true })])).toBe('listening');
        expect(statusAfterTrackChange('on_repeat', [track({ listened: true })])).toBe('on_repeat');
    });
    it('parses durations without accepting malformed or negative values', () => {
        expect(durationSeconds('3:09')).toBe(189);
        expect(formatDuration(189)).toBe('3:09');
        expect(durationSeconds('3:99')).toBeNull();
        expect(durationSeconds('-7')).toBeNull();
        expect(durationSeconds('')).toBeNull();
    });
    it('normalizes invalid tracks and keeps distinct stable ids', () => {
        const tracks = normalizeMusicTracks([null, track(), track({ listened: true }), { title: 'Third', userRating: 99 }]);
        expect(new Set(tracks.map(t => t.id)).size).toBe(3);
        expect(tracks[1].listened).toBe(true);
        expect(tracks[2].userRating).toBeNull();
    });
    it('defaults to albums and persists the song filter on reload', () => {
        const defaults = DEFAULT_SETTINGS.music.viewState;
        expect(defaults.rules[0]).toMatchObject({ field: 'musicKind', value: ['album'] });
        const raw = { viewState: { ...defaults, rules: [{ ...defaults.rules[0], value: ['track'] }] } };
        expect(normalizeLibraryViewSettings(raw, defaults).viewState.rules[0].value).toEqual(['track']);
    });
    it('exposes music statuses and kind while omitting listening dates', () => {
        expect(getStatusOptionsForMediaType('music').map(s => s.status)).toContain('on_repeat');
        expect(getSortOptionsForMediaType('music').some(s => s.field.startsWith('date'))).toBe(false);
        const fields = getBuiltInFieldDefinitions('music', getStatusOptionsForMediaType('music'), { showAdult: false, showCustom: false });
        expect(fields.map(f => f.id)).toContain('musicKind');
        expect(fields.map(f => f.id)).not.toContain('dateStarted');
        expect(fields.map(f => f.id)).not.toContain('dateFinished');
    });
    it('uses square cover height plus footer in virtualized layouts', () => {
        const layout = new LayoutCalculator(() => 1000);
        const effective = layout.getEffectiveLayout(DEFAULT_SETTINGS.music, 'grid');
        expect(layout.calculateActualCardHeight(effective, 4, { clientWidth: 1000 } as HTMLElement)).toBe(278);
        const phone = new LayoutCalculator(() => 390);
        expect(phone.calculateActualCardHeight(phone.getEffectiveLayout(DEFAULT_SETTINGS.music, 'grid'), 2, { clientWidth: 390 } as HTMLElement)).toBe(228);
        expect(layout.getCardHeight(layout.getEffectiveLayout(DEFAULT_SETTINGS.music, 'horizontal'))).toBe(180);
    });
});

describe('music provider contracts', () => {
    it('ignores the Last.fm star placeholder and resolves song artwork through MusicBrainz releases', async () => {
        const placeholder = 'https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png';
        const lastfm = await searchMusic(async () => ({ results: { trackmatches: { track: {
            name: 'Song', artist: 'Artist', image: [{ '#text': placeholder }],
        } } } }), 'lastfm', 'track', 'Song', 1, 'key');
        expect(lastfm[0].image).toBe('');
        const fetch = vi.fn(async () => ({ recordings: [{ releases: [{ id: 'release-1', 'release-group': { id: 'group-1' } }] }] }));
        const artwork = await findMusicBrainzArtwork(fetch, 'track', 'Song', 'Artist');
        expect(artwork).toEqual([
            'https://coverartarchive.org/release/release-1/front-500',
            'https://coverartarchive.org/release-group/group-1/front-500',
        ]);
        expect(new URL(fetch.mock.calls[0][0]).searchParams.get('query')).toBe('recording:(Song) AND artist:(Artist)');
    });
    it('fills an entire Last.fm result page from one MusicBrainz result set', () => {
        const lastfm = [
            selection({ provider: 'lastfm', kind: 'track', title: 'Song', artist: 'Artist', image: '' }),
            selection({ provider: 'lastfm', kind: 'track', title: 'Other', artist: 'Someone', image: '' }),
        ];
        const musicbrainz = [selection({ kind: 'track', title: 'song', artist: 'ARTIST', image: 'cover', fallbackImage: 'fallback' })];
        const merged = mergeMusicBrainzArtwork(lastfm, musicbrainz);
        expect(merged[0]).toMatchObject({ image: 'cover', fallbackImage: 'fallback' });
        expect(merged[1].image).toBe('');
    });
    it('does not request search or details from a disabled provider', async () => {
        const catalog = new MusicCatalog(() => '', () => false);
        await expect(catalog.search('musicbrainz', 'album', 'Album')).rejects.toThrow('disabled');
        await expect(catalog.details(selection())).rejects.toThrow('disabled');
    });
    it('merges duplicate album credits and ranks exact titles without merging different artists', () => {
        const first = selection({ title: 'PHUNERAL', artist: 'Pharaoh', image: '' });
        const duplicate = selection({ id: 'other-release', title: 'phuneral', artist: 'PHARAOH feat. РУБЛЬ', image: 'cover' });
        const unrelated = selection({ id: 'other', title: 'Other album', artist: 'Phuneral' });
        const namesake = selection({ id: 'namesake', title: 'PHUNERAL', artist: 'Someone else' });
        const results = organizeMusicResults([unrelated, first, duplicate, namesake], 'phuneral');
        expect(results).toHaveLength(3);
        expect(results[0].image).toBe('cover');
        expect(results[2]).toBe(unrelated);
        expect(musicSearchIdentity(first)).toBe(musicSearchIdentity(duplicate));
        expect(musicSearchIdentity({ ...first, kind: 'track' })).not.toBe(musicSearchIdentity({ ...duplicate, kind: 'track' }));
    });
    it('searches releases with pagination and builds CAA cover URLs', async () => {
        const fetch = vi.fn(async () => ({ releases: [{ id: 'r1', title: 'A', date: '2020-02-01', 'artist-credit': [{ name: 'Artist' }] }] }));
        const results = await searchMusic(fetch, 'musicbrainz', 'album', 'A', 2);
        expect(new URL(fetch.mock.calls[0][0]).searchParams.get('offset')).toBe('20');
        expect(results[0]).toMatchObject({ artist: 'Artist', year: '2020', image: 'https://coverartarchive.org/release/r1/front-500' });
    });
    it('searches title and artist as escaped text', async () => {
        const fetch = vi.fn(async () => ({ releases: [] }));
        await searchMusic(fetch, 'musicbrainz', 'album', 'Pharaoh');
        expect(new URL(fetch.mock.calls[0][0]).searchParams.get('query')).toBe('(release:(Pharaoh) OR artist:(Pharaoh))');
    });
    it('imports MusicBrainz annotations as descriptions', async () => {
        const fetch = vi.fn(async () => ({ id: 'release-1', title: 'Album', annotation: 'Release notes' }));
        const item = await getMusicDetails(fetch, selection());
        expect(item.description).toBe('Release notes');
        expect(new URL(fetch.mock.calls[0][0]).searchParams.get('inc')).toContain('annotation');
    });
    it('resolves original release dates only for matching titles and artists', async () => {
        const fetch = async () => ({ 'release-groups': [
            { title: 'Master of Puppets', 'artist-credit': [{ name: 'Other artist' }], 'first-release-date': '1980' },
            { title: 'Other album', 'artist-credit': [{ name: 'Metallica' }], 'first-release-date': '1981' },
            { title: 'Master of Puppets', 'artist-credit': [{ name: 'Metallica' }], 'first-release-date': '1986-03-03' },
        ] });
        expect(await findMusicBrainzReleaseDate(fetch, 'album', 'Master of Puppets', 'Metallica')).toBe('1986-03-03');
        expect(await findMusicBrainzReleaseDate(fetch, 'album', 'Missing', 'Metallica')).toBeNull();
    });
    it('imports legacy Last.fm release dates and derives the year', async () => {
        const item = await getMusicDetails(async () => ({ album: {
            name: 'Master of Puppets', artist: 'Metallica', releasedate: '3 Mar 1986, 00:00',
        } }), selection({ provider: 'lastfm' }), 'key');
        expect(item.releaseDate).toBe('1986-03-03');
        expect(item.year).toBe(1986);
    });
    it('uses optional Last.fm description without replacing MusicBrainz metadata', async () => {
        const fetch = vi.fn(async (url: string) => url.includes('musicbrainz.org')
            ? { id: 'release-1', title: 'Album' }
            : { album: { name: 'Album', artist: 'Artist', wiki: { content: '<p>Album history</p>' } } });
        const item = await getMusicDetails(fetch, selection(), 'key');
        expect(item.description).toBe('Album history');
        expect(item.integrationProvider).toBe('musicbrainz');
    });
    it('keeps a valid album when optional description enrichment fails', async () => {
        const item = await getMusicDetails(async url => {
            if (!url.includes('musicbrainz.org')) throw new Error('offline');
            return { id: 'release-1', title: 'Album' };
        }, selection(), 'key');
        expect(item.displayName).toBe('Album'); expect(item.description).toBe('');
    });
    it('searches songs separately and tolerates no cover release', async () => {
        const fetch = vi.fn(async () => ({ recordings: [{ id: 'song', title: 'Song' }] }));
        expect((await searchMusic(fetch, 'musicbrainz', 'track', 'Song'))[0]).toMatchObject({ kind: 'track', image: '' });
        expect(fetch.mock.calls[0][0]).toContain('/recording?');
    });
    it('imports multiple discs, artist joins, recording ids and milliseconds', async () => {
        const item = await getMusicDetails(async () => ({ id: 'release-1', title: 'Album', date: '2018-09',
            'artist-credit': [{ name: 'A', joinphrase: ' & ' }, { name: 'B' }], genres: [{ name: 'rock' }],
            media: [{ position: 1, tracks: [{ id: 't1', title: 'One', length: 180000, recording: { id: 'rec1' } }] },
                { position: 2, tracks: [{ id: 't2', recording: { id: 'rec2', title: 'Two', length: 210000 } }] }] }), selection());
        expect(item.artist).toBe('A & B');
        expect(item.tracks[1]).toMatchObject({ title: 'Two', disc: 2, duration: 210, recordingId: 'rec2' });
        expect(item.duration).toBe(390); expect(item.year).toBe(2018); expect(item.genres).toEqual(['rock']);
        expect(item.releaseDate).toBe('2018-09');
    });
    it('does not invent an album duration for incomplete metadata', async () => {
        const item = await getMusicDetails(async () => ({ id: 'r', media: [{ tracks: [{ title: 'Unknown duration' }] }] }), selection());
        expect(item.tracks[0].duration).toBeNull(); expect(item.duration).toBeNull();
    });
    it('loads song metadata without adding the whole album', async () => {
        const item = await getMusicDetails(async () => ({ id: 'rec', title: 'Song', length: 202000, releases: [{ id: 'r', title: 'Parent', date: '2022' }] }), selection({ id: 'rec', kind: 'track' }));
        expect(item.album).toBe('Parent'); expect(item.duration).toBe(202); expect(item.tracks).toEqual([]);
    });
    it('requires a Last.fm key and surfaces API errors', async () => {
        const fetch = vi.fn(async () => ({ error: 10, message: 'Invalid key' }));
        await expect(searchMusic(fetch, 'lastfm', 'album', 'A')).rejects.toThrow('API key');
        expect(fetch).not.toHaveBeenCalled();
        await expect(searchMusic(fetch, 'lastfm', 'album', 'A', 1, 'key')).rejects.toThrow('Last.fm request failed');
    });
    it('supports singleton Last.fm matches and tracklists', async () => {
        const results = await searchMusic(async () => ({ results: { albummatches: { album: { name: 'A', artist: 'B', image: [{ '#text': 'cover' }] } } } }), 'lastfm', 'album', 'A', 1, 'key');
        expect(results).toHaveLength(1);
        const item = await getMusicDetails(async () => ({ album: { name: 'A', artist: 'B', tracks: { track: { name: 'Song', duration: '200' } }, tags: { tag: { name: 'indie' } } } }), results[0], 'key');
        expect(item.tracks).toHaveLength(1); expect(item.duration).toBe(200); expect(item.genres).toEqual(['indie']);
    });
    it('uses milliseconds for Last.fm song details', async () => {
        const item = await getMusicDetails(async () => ({ track: { name: 'Song', duration: '240000', artist: { name: 'A' }, album: { title: 'Parent', image: [{ '#text': 'cover' }] } } }), selection({ provider: 'lastfm', kind: 'track' }), 'key');
        expect(item.duration).toBe(240); expect(item.album).toBe('Parent'); expect(item.poster).toBe('cover');
    });
});

function vaultFixture(compactTemplates = false, settings = structuredClone(DEFAULT_SETTINGS), templates = false) {
    const files = new Map<string, TFile>();
    const metadata = new Map<string, Record<string, unknown>>();
    const contents = new Map<string, string>();
    const app = {
        vault: {
            getMarkdownFiles: () => [...files.values()],
            getAbstractFileByPath: (path: string) => files.get(path) || (path === 'Music' ? { path } : null),
            createFolder: vi.fn(),
            create: vi.fn(async (path: string, content: string) => {
                if (files.has(path)) throw new Error('Exists');
                const file = new TFile(path, path.split('/').pop()!.replace(/\.md$/, ''));
                files.set(path, file); contents.set(path, content); return file;
            }),
            cachedRead: async (file: TFile) => contents.get(file.path) || '',
            process: async (file: TFile, mutate: (content: string) => string) => contents.set(file.path, mutate(contents.get(file.path) || '')),
        },
        metadataCache: { getFileCache: (file: TFile) => ({ frontmatter: metadata.get(file.path) }) },
        fileManager: {
            processFrontMatter: async (file: TFile, mutate: (fm: Record<string, unknown>) => void) => {
                const fm = metadata.get(file.path)!; mutate(fm);
            },
            trashFile: vi.fn(async (file: TFile) => files.delete(file.path)),
        },
    };
    settings.integrations.compactTemplates = compactTemplates;
    settings.music.noteTemplate!.templateEnabled = templates;
    const service = new MusicService(app as unknown as App, 'Music', new MetadataService(app as unknown as App, () => settings));
    const flush = () => { for (const [path, text] of contents) if (!metadata.has(path)) metadata.set(path, JSON.parse(text.split('---')[1])); };
    return { app, service, metadata, contents, flush };
}
describe('music note persistence', () => {
    it('round-trips advanced music properties and typed album tracks after a property rename', async () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        const config = settings.music.noteTemplate!;
        switchTemplateMode('music', config, 'advanced');
        config.template = config.template
            .replace(/^title:/m, '"Название альбома":')
            .replace(/^tracks:/m, '"Список: треки":')
            .replace(/^type:/m, 'media_type:') + '\n## Listening notes\n';
        rememberAdvancedTemplate('music', config);
        const { service, contents, metadata } = vaultFixture(false, settings, true);
        const { item } = await service.createItem({ ...emptyMusicItem(), displayName: 'An album', tracks: [track()] });
        const content = contents.get(item.filePath)!;
        expect(content).toContain('## Listening notes');
        const line = content.split('\n').find(candidate => candidate.startsWith('"Список: треки": '))!;
        const tracks: unknown = JSON.parse(line.slice('"Список: треки": '.length));
        expect(tracks).toMatchObject([{ title: 'Song', duration: 200, listened: false }]);
        expect(content).toContain('media_type: "music"');
        expect(content).toContain('"Название альбома": "An album"');
        const fm = { media_type: 'music', music_kind: 'album', 'Название альбома': 'An album', 'Список: треки': tracks };
        metadata.set(item.filePath, fm);
        config.template = config.template.replace('"Название альбома":', 'record_title:');
        rememberAdvancedTemplate('music', config);
        const [loaded] = await service.loadItems();
        expect(loaded).toMatchObject({ displayName: 'An album', tracks: [{ title: 'Song' }] });
        await service.updateItem(loaded, { displayName: 'Edited album', tracks: [track({ listened: true })] });
        expect(fm).toMatchObject({ record_title: 'Edited album', 'Список: треки': [{ listened: true }] });
        expect(fm).not.toHaveProperty('Название альбома');
    });

    it('omits empty music properties in compact mode and inserts a later rating in schema order', async () => {
        const { service, metadata, contents, flush } = vaultFixture(true);
        const { item } = await service.createItem({ ...emptyMusicItem(), displayName: 'Album' });
        const created = JSON.parse(contents.get(item.filePath)!.split('---')[1]);
        expect(created).not.toHaveProperty('poster');
        expect(created).not.toHaveProperty('rating');
        expect(created).not.toHaveProperty('tracks');
        expect(created.favorite).toBe(false);
        flush();
        await service.updateItem(item, { userRating: 8 });
        const fm = metadata.get(item.filePath)!;
        expect(fm.rating).toBe(8);
        expect(Object.keys(fm).indexOf('rating')).toBeLessThan(Object.keys(fm).indexOf('favorite'));
        await service.updateItem(item, { userRating: null });
        expect(fm).not.toHaveProperty('rating');
        expect(fm).not.toHaveProperty('tracks');
        expect(fm.favorite).toBe(false);
    });
    it('round-trips custom statuses and preserves them when album progress changes', async () => {
        const { service, flush } = vaultFixture();
        const { item } = await service.createItem({ ...emptyMusicItem(), displayName: 'Collection', status: 'custom_collect', tracks: [track({ listened: true })] });
        flush();
        expect((await service.loadItems())[0].status).toBe('custom_collect');
        await service.updateItem(item, { tracks: [track({ listened: false })] });
        const reloaded = (await service.loadItems())[0];
        expect(reloaded.status).toBe('custom_collect');
        expect(service.calculateStats([reloaded]).customStatusCounts).toEqual({ custom_collect: 1 });
    });
    it('preserves release dates across creation, parsing and editing', async () => {
        const { service, contents, flush, metadata } = vaultFixture();
        const { item } = await service.createItem({ ...emptyMusicItem(), displayName: 'Album', releaseDate: '1986-03-03', year: 1986 });
        expect(JSON.parse(contents.get(item.filePath)!.split('---')[1]).released).toBe('1986-03-03');
        flush();
        expect((await service.loadItems())[0].releaseDate).toBe('1986-03-03');
        await service.updateItem(item, { releaseDate: '1986-03' });
        expect(metadata.get(item.filePath)?.released).toBe('1986-03');
    });
    it('creates album notes without listening dates and serializes duplicate creation', async () => {
        const { service, app, contents } = vaultFixture();
        const draft = { ...emptyMusicItem(), displayName: 'A: / Test', artist: 'Artist', tracks: [track()] };
        const [first, second] = await Promise.all([service.createItem(draft), service.createItem(draft)]);
        expect(first.created).toBe(true); expect(second.created).toBe(false);
        expect(app.vault.create).toHaveBeenCalledTimes(1);
        expect(first.item.filePath.startsWith('Music/')).toBe(true);
        const fm = JSON.parse(contents.get(first.item.filePath)!.split('---')[1]);
        expect(fm).toMatchObject({ type: 'music', music_kind: 'album' });
        expect(fm).not.toHaveProperty('started'); expect(fm).not.toHaveProperty('finished');
        expect(fm).not.toHaveProperty('parent_album'); expect(fm).not.toHaveProperty('parent_track_id');
        expect(fm).not.toHaveProperty('album');
        expect(fm.tracks).toHaveLength(1);
    });
    it('reserves empty song relationships and keeps their positions when saved', async () => {
        const { service, metadata, contents, flush } = vaultFixture();
        const { item } = await service.createItem({ ...emptyMusicItem(), musicKind: 'track', displayName: 'Song' });
        const fm = JSON.parse(contents.get(item.filePath)!.split('---')[1]);
        expect(fm.parent_album).toBeNull(); expect(fm.parent_track_id).toBeNull();
        flush(); Object.assign(metadata.get(item.filePath)!, { parent_album: '', parent_track_id: '', album: '' });
        await service.updateItem(item, { favorite: true });
        const saved = metadata.get(item.filePath)!;
        expect(saved.parent_album).toBe('');
        expect(saved.parent_track_id).toBe('');
        expect(saved.album).toBe('');
        expect(Object.keys(saved)).toEqual(Object.keys(fm));
    });
    it('roundtrips song progress, preserves unknown YAML and other notes sections', async () => {
        const { service, metadata, contents, flush } = vaultFixture();
        const { item } = await service.createItem({ ...emptyMusicItem(), displayName: 'Album', tracks: [track()] });
        flush(); metadata.get(item.filePath)!.custom = 'keep';
        contents.set(item.filePath, contents.get(item.filePath)! + '\n## Other\n\nDo not touch\n');
        await service.updateItem(item, { tracks: [track({ listened: true, userRating: 4.5, favorite: true })], myNotes: 'Personal note' });
        expect(metadata.get(item.filePath)).toMatchObject({ custom: 'keep', status: 'completed', duration: 200 });
        const loaded = (await service.loadItems())[0];
        expect(loaded.tracks[0]).toMatchObject({ listened: true, userRating: 4.5, favorite: true });
        expect(await service.readNotes(loaded)).toBe('Personal note');
        expect(contents.get(item.filePath)).toContain('Do not touch');
    });
    it('does not overwrite unrelated metadata during a quick rating change', async () => {
        const { service, metadata, flush } = vaultFixture();
        const { item } = await service.createItem({ ...emptyMusicItem(), displayName: 'Album' }); flush();
        metadata.get(item.filePath)!.artist = 'Edited outside plugin';
        metadata.get(item.filePath)!.cssclasses = ['custom-note'];
        await service.updateItem(item, { userRating: 5 });
        expect(metadata.get(item.filePath)).toMatchObject({ rating: 5, artist: 'Edited outside plugin' });
        expect(metadata.get(item.filePath)!.cssclasses).toEqual(['custom-note', 'lorebase-music-note']);
    });
    it('extracts only the chosen song and links it to its album, without duplicates', async () => {
        const { service } = vaultFixture();
        const song = track({ favorite: true, userRating: 5, recordingId: 'rec-1' });
        const { item: album } = await service.createItem({ ...emptyMusicItem(), displayName: 'Album', artist: 'Artist', tracks: [song] });
        const result = await service.addAlbumTrack(album, song);
        expect(result.item).toMatchObject({ musicKind: 'track', parentAlbum: album.filePath, parentTrackId: song.id,
            integrationId: 'rec-1', album: 'Album', favorite: true, userRating: 5, tracks: [] });
        expect((await service.addAlbumTrack(album, song)).created).toBe(false);
        expect(await service.loadItems()).toHaveLength(2);
    });
    it('keeps songs out of the default album view and searches by artist', () => {
        const { service } = vaultFixture();
        const album = { ...emptyMusicItem(), displayName: 'Album', nameLower: 'album artist', artist: 'Artist' };
        const song: MusicItem = { ...album, musicKind: 'track', displayName: 'Song' };
        const filter = { searchTerm: 'artist', statuses: [], favoriteOnly: false, adultOnly: false, customOnly: false, tags: [], genres: [], rules: DEFAULT_SETTINGS.music.viewState.rules };
        expect(service.filterAndSort([song, album], filter, 'name', 'asc')).toEqual([album]);
        expect(service.filterAndSort([song, album], { ...filter, rules: [] }, 'name', 'asc')).toHaveLength(2);
    });
    it('reports repeat separately in statistics and uses the trash on deletion', async () => {
        const { service, app } = vaultFixture();
        const { item } = await service.createItem({ ...emptyMusicItem(), displayName: 'Album', status: 'on_repeat' });
        expect(service.calculateStats([item])).toMatchObject({ total: 1, on_repeat: 1, completed: 0 });
        await service.deleteItem(item); expect(app.fileManager.trashFile).toHaveBeenCalledTimes(1);
    });
});
