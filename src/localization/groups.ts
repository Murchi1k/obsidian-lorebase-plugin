import { i18n } from './index';

const copy = {
    newGroup: ['New group', 'Новая группа', 'Нова група', '新建分组'],
    search: ['Find a group…', 'Найти группу…', 'Знайти групу…', '搜索分组…'],
    noResults: ['No matching groups', 'Группы не найдены', 'Групи не знайдено', '未找到分组'],
    noResultsHint: ['Try another name or description.', 'Измените название или описание в поиске.', 'Змініть назву або опис у пошуку.', '请尝试搜索其他名称或描述。'],
    edit: ['Edit', 'Изменить', 'Змінити', '编辑'],
    editGroup: ['Edit group', 'Настройки группы', 'Налаштування групи', '编辑分组'],
    createHint: ['Give your collection a name and a simple look.', 'Название и оформление вашей подборки.', 'Назва й оформлення вашої добірки.', '设置收藏的名称和外观。'],
    name: ['Group name', 'Название группы', 'Назва групи', '分组名称'],
    nameRequired: ['Enter a group name.', 'Введите название группы.', 'Введіть назву групи.', '请输入分组名称。'],
    description: ['Description', 'Описание', 'Опис', '描述'],
    descriptionHint: ['What would you like to collect here?', 'Что вы хотите собрать в этой группе?', 'Що ви хочете зібрати в цій групі?', '你想在这里收藏什么？'],
    noDescription: ['No description', 'Без описания', 'Без опису', '暂无描述'],
    optional: ['Optional', 'Необязательно', 'Необов’язково', '可选'],
    icon: ['Icon', 'Иконка', 'Іконка', '图标'],
    color: ['Group color', 'Цвет группы', 'Колір групи', '分组颜色'],
    customColor: ['Custom color', 'Свой цвет', 'Власний колір', '自定义颜色'],
    pinned: ['Pin to the top', 'Закрепить в начале', 'Закріпити на початку', '置顶'],
    pinnedHint: ['Show this group first in the overview.', 'Показывать эту группу первой в списке.', 'Показувати цю групу першою в списку.', '在分组列表中优先显示。'],
    pinnedLabel: ['Pinned', 'Закреплена', 'Закріплена', '已置顶'],
    pin: ['Pin group', 'Закрепить группу', 'Закріпити групу', '置顶分组'],
    unpin: ['Unpin group', 'Открепить группу', 'Відкріпити групу', '取消置顶'],
    allIcons: ['All icons', 'Все иконки', 'Усі іконки', '全部图标'],
    searchIcons: ['Find an icon…', 'Найти иконку…', 'Знайти іконку…', '搜索图标…'],
    iconsEmpty: ['No matching icons', 'Иконки не найдены', 'Іконки не знайдено', '未找到图标'],
    uploadIcon: ['Upload icon', 'Своя иконка', 'Власна іконка', '上传图标'],
    iconFileHint: ['SVG, PNG, JPG or WebP · up to 256 KB', 'SVG, PNG, JPG или WebP · до 256 КБ', 'SVG, PNG, JPG або WebP · до 256 КБ', 'SVG、PNG、JPG 或 WebP · 最大 256 KB'],
    iconFileError: ['Choose an SVG, PNG, JPG or WebP file up to 256 KB.', 'Выберите SVG, PNG, JPG или WebP размером до 256 КБ.', 'Оберіть SVG, PNG, JPG або WebP розміром до 256 КБ.', '请选择不超过 256 KB 的 SVG、PNG、JPG 或 WebP 文件。'],
    preview: ['Preview', 'Предпросмотр', 'Попередній перегляд', '预览'],
    previewHint: ['This is how the group will appear in the overview.', 'Так группа будет выглядеть в списке.', 'Так група виглядатиме в списку.', '分组在列表中的显示效果。'],
    anyMedia: ['All media types can be combined in one group.', 'В одной группе можно собирать любые типы медиа.', 'В одній групі можна збирати будь-які типи медіа.', '同一分组中可组合任何媒体类型。'],
    back: ['All groups', 'Все группы', 'Усі групи', '全部分组'],
    done: ['Done', 'Готово', 'Готово', '完成'],
    inGroup: ['In this group', 'В группе', 'У групі', '分组中'],
    showMore: ['Show more', 'Показать ещё', 'Показати ще', '显示更多'],
    folder: ['Folder', 'Папка', 'Тека', '文件夹'],
    sparkles: ['Sparkles', 'Искры', 'Іскри', '闪光'],
    star: ['Star', 'Звезда', 'Зірка', '星星'],
    heart: ['Heart', 'Сердце', 'Серце', '爱心'],
    'gamepad-2': ['Games', 'Игры', 'Ігри', '游戏'],
    music: ['Music', 'Музыка', 'Музика', '音乐'],
    clapperboard: ['Films', 'Фильмы', 'Фільми', '电影'],
    'book-open': ['Books', 'Книги', 'Книги', '书籍'],
    tv: ['Series', 'Сериалы', 'Серіали', '剧集'],
    headphones: ['Headphones', 'Наушники', 'Навушники', '耳机'],
    moon: ['Moon', 'Луна', 'Місяць', '月亮'],
    coffee: ['Coffee', 'Кофе', 'Кава', '咖啡'],
    trophy: ['Trophy', 'Трофей', 'Трофей', '奖杯'],
    layers: ['Layers', 'Слои', 'Шари', '图层'],
    bookmark: ['Bookmark', 'Закладка', 'Закладка', '书签'],
    compass: ['Compass', 'Компас', 'Компас', '指南针'],
    flame: ['Flame', 'Огонь', 'Вогонь', '火焰'],
    leaf: ['Leaf', 'Лист', 'Листок', '叶子'],
    palette: ['Palette', 'Палитра', 'Палітра', '调色板'],
    camera: ['Camera', 'Камера', 'Камера', '相机'],
    'disc-3': ['Disc', 'Диск', 'Диск', '唱片'],
    ghost: ['Ghost', 'Призрак', 'Привид', '幽灵'],
    rocket: ['Rocket', 'Ракета', 'Ракета', '火箭'],
    swords: ['Swords', 'Мечи', 'Мечі', '双剑'],
    gem: ['Gem', 'Кристалл', 'Кристал', '宝石'],
    mountain: ['Mountain', 'Горы', 'Гори', '山峰'],
    'flower-2': ['Flower', 'Цветок', 'Квітка', '花朵'],
    sun: ['Sun', 'Солнце', 'Сонце', '太阳'],
    'cloud-moon': ['Night', 'Ночь', 'Ніч', '夜晚'],
    archive: ['Archive', 'Архив', 'Архів', '归档'],
    film: ['Film reel', 'Киноплёнка', 'Кіноплівка', '胶片'],
    'notebook-pen': ['Notebook', 'Блокнот', 'Блокнот', '笔记本'],
} as const;

export function groupText(key: keyof typeof copy): string {
    return copy[key][{ en: 0, ru: 1, uk: 2, 'zh-CN': 3 }[i18n.getLanguage()]];
}

export function groupCount(count: number): string {
    const language = i18n.getLanguage();
    if (language === 'zh-CN') return `${count} 个分组`;
    const rule = new Intl.PluralRules(i18n.getLocale()).select(count);
    const unit = {
        en: ['group', 'groups', 'groups'], ru: ['группа', 'группы', 'групп'], uk: ['група', 'групи', 'груп'],
    }[language][rule === 'one' ? 0 : rule === 'few' ? 1 : 2];
    return `${count} ${unit}`;
}
