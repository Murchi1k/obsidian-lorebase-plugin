import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/constants';
import { IntegrationService } from '../src/services/IntegrationService';
import { AnimeService } from '../src/services/AnimeService';
import { ReadingService } from '../src/services/ReadingService';
import { applyFrontmatterAliases, parseTemplateFieldAliases } from '../src/services/media/templateFieldAliases';
import { getAlternativeTitleOptions, readAlternativeTitles, selectAlternativeTitles } from '../src/services/integrations/alternativeTitles';
import { getAniListDetails } from '../src/services/integrations/providers/anilist';
import { getMangaDexDetails } from '../src/services/integrations/providers/mangadex';
import { getMangaUpdatesDetails, resetMangaUpdatesCachesForTests } from '../src/services/integrations/providers/mangaupdates';
import { getShikimoriDetails, getShikimoriMangaDetails } from '../src/services/integrations/providers/shikimori';
import { getKitsuDetails } from '../src/services/integrations/providers/kitsu';
import { buildSimpleTemplate, getDefaultTemplateFields, getEffectiveSimpleTemplateFields, renderTemplate } from '../src/services/integrations/templateUtils';
import { filterAndSortMedia } from '../src/services/media/filtering';
import { getTitleSearchMatch } from '../src/services/media/titleSearch';
import { createMetadataService, createMockApp, createMockFile } from './helpers/testHelpers';

const baseItem = {
    displayName: 'Frieren: Beyond Journey’s End', nameLower: 'frieren: beyond journey’s end',
    status: 'planned' as const, favorite: false, hasCustomPoster: false, isAdult: false,
    tags: [], genres: [], year: 2023, userRating: null,
    rawFields: { titles: ['Sousou no Frieren', '葬送のフリーレン'], aliases: ['Фрирен'], plot: 'Not a title' },
};

describe('alternative title import and library search', () => {
    it('includes alternative titles by default for anime and manga only', () => {
        for (const kind of ['anime', 'manga'] as const) {
            expect(getDefaultTemplateFields(kind)).toContain('alternativeTitles');
            expect(DEFAULT_SETTINGS.integrations!.media[kind].templateFields).toContain('alternativeTitles');
            const fields = getEffectiveSimpleTemplateFields(kind, ['type', 'name', 'alternativeTitles']);
            const template = buildSimpleTemplate(kind, fields);
            expect(template).toContain('title: "{{VALUE:name}}"\nalt_titles: {{VALUE:alternativeTitles}}');
            const output = renderTemplate(template, { name: 'Main', alternativeTitles: ['A: "quote"', '日本語'] });
            expect(output).toContain('alt_titles:\n  - "A: \\"quote\\""\n  - "日本語"');
            expect(renderTemplate(template, { name: 'Main', alternativeTitles: [] })).toContain('alt_titles: []');
        }
        expect(getEffectiveSimpleTemplateFields('books', ['name', 'alternativeTitles'])).toEqual(['name']);
    });

    it('imports an AniList language choice through the real value builder and template renderer', async () => {
        const details = await getAniListDetails(async (_url, _headers, _method, body) => {
            expect(JSON.parse(String(body)).query).toContain('synonyms');
            return { data: { Media: { id: 1, title: { english: baseItem.displayName, romaji: 'Sousou no Frieren', native: '葬送のフリーレン' }, synonyms: ['Frieren at the Funeral'] } } };
        }, '1', { includeParts: false });
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.integrations!.media.anime.alternativeTitleLanguages = { anilist: 'romaji', shikimori: 'ru' };
        const service = new IntegrationService(createMockApp({}), () => settings);
        const values = (service as any).buildAnimeValues(details, { provider: 'anilist' });
        expect(values.alternativeTitles).toEqual(['Sousou no Frieren']);
        const output = renderTemplate(buildSimpleTemplate('anime', ['name', 'alternativeTitles']), values);
        expect(output).toContain('alt_titles:\n  - "Sousou no Frieren"');
        expect(output).not.toContain('葬送');

        settings.integrations!.media.anime.alternativeTitlesDisabled = { anilist: true };
        expect((service as any).buildAnimeValues(details, { provider: 'anilist' }).alternativeTitles).toEqual([]);
        settings.integrations!.media.anime.alternativeTitlesDisabled.anilist = false;
        expect((service as any).buildAnimeValues(details, { provider: 'anilist' }).alternativeTitles).toEqual(['Sousou no Frieren']);
        settings.integrations!.media.anime.alternativeTitleLanguages.anilist = 'none';
        expect((service as any).buildAnimeValues(details, { provider: 'anilist' }).alternativeTitles).toEqual([]);
    });

    it('reads Shikimori GraphQL and REST names without translating unknown synonyms', async () => {
        const data = { name: 'Sousou no Frieren', russian: 'Фрирен', english: ['Frieren'], japanese: ['葬送のフリーレン'], synonyms: ['Funeral Frieren'] };
        const anime = await getShikimoriDetails(async (_url, _headers, _method, body) => {
            const query = JSON.parse(String(body)).query;
            expect(query).toContain('english'); expect(query).toContain('japanese'); expect(query).toContain('synonyms');
            return { data: { animes: [data] } };
        }, '1', { includeParts: false });
        const manga = await getShikimoriMangaDetails(async url => url.endsWith('/roles') ? [] : data, '1');
        for (const details of [anime, manga]) {
            expect(selectAlternativeTitles(details?.alternativeTitles, 'ru')).toEqual(['Фрирен']);
            expect(selectAlternativeTitles(details?.alternativeTitles, 'en')).toEqual(['Frieren']);
            expect(selectAlternativeTitles(details?.alternativeTitles, 'uk')).toEqual([]);
        }
    });

    it('reads Kitsu locale tags and deduplicates names and abbreviations', async () => {
        const details = await getKitsuDetails(async () => ({ data: { id: '1', type: 'anime', attributes: {
            canonicalTitle: 'Frieren', titles: { en_jp: 'Sousou no Frieren', en: 'Frieren', ja_jp: '葬送のフリーレン' }, abbreviatedTitles: ['frieren', 'Funeral Frieren'],
        } } }), '1', { includeParts: false });
        expect(selectAlternativeTitles(details?.alternativeTitles, 'all', 'Frieren')).toEqual(['Sousou no Frieren', '葬送のフリーレン', 'Funeral Frieren']);
        expect(selectAlternativeTitles(details?.alternativeTitles, 'en', 'Frieren')).toEqual([]);
    });

    it('reads MangaDex language tags and MangaUpdates unlabelled names', async () => {
        const dex = await getMangaDexDetails(async url => url.includes('/aggregate') ? { volumes: {} } : { data: {
            id: '1', attributes: { title: { 'ja-ro': 'Sousou no Frieren' }, altTitles: [{ uk: 'Проводжальниця Фрірен' }, { ru: 'Фрирен' }] }, relationships: [],
        } }, '1');
        expect(selectAlternativeTitles(dex?.alternativeTitles, 'uk')).toEqual(['Проводжальниця Фрірен']);
        resetMangaUpdatesCachesForTests();
        const updates = await getMangaUpdatesDetails(async () => ({ series_id: 1, title: 'Frieren', associated: [
            { title: 'Sousou no Frieren' }, { title: 'Фрирен' }, { title: 'Проводжальниця Фрірен (Ukrainian)' }, { title: '葬送のフリーレン' },
        ] }), '1');
        expect(selectAlternativeTitles(updates?.alternativeTitles, 'Latn', 'Frieren')).toEqual(['Sousou no Frieren']);
        expect(getAlternativeTitleOptions('mangaupdates')).toEqual(expect.arrayContaining(['all', 'Cyrl', 'Latn', 'Hrkt']));
        expect(selectAlternativeTitles(updates?.alternativeTitles, 'none')).toEqual([]);
        expect(selectAlternativeTitles(updates?.alternativeTitles, 'en')).toEqual([]);
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.integrations!.media.manga.alternativeTitleLanguages = { mangaupdates: 'Cyrl' };
        const service = new IntegrationService(createMockApp({}), () => settings);
        expect(service['buildMangaValues'](updates!, { provider: 'mangaupdates' }).alternativeTitles).toEqual(['Фрирен', 'Проводжальниця Фрірен (Ukrainian)']);
        expect(selectAlternativeTitles(updates?.alternativeTitles, 'Hrkt')).toEqual(['葬送のフリーレン']);
        service.dispose();
        resetMangaUpdatesCachesForTests();
    });

    it('searches saved aliases offline while still applying other library filters', () => {
        const search = (query: string, favoriteOnly = false) => filterAndSortMedia({
            items: [baseItem], filter: { searchTerm: query, statuses: [], favoriteOnly, adultOnly: false, customOnly: false, tags: [], genres: [] },
            sortField: 'name', sortOrder: 'asc', isVisible: () => true, getCompletedDate: () => null,
        });
        for (const query of ['SOUSOU   NO FRIEREN', '葬送のフリーレン', 'фрирен', 'Frieren - Beyond Journey’s End']) expect(search(query)).toHaveLength(1);
        expect(search('Sousou no Frieren', true)).toEqual([]);
        expect(search('Not a title')).toEqual([]);
        expect(search('!!!')).toEqual([]);
        expect(search('Frieren 葬送')).toEqual([]);
        const edited = { ...baseItem, rawFields: { localized_titles: 'New Alias' } };
        expect(getTitleSearchMatch(edited, 'new alias')).toMatchObject({ source: 'alias' });
        expect(getTitleSearchMatch(edited, 'Sousou')).toBeNull();
        const renamed = { ...baseItem, rawFields: { alt_titles: ['New Alias'], titles: ['Legacy Alias'] } };
        expect(getTitleSearchMatch(renamed, 'new alias')).toMatchObject({ source: 'alias' });
        expect(getTitleSearchMatch(renamed, 'legacy alias')).toMatchObject({ source: 'alias' });
    });

    it('does not infer language from the alphabet or stringify malformed provider data', () => {
        const titles = readAlternativeTitles('anilist', { title: { english: null }, synonyms: ['English-looking synonym', { title: 'bad' }] });
        expect(selectAlternativeTitles(titles, 'en')).toEqual([]);
        expect(selectAlternativeTitles(titles)).toEqual(['English-looking synonym']);
    });

    it('keeps advanced-template custom title fields searchable after note parsing', () => {
        for (const kind of ['anime', 'manga'] as const) {
            const file = createMockFile('Library/Frieren.md', 'Frieren');
            const app = createMockApp({ [file.path]: { frontmatter: {
                type: kind, title: 'Frieren', 'Другие названия': ['Sousou no Frieren'], aliases: ['Фрирен'],
            } } });
            const metadata = createMetadataService(app);
            const aliases = parseTemplateFieldAliases(kind, 'Другие названия: {{VALUE:alternativeTitles}}');
            metadata.resolveFrontmatter = (_type, raw) => applyFrontmatterAliases(raw, aliases);
            const parsed = kind === 'anime'
                ? new AnimeService(app, metadata).parseAnimeFromCache(file)
                : new ReadingService(app, 'manga', 'Library', metadata).parseFromCache(file);
            expect(parsed).not.toBeNull();
            expect(getTitleSearchMatch(parsed!, 'Sousou no Frieren')).toMatchObject({ source: 'alias' });
            expect(getTitleSearchMatch(parsed!, 'Фрирен')).toMatchObject({ source: 'alias' });
        }
    });
});
