import { describe, expect, it } from 'vitest';
import { pickBookCoverColor } from '../src/utils/bookCoverColor';

describe('book cover palette', () => {
    it('softens black and white into graphite and warm stone', () => {
        expect(pickBookCoverColor(new Uint8ClampedArray([0, 0, 0, 255])))
            .toEqual({ background: 'rgb(58, 58, 58)', text: '#fff8ea' });
        expect(pickBookCoverColor(new Uint8ClampedArray([255, 255, 255, 255])))
            .toEqual({ background: 'rgb(184, 182, 177)', text: '#181714' });
    });
    it('retains the hue direction when lifting very dark colors', () => {
        const palette = pickBookCoverColor(new Uint8ClampedArray([5, 15, 35, 255]))!;
        const [r, g, b] = palette.background.match(/\d+/g)!.map(Number);
        expect(b).toBeGreaterThan(g);
        expect(g).toBeGreaterThan(r);
        expect(r).toBeGreaterThan(5);
    });
    it('keeps a dominant red instead of averaging it with pale title lettering', () => {
        const pixels = new Uint8ClampedArray([
            ...Array.from({ length: 8 }, () => [160, 48, 40, 255]).flat(),
            ...Array.from({ length: 2 }, () => [240, 240, 240, 255]).flat(),
        ]);
        expect(pickBookCoverColor(pixels)).toEqual({ background: 'rgb(160, 48, 40)', text: '#fff8ea' });
    });
    it('uses dark lettering on pale covers and light lettering on dark covers', () => {
        expect(pickBookCoverColor(new Uint8ClampedArray([232, 218, 194, 255]))?.text).toBe('#181714');
        expect(pickBookCoverColor(new Uint8ClampedArray([20, 30, 35, 255]))?.text).toBe('#fff8ea');
    });
    it('ignores transparent pixels and returns no palette for empty images', () => {
        expect(pickBookCoverColor(new Uint8ClampedArray([255, 0, 0, 0, 40, 80, 120, 255]))?.background).toBe('rgb(40, 80, 120)');
        expect(pickBookCoverColor(new Uint8ClampedArray())).toBeNull();
    });
});
