import { App, TFile, requestUrl } from 'obsidian';
import { DEFAULT_SETTINGS } from '../constants';
import type { GameStatus, LorebaseSettings, SteamSyncSettings } from '../types';
import { ChoiceModal } from '../modals/IntegrationModals';
import type { GameDetails } from './integrations/types';
import { getSteamDetails } from './integrations/providers/steam';
import { buildSimpleTemplate, getDefaultTemplateFields, renderTemplate, sanitizeFileName } from './integrations/templateUtils';
import { extractYear } from './integrations/providers/common';
import type { JsonFetcher } from './integrations/providers/common';
import { localizeTemplateImages } from './integrations/imageStorage';
import { MetadataService } from './MetadataService';
import {
    ensureFolder,
    fetchHowLongToBeatValues,
    fetchJson,
    getJsonFetcher,
    imageUrlExists,
    shouldLoadHowLongToBeat,
} from './integrations/shared';

export interface SteamOwnedGame {
    appId: number;
    name: string;
    playtimeForever: number;
    iconUrl: string;
}

export interface SteamWishlistGame {
    appId: number;
    name: string;
}

export interface SteamSyncGame {
    appId: number;
    name: string;
    playtimeForever: number;
    source: 'owned' | 'wishlist' | 'owned_wishlist';
    status: GameStatus;
    details: GameDetails;
}

export interface SteamSyncResult {
    created: number;
    updated: number;
    skipped: number;
    failed: number;
}

export interface SteamSyncOptions {
    onProgress?: (message: string) => void;
    confirmDuplicateUpdate?: (count: number) => Promise<boolean>;
    selectedAppIds?: Set<number>;
}

type JsonMap = Record<string, unknown>;

export interface SteamImportCandidate {
    appId: number;
    name: string;
    playtimeForever: number;
    source: 'owned' | 'wishlist' | 'owned_wishlist';
    poster?: string;
    posterHorizontal?: string;
}

export class SteamSyncService {
    private app: App;
    private metadataService: MetadataService;
    private jsonFetcher: JsonFetcher;
    private detailsCache = new Map<number, GameDetails | null>();
    private warnings: string[] = [];

    constructor(app: App, metadataService: MetadataService) {
        this.app = app;
        this.metadataService = metadataService;
        this.jsonFetcher = getJsonFetcher((url, headers, method, body) => fetchJson(url, headers, method, body, {
            rateLimitMessage: 'Steam request was rate limited.',
            htmlJsonMessage: 'Steam returned HTML instead of JSON.',
        }));
    }

    async getOwnedGames(steamId: string, apiKey?: string): Promise<SteamOwnedGame[]> {
        const resolvedSteamId = await this.resolveSteamId(steamId);
        const url = new URL('https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/');
        url.searchParams.set('steamid', resolvedSteamId);
        url.searchParams.set('include_appinfo', 'true');
        url.searchParams.set('include_played_free_games', 'true');
        url.searchParams.set('format', 'json');
        if (apiKey?.trim()) {
            url.searchParams.set('key', apiKey.trim());
        }

        let json: unknown;
        try {
            json = await this.jsonFetcher(url.toString());
        } catch (error) {
            if (!apiKey?.trim() && this.isStatusError(error, 401)) {
                this.addWarning('Steam library requires an API Key for this profile. Wishlist can still be imported.');
                console.warn('[Steam Sync] Owned games require a Steam API key for this profile. Continuing without library games.', error);
                return [];
            }
            throw error;
        }
        const response = this.asObject(this.asObject(json)?.response);
        const games = this.asArray(response?.games);

        return games
            .map((entry) => {
                const record = this.asObject(entry);
                const appId = this.toNumber(record?.appid);
                if (!appId) return null;
                return {
                    appId,
                    name: this.toString(record?.name) || `Steam App ${appId}`,
                    playtimeForever: this.toNumber(record?.playtime_forever),
                    iconUrl: this.toString(record?.img_icon_url),
                };
            })
            .filter((entry): entry is SteamOwnedGame => entry !== null);
    }

    async getWishlist(steamId: string): Promise<SteamWishlistGame[]> {
        const resolvedSteamId = await this.resolveSteamId(steamId);
        const officialWishlist = await this.getWishlistFromWebApi(resolvedSteamId);
        if (officialWishlist.length > 0) {
            return officialWishlist;
        }

        const byAppId = new Map<number, SteamWishlistGame>();
        let shouldTryHtmlFallback = false;

        for (let page = 0; page < 50; page++) {
            try {
                const pageGames = await this.getWishlistPage(resolvedSteamId, page);
                if (!pageGames.length) {
                    if (page === 0) shouldTryHtmlFallback = true;
                    break;
                }
                for (const game of pageGames) {
                    byAppId.set(game.appId, game);
                }
            } catch (error) {
                if (this.isRecoverableWishlistError(error)) {
                    console.warn('[Steam Sync] Wishlist is unavailable. Continuing without wishlist.', error);
                    shouldTryHtmlFallback = true;
                    break;
                }
                throw error;
            }
        }

        if (byAppId.size === 0 && shouldTryHtmlFallback) {
            let fallbackGames: SteamWishlistGame[] = [];
            try {
                fallbackGames = await this.getWishlistFromHtml(resolvedSteamId);
            } catch (error) {
                if (!this.isRecoverableWishlistError(error)) {
                    throw error;
                }
                console.warn('[Steam Sync] Wishlist fallback is unavailable. Continuing without wishlist.', error);
            }
            for (const game of fallbackGames) {
                byAppId.set(game.appId, game);
            }
        }

        return Array.from(byAppId.values()).sort((a, b) => a.name.localeCompare(b.name));
    }

    async enrichGame(appId: number, settings?: LorebaseSettings): Promise<GameDetails | null> {
        const shouldUseSteamGridDb = Boolean(settings?.integrations?.providers.steamgriddb?.enabled && settings.integrations.providers.steamgriddb.apiKey?.trim());
        if (this.detailsCache.has(appId)) {
            const cached = this.detailsCache.get(appId) ?? null;
            if (!shouldUseSteamGridDb || cached?.poster) {
                return cached;
            }
        }
        const details = await getSteamDetails(this.jsonFetcher, String(appId), {
            imageExists: imageUrlExists,
            steamGridDb: settings?.integrations?.providers.steamgriddb,
        });
        this.detailsCache.set(appId, details);
        return details;
    }

    async testConnection(settings: SteamSyncSettings): Promise<number> {
        this.clearWarnings();
        return (await this.loadCandidates(settings)).length;
    }

    async previewImport(settings: LorebaseSettings | SteamSyncSettings): Promise<SteamImportCandidate[]> {
        this.clearWarnings();
        const steamSettings = this.getSteamSettings(settings);
        const candidates = await this.loadCandidates(steamSettings);
        return this.preparePreviewCandidates(candidates);
    }

    async sync(settings: LorebaseSettings, options: SteamSyncOptions = {}): Promise<SteamSyncResult> {
        const steamSettings = settings.steamSync;
        this.clearWarnings();

        const result: SteamSyncResult = { created: 0, updated: 0, skipped: 0, failed: 0 };
        options.onProgress?.('Loading Steam data...');

        const allCandidates = await this.loadCandidates(steamSettings);
        const candidates = options.selectedAppIds
            ? allCandidates.filter((candidate) => options.selectedAppIds?.has(candidate.appId))
            : allCandidates;
        const existingIndex = this.indexExistingGames(settings.games.folderPath);
        const duplicateCount = candidates.filter((candidate) => this.findDuplicate(candidate, existingIndex) !== null).length;
        let updateDuplicates = steamSettings.duplicateMode === 'update';

        if (steamSettings.duplicateMode === 'ask' && duplicateCount > 0) {
            updateDuplicates = options.confirmDuplicateUpdate
                ? await options.confirmDuplicateUpdate(duplicateCount)
                : await this.confirmDuplicateUpdate(duplicateCount);
        }

        const template = this.getGameTemplate(settings);
        await ensureFolder(this.app, settings.games.folderPath);

        for (const candidate of candidates) {
            try {
                options.onProgress?.(`Importing ${candidate.name}...`);
                const duplicate = this.findDuplicate(candidate, existingIndex);
                const details = await this.enrichGame(candidate.appId, settings) ?? this.buildFallbackDetails(candidate);
                if (/^Steam App \d+$/.test(candidate.name) && details.name && details.name !== 'Unknown') {
                    candidate.name = details.name;
                }
                const game = this.toSyncGame(candidate, details, steamSettings);

                if (duplicate) {
                    if (!updateDuplicates) {
                        result.skipped++;
                        continue;
                    }
                    await this.updateExistingGame(duplicate, game, steamSettings);
                    result.updated++;
                    continue;
                }

                const fullPath = this.getUniquePath(settings.games.folderPath, game.details.name || game.name);
                const content = await this.buildNewGameContent(template, game, steamSettings, settings);
                await this.app.vault.create(fullPath, content);
                const createdFile = this.app.vault.getAbstractFileByPath(fullPath);
                if (createdFile instanceof TFile) {
                    existingIndex.files.push(createdFile);
                    this.addFileToIndex(createdFile, existingIndex);
                }
                result.created++;
            } catch (error) {
                console.error('[Steam Sync] Failed to import game', candidate, error);
                result.failed++;
            }
        }

        return result;
    }

    consumeWarnings(): string[] {
        const warnings = [...this.warnings];
        this.clearWarnings();
        return warnings;
    }

    async syncPlaytimeForExisting(settings: LorebaseSettings): Promise<SteamSyncResult> {
        const steamSettings = settings.steamSync;

        const result: SteamSyncResult = { created: 0, updated: 0, skipped: 0, failed: 0 };
        const owned = await this.getOwnedGames(steamSettings.steamId, steamSettings.apiKey);
        const existingIndex = this.indexExistingGames(settings.games.folderPath);

        for (const game of owned) {
            const candidate: SteamImportCandidate = {
                appId: game.appId,
                name: game.name,
                playtimeForever: game.playtimeForever,
                source: 'owned',
            };
            const duplicate = this.findDuplicate(candidate, existingIndex);
            if (!duplicate) {
                result.skipped++;
                continue;
            }
            try {
                await this.metadataService.updateMetadata(duplicate, {
                    steamAppId: game.appId,
                    playtime: game.playtimeForever,
                });
                result.updated++;
            } catch (error) {
                console.error('[Steam Sync] Failed to update playtime', game, error);
                result.failed++;
            }
        }

        return result;
    }

    mapOwnedStatus(playtimeForever: number, settings: SteamSyncSettings): GameStatus {
        return playtimeForever > 0 ? settings.statusWithPlaytime : settings.statusWithoutPlaytime;
    }

    mapWishlistStatus(settings: SteamSyncSettings): GameStatus {
        return settings.statusWishlist;
    }

    private async loadCandidates(settings: SteamSyncSettings): Promise<SteamImportCandidate[]> {
        const byAppId = new Map<number, SteamImportCandidate>();

        if (settings.importOwnedGames) {
            const owned = await this.getOwnedGames(settings.steamId, settings.apiKey);
            for (const game of owned) {
                byAppId.set(game.appId, {
                    appId: game.appId,
                    name: game.name,
                    playtimeForever: game.playtimeForever,
                    source: 'owned',
                });
            }
        }

        if (settings.importWishlist) {
            const wishlist = await this.getWishlist(settings.steamId);
            for (const game of wishlist) {
                const existing = byAppId.get(game.appId);
                if (existing) {
                    existing.source = 'owned_wishlist';
                    if (!existing.name) existing.name = game.name;
                    continue;
                }
                byAppId.set(game.appId, {
                    appId: game.appId,
                    name: game.name,
                    playtimeForever: 0,
                    source: 'wishlist',
                });
            }
        }

        return Array.from(byAppId.values()).sort((a, b) => a.name.localeCompare(b.name));
    }

    private addWarning(message: string): void {
        if (!this.warnings.includes(message)) {
            this.warnings.push(message);
        }
    }

    private clearWarnings(): void {
        this.warnings = [];
    }

    private getSteamSettings(settings: LorebaseSettings | SteamSyncSettings): SteamSyncSettings {
        return this.isLorebaseSettings(settings) ? settings.steamSync : settings;
    }

    private isLorebaseSettings(settings: LorebaseSettings | SteamSyncSettings): settings is LorebaseSettings {
        return 'steamSync' in settings;
    }

    private preparePreviewCandidates(candidates: SteamImportCandidate[]): SteamImportCandidate[] {
        for (const candidate of candidates) {
            candidate.posterHorizontal = this.getSteamHeaderImage(candidate.appId);
        }
        return candidates.sort((a, b) => a.name.localeCompare(b.name));
    }

    private async getWishlistFromWebApi(steamId: string): Promise<SteamWishlistGame[]> {
        const url = new URL('https://api.steampowered.com/IWishlistService/GetWishlist/v1/');
        url.searchParams.set('steamid', steamId);

        try {
            const json = await this.jsonFetcher(url.toString());
            const response = this.asObject(this.asObject(json)?.response);
            const items = this.asArray(response?.items);

            return items
                .map((entry) => {
                    const record = this.asObject(entry);
                    const appId = this.toNumber(record?.appid);
                    if (!appId) return null;
                    return {
                        appId,
                        name: `Steam App ${appId}`,
                    };
                })
                .filter((entry): entry is SteamWishlistGame => entry !== null);
        } catch (error) {
            console.warn('[Steam Sync] IWishlistService/GetWishlist failed. Falling back to Store wishlistdata.', error);
            return [];
        }
    }

    private async getWishlistPage(steamId: string, page: number): Promise<SteamWishlistGame[]> {
        const url = `https://store.steampowered.com/wishlist/profiles/${encodeURIComponent(steamId)}/wishlistdata/?p=${page}`;
        const json = await this.jsonFetcher(url);
        const root = this.asObject(json);
        if (!root) return [];

        const games: SteamWishlistGame[] = [];
        for (const [appIdRaw, value] of Object.entries(root)) {
            if (appIdRaw === 'success') continue;
            const appId = Number(appIdRaw);
            if (!Number.isFinite(appId) || appId <= 0) continue;
            const record = this.asObject(value);
            games.push({
                appId,
                name: this.toString(record?.name) || `Steam App ${appId}`,
            });
        }

        return games;
    }

    private async getWishlistFromHtml(steamId: string): Promise<SteamWishlistGame[]> {
        const url = `https://store.steampowered.com/wishlist/profiles/${encodeURIComponent(steamId)}/`;
        const html = await this.fetchText(url);
        const fromScript = this.parseWishlistScript(html);
        if (fromScript.length) return fromScript;

        const byAppId = new Map<number, SteamWishlistGame>();
        const appIdRegex = /"appid"\s*:\s*(\d+)/g;
        let match: RegExpExecArray | null;
        while ((match = appIdRegex.exec(html)) !== null) {
            const appId = Number(match[1]);
            if (Number.isFinite(appId) && appId > 0) {
                byAppId.set(appId, { appId, name: `Steam App ${appId}` });
            }
        }

        return Array.from(byAppId.values());
    }

    private parseWishlistScript(html: string): SteamWishlistGame[] {
        const match = html.match(/g_rgWishlistData\s*=\s*(\[[\s\S]*?\]);/);
        if (!match) return [];

        try {
            const parsed = JSON.parse(match[1]) as unknown;
            const entries = this.asArray(parsed);
            return entries
                .map((entry) => {
                    const record = this.asObject(entry);
                    const appId = this.toNumber(record?.appid);
                    if (!appId) return null;
                    return {
                        appId,
                        name: this.toString(record?.name) || `Steam App ${appId}`,
                    };
                })
                .filter((entry): entry is SteamWishlistGame => entry !== null);
        } catch (error) {
            console.warn('[Steam Sync] Failed to parse wishlist HTML data.', error);
            return [];
        }
    }

    private toSyncGame(candidate: SteamImportCandidate, details: GameDetails, settings: SteamSyncSettings): SteamSyncGame {
        const status = candidate.source === 'wishlist'
            ? this.mapWishlistStatus(settings)
            : this.mapOwnedStatus(candidate.playtimeForever, settings);

        return {
            appId: candidate.appId,
            name: details.name || candidate.name,
            playtimeForever: candidate.playtimeForever,
            source: candidate.source,
            status,
            details,
        };
    }

    private buildFallbackDetails(candidate: SteamImportCandidate): GameDetails {
        return {
            kind: 'game',
            name: candidate.name || `Steam App ${candidate.appId}`,
            description: '',
            poster: '',
            posterHorizontal: this.getSteamHeaderImage(candidate.appId),
            genres: [],
            platforms: [],
            developers: [],
            publishers: [],
            rating: '',
            metacritic: '',
            released: '',
            year: '',
            url: `https://store.steampowered.com/app/${candidate.appId}/`,
        };
    }

    private async buildNewGameContent(
        template: string,
        game: SteamSyncGame,
        settings: SteamSyncSettings,
        allSettings: LorebaseSettings
    ): Promise<string> {
        const rawValues = await this.buildTemplateValues(game, settings, allSettings);
        const title = this.toString(rawValues.name) || game.details.name || game.name || 'Untitled';
        const values = await localizeTemplateImages(this.app, 'games', title, rawValues, allSettings.integrations?.imageStorage, template);
        const rendered = renderTemplate(template, values);
        return this.injectFrontmatterFields(rendered, {
            steamAppId: game.appId,
            playtime: settings.fields.playtime ? game.playtimeForever : undefined,
            status: game.status,
        });
    }

    private async buildTemplateValues(
        game: SteamSyncGame,
        settings: SteamSyncSettings,
        allSettings: LorebaseSettings
    ): Promise<Record<string, unknown>> {
        const details = game.details;
        const hltb = shouldLoadHowLongToBeat(
            allSettings.integrations?.media.games ?? DEFAULT_SETTINGS.integrations!.media.games,
            this.getGameTemplate(allSettings)
        )
            ? await fetchHowLongToBeatValues(this.jsonFetcher, details.name || game.name, details.year, '[Steam Sync]')
            : null;
        return {
            name: details.name || game.name,
            Poster: details.poster,
            PosterHorizontal: details.posterHorizontal ?? details.poster,
            Plot: details.description,
            genres: settings.fields.genres ? details.genres : [],
            platforms: details.platforms,
            developers: details.developers,
            publishers: details.publishers,
            rating: details.rating,
            metacritic: details.metacritic,
            released: settings.fields.releaseDate ? details.released : '',
            Year: settings.fields.releaseDate ? details.year : extractYear(details.released),
            url: details.url || `https://store.steampowered.com/app/${game.appId}/`,
            status: game.status,
            playtime: settings.fields.playtime ? game.playtimeForever : '',
            steamAppId: game.appId,
            main: hltb?.main ?? '',
            main_plus_sides: hltb?.main_plus_sides ?? '',
            perfectionist: hltb?.perfectionist ?? '',
            completionist: hltb?.perfectionist ?? '',
        };
    }

    private async updateExistingGame(file: TFile, game: SteamSyncGame, settings: SteamSyncSettings): Promise<void> {
        const updates: Record<string, unknown> = {
            steamAppId: game.appId,
            url: game.details.url || `https://store.steampowered.com/app/${game.appId}/`,
        };

        if (settings.fields.playtime) {
            updates.playtime = game.playtimeForever;
        }
        if (settings.fields.genres) {
            updates.genres = game.details.genres;
        }
        if (settings.fields.releaseDate) {
            updates.released = game.details.released || null;
            updates.year = game.details.year || null;
        }

        await this.metadataService.updateMetadata(file, updates);
    }

    private indexExistingGames(folderPath: string): {
        files: TFile[];
        byAppId: Map<number, TFile>;
        byUrl: Map<string, TFile>;
        byPath: Map<string, TFile>;
    } {
        const files = this.app.vault.getFiles()
            .filter((file) => file.extension === 'md')
            .filter((file) => !folderPath || file.path.startsWith(`${folderPath}/`));
        const index = {
            files,
            byAppId: new Map<number, TFile>(),
            byUrl: new Map<string, TFile>(),
            byPath: new Map<string, TFile>(),
        };

        for (const file of files) {
            this.addFileToIndex(file, index);
        }

        return index;
    }

    private addFileToIndex(
        file: TFile,
        index: { byAppId: Map<number, TFile>; byUrl: Map<string, TFile>; byPath: Map<string, TFile> }
    ): void {
        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter as JsonMap | undefined;
        const appId = this.toNumber(frontmatter?.steamAppId) || this.toNumber(frontmatter?.appid);
        if (appId) {
            index.byAppId.set(appId, file);
        }

        const url = this.normalizeSteamUrl(this.toString(frontmatter?.url));
        if (url) {
            index.byUrl.set(url, file);
        }

        index.byPath.set(file.path, file);
    }

    private findDuplicate(
        candidate: SteamImportCandidate,
        index: { byAppId: Map<number, TFile>; byUrl: Map<string, TFile>; byPath: Map<string, TFile> }
    ): TFile | null {
        const byAppId = index.byAppId.get(candidate.appId);
        if (byAppId) return byAppId;

        const byUrl = index.byUrl.get(this.normalizeSteamUrl(`https://store.steampowered.com/app/${candidate.appId}/`));
        if (byUrl) return byUrl;

        const fileName = sanitizeFileName(candidate.name) || `Steam App ${candidate.appId}`;
        for (const file of index.byPath.values()) {
            if (file.basename.toLowerCase() === fileName.toLowerCase()) {
                return file;
            }
        }

        return null;
    }

    private getGameTemplate(settings: LorebaseSettings): string {
        const media = settings.integrations?.media.games ?? DEFAULT_SETTINGS.integrations!.media.games;
        if (!media.templateEnabled) {
            return `---\nstatus: "{{VALUE:status}}"\nfavorite: false\nurl: "{{VALUE:url}}"\n---`;
        }

        const mode = media.templateMode ?? 'advanced';
        if (mode === 'advanced') return media.template;

        const selected = media.templateFields?.length ? media.templateFields : getDefaultTemplateFields('games');
        const filtered = media.howLongToBeatEnabled
            ? Array.from(new Set([...selected, 'main', 'main_plus_sides', 'perfectionist']))
            : selected.filter((key) => key !== 'main' && key !== 'main_plus_sides' && key !== 'perfectionist' && key !== 'completionist');
        return buildSimpleTemplate('games', filtered);
    }

    private injectFrontmatterFields(content: string, fields: Record<string, unknown>): string {
        const lines = content.split(/\r?\n/);
        if (lines[0]?.trim() !== '---') {
            const frontmatter = this.serializeFrontmatterFields(fields);
            return frontmatter ? `---\n${frontmatter}\n---\n${content}` : content;
        }

        const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
        if (closingIndex === -1) {
            const frontmatter = this.serializeFrontmatterFields(fields);
            return frontmatter ? `${content}\n${frontmatter}` : content;
        }

        const existingKeys = new Set<string>();
        for (let index = 1; index < closingIndex; index++) {
            const match = lines[index].match(/^([A-Za-z0-9_-]+):/);
            if (match) existingKeys.add(match[1]);
        }

        const additions = this.serializeFrontmatterFields(fields, existingKeys);
        if (!additions) return content;

        lines.splice(closingIndex, 0, ...additions.split('\n'));
        return lines.join('\n');
    }

    private serializeFrontmatterFields(fields: Record<string, unknown>, existingKeys: Set<string> = new Set()): string {
        const lines: string[] = [];
        for (const [key, value] of Object.entries(fields)) {
            if (existingKeys.has(key)) continue;
            if (value === null || value === undefined || value === '') continue;
            if (Array.isArray(value)) {
                if (value.length === 0) continue;
                lines.push(`${key}:`);
                for (const item of value) {
                    lines.push(`  - "${this.escapeYaml(String(item))}"`);
                }
                continue;
            }
            if (typeof value === 'number' || typeof value === 'boolean') {
                lines.push(`${key}: ${value}`);
                continue;
            }
            lines.push(`${key}: "${this.escapeYaml(String(value))}"`);
        }
        return lines.join('\n');
    }

    private getUniquePath(folderPath: string, title: string): string {
        const fileName = sanitizeFileName(title) || 'Untitled';
        const basePath = folderPath ? `${folderPath}/${fileName}` : fileName;
        let candidate = `${basePath}.md`;
        let suffix = 2;
        while (this.app.vault.getAbstractFileByPath(candidate)) {
            candidate = `${basePath} ${suffix}.md`;
            suffix++;
        }
        return candidate;
    }

    private async confirmDuplicateUpdate(count: number): Promise<boolean> {
        const modal = new ChoiceModal(
            this.app,
            'Steam duplicates found',
            `${count} Steam games already exist in your LOREBASE library. Update Steam fields for all duplicates?`,
            'Update all',
            'Skip all'
        );
        return modal.openAndGetValue();
    }

    private async resolveSteamId(input: string): Promise<string> {
        const value = input.trim();
        const profileMatch = value.match(/steamcommunity\.com\/profiles\/(\d{17})/i);
        if (profileMatch) return profileMatch[1];

        const vanity = this.extractVanityName(value);
        if (vanity) {
            const steamId = await this.resolveVanitySteamId(vanity);
            if (steamId) return steamId;
        }

        throw new Error('Steam profile must be a steamcommunity.com/profiles URL or steamcommunity.com/id URL.');
    }

    private extractVanityName(value: string): string {
        const urlMatch = value.match(/steamcommunity\.com\/id\/([^/?#]+)/i);
        if (urlMatch) return decodeURIComponent(urlMatch[1]).trim();
        return '';
    }

    private async resolveVanitySteamId(vanity: string): Promise<string | null> {
        const url = `https://steamcommunity.com/id/${encodeURIComponent(vanity)}/?xml=1`;
        const xml = await this.fetchText(url);
        const match = xml.match(/<steamID64>(\d{17})<\/steamID64>/);
        return match ? match[1] : null;
    }

    private normalizeSteamUrl(url: string): string {
        const match = url.match(/store\.steampowered\.com\/app\/(\d+)/);
        return match ? `steam-app:${match[1]}` : '';
    }

    private getSteamHeaderImage(appId: number): string {
        return `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`;
    }

    private async fetchText(url: string): Promise<string> {
        let response: Awaited<ReturnType<typeof requestUrl>>;
        try {
            response = await requestUrl({ url, method: 'GET' });
        } catch (error) {
            if (this.isStatusError(error, 429)) {
                throw new Error('Steam request was rate limited.');
            }
            throw error;
        }
        return response.text ?? '';
    }

    private isRecoverableWishlistError(error: unknown): boolean {
        if (this.isHtmlJsonError(error)) return true;
        return error instanceof Error && error.message.toLowerCase().includes('rate limited');
    }

    private isHtmlJsonError(error: unknown): boolean {
        return error instanceof Error && error.message.includes('Steam returned HTML');
    }

    private isStatusError(error: unknown, status: number): boolean {
        if (!(error instanceof Error)) return false;
        const message = error.message.toLowerCase();
        return message.includes(`status ${status}`) || message.includes(`status: ${status}`);
    }

    private asObject(value: unknown): JsonMap | null {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
        return value as JsonMap;
    }

    private asArray(value: unknown): unknown[] {
        return Array.isArray(value) ? value : [];
    }

    private toString(value: unknown): string {
        if (typeof value === 'string') return value;
        if (typeof value === 'number' || typeof value === 'boolean') return String(value);
        return '';
    }

    private toNumber(value: unknown): number {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string') {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : 0;
        }
        return 0;
    }

    private escapeYaml(value: string): string {
        return value.replace(/"/g, '\\"');
    }
}
