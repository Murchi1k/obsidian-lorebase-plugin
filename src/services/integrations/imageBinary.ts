import { TFile, type App } from 'obsidian';
import { sanitizeFileName } from './templateUtils';
import { validateCoverImage } from './coverValidation';

export const MAX_COVER_BYTES = 20 * 1024 * 1024;

/** Inspect bytes, not the file picker accept attribute or a server's extension. */
export function coverImageExtension(buffer: ArrayBuffer, contentType = ''): string {
    if (!buffer.byteLength || buffer.byteLength > MAX_COVER_BYTES) throw new Error('Cover images must be between 1 byte and 20 MB.');
    const bytes = new Uint8Array(buffer);
    const matches = (offset: number, expected: number[]): boolean => expected.every((byte, index) => bytes[offset + index] === byte);
    let extension = '';
    if (matches(0, [0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10])) extension = 'png';
    else if (matches(0, [0xff, 0xd8, 0xff])) extension = 'jpg';
    else if (matches(0, [71, 73, 70, 56]) && (bytes[4] === 55 || bytes[4] === 57) && bytes[5] === 97) extension = 'gif';
    else if (matches(0, [82, 73, 70, 70]) && matches(8, [87, 69, 66, 80])) extension = 'webp';
    if (!extension || contentType && !/^(?:image\/(?:png|jpe?g|gif|webp)|application\/octet-stream)(?:\s*;|\s*$)/i.test(contentType)) {
        throw new Error('The cover is not a supported PNG, JPEG, GIF or WebP image.');
    }
    return extension;
}

/** Content-addressed names plus createBinary prevent overwriting another note's cover. */
export async function createCoverImage(app: App, folder: string, title: string, label: string, buffer: ArrayBuffer, contentType = '', signal?: AbortSignal): Promise<string> {
    const extension = coverImageExtension(buffer, contentType);
    await validateCoverImage(buffer, extension, signal);
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    const name = (sanitizeFileName(title) || 'Untitled').slice(0, 80);
    const role = (sanitizeFileName(label) || 'Image').slice(0, 24);
    const path = `${folder}/${name} - ${role} - ${hash}.${extension}`;
    const sameExisting = async (): Promise<boolean> => {
        const existing = app.vault.getAbstractFileByPath(path);
        if (!(existing instanceof TFile)) return false;
        const saved = new Uint8Array(await app.vault.readBinary(existing));
        const incoming = new Uint8Array(buffer);
        return saved.length === incoming.length && saved.every((byte, index) => byte === incoming[index]);
    };
    if (await sameExisting()) return path;
    if (signal?.aborted) { const error = new Error('Image save cancelled.'); error.name = 'AbortError'; throw error; }
    try { await app.vault.createBinary(path, buffer); }
    catch (error) {
        // Concurrent requests for identical bytes may have created the same image.
        if (!await sameExisting()) throw error;
    }
    return path;
}
