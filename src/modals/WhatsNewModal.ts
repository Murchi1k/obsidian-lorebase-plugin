import { Modal } from 'obsidian';
import type LorebasePlugin from '../main';
import { EXPLORER_COPY, getReleaseCopy } from '../releases/copy';
import { renderReleaseHistory } from '../releases/render';
import { renderReleaseExplorer } from '../releases/explorer';
import { COMMUNITY_COPY, renderReleaseCommunity } from '../releases/community';
import { getReleaseHighlights } from '../releases/features';
import { createReleaseWindowState } from '../releases/navigation';

export class WhatsNewModal extends Modal {
    private footerEl?: HTMLElement;
    private readonly viewState = createReleaseWindowState();
    constructor(private readonly plugin: LorebasePlugin) { super(plugin.app); }

    onOpen(): void {
        const language = this.plugin.settings.language;
        const copy = getReleaseCopy(language);
        const labels = EXPLORER_COPY[language];
        this.modalEl.addClass('lorebase-release-modal');
        this.setTitle('LOREBASE');
        this.contentEl.empty();
        this.footerEl?.remove();
        const header = this.contentEl.createDiv({ cls: 'lorebase-release-header' });
        header.createEl('h2', { text: copy.title });
        header.createSpan({ cls: 'lorebase-release-header-version', text: `v${this.plugin.manifest.version}`, attr: { title: copy.installed, 'aria-label': `${this.plugin.manifest.version} · ${copy.installed}` } });
        const navigation = this.contentEl.createDiv({ cls: 'lorebase-release-tabs', attr: { role: 'tablist', 'aria-label': copy.title } });
        const panels = this.contentEl.createDiv({ cls: 'lorebase-release-panels' });
        const definitions = [
            { id: 'features', label: labels.features,
                render: (panel: HTMLElement) => renderReleaseExplorer(panel, language, this.plugin.manifest.version, target => this.plugin.openReleaseTarget(target), () => {
                    this.close();
                    this.plugin.offerReleaseReturn();
                }, this.viewState) },
            { id: 'history', label: copy.history, render: (panel: HTMLElement) => renderReleaseHistory(panel, language, this.plugin.manifest.version, this.viewState) },
            { id: 'community', label: COMMUNITY_COPY[language].tab, render: (panel: HTMLElement) => renderReleaseCommunity(panel, language) },
        ];
        const panelElements = definitions.map(definition => panels.createDiv({ cls: `lorebase-release-panel is-${definition.id}`, attr: {
            role: 'tabpanel', id: `lorebase-release-${definition.id}`, 'aria-labelledby': `lorebase-release-tab-${definition.id}`,
        } }));
        const rendered = new Set<number>();
        const buttons = definitions.map((definition, index) => {
            const button = navigation.createEl('button', { text: definition.label, attr: {
                type: 'button', role: 'tab', id: `lorebase-release-tab-${definition.id}`, 'aria-controls': panelElements[index].id,
            } });
            button.addEventListener('click', () => select(index));
            button.addEventListener('keydown', event => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? definitions.length - 1
                    : (index + (event.key === 'ArrowRight' ? 1 : -1) + definitions.length) % definitions.length;
                select(next); buttons[next].focus();
            });
            return button;
        });
        const select = (index: number): void => {
            this.viewState.tab = definitions[index].id as typeof this.viewState.tab;
            if (!rendered.has(index)) { definitions[index].render(panelElements[index]); rendered.add(index); }
            panelElements.forEach((panel, i) => { panel.hidden = i !== index; });
            buttons.forEach((button, i) => { button.setAttribute('aria-selected', String(i === index)); button.tabIndex = i === index ? 0 : -1; });
        };
        const remembered = definitions.findIndex(definition => definition.id === this.viewState.tab);
        select(!getReleaseHighlights(language, this.plugin.manifest.version).length && remembered === 0 ? 1 : Math.max(0, remembered));
        const footer = this.modalEl.createDiv({ cls: 'lorebase-release-footer' });
        this.footerEl = footer;
        footer.createEl('button', { cls: 'mod-cta', text: copy.done, attr: { type: 'button' } }).addEventListener('click', () => this.close());
    }

    onClose(): void {
        this.contentEl.empty();
        this.footerEl?.remove();
        this.footerEl = undefined;
    }
}
