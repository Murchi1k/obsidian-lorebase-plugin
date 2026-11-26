import type { StatRecord } from './statistics';

export type StatisticsPeriod = 'all' | 'week' | 'month' | 'year';
export function statisticsPeriodRange(period: StatisticsPeriod, now = new Date()): { from: number; to: number } | null {
    if (period === 'all') return null;
    const start = period === 'year' ? new Date(now.getFullYear(), 0, 1) : period === 'month' ? new Date(now.getFullYear(), now.getMonth(), 1) : new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    return { from: start.getTime(), to: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime() };
}
export function statisticsRatingSummary(rows: StatRecord[]) {
    const values = rows.map(row => row.item.userRating).filter((rating): rating is number => typeof rating === 'number' && Number.isFinite(rating) && rating > 0).sort((a, b) => a - b);
    return { count: values.length, median: values.length ? (values[Math.floor((values.length - 1) / 2)] + values[Math.ceil((values.length - 1) / 2)]) / 2 : null };
}
