import { describe, expect, it } from 'vitest';
import { resolveLucideIcon } from '../src/utils/lucideIcon';

describe('Lucide icon input', () => {
    const icons = ['heart', 'gamepad-2', 'book-open', 'circle-check-big'];
    it('accepts names, component names and Lucide links', () => {
        expect(resolveLucideIcon('heart', icons)).toBe('heart');
        expect(resolveLucideIcon('BookOpen', icons)).toBe('book-open');
        expect(resolveLucideIcon('BookOpenIcon', icons)).toBe('book-open');
        expect(resolveLucideIcon('https://lucide.dev/icons/gamepad-2?size=24', icons)).toBe('gamepad-2');
        expect(resolveLucideIcon('https://lucide.dev/icons/heart/', ['lucide-heart'])).toBe('lucide-heart');
    });
    it('resolves copied Lucide classes to an existing icon instead of embedding markup', () => {
        expect(resolveLucideIcon('<svg class="lucide lucide-heart-icon lucide-heart"><path d="M1 1" /></svg>', icons)).toBe('heart');
        expect(resolveLucideIcon('lucide-circle-check-big', icons)).toBe('circle-check-big');
    });
    it('rejects unsupported icons and unrelated links', () => {
        expect(resolveLucideIcon('https://example.com/icons/heart', icons)).toBeNull();
        expect(resolveLucideIcon('new-icon-unavailable', icons)).toBeNull();
        expect(resolveLucideIcon('<svg onload="alert(1)"><path d="M1 1" /></svg>', icons)).toBeNull();
    });
});
