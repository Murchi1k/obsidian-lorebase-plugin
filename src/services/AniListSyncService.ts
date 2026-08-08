import { App, TFile, TFolder, requestUrl } from 'obsidian';
import type { AniListSyncSettings, AnimeItem, AnimeStatus, LorebaseSettings, MangaItem, ReadingStatus } from '../types';
import { MetadataService } from './MetadataService';
import { getAllMarkdownFiles } from './media/serviceUtils';

const ANILIST_ENDPOINT = 'https://graphql.anilist.co';
export const ANILIST_OAUTH_REDIRECT_URI = 'https://anilist.co/api/v2/oauth/pin';

type AniListEntry = {
    id: number;
    status: string;
    score: number;
    progress: number;
    startedAt?: { year?: number; month?: number; day?: number } | null;
    completedAt?: { year?: number; month?: number; day?: number } | null;
    media: {
        id: number;
        title?: { userPreferred?: string; romaji?: string; english?: string };
        description?: string | null;
        episodes?: number | null;
        chapters?: number | null;
        volumes?: number | null;
        format?: string | null;
        startDate?: { year?: number } | null;
        coverImage?: { large?: string; extraLarge?: string } | null;
        siteUrl?: string | null;
    };
};

export interface AniListSyncResult {
    imported: number;
    updatedLocal: number;
    pushed: number;
    skipped: number;
    failed: number;
}

export class AniListSyncService {
    private readonly app: App;
    private readonly metadataService: MetadataService;

    constructor(app: App, metadataService: MetadataService) {
        this.app = app;
        this.metadataService = metadataService;
    }

    async testConnection(settings: AniListSyncSettings): Promise<string> {
        this.requireCredentials(settings);
        const result = await this.graphql<{ Viewer?: { name?: string } }>(
            `query { Viewer { name } }`,
            {},
            settings.accessToken
        );
        const username = result.Viewer?.name?.trim();
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

    captureImplicitToken(settings: AniListSyncSettings, tokenOrUrl: string): string {
        const token = this.extractAccessToken(tokenOrUrl);
        if (!token) throw new Error('No AniList access token was found.');
        settings.accessToken = token;
        return token;
    }

    async exchangeAuthorizationCode(settings: AniListSyncSettings, codeOrUrl: string): Promise<string> {
        if (!settings.clientId.trim()) throw new Error('AniList client ID is missing.');
        if (!settings.clientSecret.trim()) throw new Error('AniList client secret is missing.');
        const code = this.extractAuthorizationCode(codeOrUrl);
        if (!code) throw new Error('No AniList authorization code was found.');

        const params = new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: settings.clientId.trim(),
            client_secret: settings.clientSecret.trim(),
            redirect_uri: ANILIST_OAUTH_REDIRECT_URI,
            code,
        });
        const response = await requestUrl({
            url: 'https://anilist.co/api/v2/oauth/token',
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
            body: params.toString(),
        });
        const body = response.json as { access_token?: string; error?: string; message?: string };
        if (!body.access_token) {
            throw new Error(body.message || body.error || 'AniList did not return an access token.');
        }
        settings.accessToken = body.access_token;
        return body.access_token;
    }

    async sync(settings: LorebaseSettings): Promise<AniListSyncResult> {
        this.requireCredentials(settings.anilistSync);

        const username = settings.anilistSync.username.trim() || (await this.testConnection(settings.anilistSync));
        const entries = await this.fetchEntries(username, settings.anilistSync.accessToken, 'ANIME');
        const animeFolder = this.app.vault.getAbstractFileByPath(settings.anime.folderPath);
        const localItems = animeFolder instanceof TFolder
            ? getAllMarkdownFiles(animeFolder)
                .map((file) => this.readLinkedAnime(file))
                .filter((item): item is AnimeItem => Boolean(item))
            : [];
        const byAniListId = new Map(
            localItems
                .filter((item) => item.integrationProvider === 'anilist' && item.integrationId)
                .map((item): [string, AnimeItem] => [item.integrationId as string, item])
        );

        const result: AniListSyncResult = { imported: 0, updatedLocal: 0, pushed: 0, skipped: 0, failed: 0 };
        const remoteIds = new Set<string>();

        for (const entry of entries) {
            const id = String(entry.media.id);
            remoteIds.add(id);
            try {
                const local = byAniListId.get(id);
                if (local) {
                    await this.updateLocalFromEntry(local, entry);
                    result.updatedLocal++;
                } else {
                    const imported = await this.createLocalFromEntry(settings, entry);
                    if (imported) result.imported++;
                    else result.skipped++;
                }
            } catch (error) {
                result.failed++;
                console.error('[AniList Sync] Failed to import/update entry', id, error);
            }
        }

        // Push only notes that are explicitly linked to AniList. Unlinked notes are never guessed or overwritten.
        for (const item of localItems) {
            if (item.integrationProvider !== 'anilist' || !item.integrationId || !remoteIds.has(item.integrationId)) {
                result.skipped++;
                continue;
            }
            try {
                await this.pushLocalItem(settings.anilistSync.accessToken, item);
                result.pushed++;
            } catch (error) {
                result.failed++;
                console.error('[AniList Sync] Failed to push entry', item.filePath, error);
            }
        }

        const mangaResult = await this.syncManga(settings, username);
        result.imported += mangaResult.imported;
        result.updatedLocal += mangaResult.updatedLocal;
        result.pushed += mangaResult.pushed;
        result.skipped += mangaResult.skipped;
        result.failed += mangaResult.failed;

        return result;
    }

    private async fetchEntries(username: string, token: string, type: 'ANIME' | 'MANGA'): Promise<AniListEntry[]> {
        const query = `query ($userName: String, $type: MediaType) {
  MediaListCollection(userName: $userName, type: $type) {
    lists {
      entries {
        id status score progress startedAt { year month day } completedAt { year month day }
        media { id title { userPreferred romaji english } description(asHtml: false) episodes format startDate { year } coverImage { large extraLarge } siteUrl }
      }
    }
  }
}`;
        const data = await this.graphql<{ MediaListCollection?: { lists?: Array<{ entries?: AniListEntry[] }> } }>(
            query,
            { userName: username, type },
            token
        );
        return (data.MediaListCollection?.lists ?? []).flatMap((list) => list.entries ?? []);
    }

    private async syncManga(settings: LorebaseSettings, username: string): Promise<AniListSyncResult> {
        const entries = await this.fetchEntries(username, settings.anilistSync.accessToken, 'MANGA');
        const folder = this.app.vault.getAbstractFileByPath(settings.manga.folderPath);
        const localItems = folder instanceof TFolder
            ? getAllMarkdownFiles(folder).map((file) => this.readLinkedManga(file)).filter((item): item is MangaItem => Boolean(item))
            : [];
        const byAniListId = new Map(localItems.map((item): [string, MangaItem] => [item.integrationId as string, item]));
        const result: AniListSyncResult = { imported: 0, updatedLocal: 0, pushed: 0, skipped: 0, failed: 0 };
        const remoteIds = new Set<string>();

        for (const entry of entries) {
            const id = String(entry.media.id);
            remoteIds.add(id);
            try {
                const local = byAniListId.get(id);
                if (local) {
                    await this.updateLocalMangaFromEntry(local, entry);
                    result.updatedLocal++;
                } else {
                    const imported = await this.createLocalMangaFromEntry(settings, entry);
                    if (imported) result.imported++;
                    else result.skipped++;
                }
            } catch (error) {
                result.failed++;
                console.error('[AniList Sync] Failed to import/update manga entry', id, error);
            }
        }

        for (const item of localItems) {
            if (!item.integrationId || !remoteIds.has(item.integrationId)) {
                result.skipped++;
                continue;
            }
            try {
                await this.pushLocalMangaItem(settings.anilistSync.accessToken, item);
                result.pushed++;
            } catch (error) {
                result.failed++;
                console.error('[AniList Sync] Failed to push manga entry', item.filePath, error);
            }
        }
        return result;
    }

    private async updateLocalFromEntry(item: AnimeItem, entry: AniListEntry): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(item.filePath);
        if (!(file instanceof TFile)) return;
        const status = this.toLocalStatus(entry.status);
        const userRating = this.toLocalRating(entry.score);
        item.status = status;
        item.episodeCurrent = entry.progress;
        item.episodeTotal = entry.media.episodes ?? null;
        item.userRating = userRating as AnimeItem['userRating'];
        await this.metadataService.updateMetadata(file, {
            status,
            episode_current: entry.progress,
            episode_total: entry.media.episodes ?? null,
            rating: userRating,
            integration_provider: 'anilist',
            integration_id: String(entry.media.id),
            url: entry.media.siteUrl ?? null,
        });
    }

    private async createLocalFromEntry(settings: LorebaseSettings, entry: AniListEntry): Promise<boolean> {
        const media = entry.media;
        const title = this.titleFor(media) || `AniList ${media.id}`;
        const folderPath = settings.anime.folderPath;
        await this.ensureFolder(folderPath);
        const filePath = `${folderPath ? `${folderPath}/` : ''}${this.sanitizeFileName(title)}.md`;
        const existing = this.app.vault.getAbstractFileByPath(filePath);
        if (existing instanceof TFile) return false;

        const content = `---
title: ${this.yaml(title)}
image: ${this.yaml(media.coverImage?.extraLarge || media.coverImage?.large || '')}
plot: ${this.yaml(media.description || '')}
year: ${media.startDate?.year ?? ''}
format: ${this.yaml(this.toLocalFormat(media.format))}
episode_current: ${entry.progress}
episode_total: ${media.episodes ?? ''}
rating: ${this.toLocalRating(entry.score) ?? ''}
status: ${this.toLocalStatus(entry.status)}
favorite: false
integration_provider: anilist
integration_id: ${this.yaml(String(media.id))}
url: ${this.yaml(media.siteUrl || `https://anilist.co/anime/${media.id}`)}
---
`;
        await this.app.vault.create(filePath, content);
        return true;
    }

    private async updateLocalMangaFromEntry(item: MangaItem, entry: AniListEntry): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(item.filePath);
        if (!(file instanceof TFile)) return;
        const status = this.toLocalStatus(entry.status) as ReadingStatus;
        const userRating = this.toLocalRating(entry.score);
        item.status = status;
        item.chapterCurrent = entry.progress;
        item.chapterTotal = entry.media.chapters ?? null;
        item.userRating = userRating as MangaItem['userRating'];
        await this.metadataService.updateMetadata(file, {
            status,
            chapter_current: entry.progress,
            chapter_total: entry.media.chapters ?? null,
            volume_total: entry.media.volumes ?? null,
            rating: userRating,
            integration_provider: 'anilist',
            integration_id: String(entry.media.id),
            url: entry.media.siteUrl ?? null,
        });
    }

    private async createLocalMangaFromEntry(settings: LorebaseSettings, entry: AniListEntry): Promise<boolean> {
        const media = entry.media;
        const title = this.titleFor(media) || `AniList ${media.id}`;
        await this.ensureFolder(settings.manga.folderPath);
        const filePath = `${settings.manga.folderPath ? `${settings.manga.folderPath}/` : ''}${this.sanitizeFileName(title)}.md`;
        if (this.app.vault.getAbstractFileByPath(filePath) instanceof TFile) return false;
        const content = `---
title: ${this.yaml(title)}
poster: ${this.yaml(media.coverImage?.extraLarge || media.coverImage?.large || '')}
plot: ${this.yaml(media.description || '')}
year: ${media.startDate?.year ?? ''}
chapter_current: ${entry.progress}
chapter_total: ${media.chapters ?? ''}
volume_total: ${media.volumes ?? ''}
rating: ${this.toLocalRating(entry.score) ?? ''}
status: ${this.toLocalStatus(entry.status)}
favorite: false
integration_provider: anilist
integration_id: ${this.yaml(String(media.id))}
url: ${this.yaml(media.siteUrl || `https://anilist.co/manga/${media.id}`)}
---
`;
        await this.app.vault.create(filePath, content);
        return true;
    }

    private async pushLocalItem(token: string, item: AnimeItem): Promise<void> {
        const mutation = `mutation ($mediaId: Int, $status: MediaListStatus, $score: Float, $progress: Int) {
  SaveMediaListEntry(mediaId: $mediaId, status: $status, score: $score, progress: $progress) { id }
}`;
        await this.graphql(mutation, {
            mediaId: Number(item.integrationId),
            status: this.toAniListStatus(item.status),
            score: item.userRating ? item.userRating * 20 : 0,
            progress: Math.max(0, Math.trunc(item.episodeCurrent ?? 0)),
        }, token);
    }

    private async pushLocalMangaItem(token: string, item: MangaItem): Promise<void> {
        const mutation = `mutation ($mediaId: Int, $status: MediaListStatus, $score: Float, $progress: Int) {
  SaveMediaListEntry(mediaId: $mediaId, status: $status, score: $score, progress: $progress) { id }
}`;
        await this.graphql(mutation, {
            mediaId: Number(item.integrationId),
            status: this.toAniListStatus(item.status),
            score: item.userRating ? item.userRating * 20 : 0,
            progress: Math.max(0, Math.trunc(item.chapterCurrent ?? 0)),
        }, token);
    }

    private readLinkedAnime(file: TFile): AnimeItem | null {
        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
        if (!frontmatter || String(frontmatter.integration_provider ?? '').toLowerCase() !== 'anilist') return null;
        const integrationId = frontmatter.integration_id;
        if (integrationId === undefined || integrationId === null || String(integrationId).trim() === '') return null;
        const status = String(frontmatter.status ?? 'planned').toLowerCase();
        const rating = Number(frontmatter.rating);
        const progress = Number(frontmatter.episode_current);
        return {
            type: 'anime', filePath: file.path,
            displayName: String(frontmatter.title ?? frontmatter.name ?? file.basename),
            nameLower: String(frontmatter.title ?? frontmatter.name ?? file.basename).toLowerCase(),
            year: Number(frontmatter.year) || null, description: String(frontmatter.plot ?? ''), summary: String(frontmatter.plot ?? ''),
            userRating: rating >= 1 && rating <= 5 ? Math.trunc(rating) as 1 | 2 | 3 | 4 | 5 : null,
            favorite: String(frontmatter.favorite).toLowerCase() === 'true', poster: String(frontmatter.image ?? ''),
            imageUrl: String(frontmatter.image ?? ''), hasCustomPoster: false, isAdult: false,
            format: this.toLocalFormat(String(frontmatter.format ?? 'tv')), status: this.isLocalStatus(status) ? status : 'planned',
            seasonCurrent: Number(frontmatter.season_current) || null, episodeCurrent: Number.isFinite(progress) ? progress : 0,
            episodeTotal: Number(frontmatter.episode_total) || null, genres: [], dateAdded: file.stat.ctime, dateWatched: null,
            tags: [], sourceUrl: String(frontmatter.url ?? '') || null, integrationProvider: 'anilist', integrationId: String(integrationId),
            parts: [], activePartId: null,
        };
    }

    private readLinkedManga(file: TFile): MangaItem | null {
        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
        if (!frontmatter || String(frontmatter.integration_provider ?? '').toLowerCase() !== 'anilist') return null;
        const integrationId = frontmatter.integration_id;
        if (integrationId === undefined || integrationId === null || String(integrationId).trim() === '') return null;
        const status = String(frontmatter.status ?? 'planned').toLowerCase();
        const rating = Number(frontmatter.rating);
        const progress = Number(frontmatter.chapter_current);
        const title = String(frontmatter.title ?? frontmatter.name ?? file.basename);
        return {
            type: 'manga', filePath: file.path, displayName: title, nameLower: title.toLowerCase(),
            year: Number(frontmatter.year) || null, description: String(frontmatter.plot ?? ''), summary: String(frontmatter.plot ?? ''),
            userRating: rating >= 1 && rating <= 5 ? Math.trunc(rating) as 1 | 2 | 3 | 4 | 5 : null,
            favorite: String(frontmatter.favorite).toLowerCase() === 'true', poster: String(frontmatter.poster ?? frontmatter.image ?? ''),
            imageUrl: String(frontmatter.poster ?? frontmatter.image ?? ''), hasCustomPoster: false, isAdult: false,
            status: this.isLocalStatus(status) ? status as ReadingStatus : 'planned', authors: [], artists: [], genres: [],
            chapterCurrent: Number.isFinite(progress) ? progress : 0, chapterTotal: Number(frontmatter.chapter_total) || null,
            volumeCurrent: Number(frontmatter.volume_current) || null, volumeTotal: Number(frontmatter.volume_total) || null,
            dateAdded: file.stat.ctime, lastModified: file.stat.mtime,
            tags: [], sourceUrl: String(frontmatter.url ?? '') || null, integrationProvider: 'anilist', integrationId: String(integrationId),
            parts: [], activePartId: null,
        };
    }

    private async graphql<T>(query: string, variables: Record<string, unknown>, token: string): Promise<T> {
        const response = await requestUrl({
            url: ANILIST_ENDPOINT,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ query, variables }),
        });
        const body = response.json as { data?: T; errors?: Array<{ message?: string }> };
        if (body.errors?.length) throw new Error(body.errors.map((error) => error.message || 'AniList API error').join('; '));
        if (!body.data) throw new Error('AniList returned no data.');
        return body.data;
    }

    private requireCredentials(settings: AniListSyncSettings): void {
        if (!settings.accessToken.trim()) throw new Error('AniList access token is missing.');
    }

    private extractAuthorizationCode(value: string): string {
        const trimmed = value.trim();
        if (!trimmed) return '';
        try {
            const url = new URL(trimmed);
            return url.searchParams.get('code')?.trim() || '';
        } catch {
            return trimmed;
        }
    }

    private extractAccessToken(value: string): string {
        const trimmed = value.trim();
        if (!trimmed) return '';
        try {
            const url = new URL(trimmed);
            const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
            return hash.get('access_token')?.trim() || url.searchParams.get('access_token')?.trim() || '';
        } catch {
            return trimmed;
        }
    }

    private titleFor(media: AniListEntry['media']): string {
        return media.title?.userPreferred || media.title?.english || media.title?.romaji || '';
    }

    private toAniListStatus(status: AnimeStatus): string {
        return ({ planned: 'PLANNING', watching: 'CURRENT', completed: 'COMPLETED', dropped: 'DROPPED', paused: 'PAUSED' } as Record<AnimeStatus, string>)[status];
    }

    private toLocalStatus(status: string): AnimeStatus {
        return ({ PLANNING: 'planned', CURRENT: 'watching', COMPLETED: 'completed', DROPPED: 'dropped', PAUSED: 'paused', REPEATING: 'watching' } as Record<string, AnimeStatus>)[status] ?? 'planned';
    }

    private isLocalStatus(status: string): status is AnimeStatus {
        return ['planned', 'watching', 'completed', 'dropped', 'paused'].includes(status);
    }

    private toLocalFormat(format: string | null | undefined): AnimeItem['format'] {
        const value = String(format ?? '').toLowerCase();
        return ['tv', 'movie', 'ova', 'ona', 'special'].includes(value) ? value as AnimeItem['format'] : 'tv';
    }

    private toLocalRating(score: number | null | undefined): number | null {
        return score && score > 0 ? Math.max(1, Math.min(5, Math.round(score / 20))) : null;
    }

    private async ensureFolder(path: string): Promise<void> {
        if (!path || this.app.vault.getAbstractFileByPath(path)) return;
        const parts = path.split('/');
        let current = '';
        for (const part of parts) {
            current = current ? `${current}/${part}` : part;
            if (!this.app.vault.getAbstractFileByPath(current)) await this.app.vault.createFolder(current);
        }
    }

    private sanitizeFileName(value: string): string {
        return value.replace(/[\\/:*?"<>|]/g, '-').trim() || 'Untitled';
    }

    private yaml(value: string): string {
        return JSON.stringify(value.replace(/\r?\n/g, ' ').trim());
    }
}
