import { setIcon } from 'obsidian';
import { i18n } from '../localization';

export function isMobileInterface(element: HTMLElement): boolean {
    return element.ownerDocument.body.classList.contains('is-mobile')
        || Boolean(element.ownerDocument.defaultView?.matchMedia(
            '(max-width: 760px), (max-width: 1024px) and (max-height: 540px) and (pointer: coarse)'
        ).matches);
}

/** Put the phone close action in the content header, below the system status bar. */
export function addMobileModalClose(modal: HTMLElement, header: HTMLElement, onClose: () => void): HTMLButtonElement {
    modal.classList.add('has-mobile-inline-close');
    header.classList.add('has-mobile-close');
    const close = header.createEl('button', { cls: 'lorebase-mobile-inline-close', attr: { type: 'button' } });
    const label = { en: 'Close', ru: 'Закрыть', uk: 'Закрити', 'zh-CN': '关闭' }[i18n.getLanguage()];
    close.setAttribute('aria-label', label);
    close.title = label;
    setIcon(close, 'x');
    close.addEventListener('click', onClose);
    return close;
}
