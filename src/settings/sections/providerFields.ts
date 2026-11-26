import { setIcon } from 'obsidian';
import { i18n } from '../../localization';

export function providerApiKeyLabel(): string {
    return { en: 'API key', ru: 'API-ключ', uk: 'Ключ API', 'zh-CN': 'API 密钥' }[i18n.getLanguage()];
}

export function createProviderCredential(
    container: HTMLElement, title: string, placeholder: string, value: string, onChange: (value: string) => void
): void {
    const label = container.createEl('label', { cls: 'lorebase-provider-credential' });
    label.createSpan({ cls: 'lorebase-provider-field-label', text: title });
    const control = label.createSpan({ cls: 'lorebase-provider-credential-control' });
    setIcon(control.createSpan({ attr: { 'aria-hidden': 'true' } }), 'key-round');
    const input = control.createEl('input', {
        attr: { type: 'password', autocomplete: 'off', placeholder, spellcheck: 'false', 'aria-label': title },
    });
    input.value = value;
    input.addEventListener('input', () => onChange(input.value.trim()));
}

export function createProviderKeyHelp(container: HTMLElement): HTMLElement {
    const details = container.createEl('details', { cls: 'lorebase-provider-key-help' });
    const summary = details.createEl('summary');
    setIcon(summary.createSpan({ attr: { 'aria-hidden': 'true' } }), 'circle-help');
    summary.createSpan({ text: {
        en: 'Where to get a key', ru: 'Где взять ключ',
        uk: 'Де отримати ключ', 'zh-CN': '如何获取密钥',
    }[i18n.getLanguage()] });
    setIcon(summary.createSpan({ cls: 'lorebase-provider-key-chevron', attr: { 'aria-hidden': 'true' } }), 'chevron-down');
    return details.createDiv({ cls: 'lorebase-provider-help' });
}

export function createProviderLanguagePanel(
    container: HTMLElement, cssClass: string, title: string, description: string
): HTMLElement {
    const panel = container.createDiv({ cls: 'lorebase-provider-language-panel ' + cssClass });
    const help = panel.createEl('details', { cls: 'lorebase-provider-language-help' });
    const heading = help.createEl('summary', { cls: 'lorebase-provider-language-title' });
    setIcon(heading.createSpan({ attr: { 'aria-hidden': 'true' } }), 'languages');
    heading.createEl('strong', { text: title });
    setIcon(heading.createSpan({ cls: 'lorebase-provider-language-info', attr: { 'aria-hidden': 'true' } }), 'circle-help');
    help.createDiv({ cls: 'setting-item-description', text: description });
    return panel.createDiv({ cls: 'lorebase-provider-language-grid' });
}

export function createProviderLanguageField(container: HTMLElement, title: string, icon: string, active = false): HTMLElement {
    const field = container.createDiv({
        cls: 'lorebase-provider-language-field' + (active ? ' is-current-media' : ''),
        attr: { role: 'group', 'aria-label': title },
    });
    const heading = field.createDiv({ cls: 'lorebase-provider-field-label' });
    setIcon(heading.createSpan({ attr: { 'aria-hidden': 'true' } }), icon);
    heading.createSpan({ text: title });
    return field;
}
