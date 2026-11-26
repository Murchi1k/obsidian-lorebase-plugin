import { i18n } from '../localization';
const copy = {
    autofill: ['Auto-fill', 'Автозаполнить', 'Автозаповнити', '自动填充'],
    filled: ['Parts filled. Save to keep the changes.', 'Части заполнены. Сохраните изменения в редакторе.', 'Частини заповнено. Збережіть зміни в редакторі.', '已填充分部。保存以应用更改。'],
    failed: ['Parts unavailable. Your changes are kept; try again.', 'Состав недоступен. Ваши изменения сохранены в редакторе; попробуйте ещё раз.', 'Склад недоступний. Ваші зміни збережено в редакторі; спробуйте ще раз.', '分部暂不可用，已保留修改，请重试。'],
} as const;
export const apt = (key: keyof typeof copy): string => copy[key][({ en: 0, ru: 1, uk: 2, 'zh-CN': 3 } as const)[i18n.getLanguage()]];
