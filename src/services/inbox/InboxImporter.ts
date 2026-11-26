import { App, TFile } from 'obsidian';
import type { LorebaseSettings } from '../../types';
import type { ManualCreateDraft } from '../../modals/ManualCreateModal';
import { MultiSelectSearchModal } from '../../modals/IntegrationModals';
import { inboxText } from '../../localization/inbox';
import { referenceText } from '../../localization/catalogReference';
import { getRatingMax, getRatingStep, roundRatingToStep } from '../../utils/rating';
import { IntegrationService } from '../IntegrationService';
import type { MediaKind, SearchResult } from '../integrations/types';
import { parseTemplateFieldAliases, applyFrontmatterAliases } from '../media/templateFieldAliases';
import { readRootYamlKey } from '../integrations/templateSchema';
import { createLibraryMembership } from '../integrations/libraryMembership';
import { extractMarkdownSection, upsertMarkdownSection } from '../markdownSections';
import { BackgroundOperation, OperationLifetime } from '../BackgroundOperation';
import { MusicCatalog } from '../MusicCatalog';
import { emptyMusicItem, MusicService } from '../MusicService';
import type { MusicProvider, MusicSearchResult } from '../integrations/providers/music';
import { checkInboxAbort } from '../InboxService';
import { inboxTitleKey, type InboxCandidate } from './parser';

export type InboxMatch = { kind: MediaKind; result: SearchResult } | { kind: 'music'; result: MusicSearchResult };
export interface InboxImportResult { file: TFile; created: boolean }

export function inboxRating(rating10: number | null, settings: LorebaseSettings['ratingScale']): number | null {
    if (rating10 === null || rating10 <= 0 || rating10 > 10 || !Number.isFinite(rating10)) return null;
    return Math.max(1, Math.min(getRatingMax(settings), roundRatingToStep(rating10 / 10 * getRatingMax(settings), getRatingStep(settings))));
}

/** Keep personal URLs in My Notes, never as the catalogue identity or network query. */
export function inboxNotes(entry: InboxCandidate, notes: string): string {
    const origins = entry.origins.map(origin => `- [[${origin.path.replace(/\.md$/i, '')}]] · ${origin.line}${origin.section ? ' · ' + origin.section : ''}\n  ${inboxText('original')}: ${origin.text}`);
    return [notes.trim(), entry.links.join('\n'), `${inboxText('provenance')}:\n${origins.join('\n')}`].filter(Boolean).join('\n\n');
}

export function decorateInboxContent(content: string, template: string, entry: InboxCandidate, notes: string, settings: LorebaseSettings): string {
    const media = { games: 'game', anime: 'anime', movies: 'movie', series: 'series', books: 'book', manga: 'manga', music: 'music' } as const;
    const aliases = parseTemplateFieldAliases(media[entry.kind], template);
    const fields: Record<string, unknown> = { inbox_sources: [...new Set(entry.origins.map(origin => origin.path))] };
    if (entry.rating10 !== null) {
        fields.inbox_rating_10 = entry.rating10;
        fields[entry.kind === 'games' ? 'userRating' : 'rating'] = inboxRating(entry.rating10, settings.ratingScale);
    }
    if (entry.isAdult && ['games', 'anime', 'manga'].includes(entry.kind)) fields.Sex18 = true;
    const match = /^(\uFEFF?---\r?\n)([\s\S]*?)(\r?\n---)(?=\r?\n|$)/.exec(content);
    if (match) {
        const lines = match[2].split(/\r?\n/);
        for (const [canonical, value] of Object.entries(fields)) {
            const key = aliases[canonical] ?? canonical;
            const encoded = /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? key : JSON.stringify(key);
            const line = `${encoded}: ${JSON.stringify(value)}`;
            const start = lines.findIndex(line => readRootYamlKey(line) === key);
            if (start < 0) lines.push(line);
            else {
                let end = start + 1;
                while (end < lines.length && (!lines[end].trim() || /^[ \t]+|^-\s/.test(lines[end]))) end++;
                lines.splice(start, end - start, line);
            }
        }
        content = match[1] + lines.join('\n') + match[3] + content.slice(match[0].length);
    }
    const existing = extractMarkdownSection(content, 'My Notes').trim();
    return upsertMarkdownSection(content, 'My Notes', [existing, inboxNotes(entry, notes)].filter(Boolean).join('\n\n'));
}

export function inboxManualDraft(entry: InboxCandidate): ManualCreateDraft {
    if (entry.kind === 'music') throw new Error('Use the music creator');
    return {
        kind: entry.kind, title: entry.title, year: '', released: '',
        workType: ({ games: 'Game', movies: 'Movie', series: 'Series', manga: 'Manga', anime: '', books: '' })[entry.kind],
        status: entry.kind === 'games' ? 'not_started' : 'planned', url: '', poster: '', posterHorizontal: '', posterFile: null,
        genres: [], tags: [], rating: null, isAdult: entry.isAdult, gameSeries: '', format: 'tv',
        animeParts: [{ id: 'season-1', kind: 'tv', title: '1', seasonNumber: 1, episodeCurrent: 0, episodeTotal: null, status: 'planned' }],
        activeAnimePartId: 'season-1', seasonNumber: entry.kind === 'series' ? 1 : null,
        episodeCurrent: 0, episodeTotal: entry.kind === 'movies' ? 1 : null,
        pageCurrent: 0, pageTotal: null, chapterCurrent: 0, chapterTotal: null, volumeCurrent: entry.kind === 'manga' ? 1 : null, volumeTotal: null,
    };
}

export class InboxImporter {
    private lifetime = new OperationLifetime();
    private panels = new AbortController();
    private recent = new Map<string, TFile>();
    private pending: Promise<unknown> = Promise.resolve();
    constructor(private app: App, private settings: () => LorebaseSettings, private integration: IntegrationService, private music: MusicService) {}
    get signal(): AbortSignal { return this.panels.signal; }
    dispose(): void { this.panels.abort(); this.lifetime.dispose(); this.recent.clear(); }

    async select(entry: InboxCandidate, signal: AbortSignal, musicKind: 'album' | 'track' = 'album'): Promise<InboxMatch | null> {
        checkInboxAbort(signal);
        if (entry.kind !== 'music') {
            const result = await this.integration.selectMediaSource(entry.kind, entry.title, undefined, signal, true);
            return result && !signal.aborted ? { kind: entry.kind, result } : null;
        }
        const settings = this.settings();
        const providers = (['musicbrainz', 'lastfm', 'deezer'] as const).filter(provider => settings.music.providerEnabled?.[provider] !== false && (provider !== 'lastfm' || Boolean(settings.music.lastfmApiKey.trim())));
        const catalog = new MusicCatalog(() => this.settings().music.lastfmApiKey, provider => this.settings().music.providerEnabled?.[provider] !== false);
        const modal = new MultiSelectSearchModal<MusicSearchResult>(this.app, (query, provider, options) => {
            checkInboxAbort(signal);
            return catalog.search(provider as MusicProvider, musicKind, query, options?.page ?? 1);
        }, { titleText: inboxText('find'), placeholder: referenceText('placeholder'), emptyText: inboxText('empty'), doneText: inboxText('select'), cancelText: inboxText('cancel'),
            initialQuery: entry.title, pickOnClick: true, providerOptions: providers.map(id => ({ id, label: id === 'musicbrainz' ? 'MusicBrainz' : id === 'lastfm' ? 'Last.fm' : 'Deezer' })), initialProviderId: providers.includes(settings.music.provider) ? settings.music.provider : providers[0] });
        const abort = (): void => modal.close(); signal.addEventListener('abort', abort, { once: true });
        try { const result = (await modal.openAndGetValues())?.[0]; return result && !signal.aborted ? { kind: 'music', result } : null; }
        finally { signal.removeEventListener('abort', abort); }
    }

    create(entry: InboxCandidate, match: InboxMatch | null, notes: string, signal: AbortSignal, musicKind: 'album' | 'track' = 'album'): Promise<InboxImportResult> {
        const operation = this.lifetime.begin(() => this.identity(), signal);
        const work = this.pending.then(() => this.createNow(entry, match, notes, musicKind, operation)).finally(() => operation.close());
        this.pending = work.catch(() => undefined); return work;
    }
    async findExisting(entry: InboxCandidate, match: InboxMatch | null): Promise<TFile | null> {
        if (entry.kind === 'music') {
            const found = (await this.music.loadItems()).find(item => match?.kind === 'music'
                ? item.integrationProvider === match.result.provider && item.integrationId === match.result.id && item.musicKind === match.result.kind
                : item.displayName.normalize('NFKC').toLocaleLowerCase() === entry.title.normalize('NFKC').toLocaleLowerCase());
            const file = found && this.app.vault.getAbstractFileByPath(found.filePath);
            return file instanceof TFile ? file : null;
        }
        const settings = this.settings(), kind = entry.kind;
        const media = settings.integrations?.media[kind];
        const template = media?.templateMode === 'advanced' ? media.template : '';
        const aliases = template ? parseTemplateFieldAliases(({ games: 'game', anime: 'anime', movies: 'movie', series: 'series', books: 'book', manga: 'manga' } as const)[kind], template) : media?.fieldAliases ?? {};
        const folder = settings[kind].folderPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
        const source = match && match.kind !== 'music' ? match.result : null;
        for (const file of this.app.vault.getMarkdownFiles()) {
            if (entry.origins.some(origin => origin.path === file.path) || (folder && !file.path.startsWith(folder + '/'))) continue;
            const metadata = applyFrontmatterAliases(this.app.metadataCache.getFileCache(file)?.frontmatter ?? {}, aliases);
            if (!folder && !metadata.type && !metadata.integration_id) continue;
            if (source) {
                if (createLibraryMembership([{ basename: file.basename, metadata }], kind)(source)) return file;
            } else {
                const type = String(metadata.type ?? '').toLocaleLowerCase();
                const singular = ({ games: 'game', anime: 'anime', movies: 'movie', series: 'series', books: 'book', manga: 'manga' })[kind];
                if (type && type !== kind && type !== singular) continue;
                const names = [metadata.name, metadata.title, ...(Array.isArray(metadata.aliases) ? metadata.aliases : [metadata.aliases])];
                if (!metadata.name && !metadata.title) names.push(file.basename);
                if (names.some(name => typeof name === 'string' && inboxTitleKey(name) === inboxTitleKey(entry.title))) return file;
            }
        }
        return null;
    }
    private identity(): string {
        const s = this.settings();
        return JSON.stringify({ integrations: s.integrations, music: s.music, ratings: s.ratingScale, enabled: s.enabledMedia,
            folders: [s.games, s.anime, s.movies, s.series, s.books, s.manga].map(value => value.folderPath) });
    }
    private async createNow(entry: InboxCandidate, match: InboxMatch | null, notes: string, musicKind: 'album' | 'track', operation: BackgroundOperation): Promise<InboxImportResult> {
        operation.check();
        if (match && match.kind !== entry.kind) throw new Error(inboxText('stale'));
        if (!entry.title.trim()) throw new Error(inboxText('name'));
        const key = entry.kind + ':' + (match ? `${match.result.provider}:${match.kind === 'music' ? match.result.kind : match.result.workTypeMedia ?? ''}:${match.result.id}` : `${entry.kind === 'music' ? musicKind + ':' : ''}${entry.title.normalize('NFKC').toLocaleLowerCase()}`);
        const recent = this.recent.get(key);
        if (recent && this.app.vault.getAbstractFileByPath(recent.path) instanceof TFile) return { file: recent, created: false };
        if (entry.kind === 'music') {
            const settings = this.settings();
            const item = match?.kind === 'music'
                ? await operation.wait(() => new MusicCatalog(() => settings.music.lastfmApiKey, provider => this.settings().music.providerEnabled?.[provider] !== false).details(match.result))
                : { ...emptyMusicItem(), musicKind, displayName: entry.title, nameLower: entry.title.toLocaleLowerCase() };
            item.myNotes = inboxNotes(entry, notes); item.userRating = inboxRating(entry.rating10, settings.ratingScale);
            const result = await this.music.createItem(item, operation.signal);
            const file = this.app.vault.getAbstractFileByPath(result.item.filePath);
            if (!(file instanceof TFile)) throw new Error(inboxText('error'));
            this.recent.set(key, file); return { file, created: result.created };
        }
        const settings = this.settings(), kind = entry.kind;
        const existing = await operation.wait(() => this.findExisting(entry, match));
        if (existing) return { file: existing, created: false };
        const options = { signal: operation.signal, check: operation.check, separateExisting: true, openAfterCreate: false,
            decorate: (content: string, noteTemplate: string) => decorateInboxContent(content, noteTemplate, entry, notes, settings) };
        const file = match && match.kind !== 'music'
            ? await this.integration.createProviderSelection(kind, match.result, options)
            : await this.integration.createManualSelection(inboxManualDraft(entry), options);
        if (!file) { operation.check(); throw new Error(inboxText('error')); }
        this.recent.set(key, file); return { file, created: true };
    }
}
