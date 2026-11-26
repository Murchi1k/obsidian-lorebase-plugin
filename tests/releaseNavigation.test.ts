// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', async importOriginal => ({
    ...await importOriginal<object>(),
    Plugin: class {}, ItemView: class {}, PluginSettingTab: class {}, AbstractInputSuggest: class {},
}));
import LorebasePlugin from '../src/main';
import { LorebaseSettingTab } from '../src/settings/SettingsTab';
import { LibraryView } from '../src/views/LibraryView';

function pluginHarness() {
    const plugin = Object.create(LorebasePlugin.prototype) as any;
    const settingsApi = { open: vi.fn(), close: vi.fn(), openTabById: vi.fn() };
    Object.assign(plugin, {
        app: { setting: settingsApi, workspace: { getLeavesOfType: vi.fn().mockReturnValue([]) } }, manifest: { id: 'lorebase', version: '4.0.0' },
        settings: { language: 'ru', enabledMedia: { music: true } },
        lorebaseSettingTab: { openSection: vi.fn(), openFeatureSettings: vi.fn(), openMangaWorkTypes: vi.fn() },
        switchMediaType: vi.fn().mockResolvedValue(undefined),
        showWhatsNew: vi.fn(), saveData: vi.fn().mockResolvedValue(undefined),
        existingInstall: true,
    });
    return { plugin, settingsApi };
}

describe('release startup persistence', () => {
    it('persists the shown version so restarting does not show it again', async () => {
        const { plugin } = pluginHarness();
        await plugin.checkReleaseUpdate();
        expect(plugin.showWhatsNew).toHaveBeenCalledTimes(1);
        expect(plugin.saveData).toHaveBeenCalledWith(expect.objectContaining({ lastSeenReleaseVersion: '4.0.0' }));
        await plugin.checkReleaseUpdate();
        expect(plugin.showWhatsNew).toHaveBeenCalledTimes(1);
        expect(plugin.saveData).toHaveBeenCalledTimes(1);
    });
    it('records fresh installs silently and preserves a newer version on downgrade', async () => {
        const { plugin } = pluginHarness();
        plugin.existingInstall = false;
        await plugin.checkReleaseUpdate();
        expect(plugin.showWhatsNew).not.toHaveBeenCalled();
        plugin.manifest.version = '3.0.1';
        await plugin.checkReleaseUpdate();
        expect(plugin.settings.lastSeenReleaseVersion).toBe('4.0.0');
        expect(plugin.saveData).toHaveBeenCalledTimes(1);
    });
    it('restores the previous marker if saving fails', async () => {
        const { plugin } = pluginHarness();
        plugin.settings.lastSeenReleaseVersion = '3.0.1';
        plugin.saveData.mockRejectedValueOnce(new Error('disk unavailable'));
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            await plugin.checkReleaseUpdate();
            expect(plugin.settings.lastSeenReleaseVersion).toBe('3.0.1');
        } finally { log.mockRestore(); }
    });
});

describe('release shortcuts', () => {
    it('opens the shared statistics dashboard from its feature shortcut', async () => {
        const { plugin, settingsApi } = pluginHarness();
        const destination = { close: vi.fn() };
        plugin.showStatsModal = vi.fn().mockReturnValue(destination);
        expect(await plugin.openReleaseTarget('statistics')).toBe(true);
        expect(plugin.showStatsModal).toHaveBeenCalledOnce();
        expect(plugin.releaseDestination).toBe(destination);
        expect(settingsApi.close).toHaveBeenCalledOnce();
    });
    it('switches the active library to music and closes settings', async () => {
        const { plugin, settingsApi } = pluginHarness();
        expect(await plugin.openReleaseTarget('music')).toBe(true);
        expect(plugin.switchMediaType).toHaveBeenCalledWith('music');
        expect(settingsApi.close).toHaveBeenCalledOnce();
    });
    it('takes disabled music to settings without enabling it silently', async () => {
        const { plugin } = pluginHarness();
        plugin.settings.enabledMedia.music = false;
        expect(await plugin.openReleaseTarget('music')).toBe(true);
        expect(plugin.switchMediaType).not.toHaveBeenCalled();
        expect(plugin.lorebaseSettingTab.openFeatureSettings).toHaveBeenCalledWith('music');
        expect(plugin.settings.enabledMedia.music).toBe(false);
    });
    it('opens the correct settings section for statuses and providers', async () => {
        const { plugin, settingsApi } = pluginHarness();
        await plugin.openReleaseTarget('statuses');
        expect(settingsApi.openTabById).toHaveBeenCalledWith('lorebase');
        expect(plugin.lorebaseSettingTab.openSection).toHaveBeenCalledWith('customization', '.lorebase-status-plans-group');
        await plugin.openReleaseTarget('integrations');
        expect(plugin.lorebaseSettingTab.openSection).toHaveBeenLastCalledWith('integrations', '.lorebase-provider-picker');
    });
    it('keeps the update window available when the destination cannot open', async () => {
        const { plugin } = pluginHarness();
        plugin.app.setting = undefined;
        expect(await plugin.openReleaseTarget('statuses')).toBe(false);
    });
    it.each(['ratings', 'anilist', 'bookshelf', 'alternativeTitles', 'tmdb', 'parts'])('opens targeted settings for %s without changing the feature configuration', async target => {
        const { plugin } = pluginHarness();
        const before = JSON.stringify(plugin.settings);
        expect(await plugin.openReleaseTarget(target)).toBe(true);
        expect(plugin.lorebaseSettingTab.openFeatureSettings).toHaveBeenCalledWith(target);
        expect(JSON.stringify(plugin.settings)).toBe(before);
    });
    it('takes templates to the template settings group', async () => {
        const { plugin } = pluginHarness();
        expect(await plugin.openReleaseTarget('templates')).toBe(true);
        expect(plugin.lorebaseSettingTab.openSection).toHaveBeenCalledWith('templates', '.lorebase-integration-templates-group');
    });
    it('takes adding to the library add control without creating a draft', async () => {
        const { plugin, settingsApi } = pluginHarness();
        const view = Object.create(LibraryView.prototype);
        view.contentEl = document.createElement('div');
        const button = document.createElement('button'); button.className = 'lorebase-add-btn';
        view.contentEl.append(button); document.body.append(view.contentEl);
        plugin.app.workspace.getLeavesOfType.mockReturnValue([{ view }]);
        plugin.activateView = vi.fn().mockResolvedValue(undefined);
        expect(await plugin.openReleaseTarget('adding')).toBe(true);
        await new Promise(resolve => requestAnimationFrame(resolve));
        expect(document.activeElement).toBe(button);
        expect(settingsApi.close).toHaveBeenCalledOnce();
    });
    it('opens the manga type editor', async () => {
        const { plugin } = pluginHarness();
        await plugin.openReleaseTarget('mangaTypes');
        expect(plugin.lorebaseSettingTab.openMangaWorkTypes).toHaveBeenCalledOnce();
    });
    it.each(['calendar', 'groups'])('opens %s from an existing or newly activated library', async target => {
        const { plugin, settingsApi } = pluginHarness();
        const view = Object.create(LibraryView.prototype);
        view.showReleaseCalendar = vi.fn();
        view.showCustomGroups = vi.fn();
        plugin.app.workspace = { getLeavesOfType: vi.fn().mockReturnValue([{ view }]) };
        plugin.activateView = vi.fn().mockResolvedValue(undefined);
        expect(await plugin.openReleaseTarget(target)).toBe(true);
        expect(plugin.activateView).toHaveBeenCalledOnce();
        expect(target === 'calendar' ? view.showReleaseCalendar : view.showCustomGroups).toHaveBeenCalledOnce();
        expect(settingsApi.close).toHaveBeenCalledOnce();
    });
    it('takes search to the library input without changing the current query or settings', async () => {
        const { plugin, settingsApi } = pluginHarness();
        const view = Object.create(LibraryView.prototype);
        view.contentEl = document.createElement('div');
        const input = document.createElement('input');
        input.className = 'lorebase-search-input';
        input.value = 'Cyberpunk';
        view.contentEl.append(input);
        document.body.append(view.contentEl);
        plugin.app.workspace.getLeavesOfType.mockReturnValue([{ view }]);
        plugin.activateView = vi.fn().mockResolvedValue(undefined);
        const before = JSON.stringify(plugin.settings);
        try {
            expect(await plugin.openReleaseTarget('librarySearch')).toBe(true);
            await new Promise(resolve => requestAnimationFrame(resolve));
            expect(plugin.activateView).toHaveBeenCalledOnce();
            expect(settingsApi.close).toHaveBeenCalledOnce();
            expect(document.activeElement).toBe(input);
            expect(input.value).toBe('Cyberpunk');
            expect(JSON.stringify(plugin.settings)).toBe(before);
            expect(plugin.lorebaseSettingTab.openFeatureSettings).not.toHaveBeenCalled();
        } finally { view.contentEl.remove(); }
    });
});

describe('settings deep links', () => {
    beforeEach(() => { document.body.replaceChildren(); });
    it('expands both the accordion section and nested status group before scrolling', async () => {
        const container = document.createElement('div');
        document.body.append(container);
        const tab = {
            containerEl: container, openAccordionSections: new Set(), activeSettingsSection: 'general',
            display() { container.innerHTML = '<details class="lorebase-settings-accordion-section is-customization"><summary>Cards</summary><details class="lorebase-status-plans-group"><summary>Statuses</summary></details></details>'; },
        };
        LorebaseSettingTab.prototype.openSection.call(tab as any, 'customization', '.lorebase-status-plans-group');
        await new Promise(resolve => requestAnimationFrame(resolve));
        expect(tab.activeSettingsSection).toBe('customization');
        expect(tab.openAccordionSections.has('customization')).toBe(true);
        expect([...container.querySelectorAll('details')].every(details => details.open)).toBe(true);
        expect(container.querySelector('.lorebase-status-plans-group')?.classList.contains('lorebase-release-target-highlight')).toBe(true);
    });
});


it('returns to the same update window and closes only the destination modal', () => {
    const { plugin } = pluginHarness();
    const modal = { modalEl: document.createElement('div'), close: vi.fn(), open: vi.fn() };
    const destination = { close: vi.fn() };
    plugin.releaseModal = modal;
    plugin.releaseDestination = destination;
    plugin.showWhatsNew = LorebasePlugin.prototype.showWhatsNew;
    plugin.offerReleaseReturn();
    document.querySelector<HTMLButtonElement>('.lorebase-release-return-main')!.click();
    expect(destination.close).toHaveBeenCalledOnce();
    expect(plugin.releaseModal).toBe(modal);
    expect(modal.open).toHaveBeenCalledOnce();
    expect(document.querySelector('.lorebase-release-return')).toBeNull();
    expect(plugin.saveData).not.toHaveBeenCalled();
});

it('replaces the return control instead of stacking duplicates', () => {
    const { plugin } = pluginHarness();
    plugin.offerReleaseReturn();
    plugin.offerReleaseReturn();
    expect(document.querySelectorAll('.lorebase-release-return')).toHaveLength(1);
    document.querySelector<HTMLButtonElement>('.lorebase-release-return-dismiss')!.click();
    expect(document.querySelector('.lorebase-release-return')).toBeNull();
    expect(plugin.showWhatsNew).not.toHaveBeenCalled();
});
