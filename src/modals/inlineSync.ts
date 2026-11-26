import { setIcon } from 'obsidian';
import type { Language } from '../types';

export interface InlineSyncPresentation {
    host: HTMLElement;
    signal: AbortSignal;
    onBack: () => void;
}

const TEXT = {
    ru: { loading: 'Загружаем библиотеку Steam…', empty: 'В Steam не найдено игр для импорта.', error: 'Не удалось загрузить библиотеку Steam.', retry: 'Повторить' },
    uk: { loading: 'Завантажуємо бібліотеку Steam…', empty: 'У Steam не знайдено ігор для імпорту.', error: 'Не вдалося завантажити бібліотеку Steam.', retry: 'Повторити' },
    en: { loading: 'Loading your Steam library…', empty: 'No Steam games found to import.', error: 'Could not load your Steam library.', retry: 'Retry' },
    'zh-CN': { loading: '正在加载 Steam 游戏库…', empty: '没有可导入的 Steam 游戏。', error: '无法加载 Steam 游戏库。', retry: '重试' },
};

export function renderInlineImportState(presentation: InlineSyncPresentation, language: Language,
    state: 'loading' | 'empty' | 'error', error?: unknown, retry?: () => void, source: 'steam' | 'anilist' = 'steam'): void {
    if (presentation.signal.aborted) return;
    const { host } = presentation;
    host.empty();
    const box = host.createDiv({ cls: `lorebase-select-empty lorebase-steam-sync-message is-${state}`, attr: { role: 'status' } });
    setIcon(box.createSpan(), state === 'loading' ? 'loader-circle' : state === 'error' ? 'circle-alert' : 'search-x');
    const anilist = {
        ru: { loading: 'Загружаем список AniList…', empty: 'В AniList нет записей для импорта.', error: 'Не удалось загрузить список AniList.' },
        uk: { loading: 'Завантажуємо список AniList…', empty: 'В AniList немає записів для імпорту.', error: 'Не вдалося завантажити список AniList.' },
        en: { loading: 'Loading your AniList collection…', empty: 'No AniList entries to import.', error: 'Could not load your AniList collection.' },
        'zh-CN': { loading: '正在加载 AniList 收藏…', empty: '没有可导入的 AniList 条目。', error: '无法加载 AniList 收藏。' },
    };
    box.createSpan({ text: (source === 'anilist' ? anilist : TEXT)[language][state] });
    if (error instanceof Error && error.message) box.createDiv({ cls: 'lorebase-steam-sync-error-detail', text: error.message });
    if (retry) {
        const button = box.createEl('button', { cls: 'lorebase-select-header-action', text: TEXT[language].retry, attr: { type: 'button' } });
        button.addEventListener('click', retry);
    }
}

export const renderInlineSteamState = renderInlineImportState;

/** Returning to search must not wait for a slow preview request or mount its late result. */
export async function waitForInlinePreview<T>(work: Promise<T>, signal: AbortSignal): Promise<T | undefined> {
    if (signal.aborted) { void work.catch(() => {}); return undefined; }
    let cancel!: () => void;
    const aborted = new Promise<undefined>(resolve => { cancel = () => resolve(undefined); signal.addEventListener('abort', cancel, { once: true }); });
    try { return await Promise.race([work, aborted]); }
    finally { signal.removeEventListener('abort', cancel); }
}
