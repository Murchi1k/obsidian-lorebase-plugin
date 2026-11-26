import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App, TFile, TFolder } from 'obsidian';
import { DEFAULT_SETTINGS } from '../src/constants';
import { IntegrationService } from '../src/services/IntegrationService';
import { MusicService } from '../src/services/MusicService';
import { decorateInboxContent, inboxRating, InboxImporter } from '../src/services/inbox/InboxImporter';
import { parseInboxNote } from '../src/services/inbox/parser';
import { i18n } from '../src/localization';

const candidate = () => parseInboxNote('Notes/List.md', '#LB\nGame 6/10 (waiting) ([link](https://example.com/private))')[0];
function fixture() {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.games.folderPath = 'Games';
    settings.integrations!.media.games.howLongToBeatEnabled = false;
    settings.integrations!.imageStorage.enabled = false;
    settings.integrations!.providers.rawg.enabled = true; settings.integrations!.providers.rawg.apiKey = 'key';
    const records = new Map<string, TFile | TFolder>([['Notes/List.md', new TFile('Notes/List.md', 'List')]]);
    const contents = new Map<string, string>();
    const metadata: Record<string, unknown> = {};
    const create = vi.fn(async (path: string, content: string) => {
        if (records.has(path)) throw new Error('File exists');
        const file = new TFile(path, path.split('/').at(-1)!.replace(/\.md$/, ''));
        records.set(path, file); contents.set(path, content); return file;
    });
    const app = { vault: {
        getMarkdownFiles: () => [...records.values()].filter(item => item instanceof TFile),
        getAbstractFileByPath: (path: string) => records.get(path) ?? null,
        create, createFolder: vi.fn(async (path: string) => { records.set(path, new TFolder(path)); }), modify: vi.fn(),
    }, metadataCache: { getFileCache: (file: TFile) => metadata[file.path] ?? null },
        workspace: { getLeaf: vi.fn() }, fileManager: { processFrontMatter: vi.fn() } } as unknown as App;
    const integration = new IntegrationService(app, () => settings);
    const fetchDetails = vi.fn(async () => ({ kind: 'game', name: 'Game', description: 'Plot', poster: '', genres: [], platforms: [], developers: [], publishers: [], rating: '', metacritic: '', released: '', year: '', url: '' }));
    (integration as any).fetchDetails = fetchDetails;
    const importer = new InboxImporter(app, () => settings, integration, {} as MusicService);
    return { app, importer, integration, fetchDetails, settings, create, contents, metadata, records };
}
beforeEach(() => i18n.setLanguage('en'));
describe('inbox note metadata', () => {
    it('converts a ten-point rating to the configured scale and retains original data', () => {
        expect(inboxRating(6, DEFAULT_SETTINGS.ratingScale)).toBe(3);
        expect(inboxRating(6, { ...DEFAULT_SETTINGS.ratingScale, mode: 'custom', max: 10, step: 0.1 })).toBe(6);
        expect(inboxRating(0, DEFAULT_SETTINGS.ratingScale)).toBeNull();
        const entry = candidate(); entry.isAdult = true;
        const template = '---\ntype: game\nname: "{{VALUE:name}}"\nmy_score: {{VALUE:userRating}}\n---';
        const result = decorateInboxContent('---\ntype: game\nname: Game\nmy_score: null\ncustom: keep\n---\n## My Notes\nTemplate prompt\n', template, entry, 'My annotation', DEFAULT_SETTINGS);
        expect(result).toContain('my_score: 3'); expect(result).not.toMatch(/^userRating:/m);
        expect(result).toContain('inbox_rating_10: 6'); expect(result).toContain('Sex18: true');
        expect(result).toContain('custom: keep'); expect(result).toContain('Template prompt');
        expect(result).toContain('My annotation'); expect(result).toContain('https://example.com/private');
        expect(result).toContain('[[Notes/List]]');
    });
    it('does not erase a catalogue adult flag when the source list has none', () => {
        const content = decorateInboxContent('---\ntype: game\nSex18: true\n---', '', candidate(), '', DEFAULT_SETTINGS);
        expect(content).toContain('Sex18: true');
    });
});
describe('inbox creation boundaries', () => {
    it('creates a real manual note using normal templates without fetching a provider', async () => {
        const f = fixture();
        const result = await f.importer.create(candidate(), null, 'waiting', new AbortController().signal);
        expect(result.created).toBe(true); expect(result.file.path).toBe('Games/Game.md');
        const content = f.contents.get(result.file.path)!;
        expect(content).toMatch(/userRating:\s*3/); expect(content).toContain('inbox_sources: ["Notes/List.md"]');
        expect(content).toContain('waiting'); expect(content).toContain('https://example.com/private');
        expect(f.fetchDetails).not.toHaveBeenCalled(); expect(f.app.vault.modify).not.toHaveBeenCalled();
        expect(f.app.workspace.getLeaf).not.toHaveBeenCalled();
        f.importer.dispose(); f.integration.dispose();
    });
    it('does not overwrite a title collision belonging to another catalogue ID', async () => {
        const f = fixture();
        f.records.set('Games/Game.md', new TFile('Games/Game.md', 'Game'));
        f.metadata['Games/Game.md'] = { frontmatter: { type: 'game', name: 'Game', integration_provider: 'rawg', integration_id: 'different' } };
        const result = await f.importer.create(candidate(), { kind: 'games', result: { provider: 'rawg', id: 'selected', title: 'Game' } }, '', new AbortController().signal);
        expect(result.created).toBe(true); expect(result.file.path).not.toBe('Games/Game.md');
        expect(f.app.vault.modify).not.toHaveBeenCalled();
        f.importer.dispose(); f.integration.dispose();
    });
    it('recognizes an existing provider identity without changing its personal fields', async () => {
        const f = fixture(); const file = new TFile('Games/Old.md', 'Old'); f.records.set(file.path, file);
        f.metadata[file.path] = { frontmatter: { type: 'game', name: 'Different translation', integration_provider: 'rawg', integration_id: 'selected', userRating: 5 } };
        const result = await f.importer.create(candidate(), { kind: 'games', result: { provider: 'rawg', id: 'selected', title: 'Game' } }, '', new AbortController().signal);
        expect(result).toEqual({ file, created: false }); expect(f.fetchDetails).not.toHaveBeenCalled();
        expect(f.create).not.toHaveBeenCalled(); expect(f.app.vault.modify).not.toHaveBeenCalled();
        f.importer.dispose(); f.integration.dispose();
    });
    it('recognizes a manually chosen title even if the existing game has a Steam ID', async () => {
        const f = fixture(); const file = new TFile('Games/Existing.md', 'Existing'); f.records.set(file.path, file);
        f.metadata[file.path] = { frontmatter: { type: 'game', name: 'Game', integration_provider: 'steam', integration_id: '123', steamAppId: '123' } };
        expect(await f.importer.create(candidate(), null, '', new AbortController().signal)).toEqual({ file, created: false });
        expect(f.create).not.toHaveBeenCalled(); expect(f.app.vault.modify).not.toHaveBeenCalled();
        f.importer.dispose(); f.integration.dispose();
    });
    it('does not create duplicates when different list rows select the same result', async () => {
        const f = fixture();
        const match = { kind: 'games' as const, result: { provider: 'rawg' as const, id: 'selected', title: 'Game' } };
        const first = f.importer.create(candidate(), match, '', new AbortController().signal);
        const second = f.importer.create({ ...candidate(), title: 'Different spelling' }, match, '', new AbortController().signal);
        expect((await first).created).toBe(true); expect((await second).created).toBe(false);
        expect(f.create).toHaveBeenCalledTimes(1);
        f.importer.dispose(); f.integration.dispose();
    });
    it('never mistakes a source note at the vault root for an imported game', async () => {
        const f = fixture(); f.settings.games.folderPath = '';
        const entry = candidate(); entry.title = 'List';
        const result = await f.importer.create(entry, null, '', new AbortController().signal);
        expect(result.file.path).toBe('List.md'); expect(result.created).toBe(true);
        f.importer.dispose(); f.integration.dispose();
    });
    it.each(['cancel', 'settings', 'unload'])('does not write a late provider result after %s', async reason => {
        const f = fixture(); let resolve!: (details: unknown) => void;
        f.fetchDetails.mockImplementationOnce(() => new Promise(done => { resolve = done; }) as any);
        const controller = new AbortController();
        const promise = f.importer.create(candidate(), { kind: 'games', result: { provider: 'rawg', id: 'selected', title: 'Game' } }, '', controller.signal);
        const check = expect(promise).rejects.toMatchObject({ name: 'AbortError' });
        await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
        if (reason === 'cancel') controller.abort();
        else if (reason === 'settings') f.settings.games.folderPath = 'Changed';
        else f.importer.dispose();
        resolve({ kind: 'game', name: 'Game', description: '', poster: '', genres: [], platforms: [], developers: [], publishers: [], rating: '', metacritic: '', released: '', year: '', url: '' });
        await check; expect(f.create).not.toHaveBeenCalled(); expect(f.app.vault.modify).not.toHaveBeenCalled();
        f.importer.dispose(); f.integration.dispose();
    });
});
