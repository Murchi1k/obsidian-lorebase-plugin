// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { STAT_WORLD } from '../src/assets/statisticsWorld';
import { DEFAULT_SETTINGS } from '../src/constants';
import { i18n } from '../src/localization';
import { renderCountriesControl } from '../src/components/CountriesControl';
import { defaultStatFilters, makeStatRecord } from '../src/services/media/statistics';
import { StatisticsDeletionJournal, deletionSelection, statisticsTimelineWithDeletions } from '../src/services/media/statisticsDeletions';
import { normalizeCountryMetadata, statisticsCountryCodes } from '../src/services/media/statisticsCountries';
import { enableCountriesTemplateField } from '../src/services/integrations/templatePreferences';
import { buildSimpleTemplate, getDefaultTemplateFields } from '../src/services/integrations/templateUtils';
import { MetadataService } from '../src/services/MetadataService';
import { createMockApp, createMockFile } from './helpers/testHelpers';
import { installStatisticsDom } from './helpers/statisticsDom';
import { normalizeStatisticsPreferences } from '../src/services/media/statisticsPreferences';
import type { MediaItem } from '../src/types';

beforeAll(installStatisticsDom);
afterEach(() => { document.body.replaceChildren(); i18n.setLanguage('en'); });
const item = (patch: Record<string, unknown> = {}) => ({ type: 'game', filePath: 'Games/Test.md', displayName: 'Test', nameLower: 'test', status: 'completed', genres: ['Fantasy'], tags: [], favorite: false, userRating: 4, rawFields: { date_added: '2026-09-01' }, finished: '2026-10-02', ...patch } as unknown as MediaItem);

describe('real deletion events', () => {
    it('does not infer deletions at startup, treats rename as rename, and persists one real removal', () => {
        const persist = vi.fn(), journal = new StatisticsDeletionJournal([], persist);
        expect(journal.remove('missing.md')).toBe(false);
        journal.observe(item()); journal.rename('Games/Test.md', 'Games/Renamed.md');
        expect(journal.remove('Games/Test.md')).toBe(false);
        const at = new Date(2026, 9, 20).getTime();
        expect(journal.remove('Games/Renamed.md', at)).toBe(true);
        expect(journal.remove('Games/Renamed.md', at)).toBe(false);
        expect(journal.events).toHaveLength(1);
        expect(persist).toHaveBeenCalledTimes(1);
        expect(persist.mock.calls[0][0][0]).toMatchObject({ path: 'Games/Renamed.md', title: 'Test', type: 'game', at, genres: ['Fantasy'] });
        journal.observe(item()); journal.forget('Games/Test.md'); expect(journal.remove('Games/Test.md')).toBe(false);
    });
    it('keeps archived additions and completions without duplicating a restored note', () => {
        const journal = new StatisticsDeletionJournal([], () => {}), source = item();
        journal.observe(source); journal.remove(source.filePath, new Date(2026, 9, 20).getTime());
        const now = new Date(2026, 9, 29);
        const bins = statisticsTimelineWithDeletions([], journal.events, 'month', null, now);
        expect(bins.find(bin => bin.key === '2026-09')).toMatchObject({ added: 1, finished: 0, deleted: 0 });
        expect(bins.find(bin => bin.key === '2026-10')).toMatchObject({ added: 0, finished: 1, deleted: 1 });
        const restored = statisticsTimelineWithDeletions([makeStatRecord(source)], journal.events, 'month', null, now);
        expect(restored.find(bin => bin.key === '2026-09')!.added).toBe(1);
        expect(restored.find(bin => bin.key === '2026-10')!.finished).toBe(1);
        expect(statisticsTimelineWithDeletions([], journal.events, 'year', 2025, now)).toEqual([]);
    });
    it('filters removed titles by the available snapshot and the deletion date range', () => {
        const journal = new StatisticsDeletionJournal([], () => {});
        journal.observe(item()); journal.remove('Games/Test.md', new Date(2026, 9, 20).getTime());
        const filters = { ...defaultStatFilters(), facet: { key: 'genres' as const, value: 'fantasy' } };
        expect(deletionSelection(journal.events, filters)).toHaveLength(1);
        expect(deletionSelection(journal.events, { ...filters, type: 'book' })).toEqual([]);
        expect(deletionSelection(journal.events, { ...filters, dateRange: { from: 0, to: new Date(2026, 9, 1).getTime() } })).toEqual([]);
    });
});

describe('countries and complete templates', () => {
    it('migrates the saved summary into independent compact figures without interleaving other blocks', () => {
        const prefs = normalizeStatisticsPreferences({ widgets: {
            'overview-summary': { order: 0, span: 12, height: 500 },
            'overview-statuses': { order: 1, span: 6 },
            'overview-ratings': { order: 2, span: 6 },
        } });
        expect(prefs.widgets['overview-summary']).toBeUndefined();
        expect(['total', 'completed', 'rating', 'favorites'].map(key => prefs.widgets['overview-kpi-' + key])).toEqual([0, 1, 2, 3].map(order => ({ order, span: 3, height: null, collapsed: false })));
        expect(prefs.widgets['overview-statuses'].order).toBe(4);
        expect(normalizeStatisticsPreferences(prefs)).toEqual(prefs);
    });
    it('uses offline flag images and compact ISO chips, with a searchable portal outside the clipped editor', () => {
        i18n.setLanguage('ru');
        const root = document.createElement('div'); root.innerHTML = '<details open class="lorebase-editmode-advanced"><div class="lorebase-editmode-kv-list"></div></details>'; document.body.append(root);
        const change = vi.fn(); renderCountriesControl(root, item({ countries: ['UA'] }), change);
        const chip = root.querySelector('.lorebase-country-chip')!;
        expect(chip.textContent).toBe('UA×'); expect(chip.getAttribute('title')).toContain('Украина');
        expect(chip.querySelector('img')!.getAttribute('src')).toMatch(/^data:image\/svg\+xml;base64,/);
        const input = root.querySelector('input')!; input.focus();
        const menu = document.querySelector('.lorebase-country-menu')!;
        expect(menu.parentElement).toBe(document.body); expect(menu.querySelectorAll('[role=option]').length).toBeGreaterThan(200);
        input.value = 'Япония'; input.dispatchEvent(new Event('input'));
        expect(menu.querySelectorAll('[role=option]')).toHaveLength(1);
        menu.querySelector<HTMLButtonElement>('button')!.click();
        expect(change).toHaveBeenLastCalledWith(['UA', 'JP']); expect(document.querySelector('.lorebase-country-menu')).toBeNull();
    });
    it('normalizes actual provider country objects and excludes non-country release regions', () => {
        expect(normalizeCountryMetadata([{ iso_3166_1: 'UA' }, { code: 'JP' }, 'United States', 'XW', 'XE', 'JP'])).toEqual(['UA', 'JP', 'US']);
    });
    it.each(['games', 'anime', 'movies', 'series', 'books', 'manga'] as const)('includes countries in %s defaults and migrates an older advanced template idempotently', kind => {
        expect(getDefaultTemplateFields(kind)).toContain('countries');
        const config = structuredClone(DEFAULT_SETTINGS.integrations.media[kind]);
        config.templateFields = ['year']; config.templateMode = 'advanced'; config.template = '---\nyear: {{VALUE:year}}\ncustom: keep\n---\n\nMy own notes';
        enableCountriesTemplateField(kind, config); const first = config.template;
        expect(config.templateFields).toEqual(['year', 'countries']);
        expect(first).toContain('{{VALUE:countries}}'); expect(first).toContain('custom: keep'); expect(first).toContain('My own notes');
        enableCountriesTemplateField(kind, config); expect(config.template).toBe(first);
    });
    it('keeps explicit clearing in compact mode with a renamed country property and legacy origins', async () => {
        const settings = structuredClone(DEFAULT_SETTINGS), config = settings.integrations.media.anime;
        settings.integrations.compactTemplates = true; config.templateMode = 'advanced'; config.templateEnabled = true;
        config.template = buildSimpleTemplate('anime', getDefaultTemplateFields('anime')).replace(/^countries:/m, 'origins:');
        const fm: Record<string, unknown> = { type: 'anime', name: 'Test', country_of_origin: 'JP', origins: ['UA'] }, file = createMockFile('Anime/Test.md', 'Test');
        const app = createMockApp({ [file.path]: { frontmatter: fm } }); app.fileManager.processFrontMatter = async (_file, update) => update(fm);
        const metadata = new MetadataService(app, () => settings);
        await metadata.updateMetadata(file, { countries: [] }, 'anime');
        expect(fm.origins).toEqual([]);
        expect(statisticsCountryCodes(item({ type: 'anime', rawFields: metadata.resolveFrontmatter('anime', fm) }))).toEqual([]);
        await metadata.updateMetadata(file, { status: 'watching' }, 'anime'); expect(fm.origins).toEqual([]);
    });
    it.each([false, true])('retains an older origin when saving unrelated metadata, compact=%s', async compact => {
        const settings = structuredClone(DEFAULT_SETTINGS), config = settings.integrations.media.anime;
        settings.integrations.compactTemplates = compact; config.templateMode = 'advanced'; config.templateEnabled = true;
        config.template = buildSimpleTemplate('anime', getDefaultTemplateFields('anime')).replace(/^countries:/m, 'origins:');
        const fm: Record<string, unknown> = { type: 'anime', name: 'Test', country_of_origin: 'JP' }, file = createMockFile('Anime/Test.md', 'Test');
        const app = createMockApp({ [file.path]: { frontmatter: fm } }); app.fileManager.processFrontMatter = async (_file, update) => update(fm);
        const metadata = new MetadataService(app, () => settings);
        await metadata.updateMetadata(file, { status: 'watching' }, 'anime');
        expect(fm.origins).toEqual(['JP']);
        expect(statisticsCountryCodes(item({ type: 'anime', rawFields: metadata.resolveFrontmatter('anime', fm) }))).toEqual(['JP']);
    });
});

describe('UN map geometry', () => {
    const contains = (code: string, lon: number, lat: number) => {
        const x = (lon + 180) / 360 * 1000, y = (85 - lat) / 145 * 470;
        let inside = false;
        for (const ring of STAT_WORLD.find(shape => shape.code === code)!.path.split('M').slice(1)) {
            const coordinates = [...ring.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map(match => [Number(match[1]), Number(match[2])]);
            // SVG l uses relative coordinates; preserve the same point-in-polygon assertion.
            const points = ring.includes('l') ? coordinates.reduce<number[][]>((all, [dx, dy], index) => {
                const previous = all[index - 1];
                all.push(index ? [Math.round((previous[0] + dx) * 10) / 10, Math.round((previous[1] + dy) * 10) / 10] : [dx, dy]);
                return all;
            }, []) : coordinates;
            for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
                const [xi, yi] = points[i], [xj, yj] = points[j];
                if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
            }
        }
        return inside;
    };
    it('includes Kyiv and Crimea in Ukraine, while Moscow belongs to Russia', () => {
        expect(contains('UA', 30.52, 50.45)).toBe(true);
        expect(contains('UA', 34.1, 44.95)).toBe(true);
        expect(contains('RU', 34.1, 44.95)).toBe(false);
        expect(contains('RU', 37.62, 55.75)).toBe(true);
    });
});
