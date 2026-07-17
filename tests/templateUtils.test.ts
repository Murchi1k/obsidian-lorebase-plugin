import { describe, expect, it } from 'vitest';
import { buildSimpleTemplate, renderTemplate, sanitizeFileName } from '../src/services/integrations/templateUtils';
import { renderMangaPartsYaml } from '../src/services/integrations/shared';

describe('templateUtils', () => {
    it('builds simple game template with selected fields only', () => {
        const template = buildSimpleTemplate('games', ['name', 'poster', 'plot', 'status']);
        expect(template).toContain('name: "{{VALUE:name}}"');
        expect(template).toContain('poster: "{{VALUE:Poster}}"');
        expect(template).toContain('plot: "{{VALUE:Plot}}"');
        expect(template).toContain('status: "{{VALUE:status}}"');
        expect(template).not.toContain('metacritic:');
    });

    it('builds anime title field from the shared name value', () => {
        const template = buildSimpleTemplate('anime', ['name', 'image', 'status']);
        expect(template).toContain('title: "{{VALUE:name}}"');
        expect(template).toContain('image: "{{VALUE:image}}"');
        expect(template).toContain('status: "{{VALUE:status}}"');
    });

    it('builds reading templates from selected fields', () => {
        const bookTemplate = buildSimpleTemplate('books', ['name', 'poster', 'authors', 'pageTotal', 'chapterTotal', 'status']);
        const mangaTemplate = buildSimpleTemplate('manga', ['name', 'poster', 'chapterTotal', 'volumeTotal', 'mangaParts']);

        expect(bookTemplate).toContain('type: "book"');
        expect(bookTemplate).toContain('title: "{{VALUE:name}}"');
        expect(bookTemplate).toContain('authors: "{{VALUE:authors}}"');
        expect(bookTemplate).toContain('page_total: "{{VALUE:pageTotal}}"');
        expect(bookTemplate).toContain('chapter_total: "{{VALUE:chapterTotal}}"');
        expect(mangaTemplate).toContain('type: "manga"');
        expect(mangaTemplate).toContain('chapter_total: "{{VALUE:chapterTotal}}"');
        expect(mangaTemplate).toContain('volume_total: "{{VALUE:volumeTotal}}"');
        expect(mangaTemplate).toContain('manga_parts:');
        expect(mangaTemplate).toContain('{{VALUE:mangaPartsYaml}}');
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

    it('renders manga parts as raw yaml blocks', () => {
        const template = `---\nmanga_parts:\n{{VALUE:mangaPartsYaml}}\n---`;
        const result = renderTemplate(template, {
            mangaPartsYaml: renderMangaPartsYaml([
                {
                    id: 'volume-1',
                    kind: 'volume',
                    title: 'Volume 1',
                    volumeNumber: 1,
                    chapterCurrent: 0,
                    chapterTotal: 10,
                    status: 'planned',
                },
            ]),
        });

        expect(result).toContain('manga_parts:\n  - id: "volume-1"');
        expect(result).toContain('    volume: 1');
        expect(result).toContain('    chapter_total: 10');
    });

    it('sanitizes file names', () => {
        const result = sanitizeFileName('Bad:*Name?/Game\\Title');
        expect(result).toBe('BadNameGameTitle');
    });
});
