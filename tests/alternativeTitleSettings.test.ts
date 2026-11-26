// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/constants';
import { i18n } from '../src/localization';
import { getAlternativeTitlePreference } from '../src/services/integrations/alternativeTitles';
import { renderAlternativeTitleSettings } from '../src/settings/sections/alternativeTitleSettings';
import type { SettingsSectionContext } from '../src/settings/sections/types';
import { installStatisticsDom } from './helpers/statisticsDom';

beforeAll(() => {
    installStatisticsDom();
    i18n.setLanguage('en');
});
afterEach(() => document.body.replaceChildren());

describe('provider alternative title settings', () => {
    it.each([
        ['kitsu', 'anime', 'Romaji', 'romaji'],
        ['shikimori', 'anime', 'Russian', 'ru'],
        ['shikimori', 'manga', 'Russian', 'ru'],
        ['anilist', 'manga', 'English', 'en'],
        ['mangaupdates', 'manga', 'Cyrillic', 'Cyrl'],
    ] as const)('selects %s %s titles while saving is off', (provider, kind, option, value) => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        const media = settings.integrations!.media[kind];
        const otherMedia = settings.integrations!.media[kind === 'anime' ? 'manga' : 'anime'];
        if (provider === 'anilist') media.alternativeTitleLanguages = { anilist: 'none' };
        else media.alternativeTitlesDisabled = { [provider]: true };
        const saveSettings = vi.fn(async () => {});
        const context = { plugin: { settings, saveSettings } } as unknown as SettingsSectionContext;
        const root = document.body.createDiv();
        renderAlternativeTitleSettings(context, root, provider, kind);
        const dropdown = root.querySelector<HTMLButtonElement>('.lorebase-settings-dropdown-btn')!;
        const toggle = root.querySelector<HTMLButtonElement>('[role="switch"]')!;
        dropdown.getBoundingClientRect = () => new DOMRect(20, 20, 200, 40);

        expect(dropdown.disabled).toBe(false);
        expect(toggle.getAttribute('aria-checked')).toBe('false');
        dropdown.click();
        const optionEl = Array.from(document.querySelectorAll<HTMLElement>('.lorebase-language-panel.is-open [role="option"]'))
            .find(element => element.textContent === option);
        expect(optionEl).toBeDefined();
        optionEl!.click();
        expect(dropdown.textContent).toBe(option);
        expect(getAlternativeTitlePreference(media, provider)).toEqual({ language: value, enabled: false });
        expect(getAlternativeTitlePreference(otherMedia, provider)).toEqual({ language: 'all', enabled: true });
        expect(saveSettings).toHaveBeenCalledTimes(1);

        toggle.click();
        expect(getAlternativeTitlePreference(media, provider)).toEqual({ language: value, enabled: true });
        expect(dropdown.textContent).toBe(option);
    });
});
