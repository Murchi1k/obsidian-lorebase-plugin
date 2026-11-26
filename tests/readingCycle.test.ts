import { describe, expect, it } from 'vitest';
import { getReadingCycle, parseReadingCycle, planReadingCycleSave, serializeReadingCycle } from '../src/services/media/readingCycle';
import { ReadingService } from '../src/services/ReadingService';
import type { ReadingItem } from '../src/types';
import { createMetadataService, createMockApp, createMockFile } from './helpers/testHelpers';

const entry = (filePath: string, readingCycle: string[] = [], type: 'book' | 'manga' = 'book') => ({ filePath, readingCycle, type, pageCurrent: 12 } as ReadingItem);
describe('library reading cycles', () => {
    it('round-trips full note links without losing order and rejects parent traversal', () => {
        const paths = ['Books/Metro 2035.md', 'Books/Metro 2033.md', 'Books/Metro 2034.md'];
        expect(parseReadingCycle(serializeReadingCycle(paths))).toEqual(paths);
        expect(parseReadingCycle(['[[Books/Metro 2033|Metro]]', 'Books/Metro 2033.md', '../Other.md', null])).toEqual(['Books/Metro 2033.md']);
    });
    it('finds the same ordered cycle from every member, including incoming links, without mixing media', () => {
        const paths = ['A.md', 'B.md', 'C.md'];
        const items = paths.map(path => entry(path, paths));
        for (const item of items) expect(getReadingCycle(items, item).map(value => value.filePath)).toEqual(paths);
        const partial = [entry('A.md', ['A.md', 'B.md']), entry('B.md'), entry('M.md', ['B.md'], 'manga')];
        expect(getReadingCycle(partial, partial[1]).map(item => item.filePath).sort()).toEqual(['A.md', 'B.md']);
    });
    it('writes reciprocal membership and only staged progress, leaving removed notes independent', () => {
        const original = ['A.md', 'B.md', 'C.md'].map(path => entry(path, ['A.md', 'B.md', 'C.md']));
        const changes = planReadingCycleSave(original, [original[2], original[0]], new Map([['C.md', { pageCurrent: 48 }]]));
        expect(changes.find(change => change.item.filePath === 'A.md')?.updates).toEqual({ readingCycle: ['C.md', 'A.md'] });
        expect(changes.find(change => change.item.filePath === 'B.md')?.updates).toEqual({ readingCycle: [] });
        expect(changes.find(change => change.item.filePath === 'C.md')?.updates).toEqual({ readingCycle: ['C.md', 'A.md'], pageCurrent: 48 });
        expect(original.every(item => item.pageCurrent === 12)).toBe(true);
    });
    it('does not split an existing group after adding and removing it before saving', () => {
        const a = entry('A.md'), b = entry('B.md', ['B.md', 'C.md']), c = entry('C.md', ['B.md', 'C.md']);
        expect(planReadingCycleSave([a, b, c], [a], new Map())).toEqual([]);
    });
    it.each(['book', 'manga'] as const)('persists a %s cycle alongside individual progress', async type => {
        const file = createMockFile('Library/A.md', 'A');
        const frontmatter: Record<string, unknown> = { type, page_current: 4, chapter_current: 2 };
        const app = createMockApp({ [file.path]: { frontmatter } });
        app.vault.getAbstractFileByPath = () => file;
        app.fileManager.processFrontMatter = async (_file, handler) => handler(frontmatter);
        const service = new ReadingService(app, type, 'Library', createMetadataService(app));
        const item = service.parseFromCache(file)!;
        await service.updateItem(item, { readingCycle: ['Library/A.md', 'Library/B.md'] });
        expect(frontmatter.reading_cycle).toEqual(['[[Library/A]]', '[[Library/B]]']);
        expect(service.parseFromCache(file)?.readingCycle).toEqual(['Library/A.md', 'Library/B.md']);
        expect(frontmatter.page_current).toBe(4);
        expect(frontmatter.chapter_current).toBe(2);
    });
});
