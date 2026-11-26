import type { Language } from '../types';

type FeatureText = [string, string, string, string];
const TEXT: Record<Language, FeatureText[]> = {
    ru: [
        ['Шаблоны и компактный режим', 'Настраивайте свойства заметок для всех семи типов медиа, включая музыку, и сохраняйте порядок шаблона.', 'Таблица полей с YAML-именами, поиском, пояснениями и изменением порядка. Переименованные свойства сохраняются между простым и продвинутым режимами.', 'Компактный режим не записывает пустые поля: после заполнения через редактор они появляются на своём месте, после очистки удаляются. Значения 0 и false сохраняются; настройка общая для всех медиа.'],
        ['Обновлённое окно добавления', 'Поиск по каталогам и ручное создание собраны в одном окне.', 'Выбирайте провайдера, ищите произведения и просматривайте выбранное перед добавлением. Уже добавленные произведения отмечаются на постерах.', 'Ручная форма разделена на вкладки: основные данные, сезоны и прогресс, дополнительные сведения. Данные сохраняются при переключении вкладок; обложку можно загрузить файлом или по ссылке.'],
        ['Состав тайтла и прогресс', 'Обновлённый редактор частей аниме и сериалов с отдельными обложками и прогрессом.', 'Название, формат, год, статус и серии редактируются в одном блоке. У каждой части свой прогресс; постер может следовать за активной частью.', 'Общий прогресс дополнен оценкой просмотренного и оставшегося времени. Поддерживаются счётчики пересмотров; обновление состава из провайдера сохраняет личные данные.'],
        ['Переработанная статистика', 'Вся библиотека в одном дашборде: обзор, аналитика и тайтлы с обложками.', 'Статусы, оценки, жанры, карта стран, календарь завершений и отдельный учёт времени и прогресса для каждого медиа. Нажатие на данные открывает соответствующую подборку.', 'Перемещайте блоки, меняйте их размер и видимость, выбирайте плотность, размер обложек и период активности. Акценты следуют цвету плагина.'],
    ],
    en: [
        ['Templates and compact mode', 'Customize note properties for all seven media types, including music, while keeping template order.', 'A field table with YAML names, search, explanations and reordering. Renamed properties survive switching between simple and advanced modes.', 'Compact mode omits empty properties: filling them through the editor inserts them in place, and clearing them removes them. Zero and false are preserved; the setting applies to all media.'],
        ['Updated add window', 'Catalog search and manual creation share one window.', 'Choose a provider, search for works and preview selections before adding them. Existing library entries are marked on posters.', 'Manual creation has tabs for main data, seasons and progress, and additional details. Switching tabs retains your input; covers can use uploaded files or links.'],
        ['Title parts and progress', 'An updated anime and series parts editor with individual covers and progress.', 'Edit titles, formats, years, statuses and episodes in one place. Each part retains its own progress; the cover can follow the active part.', 'Overall progress includes watched and remaining time estimates. Rewatch counters are supported; refreshing parts from a provider preserves personal data.'],
        ['Reworked statistics', 'Your whole library in one dashboard: overview, insights and title covers.', 'Explore statuses, ratings, genres, country map, completion calendar, and separate time and progress for each media type. Select data to open its matching titles.', 'Move and resize blocks, change their visibility, density, cover size and activity period. Accents follow your plugin color.'],
    ],
    uk: [
        ['Шаблони й компактний режим', 'Налаштовуйте властивості нотаток усіх семи видів медіа, зокрема музики, зі збереженням порядку шаблону.', 'Таблиця полів із YAML-назвами, пошуком, поясненнями та зміною порядку. Перейменовані властивості зберігаються між простим і розширеним режимами.', 'Компактний режим не записує порожні поля: заповнення через редактор вставляє їх на своє місце, очищення видаляє. Значення 0 і false зберігаються; налаштування спільне для всіх медіа.'],
        ['Оновлене вікно додавання', 'Пошук у каталогах і ручне створення зібрано в одному вікні.', 'Вибирайте джерело, шукайте твори й переглядайте вибране перед додаванням. Наявні твори позначаються на постерах.', 'Ручна форма має вкладки основних даних, сезонів і прогресу та додаткових відомостей. Дані зберігаються між вкладками; обкладинку можна завантажити файлом або за посиланням.'],
        ['Склад тайтла й прогрес', 'Оновлений редактор частин аніме та серіалів з окремими обкладинками й прогресом.', 'Назва, формат, рік, статус і серії редагуються в одному блоці. Кожна частина має свій прогрес; обкладинка може змінюватися за активною частиною.', 'Загальний прогрес доповнено оцінкою переглянутого й решти часу. Є лічильники повторних переглядів; оновлення складу з джерела зберігає особисті дані.'],
        ['Перероблена статистика', 'Уся бібліотека в одному дашборді: огляд, аналітика й обкладинки творів.', 'Статуси, оцінки, жанри, карта країн, календар завершень та окремий час і прогрес кожного медіа. Вибір даних відкриває відповідну добірку.', 'Переміщуйте блоки, змінюйте розмір і видимість, щільність, обкладинки й період активності. Акценти відповідають кольору плагіна.'],
    ],
    'zh-CN': [
        ['模板与紧凑模式', '为包括音乐在内的全部七种媒体自定义笔记属性，并保持模板顺序。', '字段表支持 YAML 名称、搜索、说明和排序。重命名后的属性在简单与高级模式之间保留。', '紧凑模式不写入空属性：在编辑器中填写后按顺序插入，清空后移除。保留 0 和 false，设置适用于所有媒体。'],
        ['更新的添加窗口', '在同一窗口中搜索目录或手动创建。', '选择来源、搜索作品并在添加前预览所选内容。已入库的作品在海报上标记。', '手动表单分为主要信息、季数与进度及附加信息选项卡。切换时保留输入，封面支持文件上传或链接。'],
        ['作品分部与进度', '更新动漫与剧集分部编辑器，支持独立封面和进度。', '在同一区域编辑名称、格式、年份、状态和集数。每个分部保留独立进度，封面可跟随当前分部。', '总进度显示已观看与剩余时间估算，支持重看计数。从来源刷新分部时保留个人数据。'],
        ['重新设计的统计', '在同一面板查看整个资料库的概览、分析与作品封面。', '查看状态、评分、类型、国家地图、完成日历及各类媒体的独立时长与进度。点击数据可查看对应作品。', '移动模块并调整尺寸、可见性、密度、封面大小与活动周期。强调色跟随插件设置。'],
    ],
};

export function getWorkflowFeatureText(language: Language, target: string): FeatureText | undefined {
    const index = ['templates', 'adding', 'parts', 'statistics'].indexOf(target);
    return index < 0 ? undefined : TEXT[language][index];
}
