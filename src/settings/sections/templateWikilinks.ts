import { setIcon } from 'obsidian';
import { i18n } from '../../localization';
import type { LorebaseSettings } from '../../types';
import { getAllTemplateWikilinksState, setAllTemplateWikilinks } from '../../services/integrations/templateWikilinks';

export function renderGlobalTemplateWikilinks(
    container: HTMLElement, settings: LorebaseSettings, onChange: (enabled: boolean) => void,
): () => void {
    const copy = {
        en: ['Wikilinks for all media', 'Write supported fields as [[links]] in all seven media templates.', 'On', 'Off', 'Partly enabled'],
        ru: ['Wikilink для всех медиа', 'Записывать поддерживаемые поля как [[ссылки]] во всех семи шаблонах медиа.', 'Включено', 'Выключено', 'Частично'],
        uk: ['Wikilink для всіх медіа', 'Записувати підтримувані поля як [[посилання]] в усіх семи шаблонах медіа.', 'Увімкнено', 'Вимкнено', 'Частково'],
        'zh-CN': ['全部媒体的 Wikilink', '在全部七类媒体模板中，将支持的字段写为 [[链接]]。', '已开启', '已关闭', '部分开启'],
    }[i18n.getLanguage()];
    const card = container.createDiv({ cls: 'lorebase-template-compact lorebase-template-global-wikilinks' });
    setIcon(card.createSpan({ cls: 'lorebase-template-compact-icon', attr: { 'aria-hidden': 'true' } }), 'link');
    const text = card.createDiv();
    text.createEl('strong', { text: copy[0] });
    text.createDiv({ cls: 'setting-item-description', text: copy[1] });
    const controls = card.createDiv({ cls: 'lorebase-template-global-wikilinks-control' });
    const status = controls.createSpan({ cls: 'lorebase-template-global-wikilinks-status', attr: { 'aria-live': 'polite' } });
    const button = controls.createEl('button', {
        cls: 'lorebase-media-switch', attr: { type: 'button', role: 'switch', 'aria-label': copy[0] },
    });
    button.createSpan({ attr: { 'aria-hidden': 'true' } });
    const refresh = (): void => {
        const state = getAllTemplateWikilinksState(settings);
        card.dataset.state = state;
        status.textContent = copy[state === 'on' ? 2 : state === 'off' ? 3 : 4];
        button.setAttribute('aria-checked', String(state === 'on'));
    };
    button.addEventListener('click', () => {
        const enabled = getAllTemplateWikilinksState(settings) !== 'on';
        setAllTemplateWikilinks(settings, enabled);
        onChange(enabled);
        refresh();
    });
    refresh();
    return refresh;
}
