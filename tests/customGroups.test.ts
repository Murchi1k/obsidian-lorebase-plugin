import { describe, expect, it } from 'vitest';
import { createCustomGroup, normalizeCustomGroups, normalizeGroupDetails, setGroupMembership, sortedCustomGroups } from '../src/services/media/customGroups';

describe('customGroups', () => {
    it('normalizes groups and removes duplicate paths and ids', () => {
        expect(normalizeCustomGroups([
            { id: 'one', name: ' Favorites ', itemPaths: ['Games/A.md', 'Games/A.md'], createdAt: 10, updatedAt: 20 },
            { id: 'one', name: 'Duplicate', itemPaths: [] },
            { id: '', name: 'Invalid', itemPaths: [] },
        ])).toEqual([{ id: 'one', name: 'Favorites', itemPaths: ['Games/A.md'], createdAt: 10, updatedAt: 20, description: '', icon: 'folder', color: '#9d95bd', pinned: false }]);
    });

    it('creates a group and toggles membership immutably', () => {
        const group = createCustomGroup('Best ever', 100);
        const added = setGroupMembership(group, 'Anime/A.md', true, 110);
        const removed = setGroupMembership(added, 'Anime/A.md', false, 120);
        expect(group.itemPaths).toEqual([]);
        expect(added.itemPaths).toEqual(['Anime/A.md']);
        expect(removed.itemPaths).toEqual([]);
        expect(removed.updatedAt).toBe(120);
    });

    it('round-trips appearance through settings without losing paths or creation dates', () => {
        const original = { ...createCustomGroup('Quiet collection', 100), description: 'Mixed media', icon: 'music', color: '#83a5a0', pinned: true, itemPaths: ['Music/A.md', 'Games/B.md'] };
        const restored = normalizeCustomGroups(JSON.parse(JSON.stringify([original])))[0];
        expect(restored).toEqual(original);
        expect(setGroupMembership(restored, 'Books/C.md', true, 200)).toEqual({ ...original, itemPaths: [...original.itemPaths, 'Books/C.md'], updatedAt: 200 });
    });

    it('rejects invalid appearance values and preserves the order within pinned and ordinary groups', () => {
        expect(normalizeGroupDetails({ name: ' Name ', description: ' Text ', icon: '<script>', color: 'url(evil)', pinned: 'true' as any }))
            .toEqual({ name: 'Name', description: 'Text', icon: 'folder', color: '#9d95bd', pinned: false });
        const groups = [createCustomGroup('A', 1), { ...createCustomGroup('B', 2), pinned: true }, createCustomGroup('C', 3), { ...createCustomGroup('D', 4), pinned: true }];
        expect(sortedCustomGroups(groups).map(group => group.name)).toEqual(['B', 'D', 'A', 'C']);
        expect(groups.map(group => group.name)).toEqual(['A', 'B', 'C', 'D']);
    });

    it('preserves custom icon IDs and images while rejecting executable and oversized values', () => {
        for (const icon of ['lucide-castle', 'my-plugin:custom-icon', 'data:image/png;base64,aGVsbG8=', 'data:image/svg+xml;base64,PHN2Zy8+']) {
            expect(normalizeGroupDetails({ icon }).icon).toBe(icon);
        }
        for (const icon of ['<svg onload="alert(1)"/>', 'javascript:alert(1)', 'https://example.org/icon.svg', 'data:text/html;base64,aGVsbG8=', 'data:image/png;base64,' + 'A'.repeat(360000)]) {
            expect(normalizeGroupDetails({ icon }).icon).toBe('folder');
        }
    });
});
