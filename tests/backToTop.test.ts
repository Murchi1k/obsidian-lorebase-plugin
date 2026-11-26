// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { BackToTop } from '../src/views/library/BackToTop';
import { installStatisticsDom } from './helpers/statisticsDom';

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

it.each([false, true])('shows after scrolling, returns upward and cleans up (reduced motion: %s)', reduced => {
    installStatisticsDom();
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: reduced } as MediaQueryList);
    const parent = document.body.createDiv(), container = parent.createDiv();
    container.tabIndex = -1;
    Object.defineProperty(container, 'clientHeight', { value: 800 });
    const scroll = vi.spyOn(container, 'scrollTo').mockImplementation(() => {});
    const control = new BackToTop(parent, container);
    const root = parent.querySelector<HTMLElement>('.lorebase-scroll-tools')!;
    expect(root.hidden).toBe(true);
    container.scrollTop = 2000; container.dispatchEvent(new Event('scroll'));
    expect(root.hidden).toBe(false);
    root.querySelector('button')!.click();
    expect(scroll).toHaveBeenCalledWith({ top: 0, behavior: reduced ? 'instant' : 'smooth' });
    expect(document.activeElement).toBe(container);
    container.scrollTop = 0; container.dispatchEvent(new Event('scroll'));
    expect(root.hidden).toBe(true);
    control.destroy();
    expect(root.isConnected).toBe(false);
});
