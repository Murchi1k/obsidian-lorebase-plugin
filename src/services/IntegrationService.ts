/**
 * LOREBASE - Integration Service
 * Handles provider search, detail fetching, and note creation.
 */

import { App, Notice, TFile, TFolder, requestUrl } from 'obsidian';
import { AnimeItem, IntegrationTemplateSettings, LorebaseSettings } from '../types';
import { t } from '../localization';
import { ChoiceModal, MultiSelectSearchModal, SearchProviderOption } from '../modals/IntegrationModals';
import { AnimePartsReviewModal } from '../modals/AnimePartsReviewModal';
import { AnimeDetails, GameDetails, IntegrationAnimePart, MediaKind, ProviderId, SearchResult } from './integrations/types';
import { buildSimpleTemplate, getDefaultTemplateFields, renderTemplate, sanitizeFileName } from './integrations/templateUtils';
import { getAniListDetails, searchAniList } from './integrations/providers/anilist';
import { getHowLongToBeatTimes } from './integrations/providers/howlongtobeat';
import { getIgdbDetails, searchIgdb } from './integrations/providers/igdb';
import { getRawgDetails, searchRawg } from './integrations/providers/rawg';
import { getShikimoriDetails, searchShikimori } from './integrations/providers/shikimori';
import { getSteamDetails, searchSteam } from './integrations/providers/steam';
import { localizeTemplateImages } from './integrations/imageStorage';
import type { JsonFetcher } from './integrations/providers/common';

export class IntegrationService {
    private app: App;
    private getSettings: () => LorebaseSettings;
    private runSteamSync?: () => void;

    constructor(app: App, getSettings: () => LorebaseSettings, runSteamSync?: () => void) {
        this.app = app;
        this.getSettings = getSettings;
        this.runSteamSync = runSteamSync;
    }

    async addGame(): Promise<void> {
        await this.addMedia('games');
    }

    async addAnime(): Promise<void> {
        await this.addMedia('anime');
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

        const query = providerId === 'rawg' || providerId === 'steam' || providerId === 'igdb' ? 'portal' : 'naruto';
        const results = await this.search(
            providerId,
            query,
            providerSettings.apiKey || '',
            providerSettings.clientSecret || ''
        );
        if (!results.length) {
            return { ok: false, reason: 'no_results' };
        }
        return { ok: true };
    }

    private async addMedia(kind: MediaKind): Promise<void> {
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

            const selected = await this.chooseResults(kind, mediaSettings.provider, providerOptions);
            if (!selected.length) return;

            const template = this.getTemplate(
                kind,
                mediaSettings.templateEnabled,
                mediaSettings.templateMode,
                mediaSettings.templateFields,
                mediaSettings.template,
                mediaSettings.howLongToBeatEnabled ?? false
            );
            const shouldLoadHltb = kind === 'games' && this.shouldLoadHowLongToBeat(mediaSettings);

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
                    providerSettings.clientSecret || ''
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
                    values = await this.buildGameValues(details, shouldLoadHltb, item.image);
                } else {
                    if (!this.isAnimeDetails(details)) {
                        new Notice(t('noticeNoResults'));
                        continue;
                    }
                    const itemProviderId = item.provider;
                    values = this.buildAnimeValues(details, {
                        provider: itemProviderId,
                        id: item.id,
                        parts: [],
                    });
                }

                const title = this.toStringSafe(values.name || item.title || 'Untitled');
                const renderedValues = template
                    ? await localizeTemplateImages(this.app, kind, title, values, integrations.imageStorage, template)
                    : values;
                const content = template
                    ? renderTemplate(template, renderedValues)
                    : `# ${title}\n`;

                const folderPath = kind === 'games' ? settings.games.folderPath : settings.anime.folderPath;
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

                await this.ensureFolder(folderPath);
                await this.app.vault.create(fullPath, content);
                new Notice(t('noticeCreated'));
            }
        } catch (error: unknown) {
            console.error('Integration add error:', error);
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

    private async chooseResults(
        kind: MediaKind,
        initialProviderId: ProviderId,
        providerOptions: SearchProviderOption[]
    ): Promise<SearchResult[]> {
        const modal = new MultiSelectSearchModal<SearchResult>(
            this.app,
            async (query, providerId) => {
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
                    providerSettings.clientSecret || ''
                );
            },
            {
                titleText: kind === 'games' ? t('promptSearchGame') : t('promptSearchAnime'),
                placeholder: t('promptSearchPlaceholder'),
                emptyText: t('noticeNoResults'),
                doneText: t('promptAddSelected'),
                cancelText: t('commonCancel'),
                selectedLabelText: t('promptSelectedLabel'),
                providerOptions,
                initialProviderId,
                titleIcon: kind === 'games' ? 'gamepad-2' : 'clapperboard',
                syncActionText: kind === 'games' ? 'Steam Sync' : undefined,
                onSyncAction: kind === 'games' ? this.runSteamSync : undefined,
            }
        );
        return (await modal.openAndGetValues()) ?? [];
    }

    private requiresApiKey(provider: ProviderId): boolean {
        return provider === 'rawg' || provider === 'igdb';
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
            : [
                { id: 'anilist', label: 'AniList' },
                { id: 'shikimori', label: 'Shikimori' },
            ];
        const integrations = this.getSettings().integrations;

        return providers.map((provider) => {
            const settings = integrations?.providers[provider.id];
            const needsKey = this.requiresApiKey(provider.id);
            const missingKey = needsKey && !this.hasRequiredCredentials(provider.id, settings);
            const disabled = !settings?.enabled || missingKey;
            const disabledReason = !settings?.enabled
                ? t('noticeProviderDisabled')
                : missingKey
                    ? t('noticeMissingApiKey')
                    : undefined;
            return {
                id: provider.id,
                label: provider.label,
                disabled,
                disabledReason,
            };
        });
    }

    private isProviderId(value: string | undefined): value is ProviderId {
        return value === 'rawg'
            || value === 'steam'
            || value === 'igdb'
            || value === 'anilist'
            || value === 'shikimori';
    }

    private isGameDetails(value: GameDetails | AnimeDetails): value is GameDetails {
        return 'poster' in value;
    }

    private isAnimeDetails(value: GameDetails | AnimeDetails): value is AnimeDetails {
        return 'image' in value;
    }

    private getTemplate(
        kind: MediaKind,
        enabled: boolean,
        mode: string | undefined,
        fields: string[] | undefined,
        advancedTemplate: string,
        howLongToBeatEnabled: boolean
    ): string | null {
        if (!enabled) return null;
        const templateMode = mode ?? 'advanced';
        if (templateMode === 'advanced') return advancedTemplate;
        const selected = fields && fields.length ? fields : getDefaultTemplateFields(kind);
        const withHltb = kind === 'games' && howLongToBeatEnabled
            ? Array.from(new Set([...selected, 'main', 'main_plus_sides', 'perfectionist']))
            : selected;
        const filtered = kind === 'games' && !howLongToBeatEnabled
            ? selected.filter((key) => key !== 'main' && key !== 'main_plus_sides' && key !== 'perfectionist' && key !== 'completionist')
            : withHltb;
        return buildSimpleTemplate(kind, filtered);
    }

    private async search(provider: ProviderId, query: string, apiKey: string, clientSecret = ''): Promise<SearchResult[]> {
        const fetchJson = this.getJsonFetcher();
        switch (provider) {
            case 'rawg':
                return searchRawg(fetchJson, query, apiKey);
            case 'steam':
                return searchSteam(fetchJson, query);
            case 'igdb':
                return searchIgdb(fetchJson, query, apiKey, clientSecret);
            case 'anilist':
                return searchAniList(fetchJson, query);
            case 'shikimori':
                return searchShikimori(fetchJson, query);
            default:
                return [];
        }
    }

    private async fetchDetails(provider: ProviderId, id: string, apiKey: string, clientSecret = ''): Promise<GameDetails | AnimeDetails | null> {
        const fetchJson = this.getJsonFetcher();
        switch (provider) {
            case 'rawg':
                return getRawgDetails(fetchJson, id, apiKey);
            case 'steam':
                return getSteamDetails(fetchJson, id);
            case 'igdb':
                return getIgdbDetails(fetchJson, id, apiKey, clientSecret);
            case 'anilist':
                return getAniListDetails(fetchJson, id);
            case 'shikimori':
                return getShikimoriDetails(fetchJson, id);
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
        fallbackImage = ''
    ): Promise<Record<string, unknown>> {
        const hltb = includeHowLongToBeat
            ? await this.fetchHowLongToBeatValues(details.name, details.year)
            : null;

        return {
            name: details.name,
            Poster: details.poster || details.posterHorizontal || fallbackImage,
            PosterHorizontal: details.posterHorizontal || details.poster || fallbackImage,
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

    private shouldLoadHowLongToBeat(mediaSettings: IntegrationTemplateSettings): boolean {
        if (!mediaSettings.templateEnabled) return false;
        if (!mediaSettings.howLongToBeatEnabled) return false;

        const mode = mediaSettings.templateMode ?? 'advanced';
        if (mode === 'simple') {
            return true;
        }

        return /\{\{VALUE:(main|main_plus_sides|perfectionist|completionist)\}\}/.test(mediaSettings.template);
    }

    private async fetchHowLongToBeatValues(name: string, year?: string): Promise<{
        main: string;
        main_plus_sides: string;
        perfectionist: string;
    } | null> {
        try {
            return await getHowLongToBeatTimes(this.getJsonFetcher(), name, year);
        } catch (error) {
            console.warn('[Integrations] howlongtobeat failed', error);
            return null;
        }
    }

    private getJsonFetcher(): JsonFetcher {
        return this.fetchJson.bind(this);
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
            animePartsYaml: this.renderAnimePartsYaml(parts),
            integrationProvider: source?.provider ?? '',
            integrationId: source?.id ?? '',
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

    private renderAnimePartsYaml(parts: IntegrationAnimePart[]): string {
        if (!parts.length) return '  []';
        return parts.map((part) => [
            `  - id: "${this.escapeYaml(part.id)}"`,
            `    kind: "${part.kind}"`,
            `    title: "${this.escapeYaml(part.title)}"`,
            `    season: ${part.seasonNumber ?? 'null'}`,
            `    episode_current: ${part.episodeCurrent ?? 0}`,
            `    episode_total: ${part.episodeTotal ?? 'null'}`,
            `    status: "${part.status}"`,
        ].join('\n')).join('\n');
    }

    private escapeYaml(value: unknown): string {
        return this.toStringSafe(value).replace(/"/g, '\\"');
    }

    private toStringSafe(value: unknown): string {
        if (value === null || value === undefined) return '';
        return String(value);
    }

    private async fetchJson(
        url: string,
        headers: Record<string, string> = {},
        method: 'GET' | 'POST' = 'GET',
        body?: string
    ): Promise<unknown> {
        try {
            const options: { url: string; method: 'GET' | 'POST'; headers: Record<string, string>; body?: string } = { url, method, headers };
            if (body !== undefined) {
                options.body = body;
            }
            const res = await requestUrl(options);
            return res.json;
        } catch (e) {
            console.error('Integration fetch error:', e);
            return null;
        }
    }

    private async ensureFolder(folderPath: string): Promise<void> {
        if (!folderPath) return;
        const existing = this.app.vault.getAbstractFileByPath(folderPath);
        if (existing instanceof TFolder) return;
        if (existing && !(existing instanceof TFolder)) return;
        await this.app.vault.createFolder(folderPath);
    }
}
