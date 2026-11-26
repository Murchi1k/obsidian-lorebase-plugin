import { LucideIconPickerModal } from '../../modals/LucideIconPickerModal';
import { setIcon } from 'obsidian';
import { i18n, t } from '../../localization';
import { mt } from '../../localization/music';
import type { MediaType, MediaStatus } from '../../types';
import { getStatusAppearance, isCustomStatus, statusSettingsKey, configureStatusPresentation } from '../../statusPresentation';
import { getStatusOptionsForMediaType } from '../../views/library/viewOptions';
import { createMediaTabs } from './mediaTabs';
import type { SettingsSectionContext } from './types';

const activeTabs = new WeakMap<object, MediaType>();


export function renderStatusSettings(context: SettingsSectionContext, container: HTMLElement, updatePreview: () => void): HTMLElement {
    const settings = context.plugin.settings;
    configureStatusPresentation(settings);
    const ru = i18n.getLanguage() === 'ru';
    const uk = i18n.getLanguage() === 'uk';
    const copy = { add: ru ? 'Добавить статус' : uk ? 'Додати статус' : 'Add status',
        name: ru ? 'Новый статус' : uk ? 'Новий статус' : 'New status',
        icon: ru ? 'Выбрать иконку' : uk ? 'Обрати іконку' : 'Choose icon',
        color: ru ? 'Цвет статуса' : uk ? 'Колір статусу' : 'Status color',
        remove: ru ? 'Удалить статус' : uk ? 'Видалити статус' : 'Delete status' };
    const media = [
        { value: 'game' as const, label: t('settingsGames'), icon: 'gamepad-2' },
        { value: 'anime' as const, label: t('settingsAnime'), icon: 'sparkles' },
        { value: 'movie' as const, label: t('settingsMovies'), icon: 'clapperboard' },
        { value: 'series' as const, label: t('settingsSeries'), icon: 'tv' },
        { value: 'book' as const, label: t('settingsBooks'), icon: 'book-open' },
        { value: 'manga' as const, label: t('settingsManga'), icon: 'book-image' },
        { value: 'music' as const, label: mt('music'), icon: 'music' },
    ];
    const tabs = container.createDiv({ cls: 'lorebase-status-compact-tabs' });
    const layoutToggle = tabs.createDiv({ cls: 'lorebase-status-layout-toggle', attr: { role: 'group', 'aria-label': ru ? 'Вид списка' : uk ? 'Вигляд списку' : 'List layout' } });
    const layoutButtons = new Map<'list' | 'columns', HTMLButtonElement>();
    const applyLayout = (): void => {
        container.toggleClass('lorebase-status-two-columns', settings.statusEditorLayout === 'columns');
        layoutButtons.forEach((button, value) => button.setAttribute('aria-pressed', String((settings.statusEditorLayout || 'list') === value)));
    };
    for (const layout of ['list', 'columns'] as const) {
        const label = layout === 'list' ? (ru ? 'Одна колонка' : uk ? 'Одна колонка' : 'One column') : (ru ? 'Две колонки' : uk ? 'Дві колонки' : 'Two columns');
        const button = layoutToggle.createEl('button', { attr: { type: 'button', title: label, 'aria-label': label } });
        setIcon(button, layout === 'list' ? 'list' : 'columns-2');
        layoutButtons.set(layout, button);
        button.addEventListener('click', () => { settings.statusEditorLayout = layout; applyLayout(); void context.plugin.saveSettings(); });
    }
    applyLayout();
    const panels = new Map<MediaType, HTMLElement>();
    const persist = async (): Promise<void> => {
        configureStatusPresentation(settings);
        updatePreview();
        await context.plugin.saveSettings();
        context.plugin.refreshViews();
    };
    for (const option of media) {
        const panel = container.createDiv({ cls: 'lorebase-status-compact-panel', attr: { role: 'tabpanel' } });
        panels.set(option.value, panel);
        const header = panel.createDiv({ cls: 'lorebase-status-list-header' });
        header.createSpan({ text: ru ? 'Статусы' : uk ? 'Статуси' : 'Statuses', cls: 'lorebase-status-list-title' });
        const list = panel.createDiv({ cls: 'lorebase-status-compact-list' });
        const appearanceMap = (): Record<string, { label?: string; icon?: string; color?: string }> => {
            settings.statusCustomization ??= {};
            return settings.statusCustomization[option.value] ??= {};
        };
        const render = (): void => {
            configureStatusPresentation(settings);
            list.empty();
            for (const status of getStatusOptionsForMediaType(option.value, settings.statusLabels)) {
                const appearance = getStatusAppearance(option.value, status.status);
                const row = list.createDiv({ cls: 'lorebase-status-compact-row' });
                row.style.setProperty('--status-tile-color', appearance.color);
                const icon = row.createEl('button', { cls: 'lorebase-status-icon-picker', attr: { type: 'button', title: copy.icon, 'aria-label': copy.icon } });
                setIcon(icon, appearance.icon);
                icon.style.color = appearance.color;
                const input = row.createEl('input', { cls: 'lorebase-status-name', type: 'text', attr: { 'aria-label': status.label, placeholder: status.label } });
                input.value = status.label;
                input.addEventListener('change', () => {
                    const label = input.value.trim();
                    if (!label && isCustomStatus(status.status)) { input.value = status.label; return; }
                    const entry = appearanceMap()[status.status] ??= {};
                    if (label) entry.label = label; else delete entry.label;
                    void persist();
                });
                const colorControl = row.createEl('label', { cls: 'lorebase-status-color-control' });
                const color = colorControl.createEl('input', { cls: 'lorebase-status-color', type: 'color', attr: { title: copy.color, 'aria-label': `${copy.color}: ${status.label}` } });
                color.value = appearance.color;
                color.addEventListener('input', () => { icon.style.color = color.value; row.style.setProperty('--status-tile-color', color.value); });
                color.addEventListener('change', () => { (appearanceMap()[status.status] ??= {}).color = color.value; void persist(); });
                const action = row.createEl('button', { cls: 'lorebase-status-row-action', attr: { type: 'button', title: isCustomStatus(status.status) ? copy.remove : t('settingsStatusReset'), 'aria-label': isCustomStatus(status.status) ? copy.remove : t('settingsStatusReset') } });
                setIcon(action, isCustomStatus(status.status) ? 'trash-2' : 'rotate-ccw');
                action.addEventListener('click', () => {
                    delete appearanceMap()[status.status];
                    const labels = settings.statusLabels[statusSettingsKey(option.value)] as Partial<Record<MediaStatus, string>> | undefined;
                    if (labels) delete labels[status.status];
                    void persist(); render();
                });
                icon.addEventListener('click', () => {
                    new LucideIconPickerModal(context.app, appearance.icon, value => {
                        (appearanceMap()[status.status] ??= {}).icon = value;
                        void persist(); render();
                    }).open();
                });
            }
        };
        render();
        const add = header.createEl('button', { cls: 'lorebase-status-add', attr: { type: 'button' } });
        setIcon(add.createSpan(), 'plus'); add.createSpan({ text: copy.add });
        add.addEventListener('click', () => {
            const id = `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
            appearanceMap()[id] = { label: copy.name, icon: 'circle', color: '#8c9eff' };
            void persist(); render();
            const inputs = list.querySelectorAll<HTMLInputElement>('.lorebase-status-name');
            const input = inputs[inputs.length - 1];
            input?.focus(); input?.select();
        });
    }
    createMediaTabs(tabs, media, activeTabs.get(context.plugin) ?? 'game', t('settingsStatusMediaTabs'), value => {
        activeTabs.set(context.plugin, value);
        panels.forEach((panel, key) => panel.hidden = key !== value);
    });
    return panels.get('game')!;
}
