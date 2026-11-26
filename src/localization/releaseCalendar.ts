import { i18n, t } from './index';

const copy = {
    search: ['Find a release…', 'Найти релиз…', 'Знайти реліз…', '搜索发行作品…'],
    allMedia: ['All media', 'Все медиа', 'Усі медіа', '全部媒体'],
    showMedia: ['Show this media type', 'Показать этот тип медиа', 'Показати цей тип медіа', '显示此媒体类型'],
    hideMedia: ['Hide this media type', 'Скрыть этот тип медиа', 'Приховати цей тип медіа', '隐藏此媒体类型'],
    nearest: ['Upcoming releases', 'Ближайшие релизы', 'Найближчі релізи', '即将发行的作品'],
    nearestHint: ['Next releases from your library', 'Следующие выходы из вашей библиотеки', 'Наступні виходи з вашої бібліотеки', '资料库中接下来发行的作品'],
    noUpcoming: ['No upcoming releases', 'Ближайших релизов нет', 'Найближчих релізів немає', '暂无即将发行的作品'],
    noUpcomingHint: ['Choose a date in the calendar to see its releases.', 'Выберите дату в календаре, чтобы увидеть её релизы.', 'Виберіть дату в календарі, щоб побачити її релізи.', '选择日历中的日期以查看发行作品。'],
    dayHint: ['Releases on the selected date', 'Релизы на выбранную дату', 'Релізи на вибрану дату', '所选日期的发行作品'],
    chooseDay: ['Choose a date to filter the gallery', 'Выберите дату, чтобы отфильтровать галерею', 'Виберіть дату, щоб відфільтрувати галерею', '选择日期以筛选作品'],
    years: ['Years', 'Годы', 'Роки', '年份'],
    months: ['Months', 'Месяцы', 'Місяці', '月份'],
    moreMonths: ['Show more months', 'Показать ещё месяцы', 'Показати ще місяці', '显示更多月份'],
    showMore: ['Show more', 'Показать ещё', 'Показати ще', '显示更多'],
    noDay: ['No releases on this date', 'На эту дату релизов нет', 'На цю дату релізів немає', '此日期暂无发行'],
    noSearch: ['Nothing matches your search', 'По вашему запросу ничего не найдено', 'За вашим запитом нічого не знайдено', '未找到匹配的作品'],
    trySearch: ['Change the search or media filters.', 'Измените запрос или фильтры медиа.', 'Змініть запит або фільтри медіа.', '请更改搜索内容或媒体筛选条件。'],
    selected: ['Selected date', 'Выбранная дата', 'Вибрана дата', '所选日期'],
    retry: ['Try again', 'Повторить', 'Повторити', '重试'],
} as const;

export function calendarText(key: keyof typeof copy): string {
    const index = { en: 0, ru: 1, uk: 2, 'zh-CN': 3 }[i18n.getLanguage()];
    return copy[key][index];
}

export function calendarCountdownText(days: number): string {
    if (days === 0) return t('releaseToday');
    const language = i18n.getLanguage();
    if (language === 'zh-CN') return `${days} 天后`;
    const plural = new Intl.PluralRules(i18n.getLocale()).select(days);
    const index = plural === 'one' ? 0 : plural === 'few' ? 1 : 2;
    const unit = {
        en: ['day', 'days', 'days'], ru: ['день', 'дня', 'дней'], uk: ['день', 'дні', 'днів'],
    }[language][index];
    return language === 'en' ? `In ${days} ${unit}` : `Через ${days} ${unit}`;
}
