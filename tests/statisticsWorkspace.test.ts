// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeAll, afterEach } from 'vitest';
import { boundedMapView, zoomMap } from '../src/components/StatisticsMapNavigation';
import { normalizeStatisticsPreferences } from '../src/services/media/statisticsPreferences';
import { renderCountriesControl, validateCountriesControl } from '../src/components/CountriesControl';
import { statisticsCountryCodes } from '../src/services/media/statisticsCountries';
import { i18n } from '../src/localization';
import { GameService } from '../src/services/GameService';
import { AnimeService } from '../src/services/AnimeService';
import { VideoService } from '../src/services/VideoService';
import { ReadingService } from '../src/services/ReadingService';
import { MusicService } from '../src/services/MusicService';
import { MetadataService } from '../src/services/MetadataService';
import { createMockApp, createMockFile } from './helpers/testHelpers';
import type { App } from 'obsidian';
import type { MediaItem } from '../src/types';

beforeAll(() => i18n.setLanguage('en'));
afterEach(() => { document.body.replaceChildren(); i18n.setLanguage('en'); });
describe('dashboard workspace and origin metadata', () => {
    it('bounds zoom and pan and keeps the point under the zoom anchor stationary', () => {
        expect(zoomMap({ x: 0, y: 0, scale: 1 }, 2)).toEqual({ x: -500, y: -235, scale: 2 });
        expect(zoomMap({ x: -500, y: -235, scale: 2 }, .5)).toEqual({ x: 0, y: 0, scale: 1 });
        expect(boundedMapView({ x: -99999, y: 200, scale: 50 })).toEqual({ x: -5000, y: 0, scale: 6 });
        expect(boundedMapView({ x: -100, y: -100, scale: .1 })).toEqual({ x: 0, y: 0, scale: 1 });
    });
    it('normalizes persisted block dimensions, order and collapsed state', () => {
        const prefs = normalizeStatisticsPreferences({ widgets: { 'overview-time': { order: 2, span: 1, height: 99999, collapsed: true }, unknown: { span: 1 }, 'insights-media': { order: -3, height: NaN } } });
        expect(prefs.widgets).toEqual({ 'overview-time': { order: 2, span: 6, height: 900, collapsed: true }, 'insights-media': { order: 0, span: 12, height: null, collapsed: false } });
    });
    it('adds multiple localized countries to a draft in Additional, deduplicates and removes them', () => {
        i18n.setLanguage('ru');
        const root = document.createElement('div'); root.innerHTML = '<details class="lorebase-editmode-advanced"><summary>Дополнительно</summary><div class="lorebase-editmode-kv-list"></div></details>'; document.body.append(root);
        const item = { type: 'book', rawFields: { countries: ['FR'] } } as unknown as MediaItem, change = vi.fn();
        renderCountriesControl(root, item, change);
        const input = root.querySelector<HTMLInputElement>('input')!;
        input.value = 'Япония'; input.dispatchEvent(new Event('change'));
        expect(change).toHaveBeenLastCalledWith(['FR', 'JP']);
        input.value = 'JP'; input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); expect(change).toHaveBeenCalledTimes(1);
        root.querySelector<HTMLButtonElement>('.lorebase-country-chip')!.click(); expect(change).toHaveBeenLastCalledWith(['JP']);
        expect(item.rawFields?.countries).toEqual(['FR']);
        expect(root.querySelector('.lorebase-editmode-advanced .lorebase-country-field')).not.toBeNull();
        input.value = 'invented country'; expect(validateCountriesControl(root)).toBe(false);
        expect(root.querySelector('details')!.open).toBe(true);
        input.value = 'DE'; expect(validateCountriesControl(root)).toBe(true); expect(change).toHaveBeenLastCalledWith(['JP', 'DE']);
    });
    for (const type of ['game', 'anime', 'movie', 'series', 'book', 'manga', 'music'] as const) {
        it(`round-trips country edits and explicit clearing for ${type} notes`, async () => {
            const file = createMockFile(type + '/Example.md', 'Example');
            const fm: Record<string, unknown> = { type, title: 'Example', name: 'Example', artist: 'Artist', music_kind: 'album', country_of_origin: 'JP' };
            const app = createMockApp({ [file.path]: { frontmatter: fm } });
            app.vault.getAbstractFileByPath = () => file;
            app.fileManager.processFrontMatter = async (_file, update) => { update(fm); };
            const metadata = new MetadataService(app as App);
            const service = type === 'game' ? new GameService(app, metadata) : type === 'anime' ? new AnimeService(app, metadata) : type === 'movie' || type === 'series' ? new VideoService(app, type, type, metadata) : type === 'book' || type === 'manga' ? new ReadingService(app, type, type, metadata) : new MusicService(app, type, metadata);
            const read = (): MediaItem | null => service instanceof GameService ? service.parseGameFromCache(file) : service instanceof AnimeService ? service.parseAnimeFromCache(file) : service.parseFromCache(file);
            const save = async (countries: string[]) => { const item = read()!; if (service instanceof GameService) await service.updateGame(item as any, { countries }); else if (service instanceof AnimeService) await service.updateAnime(item as any, { countries }); else await service.updateItem(item as any, { countries }); };
            expect(read()).not.toBeNull();
            if (service instanceof MusicService) {
                await service.updateItem(read() as any, { userRating: 3 });
                expect(statisticsCountryCodes(read()!)).toEqual(['JP']);
            }
            await save(['PL', 'US']); expect(fm.countries).toEqual(['PL', 'US']); expect(statisticsCountryCodes(read()!)).toEqual(['PL', 'US']);
            await save([]); expect(statisticsCountryCodes(read()!)).toEqual([]);
        });
    }
});
