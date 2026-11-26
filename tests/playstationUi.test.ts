// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App, Modal } from './mocks/obsidian';
import { PlayStationMatchModal } from '../src/modals/PlayStationMatchModal';
import { gt } from '../src/localization/gameTracking';
import { DEFAULT_SETTINGS } from '../src/constants';
import { GameTrackingPanel } from '../src/components/GameTrackingPanel';
import { createPlayStationProgressPreference } from '../src/components/PlayStationProgressPreference';
import { normalizePlayStationSettings } from '../src/services/playstation/types';
import { PlayStationImportModal } from '../src/modals/PlayStationImportModal';
import { renderPlayStationSyncSettings } from '../src/settings/PlayStationSyncSettings';
import { GameService } from '../src/services/GameService';
import { pt } from '../src/localization/playstation';
import { i18n } from '../src/localization';
import { installStatisticsDom } from './helpers/statisticsDom';
import { createMockApp, createMockFile, createMetadataService } from './helpers/testHelpers';
import type { GameItem } from '../src/types';
import type { PlayStationPreview, PlayStationSyncService } from '../src/services/PlayStationSyncService';
import type { PlayStationTracking } from '../src/services/playstation/types';
const tracking = (): PlayStationTracking => ({ accountId: '123', titleId: 'PPSA00001_00', platform: 'PS5', playtimeMinutes: 150,
    trophySets: [{ id: 'NPWR00001_00', title: 'My game', platform: 'PS5', progress: 50,
        earned: { bronze: 5, silver: 2, gold: 1, platinum: 0 }, total: { bronze: 10, silver: 4, gold: 2, platinum: 1 } }] });
const button = (root: HTMLElement, title: string) => {
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('button')];
    return buttons.find(button => button.textContent?.trim() === title || button.getAttribute('aria-label') === title) ?? buttons.find(button => button.textContent?.trim().startsWith(title + ' ·'))!;
};
beforeEach(() => {
    installStatisticsDom(); i18n.setLanguage('en');
    vi.spyOn(Modal.prototype, 'open').mockImplementation(function(this: Modal) {
        this.modalEl = document.body.createDiv({ cls: 'modal' }); this.contentEl = this.modalEl.createDiv();
        (this as any).onOpen();
    });
    vi.spyOn(Modal.prototype, 'close').mockImplementation(function(this: Modal) {
        (this as any).onClose(); this.modalEl.remove();
    });
    Object.assign(HTMLElement.prototype, { setAttr(key: string, value: string) { this.setAttribute(key, value); }, setText(value: string) { this.textContent = value; } });
});
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });
describe('PlayStation personal progress', () => {
    it('expands PS by default and keeps refresh inside its active control', () => {
        const game = { type: 'game', playstation: tracking(), steamAppId: '42', playtimeMinutes: 999, achievementsUnlocked: 20,
            achievementsTotal: 40, gameModes: [], progressPercent: 25 } as unknown as GameItem;
        const host = document.body.createDiv(), refresh = vi.fn();
        const panel = new GameTrackingPanel(host, game, vi.fn(), true, refresh);
        const platforms = host.createDiv({ cls: 'lorebase-played-platforms' }), add = platforms.createEl('button'), edit = vi.fn(); add.addEventListener('click', edit);
        expect(host.querySelector('.lorebase-game-progress-ring')?.getAttribute('aria-valuenow')).toBe('47');
        expect(host.querySelectorAll('[data-trophy-grade]')).toHaveLength(4);
        expect(button(host, pt('progressMode')).getAttribute('aria-pressed')).toBe('true');
        expect(button(host, pt('progressMode')).getAttribute('aria-expanded')).toBe('true');
        expect(document.activeElement).not.toBe(host.querySelector('.lorebase-game-progress-ring'));
        expect(button(host, pt('refresh')).closest('.lorebase-psn-control')).toBe(button(host, pt('progressMode')).parentElement);
        expect(panel.getValue()).toMatchObject({ playtimeMinutes: 150, achievementsUnlocked: 8, achievementsTotal: 17, progressPercent: 47 });
        expect(panel.getValue()).not.toHaveProperty('playstation');
        expect(host.querySelector<HTMLInputElement>('[aria-label="' + gt('hours') + '"]')?.value).toBe('2');
        expect([...host.querySelectorAll('[data-trophy-grade] strong')].map(node => node.textContent)).toEqual(['5 / 10', '2 / 4', '1 / 2', '0 / 1']);
        expect(host.querySelectorAll('.lorebase-psn-trophy-art[data-custom-trophy]')).toHaveLength(4);
        expect(host.querySelector('.lorebase-psn-trophy-section')?.nextElementSibling).toBe(platforms);
        add.click(); expect(edit).toHaveBeenCalledOnce(); expect(refresh).not.toHaveBeenCalled();
        expect(document.querySelector('.lorebase-psn-link-modal')).toBeNull();
        expect(game.playtimeMinutes).toBe(999); expect(game.playstation).not.toHaveProperty('progressEnabled');
        panel.destroy();
    });
    it('persists hiding globally and updates other open editors and future games', () => {
        let stored = normalizePlayStationSettings({});
        const save = vi.fn((visible: boolean) => { stored = normalizePlayStationSettings({ ...stored, showProgress: visible }); });
        const preference = createPlayStationProgressPreference(() => stored.showProgress, save);
        const make = () => {
            const host = document.body.createDiv();
            const panel = new GameTrackingPanel(host, { type: 'game', playstation: tracking(), gameModes: [] } as unknown as GameItem,
                undefined, true, undefined, preference);
            return { host, panel };
        };
        const first = make(), second = make();
        button(first.host, pt('progressMode')).click();
        expect(save).toHaveBeenCalledWith(false); expect(stored.showProgress).toBe(false);
        expect(second.host.querySelector<HTMLElement>('.lorebase-psn-trophy-section')?.hidden).toBe(true);
        expect(button(second.host, pt('refresh'))).toBeUndefined();
        expect(second.host.querySelector('.lorebase-psn-control')?.textContent).toBe('PS');
        first.panel.destroy(); const next = make();
        expect(next.host.querySelector<HTMLElement>('.lorebase-psn-trophy-section')?.hidden).toBe(true);
        expect(next.panel.getValue()).toEqual({});
        button(second.host, pt('progressMode')).click();
        expect(stored.showProgress).toBe(true);
        expect(next.host.querySelector<HTMLElement>('.lorebase-psn-trophy-section')?.hidden).toBe(false);
        expect(next.panel.getValue().progressPercent).toBe(47);
        expect(second.panel.getValue()).not.toHaveProperty('playstation');
        second.panel.destroy(); next.panel.destroy();
    });
    it('refreshes the linked PSN title into ordinary time and progress without opening a picker', async () => {
        const host = document.body.createDiv(), refresh = vi.fn(async () => ({ tracking: { ...tracking(), playtimeMinutes: 200 }, partial: false }));
        const panel = new GameTrackingPanel(host, { type: 'game', playstation: tracking(), gameModes: [] } as unknown as GameItem, undefined, true, refresh);
        button(host, pt('refresh')).click();
        await vi.waitFor(() => expect(panel.getValue().playtimeMinutes).toBe(200));
        expect(refresh).toHaveBeenCalledWith(expect.objectContaining({ titleId: tracking().titleId }), expect.any(AbortSignal));
        expect(panel.getValue().progressPercent).toBe(47);
        expect(host.querySelector('.lorebase-game-tracking-actions [role=status]')?.textContent).toBe(pt('updated')); panel.destroy();
    });
    it('does not apply a late PSN response after the editor is closed', async () => {
        let complete!: (value: any) => void;
        const refresh = vi.fn(() => new Promise<any>(resolve => { complete = resolve; }));
        const host = document.body.createDiv();
        const panel = new GameTrackingPanel(host, { type: 'game', playstation: tracking(), gameModes: [] } as unknown as GameItem, undefined, true, refresh);
        const before = structuredClone(panel.getValue());
        button(host, pt('refresh')).click(); panel.destroy();
        complete({ tracking: { ...tracking(), playtimeMinutes: 999 }, partial: false });
        await Promise.resolve(); await Promise.resolve();
        expect(panel.getValue()).toEqual(before); expect(refresh.mock.calls[0][1].aborted).toBe(true);
    });
    it('round-trips nested trophy data through the game service without changing Steam fields', async () => {
        const file = createMockFile('Games/PSN.md', 'PSN');
        const fm = { type: 'game', name: 'PSN', playstation: tracking(), playtime: 999, achievements_unlocked: 20 };
        const app = createMockApp({ [file.path]: { frontmatter: fm } });
        app.vault.getAbstractFileByPath = () => file;
        app.fileManager.processFrontMatter = async (_file, callback) => callback(fm);
        const service = new GameService(app, createMetadataService(app)), game = service.parseGameFromCache(file)!;
        expect(game.playstation?.trophySets?.[0].earned.bronze).toBe(5);
        await service.updateGame(game, { playstation: { ...tracking(), playtimeMinutes: 0 } });
        const updated = service.parseGameFromCache(file)!;
        expect(updated.playstation?.playtimeMinutes).toBe(0); expect(updated.playtimeMinutes).toBe(999); expect(updated.achievementsUnlocked).toBe(20);
    });
});
describe('PlayStation settings and import review', () => {
    it('marks an explicitly confirmed catalog match on the import card', async () => {
        const row = { entry: { ...tracking(), name: 'Far Cry® 3 Classic Edition', image: '' }, matches: [], needsTarget: false,
            targetChosen: true, psnOnly: false, metadataProvider: 'igdb', secretId: 'test' } as PlayStationPreview;
        const source = { id: '42', provider: 'igdb', title: 'Far Cry 3: Classic Edition' };
        const service = { preview: async () => [row], targets: () => [], candidates: async () => [source] } as unknown as PlayStationSyncService;
        const modal = new PlayStationImportModal(new App() as any, service, vi.fn(), vi.fn()); modal.open();
        await vi.waitFor(() => expect(modal.contentEl.querySelector('.lorebase-trakt-item-select')).not.toBeNull());
        modal.contentEl.querySelector<HTMLButtonElement>('.lorebase-trakt-item-select')!.click();
        const dialog = document.querySelector<HTMLElement>('.lorebase-psn-match-modal')!;
        button(dialog, pt('find')).click();
        await vi.waitFor(() => expect(dialog.querySelector('.lorebase-psn-match-result')).not.toBeNull());
        dialog.querySelector<HTMLButtonElement>('.lorebase-psn-match-result')!.click();
        button(dialog, pt('useMatch')).click();
        const badge = modal.contentEl.querySelector<HTMLElement>('.lorebase-psn-card-match')!;
        expect(badge.textContent).toBe('IGDB · ' + pt('matched')); expect(badge.title).toContain(source.title);
        expect(row.source?.id).toBe('42'); expect(button(modal.contentEl, pt('apply')).disabled).toBe(false); modal.close();
    });
    it('accepts an editable metadata query and discards matching changes on cancel', async () => {
        const row = { entry: { ...tracking(), name: 'Far Cry® 3 Classic Edition', image: '' }, matches: [], needsTarget: false,
            targetChosen: true, psnOnly: false, metadataProvider: 'igdb', secretId: 'test' } as PlayStationPreview;
        const source = { id: '42', title: 'Far Cry 3: Classic Edition', provider: 'igdb' };
        const service = { targets: () => [], candidates: vi.fn(async () => [source]) } as unknown as PlayStationSyncService;
        const done = vi.fn(), modal = new PlayStationMatchModal(new App() as any, row, service, done); modal.open();
        const search = modal.contentEl.querySelector<HTMLInputElement>('input[type=search]')!;
        expect(search.value).toBe('Far Cry 3 Classic Edition');
        search.value = 'Far Cry 3'; search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await vi.waitFor(() => expect(modal.contentEl.querySelectorAll('.lorebase-psn-match-result')).toHaveLength(1));
        expect(service.candidates).toHaveBeenCalledWith(expect.objectContaining({ entry: row.entry }), expect.any(AbortSignal), 'Far Cry 3');
        modal.contentEl.querySelector<HTMLButtonElement>('.lorebase-psn-match-result')!.click();
        expect(button(modal.contentEl, pt('useMatch')).disabled).toBe(false);
        modal.close(); expect(done).toHaveBeenCalledWith(undefined); expect(row.source).toBeUndefined();
    });
    it('keeps the NPSSO entry transient and exposes separate import scopes and metadata choices', async () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        const plugin = { settings, saveSettings: vi.fn(), connectPlayStation: vi.fn(async () => {}), runPlayStationImport: vi.fn(),
            runPlayStationSync: vi.fn(), disconnectPlayStation: vi.fn() };
        const display = vi.fn(), host = document.body.createDiv();
        renderPlayStationSyncSettings({ plugin, display } as any, host, document.body.createDiv());
        const navigation = host.querySelector<HTMLElement>('.lorebase-psn-navigation')!;
        expect(navigation.lastElementChild?.textContent).toBe(pt('sourcesHelp'));
        button(navigation, pt('connection')).click();
        expect(host.querySelector<HTMLElement>('.lorebase-sync-overview')?.hidden).toBe(true);
        const input = host.querySelector<HTMLInputElement>('input[type=password]')!;
        expect(input.closest('.lorebase-sync-field-control')?.querySelector('.lorebase-sync-field-icon')).not.toBeNull();
        expect(host.querySelectorAll('.lorebase-psn-auth-step')).toHaveLength(2);
        input.value = 'a'.repeat(64); input.dispatchEvent(new Event('input'));
        expect(JSON.stringify(settings)).not.toContain('a'.repeat(64));
        expect(plugin.saveSettings).not.toHaveBeenCalled();
        button(host, pt('connect')).click();
        await vi.waitFor(() => expect(display).toHaveBeenCalledOnce());
        expect(plugin.connectPlayStation).toHaveBeenCalledWith('a'.repeat(64));
        expect(input.value).toBe('');
        expect(host.querySelector('[aria-label="' + pt('scope') + '"]')).not.toBeNull();
        expect(host.querySelector('[aria-label="' + pt('metadata') + '"]')).not.toBeNull();
        expect([...host.querySelectorAll('.lorebase-sync-operation')].every(node => (node as HTMLButtonElement).disabled)).toBe(true);
    });
    it('requires a target and a metadata decision before importing selected rows', async () => {
        const row: PlayStationPreview = { entry: { ...tracking(), name: 'My game', image: '' }, matches: ['Games/Existing.md'], needsTarget: true,
            targetChosen: false, psnOnly: false, metadataProvider: 'igdb', secretId: 'lorebase-psn-test' };
        const service = { preview: vi.fn(async () => [row]), targets: () => [{ path: 'Games/Existing.md', title: 'Existing' }],
            bind: (draft: PlayStationPreview, path?: string) => { draft.path = path; draft.targetChosen = true; },
            candidates: vi.fn(async () => []), apply: vi.fn(async () => ({ created: 1, updated: 0, failed: 0, partial: 0, failedIds: [], errors: [] })) } as unknown as PlayStationSyncService;
        const modal = new PlayStationImportModal(new App() as any, service, vi.fn(), vi.fn());
        modal.modalEl = document.body.createDiv(); modal.contentEl = modal.modalEl.createDiv(); modal.onOpen();
        await vi.waitFor(() => expect(modal.contentEl.querySelector('.lorebase-trakt-item-select')).not.toBeNull());
        modal.contentEl.querySelector<HTMLButtonElement>('.lorebase-trakt-item-select')!.click();
        expect(button(modal.contentEl, pt('apply')).disabled).toBe(true);
        expect(modal.contentEl.querySelector('.lorebase-trakt-item-details')).toBeNull();
        const dialog = document.querySelector<HTMLElement>('.lorebase-psn-match-modal')!;
        const dropdown = dialog.querySelector<HTMLButtonElement>('.lorebase-settings-dropdown-btn')!;
        dropdown.getBoundingClientRect = () => ({ left: 10, right: 210, top: 10, bottom: 50, width: 200, height: 40, x: 10, y: 10, toJSON() {} });
        dropdown.click();
        [...document.querySelectorAll<HTMLElement>('.lorebase-settings-dropdown-panel.is-open [role=option]')].find(node => node.textContent === pt('newNote'))!.click();
        expect(button(modal.contentEl, pt('apply')).disabled).toBe(true);
        button(dialog, pt('psnOnly')).click();
        expect(row.targetChosen).toBe(false);
        button(dialog, pt('useMatch')).click();
        expect(button(modal.contentEl, pt('apply')).disabled).toBe(false);
        button(modal.contentEl, pt('apply')).click();
        await vi.waitFor(() => expect(service.apply).toHaveBeenCalledOnce());
        expect(vi.mocked(service.apply).mock.calls[0][0][0]).toMatchObject({ targetChosen: true, psnOnly: true });
        modal.onClose();
    });
    it('selects only the visible page and retains selection while filtering and paging', async () => {
        const rows = Array.from({ length: 25 }, (_, index) => ({ entry: { ...tracking(), titleId: 'PPSA' + index + '_00', name: 'Game ' + index, image: '', platform: index % 2 ? 'PS4' : 'PS5' },
            matches: [], targetChosen: true, needsTarget: false, psnOnly: true, metadataProvider: 'psn', secretId: 'lorebase-psn-test' })) as PlayStationPreview[];
        const service = { preview: async () => rows, targets: () => [] } as unknown as PlayStationSyncService;
        const modal = new PlayStationImportModal(new App() as any, service, vi.fn(), vi.fn());
        modal.modalEl = document.body.createDiv(); modal.contentEl = modal.modalEl.createDiv(); modal.onOpen();
        await vi.waitFor(() => expect(modal.contentEl.querySelectorAll('.lorebase-trakt-item')).toHaveLength(20));
        button(modal.contentEl, pt('selectPage')).click();
        expect(button(modal.contentEl, pt('apply')).textContent).toContain('20');
        button(modal.contentEl, 'Next').click();
        expect(modal.contentEl.querySelectorAll('.lorebase-trakt-item')).toHaveLength(5);
        expect(modal.contentEl.querySelectorAll('.lorebase-trakt-item-select[aria-pressed=true]')).toHaveLength(0);
        button(modal.contentEl, pt('selectPage')).click();
        expect(button(modal.contentEl, pt('apply')).textContent).toContain('25');
        const search = modal.contentEl.querySelector<HTMLInputElement>('input[type=search]')!;
        search.value = 'Game 24'; search.dispatchEvent(new Event('input'));
        expect(modal.contentEl.querySelectorAll('.lorebase-trakt-item')).toHaveLength(1);
        expect(modal.contentEl.querySelector('.lorebase-trakt-item-select')?.getAttribute('aria-pressed')).toBe('true');
        expect(button(modal.contentEl, pt('apply')).textContent).toContain('25');
        modal.onClose();
    });
});
