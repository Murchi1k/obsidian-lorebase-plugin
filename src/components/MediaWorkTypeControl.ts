import { i18n, t } from '../localization';
import { compactGameText } from '../localization/compactGameEditor';
import { createLorebaseDropdown } from './LorebaseDropdown';
import { getManageWorkTypesLabel } from '../utils/mangaWorkType';
import { normalizeMediaWorkType, countryFieldLabel, countryOptions, getMediaWorkTypeOptions, getMediaWorkTypeColor, type WorkTypeMedia } from '../utils/mediaWorkType';

function classificationControl(root: HTMLElement, label: string, name: string): HTMLElement {
    const existing = root.querySelector<HTMLElement>(`.lorebase-classification-panel [data-field="${name}"]`);
    if (existing) return existing;
    const column = root.querySelector<HTMLElement>('.lorebase-editmode-column-left') ?? root;
    const panel = column.createDiv({ cls: 'lorebase-editmode-panel lorebase-editmode-panel-glass lorebase-classification-panel' });
    panel.dataset.mobilePane = 'general';
    column.firstElementChild?.after(panel);
    const field = panel.createDiv({ cls: 'lorebase-editmode-field lorebase-classification-field' });
    field.createSpan({ cls: 'lorebase-editmode-field-label', text: label });
    const control = field.createDiv({ cls: 'lorebase-editmode-dropdown', attr: { 'data-field': name } });
    return control;
}
export function renderWorkTypeControl(root: HTMLElement, type: WorkTypeMedia, value: string, onChange: (value: string) => void, onManage?: (onChanged: () => void) => void): void {
    const control = classificationControl(root, t('templateFieldWorkType'), 'work-type');
    const render = (): void => {
        if (!root.isConnected) return;
        value = normalizeMediaWorkType(type, value);
        const badge = control.closest('.lorebase-game-cover-type');
        const updateBadgeColor = (): void => {
            control.style.setProperty('--lorebase-type-color', getMediaWorkTypeColor(type, value));
        };
        createLorebaseDropdown(control, getMediaWorkTypeOptions(type, i18n.getLanguage(), [value]), value, next => {
            value = next;
            if (badge) updateBadgeColor();
            onChange(next);
        }, { floating: true, action: onManage ? { label: getManageWorkTypesLabel(i18n.getLanguage()), icon: 'settings-2', onClick: () => onManage(() => { onChange(normalizeMediaWorkType(type, value)); render(); }) } : undefined });
        if (badge) {
            const button = control.querySelector('button');
            button?.classList.add('lorebase-card-work-type');
            button?.setAttribute('title', type === 'game' ? compactGameText('chooseGameType') : t('templateFieldWorkType'));
            updateBadgeColor();
        }
    };
    render();
}
export function renderAnimeOriginControl(root: HTMLElement, value: string, onChange: (value: string) => void, adult: boolean, onAdult: (value: boolean) => void): void {
    const control = classificationControl(root, countryFieldLabel(i18n.getLanguage()), 'country');
    createLorebaseDropdown(control, [{ value: '', label: t('commonNoData') }, ...countryOptions(i18n.getLanguage(), [value])], value, onChange, { floating: true });
    if (control.closest('.lorebase-anime-cover-country')) control.querySelector('button')?.classList.add('lorebase-card-work-type');
    if (root.querySelector('.lorebase-editmode-quick-settings [data-toggle="adult"]')) return;
    const toggles = root.querySelector<HTMLElement>('.lorebase-editmode-quick-settings .lorebase-editmode-toggle-list') ?? control.parentElement!;
    const row = toggles.createDiv({ cls: 'lorebase-editmode-switch-row' });
    row.createSpan({ cls: 'lorebase-editmode-switch-label', text: t('filterAdult') });
    const button = row.createEl('button', { cls: 'lorebase-editmode-switch', attr: { type: 'button', 'aria-label': t('filterAdult'), 'aria-pressed': String(adult) } });
    button.createSpan({ cls: 'lorebase-editmode-switch-thumb' });
    button.toggleClass('is-active', adult);
    button.addEventListener('click', () => { adult = !adult; button.toggleClass('is-active', adult); button.setAttribute('aria-pressed', String(adult)); onAdult(adult); });
}
