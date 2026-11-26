// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createLorebaseDropdown } from '../src/components/LorebaseDropdown';
import { Toolbar } from '../src/components/Toolbar';

beforeAll(() => {
    // Obsidian's DOM helpers, backed by real DOM nodes and MutationObserver.
    Object.assign(HTMLElement.prototype, {
        empty() { this.replaceChildren(); },
        addClass(...names: string[]) { this.classList.add(...names); },
        removeClass(...names: string[]) { this.classList.remove(...names); },
        hasClass(name: string) { return this.classList.contains(name); },
        toggleClass(name: string, active: boolean) { this.classList.toggle(name, active); },
        setAttr(name: string, value: string) { this.setAttribute(name, value); },
        setText(value: string) { this.textContent = value; },
        setCssStyles(styles: object) { Object.assign(this.style, styles); },
        createEl(tag: string, options: any = {}) {
            const node = this.ownerDocument.createElement(tag);
            if (options.cls) node.className = options.cls;
            if (options.text) node.textContent = options.text;
            for (const [name, value] of Object.entries(options.attr ?? {})) node.setAttribute(name, String(value));
            this.appendChild(node);
            return node;
        },
        createDiv(options: any) { return this.createEl('div', options); },
        createSpan(options: any) { return this.createEl('span', options); },
        // happy-dom has no layout engine. Model visibility for lifecycle checks.
        getClientRects() {
            if (!this.isConnected) return [];
            for (let node: HTMLElement | null = this; node; node = node.parentElement) {
                if (node.hidden || getComputedStyle(node).display === 'none') return [];
            }
            return [this.getBoundingClientRect()];
        },
        getBoundingClientRect() { return { left: 20, top: 20, right: 160, bottom: 52, width: 140, height: 32 }; },
    });
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 1000 });
    Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, value: 800 });
});

const settle = () => new Promise(resolve => setTimeout(resolve, 0));
afterEach(async () => {
    document.body.replaceChildren();
    await settle();
    vi.restoreAllMocks();
});

it('rebuilding a dropdown in the same container does not leave or restore the previous panel', async () => {
    const container = document.body.createDiv();
    const options = [{ value: 'en', label: 'English' }];
    createLorebaseDropdown(container, options, 'en', vi.fn(), { floating: true });
    const oldPanel = container.querySelector('[role="listbox"]')!;
    container.querySelector('button')!.click();
    createLorebaseDropdown(container, options, 'en', vi.fn(), { floating: true });
    const newPanel = container.querySelector('[role="listbox"]')!;
    container.querySelector('button')!.click();
    await settle();
    expect(oldPanel.isConnected).toBe(false);
    expect(newPanel.parentElement).toBe(document.body);
    expect(container.hasClass('is-open')).toBe(true);
    expect(document.querySelectorAll('[role="listbox"]')).toHaveLength(1);
});

it('also cleans up an inline dropdown when its owner disappears', async () => {
    const container = document.body.createDiv();
    createLorebaseDropdown(container, [{ value: 'en', label: 'English' }], 'en', vi.fn());
    const button = container.querySelector('button')!;
    button.click();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    container.remove();
    await settle();
    expect(button.getAttribute('aria-expanded')).toBe('false');
});

describe.each(['single', 'multiple'] as const)('%s dropdown lifecycle', kind => {
    function setup() {
        const modal = document.body.createDiv();
        const container = modal.createDiv();
        const onChange = vi.fn();
        const options = [{ value: 'en', label: 'English' }, { value: 'uk', label: 'Ukrainian' }];
        if (kind === 'single') createLorebaseDropdown(container, options, 'en', onChange, { floating: true });
        else (Toolbar.prototype as any).createWorkTypeMultiSelect.call(
            { callbacks: {} }, container, options, new Set(['en']), { allWorkTypes: 'All' }, onChange
        );
        const button = container.querySelector('button')!;
        const panel = container.querySelector<HTMLElement>('[role="listbox"]')!;
        button.click();
        expect(panel.parentElement).toBe(document.body);
        expect(button.getAttribute('aria-expanded')).toBe('true');
        return { modal, container, button, panel, onChange };
    }

    it('removes the floating menu when its modal is removed, without another user event', async () => {
        const remove = vi.spyOn(document, 'removeEventListener');
        const { modal, panel, button } = setup();
        modal.remove();
        await settle();
        expect(panel.isConnected).toBe(false);
        expect(panel.hasClass('is-open')).toBe(false);
        expect(button.getAttribute('aria-expanded')).toBe('false');
        for (const type of ['click', 'keydown', 'scroll']) {
            expect(remove.mock.calls.some(call => call[0] === type)).toBe(true);
        }
    });

    it('cleans up when the contents are replaced but the container remains', async () => {
        const { container, panel } = setup();
        container.empty();
        container.createSpan({ text: 'Replacement content' });
        await settle();
        expect(panel.isConnected).toBe(false);
        expect(container.textContent).toBe('Replacement content');
    });

    it.each(['hidden', 'display'] as const)('closes when the parent is hidden with %s', async mode => {
        const { modal, button, panel } = setup();
        if (mode === 'hidden') modal.hidden = true;
        else modal.style.display = 'none';
        await settle();
        expect(panel.parentElement).not.toBe(document.body);
        expect(button.getAttribute('aria-expanded')).toBe('false');
        modal.hidden = false;
        modal.style.display = '';
        button.click();
        expect(panel.parentElement).toBe(document.body);
        expect(panel.hasClass('is-open')).toBe(true);
    });

    it('returns the menu to its container on trigger toggle, Escape, and outside click', () => {
        const { container, button, panel } = setup();
        button.click();
        expect(panel.parentElement).toBe(container);
        button.click();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(panel.parentElement).toBe(container);
        button.click();
        document.body.click();
        expect(panel.parentElement).toBe(container);
        expect(button.getAttribute('aria-expanded')).toBe('false');
    });

    it('keeps option selection working inside the detached panel', () => {
        const { panel, onChange } = setup();
        panel.querySelectorAll<HTMLElement>('[role="option"]')[kind === 'single' ? 1 : 2].click();
        expect(onChange).toHaveBeenCalledOnce();
        if (kind === 'multiple') expect(panel.hasClass('is-open')).toBe(true);
        else expect(panel.hasClass('is-open')).toBe(false);
    });

    it('closes a child menu when the parent filter panel loses its open class', async () => {
        const style = document.head.appendChild(document.createElement('style'));
        style.textContent = '.test-filter:not(.is-open) { display: none; }';
        try {
            const { modal, panel } = setup();
            modal.className = 'test-filter is-open';
            modal.classList.remove('is-open');
            await settle();
            expect(panel.parentElement).not.toBe(document.body);
        } finally { style.remove(); }
    });
});
