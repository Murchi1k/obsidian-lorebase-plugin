import { catalogSource, inspectPartCatalog } from './media/partCatalog';
import { discoveryFrontmatter, withPersonalFields } from '../utils/discovery';
import { reconcileAnimeParts } from './integrations/animeParts';
import { requestWithDeadline } from './integrations/requestDeadline';
import { assertOnlineExtras, runOnlineExtra } from './onlineExtras';

import { fetchSourceGallery, galleryProviders } from './integrations/sourceGallery';
import { playStationSearchQueries } from './playstation/search';
import { fetchSourceTrailers, trailerProviders } from './integrations/sourceTrailers';
import type { SourceGallery } from './integrations/types';
import { normalizeCountryMetadata } from './media/statisticsCountries';
import { getTemplateYamlKeys, orderTemplateContent } from './integrations/templateSchema';
import { searchVndb, getVndbDetails } from './integrations/providers/vndb';
import { normalizeMediaWorkType, normalizeCountry } from '../utils/mediaWorkType';
import { isFutureReleaseDate } from './media/releaseStatus';
import { getAlternativeTitlePreference, selectAlternativeTitles } from './integrations/alternativeTitles';
/**
 * LOREBASE - Integration Service
 * Handles provider search, detail fetching, and note creation.
 */

import { App, Notice, TFile } from 'obsidian';
import { AnimeItem, CommunityRating, GameDlc, GameItem, LorebaseSettings, MediaItem, MediaType } from '../types';
import { t } from '../localization';
import { CatalogReferenceError, referenceText } from '../localization/catalogReference';
import { parseCatalogReference } from './integrations/catalogReferences';
import { ChoiceModal, ExistingFileChoice, ExistingFileChoiceModal, ExistingFilePreview, MultiSelectSearchModal, SearchProviderOption } from '../modals/IntegrationModals';
import { AnimePartsReviewModal, type AnimePartsReviewResult } from '../modals/AnimePartsReviewModal';
import { ManualCreateModal, type ManualCreateDraft } from '../modals/ManualCreateModal';
import { completeManualContent } from './integrations/manualCreatePersistence';
import { completeImportedMetadata } from './integrations/importMetadata';
import { AnimeDetails, BookDetails, GameDetails, IntegrationAnimePart, IntegrationMangaPart, IntegrationVideoPart, MangaDetails, MediaEnrichmentPatch, MediaKind, MediaSourceSelection, ProviderId, SearchResult, VideoDetails, PreparedVideoImport } from './integrations/types';
import { buildSimpleTemplate, ensureIntegrationSourceFrontmatter, getDefaultTemplateFields, getEffectiveSimpleTemplateFields, renderTemplate, sanitizeFileName } from './integrations/templateUtils';
import { enrichAnimeSearchCountries, getAniListDetails, getAniListMangaDetails, searchAniList, searchAniListManga } from './integrations/providers/anilist';
import { getKitsuDetails, getLegacyMalAnimeDetails, getLegacyMalMangaDetails, resolveKitsuSlug, searchKitsu } from './integrations/providers/kitsu';
import { getOpenLibraryDetails, searchOpenLibrary } from './integrations/providers/openlibrary';
import { getGoogleBooksDetails, searchGoogleBooks } from './integrations/providers/googlebooks';
import { getHardcoverBookDetails, resolveHardcoverSlug, searchHardcoverBooks } from './integrations/providers/hardcover';
import { getIgdbDetails, getIgdbDlcForGame, resolveIgdbSlug, searchIgdb } from './integrations/providers/igdb';
import { getMangaUpdatesDetails, searchMangaUpdates } from './integrations/providers/mangaupdates';
import { getMangaDexDetails, searchMangaDex, findMangaDexCoverForMangaUpdates } from './integrations/providers/mangadex';
import { getComicVineDetails, searchComicVine } from './integrations/providers/comicvine';
import { isProviderEnabled } from './integrations/providerSettings';
import { getRawgDetails, resolveRawgSlug, searchRawg } from './integrations/providers/rawg';
import { getShikimoriDetails, getShikimoriMangaDetails, searchShikimori, searchShikimoriManga } from './integrations/providers/shikimori';
import { getSteamDetails, getSteamDlcForGame, searchSteam } from './integrations/providers/steam';
import { getSteamGridDbPoster } from './integrations/providers/steamgriddb';
import { getOmdbDetails, lookupOmdbRecord, searchOmdb } from './integrations/providers/omdb';
import { getTmdbDetails, normalizeTmdbLanguage, searchTmdb } from './integrations/providers/tmdb';
import { getTvmazeDetails, searchTvmaze } from './integrations/providers/tvmaze';
import { localizeExistingNoteImages, localizeTemplateImages, saveManualImageFileToVault } from './integrations/imageStorage';
import { BackgroundOperation } from './BackgroundOperation';
import type { JsonFetcher } from './integrations/providers/common';
import { createLibraryMembership } from './integrations/libraryMembership';
import { adaptVideoToAnime, isAnimeVideoProvider, type AnimeVideoSourceKind } from './integrations/animeVideoSources';
import { applyFrontmatterAliases, parseTemplateFieldAliases } from './media/templateFieldAliases';
import {
    ensureFolder,
    fetchHowLongToBeatValues,
    fetchJson,
    fetchText,
    getJsonFetcher,
    imageUrlExists,
    isProviderBlockedError,
    renderPartsYaml,
    renderMangaPartsYaml,
    shouldLoadHowLongToBeat,
} from './integrations/shared';
import {
    normalizeCommunityRating,
    sourceIdentity,
    toAnimePartsFrontmatter,
    toMangaPartsFrontmatter,
    toVideoPartsFrontmatter,
} from './integrations/enrichment';

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

const MEDIA_TYPE_BY_KIND: Record<MediaKind, MediaType> = {
    games: 'game',
    anime: 'anime',
    movies: 'movie',
    series: 'series',
    books: 'book',
    manga: 'manga',
};
type DetailsKind = Exclude<MediaKind, 'games'>;
type CommunityRatingSource = { provider: ProviderId; id: string; kind?: DetailsKind };
const providerTestCases: Partial<Record<ProviderId, { query: string; kind?: DetailsKind }>> = {
    vndb: { query: 'steins' }, rawg: { query: 'portal' }, steam: { query: 'portal' }, igdb: { query: 'portal' },
    tmdb: { query: 'matrix', kind: 'movies' }, omdb: { query: 'matrix', kind: 'movies' },
    tvmaze: { query: 'breaking bad', kind: 'series' },
    hardcover: { query: 'tolkien', kind: 'books' }, googlebooks: { query: 'tolkien', kind: 'books' }, openlibrary: { query: 'tolkien', kind: 'books' },
    mangaupdates: { query: 'berserk', kind: 'manga' }, mangadex: { query: 'berserk', kind: 'manga' }, comicvine: { query: 'batman', kind: 'manga' },
};

export interface NoteCreationOptions {
    signal?: AbortSignal;
    check?: () => void;
    decorate?: (content: string, template: string) => string;
    separateExisting?: boolean;
    openAfterCreate?: boolean;
}

export class IntegrationService {
    private readonly lifetime = new AbortController();
    private disposed = false;
    private app: App;
    private getSettings: () => LorebaseSettings;
    private runSteamSync?: (presentation?: import('../modals/inlineSync').InlineSyncPresentation) => void | Promise<void>;
    private jsonFetcher: JsonFetcher;
    private searchCache = new Map<string, { expiresAt: number; results: SearchResult[] }>();
    private mangaUpdatesPosters = new Map<string, { expiresAt: number; request: Promise<string> }>();

    constructor(app: App, getSettings: () => LorebaseSettings, runSteamSync?: (presentation?: import('../modals/inlineSync').InlineSyncPresentation) => void | Promise<void>,
        private readonly runAniListImport?: (presentation?: import('../modals/inlineSync').InlineSyncPresentation) => void | Promise<void>,
        private readonly openInbox?: (kind: MediaKind, presentation: import('../modals/inlineSync').InlineSyncPresentation) => void | Promise<void>) {
        this.app = app;
        this.getSettings = () => { this.assertActive(); return getSettings(); };
        this.runSteamSync = runSteamSync;
        const fetcher = getJsonFetcher((url, headers, method, body) => fetchJson(url, headers, method, body, {
            errorPrefix: 'Integration fetch error:',
            swallowErrors: false,
        }));
        this.jsonFetcher = async (url, headers, method, body) => {
            this.assertActive(); const value = await requestWithDeadline(() => fetcher(url, headers, method, body), undefined, this.lifetime.signal); this.assertActive(); return value;
        };
    }

    dispose(): void { this.lifetime.abort(); this.disposed = true; this.searchCache.clear(); this.mangaUpdatesPosters.clear(); }

    private assertActive(): void {
        if (this.disposed) { const error = new Error('Lorebase was unloaded.'); error.name = 'AbortError'; throw error; }
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

    async selectMediaSource(
        kind: MediaKind,
        query: string,
        preferredProvider?: ProviderId,
        signal?: AbortSignal,
        pickOnClick = false
    ): Promise<MediaSourceSelection | null> {
        const settings = this.getSettings();
        const integrations = settings.integrations;
        if (!integrations?.enabled) {
            new Notice(t('noticeIntegrationsDisabled'));
            return null;
        }
        const providerOptions = this.getProviderOptions(kind);
        if (!providerOptions.length) {
            new Notice(t('noticeProviderDisabled'));
            return null;
        }
        const configured = preferredProvider ?? integrations.media[kind].provider;
        const initialProvider = providerOptions.some(({ id }) => id === configured) ? configured : providerOptions[0].id;
        if (!this.isProviderId(initialProvider)) return null;

        const modal = new MultiSelectSearchModal<SearchResult>(
            this.app,
            async (value, providerId, searchOptions) => {
                return this.searchCatalogInput(kind, value, providerId, searchOptions);
            },
            {
                mediaKind: kind,
                titleText: this.getSearchTitle(kind),
                placeholder: referenceText('placeholder'),
                emptyText: t('noticeNoResults'),
                doneText: t('promptConfirmSelected'),
                cancelText: t('commonCancel'),
                providerOptions,
                initialProviderId: initialProvider,
                initialTmdbLanguage: kind === 'anime' ? this.getTmdbLanguage(kind) : undefined,
                initialQuery: query,
                maxSelection: 1,
                pickOnClick,
                titleIcon: this.getKindIcon(kind),
                includeDlcToggleText: kind === 'games' ? t('promptIncludeDlc') : undefined,
                imageFallbackResolver: (item) => this.resolveSearchImageFallback(item),
                publicationStatusResolver: kind === 'manga' ? item => this.resolveMangaSearchMetadata(item) : undefined,
            }
        );
        if (signal?.aborted) return null;
        const abort = (): void => modal.close();
        signal?.addEventListener('abort', abort, { once: true });
        try {
            const selected = await modal.openAndGetValues();
            return signal?.aborted ? null : selected?.[0] ?? null;
        } finally { signal?.removeEventListener('abort', abort); }
    }

    /** Resolve only explicit user searches. Previewing a link never creates or modifies notes. */
    async searchCatalogInput(kind: MediaKind, query: string, selectedProvider?: string,
        options: { includeAdult?: boolean; includeDlc?: boolean; page?: number; pageSize?: number; tmdbLanguage?: string } = {}): Promise<SearchResult[]> {
        const ref = parseCatalogReference(query, { kind, provider: selectedProvider });
        const provider = ref?.provider ?? selectedProvider;
        const config = this.getSettings().integrations;
        if (!this.isProviderId(provider) || !config?.enabled) throw new CatalogReferenceError('unavailable');
        const key = provider === 'jikan' ? 'kitsu' : provider;
        const credentials = config.providers[key];
        if (!isProviderEnabled(config, key, kind) || !this.hasRequiredCredentials(provider, credentials)) throw new CatalogReferenceError('unavailable');
        if (!ref) return this.search(provider, query.replace(/^title:\s*/i, ''), credentials.apiKey || '', credentials.clientSecret || '', options, this.toDetailsKind(kind));
        let id: string | null = ref.id;
        if (ref.slug) {
            if (provider === 'rawg') id = await resolveRawgSlug(this.jsonFetcher, ref.id, credentials.apiKey || '');
            else if (provider === 'igdb') id = await resolveIgdbSlug(this.jsonFetcher, ref.id, credentials.apiKey || '', credentials.clientSecret || '');
            else if (provider === 'hardcover') id = await resolveHardcoverSlug(this.jsonFetcher, ref.id, credentials.apiKey || '');
            else if (provider === 'kitsu') id = await resolveKitsuSlug(this.jsonFetcher, ref.id);
        }
        this.assertActive();
        if (!id) throw new CatalogReferenceError('notFound');
        let result: SearchResult;
        if (provider === 'omdb') {
            const found = await lookupOmdbRecord(this.jsonFetcher, id, credentials.apiKey || '');
            if (!found) throw new CatalogReferenceError('notFound');
            if (ref.videoKind && found.workTypeMedia !== ref.videoKind || kind === 'movies' && found.workTypeMedia !== 'movie' || kind === 'series' && found.workTypeMedia !== 'series') throw new CatalogReferenceError('wrongMedia');
            result = found;
        } else {
            const details = await this.fetchDetails(provider, id, credentials.apiKey || '', credentials.clientSecret || '', this.toDetailsKind(kind), {
                includeParts: false, includeEpisodeDurations: false, sourceVideoKind: ref.videoKind, tmdbLanguage: options.tmdbLanguage,
            });
            if (!details?.name.trim()) throw new CatalogReferenceError('notFound');
            result = { id, provider, title: details.name, year: details.year, released: details.released,
                image: details.kind === 'anime' ? details.image : details.poster,
                workType: 'workType' in details ? details.workType : undefined,
                workTypeMedia: ref.videoKind ?? (kind === 'games' ? 'game' : kind === 'manga' ? 'manga' : kind === 'movies' ? 'movie' : kind === 'series' ? 'series' : undefined),
                format: details.kind === 'anime' ? details.format : undefined,
                countryOfOrigin: details.kind === 'anime' ? details.countryOfOrigin : undefined,
                isAdult: 'isAdult' in details ? details.isAdult : undefined,
                publicationStatus: details.kind === 'manga' ? details.publicationStatus : undefined,
                ...(provider === 'tmdb' ? { tmdbLanguage: normalizeTmdbLanguage(options.tmdbLanguage ?? this.getTmdbLanguage(this.toDetailsKind(kind))) } : {}),
            };
        }
        this.assertActive();
        if ((kind === 'anime' || kind === 'manga') && result.isAdult && !options.includeAdult) throw new CatalogReferenceError('adult');
        return Object.assign([{ ...result, directMatch: true }], { hasNext: false });
    }

    async getMediaEnrichment(
        kind: MediaKind,
        source: MediaSourceSelection
    ): Promise<MediaEnrichmentPatch | null> {
        const integrations = this.getSettings().integrations;
        if (!integrations?.enabled) return null;
        const key = source.provider === 'jikan' ? 'kitsu' : source.provider;
        const providerSettings = integrations.providers[key];
        if (!isProviderEnabled(integrations, key, kind)) {
            new Notice(t('noticeProviderDisabled'));
            return null;
        }
        if (!this.hasRequiredCredentials(source.provider, providerSettings)) {
            new Notice(t('noticeMissingApiKey'));
            return null;
        }

        const sourceKind = kind === 'anime' && isAnimeVideoProvider(source.provider) ? this.getSourceVideoKind(source) : undefined;
        const details = await this.fetchDetails(
            source.provider,
            source.id,
            providerSettings.apiKey || '',
            providerSettings.clientSecret || '',
            this.toDetailsKind(kind),
            { includeParts: true, ...(source.tmdbLanguage ? { tmdbLanguage: source.tmdbLanguage } : {}), ...(sourceKind ? { sourceVideoKind: sourceKind } : {}) }
        );
        if (!details) return null;
        if (kind === 'anime' && this.isAnimeDetails(details) && !details.countryOfOrigin) details.countryOfOrigin = source.countryOfOrigin;

        let values: Record<string, unknown>;
        if (kind === 'games' && this.isGameDetails(details)) {
            const built = await this.buildGameValues(
                details,
                shouldLoadHowLongToBeat(integrations.media.games),
                source.image ?? '',
                { provider: source.provider, id: source.id }
            );
            values = {
                ...sourceIdentity(source),
                name: built.name,
                poster: built.Poster,
                poster_b: built.PosterHorizontal,
                plot: built.Plot,
                ...(built.workType ? { work_type: built.workType } : {}),
                genres: built.genres,
                platforms: built.platforms,
                developers: built.developers,
                publishers: built.publishers,
                metacritic: built.metacritic,
                released: built.released,
                year: built.Year,
                url: built.url,
                main: built.main,
                main_plus_sides: built.main_plus_sides,
                perfectionist: built.perfectionist,
            };
            const dlc = await this.fetchDlcForSource(source);
            if (dlc?.length) values.dlc = dlc;
        } else if (kind === 'anime' && this.isAnimeDetails(details)) {
            const built = this.buildAnimeValues(details, {
                provider: source.provider,
                id: source.id,
                parts: details.parts ?? [],
            });
            values = {
                ...sourceIdentity(source),
                ...(sourceKind ? { integration_source_kind: sourceKind } : {}),
                name: built.name,
                poster: built.image,
                poster_b: built.ImageHorizontal,
                plot: built.Plot,
                genres: built.genres,
                country_of_origin: built.countryOfOrigin,
                Sex18: built.isAdult,
                year: built.Year,
                released: built.released,
                studios: built.studios,
                format: built.format,
                url: built.url,
                episode_total: built.episodeTotal,
                anime_parts: toAnimePartsFrontmatter(details.parts),
            };
        } else if ((kind === 'movies' || kind === 'series') && this.isVideoDetails(details)) {
            const built = this.buildVideoValues(details, { provider: source.provider, id: source.id, kind });
            const partsKey = kind === 'series' ? 'series_parts' : 'movie_parts';
            values = {
                ...sourceIdentity(source),
                name: built.name,
                poster: built.Poster,
                poster_b: built.PosterHorizontal,
                plot: built.Plot,
                genres: built.genres,
                year: built.Year,
                released: built.released,
                runtime: built.runtime,
                director: built.director,
                actors: built.actors,
                seasons: built.seasons,
                episode_total: built.episodeTotal,
                networks: built.networks,
                studios: built.studios,
                rating: built.rating,
                countries: built.countries,
                url: built.url,
                [partsKey]: toVideoPartsFrontmatter(details.parts),
            };
        } else if (kind === 'books' && this.isBookDetails(details)) {
            const built = this.buildBookValues(details, {
                provider: source.provider,
                id: source.id,
                title: source.title,
                year: source.year,
                poster: source.image,
            });
            values = {
                ...sourceIdentity(source),
                name: built.name,
                poster: built.Poster,
                poster_b: built.PosterHorizontal,
                plot: built.Plot,
                authors: built.authors,
                publisher: built.publisher,
                genres: built.genres,
                year: built.Year,
                released: built.released,
                page_total: built.pageTotal,
                url: built.url,
            };
        } else if (kind === 'manga' && this.isMangaDetails(details)) {
            const built = this.buildMangaValues(details, { provider: source.provider, id: source.id });
            values = {
                ...sourceIdentity(source),
                name: built.name,
                poster: built.Poster,
                poster_b: built.PosterHorizontal,
                plot: built.Plot,
                authors: built.authors,
                artists: built.artists,
                work_type: built.workType,
                genres: built.genres,
                year: built.Year,
                released: built.released,
                chapter_total: built.chapterTotal,
                volume_total: built.volumeTotal,
                Sex18: built.isAdult,
                url: built.url,
                manga_parts: toMangaPartsFrontmatter(details.parts),
            };
        } else {
            return null;
        }

        const sourceCountries = normalizeCountryMetadata(details.countries ?? ('countryOfOrigin' in details ? details.countryOfOrigin : []));
        if (sourceCountries.length) values.countries = sourceCountries;
        const detailsRecord = details as unknown as Record<string, unknown>;
        const communityRating = normalizeCommunityRating(
            source.provider,
            detailsRecord.communityRating ?? detailsRecord.imdbRating ?? detailsRecord.rating
        );
        if (communityRating !== null) {
            values.communityRating = communityRating;
            values.communityRatingProvider = this.getCommunityProviderLabel(source.provider);
            const communityVotes = this.normalizeCommunityVotes(detailsRecord.communityVotes);
            if (communityVotes !== null) values.communityVotes = communityVotes;
        }

        values = await this.localizeEnrichmentImages(kind, String(values.name ?? source.title), values);
        return {
            kind,
            source,
            values,
            filledFields: Object.keys(values),
            skippedFields: [],
        };
    }

    async testProvider(providerId: ProviderId, kind?: 'anime' | 'manga'): Promise<{ ok: boolean; reason?: 'missing_key' | 'disabled' | 'no_results' }> {
        const settings = this.getSettings();
        const integrations = settings.integrations;
        if (!integrations || !integrations.enabled) {
            return { ok: false, reason: 'disabled' };
        }

        const key = providerId === 'jikan' ? 'kitsu' : providerId;
        const providerSettings = integrations.providers[key];
        if (!isProviderEnabled(integrations, key, kind ?? 'anime')) {
            return { ok: false, reason: 'disabled' };
        }

        if (!this.hasRequiredCredentials(providerId, providerSettings)) {
            return { ok: false, reason: 'missing_key' };
        }

        const test = providerTestCases[providerId] ?? { query: 'naruto', kind: 'anime' as const };
        const results = await this.search(
            providerId,
            test.query,
            providerSettings.apiKey || '',
            providerSettings.clientSecret || '',
            {},
            kind ?? test.kind
        );
        if (!results.length) {
            return { ok: false, reason: 'no_results' };
        }
        return { ok: true };
    }

    private async addMedia(kind: MediaKind): Promise<void> {
        await this.addProviderMedia(kind, true);
    }

    async addVideoSelection(kind: 'movies' | 'series', selection: SearchResult): Promise<TFile | null> {
        const files = await this.addProviderMedia(kind, false, [selection]);
        return files[0] ?? null;
    }

    async addAnimeSelection(selection: SearchResult): Promise<TFile | null> {
        const files = await this.addProviderMedia('anime', false, [selection]);
        return files[0] ?? null;
    }

    /** Resolve an account's external IDs with the explicitly selected metadata catalog. */
    async resolveVideoImportSource(kind: 'movies' | 'series', provider: 'tmdb' | 'tvmaze' | 'omdb', identity: { title: string; year?: number; ids: Record<string, string> }, signal: AbortSignal): Promise<SearchResult> {
        const check = () => { if (signal.aborted) throw new DOMException('Cancelled', 'AbortError'); };
        check();
        const integrations = this.getSettings().integrations;
        if (!integrations?.enabled) throw new Error(`TRAKT_METADATA_UNAVAILABLE:${provider}`);
        const settings = integrations.providers[provider];
        if (!settings?.enabled || !this.hasRequiredCredentials(provider, settings)) throw new Error(`TRAKT_METADATA_UNAVAILABLE:${provider}`);
        if (provider === 'tvmaze' && kind !== 'series') throw new Error('TRAKT_METADATA_UNAVAILABLE:tvmaze');
        let id = provider === 'tmdb' ? identity.ids.tmdb : provider === 'omdb' ? identity.ids.imdb : identity.ids.tvmaze;
        if (!id && provider === 'tvmaze') {
            for (const key of ['imdb', 'thetvdb'] as const) {
                const value = identity.ids[key === 'thetvdb' ? 'tvdb' : key]; if (!value) continue;
                try { const result = await this.jsonFetcher(`https://api.tvmaze.com/lookup/shows?${key}=${encodeURIComponent(value)}`) as { id?: number }; check(); if (result?.id) { id = String(result.id); break; } }
                catch (error) { check(); if (!error || typeof error !== 'object' || !('status' in error) || error.status !== 404) throw error; }
            }
        }
        if (!id) {
            const results = await (provider === 'tmdb' ? searchTmdb(this.jsonFetcher, identity.title, settings.apiKey || '', { kind, language: this.getTmdbLanguage(kind) })
                : provider === 'tvmaze' ? searchTvmaze(this.jsonFetcher, identity.title, '', { kind }) : searchOmdb(this.jsonFetcher, identity.title, settings.apiKey || '', { kind }));
            check();
            const normalize = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
            const matches = results.filter(result => normalize(result.title) === normalize(identity.title) && (!identity.year || Number(result.year) === identity.year));
            if (matches.length !== 1) throw new Error('TRAKT_METADATA_MATCH');
            return { ...matches[0], ...(provider === 'tmdb' ? { tmdbLanguage: this.getTmdbLanguage(kind) } : {}) };
        }
        return { provider, id, title: identity.title, year: identity.year ? String(identity.year) : undefined, ...(provider === 'tmdb' ? { tmdbLanguage: this.getTmdbLanguage(kind) } : {}) };
    }

    /** Use the normal add flow's details, template, source identity and image handling. */
    async prepareVideoImport(kind: 'movies' | 'series', source: SearchResult, signal: AbortSignal): Promise<PreparedVideoImport> {
        const check = () => { if (signal.aborted) throw new DOMException('Cancelled', 'AbortError'); };
        check();
        const settings = this.getSettings(), config = settings.integrations;
        if (!config?.enabled) throw new Error(`TRAKT_METADATA_UNAVAILABLE:${source.provider}`);
        const provider = config.providers[source.provider === 'jikan' ? 'kitsu' : source.provider];
        if (!provider?.enabled || !this.hasRequiredCredentials(source.provider, provider)) throw new Error(`TRAKT_METADATA_UNAVAILABLE:${source.provider}`);
        const details = await this.fetchDetails(source.provider, source.id, provider.apiKey || '', provider.clientSecret || '', kind, { includeParts: true, tmdbLanguage: source.tmdbLanguage, includeEpisodeDurations: false });
        check(); if (!details || !this.isVideoDetails(details)) throw new Error('TRAKT_METADATA_MATCH');
        const media = config.media[kind], template = this.getTemplate(kind, media.templateEnabled, media.templateMode, media.templateFields, media.template, false, media.fieldAliases, media.wikilinkFields) || buildSimpleTemplate(kind, getDefaultTemplateFields(kind));
        const built = this.buildVideoValues(details, { kind, provider: source.provider, id: source.id });
        const values = await localizeTemplateImages(this.app, kind, details.name, built, config.imageStorage, template, signal); check();
        let content = renderTemplate(template, { type: kind === 'movies' ? 'movie' : 'series', ...values });
        if (this.needsFrontmatterFallback(kind, content)) content = `${renderTemplate(buildSimpleTemplate(kind, getDefaultTemplateFields(kind), {}, []), values)}\n\n${content.trim()}`;
        content = ensureIntegrationSourceFrontmatter(content, source.provider, source.id, parseTemplateFieldAliases(MEDIA_TYPE_BY_KIND[kind], template));
        content = ensureClassificationFrontmatter(content, kind, values, template);
        content = completeImportedMetadata(content, kind, values, template);
        content = orderTemplateContent(content, template, { compact: config.compactTemplates });
        return { source, details, title: details.name, content, metadata: {
            title: details.name, poster: values.Poster, poster_b: values.PosterHorizontal, plot: built.Plot, genres: built.genres, year: built.Year,
            released: built.released, runtime: built.runtime, director: built.director, actors: built.actors, seasons: built.seasons, networks: built.networks,
            studios: built.studios, rating: built.rating, countries: built.countries, url: built.url,
            integration_provider: source.provider, integration_id: source.id,
            [kind === 'series' ? 'series_parts' : 'movie_parts']: toVideoPartsFrontmatter(details.parts),
        } };
    }

    async findPlayStationMetadata(title: string, provider: 'igdb' | 'rawg', signal: AbortSignal): Promise<SearchResult[]> {
        if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
        const config = this.getSettings().integrations, credentials = config?.providers[provider];
        if (!config?.enabled || !credentials?.enabled || !this.hasRequiredCredentials(provider, credentials)) throw new Error('PSN_METADATA_CONFIG');
        for (const query of playStationSearchQueries(title)) {
            if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
            const results = await this.search(provider, query, credentials.apiKey || '', credentials.clientSecret || '', { page: 1, pageSize: 10, includeVersions: true });
            if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
            if (results.length) return results;
        }
        return [];
    }

    async preparePlayStationImport(entry: { name: string; image: string; platform: string }, source: SearchResult | undefined, signal: AbortSignal) {
        const check = () => { if (signal.aborted) throw new DOMException('Cancelled', 'AbortError'); };
        check();
        const config = this.getSettings().integrations, media = config?.media.games;
        let details: GameDetails = { kind: 'game', name: entry.name, description: '', poster: entry.image, genres: [], platforms: [entry.platform],
            developers: [], publishers: [], rating: '', metacritic: '', released: '', year: '', url: '' };
        if (source) {
            const credentials = config?.providers[source.provider];
            if (!config?.enabled || !credentials?.enabled || !this.hasRequiredCredentials(source.provider, credentials)) throw new Error('PSN_METADATA_CONFIG');
            const fetched = await this.fetchDetails(source.provider, source.id, credentials.apiKey || '', credentials.clientSecret || '');
            check(); if (!fetched || !this.isGameDetails(fetched)) throw new Error('PSN_METADATA_MATCH');
            details = fetched;
        }
        const template = media
            ? this.getTemplate('games', media.templateEnabled, media.templateMode, media.templateFields, media.template, false, media.fieldAliases, media.wikilinkFields)
                || buildSimpleTemplate('games', getDefaultTemplateFields('games'))
            : buildSimpleTemplate('games', getDefaultTemplateFields('games'));
        const built = await this.buildGameValues(details, false, entry.image, source ? { provider: source.provider, id: source.id } : undefined);
        const values = config?.imageStorage ? await localizeTemplateImages(this.app, 'games', details.name, built, config.imageStorage, template, signal) : built;
        check();
        let content = renderTemplate(template, { type: 'game', ...values });
        if (this.needsFrontmatterFallback('games', content)) content = renderTemplate(buildSimpleTemplate('games', getDefaultTemplateFields('games'), {}, []), values) + '\n\n' + content;
        if (source) content = ensureIntegrationSourceFrontmatter(content, source.provider, source.id, parseTemplateFieldAliases('game', template));
        content = ensureClassificationFrontmatter(content, 'games', values, template);
        content = completeImportedMetadata(content, 'games', values, template);
        content = orderTemplateContent(content, template, { compact: config?.compactTemplates });
        return { content, title: details.name, metadata: {
            name: details.name, poster: values.Poster, poster_b: values.PosterHorizontal, plot: built.Plot, genres: built.genres,
            platforms: built.platforms, developers: built.developers, publishers: built.publishers, year: built.Year,
            released: built.released, url: built.url, work_type: built.workType,
            ...(source ? { integration_provider: source.provider, integration_id: source.id } : {}),
        } };
    }

    async createProviderSelection(kind: MediaKind, selection: SearchResult, options: NoteCreationOptions = {}): Promise<TFile | null> {
        return (await this.addProviderMedia(kind, false, [selection], options))[0] ?? null;
    }

    createManualSelection(draft: ManualCreateDraft, options: NoteCreationOptions = {}): Promise<TFile | null> {
        return this.addManualMedia(draft.kind, draft, options);
    }

    private checkCreation(options: NoteCreationOptions): void {
        this.assertActive(); options.check?.();
        if (options.signal?.aborted) { const error = new Error('Note creation cancelled'); error.name = 'AbortError'; throw error; }
    }

    private async addProviderMedia(kind: MediaKind, allowManualFallback = false, selectedResults?: SearchResult[], options: NoteCreationOptions = {}): Promise<TFile[]> {
        const created: TFile[] = [];
        try {
            this.checkCreation(options);
            const settings = this.getSettings();
            const integrations = settings.integrations;
            const mediaSettings = integrations?.media[kind];
            const providerOptions = integrations?.enabled ? this.getProviderOptions(kind) : [];
            const configuredProvider = mediaSettings?.provider;
            const saved = providerOptions.find(provider => provider.id === configuredProvider && !provider.disabled)?.id;
            const fallback = providerOptions.find(provider => !provider.disabled)?.id;
            const initialProvider = this.isProviderId(saved) ? saved : this.isProviderId(fallback) ? fallback : undefined;

            const selected = selectedResults ?? await this.chooseResults(kind, initialProvider, providerOptions, allowManualFallback);
            if (!selected.length || !integrations || !mediaSettings) return created;
            if (selectedResults && !integrations.enabled) return created;

            const template = this.getTemplate(
                kind,
                mediaSettings.templateEnabled,
                mediaSettings.templateMode,
                mediaSettings.templateFields,
                mediaSettings.template,
                mediaSettings.howLongToBeatEnabled ?? false,
                mediaSettings.fieldAliases,
                mediaSettings.wikilinkFields
            );
            const shouldLoadHltb = kind === 'games' && shouldLoadHowLongToBeat(mediaSettings);
            const selectedTitleCounts = this.countSelectedTitles(selected);
            const reservedPaths = new Set<string>();
            const cooldownMs = this.getRequestCooldownMs(integrations.requestCooldownSeconds);
            let hasAttemptedItemRequest = false;

            itemLoop: for (const item of selected) {
                new Notice(t('notifyLoading'), 1500);
                const itemProviderId = item.provider;
                const key = itemProviderId === 'jikan' ? 'kitsu' : itemProviderId;
                const providerSettings = integrations.providers[key];
                if (!isProviderEnabled(integrations, key, kind)) {
                    new Notice(t('noticeProviderDisabled'));
                    continue;
                }
                if (!this.hasRequiredCredentials(itemProviderId, providerSettings)) {
                    new Notice(t('noticeMissingApiKey'));
                    continue;
                }

                while (true) {
                    if (hasAttemptedItemRequest && cooldownMs > 0) {
                        await this.wait(cooldownMs);
                    }
                    hasAttemptedItemRequest = true;

                    try {
                        let details = await this.fetchDetails(
                            itemProviderId,
                            item.id,
                            providerSettings.apiKey || '',
                            providerSettings.clientSecret || '',
                            this.toDetailsKind(kind),
                            { includeParts: kind !== 'anime', tmdbLanguage: item.tmdbLanguage, sourceVideoKind: this.getSourceVideoKind(item) }
                        );
                        // Steam search can still list apps whose store details are
                        // unavailable. Keep the selected title and source identity.
                        if (!details && kind === 'games' && itemProviderId === 'steam') {
                            details = {
                                kind: 'game',
                                name: item.title,
                                description: '',
                                poster: item.image || '',
                                genres: [],
                                platforms: [],
                                developers: [],
                                publishers: [],
                                rating: '',
                                metacritic: '',
                                released: '',
                                year: item.year || '',
                                url: `https://store.steampowered.com/app/${encodeURIComponent(item.id)}/`,
                            };
                            new Notice(t('noticeSteamDetailsUnavailable'), 6000);
                        }
                        if (!details) {
                            new Notice(t('noticeNoResults'));
                            continue itemLoop;
                        }

                        let values: Record<string, unknown>;
                        if (kind === 'games') {
                            if (!this.isGameDetails(details)) {
                                new Notice(t('noticeNoResults'));
                                continue itemLoop;
                            }
                            values = await this.buildGameValues(details, shouldLoadHltb, item.image, {
                                provider: itemProviderId,
                                id: item.id,
                            });
                        } else if (kind === 'anime') {
                            if (!this.isAnimeDetails(details)) {
                                new Notice(t('noticeNoResults'));
                                continue itemLoop;
                            }
                            if (!details.countryOfOrigin) details.countryOfOrigin = item.countryOfOrigin;
                            const videoSource = isAnimeVideoProvider(itemProviderId);
                            values = this.buildAnimeValues(details, {
                                provider: itemProviderId,
                                id: item.id,
                                parts: videoSource ? details.parts : [],
                            });
                            if (videoSource) {
                                values.integrationSourceKind = this.getSourceVideoKind(item);
                                values.animeParts = toAnimePartsFrontmatter(details.parts);
                            }
                        } else if (kind === 'books') {
                            if (!this.isBookDetails(details)) {
                                new Notice(t('noticeNoResults'));
                                continue itemLoop;
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
                                continue itemLoop;
                            }
                            values = this.buildMangaValues(details, {
                                provider: itemProviderId,
                                id: item.id,
                            });
                        } else {
                            if (!this.isVideoDetails(details)) {
                                new Notice(t('noticeNoResults'));
                                continue itemLoop;
                            }
                            values = this.buildVideoValues(details, {
                                kind,
                                provider: itemProviderId,
                                id: item.id,
                            });
                        }

                        this.checkCreation(options);
                        const title = this.firstStringValue(values, 'name', item.title, 'Untitled');
                        const renderedValues = template
                            ? await localizeTemplateImages(this.app, kind, title, values, integrations.imageStorage, template, options.signal ?? this.lifetime.signal)
                            : values;
                        let content: string = template
                            ? renderTemplate(template, { type: MEDIA_TYPE_BY_KIND[kind], ...renderedValues })
                            : `# ${title}\n`;
                        if (this.needsFrontmatterFallback(kind, content) || (values.integrationSourceKind && !this.hasFrontmatter(content))) {
                            const fallbackTemplate = buildSimpleTemplate(kind, getDefaultTemplateFields(kind), {}, []);
                            content = `${renderTemplate(fallbackTemplate, renderedValues)}\n\n${content.trim()}`;
                        }
                        content = ensureIntegrationSourceFrontmatter(content, itemProviderId, item.id, parseTemplateFieldAliases(MEDIA_TYPE_BY_KIND[kind], template ?? ''));
                        content = ensureClassificationFrontmatter(content, kind, values, template ?? '');
                        content = completeImportedMetadata(content, kind, values, template ?? '');
                        if (item.discovery) content = withPersonalFields(content, { discovery_context: discoveryFrontmatter(item.discovery) });
                        if (options.decorate) content = options.decorate(content, template ?? '');
                        content = orderTemplateContent(content, template ?? buildSimpleTemplate(kind, getDefaultTemplateFields(kind)), { compact: integrations?.compactTemplates });
                        const folderPath = this.getFolderPath(settings, kind);
                        let pathChoice = this.resolveCreatePath(folderPath, title, {
                            preferYear: Boolean(selectedResults) || (selectedTitleCounts.get(this.titleKey(item.title)) ?? 0) > 1,
                            year: this.firstStringValue(values, 'year', item.year ?? ''),
                            provider: itemProviderId,
                            id: item.id,
                            reservedPaths,
                            ignoreExistingBase: options.separateExisting,
                        });

                        const exists = pathChoice.existing;
                        if (exists instanceof TFile && !options.separateExisting) {
                            const choice = await this.confirmExistingFile(exists.path, {
                                title,
                                meta: this.buildExistingFileMeta(kind, itemProviderId, this.firstStringValue(values, 'year', item.year ?? '')),
                                image: this.firstStringValue(renderedValues, 'poster', item.image ?? ''),
                            });
                            if (choice === 'skip') {
                                new Notice(t('noticeSkipped'));
                                continue itemLoop;
                            }
                            if (choice === 'update') {
                                this.checkCreation(options);
                                await this.app.vault.modify(exists, content);
                                created.push(exists);
                                new Notice(t('noticeCreated'));
                                continue itemLoop;
                            }
                            pathChoice = this.resolveCreatePath(folderPath, title, {
                                preferYear: true,
                                year: this.firstStringValue(values, 'year', item.year ?? ''),
                                provider: itemProviderId,
                                id: item.id,
                                reservedPaths,
                                ignoreExistingBase: true,
                            });
                        }

                        this.checkCreation(options);
                        await ensureFolder(this.app, folderPath);
                        this.checkCreation(options);
                        created.push(await this.app.vault.create(pathChoice.fullPath, content));
                        reservedPaths.add(pathChoice.fullPath);
                        new Notice(t('noticeCreated'));
                        continue itemLoop;
                    } catch (error: unknown) {
                        if (options.signal) throw error;
                        if (!isProviderBlockedError(error)) throw error;
                        await this.confirmRateLimit(error);
                        break itemLoop;
                    }
                }
            }
        } catch (error: unknown) {
            if (options.signal) throw error;
            console.error('Integration add error:', error);
            const message = error instanceof Error ? `: ${error.message}` : '';
            new Notice(`${t('noticeIntegrationsError')}${message}`);
        }
        return created;
    }

    private async addManualMedia(defaultKind: MediaKind, initialDraft?: ManualCreateDraft, options: NoteCreationOptions = {}): Promise<TFile | null> {
        try {
            const settings = this.getSettings();
            const draft = initialDraft ?? await new ManualCreateModal(this.app, defaultKind, settings.ratingScale).openAndGetValue();
            if (!draft) return null;

            const integrations = settings.integrations;
            this.checkCreation(options);
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
                    mediaSettings.howLongToBeatEnabled ?? false,
                    mediaSettings.fieldAliases,
                    mediaSettings.wikilinkFields
                )
                : buildSimpleTemplate(kind, getDefaultTemplateFields(kind));
            const values = this.buildManualValues(preparedDraft);
            const title = this.firstStringValue(values, 'name', preparedDraft.title, 'Untitled');
            const manualImageTokens = kind === 'anime' ? '{{VALUE:image}} {{VALUE:ImageHorizontal}}' : '{{VALUE:Poster}} {{VALUE:PosterHorizontal}}';
            const renderedValues = integrations
                ? await localizeTemplateImages(this.app, kind, title, values, integrations.imageStorage, `${template ?? ''}\n${manualImageTokens}`, options.signal ?? this.lifetime.signal)
                : values;
            let content: string = template
                ? renderTemplate(template, { type: MEDIA_TYPE_BY_KIND[kind], ...renderedValues })
                : `# ${title}\n`;
            if (!this.hasFrontmatter(content)) {
                const fallbackTemplate = buildSimpleTemplate(kind, getDefaultTemplateFields(kind), {}, []);
                content = `${renderTemplate(fallbackTemplate, renderedValues)}\n\n${content.trim()}`;
            }

            content = ensureClassificationFrontmatter(content, kind, values, template ?? '');
            content = completeManualContent(content, {
                ...preparedDraft,
                poster: String(renderedValues[kind === 'anime' ? 'image' : 'Poster'] ?? preparedDraft.poster),
                posterHorizontal: String(renderedValues[kind === 'anime' ? 'ImageHorizontal' : 'PosterHorizontal'] ?? preparedDraft.posterHorizontal),
            }, template ?? '');
            if (options.decorate) content = options.decorate(content, template ?? '');
            content = orderTemplateContent(content, template ?? buildSimpleTemplate(kind, getDefaultTemplateFields(kind)), { compact: integrations?.compactTemplates });
            const folderPath = this.getFolderPath(settings, kind);
            let pathChoice = this.resolveCreatePath(folderPath, title, {
                year: this.firstStringValue(values, 'year', preparedDraft.year),
                ignoreExistingBase: options.separateExisting,
            });
            const existing = pathChoice.existing;
            let file: TFile | null = null;
            if (existing instanceof TFile && !options.separateExisting) {
                const choice = await this.confirmExistingFile(existing.path);
                if (choice === 'skip') {
                    new Notice(t('noticeSkipped'));
                    return null;
                }
                if (choice === 'update') {
                    this.checkCreation(options);
                    await this.app.vault.modify(existing, content);
                    file = existing;
                } else {
                    pathChoice = this.resolveCreatePath(folderPath, title, {
                        preferYear: true,
                        year: this.firstStringValue(values, 'year', preparedDraft.year),
                        ignoreExistingBase: true,
                    });
                    this.checkCreation(options);
                    await ensureFolder(this.app, folderPath);
                    this.checkCreation(options);
                    file = await this.app.vault.create(pathChoice.fullPath, content);
                }
            } else {
                this.checkCreation(options);
                await ensureFolder(this.app, folderPath);
                this.checkCreation(options);
                file = await this.app.vault.create(pathChoice.fullPath, content);
            }

            new Notice(t('noticeCreated'));
            if (file && options.openAfterCreate !== false) {
                await this.app.workspace.getLeaf(true).openFile(file);
            }
            return file;
        } catch (error: unknown) {
            if (options.signal) throw error;
            console.error('Manual add error:', error);
            const message = error instanceof Error ? `: ${error.message}` : '';
            new Notice(`${t('noticeIntegrationsError')}${message}`);
        }
        return null;
    }

    private async confirmExistingFile(filePath: string, preview?: ExistingFilePreview): Promise<ExistingFileChoice> {
        const modal = new ExistingFileChoiceModal(
            this.app,
            t('promptFileExistsTitle'),
            t('promptFileExistsBody'),
            filePath,
            preview
        );
        return modal.openAndGetValue();
    }

    private async confirmRateLimit(error?: unknown): Promise<void> {
        const detail = error instanceof Error && error.message
            ? `\n\n${error.message}`
            : '';
        const modal = new ChoiceModal(
            this.app,
            t('promptRateLimitTitle'),
            `${t('promptRateLimitBody')}${detail}`,
            t('commonOk'),
            t('commonCancel')
        );
        await modal.openAndGetValue();
    }

    private getRequestCooldownMs(value: unknown): number {
        const seconds = typeof value === 'number' && Number.isFinite(value) ? value : 1;
        return Math.round(Math.min(30, Math.max(0, seconds)) * 1000);
    }

    private wait(milliseconds: number): Promise<void> {
        return new Promise(resolve => window.setTimeout(resolve, milliseconds));
    }

    private buildExistingFileMeta(kind: MediaKind, provider: string, year: string): string[] {
        return [
            year,
            this.getMediaKindLabel(kind),
            this.formatProviderName(provider),
        ].map(part => part.trim()).filter(Boolean);
    }

    private getMediaKindLabel(kind: MediaKind): string {
        const labels: Record<MediaKind, string> = {
            games: t('settingsPreviewGame'),
            anime: t('settingsPreviewAnime'),
            movies: t('settingsPreviewMovie'),
            series: t('settingsPreviewSeries'),
            books: t('settingsPreviewBook'),
            manga: t('settingsPreviewManga'),
        };
        return labels[kind] ?? kind;
    }

    private getSearchTitle(kind: MediaKind): string {
        if (kind === 'games') return t('promptSearchGame');
        if (kind === 'anime') return t('promptSearchAnime');
        if (kind === 'movies') return t('promptSearchMovie');
        if (kind === 'series') return t('promptSearchSeries');
        if (kind === 'books') return t('promptSearchBook');
        return t('promptSearchManga');
    }

    private getKindIcon(kind: MediaKind): string {
        if (kind === 'games') return 'gamepad-2';
        if (kind === 'anime') return 'clapperboard';
        if (kind === 'movies') return 'film';
        if (kind === 'series') return 'tv';
        if (kind === 'books') return 'book-open';
        return 'book-open-text';
    }

    private async fetchDlcForSource(source: MediaSourceSelection): Promise<GameDlc[] | null> {
        if (source.provider === 'steam') {
            return getSteamDlcForGame(this.jsonFetcher, source.id);
        }
        if (source.provider === 'igdb') {
            const settings = this.getSettings().integrations?.providers.igdb;
            if (!settings?.enabled || !this.hasRequiredCredentials('igdb', settings)) return null;
            return getIgdbDlcForGame(
                this.jsonFetcher,
                source.id,
                settings.apiKey || '',
                settings.clientSecret || ''
            );
        }
        return null;
    }

    private async localizeEnrichmentImages(
        kind: MediaKind,
        title: string,
        values: Record<string, unknown>
    ): Promise<Record<string, unknown>> {
        const imageStorage = this.getSettings().integrations?.imageStorage;
        if (kind === 'anime') {
            const localized = await localizeTemplateImages(
                this.app,
                kind,
                title,
                { image: values.poster, ImageHorizontal: values.poster_b },
                imageStorage,
                '{{VALUE:image}}\n{{VALUE:ImageHorizontal}}',
                this.lifetime.signal
            );
            return { ...values, poster: localized.image, poster_b: localized.ImageHorizontal };
        }
        const localized = await localizeTemplateImages(
            this.app,
            kind,
            title,
            { Poster: values.poster, PosterHorizontal: values.poster_b },
            imageStorage,
            '{{VALUE:Poster}}\n{{VALUE:PosterHorizontal}}',
            this.lifetime.signal
        );
        return { ...values, poster: localized.Poster, poster_b: localized.PosterHorizontal };
    }

    async localizeExistingImages(signal?: AbortSignal) {
        const identity = (): string => {
            const settings = this.getSettings();
            return JSON.stringify([settings.integrations?.imageStorage,
                ...[settings.games, settings.anime, settings.movies, settings.series, settings.books, settings.manga, settings.music].map(config => config.folderPath)]);
        };
        const operation = new BackgroundOperation(identity, [this.lifetime.signal, ...(signal ? [signal] : [])]);
        try { return await localizeExistingNoteImages(this.app, this.getSettings(), operation); }
        finally { operation.close(); }
    }

    private formatProviderName(provider: string): string {
        const labels: Record<string, string> = {
            steam: 'Steam',
            rawg: 'RAWG',
            igdb: 'IGDB',
            vndb: 'VNDB',
            anilist: 'AniList',
            jikan: 'MyAnimeList',
            kitsu: 'Kitsu',
            shikimori: 'Shikimori',
            tmdb: 'TMDB',
            omdb: 'OMDb',
            tvmaze: 'TVmaze',
            hardcover: 'Hardcover',
            googlebooks: 'Google Books',
            openlibrary: 'Open Library',
            mangaupdates: 'MangaUpdates',
            mangadex: 'MangaDex',
            comicvine: 'Comic Vine',
        };
        return labels[provider.toLowerCase()] ?? provider;
    }

    private countSelectedTitles(items: SearchResult[]): Map<string, number> {
        const counts = new Map<string, number>();
        for (const item of items) {
            const key = this.titleKey(item.title);
            counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        return counts;
    }

    private titleKey(value: string): string {
        return value.trim().toLowerCase();
    }

    private resolveCreatePath(
        folderPath: string,
        title: string,
        options: {
            preferYear?: boolean;
            year?: string;
            provider?: string;
            id?: string;
            reservedPaths?: Set<string>;
            ignoreExistingBase?: boolean;
        } = {}
    ): { fullPath: string; existing: TFile | null } {
        const candidates = this.getFileNameCandidates(title, options);
        const fallback = candidates[0] ?? 'Untitled';
        let fallbackExisting: TFile | null = null;
        let fallbackPath = this.joinMediaPath(folderPath, fallback);
        const basePath = this.joinMediaPath(folderPath, sanitizeFileName(title) || 'Untitled');
        const baseExisting = this.app.vault.getAbstractFileByPath(basePath);
        if (!options.ignoreExistingBase && baseExisting instanceof TFile) {
            return { fullPath: basePath, existing: baseExisting };
        }

        for (const fileName of candidates) {
            const fullPath = this.joinMediaPath(folderPath, fileName);
            const existing = this.app.vault.getAbstractFileByPath(fullPath);
            if (!fallbackExisting && existing instanceof TFile) {
                fallbackExisting = existing;
                fallbackPath = fullPath;
            }
            if (!(existing instanceof TFile) && !options.reservedPaths?.has(fullPath)) {
                return { fullPath, existing: null };
            }
        }

        for (let index = 2; index < 1000; index++) {
            const fullPath = this.joinMediaPath(folderPath, `${fallback} ${index}`);
            const existing = this.app.vault.getAbstractFileByPath(fullPath);
            if (!(existing instanceof TFile) && !options.reservedPaths?.has(fullPath)) {
                return { fullPath, existing: null };
            }
        }

        return { fullPath: fallbackPath, existing: fallbackExisting };
    }

    private getFileNameCandidates(
        title: string,
        options: { preferYear?: boolean; year?: string; provider?: string; id?: string }
    ): string[] {
        const base = sanitizeFileName(title) || 'Untitled';
        const year = this.sanitizePathSuffix(options.year);
        const source = this.sanitizePathSuffix([options.provider, options.id].filter(Boolean).join('-'));
        const candidates: string[] = [];
        const push = (value: string): void => {
            const sanitized = sanitizeFileName(value) || 'Untitled';
            if (!candidates.includes(sanitized)) candidates.push(sanitized);
        };

        if (options.preferYear && year) push(`${base} ${year}`);
        push(base);
        if (year) push(`${base} ${year}`);
        if (source) push(year ? `${base} ${year} ${source}` : `${base} ${source}`);
        return candidates;
    }

    private sanitizePathSuffix(value: unknown): string {
        return String(value ?? '').trim().replace(/[\\/]/g, '-');
    }

    private joinMediaPath(folderPath: string, fileName: string): string {
        return folderPath ? `${folderPath}/${fileName}.md` : `${fileName}.md`;
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

    private toDetailsKind(kind: MediaKind): DetailsKind | undefined {
        return kind === 'games' ? undefined : kind;
    }

    private toVideoKind(kind: DetailsKind | undefined): 'movies' | 'series' {
        return kind === 'series' ? 'series' : 'movies';
    }

    private getSourceVideoKind(source: SearchResult): AnimeVideoSourceKind {
        return source.workTypeMedia === 'movie' ? 'movie' : 'series';
    }

    private async chooseResults(
        kind: MediaKind,
        initialProviderId: ProviderId | undefined,
        providerOptions: SearchProviderOption[],
        allowManualFallback = false
    ): Promise<SearchResult[]> {
        const modal = new MultiSelectSearchModal<SearchResult>(
            this.app,
            async (query, providerId, searchOptions) => {
                const results = await this.searchCatalogInput(kind, query, providerId, searchOptions);
                const settings = this.getSettings();
                const folder = this.getFolderPath(settings, kind).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
                const templateSettings = settings.integrations?.media[kind];
                const aliases = templateSettings?.templateMode === 'advanced' && templateSettings.template.trim()
                    ? parseTemplateFieldAliases(MEDIA_TYPE_BY_KIND[kind], templateSettings.template)
                    : templateSettings?.fieldAliases ?? {};
                const records = this.app.vault.getMarkdownFiles()
                    .filter(file => !folder || file.path.startsWith(`${folder}/`))
                    .map(file => ({
                        path: file.path,
                        basename: file.basename,
                        metadata: applyFrontmatterAliases(
                            this.app.metadataCache.getFileCache(file)?.frontmatter ?? {},
                            aliases
                        ),
                    }));
                const contains = createLibraryMembership(records, kind);
                return Object.assign(results.map(item => ({ ...item, alreadyInLibrary: contains(item),
                    libraryPath: item.directMatch && contains(item) ? records.find(record => createLibraryMembership([record], kind)(item))?.path : undefined })), {
                    hasNext: (results as SearchResult[] & { hasNext?: boolean }).hasNext,
                });
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
                placeholder: referenceText('placeholder'),
                emptyText: t('noticeNoResults'),
                doneText: t('promptAddSelected'),
                cancelText: t('commonCancel'),
                providerOptions,
                initialProviderId,
                initialTmdbLanguage: kind === 'anime' || kind === 'movies' || kind === 'series' ? this.getTmdbLanguage(kind) : undefined,
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
                syncActionText: kind === 'games' ? 'Steam Sync' : kind === 'anime' || kind === 'manga' ? 'AniList Import' : undefined,
                onSyncAction: kind === 'games' ? this.runSteamSync : kind === 'anime' || kind === 'manga' ? this.runAniListImport : undefined,
                manualActionText: allowManualFallback ? t('promptAddModeManual') : undefined,
                manualKind: allowManualFallback ? kind : undefined,
                mediaKind: kind,
                manualRatingSettings: this.getSettings().ratingScale,
                onInboxAction: this.openInbox ? presentation => this.openInbox!(kind, presentation) : undefined,
                onOpenExisting: item => { if (item.libraryPath) void this.app.workspace.openLinkText(item.libraryPath, '', true); },
                includeDlcToggleText: kind === 'games' ? t('promptIncludeDlc') : undefined,
                imageFallbackResolver: (item) => this.resolveSearchImageFallback(item),
                publicationStatusResolver: kind === 'manga' ? item => this.resolveMangaSearchMetadata(item) : undefined,
            }
        );
        const selected = (await modal.openAndGetValues()) ?? [];
        const manualDraft = modal.getManualDraft();
        if (manualDraft) await this.addManualMedia(kind, manualDraft);
        return selected;
    }

    private async resolveSearchImageFallback(item: SearchResult): Promise<string> {
        if (item.provider !== 'steam' || !item.id) return '';
        const options = this.getSettings().integrations?.providers.steamgriddb;
        return getSteamGridDbPoster(this.jsonFetcher, item.id, options);
    }

    private async resolveMangaSearchMetadata(item: SearchResult): Promise<string | undefined> {
        if (item.provider !== 'mangaupdates') return undefined;
        const details = await this.getMangaUpdatesDetailsWithPoster(item.id);
        if (details?.poster) item.image = details.poster;
        return details?.publicationStatus;
    }

    private async getMangaUpdatesDetailsWithPoster(id: string) {
        const details = await getMangaUpdatesDetails(this.jsonFetcher, id);
        if (!details) return null;
        let cached = this.mangaUpdatesPosters.get(id);
        if (!cached || cached.expiresAt <= Date.now()) {
            cached = {
                expiresAt: Date.now() + 10 * 60_000,
                request: findMangaDexCoverForMangaUpdates(this.jsonFetcher, id, details.name).catch(() => ''),
            };
            this.mangaUpdatesPosters.delete(id);
            this.mangaUpdatesPosters.set(id, cached);
            if (this.mangaUpdatesPosters.size > 100) this.mangaUpdatesPosters.delete(this.mangaUpdatesPosters.keys().next().value!);
        }
        const poster = await cached.request;
        return poster ? { ...details, poster, posterHorizontal: poster } : details;
    }

    private requiresApiKey(provider: ProviderId): boolean {
        return provider === 'rawg'
            || provider === 'igdb'
            || provider === 'tmdb'
            || provider === 'omdb'
            || provider === 'hardcover'
            || provider === 'googlebooks'
            || provider === 'comicvine';
    }

    private hasRequiredCredentials(
        provider: ProviderId,
        settings: { apiKey?: string; clientSecret?: string } | undefined
    ): boolean {
        if (provider === 'igdb') {
            return Boolean(settings?.apiKey && settings.clientSecret);
        }
        if (this.requiresApiKey(provider)) {
            return Boolean(settings?.apiKey?.trim());
        }
        return true;
    }

    private getProviderOptions(kind: MediaKind): SearchProviderOption[] {
        const providers: Array<{ id: ProviderId; label: string }> = kind === 'games'
            ? [
                { id: 'rawg', label: 'RAWG' },
                { id: 'steam', label: 'Steam' },
                { id: 'igdb', label: 'IGDB' },
                { id: 'vndb', label: 'VNDB' },
            ]
            : kind === 'anime'
                ? [
                { id: 'anilist', label: 'AniList' },
                { id: 'kitsu', label: 'Kitsu' },
                { id: 'shikimori', label: 'Shikimori' },
                { id: 'tmdb', label: 'TMDB' },
                { id: 'tvmaze', label: 'TVmaze' },
                { id: 'omdb', label: 'OMDb' },
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
                                { id: 'openlibrary', label: 'Open Library' },
                            ]
                            : [
                                { id: 'anilist', label: 'AniList' },
                                { id: 'shikimori', label: 'Shikimori' },
                                { id: 'mangaupdates', label: 'MUpd' },
                                { id: 'mangadex', label: 'MangaDex' },
                                { id: 'comicvine', label: 'Comic Vine' },
                            ];
        const integrations = this.getSettings().integrations;

        return providers
            .filter((provider) => {
                const settings = integrations?.providers[provider.id];
                return isProviderEnabled(integrations, provider.id, kind) && this.hasRequiredCredentials(provider.id, settings);
            })
            .map((provider) => ({
                id: provider.id,
                label: provider.label,
                ...(kind === 'anime' && isAnimeVideoProvider(provider.id) ? { alternateSearch: true } : {}),
            }));
    }

    private isProviderId(value: string | undefined): value is ProviderId {
        return value === 'rawg'
            || value === 'steam'
            || value === 'igdb'
            || value === 'anilist'
            || value === 'jikan'
            || value === 'kitsu'
            || value === 'shikimori'
            || value === 'tmdb'
            || value === 'tvmaze'
            || value === 'omdb'
            || value === 'hardcover'
            || value === 'googlebooks'
            || value === 'openlibrary'
            || value === 'mangaupdates'
            || value === 'mangadex' || value === 'comicvine' || value === 'vndb';
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
        howLongToBeatEnabled: boolean,
        aliases: Record<string, string> = {},
        wikilinkFields?: readonly string[],
    ): string | null {
        if (!enabled) {
            if (kind === 'movies' || kind === 'series' || kind === 'books' || kind === 'manga') {
                return buildSimpleTemplate(kind, getDefaultTemplateFields(kind), {}, []);
            }
            return null;
        }
        const templateMode = mode ?? 'simple';
        if (templateMode === 'advanced' && advancedTemplate.trim()) {
            return advancedTemplate;
        }
        const selected = Array.isArray(fields) ? fields : getDefaultTemplateFields(kind);
        return buildSimpleTemplate(kind, getEffectiveSimpleTemplateFields(kind, selected, { howLongToBeatEnabled }), aliases, wikilinkFields);
    }

    private getTmdbLanguage(kind?: DetailsKind): string {
        return normalizeTmdbLanguage(this.getSettings().integrations?.media[kind === 'anime' ? 'series' : this.toVideoKind(kind)].tmdbLanguage);
    }

    private async search(
        provider: ProviderId,
        query: string,
        apiKey: string,
        clientSecret = '',
        options: { includeDlc?: boolean; includeAdult?: boolean; includeVersions?: boolean; page?: number; pageSize?: number; tmdbLanguage?: string } = {},
        kind?: DetailsKind
    ): Promise<SearchResult[]> {
        const tmdbLanguage = normalizeTmdbLanguage(options.tmdbLanguage ?? this.getTmdbLanguage(kind));
        const cacheKey = [
            provider,
            kind ?? '',
            provider === 'tmdb' ? tmdbLanguage : '',
            provider === 'comicvine' ? apiKey.trim() : '',
            query.trim().toLowerCase(),
            options.includeDlc ? 'dlc' : 'base',
            options.includeAdult ? 'adult' : 'safe',
            options.includeVersions ? 'versions' : 'main',
            options.page ?? 1,
            options.pageSize ?? 10,
        ].join('|');
        const cached = this.searchCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) return cached.results;

        const fetchJson = this.jsonFetcher;
        let results: SearchResult[];
        switch (provider) {
            case 'vndb':
                results = await searchVndb(fetchJson, query, options); break;
            case 'rawg':
                results = await searchRawg(fetchJson, query, apiKey, {
                    page: options.page,
                    pageSize: options.pageSize,
                });
                break;
            case 'steam':
                results = await searchSteam(fetchJson, query, {
                    includeDlc: options.includeDlc,
                    page: options.page,
                    pageSize: options.pageSize,
                });
                break;
            case 'igdb':
                results = await searchIgdb(fetchJson, query, apiKey, clientSecret, {
                    page: options.page,
                    pageSize: options.pageSize,
                    includeVersions: options.includeVersions,
                });
                break;
            case 'anilist':
                if (kind === 'manga') {
                    results = await searchAniListManga(fetchJson, query, {
                        includeAdult: options.includeAdult === true,
                        page: options.page,
                        pageSize: options.pageSize,
                    });
                    break;
                }
                results = await searchAniList(fetchJson, query, {
                    includeAdult: options.includeAdult === true,
                    page: options.page,
                    pageSize: options.pageSize,
                });
                break;
            case 'kitsu':
                results = await searchKitsu(fetchJson, query, {
                    includeAdult: options.includeAdult === true,
                    page: options.page,
                    pageSize: options.pageSize,
                });
                break;
            case 'shikimori':
                if (kind === 'manga') {
                    results = await searchShikimoriManga(fetchJson, query, {
                        includeAdult: options.includeAdult === true,
                        page: options.page,
                        pageSize: options.pageSize,
                    });
                    break;
                }
                results = await searchShikimori(fetchJson, query, {
                    includeAdult: options.includeAdult === true,
                    page: options.page,
                    pageSize: options.pageSize,
                });
                break;
            case 'hardcover':
                results = await searchHardcoverBooks(fetchJson, query, apiKey, {
                    page: options.page,
                    pageSize: options.pageSize,
                });
                break;
            case 'openlibrary':
                results = await searchOpenLibrary(fetchJson, query, options);
                break;
            case 'googlebooks':
                results = await searchGoogleBooks(fetchJson, query, apiKey, {
                    page: options.page,
                    pageSize: options.pageSize,
                });
                break;
            case 'mangaupdates':
                results = await searchMangaUpdates(fetchJson, query, {
                    page: options.page,
                    pageSize: options.pageSize,
                });
                break;
            case 'mangadex':
                results = await searchMangaDex(fetchJson, query, {
                    includeAdult: options.includeAdult === true,
                    page: options.page,
                    pageSize: options.pageSize,
                });
                break;
            case 'comicvine':
                results = await searchComicVine(fetchJson, query, apiKey, options);
                break;
            case 'tmdb':
                results = await searchTmdb(fetchJson, query, apiKey, {
                    language: tmdbLanguage,
                    kind: kind === 'anime' ? 'mixed' : this.toVideoKind(kind),
                    page: options.page,
                    pageSize: options.pageSize,
                });
                break;
            case 'tvmaze':
                results = await searchTvmaze(fetchJson, query, apiKey, {
                    kind: kind === 'anime' ? 'mixed' : this.toVideoKind(kind),
                    page: options.page,
                    pageSize: options.pageSize,
                });
                break;
            case 'omdb':
                results = await searchOmdb(fetchJson, query, apiKey, {
                    kind: kind === 'anime' ? 'mixed' : this.toVideoKind(kind),
                    page: options.page,
                    pageSize: options.pageSize,
                });
                break;
            default:
                results = [];
        }

        if (provider === 'shikimori' && kind !== 'manga') await enrichAnimeSearchCountries(fetchJson, results);
        if (!options.includeAdult && ['anilist', 'kitsu', 'shikimori', 'mangaupdates', 'mangadex'].includes(provider)) {
            const hasNext = (results as SearchResult[] & { hasNext?: boolean }).hasNext ?? results.length >= (options.pageSize ?? 10);
            results = Object.assign(results.filter(item => item.isAdult !== true), { hasNext });
        }
        if (provider === 'tmdb') results = Object.assign(results.map(item => ({ ...item, tmdbLanguage })), { hasNext: (results as SearchResult[] & { hasNext?: boolean }).hasNext });
        const cacheTtlMs = provider === 'mangaupdates' ? 20 * 60_000 : 60_000;
        this.searchCache.set(cacheKey, { expiresAt: Date.now() + cacheTtlMs, results });
        if (this.searchCache.size > 80) {
            let oldestKey: string | undefined;
            for (const key of this.searchCache.keys()) {
                oldestKey = key;
                break;
            }
            if (oldestKey) this.searchCache.delete(oldestKey);
        }
        return results;
    }

    private async fetchDetails(
        provider: ProviderId,
        id: string,
        apiKey: string,
        clientSecret = '',
        kind?: DetailsKind,
        options: { includeParts?: boolean; tmdbLanguage?: string; includeEpisodeDurations?: boolean; sourceVideoKind?: AnimeVideoSourceKind; fillMissingEpisodeTotals?: boolean } = {}
    ): Promise<GameDetails | AnimeDetails | VideoDetails | BookDetails | MangaDetails | null> {
        if (kind === 'anime' && isAnimeVideoProvider(provider)) {
            const sourceKind = options.sourceVideoKind ?? 'series';
            const video = await this.fetchDetails(provider, id, apiKey, clientSecret, sourceKind === 'movie' ? 'movies' : 'series', {
                ...options, tmdbLanguage: options.tmdbLanguage ?? this.getTmdbLanguage(kind), fillMissingEpisodeTotals: true,
            });
            return video?.kind === 'video' ? adaptVideoToAnime(video, provider, id, sourceKind) : null;
        }
        const fetchJson = this.jsonFetcher;
        switch (provider) {
            case 'vndb': return getVndbDetails(fetchJson, id);
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
                return getAniListDetails(fetchJson, id, options);
            case 'jikan':
                if (kind === 'manga') return getLegacyMalMangaDetails(fetchJson, id);
                return getLegacyMalAnimeDetails(fetchJson, id, options);
            case 'kitsu': return getKitsuDetails(fetchJson, id, options);
            case 'shikimori':
                if (kind === 'manga') return getShikimoriMangaDetails(fetchJson, id);
                return getShikimoriDetails(fetchJson, id, options);
            case 'hardcover':
                return getHardcoverBookDetails(fetchJson, id, apiKey);
            case 'openlibrary':
                return getOpenLibraryDetails(fetchJson, id);
            case 'googlebooks':
                return getGoogleBooksDetails(fetchJson, id, apiKey);
            case 'mangaupdates':
                return this.getMangaUpdatesDetailsWithPoster(id);
            case 'mangadex':
                return getMangaDexDetails(fetchJson, id);
            case 'comicvine':
                return getComicVineDetails(fetchJson, id, apiKey);
            case 'tmdb':
                return getTmdbDetails(fetchJson, id, apiKey, this.toVideoKind(kind), options.tmdbLanguage ?? this.getTmdbLanguage(kind), { includeEpisodeDurations: options.includeEpisodeDurations });
            case 'tvmaze':
                return getTvmazeDetails(fetchJson, id, apiKey, this.toVideoKind(kind), options);
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

        const integrations = this.getSettings().integrations;
        const key = provider === 'jikan' ? 'kitsu' : provider;
        const providerSettings = integrations?.providers[key];
        if (!providerSettings || !isProviderEnabled(integrations, key, 'anime') || !this.hasRequiredCredentials(provider, providerSettings)) return null;

        const details = await this.fetchDetails(
            provider,
            id,
            providerSettings.apiKey || '',
            providerSettings.clientSecret || '',
            'anime',
            { sourceVideoKind: anime.integrationSourceKind }
        );
        if (!details || !this.isAnimeDetails(details)) return null;
        return this.getAnimeParts(details);
    }

    async reviewAnimePartsForItem(anime: AnimeItem, providerParts: IntegrationAnimePart[], automatic = false): Promise<AnimePartsReviewResult | null> {
        const result = reconcileAnimeParts(providerParts, anime.parts, anime.activePartId);
        const existing = result.parts.filter(part => result.existingIds.has(part.id));
        const scan = inspectPartCatalog(catalogSource(anime), providerParts, existing, anime.partCatalog);
        const pending = scan.baseline ? scan.candidates.filter(candidate => candidate.existing) : scan.candidates;
        if (anime.status === 'completed' && pending.length) {
            return { parts: existing, activePartId: result.activePartId, status: anime.status, partCatalog: scan.catalog, continuations: pending };
        }
        if (automatic && !(anime.status === 'completed' && scan.baseline)) {
            // Parts explicitly excluded earlier stay excluded during auto-fill.
            const parts = result.parts.filter(part => result.existingIds.has(part.id) || scan.baseline || !Object.prototype.hasOwnProperty.call(anime.partCatalog!.parts, part.id));
            return { parts, activePartId: result.activePartId, status: anime.status, partCatalog: scan.catalog };
        }
        return this.reviewAnimeParts({ ...this.detailsFromAnime(anime), parts: providerParts }, {
            provider: anime.integrationProvider ?? 'anilist', id: anime.integrationId ?? '', title: anime.displayName,
            existingParts: anime.parts ?? [], activePartId: anime.activePartId ?? null, status: anime.status,
            markNewParts: true, catalogSource: catalogSource(anime), partCatalog: anime.partCatalog,
        });
    }

    async fetchGameDlcForItem(game: GameItem): Promise<GameDlc[] | null> {
        const igdbId = (game.integrationProvider === 'igdb' ? game.integrationId : null)
            || this.readIgdbIdFromUrl(game.sourceUrl ?? '');
        if (igdbId) {
            const providerSettings = this.getSettings().integrations?.providers.igdb;
            if (!providerSettings?.enabled || !this.hasRequiredCredentials('igdb', providerSettings)) return null;
            return getIgdbDlcForGame(
                this.jsonFetcher,
                igdbId,
                providerSettings.apiKey || '',
                providerSettings.clientSecret || ''
            );
        }

        const steamId = game.steamAppId
            || (game.integrationProvider === 'steam' ? game.integrationId : null)
            || this.readSteamIdFromUrl(game.sourceUrl ?? '');
        if (!steamId) return null;

        const providerSettings = this.getSettings().integrations?.providers.steam;
        if (!providerSettings?.enabled) return null;

        return getSteamDlcForGame(this.jsonFetcher, steamId, {
            existing: game.dlc ?? [],
        });
    }

    getGalleryLoader(item: MediaItem): SourceGallery | undefined {
        if (item.type !== 'game' && item.type !== 'anime' && item.type !== 'movie' && item.type !== 'series') return;
        const extraFetch: typeof this.jsonFetcher = (...args) => runOnlineExtra(() => this.jsonFetcher(...args));
        const integrations = this.getSettings().integrations;
        const credentials = (provider: ProviderId) => {
            const key = provider === 'jikan' ? 'kitsu' : provider;
            const settings = integrations?.providers[key];
            return isProviderEnabled(integrations, key, this.getDetailsKindForItem(item)) && this.hasRequiredCredentials(provider, settings) ? settings : null;
        };
        const linkedProvider = this.getItemProvider(item);
        const linkedId = this.getItemProviderId(item);
        const tmdb = credentials('tmdb');
        const linkedSettings = linkedProvider && credentials(linkedProvider);
        const linked = linkedProvider && linkedId && linkedSettings &&
            (galleryProviders.has(linkedProvider) || (linkedProvider === 'omdb' && tmdb))
            ? { provider: linkedProvider, id: linkedId, apiKey: linkedSettings.apiKey, clientSecret: linkedSettings.clientSecret }
            : null;
        const steamId = item.type === 'game' ? String(item.steamAppId ?? '').trim() : '';
        const steam = /^[1-9]\d*$/.test(steamId) && credentials('steam') ? { provider: 'steam' as const, id: steamId } : null;
        const source = linked ?? steam;
        if (!source) return;

        const videoKind = item.type === 'movie' || (item.type === 'anime' && item.integrationSourceKind === 'movie') ? 'movie' : 'tv';
        const language = this.getTmdbLanguage(this.getDetailsKindForItem(item));
        const viaTmdb = (source.provider === 'tvmaze' || source.provider === 'omdb') && tmdb;
        const primaryTrailers = trailerProviders.has(source.provider) || viaTmdb;
        const alternateSteam = source.provider !== 'steam' ? steam : null;
        const loadTrailers = primaryTrailers || alternateSteam ? async () => {
            assertOnlineExtras();
            if (primaryTrailers) {
                try {
                    const trailers = await fetchSourceTrailers(extraFetch, {
                        ...source, videoKind, language, ...(viaTmdb ? { apiKey: viaTmdb.apiKey } : {}),
                    });
                    if (trailers.length || !alternateSteam) return trailers;
                } catch (error) {
                    if (!alternateSteam) throw error;
                }
            }
            return alternateSteam ? fetchSourceTrailers(extraFetch, { ...alternateSteam, videoKind, language }) : [];
        } : undefined;

        return {
            source: this.formatProviderName(source.provider === 'jikan' ? 'kitsu' : source.provider),
            imageTabs: source.provider === 'omdb' ? [] : source.provider === 'tmdb' || source.provider === 'tvmaze'
                ? ['backdrops', 'posters'] : ['images'],
            loadImages: onProgress => runOnlineExtra(() => fetchSourceGallery(extraFetch, { ...source, videoKind }, onProgress)),
            loadTrailers,
        };
    }

    async fetchCommunityRatingForItem(item: MediaItem): Promise<CommunityRating | null> {
        const source = this.getCommunityRatingSource(item);
        if (!source || source.provider === 'comicvine') return null;
        const integrations = this.getSettings().integrations;
        const key = source.provider === 'jikan' ? 'kitsu' : source.provider;
        const providerSettings = integrations?.providers[key];
        const kind = source.kind ?? this.getDetailsKindForItem(item);
        if (!providerSettings || !isProviderEnabled(integrations, key, kind) || !this.hasRequiredCredentials(source.provider, providerSettings)) return null;

        if (source.provider === 'steam') return this.fetchSteamCommunityRating(source.id);

        const details = await this.fetchDetails(
            source.provider,
            source.id,
            providerSettings.apiKey || '',
            providerSettings.clientSecret || '',
            kind,
            { includeParts: false }
        );
        if (!details) return null;

        const record = details as unknown as Record<string, unknown>;
        const rating = normalizeCommunityRating(
            source.provider,
            record.communityRating ?? record.imdbRating ?? record.rating
        );
        const votes = this.normalizeCommunityVotes(record.communityVotes);
        if (rating === null || votes === 0) return null;

        return {
            provider: this.getCommunityProviderLabel(source.provider),
            rating,
            votes,
        };
    }

    private getCommunityRatingSource(item: MediaItem): CommunityRatingSource | null {
        const provider = this.getItemProvider(item);
        const id = this.getItemProviderId(item);
        if (provider && id) {
            return { provider, id, kind: this.getDetailsKindForItem(item) };
        }

        const saved = this.getSavedCommunityRatingSource(item);
        if (saved) return saved;

        const url = this.getItemSourceUrl(item);

        const kitsu = url.match(/kitsu\.(?:io|app)\/anime\/(\d+)/i);
        if (kitsu?.[1]) return { provider: 'kitsu', id: kitsu[1] };

        const anilist = url.match(/anilist\.co\/(anime|manga)\/(\d+)/i);
        if (anilist?.[1] && anilist[2]) {
            return { provider: 'anilist', id: anilist[2], kind: anilist[1].toLowerCase() === 'manga' ? 'manga' : undefined };
        }

        const shikimori = url.match(/shikimori\.(?:net|one|io|me)\/(animes|mangas)\/[^\d]*(\d+)/i);
        if (shikimori?.[1] && shikimori[2]) {
            return { provider: 'shikimori', id: shikimori[2], kind: shikimori[1].toLowerCase() === 'mangas' ? 'manga' : undefined };
        }

        const tmdb = url.match(/themoviedb\.org\/(movie|tv)\/(\d+)/i);
        if (tmdb?.[1] && tmdb[2]) {
            return { provider: 'tmdb', id: tmdb[2], kind: tmdb[1].toLowerCase() === 'tv' ? 'series' : 'movies' };
        }

        const rawg = url.match(/rawg\.io\/games\/([^/?#]+)/i);
        if (rawg?.[1]) {
            return { provider: 'rawg', id: rawg[1] };
        }

        const steam = url.match(/store\.steampowered\.com\/app\/(\d+)/i);
        if (steam?.[1]) {
            return { provider: 'steam', id: steam[1] };
        }

        const igdb = url.match(/igdb\.com\/games\/(\d+)/i);
        if (igdb?.[1]) {
            return { provider: 'igdb', id: igdb[1] };
        }

        const steamAppId = item.type === 'game' ? String(item.steamAppId ?? '').trim() : '';
        return /^\d+$/.test(steamAppId) ? { provider: 'steam', id: steamAppId } : null;
    }

    // Notes created during the breakdown experiment may have a rating-only link.
    private getSavedCommunityRatingSource(item: MediaItem): CommunityRatingSource | null {
        if (!item.communityRatingProvider) return null;
        const file = this.app.vault.getAbstractFileByPath(item.filePath);
        if (!(file instanceof TFile)) return null;
        const entries: unknown = this.app.metadataCache.getFileCache(file)?.frontmatter?.lorebase_community_ratings;
        if (!Array.isArray(entries)) return null;
        const label = item.communityRatingProvider.trim().toLowerCase();
        const entry = entries.map(asRecord).find(row =>
            typeof row?.provider === 'string' && row.provider.trim().toLowerCase() === label);
        const source = asRecord(entry?.source);
        const provider = source?.provider;
        const id = source?.id;
        if (typeof provider !== 'string' || !this.isProviderId(provider) || typeof id !== 'string' || !id.trim()) return null;
        const kind = source?.kind;
        if (kind === 'anime' || kind === 'movies' || kind === 'series' || kind === 'books' || kind === 'manga') {
            return { provider, id, kind };
        }
        return { provider, id };
    }

    private getItemProvider(item: MediaItem): ProviderId | null {
        const provider = item.integrationProvider;
        return typeof provider === 'string' && this.isProviderId(provider) ? provider : null;
    }

    private getItemProviderId(item: MediaItem): string | null {
        const id = item.integrationId;
        return id ? String(id).trim() || null : null;
    }

    private getItemSourceUrl(item: MediaItem): string {
        if ('sourceUrl' in item && item.sourceUrl) return item.sourceUrl;
        return '';
    }

    private getDetailsKindForItem(item: MediaItem): DetailsKind | undefined {
        if (item.type === 'anime' && isAnimeVideoProvider(item.integrationProvider)) return item.integrationSourceKind === 'movie' ? 'movies' : 'series';
        if (item.type === 'anime') return 'anime';
        if (item.type === 'movie') return 'movies';
        if (item.type === 'series') return 'series';
        if (item.type === 'book') return 'books';
        if (item.type === 'manga') return 'manga';
        return undefined;
    }

    private async fetchSteamCommunityRating(id: string): Promise<CommunityRating | null> {
        const url = new URL(`https://store.steampowered.com/appreviews/${encodeURIComponent(id)}`);
        url.searchParams.set('json', '1');
        url.searchParams.set('filter', 'all');
        url.searchParams.set('language', 'all');
        url.searchParams.set('purchase_type', 'all');
        url.searchParams.set('num_per_page', '0');
        const root = asRecord(await this.jsonFetcher(url.toString(), { Accept: 'application/json' }).catch(() => null));
        const summary = asRecord(root?.query_summary);
        const positive = this.normalizeCommunityVotes(summary?.total_positive);
        const reviews = this.normalizeCommunityVotes(summary?.total_reviews);
        if (reviews === 0) return null;
        if (reviews !== null && positive !== null && positive <= reviews) {
            return { provider: 'Steam', rating: Math.round((positive / reviews) * 1000) / 10, votes: reviews };
        }

        // The reviews endpoint can redirect to the storefront. Use the game's published aggregate in that case.
        const html = await fetchText(`https://store.steampowered.com/app/${encodeURIComponent(id)}/?l=english`);
        const aggregate = html.match(/<a\b[^>]*\bitemprop=["']aggregateRating["'][^>]*>/i)?.[0];
        const tooltip = aggregate?.match(/\bdata-tooltip-html=["'](\d{1,3})% of the ([\d,]+) user reviews\b/i);
        if (!tooltip) return null;
        const rating = Number(tooltip[1]);
        const votes = this.normalizeCommunityVotes(tooltip[2]);
        return rating <= 100 && votes ? { provider: 'Steam', rating, votes } : null;
    }

    private normalizeCommunityVotes(value: unknown): number | null {
        const number = this.toNumberOrNull(value);
        return number === null ? null : Math.max(0, Math.trunc(number));
    }

    private toNumberOrNull(value: unknown): number | null {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (value === null || value === undefined) return null;
        const parsed = Number.parseFloat(String(value).replace(/,/g, '').trim());
        return Number.isFinite(parsed) ? parsed : null;
    }

    private getCommunityProviderLabel(provider: ProviderId): string {
        if (provider === 'omdb') return 'IMDb';
        if (provider === 'jikan') return 'Kitsu';
        return this.formatProviderName(provider);
    }

    private readSteamIdFromUrl(url: string): string | null {
        const match = url.match(/store\.steampowered\.com\/app\/(\d+)/i);
        return match?.[1] ?? null;
    }

    private readIgdbIdFromUrl(url: string): string | null {
        const match = url.match(/igdb\.com\/games\/(\d+)/i);
        return match?.[1] ?? null;
    }

    private async buildGameValues(
        details: GameDetails,
        includeHowLongToBeat: boolean,
        fallbackImage = '',
        source?: { provider?: ProviderId; id?: string }
    ): Promise<Record<string, unknown>> {
        const hltb = includeHowLongToBeat
            ? await fetchHowLongToBeatValues(this.jsonFetcher, details.name, details.year, '[Integrations]')
            : null;
        // Details contain a verified Steam portrait or the configured
        // SteamGridDB result. Search artwork is only a preview fallback and
        // must never override that resolved image.
        const poster = details.poster || fallbackImage;

        return {
            countries: normalizeCountryMetadata(details.countries ?? ('countryOfOrigin' in details ? details.countryOfOrigin : [])),
            name: details.name,
            workType: normalizeMediaWorkType('game', details.workType),
            Poster: poster,
            PosterHorizontal: details.posterHorizontal || poster,
            Plot: details.description,
            genres: details.genres,
            platforms: details.platforms,
            developers: details.developers,
            publishers: details.publishers,
            rating: this.toNumberOrZero(details.rating),
            userRating: 0,
            metacritic: details.metacritic,
            released: details.released,
            Year: this.toIntegerOrZero(details.year),
            url: details.url,
            status: this.isFutureRelease(details.released) ? 'to_be_released' : 'not_started',
            main: hltb?.main ?? '',
            main_plus_sides: hltb?.main_plus_sides ?? '',
            perfectionist: hltb?.perfectionist ?? '',
            completionist: hltb?.perfectionist ?? '',
            integrationProvider: source?.provider ?? '',
            integrationId: source?.id ?? '',
            communityRating: '',
            communityVotes: '',
            communityRatingProvider: '',
        };
    }

    private buildAnimeValues(details: AnimeDetails, source?: {
        parts?: IntegrationAnimePart[];
        activePartId?: string | null;
        status?: AnimeItem['status'];
        provider?: ProviderId;
        id?: string;
    }): Record<string, unknown> {
        const templateSettings = this.getSettings().integrations?.media.anime;
        const alternativeTitles = getAlternativeTitlePreference(templateSettings, source?.provider);
        const parts = source && Object.prototype.hasOwnProperty.call(source, 'parts')
            ? source.parts ?? []
            : this.getAnimeParts(details);
        const activePart = parts.find((part) => part.id === source?.activePartId) ?? parts[0] ?? null;
        return {
            countries: normalizeCountryMetadata(details.countries ?? ('countryOfOrigin' in details ? details.countryOfOrigin : [])),
            name: details.name,
            alternativeTitles: alternativeTitles.enabled ? selectAlternativeTitles(details.alternativeTitles, alternativeTitles.language, details.name) : [],
            image: details.image,
            ImageHorizontal: details.imageHorizontal ?? details.image,
            Plot: details.description,
            imdbRating: this.toNumberOrZero(details.imdbRating),
            genres: details.genres ?? [],
            tags: details.tags,
            countryOfOrigin: normalizeCountry(details.countryOfOrigin),
            isAdult: details.isAdult ?? false,
            Year: this.toIntegerOrZero(details.year),
            released: this.normalizeDateValue(details.released),
            studios: details.studios,
            url: details.url,
            status: source?.status && source.status !== 'planned' ? source.status : this.isFutureRelease(details.released) ? 'to_be_released' : 'planned',
            format: details.format || '',
            seasonCurrent: activePart?.seasonNumber ?? 0,
            episodeCurrent: activePart?.episodeCurrent ?? 0,
            episodeTotal: activePart?.episodeTotal ?? 0,
            activePartId: activePart?.id ?? '',
            animePartsYaml: renderPartsYaml(parts),
            rating: 0,
            integrationProvider: source?.provider ?? '',
            integrationId: source?.id ?? '',
            communityRating: '',
            communityVotes: '',
            communityRatingProvider: '',
        };
    }

    private buildVideoValues(details: VideoDetails, source?: {
        kind?: MediaKind;
        provider?: ProviderId;
        id?: string;
        activePartId?: string | null;
        status?: IntegrationVideoPart['status'];
    }): Record<string, unknown> {
        const parts = details.parts ?? [];
        const activePart = (source?.activePartId ? parts.find((part) => part.id === source.activePartId) : null) ?? parts[0] ?? null;
        const directors = this.normalizeDisplayList(details.director);
        const actors = this.normalizeDisplayList(details.actors);
        return {
            countries: normalizeCountryMetadata(details.countries ?? ('countryOfOrigin' in details ? details.countryOfOrigin : [])),
            name: details.name,
            Poster: details.poster,
            PosterHorizontal: details.posterHorizontal || details.poster,
            Plot: details.description,
            genres: details.genres,
            workType: normalizeMediaWorkType(source?.kind === 'series' ? 'series' : 'movie', details.workType),
            Year: this.toIntegerOrZero(details.year),
            released: this.normalizeDateValue(details.released),
            runtime: this.toIntegerOrZero(details.runtime),
            director: directors,
            directors,
            actors,
            seasons: this.toIntegerOrZero(details.seasons),
            seasonCurrent: activePart?.seasonNumber ?? null,
            episodeCurrent: activePart?.episodeCurrent ?? details.episodeCurrent ?? 0,
            episodeTotal: activePart?.episodeTotal ?? this.toIntegerOrZero(details.episodeTotal),
            networks: details.networks ?? [],
            studios: details.studios ?? [],
            rating: this.toNumberOrZero(details.rating),
            url: details.url,
            status: source?.status && source.status !== 'planned' ? source.status : this.isFutureRelease(details.released) ? 'to_be_released' : 'planned',
            activePartId: activePart?.id ?? '',
            videoPartsYaml: renderPartsYaml(parts),
            integrationProvider: source?.provider ?? '',
            integrationId: source?.id ?? '',
            communityRating: '',
            communityVotes: '',
            communityRatingProvider: '',
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
            countries: normalizeCountryMetadata(details.countries ?? ('countryOfOrigin' in details ? details.countryOfOrigin : [])),
            name: title,
            Poster: poster,
            PosterHorizontal: details.posterHorizontal || poster,
            Plot: details.description,
            authors: details.authors,
            publisher: this.normalizeDisplayList(details.publisher),
            genres: details.genres,
            Year: this.toIntegerOrZero(year),
            released: this.normalizeDateValue(details.released),
            pageCurrent: 0,
            pageTotal: this.toIntegerOrZero(details.pages),
            chapterCurrent: 0,
            chapterTotal: 0,
            rating: this.toNumberOrZero(details.rating),
            url: details.url,
            status: this.isFutureRelease(details.released) ? 'to_be_released' : 'planned',
            integrationProvider: source?.provider ?? '',
            integrationId: source?.id ?? '',
            communityRating: '',
            communityVotes: '',
            communityRatingProvider: '',
        };
    }

    private buildMangaValues(details: MangaDetails, source?: {
        provider?: ProviderId;
        id?: string;
        activePartId?: string | null;
        status?: IntegrationMangaPart['status'];
    }): Record<string, unknown> {
        const templateSettings = this.getSettings().integrations?.media.manga;
        const alternativeTitles = getAlternativeTitlePreference(templateSettings, source?.provider);
        const parts = details.parts ?? [];
        const activePart = (source?.activePartId ? parts.find((part) => part.id === source.activePartId) : null) ?? parts[0] ?? null;
        return {
            countries: normalizeCountryMetadata(details.countries ?? ('countryOfOrigin' in details ? details.countryOfOrigin : [])),
            name: details.name,
            alternativeTitles: alternativeTitles.enabled ? selectAlternativeTitles(details.alternativeTitles, alternativeTitles.language, details.name) : [],
            Poster: details.poster,
            PosterHorizontal: details.posterHorizontal || details.poster,
            Plot: details.description,
            authors: details.authors,
            artists: details.artists,
            genres: details.genres,
            isAdult: details.isAdult
                ?? details.genres.some((genre) => ['adult', 'hentai'].includes(genre.trim().toLowerCase())),
            workType: details.workType || 'Manga',
            Year: this.toIntegerOrZero(details.year),
            released: this.normalizeDateValue(details.released),
            chapterCurrent: activePart?.chapterCurrent ?? 0,
            chapterTotal: activePart?.chapterTotal ?? this.toIntegerOrZero(details.chapters),
            volumeCurrent: activePart?.volumeNumber ?? 0,
            volumeTotal: this.toIntegerOrZero(details.volumes ?? (parts.length ? String(parts.length) : '')),
            rating: this.toNumberOrZero(details.rating),
            url: details.url,
            status: source?.status && source.status !== 'planned' ? source.status : this.isFutureRelease(details.released) ? 'to_be_released' : 'planned',
            activePartId: activePart?.id ?? '',
            mangaPartsYaml: renderMangaPartsYaml(parts),
            integrationProvider: source?.provider ?? '',
            integrationId: source?.id ?? '',
            communityRating: '',
            communityVotes: '',
            communityRatingProvider: '',
        };
    }

    private buildManualValues(draft: ManualCreateDraft): Record<string, unknown> {
        const poster = draft.poster || '';
        const posterHorizontal = draft.posterHorizontal || poster;
        const common: Record<string, unknown> = {
            countries: normalizeCountryMetadata(draft.countryOfOrigin),
            name: draft.title,
            alternativeTitles: [],
            Poster: poster,
            PosterHorizontal: posterHorizontal,
            image: poster,
            ImageHorizontal: posterHorizontal,
            Plot: draft.description ?? '',
            genres: draft.genres,
            tags: draft.tags,
            Year: this.toIntegerOrZero(draft.year),
            released: draft.released,
            rating: this.toNumberOrZero(draft.rating),
            userRating: this.toNumberOrZero(draft.rating),
            url: draft.url,
            status: draft.status,
            integrationProvider: '',
            integrationId: '',
            communityRating: '',
            communityVotes: '',
            communityRatingProvider: '',
            isAdult: draft.isAdult ?? false,
            workType: draft.workType,
            countryOfOrigin: normalizeCountry(draft.countryOfOrigin),
        };

        if (draft.kind === 'games') {
            return {
                ...common,
                gameSeries: draft.gameSeries,
                platforms: draft.platforms ?? [],
                developers: draft.developers ?? [],
                publishers: draft.publishers ?? [],
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
                imdbRating: 0,
                studios: draft.studios ?? [],
                format: activePart?.kind ?? draft.format,
                seasonCurrent: activePart?.seasonNumber ?? 0,
                episodeCurrent: activePart?.episodeCurrent ?? 0,
                episodeTotal: activePart?.episodeTotal ?? 0,
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
            const parts = isSeries && draft.videoParts?.length ? draft.videoParts : [part];
            const activePart = parts.find(part => part.id === draft.activeVideoPartId) ?? parts[0];
            return {
                ...common,
                released: this.normalizeDateValue(draft.released),
                runtime: draft.runtime ?? '',
                director: draft.directors ?? [],
                directors: draft.directors ?? [],
                actors: draft.actors ?? [],
                seasons: isSeries ? Math.max(1, ...parts.map(part => part.seasonNumber ?? 0)) : 0,
                seasonCurrent: activePart.seasonNumber ?? null,
                episodeCurrent: activePart.episodeCurrent ?? 0,
                episodeTotal: activePart.episodeTotal ?? 0,
                networks: draft.networks ?? [],
                studios: draft.studios ?? [],
                activePartId: activePart.id,
                videoPartsYaml: renderPartsYaml(parts),
            };
        }

        if (draft.kind === 'books') {
            return {
                ...common,
                authors: draft.authors ?? [],
                publisher: draft.publisher ?? '',
                pageCurrent: draft.pageCurrent ?? 0,
                pageTotal: draft.pageTotal ?? 0,
                chapterCurrent: draft.chapterCurrent ?? 0,
                chapterTotal: draft.chapterTotal ?? 0,
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
            workType: draft.workType || 'Manga',
            authors: draft.authors ?? [],
            artists: draft.artists ?? [],
            chapterCurrent: draft.chapterCurrent ?? 0,
            chapterTotal: draft.chapterTotal ?? 0,
            volumeCurrent: draft.volumeCurrent ?? 0,
            volumeTotal: draft.volumeTotal ?? 0,
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
            signal: this.lifetime.signal,
        });
        return {
            ...draft,
            poster: localPath,
            posterHorizontal: draft.posterHorizontal || localPath,
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
        catalogSource?: string;
        partCatalog?: import('../types').PartCatalog;
    }): Promise<AnimePartsReviewResult | null> {
        const modal = new AnimePartsReviewModal(this.app, {
            title: t('animePartsProviderTitle'),
            subtitle: options.title,
            providerParts: this.getAnimeParts(details),
            existingParts: options.existingParts,
            activePartId: options.activePartId,
            status: options.status,
            markNewParts: options.markNewParts,
            catalogSource: options.catalogSource, partCatalog: options.partCatalog,
        });
        return modal.openAndGetValue();
    }

    private detailsFromAnime(anime: AnimeItem): AnimeDetails {
        return {
            kind: 'anime',
            name: anime.displayName,
            description: anime.summary ?? anime.description ?? '',
            image: anime.titleImageUrl || anime.imageUrl,
            imageHorizontal: anime.horizontalImageUrl ?? anime.titleImageUrl ?? anime.imageUrl,
            genres: anime.genres,
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
            title: details.name || details.format || 'Main',
            alternativeTitles: selectAlternativeTitles(details.alternativeTitles, 'all', details.name),
            poster: details.image || null,
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

    private toNumberOrZero(value: unknown): number {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (value === null || value === undefined) return 0;
        const parsed = Number.parseFloat(String(value).trim());
        return Number.isFinite(parsed) ? parsed : 0;
    }

    private toIntegerOrZero(value: unknown): number {
        return Math.trunc(this.toNumberOrZero(value));
    }

    private normalizeDateValue(value: unknown): string {
        const text = this.toStringSafe(value).trim();
        if (!text || /^\d{4}$/.test(text)) return '';
        const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
        if (isoMatch) {
            const year = Number(isoMatch[1]);
            const month = Number(isoMatch[2]);
            const day = Number(isoMatch[3]);
            const date = new Date(Date.UTC(year, month - 1, day));
            return date.getUTCFullYear() === year
                && date.getUTCMonth() === month - 1
                && date.getUTCDate() === day
                ? text
                : '';
        }
        const parsed = Date.parse(text);
        if (Number.isNaN(parsed)) return '';
        const date = new Date(parsed);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    private isFutureRelease(value: unknown): boolean {
        return isFutureReleaseDate(value);
    }

    private normalizeDisplayList(value: unknown): string[] {
        const source = Array.isArray(value) ? value : this.toStringSafe(value).split(/[,;\n]+/);
        const result: string[] = [];
        const seen = new Set<string>();
        for (const entry of source) {
            const text = this.toStringSafe(entry).trim();
            const key = text.toLocaleLowerCase();
            if (!text || seen.has(key)) continue;
            seen.add(key);
            result.push(text);
        }
        return result;
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

    private needsFrontmatterFallback(kind: MediaKind, content: string): boolean {
        if (kind !== 'movies' && kind !== 'series' && kind !== 'books' && kind !== 'manga') return false;
        return !this.hasFrontmatter(content);
    }

    private hasFrontmatter(content: string): boolean {
        for (let index = 0; index < content.length; index++) {
            const char = content[index];
            if (char === ' ' || char === '\n' || char === '\r' || char === '\t') continue;
            return content[index] === '-' && content[index + 1] === '-' && content[index + 2] === '-';
        }
        return false;
    }

}

export function ensureClassificationFrontmatter(content: string, kind: MediaKind, values: Record<string, unknown>, template = ''): string {
    const fields: Record<string, unknown> = {};
    if (['games', 'movies', 'series', 'manga'].includes(kind) && values.workType) fields.work_type = values.workType;
    if (kind === 'anime') { fields.country_of_origin = values.countryOfOrigin || ''; fields.Sex18 = values.isAdult === true; fields.genres = values.genres ?? []; fields.lorebase_anime_genres_migrated = true; }
    const aliases = parseTemplateFieldAliases(MEDIA_TYPE_BY_KIND[kind], template);
    const existing = new Set(getTemplateYamlKeys(content));
    const additions = Object.entries(fields).flatMap(([canonical, value]) => {
        const key = aliases[canonical] ?? canonical;
        if (existing.has(key)) return [];
        const yamlKey = /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? key : JSON.stringify(key);
        return [yamlKey + ': ' + JSON.stringify(value)];
    });
    const match = content.match(/^(\uFEFF?---\r?\n)([\s\S]*?)(\r?\n---)(?=\r?\n|$)/);
    if (!match || !additions.length) return content;
    return match[1] + match[2] + '\n' + additions.join('\n') + match[3] + content.slice(match[0].length);
}
