// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { App } from 'obsidian';
import { TraktLoginModal } from '../src/modals/TraktLoginModal';
import { TraktImportModal } from '../src/modals/TraktImportModal';
import { tt, traktError } from '../src/localization/trakt';
import { TraktHttpError } from '../src/services/trakt/api';
import type { TraktSyncService } from '../src/services/TraktSyncService';
import { defaultTraktSettings, type TraktPreview } from '../src/services/trakt/types';
import { installStatisticsDom } from './helpers/statisticsDom';
import { renderTraktSyncSettings } from '../src/settings/TraktSyncSettings';
import { DEFAULT_SETTINGS } from '../src/constants';
import type { SettingsSectionContext } from '../src/settings/sections/types';
beforeAll(installStatisticsDom);
afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });
function mount<T extends { modalEl: HTMLElement; contentEl: HTMLElement; open(): void; close(): void; onOpen(): void; onClose(): void }>(modal: T): T {
    modal.modalEl = document.createElement('div'); modal.contentEl = document.createElement('div'); modal.modalEl.appendChild(modal.contentEl); document.body.appendChild(modal.modalEl);
    modal.open = () => modal.onOpen(); modal.close = vi.fn(() => modal.onClose()); return modal;
}
const tick = async () => { for (let n = 0; n < 10; n++) await Promise.resolve(); };
const button = (root: HTMLElement, label: string) => [...root.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.startsWith(label))!;
function choose(root: HTMLElement, label: string): void {
    const trigger = root.querySelector<HTMLButtonElement>('.lorebase-settings-dropdown-btn')!;
    trigger.getBoundingClientRect = () => ({ x: 20, y: 20, top: 20, left: 20, right: 220, bottom: 60, width: 200, height: 40, toJSON() {} });
    trigger.click(); const option = [...document.querySelectorAll<HTMLElement>('.lorebase-settings-dropdown-panel.is-open [role=option]')].find(option => option.textContent === label);
    expect(option).toBeDefined(); option!.click();
}
describe('Trakt device sign-in', () => {
    it('accepts the current auth.trakt.tv verification URL and displays the device code', async () => {
        vi.useFakeTimers(); const connected = { ...defaultTraktSettings(), accessToken: 'new' };
        const poll = vi.fn(async () => connected);
        const service = { beginLogin: async () => ({ code: 'ABCD1234', url: 'https://auth.trakt.tv/activate', interval: 5, expiresAt: Date.now() + 60000, poll }) } as unknown as TraktSyncService;
        const modal = mount(new TraktLoginModal(new App(), service)), result = modal.openAndGetValue(); await tick();
        expect(modal.contentEl.querySelector('.lorebase-trakt-code')?.textContent).toBe('ABCD1234'); expect(modal.contentEl.querySelector('input')).toBeNull();
        expect(modal.contentEl.textContent).toContain(tt('waiting')); expect(button(modal.contentEl, tt('open'))).toBeDefined();
        expect(modal.contentEl.querySelector('.lorebase-trakt-address')?.textContent).toBe('auth.trakt.tv/activate');
        expect(modal.contentEl.querySelectorAll('.lorebase-trakt-step-number')).toHaveLength(2);
        expect(modal.contentEl.querySelector('button[aria-label="' + tt('copy') + '"]')).not.toBeNull();
        await vi.advanceTimersByTimeAsync(5000); expect(await result).toEqual(connected);
    });
    it('cancels polling when the sign-in window closes', async () => {
        vi.useFakeTimers(); const poll = vi.fn(async () => null);
        const service = { beginLogin: async () => ({ code: 'CODE', url: 'https://trakt.tv/activate', interval: 5, expiresAt: Date.now() + 60000, poll }) } as unknown as TraktSyncService;
        const modal = mount(new TraktLoginModal(new App(), service)), result = modal.openAndGetValue(); await tick(); modal.close();
        expect(await result).toBeNull(); await vi.advanceTimersByTimeAsync(10000); expect(poll).not.toHaveBeenCalled();
    });
    it('replaces an expired code and cancels the replacement when closed', async () => {
        vi.useFakeTimers(); let attempt = 0;
        const poll = vi.fn(async () => null), beginLogin = vi.fn(async () => ({ code: ++attempt === 1 ? 'OLD' : 'NEW', url: 'https://auth.trakt.tv/activate', interval: 5, expiresAt: Date.now() + 5000, poll }));
        const service = { beginLogin } as unknown as TraktSyncService;
        const modal = mount(new TraktLoginModal(new App(), service)); modal.open(); await tick(); await vi.advanceTimersByTimeAsync(5000);
        expect(modal.contentEl.textContent).toContain(tt('expired'));
        button(modal.contentEl, tt('newCode')).click(); await tick();
        expect(modal.contentEl.querySelectorAll('.lorebase-trakt-code')).toHaveLength(1); expect(modal.contentEl.querySelector('.lorebase-trakt-code')?.textContent).toBe('NEW');
        modal.close(); await vi.advanceTimersByTimeAsync(5000); expect(poll).not.toHaveBeenCalled();
    });
    it('rejects unrelated verification hosts and reports a sign-in error', async () => {
        const service = { beginLogin: async () => ({ code: 'CODE', url: 'https://auth.trakt.tv.evil.test/activate', interval: 5, expiresAt: Date.now() + 60000, poll: vi.fn() }) } as unknown as TraktSyncService;
        const modal = mount(new TraktLoginModal(new App(), service)); modal.open(); await tick();
        expect(modal.contentEl.textContent).toContain(tt('invalidLoginResponse')); expect(modal.contentEl.querySelector('.lorebase-trakt-code')).toBeNull(); modal.close();
    });
    it('keeps authentication errors separate from metadata errors', () => {
        expect(traktError(new Error('TRAKT_NETWORK'), 'auth')).toBe(tt('loginFailure'));
        expect(traktError(new TraktHttpError(401), 'auth')).toBe(tt('invalidClientId'));
        expect(traktError(new TraktHttpError(403), 'auth')).toBe(tt('loginDenied'));
        expect(traktError(new TraktHttpError(429), 'auth')).toBe(tt('rateLimit'));
        expect(traktError(new Error('TRAKT_METADATA_UNAVAILABLE'))).toBe(tt('providerMissing'));
    });
});
describe('Trakt import review', () => {
    it('opens inline conflict controls without selecting a title and keeps the chosen resolution', async () => {
        const state = { rating: null, watched: false, watchlist: false, favorite: false, episodes: ['1:2'] };
        const row: TraktPreview = { entry: { key: 'series:1', id: '1', kind: 'series', title: 'Conflicting show', ids: {}, state }, path: 'Series/Show.md', matches: ['Series/Show.md'], local: { ...state, episodes: ['1:1'] }, merged: state, conflicts: ['episodes'] };
        const apply = vi.fn(async () => ({ created: 0, updated: 1, failed: 0, errors: [] }));
        const service = { preview: async () => [row], targets: () => [{ path: row.path, title: 'Existing note' }], previewImage: async () => undefined, apply } as unknown as TraktSyncService;
        const modal = mount(new TraktImportModal(new App(), service, vi.fn(), vi.fn(), vi.fn())); modal.open(); await tick();
        modal.contentEl.querySelector<HTMLButtonElement>('.lorebase-trakt-item-select')!.click();
        expect(modal.contentEl.querySelector<HTMLElement>('.lorebase-trakt-item-details')!.hidden).toBe(false);
        expect(modal.contentEl.querySelectorAll('.is-picked')).toHaveLength(0);
        choose([...modal.contentEl.querySelectorAll<HTMLElement>('.lorebase-trakt-field')].at(-1)!, tt('remote'));
        modal.contentEl.querySelector<HTMLButtonElement>('.lorebase-trakt-item-select')!.click();
        expect(modal.contentEl.querySelectorAll('.is-picked')).toHaveLength(1);
        button(modal.contentEl, tt('hideDetails')).click();
        expect(modal.contentEl.querySelectorAll('.is-picked')).toHaveLength(1);
        button(modal.contentEl, tt('apply')).click(); await tick();
        expect(apply).toHaveBeenCalledWith([{ row, resolution: 'remote' }], expect.anything(), expect.anything()); modal.close();
    });
    it('shows watched totals, favorites and season counts, then returns from the compact result', async () => {
        const state = { rating: 8, watched: false, watchlist: false, favorite: true, episodes: ['1:1', '1:2', '2:3'] };
        const row: TraktPreview = { entry: { key: 'series:1', id: '1', kind: 'series', title: 'Watched show', ids: {}, state }, matches: [], local: { ...state, favorite: false, episodes: [] }, merged: state, conflicts: [] };
        const service = { preview: vi.fn(async () => [row]), targets: () => [], previewImage: async () => undefined,
            apply: vi.fn(async (_: unknown, __: unknown, progress: (done: number, total: number, title: string) => void) => { progress(0, 1, row.entry.title); expect(document.querySelector('.lorebase-trakt-current')?.textContent).toBe(row.entry.title); return { created: 1, updated: 0, failed: 0, errors: [] }; }) } as unknown as TraktSyncService;
        const modal = mount(new TraktImportModal(new App(), service, vi.fn(), vi.fn(), vi.fn())); modal.open(); await tick();
        expect(modal.contentEl.querySelector('.lorebase-trakt-favorite')?.getAttribute('aria-label')).toContain(tt('favorite'));
        expect(modal.contentEl.querySelector('.lorebase-trakt-facts')?.textContent).toContain('3');
        expect(modal.contentEl.querySelector('.lorebase-trakt-item-details')?.hidden).toBe(true);
        button(modal.contentEl, tt('details')).click();
        expect(modal.contentEl.querySelectorAll('.lorebase-trakt-season')).toHaveLength(2);
        expect(modal.contentEl.textContent).not.toContain(tt('noteValue'));
        expect(modal.contentEl.querySelectorAll('.is-picked')).toHaveLength(0);
        button(modal.contentEl, tt('select')).click(); button(modal.contentEl, tt('apply')).click(); await tick();
        expect(modal.modalEl.classList.contains('is-result')).toBe(true);
        expect(modal.contentEl.querySelector('.lorebase-trakt-result-counts')?.textContent).toContain(tt('created'));
        button(modal.contentEl, tt('backToList')).click(); await tick();
        expect(modal.modalEl.classList.contains('is-result')).toBe(false); expect(service.preview).toHaveBeenCalledTimes(2);
        modal.close();
    });
    it('selects only one page and leaves unresolved note matches for review', async () => {
        const rows: TraktPreview[] = Array.from({ length: 21 }, (_, index) => ({ entry: { key: `series:${index}`, id: String(index), kind: 'series', title: `Show ${index}`, ids: {}, state: { rating: null, watched: false, watchlist: true, episodes: [] } }, matches: [], local: { rating: null, watched: false, watchlist: false, episodes: [] }, merged: { rating: null, watched: false, watchlist: true, episodes: [] }, conflicts: [] }));
        rows[0].matches = ['Series/A.md', 'Series/B.md'];
        const service = { preview: async () => rows, targets: () => [], previewImage: async () => undefined,
            apply: vi.fn(async () => ({ created: 19, updated: 0, failed: 0, errors: [] })) } as unknown as TraktSyncService;
        const dispose = vi.fn(), modal = mount(new TraktImportModal(new App(), service, vi.fn(), vi.fn(), dispose)); modal.open(); await tick();
        expect(modal.contentEl.querySelectorAll('.lorebase-trakt-item')).toHaveLength(20); expect(modal.contentEl.querySelector('.lorebase-trakt-review-providers')).toBeNull();
        expect(modal.contentEl.textContent).not.toContain('Client ID'); button(modal.contentEl, tt('select')).click();
        expect(modal.contentEl.querySelectorAll('.is-picked')).toHaveLength(19); button(modal.contentEl, tt('apply')).click(); await tick();
        expect(vi.mocked(service.apply).mock.calls[0][0]).toHaveLength(19); expect(modal.contentEl.textContent).toContain(tt('done')); modal.close(); expect(dispose).toHaveBeenCalled();
    });
});
describe('Trakt Client ID setting', () => {
    function settingsFixture(connected = false) {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.traktSync = { ...defaultTraktSettings(), clientId: connected ? 'old-app' : '', accessToken: connected ? 'token' : '', refreshToken: connected ? 'refresh' : '', username: connected ? 'User' : '', expiresAt: connected ? 123 : 0, seriesProvider: 'tmdb', twoWay: true };
        const plugin = { settings, saveSettings: vi.fn(async () => {}), connectTrakt: vi.fn(async () => {}), runTraktImport: vi.fn(), runTraktSync: vi.fn() };
        const context = { plugin, app: new App(), display: vi.fn() } as unknown as SettingsSectionContext;
        const root = document.body.appendChild(document.createElement('div')), status = document.body.appendChild(document.createElement('div'));
        renderTraktSyncSettings(context, root, status);
        return { root, status, plugin, input: root.querySelector<HTMLInputElement>('input[aria-label="Client ID"]')! };
    }
    it('saves a user Client ID and enables code sign-in without reloading settings', () => {
        const { root, input, plugin } = settingsFixture();
        expect(input).not.toBeNull(); expect(button(root, tt('connect')).disabled).toBe(true);
        input.value = '  my-app  '; input.dispatchEvent(new Event('input'));
        expect(plugin.settings.traktSync.clientId).toBe('my-app'); expect(plugin.saveSettings).toHaveBeenCalledOnce();
        expect(button(root, tt('connect')).disabled).toBe(false);
    });
    it('keeps metadata APIs and synchronization direction on the main Trakt page', () => {
        const { root, plugin } = settingsFixture(true);
        const overview = root.querySelector<HTMLElement>('.lorebase-sync-overview')!;
        const fields = overview.querySelector('.lorebase-trakt-provider-fields')!;
        expect(fields.querySelectorAll('.lorebase-settings-dropdown-btn')).toHaveLength(3);
        expect(fields.textContent).toContain(tt('direction'));
        expect([...root.querySelectorAll('.lorebase-sync-page-link')].map(button => button.textContent)).toEqual([tt('connection')]);
        const series = [...fields.querySelectorAll<HTMLElement>('.lorebase-trakt-provider-field')][1];
        choose(series, 'TVmaze');
        expect(plugin.settings.traktSync.seriesProvider).toBe('tvmaze'); expect(plugin.saveSettings).toHaveBeenCalled();
        expect(overview.hidden).toBe(false);
    });
    it('invalidates the old authorization when the application changes and preserves preferences', () => {
        const { root, status, input, plugin } = settingsFixture(true), old = plugin.settings.traktSync;
        input.value = 'new-app'; input.dispatchEvent(new Event('input'));
        expect(plugin.settings.traktSync).not.toBe(old);
        expect(plugin.settings.traktSync).toMatchObject({ clientId: 'new-app', accessToken: '', refreshToken: '', username: '', expiresAt: 0, lastSynced: {}, seriesProvider: 'tmdb', twoWay: true });
        expect(status.textContent).toContain(tt('disconnected')); expect(button(root, tt('disconnect'))).toBeUndefined();
        expect(button(root, tt('import')).disabled).toBe(true);
    });
    it('retains the Client ID when disconnecting the account', async () => {
        const { root, plugin } = settingsFixture(true);
        button(root, tt('disconnect')).click(); await tick();
        expect(plugin.settings.traktSync).toMatchObject({ clientId: 'old-app', accessToken: '', refreshToken: '' });
    });
});
