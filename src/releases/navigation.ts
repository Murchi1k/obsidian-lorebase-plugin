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
    const root = owner.createElement('div');
    root.className = 'lorebase-release-return';
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', copy.resume);
    root.setAttribute('aria-live', 'polite');
    const back = owner.createElement('button');
    back.type = 'button';
    back.className = 'lorebase-release-return-main';
    back.setAttribute('aria-label', copy.resume);
    const icon = owner.createElement('span');
    icon.className = 'lorebase-release-return-icon';
    icon.setAttribute('aria-hidden', 'true');
    setIcon(icon, 'chevron-left');
    const text = owner.createElement('span');
    text.className = 'lorebase-release-return-text';
    const title = owner.createElement('span');
    title.textContent = copy.resume;
    text.append(title);
    back.append(icon, text);
    const dismiss = owner.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'lorebase-release-return-dismiss';
    setIcon(dismiss, 'x');
    dismiss.setAttribute('aria-label', copy.dismiss);
    const cleanup = (): void => root.remove();
    back.addEventListener('click', () => { cleanup(); onReturn(); });
    dismiss.addEventListener('click', cleanup);
    root.append(back, dismiss);
    owner.body.append(root);
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
    const timer = setTimeout(cleanup, 5000);
    function cleanup(): void {
        clearTimeout(timer);
        target!.classList.remove('lorebase-release-target-highlight');
        if (previousTabIndex === null) target!.removeAttribute('tabindex');
        highlights.delete(target!);
    }
    highlights.set(target, cleanup);
}
