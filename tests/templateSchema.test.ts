import { describe, expect, it } from 'vitest';
import type { App } from 'obsidian';
import { DEFAULT_SETTINGS } from '../src/constants';
import type { MediaType } from '../src/types';
import { MetadataService } from '../src/services/MetadataService';
import { buildSimpleTemplate, getDefaultTemplateFields, renderTemplate } from '../src/services/integrations/templateUtils';
import { getDeferredTemplateFields, getTemplateYamlKeys, includeDeferredTemplateFields } from '../src/services/integrations/templateSchema';
import { parseTemplateFieldAliases } from '../src/services/media/templateFieldAliases';
import { templateFieldDescription } from '../src/settings/sections/templateFieldHelp';
import { createMockFile } from './helpers/testHelpers';

const media = { games: 'game', anime: 'anime', movies: 'movie', series: 'series', books: 'book', manga: 'manga' } as const;

function editor(frontmatter: Record<string, unknown>, settings = structuredClone(DEFAULT_SETTINGS)) {
    const app = { fileManager: { async processFrontMatter(_file: unknown, update: (fm: Record<string, unknown>) => void) { update(frontmatter); } } } as unknown as App;
    return { service: new MetadataService(app, () => settings), settings, file: createMockFile('Library/Test.md', 'Test') };
}

describe('template layout throughout a note lifecycle', () => {
    for (const [kind, type] of Object.entries(media) as [keyof typeof media, MediaType][]) {
        it(`reserves deferred ${kind} fields at creation and keeps their order after edits and clearing`, async () => {
            const fields = getDefaultTemplateFields(kind);
            const template = buildSimpleTemplate(kind, fields);
            const keys = getTemplateYamlKeys(template);
            const content = renderTemplate(template, {});
            expect(keys.length).toBe(new Set(keys).size);
            for (const field of getDeferredTemplateFields(kind)) {
                expect(content).toContain(`${field.yaml}: ${JSON.stringify(field.initial)}`);
                expect(templateFieldDescription(field.key)).not.toBe('');
            }
            for (const field of fields) expect(templateFieldDescription(field)).not.toBe('');
            const fm: Record<string, unknown> = { custom: { keep: [1, 2] }, finished: '2026-10-26', title: 'Test', type };
            const { service, file } = editor(fm);
            await service.updateMetadata(file, { started: '2026-10-01', detailed_ratings: [{ name: 'Story', value: 8 }] }, type);
            expect(Object.keys(fm).slice(0, keys.length)).toEqual(keys);
            expect(fm.custom).toEqual({ keep: [1, 2] });
            const before = Object.keys(fm);
            await service.updateMetadata(file, { finished: null, detailed_ratings: null }, type);
            expect(Object.keys(fm)).toEqual(before);
            expect(fm.finished).toBeNull();
            expect(fm.detailed_ratings).toBeNull();
            await service.updateMetadata(file, { finished: '2026-10-26' }, type);
            expect(Object.keys(fm)).toEqual(before);
            expect(fm.finished).toBe('2026-10-26');
        });
    }

    it('keeps selected order for directors and grouped parts rather than moving directors to the beginning', () => {
        const template = buildSimpleTemplate('series', ['name', 'director', 'seriesParts', 'started', 'rating']);
        expect(getTemplateYamlKeys(template)).toEqual(['title', 'directors', 'active_part_id', 'series_parts', 'started', 'rating']);
        expect(parseTemplateFieldAliases('series', template).director).toBe('directors');
    });

    it('keeps renamed deferred fields and ignores placeholder references in the Markdown body', async () => {
        const fm: Record<string, unknown> = { Custom: 'keep', End: '2026-10-26', Scores: [{ name: 'Art', value: 9 }] };
        const { service, settings, file } = editor(fm);
        settings.integrations.media.anime.templateMode = 'advanced';
        settings.integrations.media.anime.template = '---\nScores: {{VALUE:detailedRatings}}\nEnd: {{VALUE:finished}}\nTitle: "{{VALUE:name}}"\n---\nBody: {{VALUE:finished}}';
        await service.updateMetadata(file, { finished: null }, 'anime');
        expect(Object.keys(fm)).toEqual(['Scores', 'End', 'Title', 'Custom']);
        expect(fm.End).toBeNull();
        expect(fm.Scores).toEqual([{ name: 'Art', value: 9 }]);
        expect(fm).not.toHaveProperty('finished');
        expect(fm).not.toHaveProperty('Body');
    });

    it('does not add unselected fields or recreate deleted legacy flags', async () => {
        const fm: Record<string, unknown> = { status: 'playing', playing: true, custom: 5 };
        const { service, settings, file } = editor(fm);
        settings.integrations.media.games.templateFields = ['status'];
        await service.updateMetadata(file, { playing: null, status: 'completed' }, 'game');
        expect(fm).toEqual({ status: 'completed', custom: 5 });
        expect(Object.keys(fm)).toEqual(['status', 'custom']);
    });

    it('leaves the note untouched when a conditional update is rejected', async () => {
        const fm = { status: 'watching', custom: true };
        const { service, file } = editor(fm);
        await service.updateMetadata(file, { status: 'completed' }, 'anime', () => false);
        expect(fm).toEqual({ status: 'watching', custom: true });
    });

    it('inserts new tracking fields once without changing the existing relative order', () => {
        const selected = ['favorite', 'status', 'name', 'rating'];
        const migrated = includeDeferredTemplateFields('anime', selected);
        expect(migrated.filter(key => selected.includes(key))).toEqual(selected);
        expect(migrated.indexOf('started')).toBe(migrated.indexOf('status') + 1);
        expect(includeDeferredTemplateFields('anime', migrated)).toEqual(migrated);
    });
});
