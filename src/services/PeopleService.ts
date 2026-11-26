import { assertOnlineExtras, runOnlineExtra } from './onlineExtras';
import { App, TFile } from 'obsidian';
import type { LorebaseSettings, MovieItem, SeriesItem } from '../types';
import { MetadataService } from './MetadataService';
import { fetchJson } from './integrations/shared';
import { normalizeTmdbLanguage } from './integrations/providers/tmdb';
import { getTmdbCast, getTvmazeCast, getTmdbPerson, getTmdbPersonName, searchTmdbPeople, type PersonCredit, type CastMember } from './integrations/providers/tmdbPeople';
import type { SearchResult } from './integrations/types';
import { needsPersonAlias } from '../utils/peopleDisplay';

/** Bounded session cache; opening people never creates notes or mutates title metadata. */
export class PeopleService {
    private cache = new Map<string, { expires: number; value: Promise<unknown> }>();
    private created = new Map<string, TFile>();
    private adding: Promise<unknown> = Promise.resolve();
    private nameTasks: Array<() => void> = [];
    private activeNames = 0;
    constructor(private app: App, private settings: () => LorebaseSettings, private metadata: MetadataService,
        private create: (kind: 'movies' | 'series', result: SearchResult) => Promise<TFile | null>) {}
    configured(): boolean {
        const settings = this.settings();
        return Boolean(settings.integrations?.enabled && settings.integrations.providers.tmdb.enabled && settings.integrations.providers.tmdb.apiKey?.trim());
    }
    private options(media: 'movie' | 'series') {
        assertOnlineExtras();
        if (!this.configured()) throw new Error('TMDB is not configured');
        const settings = this.settings().integrations!;
        return { key: settings.providers.tmdb.apiKey!.trim(), language: this.language(media) };
    }
    language(media: 'movie' | 'series'): string {
        return normalizeTmdbLanguage(this.settings().integrations?.media[media === 'movie' ? 'movies' : 'series'].tmdbLanguage);
    }
    /** Only visible cards request aliases, with at most 3 requests in flight. */
    async actorName(actor: CastMember, media: 'movie' | 'series'): Promise<string> {
        const options = this.options(media);
        if (!actor.id || !needsPersonAlias(actor.name, options.language)) return Promise.resolve(actor.name);
        return this.cached(`name:${actor.id}:${options.language}`, () => new Promise<string>((resolve, reject) => {
            this.nameTasks.push(() => {
                this.activeNames++;
                void getTmdbPersonName(this.fetch, actor.id, options.key, options.language).then(resolve, reject).finally(() => {
                    this.activeNames--; this.drainNames();
                });
            });
            this.drainNames();
        }));
    }
    private drainNames(): void {
        while (this.activeNames < 3 && this.nameTasks.length) this.nameTasks.shift()!();
    }
    private cached<T>(key: string, load: () => Promise<T>): Promise<T> {
        assertOnlineExtras();
        const hit = this.cache.get(key); if (hit && hit.expires > Date.now()) return hit.value as Promise<T>;
        if (this.cache.size >= 80) this.cache.delete(this.cache.keys().next().value!);
        const value = runOnlineExtra(load).catch(error => { if (this.cache.get(key)?.value === value) this.cache.delete(key); throw error; });
        this.cache.set(key, { expires: Date.now() + 15 * 60_000, value }); return value;
    }
    private fetch = (url: string) => runOnlineExtra(() => fetchJson(url, {}, 'GET', undefined, { swallowErrors: false }));
    cast(item: MovieItem | SeriesItem) {
        const options = this.options(item.type);
        if (item.type === 'series' && item.integrationProvider === 'tvmaze' && /^[1-9]\d*$/.test(String(item.integrationId || ''))) {
            const id = String(item.integrationId);
            return this.cached(`cast:tvmaze:${id}:${options.language}`, () => getTvmazeCast(this.fetch, id, options.key, options.language));
        }
        let titleId = item.integrationProvider === 'tmdb' ? String(item.integrationId || '') : '';
        if (!titleId && item.sourceUrl) {
            try { const url = new URL(item.sourceUrl); if (/^(www\.)?themoviedb\.org$/.test(url.hostname)) titleId = url.pathname.match(new RegExp(`^/${item.type === 'movie' ? 'movie' : 'tv'}/(\\d+)`))?.[1] || ''; } catch { /* No linked TMDB title. */ }
        }
        if (!/^[1-9]\d*$/.test(titleId)) return Promise.resolve(null);
        return this.cached(`cast:${item.type}:${titleId}:${options.language}`, () => getTmdbCast(this.fetch, item.type, titleId, options.key, options.language));
    }
    person(id: string, media: 'movie' | 'series') {
        const options = this.options(media);
        return this.cached(`person:${id}:${options.language}`, () => getTmdbPerson(this.fetch, id, options.key, options.language));
    }
    search(name: string, media: 'movie' | 'series') {
        const options = this.options(media);
        return this.cached(`search:${name}:${options.language}`, () => searchTmdbPeople(this.fetch, name, options.key, options.language));
    }
    /** Build once per filmography render rather than scanning the vault for every card. */
    libraryIndex(): (credit: PersonCredit) => TFile | null {
        const identities = new Map<string, TFile>();
        const titles = new Map<string, Array<{ file: TFile; year: string; provider: string; id: string }>>();
        const normalize = (title: string) => title.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
        const settings = this.settings();
        for (const file of this.app.vault.getMarkdownFiles()) {
            const raw = this.app.metadataCache.getFileCache(file)?.frontmatter; if (!raw) continue;
            for (const media of ['movie', 'series'] as const) {
                const folder = (media === 'movie' ? settings.movies.folderPath : settings.series.folderPath).replace(/\\/g, '/').replace(/\/+$/, '');
                if (folder && !file.path.startsWith(`${folder}/`)) continue;
                const fm = this.metadata.resolveFrontmatter(media, raw);
                if (fm.type && fm.type !== media) continue;
                const provider = String(fm.integration_provider || ''), id = String(fm.integration_id || '');
                if (provider === 'tmdb' && id) identities.set(`${media}:${id}`, file);
                const title = String(fm.title || fm.name || file.basename), key = `${media}:${normalize(title)}`;
                const list = titles.get(key) ?? []; list.push({ file, year: String(fm.year || ''), provider, id }); titles.set(key, list);
            }
        }
        for (const [key, file] of this.created) {
            if (this.app.vault.getAbstractFileByPath(file.path)) identities.set(key, file); else this.created.delete(key);
        }
        return credit => identities.get(`${credit.media}:${credit.id}`) ?? (titles.get(`${credit.media}:${normalize(credit.title)}`) ?? [])
            .find(value => !(value.provider === 'tmdb' && value.id && value.id !== credit.id) && (!value.year || !credit.year || value.year === credit.year))?.file ?? null;
    }
    add(credit: PersonCredit): Promise<TFile | null> {
        const operation = this.adding.then(async () => {
            const existing = this.libraryIndex()(credit); if (existing) return existing;
            const options = this.options(credit.media);
            const file = await this.create(credit.media === 'movie' ? 'movies' : 'series', { ...credit, tmdbLanguage: options.language });
            if (file) { if (this.created.size >= 100) this.created.delete(this.created.keys().next().value!); this.created.set(`${credit.media}:${credit.id}`, file); }
            return file;
        });
        this.adding = operation.catch(() => undefined); return operation;
    }
}
