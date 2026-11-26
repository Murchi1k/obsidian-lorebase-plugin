import { i18n } from './index';
import type { Language } from '../types';

const COPY = {
    title: ['Additional online features', 'Дополнительные онлайн-функции', 'Додаткові онлайн-функції', '附加在线功能'],
    description: [
        'Screenshots and trailers, actors and filmographies, similar titles, artist information, listening statistics and music previews. Turn off to hide these extras; catalog search, metadata, covers and account sync stay available.',
        'Скриншоты и трейлеры, актёры и фильмографии, похожие тайтлы, сведения об исполнителях, статистика прослушиваний и музыкальные превью. Можно отключить эти дополнения. Поиск, метаданные, обложки и синхронизации продолжат работать.',
        'Скриншоти й трейлери, актори та фільмографії, схожі твори, відомості про виконавців, статистика прослуховувань і музичні прев’ю. Ці доповнення можна вимкнути. Пошук, метадані, обкладинки та синхронізації працюватимуть далі.',
        '截图与预告片、演员和影视作品、相似作品、艺术家信息、收听统计及音乐试听。关闭后隐藏这些附加功能；目录搜索、元数据、封面和账号同步仍可使用。',
    ],
    disabled: [
        'Additional online features are disabled. Enable them in Lorebase → General.',
        'Дополнительные онлайн-функции отключены. Их можно включить в Lorebase → Общие.',
        'Додаткові онлайн-функції вимкнено. Їх можна ввімкнути в Lorebase → Загальні.',
        '附加在线功能已关闭，可在 Lorebase → 常规中启用。',
    ],
} as const;

export function onlineExtrasText(key: keyof typeof COPY, language: Language = i18n.getLanguage()): string {
    return COPY[key][({ en: 0, ru: 1, uk: 2, 'zh-CN': 3 } as const)[language]];
}
