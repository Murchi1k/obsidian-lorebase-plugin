// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachDelayedTitleExpansion } from '../src/utils/delayedTitleExpansion';

afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });
function caption(truncated = true) {
    vi.useFakeTimers();
    const card = document.createElement('div');
    card.tabIndex = 0;
    const poster = card.appendChild(document.createElement('img'));
    const title = card.appendChild(document.createElement('div'));
    title.textContent = 'Полное длинное название';
    Object.defineProperties(title, { scrollWidth: { value: truncated ? 450 : 100 }, clientWidth: { value: 100 } });
    document.body.appendChild(card);
    const controller = new AbortController();
    attachDelayedTitleExpansion(card, title, controller.signal);
    return { card, poster, title, controller };
}
const expanded = (card: HTMLElement) => card.classList.contains('is-title-expanded');

describe('inline title after hovering the whole card', () => {
    it('expands the existing caption after 0.5 seconds on the card, without a tooltip', () => {
        const { card, title, controller } = caption();
        card.dispatchEvent(new MouseEvent('mouseenter'));
        vi.advanceTimersByTime(499); expect(expanded(card)).toBe(false);
        vi.advanceTimersByTime(1); expect(expanded(card)).toBe(true);
        expect(title.textContent).toBe('Полное длинное название');
        expect(document.querySelector('[role="tooltip"]')).toBeNull();
        card.dispatchEvent(new MouseEvent('mouseleave')); expect(expanded(card)).toBe(false);
        controller.abort();
    });
    it('keeps counting while moving from the poster to the caption inside the same card', () => {
        const { card, poster, title, controller } = caption();
        card.dispatchEvent(new MouseEvent('mouseenter'));
        vi.advanceTimersByTime(250);
        poster.dispatchEvent(new MouseEvent('mouseleave', { relatedTarget: title }));
        title.dispatchEvent(new MouseEvent('mouseenter', { relatedTarget: poster }));
        vi.advanceTimersByTime(250); expect(expanded(card)).toBe(true);
        controller.abort(); expect(expanded(card)).toBe(false);
    });
    it('cancels on leave, Escape and disposal; also supports focusing the card', () => {
        const { card, controller } = caption();
        card.dispatchEvent(new MouseEvent('mouseenter')); vi.advanceTimersByTime(250);
        card.dispatchEvent(new MouseEvent('mouseleave')); vi.advanceTimersByTime(4000);
        expect(expanded(card)).toBe(false);
        card.focus(); vi.advanceTimersByTime(500); expect(expanded(card)).toBe(true);
        card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); expect(expanded(card)).toBe(false);
        card.dispatchEvent(new MouseEvent('mouseenter')); controller.abort();
        vi.advanceTimersByTime(4000); expect(expanded(card)).toBe(false);
    });
    it('does not restart the hover timer when focus moves inside the card', () => {
        const { card, title, controller } = caption();
        card.dispatchEvent(new MouseEvent('mouseenter'));
        vi.advanceTimersByTime(250);
        title.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        vi.advanceTimersByTime(249); expect(expanded(card)).toBe(false);
        vi.advanceTimersByTime(1); expect(expanded(card)).toBe(true);
        title.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        expect(expanded(card)).toBe(true);
        controller.abort();
    });
    it('leaves titles that fit unchanged', () => {
        const { card, controller } = caption(false);
        card.dispatchEvent(new MouseEvent('mouseenter'));
        vi.advanceTimersByTime(5000); expect(expanded(card)).toBe(false);
        controller.abort();
    });
});
