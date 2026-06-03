/**
 * LOREBASE - Integration Service
 * Handles provider search, detail fetching, and note creation.
 */

import { App, Notice, TFile, TFolder, requestUrl } from 'obsidian';
import { IntegrationTemplateSettings, LorebaseSettings } from '../types';
import { t } from '../localization';
import { ChoiceModal, MultiSelectSearchModal, SearchProviderOption } from '../modals/IntegrationModals';
import { AnimeDetails, GameDetails, MediaKind, ProviderId, SearchResult } from './integrations/types';
import { buildSimpleTemplate, getDefaultTemplateFields, renderTemplate, sanitizeFileName } from './integrations/templateUtils';
import { getAniListDetails, searchAniList } from './integrations/providers/anilist';
import { getHowLongToBeatTimes } from './integrations/providers/howlongtobeat';
import { getRawgDetails, searchRawg } from './integrations/providers/rawg';
import { getShikimoriDetails, searchShikimori } from './integrations/providers/shikimori';
import { getSteamDetails, searchSteam } from './integrations/providers/steam';

export class IntegrationService {
    private app: App;
    private getSettings: () => LorebaseSettings;

    constructor(app: App, getSettings: () => LorebaseSettings) {
        this.app = app;
        this.getSettings = getSettings;
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

        if (this.requiresApiKey(providerId) && !providerSettings.apiKey) {
            return { ok: false, reason: 'missing_key' };
        }

        const query = providerId === 'rawg' || providerId === 'steam' ? 'portal' : 'naruto';
        const results = await this.search(providerId, query, providerSettings.apiKey || '');
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

            const selected = await this.chooseResults(kind, mediaSettings.provider as ProviderId, providerOptions);
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
                const itemProviderId = item.provider as ProviderId;
                const providerSettings = integrations.providers[itemProviderId];
                if (!providerSettings?.enabled) {
                    new Notice(t('noticeProviderDisabled'));
                    continue;
                }
                if (this.requiresApiKey(itemProviderId) && !providerSettings.apiKey) {
                    new Notice(t('noticeMissingApiKey'));
                    continue;
                }

                const details = await this.fetchDetails(itemProviderId, item.id, providerSettings.apiKey || '');
                if (!details) {
                    new Notice(t('noticeNoResults'));
                    continue;
                }

                const values = kind === 'games'
                    ? await this.buildGameValues(details as GameDetails, shouldLoadHltb)
                    : this.buildAnimeValues(details as AnimeDetails);

                const title = this.toStringSafe(values.name || item.title || 'Untitled');
                const content = template
                    ? renderTemplate(template, values)
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
                const selectedProviderId = providerId as ProviderId | undefined;
                if (!selectedProviderId) return [];
                const providerSettings = this.getSettings().integrations?.providers[selectedProviderId];
                if (!providerSettings?.enabled) return [];
                if (this.requiresApiKey(selectedProviderId) && !providerSettings.apiKey) return [];
                new Notice(t('notifyLoading'), 1200);
                return this.search(selectedProviderId, query, providerSettings.apiKey || '');
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
            }
        );
        return (await modal.openAndGetValues()) ?? [];
    }

    private requiresApiKey(provider: ProviderId): boolean {
        return provider === 'rawg';
    }

    private getProviderOptions(kind: MediaKind): SearchProviderOption[] {
        const providers = kind === 'games'
            ? [
                { id: 'rawg' as ProviderId, label: 'RAWG' },
                { id: 'steam' as ProviderId, label: 'Steam' },
            ]
            : [
                { id: 'anilist' as ProviderId, label: 'AniList' },
                { id: 'shikimori' as ProviderId, label: 'Shikimori' },
            ];
        const integrations = this.getSettings().integrations;

        return providers.map((provider) => {
            const settings = integrations?.providers[provider.id];
            const needsKey = this.requiresApiKey(provider.id);
            const missingKey = needsKey && !settings?.apiKey;
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
        const filtered = kind === 'games' && !howLongToBeatEnabled
            ? selected.filter((key) => key !== 'main' && key !== 'main_plus_sides' && key !== 'perfectionist' && key !== 'completionist')
            : selected;
        return buildSimpleTemplate(kind, filtered);
    }

    private async search(provider: ProviderId, query: string, apiKey: string): Promise<SearchResult[]> {
        switch (provider) {
            case 'rawg':
                return searchRawg(this.fetchJson.bind(this), query, apiKey);
            case 'steam':
                return searchSteam(this.fetchJson.bind(this), query);
            case 'anilist':
                return searchAniList(this.fetchJson.bind(this), query);
            case 'shikimori':
                return searchShikimori(this.fetchJson.bind(this), query);
            default:
                return [];
        }
    }

    private async fetchDetails(provider: ProviderId, id: string, apiKey: string): Promise<GameDetails | AnimeDetails | null> {
        switch (provider) {
            case 'rawg':
                return getRawgDetails(this.fetchJson.bind(this), id, apiKey);
            case 'steam':
                return getSteamDetails(this.fetchJson.bind(this), id);
            case 'anilist':
                return getAniListDetails(this.fetchJson.bind(this), id);
            case 'shikimori':
                return getShikimoriDetails(this.fetchJson.bind(this), id);
            default:
                return null;
        }
    }

    private async buildGameValues(details: GameDetails, includeHowLongToBeat: boolean): Promise<Record<string, unknown>> {
        const hltb = includeHowLongToBeat
            ? await this.fetchHowLongToBeatValues(details.name, details.year)
            : null;

        return {
            name: details.name,
            Poster: details.poster,
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
            const fields = new Set(mediaSettings.templateFields ?? []);
            return fields.has('main')
                || fields.has('main_plus_sides')
                || fields.has('perfectionist')
                || fields.has('completionist');
        }

        return /\{\{VALUE:(main|main_plus_sides|perfectionist|completionist)\}\}/.test(mediaSettings.template);
    }

    private async fetchHowLongToBeatValues(name: string, year?: string): Promise<{
        main: string;
        main_plus_sides: string;
        perfectionist: string;
    } | null> {
        try {
            return await getHowLongToBeatTimes(this.fetchJson.bind(this), name, year);
        } catch (error) {
            console.warn('[Integrations] howlongtobeat failed', error);
            return null;
        }
    }

    private buildAnimeValues(details: AnimeDetails): Record<string, unknown> {
        return {
            name: details.name,
            image: details.image,
            Plot: details.description,
            imdbRating: details.imdbRating,
            tags: details.tags,
            Year: details.year,
            studios: details.studios,
            url: details.url,
            status: 'planned',
            format: details.format || '',
        };
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
