import { describe, expect, it, vi } from 'vitest';
import { App, TFile } from 'obsidian';
import { DEFAULT_SETTINGS } from '../src/constants';
import { PeopleService } from '../src/services/PeopleService';
import { MetadataService } from '../src/services/MetadataService';
import { IntegrationService } from '../src/services/IntegrationService';
import { createMockApp } from './helpers/testHelpers';
import { getTmdbCast, getTvmazeCast, getTmdbPerson, getTmdbPersonName, normalizeCast, normalizeCredits } from '../src/services/integrations/providers/tmdbPeople';

const credit = (id = '1', media: 'movie' | 'series' = 'movie') => ({ id, media, provider: 'tmdb' as const, title: 'Same title', year: '2020', role: 'Character', acting: true, crew: false });
function fixture() {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.movies.folderPath = 'Movies'; settings.series.folderPath = 'Series';
    settings.integrations!.enabled = true; settings.integrations!.providers.tmdb.enabled = true; settings.integrations!.providers.tmdb.apiKey = 'key';
    settings.integrations!.media.movies.tmdbLanguage = 'uk-UA';
    const files: TFile[] = [], cache = new Map<string, object>();
    const app = { vault: { getMarkdownFiles: () => files, getAbstractFileByPath: (path: string) => files.find(file => file.path === path) }, metadataCache: { getFileCache: (file: TFile) => cache.get(file.path) } } as unknown as App;
    const create = vi.fn(async () => { const file = new TFile('Movies/new.md', 'new'); files.push(file); return file; });
    const metadata = { resolveFrontmatter: (_media: string, raw: object) => raw } as MetadataService;
    const service = new PeopleService(app, () => settings, metadata, create);
    const fetch = vi.fn(async () => ({ cast: [{ id: 10, name: 'Actor' }] }));
    (service as unknown as { fetch: typeof fetch }).fetch = fetch;
    return { service, settings, files, cache, create, fetch };
}

describe('TMDB people', () => {
    it('uses Russian aliases and role qualifiers while sending the chosen language to TMDB', async () => {
        const fetch = vi.fn(async (url: string) => {
            expect(new URL(url).searchParams.get('language')).toBe('ru-RU');
            return { id: 1, name: 'Bill Murray', also_known_as: ['Билл Мюррей'], combined_credits: { cast: [{ media_type: 'movie', id: 2, title: 'Фильм', character: 'Self' }] } };
        });
        expect(await getTmdbPersonName(fetch, '1', 'key', 'ru-RU')).toBe('Билл Мюррей');
        const person = await getTmdbPerson(fetch, '1', 'key', 'ru-RU');
        expect(person.name).toBe('Билл Мюррей'); expect(person.credits[0].character).toBe('В роли себя');
        expect(normalizeCast({ cast: [{ id: 1, name: 'Bill Murray', character: 'Garfield (voice)' }] }, 'ru-RU')[0].role).toBe('Garfield (озвучка)');
    });
    it('deduplicates cast and supports roles across TV seasons', () => {
        expect(normalizeCast({ cast: [{ id: 1, name: 'Actor', roles: [{ character: 'A' }, { character: 'B' }, { character: 'A' }] }, { id: 1, name: 'Actor' }, { id: null, name: 'Bad' }] })).toEqual([{ id: '1', name: 'Actor', role: 'A / B', photo: '' }]);
    });
    it('keeps film and TV IDs separate, merges work roles and sorts newest first', () => {
        const credits = normalizeCredits({ cast: [
            { id: 1, media_type: 'movie', title: 'Movie', release_date: '2020-01-01', character: 'Actor' },
            { id: 1, media_type: 'tv', name: 'Series', first_air_date: '2025-01-01' },
            { id: 2, media_type: 'movie', title: 'Hidden', adult: true },
        ], crew: [{ id: 1, media_type: 'movie', title: 'Movie', job: 'Director' }] });
        expect(credits).toHaveLength(2);
        expect(credits[0]).toMatchObject({ id: '1', media: 'series' });
        expect(credits[1]).toMatchObject({ acting: true, crew: true, role: 'Actor / Director', character: 'Actor', job: 'Director' });
    });
    it('falls back from aggregate TV cast and preserves selected language', async () => {
        const urls: string[] = [];
        const result = await getTmdbCast(async url => { urls.push(url); if (url.includes('aggregate')) throw new Error('unavailable'); return { cast: [{ id: 1, name: 'Actor' }] }; }, 'series', '8', 'key', 'uk-UA');
        expect(result[0].name).toBe('Actor'); expect(urls).toHaveLength(2);
        expect(urls.every(url => new URL(url).searchParams.get('language') === 'uk-UA')).toBe(true);
        expect(urls[1]).toContain('/tv/8/credits?');
    });
    it('rejects invalid IDs before requesting and mismatching person responses', async () => {
        const fetch = vi.fn(async () => ({ id: 3, name: 'Other person' }));
        await expect(getTmdbPerson(fetch, '../3', 'key', 'en-US')).rejects.toThrow(); expect(fetch).not.toHaveBeenCalled();
        await expect(getTmdbPerson(fetch, '2', 'key', 'en-US')).rejects.toThrow();
    });
    it('resolves TVmaze cast by the exact external show identity rather than searching actor names', async () => {
        const requests: string[] = [];
        const cast = await getTvmazeCast(async url => {
            requests.push(url);
            if (url.includes('api.tvmaze.com')) return { id: 55832, externals: { imdb: 'tt14824792', thetvdb: 404604 } };
            if (url.includes('/find/tt14824792')) return { tv_results: [{ id: 201 }] };
            if (url.includes('/tv/201/aggregate_credits')) return { cast: [{ id: 100, name: 'Scott Grimes', profile_path: '/photo.jpg', roles: [{ character: 'Matty' }] }] };
            throw new Error('Unexpected request');
        }, '55832', 'key', 'uk-UA');
        expect(cast[0]).toMatchObject({ id: '100', name: 'Scott Grimes', role: 'Matty', photo: 'https://image.tmdb.org/t/p/w185/photo.jpg' });
        expect(requests).toHaveLength(3); expect(requests.some(url => url.includes('/search/person'))).toBe(false);
        expect(new URL(requests[1]).searchParams.get('external_source')).toBe('imdb_id');
        expect(new URL(requests[2]).searchParams.get('language')).toBe('uk-UA');
    });
    it('uses the TVDB identity when IMDb does not produce a unique show', async () => {
        const requests: string[] = [];
        const cast = await getTvmazeCast(async url => {
            requests.push(url);
            if (url.includes('tvmaze')) return { id: 8, externals: { imdb: 'tt123', thetvdb: 77 } };
            if (url.includes('/find/tt123')) return { tv_results: [{ id: 1 }, { id: 2 }] };
            if (url.includes('/find/77')) return { tv_results: [{ id: 3 }] };
            return { cast: [{ id: 9, name: 'Correct actor' }] };
        }, '8', 'key', 'en-US');
        expect(cast[0].id).toBe('9');
        expect(new URL(requests[2]).searchParams.get('external_source')).toBe('tvdb_id');
        expect(requests[3]).toContain('/tv/3/aggregate_credits');
    });
    it('keeps TVmaze photos for unmapped shows without misusing TVmaze person IDs', async () => {
        const cast = await getTvmazeCast(async () => ({ id: 8, externals: {}, _embedded: { cast: [
            { person: { id: 100, name: 'Actor', image: { medium: 'https://static.tvmaze.com/uploads/images/medium_portrait/1/2.jpg' } }, character: { name: 'Character' } },
            { person: { id: 100, name: 'Actor' } },
            { person: { id: 101, name: 'Other actor', image: { medium: 'https://untrusted.example/photo.jpg' } } },
        ] } }), '8', 'key', 'en-US');
        expect(cast).toHaveLength(2);
        expect(cast[0]).toEqual({ id: '', name: 'Actor', photo: 'https://static.tvmaze.com/uploads/images/medium_portrait/1/2.jpg', role: 'Character' });
        expect(cast[1].photo).toBe('');
    });
    it('refuses mismatched TVmaze show responses', async () => {
        await expect(getTvmazeCast(async () => ({ id: 9 }), '8', 'key', 'en-US')).rejects.toThrow();
    });
});

describe('PeopleService library and request lifecycle', () => {
    it('coalesces alias requests and uses separate cache entries when TMDB language changes', async () => {
        const { service, fetch, settings } = fixture(); settings.integrations!.media.movies.tmdbLanguage = 'ru-RU';
        fetch.mockImplementation(async () => ({ id: 1, name: 'Bill Murray', also_known_as: ['Білл Мюррей', 'Билл Мюррей'] }) as any);
        const actor = { id: '1', name: 'Bill Murray', role: '', photo: '' };
        expect(await Promise.all([service.actorName(actor, 'movie'), service.actorName(actor, 'movie')])).toEqual(['Билл Мюррей', 'Билл Мюррей']);
        expect(fetch).toHaveBeenCalledOnce();
        settings.integrations!.media.movies.tmdbLanguage = 'uk-UA';
        expect(await service.actorName(actor, 'movie')).toBe('Білл Мюррей'); expect(fetch).toHaveBeenCalledTimes(2);
        expect(await service.actorName({ ...actor, name: 'Білл Мюррей' }, 'movie')).toBe('Білл Мюррей'); expect(fetch).toHaveBeenCalledTimes(2);
    });
    it('limits simultaneous alias requests to three', async () => {
        const { service, fetch, settings } = fixture(); settings.integrations!.media.movies.tmdbLanguage = 'ru-RU';
        const pending: Array<() => void> = []; let active = 0, maximum = 0;
        fetch.mockImplementation((url: string) => new Promise(resolve => {
            active++; maximum = Math.max(maximum, active);
            const id = Number(new URL(url).pathname.split('/').pop());
            pending.push(() => { active--; resolve({ id, name: 'Actor', also_known_as: ['Актёр'] } as any); });
        }));
        const tasks = Array.from({ length: 7 }, (_, index) => service.actorName({ id: String(index + 1), name: 'Actor', role: '', photo: '' }, 'movie'));
        expect(pending).toHaveLength(3);
        for (const count of [3, 3, 1]) {
            await vi.waitFor(() => expect(pending).toHaveLength(count)); pending.splice(0).forEach(done => done());
        }
        expect(await Promise.all(tasks)).toEqual(Array(7).fill('Актёр')); expect(maximum).toBe(3);
    });
    it('coalesces requests, caches results and refuses disabled integrations', async () => {
        const { service, fetch, settings } = fixture();
        const item = { type: 'movie', integrationProvider: 'tmdb', integrationId: '2' } as Parameters<PeopleService['cast']>[0];
        await Promise.all([service.cast(item), service.cast(item)]); await service.cast(item);
        expect(fetch).toHaveBeenCalledOnce(); expect(fetch.mock.calls[0][0]).toContain('language=uk-UA');
        settings.integrations!.enabled = false;
        expect(() => service.cast(item)).toThrow();
    });
    it('retries rejected requests instead of caching errors', async () => {
        const { service, fetch } = fixture(); fetch.mockRejectedValueOnce(new Error('offline'));
        const item = { type: 'movie', integrationProvider: 'tmdb', integrationId: '2' } as Parameters<PeopleService['cast']>[0];
        await expect(service.cast(item)).rejects.toThrow(); await service.cast(item); expect(fetch).toHaveBeenCalledTimes(2);
    });
    it('coalesces the full TVmaze to TMDB lookup and keeps the linked provider unchanged', async () => {
        const { service, fetch } = fixture();
        fetch.mockImplementation(async url => url.includes('tvmaze') ? { id: 8, externals: { imdb: 'tt123' } } : url.includes('/find/') ? { tv_results: [{ id: 99 }] } : { cast: [{ id: 10, name: 'Actor' }] });
        const item = { type: 'series', integrationProvider: 'tvmaze', integrationId: '8' } as Parameters<PeopleService['cast']>[0];
        const [first, second] = await Promise.all([service.cast(item), service.cast(item)]);
        expect(first).toEqual(second); expect(fetch).toHaveBeenCalledTimes(3); expect(item.integrationProvider).toBe('tvmaze'); expect(item.integrationId).toBe('8');
    });
    it('uses exact IDs first, separates media and distinguishes remakes', () => {
        const { service, files, cache } = fixture();
        const file = new TFile('Movies/old.md', 'old'); files.push(file);
        cache.set(file.path, { frontmatter: { type: 'movie', title: 'Same title', year: 2020, integration_provider: 'tmdb', integration_id: '1' } });
        const find = service.libraryIndex();
        expect(find({ ...credit(), title: 'Translated title' })).toBe(file);
        expect(find(credit('2'))).toBeNull(); expect(find(credit('1', 'series'))).toBeNull();
        cache.set(file.path, { frontmatter: { type: 'movie', title: 'Same title', year: 1990 } });
        expect(service.libraryIndex()(credit())).toBeNull();
    });
    it('serializes duplicate adds even while Obsidian metadata is still pending', async () => {
        const { service, create } = fixture();
        const [first, second] = await Promise.all([service.add(credit()), service.add(credit())]);
        expect(first).toBe(second); expect(create).toHaveBeenCalledOnce();
        expect(create.mock.calls[0][1]).toMatchObject({ tmdbLanguage: 'uk-UA', provider: 'tmdb' });
        expect(service.libraryIndex()(credit())).toBe(first);
    });
    it('recognizes linked titles when source fields are renamed by a custom template', () => {
        const { settings, files, cache } = fixture();
        Object.assign(settings.integrations!.media.movies, { templateEnabled: true, templateMode: 'advanced', template: '---\nsource: "{{VALUE:integration_provider}}"\nsource_id: "{{VALUE:integration_id}}"\n---' });
        const file = new TFile('Movies/Translated.md', 'Translated'); files.push(file);
        const app = { vault: { getMarkdownFiles: () => files, getAbstractFileByPath: () => file }, metadataCache: { getFileCache: () => ({ frontmatter: { type: 'movie', source: 'tmdb', source_id: '1' } }) } } as unknown as App;
        const service = new PeopleService(app, () => settings, new MetadataService(app, () => settings), vi.fn());
        expect(service.libraryIndex()(credit())).toBe(file);
    });
    it('allows retrying after an import failure', async () => {
        const { service, create } = fixture(); create.mockRejectedValueOnce(new Error('write failed'));
        await expect(service.add(credit())).rejects.toThrow(); expect(await service.add(credit())).toBeTruthy(); expect(create).toHaveBeenCalledTimes(2);
    });
});

describe('filmography import', () => {
    it.each(['movies', 'series'] as const)('uses the %s template and returns the created note without opening search', async kind => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings[kind].folderPath = kind;
        settings.integrations!.enabled = true;
        settings.integrations!.providers.tmdb.enabled = true; settings.integrations!.providers.tmdb.apiKey = 'key';
        settings.integrations!.imageStorage.enabled = false;
        Object.assign(settings.integrations!.media[kind], { templateEnabled: true, templateMode: 'advanced', template: '---\ntitle: "{{VALUE:name}}"\nyear: {{VALUE:year}}\ncustom: preserved\n---\nMy notes' });
        const app = createMockApp({});
        const file = new TFile(`${kind}/Title (2020).md`, 'Title (2020)');
        app.vault.create = vi.fn(async () => file); app.vault.createFolder = vi.fn(async () => undefined);
        const service = new IntegrationService(app, () => settings);
        const internals = service as any;
        internals.chooseResults = vi.fn();
        internals.fetchDetails = vi.fn(async () => ({ kind: 'video', name: 'Title', description: '', poster: '', genres: [], year: '2020', url: 'https://www.themoviedb.org/movie/1' }));
        expect(await service.addVideoSelection(kind, { ...credit(), tmdbLanguage: 'uk-UA' })).toBe(file);
        expect(internals.chooseResults).not.toHaveBeenCalled();
        expect(internals.fetchDetails.mock.calls[0][5]).toMatchObject({ tmdbLanguage: 'uk-UA' });
        const content = vi.mocked(app.vault.create).mock.calls[0][1];
        expect(content).toContain('custom: preserved'); expect(content).toContain('integration_provider: "tmdb"'); expect(content).toContain('My notes');
    });
});
