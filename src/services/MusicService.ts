import { normalizeStatusReasons } from '../utils/statusReasons';
import { normalizeDiscovery, discoveryFrontmatter } from '../utils/discovery';
import { normalizePriority } from '../utils/priority';
import { parseDetailedRatings } from '../utils/detailedRatings';
import { isCustomStatus, countCustomStatus } from '../statusPresentation';
import { getNextReleaseStatus } from './media/releaseStatus';
import { App, TFile, normalizePath, stringifyYaml } from 'obsidian';
import { DEFAULT_COVER } from '../constants';
import type { AnimeStats, FilterState, MusicItem, MusicTrack, SortField, SortOrder, LorebaseSettings } from '../types';
import { OperationLifetime, type BackgroundOperation } from './BackgroundOperation';
import { MetadataService } from './MetadataService';
import { extractSimpleFrontmatter } from './media/libraryViewState';
import { filterAndSortMedia } from './media/filtering';
import { parseUserRating, parseYear } from './media/parsers';
import { durationSeconds, musicStatus, normalizeMusicTracks, statusAfterTrackChange } from './media/music';
import { extractMarkdownSection, upsertMarkdownSection } from './markdownSections';
import { getTemplateYamlKeys, orderTemplateContent, orderTemplateFrontmatter } from './integrations/templateSchema';
import { remapFrontmatterUpdates } from './media/templateFieldAliases';
import { formatTemplateYamlKey, renderTemplate } from './integrations/templateUtils';
import { formatTemplateWikilinks, getWikilinkTemplateKeys, wikilinkLabel } from './integrations/templateValues';
import { statisticsCountryCodes } from './media/statisticsCountries';
import { normalizeListeningStats } from './integrations/providers/musicDiscovery';
import { musicNoteClasses, upsertMusicTracklist } from './media/musicNote';
import { mt } from '../localization/music';
import { musicIdentityKeys } from './media/musicIdentity';

const list = (v: unknown): string[] => Array.isArray(v) ? v.map(String) : typeof v === 'string' ? v.split(',').map(s => s.trim()).filter(Boolean) : [];

export class MusicService {
    private readonly operations = new OperationLifetime();
    dispose(): void { this.operations.dispose(); }
    private begin(signal?: AbortSignal): BackgroundOperation {
        return this.operations.begin(() => JSON.stringify({ folder: this.folderPath, config: this.currentSettings?.().music }), signal);
    }
    private pendingCreation: Promise<unknown> = Promise.resolve();
    private recentlyCreated = new Map<string, MusicItem>();
    constructor(private app: App, private folderPath: string, private metadata: MetadataService, private readonly currentSettings?: () => LorebaseSettings) {}
    setFolderPath(path: string): void { this.folderPath = path; }
    invalidateCache(): void { /* Music reads the live metadata cache on each load. */ }
    async loadItems(): Promise<MusicItem[]> {
        const folder = normalizePath(this.folderPath).replace(/\/$/, '');
        const items = this.app.vault.getMarkdownFiles()
            .filter(file => !folder || file.path.startsWith(`${folder}/`))
            .map(file => this.parseFromCache(file)).filter((item): item is MusicItem => item !== null);
        const parsedPaths = new Set(items.map(item => item.filePath));
        for (const [path, item] of this.recentlyCreated) {
            if (!this.app.vault.getAbstractFileByPath(path) || parsedPaths.has(path)) this.recentlyCreated.delete(path);
            else if (!folder || path.startsWith(`${folder}/`)) items.push(item);
        }
        return items;
    }
    parseFromCache(file: TFile): MusicItem | null {
        const raw = this.app.metadataCache.getFileCache(file)?.frontmatter;
        if (!raw) return null;
        const fm = this.metadata.resolveFrontmatter('music', raw);
        if (fm.type !== 'music') return null;
        const displayName = String(fm.title || file.basename);
        const artist = wikilinkLabel(String(fm.artist || ''));
        const tracks = normalizeMusicTracks(fm.tracks);
        const poster = typeof fm.poster === 'string' ? fm.poster : '';
        return {
            type: 'music', musicKind: fm.music_kind === 'track' ? 'track' : 'album',
            filePath: file.path, displayName, artist, album: String(fm.album || ''),
            nameLower: `${displayName} ${artist} ${fm.album || ''}`.toLocaleLowerCase(),
            status: musicStatus(fm.status), tracks, duration: durationSeconds(fm.duration),
            releaseDate: String(fm.released || fm.release_date || fm.releaseDate || '') || null,
            year: parseYear(fm.year) ?? parseYear(String(fm.released || fm.release_date || fm.releaseDate || '').slice(0, 4)), description: String(fm.description || ''),
            detailedRatings: parseDetailedRatings(fm.detailed_ratings),
            userRating: parseUserRating(fm.rating), favorite: fm.favorite === true, priority: normalizePriority(fm.personal_priority), discovery: normalizeDiscovery(fm.discovery_context), statusReasons: normalizeStatusReasons(fm.status_reasons),
            poster: poster || null, imageUrl: this.metadata.getImageUrl(poster, null) || DEFAULT_COVER,
            hasCustomPoster: Boolean(poster), isAdult: false,
            genres: list(fm.genres).map(wikilinkLabel), tags: list(fm.tags), sourceUrl: String(fm.url || ''),
            integrationProvider: fm.integration_provider === 'musicbrainz' || fm.integration_provider === 'lastfm' || fm.integration_provider === 'deezer' ? fm.integration_provider : null,
            integrationId: String(fm.integration_id || ''),
            deezerArtistId: /^\d+$/.test(String(fm.deezer_artist_id)) ? String(fm.deezer_artist_id) : undefined,
            listeningStats: normalizeListeningStats(fm.listening_stats),
            parentAlbum: typeof fm.parent_album === 'string' ? fm.parent_album : undefined,
            parentTrackId: typeof fm.parent_track_id === 'string' ? fm.parent_track_id : undefined,
            rawFields: extractSimpleFrontmatter(raw),
            ...(Array.isArray(fm.countries) ? { countries: fm.countries.map(String) } : {}),
        };
    }
    filterAndSort(items: MusicItem[], filter: FilterState, field: SortField, order: SortOrder): MusicItem[] {
        return filterAndSortMedia({ items, filter, sortField: field, sortOrder: order, isVisible: () => true, getCompletedDate: () => null });
    }
    async readNotes(item: MusicItem): Promise<string> {
        const file = this.app.vault.getAbstractFileByPath(item.filePath);
        return file instanceof TFile ? extractMarkdownSection(await this.app.vault.cachedRead(file)) : '';
    }
    calculateStats(items: MusicItem[]): AnimeStats & { listening: number; on_repeat: number } {
        const stats = { total: items.length, planned: 0, watching: 0, completed: 0, paused: 0, dropped: 0,
            to_be_released: 0, listening: 0, on_repeat: 0, favorite: 0, withRating: 0, avgRating: 0,
            customStatusCounts: {} as Record<string, number>, ratingDistribution: {} as Record<number, number>, statusPercentages: {} as Record<string, number> };
        for (const item of items) {
            countCustomStatus(stats, item.status);
            if (!isCustomStatus(item.status)) stats[item.status]++;
            if (item.favorite) stats.favorite++;
            if (item.userRating !== null) {
                stats.withRating++; stats.avgRating += item.userRating;
                stats.ratingDistribution[item.userRating] = (stats.ratingDistribution[item.userRating] || 0) + 1;
            }
        }
        stats.avgRating = stats.withRating ? Math.round(stats.avgRating / stats.withRating * 10) / 10 : 0;
        for (const status of ['planned', 'listening', 'completed', 'paused', 'dropped', 'on_repeat', 'to_be_released'] as const) {
            stats.statusPercentages[status] = stats.total ? stats[status] / stats.total * 100 : 0;
        }
        return stats;
    }
    async updateItem(item: MusicItem, updates: Partial<MusicItem>, signal?: AbortSignal): Promise<void> {
        const operation = this.begin(signal);
        try { operation.check();
        const file = this.app.vault.getAbstractFileByPath(item.filePath);
        if (!(file instanceof TFile)) throw new Error('Music note no longer exists');
        const next = { ...item, ...updates };
        next.tracks = normalizeMusicTracks(next.tracks);
        if (next.musicKind === 'album' && 'tracks' in updates) {
            next.status = statusAfterTrackChange(next.status, next.tracks);
            next.duration = next.tracks.length && next.tracks.every(track => track.duration !== null)
                ? next.tracks.reduce((sum, track) => sum + (track.duration ?? 0), 0) : null;
        }
        const aliases = this.metadata.getFrontmatterFieldAliases('music');
        const property = (key: string): string => aliases[key] ?? key;
        const template = this.metadata.getNoteTemplate('music');
        const wikilinkKeys = getWikilinkTemplateKeys(template);
        const serialized = remapFrontmatterUpdates(this.frontmatter(next), aliases);
        const keys: Partial<Record<keyof MusicItem, string>> = {
            countries: 'countries', musicKind: 'music_kind', displayName: 'title', artist: 'artist', album: 'album', year: 'year', releaseDate: 'released',
            poster: 'poster', description: 'description', status: 'status', userRating: 'rating', detailedRatings: 'detailed_ratings', favorite: 'favorite', priority: 'personal_priority', discovery: 'discovery_context', statusReasons: 'status_reasons',
            genres: 'genres', tags: 'tags', duration: 'duration', tracks: 'tracks', sourceUrl: 'url',
            integrationProvider: 'integration_provider', integrationId: 'integration_id',
            parentAlbum: 'parent_album', parentTrackId: 'parent_track_id',
            deezerArtistId: 'deezer_artist_id', listeningStats: 'listening_stats',
        };
        await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
            operation.check();
            this.metadata.migrateNoteFieldAliases('music', fm);
            fm[property('type')] = 'music';
            const classes = property('cssclasses');
            fm[classes] = musicNoteClasses(fm[classes]);
            for (const field of Object.keys(updates) as (keyof MusicItem)[]) {
                const canonical = keys[field];
                if (!canonical) continue;
                const key = property(canonical);
                if (key in serialized) fm[key] = formatTemplateWikilinks(serialized[key], fm[key], wikilinkKeys.has(key));
                else delete fm[key];
            }
            if('releaseDate' in updates) for(const alias of ['release_date','releaseDate']) {
                if(property(alias) !== property('released')) delete fm[property(alias)];
            }
            for (const canonical of ['parent_album', 'parent_track_id', 'album']) {
                const key = property(canonical);
                if (!(key in serialized) && (next.musicKind === 'album' || !fm[key])) delete fm[key];
            }
            if (next.musicKind === 'album' && 'tracks' in updates) {
                fm[property('status')] = next.status;
                fm[property('duration')] = next.duration;
            }
            const templateKeys = getTemplateYamlKeys(template);
            orderTemplateFrontmatter(fm, template ? templateKeys : Object.keys(serialized), template ? {} : serialized, { compact: this.metadata.isCompactTemplateMode() });
        });
        if ('myNotes' in updates || 'tracks' in updates || 'artist' in updates) {
            await this.app.vault.process(file, content => { operation.check(); return this.renderTracklist(
                'myNotes' in updates ? upsertMarkdownSection(content, 'My Notes', updates.myNotes ?? '') : content, next); });
        }
        Object.assign(item, next);
        } finally { operation.close(); }
    }
    async deleteItem(item: MusicItem): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(item.filePath);
        if (file instanceof TFile) await this.app.fileManager.trashFile(file);
    }
    /** Serialize creations so double clicks cannot create duplicate notes. */
    createItem(draft: MusicItem, signal?: AbortSignal): Promise<{ item: MusicItem; created: boolean }> {
        const context = this.begin(signal);
        const operation = this.pendingCreation.then(() => this.createNow(draft, context)).finally(() => context.close());
        this.pendingCreation = operation.catch(() => undefined); return operation;
    }
    private async createNow(draft: MusicItem, operation: BackgroundOperation): Promise<{ item: MusicItem; created: boolean }> {
        const identity = new Set(musicIdentityKeys(draft));
        const existing = (await operation.wait(() => this.loadItems())).find(item => musicIdentityKeys(item).some(key => identity.has(key)));
        if (existing) return { item: existing, created: false };
        const folder = normalizePath(this.folderPath).replace(/\/$/, '');
        let current = '';
        for (const part of folder.split('/').filter(Boolean)) {
            operation.check();
            current = current ? `${current}/${part}` : part;
            if (!this.app.vault.getAbstractFileByPath(current)) await this.app.vault.createFolder(current);
        }
        const stem = `${draft.artist ? `${draft.artist} - ` : ''}${draft.displayName}`
            .replace(/[\\/:*?"<>|[\]#^]/g, '-').replace(/[^\u0020-\uFFFF]/g, '-').replace(/[. ]+$/, '').slice(0, 140) || 'Music';
        const base = folder ? `${folder}/${stem}` : stem;
        let path = `${base}.md`;
        for (let n = 2; this.app.vault.getAbstractFileByPath(path); n++) path = `${base} (${n}).md`;
        const item = { ...draft, filePath: path, tracks: normalizeMusicTracks(draft.tracks) };
        if (item.musicKind === 'album') {
            item.status = statusAfterTrackChange(item.status, item.tracks);
            item.duration = item.tracks.length && item.tracks.every(track => track.duration !== null)
                ? item.tracks.reduce((sum, track) => sum + (track.duration ?? 0), 0) : null;
        }
        item.status = getNextReleaseStatus(item) as MusicItem['status'];
        operation.check();
        await this.app.vault.create(path, this.renderTracklist(this.renderMusicNote(item), item));
        this.recentlyCreated.set(path, item);
        return { item, created: true };
    }
    async addAlbumTrack(album: MusicItem, track: MusicTrack): Promise<{ item: MusicItem; created: boolean }> {
        return this.createItem({
            ...album, musicKind: 'track', displayName: track.title, artist: track.artist || album.artist,
            album: album.displayName, tracks: [], duration: track.duration,
            status: track.listened ? 'completed' : 'planned', userRating: track.userRating, favorite: track.favorite,
            filePath: '', myNotes: '', parentAlbum: album.filePath, parentTrackId: track.id,
            integrationProvider: track.deezerId ? 'deezer' : track.recordingId ? 'musicbrainz' : null,
            integrationId: track.deezerId || track.recordingId || '',
            listeningStats: undefined,
            sourceUrl: track.deezerId ? `https://www.deezer.com/track/${track.deezerId}` : track.recordingId ? `https://musicbrainz.org/recording/${track.recordingId}` : '',
        });
    }
    private renderMusicNote(item: MusicItem): string {
        const frontmatter = this.frontmatter(item);
        const template = this.metadata.getNoteTemplate('music');
        const compact = this.metadata.isCompactTemplateMode();
        if (!template || !/^\uFEFF?---[ \t]*\r?\n/.test(template)) {
            orderTemplateFrontmatter(frontmatter, Object.keys(frontmatter), {}, { compact });
            const body = template ? '\n' + renderTemplate(template, frontmatter, true) : '';
            const content = '---\n' + stringifyYaml(frontmatter) + '---\n' + body;
            return item.myNotes?.trim() ? upsertMarkdownSection(content, 'My Notes', item.myNotes)
                : template ? content : content + '\n## My Notes\n\n';
        }

        const aliases = this.metadata.getFrontmatterFieldAliases('music');
        const keys = new Set(getTemplateYamlKeys(template));
        const required = ['type', 'music_kind', 'cssclasses'];
        if (item.discovery) required.push('discovery_context');
        if (item.listeningStats) required.push('listening_stats');
        if (item.deezerArtistId) required.push('deezer_artist_id');
        if (item.tracks.length) required.push('tracks');
        if (item.parentAlbum) required.push('parent_album');
        if (item.parentTrackId) required.push('parent_track_id');
        const additions = required.flatMap(canonical => {
            const key = aliases[canonical] ?? canonical;
            return keys.has(key) ? [] : [formatTemplateYamlKey(key) + ': ' + JSON.stringify(frontmatter[canonical])];
        });
        let content = renderTemplate(template, frontmatter, true);
        if (additions.length) {
            content = content.replace(/^(\uFEFF?---[ \t]*\r?\n)([\s\S]*?)(^---[ \t]*$)/m,
                (_match, start: string, yaml: string, end: string) => start + yaml + additions.join('\n') + '\n' + end);
        }
        content = orderTemplateContent(content, template, { compact });
        if (item.myNotes?.trim()) return upsertMarkdownSection(content, 'My Notes', item.myNotes);
        return /^##[ \t]+My Notes[ \t]*$/im.test(content) ? content : content.trimEnd() + '\n\n## My Notes\n\n';
    }

    private renderTracklist(content: string, item: MusicItem): string {
        return upsertMusicTracklist(content, item.musicKind === 'album' ? item.tracks : [], item.artist,
            { title: mt('tracklist'), song: mt('track'), duration: mt('duration'), listened: mt('listened'), disc: mt('disc'), count: mt('trackCount') });
    }
    private frontmatter(item: MusicItem): Record<string, unknown> {
        return {
            countries: item.countries ?? statisticsCountryCodes(item),
            type: 'music', music_kind: item.musicKind, title: item.displayName, artist: item.artist,
            cssclasses: musicNoteClasses(undefined),
            ...(item.musicKind === 'track' ? { album: item.album || '' } : {}), year: item.year, poster: item.poster || '', description: item.description,
            released: item.releaseDate || null,
            detailed_ratings: parseDetailedRatings(item.detailedRatings) ?? null,
            status: item.status, rating: item.userRating, favorite: item.favorite, personal_priority: normalizePriority(item.priority),
            ...(item.discovery ? { discovery_context: discoveryFrontmatter(item.discovery) } : {}),
            ...(normalizeStatusReasons(item.statusReasons) ? {status_reasons:normalizeStatusReasons(item.statusReasons)} : {}),
            genres: item.genres, tags: item.tags, duration: item.duration,
            tracks: item.musicKind === 'album' ? item.tracks : [], url: item.sourceUrl || '',
            ...(item.listeningStats ? { listening_stats: normalizeListeningStats(item.listeningStats) } : {}),
            ...(item.deezerArtistId ? { deezer_artist_id: item.deezerArtistId } : {}),
            integration_provider: item.integrationProvider || '', integration_id: item.integrationId || '',
            ...(item.musicKind === 'track' ? { parent_album: item.parentAlbum || null, parent_track_id: item.parentTrackId || null } : {}),
        };
    }
}

export function emptyMusicItem(): MusicItem {
    return {
        type: 'music', musicKind: 'album', filePath: '', displayName: '', nameLower: '',
        artist: '', album: '', status: 'planned', year: null, duration: null, tracks: [],
        description: '', userRating: null, favorite: false, poster: null, imageUrl: DEFAULT_COVER,
        hasCustomPoster: false, isAdult: false, genres: [], tags: [],
    };
}
