import { setIcon } from 'obsidian';
import { createDropdownLifecycle } from './dropdownLifecycle';

const closeByContainer = new WeakMap<HTMLElement, () => void>();

export type LorebaseDropdownOption<T extends string> = {
    value: T;
    label: string;
    group?: string;
    advanced?: boolean;
};

export type LorebaseDropdownHandle<T extends string> = {
    setValue: (value: T) => void;
};

export type LorebaseDropdownConfig = {
    action?: { label: string; icon?: string; onClick: () => void };
    showMoreLabel?: string;
    showLessLabel?: string;
    floating?: boolean;
    minPanelWidth?: number;
    maxPanelHeight?: number;
    panelClass?: string;
    buttonLabel?: (value: string) => string;
};

export function createLorebaseDropdown<T extends string>(
    container: HTMLElement,
    options: LorebaseDropdownOption<T>[],
    value: T,
    onChange: (value: T) => void | Promise<void>,
    config: LorebaseDropdownConfig = {}
): LorebaseDropdownHandle<T> & { setDisabled: (disabled: boolean) => void } {
    const ownerDocument = container.ownerDocument;
    closeByContainer.get(container)?.();
    container.empty();
    container.addClass('lorebase-settings-dropdown');
    container.toggleClass('is-floating', Boolean(config.floating));
    let currentValue = value;
    let showAdvanced = options.some((option) => option.advanced && option.value === currentValue);

    const button = container.createEl('button', {
        cls: 'lorebase-settings-dropdown-btn',
        attr: {
            type: 'button',
            'aria-haspopup': 'true',
            'aria-expanded': 'false',
        },
    });
    const labelEl = button.createSpan({ cls: 'lorebase-settings-dropdown-label' });
    const caret = button.createSpan({ cls: 'lorebase-settings-dropdown-caret' });
    setIcon(caret, 'chevron-down');

    const panel = container.createDiv({
        cls: 'lorebase-settings-dropdown-panel',
        attr: { role: 'listbox' },
    });
    panel.toggleClass('lorebase-floating-dropdown-panel', Boolean(config.floating));
    if (config.panelClass) panel.addClass(config.panelClass);
    panel.addEventListener('click', (event) => {
        if (config.floating) event.stopPropagation();
    });

    const positionFloatingPanel = (): void => {
        if (!config.floating || !panel.hasClass('is-open')) return;
        const ownerWindow = container.ownerDocument.defaultView ?? window;
        const viewportWidth = ownerWindow.document.documentElement.clientWidth;
        const viewportHeight = ownerWindow.document.documentElement.clientHeight;
        const buttonRect = button.getBoundingClientRect();
        const gap = 4;
        const edge = 8;
        if (buttonRect.bottom <= 0 || buttonRect.top >= viewportHeight) {
            close();
            return;
        }
        const width = Math.min(
            Math.max(buttonRect.width, config.minPanelWidth ?? 160),
            300,
            Math.max(160, viewportWidth - edge * 2)
        );

        panel.classList.add('is-measuring');
        panel.setCssStyles({
            width: `${width}px`,
            minWidth: `${width}px`,
            maxWidth: `${width}px`,
            left: `${Math.min(
                Math.max(edge, buttonRect.left),
                Math.max(edge, viewportWidth - width - edge)
            )}px`,
        });

        const spaceBelow = Math.max(0, viewportHeight - buttonRect.bottom - gap - edge);
        const spaceAbove = Math.max(0, buttonRect.top - gap - edge);
        const openAbove = spaceBelow < 180 && spaceAbove > spaceBelow;
        const availableHeight = Math.max(96, openAbove ? spaceAbove : spaceBelow);
        panel.setCssStyles({ maxHeight: `${Math.min(config.maxPanelHeight ?? 320, availableHeight)}px` });

        const panelHeight = panel.getBoundingClientRect().height;
        const top = openAbove
            ? Math.max(edge, buttonRect.top - gap - panelHeight)
            : Math.min(buttonRect.bottom + gap, viewportHeight - edge - panelHeight);
        panel.setCssStyles({ top: `${Math.max(edge, top)}px` });
        panel.classList.remove('is-measuring');
    };

    const close = (): void => {
        lifecycle.stop();
        panel.removeClass('is-open');
        button.removeClass('is-open');
        container.removeClass('is-open');
        updateAncestorOpenState(false);
        button.setAttribute('aria-expanded', 'false');
        if (config.floating && panel.parentElement !== container) {
            if (button.parentElement === container) container.appendChild(panel);
            else panel.remove();
        }
    };
    const lifecycle = createDropdownLifecycle(button, panel, close, positionFloatingPanel);
    closeByContainer.set(container, close);
    panel.addEventListener('lorebase-dropdown-close', () => close());
    const updateAncestorOpenState = (isOpen: boolean): void => {
        container
            .closest('.lorebase-editmode-anime-parts, .lorebase-editmode-anime-part-editor, .lorebase-anime-parts-row')
            ?.toggleClass('is-dropdown-open', isOpen);
    };

    const renderLabel = (): void => {
        const label = options.find((option) => option.value === currentValue)?.label ?? currentValue;
        labelEl.textContent = config.buttonLabel?.(currentValue) ?? label;
        if (config.buttonLabel) button.setAttribute('title', label);
    };

    const renderOptions = (): void => {
        panel.empty();
        let currentGroup: string | undefined;
        const visibleOptions = options.filter((option) => !option.advanced || showAdvanced);
        for (const option of visibleOptions) {
            if (option.group && option.group !== currentGroup) {
                panel.createDiv({
                    cls: 'lorebase-settings-dropdown-section-label',
                    text: option.group,
                });
            }
            currentGroup = option.group;
            const item = panel.createDiv({
                cls: 'lorebase-settings-dropdown-option',
                attr: {
                    role: 'option',
                    tabindex: '0',
                    'aria-selected': String(option.value === currentValue),
                },
            });
            item.toggleClass('is-selected', option.value === currentValue);
            item.createSpan({ cls: 'lorebase-settings-dropdown-option-label', text: option.label });
            if (option.value === currentValue) {
                const check = item.createSpan({ cls: 'lorebase-settings-dropdown-option-check' });
                setIcon(check, 'check');
            }

            const selectOption = async (): Promise<void> => {
                if (option.value === currentValue) {
                    close();
                    return;
                }
                currentValue = option.value;
                renderLabel();
                renderOptions();
                close();
                await onChange(option.value);
            };

            item.addEventListener('click', () => {
                void selectOption();
            });
            item.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                void selectOption();
            });
        }

        if (options.some((option) => option.advanced)) {
            const more = panel.createEl('button', {
                cls: 'lorebase-settings-dropdown-more',
                text: showAdvanced
                    ? (config.showLessLabel ?? 'Show less')
                    : (config.showMoreLabel ?? 'Show more'),
                attr: {
                    type: 'button',
                    'aria-expanded': String(showAdvanced),
                },
            });
            const icon = more.createSpan({ cls: 'lorebase-settings-dropdown-more-icon' });
            setIcon(icon, showAdvanced ? 'chevron-up' : 'chevron-down');
            more.prepend(icon);
            more.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                showAdvanced = !showAdvanced;
                renderOptions();
            });
        }
        if (config.action) {
            const action = panel.createEl('button', { cls: 'lorebase-settings-dropdown-more lorebase-dropdown-manage-action', attr: { type: 'button' } });
            if (config.action.icon) setIcon(action.createSpan(), config.action.icon);
            action.createSpan({ text: config.action.label });
            action.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); close(); config.action?.onClick(); });
        }
        positionFloatingPanel();
    };

    button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const isOpen = panel.hasClass('is-open');
        if (isOpen) {
            close();
            return;
        }
        ownerDocument.querySelectorAll('.is-dropdown-open').forEach((node) => {
            if (!container.contains(node)) node.removeClass('is-dropdown-open');
        });
        ownerDocument.querySelectorAll('.lorebase-settings-dropdown-panel.is-open').forEach((node) => {
            if (node !== panel) node.dispatchEvent(new Event('lorebase-dropdown-close'));
        });
        ownerDocument.querySelectorAll('.lorebase-settings-dropdown-btn.is-open').forEach((node) => {
            if (node !== button) {
                node.removeClass('is-open');
                node.setAttribute('aria-expanded', 'false');
            }
        });
        ownerDocument.querySelectorAll('.lorebase-settings-dropdown.is-open').forEach((node) => {
            if (node !== container) node.removeClass('is-open');
        });
        if (!isOpen && config.floating) {
            container.ownerDocument.body.appendChild(panel);
        }
        panel.toggleClass('is-open', !isOpen);
        button.toggleClass('is-open', !isOpen);
        container.toggleClass('is-open', !isOpen);
        updateAncestorOpenState(!isOpen);
        button.setAttribute('aria-expanded', String(!isOpen));
        if (!isOpen) positionFloatingPanel();
        lifecycle.start();
    });

    renderLabel();
    renderOptions();

    return {
        setDisabled: (disabled: boolean): void => {
            if (disabled && panel.hasClass('is-open')) close();
            button.disabled = disabled;
        },
        setValue: (nextValue: T): void => {
            currentValue = nextValue;
            renderLabel();
            renderOptions();
        },
    };
}
