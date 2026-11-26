import { describe, expect, it } from 'vitest';
import { TFile, TFolder } from 'obsidian';
import { DEFAULT_SETTINGS } from '../src/constants';
import { NoteConversionService } from '../src/services/NoteConversionService';
import type { LorebaseSettings, NoteImportSettings } from '../src/types';

function cloneImportSettings(overrides: Partial<NoteImportSettings> = {}): NoteImportSettings {
    return {
        ...DEFAULT_SETTINGS.noteImport,
        fieldMappings: DEFAULT_SETTINGS.noteImport.fieldMappings.map((mapping) => ({
            key: mapping.key,
            aliases: [...mapping.aliases],
        })),
        blacklist: [...DEFAULT_SETTINGS.noteImport.blacklist],
        ...overrides,
    };
}

describe('NoteConversionService', () => {
    it('matches frontmatter aliases case-insensitively, including Name', () => {
        const service = new NoteConversionService({} as never);
        const result = service.buildFrontmatter({
            Name: 'Gothic 1 Remake',
            Platform: 'PC',
        }, cloneImportSettings());

        expect(result.nextFrontmatter.name).toBe('Gothic 1 Remake');
        expect(result.nextFrontmatter.Platform).toBe('PC');
        expect(result.renamed).toContainEqual({ from: 'Name', to: 'name' });
    });

    it('maps common frontmatter aliases into LOREBASE keys and applies blacklist', () => {
        const service = new NoteConversionService({} as never);
        const settings = cloneImportSettings({
            blacklist: ['Sex18', 'communityVotes', 'userRating'],
        });

        const result = service.buildFrontmatter({
            title: 'The Witcher 3: Wild Hunt',
            image: 'cover.jpg',
            backdrop: 'header.jpg',
            summary: 'Monster slayer RPG',
            genre: ['rpg'],
            Year: 2015,
            releaseDate: '2015-05-17',
            rating: 0,
            status: 'completed',
            source: 'https://store.steampowered.com/app/292030/',
            platforms: ['windows'],
            Sex18: false,
            userRating: 5,
            communityVotes: 878462,
        }, settings);

        expect(result.nextFrontmatter).toMatchObject({
            name: 'The Witcher 3: Wild Hunt',
            poster: 'cover.jpg',
            poster_b: 'header.jpg',
            plot: 'Monster slayer RPG',
            genres: ['rpg'],
            year: 2015,
            released: '2015-05-17',
            rating: 0,
            status: 'completed',
            url: 'https://store.steampowered.com/app/292030/',
            platforms: ['windows'],
        });
        expect(result.nextFrontmatter).not.toHaveProperty('Sex18');
        expect(result.nextFrontmatter).not.toHaveProperty('userRating');
        expect(result.nextFrontmatter).not.toHaveProperty('communityVotes');
        expect(result.renamed).toContainEqual({ from: 'title', to: 'name' });
        expect(result.renamed).toContainEqual({ from: 'image', to: 'poster' });
        expect(result.removed).toEqual(expect.arrayContaining(['Sex18', 'userRating', 'communityVotes']));
    });

    it('keeps extra fields unless they are blacklisted', () => {
        const service = new NoteConversionService({} as never);
        const settings = cloneImportSettings({
            blacklist: ['communityRating'],
        });

        const result = service.buildFrontmatter({
            title: 'Portal',
            description: 'Puzzle game',
            integration_provider: 'steam',
            communityRating: 96,
        }, settings);

        expect(result.nextFrontmatter).toEqual({
            name: 'Portal',
            plot: 'Puzzle game',
            integration_provider: 'steam',
        });
        expect(result.removed).toContain('communityRating');
    });

    it('adds the target media type only in auto mode', () => {
        const service = new NoteConversionService({} as never);
        const autoResult = service.buildFrontmatter(
            { title: 'Twin Peaks', type: 'series' },
            cloneImportSettings({ targetMedia: 'auto' })
        );
        const fixedResult = service.buildFrontmatter(
            { title: 'Twin Peaks' },
            cloneImportSettings({ targetMedia: 'series' })
        );

        expect(autoResult.nextFrontmatter.type).toBe('series');
        expect(fixedResult.nextFrontmatter).not.toHaveProperty('type');
    });

    it('replaces existing frontmatter while preserving markdown body', () => {
        const service = new NoteConversionService({} as never);
        const result = service.serializeMarkdownWithFrontmatter(
            '---\ntitle: Old\nextra: yes\n---\n# Heading\n\nBody text',
            { name: 'New', genres: ['rpg', 'action'], favorite: false }
        );

        expect(result).toContain('name: New');
        expect(result).toContain('genres:\n  - rpg\n  - action');
        expect(result).toContain('favorite: false');
        expect(result).not.toContain('title: Old');
        expect(result).toContain('# Heading\n\nBody text');
    });

    it('replace mode updates the note and moves it into the target library folder', async () => {
        const file = new TFile('Legacy/Portal.md', 'Portal');
        file.extension = 'md';
        const folder = new TFolder('Legacy');
        (folder as unknown as { children: TFile[] }).children = [file];
        let modified = '';
        let renamedTo = '';
        const app = {
            metadataCache: {
                getFileCache(): unknown {
                    return { frontmatter: { title: 'Portal', description: 'Puzzle game' } };
                },
            },
            vault: {
                getAbstractFileByPath(path: string): unknown {
                    if (path === 'Legacy') return folder;
                    if (path === file.path) return file;
                    return null;
                },
                async read(): Promise<string> {
                    return '---\ntitle: Portal\n---\n# Portal';
                },
                async modify(_file: TFile, content: string): Promise<void> {
                    modified = content;
                },
                async process(_file: TFile, transform: (content: string) => string): Promise<string> {
                    modified = transform('---\ntitle: Portal\n---\n# Portal'); return modified;
                },
                async createFolder(): Promise<void> {
                    return;
                },
            },
            fileManager: {
                async renameFile(_file: TFile, path: string): Promise<void> {
                    renamedTo = path;
                },
            },
        } as unknown as ConstructorParameters<typeof NoteConversionService>[0];
        const settings = {
            ...DEFAULT_SETTINGS,
            noteImport: cloneImportSettings({
                sourceFolderPath: 'Legacy',
                targetMedia: 'games',
                writeMode: 'replace',
            }),
        } as LorebaseSettings;

        const service = new NoteConversionService(app);
        const result = await service.apply(settings, new Set(['Legacy/Portal.md']));

        expect(result.updated).toBe(1);
        expect(modified).toContain('name: Portal');
        expect(modified).toContain('plot: "Puzzle game"');
        expect(renamedTo).toBe('LOREBASE/Games/Portal.md');
    });

    it('imports an auto-mode note without type after review assigns a media kind and source', async () => {
        const file = new TFile('Excel/Gothic 1 Remake.md', 'Gothic 1 Remake');
        file.extension = 'md';
        const folder = new TFolder('Excel');
        (folder as unknown as { children: TFile[] }).children = [file];
        let created = '';
        const app = {
            metadataCache: {
                getFileCache(): unknown {
                    return { frontmatter: { Name: 'Gothic 1 Remake', Status: 'beaten', hours: 45.4 } };
                },
            },
            vault: {
                getAbstractFileByPath(path: string): unknown {
                    if (path === 'Excel') return folder;
                    return null;
                },
                async read(): Promise<string> {
                    return '---\nName: Gothic 1 Remake\n---\n# Notes';
                },
                async create(_path: string, content: string): Promise<void> {
                    created = content;
                },
                async createFolder(): Promise<void> {
                    return;
                },
            },
        } as unknown as ConstructorParameters<typeof NoteConversionService>[0];
        const settings = {
            ...DEFAULT_SETTINGS,
            noteImport: cloneImportSettings({
                sourceFolderPath: 'Excel',
                targetMedia: 'auto',
                writeMode: 'copy',
            }),
        } as LorebaseSettings;
        const service = new NoteConversionService(app);
        const result = await service.apply(settings, {
            selectedIds: new Set([file.path]),
            targetMediaById: { [file.path]: 'games' },
            sourcesById: {
                [file.path]: {
                    provider: 'steam',
                    id: '1297900',
                    title: 'Gothic 1 Remake',
                },
            },
        }, {
            [file.path]: {
                integration_provider: 'steam',
                integration_id: '1297900',
                plot: 'Provider description',
                year: 2026,
            },
        });

        expect(result.created).toBe(1);
        expect(created).toContain('name: "Gothic 1 Remake"');
        expect(created).toContain('type: game');
        expect(created).toContain('status: beaten');
        expect(created).toContain('hours: 45.4');
        expect(created).toContain('integration_provider: steam');
        expect(created).toContain('integration_id: "1297900"');
        expect(created).toContain('plot: "Provider description"');
        expect(created).toContain('# Notes');
    });
});
