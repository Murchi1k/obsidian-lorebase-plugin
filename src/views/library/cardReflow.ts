export interface CardRect {
    left: number;
    top: number;
    width: number;
    height: number;
    row: number;
}

/** FLIP keeps decoded posters visible and moves each card directly to its slot. */
export function planCardReflow(previous: Map<string, CardRect>, current: Map<string, CardRect>): Map<string, Keyframe[]> {
    const plan = new Map<string, Keyframe[]>();
    for (const [key, next] of current) {
        const old = previous.get(key);
        if (!old || old.width <= 0 || old.height <= 0 || next.width <= 0 || next.height <= 0) continue;
        const x = old.left + old.width / 2 - next.left - next.width / 2;
        const y = old.top + old.height / 2 - next.top - next.height / 2;
        if (Math.abs(x) < .5 && Math.abs(y) < .5
            && Math.abs(old.width - next.width) < .5 && Math.abs(old.height - next.height) < .5) continue;
        plan.set(key, [
            { transform: `translate(${x}px, ${y}px) scale(${old.width / next.width}, ${old.height / next.height})` },
            { transform: 'translate(0px, 0px) scale(1, 1)' },
        ]);
    }
    return plan;
}
