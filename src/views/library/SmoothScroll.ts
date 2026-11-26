type ScrollCallbacks = { onFrame?: () => void; onIdle?: () => void };

/** Smooth discrete mouse-wheel steps without queuing separate scroll animations. */
export class SmoothScroll {
    private readonly view: Window;
    private readonly reducedMotion: MediaQueryList;
    private frameId: number | null = null;
    private idleTimer: number | null = null;
    private target = 0;
    private position = 0;
    private lastWritten = 0;
    private frameTime = 0;
    private nativeInputUntil = 0;

    constructor(private readonly container: HTMLElement, private readonly callbacks: ScrollCallbacks = {}) {
        this.view = container.ownerDocument.defaultView ?? window;
        this.reducedMotion = this.view.matchMedia('(prefers-reduced-motion: reduce)');
        container.addEventListener('wheel', this.onWheel, { passive: false });
        container.addEventListener('scroll', this.onScroll, { passive: true });
        container.ownerDocument.addEventListener('keydown', this.stopMotion, true);
        container.addEventListener('touchstart', this.stopMotion, { passive: true });
        container.ownerDocument.addEventListener('pointerdown', this.stopMotion, true);
        this.view.addEventListener('blur', this.cancel);
        this.reducedMotion.addEventListener('change', this.cancel);
    }

    private readonly onWheel = (event: WheelEvent): void => {
        if (event.defaultPrevented || !event.cancelable || event.ctrlKey || event.metaKey
            || event.shiftKey || !Number.isFinite(event.deltaY) || !event.deltaY || this.reducedMotion.matches) {
            this.stopMotion();
            return;
        }
        const now = this.view.performance.now();
        // Fine, fractional and two-axis gestures already carry device inertia.
        if (event.deltaX || event.deltaMode === 0 && (Math.abs(event.deltaY) < 50 || !Number.isInteger(event.deltaY))) {
            this.nativeInputUntil = now + 180;
            this.stopMotion();
            return;
        }
        if (now < this.nativeInputUntil || this.nestedScrollerConsumes(event)) {
            this.stopMotion();
            return;
        }
        const current = this.container.scrollTop;
        if (this.frameId !== null && Math.abs(current - this.lastWritten) > 1) this.stopMotion();
        const unit = event.deltaMode === 1 ? 24 : event.deltaMode === 2 ? this.container.clientHeight : 1;
        const delta = event.deltaY * unit;
        const max = Math.max(0, this.container.scrollHeight - this.container.clientHeight);
        const continuing = this.frameId !== null && Math.sign(this.target - current) === Math.sign(delta);
        const target = Math.max(0, Math.min(max, (continuing ? this.target : current) + delta));
        if (target === current) return;
        event.preventDefault();
        this.target = target;
        this.markScrolling();
        if (this.frameId !== null) return;
        this.position = current;
        this.lastWritten = current;
        this.frameTime = now;
        this.frameId = this.view.requestAnimationFrame(this.animate);
    };

    private nestedScrollerConsumes(event: WheelEvent): boolean {
        for (let node = event.target as Element | null; node && node !== this.container; node = node.parentElement) {
            if (typeof node.matches !== 'function') continue;
            if (node.matches('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="slider"], [role="spinbutton"]')) return true;
            if (node.scrollHeight <= node.clientHeight + 1) continue;
            const style = this.view.getComputedStyle(node);
            if (!/^(auto|scroll)$/.test(style.overflowY)) continue;
            if (style.overscrollBehaviorY === 'contain' || style.overscrollBehaviorY === 'none') return true;
            if (event.deltaY < 0 ? node.scrollTop > 0 : node.scrollTop + node.clientHeight < node.scrollHeight - 1) return true;
        }
        return false;
    }

    private readonly animate = (time: number): void => {
        this.frameId = null;
        if (this.reducedMotion.matches || Math.abs(this.container.scrollTop - this.lastWritten) > 1) {
            this.stopMotion();
            return;
        }
        this.target = Math.min(this.target, Math.max(0, this.container.scrollHeight - this.container.clientHeight));
        const elapsed = Math.max(1, Math.min(40, time - this.frameTime));
        this.frameTime = time;
        this.position += (this.target - this.position) * (1 - Math.exp(-elapsed / 60));
        const finished = Math.abs(this.target - this.position) < .5;
        if (finished) this.position = this.target;
        this.container.scrollTo({ top: this.position, behavior: 'instant' });
        this.lastWritten = this.container.scrollTop;
        // Update the card window before this frame is painted, not one frame later.
        this.callbacks.onFrame?.();
        if (!finished) this.frameId = this.view.requestAnimationFrame(this.animate);
    };

    private readonly onScroll = (): void => {
        if (this.frameId !== null && Math.abs(this.container.scrollTop - this.lastWritten) > 1) this.stopMotion();
        // Native touchpad, keyboard and scrollbar jumps also need their card
        // window updated in the scroll event, before the next paint.
        if (this.frameId === null) this.callbacks.onFrame?.();
        this.markScrolling();
    };

    private markScrolling(): void {
        if (!this.container.classList.contains('is-scrolling')) this.container.classList.add('is-scrolling');
        if (this.idleTimer !== null) this.view.clearTimeout(this.idleTimer);
        this.idleTimer = this.view.setTimeout(this.finishScrolling, 140);
    }

    private readonly finishScrolling = (): void => {
        this.idleTimer = null;
        if (this.frameId !== null) { this.markScrolling(); return; }
        this.container.classList.remove('is-scrolling');
        this.callbacks.onIdle?.();
    };

    private readonly stopMotion = (): void => {
        if (this.frameId !== null) this.view.cancelAnimationFrame(this.frameId);
        this.frameId = null;
    };

    readonly cancel = (): void => {
        this.stopMotion();
        if (this.idleTimer !== null) this.view.clearTimeout(this.idleTimer);
        this.idleTimer = null;
        this.container.classList.remove('is-scrolling');
    };

    destroy(): void {
        this.cancel();
        this.container.removeEventListener('wheel', this.onWheel);
        this.container.removeEventListener('scroll', this.onScroll);
        this.container.ownerDocument.removeEventListener('keydown', this.stopMotion, true);
        this.container.removeEventListener('touchstart', this.stopMotion);
        this.container.ownerDocument.removeEventListener('pointerdown', this.stopMotion, true);
        this.view.removeEventListener('blur', this.cancel);
        this.reducedMotion.removeEventListener('change', this.cancel);
    }
}
