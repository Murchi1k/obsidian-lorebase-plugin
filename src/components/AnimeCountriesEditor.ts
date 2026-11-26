import { Menu, Notice, setIcon } from 'obsidian';
import { i18n, t } from '../localization';
import type { LorebasePluginInterface, MediaWorkTypeCatalog } from '../types';
import { configureMediaWorkTypes, countryLabel, getAnimeCountryCatalog, getMediaWorkTypeColor, normalizeCountry } from '../utils/mediaWorkType';
import { createWorkTypeEditorList } from './WorkTypeEditorLayout';

/** Country codes stay unchanged in notes when their display names or colors change. */
export class AnimeCountriesEditor {
    private catalog: MediaWorkTypeCatalog = getAnimeCountryCatalog();
    private busy = false;
    private copy = {
        ru: { hint: 'Названия и цвета используются в карточках, поиске и фильтрах. Код страны в заметках сохраняется.', code: 'Код страны, например DE', color: 'Цвет', reset: 'Сбросить цвет', name: 'Сбросить название', invalid: 'Введите код существующей страны из двух букв, например DE.', duplicate: 'Эта страна уже есть в списке.', error: 'Не удалось сохранить изменения.', up: 'Выше', down: 'Ниже', add: 'Добавить страну' },
        uk: { hint: 'Назви й кольори використовуються в картках, пошуку та фільтрах. Код країни в нотатках зберігається.', code: 'Код країни, наприклад DE', color: 'Колір', reset: 'Скинути колір', name: 'Скинути назву', invalid: 'Введіть код наявної країни з двох літер, наприклад DE.', duplicate: 'Ця країна вже є у списку.', error: 'Не вдалося зберегти зміни.', up: 'Вище', down: 'Нижче', add: 'Додати країну' },
        en: { hint: 'Names and colors are shared by cards, search and filters. Country codes in notes stay unchanged.', code: 'Country code, e.g. DE', color: 'Color', reset: 'Reset color', name: 'Reset name', invalid: 'Enter a valid two-letter country code, e.g. DE.', duplicate: 'This country is already listed.', error: 'Could not save changes.', up: 'Move up', down: 'Move down', add: 'Add country' },
        'zh-CN': { hint: '名称和颜色用于卡片、搜索和筛选，笔记中的国家代码保持不变。', code: '国家代码，例如 DE', color: '颜色', reset: '重置颜色', name: '重置名称', invalid: '请输入有效的两字母国家代码，例如 DE。', duplicate: '该国家已在列表中。', error: '无法保存更改。', up: '上移', down: '下移', add: '添加国家' },
    }[i18n.getLanguage()];

    constructor(private root: HTMLElement, private plugin: LorebasePluginInterface, private onChanged?: () => void) {
        root.addClass('lorebase-work-types-editor');
        this.render();
        void this.load();
    }
    private async load(): Promise<void> {
        try {
            const items = await this.plugin.getAnimeService()?.loadAnime() ?? [];
            if (!this.root.isConnected || this.busy) return;
            this.catalog = getAnimeCountryCatalog(items.map(item => item.countryOfOrigin ?? ''));
            this.render();
        } catch { /* The settings remain usable if library loading fails. */ }
    }
    private async mutate(action: () => void): Promise<void> {
        if (this.busy || !this.root.isConnected) return;
        this.busy = true;
        const previous = structuredClone(this.catalog);
        this.root.querySelectorAll<HTMLButtonElement | HTMLInputElement>('input, button').forEach(control => control.disabled = true);
        try {
            action();
            this.plugin.settings.mediaWorkTypes ??= {};
            this.plugin.settings.mediaWorkTypes.anime = structuredClone(this.catalog);
            configureMediaWorkTypes(this.plugin.settings.mediaWorkTypes);
            await this.plugin.saveSettings();
            this.onChanged?.();
            this.plugin.refreshViews();
        } catch {
            this.catalog = previous;
            this.plugin.settings.mediaWorkTypes ??= {};
            this.plugin.settings.mediaWorkTypes.anime = structuredClone(previous);
            configureMediaWorkTypes(this.plugin.settings.mediaWorkTypes);
            this.plugin.refreshViews();
            new Notice(this.copy.error);
        } finally {
            this.busy = false;
            if (this.root.isConnected) this.render();
        }
    }
    private render(): void {
        this.root.empty();
        const list = createWorkTypeEditorList(this.root, true, this.copy.hint);
        this.catalog.types.forEach((entry, index) => {
            const label = entry.label || countryLabel(entry.value, i18n.getLanguage());
            const row = list.createDiv({ cls: 'lorebase-work-type-row' });
            const swatch = row.createEl('label', { cls: 'lorebase-work-type-color-control' });
            const color = swatch.createEl('input', { cls: 'lorebase-work-type-color', type: 'color', attr: { title: `${this.copy.color}: ${label}`, 'aria-label': `${this.copy.color}: ${label}` } });
            color.value = getMediaWorkTypeColor('anime', entry.value);
            swatch.style.backgroundColor = color.value;
            color.addEventListener('input', () => { swatch.style.backgroundColor = color.value; });
            color.addEventListener('change', () => { void this.mutate(() => { entry.color = color.value; }); });
            const name = row.createEl('input', { type: 'text', attr: { 'aria-label': label } });
            name.value = label;
            name.addEventListener('change', () => { if (name.value.trim()) void this.mutate(() => { entry.label = name.value.trim(); }); else name.value = label; });
            name.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); name.blur(); } });
            row.createSpan({ cls: 'lorebase-work-type-count', text: entry.value });
            const more = row.createEl('button', { cls: 'lorebase-work-type-more', attr: { type: 'button', title: t('editMore'), 'aria-label': t('editMore') } });
            setIcon(more, 'ellipsis');
            more.addEventListener('click', () => {
                const menu = new Menu();
                menu.addItem(item => item.setTitle(this.copy.up).setIcon('arrow-up').setDisabled(index === 0).onClick(() => { void this.mutate(() => { [this.catalog.types[index - 1], this.catalog.types[index]] = [entry, this.catalog.types[index - 1]]; }); }));
                menu.addItem(item => item.setTitle(this.copy.down).setIcon('arrow-down').setDisabled(index === this.catalog.types.length - 1).onClick(() => { void this.mutate(() => { [this.catalog.types[index + 1], this.catalog.types[index]] = [entry, this.catalog.types[index + 1]]; }); }));
                menu.addSeparator();
                menu.addItem(item => item.setTitle(this.copy.reset).setIcon('rotate-ccw').setDisabled(!entry.color).onClick(() => { void this.mutate(() => { delete entry.color; }); }));
                menu.addItem(item => item.setTitle(this.copy.name).setIcon('text-cursor-input').setDisabled(!entry.label).onClick(() => { void this.mutate(() => { delete entry.label; }); }));
                menu.addSeparator();
                menu.addItem(item => item.setTitle(({ ru: 'Удалить страну из списка', uk: 'Видалити країну зі списку', en: 'Remove country from list', 'zh-CN': '从列表中移除国家' })[i18n.getLanguage()]).setIcon('trash-2').setDisabled(this.catalog.types.length <= 1).onClick(() => { void this.removeCountry(entry.value); }));
                const rect = more.getBoundingClientRect();
                menu.showAtPosition({ x: rect.right, y: rect.bottom });
            });
        });
        const add = this.root.createDiv({ cls: 'lorebase-work-types-add' });
        const code = add.createEl('input', { type: 'text', attr: { placeholder: ({ ru: 'Код страны', uk: 'Код країни', en: 'Country code', 'zh-CN': '国家代码' })[i18n.getLanguage()], 'aria-label': this.copy.code, maxlength: '2' } });
        const submit = (): void => {
            const value = normalizeCountry(code.value);
            const region = /^[A-Z]{2}$/.test(value) ? new Intl.DisplayNames(['en'], { type: 'region' }).of(value) : '';
            if (!region || region === value || value === 'ZZ') { new Notice(this.copy.invalid); return; }
            if (this.catalog.types.some(entry => entry.value === value)) { new Notice(this.copy.duplicate); return; }
            void this.mutate(() => { this.catalog.hidden = (this.catalog.hidden ?? []).filter(code => code !== value); this.catalog.types.push({ value }); });
        };
        const button = add.createEl('button', { attr: { type: 'button', title: this.copy.add, 'aria-label': this.copy.add } });
        button.addClass('lorebase-catalog-add-button');
        setIcon(button, 'plus');
        button.createSpan({ text: this.copy.add });
        button.addEventListener('click', submit);
        code.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); submit(); } });
    }
    private async removeCountry(value: string): Promise<void> {
        if (this.catalog.types.length <= 1) return;
        await this.mutate(() => {
            this.catalog.types = this.catalog.types.filter(entry => entry.value !== value);
            this.catalog.hidden = [...new Set([...(this.catalog.hidden ?? []), value])];
        });
    }
}
