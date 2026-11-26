let nextManualTabsId = 0;

export function createManualCreateTabs(nav: HTMLElement, body: HTMLElement, tabs: Array<{ id: string; label: string }>, active: string, onChange: (id: string) => void): Map<string, HTMLElement> {
    const prefix = `lorebase-manual-tabs-${++nextManualTabsId}`;
    nav.addClass('lorebase-manual-tabs');
    nav.setAttribute('role', 'tablist');
    const panels = new Map<string, HTMLElement>();
    const buttons = new Map<string, HTMLButtonElement>();
    const select = (id: string): void => {
        panels.forEach((panel, key) => { panel.hidden = key !== id; });
        buttons.forEach((button, key) => { button.setAttribute('aria-selected', String(key === id)); button.tabIndex = key === id ? 0 : -1; });
        body.scrollTop = 0;
        onChange(id);
    };
    tabs.forEach((tab, index) => {
        const panel = body.createDiv({ cls: 'lorebase-manual-tab-panel', attr: { id: `${prefix}-${tab.id}-panel`, role: 'tabpanel', 'aria-labelledby': `${prefix}-${tab.id}` } });
        const button = nav.createEl('button', { text: tab.label, attr: { id: `${prefix}-${tab.id}`, type: 'button', role: 'tab', 'aria-controls': panel.id } });
        panels.set(tab.id, panel); buttons.set(tab.id, button);
        button.addEventListener('click', () => select(tab.id));
        button.addEventListener('keydown', event => {
            let next = index;
            if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
            else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = tabs.length - 1;
            else return;
            event.preventDefault(); select(tabs[next].id); buttons.get(tabs[next].id)?.focus();
        });
    });
    select(panels.has(active) ? active : tabs[0].id);
    return panels;
}
