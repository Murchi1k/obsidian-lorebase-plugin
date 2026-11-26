import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/constants';
import { buildDefaultAdvancedTemplate, completeAdvancedTemplate, enableCompleteTemplate, TEMPLATE_MEDIA_TYPES, rememberAdvancedTemplate, switchTemplateMode } from '../src/services/integrations/templatePreferences';
import { buildSimpleTemplate, getDefaultTemplateFields, getSimpleWikilinkTokens, renderTemplate } from '../src/services/integrations/templateUtils';
import { getTemplateYamlKeys } from '../src/services/integrations/templateSchema';
import { MetadataService } from '../src/services/MetadataService';
import { GameService } from '../src/services/GameService';
import { ReadingService } from '../src/services/ReadingService';
import { createMockApp, createMockFile } from './helpers/testHelpers';
import type { App } from 'obsidian';
import { findTemplatePropertyAtCursor } from '../src/settings/sections/templateTools';

describe('contextual template hints', () => {
    it('finds the renamed property and its token on a continuation line', () => {
        const template = '---\r\n"Мои части: аниме":\r\n{{VALUE:animePartsYaml}}\r\n---\r\nname: Markdown';
        expect(findTemplatePropertyAtCursor(template, template.indexOf('animePartsYaml'))).toEqual({
            key: 'Мои части: аниме',
            tokens: ['animepartsyaml'],
        });
        expect(findTemplatePropertyAtCursor(template, template.indexOf('name:'))).toBeUndefined();
    });

    it('uses the property name for a literal and skips comment lines', () => {
        const template = '---\nfavorite: false\n# {{VALUE:rating}}\n---';
        expect(findTemplatePropertyAtCursor(template, template.indexOf('false'))).toEqual({ key: 'favorite', tokens: [] });
        expect(findTemplatePropertyAtCursor(template, template.indexOf('#'))).toBeUndefined();
    });
});

describe('complete templates and persistent property names', () => {
    it.each(['games', 'anime', 'movies', 'series', 'books', 'manga', 'music'] as const)('renders the full advanced %s template with renamed properties', kind => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        const media = TEMPLATE_MEDIA_TYPES[kind];
        const config = kind === 'music' ? settings.music.noteTemplate! : settings.integrations.media[kind];
        const template = buildDefaultAdvancedTemplate(kind);
        expect(new Set(getTemplateYamlKeys(template))).toEqual(new Set(getTemplateYamlKeys(buildSimpleTemplate(kind, getDefaultTemplateFields(kind)))));
        expect(template).toContain('## My Notes');
        const name = kind === 'games' ? 'name' : 'title';
        config.templateMode = 'advanced';
        config.template = template.replace(new RegExp('^' + name + ':', 'm'), '"Моё название":').replace(/^type:/m, 'media_type:');
        rememberAdvancedTemplate(kind, config);
        const rendered = renderTemplate(config.template, { type: media, name: 'Named', title: 'Named' }, kind === 'music');
        expect(rendered).toContain('"Моё название": "Named"');
        expect(rendered).toContain('media_type: "' + media + '"');
        const metadata = new MetadataService(createMockApp({}), () => settings);
        expect(metadata.resolveFrontmatter(media, { 'Моё название': 'Named', media_type: media })[name]).toBe('Named');
    });

    it.each(['games', 'anime', 'movies', 'series', 'books', 'manga'] as const)('enables every %s field and completes an older advanced template without losing the poster rename or body', kind => {
        const config = structuredClone(DEFAULT_SETTINGS.integrations.media[kind]);
        config.templateEnabled = false;
        config.templateFields = ['name'];
        enableCompleteTemplate(kind, config);
        expect(config.templateEnabled).toBe(true);
        expect(config.templateFields).toEqual(getDefaultTemplateFields(kind));
        if (kind === 'games') expect(config.templateFields).toEqual(expect.arrayContaining(['main', 'main_plus_sides', 'perfectionist', 'dlc']));
        if (kind === 'anime' || kind === 'manga') expect(config.templateFields).toContain('alternativeTitles');
        const token = kind === 'anime' ? 'image' : 'Poster';
        const original = `---\nxys: "{{VALUE:${token}}}"\ncustom: keep\n---\n\n# My notes\nDo not change.`;
        const complete = completeAdvancedTemplate(kind, original);
        expect(complete).toContain(`xys: "{{VALUE:${token}}}"`);
        expect(complete).not.toMatch(/^(poster|image):/m);
        expect(complete).toContain('custom: keep');
        expect(complete).toContain('# My notes\nDo not change.');
        expect(completeAdvancedTemplate(kind, complete)).toBe(complete);
        config.templateMode = 'advanced'; config.template = complete;
        rememberAdvancedTemplate(kind, config);
        const keys = getTemplateYamlKeys(buildSimpleTemplate(kind, config.templateFields, config.fieldAliases));
        for (const key of keys) expect(getTemplateYamlKeys(complete)).toContain(key);
    });

    it('keeps xys through mode changes, reads the vertical poster and saves updates to xys rather than poster', async () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        const config = settings.integrations.media.games;
        config.templateMode = 'advanced';
        config.template = buildSimpleTemplate('games', getDefaultTemplateFields('games')).replace(/^poster:/m, 'xys:') + '\n\n# Review';
        const advanced = config.template;
        switchTemplateMode('games', config, 'simple');
        expect(config.template).toContain('xys: "{{VALUE:Poster}}"');
        expect(config.template).not.toMatch(/^poster:/m);
        const file = createMockFile('Games/Metro Exodus.md', 'Metro Exodus');
        const fm: Record<string, unknown> = { type: 'game', name: 'Metro Exodus', xys: 'https://example.test/vertical.jpg', poster_b: 'https://example.test/horizontal.jpg' };
        const app = createMockApp({ [file.path]: { frontmatter: fm } });
        app.vault.getAbstractFileByPath = () => file;
        app.fileManager.processFrontMatter = async (_file, callback) => { callback(fm); };
        const metadata = new MetadataService(app, () => settings);
        const game = new GameService(app, metadata).parseGameFromCache(file)!;
        expect(game.imageUrl).toBe('https://example.test/vertical.jpg');
        expect(game.horizontalImageUrl).toBe('https://example.test/horizontal.jpg');
        expect(game.rawFields).toHaveProperty('xys', 'https://example.test/vertical.jpg');
        await metadata.updateMetadata(file, { poster: 'https://example.test/new.jpg' }, 'game');
        expect(fm.xys).toBe('https://example.test/new.jpg'); expect(fm).not.toHaveProperty('poster');
        switchTemplateMode('games', config, 'advanced');
        expect(config.template).toBe(advanced);
        expect(config.fieldAliases?.poster).toBe('xys');
    });

    it('moves an existing standard property into the renamed slot when saving an older note', async () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.integrations.media.games.templateMode = 'advanced';
        settings.integrations.media.games.template = '---\nxys: "{{VALUE:Poster}}"\nstatus: "{{VALUE:status}}"\n---';
        const fm: Record<string, unknown> = { poster: 'https://example.test/old.jpg', status: 'playing', custom: true };
        const app = { fileManager: { async processFrontMatter(_file: unknown, callback: (data: Record<string, unknown>) => void) { callback(fm); } } } as unknown as App;
        await new MetadataService(app, () => settings).updateMetadata(createMockFile('Games/Test.md', 'Test'), { status: 'completed' }, 'game');
        expect(fm).toEqual({ xys: 'https://example.test/old.jpg', status: 'completed', custom: true });
        expect(Object.keys(fm)).toEqual(['xys', 'status', 'custom']);
    });




    it('enables every supported wikilink field in the default templates', () => {
        for (const kind of Object.keys(TEMPLATE_MEDIA_TYPES) as Array<keyof typeof TEMPLATE_MEDIA_TYPES>) {
            const config = kind === 'music' ? DEFAULT_SETTINGS.music.noteTemplate! : DEFAULT_SETTINGS.integrations.media[kind];
            for (const token of Object.values(getSimpleWikilinkTokens(kind))) {
                expect(config.template).toContain('{{VALUE:' + token + '|wikilink}}');
                expect(buildDefaultAdvancedTemplate(kind)).toContain('{{VALUE:' + token + '|wikilink}}');
            }
        }
    });

    it('keeps explicitly disabled wikilinks off in both generated template modes', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        const config = settings.music.noteTemplate!;
        config.wikilinkFields = [];
        const metadata = new MetadataService(createMockApp({}), () => settings);
        expect(metadata.getNoteTemplate('music')).toContain('artist: {{VALUE:artist}}');
        switchTemplateMode('music', config, 'advanced');
        expect(config.template).toContain('artist: {{VALUE:artist}}');
        expect(config.template).not.toContain('|wikilink');
    });

    it('uses simple wikilink choices for the actual note template and carries them into a new advanced template', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        const config = settings.integrations.media.books;
        Object.assign(config, {
            templateEnabled: true, templateMode: 'simple', templateFields: ['authors', 'genres', 'year'],
            fieldAliases: { authors: 'Book authors' }, wikilinkFields: ['authors', 'year'],
        });
        const metadata = new MetadataService(createMockApp({}), () => settings);
        const template = metadata.getNoteTemplate('book');
        expect(template).toContain('"Book authors": "{{VALUE:authors|wikilink}}"');
        expect(template).toContain('genres: "{{VALUE:genres}}"');
        expect(template).toContain('year: {{VALUE:Year}}');
        expect(renderTemplate(template, { authors: ['Frank Herbert'], genres: ['Fantasy'] }))
            .toContain('"Book authors": ["[[Frank Herbert]]"]');
        switchTemplateMode('books', config, 'advanced');
        expect(config.template).toContain('"Book authors": "{{VALUE:authors|wikilink}}"');
        switchTemplateMode('books', config, 'simple');
        expect(config.template).toBe(template);
    });

    it('initializes the simple link buttons from a previously saved advanced template', () => {
        const config = structuredClone(DEFAULT_SETTINGS.integrations.media.books);
        config.templateMode = 'advanced';
        config.template = '---\n"Book genres": "{{VALUE:genres|wikilink}}"\nauthors: "{{VALUE:authors}}"\n---';
        switchTemplateMode('books', config, 'simple');
        expect(config.wikilinkFields).toEqual(['genres']);
        expect(config.template).toContain('"Book genres": "{{VALUE:genres|wikilink}}"');
        expect(config.template).toContain('authors: "{{VALUE:authors}}"');
    });


    it('keeps a custom directors property when switching to the simple template', () => {
        const config = structuredClone(DEFAULT_SETTINGS.integrations.media.movies);
        config.templateMode = 'advanced';
        config.template = '---\n"Film directors": "{{VALUE:directors|wikilink}}"\n---';
        switchTemplateMode('movies', config, 'simple');
        expect(config.wikilinkFields).toEqual(['director']);
        expect(config.template).toContain('"Film directors": "{{VALUE:directors|wikilink}}"');
    });

    it('reads linked authors and genres as labels and preserves their links on edit', async () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        const config = settings.integrations.media.books;
        config.templateEnabled = true;
        config.templateMode = 'advanced';
        config.template = '---\n"Book authors": {{VALUE:authors|wikilink}}\ngenres: {{VALUE:genres|wikilink}}\n---';
        const file = createMockFile('Books/Dune.md', 'Dune');
        const fm: Record<string, unknown> = {
            type: 'book', title: 'Dune',
            'Book authors': ['[[Authors/Frank Herbert|Frank Herbert]]'], genres: ['[[Science Fiction]]'],
        };
        const app = createMockApp({ [file.path]: { frontmatter: fm } });
        app.fileManager.processFrontMatter = async (_file, callback) => { callback(fm); };
        const metadata = new MetadataService(app, () => settings);
        const book = new ReadingService(app, 'book', 'Books', metadata).parseFromCache(file)!;
        expect(book.authors).toEqual(['Frank Herbert']);
        expect(book.genres).toEqual(['science-fiction']);
        await metadata.updateMetadata(file, { authors: [...book.authors, 'Brian Herbert'], genres: book.genres }, 'book');
        expect(fm['Book authors']).toEqual(['[[Authors/Frank Herbert|Frank Herbert]]', '[[Brian Herbert]]']);
        expect(fm.genres).toEqual(['[[Science Fiction]]']);
        expect(fm).not.toHaveProperty('authors');
    });

    it('uses case-insensitive value tokens consistently for renamed properties', () => {
        expect(renderTemplate('---\nxys: "{{VALUE:poster}}"\n---', { Poster: 'cover.jpg' })).toContain('xys: "cover.jpg"');
    });
});
