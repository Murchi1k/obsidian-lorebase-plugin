import { Notice } from 'obsidian';
import { i18n } from '../localization';

const actionFailed = {
    en: 'Lorebase could not complete the action.',
    ru: 'Lorebase не удалось завершить действие.',
    uk: 'Lorebase не вдалося завершити дію.',
    'zh-CN': 'Lorebase 无法完成此操作。',
};

export function handleAsyncAction<Args extends unknown[]>(action: (...args: Args) => Promise<unknown>): (...args: Args) => void {
    return (...args) => {
        void action(...args).catch((error: unknown) => {
            if (error instanceof Error && error.name === 'AbortError') return;
            new Notice(actionFailed[i18n.getLanguage()]);
        });
    };
}
