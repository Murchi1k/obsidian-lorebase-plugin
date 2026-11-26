import { requestUrl } from 'obsidian';
import { requestWithDeadline } from './integrations/requestDeadline';
import { OperationLifetime, isOperationCancelled, type BackgroundOperation } from './BackgroundOperation';
import { orderTemplateContent } from './integrations/templateSchema';
import { readEpisodeFields, episodeFields, resizeEpisodeSelection, normalizeEpisodePart } from './media/episodeTracking';
import { App, TFile, TFolder } from 'obsidian';
import type {
    AniListSyncSettings,
    AniListSyncSnapshot,
    AnimeStatus,
    LorebaseSettings,
    RatingScaleSettings,
    UserRating,
} from '../types';
import { extractMarkdownSection, upsertMarkdownSection, updateMarkdownSection } from './markdownSections';
import { MetadataService } from './MetadataService';
import { getAllMarkdownFiles } from './media/serviceUtils';
import { getRatingMax, getRatingStep, parseStoredUserRating, roundRatingToStep } from '../utils/rating';
import { inferMangaWorkType } from '../utils/mangaWorkType';

import { buildSimpleTemplate, ensureIntegrationSourceFrontmatter, getDefaultTemplateFields, renderTemplate } from './integrations/templateUtils';
import { formatFuzzyDate, mapAnimeFormat, stripHtml } from './integrations/providers/common';
import { withAniListHeaders } from './integrations/anilistRequest';
import { parseTemplateFieldAliases } from './media/templateFieldAliases';
import { createLibraryMembership } from './integrations/libraryMembership';

const ANILIST_ENDPOINT = 'https://graphql.anilist.co';

type SyncKind = 'anime' | 'manga';
type SyncDate = { year?: number | null; month?: number | null; day?: number | null };

interface AniListEntry {
    id: number;
    status: string;
    score: number;
    progress: number;
    progressVolumes?: number;
    startedAt?: SyncDate | null;
    completedAt?: SyncDate | null;
    notes?: string | null;
    media: {
        id: number;
        title?: { userPreferred?: string; romaji?: string; english?: string };
        description?: string | null;
        genres?: string[] | null;
        studios?: { nodes?: Array<{ name?: string }> } | null;
        isAdult?: boolean;
        episodes?: number | null;
        chapters?: number | null;
        volumes?: number | null;
        format?: string | null;
        countryOfOrigin?: string | null;
        startDate?: { year?: number; month?: number; day?: number } | null;
        coverImage?: { large?: string; extraLarge?: string } | null;
        siteUrl?: string | null;
    };
}

interface LocalSyncItem {
    sourceProvider: string;
    kind: SyncKind;
    filePath: string;
    integrationId: string;
    status: AnimeStatus  ;
    userRating: UserRating;
    episodeCurrent: number;
    chapterCurrent: number;
    volumeCurrent: number;
    started: string;
    finished: string;
    notes: string;
}

export interface AniListSyncResult {
    cancelled?: boolean;
    imported: number;
    updatedLocal: number;
    pushed: number;
    skipped: number;
    failed: number;
}

export interface AniListImportCandidate {
    key: string;
    kind: SyncKind;
    title: string;
    status: AnimeStatus;
    progress: number;
    image: string;
    linked: boolean;
    alreadyInLibrary?: boolean;
}

export interface AniListLinkCandidate {
    filePath: string;
    title: string;
    kind: SyncKind;
    provider: string;
    image?: string;
}

export interface AniListLinkMatch {
    id: number;
    title: string;
    year: number | null;
    format: string;
    image?: string;
}

export interface AniListImportOptions {
    signal?: AbortSignal;
    control?: { isCancelled(): boolean; waitIfPaused(): Promise<void> };
    onItemStart?: (key: string) => void;
    onItemResult?: (key: string, outcome: 'created' | 'updated' | 'skipped' | 'failed', detail?: string) => void;
}

export class AniListSyncService {
    private readonly operations = new OperationLifetime();
    private readonly lifetime = new AbortController();

    dispose(): void { this.operations.dispose(); this.lifetime.abort(); }

    private assertActive(): void {
        if (this.lifetime.signal.aborted) { const error = new Error('AniList sync was cancelled.'); error.name = 'AbortError'; throw error; }
    }
    constructor(
        private readonly app: App,
        private readonly metadataService: MetadataService,
        private readonly currentSettings?: () => LorebaseSettings
    ) {}

    private begin(settings: LorebaseSettings, signal?: AbortSignal, cancelled?: () => boolean): BackgroundOperation {
        const identity = (value: LorebaseSettings): string => JSON.stringify([value.anilistSync.accessToken, value.anilistSync.username, value.anilistSync.clientId,
            value.anime.folderPath, value.manga.folderPath, value.ratingScale, value.anilistSync.syncDeletions]);
        return this.operations.begin(() => identity(this.currentSettings?.() ?? settings), signal, cancelled, identity(settings));
    }

    getUnlinkedItems(settings: LorebaseSettings): AniListLinkCandidate[] {
        const result: AniListLinkCandidate[] = [];
        for (const kind of ['anime', 'manga'] as const) {
            const folder = this.app.vault.getAbstractFileByPath(settings[kind].folderPath);
            if (!(folder instanceof TFolder)) continue;
            for (const file of getAllMarkdownFiles(folder)) {
                const raw = this.app.metadataCache.getFileCache(file)?.frontmatter;
                if (!raw) continue;
                const data = this.metadataService.resolveFrontmatter(kind, raw);
                if (data.type !== kind || this.readLocalItem(file, kind)) continue;
                result.push({ filePath: file.path, kind, title: String(data.title || file.basename),
                    provider: String(data.integration_provider || 'manual'), image: String(data.image || data.poster || '') });
            }
        }
        return result.sort((a, b) => a.title.localeCompare(b.title));
    }

    async searchLinkMatches(settings: AniListSyncSettings, kind: SyncKind, search: string): Promise<AniListLinkMatch[]> {
        this.requireCredentials(settings);
        const data = await this.graphql<{ Page?: { media?: Array<{
            id: number; title?: { userPreferred?: string; romaji?: string; english?: string };
            startDate?: { year?: number }; format?: string; coverImage?: { large?: string };
        }> } }>(`query ($search: String, $type: MediaType) {
            Page(page: 1, perPage: 20) { media(search: $search, type: $type, sort: SEARCH_MATCH) {
                id title { userPreferred romaji english } startDate { year } format coverImage { large }
            } }
        }`, { search: search.trim(), type: kind.toUpperCase() }, settings.accessToken);
        return (data.Page?.media ?? []).map((media) => ({
            id: media.id, title: media.title?.userPreferred || media.title?.romaji || media.title?.english || String(media.id),
            year: media.startDate?.year ?? null, format: media.format ?? '', image: media.coverImage?.large ?? '',
        }));
    }

    async linkExisting(settings: LorebaseSettings, candidate: AniListLinkCandidate, id: number): Promise<void> {
        const operation = this.begin(settings);
        try {
            this.requireCredentials(settings.anilistSync);
            if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid AniList ID.');
            const available = this.getUnlinkedItems(settings).find((item) => item.filePath === candidate.filePath && item.kind === candidate.kind);
            if (!available) throw new Error('This note is already linked or no longer available.');
            const duplicate = this.readLocalItems(settings[candidate.kind].folderPath, candidate.kind)
                .find((item) => item.integrationId === String(id));
            if (duplicate) throw new Error('Already linked: ' + duplicate.filePath);
            const data = await this.graphql<{ Media?: { id: number; type: string } }>(
                'query ($id: Int, $type: MediaType) { Media(id: $id, type: $type) { id type } }',
                { id, type: candidate.kind.toUpperCase() }, settings.anilistSync.accessToken, operation);
            if (data.Media?.id !== id || data.Media.type !== candidate.kind.toUpperCase()) throw new Error('AniList title does not match this media type.');
            const file = this.app.vault.getAbstractFileByPath(candidate.filePath);
            if (!(file instanceof TFile)) throw new Error('Note not found.');
            await this.metadataService.updateMetadata(file, { anilist_id: String(id) }, candidate.kind, () => { operation.check(); return true; });
            operation.check();
            // A new link starts from the local entry, independently of an old deleted link.
            delete settings.anilistSync.lastSynced[this.snapshotKey(candidate.kind, String(id))];
        } finally { operation.close(); }
    }

    async testConnection(settings: AniListSyncSettings): Promise<string> {
        this.requireCredentials(settings);
        const token = settings.accessToken;
        const result = await this.graphql<{ Viewer?: { name?: string } }>(
            'query { Viewer { name } }',
            {},
            settings.accessToken
        );
        const username = result.Viewer?.name?.trim();
        if (settings.accessToken !== token || this.currentSettings && this.currentSettings().anilistSync.accessToken !== token) {
            const error = new Error('AniList account changed.'); error.name = 'AbortError'; throw error;
        }
        if (!username) throw new Error('AniList did not return the authenticated user.');
        return username;
    }

    getAuthorizationUrl(clientId: string): string {
        const params = new URLSearchParams({
            client_id: clientId.trim(),
            response_type: 'token',
        });
        return `https://anilist.co/api/v2/oauth/authorize?${params.toString()}`;
    }

    async previewImport(settings: LorebaseSettings): Promise<AniListImportCandidate[]> {
        const operation = this.begin(settings);
        try {
            const { username, token } = await this.getAccount(settings.anilistSync, operation);
            const [anime, manga] = await Promise.all([
                this.fetchEntries(username, token, 'ANIME', operation),
                this.fetchEntries(username, token, 'MANGA', operation),
            ]);
            const animeIds = this.getLinkedIds(settings.anime.folderPath, 'anime');
            const mangaIds = this.getLinkedIds(settings.manga.folderPath, 'manga');
            const candidates = [
                ...anime.map((entry) => this.toCandidate(entry, 'anime', animeIds)),
                ...manga.map((entry) => this.toCandidate(entry, 'manga', mangaIds)),
            ];
            for (const kind of ['anime', 'manga'] as const) {
                const folder = this.app.vault.getAbstractFileByPath(settings[kind].folderPath);
                const contains = createLibraryMembership(folder instanceof TFolder ? getAllMarkdownFiles(folder).map(file => ({
                    basename: file.basename, metadata: this.metadataService.resolveFrontmatter(kind, this.app.metadataCache.getFileCache(file)?.frontmatter ?? {}),
                })) : [], kind);
                for (const item of candidates.filter(item => item.kind === kind)) item.alreadyInLibrary = item.linked || contains({ provider: 'anilist', id: item.key.split(':')[1], title: item.title });
            }
            return candidates.sort((left, right) => left.title.localeCompare(right.title));
        } finally { operation.close(); }
    }

    async importSelected(settings: LorebaseSettings, selectedKeys: Set<string>, options: AniListImportOptions = {}): Promise<AniListSyncResult> {
        const operation = this.begin(settings, options.signal, () => options.control?.isCancelled() ?? false);
        const result = this.emptyResult();
        try {
            const { username, token } = await this.getAccount(settings.anilistSync, operation);
            settings.anilistSync.lastSynced ??= {};
            for (const [kind, type] of [['anime', 'ANIME'], ['manga', 'MANGA']] as const) {
                operation.check();
                if (![...selectedKeys].some(key => key.startsWith(`${kind}:`))) continue;
                const entries = await this.fetchEntries(username, token, type, operation);
                const folderPath = kind === 'anime' ? settings.anime.folderPath : settings.manga.folderPath;
                const localById = new Map(this.readLocalItems(folderPath, kind).map((item) => [item.integrationId, item]));
                for (const entry of entries) {
                    const key = this.snapshotKey(kind, String(entry.media.id));
                    if (!selectedKeys.has(key)) continue;
                    if (options.control) await operation.wait(() => options.control!.waitIfPaused());
                    operation.check();
                    options.onItemStart?.(key);
                    try {
                        const local = localById.get(String(entry.media.id));
                        let outcome: 'created' | 'updated' | 'skipped';
                        if (local) {
                            await this.updateLocal(local, entry, settings.ratingScale, operation);
                            result.updatedLocal++;
                            outcome = 'updated';
                        } else {
                            const createdPath = await this.createLocal(settings, kind, entry, operation);
                            if (createdPath) {
                                result.imported++; outcome = 'created';
                                operation.check();
                                settings.anilistSync.lastSynced[key] = { ...this.snapshotFromEntry(entry, kind, settings.ratingScale), localPath: createdPath };
                            } else { result.skipped++; outcome = 'skipped'; }
                        }
                        if (local) {
                            operation.check();
                            settings.anilistSync.lastSynced[key] = { ...this.snapshotFromEntry(entry, kind, settings.ratingScale), localPath: local.filePath };
                        }
                        options.onItemResult?.(key, outcome);
                    } catch (error) {
                        if (isOperationCancelled(error)) throw error;
                        result.failed++;
                        options.onItemResult?.(key, 'failed', error instanceof Error ? error.message : String(error));
                        console.error('[AniList Sync] Failed to import selected entry', key, error);
                    }
                }
            }
            return result;
        } catch (error) { if (!isOperationCancelled(error)) throw error; result.cancelled = true; return result; }
        finally { operation.close(); }
    }

    async sync(settings: LorebaseSettings, signal?: AbortSignal): Promise<AniListSyncResult> {
        const operation = this.begin(settings, signal);
        const result = this.emptyResult();
        try {
            const { username, token } = await this.getAccount(settings.anilistSync, operation);
            settings.anilistSync.lastSynced ??= {};
            await this.syncKind(settings, username, token, 'anime', 'ANIME', result, operation);
            await this.syncKind(settings, username, token, 'manga', 'MANGA', result, operation);
            return result;
        } catch (error) { if (!isOperationCancelled(error)) throw error; result.cancelled = true; return result; }
        finally { operation.close(); }
    }

    recordLocalDeletion(settings: AniListSyncSettings, path: string): boolean {
        let changed = false;
        for (const snapshot of Object.values(settings.lastSynced)) {
            if (snapshot.localPath === path || snapshot.localPath?.startsWith(path + '/')) { snapshot.localDeleted = true; changed = true; }
        }
        return changed;
    }

    recordLocalRename(settings: AniListSyncSettings, oldPath: string, path: string): boolean {
        let changed = false;
        for (const snapshot of Object.values(settings.lastSynced)) {
            if (snapshot.localPath === oldPath || snapshot.localPath?.startsWith(oldPath + '/')) {
                snapshot.localPath = path + snapshot.localPath.slice(oldPath.length);
                snapshot.localDeleted = false; changed = true;
            }
        }
        return changed;
    }

    private async syncKind(
        settings: LorebaseSettings,
        username: string,
        token: string,
        kind: SyncKind,
        type: 'ANIME' | 'MANGA',
        result: AniListSyncResult,
        operation?: BackgroundOperation
    ): Promise<void> {
        const entries = await this.fetchEntries(username, token, type, operation);
        const folderPath = kind === 'anime' ? settings.anime.folderPath : settings.manga.folderPath;
        const folder = this.app.vault.getAbstractFileByPath(folderPath);
        if (!(folder instanceof TFolder)) {
            if (!entries.length && !Object.keys(settings.anilistSync.lastSynced).some(key => key.startsWith(`${kind}:`))) return;
            throw new Error(`AniList sync stopped: library folder is unavailable (${folderPath}). No deletions were applied.`);
        }
        if (getAllMarkdownFiles(folder).some(file => !this.app.metadataCache.getFileCache(file))) {
            throw new Error('AniList sync stopped: local metadata is still loading. Try again after Obsidian finishes indexing.');
        }
        const localItems = this.readLocalItems(folderPath, kind);
        const localById = new Map(localItems.map((item) => [item.integrationId, item]));
        const remoteIds = new Set<string>();

        for (const entry of entries) {
            operation?.check();
            const id = String(entry.media.id);
            const key = this.snapshotKey(kind, id);
            remoteIds.add(id);
            try {
                const local = localById.get(id);
                if (!local) {
                    const previous = settings.anilistSync.lastSynced[key];
                    const folderPrefix = folderPath.replace(/\\/g, '/').replace(/\/$/, '') + '/';
                    const confirmedDeletion = settings.anilistSync.syncDeletions === true && previous?.localDeleted === true
                        && previous.localPath?.startsWith(folderPrefix) && !this.app.vault.getAbstractFileByPath(previous.localPath);
                    if (confirmedDeletion) {
                        await this.deleteRemoteEntry(token, previous.entryId || entry.id, operation);
                        operation?.check();
                        delete settings.anilistSync.lastSynced[key];
                        result.pushed++;
                    } else if (previous) {
                        // A missing, moved, unlinked or unindexed note is not a deletion request.
                        result.skipped++;
                    } else {
                        const createdPath = await this.createLocal(settings, kind, entry, operation);
                        if (createdPath) {
                            operation?.check();
                            settings.anilistSync.lastSynced[key] = { ...this.snapshotFromEntry(entry, kind, settings.ratingScale), localPath: createdPath };
                            result.imported++;
                        } else result.skipped++;
                    }
                    continue;
                }

                const action = await this.reconcileLinkedItem(
                    settings,
                    local,
                    entry,
                    token, operation
                );
                if (action === 'updated') result.updatedLocal++;
                if (action === 'pushed') result.pushed++;
            } catch (error) {
                if (isOperationCancelled(error)) throw error;
                result.failed++;
                console.error(`[AniList Sync] Failed to reconcile ${kind}`, id, error);
            }
        }

        for (const local of localItems) {
            operation?.check();
            if (remoteIds.has(local.integrationId)) continue;
            const key = this.snapshotKey(kind, local.integrationId);
            try {
                const previous = settings.anilistSync.lastSynced[key];
                await this.loadLocalNotes(local, operation);
                const localState = this.snapshotFromLocal(local, settings.ratingScale);
                if (previous && this.sameSnapshot(localState, previous)) {
                    if (settings.anilistSync.syncDeletions === true && previous.localPath === local.filePath) {
                        await this.trashLocalFile(local.filePath, operation);
                        operation?.check();
                        delete settings.anilistSync.lastSynced[key];
                        result.updatedLocal++;
                    } else result.skipped++;
                } else {
                    const entryId = await this.pushLocalItem(token, local, settings.ratingScale, undefined, operation);
                    operation?.check();
                    settings.anilistSync.lastSynced[key] = { ...localState, entryId, localPath: local.filePath };
                    result.pushed++;
                }
            } catch (error) {
                if (isOperationCancelled(error)) throw error;
                result.failed++;
                console.error(`[AniList Sync] Failed to reconcile missing remote ${kind}`, local.filePath, error);
            }
        }
    }

    private async reconcileLinkedItem(
        settings: LorebaseSettings,
        local: LocalSyncItem,
        entry: AniListEntry,
        token: string,
        operation?: BackgroundOperation
    ): Promise<'updated' | 'pushed' | 'unchanged'> {
        const key = this.snapshotKey(local.kind, String(entry.media.id));
        const previous = settings.anilistSync.lastSynced[key];
        await this.loadLocalNotes(local, operation);
        const localState = this.snapshotFromLocal(local, settings.ratingScale);
        const remoteState = this.snapshotFromEntry(entry, local.kind, settings.ratingScale);
        if (!previous) {
            if (local.sourceProvider !== 'anilist') {
                const entryId = await this.pushLocalItem(token, local, settings.ratingScale, undefined, operation);
                operation?.check();
                settings.anilistSync.lastSynced[key] = { ...localState, entryId, localPath: local.filePath };
                return 'pushed';
            }
            await this.updateLocal(local, entry, settings.ratingScale, operation);
            operation?.check();
            settings.anilistSync.lastSynced[key] = { ...remoteState, localPath: local.filePath };
            return 'updated';
        }

        // Merge independently so editing a rating cannot erase remote dates or notes.
        const merged = { ...remoteState };
        const fields = ['status', 'progress', 'score', 'volumeProgress', 'started', 'finished', 'notes'] as const;
        for (const field of fields) {
            const baseline = field === 'score'
                ? previous.localScore ?? this.toAniListRating(this.toLocalRating(previous.score, settings.ratingScale), settings.ratingScale)
                : previous[field];
            const current = localState[field];
            // New fields have no baseline in snapshots made by older plugin versions.
            const changed = baseline === undefined ? Boolean(current) : current !== baseline;
            if (changed) Object.assign(merged, { [field]: current });
        }
        const push = !this.sameSnapshot(merged, remoteState);
        const projected = { ...merged, score: this.toAniListRating(this.toLocalRating(merged.score, settings.ratingScale), settings.ratingScale) };
        const pull = !this.sameSnapshot(localState, projected);
        if (push) {
            merged.entryId = await this.pushLocalItem(token, {
                ...local,
                status: this.toLocalStatus(merged.status),
                userRating: this.toLocalRating(merged.score, settings.ratingScale),
                episodeCurrent: merged.progress,
                chapterCurrent: merged.progress,
                volumeCurrent: merged.volumeProgress,
                started: merged.started ?? '', finished: merged.finished ?? '', notes: merged.notes ?? '',
            }, settings.ratingScale, merged.score, operation);
        }
        if (pull) {
            await this.updateLocal(local, {
                ...entry, status: merged.status, score: merged.score,
                progress: merged.progress, progressVolumes: merged.volumeProgress,
                startedAt: this.toSyncDate(merged.started ?? ''),
                completedAt: this.toSyncDate(merged.finished ?? ''), notes: merged.notes ?? '',
            }, settings.ratingScale, operation);
        }
        operation?.check();
        settings.anilistSync.lastSynced[key] = { ...merged, localScore: projected.score, localPath: local.filePath, localDeleted: false };
        return push ? 'pushed' : pull ? 'updated' : 'unchanged';
    }

    private async fetchEntries(username: string, token: string, type: 'ANIME' | 'MANGA', operation?: BackgroundOperation): Promise<AniListEntry[]> {
        const query = `query ($userName: String, $type: MediaType, $chunk: Int) {
  MediaListCollection(userName: $userName, type: $type, chunk: $chunk, perChunk: 500) {
    hasNextChunk
    lists {
      entries {
        id status score(format: POINT_100) progress progressVolumes
        startedAt { year month day } completedAt { year month day } notes
        media {
          id title { userPreferred romaji english } description(asHtml: false)
          episodes chapters volumes format countryOfOrigin startDate { year month day }
          coverImage { large extraLarge } siteUrl genres isAdult
          studios(isMain: true) { nodes { name } }
        }
      }
    }
  }
}`;
        const entries = new Map<number, AniListEntry>();
        // Fetch every chunk before any reconciliation or deletion; custom lists can repeat an entry.
        for (let chunk = 1; chunk <= 200; chunk++) {
            const data = await this.graphql<{ MediaListCollection?: { hasNextChunk?: boolean; lists?: Array<{ entries?: AniListEntry[] }> } }>(
                query, { userName: username, type, chunk }, token, operation
            );
            const collection = data.MediaListCollection;
            const lists = collection?.lists;
            if (typeof collection?.hasNextChunk !== 'boolean' || !Array.isArray(lists) || lists.some(list => !list || !Array.isArray(list.entries))) {
                throw new Error('AniList returned an incomplete library. Sync was stopped to protect your entries.');
            }
            const batch = lists.flatMap(list => list.entries ?? []);
            for (const entry of batch) {
                if (!entry || !Number.isInteger(entry.id) || entry.id <= 0 || !Number.isInteger(entry.media?.id) || entry.media.id <= 0) {
                    throw new Error('AniList returned an invalid entry. Sync was stopped to protect your entries.');
                }
                entries.set(entry.media.id, entry);
            }
            if (!collection.hasNextChunk) return [...entries.values()];
            if (!batch.length) throw new Error('AniList returned an empty intermediate chunk. No sync changes were applied.');
        }
        throw new Error('The AniList collection exceeded the safety limit. No sync changes were applied.');
    }

    private async updateLocal(item: LocalSyncItem, entry: AniListEntry, rating: RatingScaleSettings, operation?: BackgroundOperation): Promise<void> {
        operation?.check();
        this.assertActive();
        const file = this.app.vault.getAbstractFileByPath(item.filePath);
        if (!(file instanceof TFile)) return;
        const updates: Record<string, unknown> = {
            status: this.toLocalStatus(entry.status),
            rating: this.toLocalRating(entry.score, rating),
            ...(item.sourceProvider === 'anilist' ? {
                integration_provider: 'anilist', integration_id: String(entry.media.id),
                url: entry.media.siteUrl ?? null,
            } : {}),
            started: this.dateText(entry.startedAt),
            finished: this.dateText(entry.completedAt),
            ...(item.kind === 'anime' ? { dateWatched: this.dateText(entry.completedAt) } : {}),
        };
        if (item.kind === 'anime') {
            updates.episode_current = entry.progress;
            updates.episode_total = entry.media.episodes ?? null;
            const raw = this.app.metadataCache.getFileCache(file)?.frontmatter;
            const fm = raw ? this.metadataService.resolveFrontmatter('anime', raw) : {};
            const parts: unknown[] = Array.isArray(fm.anime_parts) ? fm.anime_parts : [];
            const index = parts.findIndex(part => part && typeof part === 'object' && 'id' in part && String(part.id) === String(fm.active_part_id));
            const target = index >= 0 ? index : parts.length === 1 ? 0 : -1;
            const saved = target >= 0 && parts[target] && typeof parts[target] === 'object' ? parts[target] as Record<string, unknown> : null;
            if (saved && readEpisodeFields(saved).watchedEpisodes !== undefined) {
                const draft = { ...readEpisodeFields(saved), episodeCurrent: entry.progress, episodeTotal: entry.media.episodes ?? null };
                resizeEpisodeSelection(draft, entry.progress); normalizeEpisodePart(draft);
                const next = { ...saved, ...episodeFields(draft), episode_current: draft.episodeCurrent, episode_total: draft.episodeTotal, status: this.toLocalStatus(entry.status) };
                for (const key of ['watchedEpisodes', 'episodeDetails', 'episodeTracking', 'episodeCurrent', 'episodeTotal']) delete (next as Record<string, unknown>)[key];
                updates.anime_parts = parts.map((part, n) => n === target ? next : part);
                updates.episode_total = draft.episodeTotal;
            }
        } else {
            updates.chapter_current = entry.progress;
            updates.chapter_total = entry.media.chapters ?? null;
            updates.volume_current = entry.progressVolumes ?? null;
            updates.volume_total = entry.media.volumes ?? null;
        }
        await this.metadataService.updateMetadata(file, updates, item.kind, () => { operation?.check(); return true; });
        this.assertActive();
        await updateMarkdownSection(this.app, file, entry.notes ?? '', 'My Notes', operation?.check);
    }

    private async createLocal(settings: LorebaseSettings, kind: SyncKind, entry: AniListEntry, operation?: BackgroundOperation): Promise<string | null> {
        operation?.check();
        const media = entry.media;
        const title = this.titleFor(media) || `AniList ${media.id}`;
        const folderPath = kind === 'anime' ? settings.anime.folderPath : settings.manga.folderPath;
        await this.ensureFolder(folderPath);
        const filePath = `${folderPath ? `${folderPath}/` : ''}${this.sanitizeFileName(title)}.md`;
        if (this.app.vault.getAbstractFileByPath(filePath)) return null;
        const poster = media.coverImage?.extraLarge || media.coverImage?.large || '';
        const values: Record<string, unknown> = {
            name: title,
            image: poster,
            ImageHorizontal: poster,
            Poster: poster,
            PosterHorizontal: poster,
            Plot: stripHtml((media.description || '').replace(/<br\s*\/?\s*>/gi, ' ')),
            tags: [],
            genres: media.genres ?? [],
            studios: (media.studios?.nodes ?? []).map((studio) => studio.name).filter(Boolean),
            Year: media.startDate?.year ?? 0,
            released: formatFuzzyDate(media.startDate ?? null),
            format: mapAnimeFormat(media.format ?? ''),
            workType: inferMangaWorkType(media.format, media.countryOfOrigin),
            seasonCurrent: 0,
            episodeCurrent: entry.progress || 0,
            episodeTotal: media.episodes ?? 0,
            chapterCurrent: entry.progress || 0,
            chapterTotal: media.chapters ?? 0,
            volumeCurrent: entry.progressVolumes ?? 0,
            volumeTotal: media.volumes ?? 0,
            activePartId: '',
            animePartsYaml: '  []',
            mangaPartsYaml: '  []',
            authors: [],
            artists: [],
            isAdult: media.isAdult ?? false,
            rating: this.toLocalRating(entry.score, settings.ratingScale) ?? 0,
            communityRating: '',
            communityVotes: '',
            communityRatingProvider: '',
            status: this.toLocalStatus(entry.status),
            started: this.dateText(entry.startedAt),
            finished: this.dateText(entry.completedAt),
            integrationProvider: 'anilist',
            integrationId: String(media.id),
            anilistId: String(media.id),
            url: media.siteUrl || 'https://anilist.co/' + kind + '/' + media.id,
        };
        const config = settings.integrations?.media[kind];
        const fallback = buildSimpleTemplate(kind, getDefaultTemplateFields(kind), {}, []);
        const template = config?.templateEnabled
            ? config.templateMode === 'advanced' && config.template.trim()
                ? config.template
                : buildSimpleTemplate(kind, config.templateFields ?? getDefaultTemplateFields(kind), config.fieldAliases, config.wikilinkFields)
            : fallback;
        let content = renderTemplate(template, { type: kind, ...values });
        if (!/^---\r?\n/.test(content)) {
            content = renderTemplate(fallback, values) + '\n\n' + content.trim();
        }
        const aliases = parseTemplateFieldAliases(kind === 'anime' ? 'anime' : 'manga', template);
        content = ensureIntegrationSourceFrontmatter(content, 'anilist', String(media.id), aliases);
        const dates = ['started: ' + JSON.stringify(this.dateText(entry.startedAt)),
            'finished: ' + JSON.stringify(this.dateText(entry.completedAt))];
        if (kind === 'anime') {
            dates.push('lorebase_anime_genres_migrated: true');
            if (!/^genres:/m.test(content)) dates.push('genres: ' + JSON.stringify(media.genres ?? []));
        }
        // Operational sync fields must work even with templates created before date support.
        for (const line of dates) {
            const field = line.split(':')[0];
            const target = aliases[field] ?? field;
            const yamlKey = /^[A-Za-z_][A-Za-z0-9_]*$/.test(target) ? target : JSON.stringify(target);
            const replacement = yamlKey + line.slice(field.length);
            const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
            if (frontmatter) {
                const rows = frontmatter[1].split('\n');
                const index = rows.findIndex(row => [target + ':', JSON.stringify(target) + ':', "'" + target + "':"].some(prefix => row.startsWith(prefix)));
                if (index >= 0) rows[index] = replacement;
                else rows.push(replacement);
                content = '---\n' + rows.join('\n').trimEnd() + '\n---' + content.slice(frontmatter[0].length);
            }
        }
        content = upsertMarkdownSection(content, 'My Notes', entry.notes ?? '');
        content = orderTemplateContent(content, template, { compact: settings.integrations?.compactTemplates });
        this.assertActive();
        operation?.check();
        await this.app.vault.create(filePath, content);
        return filePath;
    }

    private readLocalItems(folderPath: string, kind: SyncKind): LocalSyncItem[] {
        const folder = this.app.vault.getAbstractFileByPath(folderPath);
        if (!(folder instanceof TFolder)) return [];
        return getAllMarkdownFiles(folder)
            .map((file) => this.readLocalItem(file, kind))
            .filter((item): item is LocalSyncItem => Boolean(item));
    }

    private readLocalItem(file: TFile, kind: SyncKind): LocalSyncItem | null {
        const raw = this.app.metadataCache.getFileCache(file)?.frontmatter;
        const frontmatter = raw ? this.metadataService.resolveFrontmatter(kind, raw) : undefined;
        if (!frontmatter) return null;
        const sourceProvider = String(frontmatter.integration_provider ?? '').toLowerCase();
        const integrationId = String(sourceProvider === 'anilist'
            ? frontmatter.integration_id ?? '' : frontmatter.anilist_id ?? '').trim();
        if (!/^\d+$/.test(integrationId) || Number(integrationId) <= 0) return null;
        const status = this.normalizeLocalStatus(frontmatter.status);
        return {
            sourceProvider,
            kind,
            filePath: file.path,
            integrationId,
            status,
            userRating: parseStoredUserRating(frontmatter.rating),
            episodeCurrent: this.numberOrZero(frontmatter.episode_current),
            chapterCurrent: this.numberOrZero(frontmatter.chapter_current),
            volumeCurrent: this.numberOrZero(frontmatter.volume_current),
            started: this.normalizeDate(frontmatter.started ?? frontmatter.dateStarted ?? frontmatter.start_date),
            finished: this.normalizeDate(frontmatter.finished ?? frontmatter.dateFinished ?? frontmatter.finish_date ?? frontmatter.dateWatched ?? frontmatter.dateRead),
            notes: '',
        };
    }

    private async pushLocalItem(token: string, item: LocalSyncItem, rating: RatingScaleSettings, scoreRaw = this.toAniListRating(item.userRating, rating), operation?: BackgroundOperation): Promise<number> {
        const isManga = item.kind === 'manga';
        const mutation = `mutation ($mediaId: Int, $status: MediaListStatus, $scoreRaw: Int, $progress: Int, $progressVolumes: Int, $startedAt: FuzzyDateInput, $completedAt: FuzzyDateInput, $notes: String) {
  SaveMediaListEntry(mediaId: $mediaId, status: $status, scoreRaw: $scoreRaw, progress: $progress, progressVolumes: $progressVolumes, startedAt: $startedAt, completedAt: $completedAt, notes: $notes) { id }
}`;
        const variables: Record<string, unknown> = {
            mediaId: Number(item.integrationId),
            status: this.toAniListStatus(item.status),
            scoreRaw,
            startedAt: this.toSyncDate(item.started),
            completedAt: this.toSyncDate(item.finished),
            notes: item.notes,
            progress: Math.max(0, Math.trunc(isManga ? item.chapterCurrent : item.episodeCurrent)),
            progressVolumes: isManga ? Math.max(0, Math.trunc(item.volumeCurrent)) : undefined,
        };
        if (item.notes.length > 6000) throw new Error('AniList notes cannot exceed 6000 characters. Shorten My Notes before syncing.');
        const result = await this.graphql<{ SaveMediaListEntry?: { id?: number } }>(mutation, variables, token, operation);
        return Number(result.SaveMediaListEntry?.id) || 0;
    }

    private async deleteRemoteEntry(token: string, entryId: number, operation?: BackgroundOperation): Promise<void> {
        if (!entryId) throw new Error('AniList list entry ID is missing.');
        await this.graphql(
            'mutation ($id: Int) { DeleteMediaListEntry(id: $id) { deleted } }',
            { id: entryId },
            token, operation
        );
    }

    private async trashLocalFile(filePath: string, operation?: BackgroundOperation): Promise<void> {
        operation?.check();
        this.assertActive();
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof TFile) await this.app.fileManager.trashFile(file);
    }

    private async graphql<T>(query: string, variables: Record<string, unknown>, token: string, operation?: BackgroundOperation): Promise<T> {
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                operation?.check();
                const request = () => requestUrl({
                    url: ANILIST_ENDPOINT,
                    method: 'POST',
                    headers: withAniListHeaders(ANILIST_ENDPOINT, {
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                        Authorization: `Bearer ${token}`,
                    }),
                    body: JSON.stringify({ query, variables }),
                    throw: false,
                });
                const response = await (operation ? operation.wait(request) : requestWithDeadline(request, undefined, this.lifetime.signal));
                this.assertActive();
                if (response.status === 429) throw new Error('AniList rate limit reached (429).');
                if (response.status === 403) {
                    throw new Error('AniList denied access (HTTP 403). The API may be temporarily unavailable or your network may be blocked. Try again later.');
                }
                if (response.status >= 400) throw new Error(`AniList request failed (HTTP ${response.status}).`);
                const body = response.json as { data?: T; errors?: Array<{ message?: string }> };
                if (body.errors?.length) {
                    throw new Error(body.errors.map((error) => error.message || 'AniList API error').join('; '));
                }
                if (!body.data) throw new Error('AniList returned no data.');
                return body.data;
            } catch (error) {
                if (!this.isRateLimitError(error) || attempt === 2) throw error;
                await new Promise<void>((resolve) => window.setTimeout(resolve, (attempt + 1) * 2000));
            }
        }
        throw new Error('AniList request failed.');
    }

    private async getAccount(settings: AniListSyncSettings, operation?: BackgroundOperation): Promise<{ username: string; token: string }> {
        this.requireCredentials(settings);
        const token = settings.accessToken;
        const username = settings.username.trim() || await this.testConnection(settings);
        operation?.check();
        if (token !== settings.accessToken) { const error = new Error('AniList account changed.'); error.name = 'AbortError'; throw error; }
        return { username, token };
    }

    private requireCredentials(settings: AniListSyncSettings): void {
        if (!settings.accessToken.trim()) throw new Error('AniList access token is missing.');
    }

    private isRateLimitError(error: unknown): boolean {
        return error instanceof Error && /(?:429|rate limit|too many requests)/i.test(error.message);
    }

    private getLinkedIds(folderPath: string, kind: SyncKind): Set<string> {
        return new Set(this.readLocalItems(folderPath, kind).map((item) => item.integrationId));
    }

    private toCandidate(entry: AniListEntry, kind: SyncKind, linked: Set<string>): AniListImportCandidate {
        return {
            key: this.snapshotKey(kind, String(entry.media.id)),
            kind,
            title: this.titleFor(entry.media) || `AniList ${entry.media.id}`,
            status: this.toLocalStatus(entry.status),
            progress: entry.progress || 0,
            image: entry.media.coverImage?.large || entry.media.coverImage?.extraLarge || '',
            linked: linked.has(String(entry.media.id)),
        };
    }

    private snapshotFromEntry(entry: AniListEntry, kind: SyncKind, rating: RatingScaleSettings): AniListSyncSnapshot {
        return {
            entryId: entry.id,
            started: this.dateText(entry.startedAt),
            finished: this.dateText(entry.completedAt),
            notes: (entry.notes ?? '').trim(),
            localScore: this.toAniListRating(this.toLocalRating(entry.score, rating), rating),
            status: this.toAniListStatus(this.toLocalStatus(entry.status)),
            progress: Math.max(0, Math.trunc(entry.progress || 0)),
            score: Math.max(0, Math.min(100, entry.score || 0)),
            volumeProgress: kind === 'manga' ? Math.max(0, Math.trunc(entry.progressVolumes || 0)) : 0,
        };
    }

    private snapshotFromLocal(item: LocalSyncItem, rating: RatingScaleSettings): AniListSyncSnapshot {
        return {
            started: item.started, finished: item.finished, notes: item.notes,
            localScore: this.toAniListRating(item.userRating, rating),
            status: this.toAniListStatus(item.status),
            progress: Math.max(0, Math.trunc(item.kind === 'anime' ? item.episodeCurrent : item.chapterCurrent)),
            score: this.toAniListRating(item.userRating, rating),
            volumeProgress: item.kind === 'manga' ? Math.max(0, Math.trunc(item.volumeCurrent)) : 0,
        };
    }

    private sameSnapshot(left: AniListSyncSnapshot, right: AniListSyncSnapshot): boolean {
        return left.status === right.status
            && left.progress === right.progress
            && Math.round(left.score) === Math.round(right.score)
            && left.volumeProgress === right.volumeProgress
            && (left.started ?? '') === (right.started ?? '')
            && (left.finished ?? '') === (right.finished ?? '')
            && (left.notes ?? '') === (right.notes ?? '');
    }

    private toAniListStatus(status: AnimeStatus  ): string {
        const map: Record<AnimeStatus, string> = {
            planned: 'PLANNING',
            watching: 'CURRENT',
            completed: 'COMPLETED',
            dropped: 'DROPPED',
            paused: 'PAUSED',
            to_be_released: 'PLANNING',
        };
        return map[status] ?? 'PLANNING';
    }

    private toLocalStatus(status: string): AnimeStatus {
        const map: Record<string, AnimeStatus> = {
            PLANNING: 'planned',
            CURRENT: 'watching',
            COMPLETED: 'completed',
            DROPPED: 'dropped',
            PAUSED: 'paused',
            REPEATING: 'watching',
        };
        return map[status] ?? 'planned';
    }

    private normalizeLocalStatus(value: unknown): AnimeStatus {
        const status = String(value ?? '').toLowerCase() as AnimeStatus;
        return ['planned', 'watching', 'completed', 'dropped', 'paused', 'to_be_released'].includes(status)
            ? status
            : 'planned';
    }

    private toLocalRating(score: number, settings: RatingScaleSettings): UserRating {
        if (!score || score <= 0) return null;
        const max = getRatingMax(settings);
        const step = getRatingStep(settings);
        const scaled = Math.max(1, Math.min(max, (score / 100) * max));
        return roundRatingToStep(scaled, step);
    }

    private toAniListRating(value: UserRating, settings: RatingScaleSettings): number {
        if (!value) return 0;
        return Math.max(0, Math.min(100, Math.round((value / getRatingMax(settings)) * 100)));
    }

    private async loadLocalNotes(item: LocalSyncItem, operation?: BackgroundOperation): Promise<void> {
        operation?.check();
        const file = this.app.vault.getAbstractFileByPath(item.filePath);
        if (file instanceof TFile) item.notes = extractMarkdownSection(await this.app.vault.read(file)).trim();
        operation?.check();
    }

    private dateText(value?: SyncDate | null): string {
        if (!value || (!value.year && !value.month && !value.day)) return '';
        return [String(value.year ?? 0).padStart(4, '0'), String(value.month ?? 0).padStart(2, '0'), String(value.day ?? 0).padStart(2, '0')].join('-');
    }

    private normalizeDate(value: unknown): string {
        if (value instanceof Date) return value.toISOString().slice(0, 10);
        const text = String(value ?? '').trim();
        if (!/^\d{4}(?:-\d{2}){0,2}$/.test(text)) return '';
        const [year, month = '00', day = '00'] = text.split('-');
        return [year, month, day].join('-');
    }

    private toSyncDate(value: string): SyncDate {
        const [year, month, day] = value.split('-').map(Number);
        return { year: year || null, month: month || null, day: day || null };
    }

    private titleFor(media: AniListEntry['media']): string {
        return media.title?.userPreferred || media.title?.english || media.title?.romaji || '';
    }

    private snapshotKey(kind: SyncKind, id: string): string {
        return `${kind}:${id}`;
    }

    private emptyResult(): AniListSyncResult {
        return { imported: 0, updatedLocal: 0, pushed: 0, skipped: 0, failed: 0 };
    }

    private numberOrZero(value: unknown): number {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    private sanitizeFileName(value: string): string {
        return value.replace(/[\\/:*?"<>|]/g, '-').trim() || 'Untitled';
    }

    private async ensureFolder(path: string): Promise<void> {
        if (!path || this.app.vault.getAbstractFileByPath(path)) return;
        let current = '';
        for (const part of path.split('/').filter(Boolean)) {
            current = current ? `${current}/${part}` : part;
            if (!this.app.vault.getAbstractFileByPath(current)) await this.app.vault.createFolder(current);
        }
    }
}
