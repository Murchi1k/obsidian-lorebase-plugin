import { i18n } from './index';

const copy = {
    edit: ['Edit', 'Редактировать', 'Редагувати', '编辑'],
    done: ['Done', 'Готово', 'Готово', '完成'],
    more: ['Read more', 'Читать дальше', 'Читати далі', '展开全文'],
    less: ['Show less', 'Свернуть', 'Згорнути', '收起'],
    empty: ['Add a description', 'Добавьте описание', 'Додайте опис', '添加简介'],
    addNote: ['Add a note', 'Добавить заметку', 'Додати нотатку', '添加笔记'],
} as const;

export const notesReaderText = (key: keyof typeof copy): string => copy[key][({ en: 0, ru: 1, uk: 2, 'zh-CN': 3 } as const)[i18n.getLanguage()]];
