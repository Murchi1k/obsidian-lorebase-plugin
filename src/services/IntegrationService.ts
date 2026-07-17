/**
 * LOREBASE - Integration Service
 * Handles provider search, detail fetching, and note creation.
 */

import { App, Notice, TFile } from 'obsidian';
import { AnimeItem, LorebaseSettings } from '../types';
import { t } from '../localization';
import { ChoiceModal, MultiSelectSearchModal, SearchProviderOption } from '../modals/IntegrationModals';
import { AnimePartsReviewModal } from '../modals/AnimePartsReviewModal';
import { AddModeModal, ManualCreateModal, type ManualCreateDraft } from '../modals/ManualCreateModal';
import { AnimeDetails, BookDetails, GameDetails, IntegrationAnimePart, IntegrationMangaPart, IntegrationVideoPart, MangaDetails, MediaKind, ProviderId, SearchResult, VideoDetails } from './integrations/types';
import { buildSimpleTemplate, getDefaultTemplateFields, renderTemplate, sanitizeFileName } from './integrations/templateUtils';
import { getAniListDetails, getAniListMangaDetails, searchAniList, searchAniListManga } from './integrations/providers/anilist';
import { getGoogleBooksDetails, searchGoogleBooks } from './integrations/providers/googlebooks';
import { getHardcoverBookDetails, searchHardcoverBooks } from './integrations/providers/hardcover';
import { getIgdbDetails, searchIgdb } from './integrations/providers/igdb';
import { getJikanMangaDetails, searchJikanManga } from './integrations/providers/jikan';
import { getMangaDexDetails, searchMangaDex } from './integrations/providers/mangadex';
import { getRawgDetails, searchRawg } from './integrations/providers/rawg';
import { getShikimoriDetails, getShikimoriMangaDetails, searchShikimori, searchShikimoriManga } from './integrations/providers/shikimori';
import { getSteamDetails, searchSteam } from './integrations/providers/steam';
import { getOmdbDetails, searchOmdb } from './integrations/providers/omdb';
import { getTmdbDetails, searchTmdb } from './integrations/providers/tmdb';
import { getTvmazeDetails, searchTvmaze } from './integrations/providers/tvmaze';
import { localizeTemplateImages, saveManualImageFileToVault } from './integrations/imageStorage';
import type { JsonFetcher } from './integrations/providers/common';
import {
    ensureFolder,
    fetchHowLongToBeatValues,
    fetchJson,
    getJsonFetcher,
    imageUrlExists,
    renderPartsYaml,
    renderMangaPartsYaml,
    shouldLoadHowLongToBeat,
} from './integrations/shared';

export class IntegrationService {
    private app: App;
    private getSettings: () => LorebaseSettings;
    private runSteamSync?: () => void;
    private jsonFetcher: JsonFetcher;

    constructor(app: App, getSettings: () => LorebaseSettings, runSteamSync?: () => void) {
        this.app = app;
        this.getSettings = getSettings;
        this.runSteamSync = runSteamSync;
        this.jsonFetcher = getJsonFetcher((url, headers, method, body) => fetchJson(url, headers, method, body, {
            errorPrefix: 'Integration fetch error:',
            swallowErrors: false,
        }));
    }

    async addGame(): Promise<void> {
        await this.addMedia('games');
    }

    async addAnime(): Promise<void> {
        await this.addMedia('anime');
    }

    async addMovie(): Promise<void> {
        await this.addMedia('movies');
    }

    async addSeries(): Promise<void> {
        await this.addMedia('series');
    }

    async addBook(): Promise<void> {
        await this.addMedia('books');
    }

    async addManga(): Promise<void> {
        await this.addMedia('manga');
    }

    async testProvider(providerId: ProviderId): Promise<{ ok: boolean; reason?: 'missing_key' | 'disabled' | 'no_results' }> {
        const settings = this.getSettings();
        const integrations = settings.integrations;
        if (!integrations || !integrations.enabled) {
            return { ok: false, reason: 'disabled' };
        }

        const providerSettings = integrations.providers[providerId];
        if (!providerSettings?.enabled) {
            return { ok: false, reason: 'disabled' };
        }

        if (!this.hasRequiredCredentials(providerId, providerSettings)) {
            return { ok: false, reason: 'missing_key' };
        }

        const query = providerId === 'rawg' || providerId === 'steam' || providerId === 'igdb'
            ? 'portal'
            : providerId === 'tmdb'
                ? 'matrix'
            : providerId === 'omdb'
                ? 'matrix'
                : providerId === 'tvmaze'
                    ? 'breaking bad'
                : providerId === 'hardcover' || providerId === 'googlebooks'
                    ? 'tolkien'
                : providerId === 'jikan' || providerId === 'mangadex'
                    ? 'berserk'
                : 'naruto';
        const results = await this.search(
            providerId,
            query,
            providerSettings.apiKey || '',
            providerSettings.clientSecret || '',
            {},
            providerId === 'tvmaze'
                ? 'series'
                : providerId === 'tmdb' || providerId === 'omdb'
                    ? 'movies'
                    : providerId === 'hardcover' || providerId === 'googlebooks'
                        ? 'books'
                        : providerId === 'jikan' || providerId === 'mangadex'
                            ? 'manga'
                            : undefined
        );
        if (!results.length) {
            return { ok: false, reason: 'no_results' };
        }
        return { ok: true };
    }

    private async addMedia(kind: MediaKind): Promise<void> {
        if (this.getSettings().showAddModeChoice === false) {
            await this.addProviderMedia(kind, true);
            return;
        }
        const mode = await new AddModeModal(this.app, kind).openAndGetValue();
        if (!mode) return;
        if (mode === 'manual') {
            await this.addManualMedia(kind);
            return;
        }
        await this.addProviderMedia(kind);
    }

    private async addProviderMedia(kind: MediaKind, allowManualFallback = false): Promise<void> {
        try {
            const settings = this.getSettings();
            const integrations = settings.integrations;
            if (!integrations || !integrations.enabled) {
                new Notice(t('noticeIntegrationsDisabled'));
                return;
            }

            const mediaSettings = integrations.media[kind];
            const providerOptions = this.getProviderOptions(kind);
            if (!providerOptions.some((provider) => !provider.disabled)) {
                new Notice(t('noticeProviderDisabled'));
                return;
            }

            if (!this.isProviderId(mediaSettings.provider)) {
                new Notice(t('noticeProviderDisabled'));
                return;
            }

            const savedProvider = mediaSettings.provider;
            const fallbackProvider = providerOptions[0]?.id;
            const initialProvider = providerOptions.some((provider) => provider.id === savedProvider)
                ? savedProvider
                : this.isProviderId(fallbackProvider)
                    ? fallbackProvider
                    : undefined;
            if (!initialProvider) {
                new Notice(t('noticeProviderDisabled'));
                return;
            }

            const selected = await this.chooseResults(kind, initialProvider, providerOptions, allowManualFallback);
            if (!selected.length) return;

            const template = this.getTemplate(
                kind,
                mediaSettings.templateEnabled,
                mediaSettings.templateMode,
                mediaSettings.templateFields,
                mediaSettings.template,
                mediaSettings.howLongToBeatEnabled ?? false
            );
            const shouldLoadHltb = kind === 'games' && shouldLoadHowLongToBeat(mediaSettings);

            for (const item of selected) {
                new Notice(t('notifyLoading'), 1500);
                const itemProviderId = item.provider;
                const providerSettings = integrations.providers[itemProviderId];
                if (!providerSettings?.enabled) {
                    new Notice(t('noticeProviderDisabled'));
                    continue;
                }
                if (!this.hasRequiredCredentials(itemProviderId, providerSettings)) {
                    new Notice(t('noticeMissingApiKey'));
                    continue;
                }

                const details = await this.fetchDetails(
                    itemProviderId,
                    item.id,
                    providerSettings.apiKey || '',
                    providerSettings.clientSecret || '',
                    this.toDetailsKind(kind)
                );
                if (!details) {
                    new Notice(t('noticeNoResults'));
                    continue;
                }

                let values: Record<string, unknown>;
                if (kind === 'games') {
                    if (!this.isGameDetails(details)) {
                        new Notice(t('noticeNoResults'));
                        continue;
                    }
                    values = await this.buildGameValues(details, shouldLoadHltb, item.image, itemProviderId === 'steam');
                } else if (kind === 'anime') {
                    if (!this.isAnimeDetails(details)) {
                        new Notice(t('noticeNoResults'));
                        continue;
                    }
                    values = this.buildAnimeValues(details, {
                        provider: itemProviderId,
                        id: item.id,
                        parts: [],
                    });
                } else if (kind === 'books') {
                    if (!this.isBookDetails(details)) {
                        new Notice(t('noticeNoResults'));
                        continue;
                    }
                    values = this.buildBookValues(details, {
                        provider: itemProviderId,
                        id: item.id,
                        title: item.title,
                        year: item.year,
                        poster: item.image,
                    });
                } else if (kind === 'manga') {
                    if (!this.isMangaDetails(details)) {
                        new Notice(t('noticeNoResults'));
                        continue;
                    }
                    values = this.buildMangaValues(details, {
                        provider: itemProviderId,
                        id: item.id,
                    });
                } else {
                    if (!this.isVideoDetails(details)) {
                        new Notice(t('noticeNoResults'));
                        continue;
                    }
                    values = this.buildVideoValues(details, kind, {
                        provider: itemProviderId,
                        id: item.id,
                    });
                }

                const title = this.firstStringValue(values, 'name', item.title, 'Untitled');
                const renderedValues = template
                    ? await localizeTemplateImages(this.app, kind, title, values, integrations.imageStorage, template)
                    : values;
                let content = template
                    ? renderTemplate(template, renderedValues)
                    : `# ${title}\n`;
                if ((kind === 'movies' || kind === 'series' || kind === 'books' || kind === 'manga') && !content.trimStart().startsWith('---')) {
                    const fallbackTemplate = buildSimpleTemplate(kind, getDefaultTemplateFields(kind));
                    content = `${renderTemplate(fallbackTemplate, renderedValues)}\n\n${content.trim()}`;
                }

                const folderPath = this.getFolderPath(settings, kind);
                const fileName = sanitizeFileName(title) || 'Untitled';
                const fullPath = folderPath ? `${folderPath}/${fileName}.md` : `${fileName}.md`;

                const exists = this.app.vault.getAbstractFileByPath(fullPath);
                if (exists instanceof TFile) {
                    const update = await this.confirmOverwrite();
                    if (!update) {
                        new Notice(t('noticeSkipped'));
                        continue;
                    }
                    await this.app.vault.modify(exists, content);
                    new Notice(t('noticeCreated'));
                    continue;
                }

                await ensureFolder(this.app, folderPath);
                await this.app.vault.create(fullPath, content);
                new Notice(t('noticeCreated'));
            }
        } catch (error: unknown) {
            console.error('Integration add error:', error);
            const message = error instanceof Error ? `: ${error.message}` : '';
            new Notice(`${t('noticeIntegrationsError')}${message}`);
        }
    }

    private async addManualMedia(defaultKind: MediaKind): Promise<void> {
        try {
            const draft = await new ManualCreateModal(this.app, defaultKind).openAndGetValue();
            if (!draft) return;

            const settings = this.getSettings();
            const integrations = settings.integrations;
            const preparedDraft = await this.prepareManualDraft(draft, settings);
            const kind = preparedDraft.kind;
            const mediaSettings = integrations?.media[kind];
            const template = mediaSettings
                ? this.getTemplate(
                    kind,
                    mediaSettings.templateEnabled,
                    mediaSettings.templateMode,
                    mediaSettings.templateFields,
                    mediaSettings.template,
                    mediaSettings.howLongToBeatEnabled ?? false
                )
                : buildSimpleTemplate(kind, getDefaultTemplateFields(kind));
            const values = this.buildManualValues(preparedDraft);
            const title = this.firstStringValue(values, 'name', preparedDraft.title, 'Untitled');
            const renderedValues = template && integrations
                ? await localizeTemplateImages(this.app, kind, title, values, integrations.imageStorage, template)
                : values;
            let content = template
                ? renderTemplate(template, renderedValues)
                : `# ${title}\n`;
            if (!content.trimStart().startsWith('---')) {
                const fallbackTemplate = buildSimpleTemplate(kind, getDefaultTemplateFields(kind));
                content = `${renderTemplate(fallbackTemplate, renderedValues)}\n\n${content.trim()}`;
            }

            const folderPath = this.getFolderPath(settings, kind);
            const fileName = sanitizeFileName(title) || 'Untitled';
            const fullPath = folderPath ? `${folderPath}/${fileName}.md` : `${fileName}.md`;
            const existing = this.app.vault.getAbstractFileByPath(fullPath);
            let file: TFile | null = null;
            if (existing instanceof TFile) {
                const update = await this.confirmOverwrite();
                if (!update) {
                    new Notice(t('noticeSkipped'));
                    return;
                }
                await this.app.vault.modify(existing, content);
                file = existing;
            } else {
                await ensureFolder(this.app, folderPath);
                file = await this.app.vault.create(fullPath, content);
            }

            new Notice(t('noticeCreated'));
            if (file) {
                await this.app.workspace.getLeaf(true).openFile(file);
            }
        } catch (error: unknown) {
            console.error('Manual add error:', error);
            const message = error instanceof Error ? `: ${error.message}` : '';
            new Notice(`${t('noticeIntegrationsError')}${message}`);
        }
    }

    private async confirmOverwrite(): Promise<boolean> {
        const modal = new ChoiceModal(
            this.app,
            t('promptFileExistsTitle'),
            t('promptFileExistsBody'),
            t('promptFileExistsUpdate'),
            t('promptFileExistsSkip')
        );
        return modal.openAndGetValue();
    }

    private getFolderPath(settings: LorebaseSettings, kind: MediaKind): string {
        switch (kind) {
            case 'games':
                return settings.games.folderPath;
            case 'anime':
                return settings.anime.folderPath;
            case 'movies':
                return settings.movies.folderPath;
            case 'series':
                return settings.series.folderPath;
            case 'books':
                return settings.books.folderPath;
            case 'manga':
                return settings.manga.folderPath;
        }
    }

    private toDetailsKind(kind: MediaKind): 'movies' | 'series' | 'books' | 'manga' | undefined {
        return kind === 'movies' || kind === 'series' || kind === 'books' || kind === 'manga'
            ? kind
            : undefined;
    }

    private toVideoKind(kind: 'movies' | 'series' | 'books' | 'manga' | undefined): 'movies' | 'series' {
        return kind === 'series' ? 'series' : 'movies';
    }

    private async chooseResults(
        kind: MediaKind,
        initialProviderId: ProviderId,
        providerOptions: SearchProviderOption[],
        allowManualFallback = false
    ): Promise<SearchResult[]> {
        const modal = new MultiSelectSearchModal<SearchResult>(
            this.app,
            async (query, providerId, searchOptions) => {
                if (!providerId || !this.isProviderId(providerId)) return [];
                const selectedProviderId = providerId;
                const providerSettings = this.getSettings().integrations?.providers[selectedProviderId];
                if (!providerSettings?.enabled) return [];
                if (!this.hasRequiredCredentials(selectedProviderId, providerSettings)) return [];
                new Notice(t('notifyLoading'), 1200);
                return this.search(
                    selectedProviderId,
                    query,
                    providerSettings.apiKey || '',
                    providerSettings.clientSecret || '',
                    searchOptions,
                    this.toDetailsKind(kind)
                );
            },
            {
                titleText: kind === 'games'
                    ? t('promptSearchGame')
                    : kind === 'anime'
                        ? t('promptSearchAnime')
                        : kind === 'movies'
                            ? t('promptSearchMovie')
                            : kind === 'series'
                                ? t('promptSearchSeries')
                                : kind === 'books'
                                    ? t('promptSearchBook')
                                    : t('promptSearchManga'),
                placeholder: t('promptSearchPlaceholder'),
                emptyText: t('noticeNoResults'),
                doneText: t('promptAddSelected'),
                cancelText: t('commonCancel'),
                selectedLabelText: t('promptSelectedLabel'),
                providerOptions,
                initialProviderId,
                titleIcon: kind === 'games'
                    ? 'gamepad-2'
                    : kind === 'anime'
                        ? 'clapperboard'
                        : kind === 'movies'
                            ? 'film'
                            : kind === 'series'
                                ? 'tv'
                                : kind === 'books'
                                    ? 'book-open'
                                    : 'book-open-text',
                syncActionText: kind === 'games' ? 'Steam Sync' : undefined,
                onSyncAction: kind === 'games' ? this.runSteamSync : undefined,
                manualActionText: allowManualFallback ? t('promptAddModeManual') : undefined,
                onManualAction: allowManualFallback ? () => {
                    void this.addManualMedia(kind);
                } : undefined,
                includeDlcToggleText: kind === 'games' ? t('promptIncludeDlc') : undefined,
            }
        );
        return (await modal.openAndGetValues()) ?? [];
    }

    private requiresApiKey(provider: ProviderId): boolean {
        return provider === 'rawg'
            || provider === 'igdb'
            || provider === 'tmdb'
            || provider === 'omdb'
            || provider === 'hardcover'
            || provider === 'googlebooks';
    }

    private hasRequiredCredentials(
        provider: ProviderId,
        settings: { apiKey?: string; clientSecret?: string } | undefined
    ): boolean {
        if (provider === 'igdb') {
            return Boolean(settings?.apiKey && settings.clientSecret);
        }
        if (this.requiresApiKey(provider)) {
            return Boolean(settings?.apiKey);
        }
        return true;
    }

    private getProviderOptions(kind: MediaKind): SearchProviderOption[] {
        const providers: Array<{ id: ProviderId; label: string }> = kind === 'games'
            ? [
                { id: 'rawg', label: 'RAWG' },
                { id: 'steam', label: 'Steam' },
                { id: 'igdb', label: 'IGDB' },
            ]
            : kind === 'anime'
                ? [
                { id: 'anilist', label: 'AniList' },
                { id: 'shikimori', label: 'Shikimori' },
                ]
                : kind === 'movies'
                    ? [
                        { id: 'tmdb', label: 'TMDB' },
                        { id: 'omdb', label: 'OMDb' },
                    ]
                    : kind === 'series'
                        ? [
                        { id: 'tmdb', label: 'TMDB' },
                        { id: 'tvmaze', label: 'TVmaze' },
                        { id: 'omdb', label: 'OMDb' },
                        ]
                        : kind === 'books'
                            ? [
                                { id: 'hardcover', label: 'Hardcover' },
                                { id: 'googlebooks', label: 'Google Books' },
                            ]
                            : [
                                { id: 'anilist', label: 'AniList' },
                                { id: 'shikimori', label: 'Shikimori' },
                                { id: 'jikan', label: 'Jikan' },
                                { id: 'mangadex', label: 'MangaDex' },
                            ];
        const integrations = this.getSettings().integrations;

        return providers
            .filter((provider) => {
                const settings = integrations?.providers[provider.id];
                return Boolean(settings?.enabled && this.hasRequiredCredentials(provider.id, settings));
            })
            .map((provider) => ({
                id: provider.id,
                label: provider.label,
            }));
    }

    private isProviderId(value: string | undefined): value is ProviderId {
        return value === 'rawg'
            || value === 'steam'
            || value === 'igdb'
            || value === 'anilist'
            || value === 'shikimori'
            || value === 'tmdb'
            || value === 'tvmaze'
            || value === 'omdb'
            || value === 'hardcover'
            || value === 'googlebooks'
            || value === 'jikan'
            || value === 'mangadex';
    }

    private isGameDetails(value: GameDetails | AnimeDetails | VideoDetails | BookDetails | MangaDetails): value is GameDetails {
        return value.kind === 'game';
    }

    private isAnimeDetails(value: GameDetails | AnimeDetails | VideoDetails | BookDetails | MangaDetails): value is AnimeDetails {
        return value.kind === 'anime';
    }

    private isVideoDetails(value: GameDetails | AnimeDetails | VideoDetails | BookDetails | MangaDetails): value is VideoDetails {
        return value.kind === 'video';
    }

    private isBookDetails(value: GameDetails | AnimeDetails | VideoDetails | BookDetails | MangaDetails): value is BookDetails {
        return value.kind === 'book';
    }

    private isMangaDetails(value: GameDetails | AnimeDetails | VideoDetails | BookDetails | MangaDetails): value is MangaDetails {
        return value.kind === 'manga';
    }

    private getTemplate(
        kind: MediaKind,
        enabled: boolean,
        mode: string | undefined,
        fields: string[] | undefined,
        advancedTemplate: string,
        howLongToBeatEnabled: boolean
    ): string | null {
        if (!enabled) {
            if (kind === 'movies' || kind === 'series' || kind === 'books' || kind === 'manga') {
                return buildSimpleTemplate(kind, getDefaultTemplateFields(kind));
            }
            return null;
        }
        const templateMode = mode ?? 'advanced';
        if (templateMode === 'advanced' && advancedTemplate.trim()) return advancedTemplate;
        const selected = fields && fields.length ? fields : getDefaultTemplateFields(kind);
        const withHltb = kind === 'games' && howLongToBeatEnabled
            ? Array.from(new Set([...selected, 'main', 'main_plus_sides', 'perfectionist']))
            : selected;
        const filtered = kind === 'games' && !howLongToBeatEnabled
            ? selected.filter((key) => key !== 'main' && key !== 'main_plus_sides' && key !== 'perfectionist' && key !== 'completionist')
            : withHltb;
        return buildSimpleTemplate(kind, filtered);
    }

    private async search(
        provider: ProviderId,
        query: string,
        apiKey: string,
        clientSecret = '',
        options: { includeDlc?: boolean; page?: number; pageSize?: number } = {},
        kind?: 'movies' | 'series' | 'books' | 'manga'
    ): Promise<SearchResult[]> {
        const fetchJson = this.jsonFetcher;
        switch (provider) {
            case 'rawg':
                return searchRawg(fetchJson, query, apiKey, {
                    page: options.page,
                    pageSize: options.pageSize,
                });
            case 'steam':
                return searchSteam(fetchJson, query, {
                    includeDlc: options.includeDlc,
                    steamGridDb: this.getSettings().integrations?.providers.steamgriddb,
                    imageExists: imageUrlExists,
                    page: options.page,
                    pageSize: options.pageSize,
                });
            case 'igdb':
                return searchIgdb(fetchJson, query, apiKey, clientSecret, {
                    page: options.page,
                    pageSize: options.pageSize,
                });
            case 'anilist':
                if (kind === 'manga') {
                    return searchAniListManga(fetchJson, query, {
                        page: options.page,
                        pageSize: options.pageSize,
                    });
                }
                return searchAniList(fetchJson, query, {
                    page: options.page,
                    pageSize: options.pageSize,
                });
            case 'shikimori':
                if (kind === 'manga') {
                    return searchShikimoriManga(fetchJson, query, {
                        page: options.page,
                        pageSize: options.pageSize,
                    });
                }
                return searchShikimori(fetchJson, query, {
                    page: options.page,
                    pageSize: options.pageSize,
                });
            case 'hardcover':
                return searchHardcoverBooks(fetchJson, query, apiKey, {
                    page: options.page,
                    pageSize: options.pageSize,
                });
            case 'googlebooks':
                return searchGoogleBooks(fetchJson, query, apiKey, {
                    page: options.page,
                    pageSize: options.pageSize,
                });
            case 'jikan':
                return searchJikanManga(fetchJson, query, {
                    page: options.page,
                    pageSize: options.pageSize,
                });
            case 'mangadex':
                return searchMangaDex(fetchJson, query, {
                    page: options.page,
                    pageSize: options.pageSize,
                });
            case 'tmdb':
                return searchTmdb(fetchJson, query, apiKey, {
                    kind: this.toVideoKind(kind),
                    page: options.page,
                    pageSize: options.pageSize,
                });
            case 'tvmaze':
                return searchTvmaze(fetchJson, query, apiKey, {
                    kind: this.toVideoKind(kind),
                    page: options.page,
                    pageSize: options.pageSize,
                });
            case 'omdb':
                return searchOmdb(fetchJson, query, apiKey, {
                    kind: this.toVideoKind(kind),
                    page: options.page,
                    pageSize: options.pageSize,
                });
            default:
                return [];
        }
    }

    private async fetchDetails(provider: ProviderId, id: string, apiKey: string, clientSecret = '', kind?: 'movies' | 'series' | 'books' | 'manga'): Promise<GameDetails | AnimeDetails | VideoDetails | BookDetails | MangaDetails | null> {
        const fetchJson = this.jsonFetcher;
        switch (provider) {
            case 'rawg':
                return getRawgDetails(fetchJson, id, apiKey);
            case 'steam':
                return getSteamDetails(fetchJson, id, {
                    steamGridDb: this.getSettings().integrations?.providers.steamgriddb,
                    imageExists: imageUrlExists,
                });
            case 'igdb':
                return getIgdbDetails(fetchJson, id, apiKey, clientSecret);
            case 'anilist':
                if (kind === 'manga') return getAniListMangaDetails(fetchJson, id);
                return getAniListDetails(fetchJson, id);
            case 'shikimori':
                if (kind === 'manga') return getShikimoriMangaDetails(fetchJson, id);
                return getShikimoriDetails(fetchJson, id);
            case 'hardcover':
                return getHardcoverBookDetails(fetchJson, id, apiKey);
            case 'googlebooks':
                return getGoogleBooksDetails(fetchJson, id, apiKey);
            case 'jikan':
                return getJikanMangaDetails(fetchJson, id);
            case 'mangadex':
                return getMangaDexDetails(fetchJson, id);
            case 'tmdb':
                return getTmdbDetails(fetchJson, id, apiKey, this.toVideoKind(kind));
            case 'tvmaze':
                return getTvmazeDetails(fetchJson, id, apiKey, this.toVideoKind(kind));
            case 'omdb':
                return getOmdbDetails(fetchJson, id, apiKey, this.toVideoKind(kind));
            default:
                return null;
        }
    }

    async fetchAnimePartsForItem(anime: AnimeItem): Promise<IntegrationAnimePart[] | null> {
        const provider = anime.integrationProvider;
        const id = anime.integrationId;
        if (!provider || !id) return null;

        const providerSettings = this.getSettings().integrations?.providers[provider];
        if (!providerSettings?.enabled || !this.hasRequiredCredentials(provider, providerSettings)) return null;

        const details = await this.fetchDetails(
            provider,
            id,
            providerSettings.apiKey || '',
            providerSettings.clientSecret || ''
        );
        if (!details || !this.isAnimeDetails(details)) return null;
        return this.getAnimeParts(details);
    }

    async reviewAnimePartsForItem(anime: AnimeItem, providerParts: IntegrationAnimePart[]): Promise<{
        parts: IntegrationAnimePart[];
        activePartId: string | null;
        status: AnimeItem['status'];
    } | null> {
        return this.reviewAnimeParts({ ...this.detailsFromAnime(anime), parts: providerParts }, {
            provider: anime.integrationProvider ?? 'anilist',
            id: anime.integrationId ?? '',
            title: anime.displayName,
            existingParts: anime.parts ?? [],
            activePartId: anime.activePartId ?? null,
            status: anime.status,
            markNewParts: true,
        });
    }

    private async buildGameValues(
        details: GameDetails,
        includeHowLongToBeat: boolean,
        fallbackImage = '',
        preferFallbackPoster = false
    ): Promise<Record<string, unknown>> {
        const hltb = includeHowLongToBeat
            ? await fetchHowLongToBeatValues(this.jsonFetcher, details.name, details.year, '[Integrations]')
            : null;
        const poster = preferFallbackPoster
            ? (fallbackImage || details.poster)
            : (details.poster || fallbackImage);

        return {
            name: details.name,
            Poster: poster,
            PosterHorizontal: details.posterHorizontal || poster,
            Plot: details.description,
            genres: details.genres,
            platforms: details.platforms,
            developers: details.developers,
            publishers: details.publishers,
            rating: details.rating,
            metacritic: details.metacritic,
            released: details.released,
            Year: details.year,
            url: details.url,
            status: 'not_started',
            main: hltb?.main ?? '',
            main_plus_sides: hltb?.main_plus_sides ?? '',
            perfectionist: hltb?.perfectionist ?? '',
            completionist: hltb?.perfectionist ?? '',
        };
    }

    private buildAnimeValues(details: AnimeDetails, source?: {
        parts?: IntegrationAnimePart[];
        activePartId?: string | null;
        status?: AnimeItem['status'];
        provider?: ProviderId;
        id?: string;
    }): Record<string, unknown> {
        const parts = source && Object.prototype.hasOwnProperty.call(source, 'parts')
            ? source.parts ?? []
            : this.getAnimeParts(details);
        const activePart = parts.find((part) => part.id === source?.activePartId) ?? parts[0] ?? null;
        return {
            name: details.name,
            image: details.image,
            ImageHorizontal: details.imageHorizontal ?? details.image,
            Plot: details.description,
            imdbRating: details.imdbRating,
            tags: details.tags,
            Year: details.year,
            studios: details.studios,
            url: details.url,
            status: source?.status ?? 'planned',
            format: details.format || '',
            seasonCurrent: activePart?.seasonNumber ?? '',
            episodeCurrent: activePart?.episodeCurrent ?? '',
            episodeTotal: activePart?.episodeTotal ?? '',
            activePartId: activePart?.id ?? '',
            animePartsYaml: renderPartsYaml(parts),
            integrationProvider: source?.provider ?? '',
            integrationId: source?.id ?? '',
        };
    }

    private buildVideoValues(details: VideoDetails, kind: 'movies' | 'series', source?: {
        provider?: ProviderId;
        id?: string;
        activePartId?: string | null;
        status?: IntegrationVideoPart['status'];
    }): Record<string, unknown> {
        const parts = details.parts ?? [];
        const activePart = (source?.activePartId ? parts.find((part) => part.id === source.activePartId) : null) ?? parts[0] ?? null;
        return {
            name: details.name,
            Poster: details.poster,
            PosterHorizontal: details.posterHorizontal || details.poster,
            Plot: details.description,
            genres: details.genres,
            Year: details.year,
            released: details.released ?? '',
            runtime: details.runtime ?? '',
            director: details.director ?? '',
            actors: details.actors ?? '',
            seasons: details.seasons ?? '',
            episodeCurrent: activePart?.episodeCurrent ?? details.episodeCurrent ?? 0,
            episodeTotal: activePart?.episodeTotal ?? details.episodeTotal ?? '',
            networks: details.networks ?? [],
            studios: details.studios ?? [],
            rating: details.rating ?? '',
            url: details.url,
            status: source?.status ?? 'planned',
            activePartId: activePart?.id ?? '',
            videoPartsYaml: renderPartsYaml(parts),
            integrationProvider: source?.provider ?? '',
            integrationId: source?.id ?? '',
        };
    }

    private buildBookValues(details: BookDetails, source?: {
        provider?: ProviderId;
        id?: string;
        title?: string;
        year?: string;
        poster?: string;
    }): Record<string, unknown> {
        const preferSearchResult = source?.provider === 'hardcover';
        const poster = (preferSearchResult ? source?.poster : '') || details.poster || source?.poster || '';
        const title = (preferSearchResult ? source?.title : '') || details.name;
        const year = (preferSearchResult ? source?.year : '') || details.year;
        return {
            name: title,
            Poster: poster,
            PosterHorizontal: details.posterHorizontal || poster,
            Plot: details.description,
            authors: details.authors,
            publisher: details.publisher ?? '',
            genres: details.genres,
            Year: year,
            released: details.released ?? '',
            pageCurrent: 0,
            pageTotal: details.pages ?? '',
            chapterCurrent: 0,
            chapterTotal: '',
            rating: details.rating ?? '',
            url: details.url,
            status: 'planned',
            integrationProvider: source?.provider ?? '',
            integrationId: source?.id ?? '',
        };
    }

    private buildMangaValues(details: MangaDetails, source?: {
        provider?: ProviderId;
        id?: string;
        activePartId?: string | null;
        status?: IntegrationMangaPart['status'];
    }): Record<string, unknown> {
        const parts = details.parts ?? [];
        const activePart = (source?.activePartId ? parts.find((part) => part.id === source.activePartId) : null) ?? parts[0] ?? null;
        return {
            name: details.name,
            Poster: details.poster,
            PosterHorizontal: details.posterHorizontal || details.poster,
            Plot: details.description,
            authors: details.authors,
            artists: details.artists,
            genres: details.genres,
            Year: details.year,
            chapterCurrent: activePart?.chapterCurrent ?? 0,
            chapterTotal: activePart?.chapterTotal ?? details.chapters ?? '',
            volumeCurrent: activePart?.volumeNumber ?? '',
            volumeTotal: details.volumes ?? (parts.length ? String(parts.length) : ''),
            rating: details.rating ?? '',
            url: details.url,
            status: source?.status ?? 'planned',
            activePartId: activePart?.id ?? '',
            mangaPartsYaml: renderMangaPartsYaml(parts),
            integrationProvider: source?.provider ?? '',
            integrationId: source?.id ?? '',
        };
    }

    private buildManualValues(draft: ManualCreateDraft): Record<string, unknown> {
        const poster = draft.poster || '';
        const posterHorizontal = draft.posterHorizontal || poster;
        const common: Record<string, unknown> = {
            name: draft.title,
            Poster: poster,
            PosterHorizontal: posterHorizontal,
            image: poster,
            ImageHorizontal: posterHorizontal,
            Plot: '',
            genres: draft.genres,
            tags: draft.tags,
            Year: draft.year,
            released: draft.released,
            rating: draft.rating ?? '',
            userRating: draft.rating ?? '',
            url: draft.url,
            status: draft.status,
            integrationProvider: '',
            integrationId: '',
        };

        if (draft.kind === 'games') {
            return {
                ...common,
                gameSeries: draft.gameSeries,
                platforms: [],
                developers: [],
                publishers: [],
                metacritic: '',
                main: '',
                main_plus_sides: '',
                perfectionist: '',
                completionist: '',
            };
        }

        if (draft.kind === 'anime') {
            const parts = draft.animeParts.length ? draft.animeParts : [{
                id: 'tv-1',
                kind: draft.format,
                title: draft.format === 'tv' ? `Season ${draft.seasonNumber ?? 1}` : draft.format.toUpperCase(),
                seasonNumber: draft.format === 'tv' ? draft.seasonNumber ?? 1 : draft.seasonNumber,
                episodeCurrent: draft.episodeCurrent,
                episodeTotal: draft.episodeTotal,
                status: draft.status,
            }];
            const activePart = parts.find((part) => part.id === draft.activeAnimePartId) ?? parts[0] ?? null;
            return {
                ...common,
                imdbRating: '',
                studios: [],
                format: activePart?.kind ?? draft.format,
                seasonCurrent: activePart?.seasonNumber ?? '',
                episodeCurrent: activePart?.episodeCurrent ?? 0,
                episodeTotal: activePart?.episodeTotal ?? '',
                activePartId: activePart?.id ?? '',
                animePartsYaml: renderPartsYaml(parts),
            };
        }

        if (draft.kind === 'movies' || draft.kind === 'series') {
            const isSeries = draft.kind === 'series';
            const seasonNumber = isSeries ? draft.seasonNumber ?? 1 : null;
            const part = {
                id: isSeries ? `season-${seasonNumber ?? 1}` : 'movie-1',
                kind: isSeries ? 'season' : 'movie',
                title: isSeries ? `Season ${seasonNumber ?? 1}` : 'Movie',
                seasonNumber,
                episodeCurrent: draft.episodeCurrent,
                episodeTotal: draft.episodeTotal,
                status: draft.status,
            };
            return {
                ...common,
                runtime: '',
                director: '',
                actors: '',
                seasons: isSeries ? seasonNumber ?? '' : '',
                episodeCurrent: draft.episodeCurrent ?? 0,
                episodeTotal: draft.episodeTotal ?? '',
                networks: [],
                studios: [],
                activePartId: part.id,
                videoPartsYaml: renderPartsYaml([part]),
            };
        }

        if (draft.kind === 'books') {
            return {
                ...common,
                authors: [],
                publisher: '',
                pageCurrent: draft.pageCurrent ?? 0,
                pageTotal: draft.pageTotal ?? '',
                chapterCurrent: draft.chapterCurrent ?? 0,
                chapterTotal: draft.chapterTotal ?? '',
            };
        }

        const volumeNumber = draft.volumeCurrent ?? 1;
        const part = {
            id: `volume-${volumeNumber}`,
            kind: 'volume',
            title: `Volume ${volumeNumber}`,
            volumeNumber,
            chapterCurrent: draft.chapterCurrent,
            chapterTotal: draft.chapterTotal,
            status: draft.status,
        };
        return {
            ...common,
            authors: [],
            artists: [],
            chapterCurrent: draft.chapterCurrent ?? 0,
            chapterTotal: draft.chapterTotal ?? '',
            volumeCurrent: draft.volumeCurrent ?? '',
            volumeTotal: draft.volumeTotal ?? '',
            activePartId: part.id,
            mangaPartsYaml: renderMangaPartsYaml([part]),
        };
    }

    private async prepareManualDraft(draft: ManualCreateDraft, settings: LorebaseSettings): Promise<ManualCreateDraft> {
        if (!draft.posterFile) return draft;
        const folderPath = settings.integrations?.imageStorage?.folderPath || 'files/lorebase/images';
        const localPath = await saveManualImageFileToVault(this.app, draft.posterFile, {
            baseFolder: folderPath,
            kind: draft.kind,
            title: draft.title || 'Untitled',
            label: 'Poster',
        });
        return {
            ...draft,
            poster: localPath,
            posterHorizontal: localPath,
            posterFile: null,
        };
    }

    private async reviewAnimeParts(details: AnimeDetails, options: {
        provider: ProviderId;
        id: string;
        title: string;
        existingParts?: AnimeItem['parts'];
        activePartId?: string | null;
        status?: AnimeItem['status'];
        markNewParts?: boolean;
    }): Promise<{
        parts: IntegrationAnimePart[];
        activePartId: string | null;
        status: AnimeItem['status'];
    } | null> {
        const modal = new AnimePartsReviewModal(this.app, {
            title: t('animePartsProviderTitle'),
            subtitle: options.title,
            providerParts: this.getAnimeParts(details),
            existingParts: options.existingParts,
            activePartId: options.activePartId,
            status: options.status,
            markNewParts: options.markNewParts,
        });
        return modal.openAndGetValue();
    }

    private detailsFromAnime(anime: AnimeItem): AnimeDetails {
        return {
            kind: 'anime',
            name: anime.displayName,
            description: anime.summary ?? anime.description ?? '',
            image: anime.imageUrl,
            imageHorizontal: anime.horizontalImageUrl ?? anime.imageUrl,
            tags: anime.tags,
            studios: [],
            year: anime.year ? String(anime.year) : '',
            imdbRating: '',
            url: anime.sourceUrl ?? '',
            format: anime.format,
            parts: [],
        };
    }

    private getAnimeParts(details: AnimeDetails): IntegrationAnimePart[] {
        if (details.parts?.length) return details.parts;
        return [{
            id: 'main',
            kind: this.normalizeAnimePartKind(details.format),
            title: details.format || details.name || 'Main',
            seasonNumber: this.normalizeAnimePartKind(details.format) === 'tv' ? 1 : null,
            episodeCurrent: 0,
            episodeTotal: null,
            status: 'planned',
        }];
    }

    private normalizeAnimePartKind(format: string | undefined): IntegrationAnimePart['kind'] {
        const value = (format ?? '').trim().toLowerCase();
        if (value === 'movie' || value === 'фильм') return 'movie';
        if (value === 'ova') return 'ova';
        if (value === 'ona') return 'ona';
        if (value === 'special' || value === 'спешл') return 'special';
        return 'tv';
    }

    private toStringSafe(value: unknown): string {
        if (value === null || value === undefined) return '';
        return String(value);
    }

    private firstStringValue(values: Record<string, unknown>, key: string, ...fallbacks: unknown[]): string {
        const primary = this.toStringSafe(values[key]);
        if (primary) return primary;
        for (const fallback of fallbacks) {
            const text = this.toStringSafe(fallback);
            if (text) return text;
        }
        return '';
    }
}
