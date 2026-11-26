import { scheduleTimeout } from './timers';
import { requestUrl } from 'obsidian';
import { requestWithDeadline } from '../services/integrations/requestDeadline';
import { coverImageExtension } from '../services/integrations/imageBinary';
import { validateCoverImage } from '../services/integrations/coverValidation';
export interface BookCoverColor { background: string; text: string }

/** Quantized dominant color avoids averaging contrasting cover art into brown. */
export function pickBookCoverColor(pixels: Uint8ClampedArray): BookCoverColor | null {
    const buckets = new Map<number, { weight: number; count: number; r: number; g: number; b: number }>();
    for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] < 192) continue;
        const [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]];
        const key = (r >> 5) * 64 + (g >> 5) * 8 + (b >> 5);
        const bucket = buckets.get(key) ?? { weight: 0, count: 0, r: 0, g: 0, b: 0 };
        bucket.weight += 1 + (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
        bucket.count++;
        bucket.r += r; bucket.g += g; bucket.b += b;
        buckets.set(key, bucket);
    }
    const dominant = [...buckets.values()].sort((a, b) => b.weight - a.weight)[0];
    if (!dominant) return null;
    const sampled = [dominant.r, dominant.g, dominant.b].map(value => value / dominant.count);
    const lightness = (Math.max(...sampled) + Math.min(...sampled)) / 2;
    // Match the cover hue, but render it as a matte binding rather than raw
    // image pixels: lift near-black and soften near-white into warm stone.
    let rgb = sampled;
    if (lightness < 58) {
        const mix = (58 - lightness) / (255 - lightness);
        rgb = sampled.map(channel => channel + (255 - channel) * mix);
    } else if (lightness > 180) {
        rgb = sampled.map(channel => channel * (180 / lightness));
        const warmth = (lightness - 180) / 75;
        rgb = [rgb[0] + 4 * warmth, rgb[1] + 2 * warmth, rgb[2] - 3 * warmth];
    }
    rgb = rgb.map(channel => Math.round(Math.max(0, Math.min(255, channel))));
    const linear = rgb.map(value => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    const luminance = linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
    return { background: `rgb(${rgb.join(', ')})`, text: luminance > .22 ? '#181714' : '#fff8ea' };
}

const cache = new Map<string, Promise<BookCoverColor | null>>();
let active = 0;
const waiting: Array<() => void> = [];

export function getBookCoverColor(url: string, document: Document): Promise<BookCoverColor | null> {
    const cached = cache.get(url);
    if (cached) return cached;
    const result = (async () => {
        await new Promise<void>(resolve => {
            const enter = () => { active++; resolve(); };
            if (active < 4) enter(); else waiting.push(enter);
        });
        let objectUrl: string | null = null;
        try {
            let source = url;
            // Obsidian's request API supports remote covers without tainting the canvas.
            if (/^https?:/i.test(url)) {
                const response = await requestWithDeadline(() => requestUrl({ url, method: 'GET' }), 15_000);
                if (response.status >= 400) return null;
                await validateCoverImage(response.arrayBuffer, coverImageExtension(response.arrayBuffer));
                objectUrl = URL.createObjectURL(new Blob([response.arrayBuffer], {
                    type: response.headers['content-type'] || 'image/jpeg',
                }));
                source = objectUrl;
            }
            const img = document.createElement('img');
            await new Promise<void>((resolve, reject) => {
                const timer = scheduleTimeout(() => { img.src = ''; reject(new Error('Cover timeout')); }, 15000);
                img.onload = () => { timer(); resolve(); };
                img.onerror = () => { timer(); reject(new Error('Cover unavailable')); };
                img.src = source;
            });
            const canvas = document.createElement('canvas');
            canvas.width = 40;
            canvas.height = 56;
            const context = canvas.getContext('2d', { willReadFrequently: true });
            if (!context) return null;
            context.drawImage(img, 0, 0, 40, 56);
            return pickBookCoverColor(context.getImageData(0, 0, 40, 56).data);
        } catch {
            return null;
        } finally {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            active--;
            waiting.shift()?.();
        }
    })();
    cache.set(url, result);
    if (cache.size > 256) cache.delete(cache.keys().next().value!);
    return result;
}
