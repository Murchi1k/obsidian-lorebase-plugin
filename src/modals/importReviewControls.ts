import { setIcon } from 'obsidian';
import { t } from '../localization';
import type { Language } from '../types';

export function renderImportCardMetadata(card: HTMLElement, art: HTMLElement, body: HTMLElement, inLibrary: boolean, details: string): void {
    card.toggleClass('is-in-library', inLibrary);
    if (inLibrary) {
        const badge = art.createDiv({ cls: 'lorebase-select-library-badge', attr: { 'aria-label': t('promptAlreadyInLibrary'), title: t('promptAlreadyInLibrary') } });
        setIcon(badge.createSpan({ cls: 'lorebase-select-library-icon', attr: { 'aria-hidden': 'true' } }), 'book-check');
    }
    const meta = body.createDiv({ cls: 'lorebase-select-card-meta' });
    if (!inLibrary) { meta.setText(details); return; }
    meta.addClass('has-library-state');
    meta.createSpan({ cls: 'lorebase-select-library-state', text: t('promptInLibraryShort') });
    if (details) {
        meta.createSpan({ cls: 'lorebase-select-meta-separator', text: '·', attr: { 'aria-hidden': 'true' } });
        meta.createSpan({ cls: 'lorebase-select-meta-details', text: details });
    }
}

export function createImportFilter(host: HTMLElement, options: {
    id: string; label: string; icon: string; count: number; active: boolean; hint: string; select: () => void;
}): void {
    const button = host.createEl('button', { cls: 'lorebase-select-provider-chip', attr: {
        type: 'button', 'data-filter': options.id, 'aria-pressed': String(options.active), title: options.hint,
    } });
    button.toggleClass('is-active', options.active);
    setIcon(button.createSpan({ cls: 'lorebase-import-filter-icon', attr: { 'aria-hidden': 'true' } }), options.icon);
    button.createSpan({ text: options.label });
    button.createSpan({ cls: 'lorebase-steam-filter-count', text: String(options.count) });
    button.addEventListener('click', () => {
        options.select();
        Array.from(host.querySelectorAll<HTMLButtonElement>('[data-filter]')).find(item => item.dataset.filter === options.id)?.focus({ preventScroll: true });
    });
}

const HINTS = {
    ru: { all: 'Показать весь список.', anime: 'Показать только аниме.', manga: 'Показать только мангу.', played: 'Игры, в которые вы играли: время в Steam больше нуля.', wishlist: 'Игры из вашего списка желаемого Steam.', select: 'Выбрать все результаты текущего поиска и фильтра, включая другие страницы.', clear: 'Снять выбор со всех записей, включая другие страницы.' },
    uk: { all: 'Показати весь список.', anime: 'Показати лише аніме.', manga: 'Показати лише манґу.', played: 'Ігри, у які ви грали: час у Steam більший за нуль.', wishlist: 'Ігри з вашого списку бажаного Steam.', select: 'Вибрати всі результати поточного пошуку й фільтра, включно з іншими сторінками.', clear: 'Зняти вибір з усіх записів, включно з іншими сторінками.' },
    en: { all: 'Show the entire collection.', anime: 'Show anime only.', manga: 'Show manga only.', played: 'Games with more than zero playtime in Steam.', wishlist: 'Games from your Steam wishlist.', select: 'Select all matches for the current search and filter, including other pages.', clear: 'Clear all selections, including other pages.' },
    'zh-CN': { all: '显示全部收藏。', anime: '仅显示动画。', manga: '仅显示漫画。', played: 'Steam 游戏时间大于零的游戏。', wishlist: 'Steam 愿望单中的游戏。', select: '选择当前搜索和筛选的全部结果，包括其他页面。', clear: '清除全部选择，包括其他页面。' },
};
export function importReviewHint(language: Language, key: keyof typeof HINTS.en): string { return HINTS[language][key]; }
