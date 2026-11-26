import { i18n } from './index';
const copy = {
    title: ['Cycle', 'Цикл', 'Цикл', '系列'],
    otherBooks: ['Other books in this cycle', 'Другие книги этого цикла', 'Інші книги цього циклу', '此系列的其他书籍'],
    otherManga: ['Other manga in this cycle', 'Другие произведения этого цикла', 'Інші твори цього циклу', '此系列的其他作品'],
    hint: ['Link existing library entries. Each keeps its own note and progress.', 'Объединяйте записи из библиотеки. У каждой остаются своя заметка и прогресс.', 'Об’єднуйте записи з бібліотеки. Кожна зберігає свою нотатку та прогрес.', '关联资料库中的条目，每项保留独立笔记和进度。'],
    add: ['Add from library', 'Добавить из библиотеки', 'Додати з бібліотеки', '从资料库添加'],
    search: ['Find in library…', 'Найти в библиотеке…', 'Знайти в бібліотеці…', '搜索资料库…'],
    empty: ['Add another book or manga from this library to start a cycle.', 'Добавьте другую книгу или мангу из этой библиотеки, чтобы создать цикл.', 'Додайте іншу книгу або манґу з цієї бібліотеки, щоб створити цикл.', '从此资料库添加另一部作品以建立系列。'],
    none: ['No matching entries', 'Подходящих записей нет', 'Відповідних записів немає', '没有匹配的条目'],
    remove: ['Remove from cycle', 'Убрать из цикла', 'Прибрати з циклу', '从系列移除'],
    earlier: ['Move earlier', 'Переместить раньше', 'Перемістити раніше', '向前移动'],
    later: ['Move later', 'Переместить позже', 'Перемістити пізніше', '向后移动'],
    open: ['Open note', 'Открыть заметку', 'Відкрити нотатку', '打开笔记'],
    saved: ['Changes are applied when you save the editor.', 'Изменения применятся при сохранении редактора.', 'Зміни застосуються після збереження редактора.', '保存编辑器后应用更改。'],
    actions: ['Entry actions', 'Действия с произведением', 'Дії з твором', '作品操作'],
    pages: ['Pages', 'Страницы', 'Сторінки', '页数'],
    chapters: ['Chapters', 'Главы', 'Розділи', '章节'],
    volumes: ['Volumes', 'Тома', 'Томи', '卷数'],
    current: ['Current', 'Сейчас', 'Зараз', '当前'],
    total: ['Total', 'Всего', 'Усього', '总计'],
    unknown: ['Total unknown', 'Общее количество неизвестно', 'Загальна кількість невідома', '总数未知'],
    rating: ['Entry rating', 'Оценка произведения', 'Оцінка твору', '作品评分'],
} as const;
export function readingCycleText(key: keyof typeof copy): string {
    return copy[key][({ en: 0, ru: 1, uk: 2, 'zh-CN': 3 } as const)[i18n.getLanguage()]];
}
