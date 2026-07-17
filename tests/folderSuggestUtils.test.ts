import { describe, expect, it } from 'vitest';
import { TFolder } from './mocks/obsidian';
import { filterFolders } from '../src/components/folderSuggestUtils';

describe('filterFolders', () => {
    it('sorts folders and filters by case-insensitive substring', () => {
        const folders = [
            new TFolder('Games'),
            new TFolder('Entertainment/Anime'),
            new TFolder('archive/anime-old'),
            new TFolder('Books'),
            new TFolder(''),
        ];

        expect(filterFolders(folders, 'anime').map((folder) => folder.path)).toEqual([
            'archive/anime-old',
            'Entertainment/Anime',
        ]);
    });

    it('returns sorted non-root folders for an empty query', () => {
        const folders = [
            new TFolder('Zeta'),
            new TFolder('Alpha'),
            new TFolder(''),
        ];

        expect(filterFolders(folders, '   ').map((folder) => folder.path)).toEqual([
            'Alpha',
            'Zeta',
        ]);
    });
});
