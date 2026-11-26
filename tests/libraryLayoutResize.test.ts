// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('obsidian', async importOriginal => ({ ...await importOriginal<object>(), ItemView: class {} }));
import { LibraryView } from '../src/views/LibraryView';
import { GameCard } from '../src/components/GameCard';
import { installStatisticsDom } from './helpers/statisticsDom';

beforeEach(() => { installStatisticsDom(); vi.useFakeTimers(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); document.body.replaceChildren(); });

function fixture() {
    const view = Object.create(LibraryView.prototype) as any;
    const content = document.body.createDiv(), library = content.createDiv();
    library.style.width = '1000px';
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(fn => { frames.push(fn); return frames.length; });
    const measuredWidths: string[] = [];
    Object.assign(view, {
        contentEl: content, containerEl: content, libraryContentEl: library, gridEl: null, virtualGrid: null,
        isDestroyed: false, resizeLayoutRafId: null, resizeSettleTimerId: null,
        contentRevealAnimations: new Set(), cardReflowAnimations: new Set(),
        lastObservedLayoutWidth: 600, smoothScroll: { cancel: vi.fn() },
        getEffectiveLayout: () => ({}), getRenderedColumns: () => 3,
        updateRenderedGridColumns: vi.fn(),
        captureCardLayout: () => { measuredWidths.push(library.style.width); return new Map(); },
        scrollManager: {
            capture: vi.fn(() => { expect(library.style.width).toBe('1000px'); return { scrollTop: 500 }; }),
            apply: vi.fn(() => { expect(library.style.width).toBe(String(view.lastObservedLayoutWidth)+'px'); }),
        },
    });
    return { view, library, frames, measuredWidths };
}

it('coalesces a sidebar width transition into one final layout, preserving the old poster geometry', () => {
    const f = fixture();
    f.view.markLayoutResizing();
    vi.advanceTimersByTime(60);
    f.view.lastObservedLayoutWidth = 650;
    f.view.markLayoutResizing();
    vi.advanceTimersByTime(90);
    expect(f.frames).toHaveLength(0);
    expect(f.measuredWidths).toEqual([]);
    expect(f.library.style.width).toBe('1000px');
    expect(f.view.contentEl.hasClass('is-layout-resizing')).toBe(true);
    vi.advanceTimersByTime(10);
    expect(f.frames).toHaveLength(1);
    f.frames[0](0);
    expect(f.measuredWidths).toEqual(['1000px', '650px']);
    expect(f.view.updateRenderedGridColumns).toHaveBeenCalledTimes(1);
    expect(f.view.scrollManager.apply).toHaveBeenCalledWith('preserve', { scrollTop: 500 });
    expect(f.view.contentEl.hasClass('is-layout-resizing')).toBe(false);
});

it('cancels pending resize work when the view closes', () => {
    const f = fixture();
    f.view.markLayoutResizing();
    f.view.cleanupLayoutResize();
    vi.advanceTimersByTime(1000);
    expect(f.frames).toHaveLength(0);
    expect(f.view.updateRenderedGridColumns).not.toHaveBeenCalled();
    expect(f.view.contentEl.hasClass('is-layout-resizing')).toBe(false);
});

it('starts at most one card animation after the sidebar finishes moving', () => {
    const f = fixture();
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
    const card = f.library.createDiv({ cls: 'lorebase-card', attr: { 'data-lorebase-file-path': 'a' } });
    const animation = { onfinish: null, oncancel: null, cancel: vi.fn() } as unknown as Animation;
    const animate = vi.fn(() => animation);
    Object.defineProperty(card, 'animate', { value: animate });
    f.view.captureCardLayout = vi.fn()
        .mockReturnValueOnce(new Map([['a', { left: 0, top: 0, width: 200, height: 300, row: 0 }]]))
        .mockReturnValueOnce(new Map([['a', { left: 0, top: 0, width: 150, height: 225, row: 0 }]]));
    f.view.markLayoutResizing();
    vi.advanceTimersByTime(50);
    f.view.markLayoutResizing();
    expect(animate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    f.frames[0](0);
    expect(animate).toHaveBeenCalledOnce();
    expect(f.view.cardReflowAnimations.size).toBe(1);
    (animation.onfinish as () => void)();
    expect(f.view.contentEl.hasClass('is-layout-resizing')).toBe(false);
});

it('does not refit the text of every offscreen card after a resize', () => {
    const f = fixture();
    for(let i=0;i<100;i++) f.library.createDiv({cls:'lorebase-card',attr:{'data-lorebase-file-path':String(i)}});
    const visible = new Map([['1', {left:0,top:0,width:100,height:150,row:0}]]);
    f.view.captureCardLayout = () => visible;
    f.view.animateRenderedCardReflow = vi.fn();
    const refit = vi.spyOn(GameCard, 'refitOverlay').mockImplementation(() => undefined);
    f.view.refreshGridLayout();
    expect(refit).toHaveBeenCalledTimes(1);
    expect(refit.mock.calls[0][0].dataset.lorebaseFilePath).toBe('1');
});

it('does not read the pane position or rebuild cards when only its screen position changes', () => {
    const f = fixture(); let observe!: (entries:any[])=>void;
    vi.stubGlobal('ResizeObserver', class { constructor(callback:typeof observe){observe=callback;} observe(){} disconnect(){} });
    const position = vi.spyOn(f.view.contentEl, 'getBoundingClientRect');
    f.view.observeLayoutResize();
    observe([{contentRect:{width:1000,height:500}}]);
    observe([{contentRect:{width:1000,height:500}}]);
    expect(position).not.toHaveBeenCalled();
    expect(f.frames).toHaveLength(1);
    expect(f.measuredWidths).toEqual([]);
});

it('updates the virtual viewport after a height-only pane resize', () => {
    const f = fixture();
    let observe!: (entries: any[]) => void;
    vi.stubGlobal('ResizeObserver', class {
        constructor(callback: typeof observe) { observe = callback; }
        observe() {} disconnect() {}
    });
    f.view.virtualGrid = { updateViewport: vi.fn() };
    f.view.observeLayoutResize();
    observe([{ contentRect: { width: 1000, height: 500 } }]);
    observe([{ contentRect: { width: 1000, height: 900 } }]);
    expect(f.view.virtualGrid.updateViewport).toHaveBeenCalledTimes(1);
});
