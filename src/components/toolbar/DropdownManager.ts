import { setIcon } from 'obsidian';

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
        }
    }

    private registerGlobalHandlers(): void {
        this.documentClickHandler = (event: MouseEvent) => {
            const target = event.target;
            if (target instanceof Node && !this.root.contains(target)) {
                this.closeDropdowns();
            }
        };

        this.keyHandler = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                this.closeDropdowns();
            }
        };

        activeDocument.addEventListener('click', this.documentClickHandler);
        activeDocument.addEventListener('keydown', this.keyHandler);
    }
}
