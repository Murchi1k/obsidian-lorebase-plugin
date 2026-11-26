import { setIcon } from 'obsidian';
import { i18n } from '../../localization';

export function renderProviderLegend(root: HTMLElement): void {
    const language = i18n.getLanguage();
    const copy = language === 'ru' ? { title: 'Состояние провайдеров', enabled: 'Включён и настроен', disabled: 'Выключен', unconfigured: 'Требуется настройка', note: 'AniList и Shikimori настраиваются отдельно для аниме и манги.' }
        : language === 'uk' ? { title: 'Стан провайдерів', enabled: 'Увімкнено й налаштовано', disabled: 'Вимкнено', unconfigured: 'Потрібне налаштування', note: 'AniList і Shikimori налаштовуються окремо для аніме та манґи.' }
        : language === 'zh-CN' ? { title: '来源状态', enabled: '已启用并配置', disabled: '已停用', unconfigured: '需要配置', note: '动漫和漫画分别配置 AniList 和 Shikimori。' }
        : { title: 'Provider status', enabled: 'Enabled and configured', disabled: 'Disabled', unconfigured: 'Setup required', note: 'AniList and Shikimori are configured separately for anime and manga.' };
    const heading = root.querySelector<HTMLElement>('.lorebase-settings-group-title');
    if (!heading) return;
    heading.addClass('lorebase-provider-heading');
    const labelId = `lorebase-provider-help-label-${Math.random().toString(36).slice(2)}`;
    heading.createSpan({ cls: 'lorebase-visually-hidden', text: copy.title, attr: { id: labelId } });
    const button = heading.createEl('button', { cls: 'lorebase-provider-legend', attr: { type: 'button', 'aria-labelledby': labelId } });
    setIcon(button, 'circle-help');
    let tooltip: HTMLElement | null = null;
    const hide = (): void => { tooltip?.remove(); tooltip = null; button.removeAttribute('aria-describedby'); };
    const show = (): void => {
        if (tooltip) return;
        tooltip = root.ownerDocument.body.createDiv({ cls: 'lorebase-provider-help-tooltip', attr: { role: 'tooltip', id: `lorebase-provider-help-${Math.random().toString(36).slice(2)}` } });
        for (const state of ['enabled', 'disabled', 'unconfigured'] as const) {
            const row = tooltip.createDiv({ cls: 'lorebase-provider-help-row' });
            row.createSpan({ cls: `lorebase-provider-help-dot is-${state}`, attr: { 'aria-hidden': 'true' } });
            row.createSpan({ text: `— ${copy[state]}` });
        }
        tooltip.createDiv({ cls: 'lorebase-provider-help-note', text: copy.note });
        button.setAttribute('aria-describedby', tooltip.id);
        const rect = button.getBoundingClientRect();
        const doc = root.ownerDocument.documentElement;
        const width = Math.min(280, Math.max(160, doc.clientWidth - 24));
        tooltip.style.width = `${width}px`;
        tooltip.style.left = `${Math.max(12, Math.min(rect.left, doc.clientWidth - width - 12))}px`;
        const height = tooltip.getBoundingClientRect().height;
        tooltip.style.top = `${Math.max(12, rect.bottom + height + 20 < doc.clientHeight ? rect.bottom + 8 : rect.top - height - 8)}px`;
    };
    button.addEventListener('mouseenter', show);
    button.addEventListener('mouseleave', hide);
    button.addEventListener('focus', show);
    button.addEventListener('blur', hide);
    button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); show(); });
    button.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); hide(); } });
}
