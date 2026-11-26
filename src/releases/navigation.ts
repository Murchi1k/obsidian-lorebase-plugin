import type { Language } from '../types';
import { setIcon } from 'obsidian';

export interface ReleaseWindowState {
    tab: 'features' | 'history' | 'community';
    featureIndex: number;
    historyVersion?: string;
    historyDetails: boolean;
    historyKind?: 'added' | 'improved' | 'fixed';
}

export function createReleaseWindowState(): ReleaseWindowState {
    return { tab: 'features', featureIndex: 0, historyDetails: false };
}

export const RETURN_COPY = {
    ru: { resume: 'Вернуться к новинкам', continue: 'Продолжить с того же места', dismiss: 'Скрыть кнопку возврата' },
    en: { resume: 'Back to what’s new', continue: 'Continue where you left off', dismiss: 'Dismiss return button' },
    uk: { resume: 'Повернутися до новинок', continue: 'Продовжити з того ж місця', dismiss: 'Приховати кнопку повернення' },
    'zh-CN': { resume: '返回新功能', continue: '从上次的位置继续', dismiss: '隐藏返回按钮' },
} satisfies Record<Language, { resume: string; continue: string; dismiss: string }>;

/** A non-modal return control; it never blocks interaction with the destination. */
export function mountReleaseReturn(owner: Document, language: Language, onReturn: () => void): () => void {
    const copy = RETURN_COPY[language];
    const root = owner.body.createDiv({
        cls: 'lorebase-release-return', attr: { role: 'region', 'aria-label': copy.resume, 'aria-live': 'polite' },
    });
    const back = root.createEl('button', {
        cls: 'lorebase-release-return-main', attr: { type: 'button', 'aria-label': copy.resume },
    });
    setIcon(back.createSpan({ cls: 'lorebase-release-return-icon', attr: { 'aria-hidden': 'true' } }), 'chevron-left');
    back.createSpan({ cls: 'lorebase-release-return-text' }).createSpan({ text: copy.resume });
    const dismiss = root.createEl('button', {
        cls: 'lorebase-release-return-dismiss', attr: { type: 'button', 'aria-label': copy.dismiss },
    });
    setIcon(dismiss, 'x');
    const cleanup = (): void => root.remove();
    back.addEventListener('click', () => { cleanup(); onReturn(); });
    dismiss.addEventListener('click', cleanup);
    return cleanup;
}

const highlights = new WeakMap<HTMLElement, () => void>();

/** Mark the target temporarily, preserving any existing keyboard-focus attributes. */
export function highlightReleaseTarget(target: HTMLElement | null | undefined): void {
    if (!target) return;
    highlights.get(target)?.();
    const previousTabIndex = target.getAttribute('tabindex');
    target.classList.add('lorebase-release-target-highlight');
    if (previousTabIndex === null) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
    const view = target.ownerDocument.defaultView ?? window;
    const timer = view.setTimeout(cleanup, 5000);
    function cleanup(): void {
        view.clearTimeout(timer);
        target!.classList.remove('lorebase-release-target-highlight');
        if (previousTabIndex === null) target!.removeAttribute('tabindex');
        highlights.delete(target!);
    }
    highlights.set(target, cleanup);
}
