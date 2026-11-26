import { AniListSyncHelpModal } from '../modals/AniListSyncHelpModal';
import { AniListLinkModal } from '../modals/AniListLinkModal';
import { createSyncWorkspace, renderSyncButton, renderSyncConnectionStatus, renderSyncConnectionTest, renderSyncOperations, renderSyncStartup } from './syncDisclosure';
import { Modal, Notice, setIcon } from 'obsidian';
import type { SettingsSectionContext } from './sections/types';

function label(context: SettingsSectionContext, key: string): string {
    const language = context.plugin.settings.language;
    const values: Record<string, [string, string, string]> = {
        title: ['AniList Sync', 'Синхронизация AniList', 'Синхронізація AniList'],
        providerSubtitle: ['Anime and manga library', 'Библиотека аниме и манги', 'Бібліотека аніме та манґи'],
        setup: ['Setup', 'Настройка', 'Налаштування'],
        setupDesc: ['Account and access token', 'Аккаунт и токен доступа', 'Акаунт і токен доступу'],
        import: ['Import', 'Импорт', 'Імпорт'],
        importTabDesc: ['Select titles', 'Выбор произведений', 'Вибір творів'],
        sync: ['Sync', 'Синхронизация', 'Синхронізація'],
        syncTabDesc: ['Two-way updates', 'Обмен изменениями', 'Обмін змінами'],
        connection: ['Connection', 'Подключение', 'Підключення'],
        backToSettings: ['Back to settings', 'Вернуться к настройкам', 'Повернутися до налаштувань'],
        copyFailed: ['Could not copy the URL. Select and copy it manually.', 'Не удалось скопировать адрес. Выделите и скопируйте его вручную.', 'Не вдалося скопіювати адресу. Виділіть і скопіюйте її вручну.'],
        automatic: ['Auto-detect', 'Определится автоматически', 'Визначиться автоматично'],
        guideTitle: ['How to connect AniList', 'Как подключить AniList', 'Як підключити AniList'],
        step1: ['Create an AniList application', 'Создайте приложение AniList', 'Створіть застосунок AniList'],
        step1Desc: ['Open Developer Settings and choose Create New Application. Name it LOREBASE.', 'Откройте настройки разработчика и нажмите Create New Application. Назовите приложение LOREBASE.', 'Відкрийте налаштування розробника та натисніть Create New Application. Назвіть застосунок LOREBASE.'],
        openDeveloper: ['Open Developer Settings', 'Открыть Developer Settings', 'Відкрити Developer Settings'],
        step2: ['Set the Redirect URL', 'Укажите Redirect URL', 'Вкажіть Redirect URL'],
        step2Desc: ['Paste this exact address into the application Redirect URL field.', 'Вставьте этот адрес без изменений в поле Redirect URL приложения.', 'Вставте цю адресу без змін у поле Redirect URL застосунку.'],
        copy: ['Copy', 'Копировать', 'Копіювати'],
        copied: ['Redirect URL copied', 'Redirect URL скопирован', 'Redirect URL скопійовано'],
        step3: ['Paste the Client ID', 'Вставьте Client ID', 'Вставте Client ID'],
        step3Desc: ['Save the AniList application, copy its Client ID, and paste it into the Client ID field in Sync settings.', 'Сохраните приложение AniList, скопируйте его Client ID и вставьте в поле Client ID в настройках Sync.', 'Збережіть застосунок AniList, скопіюйте його Client ID і вставте в поле Client ID у налаштуваннях Sync.'],
        step4: ['Authorize and paste the token', 'Авторизуйтесь и вставьте токен', 'Авторизуйтеся та вставте токен'],
        step4Desc: ['Choose Sign in to AniList, approve access, and paste the token from AniList into Access token.', 'Нажмите «Войти через AniList», подтвердите доступ и вставьте токен со страницы AniList в поле «Токен доступа».', 'Натисніть «Увійти через AniList», підтвердьте доступ і вставте токен зі сторінки AniList у поле «Токен доступу».'],
        connected: ['Token entered', 'Токен указан', 'Токен указано'],
        notConnected: ['Not connected yet', 'Пока не подключено', 'Ще не підключено'],
        clientId: ['Client ID', 'Client ID', 'Client ID'],
        token: ['Access token', 'Токен доступа', 'Токен доступу'],
        username: ['Username', 'Имя пользователя', 'Ім’я користувача'],
        usernameDesc: ['Detected automatically when left blank.', 'Определяется автоматически, если поле пустое.', 'Визначається автоматично, якщо поле порожнє.'],
        authorize: ['Sign in to AniList', 'Войти через AniList', 'Увійти через AniList'],
        test: ['Test connection', 'Проверить подключение', 'Перевірити підключення'],
        testOk: ['AniList access verified', 'Доступ к AniList подтверждён', 'Доступ до AniList підтверджено'],
        testAccount: ['AniList account', 'Аккаунт AniList', 'Акаунт AniList'],
        testFail: ['Could not connect to AniList', 'Не удалось подключиться к AniList', 'Не вдалося підключитися до AniList'],
        importTitle: ['Import selected entries', 'Импорт выбранных записей', 'Імпорт вибраних записів'],
        importInfo: [
            'Choose entries from your anime and manga lists.',
            'Выбор записей из списков аниме и манги.',
            'Вибір записів зі списків аніме та манґи.',
        ],
        review: ['Import from AniList', 'Импорт из AniList', 'Імпорт з AniList'],
        syncTitle: ['Two-way sync', 'Двусторонняя синхронизация', 'Двостороння синхронізація'],
        syncInfo: [
            'Exchange changes between LOREBASE and AniList.',
            'Обмен изменениями между LOREBASE и AniList.',
            'Обмін змінами між LOREBASE та AniList.',
        ],
        startup: ['Sync on startup', 'Синхронизировать при запуске', 'Синхронізувати під час запуску'],
        startupDesc: ['Run AniList sync when Obsidian opens.', 'Запускать AniList Sync при открытии Obsidian.', 'Запускати AniList Sync під час відкриття Obsidian.'],
        run: ['Sync now', 'Синхронизировать', 'Синхронізувати'],
        link: ['Link notes', 'Связать заметки', 'Пов’язати нотатки'],
        linkInfo: ['Match notes in your vault with entries on AniList.', 'Сопоставьте заметки в хранилище с записями AniList.', 'Зіставте нотатки в сховищі із записами AniList.'],
    };
    const index = language === 'ru' ? 1 : language === 'uk' ? 2 : 0;
    return values[key]?.[index] ?? key;
}

export function renderAniListSyncSettings(
    context: SettingsSectionContext,
    container: HTMLElement,
    options: { embedded?: boolean; statusHost?: HTMLElement } = {}
): void {
    const root = container.createDiv({
        cls: `lorebase-steam-sync lorebase-anilist-sync ${options.embedded ? 'is-embedded' : ''}`,
    });
    const header = options.statusHost ?? root.createDiv({ cls: 'lorebase-sync-provider-header' });
    if (!options.statusHost) {
        const identity = header.createDiv({ cls: 'lorebase-sync-provider-identity' });
        const icon = identity.createSpan({ cls: 'lorebase-sync-provider-title-icon is-anilist' });
        setIcon(icon, 'sparkles');
        const copy = identity.createDiv({ cls: 'lorebase-sync-provider-copy' });
        copy.createDiv({ cls: 'lorebase-sync-provider-title', text: label(context, 'title') });
        copy.createDiv({ cls: 'lorebase-sync-provider-subtitle', text: label(context, 'providerSubtitle') });
    }
    const setStatus = renderSyncConnectionStatus(header);
    const updateStatus = (): void => {
        const configured = Boolean(context.plugin.settings.anilistSync.accessToken.trim());
        setStatus(configured, label(context, configured ? 'connected' : 'notConnected'));
    };
    updateStatus();
    const { operations, navigation, addPage } = createSyncWorkspace(root);
    renderSync(context, operations);
    renderSetup(context, addPage(label(context, 'connection'), 'user-round', label(context, 'setupDesc')), updateStatus);
    const help = renderSyncButton(navigation, 'circle-help', context.plugin.settings.language === 'ru'
        ? 'Как это работает' : context.plugin.settings.language === 'uk' ? 'Як це працює' : 'How it works', 'link');
    help.addEventListener('click', () => new AniListSyncHelpModal(context.app, context.plugin.settings.language).open());
}

function renderSetup(context: SettingsSectionContext, body: HTMLElement, updateStatus: () => void): void {
    const settings = context.plugin.settings.anilistSync;
    const fields = body.createDiv({ cls: 'lorebase-sync-fields lorebase-anilist-account-fields' });
    createTextField(fields, 'fingerprint', label(context, 'clientId'), 'AniList Client ID', settings.clientId, (value) => {
        if (settings.clientId !== value.trim()) settings.lastSynced = {};
        settings.clientId = value.trim();
        resetTest();
        void context.plugin.saveSettings();
    });
    const usernameInput = createTextField(fields, 'user-round', label(context, 'username'), label(context, 'automatic'), settings.username, (value) => {
        if (settings.username !== value.trim()) settings.lastSynced = {};
        settings.username = value.trim();
        void context.plugin.saveSettings();
    }, false, label(context, 'usernameDesc'));
    createTextField(fields, 'key-round', label(context, 'token'), 'AniList access token', settings.accessToken, (value) => {
        if (settings.accessToken !== value.trim()) {
            settings.lastSynced = {}; settings.username = ''; usernameInput.value = '';
        }
        settings.accessToken = value.trim();
        updateStatus();
        resetTest();
        void context.plugin.saveSettings();
    }, true);

    const actions = body.createDiv({ cls: 'lorebase-sync-surface-actions' });
    const authorize = renderSyncButton(actions, 'external-link', label(context, 'authorize'));
    authorize.addEventListener('click', () => void context.plugin.authorizeAniList());
    const test = renderSyncButton(actions, 'wifi', label(context, 'test'), 'primary');
    const resetTest = renderSyncConnectionTest(body, test, label(context, 'testFail'), async () => {
        const service = context.plugin.getAniListSyncService();
        if (!service) throw new Error();
        const snapshot = { ...settings };
        const username = await service.testConnection(snapshot);
        if (settings.accessToken === snapshot.accessToken && settings.clientId === snapshot.clientId && !settings.username) {
            settings.username = username;
            usernameInput.value = username;
            await context.plugin.saveSettings();
        }
        return { message: label(context, 'testOk'), metric: { label: label(context, 'testAccount'), value: username } };
    });
    const help = renderSyncButton(actions, 'circle-help', label(context, 'guideTitle'), 'link');
    help.addEventListener('click', () => openConnectionGuide(context));
}

function renderSync(context: SettingsSectionContext, body: HTMLElement): void {
    const settings = context.plugin.settings.anilistSync;
    renderSyncOperations(body, [
        {
            label: label(context, 'review'), icon: 'download', description: label(context, 'importInfo'),
            run: () => context.plugin.runAniListImport(),
        },
        {
            label: label(context, 'run'), icon: 'refresh-cw', description: label(context, 'syncInfo'),
            run: () => context.plugin.runAniListSync(),
        },
        {
            label: label(context, 'link'), icon: 'link-2', description: label(context, 'linkInfo'),
            run: () => {
                const service = context.plugin.getAniListSyncService();
                if (service) new AniListLinkModal(context.app, service, context.plugin.settings,
                    () => context.plugin.saveSettings()).open();
            },
        },
    ]);
    renderSyncStartup(body, label(context, 'startup'), label(context, 'startupDesc'), settings.autoSyncOnStartup, (value) => {
        settings.autoSyncOnStartup = value;
        void context.plugin.saveSettings();
    });
    const deletionCopy = {
        en: ['Sync deletions', 'Off by default. Local deletions require an observed delete event; remote removals may move unchanged linked notes to your configured trash.'],
        ru: ['Синхронизировать удаления', 'По умолчанию выключено. Локальное удаление требует события удаления файла; удалённые записи могут переместить неизменённые связанные заметки в выбранную корзину.'],
        uk: ['Синхронізувати видалення', 'Типово вимкнено. Локальне видалення потребує події видалення файлу; віддалені видалення можуть перемістити незмінені пов’язані нотатки до вибраного кошика.'],
        'zh-CN': ['同步删除', '默认关闭。本地删除需要明确的文件删除事件；远程删除可能将未修改的关联笔记移至所选回收站。'],
    }[context.plugin.settings.language];
    renderSyncStartup(body, deletionCopy[0], deletionCopy[1], settings.syncDeletions === true, value => {
        settings.syncDeletions = value; void context.plugin.saveSettings();
    });
}

function createTextField(
    container: HTMLElement,
    iconId: string,
    title: string,
    placeholder: string,
    value: string,
    onChange: (value: string) => void,
    password = false,
    hint = ''
): HTMLInputElement {
    const root = container.createDiv({ cls: 'lorebase-sync-field' });
    const labelRow = root.createDiv({ cls: 'lorebase-sync-field-label-row' });
    labelRow.createSpan({ cls: 'lorebase-sync-field-label', text: title });
    if (hint) {
        const help = labelRow.createEl('button', {
            cls: 'lorebase-sync-inline-help',
            attr: { type: 'button', 'aria-label': hint, title: hint },
        });
        setIcon(help, 'circle-help');
        help.addEventListener('click', () => new Notice(hint));
    }
    const control = root.createDiv({ cls: 'lorebase-sync-field-control' });
    const icon = control.createSpan({ cls: 'lorebase-sync-field-icon' });
    setIcon(icon, iconId);
    const input = control.createEl('input', {
        cls: 'lorebase-sync-field-input',
        attr: { type: password ? 'password' : 'text', placeholder, 'aria-label': title },
    });
    input.value = value;
    input.addEventListener('input', () => onChange(input.value));
    return input;
}

function openConnectionGuide(context: SettingsSectionContext): void {
    const modal = new Modal(context.app);
    modal.setTitle(label(context, 'guideTitle'));
    modal.modalEl.addClass('lorebase-anilist-help-modal');
    const guideSteps = modal.contentEl.createDiv({ cls: 'lorebase-anilist-help-steps' });
    const step1 = createGuideStep(guideSteps, 1, label(context, 'step1'), label(context, 'step1Desc'));
    const openDeveloper = step1.createEl('button', {
        cls: 'lorebase-anilist-guide-action',
        text: label(context, 'openDeveloper'),
        attr: { type: 'button' },
    });
    openDeveloper.addEventListener('click', () => window.open('https://anilist.co/settings/developer', '_blank', 'noopener'));

    const redirectUrl = 'https://anilist.co/api/v2/oauth/pin';
    const step2 = createGuideStep(guideSteps, 2, label(context, 'step2'), label(context, 'step2Desc'));
    const redirectRow = step2.createDiv({ cls: 'lorebase-anilist-redirect-row' });
    redirectRow.createEl('code', { text: redirectUrl });
    const copy = redirectRow.createEl('button', {
        cls: 'lorebase-anilist-guide-action is-icon',
        attr: { type: 'button', title: label(context, 'copy'), 'aria-label': label(context, 'copy') },
    });
    setIcon(copy, 'copy');
    copy.addEventListener('click', () => {
        void navigator.clipboard.writeText(redirectUrl)
            .then(() => new Notice(label(context, 'copied')))
            .catch(() => new Notice(label(context, 'copyFailed')));
    });
    createGuideStep(guideSteps, 3, label(context, 'step3'), label(context, 'step3Desc'));
    createGuideStep(guideSteps, 4, label(context, 'step4'), label(context, 'step4Desc'));


    const footer = modal.contentEl.createDiv({ cls: 'lorebase-anilist-help-footer' });
    const close = footer.createEl('button', {
        cls: 'mod-cta', text: label(context, 'backToSettings'), attr: { type: 'button' },
    });
    close.addEventListener('click', () => modal.close());
    modal.open();
}

function createGuideStep(container: HTMLElement, index: number, title: string, description: string): HTMLElement {
    const row = container.createDiv({ cls: 'lorebase-anilist-guide-step' });
    row.createSpan({ cls: 'lorebase-anilist-guide-index', text: String(index) });
    const content = row.createDiv({ cls: 'lorebase-anilist-guide-content' });
    content.createDiv({ cls: 'lorebase-anilist-guide-step-title', text: title });
    content.createDiv({ cls: 'lorebase-anilist-guide-step-description', text: description });
    return content;
}
