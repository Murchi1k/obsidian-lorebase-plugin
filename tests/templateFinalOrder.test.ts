import { describe, expect, it } from 'vitest';
import { ensureClassificationFrontmatter } from '../src/services/IntegrationService';
import { buildSimpleTemplate, ensureIntegrationSourceFrontmatter, getDefaultTemplateFields, renderTemplate } from '../src/services/integrations/templateUtils';
import { getTemplateYamlKeys, orderTemplateContent, orderTemplateFrontmatter } from '../src/services/integrations/templateSchema';
import { parseTemplateFieldAliases } from '../src/services/media/templateFieldAliases';
import { DEFAULT_SETTINGS } from '../src/constants';
import { MetadataService } from '../src/services/MetadataService';
import { createMockApp, createMockFile } from './helpers/testHelpers';

describe('final YAML order after operational fields are added', () => {
    it.each(['games', 'anime', 'movies', 'series', 'books', 'manga'] as const)('keeps %s fields in template order with internal metadata last', kind => {
        const template = buildSimpleTemplate(kind, getDefaultTemplateFields(kind));
        const values = { name: 'Test', genres: ['Action'], countryOfOrigin: 'JP', workType: 'Game', isAdult: false, alternativeTitles: [], animePartsYaml: '  []', videoPartsYaml: '  []', mangaPartsYaml: '  []' };
        let content = renderTemplate(template, values);
        content = ensureClassificationFrontmatter(content, kind, values, template);
        content = ensureIntegrationSourceFrontmatter(content, 'anilist', '20613');
        content = content.replace(/^---\n/, '---\nlorebase_source_snapshot: {}\n');
        const ordered = orderTemplateContent(content, template);
        const keys = getTemplateYamlKeys(ordered);
        const expected = getTemplateYamlKeys(template);
        expect(keys.slice(0, expected.length)).toEqual(expected);
        expect(keys[0]).toBe('type');
        expect(keys.length).toBe(new Set(keys).size);
        expect(keys.slice(expected.length).every(key => key.startsWith('lorebase_'))).toBe(true);
        expect(orderTemplateContent(ordered, template)).toBe(ordered);
    });

    it('does not add standard classification or integration properties when their renamed properties exist', () => {
        const template = '---\nKind: "{{VALUE:workType}}"\nCountry: "{{VALUE:countryOfOrigin}}"\nAdult: {{VALUE:isAdult}}\nGenres: {{VALUE:genres}}\nSource: "{{VALUE:integrationProvider}}"\nID: "{{VALUE:integrationId}}"\n---';
        const aliases = parseTemplateFieldAliases('anime', template);
        let content = renderTemplate(template, { workType: 'TV', countryOfOrigin: 'JP', isAdult: false, genres: ['Action'] });
        content = ensureClassificationFrontmatter(content, 'anime', { countryOfOrigin: 'JP', isAdult: false, genres: ['Action'] }, template);
        content = ensureIntegrationSourceFrontmatter(content, 'anilist', '20613', aliases);
        const keys = getTemplateYamlKeys(orderTemplateContent(content, template));
        expect(keys).toEqual(['Kind', 'Country', 'Adult', 'Genres', 'Source', 'ID', 'lorebase_anime_genres_migrated']);
        expect(content).toContain('Source: "anilist"');
    });

    it('moves complete YAML blocks with CRLF, nested parts, comments and a Markdown body intact', () => {
        const body = '\r\n\r\n# Notes\r\nlorebase_other: Leave body text alone.\r\n';
        const content = '---\r\nlorebase_anime_genres_migrated: true\r\nparts:\r\n- id: part-1\r\n  title: "A: B"\r\ntype: anime\r\nplot: |\r\n  Keep this\r\n  multiline text\r\n# Preserve comment\r\ncustom: yes\r\n---' + body;
        const template = '---\ntype: anime\nplot: "{{VALUE:Plot}}"\nparts:\n{{VALUE:animePartsYaml}}\n---';
        const ordered = orderTemplateContent(content, template);
        expect(getTemplateYamlKeys(ordered)).toEqual(['type', 'plot', 'parts', 'custom', 'lorebase_anime_genres_migrated']);
        expect(ordered).toContain('parts:\r\n- id: part-1\r\n  title: "A: B"');
        expect(ordered).toContain('plot: |\r\n  Keep this\r\n  multiline text\r\n# Preserve comment');
        expect(ordered.endsWith(body)).toBe(true);
    });

    it('repairs the order when migrating genres, even if the marker already exists at the beginning', async () => {
        const file = createMockFile('Anime/Test.md', 'Test');
        const fm = { lorebase_anime_genres_migrated: true, type: 'anime', genres: ['Action'], tags: ['personal'], custom: true };
        const app = createMockApp({ [file.path]: { frontmatter: fm } });
        app.fileManager.processFrontMatter = async (_file, handler) => handler(fm);
        const service = new MetadataService(app, () => structuredClone(DEFAULT_SETTINGS));
        await service.migrateAnimeGenres(file);
        expect(Object.keys(fm)[0]).toBe('type');
        expect(Object.keys(fm).at(-1)).toBe('lorebase_anime_genres_migrated');
        expect(fm.tags).toEqual(['personal']);
    });

    it('keeps custom user properties before internal fields when updating any media object', () => {
        const fm = { lorebase_source_snapshot: { provider: 'anilist' }, custom: [1, 2], type: 'anime', lorebase_anime_genres_migrated: true };
        orderTemplateFrontmatter(fm, ['type']);
        expect(Object.keys(fm)).toEqual(['type', 'custom', 'lorebase_source_snapshot', 'lorebase_anime_genres_migrated']);
    });
});
