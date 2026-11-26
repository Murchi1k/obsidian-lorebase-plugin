// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderCardWorkspace } from '../src/settings/sections/cardCustomization';
import { DEFAULT_SETTINGS } from '../src/constants';
import { installStatisticsDom } from './helpers/statisticsDom';
import type { SettingsSectionContext } from '../src/settings/sections/types';
const preview = vi.hoisted(() => ({ draw: vi.fn() }));
vi.mock('../src/settings/sections/cardPreview', () => ({ createCardPreview: () => preview.draw }));
vi.mock('../src/settings/sections/cardSizing', () => ({ renderCardSizeSettings: vi.fn() }));
vi.mock('../src/settings/sections/cardBadges', () => ({ renderCardBadgeSettings: vi.fn() }));
vi.mock('../src/settings/sections/music', () => ({ renderMusicCardSettings: vi.fn() }));
vi.mock('../src/settings/sections/partPosters', () => ({ renderPartPosterSetting: vi.fn() }));
vi.mock('../src/settings/sections/library', () => ({
    MEDIA_SETTINGS_OPTIONS: [{ key: 'games', label: () => 'Games', icon: 'gamepad' }],
    getCardTypeSettingsTitle: () => 'Types', renderCardTypeSettings: vi.fn(),
}));
beforeEach(() => { installStatisticsDom(); preview.draw.mockClear(); });
afterEach(() => document.body.replaceChildren());
it('hides and expands the preview without changing card settings, and restores the last mode', () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    const plugin = { settings, saveSettings: vi.fn(), refreshViewsVisuals: vi.fn() };
    const context = {
        plugin, signal: new AbortController().signal,
        createCollapsibleGroup(host: HTMLElement, label: string, _hint: unknown, open: boolean) {
            const root = host.createEl('details'); root.open = open; root.createEl('summary', { text: label });
            return { root, body: root.createDiv() };
        },
    } as unknown as SettingsSectionContext;
    const root = document.body.createDiv();
    renderCardWorkspace(context, root, vi.fn());
    const [hide, expand] = root.querySelectorAll<HTMLButtonElement>('.lorebase-card-preview-layout button');
    expect(hide.closest('.lorebase-card-mini-heading')).not.toBeNull();
    hide.click();
    expect(root.querySelector<HTMLElement>('.lorebase-card-preview-stage')!.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>('.lorebase-card-workspace')!.dataset.previewMode).toBe('hidden');
    expand.click();
    expect(root.querySelector<HTMLElement>('.lorebase-card-preview-stage')!.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>('.lorebase-card-workspace')!.dataset.previewMode).toBe('expanded');
    expand.click();
    expect(root.querySelector<HTMLElement>('.lorebase-card-workspace')!.dataset.previewMode).toBe('normal');
    hide.click(); root.replaceChildren(); renderCardWorkspace(context, root, vi.fn());
    expect(root.querySelector<HTMLElement>('.lorebase-card-preview-stage')!.hidden).toBe(true);
    expect(settings).toEqual(DEFAULT_SETTINGS);
    expect(plugin.saveSettings).not.toHaveBeenCalled();
});
