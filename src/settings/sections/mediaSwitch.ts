export function renderMediaSwitch(
    container: HTMLElement, label: string, initial: boolean, onChange: (value: boolean) => boolean
): void {
    let checked = initial;
    const control = container.createEl('button', {
        cls: 'lorebase-media-switch',
        attr: { type: 'button', role: 'switch', 'aria-label': label, 'aria-checked': String(checked) },
    });
    control.createSpan({ attr: { 'aria-hidden': 'true' } });
    control.addEventListener('click', () => {
        const next = !checked;
        if (!onChange(next)) return;
        checked = next;
        control.setAttribute('aria-checked', String(checked));
    });
}
