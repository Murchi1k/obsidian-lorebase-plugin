// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { installStatisticsDom } from './helpers/statisticsDom';

const transport = vi.hoisted(() => vi.fn());
const https: typeof import('https') = createRequire(import.meta.url)('https');
vi.mock('obsidian', async importOriginal => ({ ...await importOriginal<object>(), Platform: { isDesktop: true }, requestUrl: transport, AbstractInputSuggest: class {} }));
vi.mock('../src/settings/sections/reset', () => ({ renderResetSettings: vi.fn() }));

import { areOnlineExtrasEnabled, configureOnlineExtras, onOnlineExtrasChange, OnlineExtrasDisabledError, readOnlineExtrasPreference, runOnlineExtra } from '../src/services/onlineExtras';
import { fetchJson, resetIntegrationRequestStateForTests } from '../src/services/integrations/shared';
import { MusicCatalog } from '../src/services/MusicCatalog';
import { CommunityLinksService } from '../src/services/CommunityLinksService';
import { psnRequest } from '../src/services/playstation/api';
import { traktRequest } from '../src/services/trakt/api';
import { PeopleService } from '../src/services/PeopleService';
import { RecommendationsService } from '../src/services/RecommendationsService';
import { IntegrationService } from '../src/services/IntegrationService';
import { MetadataService } from '../src/services/MetadataService';
import { DEFAULT_SETTINGS } from '../src/constants';
import { createCardPreviewItem } from '../src/settings/sections/cardPreviewSamples';
import { GameCard } from '../src/components/GameCard';
import { getCardProfile } from '../src/services/media/cardProfiles';
import { renderGeneralSettings } from '../src/settings/sections/general';
import { DeezerInlinePlayer } from '../src/components/DeezerInlinePlayer';
import { renderGalleryTrailers } from '../src/components/GalleryTrailerPlayer';
import { bindPosterGallery } from '../src/modals/PosterGalleryModal';
import { RecommendationsPanel } from '../src/components/RecommendationsPanel';
import { VideoCastPanel } from '../src/components/VideoCastPanel';
import { TrackArtistCredits } from '../src/components/TrackArtistCredits';
import type { SettingsSectionContext } from '../src/settings/sections/types';

beforeAll(() => {
    installStatisticsDom();
    Object.assign(globalThis, { createSvg: (tag: string) => document.createElementNS('http://www.w3.org/2000/svg', tag) });
    Object.assign(SVGElement.prototype, { createSvg(tag: string) { return this.appendChild(document.createElementNS('http://www.w3.org/2000/svg', tag)); } });
});
beforeEach(() => { configureOnlineExtras(true); transport.mockReset(); resetIntegrationRequestStateForTests(); });
afterEach(() => { configureOnlineExtras(true); vi.restoreAllMocks(); document.body.replaceChildren(); });

describe('additional online features', () => {
    it('keeps metadata requests, Trakt and PSN transports available when extras are disabled', async () => {
        configureOnlineExtras(false);
        transport.mockResolvedValue({ status: 200, headers: {}, json: { result: 'core' } });
        expect(await fetchJson('https://example.test/metadata')).toEqual({ result: 'core' });
        expect((await traktRequest('https://example.test/trakt', new AbortController().signal)).data).toEqual({ result: 'core' });
        expect((await psnRequest('https://example.test/psn', new AbortController().signal)).data).toEqual({ result: 'core' });
        expect(transport).toHaveBeenCalledTimes(3);
    });

    it('keeps desktop PSN authorization available', async () => {
        configureOnlineExtras(false);
        const nativeTransport = vi.spyOn(https, 'request').mockImplementation(((_url: string, _options: unknown, respond: (result: unknown) => void) => {
            const request = new EventEmitter() as any;
            request.setTimeout = () => request;
            request.end = () => { respond({ resume() {}, statusCode: 302, headers: { location: 'com.playstation:/oauth?code=example' } }); request.emit('close'); };
            return request;
        }) as typeof https.request);
        const result = await psnRequest('https://example.test/auth', new AbortController().signal, { redirect: false });
        expect(result.status).toBe(302); expect(nativeTransport).toHaveBeenCalledTimes(1);
    });

    it('keeps music catalog search and album metadata available', async () => {
        configureOnlineExtras(false);
        const catalog = new MusicCatalog(() => 'saved-lastfm-key', provider => provider === 'deezer');
        transport.mockResolvedValueOnce({ status: 200, json: { data: [] } });
        expect(await catalog.search('deezer', 'album', 'Extra-free catalog')).toEqual([]);
        transport.mockResolvedValueOnce({ status: 200, json: { id: 102938, title: 'Album', artist: { id: 8, name: 'Artist' }, cover_xl: 'https://example.test/album.jpg', tracks: { data: [] } } });
        const album = await catalog.details({ id: '102938', title: 'Album', artist: 'Artist', provider: 'deezer', kind: 'album', image: '', year: '' });
        expect(album.artist).toBe('Artist'); expect(album.imageUrl).toBe('https://example.test/album.jpg');
        expect(transport).toHaveBeenCalledTimes(2);
    });

    it('keeps regular library covers visible', async () => {
        const images: HTMLImageElement[] = [];
        const create = document.createElement.bind(document);
        vi.spyOn(document, 'createElement').mockImplementation(((tag: string, options?: any) => {
            const element = create(tag, options);
            if (tag === 'img') {
                Object.defineProperty(element, 'decode', { value: vi.fn().mockResolvedValue(undefined) });
                images.push(element as HTMLImageElement);
            }
            return element;
        }) as any);
        configureOnlineExtras(false);
        const item = createCardPreviewItem('game', 4); item.imageUrl = item.poster = 'https://example.test/regular-cover.jpg';
        const settings = structuredClone(DEFAULT_SETTINGS), profile = getCardProfile(settings, 'game', 'vertical');
        const host = document.body.createDiv();
        const card = new GameCard(host, item, { onClick() {}, onContextMenu() {} }, 'medium', 'vertical', 'hover', 'name', profile.badges, profile.layout, profile.visibility, 6, null);
        images.find(image => image.getAttribute('src') === 'https://example.test/regular-cover.jpg')!.dispatchEvent(new Event('load'));
        await Promise.resolve(); await Promise.resolve();
        expect(host.querySelector('img')?.getAttribute('src')).toBe('https://example.test/regular-cover.jpg');
        card.destroy();
    });

    it('keeps community links refresh available', async () => {
        configureOnlineExtras(false);
        const fetchLinks = vi.fn(async () => ({ version: 2, links: [] }));
        const service = new CommunityLinksService(undefined, async () => {}, fetchLinks);
        await service.refresh(); expect(fetchLinks).toHaveBeenCalledTimes(1);
    });

    it('blocks artist information, listening statistics and previews without dispatching requests', async () => {
        configureOnlineExtras(false);
        const catalog = new MusicCatalog(() => 'key');
        await expect(catalog.artist('Artist')).rejects.toBeInstanceOf(OnlineExtrasDisabledError);
        await expect(catalog.listeningStats({ artist: 'Artist', displayName: 'Album', musicKind: 'album' })).rejects.toBeInstanceOf(OnlineExtrasDisabledError);
        await expect(catalog.previews({ title: 'Song', artist: 'Artist' })).rejects.toBeInstanceOf(OnlineExtrasDisabledError);
        expect(transport).not.toHaveBeenCalled();
    });

    it('blocks actors, recommendations and gallery loading', async () => {
        configureOnlineExtras(false);
        const settings = structuredClone(DEFAULT_SETTINGS); settings.integrations.providers.tmdb = { enabled: true, apiKey: 'key' };
        const metadata = new MetadataService({} as any);
        const people = new PeopleService({} as any, () => settings, metadata, async () => null);
        expect(() => people.person('1', 'movie')).toThrow(OnlineExtrasDisabledError);
        const recommended = new RecommendationsService(() => settings);
        await expect(recommended.load(createCardPreviewItem('movie', 4) as any)).rejects.toBeInstanceOf(OnlineExtrasDisabledError);
        const item = { ...createCardPreviewItem('game', 4), steamAppId: '123', integrationProvider: 'steam', integrationId: '123' };
        const gallery = new IntegrationService({} as any, () => settings).getGalleryLoader(item as any)!;
        expect(gallery).toBeDefined();
        await expect(gallery.loadImages()).rejects.toBeInstanceOf(OnlineExtrasDisabledError);
        expect(transport).not.toHaveBeenCalled();
    });

    it('ignores late extra results after disabling and re-enabling', async () => {
        let finish!: (value: string) => void;
        const work = runOnlineExtra(() => new Promise<string>(resolve => { finish = resolve; }));
        const rejected = expect(work).rejects.toBeInstanceOf(OnlineExtrasDisabledError);
        configureOnlineExtras(false); await rejected;
        configureOnlineExtras(true); finish('stale');
        expect(await runOnlineExtra(async () => 'current')).toBe('current');
    });

    it('does not start extra work while disabled', async () => {
        configureOnlineExtras(false); const task = vi.fn(async () => 'unused');
        await expect(runOnlineExtra(task)).rejects.toBeInstanceOf(OnlineExtrasDisabledError);
        expect(task).not.toHaveBeenCalled();
    });

    it('migrates the previous preference and gives the new setting priority', () => {
        expect(readOnlineExtrasPreference({})).toBe(true);
        expect(readOnlineExtrasPreference({ offlineMode: true })).toBe(false);
        expect(readOnlineExtrasPreference({ offlineMode: false })).toBe(true);
        expect(readOnlineExtrasPreference({ onlineExtrasEnabled: true, offlineMode: true })).toBe(true);
    });

    it('offers an enabled-by-default settings switch without changing sync or provider options', () => {
        const settings = structuredClone(DEFAULT_SETTINGS); settings.steamSync.autoSyncPlaytimeOnStartup = true; settings.integrations.providers.rawg.apiKey = 'kept';
        const saveSettings = vi.fn(async () => { configureOnlineExtras(settings.onlineExtrasEnabled); });
        const lifetime = new AbortController();
        const context = { signal: lifetime.signal, plugin: { settings, saveSettings }, createSectionHeader: () => {}, display: () => {} } as unknown as SettingsSectionContext;
        renderGeneralSettings(context, document.body);
        const row = document.querySelector<HTMLElement>('.lorebase-online-extras-settings')!;
        const help = row.querySelector<HTMLDetailsElement>('details')!;
        const helpButton = help.querySelector('summary')!;
        expect(help.open).toBe(false);
        expect(row.querySelector(':scope > p')).toBeNull();
        helpButton.click(); expect(help.open).toBe(true);
        expect(saveSettings).not.toHaveBeenCalled();
        help.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(help.open).toBe(false); expect(document.activeElement).toBe(helpButton);
        helpButton.click();
        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        expect(help.open).toBe(false);
        const control = document.querySelector<HTMLButtonElement>('.lorebase-online-extras-settings [role="switch"]')!;
        expect(control.getAttribute('aria-checked')).toBe('true');
        control.click(); expect(areOnlineExtrasEnabled()).toBe(false);
        expect(settings.steamSync.autoSyncPlaytimeOnStartup).toBe(true); expect(settings.integrations.providers.rawg.apiKey).toBe('kept');
        control.click(); expect(areOnlineExtrasEnabled()).toBe(true);
        lifetime.abort();
    });

    it('stops a playing Deezer preview and hides its button until enabled again', async () => {
        vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
        const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
        vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
        const load = vi.fn(async () => [{ id: '1', title: 'Song', artist: 'Artist', album: 'Album', preview: 'https://cdnt-preview.dzcdn.net/clip.mp3', url: 'https://www.deezer.com/track/1' }]);
        const player = new DeezerInlinePlayer(load), button = document.body.createEl('button');
        player.mount([{ key: 'one', query: { title: 'Song', artist: 'Artist', deezerId: '1' }, host: document.body.createDiv(), button }]);
        await player.toggle('one'); configureOnlineExtras(false);
        expect(pause).toHaveBeenCalled(); expect(button.hidden).toBe(true);
        await player.toggle('one'); expect(load).toHaveBeenCalledTimes(1);
        configureOnlineExtras(true); expect(button.hidden).toBe(false); player.destroy();
    });

    it('removes an active trailer without touching catalog transports', () => {
        const root = document.createElement('div');
        const dispose = renderGalleryTrailers(root, [{ id: 'one', title: 'Trailer', url: 'https://youtube.com/watch?v=one', thumbnail: '', playback: { kind: 'embed', url: 'https://youtube.com/embed/one' } }]);
        root.querySelector<HTMLButtonElement>('.lorebase-poster-gallery-play')!.click(); expect(root.querySelector('iframe')).not.toBeNull();
        configureOnlineExtras(false); expect(root.querySelector('iframe')).toBeNull();
        configureOnlineExtras(true); expect(root.querySelector('.lorebase-poster-gallery-play')).not.toBeNull(); dispose();
    });

    it('hides already open actor and recommendation panels and restores them when enabled', async () => {
        const recommendationService = { load: vi.fn(async () => ({ source: 'TMDB', items: [] })) };
        const actorService = { cast: vi.fn(async () => []), configured: () => true };
        const host = document.body.createDiv(), item = createCardPreviewItem('movie', 4);
        const recommendations = new RecommendationsPanel(host, item as any, recommendationService as any);
        const actors = new VideoCastPanel({} as any, host, item as any, actorService as any);
        const actorPanel = host.querySelector<HTMLDetailsElement>('.lorebase-video-cast')!;
        actorPanel.open = true; actorPanel.dispatchEvent(new Event('toggle'));
        await Promise.resolve();
        expect(recommendationService.load).toHaveBeenCalledTimes(1); expect(actorService.cast).toHaveBeenCalledTimes(1);
        configureOnlineExtras(false);
        expect(actorPanel.hidden).toBe(true); expect(host.querySelector<HTMLElement>('.lorebase-recommendations')!.hidden).toBe(true);
        expect(host.querySelector('.lorebase-recommendations-body')!.children).toHaveLength(0);
        configureOnlineExtras(true); await Promise.resolve();
        expect(actorPanel.hidden).toBe(false); expect(recommendationService.load).toHaveBeenCalledTimes(2); expect(actorService.cast).toHaveBeenCalledTimes(2);
        recommendations.destroy(); actors.destroy();
    });

    it('disables the gallery action while keeping the editor poster visible', () => {
        const root = document.body.createDiv();
        const poster = root.createEl('img', { attr: { 'data-role': 'poster', src: 'https://example.test/main-poster.jpg' } });
        const stop = bindPosterGallery({} as any, root, 'Title', { source: 'Steam', imageTabs: ['images'], loadImages: async () => [] })!;
        const button = root.querySelector<HTMLButtonElement>('.lorebase-poster-gallery-trigger')!;
        configureOnlineExtras(false); expect(button.disabled).toBe(true); expect(poster.src).toBe('https://example.test/main-poster.jpg');
        configureOnlineExtras(true); expect(button.disabled).toBe(false); stop();
    });

    it('retains performer names while disabling their online profile actions', () => {
        const root = document.body.createDiv(), open = vi.fn(async () => {});
        const credits = new TrackArtistCredits(root, open); credits.update(['Guest artist']);
        configureOnlineExtras(false);
        const link = root.querySelector<HTMLButtonElement>('.lorebase-music-artist-link')!;
        expect(root.textContent).toContain('Guest artist'); expect(link.disabled).toBe(true);
        link.click(); expect(open).not.toHaveBeenCalled();
        configureOnlineExtras(true); root.querySelector<HTMLButtonElement>('.lorebase-music-artist-link')!.click();
        expect(open).toHaveBeenCalledTimes(1); credits.destroy();
    });

    it('unsubscribes disposed consumers', () => {
        const listener = vi.fn(), stop = onOnlineExtrasChange(listener);
        configureOnlineExtras(false); stop(); configureOnlineExtras(true); expect(listener).toHaveBeenCalledTimes(1);
    });
});
