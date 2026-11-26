import { afterEach, describe, expect, it, vi } from 'vitest';
import { inspectCover, validateCoverImage, MAX_COVER_PIXELS } from '../src/services/integrations/coverValidation';
import { createCoverImage } from '../src/services/integrations/imageBinary';
import { onePixelPng } from './helpers/coverImages';
import type { App } from 'obsidian';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('complete cover validation', () => {
    it('reads a complete PNG and closes the native decoded bitmap', async () => {
        const close = vi.fn(); vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 1, height: 1, close })));
        expect(inspectCover(onePixelPng(), 'png')).toEqual({ width: 1, height: 1 });
        await validateCoverImage(onePixelPng(), 'png'); expect(close).toHaveBeenCalledOnce();
    });
    it('rejects truncated containers and signature-only impostors', () => {
        for (const buffer of [onePixelPng().slice(0, -2), new Uint8Array([137,80,78,71,13,10,26,10]).buffer]) {
            expect(() => inspectCover(buffer, 'png')).toThrow(/damaged|incomplete/);
        }
        expect(() => inspectCover(new Uint8Array([255,216,255,217]).buffer, 'jpg')).toThrow();
    });
    it('checks oversized dimensions before invoking the native decoder', async () => {
        const buffer = onePixelPng(); new DataView(buffer).setUint32(16, MAX_COVER_PIXELS);
        const decode = vi.fn(); vi.stubGlobal('createImageBitmap', decode);
        await expect(validateCoverImage(buffer, 'png')).rejects.toThrow(/too large/); expect(decode).not.toHaveBeenCalled();
    });
    it('does not save an image whose compressed data cannot be decoded', async () => {
        vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new Error('Bad compressed pixels'); }));
        const write = vi.fn(); const app = { vault: { createBinary: write } } as unknown as App;
        await expect(createCoverImage(app, 'Covers', 'Title', 'Cover', onePixelPng(), 'image/png')).rejects.toThrow('Bad compressed pixels');
        expect(write).not.toHaveBeenCalled();
    });
    it('releases a bitmap that finishes decoding after cancellation', async () => {
        let finish!: (bitmap: unknown) => void; const close = vi.fn();
        vi.stubGlobal('createImageBitmap', vi.fn(() => new Promise(resolve => { finish = resolve; })));
        const controller = new AbortController(); const pending = validateCoverImage(onePixelPng(), 'png', controller.signal);
        await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
        const check = expect(pending).rejects.toMatchObject({ name: 'AbortError' }); controller.abort(); await check;
        finish({ width: 1, height: 1, close }); await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
    });
    it('bounds a decoder that never settles', async () => {
        vi.useFakeTimers(); let finish!: (bitmap: unknown) => void;
        const close = vi.fn(); vi.stubGlobal('createImageBitmap', vi.fn(() => new Promise(resolve => { finish = resolve; })));
        const pending = validateCoverImage(onePixelPng(), 'png'); const check = expect(pending).rejects.toThrow(/timed out/);
        await vi.advanceTimersByTimeAsync(10_000); await check; expect(vi.getTimerCount()).toBe(0);
        finish({ width: 1, height: 1, close }); await vi.runAllTimersAsync(); expect(close).toHaveBeenCalledOnce();
    });
    it('limits simultaneous native decoders and removes a cancelled queued image', async () => {
        const finish: Array<(bitmap: unknown) => void> = [], close = vi.fn();
        const decode = vi.fn(() => new Promise(resolve => finish.push(resolve)));
        vi.stubGlobal('createImageBitmap', decode);
        const first = validateCoverImage(onePixelPng(), 'png'), second = validateCoverImage(onePixelPng(), 'png');
        await vi.waitFor(() => expect(decode).toHaveBeenCalledTimes(2));
        const controller = new AbortController();
        const third = validateCoverImage(onePixelPng(), 'png', controller.signal);
        const cancelled = expect(third).rejects.toMatchObject({ name: 'AbortError' }); controller.abort(); await cancelled;
        finish.forEach(resolve => resolve({ width: 1, height: 1, close })); await Promise.all([first, second]);
        expect(decode).toHaveBeenCalledTimes(2); expect(close).toHaveBeenCalledTimes(2);
    });
    it('rejects excessive APNG frames before native allocation', () => {
        const original = new Uint8Array(onePixelPng()), buffer = new Uint8Array(original.length + 20);
        buffer.set(original.subarray(0, 33)); buffer.set(original.subarray(33), 53);
        const view = new DataView(buffer.buffer); view.setUint32(33, 8);
        buffer.set([97,99,84,76], 37); view.setUint32(41, 201);
        expect(() => inspectCover(buffer.buffer, 'png')).toThrow(/animated cover/);
    });
});
