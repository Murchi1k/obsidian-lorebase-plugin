import { setIcon } from 'obsidian';
import type { Language } from '../types';
import { getReleaseCopy } from './copy';

export function renderReleaseLauncher(container: HTMLElement, language: Language, version: string, open: () => void): void {
    const label = getReleaseCopy(language).title;
    const button = container.createEl('button', { cls: 'lorebase-release-launcher', attr: { type: 'button', 'aria-label': `${label} · ${version}` } });
    setIcon(button.createSpan({ cls: 'lorebase-release-launcher-icon', attr: { 'aria-hidden': 'true' } }), 'sparkles');
    button.createSpan({ text: label });
    button.createSpan({ cls: 'lorebase-release-launcher-version', text: version });
    button.addEventListener('click', open);
}
