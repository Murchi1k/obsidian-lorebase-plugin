import { describe, expect, it } from 'vitest';
import { buildSimpleTemplate, renderTemplate, sanitizeFileName } from '../src/services/integrations/templateUtils';

describe('templateUtils', () => {
    it('builds simple game template with selected fields only', () => {
        const template = buildSimpleTemplate('games', ['poster', 'plot', 'status']);
        expect(template).toContain('poster: "{{VALUE:Poster}}"');
        expect(template).toContain('plot: "{{VALUE:Plot}}"');
        expect(template).toContain('status: "{{VALUE:status}}"');
        expect(template).not.toContain('metacritic:');
    });

    it('builds howlongtobeat fields when selected', () => {
        const template = buildSimpleTemplate('games', ['rating', 'url', 'main', 'main_plus_sides', 'perfectionist']);
        expect(template).toContain('main: "{{VALUE:main}}"');
        expect(template).toContain('main_plus_sides: "{{VALUE:main_plus_sides}}"');
        expect(template).toContain('perfectionist: "{{VALUE:perfectionist}}"');
        expect(template.indexOf('url: "{{VALUE:url}}"')).toBeLessThan(template.indexOf('main: "{{VALUE:main}}"'));
    });

    it('renders array values as yaml lists', () => {
        const template = `---\ngenres: "{{VALUE:genres}}"\n---`;
        const result = renderTemplate(template, { genres: ['Action', 'RPG'] });

        expect(result).toContain('genres:');
        expect(result).toContain('  - "Action"');
        expect(result).toContain('  - "RPG"');
    });

    it('renders raw multiline yaml placeholder blocks', () => {
        const template = `---\nanime_parts:\n{{VALUE:animePartsYaml}}\n---`;
        const result = renderTemplate(template, {
            animePartsYaml: '  - id: "tv-1"\n    kind: "tv"',
        });

        expect(result).toContain('anime_parts:\n  - id: "tv-1"\n    kind: "tv"');
    });

    it('sanitizes file names', () => {
        const result = sanitizeFileName('Bad:*Name?/Game\\Title');
        expect(result).toBe('BadNameGameTitle');
    });
});
