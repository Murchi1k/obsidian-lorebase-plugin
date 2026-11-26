import { describe, expect, it, vi } from 'vitest';
import { normalizeLorebaseTooltip } from '../src/utils/tooltips';

function element(title: string | null, owned = true): HTMLElement {
    const attributes = new Map<string, string>();
    if (title !== null) attributes.set('title', title);
    return {
        namespaceURI: 'http://www.w3.org/1999/xhtml',
        closest: () => owned ? {} : null,
        getAttribute: (name: string) => attributes.get(name) ?? null,
        removeAttribute: (name: string) => attributes.delete(name),
        setAttribute: (name: string, value: string) => attributes.set(name, value),
    } as unknown as HTMLElement;
}

describe('plugin tooltip deduplication', () => {
    it('leaves SVG titles native instead of sending them to the HTML-only Obsidian tooltip', () => {
        const svg = element('Country');
        Object.defineProperty(svg, 'namespaceURI', { value: 'http://www.w3.org/2000/svg' });
        const apply = vi.fn(() => { throw new Error('isShown is not a function'); });
        expect(() => normalizeLorebaseTooltip(svg, apply)).not.toThrow();
        expect(apply).not.toHaveBeenCalled();
        expect(svg.getAttribute('title')).toBe('Country');
    });
    it('replaces native titles with one Obsidian tooltip and updates changed text', () => {
        const chip = element('RAWG: Включён');
        const apply = vi.fn();
        normalizeLorebaseTooltip(chip, apply);
        expect(chip.getAttribute('title')).toBeNull();
        expect(apply).toHaveBeenCalledExactlyOnceWith(chip, 'RAWG: Включён');
        normalizeLorebaseTooltip(chip, apply);
        expect(apply).toHaveBeenCalledTimes(1);
        chip.setAttribute('title', 'RAWG: Выключен');
        normalizeLorebaseTooltip(chip, apply);
        expect(apply).toHaveBeenLastCalledWith(chip, 'RAWG: Выключен');
        expect(chip.getAttribute('title')).toBeNull();
    });
    it('preserves tooltips belonging to other plugins and leaves custom tooltip controls alone', () => {
        const foreign = element('Other plugin', false);
        const custom = element(null);
        const apply = vi.fn();
        normalizeLorebaseTooltip(foreign, apply);
        normalizeLorebaseTooltip(custom, apply);
        expect(foreign.getAttribute('title')).toBe('Other plugin');
        expect(apply).not.toHaveBeenCalled();
    });
});
