import { describe, expect, it } from 'vitest';
import { getCountryFlag } from '../src/assets/countryFlags';

describe('offline packed country flags', () => {
    it.each(['US', 'UA', 'JP', 'CN', 'GB'])('decodes a complete SVG for %s and reuses the decoded value', code => {
        const flag = getCountryFlag(code);
        expect(flag).toMatch(/^data:image\/svg\+xml/);
        expect(atob(flag!.slice(flag!.indexOf(',') + 1))).toContain('</svg>');
        expect(getCountryFlag(code)).toBe(flag);
    });
    it('does not invent artwork for an unknown country', () => expect(getCountryFlag('INVALID')).toBeUndefined());
});
