import { i18n } from '../localization';
const copy = {
    priority: ['Priority', 'Приоритет', 'Пріоритет', '优先级'],
    high: ['High', 'Высокий', 'Високий', '高'],
    highest: ['Highest', 'Наивысший', 'Найвищий', '最高'],
    normal: ['Normal', 'Обычный', 'Звичайний', '普通'],
    low: ['Low', 'Низкий', 'Низький', '低'],
} as const;
export function pt(key: keyof typeof copy, language: string = i18n.getLanguage()): string {
    const index = language.startsWith('ru') ? 1 : language.startsWith('uk') ? 2 : language.startsWith('zh') ? 3 : 0;
    return copy[key][index];
}
