import type { Language } from '../types';
import { formatReleaseDate, parseReleaseWindow } from './releaseDates';

/** Preserve the precision supplied by the catalogue; never invent a month or day. */
export function fuzzySearchReleaseDate(value: Record<string, unknown> | null): string {
    const year = Number(value?.year);
    if (!Number.isInteger(year) || year < 1 || year > 9999) return '';
    const month = Number(value?.month);
    const day = Number(value?.day);
    const prefix = String(year).padStart(4, '0');
    if (!Number.isInteger(month) || month < 1 || month > 12) return prefix;
    const yearMonth = `${prefix}-${String(month).padStart(2, '0')}`;
    return Number.isInteger(day) && day >= 1 && day <= 31 ? `${yearMonth}-${String(day).padStart(2, '0')}` : yearMonth;
}

export function formatSearchReleaseDate(raw: string, language: Language): string {
    if (parseReleaseWindow(raw)?.precision === 'quarter' || parseReleaseWindow(raw)?.precision === 'unknown') return formatReleaseDate(raw, language);
    let value = raw.trim();
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const steamDate = /^(?:([a-z]+)\s+(\d{1,2}),?|(\d{1,2})\s+([a-z]+)),?\s+(\d{4})$/i.exec(value);
    if (steamDate) {
        const monthIndex = months.indexOf((steamDate[1] || steamDate[4]).slice(0, 3).toLowerCase());
        if (monthIndex >= 0) value = `${steamDate[5]}-${String(monthIndex + 1).padStart(2, '0')}-${(steamDate[2] || steamDate[3]).padStart(2, '0')}`;
    }
    const match = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?(?:T.*)?$/.exec(value);
    if (!match) return value;
    const [, year, month, day] = match;
    if (!month || Number(month) < 1 || Number(month) > 12) return year;
    const date = new Date(`${year}-${month}-01T00:00:00Z`);
    const validDay = day && Number(day) >= 1 && Number(day) <= new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
    if (validDay) date.setUTCDate(Number(day));
    const locale = { ru: 'ru-RU', uk: 'uk-UA', en: 'en-US', 'zh-CN': 'zh-CN' }[language];
    return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', ...(validDay ? { day: 'numeric' as const } : {}), timeZone: 'UTC' })
        .format(date).replace(/\s*г\.$/, '');
}
