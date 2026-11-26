// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderAnimeOriginControl, renderWorkTypeControl } from '../src/components/MediaWorkTypeControl';
import { i18n } from '../src/localization';
import { countryOptions, countryFieldLabel, getMediaWorkTypeLabel } from '../src/utils/mediaWorkType';
import { renderAdditionalProviderHelp } from '../src/settings/sections/additionalProviderHelp';
import { Toolbar } from '../src/components/Toolbar';

beforeAll(() => {
    Object.assign(HTMLElement.prototype, {
        empty() { this.replaceChildren(); },
        setText(text: string) { this.textContent = text; },
        addClass(...names: string[]) { this.classList.add(...names); },
        removeClass(...names: string[]) { this.classList.remove(...names); },
        hasClass(name: string) { return this.classList.contains(name); },
        toggleClass(name: string, active: boolean) { this.classList.toggle(name, active); },
        setAttr(name: string, value: string) { this.setAttribute(name, value); },
        setCssStyles(styles: object) { Object.assign(this.style, styles); },
        createEl(tag: string, options: { cls?: string; text?: string; attr?: Record<string, string> } = {}) {
            const node = this.ownerDocument.createElement(tag);
            node.className = options.cls ?? ''; node.textContent = options.text ?? '';
            for (const [key, value] of Object.entries(options.attr ?? {})) node.setAttribute(key, value);
            this.appendChild(node); return node;
        },
        createDiv(options: object) { return this.createEl('div', options); },
        createSpan(options: object) { return this.createEl('span', options); },
    });
    i18n.setLanguage('ru');
});
afterEach(() => document.body.replaceChildren());
function root(): HTMLElement {
    const element = document.createElement('div');
    element.innerHTML = '<aside class="lorebase-editmode-column-left"><section class="poster"></section><section class="quick-settings"></section></aside><main><section class="lorebase-editmode-title-meta"><div class="lorebase-editmode-meta-row"><label class="lorebase-editmode-field"><span>Год</span><input data-field="year"></label><label class="lorebase-editmode-field"><span>Серия</span><input data-field="series"></label></div></section></main><aside class="lorebase-editmode-quick-settings"><div class="lorebase-editmode-toggle-list"></div></aside>';
    document.body.appendChild(element); return element;
}
function option(label: string): HTMLElement {
    return [...document.querySelectorAll<HTMLElement>('.lorebase-settings-dropdown-option')].find(element => element.textContent === label)!;
}
describe('media classification controls', () => {
    it('places localized types below the poster without changing the title row', () => {
        const element = root(), change = vi.fn();
        renderWorkTypeControl(element, 'game', 'Game', change);
        expect(element.querySelector('.poster')?.children).toHaveLength(0);
        const column = element.querySelector('.lorebase-editmode-column-left')!;
        expect(column.children[1].classList.contains('lorebase-classification-panel')).toBe(true);
        expect(column.children[1].querySelector('[data-field="work-type"]')).not.toBeNull();
        expect(element.querySelector('.lorebase-editmode-meta-row')!.children).toHaveLength(2);
        expect(column.textContent).toContain('Визуальная новелла');
        option('Визуальная новелла').click();
        expect(change).toHaveBeenLastCalledWith('Visual novel');
    });
    it('selects anime countries by translated name and places 18+ with quick switches', () => {
        const element = root(), change = vi.fn(), adult = vi.fn();
        renderAnimeOriginControl(element, 'JP', change, false, adult);
        expect(element.querySelector('.lorebase-classification-panel')?.textContent).toContain('Страна');
        expect(countryOptions('ru').map(option => option.value)).toEqual(['JP', 'CN', 'KR', 'US', 'TW', 'FR', 'GB', 'CA']);
        expect(countryOptions('ru', ['DE']).some(option => option.value === 'DE')).toBe(true);
        option('Китай').click(); expect(change).toHaveBeenLastCalledWith('CN');
        const button = element.querySelector<HTMLButtonElement>('.lorebase-editmode-quick-settings button')!;
        button.click(); expect(adult).toHaveBeenLastCalledWith(true);
        expect(button.getAttribute('aria-pressed')).toBe('true');
        button.click(); expect(adult).toHaveBeenLastCalledWith(false);
    });
    it('reuses the same classification panel for manga and keeps standard movie labels neutral', () => {
        const element = root();
        renderWorkTypeControl(element, 'manga', 'Manga', vi.fn());
        renderWorkTypeControl(element, 'manga', 'Manga', vi.fn());
        expect(element.querySelectorAll('[data-field="work-type"]')).toHaveLength(1);
        expect(getMediaWorkTypeLabel('movie', 'Movie', 'ru')).toBe('Фильм');
        expect(getMediaWorkTypeLabel('series', 'Series', 'ru')).toBe('Сериал');
    });
    it('labels the country dropdown All countries instead of All types', () => {
        const toolbar = Object.assign(Object.create(Toolbar.prototype), {
            fieldDefinitions: [{ id: 'workType', label: countryFieldLabel('ru'), options: countryOptions('ru') }],
            currentViewState: { workTypes: [] },
            callbacks: {},
        });
        toolbar.renderWorkTypeRow(document.body, document.createElement('button'));
        expect(document.querySelector('.lorebase-view-control-label')?.textContent).toBe('Страна');
        expect(document.querySelector('.lorebase-settings-dropdown-label')?.textContent).toBe('Все страны');
    });
    it('renders VNDB instructions inside the shared help layout', () => {
        const row = document.body.createDiv({ cls: 'lorebase-provider-key-row' });
        renderAdditionalProviderHelp(row, 'vndb');
        expect(row.querySelector('a')?.getAttribute('href')).toBe('https://vndb.org/');
        expect(row.querySelector('a')?.parentElement?.className).toBe('lorebase-provider-help-links');
        expect(row.querySelector('summary')?.textContent).toContain('API-ключ не нужен');
        expect(row.querySelector('details')?.open).toBe(false);
    });
});
