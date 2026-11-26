// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnimeService } from '../src/services/AnimeService';
import { VideoService } from '../src/services/VideoService';
import { getPartPoster, normalizePosterMode } from '../src/services/media/partPoster';
import { cancelPosterLoad, setSmoothPoster } from '../src/components/SmoothPoster';
import { createMockApp, createMetadataService, createMockFile } from './helpers/testHelpers';
import { toAnimePartsFrontmatter, toVideoPartsFrontmatter } from '../src/services/integrations/enrichment';
import { GameCard } from '../src/components/GameCard';
import { DEFAULT_COVER } from '../src/constants';
import { TFolder } from 'obsidian';

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });
const title = 'https://cdn.example/title.jpg';
const first = { id: 'first', title: 'First', kind: 'tv', seasonNumber: 1, episodeCurrent: 4, episodeTotal: 10, status: 'watching', poster: 'https://cdn.example/first.jpg', year: 2022, episodeDuration: 24 } as any;
const second = { ...first, id: 'second', title: 'Second', poster: 'Covers/Second.jpg', seasonNumber: 2 };

describe('part cover policy', () => {
    it('prefers the active cover and falls back only to the title cover', () => {
        expect(getPartPoster([first, second], 'first', undefined, title)).toBe(first.poster);
        expect(getPartPoster([first, { ...second, poster: null }], 'second', undefined, title)).toBe(title);
        expect(getPartPoster([first, second], 'second', 'title', title)).toBe(title);
        expect(getPartPoster([first, second], 'missing', undefined, title)).toBe(first.poster);
        expect(getPartPoster([], null, undefined, title)).toBe(title);
        expect(normalizePosterMode('invalid')).toBe('active-part');
    });
    it('resolves a local part cover without changing any stored paths', () => {
        const parts = [structuredClone(first), structuredClone(second)];
        expect(getPartPoster(parts, 'second', undefined, title, path => path === second.poster ? 'app://second' : null)).toBe('app://second');
        expect(getPartPoster(parts, 'second', undefined, title, () => null)).toBe(title);
        expect(parts[1].poster).toBe('Covers/Second.jpg');
    });
    it.each(['anime', 'series'] as const)('round trips %s mode and independent covers without rewriting the title poster', async type => {
        const file = createMockFile('Title.md', 'Title');
        const cover = createMockFile('Covers/Second.jpg', 'Second');
        const parts = [first, second].map(part => ({ ...part, kind: type === 'anime' ? 'tv' : 'season' })) as any;
        const metadata: Record<string, any> = { type, title: 'Title', poster: title, cm_poster: 'https://cdn.example/custom.jpg', active_part_id: 'second', [type === 'anime' ? 'anime_parts' : 'series_parts']: type === 'anime' ? toAnimePartsFrontmatter(parts) : toVideoPartsFrontmatter(parts) };
        const app = createMockApp({ [file.path]: { frontmatter: metadata } });
        app.vault.getAbstractFileByPath = ((path: string) => path === file.path ? file : path === cover.path ? cover : null) as any;
        app.vault.getFiles = () => [file, cover];
        app.vault.getResourcePath = path => 'app://vault/' + path.path;
        app.fileManager.processFrontMatter = async (_file, update) => update(metadata);
        const metadataService = createMetadataService(app);
        const service = type === 'anime' ? new AnimeService(app, metadataService) : new VideoService(app, 'series', '', metadataService);
        const parse = () => type === 'anime' ? (service as AnimeService).parseAnimeFromCache(file)! : (service as VideoService).parseFromCache(file)!;
        const item = parse();
        expect(item.imageUrl).toBe('app://vault/Covers/Second.jpg');
        expect(item.titleImageUrl).toBe('https://cdn.example/custom.jpg');
        expect(item.poster).toBe(title);
        expect(item.posterMode).toBe('active-part');
        if (type === 'anime') await (service as AnimeService).updateAnime(item as any, { posterMode: 'title', activePartId: 'first' });
        else await (service as VideoService).updateItem(item as any, { posterMode: 'title', activePartId: 'first' });
        expect(metadata.poster).toBe(title);
        expect(metadata.cm_poster).toBe('https://cdn.example/custom.jpg');
        expect(metadata.poster_mode).toBe('title');
        expect(parse().imageUrl).toBe('https://cdn.example/custom.jpg');
        expect(parse().parts?.[1].poster).toBe('Covers/Second.jpg');
        if (type === 'anime') await (service as AnimeService).updateAnime(parse() as any, { posterMode: 'active-part' });
        else await (service as VideoService).updateItem(parse() as any, { posterMode: 'active-part' });
        expect(parse().imageUrl).toBe(first.poster);
        expect(metadata.poster).toBe(title);
    });
    it('keeps the active cover first for both card layouts and falls back to the resolved title cover', () => {
        const card = Object.create(GameCard.prototype) as any;
        card.game = { type: 'series', imageUrl: first.poster, titleImageUrl: title, poster: 'Covers/Title.jpg', horizontalImageUrl: 'https://cdn.example/wide.jpg', posterMode: 'active-part' };
        expect(card.getCardImageCandidates(false).slice(0, 2)).toEqual([first.poster, title]);
        expect(card.getCardImageCandidates(true).slice(0, 2)).toEqual([first.poster, title]);
        card.game.posterMode = 'title';
        card.game.imageUrl = title;
        expect(card.getCardImageCandidates(false)[0]).toBe(title);
        card.game.posterMode = 'active-part';
        expect(card.getCardImageCandidates(true)[0]).toBe('https://cdn.example/wide.jpg');
    });
    it.each(['anime', 'series'] as const)('updates cached %s covers from library settings without rewriting note metadata', async type => {
        const file = createMockFile('Library/Title.md', 'Title');
        const parts = [{ ...first, kind: type === 'anime' ? 'tv' : 'season' }] as any;
        const metadata = { type, title: 'Title', poster: title, poster_mode: 'title', active_part_id: 'first',
            [type === 'anime' ? 'anime_parts' : 'series_parts']: type === 'anime' ? toAnimePartsFrontmatter(parts) : toVideoPartsFrontmatter(parts) };
        const original = structuredClone(metadata);
        const app = createMockApp({ [file.path]: { frontmatter: metadata } });
        const folder = new TFolder(); folder.path = 'Library'; folder.children = [file];
        app.vault.getAbstractFileByPath = path => path === 'Library' ? folder : file;
        const service = type === 'anime' ? new AnimeService(app, createMetadataService(app)) : new VideoService(app, 'series', 'Library', createMetadataService(app));
        service.setFolderPath('Library');
        service.setPosterMode('active-part');
        const load = () => type === 'anime' ? (service as AnimeService).loadAnime() : (service as VideoService).loadItems();
        const active = await load();
        expect(active[0].imageUrl).toBe(first.poster);
        expect(await load()).toBe(active);
        service.setPosterMode('title');
        const pinned = await load();
        expect(pinned).not.toBe(active);
        expect(pinned[0].imageUrl).toBe(title);
        expect(pinned[0].titleImageUrl).toBe(title);
        service.setPosterMode('active-part');
        expect((await load())[0].imageUrl).toBe(first.poster);
        expect(metadata).toEqual(original);
    });
});

function posterHarness() {
    const image = document.createElement('img');
    image.src = title;
    document.body.appendChild(image);
    const loaders: HTMLImageElement[] = [];
    const create = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string, options?: any) => {
        const element = create(tag, options);
        if (tag === 'img') {
            Object.defineProperty(element, 'decode', { configurable: true, value: vi.fn().mockResolvedValue(undefined) });
            loaders.push(element as HTMLImageElement);
        }
        return element;
    }) as any);
    return { image, loaders };
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

describe('decoded cover swapping', () => {
    it('finishes loading a detached cached card so it is ready on return', async () => {
        const { image, loaders } = posterHarness();
        setSmoothPoster(image, [first.poster, title]);
        image.remove();
        loaders[0].dispatchEvent(new Event('load'));
        await settle();
        expect(image.src).toBe(first.poster);
        document.body.appendChild(image);
        expect(image.src).toBe(first.poster);
    });
    it('keeps the previous source until the replacement is loaded and decoded', async () => {
        const { image, loaders } = posterHarness();
        setSmoothPoster(image, [first.poster, title]);
        expect(image.src).toBe(title);
        loaders[0].dispatchEvent(new Event('load'));
        await settle();
        expect(image.src).toBe(first.poster);
        setSmoothPoster(image, [first.poster, title]);
        expect(loaders).toHaveLength(1);
    });
    it('ignores an obsolete response after another part was activated', async () => {
        const { image, loaders } = posterHarness();
        let finishDecode!: () => void;
        setSmoothPoster(image, [first.poster, title]);
        Object.defineProperty(loaders[0], 'decode', { value: () => new Promise<void>(resolve => finishDecode = resolve) });
        loaders[0].dispatchEvent(new Event('load'));
        setSmoothPoster(image, ['https://cdn.example/second.jpg', title]);
        loaders[1].dispatchEvent(new Event('load')); await settle();
        finishDecode(); await settle();
        expect(image.src).toBe('https://cdn.example/second.jpg');
    });
    it('keeps the current image during a failed part load and then loads the shared cover', async () => {
        const { image, loaders } = posterHarness();
        image.src = first.poster;
        setSmoothPoster(image, ['https://cdn.example/broken.jpg', title]);
        loaders[0].dispatchEvent(new Event('error'));
        expect(image.src).toBe(first.poster);
        expect(loaders[1].src).toBe(title);
        loaders[1].dispatchEvent(new Event('load')); await settle();
        expect(image.src).toBe(title);
        expect(image.src).not.toBe(DEFAULT_COVER);
    });
    it('cancels pending work when the owning view closes', async () => {
        const { image, loaders } = posterHarness();
        setSmoothPoster(image, [first.poster, title]);
        const callback = loaders[0].onload!;
        cancelPosterLoad(image);
        callback.call(loaders[0], new Event('load'));
        await settle();
        expect(image.src).toBe(title);
        expect(document.querySelector('.lorebase-poster-transition')).toBeNull();
    });
    it('still validates an initial source and falls back when that source is broken', async () => {
        const { image, loaders } = posterHarness();
        setSmoothPoster(image, [title]);
        expect(loaders).toHaveLength(1);
        loaders[0].dispatchEvent(new Event('error'));
        expect(loaders[1].src).toBe(DEFAULT_COVER);
        loaders[1].dispatchEvent(new Event('load')); await settle();
        expect(image.src).toBe(DEFAULT_COVER);
    });
});
