import type { Language, MediaItem } from '../types';
import { getReleaseDate } from '../views/library/releaseCalendar';
import { formatReleaseDate, getItemReleaseWindow } from './releaseDates';

/** Count calendar days, so changing clocks does not add or lose a release day. */
export function withReleaseCountdown(label: string, item: MediaItem, language: Language, now = new Date(), enabled = true): string {
    if (item.status !== 'to_be_released') return label;
    const window = getItemReleaseWindow(item);
    if (window && window.precision !== 'day') return `${label} · ${formatReleaseDate(window.value,language)}`;
    if (!enabled) return label;
    const release = getReleaseDate(item);
    if (!release) return label;
    const day = (date: Date): number => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    const days = Math.round((day(release) - day(now)) / 86_400_000);
    if (days < 0) return label;
    const defaultLabels = ['Ожидает релиза', 'Очікує релізу', 'To be released', '即将发行'];
    if (defaultLabels.includes(label)) {
        if (days === 0) return { ru: 'Релиз сегодня', uk: 'Реліз сьогодні', en: 'Out today', 'zh-CN': '今天发行' }[language];
        return { ru: `Релиз через ${days} дн.`, uk: `Реліз через ${days} дн.`, en: `Out in ${days}d`, 'zh-CN': `${days} 天后发行` }[language];
    }
    if (days === 0) return `${label} — ${{ ru: 'сегодня', uk: 'сьогодні', en: 'today', 'zh-CN': '今天' }[language]}`;
    const remaining = language === 'ru' || language === 'uk' ? `${days} дн.` : language === 'zh-CN' ? `${days} 天` : `${days}d`;
    return `${label} — ${remaining}`;
}
