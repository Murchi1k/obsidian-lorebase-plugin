import { App, TFile, TFolder, parseYaml } from 'obsidian';
import type { LorebaseSettings } from '../types';
import { MetadataService } from './MetadataService';
import { IntegrationService } from './IntegrationService';
import { getAllMarkdownFiles } from './media/serviceUtils';
import { sanitizeFileName } from './integrations/templateUtils';
import { ensureFolder } from './integrations/shared';
import { TraktApi, checkTraktAbort, object, text, waitTraktWork, type TraktDeviceCode } from './trakt/api';
import { equalTraktState, localTraktState, mergeTraktState, traktProgressUpdates } from './trakt/state';
import type { TraktEntry, TraktPreparedVideo, TraktPreview, TraktState, TraktSyncSettings } from './trakt/types';

type Data = Record<string, unknown>;
interface RecordItem { file: TFile; kind: 'movie' | 'series'; fm: Data; }
export interface TraktSelection { row: TraktPreview; resolution?: 'local' | 'remote'; }
export interface TraktSyncResult { created: number; updated: number; pushed: number; failed: number; skipped: number; errors: string[]; }
export class TraktSyncService {
    readonly api: TraktApi;
    private records: RecordItem[] = [];
    private prepared = new Map<string, Promise<TraktPreparedVideo>>();
    private sessions = new WeakMap<TraktPreview, { config: TraktSyncSettings; identity: unknown }>();
    private running = false;
    constructor(private app: App, private settings: () => LorebaseSettings, private metadata: MetadataService, private integration: IntegrationService,
        private persist: () => Promise<void>, api?: TraktApi) { this.api = api ?? new TraktApi(() => this.settings().traktSync, undefined, persist); }
    private accountIdentity(): unknown {
        const config = this.settings().traktSync;
        return this.api.getSessionIdentity?.() ?? JSON.stringify([config.username, config.clientId, config.accessToken, config.refreshToken]);
    }
    beginLogin(signal: AbortSignal): Promise<TraktDeviceCode> { return this.api.beginLogin(signal); }
    targets(kind: 'movie' | 'series'): Array<{ path: string; title: string }> { return this.records.filter(item => item.kind === kind).map(item => ({ path: item.file.path, title: `${text(item.fm.title) || item.file.basename} · ${item.file.path}` })); }
    private async loadRecords(): Promise<void> {
        const records: RecordItem[] = [];
        for (const kind of ['movie', 'series'] as const) {
            const folder = this.app.vault.getAbstractFileByPath(this.settings()[kind === 'movie' ? 'movies' : 'series'].folderPath);
            if (!(folder instanceof TFolder)) continue;
            for (const file of getAllMarkdownFiles(folder)) {
                const content = await this.app.vault.cachedRead(file), match = content.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
                const raw = match ? object(parseYaml(match[1])) : object(this.app.metadataCache.getFileCache(file)?.frontmatter);
                const fm = this.metadata.resolveFrontmatter(kind, raw);
                if (fm.type && fm.type !== kind) continue;
                records.push({ file, kind, fm });
            }
        }
        this.records = records;
    }
    private linked(fm: Data, entry: TraktEntry): boolean {
        if (text(fm.trakt_id) === entry.id) return true;
        return Object.values(object(fm.external_sync)).map(object).some(ref => ref.service === 'trakt' && (text(object(ref.ids).trakt) === entry.id || text(ref.id) === `${entry.kind}:${entry.id}`));
    }
    private matches(entry: TraktEntry): string[] {
        const eligible = this.records.filter(record => record.kind === entry.kind);
        const linked = eligible.filter(record => this.linked(record.fm, entry)); if (linked.length) return linked.map(record => record.file.path);
        const ids = eligible.filter(({ fm }) => entry.ids[fm.integration_provider === 'omdb' ? 'imdb' : text(fm.integration_provider)] && entry.ids[fm.integration_provider === 'omdb' ? 'imdb' : text(fm.integration_provider)] === text(fm.integration_id)
            || ['tmdb', 'tvmaze', 'imdb'].some(key => entry.ids[key] && text(fm[`${key}_id`]) === entry.ids[key]));
        if (ids.length) return ids.map(record => record.file.path);
        const normalize = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
        return eligible.filter(({ fm, file }) => (!fm.trakt_id || text(fm.trakt_id) === entry.id) && (!entry.year || !fm.year || Number(fm.year) === entry.year) && normalize(text(fm.title) || file.basename) === normalize(entry.title)).map(record => record.file.path);
    }
    async preview(signal: AbortSignal): Promise<TraktPreview[]> {
        const session = this.settings().traktSync, identity = this.accountIdentity();
        const entries = await this.api.entries(signal); checkTraktAbort(signal);
        if (session !== this.settings().traktSync || identity !== this.accountIdentity()) throw new Error('TRAKT_ACCOUNT_CHANGED');
        await this.loadRecords(); this.prepared.clear();
        checkTraktAbort(signal);
        if (session !== this.settings().traktSync || identity !== this.accountIdentity()) throw new Error('TRAKT_ACCOUNT_CHANGED');
        return entries.map(entry => {
            const matches = this.matches(entry), local: TraktState = { rating: null, watched: false, watchlist: false, favorite: false, episodes: [] };
            const row: TraktPreview = { entry, matches, local, merged: entry.state, conflicts: [] };
            this.sessions.set(row, { config: session, identity }); if (matches.length === 1) this.bind(row, matches[0]); return row;
        });
    }
    bind(row: TraktPreview, path?: string): void {
        row.path = path;
        if (!path) { row.matches = []; row.local = { rating: null, watched: false, watchlist: false, favorite: false, episodes: [] }; row.merged = row.entry.state; row.conflicts = []; return; }
        const record = this.records.find(record => record.file.path === path && record.kind === row.entry.kind);
        if (!record) throw new Error('TRAKT_NOTE_MISSING');
        row.local = localTraktState(record.fm, row.entry, this.settings());
        const snapshot = this.settings().traktSync.lastSynced[row.entry.key];
        const merged = mergeTraktState(row.local, row.entry.state, snapshot?.path === path ? snapshot : undefined);
        row.merged = merged.state; row.conflicts = merged.conflicts;
        row.image = this.metadata.getImageUrl(record.fm.poster) || undefined;
    }
    private prepare(entry: TraktEntry, signal: AbortSignal): Promise<TraktPreparedVideo> {
        const config = this.settings().traktSync, provider = entry.kind === 'series' ? config.seriesProvider : config.movieProvider;
        const key = `${provider}:${entry.key}`;
        let pending = this.prepared.get(key);
        if (!pending) {
            pending = waitTraktWork((async () => {
                const kind = entry.kind === 'series' ? 'series' : 'movies';
                const source = await this.integration.resolveVideoImportSource(kind, provider, entry, signal); checkTraktAbort(signal);
                return this.integration.prepareVideoImport(kind, source, signal);
            })(), signal);
            this.prepared.set(key, pending); const request = pending; void pending.catch(() => { if (this.prepared.get(key) === request) this.prepared.delete(key); });
        }
        return pending;
    }
    async previewImage(row: TraktPreview, signal: AbortSignal): Promise<string | undefined> {
        if (row.image) return row.image;
        const prepared = await this.prepare(row.entry, signal); checkTraktAbort(signal);
        return this.metadata.getImageUrl(prepared.metadata.poster) || prepared.details.poster || undefined;
    }
    async apply(selections: TraktSelection[], signal: AbortSignal, onProgress?: (done: number, total: number, title?: string) => void): Promise<TraktSyncResult> {
        if (this.running) throw new Error('TRAKT_BUSY'); this.running = true;
        const result: TraktSyncResult = { created: 0, updated: 0, pushed: 0, failed: 0, skipped: 0, errors: [] };
        try {
            const config = this.settings().traktSync, identity = this.accountIdentity();
            const current = (): void => {
                checkTraktAbort(signal);
                if (this.settings().traktSync !== config || this.accountIdentity() !== identity || !config.accessToken) throw new Error('TRAKT_ACCOUNT_CHANGED');
            };
            if (selections.some(({ row }) => this.sessions.get(row)?.config !== config || this.sessions.get(row)?.identity !== identity) || !config.accessToken) throw new Error('TRAKT_ACCOUNT_CHANGED');
            const latest = new Map((await this.api.entries(signal)).map(entry => [entry.key, entry])); await this.loadRecords();
            for (const [index, { row, resolution }] of selections.entries()) {
                checkTraktAbort(signal);
                onProgress?.(index, selections.length, row.entry.title);
                try {
                    current();
                    if (row.matches.length > 1 && !row.path) throw new Error('TRAKT_CHOOSE_NOTE');
                    if (row.conflicts.length && !resolution) throw new Error('TRAKT_RESOLVE_CONFLICT');
                    const remote = latest.get(row.entry.key); if (!remote || !equalTraktState(remote.state, row.entry.state)) throw new Error('TRAKT_REMOTE_CHANGED');
                    let record = this.records.find(record => record.file.path === row.path && record.kind === row.entry.kind);
                    if (row.path && !record) throw new Error('TRAKT_NOTE_MISSING');
                    if (record && !equalTraktState(localTraktState(record.fm, row.entry, this.settings()), row.local)) throw new Error('TRAKT_LOCAL_CHANGED');
                    const state: TraktState = { ...row.merged, episodes: [...row.merged.episodes] };
                    for (const field of row.conflicts) Object.assign(state, { [field]: resolution === 'remote' ? row.entry.state[field] : row.local[field] });
                    // Resolve metadata and every season before creating a file or sending personal changes.
                    const needsMetadata = !record || !record.fm.integration_provider || !record.fm.poster || !record.fm.plot
                        || row.entry.kind === 'series' && (!Array.isArray(record.fm.series_parts) || !record.fm.series_parts.length);
                    const [prepared, seasons] = await Promise.all([
                        needsMetadata ? this.prepare(row.entry, signal) : Promise.resolve(undefined),
                        row.entry.kind === 'series' ? this.api.seasons(row.entry.id, signal) : Promise.resolve([]),
                    ]);
                    current();
                    const existing = Boolean(record);
                    const original = record?.fm ?? prepared!.metadata;
                    const updates: Data = {};
                    for (const [field, value] of Object.entries(prepared?.metadata ?? {})) if (!['series_parts', 'movie_parts', 'title', 'integration_provider', 'integration_id'].includes(field) && empty(original[field]) && !empty(value)) updates[field] = value;
                    if (!original.integration_provider && prepared) { updates.integration_provider = prepared.source.provider; updates.integration_id = prepared.source.id; }
                    const base = { ...prepared?.metadata, ...original, ...updates };
                    if ((!Array.isArray(base.series_parts) || !base.series_parts.length) && prepared) base.series_parts = prepared.metadata.series_parts;
                    Object.assign(updates, traktProgressUpdates(base, row.entry, state, seasons, this.settings()));
                    updates.trakt_id = row.entry.id;
                    if (row.entry.ids.slug) updates.trakt_slug = row.entry.ids.slug;
                    const legacy = { ...object(original.external_sync) };
                    for (const [key, ref] of Object.entries(legacy)) if (object(ref).service === 'trakt') delete legacy[key];
                    if (original.external_sync) updates.external_sync = Object.keys(legacy).length ? legacy : null;
                    if (config.twoWay && record) {
                        const outgoing = { ...state, rating: state.rating === null ? null : Math.max(1, Math.min(10, Math.round(state.rating))) };
                        if (!equalTraktState(outgoing, remote.state)) { await this.api.push(remote, outgoing, signal); Object.assign(remote.state, outgoing); result.pushed++; }
                    }
                    current();
                    if (!record) {
                        const folder = this.settings()[row.entry.kind === 'series' ? 'series' : 'movies'].folderPath;
                        if (!folder.trim()) throw new Error('TRAKT_FOLDER_MISSING');
                        await ensureFolder(this.app, folder);
                        current();
                        const name = sanitizeFileName(prepared!.title).slice(0, 180) || 'Untitled';
                        const prefix = `${folder.replace(/\\/g, '/').replace(/\/$/, '')}/${name}`;
                        let path = `${prefix}.md`, suffix = 2; while (this.app.vault.getAbstractFileByPath(path)) path = `${prefix} (${suffix++}).md`;
                        const file = await this.app.vault.create(path, prepared!.content); record = { file, kind: row.entry.kind, fm: prepared!.metadata }; this.records.push(record);
                    }
                    const target = record;
                    const apply = (raw: Record<string, unknown>): boolean => {
                        current();
                        const fm = this.metadata.resolveFrontmatter(row.entry.kind, raw);
                        if (existing && !equalTraktState(localTraktState(fm, row.entry, this.settings()), row.local)) throw new Error('TRAKT_LOCAL_CHANGED');
                        if (existing && Object.keys(updates).some(field => JSON.stringify(fm[field]) !== JSON.stringify(target.fm[field]))) throw new Error('TRAKT_LOCAL_CHANGED');
                        return true;
                    };
                    const projected = localTraktState({ ...base, ...updates }, row.entry, this.settings());
                    await this.metadata.updateMetadata(target.file, updates, row.entry.kind, apply);
                    current();
                    Object.assign(target.fm, updates);
                    config.lastSynced[row.entry.key] = { path: target.file.path, local: projected, remote: structuredState(remote.state) };
                    if (existing) result.updated++; else result.created++;
                } catch (error) { checkTraktAbort(signal); result.failed++; result.errors.push(`${row.entry.title}: ${error instanceof Error ? error.message : 'TRAKT_FAILED'}`); }
                current(); await this.persist(); onProgress?.(index + 1, selections.length);
            }
            return result;
        } finally { this.running = false; }
    }
    async syncLinked(signal: AbortSignal): Promise<TraktSyncResult> {
        const rows = await this.preview(signal), snapshots = this.settings().traktSync.lastSynced;
        const linked = rows.filter(row => row.path && snapshots[row.entry.key]?.path === row.path), selected = linked.filter(row => !row.conflicts.length);
        const result = selected.length ? await this.apply(selected.map(row => ({ row })), signal) : { created: 0, updated: 0, pushed: 0, failed: 0, skipped: 0, errors: [] };
        result.skipped = linked.length - selected.length; return result;
    }
}
function empty(value: unknown): boolean { return value === null || value === undefined || value === '' || Array.isArray(value) && !value.length; }
function structuredState(state: TraktState): TraktState { return { ...state, episodes: [...state.episodes] }; }
