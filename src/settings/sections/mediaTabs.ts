import { setIcon } from 'obsidian';

export interface MediaTabOption<T extends string> {
    value: T;
    label: string;
    icon: string;
}

export interface MediaTabsHandle<T extends string> {
    getValue: () => T;
    setValue: (value: T, focus?: boolean) => void;
}

export function createMediaTabs<T extends string>(
    container: HTMLElement,
    options: MediaTabOption<T>[],
    initialValue: T,
    ariaLabel: string,
    onChange: (value: T) => void
): MediaTabsHandle<T> {
    const tabList = container.createDiv({
        cls: 'lorebase-media-tabs',
        attr: {
            role: 'tablist',
            'aria-label': ariaLabel,
        },
    });
    const buttons = new Map<T, HTMLButtonElement>();
    let currentValue = options.some((option) => option.value === initialValue)
        ? initialValue
        : options[0].value;

    const setValue = (value: T, focus = false): void => {
        if (!buttons.has(value)) return;
        currentValue = value;
        buttons.forEach((button, key) => {
            const selected = key === value;
            button.toggleClass('is-active', selected);
            button.setAttribute('aria-selected', String(selected));
            button.tabIndex = selected ? 0 : -1;
        });
        onChange(value);
        if (focus) buttons.get(value)?.focus();
    };

    options.forEach((option, index) => {
        const button = tabList.createEl('button', {
            cls: 'lorebase-media-tab',
            attr: {
                type: 'button',
                role: 'tab',
                'aria-selected': String(option.value === currentValue),
            },
        });
        button.tabIndex = option.value === currentValue ? 0 : -1;
        const icon = button.createSpan({ cls: 'lorebase-media-tab-icon' });
        setIcon(icon, option.icon);
        button.createSpan({ cls: 'lorebase-media-tab-label', text: option.label });
        button.addEventListener('click', () => setValue(option.value));
        button.addEventListener('keydown', (event) => {
            const currentIndex = options.findIndex((entry) => entry.value === option.value);
            let nextIndex = currentIndex;
            if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % options.length;
            else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + options.length) % options.length;
            else if (event.key === 'Home') nextIndex = 0;
            else if (event.key === 'End') nextIndex = options.length - 1;
            else return;
            event.preventDefault();
            setValue(options[nextIndex].value, true);
        });
        buttons.set(option.value, button);
    });

    setValue(currentValue);
    return {
        getValue: () => currentValue,
        setValue,
    };
}
