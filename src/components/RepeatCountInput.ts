import { setIcon } from 'obsidian';
import { normalizeRepeatCount } from '../utils/repeatTracking';

/** A compact, keyboard-accessible counter shared by all completion types. */
export function renderRepeatCountInput(container: HTMLElement, value: number, label: string, hint: string, onChange: (value: number) => void): void {
    const pill = container.createEl('label', { cls: 'lorebase-repeat-pill', attr: { title: `${label}. ${hint}` } });
    setIcon(pill.createSpan({ cls: 'lorebase-repeat-pill-icon', attr: { 'aria-hidden': 'true' } }), 'repeat-2');
    const input = pill.createEl('input', { cls: 'lorebase-repeat-pill-input', attr: { type: 'number', min: '0', step: '1', inputmode: 'numeric', 'aria-label': label } });
    const resize = (): void => { input.style.width = `${Math.max(2, Math.min(8, input.value.length))}ch`; };
    input.value = String(normalizeRepeatCount(value));
    resize();
    let previous = value;
    input.addEventListener('focus', () => { previous = normalizeRepeatCount(input.value); input.select(); });
    input.addEventListener('input', () => { onChange(normalizeRepeatCount(input.value)); resize(); });
    input.addEventListener('blur', () => {
        input.value = String(normalizeRepeatCount(input.value));
        onChange(normalizeRepeatCount(input.value));
        resize();
    });
    input.addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); input.blur(); }
        if (event.key === 'Escape') {
            event.preventDefault(); event.stopPropagation();
            input.value = String(previous); input.blur();
        }
    });
}
