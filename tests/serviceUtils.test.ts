import { describe, expect, it, vi, afterEach } from 'vitest';
import { mapInFrameBatches } from '../src/services/media/serviceUtils';

describe('mapInFrameBatches', () => {
    afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
    it('preserves order and filters null results across batches', async () => {
        const result = await mapInFrameBatches(
            [1, 2, 3, 4, 5],
            (value) => value % 2 === 0 ? value * 10 : null,
            2
        );

        expect(result).toEqual([20, 40]);
    });

    it('finishes when the browser suspends animation frames in a hidden window', async () => {
        vi.useFakeTimers();
        const cancel = vi.fn();
        vi.stubGlobal('window', { requestAnimationFrame: vi.fn(() => 123), cancelAnimationFrame: cancel });
        const loading = mapInFrameBatches([1, 2, 3], value => value, 1);
        await vi.advanceTimersByTimeAsync(64);
        expect(await loading).toEqual([1, 2, 3]);
        expect(cancel).toHaveBeenCalledWith(123);
    });

    it('yields during expensive parsing without forcing a frame after every few cheap notes', async () => {
        vi.useFakeTimers();
        let clock = 0;
        vi.spyOn(performance, 'now').mockImplementation(() => clock);
        const frames = vi.fn((callback: FrameRequestCallback) => {
            return setTimeout(() => callback(clock), 0) as unknown as number;
        });
        vi.stubGlobal('window', { requestAnimationFrame: frames, cancelAnimationFrame: clearTimeout });
        const loading = mapInFrameBatches(Array.from({ length: 1000 }, (_, i) => i), value => {
            clock += .05;
            return value;
        });
        await vi.runAllTimersAsync();
        expect(await loading).toHaveLength(1000);
        expect(frames.mock.calls.length).toBeGreaterThan(1);
        expect(frames.mock.calls.length).toBeLessThan(20);
    });
});
