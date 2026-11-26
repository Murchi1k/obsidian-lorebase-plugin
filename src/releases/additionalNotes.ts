import type { Language } from '../types';
import type { ChangeKind } from './catalog';

const NOTES: Array<{ kind: ChangeKind; icon: string; text: Record<Language, [string, string]> }> = [
    { kind: 'added', icon: 'inbox', text: {
        ru: ['Входящие из заметок #lorebase', 'Пометьте заметку со списком тегом #lorebase или #LB и откройте «Добавить → Входящие». Проверьте названия, найдите совпадения в каталоге или подготовьте записи вручную, затем добавьте выбранные произведения в библиотеку.'],
        en: ['Inbox from #lorebase notes', 'Tag a list note with #lorebase or #LB and open Add → Inbox. Review the titles, find catalog matches or prepare entries manually, then add the selected titles to your library.'],
        uk: ['Вхідні з нотаток #lorebase', 'Позначте нотатку зі списком тегом #lorebase або #LB і відкрийте «Додати → Вхідні». Перевірте назви, знайдіть збіги в каталозі або підготуйте записи вручну, а потім додайте вибрані твори до бібліотеки.'],
        'zh-CN': ['从 #lorebase 笔记收集条目', '为列表笔记添加 #lorebase 或 #LB 标签，然后打开“添加 → 收件箱”。检查标题，匹配目录条目或手动准备，再将选中的作品添加到资料库。'],
    } },
    { kind: 'added', icon: 'flag', text: {
        ru: ['Приоритет произведения', 'Задавайте низкий, обычный, высокий или наивысший приоритет в редакторе или меню карточки. В библиотеке можно сортировать, группировать и фильтровать произведения по приоритету.'],
        en: ['Title priority', 'Set a title to Low, Normal, High or Highest in the editor or card menu. Sort, group and filter your library by priority.'],
        uk: ['Пріоритет твору', 'Задавайте низький, звичайний, високий або найвищий пріоритет у редакторі чи меню картки. У бібліотеці можна сортувати, групувати й фільтрувати твори за пріоритетом.'],
        'zh-CN': ['作品优先级', '在编辑器或卡片菜单中将作品优先级设为低、普通、高或最高。资料库支持按优先级排序、分组和筛选。'],
    } },
    { kind: 'added', icon: 'book-open', text: {
        ru: ['Open Library для книг', 'Выберите Open Library в окне добавления книг и ищите по названию, ссылке или ID произведения или издания. Провайдер загружает доступные метаданные и обложки без ключа API.'],
        en: ['Open Library for books', 'Select Open Library in the book add window and search by title, work or edition URL, or ID. The provider retrieves available metadata and covers without an API key.'],
        uk: ['Open Library для книг', 'Виберіть Open Library у вікні додавання книг і шукайте за назвою, посиланням або ID твору чи видання. Провайдер завантажує доступні метадані й обкладинки без ключа API.'],
        'zh-CN': ['Open Library 图书来源', '在图书添加窗口选择 Open Library，按书名、作品或版本链接、ID 查找图书。可获取来源提供的元数据和封面，无需 API 密钥。'],
    } },
    { kind: 'added', icon: 'notebook-pen', text: {
        ru: ['Откуда узнал', 'Запишите в редакторе, кто посоветовал произведение и чем оно вас заинтересовало. Для заполненного блока можно включить значок на карточке.'],
        en: ['How I found it', 'Record who recommended a title and what caught your interest in the editor. Enable the optional badge to mark cards with this information.'],
        uk: ['Звідки дізнався', 'Запишіть у редакторі, хто порадив твір і чим він вас зацікавив. Для заповненого блоку можна ввімкнути значок на картці.'],
        'zh-CN': ['发现来源', '在编辑器中记录谁推荐了作品，以及什么吸引了你。可启用卡片徽章，标记已填写发现来源的作品。'],
    } },
    { kind: 'added', icon: 'circle-x', text: {
        ru: ['Почему бросил', 'В редакторе можно записать причину для статуса «Заброшено». Для статуса «На паузе» есть отдельная пометка «Почему отложил».'],
        en: ['Why I stopped', 'In the editor, record why you dropped a title. When a title is on hold, the separate Why I paused field records the reason.'],
        uk: ['Чому припинив', 'У редакторі можна записати причину для статусу «Покинуто». Для статусу «На паузі» є окрема позначка «Чому відклав».'],
        'zh-CN': ['放弃原因', '在编辑器中记录放弃作品的原因。作品暂停时，可在单独的“暂停原因”字段中填写理由。'],
    } },
    { kind: 'added', icon: 'book-open-text', text: {
        ru: ['Comic Vine для комиксов', 'В библиотеке манги появился тип «Комиксы». Выберите Comic Vine в окне добавления, чтобы искать серии по названию и отдельные выпуски по ссылке или ID. API-ключ вводится в разделе «Интеграции → Провайдеры → Манга и комиксы».'],
        en: ['Comic Vine for comics', 'The manga library now has a Comics work type. Select Comic Vine when adding a title to search for series by title or look up individual issues by URL or ID. Enter your API key under Integrations → Providers → Manga and Comics.'],
        uk: ['Comic Vine для коміксів', 'У бібліотеці манґи з’явився тип «Комікси». Виберіть Comic Vine у вікні додавання, щоб шукати серії за назвою й окремі випуски за посиланням або ID. Ключ API вводиться в розділі «Інтеграції → Провайдери → Манґа й комікси».'],
        'zh-CN': ['Comic Vine 欧美漫画来源', '漫画资料库新增“欧美漫画”作品类型。在添加窗口选择 Comic Vine，可按标题搜索系列，或按链接及 ID 查找单期。在“集成 → 来源 → 日漫与欧美漫画”中填写 API 密钥。'],
    } },
    { kind: 'improved', icon: 'calendar-check', text: {
        ru: ['Просмотрено, дата неизвестна', 'Выберите «Просмотрено» в меню карточки аниме, фильма или сериала. Если помните только год или месяц и год, укажите их в окне даты завершения. Если не помните, когда смотрели, выберите «Дата неизвестна».'],
        en: ['Watched, date unknown', 'Mark anime, movies and TV shows you have already watched as Completed. If you only remember the year or the year and month, enter that. Choose Date unknown if you cannot remember when.'],
        uk: ['Переглянуто, дата невідома', 'Якщо ви вже дивилися аніме, фільм чи серіал, позначте його як «Завершено». Якщо не пам’ятаєте точної дати, вкажіть лише рік, рік і місяць або виберіть «Дата невідома».'],
        'zh-CN': ['已观看，日期未知', '将看过的动画、电影或剧集标记为已完成。如果只记得年份或年月，可以只填这些信息。如果想不起是什么时候看的，请选择“日期未知”。'],
    } },
    { kind: 'added', icon: 'globe', text: {
        ru: ['Дополнительные онлайн-функции', 'Переключатель в общих настройках управляет галереями и трейлерами, актёрами и фильмографиями, похожими тайтлами, сведениями об исполнителях, статистикой прослушиваний и музыкальными превью. Поиск, метаданные, обычные обложки и синхронизации продолжают работать.'],
        en: ['Additional online features', 'A General settings switch controls galleries and trailers, actors and filmographies, similar titles, artist discovery, listening statistics and music previews. Catalog search, metadata, regular covers and account synchronization keep working.'],
        uk: ['Додаткові онлайн-функції', 'Перемикач у загальних налаштуваннях керує галереями й трейлерами, акторами та фільмографіями, схожими творами, відомостями про виконавців, статистикою прослуховувань і музичними прев’ю. Пошук, метадані, звичайні обкладинки та синхронізації працюють далі.'],
        'zh-CN': ['附加在线功能', '常规设置中的开关控制图库与预告片、演员和影视作品、相似作品、艺术家信息、收听统计及音乐试听。目录搜索、元数据、常规封面和账号同步仍可使用。'],
    } },
    { kind: 'added', icon: 'tv', text: {
        ru: ['Интеграция с Trakt', 'Подключайте аккаунт Trakt в разделе «Интеграции → Sync → Trakt» и переносите фильмы, сериалы, оценки и просмотренные серии в LOREBASE. Перед импортом можно выбрать произведения, проверить прогресс и связать записи с уже существующими заметками. Доступны получение данных из Trakt и обмен в обе стороны; спорные изменения можно разобрать вручную. Источник названий, обложек и других метаданных выбирается отдельно от источника личного прогресса.'],
        en: ['Trakt integration', 'Connect your Trakt account under Integrations → Sync → Trakt to bring movies, series, ratings and watched episodes into LOREBASE. Before importing, select titles, review their progress and link entries to existing notes. Choose between receiving data from Trakt and two-way synchronization, with conflicting changes available for manual review. The source for titles, artwork and other metadata is selected separately from your personal progress source.'],
        uk: ['Інтеграція з Trakt', 'Підключайте обліковий запис Trakt у розділі «Інтеграції → Sync → Trakt» і переносьте фільми, серіали, оцінки та переглянуті серії до LOREBASE. Перед імпортом можна вибрати твори, перевірити прогрес і пов’язати записи з наявними нотатками. Доступні отримання даних із Trakt та обмін в обидва боки; суперечливі зміни можна переглянути вручну. Джерело назв, обкладинок та інших метаданих обирається окремо від джерела особистого прогресу.'],
        'zh-CN': ['Trakt 集成', '在“集成 → Sync → Trakt”中连接账号，将电影、剧集、评分和已看集数导入 LOREBASE。导入前可选择作品、检查观看进度，并将条目关联到已有笔记。支持从 Trakt 获取数据或进行双向同步，冲突可手动处理。标题、封面等元数据的来源可独立选择，与个人观看进度的来源分开设置。'],
    } },
    { kind: 'added', icon: 'sparkles', text: {
        ru: ['Похожие произведения', 'В редакторах аниме, фильмов и сериалов появился блок рекомендаций с обложками, названиями и годом выхода. Подборка загружается из поддерживаемого источника произведения и помогает найти, что посмотреть дальше. Нажмите кнопку добавления, чтобы создать запись в библиотеке; для уже добавленного произведения можно сразу открыть его заметку. Также доступен переход на сайт источника, а сама подборка не создаёт заметки без вашего действия.'],
        en: ['Similar titles', 'Anime, movie and series editors now include recommendations with covers, titles and release years. Suggestions are loaded from a supported source for the current title to help you choose what to watch next. Press the add button to create a library entry, or open the existing note if the title is already in your library. You can also visit the source website; browsing recommendations does not create notes automatically.'],
        uk: ['Схожі твори', 'У редакторах аніме, фільмів і серіалів з’явився блок рекомендацій з обкладинками, назвами та роком виходу. Добірка завантажується з підтримуваного джерела твору й допомагає знайти, що подивитися далі. Натисніть кнопку додавання, щоб створити запис у бібліотеці; для вже доданого твору можна одразу відкрити його нотатку. Також доступний перехід на сайт джерела, а сама добірка не створює нотатки без вашої дії.'],
        'zh-CN': ['相似作品', '动画、电影和剧集编辑器新增推荐区域，展示作品封面、标题和发行年份。推荐从当前作品支持的数据来源获取，方便寻找下一部想看的作品。点击添加按钮即可创建资料库条目；若作品已在资料库中，可直接打开已有笔记。也可前往来源网站浏览，单纯查看推荐不会自动创建笔记。'],
    } },
    { kind: 'added', icon: 'gamepad-2', text: {
        ru: ['PlayStation Sync (PS Sync)', 'Добавлена работа с библиотекой PlayStation в разделе «Интеграции → Sync → PlayStation». Выбирайте сыгранные игры, библиотеку PSN или обе подборки, проверяйте найденные совпадения и связывайте игры с существующими заметками перед импортом. Загрузку наигранного времени и трофеев можно включать отдельно, а метаданные получать из PSN, IGDB или RAWG. Поддерживается обновление связанных игр при запуске; первоначальное подключение аккаунта выполняется в настольном Obsidian.'],
        en: ['PlayStation Sync (PS Sync)', 'Manage your PlayStation library under Integrations → Sync → PlayStation. Choose played games, your PSN library or both, review matches and link games to existing notes before importing. Playtime and trophy imports can be enabled independently, with metadata supplied by PSN, IGDB or RAWG. Linked games can be updated on startup; initial account connection is performed in desktop Obsidian.'],
        uk: ['PlayStation Sync (PS Sync)', 'Додано роботу з бібліотекою PlayStation у розділі «Інтеграції → Sync → PlayStation». Обирайте зіграні ігри, бібліотеку PSN або обидві добірки, перевіряйте знайдені збіги й пов’язуйте ігри з наявними нотатками перед імпортом. Завантаження часу гри та трофеїв можна вмикати окремо, а метадані отримувати з PSN, IGDB або RAWG. Підтримується оновлення пов’язаних ігор під час запуску; початкове підключення облікового запису виконується в настільному Obsidian.'],
        'zh-CN': ['PlayStation Sync（PS Sync）', '在“集成 → Sync → PlayStation”中管理 PlayStation 游戏库。可选择玩过的游戏、PSN 游戏库或两者，导入前检查匹配结果并关联已有笔记。游戏时间与奖杯可分别启用导入，元数据可选用 PSN、IGDB 或 RAWG。支持启动时更新已关联游戏；首次连接账号需要在桌面版 Obsidian 中完成。'],
    } },
    { kind: 'improved', icon: 'square-pen', text: {
        ru: ['Новый вид редактирования', 'Переработана компоновка редакторов: обложка, название, статус, личная оценка и прогресс собраны в более компактные блоки. Дополнительные сведения, связанные произведения и источник метаданных доступны в отдельных разделах. На телефоне используются вкладки «Основное», «Моё» и «Ещё», а кнопка сохранения остаётся в нижней панели. Включить новый вариант или вернуться к прежнему можно переключателем «Обновлённый редактор» в общих настройках.'],
        en: ['New editor layout', 'Editors have been reorganized into more compact sections for the cover, title, status, personal rating and progress. Additional information, related titles and metadata sources are available in their own sections. Phones use General, Personal and More tabs, with a save button in the bottom bar. Enable the new layout or return to the previous one using Updated editor in the general settings.'],
        uk: ['Новий вигляд редагування', 'Перероблено компонування редакторів: обкладинка, назва, статус, власна оцінка та прогрес зібрані в компактніші блоки. Додаткові відомості, пов’язані твори й джерело метаданих доступні в окремих розділах. На телефоні використовуються вкладки «Основне», «Моє» та «Ще», а кнопка збереження залишається на нижній панелі. Увімкнути новий варіант або повернутися до попереднього можна перемикачем «Оновлений редактор» у загальних налаштуваннях.'],
        'zh-CN': ['全新编辑器布局', '编辑器将封面、标题、状态、个人评分和进度整理为更紧凑的区域。附加信息、关联作品和元数据来源分别放在独立区域。手机使用“基本”“我的”和“更多”标签，底部保留保存按钮。可在常规设置中通过“新版编辑器”切换新布局或恢复旧布局。'],
    } },
    { kind: 'added', icon: 'globe', text: {
        ru: ['Дополнительные источники аниме', 'В окне добавления аниме можно переключаться между AniList, Kitsu и Shikimori и искать произведение в подходящем каталоге. Результаты показываются с обложками, датами и форматом, если эти сведения доступны у выбранного источника. Для существующей записи источник можно связать или сменить через редактор и затем обновить метаданные. Включение и параметры провайдеров находятся в разделе интеграций.'],
        en: ['Additional anime sources', 'Switch between AniList, Kitsu and Shikimori in the add-anime window to search the catalog you prefer. Results include covers, release dates and formats when the selected source provides them. Existing entries can be linked to a source or switched to another one through the editor, then have their metadata refreshed. Enable and configure providers in the integrations settings.'],
        uk: ['Додаткові джерела аніме', 'У вікні додавання аніме можна перемикатися між AniList, Kitsu та Shikimori й шукати твір у потрібному каталозі. Результати показуються з обкладинками, датами та форматом, якщо ці відомості доступні у вибраному джерелі. Для наявного запису джерело можна пов’язати або змінити через редактор, а потім оновити метадані. Увімкнення й параметри провайдерів розташовані в розділі інтеграцій.'],
        'zh-CN': ['更多动画来源', '在动画添加窗口中可切换 AniList、Kitsu 和 Shikimori，从合适的目录查找作品。所选来源提供相应数据时，结果会显示封面、发行日期和作品形式。已有条目也可在编辑器中关联或更换来源，再刷新元数据。来源的启用开关及相关选项位于集成设置中。'],
    } },
    { kind: 'added', icon: 'link', text: {
        ru: ['Вики-ссылки', 'В шаблонах поддерживаемые значения можно записывать как внутренние ссылки Obsidian вместо обычного текста — например, связывать произведения с заметками об авторах. В простом редакторе шаблона режим включается кнопкой ссылки рядом с нужным полем. В продвинутом режиме доступна метка {{VALUE:authors|wikilink}} для записи авторов в виде вики-ссылок. Режим выбирается отдельно для поддерживаемых полей, поэтому остальные значения могут оставаться обычным текстом.'],
        en: ['Wikilinks', 'Supported template values can now be written as internal Obsidian links instead of plain text, for example to connect works with author notes. In the simple template editor, enable this mode with the link button beside a supported field. Advanced templates can use {{VALUE:authors|wikilink}} to write authors as wikilinks. The mode is selected per supported field, so other values can remain plain text.'],
        uk: ['Вікіпосилання', 'У шаблонах підтримувані значення можна записувати як внутрішні посилання Obsidian замість звичайного тексту — наприклад, пов’язувати твори з нотатками про авторів. У простому редакторі шаблону режим вмикається кнопкою посилання біля потрібного поля. У розширеному режимі доступна мітка {{VALUE:authors|wikilink}} для запису авторів у вигляді вікіпосилань. Режим обирається окремо для підтримуваних полів, тому інші значення можуть залишатися звичайним текстом.'],
        'zh-CN': ['维基链接', '模板中支持的字段值现在可以写成 Obsidian 内部链接，例如将作品关联到作者笔记。在简单模板编辑器中，点击支持字段旁的链接按钮即可启用。高级模板可使用 {{VALUE:authors|wikilink}} 将作者写成维基链接。该模式按支持的字段单独设置，其他字段仍可保留普通文本格式。'],
    } },
    { kind: 'fixed', icon: 'tags', text: {
        ru: ['Типы в библиотеке игр', 'Исправлена ситуация, когда в играх появлялись типы произведений из других библиотек. Списки выбора и фильтры игр используют игровой каталог типов, а выбранное значение согласовано с плашкой на карточке и полем в редакторе. Благодаря этому типы манги, фильмов и других медиа больше не смешиваются с играми при работе с коллекцией.'],
        en: ['Types in the games library', 'Fixed a case where games could show work types belonging to other libraries. Game selectors and filters use the game type catalog, with the selected value reflected consistently in the card badge and editor field. Manga, movie and other media types no longer get mixed into the game collection while browsing or editing it.'],
        uk: ['Типи в бібліотеці ігор', 'Виправлено ситуацію, коли в іграх з’являлися типи творів з інших бібліотек. Списки вибору й фільтри ігор використовують ігровий каталог типів, а вибране значення узгоджено з позначкою на картці та полем у редакторі. Завдяки цьому типи манґи, фільмів та інших медіа більше не змішуються з іграми під час роботи з колекцією.'],
        'zh-CN': ['游戏库中的类型', '修复游戏中可能出现其他资料库作品类型的问题。游戏的选择列表和筛选条件使用游戏专属类型目录，所选类型会一致显示在卡片徽章和编辑器字段中。浏览或编辑游戏收藏时，不再混入漫画、电影及其他媒体的类型。'],
    } },
    { kind: 'fixed', icon: 'plug', text: {
        ru: ['Отдельные переключатели AniList и Shikimori', 'AniList и Shikimori теперь включаются отдельно для аниме и манги. Панель настроек и кнопка «Тест» используют каталог выбранного раздела.'],
        en: ['Independent AniList and Shikimori switches', 'AniList and Shikimori can now be enabled independently for anime and manga. The provider panel and Test button use the catalog for the selected section.'],
        uk: ['Окремі перемикачі AniList і Shikimori', 'AniList і Shikimori тепер вмикаються окремо для аніме й манґи. Панель налаштувань і кнопка перевірки працюють із каталогом вибраного розділу.'],
        'zh-CN': ['AniList 和 Shikimori 独立开关', 'AniList 和 Shikimori 现在可以分别为动漫和漫画启用。来源设置面板和测试按钮使用所选分类对应的目录。'],
    } },
    { kind: 'added', icon: 'users', text: {
        ru: ['Оценка сообщества на карточках', 'Рейтинг из подключённого источника можно видеть прямо в библиотеке, не открывая редактор каждого произведения. Оценка сообщества отображается отдельно от вашей личной оценки и использует данные провайдера. В настройках карточек, в разделе «Бейджи», можно включить этот элемент и выбрать оформление: значок сообщества, звезду или помидор. Это помогает сравнивать общее мнение о произведении со своими впечатлениями.'],
        en: ['Community ratings on cards', 'See ratings from a connected source directly in your library without opening every title in the editor. Community ratings use provider data and are displayed separately from your personal score. In card settings under Badges, enable the element and choose a community, star or tomato icon. This makes it easier to compare the broader reception of a title with your own impressions.'],
        uk: ['Оцінка спільноти на картках', 'Рейтинг із підключеного джерела можна бачити безпосередньо в бібліотеці, не відкриваючи редактор кожного твору. Оцінка спільноти відображається окремо від вашої власної оцінки та використовує дані провайдера. У налаштуваннях карток, у розділі «Бейджі», можна ввімкнути цей елемент і вибрати оформлення: значок спільноти, зірку або помідор. Це допомагає порівнювати загальну думку про твір зі своїми враженнями.'],
        'zh-CN': ['卡片上的社区评分', '无需逐一打开编辑器，即可在资料库中查看已连接来源提供的评分。社区评分采用来源数据，与个人评分分开显示。在卡片设置的徽章区域可启用该元素，并选择社区、星星或番茄图标，方便比较作品的整体口碑与自己的感受。'],
    } },
    { kind: 'added', icon: 'clapperboard', text: {
        ru: ['Скриншоты и трейлеры в редакторе', 'Из редактора можно открыть галерею произведения кнопкой на обложке и посмотреть материалы выбранного источника. Доступные изображения, фоны, постеры и трейлеры разделены по вкладкам, чтобы было проще найти нужное. Переключайте изображения по миниатюрам, выбирайте ролик и запускайте просмотр; при необходимости можно перейти к исходному видео. Состав галереи зависит от того, какие материалы предоставляет подключённый провайдер.'],
        en: ['Screenshots and trailers in the editor', 'Open a title gallery from the cover button in the editor to browse material from its selected source. Available images, backdrops, posters and trailers are organized into separate tabs. Switch images using thumbnails, choose a trailer and start playback, or open the original video when needed. The gallery contents depend on the material supplied by the connected provider.'],
        uk: ['Скриншоти й трейлери в редакторі', 'Із редактора можна відкрити галерею твору кнопкою на обкладинці й переглянути матеріали вибраного джерела. Доступні зображення, фони, постери та трейлери розділені за вкладками, щоб було простіше знайти потрібне. Перемикайте зображення за мініатюрами, вибирайте ролик і запускайте перегляд; за потреби можна перейти до початкового відео. Вміст галереї залежить від того, які матеріали надає підключений провайдер.'],
        'zh-CN': ['编辑器中的截图与预告片', '点击编辑器封面上的按钮即可打开作品图库，浏览所选来源提供的素材。可用的图片、背景、海报和预告片按标签分类，方便查找。可通过缩略图切换图片、选择预告片并播放，也可打开原始视频。图库的具体内容取决于已连接来源提供的素材。'],
    } },
    { kind: 'added', icon: 'star', text: {
        ru: ['Новые пресеты оценок', 'К стандартному оформлению классической оценки добавлены тематический, сезонный и праздничный пресеты. Тематический вариант использует разные символы для игр, аниме, фильмов, книг и других медиа; сезонный и праздничный позволяют выбрать подходящий набор. Каждый уровень оценки от 1 до 5 получает собственный символ и подпись. Пресеты находятся в общих настройках пользовательской оценки и меняют её оформление, сохраняя выставленные баллы.'],
        en: ['New rating presets', 'The classic rating display now offers themed, seasonal and holiday presets alongside the standard style. Themed presets use different symbols for games, anime, movies, books and other media, while seasonal and holiday options let you select a matching set. Each score from 1 to 5 has its own symbol and label. Find the presets in the general personal-rating settings; switching them changes the presentation while preserving your scores.'],
        uk: ['Нові пресети оцінок', 'До стандартного оформлення класичної оцінки додано тематичний, сезонний і святковий пресети. Тематичний варіант використовує різні символи для ігор, аніме, фільмів, книг та інших медіа; сезонний і святковий дозволяють вибрати відповідний набір. Кожен рівень оцінки від 1 до 5 отримує власний символ і підпис. Пресети розташовані в загальних налаштуваннях власної оцінки та змінюють її оформлення, зберігаючи виставлені бали.'],
        'zh-CN': ['全新评分预设', '经典评分在标准样式之外新增主题、季节和节日预设。主题预设为游戏、动画、电影、书籍等媒体使用不同符号，季节及节日预设则可选择相应图案组。1 至 5 分的每个等级都有独立符号和说明。预设位于常规的个人评分设置中，切换只改变显示样式，保留已记录的分数。'],
    } },
    { kind: 'added', icon: 'scroll-text', text: {
        ru: ['Кнопка прокрутки описания', 'Длинное описание можно читать прямо на карточке библиотеки, прокручивая текст внутри выделенной области. Для этого в настройках карточек добавлен переключатель «Прокручивать длинное описание». При включении текст доступен для прокрутки, а при выключении снова используется обычное ограничение видимых строк. Это позволяет подробнее познакомиться с произведением без отдельного открытия заметки или редактора.'],
        en: ['Description scrolling control', 'Read long descriptions directly on library cards by scrolling the text within its allocated area. Enable Scroll long descriptions in the card settings to use this behavior. When enabled, the description becomes scrollable; disabling it restores the usual visible-line limit. This lets you read more about a title without opening its note or editor separately.'],
        uk: ['Кнопка прокручування опису', 'Довгий опис можна читати безпосередньо на картці бібліотеки, прокручуючи текст у виділеній області. Для цього в налаштуваннях карток додано перемикач «Прокручувати довгий опис». Після ввімкнення текст доступний для прокручування, а після вимкнення знову використовується звичайне обмеження видимих рядків. Це дозволяє докладніше ознайомитися з твором без окремого відкриття нотатки або редактора.'],
        'zh-CN': ['简介滚动按钮', '可直接在资料库卡片的描述区域内滚动阅读长简介。在卡片设置中启用“滚动长描述”即可使用。开启后描述可以滚动，关闭后恢复通常的可见行数限制，方便在不单独打开笔记或编辑器的情况下了解更多作品信息。'],
    } },
];

export function getAdditionalReleaseNotes(language: Language, kind: ChangeKind) {
    return NOTES.filter(note => note.kind === kind).map(note => ({
        title: note.text[language][0], description: note.text[language][1], icon: note.icon,
    }));
}
