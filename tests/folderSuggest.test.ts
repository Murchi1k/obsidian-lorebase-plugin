import { describe, it, expect } from 'vitest';
import { TFolder } from 'obsidian';
import { filterFolders } from '../src/components/folderSuggestUtils';

describe('filterFolders', () => {
    const folders = [
        new TFolder('Anime'),
        new TFolder('Entertainment'),
        new TFolder('Entertainment/Anime'),
        new TFolder('Games'),
    ] as TFolder[];

    it('returns all folders sorted by path when the query is empty', () => {
        const result = filterFolders(folders, '   ');
        expect(result.map((f) => f.path)).toEqual([
            'Anime',
            'Entertainment',
            'Entertainment/Anime',
            'Games',
        ]);
    });

    it('filters case-insensitively by substring match on path', () => {
        const result = filterFolders(folders, 'anime');
        expect(result.map((f) => f.path)).toEqual(['Anime', 'Entertainment/Anime']);
    });

    it('matches nested path segments', () => {
        const result = filterFolders(folders, 'entertainment/an');
        expect(result.map((f) => f.path)).toEqual(['Entertainment/Anime']);
    });
});
