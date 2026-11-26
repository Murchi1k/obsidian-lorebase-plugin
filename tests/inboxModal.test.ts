// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { App, TFile } from 'obsidian';
import { InboxPanel } from '../src/modals/InboxModal';
import { InboxService } from '../src/services/InboxService';
import { InboxImporter } from '../src/services/inbox/InboxImporter';
import { parseInboxNote } from '../src/services/inbox/parser';
import { DEFAULT_SETTINGS } from '../src/constants';
import { inboxText as text } from '../src/localization/inbox';
import { i18n } from '../src/localization';
import { installStatisticsDom } from './helpers/statisticsDom';

beforeAll(() => { installStatisticsDom(); i18n.setLanguage('en'); });
afterEach(() => document.body.replaceChildren());

async function fixture(list = 'Game 6/10 (waiting)') {
    const entries = parseInboxNote('List.md', '#LB\n' + list);
    const service = { scan: vi.fn(async () => ({ pending: entries, handled: [], unreadable: [] })),
        validate: vi.fn(async () => true), record: vi.fn(async () => {}), restore: vi.fn(async () => {}) };
    const importer = { signal: new AbortController().signal, select: vi.fn(async () => ({ kind: 'games', result: { provider: 'rawg', id: '1', title: 'Game' } })),
        findExisting: vi.fn(async (): Promise<TFile | null> => null), create: vi.fn(async () => ({ file: new TFile('Games/Game.md', 'Game'), created: true })) };
    const app = { workspace: { openLinkText: vi.fn() } } as unknown as App;
    const controller = new AbortController();
    const root = document.body.createDiv();
    const refresh = vi.fn();
    const panel = new InboxPanel(app, root, service as unknown as InboxService, importer as unknown as InboxImporter,
        () => DEFAULT_SETTINGS, 'games', controller.signal, refresh);
    await vi.waitFor(() => expect(root.querySelectorAll('.lorebase-inbox-entry')).toHaveLength(entries.length));
    const button = (label: string, scope: ParentNode = root) => Array.from(scope.querySelectorAll<HTMLButtonElement>('button')).find(b => b.getAttribute('aria-label') === label)!;
    const rows = () => [...root.querySelectorAll<HTMLElement>('.lorebase-inbox-entry')];
    const add = () => root.querySelector<HTMLButtonElement>('.lorebase-inbox-footer .mod-cta')!;
    return { entries, service, importer, app, controller, root, panel, button, rows, add, refresh };
}

describe('inbox review and creation', () => {
    it('prepares a manual note without writes and creates it only after Add', async () => {
        const f = await fixture();
        expect(f.root.querySelector<HTMLInputElement>('.lorebase-inbox-select')!.disabled).toBe(false);
        expect(f.root.querySelector('.lorebase-inbox-details')).toBeNull();
        expect(f.importer.select).not.toHaveBeenCalled(); expect(f.importer.create).not.toHaveBeenCalled();
        f.button(text('manual')).click();
        expect(f.importer.create).not.toHaveBeenCalled(); expect(f.service.record).not.toHaveBeenCalled();
        expect(f.root.textContent).toContain(text('manualReady'));
        f.button(text('addOne')).click();
        await vi.waitFor(() => expect(f.service.record).toHaveBeenCalledWith(f.entries[0], 'added', 'Games/Game.md'));
        expect(f.importer.create).toHaveBeenCalledWith(f.entries[0], null, 'waiting', expect.any(AbortSignal), 'album');
        expect(f.refresh).toHaveBeenCalledOnce(); expect(f.rows()).toHaveLength(0);
        f.panel.dispose();
    });
    it('keeps a picked catalogue result as a draft until Add is pressed', async () => {
        const f = await fixture(); f.button(text('findShort')).click();
        await vi.waitFor(() => expect(f.button(text('addOne'))).toBeDefined());
        expect(f.importer.create).not.toHaveBeenCalled(); expect(f.service.record).not.toHaveBeenCalled();
        expect(f.root.querySelector('.lorebase-inbox-match')?.textContent).toContain('rawg');
        f.button(text('addOne')).click();
        await vi.waitFor(() => expect(f.service.record).toHaveBeenCalledOnce());
        expect(f.importer.select).toHaveBeenCalledWith(f.entries[0], expect.any(AbortSignal), 'album');
        expect(f.importer.create).toHaveBeenCalledWith(f.entries[0], await f.importer.select.mock.results[0].value, 'waiting', expect.any(AbortSignal), 'album');
        expect(f.rows()).toHaveLength(0); f.panel.dispose();
    });
    it('marks an existing note handled only after Add and does not overwrite it', async () => {
        const f = await fixture(); const file = new TFile('Games/Existing.md', 'Existing');
        f.importer.findExisting.mockResolvedValue(file); f.button(text('findShort')).click();
        await vi.waitFor(() => expect(f.button(text('addOne'))).toBeDefined());
        expect(f.service.record).not.toHaveBeenCalled(); f.button(text('addOne')).click();
        await vi.waitFor(() => expect(f.service.record).toHaveBeenCalledWith(f.entries[0], 'added', file.path));
        expect(f.importer.create).not.toHaveBeenCalled(); f.panel.dispose();
    });
    it('keeps a failed write in the inbox and retries without marking it handled', async () => {
        const f = await fixture(); f.importer.create.mockRejectedValueOnce(new Error('Disk full'));
        f.button(text('manual')).click();
        f.button(text('addOne')).click();
        await vi.waitFor(() => expect(f.root.querySelector('[role="alert"]')).not.toBeNull());
        expect(f.service.record).not.toHaveBeenCalled(); expect(f.rows()).toHaveLength(1);
        f.button(text('retry')).click(); await vi.waitFor(() => expect(f.service.record).toHaveBeenCalledOnce());
        expect(f.importer.create).toHaveBeenCalledTimes(2); f.panel.dispose();
    });
    it('retries a failed receipt save without writing the created card again', async () => {
        const f = await fixture(); f.service.record.mockRejectedValueOnce(new Error('Save failed'));
        f.button(text('manual')).click();
        f.button(text('addOne')).click();
        await vi.waitFor(() => expect(f.root.querySelector('[role="alert"]')).not.toBeNull());
        expect(f.refresh).toHaveBeenCalledOnce();
        f.button(text('retry')).click(); await vi.waitFor(() => expect(f.service.record).toHaveBeenCalledTimes(2));
        expect(f.importer.create).toHaveBeenCalledOnce(); expect(f.rows()).toHaveLength(0); f.panel.dispose();
    });
    it('requires a refresh if the source note has changed', async () => {
        const f = await fixture(); f.service.validate.mockResolvedValue(false);
        f.button(text('manual')).click();
        expect(f.service.validate).not.toHaveBeenCalled(); f.button(text('addOne')).click();
        await vi.waitFor(() => expect(f.root.textContent).toContain(text('stale')));
        expect(f.importer.create).not.toHaveBeenCalled(); expect(f.service.record).not.toHaveBeenCalled(); f.panel.dispose();
    });
    it('records a completed write after closing and does not start the next card', async () => {
        const f = await fixture('Game A\nGame B');
        f.root.querySelector<HTMLInputElement>('[aria-label="' + text('selectAll') + '"]')!.click();
        f.button(`${text('manual')} (2)`).click();
        let finish!: (value: { file: TFile; created: boolean }) => void;
        f.importer.create.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        f.add().click(); await vi.waitFor(() => expect(f.importer.create).toHaveBeenCalledOnce());
        f.controller.abort(); finish({ file: new TFile('Games/A.md', 'A'), created: true });
        await vi.waitFor(() => expect(f.service.record).toHaveBeenCalledWith(f.entries[0], 'added', 'Games/A.md'));
        expect(f.importer.create).toHaveBeenCalledOnce(); expect(f.refresh).toHaveBeenCalledOnce();
    });
    it('retains an invalid rating across rerenders and prevents addition', async () => {
        const f = await fixture();
        f.button(text('details')).click();
        const rating = f.root.querySelector<HTMLInputElement>('input[type="number"]')!;
        rating.value = '12'; rating.dispatchEvent(new Event('input'));
        f.button(text('manual')).click();
        f.button(text('addOne')).click();
        await vi.waitFor(() => expect(f.root.textContent).toContain(text('ratingInvalid')));
        expect(f.root.querySelector<HTMLInputElement>('input[type="number"]')!.value).toBe('12');
        expect(f.importer.create).not.toHaveBeenCalled(); f.panel.dispose();
    });
    it('uses an edited title without a blur confirmation and still waits for Add', async () => {
        const f = await fixture(); const input = f.root.querySelector<HTMLInputElement>('.lorebase-inbox-title-input')!;
        input.value = 'Other game'; input.dispatchEvent(new Event('input'));
        f.button(text('findShort')).click();
        await vi.waitFor(() => expect(f.button(text('addOne'))).toBeDefined());
        expect(f.importer.create).not.toHaveBeenCalled(); f.button(text('addOne')).click();
        await vi.waitFor(() => expect(f.service.record).toHaveBeenCalledOnce());
        expect(f.importer.select.mock.calls[0][0].title).toBe('Other game'); f.panel.dispose();
    });
    it('cancels the whole batch when its catalogue picker is closed', async () => {
        const f = await fixture('Game A\nGame B'); f.importer.select.mockResolvedValueOnce(null as any);
        f.root.querySelector<HTMLInputElement>('[aria-label="' + text('selectAll') + '"]')!.click(); f.button(`${text('findShort')} (2)`).click();
        await vi.waitFor(() => expect(f.button(`${text('findShort')} (2)`).disabled).toBe(false));
        expect(f.add().disabled).toBe(true);
        expect(f.importer.select).toHaveBeenCalledOnce(); expect(f.importer.create).not.toHaveBeenCalled();
        expect(f.service.record).not.toHaveBeenCalled(); expect(f.rows()).toHaveLength(2); f.panel.dispose();
    });
    it('prepares catalogue matches in a batch without writing until the separate Add', async () => {
        const f = await fixture('Game A\nGame B');
        f.root.querySelector<HTMLInputElement>('[aria-label="' + text('selectAll') + '"]')!.click(); f.button(`${text('findShort')} (2)`).click();
        await vi.waitFor(() => expect(f.add().disabled).toBe(false));
        await vi.waitFor(() => expect(f.importer.select).toHaveBeenCalledTimes(2));
        expect(f.service.record).not.toHaveBeenCalled(); expect(f.importer.create).not.toHaveBeenCalled();
        f.add().click();
        await vi.waitFor(() => expect(f.service.record).toHaveBeenCalledTimes(2));
        expect(f.importer.select).toHaveBeenCalledTimes(2); expect(f.importer.create).toHaveBeenCalledTimes(2);
        expect(f.rows()).toHaveLength(0); f.panel.dispose();
    });
    it('invalidates a prepared match when its title is edited', async () => {
        const f = await fixture(); f.button(text('findShort')).click();
        await vi.waitFor(() => expect(f.button(text('addOne'))).toBeDefined());
        const input = f.root.querySelector<HTMLInputElement>('.lorebase-inbox-title-input')!;
        input.value = 'New title'; input.dispatchEvent(new Event('input'));
        expect(f.button(text('addOne'))).toBeUndefined(); expect(f.add().disabled).toBe(true);
        expect(f.root.querySelector('.lorebase-inbox-match')).toBeNull();
        expect(f.importer.create).not.toHaveBeenCalled(); f.panel.dispose();
    });
    it('adds only prepared selected entries and never launches a search during Add', async () => {
        const f = await fixture('Game A\nGame B');
        f.button(text('manual'), f.rows()[0]).click();
        f.root.querySelector<HTMLInputElement>('[aria-label="' + text('selectAll') + '"]')!.click(); f.add().click();
        await vi.waitFor(() => expect(f.service.record).toHaveBeenCalledOnce());
        expect(f.importer.select).not.toHaveBeenCalled(); expect(f.importer.create).toHaveBeenCalledOnce();
        expect(f.rows()).toHaveLength(1); expect(f.rows()[0].textContent).toContain('List:3'); f.panel.dispose();
    });
});
