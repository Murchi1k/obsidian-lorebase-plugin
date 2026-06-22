import { Notice, Setting, setIcon } from 'obsidian';
import type { SteamSyncDuplicateMode } from '../types';
import { createLorebaseDropdown } from '../components/LorebaseDropdown';
import type { SettingsSectionContext } from './sections/types';

type SteamSyncTab = 'setup' | 'import' | 'sync';

function label(context: SettingsSectionContext, key: string): string {
    const ru = context.plugin.settings.language === 'ru';
    const values: Record<string, [string, string]> = {
        title: ['Sync', 'Sync'],
        subtitle: ['Connect external libraries and keep LOREBASE data in sync.', 'Подключайте внешние библиотеки и синхронизируйте данные LOREBASE.'],
        steamSettings: ['Steam settings', 'Настройки Steam'],
        setup: ['Setup', 'Настройка'],
        import: ['Import', 'Импорт'],
        sync: ['Sync', 'Синхронизация'],
        connection: ['Connection', 'Подключение'],
        cors: [
            'Steam requests are routed through the Obsidian proxy. Wishlist works without an API key; library import may require one even for public profiles.',
            'Steam-запросы идут через прокси Obsidian. Вишлист работает без API Key; библиотека может требовать ключ даже для публичных профилей.',
        ],
        steamId: ['Steam profile URL', 'Ссылка на профиль Steam'],
        steamIdPlaceholder: ['https://steamcommunity.com/profiles/... or /id/name', 'https://steamcommunity.com/profiles/... или /id/name'],
        apiKey: ['API Key', 'API Key'],
        apiKeyPlaceholder: ['Steam Web API Key', 'Steam Web API Key'],
        apiKeyHelp: ['How to get an API Key', 'Как получить API Key'],
        apiKeyHelpText: [
            'Open the Steam Web API page, sign in, enter any domain name, and copy the generated key.',
            'Откройте страницу Steam Web API, войдите в аккаунт, укажите любой домен и скопируйте созданный ключ.',
        ],
        apiKeyHelpOpen: ['Open Steam API page', 'Открыть страницу Steam API'],
        test: ['Test connection', 'Проверить подключение'],
        testOk: ['Steam connection works', 'Подключение к Steam работает'],
        testFail: ['Steam connection failed', 'Не удалось подключиться к Steam'],
        whatImport: ['What to import', 'Что импортировать'],
        library: ['Library', 'Библиотека'],
        libraryDesc: ['Owned and free games', 'Все купленные и бесплатные игры'],
        wishlist: ['Wishlist', 'Вишлист'],
        wishlistDesc: ['Games from Steam wishlist', 'Игры из wish list'],
        duplicates: ['Duplicates', 'Дубликаты'],
        skip: ['Skip existing', 'Пропустить существующие'],
        update: ['Update data', 'Обновить данные'],
        ask: ['Ask', 'Спрашивать'],
        steamData: ['Steam data', 'Данные из Steam'],
        steamDataDesc: [
            'Choose which Steam fields are written to notes.',
            'Выберите поля Steam для записи в заметки.',
        ],
        playtime: ['Playtime', 'Playtime'],
        playtimeDesc: ['Library minutes', 'Минуты из библиотеки'],
        genres: ['Genres', 'Жанры'],
        genresDesc: ['Store genres', 'Жанры из Steam'],
        releaseDate: ['Release date', 'Дата релиза'],
        releaseDateDesc: ['Date and year', 'Дата и год'],
        autoSync: ['Auto sync', 'Автосинхронизация'],
        autoPlaytime: ['Sync playtime', 'Синхронизировать playtime'],
        autoPlaytimeDesc: [
            'Update playtime in existing game notes when Obsidian opens',
            'Обновлять поле playtime у существующих карточек при открытии Obsidian',
        ],
        runNow: ['Sync now', 'Синхронизировать сейчас'],
        how: ['How it works', 'Как это работает'],
    };
    return values[key]?.[ru ? 1 : 0] ?? key;
}

export function renderSteamSyncSettings(context: SettingsSectionContext, container: HTMLElement): void {
    let activeTab: SteamSyncTab = 'setup';

    createSyncSectionHeader(container, label(context, 'title'));
    container.createDiv({ cls: 'lorebase-steam-sync-subtitle', text: label(context, 'subtitle') });

    const root = container.createDiv({ cls: 'lorebase-steam-sync' });
    const providerHeader = root.createDiv({ cls: 'lorebase-sync-provider-header' });
    const providerTitle = providerHeader.createDiv({ cls: 'lorebase-sync-provider-title' });
    const providerTitleIcon = providerTitle.createSpan({ cls: 'lorebase-sync-provider-title-icon' });
    setIcon(providerTitleIcon, 'gamepad-2');
    providerTitle.createSpan({ text: label(context, 'steamSettings') });
    const tabs = root.createDiv({ cls: 'lorebase-steam-sync-tabs' });
    const body = root.createDiv({ cls: 'lorebase-steam-sync-body' });

    const save = async (): Promise<void> => {
        await context.plugin.saveSettings();
    };

    const render = (): void => {
        tabs.empty();
        body.empty();
        const tabDefs: Array<{ id: SteamSyncTab; text: string }> = [
            { id: 'setup', text: label(context, 'setup') },
            { id: 'import', text: label(context, 'import') },
            { id: 'sync', text: label(context, 'sync') },
        ];

        for (const tab of tabDefs) {
            const button = tabs.createEl('button', {
                cls: 'lorebase-steam-sync-tab',
                text: tab.text,
                attr: { type: 'button' },
            });
            button.toggleClass('is-active', tab.id === activeTab);
            button.addEventListener('click', () => {
                activeTab = tab.id;
                render();
            });
        }

        if (activeTab === 'setup') renderSetupTab(context, body, save);
        if (activeTab === 'import') renderImportTab(context, body, save);
        if (activeTab === 'sync') renderSyncTab(context, body, save);
    };

    render();
}

function createSyncSectionHeader(container: HTMLElement, text: string): void {
    const header = container.createEl('h2', { cls: 'lorebase-settings-section-title' });
    const icon = header.createSpan({ cls: 'lorebase-settings-section-icon' });
    setIcon(icon, 'refresh-cw');
    header.createSpan({ text });
}

function createApiKeyHelp(context: SettingsSectionContext, setting: Setting, container: HTMLElement): void {
    setting.nameEl.addClass('lorebase-steam-sync-help-label');
    const helpButton = setting.nameEl.createEl('button', {
        cls: 'lorebase-steam-sync-help-button',
        attr: {
            type: 'button',
            title: label(context, 'apiKeyHelp'),
            'aria-label': label(context, 'apiKeyHelp'),
            'aria-expanded': 'false',
        },
    });
    setIcon(helpButton, 'circle-help');

    const helpPanel = container.createDiv({ cls: 'lorebase-steam-sync-api-help is-hidden' });
    helpPanel.createDiv({ cls: 'lorebase-steam-sync-api-help-text', text: label(context, 'apiKeyHelpText') });
    const openButton = helpPanel.createEl('button', {
        cls: 'lorebase-steam-sync-api-help-link',
        text: label(context, 'apiKeyHelpOpen'),
        attr: { type: 'button' },
    });
    openButton.addEventListener('click', () => {
        window.open('https://steamcommunity.com/dev/apikey', '_blank', 'noopener');
    });

    helpButton.addEventListener('click', () => {
        const expanded = helpButton.getAttr('aria-expanded') === 'true';
        helpButton.setAttr('aria-expanded', String(!expanded));
        helpPanel.toggleClass('is-hidden', expanded);
    });
}

function renderSetupTab(context: SettingsSectionContext, body: HTMLElement, save: () => Promise<void>): void {
    const settings = context.plugin.settings.steamSync;
    const connection = body.createDiv({ cls: 'lorebase-steam-sync-panel' });
    createPanelTitle(connection, 'key-round', label(context, 'connection'));

    const steamIdSetting = new Setting(connection)
        .setName(label(context, 'steamId'))
        .addText(text => {
            text
                .setPlaceholder(label(context, 'steamIdPlaceholder'))
                .setValue(settings.steamId)
                .onChange(async (value) => {
                    settings.steamId = value.trim();
                    await save();
                });
        });
    steamIdSetting.settingEl.addClass('lorebase-steam-sync-field-row');

    const apiKeySetting = new Setting(connection)
        .setName(label(context, 'apiKey'))
        .addText(text => {
            text
                .setPlaceholder(label(context, 'apiKeyPlaceholder'))
                .setValue(settings.apiKey)
                .onChange(async (value) => {
                    settings.apiKey = value.trim();
                    await save();
                });
        });
    apiKeySetting.settingEl.addClass('lorebase-steam-sync-field-row');
    createApiKeyHelp(context, apiKeySetting, connection);

    const testSetting = new Setting(connection)
        .addButton(button => {
            button
                .setButtonText(`${label(context, 'test')} ↗`)
                .onClick(() => {
                    void (async (): Promise<void> => {
                    try {
                        const service = context.plugin.getSteamSyncService();
                        const count = await service?.testConnection(settings);
                        const warnings = service?.consumeWarnings() ?? [];
                        for (const warning of warnings) {
                            new Notice(`Steam Sync: ${warning}`, 6000);
                        }
                        new Notice(`${label(context, 'testOk')}: ${count ?? 0}`);
                    } catch (error) {
                        console.error('[Steam Sync] Connection test failed:', error);
                        const message = error instanceof Error ? `: ${error.message}` : '';
                        new Notice(`${label(context, 'testFail')}${message}`);
                    }
                    })();
                });
        });
    testSetting.settingEl.addClass('lorebase-steam-sync-action-row');

    const importPanel = body.createDiv({ cls: 'lorebase-steam-sync-panel' });
    createPanelTitle(importPanel, 'sliders-horizontal', label(context, 'whatImport'));
    const cards = importPanel.createDiv({ cls: 'lorebase-steam-sync-card-grid' });
    createToggleCard(cards, 'gamepad-2', label(context, 'library'), label(context, 'libraryDesc'), settings.importOwnedGames, async (value) => {
        settings.importOwnedGames = value;
        await save();
    });
    createToggleCard(cards, 'bookmark', label(context, 'wishlist'), label(context, 'wishlistDesc'), settings.importWishlist, async (value) => {
        settings.importWishlist = value;
        await save();
    });
}

function renderImportTab(context: SettingsSectionContext, body: HTMLElement, save: () => Promise<void>): void {
    const settings = context.plugin.settings.steamSync;
    const duplicateRow = body.createDiv({ cls: 'lorebase-steam-sync-inline-setting' });
    const duplicateLabel = duplicateRow.createDiv({ cls: 'lorebase-steam-sync-inline-label' });
    const duplicateIcon = duplicateLabel.createSpan({ cls: 'lorebase-steam-sync-panel-icon' });
    setIcon(duplicateIcon, 'copy-check');
    duplicateLabel.createSpan({ text: label(context, 'duplicates') });
    createLorebaseDropdown<SteamSyncDuplicateMode>(
        duplicateRow.createDiv({ cls: 'lorebase-steam-sync-inline-control' }),
        [
            { value: 'skip', label: label(context, 'skip') },
            { value: 'update', label: label(context, 'update') },
            { value: 'ask', label: label(context, 'ask') },
        ],
        settings.duplicateMode,
        async (value) => {
            settings.duplicateMode = value;
            await save();
        }
    );

    const fieldsPanel = body.createDiv({ cls: 'lorebase-steam-sync-panel' });
    createPanelTitle(fieldsPanel, 'table-properties', label(context, 'steamData'));
    fieldsPanel.createDiv({ cls: 'lorebase-steam-sync-help', text: label(context, 'steamDataDesc') });
    const cards = fieldsPanel.createDiv({ cls: 'lorebase-steam-sync-card-grid is-compact' });
    createToggleCard(cards, 'clock', label(context, 'playtime'), '', settings.fields.playtime, async (value) => {
        settings.fields.playtime = value;
        await save();
    });
    createToggleCard(cards, 'tags', label(context, 'genres'), '', settings.fields.genres, async (value) => {
        settings.fields.genres = value;
        await save();
    });
    createToggleCard(cards, 'calendar', label(context, 'releaseDate'), '', settings.fields.releaseDate, async (value) => {
        settings.fields.releaseDate = value;
        await save();
    });
}

function renderSyncTab(context: SettingsSectionContext, body: HTMLElement, save: () => Promise<void>): void {
    const settings = context.plugin.settings.steamSync;
    const syncPanel = body.createDiv({ cls: 'lorebase-steam-sync-panel' });
    createPanelTitle(syncPanel, 'refresh-cw', label(context, 'autoSync'));

    const autoPlaytimeSetting = new Setting(syncPanel)
        .setName(label(context, 'autoPlaytime'))
        .setDesc(label(context, 'autoPlaytimeDesc'))
        .addToggle(toggle => {
            toggle
                .setValue(settings.autoSyncPlaytimeOnStartup)
                .onChange(async (value) => {
                    settings.autoSyncPlaytimeOnStartup = value;
                    await save();
                });
        });
    autoPlaytimeSetting.settingEl.addClass('lorebase-steam-sync-plain-row');

    const runNowSetting = new Setting(syncPanel)
        .addButton(button => {
            button
                .setButtonText(label(context, 'runNow'))
                .setCta()
                .onClick(() => {
                    void context.plugin.runSteamSync();
                });
        });
    runNowSetting.settingEl.addClass('lorebase-steam-sync-action-row');

    const howPanel = body.createDiv({ cls: 'lorebase-steam-sync-panel' });
    createPanelTitle(howPanel, 'list-tree', label(context, 'how'));
    const steps = [
        ['Steam API -> game list', 'GetOwnedGames + wishlistdata: appid, name, playtime_forever.'],
        ['Steam Store enrichment', 'Genres, poster, description and release date through appdetails.'],
        ['Markdown cards', 'Create or update notes using the same game template as manual import.'],
    ];
    steps.forEach(([title, desc], index) => {
        const row = howPanel.createDiv({ cls: 'lorebase-steam-sync-step' });
        row.createSpan({ cls: 'lorebase-steam-sync-step-index', text: String(index + 1) });
        const text = row.createDiv();
        text.createDiv({ cls: 'lorebase-steam-sync-step-title', text: title });
        text.createDiv({ cls: 'lorebase-steam-sync-step-desc', text: desc });
    });
}

function createPanelTitle(container: HTMLElement, iconName: string, text: string): void {
    const title = container.createDiv({ cls: 'lorebase-steam-sync-panel-title' });
    const icon = title.createSpan({ cls: 'lorebase-steam-sync-panel-icon' });
    setIcon(icon, iconName);
    title.createSpan({ text });
}

function createToggleCard(
    container: HTMLElement,
    iconName: string,
    title: string,
    desc: string,
    value: boolean,
    onChange: (value: boolean) => Promise<void>
): void {
    const button = container.createEl('button', {
        cls: 'lorebase-steam-sync-card-toggle',
        attr: { type: 'button' },
    });
    button.toggleClass('is-active', value);
    const text = button.createSpan({ cls: 'lorebase-steam-sync-card-text' });
    const titleEl = text.createSpan({ cls: 'lorebase-steam-sync-card-title' });
    const icon = titleEl.createSpan({ cls: 'lorebase-steam-sync-card-icon' });
    setIcon(icon, iconName);
    titleEl.createSpan({ text: title });
    if (desc) text.createSpan({ cls: 'lorebase-steam-sync-card-desc', text: desc });
    button.addEventListener('click', () => {
        const next = !button.hasClass('is-active');
        button.toggleClass('is-active', next);
        void onChange(next);
    });
}
