import type { Language } from '../types';

const NOTES: Record<Language, string[]> = {
    "ru": [
        "Актёры и фильмография. Карточки актёров в фильмах и сериалах открывают профиль и фильмографию с добавлением произведений в библиотеку. Данные TMDB загружаются через интернет и временно кешируются; отдельные заметки об актёрах не создаются.",
        "Переработанная статистика. Общая статистика всех медиа: обзор, аналитика, обложки тайтлов, статусы, оценки, жанры, раздельное время и прогресс, календарь завершений и карта стран. Фильтры и подборки работают без смены текущего раздела; расположение и размеры блоков настраиваются.",
        "Прогресс игр, время, достижения и режимы. Редактируйте процент прохождения, часы и минуты, достижения, соло, кооператив и мультиплеер. Кнопка процента достижений переносит его в прогресс по запросу. Steam обновляет время и достижения отдельно для игры или всей библиотеки.",
        "Отдельные серии в составе тайтла. Для частей аниме и сезонов сериалов доступны счётчик и отметки отдельных серий в сетке или списке. Можно загружать названия серий, отмечать их в любом порядке и сохранять прогресс при обновлении метаданных.",
        "Фильтры и сортировка. Настраивайте условия, порядок и группировку для своей библиотеки; сохранённые виды позволяют быстро возвращаться к нужной подборке.",
        "Выбор условий фильтра. Поиск и группировка полей упрощают выбор нужного условия; поддерживаются свойства заметок и их переименования."
    ],
    "en": [
        "Actors and filmography. Cast cards in movies and series open person profiles and filmographies, with direct library additions. TMDB data requires internet and uses a temporary cache; no separate actor notes are created.",
        "Reworked statistics. A shared dashboard for every media type: overview, insights, title covers, statuses, ratings, genres, separate time and progress, completion calendar and country map. Chart selections preserve the current page; block positions and sizes are customizable.",
        "Game progress, time, achievements and modes. Edit completion percentage, hours and minutes, achievements, solo, co-op and multiplayer. Apply the achievement percentage to progress only when requested. Update Steam time and achievements for one game or the whole library.",
        "Individual episodes in title parts. Anime parts and TV seasons support a counter or individual episode marks in grid and list views. Load episode names, mark episodes in any order and preserve personal progress when refreshing metadata.",
        "Filters and sorting. Set library conditions, ordering and grouping; saved views restore the collection you need.",
        "Choosing filter conditions. Field search and grouping make conditions easier to find, including note properties and renamed fields."
    ],
    "uk": [
        "Актори й фільмографія. Картки акторів у фільмах і серіалах відкривають профіль та фільмографію з додаванням творів до бібліотеки. Дані TMDB потребують інтернету й тимчасово кешуються; окремі нотатки про акторів не створюються.",
        "Перероблена статистика. Спільна статистика всіх медіа: огляд, аналітика, обкладинки творів, статуси, оцінки, жанри, окремий час і прогрес, календар завершень і карта країн. Добірки не змінюють поточний розділ; розташування й розміри блоків налаштовуються.",
        "Прогрес ігор, час, досягнення й режими. Редагуйте відсоток проходження, години й хвилини, досягнення, соло, кооператив і мультиплеєр. Відсоток досягнень переноситься в прогрес лише за натисканням. Steam оновлює час і досягнення гри або всієї бібліотеки.",
        "Окремі серії у складі тайтла. Частини аніме й сезони серіалів підтримують лічильник або позначки окремих серій у сітці чи списку. Завантажуйте назви, позначайте серії в довільному порядку та зберігайте прогрес під час оновлення метаданих.",
        "Фільтри й сортування. Налаштовуйте умови, порядок і групування бібліотеки; збережені види швидко повертають до потрібної добірки.",
        "Вибір умов фільтра. Пошук і групування полів спрощують вибір потрібної умови; підтримуються властивості нотаток та їхні перейменування."
    ],
    "zh-CN": [
        "演员与影视作品。电影和剧集演员卡片可打开人物资料与影视作品列表，并直接添加至资料库。TMDB 数据需要联网并临时缓存，不创建独立演员笔记。",
        "重新设计的统计。所有媒体共用统计面板，包含概览、分析、封面、状态、评分、类型、独立时长与进度、完成日历和国家地图。查看图表对应作品时保留当前页面，支持调整模块位置与尺寸。",
        "游戏进度、时长、成就与模式。编辑完成百分比、小时与分钟、成就、单人、合作和多人模式。仅点击按钮时将成就比例应用于进度。Steam 可更新单款游戏或整个资料库的时长与成就。",
        "作品分部中的独立分集。动漫分部和剧集季度支持计数器，或在网格与列表中逐集标记。可加载分集名称、任意顺序标记，并在刷新元数据时保留个人进度。",
        "筛选与排序。设置资料库条件、顺序与分组，并通过保存的视图快速恢复所需作品集合。",
        "选择筛选条件。通过字段搜索和分组更方便地查找条件，支持笔记属性及重命名字段。"
    ]
};

// Statistics has its own feature entry. Actors and game tracking are additions.
export function getWorkflowReleaseNotes(language: Language, kind: 'added' | 'improved' | 'fixed'): string[] {
    const notes = NOTES[language];
    if (kind === 'added') return [notes[0], notes[2]];
    if (kind === 'improved') return notes.slice(3);
    return [];
}
