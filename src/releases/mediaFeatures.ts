import type { Language } from '../types';

type FeatureText = [string, string, string, string];
const TEXT: Record<Language, FeatureText[]> = {
    ru: [
        ['Типы медиа (кроме музыки и книг)', 'Типы игр, фильмов, сериалов и манги; страна происхождения аниме.', 'Игры: игра и визуальная новелла. Фильмы: фильм, мультфильм и документальный фильм. Сериалы: сериал, мультсериал, документальный сериал и телешоу. Существующие типы манги сохранены. У аниме вместо списка типов — страна происхождения; формат TV / Movie / OVA остаётся отдельным.', 'Добавляйте, переименовывайте, упорядочивайте и удаляйте типы с переносом карточек в настройках карточек. Типы доступны в редакторе и сохранённых фильтрах. Плашки включены по умолчанию; их можно отключить в кастомизации карточек.'],
        ['VNDB для визуальных новелл', 'Ищите и добавляйте визуальные новеллы в библиотеку игр.', 'VNDB доступен рядом с игровыми провайдерами и не требует ключа для поиска. Загружаются название, описание, обложка, платформы, разработчики, дата выпуска и оценка сообщества.', 'Тип «Визуальная новелла» устанавливается автоматически. Источник можно связать с существующей карточкой и обновлять.'],
        ['Страна и 18+ для аниме', 'Фильтруйте аниме по стране происхождения и отметке 18+.', 'AniList передаёт страну и признак взрослого контента. Kitsu и Shikimori передают 18+ по доступному возрастному рейтингу; отсутствующая страна не угадывается.', 'Страну и отметку 18+ можно задать вручную при добавлении и редактировании. Страна отображается на карточке и доступна в сохранённых фильтрах; 18+ — в фильтрах библиотеки.'],
    ],
    en: [
        ['Media types (except music and books)', 'Game, movie, series and manga types, plus anime countries of origin.', 'Games: game and visual novel. Movies: movie, animation and documentary. Series: series, animated series, documentary series and TV show. Existing manga types are preserved. Anime uses country of origin while TV / Movie / OVA remains a separate format.', 'Add, rename, reorder and delete types with reassignment in card settings. Types appear in editors and saved filters. Card badges are enabled by default and can be disabled in card customization.'],
        ['VNDB for visual novels', 'Find and add visual novels to your games library.', 'VNDB joins game providers without a required search key. Import titles, descriptions, covers, platforms, developers, release dates and community ratings.', 'Imports use the Visual novel type automatically. Link existing entries to VNDB and refresh metadata.'],
        ['Anime country and adult filters', 'Filter anime by country of origin and the adult flag.', 'AniList supplies country and adult metadata. Kitsu and Shikimori supply the adult flag from available ratings; missing countries are left unknown.', 'Set country and adult content manually during creation or editing. Country badges and saved country filters are supported, alongside the adult library filter.'],
    ],
    uk: [
        ['Типи медіа (крім музики та книг)', 'Типи ігор, фільмів, серіалів і манґи; країна походження аніме.', 'Ігри: гра й візуальна новела. Фільми: фільм, мультфільм і документальний фільм. Серіали: серіал, мультсеріал, документальний серіал і телешоу. Типи манґи збережено. Для аніме використовується країна, а формат TV / Movie / OVA залишається окремим.', 'Додавайте, перейменовуйте, упорядковуйте й видаляйте типи з перенесенням карток. Типи доступні в редакторі та збережених фільтрах. Плашки ввімкнено за замовчуванням; їх можна вимкнути в оформленні карток.'],
        ['VNDB для візуальних новел', 'Знаходьте й додавайте візуальні новели до бібліотеки ігор.', 'VNDB працює без обов’язкового ключа пошуку. Імпортуються назви, описи, обкладинки, платформи, розробники, дати виходу та оцінки спільноти.', 'Тип «Візуальна новела» встановлюється автоматично. Пов’язуйте наявні картки з VNDB й оновлюйте дані.'],
        ['Країна та 18+ для аніме', 'Фільтруйте аніме за країною походження й позначкою 18+.', 'AniList передає країну й ознаку дорослого вмісту. Kitsu і Shikimori передають 18+ за доступним віковим рейтингом; відсутня країна не вгадується.', 'Задавайте країну та 18+ вручну під час додавання й редагування. Підтримуються плашка країни, збережений фільтр країн і фільтр 18+.'],
    ],
    'zh-CN': [
        ['媒体类型（音乐和书籍除外）', '游戏、电影、剧集和漫画类型，以及动漫原产国。', '游戏支持普通游戏与视觉小说；电影支持真人、动画和纪录片；剧集支持真人、动画、纪录片与电视节目。保留现有漫画类型。动漫使用原产国，TV / Movie / OVA 格式保持独立。', '可添加、重命名、排序和删除类型，删除时迁移卡片。编辑器和保存的筛选支持类型。卡片徽标默认开启，可在外观设置中关闭。'],
        ['视觉小说 VNDB', '搜索视觉小说并添加到游戏资料库。', '无需搜索密钥。导入名称、简介、封面、平台、开发者、发行日期及社区评分。', '自动设置视觉小说类型，可关联现有卡片并刷新元数据。'],
        ['动漫原产国与成人筛选', '按原产国和成人标记筛选动漫。', 'AniList 提供国家和成人标记；Kitsu 与 Shikimori 根据可用年龄分级提供成人标记。未知国家保持为空。', '添加和编辑时可手动设置国家与成人标记，支持卡片徽标和保存的筛选。'],
    ],
};
export function getMediaFeatureText(language: Language, target: string): FeatureText | undefined {
    const index = ['mangaTypes', 'vndb', 'animeOrigin'].indexOf(target);
    return index < 0 ? undefined : TEXT[language][index];
}
