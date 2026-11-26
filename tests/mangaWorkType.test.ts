import { afterEach, describe, expect, it } from 'vitest';
import { configureMangaWorkTypes, getManageWorkTypesLabel, getMangaWorkTypeCatalog, getMangaWorkTypeLabel, getMangaWorkTypeOptions, inferMangaWorkType, normalizeMangaWorkType, normalizeWorkTypeCatalog, replaceWorkTypeInView } from '../src/utils/mangaWorkType';
import { DEFAULT_SETTINGS } from '../src/constants';
import { ReadingService } from '../src/services/ReadingService';
import { createMetadataService, createMockApp, createMockFile } from './helpers/testHelpers';

afterEach(() => configureMangaWorkTypes());

describe('manga work types', () => {
    it('uses country management wording for anime filters', () => {
        expect(getManageWorkTypesLabel('ru', true)).toBe('Настроить страны…');
        expect(getManageWorkTypesLabel('ru')).toBe('Настроить типы…');
    });
    it('infers regional and publication types returned by providers', () => {
        expect(inferMangaWorkType('MANGA', 'KR')).toBe('Manhwa');
        expect(inferMangaWorkType('MANGA', 'zh')).toBe('Manhua');
        expect(inferMangaWorkType('LIGHT_NOVEL')).toBe('Light novel');
        expect(inferMangaWorkType('ONE_SHOT')).toBe('One-shot');
    });

    it('preserves custom user-defined values', () => {
        expect(normalizeMangaWorkType('  Graphic novel  ')).toBe('Graphic novel');
        expect(normalizeMangaWorkType('manhwa')).toBe('Manhwa');
        expect(normalizeMangaWorkType('')).toBe('Manga');
    });
    it('renames types without breaking note values or option order', () => {
        configureMangaWorkTypes({ types: [{ value: 'Manhwa', label: 'Корейские комиксы' }, { value: 'Manga' }, { value: 'Graphic novel', label: 'Графический роман' }], redirects: {} });
        expect(normalizeMangaWorkType('manhwa')).toBe('Manhwa');
        expect(getMangaWorkTypeLabel('Manhwa', 'ru')).toBe('Корейские комиксы');
        expect(getMangaWorkTypeOptions('ru')).toEqual([
            { value: 'Manhwa', label: 'Корейские комиксы' }, { value: 'Manga', label: 'Манга' }, { value: 'Graphic novel', label: 'Графический роман' },
        ]);
    });
    it('keeps unknown note types available while excluding redirected removed types', () => {
        configureMangaWorkTypes({ types: [{ value: 'Manhwa' }], redirects: { Webtoon: 'Manhwa', Manga: 'Manhwa' } });
        expect(getMangaWorkTypeOptions('ru', ['Webtoon', 'Fan comic', 'Fan comic']).map(type => type.value)).toEqual(['Manhwa', 'Fan comic']);
        expect(normalizeMangaWorkType('Webtoon')).toBe('Manhwa');
        expect(inferMangaWorkType('WEBTOON')).toBe('Manhwa');
        expect(normalizeMangaWorkType('')).toBe('Manhwa');
        expect(getMangaWorkTypeCatalog().types).toHaveLength(1);
    });
    it('normalizes stored catalogs and ignores invalid replacement targets', () => {
        const catalog = normalizeWorkTypeCatalog({ types: [{ value: ' Manga ' }, { value: 'manga' }, { value: '' }, null], redirects: { Webtoon: 'Manga', Manhwa: 'Missing' } });
        expect(catalog).toEqual({ types: [{ value: 'Manga' }], redirects: { Webtoon: 'Manga' } });
        expect(normalizeWorkTypeCatalog({ types: [] }).types.length).toBeGreaterThan(0);
    });
    it('updates selected types and explicit rules in saved views when a type is removed', () => {
        const state = structuredClone(DEFAULT_SETTINGS.manga.viewState);
        state.workTypes = ['Webtoon', 'Manhwa'];
        state.rules = [{ id: 'type', field: 'workType', fieldType: 'list', operator: 'notContains', value: ['Webtoon', 'Manga'] }];
        replaceWorkTypeInView(state, 'Webtoon', 'Manhwa');
        expect(state.workTypes).toEqual(['Manhwa']);
        expect(state.rules[0].value).toEqual(['Manhwa', 'Manga']);
    });
    it('preserves renamed note assignments and writes a replacement to existing manga notes', async () => {
        configureMangaWorkTypes({ types: [{ value: 'Webtoon', label: 'Веб-комикс' }, { value: 'Manhwa' }], redirects: {} });
        const file = createMockFile('Manga/Comic.md', 'Comic');
        const frontmatter: Record<string, unknown> = { type: 'manga', title: 'Comic', work_type: 'Webtoon' };
        const app = createMockApp({ [file.path]: { frontmatter } });
        app.vault.getAbstractFileByPath = () => file;
        app.fileManager.processFrontMatter = async (_file, update) => { update(frontmatter); };
        const service = new ReadingService(app, 'manga', 'Manga', createMetadataService(app));
        const item = service.parseFromCache(file)!;
        expect(item.type === 'manga' && getMangaWorkTypeLabel(item.workType, 'ru')).toBe('Веб-комикс');
        await service.updateItem(item, { workType: 'Manhwa' });
        expect(frontmatter.work_type).toBe('Manhwa');
        expect(service.parseFromCache(file)).toMatchObject({ workType: 'Manhwa', displayName: 'Comic' });
    });
});
