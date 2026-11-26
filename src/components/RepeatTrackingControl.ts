import { renderRepeatCountInput } from './RepeatCountInput';
import { i18n } from '../localization';
import type { MediaItem } from '../types';

const labels = {
    ru: { availablePlatforms: 'Доступные платформы', playedOn: 'Играл на', game: 'Перепрохождения', watch: 'Пересмотры', manga: 'Перечитывания', hint: 'Завершённые повторы сверх первого раза. Прогресс и статус меняются отдельно.' },
    uk: { availablePlatforms: 'Доступні платформи', playedOn: 'Грав на', game: 'Перепроходження', watch: 'Перегляди повторно', manga: 'Перечитування', hint: 'Завершені повтори після першого разу. Прогрес і статус змінюються окремо.' },
    en: { availablePlatforms: 'Available platforms', playedOn: 'Played on', game: 'Replays', watch: 'Rewatches', manga: 'Rereads', hint: 'Completed repeats beyond the first time. Progress and status are edited separately.' },
    'zh-CN': { availablePlatforms: '可用平台', playedOn: '游玩平台', game: '重复通关', watch: '重复观看', manga: '重复阅读', hint: '首次完成后的重复次数。进度和状态单独修改。' },
};
export function trackingText(key: keyof typeof labels.en): string {
    return labels[i18n.getLanguage()][key];
}

export function renderRepeatTracking(root: HTMLElement, item: MediaItem, count: number, onCount: (count: number) => void): void {
    if (item.type === 'game' || item.type === 'book' || item.type === 'music') return;
    const composition = item.type === 'anime' || item.type === 'series'
        ? root.querySelector<HTMLElement>('[data-role="part-repeat-tracking"]') : null;
    const panel = composition ?? root.querySelector<HTMLElement>('.lorebase-editmode-advanced');
    if (!panel) return;
    const body = composition ?? panel.querySelector<HTMLElement>('.lorebase-editmode-advanced-grid, .lorebase-editmode-kv-list, .lorebase-editmode-meta-row') ?? panel;
    const row = body.createDiv({ cls: 'lorebase-media-repeat-row is-wide' });
    const label = trackingText(item.type === 'manga' ? 'manga' : 'watch');
    row.createSpan({ cls: 'lorebase-editmode-field-label', text: label });
    renderRepeatCountInput(row, count, label, trackingText('hint'), onCount);
    body.prepend(row);
}
