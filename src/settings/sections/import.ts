import { setIcon } from 'obsidian';
import { DEFAULT_NOTE_IMPORT_FIELD_MAPPINGS, MUSIC_NOTE_IMPORT_FIELD_MAPPINGS } from '../../constants';
import { mt } from '../../localization/music';
import { FolderSuggest } from '../../components/FolderSuggest';
import { t } from '../../localization';
import type { Language, NoteImportSettings, NoteImportTargetMedia, NoteImportWriteMode } from '../../types';
import { createMediaTabs } from './mediaTabs';
import { createLorebaseDropdown } from '../../components/LorebaseDropdown';
import type { SettingsSectionContext } from './types';

type ImportTextKey =
    | 'route' | 'folderExample' | 'autoBrief' | 'copyHint' | 'replaceHint' | 'toFields' | 'toReview' | 'scan' | 'ready' | 'sourceKeys' | 'editMapping' | 'emptyMappings' | 'saveMapping' | 'removeMapping' | 'pendingMapping' | 'removeExcluded'
    | 'section'
    | 'sectionDesc'
    | 'sourceFolder'
    | 'targetMedia'
    | 'auto'
    | 'writeMode'
    | 'writeCopy'
    | 'writeReplace'
    | 'fieldMappings'
    | 'fieldMappingsDesc'
    | 'canonical'
    | 'aliases'
    | 'addMapping'
    | 'resetMappings'
    | 'blacklist'
    | 'blacklistDesc'
    | 'blacklistPlaceholder'
    | 'emptyBlacklist'
    | 'sourceStep' | 'fieldsStep' | 'previewStep' | 'back' | 'sourceUnset' | 'reviewHint';

const IMPORT_TEXT: Record<Language, Record<ImportTextKey, string>> = {
    en: {
        section: 'Import',
        sectionDesc: 'Import Markdown notes from a folder in this vault.',
        sourceFolder: 'Source folder',
        targetMedia: 'LOREBASE library',
        auto: 'Auto',
        writeMode: 'Write mode',
        writeCopy: 'Create copies',
        writeReplace: 'Replace and move',
        fieldMappings: 'Field mappings',
        fieldMappingsDesc: 'LOREBASE key and aliases. The first matching alias wins.',
        canonical: 'LOREBASE key',
        aliases: 'Aliases',
        addMapping: 'Add mapping',
        resetMappings: 'Reset mappings',
        blacklist: 'Excluded fields',
        blacklistDesc: 'Fields that must not be imported. Separate by comma or new line.',
        blacklistPlaceholder: 'Add field',
        emptyBlacklist: 'No excluded fields',
        sourceStep: 'Source',
        fieldsStep: 'Fields',
        previewStep: 'Preview',
        back: 'Back',
        sourceUnset: 'Choose a source folder',
        reviewHint: 'Scan the folder to review changes and select the notes to import.',
        route: 'Folder → library',
        folderExample: 'e.g. Archive/Books',
        autoBrief: 'Match by the type property. Unmatched notes can be assigned in preview.',
        copyHint: 'Keep the original notes in place.',
        replaceHint: 'Update the original notes and move them to the library.',
        toFields: 'Configure fields',
        toReview: 'Review import',
        scan: 'Find notes',
        ready: 'Ready to scan',
        sourceKeys: 'Source keys',
        editMapping: 'Edit mapping',
        emptyMappings: 'No mappings yet',
        saveMapping: 'Save mapping',
        removeMapping: 'Remove mapping',
        pendingMapping: 'Save or cancel the open mapping before scanning notes.',
        removeExcluded: 'Remove excluded field',
    },
    ru: {
        section: '\u0418\u043c\u043f\u043e\u0440\u0442',
        sectionDesc: 'Импорт заметок Markdown из папки в этом хранилище.',
        sourceFolder: '\u041f\u0430\u043f\u043a\u0430-\u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a',
        targetMedia: '\u0411\u0438\u0431\u043b\u0438\u043e\u0442\u0435\u043a\u0430 LOREBASE',
        auto: 'Автоматически',
        writeMode: '\u0420\u0435\u0436\u0438\u043c \u0437\u0430\u043f\u0438\u0441\u0438',
        writeCopy: '\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u043a\u043e\u043f\u0438\u0438',
        writeReplace: '\u0417\u0430\u043c\u0435\u043d\u0438\u0442\u044c \u0438 \u043f\u0435\u0440\u0435\u043d\u0435\u0441\u0442\u0438',
        fieldMappings: '\u0428\u0430\u0431\u043b\u043e\u043d \u043f\u043e\u043b\u0435\u0439',
        fieldMappingsDesc: '\u041a\u043b\u044e\u0447 LOREBASE \u0438 \u0435\u0433\u043e \u0432\u0430\u0440\u0438\u0430\u043d\u0442\u044b. \u0411\u0435\u0440\u0435\u0442\u0441\u044f \u043f\u0435\u0440\u0432\u044b\u0439 \u043d\u0430\u0439\u0434\u0435\u043d\u043d\u044b\u0439 \u0432\u0430\u0440\u0438\u0430\u043d\u0442.',
        canonical: '\u041a\u043b\u044e\u0447 LOREBASE',
        aliases: '\u0412\u0430\u0440\u0438\u0430\u043d\u0442\u044b',
        addMapping: '\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u043f\u043e\u043b\u0435',
        resetMappings: '\u0421\u0431\u0440\u043e\u0441\u0438\u0442\u044c \u0448\u0430\u0431\u043b\u043e\u043d',
        blacklist: 'Исключения',
        blacklistDesc: '\u041f\u043e\u043b\u044f, \u043a\u043e\u0442\u043e\u0440\u044b\u0435 \u043d\u0435 \u043d\u0443\u0436\u043d\u043e \u043f\u0435\u0440\u0435\u043d\u043e\u0441\u0438\u0442\u044c.',
        blacklistPlaceholder: '\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u043f\u043e\u043b\u0435',
        emptyBlacklist: '\u041d\u0435\u0442 \u0438\u0441\u043a\u043b\u044e\u0447\u0435\u043d\u043d\u044b\u0445 \u043f\u043e\u043b\u0435\u0439',
        sourceStep: 'Источник',
        fieldsStep: 'Поля',
        previewStep: 'Превью',
        back: 'Назад',
        sourceUnset: 'Выберите папку-источник',
        reviewHint: 'Просканируйте папку, чтобы проверить изменения и выбрать заметки для импорта.',
        route: 'Папка → библиотека',
        folderExample: 'Например, Архив/Книги',
        autoBrief: 'Распределение по свойству type. Для остальных заметок библиотеку можно выбрать в превью.',
        copyHint: 'Исходные заметки остаются на месте.',
        replaceHint: 'Обновляет исходные заметки и переносит их в библиотеку.',
        toFields: 'Настроить поля',
        toReview: 'Перейти к превью',
        scan: 'Найти заметки',
        ready: 'Подготовка к проверке',
        sourceKeys: 'Ключи в заметках',
        editMapping: 'Изменить сопоставление',
        emptyMappings: 'Сопоставлений пока нет',
        saveMapping: 'Сохранить правило',
        removeMapping: 'Удалить правило',
        pendingMapping: 'Сохрани или отмени открытое правило на шаге «Поля», чтобы найти заметки.',
        removeExcluded: 'Убрать исключение',
    },
    uk: {
        section: '\u0406\u043c\u043f\u043e\u0440\u0442',
        sectionDesc: 'Імпорт нотаток Markdown із папки в цьому сховищі.',
        sourceFolder: 'Папка-джерело',
        targetMedia: 'Бібліотека LOREBASE',
        auto: 'Автоматично',
        writeMode: 'Режим запису',
        writeCopy: 'Створити копії',
        writeReplace: 'Замінити й перемістити',
        fieldMappings: 'Шаблон полів',
        fieldMappingsDesc: 'Ключ LOREBASE і його варіанти. Використовується перший відповідний варіант.',
        canonical: 'Ключ LOREBASE',
        aliases: 'Варіанти',
        addMapping: 'Додати поле',
        resetMappings: 'Скинути шаблон',
        blacklist: 'Виключені поля',
        blacklistDesc: 'Поля, які не потрібно переносити. Розділяйте комами або новими рядками.',
        blacklistPlaceholder: 'Додати поле',
        emptyBlacklist: 'Виключених полів немає',
        sourceStep: 'Джерело',
        fieldsStep: 'Поля',
        previewStep: 'Перегляд',
        back: 'Назад',
        sourceUnset: 'Оберіть папку-джерело',
        reviewHint: 'Проскануйте папку, щоб перевірити зміни й вибрати нотатки для імпорту.',
        route: 'Папка → бібліотека',
        folderExample: 'Наприклад, Архів/Книги',
        autoBrief: 'Розподіл за властивістю type. Решту нотаток можна призначити бібліотеці під час перегляду.',
        copyHint: 'Вихідні нотатки залишаються на місці.',
        replaceHint: 'Оновлює вихідні нотатки й переносить їх до бібліотеки.',
        toFields: 'Налаштувати поля',
        toReview: 'Перейти до перегляду',
        scan: 'Знайти нотатки',
        ready: 'Підготовка до перевірки',
        sourceKeys: 'Ключі в нотатках',
        editMapping: 'Змінити зіставлення',
        emptyMappings: 'Зіставлень поки немає',
        saveMapping: 'Зберегти правило',
        removeMapping: 'Видалити правило',
        pendingMapping: 'Збережіть або скасуйте відкрите правило на кроці «Поля», щоб знайти нотатки.',
        removeExcluded: 'Видалити виключення',
    },
    'zh-CN': {
        section: '导入',
        sectionDesc: '从当前仓库的文件夹导入 Markdown 笔记。',
        sourceFolder: '来源文件夹',
        targetMedia: 'LOREBASE 资料库',
        auto: '自动',
        writeMode: '写入方式',
        writeCopy: '创建副本',
        writeReplace: '替换并移动',
        fieldMappings: '字段映射',
        fieldMappingsDesc: 'LOREBASE 字段及其别名。匹配到的第一个别名优先。',
        canonical: 'LOREBASE 字段',
        aliases: '别名',
        addMapping: '添加映射',
        resetMappings: '重置映射',
        blacklist: '排除列表',
        blacklistDesc: '禁止导入的字段，请用逗号或换行分隔。',
        blacklistPlaceholder: '添加字段',
        emptyBlacklist: '没有排除字段',
        sourceStep: '来源',
        fieldsStep: '字段',
        previewStep: '预览',
        back: '返回',
        sourceUnset: '请选择来源文件夹',
        reviewHint: '扫描文件夹以检查更改并选择要导入的笔记。',
        route: '文件夹 → 资料库',
        folderExample: '例如 归档/书籍',
        autoBrief: '根据 type 属性分配资料库，剩余笔记可在预览中手动指定。',
        copyHint: '保留来源笔记及其位置。',
        replaceHint: '更新来源笔记并将其移至资料库。',
        toFields: '配置字段',
        toReview: '查看导入预览',
        scan: '查找笔记',
        ready: '准备扫描',
        sourceKeys: '笔记中的字段',
        editMapping: '编辑映射',
        emptyMappings: '尚无字段映射',
        saveMapping: '保存映射',
        removeMapping: '删除映射',
        pendingMapping: '扫描笔记前，请在“字段”步骤保存或取消正在编辑的映射。',
        removeExcluded: '移除排除字段',
    },
};

export function getImportSectionLabel(language: Language): string {
    return importText(language, 'section');
}

export function getImportSectionDesc(language: Language): string {
    return importText(language, 'sectionDesc');
}

function importText(language: Language, key: ImportTextKey): string {
    return (IMPORT_TEXT[language] ?? IMPORT_TEXT.en)[key];
}

type ImportStep = 'source' | 'fields' | 'preview';
const steps: ImportStep[] = ['source', 'fields', 'preview'];
const activeSteps = new WeakMap<object, ImportStep>();

export function renderImportSection(context: SettingsSectionContext, container: HTMLElement): void {
    const language = context.plugin.settings.language;
    const settings = context.plugin.settings.noteImport;
    const label = (key: ImportTextKey): string => importText(language, key);
    context.createSectionHeader(container, 'lucide:folder-input', label('section'));

    const root = container.createDiv({ cls: 'lorebase-import-settings' });
    root.createDiv({ cls: 'lorebase-settings-section-description', text: label('sectionDesc') });
    const navigation = root.createDiv({ cls: 'lorebase-import-steps' });
    const panels = root.createDiv({ cls: 'lorebase-import-panels' });
    const labels = { source: label('sourceStep'), fields: label('fieldsStep'), preview: label('previewStep') };
    const source = panels.createDiv({ cls: 'lorebase-import-source' });
    const fields = panels.createDiv({ cls: 'lorebase-import-fields' });
    const preview = panels.createDiv({ cls: 'lorebase-import-preview' });
    const sections = { source, fields, preview };
    const targetOptions = [
        { value: 'auto', label: label('auto') },
        { value: 'games', label: t('settingsGames') },
        { value: 'anime', label: t('settingsAnime') },
        { value: 'movies', label: t('settingsMovies') },
        { value: 'series', label: t('settingsSeries') },
        { value: 'books', label: t('settingsBooks') },
        { value: 'manga', label: t('settingsManga') },
        { value: 'music', label: mt('music') },
    ] satisfies { value: NoteImportTargetMedia; label: string }[];
    const writeOptions = [
        { value: 'copy', label: label('writeCopy') },
        { value: 'replace', label: label('writeReplace') },
    ] satisfies { value: NoteImportWriteMode; label: string }[];
    renderImportSource(context, source, settings, language, targetOptions);

    renderMappingEditor(context, fields, settings, language);
    const blacklist = fields.createDiv();
    const showBlacklist = (): void => {
        blacklist.empty();
        renderBlacklistSetting(context, blacklist, settings, language, showBlacklist);
    };
    showBlacklist();

    const overview = preview.createDiv({ cls: 'lorebase-import-surface lorebase-import-overview' });
    renderImportHeading(overview, 'scan-search', label('ready'), label('reviewHint'));
    const summary = overview.createEl('dl', { cls: 'lorebase-import-summary' });
    const pendingMapping = overview.createDiv({ cls: 'lorebase-import-route-hint', text: label('pendingMapping'), attr: { role: 'status' } });
    pendingMapping.hidden = true;
    const updateSummary = (): void => {
        summary.empty();
        const route = [
            { icon: 'folder', title: label('sourceFolder'), value: settings.sourceFolderPath || label('sourceUnset') },
            { icon: 'library', title: label('targetMedia'), value: targetOptions.find(option => option.value === settings.targetMedia)?.label ?? label('auto') },
            { icon: settings.writeMode === 'replace' ? 'replace' : 'copy', title: label('writeMode'),
                value: writeOptions.find(option => option.value === settings.writeMode)?.label ?? label('writeCopy') },
        ];
        for (const { icon, title, value } of route) {
            const row = summary.createDiv();
            const term = row.createEl('dt');
            setIcon(term.createSpan({ attr: { 'aria-hidden': 'true' } }), icon);
            term.createSpan({ text: title });
            row.createEl('dd', { text: value });
        }
        overview.toggleClass('is-replace', settings.writeMode === 'replace');
    };

    const footer = root.createDiv({ cls: 'lorebase-import-navigation' });
    const back = createImportButton(footer, 'arrow-left', label('back'), 'is-back');
    const scan = createImportButton(footer, 'scan-search', label('scan'), 'mod-cta lorebase-import-scan');
    const next = createImportButton(footer, 'arrow-right', label('toFields'), 'mod-cta lorebase-import-next');
    const reviewHost = preview.createDiv({ cls: 'lorebase-inline-import-review' });
    let running: AbortController | undefined;
    const cancelReview = (): void => {
        running?.abort();
        reviewHost.empty();
    };
    context.signal?.addEventListener('abort', cancelReview, { once: true });
    container.addEventListener('lorebase-settings-section-hide', cancelReview);
    scan.addEventListener('click', async () => {
        if (running || context.signal?.aborted) return;
        running = new AbortController();
        reviewHost.empty();
        scan.disabled = true;
        const loading = reviewHost.createDiv({ cls: 'lorebase-nir-empty', text: t('settingsImportScanning'), attr: { role: 'status' } });
        try {
            await context.plugin.runNoteImport({ host: reviewHost, signal: running.signal });
        } finally {
            loading.remove();
            running = undefined;
            scan.disabled = !settings.sourceFolderPath.trim() || !pendingMapping.hidden;
            if (!context.signal?.aborted && !preview.hidden && preview.getClientRects().length && reviewHost.childElementCount === 0) {
                scan.focus();
            }
        }
    });

    const tabs = createMediaTabs(navigation, [
        { value: 'source', label: labels.source, icon: 'folder' },
        { value: 'fields', label: labels.fields, icon: 'list-filter' },
        { value: 'preview', label: labels.preview, icon: 'scan-search' },
    ], activeSteps.get(context.plugin) ?? 'source', label('section'), step => {
        activeSteps.set(context.plugin, step);
        for (const key of steps) sections[key].hidden = key !== step;
        back.hidden = step === 'source';
        next.hidden = step === 'preview';
        scan.hidden = step !== 'preview';
        const nextLabel = step === 'source' ? label('toFields') : label('toReview');
        next.lastElementChild!.textContent = nextLabel;
        if (step === 'preview') {
            updateSummary();
            pendingMapping.hidden = !fields.querySelector('.lorebase-import-rule-editor');
            scan.disabled = Boolean(running) || !settings.sourceFolderPath.trim() || !pendingMapping.hidden;
        } else cancelReview();
    });
    const tabButtons = navigation.querySelectorAll('button[role="tab"]');
    steps.forEach((step, index) => {
        const panelId = 'lorebase-import-step-' + step;
        const tab = tabButtons[index];
        tab.id = panelId + '-tab';
        tab.setAttribute('aria-controls', panelId);
        sections[step].id = panelId;
        sections[step].setAttribute('role', 'tabpanel');
        sections[step].setAttribute('aria-labelledby', tab.id);
    });
    back.addEventListener('click', () => tabs.setValue(steps[steps.indexOf(tabs.getValue()) - 1], true));
    next.addEventListener('click', () => tabs.setValue(steps[steps.indexOf(tabs.getValue()) + 1], true));
}

function createImportButton(container: HTMLElement, icon: string, label: string, classes = ''): HTMLButtonElement {
    const button = container.createEl('button', {
        cls: ['lorebase-import-button', classes].filter(Boolean).join(' '),
        attr: { type: 'button' },
    });
    setIcon(button.createSpan({ attr: { 'aria-hidden': 'true' } }), icon);
    button.createSpan({ text: label });
    return button;
}

function renderImportHeading(container: HTMLElement, icon: string, title: string, description?: string): void {
    const heading = container.createDiv({ cls: 'lorebase-import-heading' });
    setIcon(heading.createSpan({ cls: 'lorebase-import-heading-icon', attr: { 'aria-hidden': 'true' } }), icon);
    const text = heading.createDiv();
    text.createEl('h3', { text: title });
    if (description) text.createEl('p', { text: description });
}

function renderImportSource(
    context: SettingsSectionContext,
    container: HTMLElement,
    settings: NoteImportSettings,
    language: Language,
    targetOptions: { value: NoteImportTargetMedia; label: string }[]
): void {
    const label = (key: ImportTextKey): string => importText(language, key);
    const routing = container.createDiv({ cls: 'lorebase-import-surface' });
    renderImportHeading(routing, 'route', label('route'));
    const route = routing.createDiv({ cls: 'lorebase-import-route' });
    const source = route.createEl('label', { cls: 'lorebase-import-route-node' });
    source.createSpan({ cls: 'lorebase-import-field-label', text: label('sourceFolder') });
    const input = source.createEl('input', {
        type: 'text', attr: { placeholder: label('folderExample'), spellcheck: 'false' },
    });
    input.value = settings.sourceFolderPath;
    const persist = (value: string): void => {
        settings.sourceFolderPath = value.trim();
        void context.plugin.saveSettings();
    };
    input.addEventListener('input', () => persist(input.value));
    new FolderSuggest(context.app, input, persist);

    const direction = route.createSpan({ cls: 'lorebase-import-route-arrow', attr: { 'aria-hidden': 'true' } });
    setIcon(direction, 'arrow-right');
    const destination = route.createDiv({
        cls: 'lorebase-import-route-node',
        attr: { role: 'group', 'aria-label': label('targetMedia') },
    });
    destination.createSpan({ cls: 'lorebase-import-field-label', text: label('targetMedia') });
    const library = destination.createDiv({ cls: 'lorebase-import-library' });
    const hint = routing.createDiv({ cls: 'lorebase-import-route-hint' });
    setIcon(hint.createSpan({ attr: { 'aria-hidden': 'true' } }), 'info');
    hint.createSpan({ text: label('autoBrief') });
    hint.hidden = settings.targetMedia !== 'auto';
    createLorebaseDropdown(library, targetOptions, settings.targetMedia, async value => {
        settings.targetMedia = value;
        hint.hidden = value !== 'auto';
        await context.plugin.saveSettings();
    }, { floating: true });

    const writing = container.createDiv({ cls: 'lorebase-import-surface' });
    renderImportHeading(writing, 'file-output', label('writeMode'));
    const modes = writing.createDiv({ cls: 'lorebase-import-modes', attr: { role: 'group', 'aria-label': label('writeMode') } });
    const choices = [
        { value: 'copy', icon: 'copy', title: label('writeCopy'), description: label('copyHint') },
        { value: 'replace', icon: 'replace', title: label('writeReplace'), description: label('replaceHint') },
    ] as const;
    const buttons = choices.map(choice => {
        const button = modes.createEl('button', {
            cls: 'lorebase-import-mode is-' + choice.value,
            attr: { type: 'button', 'aria-pressed': String(settings.writeMode === choice.value) },
        });
        setIcon(button.createSpan({ cls: 'lorebase-import-mode-icon', attr: { 'aria-hidden': 'true' } }), choice.icon);
        const copy = button.createSpan({ cls: 'lorebase-import-mode-copy' });
        copy.createEl('strong', { text: choice.title });
        copy.createSpan({ text: choice.description });
        button.addEventListener('click', () => {
            if (settings.writeMode === choice.value) return;
            settings.writeMode = choice.value;
            for (const [value, control] of buttons) control.setAttribute('aria-pressed', String(value === choice.value));
            void context.plugin.saveSettings();
        });
        return [choice.value, button] as const;
    });
}

function renderMappingEditor(
    context: SettingsSectionContext,
    container: HTMLElement,
    settings: NoteImportSettings,
    language: Language
): void {
    const label = (key: ImportTextKey): string => importText(language, key);
    const wrapper = container.createDiv({ cls: 'lorebase-import-surface' });
    const header = wrapper.createDiv({ cls: 'lorebase-import-toolbar' });
    renderImportHeading(header, 'git-merge', label('fieldMappings'), label('fieldMappingsDesc'));
    const actions = header.createDiv({ cls: 'lorebase-import-actions' });
    const add = createImportButton(actions, 'plus', label('addMapping'));
    const reset = createImportButton(actions, 'rotate-ccw', label('resetMappings'), 'is-quiet');
    const music = createImportButton(actions, 'music', `${label('addMapping')} · ${mt('music')}`, 'is-quiet');
    music.addEventListener('click', () => {
        for (const mapping of MUSIC_NOTE_IMPORT_FIELD_MAPPINGS) {
            if (!settings.fieldMappings.some(item => item.key === mapping.key)) settings.fieldMappings.push({ ...mapping, aliases: [...mapping.aliases] });
        }
        renderRules(); void context.plugin.saveSettings();
    });
    const list = wrapper.createDiv({ cls: 'lorebase-import-rules' });

    const renderRules = (editIndex?: number, focusIndex?: number): void => {
        list.empty();
        const editing = editIndex !== undefined;
        add.disabled = reset.disabled = music.disabled = editing;
        const columns = list.createDiv({ cls: 'lorebase-import-rule-columns', attr: { 'aria-hidden': 'true' } });
        columns.createSpan({ text: label('sourceKeys') });
        columns.createSpan({ text: label('canonical') });
        if (!settings.fieldMappings.length && !editing) {
            list.createDiv({ cls: 'lorebase-import-rule-empty', text: label('emptyMappings') });
        }

        settings.fieldMappings.forEach((mapping, index) => {
            const row = list.createEl('button', {
                cls: 'lorebase-import-rule',
                attr: { type: 'button', title: label('editMapping'), 'aria-expanded': String(index === editIndex) },
            });
            row.disabled = editing;
            const aliases = row.createSpan({ cls: 'lorebase-import-aliases' });
            for (const alias of mapping.aliases) aliases.createEl('code', { text: alias });
            if (!mapping.aliases.length) aliases.createSpan({ text: '–' });
            setIcon(row.createSpan({ cls: 'lorebase-import-rule-icon', attr: { 'aria-hidden': 'true' } }), 'arrow-right');
            row.createEl('code', { cls: 'lorebase-import-rule-key', text: mapping.key || '–' });
            setIcon(row.createSpan({ cls: 'lorebase-import-rule-edit', attr: { 'aria-hidden': 'true' } }), 'pencil');
            row.addEventListener('click', () => renderRules(index));
            if (index === editIndex) renderEditor(index);
            if (index === focusIndex) row.focus();
        });
        if (editIndex === settings.fieldMappings.length) renderEditor(editIndex);
    };

    const renderEditor = (index: number): void => {
        const mapping = settings.fieldMappings[index];
        const editor = list.createEl('form', { cls: 'lorebase-import-rule-editor' });
        const controls = editor.createDiv({ cls: 'lorebase-import-rule-inputs' });
        const field = (title: string, value: string): HTMLInputElement => {
            const wrapper = controls.createEl('label');
            wrapper.createSpan({ cls: 'lorebase-import-field-label', text: title });
            const input = wrapper.createEl('input', { type: 'text', attr: { spellcheck: 'false' } });
            input.value = value;
            return input;
        };
        const aliases = field(label('aliases'), mapping?.aliases.join(', ') ?? '');
        const key = field(label('canonical'), mapping?.key ?? '');
        key.required = true;
        key.pattern = '.*\\S.*';
        const footer = editor.createDiv({ cls: 'lorebase-import-actions' });
        if (mapping) {
            const remove = createImportButton(footer, 'trash-2', label('removeMapping'), 'is-danger is-remove');
            remove.addEventListener('click', () => {
                settings.fieldMappings.splice(index, 1);
                const focusIndex = Math.min(index, settings.fieldMappings.length - 1);
                renderRules(undefined, focusIndex);
                if (focusIndex < 0) add.focus();
                void context.plugin.saveSettings();
            });
        }
        const cancel = createImportButton(footer, 'x', t('deleteCancel'), 'is-quiet');
        const close = (): void => {
            renderRules(undefined, mapping ? index : undefined);
            if (!mapping) add.focus();
        };
        cancel.addEventListener('click', close);
        editor.addEventListener('keydown', event => {
            if (event.key !== 'Escape') return;
            event.stopPropagation();
            close();
        });
        const save = createImportButton(footer, 'check', label('saveMapping'), 'mod-cta');
        save.type = 'submit';
        editor.addEventListener('submit', event => {
            event.preventDefault();
            const next = { key: key.value.trim(), aliases: parsePropertyList(aliases.value) };
            if (!next.key) return;
            settings.fieldMappings.splice(index, mapping ? 1 : 0, next);
            renderRules(undefined, index);
            void context.plugin.saveSettings();
        });
        (mapping ? aliases : key).focus();
    };

    add.addEventListener('click', () => renderRules(settings.fieldMappings.length));
    reset.addEventListener('click', () => {
        settings.fieldMappings = DEFAULT_NOTE_IMPORT_FIELD_MAPPINGS.map(({ key, aliases }) => ({ key, aliases: [...aliases] }));
        renderRules();
        void context.plugin.saveSettings();
    });
    renderRules();
}

function renderBlacklistSetting(
    context: SettingsSectionContext,
    container: HTMLElement,
    settings: NoteImportSettings,
    language: Language,
    refresh: () => void
): void {
    const wrapper = container.createDiv({ cls: 'lorebase-import-surface lorebase-note-import-blacklist' });
    renderImportHeading(wrapper, 'list-filter', importText(language, 'blacklist'), importText(language, 'blacklistDesc'));

    const chips = wrapper.createDiv({ cls: 'lorebase-note-import-blacklist-chips' });
    const normalizedBlacklist = parsePropertyList(settings.blacklist.join(','));
    settings.blacklist = normalizedBlacklist;

    if (normalizedBlacklist.length === 0) {
        chips.createDiv({ cls: 'lorebase-note-import-blacklist-empty', text: importText(language, 'emptyBlacklist') });
    }

    normalizedBlacklist.forEach((field, index) => {
        const chip = chips.createEl('button', {
            cls: 'lorebase-note-import-blacklist-chip',
            attr: { type: 'button', 'aria-label': `${importText(language, 'removeExcluded')} ${field}` },
        });
        chip.createSpan({ cls: 'lorebase-note-import-blacklist-chip-text', text: field });
        setIcon(chip.createSpan({ cls: 'lorebase-note-import-blacklist-chip-icon' }), 'x');
        chip.addEventListener('click', () => {
            void (async (): Promise<void> => {
                settings.blacklist.splice(index, 1);
                await context.plugin.saveSettings();
                refresh();
            })();
        });
    });

    const inputRow = wrapper.createDiv({ cls: 'lorebase-note-import-blacklist-input-row' });
    const input = inputRow.createEl('input', {
        cls: 'lorebase-note-import-blacklist-input',
        attr: { type: 'text', placeholder: importText(language, 'blacklistPlaceholder'), 'aria-label': importText(language, 'blacklistPlaceholder') },
    });
    const addButton = createImportButton(inputRow, 'plus', importText(language, 'blacklistPlaceholder'));

    const addFields = async (): Promise<void> => {
        const fields = parsePropertyList(input.value);
        if (fields.length === 0) return;
        const existing = new Set(settings.blacklist);
        for (const field of fields) {
            if (existing.has(field)) continue;
            settings.blacklist.push(field);
            existing.add(field);
        }
        input.value = '';
        await context.plugin.saveSettings();
        refresh();
    };

    input.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ',') return;
        event.preventDefault();
        void addFields();
    });
    addButton.addEventListener('click', () => {
        void addFields();
    });
}

function parsePropertyList(value: string): string[] {
    const items: string[] = [];
    const seen = new Set<string>();
    for (const raw of value.split(/[,;\n]+/)) {
        const text = raw.trim();
        if (!text || seen.has(text)) continue;
        seen.add(text);
        items.push(text);
    }
    return items;
}
