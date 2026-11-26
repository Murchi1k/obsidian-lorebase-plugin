// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { getReleaseHistory } from '../src/releases/catalog';
import { renderReleaseExplorer } from '../src/releases/explorer';
import { renderReleaseHistory, renderReleaseText } from '../src/releases/render';
import { renderReleaseLauncher } from '../src/releases/launcher';
import { renderAboutSection } from '../src/settings/sections/about';
import { renderReleaseCommunity } from '../src/releases/community';
import { i18n } from '../src/localization';
import { createReleaseWindowState, highlightReleaseTarget } from '../src/releases/navigation';

beforeAll(() => {
    Object.assign(HTMLElement.prototype, {
        empty() { this.replaceChildren(); },
        addClass(...names: string[]) { this.classList.add(...names); },
        createEl(tag: string, options: any = {}) {
            const node = this.ownerDocument.createElement(tag);
            if (options.cls) node.className = options.cls;
            if (options.text) node.textContent = options.text;
            for (const [key, value] of Object.entries(options.attr ?? {})) node.setAttribute(key, String(value));
            this.append(node); return node;
        },
        createDiv(options: any) { return this.createEl('div', options); },
        createSpan(options: any) { return this.createEl('span', options); },
    });
});
afterEach(() => { document.body.replaceChildren(); i18n.setLanguage('en'); });

describe('release feature explorer', () => {
    it('exposes all eighteen features and routes each CTA to its own destination', async () => {
        const navigate = vi.fn().mockResolvedValue(true);
        const close = vi.fn();
        renderReleaseExplorer(document.body, 'ru', '4.0.0', navigate, close);
        const tabs = [...document.querySelectorAll<HTMLButtonElement>('.lorebase-release-dot')];
        expect(tabs).toHaveLength(18);
        for (const tab of tabs) {
            tab.click();
            expect(tab.getAttribute('aria-pressed')).toBe('true');
            const action = document.querySelector<HTMLButtonElement>('.lorebase-release-explore')!;
            action.click();
            await Promise.resolve(); await Promise.resolve();
            expect(navigate).toHaveBeenLastCalledWith(['music', 'ratings', 'calendar', 'groups', 'anilist', 'bookshelf', 'alternativeTitles', 'mangaTypes', 'statuses', 'tmdb', 'integrations', 'vndb', 'animeOrigin', 'librarySearch', 'templates', 'adding', 'parts', 'statistics'][tabs.indexOf(tab)]);
        }
        expect(close).toHaveBeenCalledTimes(18);
    });
    it('supports arrow keys, Home/End and next/previous navigation', () => {
        renderReleaseExplorer(document.body, 'en', '4.0.0', vi.fn(), vi.fn());
        const tabs = [...document.querySelectorAll<HTMLButtonElement>('.lorebase-release-dot')];
        tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        expect(tabs[1].getAttribute('aria-pressed')).toBe('true');
        tabs[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
        expect(tabs[tabs.length - 1].getAttribute('aria-pressed')).toBe('true');
        expect(document.querySelector<HTMLButtonElement>('.lorebase-release-explorer-controls > button:last-child')!.disabled).toBe(true);
        tabs[tabs.length - 1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
        document.querySelector<HTMLButtonElement>('.lorebase-release-explorer-controls > button:last-child')!.click();
        expect(tabs[1].getAttribute('aria-pressed')).toBe('true');
    });
    it('keeps the explorer open if navigation cannot succeed and credits AniList correctly', async () => {
        const close = vi.fn();
        renderReleaseExplorer(document.body, 'ru', '4.0.0', vi.fn().mockResolvedValue(false), close);
        document.querySelector<HTMLButtonElement>('.lorebase-release-dot[title="Ваша библиотека и AniList"]')!.click();
        expect(document.querySelector('a')?.href).toBe('https://github.com/SpreadSheets600');
        expect(document.body.textContent).toContain('основу логики');
        document.querySelector<HTMLButtonElement>('.lorebase-release-explore')!.click();
        await Promise.resolve(); await Promise.resolve();
        expect(close).not.toHaveBeenCalled();
    });
});

it('switches between translated releases without rendering the other versions at once', () => {
    renderReleaseHistory(document.body, 'ru', '4.0.0');
    expect(document.body.textContent).not.toContain('Исправлены кнопки поддержки');
    const versions = [...document.querySelectorAll<HTMLButtonElement>('.lorebase-release-versions button')];
    versions.find(button => button.textContent === '1.1.0')!.click();
    document.querySelector<HTMLButtonElement>('.lorebase-release-group-nav .is-fixed')!.click();
    expect(document.body.textContent).toContain('Исправлены кнопки поддержки');
    expect(document.body.textContent).not.toContain('Новый тип медиа доступен');
    expect(document.body.textContent).not.toContain('Original release notes');
});

it('keeps About free of duplicated update controls and embedded changelog', () => {
    const showWhatsNew = vi.fn();
    i18n.setLanguage('ru');
    renderAboutSection({
        plugin: { showWhatsNew, manifest: { name: 'Lorebase', version: '4.0.0', author: 'Murch1k', minAppVersion: '1.7.0' } },
        createSectionHeader: vi.fn(),
    } as any, document.body);
    expect(document.querySelector('.lorebase-about-card')).not.toBeNull();
    expect(document.querySelector('.lorebase-release-timeline')).toBeNull();
    expect(document.body.textContent).not.toContain('История изменений');
    expect(document.querySelector('.lorebase-about-updates')).toBeNull();
    const sync = [...document.querySelectorAll<HTMLElement>('.lorebase-about-source-group')].find(row => row.querySelector('h3')?.textContent === 'Sync')!;
    expect([...sync.querySelectorAll('.lorebase-about-attribution-name')].map(node => node.textContent)).toEqual(['Steam', 'AniList', 'Trakt', 'PlayStation']);
    const rights = document.querySelector('.lorebase-about-rights-notice')!;
    expect(rights.querySelectorAll('p')).toHaveLength(3);
    expect(rights.textContent).toContain('код');
    expect(rights.textContent).toContain('коммерческое использование');
});

it('opens updates from the common settings header with an accessible version label', () => {
    const open = vi.fn();
    renderReleaseLauncher(document.body, 'ru', '4.0.0', open);
    const button = document.querySelector<HTMLButtonElement>('.lorebase-release-launcher')!;
    expect(button.getAttribute('aria-label')).toBe('Что нового · 4.0.0');
    expect(button.textContent).toContain('4.0.0');
    button.click();
    expect(open).toHaveBeenCalledOnce();
});

it('formats provider names and template tokens while keeping arbitrary text literal', () => {
    const text = 'TMDB и Last.fm: {{VALUE:name}} <img src=x onerror=alert(1)>';
    renderReleaseText(document.body, text);
    expect(document.body.textContent).toBe(text);
    expect(document.querySelectorAll('.lorebase-release-keyword')).toHaveLength(2);
    expect(document.querySelector('code')?.textContent).toBe('{{VALUE:name}}');
    expect(document.querySelector('img')).toBeNull();
});


it('opens individual notes and can expand the selected category together', () => {
    renderReleaseHistory(document.body, 'ru', '4.0.0');
    const notes = [...document.querySelectorAll<HTMLDetailsElement>('.lorebase-release-note')];
    const added = getReleaseHistory('ru', '4.0.0')[0].groups.find(group => group.kind === 'added')!;
    expect(notes).toHaveLength(added.items.length);
    expect(notes.some(note => note.querySelector('summary')?.textContent?.includes('Дополнительные онлайн-функции'))).toBe(true);
    expect(notes.every(note => !note.open)).toBe(true);
    const ratingNote = notes.find(note => note.querySelector('.lorebase-release-note-title')?.textContent === 'Оценки по вашим правилам')!;
    ratingNote.querySelector('summary')!.click();
    expect(ratingNote.open).toBe(true);
    expect(notes[0].open).toBe(false);
    expect(ratingNote.textContent).toContain('Максимальный балл от 2 до 10');
    const detailed = document.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    detailed.checked = true;
    detailed.dispatchEvent(new Event('change'));
    expect([...document.querySelectorAll<HTMLDetailsElement>('details')].every(note => note.open)).toBe(true);
    detailed.checked = false;
    detailed.dispatchEvent(new Event('change'));
    expect([...document.querySelectorAll<HTMLDetailsElement>('details')].every(note => !note.open)).toBe(true);
});

it('shows every change in the selected category without pagination', () => {
    const state = createReleaseWindowState();
    renderReleaseHistory(document.body, 'ru', '4.0.0', state);
    const history = getReleaseHistory('ru', '4.0.0')[0];
    for (const group of history.groups) {
        document.querySelector<HTMLButtonElement>(`.lorebase-release-group-nav .is-${group.kind}`)!.click();
        expect(document.querySelectorAll('[role="tabpanel"]')).toHaveLength(1);
        expect(document.querySelector('.lorebase-release-group-nav [aria-selected="true"]')?.className).toBe(`is-${group.kind}`);
        const titles = [...document.querySelectorAll('.lorebase-release-note-title')].map(node => node.textContent!);
        expect(titles).toHaveLength(group.items.length);
        titles.forEach((title, index) => expect(title.startsWith(group.summaries![index])).toBe(true));
        if (group.kind === 'fixed') {
            expect(titles).toContain('HowLongToBeat · 404');
            expect(titles).toContain('Shikimori · 404');
            expect(titles).toContain('Ошибки AniList · 403');
            expect([...document.querySelectorAll<HTMLDetailsElement>('details')].every(note => !note.open)).toBe(true);
        }
        expect(document.querySelector('.lorebase-release-history-pagination')).toBeNull();
        expect(state.historyKind).toBe(group.kind);
    }
    document.body.replaceChildren();
    renderReleaseHistory(document.body, 'ru', '4.0.0', state);
    expect(document.querySelector('.lorebase-release-group-nav [aria-selected="true"]')?.className).toBe('is-fixed');
    const fixed = history.groups.find(group => group.kind === 'fixed')!;
    expect(document.querySelectorAll('.lorebase-release-note')).toHaveLength(fixed.items.length);
});

it('supports keyboard category navigation', () => {
    renderReleaseHistory(document.body, 'en', '4.0.0');
    document.querySelector('.lorebase-release-group-nav [aria-selected="true"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement?.className).toBe('is-improved');
    const improved = getReleaseHistory('en', '4.0.0')[0].groups.find(group => group.kind === 'improved')!;
    expect(document.querySelectorAll('.lorebase-release-note')).toHaveLength(improved.items.length);
});

it('retains community acknowledgments and the contribution message in their own view', () => {
    renderReleaseCommunity(document.body, 'ru');
    const cards = document.querySelectorAll('.lorebase-release-community-card');
    expect(cards).toHaveLength(2);
    expect(cards[0].querySelector('a')?.href).toBe('https://github.com/SpreadSheets600');
    expect(cards[1].textContent).toContain('китайский перевод');
    expect(cards[1].textContent).toContain('HowLongToBeat');
    const policy = document.querySelector('.lorebase-release-policy')!;
    expect(policy.querySelector('.lorebase-release-badge')?.textContent).toBe('v4.0.0');
    expect(policy.querySelector('p')?.textContent).toContain('С выходом LOREBASE 4.0.0 я закрываю приём pull requests');
    expect(policy.querySelector('p')?.textContent).toContain('вы тратили время на подготовку правок');
    expect(policy.querySelector('p:last-child')?.textContent).toContain('как её повторить');
    expect(policy.querySelector('p:last-child')?.textContent).toContain('Спасибо за ваше время и помощь!');
});

it('restores the selected feature after leaving to try it', async () => {
    const state = createReleaseWindowState();
    const close = vi.fn();
    renderReleaseExplorer(document.body, 'ru', '4.0.0', vi.fn().mockResolvedValue(true), close, state);
    document.querySelector<HTMLButtonElement>('.lorebase-release-dot[title="Книжная полка"]')!.click();
    document.querySelector<HTMLButtonElement>('.lorebase-release-explore')!.click();
    await Promise.resolve(); await Promise.resolve();
    expect(close).toHaveBeenCalledOnce();
    document.body.replaceChildren();
    renderReleaseExplorer(document.body, 'ru', '4.0.0', vi.fn(), close, state);
    expect(document.querySelector('#lorebase-feature-heading')?.textContent).toBe('Книжная полка');
    expect(document.querySelector('.lorebase-release-counter')?.textContent).toBe('6 / 18');
});

it('keeps installed-version emphasis while another version is selected and restores history options', () => {
    const state = createReleaseWindowState();
    renderReleaseHistory(document.body, 'ru', '4.0.0', state);
    const installed = document.querySelector<HTMLButtonElement>('.lorebase-release-versions .is-installed')!;
    expect(installed.getAttribute('aria-current')).toBe('true');
    document.querySelectorAll<HTMLButtonElement>('.lorebase-release-versions button')[1].click();
    expect(installed.classList.contains('is-installed')).toBe(true);
    expect(installed.getAttribute('aria-pressed')).toBe('false');
    const detailed = document.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    detailed.checked = true;
    detailed.dispatchEvent(new Event('change'));
    document.body.replaceChildren();
    renderReleaseHistory(document.body, 'ru', '4.0.0', state);
    expect(document.querySelector('.lorebase-release-history-heading h3')?.textContent).toBe('v3.0.1');
    expect(document.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
});

it('removes temporary highlights and restores focus attributes', () => {
    vi.useFakeTimers();
    try {
        const target = document.createElement('div');
        document.body.append(target);
        highlightReleaseTarget(target);
        expect(target.classList.contains('lorebase-release-target-highlight')).toBe(true);
        expect(document.activeElement).toBe(target);
        vi.advanceTimersByTime(3000);
        highlightReleaseTarget(target);
        vi.advanceTimersByTime(3000);
        expect(target.classList.contains('lorebase-release-target-highlight')).toBe(true);
        vi.advanceTimersByTime(2000);
        expect(target.classList.contains('lorebase-release-target-highlight')).toBe(false);
        expect(target.hasAttribute('tabindex')).toBe(false);
    } finally { vi.useRealTimers(); }
});
