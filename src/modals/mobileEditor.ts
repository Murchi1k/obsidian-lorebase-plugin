import { t } from '../localization';

type MobilePane = 'general' | 'personal' | 'more';

/** Adds the same phone navigation and compact summary to every media editor. */
export function setupMobileEditor(root: HTMLElement, onSave: () => void): void {
    const view = root.querySelector<HTMLElement>('.lorebase-editmode-view');
    const grid = root.querySelector<HTMLElement>('.lorebase-editmode-grid');
    if (!view || !grid || view.querySelector('.lorebase-editmode-mobile-tabs')) return;

    view.dataset.mobileTab = 'general';
    annotatePanels(root);
    createMobileSummary(root);

    const tabs = createEl('nav');
    tabs.className = 'lorebase-editmode-mobile-tabs';
    tabs.setAttribute('aria-label', t('editGeneral'));
    const definitions: Array<{ pane: MobilePane; label: string }> = [
        { pane: 'general', label: t('editGeneral') },
        { pane: 'personal', label: t('editPersonal') },
        { pane: 'more', label: t('editMore') },
    ];
    for (const definition of definitions) {
        const button = createEl('button');
        button.type = 'button';
        button.className = `lorebase-editmode-mobile-tab ${definition.pane === 'general' ? 'is-active' : ''}`;
        button.dataset.mobileTabTarget = definition.pane;
        button.textContent = definition.label;
        button.setAttribute('aria-selected', String(definition.pane === 'general'));
        button.addEventListener('click', () => {
            view.dataset.mobileTab = definition.pane;
            tabs.querySelectorAll<HTMLButtonElement>('[data-mobile-tab-target]').forEach((tab) => {
                const active = tab === button;
                tab.toggleClass('is-active', active);
                tab.setAttribute('aria-selected', String(active));
            });
            grid.scrollTo({ top: 0, behavior: 'smooth' });
        });
        tabs.appendChild(button);
    }
    grid.before(tabs);

    const footer = createEl('footer');
    footer.className = 'lorebase-editmode-mobile-footer';
    const save = createEl('button');
    save.type = 'button';
    save.className = 'lorebase-editmode-btn lorebase-editmode-btn-primary';
    save.textContent = t('editSave');
    save.addEventListener('click', onSave);
    footer.appendChild(save);
    view.appendChild(footer);
}

function annotatePanels(root: HTMLElement): void {
    root.querySelectorAll<HTMLElement>('.lorebase-editmode-column .lorebase-editmode-panel').forEach((panel) => {
        if (panel.dataset.mobilePane) return;
        let pane: MobilePane = 'more';
        if (panel.matches('.lorebase-editmode-poster-card, .lorebase-editmode-title-meta, .lorebase-editmode-status-rating')) {
            pane = 'general';
        } else if (panel.matches([
            '.lorebase-editmode-quick-settings',
            '.lorebase-editmode-plan-tags',
            '.lorebase-editmode-notes',
            '.lorebase-editmode-tags',
            '.lorebase-editmode-reading-progress',
            '.lorebase-editmode-anime-parts',
            '.lorebase-editmode-series-parts',
        ].join(', '))) {
            pane = 'personal';
        }
        panel.dataset.mobilePane = pane;
    });
}

function createMobileSummary(root: HTMLElement): void {
    const posterCard = root.querySelector<HTMLElement>('.lorebase-editmode-poster-card');
    if (!posterCard || posterCard.querySelector('.lorebase-editmode-mobile-summary, .lorebase-game-cover-identity')) return;
    const titleInput = root.querySelector<HTMLInputElement>('[data-field="title"]');
    const yearInput = root.querySelector<HTMLInputElement>('[data-field="year"]');
    const summary = createDiv();
    summary.className = 'lorebase-editmode-mobile-summary';
    const title = createEl('strong');
    const meta = createSpan();
    summary.append(title, meta);
    posterCard.appendChild(summary);

    const sync = (): void => {
        title.textContent = titleInput?.value.trim() || t('templateFieldName');
        meta.textContent = yearInput?.value.trim() || '';
    };
    titleInput?.addEventListener('input', sync);
    yearInput?.addEventListener('input', sync);
    sync();
}
