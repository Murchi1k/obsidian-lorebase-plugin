import { setIcon } from 'obsidian';

export type LorebaseDropdownOption<T extends string> = {
    value: T;
    label: string;
};

export type LorebaseDropdownHandle<T extends string> = {
    setValue: (value: T) => void;
};

export function createLorebaseDropdown<T extends string>(
    container: HTMLElement,
    options: LorebaseDropdownOption<T>[],
    value: T,
    onChange: (value: T) => void | Promise<void>
): LorebaseDropdownHandle<T> {
    container.empty();
    container.addClass('lorebase-settings-dropdown');
    let currentValue = value;

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

    const close = (): void => {
        panel.removeClass('is-open');
        button.removeClass('is-open');
        container.removeClass('is-open');
        updateAncestorOpenState(false);
        button.setAttribute('aria-expanded', 'false');
    };
    const updateAncestorOpenState = (isOpen: boolean): void => {
        container
            .closest('.lorebase-editmode-anime-parts, .lorebase-editmode-anime-part-editor, .lorebase-anime-parts-row')
            ?.toggleClass('is-dropdown-open', isOpen);
    };

    const renderLabel = (): void => {
        labelEl.textContent = options.find((option) => option.value === currentValue)?.label ?? currentValue;
    };

    const renderOptions = (): void => {
        panel.empty();
        for (const option of options) {
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
    };

    button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const isOpen = panel.hasClass('is-open');
        activeDocument.querySelectorAll('.is-dropdown-open').forEach((node) => {
            if (!container.contains(node)) node.removeClass('is-dropdown-open');
        });
        activeDocument.querySelectorAll('.lorebase-settings-dropdown-panel.is-open').forEach((node) => {
            if (node !== panel) node.removeClass('is-open');
        });
        activeDocument.querySelectorAll('.lorebase-settings-dropdown-btn.is-open').forEach((node) => {
            if (node !== button) {
                node.removeClass('is-open');
                node.setAttribute('aria-expanded', 'false');
            }
        });
        activeDocument.querySelectorAll('.lorebase-settings-dropdown.is-open').forEach((node) => {
            if (node !== container) node.removeClass('is-open');
        });
        panel.toggleClass('is-open', !isOpen);
        button.toggleClass('is-open', !isOpen);
        container.toggleClass('is-open', !isOpen);
        updateAncestorOpenState(!isOpen);
        button.setAttribute('aria-expanded', String(!isOpen));
    });

    const onDocumentClick = (event: MouseEvent): void => {
        if (!container.isConnected) {
            activeDocument.removeEventListener('click', onDocumentClick);
            activeDocument.removeEventListener('keydown', onKeydown);
            return;
        }
        if (!container.contains(event.target as Node)) close();
    };
    const onKeydown = (event: KeyboardEvent): void => {
        if (!container.isConnected) {
            activeDocument.removeEventListener('click', onDocumentClick);
            activeDocument.removeEventListener('keydown', onKeydown);
            return;
        }
        if (event.key === 'Escape') close();
    };

    activeDocument.addEventListener('click', onDocumentClick);
    activeDocument.addEventListener('keydown', onKeydown);

    renderLabel();
    renderOptions();

    return {
        setValue: (nextValue: T): void => {
            currentValue = nextValue;
            renderLabel();
            renderOptions();
        },
    };
}
