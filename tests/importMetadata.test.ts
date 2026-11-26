import { describe, expect, it } from 'vitest';
import { completeImportedMetadata } from '../src/services/integrations/importMetadata';
import { buildSimpleTemplate, getDefaultTemplateFields, renderTemplate } from '../src/services/integrations/templateUtils';
import { mergeProviderMetadata } from '../src/services/integrations/enrichment';

describe('imported credits and origin metadata', () => {
    it('fills legacy source placeholders without replacing personal credits or accepting N/A as metadata', () => {
        const result = mergeProviderMetadata({ directors: 'N/A', publishers: ['—'], countries: [] }, { director: ['Director'], publishers: ['Publisher'], countries: ['US'] });
        expect(result.patch).toEqual({ directors: ['Director'], publishers: ['Publisher'], countries: ['US'] });
        expect(mergeProviderMetadata({ director: ['My director'] }, { director: ['Other'] }).patch).toEqual({});
        expect(mergeProviderMetadata({}, { publisher: 'N/A', director: '-' }).patch).toEqual({});
    });
    it.each(['games', 'movies', 'series', 'books'] as const)('retains populated %s fields through reduced or old templates', kind => {
        const values = { countries: ['US'], publishers: ['Game Publisher'], publisher: ['Book Publisher'], directors: ['Director'] };
        const content = completeImportedMetadata('---\ntitle: Test\ncountries: []\n---\n\n# Personal text', kind, values, '');
        expect(content).toContain('countries: ["US"]');
        expect(content).toContain(kind === 'games' ? 'publishers: ["Game Publisher"]' : kind === 'books' ? 'publisher: ["Book Publisher"]' : 'director: ["Director"]');
        expect(content.endsWith('# Personal text')).toBe(true);
    });
    it('fills renamed empty fields, preserves populated literals and does not duplicate template properties', () => {
        const template = '---\nOrigin: {{VALUE:countries}}\nBy: {{VALUE:directors}}\n---';
        const content = completeImportedMetadata('---\r\nOrigin: []\r\nBy: ""\r\n---\r\nKeep', 'movies', { countries: ['FR'], directors: ['One', 'Two'] }, template);
        expect(content).toContain('Origin: ["FR"]\r\nBy: ["One","Two"]');
        expect(content).not.toMatch(/^countries:|^director:/m);
        expect(completeImportedMetadata(content, 'movies', { countries: ['US'], directors: ['Other'] }, template)).toBe(content);
    });
    it('does not invent source fields or replace populated multiline values', () => {
        const content = '---\npublisher:\n  - My publisher\ncountries: [UA]\n---\n';
        expect(completeImportedMetadata(content, 'books', { publisher: ['Other'], countries: ['US'] }, '')).toBe(content);
        expect(completeImportedMetadata('---\ntitle: Test\n---', 'books', {}, '')).toBe('---\ntitle: Test\n---');
    });
    it.each(['games', 'movies', 'books'] as const)('preserves credits in the standard %s template', kind => {
        const template = buildSimpleTemplate(kind, getDefaultTemplateFields(kind));
        const values = { name: 'Title', countries: ['UA'], directors: ['Director'], publishers: ['Publisher'], publisher: ['Publisher'] };
        const rendered = renderTemplate(template, values);
        expect(completeImportedMetadata(rendered, kind, values, template)).toBe(rendered);
    });
});
