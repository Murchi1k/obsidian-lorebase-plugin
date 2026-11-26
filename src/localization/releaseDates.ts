import { i18n } from './index';
const copy = {
    day: ['Day', 'День', 'День', '日'],
    month: ['Month', 'Месяц', 'Місяць', '月'],
    year: ['Year', 'Год', 'Рік', '年'],
    quarter: ['Quarter', 'Квартал', 'Квартал', '季度'],
    expected: ['Expected', 'Ожидается', 'Очікується', '预计'],
    approximate: ['Without an exact day', 'Без точного дня', 'Без точного дня', '具体日期未定'],
    hint: ['YYYY, YYYY-MM, YYYY-Q1, YYYY-MM-DD or unknown', 'ГГГГ, ГГГГ-ММ, ГГГГ-Q1, полная дата или «неизвестно»', 'РРРР, РРРР-ММ, РРРР-Q1, повна дата або «невідомо»', '年、年-月、年-Q1、完整日期或 unknown'],
    invalid: ['Enter a valid release date or select its precision.', 'Укажите корректную дату релиза или выберите её точность.', 'Укажіть коректну дату релізу або виберіть її точність.', '请输入有效发行日期或选择精度。'],
} as const;
export const releaseDateText = (key: keyof typeof copy): string => copy[key][({en:0,ru:1,uk:2,'zh-CN':3} as const)[i18n.getLanguage()]];
