import { i18n } from './index';
const copy = {
    unknown: ['Date unknown', 'Дата неизвестна', 'Дата невідома', '日期未知'],
    year: ['Only year', 'Только год', 'Лише рік', '仅年份'],
    month: ['Year and month', 'Год и месяц', 'Рік і місяць', '年份和月份'],
    exact: ['Exact date', 'Точная дата', 'Точна дата', '完整日期'],
    completion: ['Completion date', 'Дата завершения', 'Дата завершення', '完成日期'],
    hint: ['Enter a year, year-month or a full date. No missing day will be invented.', 'Можно указать год, год и месяц или полную дату. Неизвестный день не подставляется.', 'Можна вказати рік, рік і місяць або повну дату. Невідомий день не підставляється.', '可输入年份、年月或完整日期，不会补充未知的日期。'],
    invalid: ['Enter a valid date, year or year-month.', 'Введите корректную дату, год или год и месяц.', 'Введіть коректну дату, рік або рік і місяць.', '请输入有效日期、年份或年月。'],
} satisfies Record<string, readonly [string, string, string, string]>;
export function personalDateText(key: keyof typeof copy): string { return copy[key][{ en: 0, ru: 1, uk: 2, 'zh-CN': 3 }[i18n.getLanguage()]]; }
