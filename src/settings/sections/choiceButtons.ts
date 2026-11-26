import { setIcon } from 'obsidian';

export function renderChoiceButtons<T extends string>(
    container: HTMLElement,
    label: string,
    options: readonly { value: T; label: string; icon?: string; badge?: string; badgeShort?: string }[],
    initial: T,
    onChange: (value: T) => void
): void {
    const group = container.createDiv({
        cls: 'lorebase-settings-choices',
        attr: { role: 'group', 'aria-label': label },
    });
    let selected = initial;
    const buttons = options.map(option => {
        const button = group.createEl('button', {
            attr: { type: 'button', 'aria-pressed': String(option.value === selected) },
        });
        if (option.icon) setIcon(button.createSpan({ attr: { 'aria-hidden': 'true' } }), option.icon);
        button.createSpan({ text: option.label });
        if (option.badge) {
            const badge = button.createSpan({ cls: 'lorebase-settings-choice-badge', attr: { 'aria-label': option.badge, title: option.badge } });
            if (option.badgeShort) {
                badge.createSpan({ text: option.badgeShort, attr: { 'data-badge-short': '', 'aria-hidden': 'true' } });
                badge.createSpan({ text: option.badge, attr: { 'data-badge-full': '', 'aria-hidden': 'true' } });
            } else badge.setText(option.badge);
        }
        button.addEventListener('click', () => {
            if (selected === option.value) return;
            selected = option.value;
            for (const [value, control] of buttons) {
                control.setAttribute('aria-pressed', String(value === selected));
            }
            onChange(selected);
        });
        return [option.value, button] as const;
    });
}
