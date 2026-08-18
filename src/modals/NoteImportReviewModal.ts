import { App, Modal, setIcon } from 'obsidian';
import type { Language, NoteImportTargetMedia, NoteImportWriteMode } from '../types';
import type { NoteImportPreviewItem, NoteImportReviewResult } from '../services/NoteConversionService';
import type { MediaKind, MediaSourceSelection } from '../services/integrations/types';
import { sanitizeFileName } from '../services/integrations/templateUtils';

type NoteImportFilter = 'all' | 'changed' | 'warnings' | 'selected';

interface NoteImportReviewText {
    title: string;
    subtitleCopy: string;
    subtitleReplace: string;
    search: string;
    all: string;
    changed: string;
    warnings: string;
    selected: string;
    shown: string;
    total: string;
    selectAll: string;
    clear: string;
    cancel: string;
    applyCopy: string;
    applyReplace: string;
    notImportable: string;
    empty: string;
    renamed: string;
    kept: string;
    removed: string;
    source: string;
    target: string;
}

const TEXT: Record<Language, NoteImportReviewText> = {
    en: {
        title: 'Import notes into LOREBASE',
        subtitleCopy: 'Review the notes that will be copied into the selected LOREBASE folder.',
        subtitleReplace: 'Replace mode will update selected notes and move them into the LOREBASE folder.',
        search: 'Search notes...',
        all: 'All',
        changed: 'Changed',
        warnings: 'Warnings',
        selected: 'Selected',
        shown: 'shown',
        total: 'total',
        selectAll: 'Select all',
        clear: 'Clear',
        cancel: 'Cancel',
        applyCopy: 'Create copies',
        applyReplace: 'Replace and move',
        notImportable: 'Not importable',
        empty: 'No notes match the current filters.',
        renamed: 'Renamed',
        kept: 'Kept',
        removed: 'Removed',
        source: 'Source',
        target: 'Target',
    },
    ru: {
        title: 'Импорт заметок в LOREBASE',
        subtitleCopy: 'Проверьте заметки, которые будут скопированы в выбранную папку LOREBASE.',
        subtitleReplace: 'Режим замены обновит выбранные заметки и перенесет их в папку LOREBASE.',
        search: 'Поиск заметок...',
        all: 'Все',
        changed: 'Измененные',
        warnings: 'Предупреждения',
        selected: 'Выбрано',
        shown: 'показано',
        total: 'всего',
        selectAll: 'Выбрать все',
        clear: 'Очистить',
        cancel: 'Отмена',
        applyCopy: 'Создать копии',
        applyReplace: 'Заменить и перенести',
        notImportable: 'Нельзя импортировать',
        empty: 'Нет заметок под текущие фильтры.',
        renamed: 'Переименовано',
        kept: 'Сохранено',
        removed: 'Удалено',
        source: 'Источник',
        target: 'Куда',
    },
    uk: {
        title: 'Імпорт нотаток у LOREBASE',
        subtitleCopy: 'Перевірте нотатки, які буде скопійовано у вибрану папку LOREBASE.',
        subtitleReplace: 'Режим заміни оновить вибрані нотатки та перенесе їх у папку LOREBASE.',
        search: 'Пошук нотаток...',
        all: 'Усі',
        changed: 'Змінені',
        warnings: 'Попередження',
        selected: 'Вибрано',
        shown: 'показано',
        total: 'усього',
        selectAll: 'Вибрати всі',
        clear: 'Очистити',
        cancel: 'Скасувати',
        applyCopy: 'Створити копії',
        applyReplace: 'Замінити і перенести',
        notImportable: 'Не можна імпортувати',
        empty: 'Немає нотаток під поточні фільтри.',
        renamed: 'Перейменовано',
        kept: 'Збережено',
        removed: 'Видалено',
        source: 'Джерело',
        target: 'Куди',
    },
    'zh-CN': {
        title: '将笔记导入 LOREBASE',
        subtitleCopy: '检查即将复制到所选 LOREBASE 文件夹的笔记。',
        subtitleReplace: '替换模式会更新所选笔记，并将其移动到 LOREBASE 文件夹。',
        search: '搜索笔记…',
        all: '全部',
        changed: '有更改',
        warnings: '警告',
        selected: '已选择',
        shown: '当前显示',
        total: '总计',
        selectAll: '全选',
        clear: '清除',
        cancel: '取消',
        applyCopy: '创建副本',
        applyReplace: '替换并移动',
        notImportable: '无法导入',
        empty: '没有符合当前筛选条件的笔记。',
        renamed: '已重命名',
        kept: '已保留',
        removed: '已移除',
        source: '来源',
        target: '目标',
    },
};

export class NoteImportReviewModal extends Modal {
    private selected = new Set<string>();
    private resolve?: (value: NoteImportReviewResult | null) => void;
    private hasResolved = false;
    private query = '';
    private activeFilter: NoteImportFilter = 'all';
    private listEl?: HTMLElement;
    private countEl?: HTMLElement;
    private filterEl?: HTMLElement;
    private applyBtn?: HTMLButtonElement;

    constructor(
        app: App,
        private readonly items: NoteImportPreviewItem[],
        private readonly writeMode: NoteImportWriteMode,
        private readonly language: Language = 'en',
        private readonly targetFolders?: Record<Exclude<NoteImportTargetMedia, 'auto'>, string>,
        private readonly showTypeSelector = false,
        private readonly onFindSource?: (
            item: NoteImportPreviewItem,
            kind: MediaKind
        ) => Promise<MediaSourceSelection | null>
    ) {
        super(app);
    }

    openAndGetValue(): Promise<NoteImportReviewResult | null> {
        return new Promise(resolve => {
            this.resolve = resolve;
            this.open();
        });
    }

    onOpen(): void {
        this.modalEl.addClass('lorebase-note-import-review-container');
        this.render();
    }

    onClose(): void {
        this.modalEl.removeClass('lorebase-note-import-review-container');
        if (!this.hasResolved) this.resolve?.(null);
        this.contentEl.empty();
    }

    private render(): void {
        this.contentEl.empty();
        this.contentEl.addClass('lorebase-note-import-review');

        const header = this.contentEl.createDiv({ cls: 'lorebase-nir-header' });
        const titleRow = header.createDiv({ cls: 'lorebase-nir-title-row' });
        const titleIcon = titleRow.createSpan({ cls: 'lorebase-nir-title-icon' });
        setIcon(titleIcon, this.writeMode === 'replace' ? 'replace' : 'copy');
        titleRow.createSpan({ cls: 'lorebase-nir-title-text', text: this.text('title') });
        header.createDiv({
            cls: `lorebase-nir-subtitle ${this.writeMode === 'replace' ? 'is-danger' : ''}`,
            text: this.writeMode === 'replace' ? this.text('subtitleReplace') : this.text('subtitleCopy'),
        });

        const toolbar = this.contentEl.createDiv({ cls: 'lorebase-nir-toolbar' });
        const searchWrap = toolbar.createDiv({ cls: 'lorebase-nir-search-wrap' });
        setIcon(searchWrap.createSpan({ cls: 'lorebase-nir-search-icon' }), 'search');
        const search = searchWrap.createEl('input', {
            cls: 'lorebase-nir-search',
            attr: { type: 'text', placeholder: this.text('search') },
        });
        search.addEventListener('input', () => {
            this.query = search.value.trim().toLowerCase();
            this.renderList();
        });

        const actions = toolbar.createDiv({ cls: 'lorebase-nir-actions' });
        this.createActionButton(actions, 'check-check', this.text('selectAll'), () => {
            for (const item of this.getFilteredItems()) {
                if (item.canImport) this.selected.add(item.id);
            }
            this.refresh();
        });
        this.createActionButton(actions, 'x', this.text('clear'), () => {
            this.selected.clear();
            this.refresh();
        });

        this.filterEl = this.contentEl.createDiv({ cls: 'lorebase-nir-filters' });
        this.renderFilters();
        this.countEl = this.contentEl.createDiv({ cls: 'lorebase-nir-count' });
        this.listEl = this.contentEl.createDiv({ cls: 'lorebase-nir-list' });
        this.renderList();

        const footer = this.contentEl.createDiv({ cls: 'lorebase-nir-footer lorebase-select-footer' });
        const cancelBtn = footer.createEl('button', {
            cls: 'lorebase-flow-btn lorebase-flow-btn-secondary',
            attr: { type: 'button' },
        });
        setIcon(cancelBtn.createSpan({ cls: 'lorebase-flow-btn-icon' }), 'x');
        cancelBtn.createSpan({ cls: 'lorebase-flow-btn-label', text: this.text('cancel') });
        cancelBtn.addEventListener('click', () => {
            this.hasResolved = true;
            this.resolve?.(null);
            this.close();
        });

        this.applyBtn = footer.createEl('button', {
            cls: `lorebase-flow-btn lorebase-flow-btn-primary lorebase-nir-apply ${this.writeMode === 'replace' ? 'is-danger' : ''}`,
            attr: { type: 'button' },
        });
        this.applyBtn.addEventListener('click', () => {
            this.hasResolved = true;
            const targetMediaById: NoteImportReviewResult['targetMediaById'] = {};
            const sourcesById: NoteImportReviewResult['sourcesById'] = {};
            for (const item of this.items) {
                if (item.targetMedia) targetMediaById[item.id] = item.targetMedia;
                if (item.source) sourcesById[item.id] = item.source;
            }
            this.resolve?.({
                selectedIds: new Set(this.selected),
                targetMediaById,
                sourcesById,
            });
            this.close();
        });
        this.updateApplyButton();

        search.focus();
    }

    private renderFilters(): void {
        if (!this.filterEl) return;
        this.filterEl.empty();
        const filters: Array<{ id: NoteImportFilter; label: string; count: number; icon: string }> = [
            { id: 'all', label: this.text('all'), count: this.items.length, icon: 'layout-grid' },
            { id: 'changed', label: this.text('changed'), count: this.items.filter((item) => item.renamed.length || item.removed.length).length, icon: 'shuffle' },
            { id: 'warnings', label: this.text('warnings'), count: this.items.filter((item) => item.warnings.length).length, icon: 'triangle-alert' },
            { id: 'selected', label: this.text('selected'), count: this.selected.size, icon: 'check-circle' },
        ];

        for (const filter of filters) {
            const chip = this.filterEl.createEl('button', {
                cls: 'lorebase-nir-filter-chip',
                attr: { type: 'button' },
            });
            chip.toggleClass('is-active', this.activeFilter === filter.id);
            setIcon(chip.createSpan({ cls: 'lorebase-nir-filter-icon' }), filter.icon);
            chip.createSpan({ cls: 'lorebase-nir-filter-label', text: filter.label });
            chip.createSpan({ cls: 'lorebase-nir-filter-count', text: String(filter.count) });
            chip.addEventListener('click', () => {
                this.activeFilter = filter.id;
                this.renderFilters();
                this.renderList();
            });
        }
    }

    private renderList(): void {
        if (!this.listEl || !this.countEl) return;
        const filtered = this.getFilteredItems();
        this.countEl.setText(`${this.selected.size} ${this.text('selected').toLowerCase()} / ${filtered.length} ${this.text('shown')} / ${this.items.length} ${this.text('total')}`);
        this.listEl.empty();

        if (!filtered.length) {
            const empty = this.listEl.createDiv({ cls: 'lorebase-nir-empty' });
            setIcon(empty.createSpan({ cls: 'lorebase-nir-empty-icon' }), 'search-x');
            empty.createSpan({ text: this.text('empty') });
            return;
        }

        for (const item of filtered) {
            const checked = this.selected.has(item.id);
            const row = this.listEl.createDiv({
                cls: 'lorebase-nir-row',
                attr: {
                    role: 'checkbox',
                    tabindex: '0',
                    'aria-checked': String(checked),
                },
            });
            row.toggleClass('is-selected', checked);
            row.toggleClass('is-disabled', !item.canImport);

            const thumb = row.createDiv({ cls: 'lorebase-nir-thumb' });
            if (item.poster) {
                thumb.createEl('img', {
                    attr: { src: item.poster, alt: item.title, loading: 'lazy' },
                });
            } else {
                thumb.addClass('is-empty');
                setIcon(thumb.createSpan({ cls: 'lorebase-nir-thumb-icon' }), 'file-text');
            }

            const body = row.createDiv({ cls: 'lorebase-nir-body' });
            body.createDiv({ cls: 'lorebase-nir-title', text: item.title });
            body.createDiv({ cls: 'lorebase-nir-path', text: `${this.text('source')}: ${item.sourcePath}` });
            body.createDiv({ cls: 'lorebase-nir-path', text: `${this.text('target')}: ${item.targetPath || this.text('notImportable')}` });
            this.renderEnrichmentControls(body, item);
            this.renderSummary(body, item);

            const checkbox = row.createDiv({ cls: 'lorebase-nir-checkbox' });
            checkbox.toggleClass('is-checked', checked);
            setIcon(checkbox.createSpan({ cls: 'lorebase-nir-check-icon' }), 'check');

            const toggle = (): void => {
                if (!item.canImport) return;
                if (this.selected.has(item.id)) this.selected.delete(item.id);
                else this.selected.add(item.id);
                this.refresh();
            };
            row.addEventListener('click', toggle);
            row.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                toggle();
            });
        }
    }

    private renderEnrichmentControls(container: HTMLElement, item: NoteImportPreviewItem): void {
        const controls = container.createDiv({ cls: 'lorebase-nir-enrichment-controls' });
        if (this.showTypeSelector) {
            const select = controls.createEl('select', {
                cls: 'lorebase-nir-media-type',
                attr: { 'aria-label': this.extraText('mediaType') },
            });
            select.createEl('option', { value: '', text: this.extraText('mediaType') });
            const labels = this.language === 'ru'
                ? ['\u0418\u0433\u0440\u0430', '\u0410\u043d\u0438\u043c\u0435', '\u0424\u0438\u043b\u044c\u043c', '\u0421\u0435\u0440\u0438\u0430\u043b', '\u041a\u043d\u0438\u0433\u0430', '\u041c\u0430\u043d\u0433\u0430']
                : this.language === 'uk'
                    ? ['\u0413\u0440\u0430', '\u0410\u043d\u0456\u043c\u0435', '\u0424\u0456\u043b\u044c\u043c', '\u0421\u0435\u0440\u0456\u0430\u043b', '\u041a\u043d\u0438\u0433\u0430', '\u041c\u0430\u043d\u0491\u0430']
                    : ['Game', 'Anime', 'Movie', 'Series', 'Book', 'Manga'];
            const choices: Array<[Exclude<NoteImportTargetMedia, 'auto'>, string]> = [
                ['games', labels[0]],
                ['anime', labels[1]],
                ['movies', labels[2]],
                ['series', labels[3]],
                ['books', labels[4]],
                ['manga', labels[5]],
            ];
            for (const [value, label] of choices) select.createEl('option', { value, text: label });
            select.value = item.targetMedia ?? '';
            select.addEventListener('click', (event) => event.stopPropagation());
            select.addEventListener('change', (event) => {
                event.stopPropagation();
                const value = select.value as Exclude<NoteImportTargetMedia, 'auto'> | '';
                item.targetMedia = value || null;
                item.canImport = Boolean(value);
                item.source = null;
                item.targetPath = value ? this.makeTargetPath(value, item.title) : '';
                if (!item.canImport) this.selected.delete(item.id);
                this.refresh();
            });
        }

        const sourceLabel = controls.createDiv({
            cls: `lorebase-nir-source-label ${item.source ? 'is-connected' : ''}`,
            text: item.source
                ? `${item.source.provider.toUpperCase()} \u00b7 ${item.source.title}${item.source.year ? ` (${item.source.year})` : ''}`
                : this.extraText('noSource'),
        });
        sourceLabel.setAttr('title', item.source?.id ?? '');

        if (item.targetMedia && this.onFindSource) {
            const button = controls.createEl('button', {
                cls: 'lorebase-nir-source-button',
                attr: { type: 'button' },
            });
            setIcon(button.createSpan({ cls: 'lorebase-nir-source-button-icon' }), item.source ? 'repeat-2' : 'search');
            button.createSpan({ text: item.source ? this.extraText('changeSource') : this.extraText('findSource') });
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                void (async (): Promise<void> => {
                    button.disabled = true;
                    const source = await this.onFindSource?.(item, item.targetMedia as MediaKind);
                    if (source) item.source = source;
                    this.refresh();
                })();
            });
        }
    }

    private makeTargetPath(media: Exclude<NoteImportTargetMedia, 'auto'>, title: string): string {
        const folder = this.targetFolders?.[media]?.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') ?? '';
        const fileName = `${sanitizeFileName(title) || 'Untitled'}.md`;
        return folder ? `${folder}/${fileName}` : fileName;
    }

    private extraText(key: 'mediaType' | 'findSource' | 'changeSource' | 'noSource'): string {
        const values: Record<Language, Record<typeof key, string>> = {
            en: {
                mediaType: 'Media type',
                findSource: 'Find source',
                changeSource: 'Change source',
                noSource: 'No provider selected',
            },
            ru: {
                mediaType: '\u0422\u0438\u043f \u043c\u0435\u0434\u0438\u0430',
                findSource: '\u041d\u0430\u0439\u0442\u0438 \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a',
                changeSource: '\u0421\u043c\u0435\u043d\u0438\u0442\u044c \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a',
                noSource: '\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a \u043d\u0435 \u0432\u044b\u0431\u0440\u0430\u043d',
            },
            uk: {
                mediaType: '\u0422\u0438\u043f \u043c\u0435\u0434\u0456\u0430',
                findSource: '\u0417\u043d\u0430\u0439\u0442\u0438 \u0434\u0436\u0435\u0440\u0435\u043b\u043e',
                changeSource: '\u0417\u043c\u0456\u043d\u0438\u0442\u0438 \u0434\u0436\u0435\u0440\u0435\u043b\u043e',
                noSource: '\u0414\u0436\u0435\u0440\u0435\u043b\u043e \u043d\u0435 \u0432\u0438\u0431\u0440\u0430\u043d\u043e',
            },
            'zh-CN': {
                mediaType: '媒体类型',
                findSource: '查找数据源',
                changeSource: '更换数据源',
                noSource: '未选择数据源',
            },
        };
        return (values[this.language] ?? values.en)[key];
    }

    private renderSummary(container: HTMLElement, item: NoteImportPreviewItem): void {
        const summary = container.createDiv({ cls: 'lorebase-nir-summary' });
        this.createSummaryPill(summary, this.text('renamed'), item.renamed.length, 'shuffle');
        this.createSummaryPill(summary, this.text('kept'), item.kept.length, 'list-checks');
        this.createSummaryPill(summary, this.text('removed'), item.removed.length, 'trash-2');
        if (item.warnings.length) {
            const warnings = container.createDiv({ cls: 'lorebase-nir-warnings' });
            warnings.setText(item.warnings.join(' / '));
        }
        if (item.renamed.length || item.removed.length) {
            const details = container.createDiv({ cls: 'lorebase-nir-details' });
            const renamedText = item.renamed.slice(0, 4).map((entry) => `${entry.from} -> ${entry.to}`).join(', ');
            const removedText = item.removed.slice(0, 5).join(', ');
            details.setText([renamedText, removedText ? `${this.text('removed')}: ${removedText}` : ''].filter(Boolean).join(' / '));
        }
    }

    private createSummaryPill(container: HTMLElement, label: string, count: number, icon: string): void {
        const pill = container.createSpan({ cls: 'lorebase-nir-summary-pill' });
        setIcon(pill.createSpan({ cls: 'lorebase-nir-summary-icon' }), icon);
        pill.createSpan({ text: `${label}: ${count}` });
    }

    private createActionButton(container: HTMLElement, icon: string, label: string, onClick: () => void): void {
        const button = container.createEl('button', { cls: 'lorebase-nir-action', attr: { type: 'button' } });
        setIcon(button.createSpan({ cls: 'lorebase-nir-action-icon' }), icon);
        button.createSpan({ text: label });
        button.addEventListener('click', onClick);
    }

    private getFilteredItems(): NoteImportPreviewItem[] {
        return this.items.filter((item) => {
            if (this.activeFilter === 'selected' && !this.selected.has(item.id)) return false;
            if (this.activeFilter === 'changed' && !item.renamed.length && !item.removed.length) return false;
            if (this.activeFilter === 'warnings' && !item.warnings.length) return false;
            if (!this.query) return true;
            return item.title.toLowerCase().includes(this.query)
                || item.sourcePath.toLowerCase().includes(this.query)
                || item.targetPath.toLowerCase().includes(this.query);
        });
    }

    private refresh(): void {
        this.renderFilters();
        this.renderList();
        this.updateApplyButton();
    }

    private updateApplyButton(): void {
        if (!this.applyBtn) return;
        this.applyBtn.empty();
        const count = this.selected.size;
        setIcon(this.applyBtn.createSpan({ cls: 'lorebase-flow-btn-icon' }), this.writeMode === 'replace' ? 'replace' : 'copy');
        const label = this.writeMode === 'replace' ? this.text('applyReplace') : this.text('applyCopy');
        this.applyBtn.createSpan({ cls: 'lorebase-flow-btn-label', text: count > 0 ? `${label} (${count})` : label });
        this.applyBtn.disabled = count === 0;
    }

    private text<K extends keyof NoteImportReviewText>(key: K): NoteImportReviewText[K] {
        return (TEXT[this.language] ?? TEXT.en)[key];
    }
}
