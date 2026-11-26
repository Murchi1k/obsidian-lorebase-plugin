import { App, TFile } from 'obsidian';
import type { LorebaseSettings } from '../types';
import type { MetadataService } from './MetadataService';
import type { SearchResult } from './integrations/types';

export type RecommendationMedia = 'anime' | 'movie' | 'series';
type RecordItem = { file: TFile; provider: string; id: string; year: string };
const text = (value: unknown): string => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
const titleKey = (value: string): string => value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();

/** Membership and explicit imports are separate from the external recommendation list. */
export class RecommendationLibraryService {
    private created = new Map<string, TFile>();
    private pending = new Map<string, Promise<TFile | null>>();
    private adding: Promise<unknown> = Promise.resolve();
    constructor(private app: App, private settings: () => LorebaseSettings, private metadata: MetadataService,
        private create: (kind: 'anime' | 'movies' | 'series', selection: SearchResult) => Promise<TFile | null>) {}
    private key(media: RecommendationMedia, selection: SearchResult): string { return `${media}:${selection.provider}:${selection.id}`; }
    index(media: RecommendationMedia): (selection: SearchResult) => TFile | null {
        const settings = this.settings(), kind = media === 'movie' ? 'movies' : media;
        const folder = settings[kind].folderPath.replace(/\\/g, '/').replace(/\/+$/, '');
        const identities = new Map<string, TFile>(), titles = new Map<string, RecordItem[]>();
        for (const file of this.app.vault.getMarkdownFiles()) {
            if (!folder || !file.path.startsWith(`${folder}/`)) continue;
            const raw = this.app.metadataCache.getFileCache(file)?.frontmatter; if (!raw) continue;
            const fm = this.metadata.resolveFrontmatter(media, raw);
            if (fm.type && text(fm.type).toLowerCase() !== media) continue;
            const provider = text(fm.integration_provider).toLowerCase(), id = text(fm.integration_id);
            if (provider && id) identities.set(`${provider}:${id}`, file);
            if (media === 'anime' && fm.anilist_id) identities.set(`anilist:${text(fm.anilist_id)}`, file);
            const names = [text(fm.title), text(fm.name), ...(Array.isArray(fm.aliases) ? fm.aliases.map(text) : [text(fm.aliases)])].filter(Boolean);
            if (!names.length) names.push(file.basename);
            for (const name of names) { const key = titleKey(name), list = titles.get(key) ?? []; list.push({ file, provider, id, year: text(fm.year).slice(0, 4) }); titles.set(key, list); }
        }
        for (const [key, file] of this.created) if (!this.app.vault.getAbstractFileByPath(file.path)) this.created.delete(key);
        return selection => {
            const direct = this.created.get(this.key(media, selection)) ?? identities.get(`${selection.provider}:${selection.id}`); if (direct) return direct;
            const matches = (titles.get(titleKey(selection.title)) ?? []).filter(record => !(record.provider === selection.provider && record.id && record.id !== selection.id)
                && (!record.year || !selection.year || record.year === selection.year.slice(0, 4)));
            const unique = [...new Set(matches.map(record => record.file))]; return unique.length === 1 ? unique[0] : null;
        };
    }
    add(media: RecommendationMedia, selection: SearchResult): Promise<TFile | null> {
        const key = this.key(media, selection), pending = this.pending.get(key); if (pending) return pending;
        const operation = this.adding.then(async () => {
            const existing = this.index(media)(selection); if (existing) return existing;
            const file = await this.create(media === 'movie' ? 'movies' : media, selection);
            if (file) { if (this.created.size >= 100) this.created.delete(this.created.keys().next().value!); this.created.set(key, file); }
            return file;
        });
        this.adding = operation.catch(() => undefined);
        const result = operation.finally(() => { if (this.pending.get(key) === result) this.pending.delete(key); });
        this.pending.set(key, result); return result;
    }
    async open(file: TFile): Promise<void> { await this.app.workspace.openLinkText(file.path, ''); }
}
