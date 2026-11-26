import { configureMediaWorkTypes, WORK_TYPE_DEFAULTS, getMediaWorkTypeCatalog, getMediaWorkTypeColor, getMediaWorkTypeLabel, type WorkTypeMedia } from '../utils/mediaWorkType';
import { Menu, Notice, setIcon } from 'obsidian';
import { i18n, t } from '../localization';
import type { LorebasePluginInterface, MediaItem, MediaWorkTypeCatalog } from '../types';
import { getMangaWorkTypeCatalog, replaceWorkTypeInView } from '../utils/mangaWorkType';
import { createLorebaseDropdown } from './LorebaseDropdown';
import { createWorkTypeEditorList } from './WorkTypeEditorLayout';

export class MangaWorkTypesEditor {
    private catalog: MediaWorkTypeCatalog = getMangaWorkTypeCatalog();
    private items: MediaItem[] = [];
    private busy = false;
    private alive = true;
    private copy = i18n.getLanguage() === 'ru' ? { title: 'Типы манги', hint: 'Общий список для карточек и фильтров. Переименование сохраняет связь с существующими карточками.', add: 'Добавить тип', placeholder: 'Название нового типа', duplicate: 'Такой тип уже существует.', required: 'Введите название типа.', remove: 'Удалить тип', replace: 'Перенести карточки в', confirm: 'Перенести и удалить', last: 'Оставьте хотя бы один тип.', used: 'Карточек с этим типом:', error: 'Не удалось сохранить изменения. Попробуйте ещё раз.', up: 'Выше', down: 'Ниже' }
        : i18n.getLanguage() === 'uk' ? { title: 'Типи манґи', hint: 'Спільний список для карток і фільтрів. Перейменування зберігає зв’язок з наявними картками.', add: 'Додати тип', placeholder: 'Назва нового типу', duplicate: 'Такий тип уже існує.', required: 'Введіть назву типу.', remove: 'Видалити тип', replace: 'Перенести картки до', confirm: 'Перенести й видалити', last: 'Залиште хоча б один тип.', used: 'Карток із цим типом:', error: 'Не вдалося зберегти зміни. Спробуйте ще раз.', up: 'Вище', down: 'Нижче' }
        : { title: 'Manga types', hint: 'Shared by cards and filters. Renaming preserves existing card assignments.', add: 'Add type', placeholder: 'New type name', duplicate: 'This type already exists.', required: 'Enter a type name.', remove: 'Delete type', replace: 'Move cards to', confirm: 'Move and delete', last: 'Keep at least one type.', used: 'Cards using this type:', error: 'Could not save changes. Please retry.', up: 'Move up', down: 'Move down' };
    constructor(private contentEl: HTMLElement, private plugin: LorebasePluginInterface, private onChanged?: () => void, private mediaType: WorkTypeMedia = 'manga') {
        contentEl.addClass('lorebase-work-types-editor');
        contentEl.setText(t('notifyLoading'));
        void this.load();
    }
    private librarySettings() { return this.plugin.settings[this.mediaType === 'game' ? 'games' : this.mediaType === 'movie' ? 'movies' : this.mediaType]; }
    private getService() { return this.mediaType === 'game' ? this.plugin.getGameService() : this.mediaType === 'movie' ? this.plugin.getMovieService() : this.mediaType === 'series' ? this.plugin.getSeriesService() : this.plugin.getMangaService(); }
    destroy(): void { this.alive = false; }
    private async load(): Promise<void> {
        try {
            const service = this.getService();
            if (!service) throw new Error('Media service unavailable');
            service.invalidateCache();
            this.items = (await ('loadGames' in service ? service.loadGames() : service.loadItems())).filter((item: MediaItem) => item.type === this.mediaType);
            this.catalog = getMediaWorkTypeCatalog(this.mediaType, this.items.map(item => item.workType || ''));
            if (this.alive && this.contentEl.isConnected) this.render();
        } catch { if (this.alive && this.contentEl.isConnected) this.contentEl.setText(this.copy.error); }
    }
    private label(value: string): string { return this.catalog.types.find(type => type.value === value)?.label || getMediaWorkTypeLabel(this.mediaType, value, i18n.getLanguage()); }
    private duplicate(label: string, except?: string): boolean {
        return this.catalog.types.some(type => type.value !== except && (this.label(type.value).toLocaleLowerCase() === label.toLocaleLowerCase() || type.value.toLocaleLowerCase() === label.toLocaleLowerCase()));
    }
    private async mutate(action: () => Promise<void> | void): Promise<void> {
        if (this.busy || !this.alive || !this.contentEl.isConnected) return;
        this.busy = true;
        const previous = structuredClone(this.catalog);
        this.contentEl.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input').forEach(control => control.disabled = true);
        try {
            await action();
            this.plugin.settings.mediaWorkTypes ??= {};
            this.plugin.settings.mediaWorkTypes[this.mediaType] = structuredClone(this.catalog);
            configureMediaWorkTypes(this.plugin.settings.mediaWorkTypes);
            await this.plugin.saveSettings();
            this.onChanged?.();
            this.plugin.refreshViews();
        } catch {
            this.catalog = previous;
            this.plugin.settings.mediaWorkTypes ??= {};
            this.plugin.settings.mediaWorkTypes[this.mediaType] = structuredClone(previous);
            configureMediaWorkTypes(this.plugin.settings.mediaWorkTypes);
            this.onChanged?.();
            this.plugin.refreshViews();
            new Notice(this.copy.error);
        }
        finally { this.busy = false; if (this.alive && this.contentEl.isConnected) this.render(); }
    }
    private iconButton(parent: HTMLElement, icon: string, label: string, action: () => void): HTMLButtonElement {
        const button = parent.createEl('button', { attr: { type: 'button', title: label, 'aria-label': label } });
        setIcon(button, icon); button.addEventListener('click', action); return button;
    }
    private render(): void {
        this.contentEl.empty();
        const language = i18n.getLanguage();
        const list = createWorkTypeEditorList(this.contentEl, false, this.copy.hint);
        this.catalog.types.forEach((type, index) => {
            const row = list.createDiv({ cls: 'lorebase-work-type-row' });
            const colorLabel = ({ ru: 'Цвет', uk: 'Колір', en: 'Color', 'zh-CN': '颜色' })[language];
            const swatch = row.createEl('label', { cls: 'lorebase-work-type-color-control' });
            const color = swatch.createEl('input', { cls: 'lorebase-work-type-color', type: 'color', attr: { title: `${colorLabel}: ${this.label(type.value)}`, 'aria-label': `${colorLabel}: ${this.label(type.value)}` } });
            color.value = getMediaWorkTypeColor(this.mediaType, type.value);
            swatch.style.backgroundColor = color.value;
            color.addEventListener('input', () => { swatch.style.backgroundColor = color.value; });
            color.addEventListener('change', () => { void this.mutate(() => { type.color = color.value; }); });
            const name = row.createEl('input', { type: 'text', attr: { 'aria-label': this.label(type.value) } });
            name.value = this.label(type.value);
            name.addEventListener('change', () => {
                const label = name.value.trim();
                if (!label || this.duplicate(label, type.value)) { new Notice(label ? this.copy.duplicate : this.copy.required); name.value = this.label(type.value); return; }
                if (label !== this.label(type.value)) void this.mutate(() => { type.label = label; });
            });
            name.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); name.blur(); } });
            const count = this.items.filter(item => item.workType === type.value).length;
            row.createSpan({ cls: count > 0 ? 'lorebase-work-type-count has-items' : 'lorebase-work-type-count', text: String(count), attr: { title: this.copy.used + ' ' + count } });
            const more = this.iconButton(row, 'ellipsis', t('editMore'), () => {
                const menu = new Menu();
                menu.addItem(item => item.setTitle(this.copy.up).setIcon('arrow-up').setDisabled(index === 0).onClick(() => { void this.mutate(() => { [this.catalog.types[index - 1], this.catalog.types[index]] = [type, this.catalog.types[index - 1]]; }); }));
                menu.addItem(item => item.setTitle(this.copy.down).setIcon('arrow-down').setDisabled(index === this.catalog.types.length - 1).onClick(() => { void this.mutate(() => { [this.catalog.types[index + 1], this.catalog.types[index]] = [type, this.catalog.types[index + 1]]; }); }));
                menu.addSeparator();
                menu.addItem(item => item.setTitle(({ ru: 'Сбросить цвет', uk: 'Скинути колір', en: 'Reset color', 'zh-CN': '重置颜色' })[language]).setIcon('rotate-ccw').setDisabled(!type.color).onClick(() => { void this.mutate(() => { delete type.color; }); }));
                menu.addItem(item => item.setTitle(this.copy.remove).setIcon('trash-2').onClick(() => this.requestDelete(type.value, row)));
                const rect = more.getBoundingClientRect();
                menu.showAtPosition({ x: rect.right, y: rect.bottom });
            });
            more.addClass('lorebase-work-type-more');
        });
        const addRow = this.contentEl.createDiv({ cls: 'lorebase-work-types-add' });
        const name = addRow.createEl('input', { type: 'text', attr: { placeholder: this.copy.placeholder, 'aria-label': this.copy.placeholder } });
        const submit = (): void => {
            const label = name.value.trim();
            const value = WORK_TYPE_DEFAULTS[this.mediaType].find(type => type.toLowerCase() === label.toLowerCase()) || label;
            if (!label || this.duplicate(label) || this.duplicate(value)) { new Notice(label ? this.copy.duplicate : this.copy.required); return; }
            void this.mutate(() => { delete this.catalog.redirects[value]; this.catalog.types.push({ value, label }); });
        };
        const addButton = this.iconButton(addRow, 'plus', this.copy.add, submit);
        addButton.addClass('lorebase-catalog-add-button');
        addButton.createSpan({ text: this.copy.add });
        name.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); submit(); } });
    }
    private requestDelete(value: string, row: HTMLElement): void {
        if (this.catalog.types.length === 1) { new Notice(this.copy.last); return; }
        const used = this.items.filter(item => item.workType === value);
        // A replacement also keeps future imports and saved filters valid.
        const remaining = this.catalog.types.filter(type => type.value !== value);
        this.contentEl.querySelectorAll('.lorebase-work-type-delete').forEach(node => node.remove());
        const box = this.contentEl.createDiv({ cls: 'lorebase-work-type-delete' });
        row.after(box);
        box.createDiv({ text: `${this.label(value)} · ${this.copy.used} ${used.length}` });
        box.createDiv({ cls: 'lorebase-work-types-hint', text: this.copy.replace });
        let replacement = remaining[0].value;
        createLorebaseDropdown(box.createDiv(), remaining.map(type => ({ value: type.value, label: this.label(type.value) })), replacement, next => { replacement = next; }, { floating: true });
        const controls = box.createDiv({ cls: 'lorebase-work-types-add' });
        controls.createEl('button', { text: t('commonCancel'), attr: { type: 'button' } }).addEventListener('click', () => box.remove());
        controls.createEl('button', { text: used.length ? this.copy.confirm : this.copy.remove, attr: { type: 'button' } }).addEventListener('click', () => {
            void this.mutate(async () => {
                const service = this.getService();
                if (!service) throw new Error('Manga service unavailable');
                for (const item of used) { if (item.type === 'game') await this.plugin.getGameService()?.updateGame(item, { workType: replacement });
                    else if (item.type === 'movie' || item.type === 'series') await (item.type === 'movie' ? this.plugin.getMovieService() : this.plugin.getSeriesService())?.updateItem(item, { workType: replacement });
                    else if (item.type === 'manga') await this.plugin.getMangaService()?.updateItem(item, { workType: replacement }); item.workType = replacement; }
                this.catalog.types = remaining;
                for (const [from, to] of Object.entries(this.catalog.redirects)) if (to === value) this.catalog.redirects[from] = replacement;
                Object.defineProperty(this.catalog.redirects, value, { value: replacement, enumerable: true, writable: true, configurable: true });
                replaceWorkTypeInView(this.librarySettings().viewState, value, replacement);
                this.librarySettings().savedViews.forEach(view => replaceWorkTypeInView(view.state, value, replacement));
            });
        });
        box.scrollIntoView({ block: 'nearest' });
    }
}
