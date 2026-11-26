import { requestWithDeadline } from './requestDeadline';

export const MAX_COVER_PIXELS = 16_000_000;
export const MAX_COVER_SIDE = 8192;
const MAX_ANIMATION_PIXELS = 64_000_000;
let activeDecoders = 0;
const decoderQueue: Array<() => void> = [];
function reserveDecoder(signal: AbortSignal): Promise<() => void> {
    return new Promise((resolve, reject) => {
        const abort = (): void => {
            const index = decoderQueue.indexOf(start);
            if (index >= 0) decoderQueue.splice(index, 1);
            signal.removeEventListener('abort', abort);
            const error = new Error('Image validation cancelled.'); error.name = 'AbortError'; reject(error);
        };
        const start = (): void => {
            if (signal.aborted) { abort(); return; }
            signal.removeEventListener('abort', abort);
            activeDecoders++;
            let released = false;
            resolve(() => {
                if (released) return;
                released = true; activeDecoders--; decoderQueue.shift()?.();
            });
        };
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
        else if (activeDecoders < 2) start();
        else decoderQueue.push(start);
    });
}
const invalid = (): never => { throw new Error('The cover image is damaged or incomplete.'); };
function dimensions(width: number, height: number): { width: number; height: number } {
    if (!width || !height) return invalid();
    if (width > MAX_COVER_SIDE || height > MAX_COVER_SIDE || width * height > MAX_COVER_PIXELS) {
        throw new Error('The cover is too large: use at most 16 million pixels and 8192 pixels per side.');
    }
    return { width, height };
}

/** Read dimensions and container boundaries before asking the browser to allocate decoded pixels. */
export function inspectCover(buffer: ArrayBuffer, extension: string): { width: number; height: number } {
    const b = new Uint8Array(buffer), view = new DataView(buffer);
    const need = (offset: number, length: number): void => { if (offset < 0 || offset + length > b.length) invalid(); };
    const text = (offset: number, length: number): string => { need(offset, length); return String.fromCharCode(...b.subarray(offset, offset + length)); };
    const u24 = (offset: number): number => { need(offset, 3); return b[offset] | b[offset + 1] << 8 | b[offset + 2] << 16; };
    if (extension === 'png') {
        need(0, 33);
        if (text(12, 4) !== 'IHDR' || view.getUint32(8) !== 13) return invalid();
        const size = dimensions(view.getUint32(16), view.getUint32(20));
        let data = false, offset = 8;
        while (offset < b.length) {
            need(offset, 12); const length = view.getUint32(offset), type = text(offset + 4, 4);
            need(offset, length + 12);
            if (type === 'acTL') {
                if (length !== 8) return invalid();
                const frames = view.getUint32(offset + 8);
                if (!frames || frames > 200 || frames * size.width * size.height > MAX_ANIMATION_PIXELS) {
                    throw new Error('The animated cover contains too many decoded pixels.');
                }
            }
            if (type === 'IDAT' && length) data = true;
            offset += length + 12;
            if (type === 'IEND') { if (length || !data || offset !== b.length) return invalid(); return size; }
        }
        return invalid();
    }
    if (extension === 'jpg') {
        need(0, 4);
        if (b[b.length - 2] !== 255 || b[b.length - 1] !== 217) return invalid();
        let offset = 2, size: { width: number; height: number } | undefined;
        while (offset < b.length - 2) {
            if (b[offset++] !== 255) return invalid();
            while (b[offset] === 255) offset++;
            need(offset, 1); const marker = b[offset++];
            if (marker === 218) { if (!size) return invalid(); return size; }
            if (marker === 1 || marker >= 208 && marker <= 215) continue;
            need(offset, 2); const length = view.getUint16(offset); if (length < 2) return invalid(); need(offset, length);
            if (marker >= 192 && marker <= 207 && ![196, 200, 204].includes(marker)) {
                if (length < 8) return invalid(); size = dimensions(view.getUint16(offset + 5), view.getUint16(offset + 3));
            }
            offset += length;
        }
        return invalid();
    }
    if (extension === 'gif') {
        need(0, 13); const size = dimensions(view.getUint16(6, true), view.getUint16(8, true));
        let offset = 13 + (b[10] & 128 ? 3 * 2 ** ((b[10] & 7) + 1) : 0), frames = 0, pixels = 0;
        const blocks = (): void => { for (;;) { need(offset, 1); const length = b[offset++]; if (!length) return; need(offset, length); offset += length; } };
        for (;;) {
            need(offset, 1); const marker = b[offset++];
            if (marker === 59) { if (!frames || offset !== b.length) return invalid(); return size; }
            if (marker === 33) { need(offset++, 1); blocks(); continue; }
            if (marker !== 44) return invalid();
            need(offset, 9); const frame = dimensions(view.getUint16(offset + 4, true), view.getUint16(offset + 6, true));
            if (view.getUint16(offset, true) + frame.width > size.width || view.getUint16(offset + 2, true) + frame.height > size.height) return invalid();
            pixels += size.width * size.height;
            if (++frames > 200 || pixels > MAX_ANIMATION_PIXELS) throw new Error('The animated cover contains too many decoded pixels.');
            const packed = b[offset + 8]; offset += 9 + (packed & 128 ? 3 * 2 ** ((packed & 7) + 1) : 0);
            need(offset, 2); if (b[offset] < 2 || b[offset] > 8 || !b[offset + 1]) return invalid(); offset++; blocks();
        }
    }
    if (extension === 'webp') {
        need(0, 20); if (view.getUint32(4, true) + 8 !== b.length) return invalid();
        let size: { width: number; height: number } | undefined, pixels = 0, images = 0;
        // Container layouts: https://developers.google.com/speed/webp/docs/riff_container
        for (let offset = 12; offset < b.length;) {
            need(offset, 8); const type = text(offset, 4), length = view.getUint32(offset + 4, true), data = offset + 8;
            need(data, length + (length & 1));
            if (type === 'VP8X') { if (length !== 10) return invalid(); size = dimensions(u24(data + 4) + 1, u24(data + 7) + 1); }
            if (type === 'VP8 ') {
                if (length < 10 || text(data + 3, 3) !== '\x9d\x01\x2a') return invalid();
                const frame = dimensions(view.getUint16(data + 6, true) & 16383, view.getUint16(data + 8, true) & 16383); size ??= frame; images++;
            }
            if (type === 'VP8L') {
                if (length < 5 || b[data] !== 47) return invalid(); const bits = view.getUint32(data + 1, true);
                if (bits >>> 29) return invalid(); const frame = dimensions((bits & 16383) + 1, (bits >>> 14 & 16383) + 1); size ??= frame; images++;
            }
            if (type === 'ANMF') {
                if (length < 24) return invalid(); const frame = dimensions(u24(data + 6) + 1, u24(data + 9) + 1);
                if (!size || u24(data) * 2 + frame.width > size.width || u24(data + 3) * 2 + frame.height > size.height) return invalid();
                pixels += size.width * size.height; if (++images > 200 || pixels > MAX_ANIMATION_PIXELS) throw new Error('The animated cover contains too many decoded pixels.');
            }
            offset = data + length + (length & 1);
        }
        if (!size || !images) return invalid(); return size;
    }
    return invalid();
}

/** Native decoding verifies compressed pixel data; transport size limits alone are insufficient. */
export async function validateCoverImage(buffer: ArrayBuffer, extension: string, signal?: AbortSignal): Promise<void> {
    const expected = inspectCover(buffer, extension);
    const blob = new Blob([buffer], { type: `image/${extension === 'jpg' ? 'jpeg' : extension}` });
    const controller = new AbortController();
    const abort = (): void => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const decodeSignal = controller.signal;
    try { await requestWithDeadline(async () => {
        const release = await reserveDecoder(decodeSignal);
        try {
            if (decodeSignal.aborted) { const error = new Error('Image validation cancelled.'); error.name = 'AbortError'; throw error; }
            if (typeof createImageBitmap === 'function') {
                const bitmap = await createImageBitmap(blob);
                try { const actual = dimensions(bitmap.width, bitmap.height);
                    // EXIF rotation may exchange JPEG dimensions, but cannot change their product.
                    if (actual.width * actual.height !== expected.width * expected.height) invalid();
                } finally { bitmap.close(); }
            } else {
                await new Promise<void>((resolve, reject) => {
                    if (typeof Image !== 'function') { reject(new Error('Image decoding is unavailable.')); return; }
                    const img = new Image(), url = URL.createObjectURL(blob);
                    const cleanup = (): void => { img.onload = img.onerror = null; img.src = ''; URL.revokeObjectURL(url); decodeSignal.removeEventListener('abort', abort); clearTimeout(timer); };
                    const fail = (error: unknown): void => { cleanup(); reject(error); };
                    const abort = (): void => { const error = new Error('Image validation cancelled.'); error.name = 'AbortError'; fail(error); };
                    const timer = setTimeout(() => fail(new Error('Image decoding timed out.')), 10_000);
                    decodeSignal.addEventListener('abort', abort, { once: true });
                    img.onload = () => { try { dimensions(img.naturalWidth, img.naturalHeight);
                        if (img.naturalWidth * img.naturalHeight !== expected.width * expected.height) invalid(); cleanup(); resolve();
                    } catch (error) { fail(error); } };
                    img.onerror = () => fail(new Error('The cover image cannot be decoded.'));
                    if (decodeSignal.aborted) abort(); else img.src = url;
                });
            }
        } finally { release(); }
    }, 10_000, decodeSignal); }
    finally { controller.abort(); signal?.removeEventListener('abort', abort); }
}
