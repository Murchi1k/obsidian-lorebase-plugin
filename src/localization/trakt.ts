import { i18n } from './index';
const copy = {
    title: ['Trakt synchronization', 'Синхронизация Trakt', 'Синхронізація Trakt', 'Trakt 同步'],
    subtitle: ['Movies, seasons and episodes', 'Фильмы, сезоны и серии', 'Фільми, сезони й серії', '电影、季和集'],
    connected: ['Connected', 'Подключено', 'Підключено', '已连接'], disconnected: ['Not connected', 'Не подключено', 'Не підключено', '未连接'],
    connect: ['Connect Trakt', 'Подключить Trakt', 'Підключити Trakt', '连接 Trakt'], disconnect: ['Disconnect', 'Отключить', 'Відключити', '断开连接'],
    connection: ['Connection', 'Подключение', 'Підключення', '连接'], metadata: ['Metadata sources', 'Источники данных', 'Джерела даних', '资料来源'],
    metadataHint: ['Titles, artwork, credits and seasons come from the selected API. Trakt supplies your viewing progress and ratings.', 'Названия, обложки, актёры и сезоны берутся из выбранного API. Trakt передаёт ваши просмотры и оценки.', 'Назви, обкладинки, актори й сезони беруться з обраного API. Trakt передає ваші перегляди й оцінки.', '所选 API 提供标题、海报、演员和季信息，Trakt 提供观看进度和评分。'],
    movies: ['Movies', 'Фильмы', 'Фільми', '电影'], series: ['Series', 'Сериалы', 'Серіали', '剧集'], all: ['All', 'Все', 'Усе', '全部'],
    direction: ['Direction', 'Направление', 'Напрямок', '方向'], pull: ['Trakt → LOREBASE', 'Trakt → LOREBASE', 'Trakt → LOREBASE', 'Trakt → LOREBASE'], both: ['Two-way', 'В обе стороны', 'В обидва боки', '双向'],
    import: ['Import from Trakt', 'Импорт из Trakt', 'Імпорт із Trakt', '从 Trakt 导入'], importHint: ['Choose titles and review progress before applying.', 'Выберите произведения и проверьте прогресс перед добавлением.', 'Оберіть твори й перевірте прогрес перед додаванням.', '选择条目并在导入前检查进度。'],
    sync: ['Sync linked notes', 'Обновить связанные заметки', 'Оновити пов’язані нотатки', '同步关联笔记'], syncHint: ['Update previously linked notes. Conflicts are left for manual review.', 'Обновить ранее связанные заметки. Спорные изменения останутся для ручной проверки.', 'Оновити раніше пов’язані нотатки. Суперечливі зміни залишаться для перевірки.', '更新关联笔记，冲突需手动检查。'],
    startup: ['Update on startup', 'Обновлять при запуске', 'Оновлювати під час запуску', '启动时更新'], startupHint: ['Only linked notes; new titles are imported manually.', 'Только связанные заметки; новые произведения добавляются вручную.', 'Лише пов’язані нотатки; нові твори додаються вручну.', '仅更新关联笔记，新条目需手动导入。'],
    codeHint: ['Enter this code on the Trakt website:', 'Введите этот код на сайте Trakt:', 'Введіть цей код на сайті Trakt:', '在 Trakt 网站输入此代码：'],
    open: ['Open Trakt', 'Открыть Trakt', 'Відкрити Trakt', '打开 Trakt'], copy: ['Copy code', 'Скопировать код', 'Копіювати код', '复制代码'], copied: ['Copied', 'Скопировано', 'Скопійовано', '已复制'],
    waiting: ['Waiting for confirmation on Trakt…', 'Ждём подтверждения на Trakt…', 'Очікуємо підтвердження на Trakt…', '等待 Trakt 确认…'], loading: ['Loading…', 'Загрузка…', 'Завантаження…', '加载中…'],
    review: ['Import from Trakt', 'Импорт из Trakt', 'Імпорт із Trakt', '从 Trakt 导入'], search: ['Search titles…', 'Поиск произведений…', 'Пошук творів…', '搜索条目…'],
    select: ['Select page', 'Выбрать страницу', 'Вибрати сторінку', '选择本页'], clear: ['Clear selection', 'Снять выбор', 'Зняти вибір', '清除选择'],
    create: ['Create note', 'Создать заметку', 'Створити нотатку', '新建笔记'], update: ['Update note', 'Обновить заметку', 'Оновити нотатку', '更新笔记'],
    note: ['Link to note', 'Связать с заметкой', 'Пов’язати з нотаткою', '关联笔记'], choose: ['Choose note', 'Выберите заметку', 'Оберіть нотатку', '选择笔记'],
    conflict: ['Choose values', 'Выберите данные', 'Оберіть дані', '选择数据'], local: ['Keep note values', 'Оставить из заметки', 'Залишити з нотатки', '保留笔记值'], remote: ['Use Trakt values', 'Взять из Trakt', 'Взяти з Trakt', '使用 Trakt 值'],
    rating: ['Rating', 'Оценка', 'Оцінка', '评分'], episodes: ['Watched episodes', 'Просмотренные серии', 'Переглянуті серії', '已看集数'], watchlist: ['Watchlist', 'Запланировано', 'Заплановано', '待看列表'], watched: ['Watched', 'Просмотрено', 'Переглянуто', '已看'],
    yes: ['Yes', 'Да', 'Так', '是'], no: ['No', 'Нет', 'Ні', '否'], empty: ['No entries found', 'Записи не найдены', 'Записи не знайдено', '未找到条目'],
    apply: ['Import selected', 'Импортировать', 'Імпортувати', '导入所选'], cancel: ['Cancel', 'Отмена', 'Скасувати', '取消'], done: ['Synchronization completed', 'Синхронизация завершена', 'Синхронізацію завершено', '同步完成'],
    created: ['Created', 'Создано', 'Створено', '已创建'], updated: ['Updated', 'Обновлено', 'Оновлено', '已更新'], errors: ['Errors', 'Ошибки', 'Помилки', '错误'], retry: ['Refresh preview', 'Обновить предпросмотр', 'Оновити перегляд', '刷新预览'],
    failure: ['Could not complete the operation. Check the connection and selected metadata API.', 'Не удалось завершить операцию. Проверьте подключение и выбранный API метаданных.', 'Не вдалося завершити дію. Перевірте підключення й обраний API метаданих.', '操作失败，请检查连接和所选资料 API。'],
    loginFailure: ['Could not connect to Trakt. Check your connection and try again.', 'Не удалось подключиться к Trakt. Проверьте соединение и повторите вход.', 'Не вдалося підключитися до Trakt. Перевірте з’єднання й повторіть вхід.', '无法连接 Trakt，请检查网络后重新登录。'],
    invalidLoginResponse: ['Trakt returned an unexpected sign-in response. Try connecting again.', 'Trakt вернул неожиданный ответ при входе. Попробуйте подключиться ещё раз.', 'Trakt повернув неочікувану відповідь під час входу. Спробуйте підключитися ще раз.', 'Trakt 登录响应异常，请重新连接。'],
    invalidClientId: ['Trakt rejected the application. Check its Client ID.', 'Trakt не принял приложение. Проверьте его Client ID.', 'Trakt не прийняв застосунок. Перевірте його Client ID.', 'Trakt 拒绝了此应用，请检查 Client ID。'],
    loginDenied: ['Trakt denied authorization. Check the application permissions and try again.', 'Trakt отклонил авторизацию. Проверьте доступ приложения и повторите вход.', 'Trakt відхилив авторизацію. Перевірте доступ застосунку й повторіть вхід.', 'Trakt 拒绝授权，请检查应用权限后重试。'],
    clientId: ['Client ID', 'Client ID', 'Client ID', 'Client ID'],
    clientIdHint: ['Enter your Trakt application Client ID, then connect using a code.', 'Укажите Client ID своего приложения Trakt, затем подключитесь по коду.', 'Вкажіть Client ID свого застосунку Trakt, потім підключіться за кодом.', '输入 Trakt 应用的 Client ID，然后使用代码连接。'],
    appMissing: ['Enter your Client ID in the Trakt connection settings first.', 'Сначала укажите Client ID в настройках подключения Trakt.', 'Спочатку вкажіть Client ID у налаштуваннях підключення Trakt.', '请先在 Trakt 连接设置中输入 Client ID。'],
    expired: ['The code expired. Connect again.', 'Код истёк. Подключитесь ещё раз.', 'Код прострочено. Підключіться ще раз.', '代码已过期，请重新连接。'],
    reconnect: ['Reconnect your Trakt account.', 'Подключите аккаунт Trakt заново.', 'Підключіть акаунт Trakt знову.', '请重新连接 Trakt 账户。'],
    rateLimit: ['Trakt is temporarily limiting requests. Try again later.', 'Trakt временно ограничил запросы. Повторите позже.', 'Trakt тимчасово обмежив запити. Спробуйте пізніше.', 'Trakt 暂时限制请求，请稍后重试。'],
    changed: ['The note, account or Trakt data changed. Refresh the preview.', 'Заметка, аккаунт или данные Trakt изменились. Обновите предпросмотр.', 'Нотатка, акаунт або дані Trakt змінилися. Оновіть перегляд.', '笔记、账户或 Trakt 数据已变化，请刷新预览。'],
    providerMissing: ['Enable the selected metadata API and configure its key in Integrations.', 'Включите выбранный API и настройте его ключ в «Интеграциях».', 'Увімкніть обраний API й налаштуйте ключ в «Інтеграціях».', '请在集成中启用所选 API 并配置密钥。'],
    matchMissing: ['No unique match in the selected API. Choose another metadata API.', 'В выбранном API не найдено однозначного совпадения. Выберите другой источник метаданных.', 'В обраному API немає однозначного збігу. Оберіть інше джерело метаданих.', '所选 API 未找到唯一匹配，请选择其他来源。'],
    seasonsMissing: ['The selected API returned no seasons. Choose another metadata API.', 'Выбранный API не вернул сезоны. Выберите другой источник метаданных.', 'Обраний API не повернув сезони. Оберіть інше джерело метаданих.', '所选 API 未返回季信息，请选择其他来源。'],
    folderMissing: ['Choose a library folder in settings first.', 'Сначала укажите папку библиотеки в настройках.', 'Спочатку вкажіть теку бібліотеки в налаштуваннях.', '请先在设置中选择资料库文件夹。'],
    busy: ['A Trakt synchronization is already running.', 'Синхронизация Trakt уже выполняется.', 'Синхронізація Trakt уже триває.', 'Trakt 同步正在进行。'],
    needsReview: ['Need review', 'Требуют проверки', 'Потребують перевірки', '需要检查'],
    favorite: ['Favorite', 'Избранное', 'Улюблене', '收藏'],
    close: ['Close', 'Закрыть', 'Закрити', '关闭'],
    selected: ['Selected', 'Выбрано', 'Вибрано', '已选择'],
    entries: ['Titles', 'Произведений', 'Творів', '条目'],
    season: ['Season', 'Сезон', 'Сезон', '季'],
    bySeason: ['Progress by season', 'Просмотрено по сезонам', 'Переглянуто за сезонами', '每季观看进度'],
    syncing: ['Importing from Trakt', 'Импортируем из Trakt', 'Імпортуємо з Trakt', '正在从 Trakt 导入'],
    syncingHint: ['Loading note details and saving progress…', 'Загружаем данные и сохраняем прогресс…', 'Завантажуємо дані й зберігаємо прогрес…', '正在加载资料并保存进度…'],
    noteValue: ['In note', 'В заметке', 'У нотатці', '笔记中'],
    reviewHint: ['Choose what to add or update in your library.', 'Выберите, что добавить или обновить в библиотеке.', 'Оберіть, що додати або оновити в бібліотеці.', '选择要添加或更新的资料库条目。'],
    details: ['Details', 'Подробнее', 'Докладніше', '详情'],
    hideDetails: ['Hide details', 'Свернуть', 'Згорнути', '收起详情'],
    newNote: ['New note', 'Новая заметка', 'Нова нотатка', '新笔记'],
    linkedNote: ['In library', 'В библиотеке', 'У бібліотеці', '已在资料库'],
    watchedShort: ['Episodes watched', 'Серий просмотрено', 'Серій переглянуто', '已看集数'],
    episodesLabel: ['Episodes', 'Серии', 'Серії', '集数'],
    seasonsLabel: ['Seasons', 'Сезоны', 'Сезони', '季'],
    seasons: ['Seasons', 'Сезонов', 'Сезонів', '季数'],
    resultHint: ['Your library is up to date.', 'Изменения сохранены в библиотеке.', 'Зміни збережено в бібліотеці.', '资料库已更新。'],
    resultErrors: ['Import needs attention', 'Не всё удалось импортировать', 'Не все вдалося імпортувати', '部分条目导入失败'],
    resultErrorsHint: ['Review the errors and try importing the remaining titles again.', 'Проверьте ошибки и повторите импорт оставшихся произведений.', 'Перевірте помилки й повторіть імпорт решти творів.', '请检查错误并重新导入剩余条目。'],
    backToList: ['Back to list', 'К списку', 'До списку', '返回列表'],
    loginHint: ['Confirm the connection in your browser.', 'Подтвердите подключение в браузере.', 'Підтвердьте підключення в браузері.', '请在浏览器中确认连接。'],
    activateStep: ['Open the activation page', 'Откройте страницу активации', 'Відкрийте сторінку активації', '打开激活页面'],
    enterCode: ['Enter this code', 'Введите этот код', 'Введіть цей код', '输入此代码'],
    newCode: ['Get a new code', 'Получить новый код', 'Отримати новий код', '获取新代码'],
    progressUnavailable: ['Trakt returned viewing history without episode details. Refresh the preview; existing progress has been preserved.', 'Trakt вернул историю без списка серий. Обновите предпросмотр; текущий прогресс сохранён.', 'Trakt повернув історію без переліку серій. Оновіть перегляд; поточний прогрес збережено.', 'Trakt 返回的观看记录缺少集信息，请刷新预览，现有进度已保留。'],
} as const;
export type TraktTextKey = keyof typeof copy;
export function tt(key: TraktTextKey): string { const language = i18n.getLanguage(); return copy[key][language === 'ru' ? 1 : language === 'uk' ? 2 : language === 'zh-CN' ? 3 : 0]; }
export function traktError(error: unknown, context: 'sync' | 'auth' = 'sync'): string {
    const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
    if (context === 'auth' && /HTTP (400|401)/.test(message)) return tt('invalidClientId');
    if (context === 'auth' && /HTTP 403/.test(message)) return tt('loginDenied');
    if (/HTTP (401|403)/.test(message)) return tt('reconnect'); if (/HTTP 429/.test(message)) return tt('rateLimit');
    const match = message.match(/TRAKT_[A-Z_]+/), code = match?.[0];
    const key: TraktTextKey = code === 'TRAKT_APPLICATION_NOT_CONFIGURED' ? 'appMissing' : code === 'TRAKT_CODE_EXPIRED' ? 'expired'
        : code === 'TRAKT_INVALID_CODE' || code === 'TRAKT_INVALID_TOKEN' ? 'invalidLoginResponse'
        : code === 'TRAKT_CONNECT_FIRST' ? 'reconnect' : code === 'TRAKT_METADATA_UNAVAILABLE' ? 'providerMissing' : code === 'TRAKT_METADATA_MATCH' ? 'matchMissing'
            : code === 'TRAKT_NO_SEASONS' ? 'seasonsMissing' : code === 'TRAKT_PROGRESS_UNAVAILABLE' ? 'progressUnavailable' : code === 'TRAKT_FOLDER_MISSING' ? 'folderMissing' : code === 'TRAKT_BUSY' ? 'busy'
                : ['TRAKT_ACCOUNT_CHANGED', 'TRAKT_REMOTE_CHANGED', 'TRAKT_LOCAL_CHANGED', 'TRAKT_NOTE_MISSING'].includes(code || '') ? 'changed' : context === 'auth' ? 'loginFailure' : 'failure';
    return match?.index ? message.slice(0, match.index) + tt(key) : tt(key);
}
