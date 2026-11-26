import { describe, expect, it } from 'vitest';
import { buildSimpleTemplate, ensureIntegrationSourceFrontmatter, getDefaultTemplateFields, getEffectiveSimpleTemplateFields, migrateAlternativeTitleTemplate, renderTemplate, sanitizeFileName } from '../src/services/integrations/templateUtils';
import { renderMangaPartsYaml } from '../src/services/integrations/shared';

describe('templateUtils', () => {
    it('migrates the old alternative-title template key without rewriting custom fields or body text', () => {
        const template = '---\r\ntitle: "{{VALUE:name}}"\r\ntitles: {{VALUE:alternativeTitles}}\r\n---\r\ntitles: {{VALUE:alternativeTitles}}';
        const migrated = migrateAlternativeTitleTemplate(template);
        expect(migrated).toBe('---\r\ntitle: "{{VALUE:name}}"\r\nalt_titles: {{VALUE:alternativeTitles}}\r\n---\r\ntitles: {{VALUE:alternativeTitles}}');
        expect(migrateAlternativeTitleTemplate(migrated)).toBe(migrated);
        for (const yaml of ['titles: ["Manual"]', 'Custom: {{VALUE:alternativeTitles}}', 'alt_titles: []\ntitles: {{VALUE:alternativeTitles}}']) {
            const custom = `---\n${yaml}\n---`;
            expect(migrateAlternativeTitleTemplate(custom)).toBe(custom);
        }
    });
    it('builds simple game template with selected fields only', () => {
        const template = buildSimpleTemplate('games', ['type', 'name', 'poster', 'plot', 'rating', 'userRating', 'status']);
        expect(template).toContain('type: "game"');
        expect(template).toContain('name: "{{VALUE:name}}"');
        expect(template).toContain('poster: "{{VALUE:Poster}}"');
        expect(template).toContain('plot: "{{VALUE:Plot}}"');
        expect(template).toContain('userRating: {{VALUE:userRating}}');
        expect(template).toContain('status: "{{VALUE:status}}"');
        expect(template).not.toContain('rating: {{VALUE:rating}}');
        expect(template).not.toContain('metacritic:');
    });

    it('builds anime title field from the shared name value', () => {
        const template = buildSimpleTemplate('anime', [
            'type',
            'name',
            'image',
            'communityRating',
            'communityVotes',
            'communityRatingProvider',
            'status',
            'integrationSource',
        ]);
        expect(template).toContain('type: "anime"');
        expect(template).toContain('title: "{{VALUE:name}}"');
        expect(template).toContain('image: "{{VALUE:image}}"');
        expect(template).toContain('communityRating: {{VALUE:communityRating}}');
        expect(template).toContain('communityVotes: {{VALUE:communityVotes}}');
        expect(template).toContain('communityRatingProvider: "{{VALUE:communityRatingProvider}}"');
        expect(template).not.toContain('scoreImdb:');
        expect(template).toContain('status: "{{VALUE:status}}"');
        expect(template).toContain('integration_provider: "{{VALUE:integrationProvider}}"');
        expect(template).toContain('integration_id: "{{VALUE:integrationId}}"');
    });

    it('stores release dates in anime, series, and manga templates', () => {
        for (const kind of ['anime', 'series', 'manga'] as const) {
            expect(getDefaultTemplateFields(kind)).toContain('released');
            expect(buildSimpleTemplate(kind, ['released'])).toContain('released: {{VALUE:released}}');
        }
    });

    it('keeps the field order selected in the simple template editor', () => {
        const template = buildSimpleTemplate('anime', [
            'studios',
            'type',
            'name',
            'image',
            'year',
            'integrationSource',
        ]);

        expect(template.indexOf('studios:')).toBeLessThan(template.indexOf('type:'));
        expect(template.indexOf('type:')).toBeLessThan(template.indexOf('title:'));
        expect(template.indexOf('title:')).toBeLessThan(template.indexOf('image:'));
        expect(template.indexOf('image:')).toBeLessThan(template.indexOf('year:'));
        expect(template.indexOf('year:')).toBeLessThan(template.indexOf('integration_provider:'));
        expect(template.indexOf('integration_provider:')).toBeLessThan(template.indexOf('integration_id:'));
    });

    it('builds reading templates from selected fields', () => {
        const bookTemplate = buildSimpleTemplate('books', ['type', 'name', 'poster', 'authors', 'pageTotal', 'chapterTotal', 'status']);
        const mangaTemplate = buildSimpleTemplate('manga', ['type', 'name', 'poster', 'chapterTotal', 'volumeTotal', 'mangaParts', 'adult']);

        expect(bookTemplate).toContain('type: "book"');
        expect(bookTemplate).toContain('title: "{{VALUE:name}}"');
        expect(bookTemplate).toContain('authors: "{{VALUE:authors|wikilink}}"');
        expect(bookTemplate).toContain('page_total: {{VALUE:pageTotal}}');
        expect(bookTemplate).toContain('chapter_total: {{VALUE:chapterTotal}}');
        expect(mangaTemplate).toContain('type: "manga"');
        expect(mangaTemplate).toContain('chapter_total: {{VALUE:chapterTotal}}');
        expect(mangaTemplate).toContain('volume_total: {{VALUE:volumeTotal}}');
        expect(mangaTemplate).toContain('manga_parts:');
        expect(mangaTemplate).toContain('{{VALUE:mangaPartsYaml}}');
        expect(mangaTemplate).toContain('Sex18: {{VALUE:isAdult}}');
    });

    it('builds howlongtobeat fields when selected', () => {
        const template = buildSimpleTemplate('games', ['rating', 'url', 'main', 'main_plus_sides', 'perfectionist']);
        expect(template).toContain('main: {{VALUE:main}}');
        expect(template).toContain('main_plus_sides: {{VALUE:main_plus_sides}}');
        expect(template).toContain('perfectionist: {{VALUE:perfectionist}}');
        expect(template.indexOf('url: "{{VALUE:url}}"')).toBeLessThan(template.indexOf('main: {{VALUE:main}}'));
    });

    it('normalizes effective simple template fields before saving or creating notes', () => {
        expect(getEffectiveSimpleTemplateFields('anime', [
            'name',
            'communityRating',
            'communityVotes',
            'communityRatingProvider',
            'scoreImdb',
            'studios',
            'name',
        ])).toEqual([
            'name',
            'communityRating',
            'communityVotes',
            'communityRatingProvider',
            'studios',
        ]);

        expect(getEffectiveSimpleTemplateFields('games', [
            'name',
            'rating',
            'main',
            'completionist',
        ])).toEqual(['name', 'main', 'perfectionist']);

        expect(getEffectiveSimpleTemplateFields('games', ['name', 'main', 'completionist'], {
            howLongToBeatEnabled: true,
        })).toEqual(['name', 'main', 'perfectionist']);
    });

    it('renders array values as yaml lists', () => {
        const template = `---\ngenres: "{{VALUE:genres}}"\n---`;
        const result = renderTemplate(template, { genres: ['Action', 'RPG'] });

        expect(result).toContain('genres:');
        expect(result).toContain('  - "Action"');
        expect(result).toContain('  - "RPG"');
    });

    it('renders movie release dates as unquoted yaml dates and credits as block arrays', () => {
        const template = buildSimpleTemplate('movies', ['released', 'director', 'actors'], {}, []);
        const result = renderTemplate(template, {
            released: '2013-12-25',
            directors: ['Martin Scorsese'],
            actors: ['Leonardo DiCaprio', 'Jonah Hill'],
        });

        expect(template).toContain('released: {{VALUE:released}}');
        expect(template).not.toContain('released: "{{VALUE:released}}"');
        expect(result).toContain('released: 2013-12-25');
        expect(result).toContain('directors:\n  - "Martin Scorsese"');
        expect(result).toContain('actors:\n  - "Leonardo DiCaprio"\n  - "Jonah Hill"');
        expect(renderTemplate('released: "{{VALUE:released}}"', { released: '2013-12-25' }))
            .toBe('released: 2013-12-25');
    });

    it('renders book release dates and credits as yaml-native values', () => {
        const template = buildSimpleTemplate('books', ['released', 'authors', 'publisher'], {}, []);
        const result = renderTemplate(template, {
            released: '2001-10-01',
            authors: ['Christie Golden', 'Second Author'],
            publisher: ['Blizzard Legends', 'Orbit'],
        });

        expect(template).toContain('released: {{VALUE:released}}');
        expect(result).toContain('released: 2001-10-01');
        expect(result).toContain('authors:\n  - "Christie Golden"\n  - "Second Author"');
        expect(result).toContain('publisher:\n  - "Blizzard Legends"\n  - "Orbit"');
    });



    it.each([
        ['games', [['developers', 'developers'], ['publishers', 'publishers']]],
        ['anime', [['studios', 'studios']]],
        ['movies', [['actors', 'actors'], ['director', 'directors']]],
        ['series', [['actors', 'actors'], ['director', 'directors']]],
        ['music', [['artist', 'artist']]],
    ] as const)('formats selected %s credit fields as links', (kind, credits) => {
        const fields = credits.map(([field]) => field);
        const template = buildSimpleTemplate(kind, fields, {}, fields);
        const values = Object.fromEntries(credits.map(([, token]) => [token, kind === 'music' ? 'Artist' : ['First', 'Second']]));
        const content = renderTemplate(template, values, kind === 'music');
        for (const [, token] of credits) {
            expect(template).toContain('{{VALUE:' + token + '|wikilink}}');
            expect(content).toContain(token + ': ' + (kind === 'music' ? '"[[Artist]]"' : '["[[First]]","[[Second]]"]'));
        }
    });

    it('renders opt-in links in YAML and Markdown without changing ordinary tokens', () => {
        const template = [
            '---',
            '"Book authors": {{VALUE:Authors|wikilink}} # keep',
            "genre: '{{VALUE:genre|wikilink}}'",
            'plain: "{{VALUE:genre}}"',
            'empty: {{VALUE:missing|wikilink}}',
            '---',
            'Author: {{VALUE:authors|wikilink}}',
        ].join('\n');
        const values = { authors: ['Frank Herbert', '[[Authors/Other|Other]]'], genre: 'Science Fiction' };
        const expected = [
            '---',
            '"Book authors": ["[[Frank Herbert]]","[[Authors/Other|Other]]"] # keep',
            'genre: "[[Science Fiction]]"',
            'plain: "Science Fiction"',
            'empty: null',
            '---',
            'Author: [[Frank Herbert]], [[Authors/Other|Other]]',
        ].join('\n');
        expect(renderTemplate(template, values)).toBe(expected);
        expect(renderTemplate(template, values, true)).toBe(expected);
    });

    it('formats each list entry as a link and keeps an empty list empty', () => {
        const template = '---\ngenres:\n  - {{VALUE:genres|wikilink}}\n---';
        expect(renderTemplate(template, { genres: ['Horror', 'Fantasy'] }))
            .toBe('---\ngenres:\n  - "[[Horror]]"\n  - "[[Fantasy]]"\n---');
        expect(renderTemplate(template, { genres: [] })).toBe('---\ngenres:\n  []\n---');
        const withFixedGenre = template.replace('\n---', '\n  - "[[Fantasy]]"\n---');
        expect(renderTemplate(withFixedGenre, { genres: [] })).toBe('---\ngenres:\n  - "[[Fantasy]]"\n---');
    });

    it('renders empty array values as empty yaml lists', () => {
        const keyPlaceholderTemplate = `---\nauthors: "{{VALUE:authors}}"\n---`;
        const listItemPlaceholderTemplate = `---\ndevelopers:\n  - "{{VALUE:developers}}"\n---`;

        expect(renderTemplate(keyPlaceholderTemplate, { authors: [] })).toContain('authors: []');
        expect(renderTemplate(listItemPlaceholderTemplate, { developers: [] })).toContain('developers:\n  []');
    });

    it('renders HLTB values as numbers even in legacy quoted templates', () => {
        const template = [
            '---',
            'main: "{{VALUE:main}}"',
            'main_plus_sides: "{{VALUE:main_plus_sides}}"',
            'perfectionist: "{{VALUE:perfectionist}}"',
            'integration_id: "{{VALUE:integrationId}}"',
            '---',
        ].join('\n');
        const result = renderTemplate(template, {
            main: 26,
            main_plus_sides: 63,
            perfectionist: 109,
            integrationId: 1091500,
        });

        expect(result).toContain('main: 26');
        expect(result).toContain('main_plus_sides: 63');
        expect(result).toContain('perfectionist: 109');
        expect(result).toContain('integration_id: "1091500"');
    });

    it('renders raw multiline yaml placeholder blocks', () => {
        const template = `---\nanime_parts:\n{{VALUE:animePartsYaml}}\n---`;
        const result = renderTemplate(template, {
            animePartsYaml: '  - id: "tv-1"\n    kind: "tv"',
        });

        expect(result).toContain('anime_parts:\n  - id: "tv-1"\n    kind: "tv"');
    });

    it('keeps provider identity when a legacy device template omits source fields', () => {
        const legacyTemplate = `---\ntype: "anime"\ntitle: "Akame ga Kill!"\n---`;
        const result = ensureIntegrationSourceFrontmatter(legacyTemplate, 'anilist', '20613');

        expect(result).toContain('integration_provider: "anilist"');
        expect(result).toContain('integration_id: "20613"');
        expect(result.match(/integration_provider:/g)).toHaveLength(1);
    });

    it('updates stale source fields without duplicating them', () => {
        const staleTemplate = `---\ntype: "anime"\nintegration_provider: "jikan"\nintegration_id: "old"\n---`;
        const result = ensureIntegrationSourceFrontmatter(staleTemplate, 'anilist', '20613');

        expect(result).toContain('integration_provider: "anilist"');
        expect(result).toContain('integration_id: "20613"');
        expect(result).not.toContain('"jikan"');
        expect(result).not.toContain('"old"');
    });

    it('escapes multiline MangaUpdates descriptions inside quoted yaml values', () => {
        const template = `---\nplot: "{{VALUE:Plot}}"\nauthors: "{{VALUE:authors}}"\n---`;
        const result = renderTemplate(template, {
            Plot: [
                'HYPNO intends to build a harem.',
                '',
                '**Original Novel:**',
                '[Novelpia](https://novelpia.com/novel/3932)',
                '',
                '**Official Translations:**',
                'R19: [English](https://daycomics.com/content/100951)',
            ].join('\n'),
            authors: ['Kamadi', 'OneDollar'],
        });

        expect(result).toContain(
            'plot: "HYPNO intends to build a harem.\\n\\n**Original Novel:**\\n'
            + '[Novelpia](https://novelpia.com/novel/3932)\\n\\n**Official Translations:**\\n'
            + 'R19: [English](https://daycomics.com/content/100951)"'
        );
        expect(result).not.toContain('\n**Original Novel:**');
        expect(result).toContain('authors:\n  - "Kamadi"\n  - "OneDollar"');
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
