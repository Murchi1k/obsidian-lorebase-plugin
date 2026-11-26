import { setIcon } from 'obsidian';
import { isMobileInterface } from '../MobileModalChrome';

type DropdownOptions = {
    icon: string;
    label: string;
    align?: 'left' | 'right';
};

export class DropdownManager {
    private root: HTMLElement;
    private documentClickHandler: ((event: MouseEvent) => void) | null = null;
    private keyHandler: ((event: KeyboardEvent) => void) | null = null;

    constructor(root: HTMLElement) {
        this.root = root;
        this.registerGlobalHandlers();
    }

    createDropdown(
        parent: HTMLElement,
        options: DropdownOptions
    ): { button: HTMLButtonElement; panel: HTMLElement } {
        const wrapper = parent.createDiv({ cls: 'lorebase-dropdown-wrap' });
        if (options.align === 'right') {
            wrapper.addClass('is-right');
        }

        const button = wrapper.createEl('button', {
            cls: 'lorebase-toolbar-btn',
            attr: {
                type: 'button',
                'aria-label': options.label,
                'aria-haspopup': 'true',
                'aria-expanded': 'false',
            },
        });
        setIcon(button, options.icon);

        const panel = wrapper.createDiv({ cls: 'lorebase-dropdown' });

        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.toggleDropdown(panel, button);
        });

        return { button, panel };
    }

    closeDropdowns(): void {
        this.root.querySelectorAll('.lorebase-dropdown.is-open').forEach((panel) => {
            panel.removeClass('is-open');
        });
        this.root.querySelectorAll('.lorebase-toolbar-btn.is-open').forEach((btn) => {
            btn.removeClass('is-open');
            btn.setAttribute('aria-expanded', 'false');
        });
    }

    destroy(): void {
        if (this.documentClickHandler) {
            activeDocument.removeEventListener('click', this.documentClickHandler);
            this.documentClickHandler = null;
        }

        if (this.keyHandler) {
            activeDocument.removeEventListener('keydown', this.keyHandler);
            this.keyHandler = null;
        }

    }

    private toggleDropdown(panel: HTMLElement, button: HTMLButtonElement): void {
        const isOpen = panel.hasClass('is-open');
        this.closeDropdowns();

        if (!isOpen) {
            panel.addClass('is-open');
            button.addClass('is-open');
            button.setAttribute('aria-expanded', 'true');
            if (panel.hasClass('lorebase-view-panel') && isMobileInterface(this.root)) {
                window.requestAnimationFrame(() => {
                    if (!panel.hasClass('is-open')) return;
                    // Text fields must only receive focus after an explicit tap.
                    panel.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus({ preventScroll: true });
                });
            }
        }
    }

    private registerGlobalHandlers(): void {
        this.documentClickHandler = (event: MouseEvent) => {
            const target = event.target;
            const clickedInsideRoot = event.composedPath().includes(this.root)
                || (target instanceof Node && this.root.contains(target));
            if (!clickedInsideRoot) {
                this.closeDropdowns();
            }
        };

        this.keyHandler = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                const trigger = this.root.querySelector<HTMLButtonElement>('.lorebase-toolbar-btn.is-open');
                this.closeDropdowns();
                trigger?.focus();
                return;
            }
            if (event.key === 'Tab' && window.matchMedia('(max-width: 768px)').matches) {
                const panel = this.root.querySelector<HTMLElement>('.lorebase-view-panel.is-open');
                if (!panel) return;
                const focusable = Array.from(panel.querySelectorAll<HTMLElement>(
                    'button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
                )).filter((entry) => entry.offsetParent !== null);
                if (!focusable.length) return;
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (event.shiftKey && activeDocument.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && activeDocument.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
            }
        };

        activeDocument.addEventListener('click', this.documentClickHandler);
        activeDocument.addEventListener('keydown', this.keyHandler);
    }
}
