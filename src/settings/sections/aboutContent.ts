import type { Language } from '../../types';

type SourceCategory = 'games' | 'gameArtwork' | 'gameTime' | 'anime' | 'animeManga' | 'books' | 'mangaRatings' | 'mangaArtwork' | 'video' | 'series' | 'music' | 'musicArtwork' | 'sync';
interface AboutContent {
    title: string;
    features: Array<{ icon: string; title: string; description: string }>;
    sources: Record<SourceCategory, string>;
}

const CONTENT: Record<Language, AboutContent> = {
    ru: {
        title: 'Новые возможности',
        features: [
            { icon: 'music', title: 'Музыкальная библиотека', description: 'Альбомы и отдельные треки, обложки, даты релиза, треклисты и прогресс прослушивания. Поиск через MusicBrainz и Last.fm, группировка по исполнителям.' },
            { icon: 'palette', title: 'Свои статусы и планы', description: 'Добавляйте статусы для каждого вида медиа, меняйте названия, цвета и иконки Lucide. План-метки игр помогают организовать очередь; редактор поддерживает одну или две колонки.' },
            { icon: 'plug', title: 'Настройки провайдеров', description: 'Цветные индикаторы показывают, какие источники включены, выключены или требуют настройки. AniList и Shikimori доступны для аниме и манги с общими настройками подключения.' },
        ],
        sources: { games: 'Данные об играх и изображения', gameArtwork: 'Обложки и иллюстрации игр', gameTime: 'Время прохождения игр', anime: 'Данные об аниме и изображения', animeManga: 'Данные об аниме и манге, изображения', books: 'Данные о книгах и обложки', mangaRatings: 'Данные о манге и оценки сообщества', mangaArtwork: 'Данные о манге и обложки', video: 'Данные о фильмах и сериалах', series: 'Данные о сериалах и изображения', music: 'Данные об альбомах и треках', musicArtwork: 'Обложки музыкальных релизов', sync: 'Импорт и синхронизация данных вашего аккаунта' },
    },
    uk: {
        title: 'Нові можливості',
        features: [
            { icon: 'music', title: 'Музична бібліотека', description: 'Альбоми й окремі треки, обкладинки, дати релізу, треклисти та прогрес прослуховування. Пошук через MusicBrainz і Last.fm, групування за виконавцями.' },
            { icon: 'palette', title: 'Власні статуси й плани', description: 'Додавайте статуси для кожного виду медіа, змінюйте назви, кольори та іконки Lucide. Плани ігор допомагають упорядкувати чергу; редактор підтримує одну або дві колонки.' },
            { icon: 'plug', title: 'Налаштування провайдерів', description: 'Кольорові індикатори показують, які джерела увімкнені, вимкнені або потребують налаштування. AniList і Shikimori доступні для аніме й манґи зі спільними налаштуваннями підключення.' },
        ],
        sources: { games: 'Дані про ігри та зображення', gameArtwork: 'Обкладинки та ілюстрації ігор', gameTime: 'Час проходження ігор', anime: 'Дані про аніме та зображення', animeManga: 'Дані про аніме й манґу, зображення', books: 'Дані про книги та обкладинки', mangaRatings: 'Дані про манґу й оцінки спільноти', mangaArtwork: 'Дані про манґу та обкладинки', video: 'Дані про фільми й серіали', series: 'Дані про серіали та зображення', music: 'Дані про альбоми й треки', musicArtwork: 'Обкладинки музичних релізів', sync: 'Імпорт і синхронізація даних вашого акаунта' },
    },
    en: {
        title: 'New features',
        features: [
            { icon: 'music', title: 'Music library', description: 'Albums and individual tracks, artwork, release dates, tracklists and listening progress. Search MusicBrainz and Last.fm and group your collection by artist.' },
            { icon: 'palette', title: 'Custom statuses and plans', description: 'Add statuses for each media type and customize names, colors and Lucide icons. Game planning tags organize your queue; the editor supports one or two columns.' },
            { icon: 'plug', title: 'Provider settings', description: 'Colored indicators show which sources are enabled, disabled or need setup. AniList and Shikimori support both anime and manga with shared connection settings.' },
        ],
        sources: { games: 'Game metadata and images', gameArtwork: 'Game covers and artwork', gameTime: 'Game completion times', anime: 'Anime metadata and images', animeManga: 'Anime and manga metadata and images', books: 'Book metadata and cover images', mangaRatings: 'Manga metadata and community ratings', mangaArtwork: 'Manga metadata and cover images', video: 'Movie and series metadata', series: 'Series metadata and images', music: 'Album and track metadata', musicArtwork: 'Music release artwork', sync: 'Import and sync of your account data' },
    },
    'zh-CN': {
        title: '新增功能',
        features: [
            { icon: 'music', title: '音乐资料库', description: '管理专辑和单曲、封面、发行日期、曲目列表与收听进度。通过 MusicBrainz 和 Last.fm 搜索，并按艺术家分组。' },
            { icon: 'palette', title: '自定义状态与计划', description: '为每种媒体添加状态，自定义名称、颜色和 Lucide 图标。游戏计划标签帮助安排队列，编辑器支持一列或两列。' },
            { icon: 'plug', title: '来源设置', description: '彩色指示灯显示来源已启用、已关闭或需要设置。AniList 和 Shikimori 支持动漫与漫画，并共用连接设置。' },
        ],
        sources: { games: '游戏元数据与图片', gameArtwork: '游戏封面与插画', gameTime: '游戏通关时间', anime: '动漫元数据与图片', animeManga: '动漫和漫画元数据与图片', books: '书籍元数据与封面', mangaRatings: '漫画元数据与社区评分', mangaArtwork: '漫画元数据与封面', video: '电影和剧集元数据', series: '剧集元数据与图片', music: '专辑和单曲元数据', musicArtwork: '音乐发行封面', sync: '导入和同步您的账号数据' },
    },
};

export function getAboutContent(language: Language): AboutContent { return CONTENT[language]; }


const DETAILS = {
    ru: {
        soon: 'Скоро', docsSoon: 'Документация готовится и появится позже.',
        sources: 'Сервисы, из которых LOREBASE получает сведения и изображения для вашей библиотеки.',
        rightsTitle: 'Права на материалы',
        rights: 'Права на произведения, обложки, скриншоты, иллюстрации, трейлеры, названия и товарные знаки принадлежат соответствующим авторам, правообладателям и владельцам марок. LOREBASE не присваивает права на эти материалы.',
        rightsUsage: 'Лицензия LOREBASE относится к коду плагина. Доступ к материалам через API и их сохранение в библиотеке сами по себе не предоставляют права на повторную публикацию, распространение или коммерческое использование. Условия использования определяются лицензией материала, источником и правообладателем.',
        independence: 'LOREBASE — независимый проект. Упоминание сервиса, его API или товарного знака не означает официального партнёрства, одобрения или сертификации со стороны этого сервиса.',
        tmdbTitle: 'Использование TMDB API',
        tmdb: 'LOREBASE использует TMDB API для получения данных и изображений. Плагин не одобрен и не сертифицирован TMDB.',
    },
    uk: {
        soon: 'Незабаром', docsSoon: 'Документація готується і з’явиться пізніше.',
        sources: 'Сервіси, з яких LOREBASE отримує відомості та зображення для вашої бібліотеки.',
        rightsTitle: 'Права на матеріали',
        rights: 'Права на твори, обкладинки, скриншоти, ілюстрації, трейлери, назви та торговельні марки належать відповідним авторам, правовласникам і власникам марок. LOREBASE не привласнює права на ці матеріали.',
        rightsUsage: 'Ліцензія LOREBASE стосується коду плагіна. Доступ до матеріалів через API та їх збереження в бібліотеці самі по собі не надають прав на повторну публікацію, поширення чи комерційне використання. Умови використання визначаються ліцензією матеріалу, джерелом і правовласником.',
        independence: 'LOREBASE — незалежний проєкт. Згадування сервісу, його API або торговельної марки не означає офіційного партнерства, схвалення чи сертифікації з боку цього сервісу.',
        tmdbTitle: 'Використання TMDB API',
        tmdb: 'LOREBASE використовує TMDB API для отримання даних і зображень. Плагін не схвалений і не сертифікований TMDB.',
    },
    en: {
        soon: 'Coming soon', docsSoon: 'Documentation is being prepared and will be available later.',
        sources: 'Services that supply metadata and images for your LOREBASE library.',
        rightsTitle: 'Rights to materials',
        rights: 'Rights to works, covers, screenshots, illustrations, trailers, titles and trademarks belong to their respective creators, rights holders and trademark owners. LOREBASE does not claim ownership of these materials.',
        rightsUsage: 'The LOREBASE license covers the plugin code. API access and saving materials to your library do not themselves grant permission to republish, redistribute or use them commercially. Use is subject to the material’s license and the terms of its source and rights holder.',
        independence: 'LOREBASE is an independent project. Mentioning a service, its API or trademark does not imply an official partnership, endorsement or certification by that service.',
        tmdbTitle: 'Use of the TMDB API',
        tmdb: 'This product uses the TMDB API but is not endorsed or certified by TMDB.',
    },
    'zh-CN': {
        soon: '即将推出', docsSoon: '文档正在准备中，将于稍后提供。',
        sources: '为 LOREBASE 资料库提供元数据和图片的服务。',
        rightsTitle: '素材权利归属',
        rights: '作品、封面、截图、插画、预告片、名称和商标的相关权利归各自的创作者、权利人和商标所有人所有。LOREBASE 不主张拥有这些素材的权利。',
        rightsUsage: 'LOREBASE 的许可证适用于插件代码。通过 API 获取素材或保存到资料库，本身并不授予再次发布、分发或商业使用的许可。使用须遵守素材许可证、来源及权利人的相关条款。',
        independence: 'LOREBASE 是独立项目。提及服务、API 或商标并不代表与该服务存在官方合作、认可或认证关系。',
        tmdbTitle: 'TMDB API 的使用',
        tmdb: 'LOREBASE 使用 TMDB API 获取数据和图片，但未经 TMDB 认可或认证。',
    },
} satisfies Record<Language, { soon: string; docsSoon: string; sources: string; rightsTitle: string; rights: string; rightsUsage: string; independence: string; tmdbTitle: string; tmdb: string }>;

export function getAboutDetails(language: Language) { return DETAILS[language]; }
