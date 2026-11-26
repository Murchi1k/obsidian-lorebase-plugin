// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { PersonFilmographyModal } from '../src/modals/PersonFilmographyModal';
import { VideoCastPanel } from '../src/components/VideoCastPanel';
import type { PeopleService } from '../src/services/PeopleService';
import { configureMediaWorkTypes } from '../src/utils/mediaWorkType';

beforeAll(() => {
    Object.assign(HTMLElement.prototype, {
        empty() { this.replaceChildren(); },
        addClass(...names: string[]) { this.classList.add(...names); },
        removeClass(...names: string[]) { this.classList.remove(...names); },
        hasClass(name: string) { return this.classList.contains(name); },
        toggleClass(name: string, value: boolean) { this.classList.toggle(name, value); },
        setCssStyles(styles: object) { Object.assign(this.style, styles); },
        createEl(tag: string, options: any = {}) {
            const node = this.ownerDocument.createElement(tag); node.className = options.cls || ''; node.textContent = options.text || '';
            for (const [key, value] of Object.entries(options.attr || {})) node.setAttribute(key, String(value));
            this.appendChild(node); return node;
        },
        createDiv(options: any) { return this.createEl('div', options); },
        createSpan(options: any) { return this.createEl('span', options); },
        getClientRects() { return this.isConnected ? [this.getBoundingClientRect()] : []; },
        getBoundingClientRect() { return { left: 20, top: 20, right: 160, bottom: 52, width: 140, height: 32 }; },
    });
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 1000 });
    Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, value: 800 });
});

afterEach(() => { document.body.replaceChildren(); configureMediaWorkTypes(); });
function fixture() {
    const offref = vi.fn();
    const app = { metadataCache: { on: vi.fn(), offref }, vault: { on: vi.fn(), offref }, workspace: { openLinkText: vi.fn() } } as unknown as App;
    const credits = Array.from({ length: 50 }, (_, index) => ({ id: String(index + 1), provider: 'tmdb', media: index % 2 ? 'series' : 'movie', title: `Title ${index + 1}`, year: '2020', role: index === 0 ? 'Hero / Director' : 'Role', character: index === 0 ? 'Hero' : 'Role', job: index === 0 ? 'Director' : '', acting: true, crew: index === 0 }));
    let added = false;
    const service = { configured: () => true, language: () => 'en-US', actorName: vi.fn(async (actor: { name: string }) => actor.name), person: vi.fn(async () => ({ id: '1', name: 'Actor', photo: '', biography: '<img src=x onerror=alert(1)>', birthday: '1980-05-12', deathday: '', birthplace: 'Somewhere', credits })),
        cast: vi.fn(async () => []), libraryIndex: vi.fn(() => () => added ? { path: 'Movies/New.md' } : null), add: vi.fn(async () => { added = true; return { path: 'Movies/New.md' }; }) };
    return { app, service, offref };
}
async function open() {
    const data = fixture();
    const modal = new PersonFilmographyModal(data.app, data.service as unknown as PeopleService, { id: '1', name: 'Actor', photo: '', role: '' }, 'movie', 'Original character');
    modal.modalEl = document.createElement('div'); modal.contentEl = document.createElement('div'); modal.modalEl.append(modal.contentEl); document.body.append(modal.modalEl); modal.onOpen();
    await vi.waitFor(() => expect(modal.contentEl.querySelectorAll('article')).toHaveLength(24));
    return { ...data, modal, root: modal.contentEl };
}
describe('actor and filmography UI', () => {
    it('paginates large filmographies, filters and renders biography as text', async () => {
        const { modal, root } = await open();
        expect(root.querySelector('img')).toBeNull(); expect(root.querySelector('details p')!.textContent).toContain('<img');
        root.querySelector<HTMLButtonElement>('[data-filter="media"] button')!.click();
        document.querySelectorAll<HTMLElement>('body > .lorebase-people-dropdown-panel [role="option"]')[1].click();
        expect(root.querySelectorAll('article')).toHaveLength(24);
        root.querySelectorAll<HTMLButtonElement>('.lorebase-filmography-paging button')[1].click();
        expect(root.querySelectorAll('article')).toHaveLength(1);
        const search = root.querySelector('input')!; search.value = 'Title 3'; search.dispatchEvent(new Event('input'));
        expect(root.querySelectorAll('article')).toHaveLength(6); modal.onClose();
    });
    it('turns a successful add into an open-library action and cleans event subscriptions', async () => {
        const { modal, root, app, service, offref } = await open();
        root.querySelector<HTMLButtonElement>('article button')!.click();
        await vi.waitFor(() => expect(root.querySelector('article button')!.classList.contains('is-in-library')).toBe(true));
        root.querySelector<HTMLButtonElement>('article button')!.click(); expect(service.add).toHaveBeenCalledOnce();
        expect(app.workspace.openLinkText).toHaveBeenCalledWith('Movies/New.md', ''); modal.onClose(); expect(offref).toHaveBeenCalledTimes(3);
    });
    it('reuses the library index for filters and coalesces metadata change bursts', async () => {
        const { modal, root, app, service } = await open();
        const search = root.querySelector('input')!; search.value = 'Title'; search.dispatchEvent(new Event('input'));
        expect(service.libraryIndex).toHaveBeenCalledOnce();
        const changed = (app.metadataCache.on as any).mock.calls[0][1]; changed(); changed(); changed();
        await vi.waitFor(() => expect(service.libraryIndex).toHaveBeenCalledTimes(2)); modal.onClose();
    });
    it('fetches cast only when expanded and ignores a result after the editor closes', async () => {
        const { app, service } = fixture(); let resolve!: (value: never[]) => void;
        service.cast.mockImplementation(() => new Promise(done => resolve = done));
        const host = document.createElement('div');
        const panel = new VideoCastPanel(app, host, { type: 'movie' } as any, service as unknown as PeopleService);
        expect(service.cast).not.toHaveBeenCalled(); const details = host.querySelector('details')!;
        details.open = true; details.dispatchEvent(new Event('toggle')); expect(service.cast).toHaveBeenCalledOnce();
        panel.destroy(); const before = host.innerHTML; resolve([]); await Promise.resolve(); expect(host.innerHTML).toBe(before);
    });
    it('separates source-ordered cast and only renders supporting actors after expansion', async () => {
        const { app, service } = fixture();
        service.cast.mockResolvedValue(Array.from({ length: 51 }, (_, index) => ({ id: String(index + 1), name: `Long actor name ${index + 1}`, role: `Role ${index + 1}`, photo: '' })) as any);
        const host = document.createElement('div'); document.body.append(host);
        const panel = new VideoCastPanel(app, host, { type: 'movie' } as any, service as unknown as PeopleService);
        const details = host.querySelector('details')!; details.open = true; details.dispatchEvent(new Event('toggle'));
        await vi.waitFor(() => expect(host.querySelectorAll('.lorebase-cast-card')).toHaveLength(24));
        expect(service.actorName).toHaveBeenCalledTimes(24);
        expect(host.querySelector('.lorebase-cast-group-heading')!.getAttribute('title')).toContain('24');
        const secondary = host.querySelector<HTMLDetailsElement>('.lorebase-cast-secondary')!;
        secondary.open = true; secondary.dispatchEvent(new Event('toggle'));
        expect(secondary.querySelectorAll('.lorebase-cast-card')).toHaveLength(12);
        expect(service.actorName).toHaveBeenCalledTimes(36);
        secondary.querySelector<HTMLButtonElement>('button:not(.lorebase-cast-card)')!.click();
        expect(secondary.querySelectorAll('.lorebase-cast-card')).toHaveLength(24);
        secondary.querySelector<HTMLButtonElement>('button:not(.lorebase-cast-card)')!.click();
        expect(secondary.querySelectorAll('.lorebase-cast-card')).toHaveLength(27);
        expect(secondary.querySelector('.lorebase-cast-card')!.getAttribute('aria-label')).toContain('Long actor name 25'); panel.destroy();
    });
    it('highlights the current character and distinguishes acting from crew credits', async () => {
        const { modal, root } = await open();
        expect(root.querySelector('.lorebase-person-current-role strong')!.textContent).toBe('Original character');
        expect(root.querySelector('.lorebase-person-facts')!.textContent).toContain('May 12, 1980');
        expect(root.querySelector('.lorebase-person-age')).not.toBeNull();
        expect(root.querySelector('.lorebase-filmography-role strong')!.textContent).toBe('Hero');
        root.querySelector<HTMLButtonElement>('[data-filter="role"] button')!.click();
        document.querySelectorAll<HTMLElement>('body > .lorebase-people-dropdown-panel [role="option"]')[2].click();
        expect(root.querySelectorAll('article')).toHaveLength(1);
        expect(root.querySelector('.lorebase-filmography-role strong')!.textContent).toBe('Director'); modal.onClose();
    });
    it('uses configured media colors and removes an open floating filter when closing', async () => {
        configureMediaWorkTypes({ movie: { types: [{ value: 'Movie', color: '#123456' }], redirects: {} }, series: { types: [{ value: 'Series', color: '#abcdef' }], redirects: {} } });
        const { modal, root } = await open();
        const badges = root.querySelectorAll<HTMLElement>('.lorebase-filmography-type');
        expect(badges[0].style.getPropertyValue('--lorebase-type-color')).toBe('#123456');
        expect(badges[1].style.getPropertyValue('--lorebase-type-color')).toBe('#abcdef');
        root.querySelector<HTMLButtonElement>('[data-filter="media"] button')!.click();
        expect(document.querySelector('body > .lorebase-people-dropdown-panel')).not.toBeNull();
        modal.onClose(); expect(document.querySelector('.lorebase-people-dropdown-panel')).toBeNull();
    });
});
