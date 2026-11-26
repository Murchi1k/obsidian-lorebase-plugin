import type { App } from 'obsidian';
import type { LorebaseSettings } from '../types';
import type { TemplateKind } from './integrations/types';
import { mergeInboxCandidates, parseInboxNote, type InboxCandidate, type InboxOrigin } from './inbox/parser';

export interface InboxReceipt { state: 'added' | 'dismissed'; at: number; target?: string }
export interface InboxState { receipts: Record<string, InboxReceipt> }
export interface InboxScan { pending: InboxCandidate[]; handled: InboxCandidate[]; unreadable: string[] }
export function normalizeInboxState(value: unknown): InboxState {
    const receipts: Record<string, InboxReceipt> = Object.create(null) as Record<string, InboxReceipt>;
    const raw = value && typeof value === 'object' && !Array.isArray(value) ? (value as Partial<InboxState>).receipts : undefined;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) for (const [id, item] of Object.entries(raw)) {
        if (!item || typeof item !== 'object' || (item.state !== 'added' && item.state !== 'dismissed')) continue;
        receipts[id] = { state: item.state, at: Number.isFinite(item.at) ? item.at : 0, ...(typeof item.target === 'string' ? { target: item.target } : {}) };
    }
    return { receipts };
}
export function checkInboxAbort(signal?: AbortSignal): void {
    if (signal?.aborted) { const error = new Error('Inbox operation cancelled'); error.name = 'AbortError'; throw error; }
}

export class InboxService {
    private pendingSave: Promise<unknown> = Promise.resolve();
    constructor(private app: App, private settings: () => LorebaseSettings, private save: () => Promise<void>) {}

    async scan(fallback: TemplateKind, signal?: AbortSignal): Promise<InboxScan> {
        const settings = this.settings();
        const folders = (['games', 'anime', 'movies', 'series', 'books', 'manga', 'music'] as const)
            .map(kind => settings[kind].folderPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')).filter(Boolean);
        const all: InboxCandidate[] = [], unreadable: string[] = [];
        const files = this.app.vault.getMarkdownFiles().filter(file => !folders.some(folder => file.path.startsWith(folder + '/')));
        let index = 0;
        const read = async (): Promise<void> => {
            while (index < files.length) {
                checkInboxAbort(signal);
                const file = files[index++];
                try {
                    const cache = this.app.metadataCache.getFileCache(file);
                    // Imported notes can live at the vault root; never turn their body into new drafts.
                    if (Array.isArray(cache?.frontmatter?.inbox_sources) || ['game', 'anime', 'movie', 'series', 'book', 'manga', 'music'].includes(String(cache?.frontmatter?.type))) continue;
                    const text = await this.app.vault.cachedRead(file);
                    checkInboxAbort(signal);
                    all.push(...parseInboxNote(file.path, text, fallback, this.tags(cache)));
                } catch { checkInboxAbort(signal); unreadable.push(file.path); }
            }
        };
        await Promise.all(Array.from({ length: Math.min(6, files.length) }, read));
        checkInboxAbort(signal);
        const receipts = normalizeInboxState(this.settings().inbox).receipts;
        const pending: InboxCandidate[] = [], handled: InboxCandidate[] = [];
        for (const item of all) {
            const origins = item.origins.filter(origin => !receipts[origin.id]);
            if (origins.length) pending.push({ ...item, origins });
            const done = item.origins.filter(origin => Boolean(receipts[origin.id]));
            if (done.length) handled.push({ ...item, origins: done });
        }
        const byTitle = (a: InboxCandidate, b: InboxCandidate): number => a.origins[0].path.localeCompare(b.origins[0].path) || a.origins[0].line - b.origins[0].line;
        return { pending: mergeInboxCandidates(pending).sort(byTitle), handled: mergeInboxCandidates(handled).sort(byTitle), unreadable };
    }

    /** Re-check the opt-in and original lines before creating a note from an old preview. */
    async validate(entry: InboxCandidate, signal?: AbortSignal): Promise<boolean> {
        const byPath = new Map<string, InboxOrigin[]>();
        for (const origin of entry.origins) byPath.set(origin.path, [...(byPath.get(origin.path) ?? []), origin]);
        for (const [path, origins] of byPath) {
            checkInboxAbort(signal);
            const file = this.app.vault.getMarkdownFiles().find(file => file.path === path);
            if (!file) return false;
            const parsed = parseInboxNote(path, await this.app.vault.cachedRead(file), entry.kind, this.tags(this.app.metadataCache.getFileCache(file)));
            checkInboxAbort(signal);
            const ids = new Set(parsed.flatMap(item => item.origins.map(origin => origin.id)));
            if (origins.some(origin => !ids.has(origin.id))) return false;
        }
        return true;
    }

    record(entry: InboxCandidate, state: InboxReceipt['state'], target?: string): Promise<void> {
        return this.change(receipts => {
            for (const origin of entry.origins) receipts[origin.id] = { state, at: Date.now(), ...(target ? { target } : {}) };
        });
    }
    restore(entry: InboxCandidate): Promise<void> {
        return this.change(receipts => { for (const origin of entry.origins) delete receipts[origin.id]; });
    }
    private change(update: (receipts: InboxState['receipts']) => void): Promise<void> {
        const work = this.pendingSave.then(async () => {
            const settings = this.settings(), previous = settings.inbox;
            const next = normalizeInboxState(previous); update(next.receipts); settings.inbox = next;
            try { await this.save(); }
            catch (error) { if (settings.inbox === next) settings.inbox = previous; throw error; }
        });
        this.pendingSave = work.catch(() => undefined);
        return work;
    }
    private tags(cache: ReturnType<App['metadataCache']['getFileCache']>): string[] {
        const frontmatter: unknown = cache?.frontmatter?.tags;
        return [...(cache?.tags?.map(tag => tag.tag) ?? []), ...(Array.isArray(frontmatter) ? frontmatter.map(String) : typeof frontmatter === 'string' ? frontmatter.split(/[\s,]+/) : [])];
    }
}
