import { Setting, setIcon } from 'obsidian';
import { DEFAULT_NOTE_IMPORT_FIELD_MAPPINGS } from '../../constants';
import { FolderSuggest } from '../../components/FolderSuggest';
import { t } from '../../localization';
import type { Language, NoteImportSettings, NoteImportTargetMedia, NoteImportWriteMode } from '../../types';
import { addLorebaseDropdown } from './customDropdown';
import type { SettingsSectionContext } from './types';

type ImportTextKey =
    | 'section'
    | 'sectionDesc'
    | 'sourceFolder'
    | 'sourceFolderDesc'
    | 'targetMedia'
    | 'targetMediaDesc'
    | 'auto'
    | 'autoHint'
    | 'writeMode'
    | 'writeModeDesc'
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
    | 'preview';

const IMPORT_TEXT: Record<Language, Record<ImportTextKey, string>> = {
    en: {
        section: 'Import',
        sectionDesc: 'Import notes from folders and external services into LOREBASE.',
        sourceFolder: 'Source folder',
        sourceFolderDesc: 'Folder with existing Markdown notes.',
        targetMedia: 'LOREBASE library',
        targetMediaDesc: 'Choose a library or Auto to route notes by frontmatter type.',
        auto: 'Auto',
        autoHint: 'Auto routes notes by the frontmatter type field: game, anime, movie, series, book, or manga. Notes without a supported type stay unselected in preview.',
        writeMode: 'Write mode',
        writeModeDesc: 'Create copies, or update selected notes and move them into the LOREBASE folder.',
        writeCopy: 'Create copies',
        writeReplace: 'Replace and move',
        fieldMappings: 'Field mappings',
        fieldMappingsDesc: 'LOREBASE key and aliases. The first matching alias wins.',
        canonical: 'LOREBASE key',
        aliases: 'Aliases',
        addMapping: 'Add mapping',
        resetMappings: 'Reset mappings',
        blacklist: 'Blacklist',
        blacklistDesc: 'Fields that must not be imported. Separate by comma or new line.',
        blacklistPlaceholder: 'Add field',
        emptyBlacklist: 'No excluded fields',
        preview: 'Preview import',
    },
    ru: {
        section: '\u0418\u043c\u043f\u043e\u0440\u0442',
        sectionDesc: '\u0418\u043c\u043f\u043e\u0440\u0442 \u0437\u0430\u043c\u0435\u0442\u043e\u043a \u0438\u0437 \u043f\u0430\u043f\u043e\u043a \u0438 \u0441\u0442\u043e\u0440\u043e\u043d\u043d\u0438\u0445 \u0441\u0435\u0440\u0432\u0438\u0441\u043e\u0432 \u0432 LOREBASE.',
        sourceFolder: '\u041f\u0430\u043f\u043a\u0430-\u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a',
        sourceFolderDesc: '\u041f\u0430\u043f\u043a\u0430 \u0441 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044e\u0449\u0438\u043c\u0438 Markdown-\u0437\u0430\u043c\u0435\u0442\u043a\u0430\u043c\u0438.',
        targetMedia: '\u0411\u0438\u0431\u043b\u0438\u043e\u0442\u0435\u043a\u0430 LOREBASE',
        targetMediaDesc: '\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0431\u0438\u0431\u043b\u0438\u043e\u0442\u0435\u043a\u0443 \u0438\u043b\u0438 Auto \u0434\u043b\u044f \u043c\u0430\u0440\u0448\u0440\u0443\u0442\u0438\u0437\u0430\u0446\u0438\u0438 \u043f\u043e type.',
        auto: 'Auto',
        autoHint: 'Auto \u0438\u0449\u0435\u0442 \u0442\u0438\u043f \u0437\u0430\u043c\u0435\u0442\u043a\u0438 \u0432 frontmatter-\u043f\u043e\u043b\u0435 type: game, anime, movie, series, book \u0438\u043b\u0438 manga. \u0417\u0430\u043c\u0435\u0442\u043a\u0438 \u0431\u0435\u0437 \u043f\u043e\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u043c\u043e\u0433\u043e type \u043e\u0441\u0442\u0430\u043d\u0443\u0442\u0441\u044f \u043d\u0435\u0432\u044b\u0431\u0440\u0430\u043d\u043d\u044b\u043c\u0438 \u0432 preview.',
        writeMode: '\u0420\u0435\u0436\u0438\u043c \u0437\u0430\u043f\u0438\u0441\u0438',
        writeModeDesc: '\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u043a\u043e\u043f\u0438\u0438 \u0438\u043b\u0438 \u043e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u0438 \u043f\u0435\u0440\u0435\u043d\u0435\u0441\u0442\u0438 \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u044b\u0435 \u0437\u0430\u043c\u0435\u0442\u043a\u0438 \u0432 \u043f\u0430\u043f\u043a\u0443 LOREBASE.',
        writeCopy: '\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u043a\u043e\u043f\u0438\u0438',
        writeReplace: '\u0417\u0430\u043c\u0435\u043d\u0438\u0442\u044c \u0438 \u043f\u0435\u0440\u0435\u043d\u0435\u0441\u0442\u0438',
        fieldMappings: '\u0428\u0430\u0431\u043b\u043e\u043d \u043f\u043e\u043b\u0435\u0439',
        fieldMappingsDesc: '\u041a\u043b\u044e\u0447 LOREBASE \u0438 \u0435\u0433\u043e \u0432\u0430\u0440\u0438\u0430\u043d\u0442\u044b. \u0411\u0435\u0440\u0435\u0442\u0441\u044f \u043f\u0435\u0440\u0432\u044b\u0439 \u043d\u0430\u0439\u0434\u0435\u043d\u043d\u044b\u0439 \u0432\u0430\u0440\u0438\u0430\u043d\u0442.',
        canonical: '\u041a\u043b\u044e\u0447 LOREBASE',
        aliases: '\u0412\u0430\u0440\u0438\u0430\u043d\u0442\u044b',
        addMapping: '\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u043f\u043e\u043b\u0435',
        resetMappings: '\u0421\u0431\u0440\u043e\u0441\u0438\u0442\u044c \u0448\u0430\u0431\u043b\u043e\u043d',
        blacklist: '\u0427\u0435\u0440\u043d\u044b\u0439 \u0441\u043f\u0438\u0441\u043e\u043a',
        blacklistDesc: '\u041f\u043e\u043b\u044f, \u043a\u043e\u0442\u043e\u0440\u044b\u0435 \u043d\u0435 \u043d\u0443\u0436\u043d\u043e \u043f\u0435\u0440\u0435\u043d\u043e\u0441\u0438\u0442\u044c.',
        blacklistPlaceholder: '\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u043f\u043e\u043b\u0435',
        emptyBlacklist: '\u041d\u0435\u0442 \u0438\u0441\u043a\u043b\u044e\u0447\u0435\u043d\u043d\u044b\u0445 \u043f\u043e\u043b\u0435\u0439',
        preview: 'Preview \u0438\u043c\u043f\u043e\u0440\u0442\u0430',
    },
    uk: {
        section: '\u0406\u043c\u043f\u043e\u0440\u0442',
        sectionDesc: '\u0406\u043c\u043f\u043e\u0440\u0442 \u043d\u043e\u0442\u0430\u0442\u043e\u043a \u0456\u0437 \u043f\u0430\u043f\u043e\u043a \u0456 \u0441\u0442\u043e\u0440\u043e\u043d\u043d\u0456\u0445 \u0441\u0435\u0440\u0432\u0456\u0441\u0456\u0432 \u0443 LOREBASE.',
        sourceFolder: 'Source folder',
        sourceFolderDesc: '\u041f\u0430\u043f\u043a\u0430 \u0437 \u043d\u0430\u044f\u0432\u043d\u0438\u043c\u0438 Markdown-\u043d\u043e\u0442\u0430\u0442\u043a\u0430\u043c\u0438.',
        targetMedia: 'LOREBASE library',
        targetMediaDesc: 'Choose a library or Auto to route notes by frontmatter type.',
        auto: 'Auto',
        autoHint: 'Auto routes notes by the frontmatter type field: game, anime, movie, series, book, or manga. Notes without a supported type stay unselected in preview.',
        writeMode: 'Write mode',
        writeModeDesc: 'Create copies, or update selected notes and move them into the LOREBASE folder.',
        writeCopy: 'Create copies',
        writeReplace: 'Replace and move',
        fieldMappings: 'Field mappings',
        fieldMappingsDesc: 'LOREBASE key and aliases. The first matching alias wins.',
        canonical: 'LOREBASE key',
        aliases: 'Aliases',
        addMapping: 'Add mapping',
        resetMappings: 'Reset mappings',
        blacklist: 'Blacklist',
        blacklistDesc: 'Fields that must not be imported. Separate by comma or new line.',
        blacklistPlaceholder: 'Add field',
        emptyBlacklist: 'No excluded fields',
        preview: 'Preview import',
    },
    'zh-CN': {
        section: '导入',
        sectionDesc: '将文件夹和外部服务中的笔记导入 LOREBASE。',
        sourceFolder: '来源文件夹',
        sourceFolderDesc: '包含现有 Markdown 笔记的文件夹。',
        targetMedia: 'LOREBASE 资料库',
        targetMediaDesc: '选择一个资料库，或使用“自动”根据属性中的 type 分配笔记。',
        auto: '自动',
        autoHint: '“自动”会根据属性中的 type 字段分配笔记：game、anime、movie、series、book 或 manga。没有受支持 type 的笔记在预览中不会被选中。',
        writeMode: '写入方式',
        writeModeDesc: '创建副本，或更新所选笔记并将其移动到 LOREBASE 文件夹。',
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
        preview: '预览导入',
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

export function renderImportSection(context: SettingsSectionContext, container: HTMLElement): void {
    const language = context.plugin.settings.language;
    const settings = context.plugin.settings.noteImport;
    context.createSectionHeader(container, String.fromCodePoint(0x1F4E6), importText(language, 'section'));

    const root = container.createDiv({ cls: 'lorebase-import-settings' });
    root.createDiv({ cls: 'lorebase-settings-section-description', text: importText(language, 'sectionDesc') });
    renderNoteImportSettings(context, root, settings, language);
}

function renderNoteImportSettings(
    context: SettingsSectionContext,
    container: HTMLElement,
    settings: NoteImportSettings,
    language: Language
): void {
    const sourceSetting = new Setting(container)
        .setName(importText(language, 'sourceFolder'))
        .setDesc(importText(language, 'sourceFolderDesc'));
    sourceSetting.addText(text => {
        const persist = async (value: string): Promise<void> => {
            settings.sourceFolderPath = value.trim();
            await context.plugin.saveSettings();
        };
        text
            .setValue(settings.sourceFolderPath)
            .onChange((value) => {
                void persist(value);
            });
        new FolderSuggest(context.app, text.inputEl, (path) => {
            void persist(path);
        });
    });

    const targetSetting = new Setting(container)
        .setName(importText(language, 'targetMedia'))
        .setDesc(importText(language, 'targetMediaDesc'));
    addLorebaseDropdown<NoteImportTargetMedia>(
        targetSetting,
        [
            { value: 'auto', label: importText(language, 'auto') },
            { value: 'games', label: t('settingsGames') },
            { value: 'anime', label: t('settingsAnime') },
            { value: 'movies', label: t('settingsMovies') },
            { value: 'series', label: t('settingsSeries') },
            { value: 'books', label: t('settingsBooks') },
            { value: 'manga', label: t('settingsManga') },
        ],
        settings.targetMedia,
        async (value) => {
            settings.targetMedia = value;
            await context.plugin.saveSettings();
            context.display();
        }
    );

    if (settings.targetMedia === 'auto') {
        const hint = container.createDiv({ cls: 'lorebase-note-import-auto-hint' });
        setIcon(hint.createSpan({ cls: 'lorebase-note-import-auto-hint-icon' }), 'info');
        hint.createSpan({ text: importText(language, 'autoHint') });
    }

    const writeModeSetting = new Setting(container)
        .setName(importText(language, 'writeMode'))
        .setDesc(importText(language, 'writeModeDesc'));
    addLorebaseDropdown<NoteImportWriteMode>(
        writeModeSetting,
        [
            { value: 'copy', label: importText(language, 'writeCopy') },
            { value: 'replace', label: importText(language, 'writeReplace') },
        ],
        settings.writeMode,
        async (value) => {
            settings.writeMode = value;
            await context.plugin.saveSettings();
        }
    );

    renderMappingEditor(context, container, settings, language);
    renderBlacklistSetting(context, container, settings, language);

    new Setting(container)
        .setName(importText(language, 'preview'))
        .addButton(button => {
            button
                .setIcon('scan-search')
                .setButtonText(importText(language, 'preview'))
                .setCta()
                .onClick(() => {
                    void context.plugin.runNoteImport();
                });
        });
}

function renderMappingEditor(
    context: SettingsSectionContext,
    container: HTMLElement,
    settings: NoteImportSettings,
    language: Language
): void {
    const wrapper = container.createDiv({ cls: 'lorebase-note-import-mappings' });
    const header = wrapper.createDiv({ cls: 'lorebase-note-import-mappings-header' });
    const title = header.createDiv({ cls: 'lorebase-note-import-mappings-title' });
    title.createDiv({ cls: 'lorebase-note-import-mappings-name', text: importText(language, 'fieldMappings') });
    title.createDiv({ cls: 'lorebase-note-import-mappings-desc', text: importText(language, 'fieldMappingsDesc') });
    const actions = header.createDiv({ cls: 'lorebase-note-import-mapping-actions' });

    const addButton = actions.createEl('button', { cls: 'lorebase-note-import-small-button', attr: { type: 'button' } });
    setIcon(addButton.createSpan({ cls: 'lorebase-note-import-small-button-icon' }), 'plus');
    addButton.createSpan({ text: importText(language, 'addMapping') });
    addButton.addEventListener('click', () => {
        void (async (): Promise<void> => {
            settings.fieldMappings.push({ key: '', aliases: [] });
            await context.plugin.saveSettings();
            context.display();
        })();
    });

    const resetButton = actions.createEl('button', { cls: 'lorebase-note-import-small-button', attr: { type: 'button' } });
    setIcon(resetButton.createSpan({ cls: 'lorebase-note-import-small-button-icon' }), 'rotate-ccw');
    resetButton.createSpan({ text: importText(language, 'resetMappings') });
    resetButton.addEventListener('click', () => {
        void (async (): Promise<void> => {
            settings.fieldMappings = DEFAULT_NOTE_IMPORT_FIELD_MAPPINGS.map((mapping) => ({
                key: mapping.key,
                aliases: [...mapping.aliases],
            }));
            await context.plugin.saveSettings();
            context.display();
        })();
    });

    const list = wrapper.createDiv({ cls: 'lorebase-note-import-mapping-list' });
    const columns = list.createDiv({ cls: 'lorebase-note-import-mapping-columns', attr: { 'aria-hidden': 'true' } });
    columns.createSpan({ text: importText(language, 'canonical') });
    columns.createSpan();
    columns.createSpan({ text: importText(language, 'aliases') });
    columns.createSpan();

    settings.fieldMappings.forEach((mapping, index) => {
        const row = list.createDiv({ cls: 'lorebase-note-import-mapping-row' });
        const keyInput = row.createEl('input', {
            cls: 'lorebase-note-import-key-input',
            attr: { type: 'text', placeholder: importText(language, 'canonical') },
        });
        keyInput.value = mapping.key;
        keyInput.addEventListener('input', () => {
            mapping.key = keyInput.value.trim();
            void context.plugin.saveSettings();
        });

        const direction = row.createSpan({ cls: 'lorebase-note-import-mapping-direction', attr: { 'aria-hidden': 'true' } });
        setIcon(direction, 'arrow-right');

        const aliasesInput = row.createEl('input', {
            cls: 'lorebase-note-import-aliases-input',
            attr: { type: 'text', placeholder: importText(language, 'aliases') },
        });
        aliasesInput.value = mapping.aliases.join(', ');
        aliasesInput.addEventListener('input', () => {
            mapping.aliases = parsePropertyList(aliasesInput.value);
            void context.plugin.saveSettings();
        });

        const removeButton = row.createEl('button', {
            cls: 'lorebase-note-import-icon-button',
            attr: { type: 'button', 'aria-label': t('settingsPlanRemove') },
        });
        setIcon(removeButton, 'trash-2');
        removeButton.addEventListener('click', () => {
            void (async (): Promise<void> => {
                settings.fieldMappings.splice(index, 1);
                await context.plugin.saveSettings();
                context.display();
            })();
        });
    });
}

function renderBlacklistSetting(
    context: SettingsSectionContext,
    container: HTMLElement,
    settings: NoteImportSettings,
    language: Language
): void {
    const wrapper = container.createDiv({ cls: 'lorebase-note-import-blacklist' });
    const header = wrapper.createDiv({ cls: 'lorebase-note-import-blacklist-header' });
    const title = header.createDiv({ cls: 'lorebase-note-import-mappings-title' });
    title.createDiv({ cls: 'lorebase-note-import-mappings-name', text: importText(language, 'blacklist') });
    title.createDiv({ cls: 'lorebase-note-import-mappings-desc', text: importText(language, 'blacklistDesc') });

    const chips = wrapper.createDiv({ cls: 'lorebase-note-import-blacklist-chips' });
    const normalizedBlacklist = parsePropertyList(settings.blacklist.join(','));
    settings.blacklist = normalizedBlacklist;

    if (normalizedBlacklist.length === 0) {
        chips.createDiv({ cls: 'lorebase-note-import-blacklist-empty', text: importText(language, 'emptyBlacklist') });
    }

    normalizedBlacklist.forEach((field, index) => {
        const chip = chips.createEl('button', {
            cls: 'lorebase-note-import-blacklist-chip',
            attr: { type: 'button', 'aria-label': `${t('settingsPlanRemove')} ${field}` },
        });
        chip.createSpan({ cls: 'lorebase-note-import-blacklist-chip-text', text: field });
        setIcon(chip.createSpan({ cls: 'lorebase-note-import-blacklist-chip-icon' }), 'x');
        chip.addEventListener('click', () => {
            void (async (): Promise<void> => {
                settings.blacklist.splice(index, 1);
                await context.plugin.saveSettings();
                context.display();
            })();
        });
    });

    const inputRow = wrapper.createDiv({ cls: 'lorebase-note-import-blacklist-input-row' });
    const input = inputRow.createEl('input', {
        cls: 'lorebase-note-import-blacklist-input',
        attr: { type: 'text', placeholder: importText(language, 'blacklistPlaceholder') },
    });
    const addButton = inputRow.createEl('button', {
        cls: 'lorebase-note-import-small-button',
        attr: { type: 'button' },
    });
    setIcon(addButton.createSpan({ cls: 'lorebase-note-import-small-button-icon' }), 'plus');
    addButton.createSpan({ text: importText(language, 'blacklistPlaceholder') });

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
        context.display();
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
