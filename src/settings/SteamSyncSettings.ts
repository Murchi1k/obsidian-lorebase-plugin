import { createSyncWorkspace, renderSyncButton, renderSyncConnectionStatus, renderSyncConnectionTest, renderSyncOperations, renderSyncStartup } from './syncDisclosure';
import { setIcon } from 'obsidian';
import type { SteamSyncDuplicateMode } from '../types';
import type { SettingsSectionContext } from './sections/types';

function label(context: SettingsSectionContext, key: string): string {
    const language = context.plugin.settings.language;
    const ru = language === 'ru';
    const values: Record<string, [string, string]> = {
        title: ['Sync', 'Sync'],
        subtitle: ['Connect external libraries and keep LOREBASE data in sync.', 'Подключайте внешние библиотеки и синхронизируйте данные LOREBASE.'],
        steamSettings: ['Steam settings', 'Настройки Steam'],
        providerSubtitle: ['Games, library and playtime', 'Игры, библиотека и время в игре'],
        connected: ['Profile entered', 'Профиль указан'],
        notConfigured: ['Not configured', 'Не настроено'],
        setup: ['Setup', 'Настройка'],
        setupDesc: ['Account access', 'Доступ к аккаунту'],
        import: ['Import', 'Импорт'],
        importTabDesc: ['Content rules', 'Правила импорта'],
        reviewImport: ['Preview the library and wishlist.', 'Предпросмотр библиотеки и вишлиста.'],
        sync: ['Sync', 'Синхронизация'],
        syncTabDesc: ['Automatic updates', 'Автообновление'],
        connection: ['Connection', 'Подключение'],
        cors: [
            'Connect your Steam profile. An API key may be required to import your library.',
            'Подключите профиль Steam. Для импорта библиотеки может потребоваться API Key.',
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
        testOk: ['Steam data received', 'Данные Steam получены'],
        testWarning: ['Steam check completed with warnings', 'Проверка Steam завершена с предупреждениями'],
        testGames: ['Unique games in selected import sources', 'Уникальных игр в выбранных источниках импорта'],
        testNoSources: ['Enable the library or wishlist in Import rules to check access to Steam data.', 'Включите библиотеку или вишлист в правилах импорта, чтобы проверить доступ к данным Steam.'],
        updateTracking: ['Time and achievements', 'Время и достижения'],
        trackingDesc: ['Update games already linked to Steam.', 'Обновление игр, связанных со Steam.'],
        importGames: ['Import games', 'Импорт игр'],
        importPageDesc: ['Sources, duplicates and note fields', 'Источники, дубликаты и поля заметок'],
        testFail: ['Steam connection failed', 'Не удалось подключиться к Steam'],
        whatImport: ['What to import', 'Что импортировать'],
        library: ['Library', 'Библиотека'],
        libraryDesc: ['Owned and free games', 'Все купленные и бесплатные игры'],
        wishlist: ['Wishlist', 'Вишлист'],
        wishlistDesc: ['Games from the Steam wishlist', 'Игры из списка желаемого Steam'],
        duplicates: ['If a note already exists', 'Если заметка уже существует'],
        skip: ['Skip existing', 'Пропустить существующие'],
        update: ['Update data', 'Обновить данные'],
        ask: ['Ask', 'Спрашивать'],
        steamData: ['Note fields', 'Поля заметки'],
        steamDataDesc: [
            'Choose which Steam fields are written to notes.',
            'Выберите поля Steam для записи в заметки.',
        ],
        playtime: ['Playtime', 'Время в игре'],
        playtimeDesc: ['Library minutes', 'Минуты из библиотеки'],
        genres: ['Genres', 'Жанры'],
        genresDesc: ['Store genres', 'Жанры из Steam'],
        releaseDate: ['Release date', 'Дата релиза'],
        releaseDateDesc: ['Date and year', 'Дата и год'],
        autoSync: ['Auto sync', 'Автосинхронизация'],
        autoPlaytime: ['Update playtime on startup', 'Обновлять время в игре при запуске'],
        autoPlaytimeDesc: [
            'Update playtime in existing game notes when Obsidian opens',
            'При открытии Obsidian обновляет время в связанных со Steam заметках.',
        ],
        runNow: ['Sync now', 'Синхронизировать сейчас'],
        how: ['How it works', 'Как это работает'],
    };
    const ukValues: Record<string, string> = {
        title: 'Sync',
        subtitle: 'Підключайте зовнішні бібліотеки та синхронізуйте дані LOREBASE.',
        steamSettings: 'Налаштування Steam',
        providerSubtitle: 'Ігри, бібліотека та час у грі',
        connected: 'Профіль указано',
        notConfigured: 'Не налаштовано',
        setup: 'Налаштування',
        setupDesc: 'Доступ до акаунта',
        import: 'Імпорт',
        importTabDesc: 'Правила імпорту',
        reviewImport: 'Попередній перегляд бібліотеки та списку бажаного.',
        sync: 'Синхронізація',
        syncTabDesc: 'Автооновлення',
        connection: 'Підключення',
        cors: 'Підключіть профіль Steam. Для імпорту бібліотеки може знадобитися API Key.',
        steamId: 'URL профілю Steam',
        steamIdPlaceholder: 'https://steamcommunity.com/profiles/... або /id/name',
        apiKey: 'API Key',
        apiKeyPlaceholder: 'Steam Web API Key',
        apiKeyHelp: 'Як отримати API Key',
        apiKeyHelpText: 'Відкрийте сторінку Steam Web API, увійдіть в акаунт, введіть будь-який домен і скопіюйте створений ключ.',
        apiKeyHelpOpen: 'Відкрити сторінку Steam API',
        test: 'Перевірити підключення',
        testOk: 'Дані Steam отримано',
        testWarning: 'Перевірку Steam завершено з попередженнями',
        testGames: 'Унікальних ігор у вибраних джерелах імпорту',
        testNoSources: 'Увімкніть бібліотеку або список бажаного в правилах імпорту, щоб перевірити доступ до даних Steam.',
        updateTracking: 'Час і досягнення',
        trackingDesc: 'Оновлення ігор, пов’язаних зі Steam.',
        importGames: 'Імпорт ігор',
        importPageDesc: 'Джерела, дублікати й поля нотаток',
        testFail: 'Не вдалося підключитися до Steam',
        whatImport: 'Що імпортувати',
        library: 'Бібліотека',
        libraryDesc: 'Куплені та безкоштовні ігри',
        wishlist: 'Бажане',
        wishlistDesc: 'Ігри зі списку бажаного Steam',
        duplicates: 'Якщо нотатка вже існує',
        skip: 'Пропускати існуючі',
        update: 'Оновлювати дані',
        ask: 'Запитувати',
        steamData: 'Поля нотатки',
        steamDataDesc: 'Виберіть, які поля Steam записуються в нотатки.',
        playtime: 'Час у грі',
        playtimeDesc: 'Хвилини з бібліотеки',
        genres: 'Жанри',
        genresDesc: 'Жанри зі Steam',
        releaseDate: 'Дата релізу',
        releaseDateDesc: 'Дата і рік',
        autoSync: 'Автосинхронізація',
        autoPlaytime: 'Оновлювати час у грі під час запуску',
        autoPlaytimeDesc: 'Під час відкриття Obsidian оновлює час у нотатках, пов’язаних зі Steam.',
        runNow: 'Синхронізувати зараз',
        how: 'Як це працює',
    };
    if (language === 'uk') return ukValues[key] ?? values[key]?.[0] ?? key;
    return values[key]?.[ru ? 1 : 0] ?? key;
}

export function renderSteamSyncSettings(
    context: SettingsSectionContext,
    container: HTMLElement,
    options: { embedded?: boolean; statusHost?: HTMLElement } = {}
): void {

    if (!options.embedded) {
        createSyncSectionHeader(container, label(context, 'title'));
        container.createDiv({ cls: 'lorebase-steam-sync-subtitle', text: label(context, 'subtitle') });
    }

    const root = container.createDiv({
        cls: `lorebase-steam-sync ${options.embedded ? 'is-embedded' : ''}`,
    });
    const providerHeader = options.statusHost ?? root.createDiv({ cls: 'lorebase-sync-provider-header' });
    if (!options.statusHost) {
        const identity = providerHeader.createDiv({ cls: 'lorebase-sync-provider-identity' });
        const icon = identity.createSpan({ cls: 'lorebase-sync-provider-title-icon is-steam' });
        setIcon(icon, 'gamepad-2');
        const copy = identity.createDiv({ cls: 'lorebase-sync-provider-copy' });
        copy.createDiv({ cls: 'lorebase-sync-provider-title', text: label(context, 'steamSettings') });
        copy.createDiv({ cls: 'lorebase-sync-provider-subtitle', text: label(context, 'providerSubtitle') });
    }
    const setStatus = renderSyncConnectionStatus(providerHeader);
    const updateStatus = (): void => {
        const configured = Boolean(context.plugin.settings.steamSync.steamId.trim());
        setStatus(configured, label(context, configured ? 'connected' : 'notConfigured'));
    };
    updateStatus();
    const { operations, addPage } = createSyncWorkspace(root);

    const save = async (): Promise<void> => {
        await context.plugin.saveSettings();
    };

    renderSyncOptions(context, operations, save);
    const resetTest = renderConnection(context, addPage(label(context, 'connection'), 'user-round', label(context, 'setupDesc')), save, updateStatus);
    renderImportOptions(context, addPage(label(context, 'importTabDesc'), 'sliders-horizontal', label(context, 'importPageDesc')), save, resetTest);
}

function createSyncSectionHeader(container: HTMLElement, text: string): void {
    const header = container.createEl('h2', { cls: 'lorebase-settings-section-title' });
    const icon = header.createSpan({ cls: 'lorebase-settings-section-icon' });
    setIcon(icon, 'refresh-cw');
    header.createSpan({ text });
}

function renderConnection(context: SettingsSectionContext, body: HTMLElement, save: () => Promise<void>, updateStatus: () => void): () => void {
    const settings = context.plugin.settings.steamSync;
    const fields = body.createDiv({ cls: 'lorebase-sync-fields lorebase-steam-account-fields' });
    createTextField(fields, 'link-2', label(context, 'steamId'), label(context, 'steamIdPlaceholder'), settings.steamId, (value) => {
        settings.steamId = value.trim();
        updateStatus();
        resetTest();
        void save();
    });
    const apiField = createTextField(fields, 'key-round', label(context, 'apiKey'), label(context, 'apiKeyPlaceholder'), settings.apiKey, (value) => {
        settings.apiKey = value.trim();
        resetTest();
        void save();
    }, true);
    const helpButton = apiField.labelRow.createEl('button', {
        cls: 'lorebase-sync-inline-help',
        attr: { type: 'button', title: label(context, 'apiKeyHelp'), 'aria-expanded': 'false' },
    });
    setIcon(helpButton, 'circle-help');
    const helpPanel = apiField.root.createDiv({ cls: 'lorebase-sync-field-help is-hidden' });
    helpPanel.createSpan({ text: label(context, 'apiKeyHelpText') });
    const helpLink = helpPanel.createEl('button', {
        cls: 'lorebase-sync-text-action', text: label(context, 'apiKeyHelpOpen'), attr: { type: 'button' },
    });
    helpLink.addEventListener('click', () => window.open('https://steamcommunity.com/dev/apikey', '_blank', 'noopener'));
    helpButton.addEventListener('click', () => {
        const expanded = helpButton.getAttribute('aria-expanded') === 'true';
        helpButton.setAttribute('aria-expanded', String(!expanded));
        helpPanel.toggleClass('is-hidden', expanded);
    });

    const actions = body.createDiv({ cls: 'lorebase-sync-surface-actions' });
    const testButton = renderSyncButton(actions, 'wifi', label(context, 'test'), 'primary');
    const resetTest = renderSyncConnectionTest(body, testButton, label(context, 'testFail'), async () => {
        const service = context.plugin.getSteamSyncService();
        if (!service) throw new Error();
        if (!settings.importOwnedGames && !settings.importWishlist) throw new Error(label(context, 'testNoSources'));
        const count = await service.testConnection({ ...settings });
        const warnings = service.consumeWarnings();
        return {
            message: label(context, warnings.length ? 'testWarning' : 'testOk'),
            metric: { label: label(context, 'testGames'), value: count.toLocaleString(context.plugin.settings.language) },
            warnings,
        };
    });
    return resetTest;
}

function renderImportOptions(context: SettingsSectionContext, body: HTMLElement, save: () => Promise<void>, resetTest: () => void): void {
    const settings = context.plugin.settings.steamSync;
    const layout = body.createDiv({ cls: 'lorebase-steam-import-layout' });
    const sources = layout.createDiv({ cls: 'lorebase-steam-import-row', attr: { role: 'group', 'aria-label': label(context, 'whatImport') } });
    sources.createSpan({ cls: 'lorebase-steam-import-label', text: label(context, 'whatImport'), attr: { 'aria-hidden': 'true' } });
    const sourceChoices = sources.createDiv({ cls: 'lorebase-steam-import-options is-sources' });
    for (const [key, name, desc] of [
        ['importOwnedGames', 'library', 'libraryDesc'],
        ['importWishlist', 'wishlist', 'wishlistDesc'],
    ] as const) {
        createImportToggle(sourceChoices, label(context, name), settings[key], value => {
            settings[key] = value;
            resetTest();
            void save();
        }, label(context, desc));
    }

    const duplicateLabel = layout.createEl('label', { cls: 'lorebase-steam-import-row' });
    duplicateLabel.createSpan({ cls: 'lorebase-steam-import-label', text: label(context, 'duplicates') });
    const duplicateSelect = duplicateLabel.createEl('select', { cls: 'dropdown lorebase-sync-select' });
    for (const value of ['skip', 'update', 'ask'] as SteamSyncDuplicateMode[]) {
        duplicateSelect.createEl('option', { value, text: label(context, value) });
    }
    duplicateSelect.value = settings.duplicateMode;
    duplicateSelect.addEventListener('change', () => {
        settings.duplicateMode = duplicateSelect.value as SteamSyncDuplicateMode;
        void save();
    });

    const fields = layout.createDiv({ cls: 'lorebase-steam-import-row', attr: { role: 'group', 'aria-label': label(context, 'steamData') } });
    fields.createSpan({ cls: 'lorebase-steam-import-label', text: label(context, 'steamData'), attr: { 'aria-hidden': 'true' } });
    const fieldChoices = fields.createDiv({ cls: 'lorebase-steam-import-options' });
    for (const key of ['playtime', 'genres', 'releaseDate'] as const) {
        createImportToggle(fieldChoices, label(context, key), settings.fields[key], value => {
            settings.fields[key] = value;
            void save();
        });
    }
}

function renderSyncOptions(context: SettingsSectionContext, body: HTMLElement, save: () => Promise<void>): void {
    const settings = context.plugin.settings.steamSync;
    renderSyncOperations(body, [
        {
            label: label(context, 'updateTracking'), icon: 'trophy', description: label(context, 'trackingDesc'),
            run: () => context.plugin.runSteamTrackingSync(),
        },
        {
            label: label(context, 'importGames'), icon: 'download', description: label(context, 'reviewImport'),
            run: () => context.plugin.runSteamSync(),
        },
    ]);
    renderSyncStartup(body, label(context, 'autoPlaytime'), label(context, 'autoPlaytimeDesc'), settings.autoSyncPlaytimeOnStartup, (value) => {
        settings.autoSyncPlaytimeOnStartup = value;
        void save();
    });
}

function createTextField(
    container: HTMLElement,
    iconName: string,
    title: string,
    placeholder: string,
    value: string,
    onChange: (value: string) => void,
    password = false
): { root: HTMLElement; labelRow: HTMLElement; input: HTMLInputElement } {
    const root = container.createDiv({ cls: 'lorebase-sync-field' });
    const labelRow = root.createDiv({ cls: 'lorebase-sync-field-label-row' });
    labelRow.createSpan({ cls: 'lorebase-sync-field-label', text: title });
    const control = root.createDiv({ cls: 'lorebase-sync-field-control' });
    const icon = control.createSpan({ cls: 'lorebase-sync-field-icon' });
    setIcon(icon, iconName);
    const input = control.createEl('input', {
        cls: 'lorebase-sync-field-input',
        attr: { type: password ? 'password' : 'text', placeholder, 'aria-label': title },
    });
    input.value = value;
    input.addEventListener('input', () => onChange(input.value));
    return { root, labelRow, input };
}

function createImportToggle(
    container: HTMLElement, title: string, value: boolean, onChange: (value: boolean) => void, description?: string
): void {
    const option = container.createEl('label', { cls: 'lorebase-steam-import-option' });
    const input = option.createEl('input', { attr: { type: 'checkbox' } });
    input.checked = value;
    const copy = option.createSpan();
    copy.createSpan({ text: title });
    if (description) copy.createSpan({ cls: 'setting-item-description', text: description });
    input.addEventListener('change', () => onChange(input.checked));
}
