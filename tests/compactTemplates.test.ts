import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/constants';
import { MetadataService } from '../src/services/MetadataService';
import { buildSimpleTemplate, getDefaultTemplateFields, renderTemplate } from '../src/services/integrations/templateUtils';
import { getTemplateYamlKeys, isEmptyTemplateValue, orderTemplateContent, orderTemplateFrontmatter } from '../src/services/integrations/templateSchema';
import { createMockApp, createMockFile } from './helpers/testHelpers';

describe('compact template mode', () => {
    it.each(['games', 'anime', 'movies', 'series', 'books', 'manga'] as const)('omits empty %s properties without changing the complete template', kind => {
        const template = buildSimpleTemplate(kind, getDefaultTemplateFields(kind));
        const original = template;
        const content = renderTemplate(template, { name: 'Title', genres: [], favorite: false, userRating: 0,
            animePartsYaml: '  []', videoPartsYaml: '  []', mangaPartsYaml: '  []' });
        const compact = orderTemplateContent(content, template, { compact: true });
        const keys = getTemplateYamlKeys(compact);
        expect(keys[0]).toBe('type');
        for (const key of ['started', 'finished', 'detailed_ratings', 'related_media', 'genres', 'poster', 'image', 'anime_parts', 'movie_parts', 'series_parts', 'manga_parts']) {
            expect(keys).not.toContain(key);
        }
        expect(compact).toContain('favorite: false');
        if (kind === 'games') expect(compact).toContain('userRating: 0');
        expect(template).toBe(original);
        expect(getTemplateYamlKeys(template)).toContain('started');
        expect(orderTemplateContent(compact, template, { compact: true })).toBe(compact);
    });

    it('inserts newly filled and renamed properties in their reserved positions, then omits them again when cleared', async () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.integrations.compactTemplates = true;
        const config = settings.integrations.media.games;
        config.templateMode = 'advanced';
        config.template = '---\ntype: game\nname: "{{VALUE:name}}"\nxys: "{{VALUE:Poster}}"\nstarted: {{VALUE:started}}\nfinished: {{VALUE:finished}}\nfavorite: false\n---';
        const file = createMockFile('Games/Test.md', 'Test');
        const fm: Record<string, unknown> = { type: 'game', name: 'Test', favorite: false, custom: '', lorebase_source_snapshot: {} };
        const app = createMockApp({ [file.path]: { frontmatter: fm } });
        app.fileManager.processFrontMatter = async (_file, update) => update(fm);
        const service = new MetadataService(app, () => settings);
        await service.updateMetadata(file, { finished: '2026-10-26' }, 'game');
        expect(Object.keys(fm)).toEqual(['type', 'name', 'finished', 'favorite', 'custom', 'lorebase_source_snapshot']);
        await service.updateMetadata(file, { poster: 'cover.jpg', started: '2026-10-01' }, 'game');
        expect(Object.keys(fm)).toEqual(['type', 'name', 'xys', 'started', 'finished', 'favorite', 'custom', 'lorebase_source_snapshot']);
        expect(fm.xys).toBe('cover.jpg'); expect(fm).not.toHaveProperty('poster');
        await service.updateMetadata(file, { poster: '', started: null, finished: '' }, 'game');
        expect(Object.keys(fm)).toEqual(['type', 'name', 'favorite', 'custom', 'lorebase_source_snapshot']);
        settings.integrations.compactTemplates = false;
        await service.updateMetadata(file, { favorite: true }, 'game');
        expect(Object.keys(fm)).toEqual(['type', 'name', 'xys', 'started', 'finished', 'favorite', 'custom', 'lorebase_source_snapshot']);
        expect(fm.xys).toBeNull();
    });

    it('removes only empty root template properties and preserves nested data, zero, false, unknown properties and the body', () => {
        const fm = { empty: null, list: [], object: {}, whitespace: '  ', zero: 0, flag: false,
            parts: [{ title: '', progress: 0, completed: false }], custom: null };
        orderTemplateFrontmatter(fm, ['empty', 'list', 'object', 'whitespace', 'zero', 'flag', 'parts'], {}, { compact: true });
        expect(fm).toEqual({ zero: 0, flag: false, parts: [{ title: '', progress: 0, completed: false }], custom: null });
        for (const value of [null, undefined, '', '  ', [], {}]) expect(isEmptyTemplateValue(value)).toBe(true);
        for (const value of [0, false, '0', 'false', [null], { value: null }]) expect(isEmptyTemplateValue(value)).toBe(false);
        const template = '---\nempty:\nblank:\nparts:\nzero:\nflag:\n---';
        const body = '\n\n# Notes\nempty: Keep this text.\n';
        const content = '---\nempty: null # missing\n# Keep comment\nblank: |\n  \nparts:\n  - title: ""\n    progress: 0\nzero: 0\nflag: false\ncustom: null\n---' + body;
        const compact = orderTemplateContent(content, template, { compact: true });
        expect(getTemplateYamlKeys(compact)).toEqual(['parts', 'zero', 'flag', 'custom']);
        expect(compact).toContain('# Keep comment');
        expect(compact).toContain('  - title: ""\n    progress: 0');
        expect(compact.endsWith(body)).toBe(true);
    });
});
