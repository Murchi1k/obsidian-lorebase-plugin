// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DropdownManager } from '../src/components/toolbar/DropdownManager';
import { addMobileModalClose } from '../src/components/MobileModalChrome';
import { installStatisticsDom } from './helpers/statisticsDom';

beforeAll(() => {
    installStatisticsDom();
    Object.assign(globalThis, { activeDocument: document });
});
const managers: DropdownManager[] = [];
afterEach(() => {
    managers.splice(0).forEach(manager => manager.destroy());
    document.body.classList.remove('is-mobile');
    document.body.replaceChildren();
    vi.restoreAllMocks();
});

describe('phone workspace interactions', () => {
    function fixture() {
        document.body.classList.add('is-mobile');
        const root = document.body.createDiv();
        const manager = new DropdownManager(root); managers.push(manager);
        const { button, panel } = manager.createDropdown(root, { icon: 'sliders-horizontal', label: 'View and filters' });
        panel.classList.add('lorebase-view-panel');
        // A saved-view name appears before the action buttons in the real panel.
        const input = panel.createEl('input', { attr: { type: 'text' } });
        const action = panel.createEl('button', { text: 'Reset' });
        return { manager, button, panel, input, action };
    }

    it('opens view settings without focusing a text field and still allows typing after a tap', () => {
        const { button, input, action } = fixture();
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { callback(0); return 1; });
        const focus = vi.spyOn(input, 'focus');
        button.click();
        expect(button.getAttribute('aria-expanded')).toBe('true');
        expect(document.activeElement).toBe(action);
        expect(focus).not.toHaveBeenCalled();
        input.focus();
        expect(document.activeElement).toBe(input);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(document.activeElement).toBe(button);
        expect(button.getAttribute('aria-expanded')).toBe('false');
    });

    it('does not steal focus if the panel is closed before the scheduled focus runs', () => {
        const { button, manager, action } = fixture();
        let frame: FrameRequestCallback | undefined;
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frame = callback; return 1; });
        const focus = vi.spyOn(action, 'focus');
        button.click(); manager.closeDropdowns(); frame?.(0);
        expect(focus).not.toHaveBeenCalled();
    });

    it('adds an accessible close control to the content header', () => {
        const modal = document.body.createDiv({ cls: 'modal' });
        const header = modal.createDiv();
        const closed = vi.fn();
        const close = addMobileModalClose(modal, header, closed);
        expect(modal.classList.contains('has-mobile-inline-close')).toBe(true);
        expect(close.parentElement).toBe(header);
        expect(close.getAttribute('aria-label')).toBeTruthy();
        expect(close.type).toBe('button');
        close.click();
        expect(closed).toHaveBeenCalledOnce();
    });
});
