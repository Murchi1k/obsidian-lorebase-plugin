import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestWithDeadline, RequestTimeoutError, PROVIDER_REQUEST_TIMEOUT_MS } from '../src/services/integrations/requestDeadline';
import { fetchJson, resetIntegrationRequestStateForTests } from '../src/services/integrations/shared';
import { __setRequestUrlMock } from './mocks/obsidian';

afterEach(() => { vi.useRealTimers(); __setRequestUrlMock(null); resetIntegrationRequestStateForTests(); });

describe('provider request deadlines', () => {
    it('cleans its timer after success and synchronous failure', async () => {
        vi.useFakeTimers();
        await expect(requestWithDeadline(() => Promise.resolve('ok'))).resolves.toBe('ok');
        await expect(requestWithDeadline(() => { throw new Error('broken'); })).rejects.toThrow('broken');
        expect(vi.getTimerCount()).toBe(0);
    });
    it('preserves an undefined rejection', async () => {
        await expect(requestWithDeadline(() => Promise.reject(undefined))).rejects.toBeUndefined();
    });
    it('rejects on timeout and ignores a late transport response', async () => {
        vi.useFakeTimers();
        let complete!: (value: string) => void;
        const result = requestWithDeadline(() => new Promise<string>(resolve => { complete = resolve; }), 100);
        const check = expect(result).rejects.toBeInstanceOf(RequestTimeoutError);
        await vi.advanceTimersByTimeAsync(100); await check;
        complete('stale'); await Promise.resolve();
        expect(vi.getTimerCount()).toBe(0);
    });
    it('never starts an operation with an already aborted signal', async () => {
        const controller = new AbortController(); controller.abort();
        const operation = vi.fn(() => Promise.resolve('unused'));
        await expect(requestWithDeadline(operation, 100, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
        expect(operation).not.toHaveBeenCalled();
    });
    it('aborts a running wait and removes its timer and listener', async () => {
        vi.useFakeTimers(); const controller = new AbortController();
        const remove = vi.spyOn(controller.signal, 'removeEventListener');
        const result = requestWithDeadline(() => new Promise(() => {}), 100, controller.signal);
        const check = expect(result).rejects.toMatchObject({ name: 'AbortError' });
        controller.abort(); await check;
        expect(vi.getTimerCount()).toBe(0); expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    });
    it('does not retry a hung transport and releases the provider queue', async () => {
        vi.useFakeTimers();
        const request = vi.fn().mockImplementationOnce(() => new Promise(() => {}))
            .mockResolvedValue({ status: 200, json: { ok: true } });
        __setRequestUrlMock(request);
        const result = fetchJson('https://deadline.test/first', {}, 'GET', undefined, { swallowErrors: false });
        const check = expect(result).rejects.toThrow('timed out');
        await vi.advanceTimersByTimeAsync(PROVIDER_REQUEST_TIMEOUT_MS); await check;
        expect(request).toHaveBeenCalledTimes(1);
        const second = fetchJson('https://deadline.test/second');
        await vi.advanceTimersByTimeAsync(2000);
        await expect(second).resolves.toEqual({ ok: true });
        expect(request).toHaveBeenCalledTimes(2);
    });
});
