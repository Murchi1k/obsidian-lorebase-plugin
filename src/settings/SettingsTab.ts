/**
 * LOREBASE - Settings Tab
 * Plugin settings interface integrated with Obsidian Settings
 */

import { App, PluginSettingTab, Setting } from 'obsidian';
import { t } from '../localization';
import type LorebasePlugin from '../main';
import { ICON_ANIME, ICON_GAMES } from './sections/constants';
import { renderComingSoonSection } from './sections/comingSoon';
import { renderExperimentSettings } from './sections/experiment';
import { renderGeneralSettings } from './sections/general';
import { renderIntegrationsSection } from './sections/integrations';
import { renderLibrarySettings } from './sections/library';
import { renderResetSection } from './sections/reset';
import { renderSteamSyncSettings } from './SteamSyncSettings';
import type { CollapsibleGroupElements, SettingsSectionContext } from './sections/types';

export class LorebaseSettingTab extends PluginSettingTab {
    plugin: LorebasePlugin;
    private detachSectionNav: (() => void) | null = null;
    private syncSectionNavActive: (() => void) | null = null;

    constructor(app: App, plugin: LorebasePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        this.detachSectionNav?.();
        this.detachSectionNav = null;
        this.syncSectionNavActive = null;

        const scrollState = this.captureScrollState();
        const { containerEl } = this;
        containerEl.empty();
        containerEl.addClass('lorebase-settings');

        new Setting(containerEl)
            .setName(t('settingsTitle'))
            .setHeading()
            .settingEl.addClass('lorebase-settings-main-heading');
        this.renderSupportBlock(containerEl);

        const layoutEl = containerEl.createDiv({ cls: 'lorebase-settings-layout' });
        const contentEl = layoutEl.createDiv({ cls: 'lorebase-settings-content' });
        const navEl = layoutEl.createDiv({
            cls: 'lorebase-settings-nav',
            attr: { 'aria-label': 'Settings section navigation' },
        });

        const context = this.getSectionContext();
        renderGeneralSettings(context, contentEl);
        renderLibrarySettings(context, contentEl, t('settingsGames'), 'games', ICON_GAMES);
        renderLibrarySettings(context, contentEl, t('settingsAnime'), 'anime', ICON_ANIME);
        renderIntegrationsSection(context, contentEl);
        renderSteamSyncSettings(context, contentEl);
        renderComingSoonSection(contentEl);
        renderExperimentSettings(context, contentEl);
        renderResetSection(context, contentEl);

        const scrollHost = this.findScrollHost();
        this.renderSectionNavigation(navEl, contentEl, scrollHost);
        this.restoreScrollState(scrollState);
        window.requestAnimationFrame(() => this.syncSectionNavActive?.());
    }

    private getSectionContext(): SettingsSectionContext {
        return {
            app: this.app,
            plugin: this.plugin,
            display: () => this.display(),
            createSectionHeader: (container, icon, text) => this.createSectionHeader(container, icon, text),
            createCollapsibleGroup: (container, title, description, open) => this.createCollapsibleGroup(container, title, description, open),
            applyAccentColor: (color) => this.applyAccentColor(color),
        };
    }

    private applyAccentColor(color: string): void {
        activeDocument.documentElement.style.setProperty('--lorebase-accent', color);
    }

    private renderSupportBlock(container: HTMLElement): void {
        const block = container.createDiv({ cls: 'lorebase-settings-support' });
        const actions = block.createDiv({ cls: 'lorebase-settings-support-actions' });
        const links = [
            {
                label: 'Ko-fi',
                brand: 'kofi',
                url: 'https://ko-fi.com/murch1k',
            },
            {
                label: 'Discord',
                brand: 'discord',
                url: 'https://discord.gg/eTcw8v8c4',
            },
            {
                label: 'Patreon',
                brand: 'patreon',
                url: 'https://www.patreon.com/c/Murch1k',
            },
        ];

        for (const link of links) {
            const button = actions.createEl('button', {
                cls: `lorebase-settings-support-button is-${link.brand}`,
                attr: {
                    type: 'button',
                    title: link.url,
                    'aria-label': link.label,
                },
            });
            const icon = button.createSpan({ cls: 'lorebase-settings-support-icon' });
            icon.appendChild(this.createSupportIcon(link.brand));
            button.createSpan({ text: link.label });
            button.addEventListener('click', (event) => {
                event.preventDefault();
                window.open(link.url, '_blank', 'noopener');
            });
        }

        const text = block.createDiv({ cls: 'lorebase-settings-support-text' });
        text.createDiv({ cls: 'lorebase-settings-support-title', text: t('settingsSupportTitle') });
        text.createDiv({ cls: 'lorebase-settings-support-desc', text: t('settingsSupportDesc') });
    }

    private createSectionHeader(container: HTMLElement, icon: string, text: string): void {
        const heading = new Setting(container)
            .setHeading();
        heading.settingEl.addClass('lorebase-settings-section-title');
        heading.nameEl.empty();
        heading.nameEl.createSpan({ cls: 'lorebase-settings-section-icon', text: icon });
        heading.nameEl.createSpan({ text });
    }

    private createSupportIcon(brand: string): SVGElement {
        const svg = this.containerEl.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');

        const addPath = (d: string, className?: string): void => {
            const path = this.containerEl.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', d);
            if (className) path.setAttribute('class', className);
            svg.appendChild(path);
        };
        const addCircle = (cx: string, cy: string, r: string): void => {
            const circle = this.containerEl.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', cx);
            circle.setAttribute('cy', cy);
            circle.setAttribute('r', r);
            svg.appendChild(circle);
        };

        if (brand === 'kofi') {
            addPath('M4.5 7.5h11.8v6.1a4.9 4.9 0 0 1-4.9 4.9H9.4a4.9 4.9 0 0 1-4.9-4.9V7.5Z', 'cup');
            addPath('M16.3 10h1.5a2.55 2.55 0 0 1 0 5.1h-1.5', 'handle');
            addPath('M10.4 14.9 7.9 12.5a1.55 1.55 0 0 1 2.19-2.19l.31.31.31-.31a1.55 1.55 0 0 1 2.19 2.19l-2.5 2.4Z', 'heart');
            return svg;
        }

        if (brand === 'discord') {
            addPath('M7.25 7.75A12.2 12.2 0 0 1 10 6.9l.35.7a10.7 10.7 0 0 1 3.3 0l.35-.7a12.2 12.2 0 0 1 2.75.85c1.7 2.5 2.2 4.9 2 7.35a10.5 10.5 0 0 1-3.42 1.76l-.82-1.08c.45-.16.88-.36 1.3-.6a7.9 7.9 0 0 1-7.62 0c.42.24.85.44 1.3.6l-.82 1.08a10.5 10.5 0 0 1-3.42-1.76c-.3-2.74.47-5.16 2-7.35Z');
            addCircle('10', '12.55', '1');
            addCircle('14', '12.55', '1');
            return svg;
        }

        addCircle('14.7', '8.9', '5.1');
        addPath('M5.4 4.2h3.4v15.6H5.4z');
        return svg;
    }

    private createCollapsibleGroup(
        container: HTMLElement,
        title: string,
        description?: string,
        open: boolean = true
    ): CollapsibleGroupElements {
        const details = container.createEl('details', { cls: 'lorebase-settings-group' });
        if (open) {
            details.setAttr('open', '');
        }
        const summary = details.createEl('summary', { cls: 'lorebase-settings-group-summary' });
        const textBlock = summary.createDiv({ cls: 'lorebase-settings-group-text' });
        textBlock.createDiv({ cls: 'lorebase-settings-group-title', text: title });
        if (description) {
            textBlock.createDiv({ cls: 'lorebase-settings-group-desc', text: description });
        }
        const body = details.createDiv({ cls: 'lorebase-settings-group-body' });
        return { root: details, body };
    }

    private captureScrollState(): { host: HTMLElement; top: number } {
        const host = this.findScrollHost();
        return { host, top: host.scrollTop };
    }

    private restoreScrollState(state: { host: HTMLElement; top: number }): void {
        // Wait a frame so the new settings DOM is fully measured before restoring.
        window.requestAnimationFrame(() => {
            state.host.scrollTop = state.top;
        });
    }

    private findScrollHost(): HTMLElement {
        let current: HTMLElement | null = this.containerEl;
        while (current) {
            const style = window.getComputedStyle(current);
            const canScroll = (style.overflowY === 'auto' || style.overflowY === 'scroll')
                && current.scrollHeight > current.clientHeight;
            if (canScroll) return current;
            current = current.parentElement;
        }
        return this.containerEl;
    }

    private renderSectionNavigation(
        navContainer: HTMLElement,
        contentContainer: HTMLElement,
        scrollHost: HTMLElement
    ): void {
        const mainNav = navContainer.createDiv({ cls: 'lorebase-settings-nav-main' });

        const sectionHeaders = Array.from(
            contentContainer.querySelectorAll<HTMLElement>('.lorebase-settings-section-title')
        );

        if (sectionHeaders.length === 0) {
            navContainer.addClass('is-empty');
            return;
        }

        const matchesLabel = (element: HTMLElement, label: string): boolean => {
            return (element.textContent ?? '').trim().includes(label);
        };

        const integrationLabel = t('settingsIntegrations');
        const integrationIndex = sectionHeaders.findIndex((header) => matchesLabel(header, integrationLabel));
        const groupTitles = Array.from(
            contentContainer.querySelectorAll<HTMLElement>('.lorebase-settings-group-title')
        );
        const providersGroup = groupTitles.find((title) => matchesLabel(title, t('settingsIntegrationsProviders')));
        const templatesGroup = groupTitles.find((title) => matchesLabel(title, t('settingsIntegrationsTemplates')));

        const integrationSubTargets: Array<{ label: string; element: HTMLElement }> = [];
        if (integrationIndex !== -1) {
            integrationSubTargets.push({ label: integrationLabel, element: sectionHeaders[integrationIndex] });
            if (providersGroup) integrationSubTargets.push({ label: t('settingsIntegrationsProviders'), element: providersGroup });
            if (templatesGroup) integrationSubTargets.push({ label: t('settingsIntegrationsTemplates'), element: templatesGroup });
        }

        const navButtons: HTMLButtonElement[] = [];
        let integrationSubNav: HTMLElement | null = null;

        sectionHeaders.forEach((header, index) => {
            const label = header.textContent?.trim() || `Section ${index + 1}`;
            const button = mainNav.createEl('button', {
                cls: 'lorebase-settings-nav-item',
                attr: {
                    type: 'button',
                    'aria-label': label,
                },
            });

            button.addEventListener('click', () => {
                const hostRect = scrollHost.getBoundingClientRect();
                const headerRect = header.getBoundingClientRect();
                const top = scrollHost.scrollTop + (headerRect.top - hostRect.top) - 12;
                scrollHost.scrollTo({
                    top: Math.max(0, top),
                    behavior: 'smooth',
                });
            });

            navButtons.push(button);

            // Insert integration sub-navigation directly after Integrations
            if (index === integrationIndex) {
                integrationSubNav = mainNav.createDiv({ cls: 'lorebase-settings-nav-sub' });
            }
        });

        const integrationSubButtons = integrationSubNav
            ? integrationSubTargets.map((target, index) => {
                const label = target.label || `Integration section ${index + 1}`;
                const button = integrationSubNav!.createEl('button', {
                    cls: 'lorebase-settings-subnav-item',
                    attr: {
                        type: 'button',
                        'aria-label': label,
                    },
                });

                button.addEventListener('click', () => {
                    const hostRect = scrollHost.getBoundingClientRect();
                    const targetRect = target.element.getBoundingClientRect();
                    const top = scrollHost.scrollTop + (targetRect.top - hostRect.top) - 14;
                    scrollHost.scrollTo({
                        top: Math.max(0, top),
                        behavior: 'smooth',
                    });
                });

                return button;
            })
            : [];

        const updateActive = (): void => {
            const hostRect = scrollHost.getBoundingClientRect();
            const activeLine = hostRect.top + 110;
            let activeIndex = 0;

            sectionHeaders.forEach((header, index) => {
                if (header.getBoundingClientRect().top <= activeLine) {
                    activeIndex = index;
                }
            });

            // At the very bottom of the scroll area force-highlight last section
            // so Danger Zone is correctly marked as active.
            const bottomReached = (scrollHost.scrollTop + scrollHost.clientHeight) >= (scrollHost.scrollHeight - 4);
            if (bottomReached) {
                activeIndex = sectionHeaders.length - 1;
            }

            navButtons.forEach((button, index) => {
                button.toggleClass('is-active', index === activeIndex);
            });

            const showIntegrationSubNav = integrationSubButtons.length > 0
                && integrationIndex !== -1
                && activeIndex === integrationIndex;
            integrationSubNav?.toggleClass('is-visible', showIntegrationSubNav);

            if (!showIntegrationSubNav) {
                integrationSubButtons.forEach((button) => button.removeClass('is-active'));
                return;
            }

            let activeSubIndex = 0;
            integrationSubTargets.forEach((target, index) => {
                if (target.element.getBoundingClientRect().top <= activeLine) {
                    activeSubIndex = index;
                }
            });

            integrationSubButtons.forEach((button, index) => {
                button.toggleClass('is-active', index === activeSubIndex);
            });
        };

        const onScroll = (): void => updateActive();
        scrollHost.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll);
        updateActive();

        this.syncSectionNavActive = updateActive;
        this.detachSectionNav = () => {
            scrollHost.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', onScroll);
        };
    }
}
