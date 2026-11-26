import type { Language } from '../types';
import { LEGACY_RELEASES } from './legacy';
import { LEGACY_NOTICE, LEGACY_TRANSLATIONS } from './legacyTranslations';
import { compareVersions } from './versionState';
import { getReleaseHighlights } from './features';
import { getWorkflowReleaseNotes } from './workflowNotes';
import { getAdditionalReleaseNotes } from './additionalNotes';
export { getReleaseHighlights } from './features';
export type { ReleaseTarget } from './features';

export type ChangeKind = 'added' | 'improved' | 'fixed';
export interface ReleaseNotes {
    version: string;
    notice?: string;
    groups: Array<{ kind: ChangeKind; items: string[]; summaries?: string[]; icons?: string[] }>;
}

/** Brief history is a short list of changes, not a second copy of the full notes. */
export function summarizeReleaseNote(text: string): string {
    const lead = text.match(/^(.+?)(?:\.\s+|[。！？]|:\s+|\s+—\s+)/)?.[1] ?? text;
    if (lead.length <= 130) return lead;
    const clipped = lead.slice(0, 127);
    const space = clipped.lastIndexOf(' ');
    return clipped.slice(0, space >= 70 ? space : clipped.length).trimEnd() + '…';
}
const EXTRA: Record<Language, [string[], string[], string[]]> = {
    "ru": [
        [
            "Даты и статусы в поиске. На карточках результатов видны дата выхода и тип произведения. Для манги также показывается состояние публикации: «Выходит», «Завершено» или «Приостановлено», если источник передаёт эти данные.",
            "Платформы прохождения. Выбирайте несколько платформ, сохраняйте число перепрохождений для каждой и различайте их по иконкам.",
            "Счётчики повторов. Отмечайте повторные прохождения игр, просмотры фильмов, аниме и сериалов, а также повторное чтение манги.",
            "Эффекты частиц. Сакура, снег, листья, светлячки и дождь с предпросмотром и регулировкой интенсивности. Для режима ограничения движения предусмотрена отдельная настройка анимации.",
            "Китайский язык интерфейса. Добавлена локализация на упрощённый китайский.",
            "Окно новинок. Обзор возможностей, переходы к функциям и полная история изменений доступны из шапки настроек и работают без интернета."
        ],
        [
            "Редактор частей. В редакторе аниме и сериалов у каждого сезона или части есть свои название, формат, год, статус и прогресс по сериям. Цвет вкладки показывает статус части. Правый клик по вкладке → «Редактировать» позволяет изменить другую часть, не делая её текущей.",
            "Прогресс просмотра. Общий счётчик серий, процент и полоса прогресса дополнены оценкой просмотренного и оставшегося времени. Можно задать длительность серии; статус «Завершено» отмечает весь сезон, если его число серий известно.",
            "Обложки частей. Постер плавно следует за активной частью, а при отсутствии её изображения используется общая обложка. Можно закрепить общий постер в «Карточки → Внешний вид». Обновление состава из провайдера сохраняет личный прогресс, изменённые данные и добавленные вручную части.",
            "Настройки плагина. Единый интерфейс общих параметров, карточек, медиа, интеграций, шаблонов, импорта и сведений о плагине. Выбор языка и оценочной шкалы сопровождается понятными элементами управления; сброс требует подтверждения внутри раздела.",
            "Интерактивное превью карточек. Перетаскивайте текст и бейджи, включайте и выключайте элементы прямо на карточке, меняйте число строк описания. Превью использует произведения выбранного медиа, а для пустой библиотеки показывает пример LOREBASE.",
            "Оформление карточек. Настройки статуса, даты завершения, оценки и избранного дополнены примерами. Названия и цвета типов и стран согласованы с поиском и библиотекой. В примере книжной полки показаны книги разного размера.",
            "Ручное создание заметок. Доступны авторы, разработчики, издатели, режиссёры, актёры и студии, даты, личные заметки и прогресс. Обложки загружаются файлом или по ссылке; введённые данные сохраняются при переключении вкладок и использовании сокращённых шаблонов.",
            "Импорт заметок. Три последовательных шага: источник, сопоставление полей и предпросмотр изменений. Поддерживаются автоматическое определение медиа, исключение полей, создание копий или обновление и перенос выбранных заметок.",
            "Steam Sync в окне добавления. Библиотека и вишлист открываются без перехода в отдельное окно. Галерея обложек, поиск, фильтры «Играл» и «Вишлист», понятные названия игр и отметки «В библиотеке» помогают выбрать записи для импорта.",
            "Импорт AniList в окне добавления. Кнопка AniList Import доступна для аниме и манги. Выбирайте записи по обложкам, фильтруйте по медиа и сразу различайте произведения, которые уже есть в LOREBASE.",
            "Прогресс импорта Steam и AniList. Обновлённое отображение текущей записи, хода обработки и результатов. Доступны пауза, продолжение и отмена; итог различает созданные, обновлённые, пропущенные записи и ошибки с пояснениями.",
            "Привязка к AniList. Выбор локальной заметки и поиск соответствующего произведения сопровождаются обложками и явным подтверждением связи. Исходный провайдер сохраняется; сама привязка не отправляет личные данные на сайт.",
            "Подключение и синхронизация. Результат проверки Steam и AniList показан рядом с кнопкой, с понятным именем аккаунта или подписью к числу игр. Настройки автозапуска, правила импорта Steam и справка AniList доступны из соответствующих экранов.",
            "Провайдеры. Настройки источника раскрываются прямо в списке. SteamGridDB доступен в Steam, HLTB — среди игровых источников. Языки TMDB и альтернативных названий настраиваются отдельно для соответствующих медиа; сохранение альтернативных названий можно выключить.",
            "Диагностика запросов. Более компактный журнал с фильтрами по провайдеру и ошибкам, результатами импорта, активными паузами и копированием отчёта.",
            "Пользовательские YAML-свойства. В продвинутом шаблоне можно переименовать свойство, сохранив маркер значения: name: \"{{VALUE:name}}\" → title: \"{{VALUE:name}}\". Подсказка к строке под курсором помогает разобраться с полями.",
            "Светлая тема и сведения о плагине. Улучшены читаемость элементов, отображение версии, ссылок на источники и информации о правах на материалы."
        ],
        [
            "Жанры аниме. Сохраняются отдельно от тегов во всех провайдерах и AniList Sync. Старые жанры автоматически переносятся при загрузке библиотеки; остальные теги сохраняются.",
            "Перестроение карточек. Исправлено наложение при открытии левой панели. Анимации перестроения временно отключены для предотвращения перекрытий.",
            "Прокрутка библиотеки. Устранены скачки вверх и вниз при нахождении курсора над карточкой.",
            "HowLongToBeat. Исправлена ошибка 404 при загрузке времени прохождения.",
            "Shikimori. Исправлены ошибки 404 при запросах к источнику.",
            "Ошибки AniList. Отказ в доступе 403 показывается как ошибка подключения вместо ошибки чтения данных. Улучшена совместимость поиска и синхронизации с источником.",
            "Название и год на карточке. Год корректно смещается при многострочном названии; горизонтальный макет учитывает доступную высоту.",
            "Выпадающие меню. Исправлено закрытие списков при смене разделов и обновлении интерфейса.",
            "Прогресс и метаданные. Исправлена обработка прогресса сериалов и отображение сведений в результатах поиска.",
            "Бейджи и избранное. Исправлены включение и выключение элементов в превью, состояние сердечка и пульсация рамки избранного.",
            "Дата завершения. Статус с датой остаётся в одну строку. Дату можно показывать независимо от группировки; для музыкальных карточек эта настройка не используется.",
            "Обложки MangaDex. Исправлены ошибки доступа к поиску и изображениям; обложки загружаются в добавлении и библиотеке.",
            "Качество обложек MangaUpdates. При подтверждённом совпадении идентификатора используется оригинал обложки MangaDex. Без такого совпадения сохраняется изображение MangaUpdates."
        ]
    ],
    "en": [
        [
            "Dates and states in search. Result cards show the release date and work type. Manga cards also show publication states such as Ongoing, Completed or On hiatus when the source provides them.",
            "Played-on platforms. Select multiple platforms, retain a replay count for each and recognize them by their icons.",
            "Repeat counters. Record game replays, movie, anime and series rewatches, and manga rereads.",
            "Particle effects. Sakura, snow, leaves, fireflies and rain with previews and adjustable intensity. A separate animation option handles reduced-motion mode.",
            "Chinese interface. Added Simplified Chinese localization.",
            "What’s new. Feature descriptions, shortcuts and full release history are available from the settings header and work offline."
        ],
        [
            "Part editor. Each anime or series season or part has its own title, format, year, status and episode progress. Tab colors indicate the part’s status. Right-click a tab → Edit to change another part without making it active.",
            "Viewing progress. Episode totals, percentage and progress bar include watched and remaining time estimates. Set episode duration; Completed marks the whole season when its episode count is known.",
            "Part covers. Posters follow the active part smoothly and fall back to the title cover. Pin the title poster in Cards → Appearance. Refreshing provider parts preserves personal progress, edits and manual parts.",
            "Plugin settings. A consistent interface for general options, cards, media, integrations, templates, imports and plugin information. Clear language and rating controls; resetting requires confirmation within the section.",
            "Interactive card preview. Drag text and badges, toggle elements on the card and resize description line counts. Previews use entries from the selected media, with a LOREBASE sample for empty libraries.",
            "Card appearance. Status, completion date, rating and favorite controls include examples. Type and country labels and colors match search and library. The bookshelf preview shows books of different sizes.",
            "Manual notes. Enter authors, developers, publishers, directors, cast, studios, dates, personal notes and progress. Upload covers or use URLs; switching tabs and using reduced templates preserves entered data.",
            "Note import. Three steps: source, field mapping and change preview. Supports automatic media detection, excluded fields, copies or updating and moving selected notes.",
            "Steam Sync in Add. Open your library and wishlist without switching dialogs. Poster cards, search, Played and Wishlist filters, game names and In library markers help select import entries.",
            "AniList import in Add. AniList Import is available for anime and manga. Select poster cards, filter by media and identify entries already in LOREBASE.",
            "Steam and AniList import progress. See the current entry, processing progress and results. Pause, resume or cancel; the summary distinguishes created, updated, skipped and failed entries with explanations.",
            "Link to AniList. Choose a local note and matching work with cover previews and explicit confirmation. The original provider is retained; linking alone does not upload personal data.",
            "Connection and sync. Steam and AniList connection results appear beside the test control, with an account name or labeled game count. Startup options, Steam import rules and AniList help are available from their respective screens.",
            "Providers. Source settings expand inline. SteamGridDB is under Steam and HLTB joins game sources. Configure TMDB and alternative-title languages separately by media, or disable alternative-title storage.",
            "Request diagnostics. A more compact log with provider and error filters, import results, active cooldowns and report copying.",
            "Custom YAML properties. Rename an advanced-template property while retaining its value marker: name: \"{{VALUE:name}}\" → title: \"{{VALUE:name}}\". Help follows the cursor line.",
            "Light theme and plugin information. Improved control readability, version display, source links and material-rights information."
        ],
        [
            "Anime genres. Stored separately from tags across providers and AniList Sync. Legacy genres migrate when the library loads without losing other tags.",
            "Card reflow. Fixed overlap when opening the left sidebar. Reflow animations are temporarily disabled to prevent overlaps.",
            "Library scrolling. Fixed upward and downward jumps while hovering over a card.",
            "HowLongToBeat. Fixed 404 errors when loading completion times.",
            "Shikimori. Fixed provider request errors returning 404.",
            "AniList errors. Access denied 403 is reported as a connection error instead of a data-parsing failure. Improved search and sync compatibility.",
            "Card title and year. The year follows multiline titles correctly, and horizontal layouts respect available height.",
            "Dropdown menus. Fixed closing lists when switching sections or refreshing the interface.",
            "Progress and metadata. Fixed series-progress handling and metadata presentation in search results.",
            "Badges and favorites. Fixed preview toggles, heart state and favorite-frame pulsing.",
            "Completion date. Status and date stay on one line. Dates can appear independently of grouping; this option does not apply to music cards.",
            "MangaDex covers. Fixed access errors for search and images; covers load in Add and the library.",
            "MangaUpdates cover quality. Use original MangaDex artwork when the external record ID matches exactly; otherwise retain the MangaUpdates image."
        ]
    ],
    "uk": [
        [
            "Дати й стани в пошуку. Картки результатів показують дату виходу й тип твору. Для манґи також видно стан публікації: «Виходить», «Завершено» або «Призупинено», якщо джерело надає ці дані.",
            "Платформи проходження. Вибирайте кілька платформ, зберігайте кількість повторних проходжень для кожної та розрізняйте їх за іконками.",
            "Лічильники повторів. Відмічайте повторні проходження ігор, перегляди фільмів, аніме й серіалів та повторне читання манґи.",
            "Ефекти частинок. Сакура, сніг, листя, світлячки й дощ із попереднім переглядом та регулюванням інтенсивності. Для режиму зменшення руху є окреме налаштування анімації.",
            "Китайська мова інтерфейсу. Додано переклад спрощеною китайською.",
            "Вікно новинок. Огляд можливостей, переходи до функцій і повна історія змін доступні із заголовка налаштувань та працюють без інтернету."
        ],
        [
            "Редактор частин. У редакторі аніме й серіалів кожен сезон або частина має власні назву, формат, рік, стан і прогрес серій. Колір вкладки показує стан частини. Правий клік по вкладці → «Редагувати» дозволяє змінити іншу частину, не роблячи її поточною.",
            "Прогрес перегляду. Загальний лічильник серій, відсоток і смуга прогресу доповнені оцінкою переглянутого та решти часу. Можна задати тривалість серії; стан «Завершено» відмічає весь сезон, якщо кількість серій відома.",
            "Обкладинки частин. Постер плавно змінюється за активною частиною, а без її зображення використовується спільна обкладинка. Закріпіть спільний постер у «Картки → Вигляд». Оновлення складу з провайдера зберігає особистий прогрес, зміни й ручні частини.",
            "Налаштування плагіна. Єдиний інтерфейс загальних параметрів, карток, медіа, інтеграцій, шаблонів, імпорту й відомостей про плагін. Зрозумілий вибір мови та шкали оцінок; скидання потребує підтвердження всередині розділу.",
            "Інтерактивне прев’ю карток. Перетягуйте текст і бейджі, вмикайте елементи на картці та змінюйте кількість рядків опису. Прев’ю використовує твори вибраного медіа, а для порожньої бібліотеки показує приклад LOREBASE.",
            "Оформлення карток. Параметри стану, дати завершення, оцінки й обраного мають приклади. Назви та кольори типів і країн узгоджені з пошуком і бібліотекою. У попередньому перегляді книжкової полиці показано книги різних розмірів.",
            "Ручне створення нотаток. Доступні автори, розробники, видавці, режисери, актори, студії, дати, особисті нотатки й прогрес. Обкладинки завантажуються файлом або посиланням; дані зберігаються між вкладками та зі скороченими шаблонами.",
            "Імпорт нотаток. Три послідовні кроки: джерело, зіставлення полів і перегляд змін. Підтримуються автоматичне визначення медіа, виключення полів, копії або оновлення й перенесення вибраних нотаток.",
            "Steam Sync у вікні додавання. Бібліотека й вішлист відкриваються без переходу до іншого вікна. Галерея обкладинок, пошук, фільтри «Грав» і «Вішлист», зрозумілі назви й позначки «У бібліотеці» допомагають вибрати записи.",
            "Імпорт AniList у вікні додавання. Кнопка AniList Import доступна для аніме й манґи. Вибирайте записи за обкладинками, фільтруйте медіа та розрізняйте твори, які вже є в LOREBASE.",
            "Прогрес імпорту Steam і AniList. Оновлено показ поточного запису, обробки й результатів. Доступні пауза, продовження та скасування; підсумок розрізняє створені, оновлені, пропущені записи й помилки з поясненнями.",
            "Прив’язка до AniList. Вибір локальної нотатки й відповідного твору супроводжується обкладинками та явним підтвердженням. Початковий провайдер зберігається; сама прив’язка не надсилає особисті дані на сайт.",
            "Підключення й синхронізація. Результат перевірки Steam та AniList показано поруч із кнопкою, з ім’ям акаунта або підписаною кількістю ігор. Параметри автозапуску, правила імпорту Steam і довідка AniList доступні на відповідних екранах.",
            "Провайдери. Параметри джерела розгортаються просто в списку. SteamGridDB доступний у Steam, HLTB — серед ігрових джерел. Мови TMDB та альтернативних назв налаштовуються окремо за медіа; збереження альтернативних назв можна вимкнути.",
            "Діагностика запитів. Компактніший журнал із фільтрами провайдерів і помилок, результатами імпорту, активними паузами та копіюванням звіту.",
            "Власні YAML-властивості. У розширеному шаблоні можна перейменувати властивість, зберігши маркер: name: \"{{VALUE:name}}\" → title: \"{{VALUE:name}}\". Підказка пояснює рядок під курсором.",
            "Світла тема й відомості про плагін. Поліпшено читабельність елементів, показ версії, посилань на джерела та інформації про права на матеріали."
        ],
        [
            "Жанри аніме. Зберігаються окремо від тегів у провайдерах та AniList Sync. Старі жанри переносяться під час завантаження бібліотеки, решта тегів зберігається.",
            "Перебудова карток. Усунено накладання під час відкриття лівої панелі. Анімації перебудови тимчасово вимкнено для запобігання перекриттям.",
            "Прокручування бібліотеки. Усунено стрибки вгору й униз, коли курсор перебуває над карткою.",
            "HowLongToBeat. Виправлено помилку 404 під час завантаження часу проходження.",
            "Shikimori. Виправлено помилки 404 у запитах до джерела.",
            "Помилки AniList. Відмову в доступі 403 показано як помилку підключення замість помилки читання даних. Поліпшено сумісність пошуку й синхронізації.",
            "Назва й рік на картці. Рік правильно зміщується під багаторядковою назвою; горизонтальний макет враховує доступну висоту.",
            "Випадні меню. Виправлено закриття списків під час зміни розділів та оновлення інтерфейсу.",
            "Прогрес і метадані. Виправлено обробку прогресу серіалів і показ відомостей у результатах пошуку.",
            "Бейджі й обране. Виправлено перемикачі в прев’ю, стан сердечка та пульсацію рамки обраного.",
            "Дата завершення. Стан із датою залишається в одному рядку. Дату можна показувати незалежно від групування; для музичних карток параметр не застосовується.",
            "Обкладинки MangaDex. Виправлено помилки доступу до пошуку й зображень; обкладинки завантажуються в додаванні та бібліотеці.",
            "Якість обкладинок MangaUpdates. За підтвердженого збігу ідентифікатора використовується оригінал MangaDex; інакше зберігається зображення MangaUpdates."
        ]
    ],
    "zh-CN": [
        [
            "搜索日期与状态。结果卡片显示发行日期和作品类型，漫画还会在来源提供信息时显示“连载中”“已完结”或“暂停”等出版状态。",
            "游玩平台。可选择多个平台、分别记录重玩次数，并通过图标区分。",
            "重复次数。记录游戏重玩、电影和动漫剧集重看，以及漫画重读。",
            "粒子效果。樱花、雪、落叶、萤火虫和雨支持预览及强度调节，并提供减少动态效果模式下的独立动画选项。",
            "中文界面。新增简体中文本地化。",
            "新功能窗口。从设置页眉查看功能说明、打开相关功能并离线阅读完整更新历史。"
        ],
        [
            "分部编辑器。动漫和剧集的每一季或分部均有独立名称、格式、年份、状态与集数进度，选项卡颜色表示状态。右键选项卡并选择“编辑”，即可修改其他分部而不将其设为当前分部。",
            "观看进度。总集数、百分比和进度条新增已观看及剩余时长估算。可设置每集时长，已知集数时“已完成”会标记整季。",
            "分部封面。主图平滑跟随当前分部，无分部图片时使用作品封面。可在“卡片 → 外观”固定作品封面，刷新来源分部时保留个人进度、编辑内容和手动分部。",
            "插件设置。常规、卡片、媒体、集成、模板、导入和插件信息使用统一界面，语言与评分控件更清晰，重置需在当前区域确认。",
            "交互式卡片预览。直接拖动文字和徽标、切换元素并调整简介行数。预览使用所选媒体的作品，空资料库显示 LOREBASE 示例。",
            "卡片外观。状态、完成日期、评分和收藏控件提供示例。类型及国家名称和颜色与搜索和资料库一致。书架预览展示不同尺寸的书籍。",
            "手动创建笔记。支持作者、开发商、发行商、导演、演员、工作室、日期、个人笔记和进度。封面可上传文件或使用链接；切换选项卡和使用精简模板时保留输入内容。",
            "笔记导入。依次选择来源、映射字段并预览修改，支持自动识别媒体、排除字段、创建副本或更新并移动所选笔记。",
            "添加窗口内的 Steam Sync。无需切换窗口即可打开库和愿望单，使用封面卡片、搜索、已游玩及愿望单筛选、真实游戏名称和资料库标记选择导入项。",
            "添加窗口内的 AniList 导入。动漫和漫画均提供 AniList Import，可按封面选择、按媒体筛选并识别资料库中已有作品。",
            "Steam 与 AniList 导入进度。显示当前作品、处理进度和结果，支持暂停、继续及取消；汇总区分新建、更新、跳过和失败并说明原因。",
            "关联 AniList。选择本地笔记与对应作品时提供封面预览并明确确认，保留原始来源，仅关联不会上传个人数据。",
            "连接与同步。Steam 和 AniList 连接测试结果显示在按钮旁，提供账户名称或标注游戏数量。相应页面可设置启动行为、Steam 导入规则并查看 AniList 帮助。",
            "来源设置。在列表内展开来源选项，SteamGridDB 位于 Steam 内，HLTB 与游戏来源并列。按媒体分别设置 TMDB 和别名语言，也可关闭别名保存。",
            "请求诊断。日志更加紧凑，支持来源及错误筛选、导入结果、冷却状态和复制报告。",
            "自定义 YAML 属性。高级模板可重命名属性并保留值标记，例如 name: \"{{VALUE:name}}\" → title: \"{{VALUE:name}}\"，字段提示跟随光标所在行。",
            "浅色主题与插件信息。改进控件可读性、版本显示、来源链接及素材权利说明。"
        ],
        [
            "动漫类型。来源与 AniList Sync 将类型和标签分开保存，加载资料库时迁移旧类型并保留其他标签。",
            "卡片重排。修复打开左侧栏时的重叠，暂时禁用重排动画以避免覆盖。",
            "资料库滚动。修复指针位于卡片上方时页面上下跳动。",
            "HowLongToBeat。修复获取通关时长时的 404 错误。",
            "Shikimori。修复来源请求的 404 错误。",
            "AniList 错误。将 403 拒绝访问显示为连接错误而非数据解析失败，改进搜索与同步兼容性。",
            "卡片名称与年份。年份正确跟随多行名称，横版布局根据可用高度排布。",
            "下拉菜单。修复切换区域和刷新界面时列表关闭的问题。",
            "进度与元数据。修复剧集进度处理及搜索结果中的信息显示。",
            "徽标与收藏。修复预览元素开关、爱心状态及收藏边框脉动。",
            "完成日期。状态与日期保持单行，可独立于分组显示日期，音乐卡片不使用此选项。",
            "MangaDex 封面。修复搜索与图片访问错误，添加窗口和资料库可加载封面。",
            "MangaUpdates 封面质量。仅在外部记录标识完全匹配时使用 MangaDex 原始封面，否则保留 MangaUpdates 图片。"
        ]
    ]
};

// Topic icons follow the same note order in every translation.
const EXTRA_ICONS: Record<ChangeKind, string[]> = {
    added: ['calendar-days', 'monitor', 'repeat-2', 'sparkles', 'languages', 'file-clock'],
    improved: ['layers', 'clock-3', 'images', 'settings-2', 'mouse-pointer-2', 'palette', 'square-pen', 'folder-input', 'gamepad-2', 'download', 'loader-circle', 'link', 'plug', 'plug-zap', 'activity', 'file-code-2', 'sun'],
    fixed: ['tags', 'layout-grid', 'mouse', 'timer', 'sparkles', 'plug', 'type', 'chevrons-up-down', 'list-video', 'heart', 'calendar-check', 'image', 'scan-line'],
};
const WORKFLOW_ICONS: Record<ChangeKind, string[]> = {
    added: ['user-round', 'gamepad-2'], improved: ['list-video', 'sliders-horizontal', 'list-filter'], fixed: [],
};

const PATCH_401: Record<Language, string[]> = {
    en: [
        'Improved compatibility with Obsidian. Updated desktop and mobile layouts, settings controls, and timers used with pop-out windows.',
        'Corrected release packaging. The GitHub tag and downloadable plugin files now match version 4.0.1.',
    ],
    ru: [
        'Совместимость с Obsidian. Обновлены мобильная и десктопная раскладки, элементы настроек и таймеры для отдельных окон.',
        'Сборка релиза. Тег GitHub и файлы плагина теперь соответствуют версии 4.0.1.',
    ],
    uk: [
        'Сумісність з Obsidian. Оновлено мобільний і настільний макети, елементи налаштувань і таймери для окремих вікон.',
        'Збірка випуску. Тег GitHub і файли плагіна тепер відповідають версії 4.0.1.',
    ],
    'zh-CN': [
        '改进 Obsidian 兼容性。更新了桌面和移动端布局、设置控件以及弹出窗口使用的计时器。',
        '修正发布打包。GitHub 标签和可下载的插件文件现已与 4.0.1 版本一致。',
    ],
};

export function getReleaseHistory(language: Language, installedVersion: string): ReleaseNotes[] {
    const patch: ReleaseNotes = {
        version: '4.0.1',
        groups: [{ kind: 'fixed', items: PATCH_401[language] }],
    };
    const features = getReleaseHighlights(language, '4.0.0');
    const current: ReleaseNotes = {
        version: '4.0.0',
        groups: (['added', 'improved', 'fixed'] as const).map((kind, index) => {
            const additional = getAdditionalReleaseNotes(language, kind);
            const highlights = features.filter(feature => feature.kind === kind);
            const extra = [...EXTRA[language][index], ...getWorkflowReleaseNotes(language, kind)];
            return {
                kind,
                items: [
                    ...additional.map(note => `${note.title}. ${note.description}`),
                    ...highlights.map(feature => `${feature.title}. ${feature.description} ${feature.details.join(' ')}`),
                    ...extra,
                ],
                summaries: [...additional.map(note => note.title), ...highlights.map(feature => feature.title), ...extra.map(summarizeReleaseNote)],
                icons: [...additional.map(note => note.icon), ...highlights.map(feature => feature.icon), ...EXTRA_ICONS[kind], ...WORKFLOW_ICONS[kind]],
            };
        }),
    };
    let offset = 0;
    const legacy = LEGACY_RELEASES.map(release => ({
        version: release.version,
        notice: release.notice ? LEGACY_NOTICE[language] : undefined,
        groups: release.groups.map(group => {
            const items = group.items.map(item => {
                const translated = language === 'en' ? item : LEGACY_TRANSLATIONS[language][offset];
                offset++;
                return translated;
            });
            return { kind: group.kind, items, summaries: items.map(summarizeReleaseNote) };
        }),
    }));
    return [patch, current, ...legacy].filter(release => {
        const comparison = compareVersions(release.version, installedVersion);
        return comparison !== null && comparison <= 0;
    });
}
