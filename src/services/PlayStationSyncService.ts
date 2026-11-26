import { App, TFile, TFolder, parseYaml, stringifyYaml } from 'obsidian';
import type { LorebaseSettings } from '../types';
import type { SearchResult } from './integrations/types';
import { MetadataService } from './MetadataService';
import { IntegrationService } from './IntegrationService';
import { getAllMarkdownFiles } from './media/serviceUtils';
import { ensureFolder } from './integrations/shared';
import { sanitizeFileName } from './integrations/templateUtils';
import { parseTemplateFieldAliases } from './media/templateFieldAliases';
import { PlayStationApi } from './playstation/api';
import { checkPsnAbort, normalizePlayStationTracking, object, text, type PlayStationEntry, type PlayStationTracking } from './playstation/types';
import { psnError } from '../localization/playstation';
import { withSyncSourceUrl } from '../utils/syncSource';

interface LocalGame { file: TFile; title: string; fm: Record<string, any>; }
export interface PlayStationPreview {
    entry: PlayStationEntry;
    path?: string;
    matches: string[];
    needsTarget: boolean;
    targetChosen: boolean;
    source?: SearchResult;
    psnOnly: boolean;
    metadataProvider: 'psn' | 'igdb' | 'rawg';
    originalTracking?: string;
    secretId: string;
}
export interface PlayStationSyncResult { created: number; updated: number; failed: number; partial: number; errors: string[]; failedIds: string[]; }
const key = (value: string): string => value.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
export class PlayStationSyncService {
    readonly api: PlayStationApi;
    private records: LocalGame[] = [];
    private running = false;
    constructor(private app: App, private settings: () => LorebaseSettings, private metadata: MetadataService,
        private integration: IntegrationService, private persist: () => Promise<void>, api?: PlayStationApi) {
        this.api = api ?? new PlayStationApi(app, () => this.settings().playstationSync, persist);
    }
    private async loadRecords(): Promise<void> {
        const folder = this.app.vault.getAbstractFileByPath(this.settings().games.folderPath);
        this.records = [];
        if (!(folder instanceof TFolder)) return;
        for (const file of getAllMarkdownFiles(folder)) {
            const content = await this.app.vault.cachedRead(file), match = content.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
            const fm = this.metadata.resolveFrontmatter('game', match ? object(parseYaml(match[1])) : object(this.app.metadataCache.getFileCache(file)?.frontmatter));
            if (fm.type && fm.type !== 'game') continue;
            this.records.push({ file, title: text(fm.name || fm.title) || file.basename, fm });
        }
    }
    targets(): Array<{ path: string; title: string }> { return this.records.map(record => ({ path: record.file.path, title: record.title })); }
    async preview(signal: AbortSignal): Promise<PlayStationPreview[]> {
        const config = this.settings().playstationSync, secretId = config.secretId;
        const entries = await this.api.entries(signal);
        checkPsnAbort(signal);
        if (this.settings().playstationSync !== config || config.secretId !== secretId) throw new Error('PSN_ACCOUNT_CHANGED');
        await this.loadRecords();
        return entries.map(entry => {
            const linked = this.records.filter(record => {
                const psn = normalizePlayStationTracking(record.fm.playstation);
                return psn?.accountId === entry.accountId && psn.titleId === entry.titleId;
            });
            const sameName = this.records.filter(record => key(record.title) === key(entry.name));
            const matches = linked.length ? linked : sameName;
            const row: PlayStationPreview = { entry, matches: matches.map(record => record.file.path), needsTarget: matches.length > 0 && linked.length !== 1,
                targetChosen: linked.length === 1 || matches.length === 0, metadataProvider: config.metadataProvider, psnOnly: config.metadataProvider === 'psn', secretId };
            if (linked.length === 1) this.bind(row, linked[0].file.path);
            return row;
        });
    }
    bind(row: PlayStationPreview, path?: string): void {
        const record = path ? this.records.find(record => record.file.path === path) : undefined;
        if (path && !record) throw new Error('PSN_NOTE_MISSING');
        const existing = normalizePlayStationTracking(record?.fm.playstation);
        if (existing && (existing.accountId !== row.entry.accountId || existing.titleId !== row.entry.titleId)) throw new Error('PSN_NOTE_LINKED');
        row.path = path; row.targetChosen = true; row.originalTracking = record ? JSON.stringify(record.fm.playstation) : undefined;
    }
    candidates(row: PlayStationPreview, signal: AbortSignal, query = row.entry.name): Promise<SearchResult[]> {
        if (row.metadataProvider === 'psn') return Promise.resolve([]);
        return this.integration.findPlayStationMetadata(query, row.metadataProvider, signal);
    }
    private patch(previous: PlayStationTracking | undefined, remote: PlayStationEntry): PlayStationTracking {
        const config = this.settings().playstationSync;
        const result: PlayStationTracking = { ...previous, accountId: remote.accountId, titleId: remote.titleId, platform: remote.platform };
        for (const field of ['conceptId', 'played', 'owned', 'lastPlayedAt', 'updatedAt'] as const) if (remote[field] !== undefined) Object.assign(result, { [field]: remote[field] });
        if (config.importPlaytime && remote.playtimeMinutes !== undefined) result.playtimeMinutes = remote.playtimeMinutes;
        if (config.importTrophies && remote.trophySets !== undefined) result.trophySets = remote.trophySets;
        return result;
    }
    async refresh(tracking: PlayStationTracking, signal: AbortSignal): Promise<{ tracking: PlayStationTracking; partial: boolean }> {
        const config = this.settings().playstationSync, secretId = config.secretId;
        const remote = await this.api.tracking(tracking, signal);
        checkPsnAbort(signal);
        if (this.settings().playstationSync !== config || config.secretId !== secretId || remote.accountId !== config.accountId) throw new Error('PSN_ACCOUNT_CHANGED');
        return { tracking: this.patch(tracking, remote), partial: Boolean(remote.partial) };
    }
    async apply(selected: PlayStationPreview[], signal: AbortSignal, progress?: (done: number, total: number, title: string) => void): Promise<PlayStationSyncResult> {
        if (this.running) throw new Error('PSN_BUSY'); this.running = true;
        const result: PlayStationSyncResult = { created: 0, updated: 0, failed: 0, partial: 0, errors: [], failedIds: [] };
        const config = this.settings().playstationSync, secretId = config.secretId;
        try {
            await this.loadRecords();
            const seen = new Set<string>();
            for (const [index, row] of selected.entries()) {
                checkPsnAbort(signal); progress?.(index, selected.length, row.entry.name);
                try {
                    if (this.settings().playstationSync !== config || config.secretId !== secretId || row.secretId !== secretId || row.entry.accountId !== config.accountId) throw new Error('PSN_ACCOUNT_CHANGED');
                    if (!row.targetChosen || row.metadataProvider !== config.metadataProvider) throw new Error('PSN_CHOOSE_MATCH');
                    if (seen.has(row.entry.titleId)) continue;
                    seen.add(row.entry.titleId);
                    const record = row.path ? this.records.find(record => record.file.path === row.path) : undefined;
                    if (row.path && !record) throw new Error('PSN_NOTE_MISSING');
                    if (record && JSON.stringify(record.fm.playstation) !== row.originalTracking) throw new Error('PSN_LOCAL_CHANGED');
                    if (!record && this.records.some(record => {
                        const psn = normalizePlayStationTracking(record.fm.playstation);
                        return psn?.accountId === row.entry.accountId && psn.titleId === row.entry.titleId;
                    })) throw new Error('PSN_LOCAL_CHANGED');
                    if (!record && !row.psnOnly && !row.source) throw new Error('PSN_CHOOSE_MATCH');
                    if (row.source && row.source.provider !== row.metadataProvider) throw new Error('PSN_CHOOSE_MATCH');
                    const fresh = await this.api.tracking({ ...normalizePlayStationTracking(record?.fm.playstation), ...row.entry }, signal);
                    const tracking = this.patch(normalizePlayStationTracking(record?.fm.playstation), fresh);
                    const prepared = !record || row.source ? await this.integration.preparePlayStationImport(row.entry, row.source, signal) : undefined;
                    checkPsnAbort(signal);
                    if (this.settings().playstationSync !== config || config.secretId !== secretId) throw new Error('PSN_ACCOUNT_CHANGED');
                    if (record) {
                        const updates: Record<string, unknown> = { playstation: tracking };
                        for (const [field, value] of Object.entries(prepared?.metadata ?? {})) {
                            if (['name', 'title', 'integration_provider', 'integration_id'].includes(field)) continue;
                            if ((record.fm[field] == null || record.fm[field] === '' || Array.isArray(record.fm[field]) && !record.fm[field].length) && value !== '' && value != null) updates[field] = value;
                        }
                        if (!record.fm.integration_provider && row.source) { updates.integration_provider = row.source.provider; updates.integration_id = row.source.id; }
                        let applied = false;
                        await this.metadata.updateMetadata(record.file, updates, 'game', current => {
                            checkPsnAbort(signal);
                            const fm = this.metadata.resolveFrontmatter('game', current);
                            applied = this.settings().playstationSync === config && config.secretId === secretId && config.accountId === row.entry.accountId
                                && JSON.stringify(fm.playstation) === row.originalTracking;
                            return applied;
                        });
                        if (!applied) throw new Error('PSN_LOCAL_CHANGED');
                        Object.assign(record.fm, updates); result.updated++;
                    } else {
                        const folder = this.settings().games.folderPath.trim();
                        if (!folder) throw new Error('PSN_FOLDER_MISSING');
                        await ensureFolder(this.app, folder); checkPsnAbort(signal);
                        if (this.settings().playstationSync !== config || config.secretId !== secretId) throw new Error('PSN_ACCOUNT_CHANGED');
                        const match = prepared!.content.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
                        if (!match) throw new Error('PSN_TEMPLATE');
                        const fm = object(parseYaml(match[1]));
                        const aliases = parseTemplateFieldAliases('game', this.metadata.getNoteTemplate('game'));
                        fm.playstation = tracking;
                        const sourceFields = withSyncSourceUrl('game', { ...prepared!.metadata, playstation: tracking }, {});
                        const fieldAliases = this.metadata.getFrontmatterFieldAliases('game');
                        for (const [key, value] of Object.entries(sourceFields)) fm[fieldAliases[key] ?? key] = value;
                        if (row.entry.played) fm[aliases.status ?? 'status'] = 'playing';
                        const content = '---\n' + stringifyYaml(fm).trimEnd() + '\n---\n' + prepared!.content.slice(match[0].length);
                        const base = folder.replace(/\\/g, '/').replace(/\/$/, '') + '/' + (sanitizeFileName(prepared!.title).slice(0, 160) || 'PlayStation');
                        let path = base + '.md', suffix = 2;
                        while (this.app.vault.getAbstractFileByPath(path)) path = base + ' (' + suffix++ + ').md';
                        const file = await this.app.vault.create(path, content);
                        this.records.push({ file, title: prepared!.title, fm: { ...prepared!.metadata, playstation: tracking } }); result.created++;
                    }
                    if (fresh.partial) result.partial++;
                } catch (error) {
                    checkPsnAbort(signal); result.failed++; result.failedIds.push(row.entry.titleId);
                    result.errors.push(row.entry.name + ': ' + psnError(error));
                }
                progress?.(index + 1, selected.length, row.entry.name);
            }
            checkPsnAbort(signal); await this.persist(); return result;
        } finally { this.running = false; }
    }
    async syncLinked(signal: AbortSignal): Promise<PlayStationSyncResult> {
        if (this.running) throw new Error('PSN_BUSY'); this.running = true;
        const result: PlayStationSyncResult = { created: 0, updated: 0, failed: 0, partial: 0, errors: [], failedIds: [] };
        try {
            const secretId = this.settings().playstationSync.secretId;
            await this.loadRecords();
            for (const record of this.records) {
                checkPsnAbort(signal);
                const previous = normalizePlayStationTracking(record.fm.playstation);
                if (!previous || previous.accountId !== this.settings().playstationSync.accountId) continue;
                try {
                    const updated = await this.refresh(previous, signal);
                    let applied = false;
                    await this.metadata.updateMetadata(record.file, { playstation: updated.tracking }, 'game', current => {
                        checkPsnAbort(signal);
                        applied = this.settings().playstationSync.secretId === secretId && this.settings().playstationSync.accountId === previous.accountId
                            && JSON.stringify(current.playstation) === JSON.stringify(record.fm.playstation); return applied;
                    });
                    if (!applied) throw new Error('PSN_LOCAL_CHANGED');
                    result.updated++; if (updated.partial) result.partial++;
                } catch (error) { checkPsnAbort(signal); result.failed++; result.failedIds.push(previous.titleId); result.errors.push(record.title + ': ' + psnError(error)); }
            }
            return result;
        } finally { this.running = false; }
    }
}
