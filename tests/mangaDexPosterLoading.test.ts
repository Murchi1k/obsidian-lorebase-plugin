import { beforeEach, describe, expect, it, vi } from 'vitest';
const fetch = vi.hoisted(() => vi.fn());
vi.mock('../src/services/integrations/shared', () => ({ fetchBinary: fetch }));

beforeEach(() => { vi.resetModules(); fetch.mockReset(); });
const response = (size = 8) => ({ arrayBuffer: new ArrayBuffer(size), headers: { 'Content-Type': 'image/png' }, status: 200 });

describe('MangaDex cover loading', () => {
    it('shares an in-flight cover and caches the bytes for a recycled card', async () => {
        const { loadMangaDexPoster } = await import('../src/components/MangaDexPoster');
        fetch.mockResolvedValue(response());
        const signal = new AbortController().signal;
        const [a, b] = await Promise.all([loadMangaDexPoster('shared', signal), loadMangaDexPoster('shared', signal)]);
        expect(a).toBe(b); expect(a.type).toBe('image/png');
        expect(await loadMangaDexPoster('shared', signal)).toBe(a);
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('skips cancelled queued requests and permits loading that cover later', async () => {
        const { loadMangaDexPoster } = await import('../src/components/MangaDexPoster');
        let complete!: (result: ReturnType<typeof response>) => void;
        fetch.mockImplementationOnce(() => new Promise(resolve => complete = resolve)).mockResolvedValue(response());
        const first = loadMangaDexPoster('visible', new AbortController().signal);
        await Promise.resolve();
        const recycled = new AbortController();
        const queued = loadMangaDexPoster('offscreen', recycled.signal).catch(error => error);
        recycled.abort();
        expect((await queued).name).toBe('AbortError');
        complete(response());
        await first;
        expect(fetch).toHaveBeenCalledTimes(1);
        await loadMangaDexPoster('offscreen', new AbortController().signal);
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('cancels one consumer without cancelling another card using the same cover', async () => {
        const { loadMangaDexPoster } = await import('../src/components/MangaDexPoster');
        fetch.mockResolvedValue(response());
        const gone = new AbortController();
        const first = loadMangaDexPoster('same', gone.signal).catch(error => error);
        const second = loadMangaDexPoster('same', new AbortController().signal);
        gone.abort();
        expect((await first).name).toBe('AbortError');
        expect((await second).size).toBe(8);
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('evicts old bytes when the memory budget is reached and retries failures', async () => {
        const { loadMangaDexPoster } = await import('../src/components/MangaDexPoster');
        fetch.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(response(13 * 1024 * 1024));
        const signal = new AbortController().signal;
        await expect(loadMangaDexPoster('first', signal)).rejects.toThrow('offline');
        await loadMangaDexPoster('first', signal);
        await loadMangaDexPoster('second', signal);
        await loadMangaDexPoster('first', signal);
        expect(fetch).toHaveBeenCalledTimes(4);
    });
});
