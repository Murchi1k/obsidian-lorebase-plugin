import { setIcon, setTooltip } from 'obsidian';
import { i18n } from '../localization';

/** Shared column labels for country badges and media type badges. */
export function createWorkTypeEditorList(root: HTMLElement, country: boolean, hint: string): HTMLElement {
    const copy = {
        ru: { color: 'Цвет', name: 'Название', country: 'Страна', code: 'Код', count: 'Карточки', help: 'Как настроить бейджи' },
        uk: { color: 'Колір', name: 'Назва', country: 'Країна', code: 'Код', count: 'Картки', help: 'Як налаштувати бейджі' },
        en: { color: 'Color', name: 'Name', country: 'Country', code: 'Code', count: 'Cards', help: 'Customize badges' },
        'zh-CN': { color: '颜色', name: '名称', country: '国家', code: '代码', count: '卡片', help: '自定义徽章' },
    }[i18n.getLanguage()];
    root.addClass('lorebase-catalog-editor');
    root.toggleClass('is-country-catalog', country);
    const header = root.createDiv({ cls: 'lorebase-catalog-heading' });
    const color = header.createSpan({ cls: 'lorebase-catalog-color-heading', attr: { 'aria-label': copy.color, title: copy.color } });
    setIcon(color, 'palette');
    const name = header.createDiv({ cls: 'lorebase-catalog-name-heading' });
    name.createSpan({ text: country ? copy.country : copy.name });
    setIcon(name.createSpan({ attr: { 'aria-hidden': 'true' } }), 'pencil');
    header.createSpan({ cls: 'lorebase-catalog-meta-heading', text: country ? copy.code : copy.count });
    const help = header.createEl('button', { cls: 'lorebase-catalog-help', attr: { type: 'button', 'aria-label': copy.help } });
    setIcon(help, 'circle-help');
    setTooltip(help, hint);
    return root.createDiv({ cls: 'lorebase-work-types-list' });
}
