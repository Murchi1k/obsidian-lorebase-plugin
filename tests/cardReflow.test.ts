import { describe, expect, it } from 'vitest';
import { CardRect, planCardReflow } from '../src/views/library/cardReflow';

function layout(columns: number, width: number): Map<string, CardRect> {
    const size = (width - 32 - 16 * (columns - 1)) / columns;
    return new Map(Array.from({ length: 80 }, (_, i) => [String(i), {
        left: 16 + (i % columns) * (size + 16),
        top: 16 + Math.floor(i / columns) * (size * 1.5 + 16),
        width: size, height: size * 1.5, row: Math.floor(i / columns),
    }]));
}

describe('continuous card reflow', () => {
    it.each([[5, 4], [4, 5], [5, 3], [3, 5]])('preserves initial geometry and poster size throughout %i → %i', (from, to) => {
        const old = layout(from, 1400), next = layout(to, 1100);
        const plan = planCardReflow(old, next);
        expect(plan.size).toBe(next.size);
        for (const [key, frames] of plan) {
            const before = old.get(key)!, after = next.get(key)!;
            const values = String(frames[0].transform).match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)!.map(Number);
            expect(after.left + after.width / 2 + values[0]).toBeCloseTo(before.left + before.width / 2);
            expect(after.top + after.height / 2 + values[1]).toBeCloseTo(before.top + before.height / 2);
            expect(after.width * values[2]).toBeCloseTo(before.width);
            expect(after.height * values[3]).toBeCloseTo(before.height);
            // Direct interpolation never shrinks a cover below either endpoint.
            expect(frames).toHaveLength(2);
            expect(frames.every(frame => frame.opacity === undefined)).toBe(true);
            expect(frames[1].transform).toBe('translate(0px, 0px) scale(1, 1)');
        }
    });

    it('leaves unchanged and newly mounted cards alone', () => {
        const current = layout(5, 1400), previous = new Map(current);
        previous.delete('2');
        expect(planCardReflow(previous, current).size).toBe(0);
    });
});
