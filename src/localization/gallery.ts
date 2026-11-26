import { i18n } from './index';

const copy = {
    title: ['Media gallery', 'Медиагалерея', 'Медіагалерея', '媒体库'],
    images: ['Images', 'Кадры', 'Кадри', '图片'],
    backdrops: ['Backdrops', 'Задники', 'Фони', '背景图'],
    posters: ['Posters', 'Постеры', 'Постери', '海报'],
    trailers: ['Trailers', 'Трейлеры', 'Трейлери', '预告片'],
    help: ['Images and videos load over the internet. Gallery data is cached while the editor is open. Playing a trailer connects to its video host.', 'Кадры и видео загружаются из интернета. Данные галереи кешируются, пока открыт редактор. При запуске трейлера плеер подключается к видеосервису.', 'Кадри й відео завантажуються з інтернету. Дані галереї кешуються, доки відкритий редактор. Під час запуску трейлера плеєр підключається до відеосервісу.', '图片和视频通过网络加载。编辑器打开时会临时缓存媒体库数据。播放预告片时会连接视频平台。'],
    loading: ['Loading media…', 'Загрузка медиа…', 'Завантаження медіа…', '正在加载媒体…'],
    empty: ['The source has no media in this category.', 'У источника нет медиа в этой категории.', 'Джерело не має медіа в цій категорії.', '来源没有此类别的媒体。'],
    failed: ['Could not load media.', 'Не удалось загрузить медиа.', 'Не вдалося завантажити медіа.', '无法加载媒体。'],
    retry: ['Retry', 'Повторить', 'Повторити', '重试'],
    previous: ['Previous image', 'Предыдущее изображение', 'Попереднє зображення', '上一张图片'],
    next: ['Next image', 'Следующее изображение', 'Наступне зображення', '下一张图片'],
    previousPage: ['Previous thumbnails', 'Предыдущие миниатюры', 'Попередні мініатюри', '上一组缩略图'],
    nextPage: ['Next thumbnails', 'Следующие миниатюры', 'Наступні мініатюри', '下一组缩略图'],
    trailer: ['Trailer', 'Трейлер', 'Трейлер', '预告片'],
    previousTrailer: ['Previous trailer', 'Предыдущий трейлер', 'Попередній трейлер', '上一个预告片'],
    nextTrailer: ['Next trailer', 'Следующий трейлер', 'Наступний трейлер', '下一个预告片'],
    play: ['Play trailer', 'Воспроизвести трейлер', 'Відтворити трейлер', '播放预告片'],
    external: ['Open at source', 'Открыть у источника', 'Відкрити в джерелі', '在来源网站打开'],
    playbackFailed: ['Playback failed. Open the trailer at its source.', 'Не удалось запустить видео. Откройте трейлер у источника.', 'Не вдалося відтворити відео. Відкрийте трейлер у джерелі.', '播放失败。请在来源网站打开预告片。'],
} as const;

export function galleryText(key: keyof typeof copy): string {
    return copy[key][{ en: 0, ru: 1, uk: 2, 'zh-CN': 3 }[i18n.getLanguage()]];
}
