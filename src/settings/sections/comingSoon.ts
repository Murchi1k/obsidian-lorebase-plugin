import { t } from '../../localization';
import { ICON_BOOKS, ICON_COMING_SOON, ICON_MOVIES } from './constants';

export function renderComingSoonSection(container: HTMLElement): void {
    const comingSoonContainer = container.createDiv({ cls: 'lorebase-coming-soon' });

    const headerItem = comingSoonContainer.createDiv({ cls: 'lorebase-coming-soon-header' });
    headerItem.createSpan({ cls: 'lorebase-settings-section-icon', text: ICON_COMING_SOON });
    headerItem.createSpan({ text: t('settingsComingSoon') });

    const moviesItem = comingSoonContainer.createDiv({ cls: 'lorebase-coming-soon-item' });
    moviesItem.createSpan({ cls: 'lorebase-coming-soon-icon', text: ICON_MOVIES });
    moviesItem.createSpan({ cls: 'lorebase-coming-soon-text', text: t('settingsComingSoonMoviesText') });

    const booksItem = comingSoonContainer.createDiv({ cls: 'lorebase-coming-soon-item' });
    booksItem.createSpan({ cls: 'lorebase-coming-soon-icon', text: ICON_BOOKS });
    booksItem.createSpan({ cls: 'lorebase-coming-soon-text', text: t('settingsComingSoonBooksText') });
}
