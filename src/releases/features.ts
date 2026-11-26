import { getMediaFeatureText } from './mediaFeatures';
import { getSearchFeatureText } from './searchFeature';
import { getWorkflowFeatureText } from './workflowFeatures';
import type { Language } from '../types';

export const FEATURE_DEFINITIONS = [
    ['music', 'music-2', 'added'], ['ratings', 'star', 'added'], ['calendar', 'calendar-days', 'added'],
    ['groups', 'folders', 'added'], ['anilist', 'refresh-cw', 'added'], ['bookshelf', 'library-big', 'added'],
    ['alternativeTitles', 'languages', 'added'], ['mangaTypes', 'tags', 'added'], ['statuses', 'palette', 'improved'],
    ['tmdb', 'globe-2', 'added'], ['integrations', 'plug', 'improved'],
    ['vndb', 'gamepad-2', 'added'], ['animeOrigin', 'globe', 'added'],
    ['librarySearch', 'search', 'improved'],
    ['templates', 'file-cog', 'improved'], ['adding', 'list-plus', 'improved'], ['parts', 'layers', 'improved'],
    ['statistics', 'chart-no-axes-combined', 'improved'],
] as const;
export type ReleaseTarget = typeof FEATURE_DEFINITIONS[number][0];
type FeatureText = [title: string, description: string, first: string, second: string];
const TEXT: Record<Language, FeatureText[]> = {
    ru: [
        ['Музыка в вашей библиотеке', 'Альбомы и отдельные треки теперь рядом с играми, фильмами и книгами. Новый тип медиа доступен в бета-версии.', 'Поиск MusicBrainz, Last.fm и Deezer, обложки Cover Art Archive и ручное добавление.', 'Треклисты, прогресс прослушивания, оценки и избранное. Квадратные обложки, пластинки или CD в футляре; доступны превью Deezer до 30 секунд при наличии подходящего фрагмента.'],
        ['Оценки по вашим правилам', 'Гибкая система пользовательских оценок: оставьте привычную шкалу или настройте собственную.', 'Максимальный балл от 2 до 10 и шаг 1, 0,5 или 0,1.', 'Выбирайте отображение оценки на карточке: число, звезда с баллом или своя иконка. Подробная оценка позволяет отдельно оценивать свои критерии.'],
        ['Календарь релизов', 'Соберите известные даты выхода произведений из библиотеки в одном календаре.', 'Переключайте режимы просмотра и фильтруйте по видам медиа.', 'Открывайте карточки прямо из календаря.'],
        ['Пользовательские группы', 'Организуйте коллекцию так, как удобно вам: собственные подборки вместо одной общей очереди.', 'Создавайте и редактируйте группы, добавляйте произведения из библиотеки.', 'Открывайте участников подборки и меняйте её состав.'],
        ['Ваша библиотека и AniList', 'Импортируйте аниме и мангу, связывайте существующие заметки и синхронизируйте личные данные в обе стороны.', 'Статусы, оценки, прогресс, даты и личные заметки участвуют в обмене.', 'Перед подключением изучите правила первого обмена, приоритет изменений и синхронизацию удалений в справке AniList Sync.'],
        ['Книжная полка', 'Новый вид библиотеки книг: коллекция на полках с оформлением книжных обложек.', 'Включается отдельно в настройках оформления карточек книг.', 'Цвета обложек и компоновка полок делают книжную коллекцию нагляднее.'],
        ['Альтернативные названия', 'Находите аниме и мангу по знакомому названию, даже если основной заголовок записан иначе.', 'Для каждого источника можно выбрать язык альтернативных названий или отключить их сохранение в настройках провайдеров.', 'Поиск в библиотеке учитывает и основные, и альтернативные названия.'],
        ['Типы манги', 'Манга, маньхуа, манхва и ваши собственные типы — с отдельной плашкой на карточке.', 'Добавляйте, переименовывайте и упорядочивайте типы.', 'Используйте типы в карточках и фильтрах библиотеки.'],
        ['Свои статусы и планы', 'У каждого вида медиа могут быть собственные статусы с понятными названиями и оформлением.', 'Меняйте названия, цвета и иконки Lucide; добавляйте новые статусы.', 'План-метки игр и редактор в одну или две колонки помогают организовать очередь.'],
        ['Язык данных TMDB', 'Выбирайте язык метаданных фильмов и сериалов из TMDB независимо от языка интерфейса.', 'Язык задаётся отдельно для фильмов и сериалов в настройках провайдера TMDB.', 'Выбранный язык применяется при запросе данных у TMDB.'],
        ['Провайдеры с понятным статусом', 'Цветные индикаторы рядом с провайдерами сразу показывают состояние источников.', 'Видно, что включено, выключено или требует настройки.', 'AniList и Shikimori можно включать отдельно для аниме и манги.'],
    ],
    en: [
        ['Music joins your library', 'Albums and individual tracks now sit alongside games, films and books. This new media type is in beta.', 'Search MusicBrainz, Last.fm and Deezer, use Cover Art Archive artwork or add entries manually.', 'Tracklists, listening progress, ratings and favorites. Square, vinyl or CD-case covers; up to 30-second Deezer previews are available when a matching clip is supplied.'],
        ['Ratings on your terms', 'A flexible personal rating system: keep the familiar scale or create your own.', 'Choose a maximum from 2 to 10, with steps of 1, 0.5 or 0.1.', 'Display a number, a star with the score or a custom icon on your cards. Detailed ratings let you score your own criteria separately.'],
        ['Release calendar', 'Bring known release dates from your library together in one calendar.', 'Switch views and filter by media type.', 'Open entries directly from the calendar.'],
        ['Custom groups', 'Organize your collection your way with personal selections instead of a single queue.', 'Create and edit groups and add entries from your library.', 'Open group members and adjust the selection.'],
        ['Your library and AniList', 'Import anime and manga, link existing notes and sync personal data in both directions.', 'Exchange statuses, ratings, progress, dates and personal notes.', 'Read the AniList Sync help before connecting: it explains the first exchange, change priority and deletion sync.'],
        ['Bookshelf', 'A new book-library view: arrange your collection on shelves with book-cover styling.', 'Enable it separately in the book card appearance settings.', 'Cover colors and shelf layouts make your book collection easier to browse.'],
        ['Alternative titles', 'Find anime and manga by a familiar name even when the main title is different.', 'Choose alternative-title languages per source or disable storing them in provider settings.', 'Library search checks both primary and alternative titles.'],
        ['Manga types', 'Manga, manhua, manhwa and your own types, with a dedicated card badge.', 'Add, rename and reorder types.', 'Use types on cards and in library filters.'],
        ['Custom statuses and plans', 'Each media type can have its own clearly named and styled statuses.', 'Customize names, colors and Lucide icons, or add new statuses.', 'Game planning tags and a one- or two-column editor help organize your queue.'],
        ['TMDB data language', 'Choose the language of movie and series metadata from TMDB independently of the interface.', 'Set movie and series languages separately in the TMDB provider settings.', 'The selected language is used for TMDB data requests.'],
        ['Provider status at a glance', 'Colored indicators next to providers make source states easy to understand.', 'See which sources are enabled, disabled or need setup.', 'Enable AniList and Shikimori independently for anime and manga.'],
    ],
    uk: [
        ['Музика у вашій бібліотеці', 'Альбоми й окремі треки тепер поруч з іграми, фільмами та книгами. Новий тип медіа доступний у бета-версії.', 'Пошук MusicBrainz, Last.fm і Deezer, обкладинки Cover Art Archive та ручне додавання.', 'Треклисти, прогрес прослуховування, оцінки й улюблене. Квадратні обкладинки, платівки або CD у футлярі; доступні прев’ю Deezer до 30 секунд за наявності відповідного фрагмента.'],
        ['Оцінки за вашими правилами', 'Гнучка система власних оцінок: залиште звичну шкалу або налаштуйте свою.', 'Максимальний бал від 2 до 10 і крок 1, 0,5 або 0,1.', 'Відображайте на картці число, зірку з балом або власну іконку. Докладна оцінка дозволяє окремо оцінювати власні критерії.'],
        ['Календар релізів', 'Зберіть відомі дати виходу творів із бібліотеки в одному календарі.', 'Перемикайте режими перегляду й фільтруйте за видами медіа.', 'Відкривайте картки безпосередньо з календаря.'],
        ['Власні групи', 'Упорядковуйте колекцію так, як зручно вам: власні добірки замість однієї загальної черги.', 'Створюйте й редагуйте групи, додавайте твори з бібліотеки.', 'Відкривайте учасників добірки та змінюйте її склад.'],
        ['Ваша бібліотека й AniList', 'Імпортуйте аніме й манґу, пов’язуйте наявні нотатки та синхронізуйте особисті дані в обидва боки.', 'Обмінюйтеся статусами, оцінками, прогресом, датами й особистими нотатками.', 'Перед підключенням прочитайте довідку AniList Sync: правила першого обміну, пріоритет змін і синхронізація видалень.'],
        ['Книжкова полиця', 'Новий вигляд бібліотеки книг: колекція на полицях з оформленням книжкових обкладинок.', 'Вмикається окремо в налаштуваннях оформлення карток книг.', 'Кольори обкладинок і компонування полиць роблять книжкову колекцію наочнішою.'],
        ['Альтернативні назви', 'Знаходьте аніме й манґу за знайомою назвою, навіть якщо основний заголовок записано інакше.', 'Для кожного джерела можна вибрати мову альтернативних назв або вимкнути їх збереження в параметрах провайдерів.', 'Пошук у бібліотеці враховує основні й альтернативні назви.'],
        ['Типи манґи', 'Манґа, маньхуа, манхва та власні типи — з окремою плашкою на картці.', 'Додавайте, перейменовуйте й упорядковуйте типи.', 'Використовуйте типи на картках і у фільтрах бібліотеки.'],
        ['Власні статуси й плани', 'Кожен вид медіа може мати власні статуси зі зрозумілими назвами й оформленням.', 'Змінюйте назви, кольори та іконки Lucide; додавайте нові статуси.', 'Плани ігор і редактор в одну або дві колонки допомагають упорядкувати чергу.'],
        ['Мова даних TMDB', 'Вибирайте мову метаданих фільмів і серіалів із TMDB незалежно від мови інтерфейсу.', 'Мова задається окремо для фільмів і серіалів у параметрах провайдера TMDB.', 'Вибрана мова застосовується до запитів даних TMDB.'],
        ['Зрозумілі стани провайдерів', 'Кольорові індикатори біля провайдерів одразу показують стан джерел.', 'Видно, що ввімкнено, вимкнено або потребує налаштування.', 'AniList і Shikimori можна вмикати окремо для аніме й манґи.'],
    ],
    'zh-CN': [
        ['音乐加入资料库', '专辑和单曲现在与游戏、电影和书籍一起管理。此新媒体类型目前为测试版。', '搜索 MusicBrainz、Last.fm 和 Deezer、使用 Cover Art Archive 封面，或手动添加。', '曲目列表、收听进度、评分和收藏，支持方形、黑胶或 CD 盒封面。来源提供匹配片段时，可播放最长 30 秒的 Deezer 试听。'],
        ['按你的方式评分', '灵活的个人评分系统：保留熟悉的评分方式，或设置自己的评分标准。', '最高分可设为 2 至 10 分，步长为 1、0.5 或 0.1。', '卡片可显示数字、星形图标与分数，或自定义图标。详细评分支持分别评价自定义标准。'],
        ['发行日历', '在一个日历中查看资料库中作品的已知发行日期。', '切换视图并按媒体类型筛选。', '从日历直接打开作品。'],
        ['自定义分组', '按自己的方式整理收藏，用个人精选分组替代单一队列。', '创建和编辑分组，从资料库添加作品。', '打开分组成员并调整分组内容。'],
        ['资料库与 AniList', '导入动漫和漫画、关联现有笔记，并双向同步个人数据。', '交换状态、评分、进度、日期和个人笔记。', '连接前请阅读 AniList Sync 帮助，了解首次交换、修改优先级和删除同步规则。'],
        ['书架视图', '新的书籍资料库视图：以书架和书籍封面的形式展示收藏。', '可在书籍卡片外观设置中单独启用。', '封面颜色和书架布局让书籍收藏更直观。'],
        ['别名与其他语言标题', '即使主标题不同，也能通过熟悉的名称找到动漫和漫画。', '可在来源设置中分别选择别名语言或关闭别名保存。', '资料库搜索同时匹配主标题和别名。'],
        ['漫画类型', '日本漫画、中国漫画、韩国漫画和自定义类型，配有独立卡片徽标。', '添加、重命名和排列类型。', '在卡片及资料库筛选中使用类型。'],
        ['自定义状态和计划', '每种媒体均可使用独立且清晰命名的状态与外观。', '自定义名称、颜色和 Lucide 图标，或添加新状态。', '游戏计划标签以及一列或两列编辑器帮助整理队列。'],
        ['TMDB 数据语言', '独立于界面语言，选择 TMDB 电影和剧集元数据的语言。', '可在 TMDB 来源设置中分别选择电影与剧集的语言。', '请求 TMDB 数据时使用所选语言。'],
        ['直观的来源状态', '来源旁的彩色指示灯让状态一目了然。', '查看哪些来源已启用、已关闭或需要设置。', 'AniList 和 Shikimori 可以分别为动漫和漫画启用。'],
    ],
};

export function getReleaseHighlights(language: Language, version: string) {
    if (version !== '4.0.0') return [];
    return FEATURE_DEFINITIONS.map(([target, icon, kind], index) => {
        const [title, description, ...details] = target === 'librarySearch'
            ? getSearchFeatureText(language)
            : getWorkflowFeatureText(language, target) ?? getMediaFeatureText(language, target) ?? TEXT[language][index];
        return { target, icon, kind, title, description, details, beta: target === 'music' };
    });
}
