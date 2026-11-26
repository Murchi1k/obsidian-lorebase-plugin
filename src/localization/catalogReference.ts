import { i18n } from './index';

const copy = {
    placeholder: ['Title, link or ID…', 'Название, ссылка или ID…', 'Назва, посилання або ID…', '名称、链接或 ID…'],
    unsupported: ['This link is not supported. Paste a work page from a configured catalog.', 'Эта ссылка не поддерживается. Вставьте страницу произведения из настроенного каталога.', 'Це посилання не підтримується. Вставте сторінку твору з налаштованого каталогу.', '不支持此链接，请粘贴已配置目录中的作品页面。'],
    invalid: ['Invalid catalog ID or work link.', 'Некорректный ID каталога или ссылка на произведение.', 'Некоректний ID каталогу або посилання на твір.', '目录 ID 或作品链接无效。'],
    wrongMedia: ['This link belongs to a different media type. Open the matching library tab.', 'Ссылка относится к другому типу медиа. Откройте соответствующую вкладку библиотеки.', 'Посилання належить до іншого типу медіа. Відкрийте відповідну вкладку бібліотеки.', '此链接属于其他媒体类型，请打开对应的媒体库标签页。'],
    videoKind: ['Specify the TMDB type: tmdb:movie:123 or tmdb:tv:123.', 'Укажите тип TMDB: tmdb:movie:123 или tmdb:tv:123.', 'Укажіть тип TMDB: tmdb:movie:123 або tmdb:tv:123.', '请指定 TMDB 类型：tmdb:movie:123 或 tmdb:tv:123。'],
    musicKind: ['Select the matching music type: album or track.', 'Выберите соответствующий тип музыки: альбом или трек.', 'Виберіть відповідний тип музики: альбом або трек.', '请选择对应的音乐类型：专辑或曲目。'],
    unavailable: ['The catalog from this link is disabled or needs credentials in Settings → Integrations.', 'Каталог из ссылки выключен или требует ключ в настройках интеграций.', 'Каталог із посилання вимкнений або потребує ключа в налаштуваннях інтеграцій.', '链接中的目录已禁用或需要在集成设置中配置密钥。'],
    notFound: ['The exact record was not found. Check the link, ID and media type.', 'Точная запись не найдена. Проверьте ссылку, ID и тип медиа.', 'Точний запис не знайдено. Перевірте посилання, ID і тип медіа.', '未找到对应记录，请检查链接、ID 和媒体类型。'],
    adult: ['This record is 18+. Enable the 18+ filter to view it.', 'Это запись 18+. Включите фильтр 18+, чтобы увидеть её.', 'Це запис 18+. Увімкніть фільтр 18+, щоб побачити його.', '此记录为成人内容，请启用 18+ 筛选以查看。'],
    legacyMu: ['Use a current MangaUpdates /series/ link or its decimal API ID. Legacy series.html IDs are different.', 'Используйте современную ссылку MangaUpdates /series/ или десятичный ID API. Старые ID из series.html отличаются.', 'Використайте сучасне посилання MangaUpdates /series/ або десятковий ID API. Старі ID з series.html відрізняються.', '请使用 MangaUpdates 当前的 /series/ 链接或 API 十进制 ID；旧 series.html ID 不同。'],
    openExisting: ['Already in library — open', 'Уже в библиотеке — открыть', 'Уже в бібліотеці — відкрити', '已在库中 — 打开'],
} satisfies Record<string, readonly [string, string, string, string]>;

export function referenceText(key: keyof typeof copy): string {
    return copy[key][{ en: 0, ru: 1, uk: 2, 'zh-CN': 3 }[i18n.getLanguage()]];
}
export class CatalogReferenceError extends Error {
    constructor(key: keyof typeof copy) { super(referenceText(key)); this.name = 'CatalogReferenceError'; }
}
