import type { Language } from '../types';

type FeatureText = [title: string, description: string, ...details: string[]];
const TEXT: Record<Language, FeatureText> = {
    ru: [
        'Поиск в библиотеке',
        'Поиск по названиям тайтлов, частей и их альтернативным названиям.',
        '«edgerunners 2» найдёт «Cyberpunk: Edgerunners 2» внутри тайтла. Одна карточка, строка «В составе · …» — нажмите, чтобы открыть найденную часть.',
        '«2 edgerunners» работает так же: порядок слов, регистр, пунктуация и ё/е не мешают. Сначала идут точные совпадения, затем начало названия и остальные совпадения.',
        '«Madhouse» → «Студия: Madhouse»: выберите подсказку, чтобы добавить фильтр. Для книг и манги доступны подсказки авторов, для игр — разработчиков.',
    ],
    en: [
        'Library search',
        'Search title names, part names and their alternative titles.',
        '“edgerunners 2” finds “Cyberpunk: Edgerunners 2” within a title. One card appears with a “Part · …” link: click it to open the matching part.',
        '“2 edgerunners” works too: word order, case, punctuation and the Russian ё/е distinction do not affect matching. Exact matches come first, followed by title prefixes and other matches.',
        '“Madhouse” → “Studio: Madhouse”: select the suggestion to add a filter. Author suggestions are available for books and manga, and developers for games.',
    ],
    uk: [
        'Пошук у бібліотеці',
        'Пошук за назвами тайтлів, частин та їхніми альтернативними назвами.',
        '«edgerunners 2» знайде «Cyberpunk: Edgerunners 2» у складі тайтлу. Одна картка, рядок «У складі · …» — натисніть, щоб відкрити знайдену частину.',
        '«2 edgerunners» працює так само: порядок слів, регістр, пунктуація та ё/е не заважають. Спочатку показуються точні збіги, потім початок назви та решта.',
        '«Madhouse» → «Студія: Madhouse»: виберіть підказку, щоб додати фільтр. Для книг і манґи доступні підказки авторів, для ігор — розробників.',
    ],
    'zh-CN': [
        '资料库搜索',
        '搜索作品名称、分部名称及其别名。',
        '输入“edgerunners 2”可找到包含“Cyberpunk: Edgerunners 2”分部的作品。只显示一张卡片，点击“分部 · …”即可打开对应分部。',
        '“2 edgerunners”也能匹配，词序不限，并忽略大小写、标点及俄语 ё/е 的区别。完全匹配优先，其次为名称开头匹配及其他匹配。',
        '“Madhouse” → “工作室: Madhouse”：选择建议即可添加筛选条件。书籍和漫画支持作者建议，游戏支持开发商建议。',
    ],
};

export function getSearchFeatureText(language: Language): FeatureText { return TEXT[language]; }
