import { i18n } from './index';
const copy = {
    title: ['Similar titles', 'Похожие произведения', 'Схожі твори', '相似作品'],
    loading: ['Loading recommendations…', 'Загружаем рекомендации…', 'Завантажуємо рекомендації…', '正在加载推荐…'],
    empty: ['The source has no recommendations yet.', 'У источника пока нет рекомендаций.', 'Джерело поки не має рекомендацій.', '来源暂无推荐。'],
    failed: ['Could not load recommendations. Try again.', 'Не удалось загрузить рекомендации. Попробуйте ещё раз.', 'Не вдалося завантажити рекомендації. Спробуйте ще раз.', '无法加载推荐，请重试。'],
    retry: ['Retry', 'Повторить', 'Повторити', '重试'],
    source: ['Link a metadata source to see similar titles.', 'Подключите источник метаданных, чтобы увидеть похожие произведения.', 'Підключіть джерело метаданих, щоб побачити схожі твори.', '关联资料来源以查看相似作品。'],
    setup: ['Enable the required catalog in Integrations to load recommendations.', 'Для рекомендаций включите нужный каталог в «Интеграциях».', 'Для рекомендацій увімкніть потрібний каталог в «Інтеграціях».', '请在集成中启用所需来源以加载推荐。'],
    tmdb: ['Enable TMDB and configure its API key to load recommendations.', 'Для рекомендаций включите TMDB и укажите его ключ API в «Интеграциях».', 'Для рекомендацій увімкніть TMDB і вкажіть його ключ API в «Інтеграціях».', '请启用 TMDB 并配置 API 密钥以加载推荐。'],
    online: ['Internet required · Temporary cache', 'Нужен интернет · Временный кеш', 'Потрібен інтернет · Тимчасовий кеш', '需要联网 · 临时缓存'],
    storage: ['Recommendations and covers come from the source website and are cached only in memory. A note is created only when you press the add button.', 'Рекомендации и обложки загружаются с сайта источника и временно кешируются в памяти. Заметка создаётся только при нажатии кнопки добавления.', 'Рекомендації й обкладинки завантажуються із сайту джерела та тимчасово кешуються в пам’яті. Нотатка створюється лише після натискання кнопки додавання.', '推荐和封面来自来源网站，仅临时缓存在内存中。点击添加按钮后才会创建笔记。'],
    add: ['Add to library', 'Добавить в библиотеку', 'Додати до бібліотеки', '添加到资料库'],
    openLibrary: ['Open in library', 'Открыть в библиотеке', 'Відкрити в бібліотеці', '在资料库中打开'],
    adding: ['Adding…', 'Добавляем…', 'Додаємо…', '正在添加…'],
    addFailed: ['Could not add the title. Try again.', 'Не удалось добавить произведение. Попробуйте ещё раз.', 'Не вдалося додати твір. Спробуйте ще раз.', '无法添加此作品，请重试。'],
    openFailed: ['Could not open the note.', 'Не удалось открыть заметку.', 'Не вдалося відкрити нотатку.', '无法打开笔记。'],
    open: ['Open on the source website', 'Открыть на сайте источника', 'Відкрити на сайті джерела', '在来源网站打开'],
} as const;
export function rt(key: keyof typeof copy): string { const language = i18n.getLanguage(); return copy[key][language === 'ru' ? 1 : language === 'uk' ? 2 : language === 'zh-CN' ? 3 : 0]; }
