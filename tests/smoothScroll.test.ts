// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SmoothScroll } from '../src/views/library/SmoothScroll';

const controllers: SmoothScroll[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => { controllers.splice(0).forEach(controller => controller.destroy()); document.body.replaceChildren(); vi.restoreAllMocks(); vi.useRealTimers(); });

function fixture(reduced = false) {
    let now = 0, id = 0;
    const frames = new Map<number, FrameRequestCallback>();
    vi.spyOn(window.performance, 'now').mockImplementation(() => now);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frames.set(++id, callback); return id; });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(handle => { frames.delete(handle); });
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    Object.defineProperty(motion, 'matches', { configurable: true, value: reduced });
    vi.spyOn(window, 'matchMedia').mockReturnValue(motion);
    const container = document.body.appendChild(document.createElement('div'));
    Object.defineProperties(container, { clientHeight: { value: 800 }, scrollHeight: { value: 20_000 } });
    vi.spyOn(container, 'scrollTo').mockImplementation(options => {
        container.scrollTop = (options as ScrollToOptions).top!;
        container.dispatchEvent(new Event('scroll'));
    });
    const onFrame = vi.fn(), onIdle = vi.fn();
    const controller = new SmoothScroll(container, { onFrame, onIdle });
    controllers.push(controller);
    const step = () => {
        now += 16;
        const callbacks = [...frames.values()]; frames.clear();
        callbacks.forEach(callback => callback(now));
    };
    const settle = () => { for (let i = 0; i < 100 && frames.size; i++) step(); expect(frames.size).toBe(0); };
    const wheel = (deltaY = 120, options: WheelEventInit = {}, target: Element = container) => {
        const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY, ...options });
        target.dispatchEvent(event); return event;
    };
    return { container, controller, frames, step, settle, wheel, motion, onFrame, onIdle };
}

describe('library wheel scrolling', () => {
    it('updates the viewport immediately after a native scrollbar jump', () => {
        const f = fixture();
        f.container.scrollTop = 10_000;
        f.container.dispatchEvent(new Event('scroll'));
        expect(f.onFrame).toHaveBeenCalledTimes(1);
        expect(f.frames.size).toBe(0);
    });
    it('spreads a mouse-wheel step across frames, preserves its distance and restores hover afterward', () => {
        const f = fixture();
        expect(f.wheel().defaultPrevented).toBe(true);
        expect(f.container.scrollTop).toBe(0);
        f.step();
        expect(f.container.scrollTop).toBeGreaterThan(0);
        expect(f.container.scrollTop).toBeLessThan(120);
        expect(f.container.classList.contains('is-scrolling')).toBe(true);
        f.settle();
        expect(f.container.scrollTop).toBe(120);
        expect(f.onFrame).toHaveBeenCalled();
        vi.advanceTimersByTime(200);
        expect(f.container.classList.contains('is-scrolling')).toBe(false);
        expect(f.onIdle).toHaveBeenCalledTimes(1);
    });

    it('combines repeated notches and changes direction immediately without an animation backlog', () => {
        const f = fixture();
        f.wheel(); f.step(); f.wheel();
        expect(f.frames.size).toBe(1);
        f.settle(); expect(f.container.scrollTop).toBe(240);
        f.wheel(); f.step();
        const reverseFrom = f.container.scrollTop;
        f.wheel(-120); f.step();
        expect(f.container.scrollTop).toBeLessThan(reverseFrom);
        f.settle(); expect(f.container.scrollTop).toBeCloseTo(reverseFrom - 120);
    });

    it.each(['pointer', 'keyboard', 'keyboard outside library', 'external scroll', 'destroy'])('stops when interrupted by %s', kind => {
        const f = fixture(); f.wheel(); f.step();
        if (kind === 'pointer') f.container.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        if (kind === 'keyboard') f.container.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown' }));
        if (kind === 'keyboard outside library') document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        if (kind === 'external scroll') { f.container.scrollTop = 700; f.container.dispatchEvent(new Event('scroll')); }
        if (kind === 'destroy') f.controller.destroy();
        const stoppedAt = f.container.scrollTop;
        f.step(); expect(f.frames.size).toBe(0); expect(f.container.scrollTop).toBe(stoppedAt);
    });

    it('leaves touchpad gestures, zoom, horizontal scrolling and controls to native handling', () => {
        const f = fixture();
        expect(f.wheel(8.5).defaultPrevented).toBe(false);
        expect(f.wheel(120).defaultPrevented).toBe(false);
        vi.advanceTimersByTime(200);
        expect(f.wheel(120, { ctrlKey: true }).defaultPrevented).toBe(false);
        expect(f.wheel(120, { deltaX: 60 }).defaultPrevented).toBe(false);
        expect(f.wheel(120, { shiftKey: true }).defaultPrevented).toBe(false);
        const input = f.container.appendChild(document.createElement('input'));
        expect(f.wheel(120, {}, input).defaultPrevented).toBe(false);
        expect(f.frames.size).toBe(0);
    });

    it('keeps long descriptions scrollable and hands off only at their boundary', () => {
        const f = fixture();
        const description = f.container.appendChild(document.createElement('div'));
        description.style.overflowY = 'auto';
        Object.defineProperties(description, { clientHeight: { value: 100 }, scrollHeight: { value: 400 } });
        expect(f.wheel(120, {}, description).defaultPrevented).toBe(false);
        expect(f.frames.size).toBe(0);
        description.scrollTop = 300;
        expect(f.wheel(120, {}, description).defaultPrevented).toBe(true);
        f.settle(); expect(f.container.scrollTop).toBe(120);
    });

    it('respects reduced motion, including preference changes during an animation', () => {
        const f = fixture(); f.wheel(); f.step();
        Object.defineProperty(f.motion, 'matches', { configurable: true, value: true });
        f.motion.dispatchEvent(new Event('change'));
        expect(f.frames.size).toBe(0);
        expect(f.wheel().defaultPrevented).toBe(false);
        expect(f.container.classList.contains('is-scrolling')).toBe(false);
    });

    it('normalizes line deltas and does not trap the wheel at a library boundary', () => {
        const f = fixture();
        expect(f.wheel(-120).defaultPrevented).toBe(false);
        f.wheel(3, { deltaMode: 1 }); f.settle();
        expect(f.container.scrollTop).toBe(72);
        f.container.scrollTop = 19_200;
        expect(f.wheel().defaultPrevented).toBe(false);
    });
});
