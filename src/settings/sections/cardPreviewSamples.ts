import { i18n } from '../../localization';
import type { MediaItem, MediaType } from '../../types';
import type { ConfigurableCardMedia } from '../../services/media/cardProfiles';

const colors = {
    game: ['#171e36', '#30656e', '#ffc789'],
    anime: ['#251d48', '#73528b', '#ffb5c8'],
    movie: ['#272032', '#865247', '#ffd18b'],
    series: ['#142639', '#416c93', '#c4e8ff'],
    book: ['#26302c', '#667853', '#e2cd90'],
    manga: ['#332340', '#8a5d69', '#fad6b0'],
    music: ['#15263c', '#345a92', '#8fe2cb'],
} as const;

export function getCardPreviewSample(media: MediaType): { title: string; description: string; cover: string } {
    const description = {
        en: 'LOREBASE is a media hub for your games, anime, movies, series, books, manga, and music. Keep your collection in one place, track progress, save ratings, and take notes. Drag the title, year, and description to arrange the card. Pull the bottom-right corner of the description to change the number of lines. Click a badge to turn it on or off, and drag it to a corner of the cover. Each format has its own layout. Try a longer description to see how the card handles text when space runs out. Your collection is made up of notes that you can search, connect, and edit in Obsidian.',
        ru: 'LOREBASE — медиа-хаб для игр, аниме, фильмов, сериалов, книг, манги и музыки. Собирайте коллекцию в одном месте, отмечайте прогресс, ставьте оценки и сохраняйте впечатления. Перетаскивайте название, год и описание, чтобы настроить карточку. Потяните за нижний правый угол описания, чтобы изменить число строк. Нажмите на бейдж, чтобы включить или выключить его, и перетащите в нужный угол обложки. У каждого формата свой макет. Длинное описание помогает увидеть, как текст заполняет доступное место. Ваша коллекция состоит из заметок, которые можно искать, связывать и редактировать в Obsidian.',
        uk: 'LOREBASE — медіахаб для ігор, аніме, фільмів, серіалів, книг, манґи та музики. Збирайте колекцію в одному місці, відстежуйте прогрес, ставте оцінки й зберігайте враження. Перетягуйте назву, рік і опис, щоб налаштувати картку. Потягніть за нижній правий кут опису, щоб змінити кількість рядків. Натисніть бейдж, щоб увімкнути чи вимкнути його, і перетягніть у потрібний кут обкладинки. Кожен формат має власний макет. Довгий опис допомагає побачити, як текст заповнює доступне місце. Ваша колекція складається з нотаток, які можна шукати, пов’язувати й редагувати в Obsidian.',
        'zh-CN': 'LOREBASE 是您的游戏、动画、电影、剧集、图书、漫画和音乐媒体中心。在一处管理收藏，跟踪进度、保存评分并记录感想。拖动标题、年份和描述即可调整卡片。拖动描述右下角可以改变行数。点击徽章可以开启或关闭它，再拖到封面的角落选择位置。横版和竖版各有自己的布局。较长的描述可以帮助您了解文字如何填充可用空间，以及卡片在空间不足时如何截断文字。您的收藏由 Obsidian 笔记组成，可以随时搜索、连接和编辑。通过不同的媒体分类整理收藏，记录每部作品带给您的体验。',
    }[i18n.getLanguage()];
    const [ink, sky, light] = colors[media];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 720">
        <defs><linearGradient id="sky" x2="0" y2="1" gradientUnits="objectBoundingBox">
            <stop stop-color="${ink}"/><stop offset="1" stop-color="${sky}"/>
        </linearGradient></defs>
        <rect width="720" height="720" fill="url(#sky)"/>
        <circle cx="428" cy="331" r="100" fill="${light}"/>
        <g fill="none" stroke="${light}" opacity=".45">
            <circle cx="428" cy="331" r="131"/><circle cx="428" cy="331" r="161"/>
            <path d="M0 331h720M428 65v540"/>
        </g>
        <path d="M0 496 188 338 326 485 460 392 720 536V720H0Z" fill="${sky}"/>
        <path d="M0 599 251 454 380 539 581 453 720 558V720H0Z" fill="${ink}"/>
        <path d="M262 593h205l-36 2H290zm-65 35h311l-47 2H230zm-70 39h414l-62 2H152z" fill="${light}" opacity=".48"/>
    </svg>`;
    return { title: 'LOREBASE', description, cover: 'data:image/svg+xml,' + encodeURIComponent(svg) };
}

export function createCardPreviewItem(media: ConfigurableCardMedia, rating: number): MediaItem {
    const { title, description, cover } = getCardPreviewSample(media);
    const year = new Date().getFullYear();
    const completed = new Date(year, 6, 22, 12);
    const base = {
        filePath: '', displayName: title, nameLower: title.toLowerCase(), description, summary: description,
        year, userRating: rating, communityRating: media === 'music' ? null : 82, favorite: true, poster: null, imageUrl: cover,
        hasCustomPoster: false, isAdult: false, dateAdded: 0, lastModified: 0, dateCompleted: completed.getTime(),
        dateWatched: completed.getTime(), finished: `${year}-07-22`, genres: [], tags: [],
        status: 'completed' as const,
    };
    switch (media) {
        case 'music': return { ...base, type: media, musicKind: 'album', artist: 'LOREBASE', album: title, duration: null, tracks: [] };
        case 'game': return { ...base, type: media, gameSeries: '', workType: 'Game' };
        case 'anime': return { ...base, type: media, format: 'tv', workType: 'JP', seasonCurrent: 2, seasonTotal: 3, episodeCurrent: 8, episodeTotal: 12 };
        case 'movie': return { ...base, type: media, workType: 'Movie' };
        case 'series': return { ...base, type: media, workType: 'Series', seasons: 4, episodeCurrent: 8, episodeTotal: 12 };
        case 'book': return { ...base, type: media, authors: [], pageCurrent: 120, pageTotal: 310, chapterCurrent: null, chapterTotal: null };
        case 'manga': return { ...base, type: media, workType: 'Manga', authors: [], artists: [], volumeCurrent: 8, volumeTotal: 15, chapterCurrent: 19, chapterTotal: 80 };
    }
}
