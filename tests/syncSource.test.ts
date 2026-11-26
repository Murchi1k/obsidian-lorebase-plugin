// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { syncSourceFromFrontmatter, withSyncSourceUrl } from '../src/utils/syncSource';
import { renderMediaSourcePanel } from '../src/modals/MediaSourcePanel';
import { DEFAULT_SETTINGS } from '../src/constants';
import { MetadataService } from '../src/services/MetadataService';
import { GameService } from '../src/services/GameService';
import { VideoService } from '../src/services/VideoService';
import { createMockApp, createMockFile } from './helpers/testHelpers';
import { installStatisticsDom } from './helpers/statisticsDom';
import { i18n } from '../src/localization';

const psn = { accountId: '123', titleId: 'PPSA00001_00', platform: 'PS5', conceptId: '10001850' };
const psnUrl = 'https://store.playstation.com/concept/10001850';
beforeEach(() => { installStatisticsDom(); i18n.setLanguage('en'); document.body.replaceChildren(); });

describe('primary sync source and additional catalog', () => {
    it('keeps a PSN primary URL when the catalog changes and retains both identities', async () => {
        const file = createMockFile('Games/Test.md', 'Test');
        const fm: Record<string, unknown> = { type: 'game', name: 'Game', playstation: psn, url: 'https://www.igdb.com/games/old', integration_provider: 'igdb', integration_id: '42' };
        const app = createMockApp({ [file.path]: { frontmatter: fm } });
        app.vault.getAbstractFileByPath = () => file;
        app.fileManager.processFrontMatter = async (_file, update) => update(fm);
        const metadata = new MetadataService(app);
        await metadata.updateMetadata(file, { url: 'https://www.igdb.com/games/new', plot: 'New plot' }, 'game');
        expect(fm).toMatchObject({ url: psnUrl, metadata_url: 'https://www.igdb.com/games/new', integration_provider: 'igdb', integration_id: '42', playstation: psn });
        const game = new GameService(app, metadata).parseGameFromCache(file)!;
        expect(game.syncSource).toEqual({ provider: 'playstation', id: psn.titleId, url: psnUrl });
        expect(game.metadataSourceUrl).toBe('https://www.igdb.com/games/new');
        const root = document.body.createDiv(); root.createDiv({ cls: 'lorebase-editmode-column-right' });
        renderMediaSourcePanel(root, game, async () => true, async () => true);
        expect(root.querySelector('.lorebase-source-origin')?.textContent).toContain('PrimaryPlayStation');
        expect(root.querySelector('.lorebase-source-catalog')?.textContent).toContain('AdditionalIGDB · 42');
        expect(root.querySelector('.lorebase-source-url-value')?.textContent).toBe(psnUrl);
    });
    it('supports old PSN notes without a Store concept ID and respects aliased URL fields', async () => {
        const file = createMockFile('Games/Test.md', 'Test'), settings = structuredClone(DEFAULT_SETTINGS);
        const fm: Record<string, unknown> = { type: 'game', playstation: { ...psn, conceptId: undefined }, Link: 'https://rawg.io/games/42' };
        settings.integrations!.media.games.fieldAliases = { url: 'Link' };
        const app = createMockApp({ [file.path]: { frontmatter: fm } }); app.fileManager.processFrontMatter = async (_file, update) => update(fm);
        await new MetadataService(app, () => settings).updateMetadata(file, { playstation: fm.playstation }, 'game');
        expect(fm.Link).toBe('https://library.playstation.com/recently-played');
        expect(fm.metadata_url).toBe('https://rawg.io/games/42'); expect(fm).not.toHaveProperty('url');
    });
    it.each(['movie', 'series'] as const)('renders Trakt as primary for %s while metadata retains its provider', type => {
        const file = createMockFile('Videos/Test.md', 'Test');
        const fm = { type, title: 'Title', trakt_id: '123', trakt_slug: 'a-title', integration_provider: 'tmdb', integration_id: '44', url: 'https://www.themoviedb.org/tv/44' };
        const url = 'https://trakt.tv/' + (type === 'series' ? 'shows' : 'movies') + '/a-title';
        expect(withSyncSourceUrl(type, fm, {})).toEqual({ url, metadata_url: fm.url });
        const app = createMockApp({ [file.path]: { frontmatter: fm } });
        const item = new VideoService(app, type, 'Videos', new MetadataService(app)).parseFromCache(file)!;
        expect(item.syncSource).toEqual({ provider: 'trakt', id: '123', url });
        expect(item.sourceUrl).toBe(url);
        expect(item.metadataSourceUrl).toBe(fm.url);
        const root = document.body.createDiv(); root.createDiv({ cls: 'lorebase-editmode-column-right' });
        renderMediaSourcePanel(root, item, async () => true);
        expect(root.querySelector('.lorebase-source-url-value')?.textContent).toBe(url);
        expect(root.querySelector('.lorebase-source-catalog')?.textContent).toContain('TMDB · 44');
    });
    it('recognizes legacy Trakt sync links and leaves ordinary catalog notes alone', () => {
        expect(syncSourceFromFrontmatter('series', { external_sync: { remote: { service: 'trakt', id: 'series:123' } } })?.url).toBe('https://trakt.tv/shows/123');
        expect(withSyncSourceUrl('game', { url: 'https://rawg.io/games/42' }, { url: 'https://rawg.io/games/43' })).toEqual({ url: 'https://rawg.io/games/43' });
    });
});
