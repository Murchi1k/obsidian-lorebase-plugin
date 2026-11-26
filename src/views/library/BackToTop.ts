import { setIcon } from 'obsidian';
import { i18n } from '../../localization';

/** Lives outside the scroll content so virtualization cannot move the button. */
export class BackToTop {
    private readonly root: HTMLElement;
    private readonly button: HTMLButtonElement;
    private readonly onScroll = (): void => {
        const hidden = this.container.scrollTop < Math.max(320, this.container.clientHeight * .75);
        if (this.root.hidden !== hidden) this.root.hidden = hidden;
    };

    constructor(parent: HTMLElement, private readonly container: HTMLElement) {
        const label = { en: 'Back to top', ru: 'Наверх', uk: 'Нагору', 'zh-CN': '返回顶部' }[i18n.getLanguage()];
        this.root = parent.createDiv({ cls: 'lorebase-scroll-tools' });
        this.button = this.root.createEl('button', { attr: { type: 'button', title: label, 'aria-label': label } });
        setIcon(this.button, 'arrow-up');
        this.button.addEventListener('click', this.onClick);
        container.addEventListener('scroll', this.onScroll, { passive: true });
        this.onScroll();
    }

    private readonly onClick = (): void => {
        const reduced = this.container.ownerDocument.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.container.scrollTo({ top: 0, behavior: reduced ? 'instant' : 'smooth' });
        // Do not leave keyboard focus on a button that disappears at the top.
        this.container.focus({ preventScroll: true });
    };

    destroy(): void {
        this.container.removeEventListener('scroll', this.onScroll);
        this.button.removeEventListener('click', this.onClick);
        this.root.remove();
    }
}
