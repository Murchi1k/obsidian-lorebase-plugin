import { describe, expect, it, vi } from 'vitest';
import { App, TFile } from 'obsidian';
import { DEFAULT_SETTINGS } from '../src/constants';
import { RecommendationLibraryService } from '../src/services/RecommendationLibraryService';
import { RecommendationsService, type RecommendationTitle } from '../src/services/RecommendationsService';
import type { MetadataService } from '../src/services/MetadataService';
import type { SearchResult } from '../src/services/integrations/types';

function fixture() {
    const settings = structuredClone(DEFAULT_SETTINGS); settings.movies.folderPath = 'Movies'; settings.series.folderPath = 'Series'; settings.anime.folderPath = 'Anime';
    const files: TFile[] = [], cache = new Map<string, object>(), openLinkText = vi.fn(async () => {});
    const app = { vault: { getMarkdownFiles: () => files, getAbstractFileByPath: (path: string) => files.find(file => file.path === path) }, metadataCache: { getFileCache: (file: TFile) => cache.get(file.path) }, workspace: { openLinkText } } as unknown as App;
    const metadata = { resolveFrontmatter: (_: unknown, raw: object) => raw } as MetadataService;
    const create = vi.fn(async (kind: string, selection: SearchResult) => { const file = new TFile(`${kind === 'movies' ? 'Movies' : kind === 'series' ? 'Series' : 'Anime'}/${selection.title}.md`, selection.title); files.push(file); return file as TFile | null; });
    const library = new RecommendationLibraryService(app, () => settings, metadata, create);
    const seed = (path: string, fm: object) => { const file = new TFile(path, path.split('/').at(-1)!.slice(0, -3)); files.push(file); cache.set(path, { frontmatter: fm }); return file; };
    return { settings, library, create, files, cache, seed, openLinkText };
}
const selection: SearchResult = { provider: 'tmdb', id: '21', title: 'Movie', year: '2024' };
describe('recommendation library actions', () => {
    it('finds translated titles by exact source identity and avoids writing an existing note', async () => {
        const test = fixture(), file = test.seed('Movies/Перевод.md', { type: 'movie', title: 'Перевод', integration_provider: 'tmdb', integration_id: '21' });
        expect(test.library.index('movie')(selection)).toBe(file);
        expect(await test.library.add('movie', selection)).toBe(file); expect(test.create).not.toHaveBeenCalled();
        await test.library.open(file); expect(test.openLinkText).toHaveBeenCalledWith(file.path, '');
    });
    it('limits lookup to the correct library and does not conflate editions with different IDs', () => {
        const test = fixture();
        test.seed('Series/Movie.md', { type: 'series', title: 'Movie', integration_provider: 'tmdb', integration_id: '21' });
        test.seed('Movies/Other.md', { type: 'movie', title: 'Movie', year: 2024, integration_provider: 'tmdb', integration_id: '99' });
        expect(test.library.index('movie')(selection)).toBeNull();
    });
    it('uses a unique title/year fallback for another provider and supports aliases', () => {
        const test = fixture(), file = test.seed('Movies/Translated.md', { type: 'movie', title: 'Перевод', aliases: ['Movie'], year: 2024, integration_provider: 'omdb', integration_id: 'tt1' });
        expect(test.library.index('movie')(selection)).toBe(file);
        test.seed('Movies/Another.md', { type: 'movie', title: 'Movie', year: 2024 }); expect(test.library.index('movie')(selection)).toBeNull();
    });
    it('coalesces simultaneous adds and remembers newly created notes before the metadata cache updates', async () => {
        const test = fixture();
        const [first, second] = await Promise.all([test.library.add('movie', selection), test.library.add('movie', selection)]);
        expect(first).toBe(second); expect(test.create).toHaveBeenCalledOnce();
        expect(await test.library.add('movie', selection)).toBe(first); expect(test.create).toHaveBeenCalledOnce();
        test.files.length = 0; expect(test.library.index('movie')(selection)).toBeNull();
    });
    it('allows retry after an import fails', async () => {
        const test = fixture(); test.create.mockRejectedValueOnce(new Error('Offline'));
        await expect(test.library.add('anime', { ...selection, provider: 'anilist' })).rejects.toThrow('Offline');
        await expect(test.library.add('anime', { ...selection, provider: 'anilist' })).resolves.not.toBeNull(); expect(test.create).toHaveBeenCalledTimes(2);
    });
    it('routes anime and videos through their normal import selections, preserving TMDB language', async () => {
        const test = fixture(); test.settings.integrations!.media.movies.tmdbLanguage = 'uk-UA';
        const service = new RecommendationsService(() => test.settings, undefined, test.library);
        const work = { id: '21', title: 'Movie', image: 'https://image.test/poster.jpg', year: '2024', url: 'https://example.test/21' };
        await service.add({ type: 'movie' } as RecommendationTitle, 'TMDB', work);
        expect(test.create).toHaveBeenLastCalledWith('movies', expect.objectContaining({ provider: 'tmdb', id: '21', tmdbLanguage: 'uk-UA' }));
        await service.add({ type: 'anime' } as RecommendationTitle, 'AniList', work);
        expect(test.create).toHaveBeenLastCalledWith('anime', expect.objectContaining({ provider: 'anilist', id: '21' }));
        expect(service.libraryIndex({ type: 'anime' } as RecommendationTitle, 'AniList')(work)).not.toBeNull();
    });
});
