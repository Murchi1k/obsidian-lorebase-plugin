import type { CardOrientation, LorebaseSettings } from '../../types';

/** Snap footer text to its original row, the card edge and the other text's left edge. */
export function snapMusicTextPosition(
    field: 'title' | 'year', point: { x: number; y: number },
    layout: LorebaseSettings['overlayTextLayout'], orientation: CardOrientation,
    width: number, height: number,
): { x: number; y: number } {
    const padding = orientation === 'horizontal' ? 16 : 6;
    const maxY = Math.max(0, 100 - (18 + padding) / Math.max(1, height) * 100);
    const snap = (value: number, guides: number[], threshold: number, max: number): number => {
        const clamped = Math.max(0, Math.min(max, value));
        const nearest = guides.reduce((best, guide) => Math.abs(guide - clamped) < Math.abs(best - clamped) ? guide : best);
        const result = Math.abs(nearest - clamped) <= threshold ? nearest : clamped;
        return Math.round(Math.max(0, Math.min(max, result)) * 10) / 10;
    };
    return {
        x: snap(point.x, [0, layout[field].x, layout[field === 'title' ? 'year' : 'title'].x], 600 / Math.max(1, width), 85),
        y: snap(point.y, [0, field === 'title' ? 0 : 1900 / Math.max(1, height), layout[field].y, maxY], 400 / Math.max(1, height), maxY),
    };
}
