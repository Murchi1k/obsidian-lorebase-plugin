/**
 * LOREBASE - Main Plugin Entry Point
 * Games and anime tracker plugin for Obsidian
 */

import { Plugin, WorkspaceLeaf, Menu, Notice, addIcon } from 'obsidian';
import { LorebaseSettings, MediaItem, GameStats, AnimeStats, MediaType } from './types';
import { DEFAULT_SETTINGS, VIEW_TYPE_LIBRARY, LOREBASE_ICON_ID, LOREBASE_ICON_SVG } from './constants';
import { i18n, t } from './localization';
import { LibraryView } from './views/LibraryView';
import { LorebaseSettingTab } from './settings/SettingsTab';
import { EditModal } from './modals/EditModal';
import { AnimeEditModal } from './modals/AnimeEditModal';
import { StatsModal } from './modals/StatsModal';
import { DeleteModal } from './modals/DeleteModal';
import { SteamSyncReviewModal } from './modals/SteamSyncReviewModal';
import { GameService } from './services/GameService';
import { AnimeService } from './services/AnimeService';
import { ParticleService } from './services/ParticleService';
import { IntegrationService } from './services/IntegrationService';
import { SteamSyncService } from './services/SteamSyncService';
import {
    mergeOverlayLayout,
    mergeOverlayVisibility,
    normalizeDescriptionLines,
    normalizeTagPresets,
    parseBadges,
} from './settings/settingsNormalization';

// =============================================================================
// LOREBASE PLUGIN
// =============================================================================

/**
 * Main plugin class
 */
export default class LorebasePlugin extends Plugin {
    settings: LorebaseSettings = DEFAULT_SETTINGS;
    private gameService: GameService | null = null;
    private animeService: AnimeService | null = null;
    private mediaType: MediaType = 'game';
    private particleService: ParticleService | null = null;
    private integrationService: IntegrationService | null = null;
    private steamSyncService: SteamSyncService | null = null;

    async onload(): Promise<void> {
        // Load settings
        await this.loadSettings();
        this.normalizeMediaType();

        // Initialize localization
        i18n.setLanguage(this.settings.language);

        // Initialize game service
        this.gameService = new GameService(this.app);
        this.gameService.setFolderPath(this.settings.games.folderPath);
        this.animeService = new AnimeService(this.app);
        this.animeService.setFolderPath(this.settings.anime.folderPath);
        this.integrationService = new IntegrationService(this.app, () => this.settings, () => {
            void this.runSteamSync();
        });
        this.steamSyncService = new SteamSyncService(this.app);
        addIcon(LOREBASE_ICON_ID, LOREBASE_ICON_SVG);

        // Register the library view
        this.registerView(
            VIEW_TYPE_LIBRARY,
            (leaf) => new LibraryView(leaf, this)
        );

        // Add ribbon icon
        this.addRibbonIcon(LOREBASE_ICON_ID, t('ribbonLibrary'), (evt: MouseEvent) => {
            this.showLibraryMenu(evt);
        });

        // Add command to open library
        this.addCommand({
            id: 'open-library',
            name: t('commandOpenLibrary'),
            callback: () => {
                void this.activateView();
            }
        });

        this.addCommand({
            id: 'add-game',
            name: t('commandAddGame'),
            callback: () => {
                void this.integrationService?.addGame();
            }
        });

        this.addCommand({
            id: 'add-anime',
            name: t('commandAddAnime'),
            callback: () => {
                void this.integrationService?.addAnime();
            }
        });

        this.addCommand({
            id: 'steam-sync',
            name: t('commandSteamSync'),
            callback: () => {
                void this.runSteamSync();
            }
        });

        // Register settings tab
        this.addSettingTab(new LorebaseSettingTab(this.app, this));

        // Apply accent color on load
        this.applyAccentColor();
        this.applyParticles();

        if (this.settings.steamSync.autoSyncPlaytimeOnStartup && this.settings.steamSync.steamId) {
            void this.runSteamPlaytimeSync();
        }
    }

    onunload(): void {
        // Clean up game service reference
        if (this.gameService) {
            this.gameService = null;
        }
        if (this.animeService) {
            this.animeService = null;
        }

        if (this.particleService) {
            this.particleService.destroy();
            this.particleService = null;
        }

        if (this.integrationService) {
            this.integrationService = null;
        }

        if (this.steamSyncService) {
            this.steamSyncService = null;
        }
    }

    /**
     * Load plugin settings
     */
    async loadSettings(): Promise<void> {
        const loaded: unknown = await this.loadData();
        const sanitized = this.isSettingsRecord(loaded) ? { ...loaded } : {};
        this.settings = Object.assign({}, DEFAULT_SETTINGS, sanitized);

        // Ensure nested objects are merged properly
        if (sanitized?.games) {
            this.settings.games = Object.assign({}, DEFAULT_SETTINGS.games, sanitized.games);
        }
        if (sanitized?.anime) {
            this.settings.anime = Object.assign({}, DEFAULT_SETTINGS.anime, sanitized.anime);
        }
        if (sanitized?.enabledMedia) {
            this.settings.enabledMedia = Object.assign({}, DEFAULT_SETTINGS.enabledMedia, sanitized.enabledMedia);
        }
        this.settings.steamSync = Object.assign({}, DEFAULT_SETTINGS.steamSync, sanitized?.steamSync ?? {});
        this.settings.steamSync.fields = Object.assign(
            {},
            DEFAULT_SETTINGS.steamSync.fields,
            sanitized?.steamSync?.fields ?? {}
        );
        if (this.settings.steamSync.statusWithPlaytime === 'playing' || this.settings.steamSync.statusWithPlaytime === 'completed') {
            this.settings.steamSync.statusWithPlaytime = DEFAULT_SETTINGS.steamSync.statusWithPlaytime;
        }
        this.settings.statusLabels = {
            games: Object.assign({}, DEFAULT_SETTINGS.statusLabels.games, sanitized?.statusLabels?.games ?? {}),
            anime: Object.assign({}, DEFAULT_SETTINGS.statusLabels.anime, sanitized?.statusLabels?.anime ?? {}),
        };
        this.settings.tagPresets = {
            games: normalizeTagPresets(sanitized?.tagPresets?.games),
        };

        this.settings.descriptionLines = normalizeDescriptionLines(
            sanitized?.descriptionLines,
            DEFAULT_SETTINGS.descriptionLines
        );
        this.settings.horizontalDescriptionLines = normalizeDescriptionLines(
            sanitized?.horizontalDescriptionLines,
            this.settings.descriptionLines
        );
        this.settings.animeDescriptionLines = normalizeDescriptionLines(
            sanitized?.animeDescriptionLines,
            this.settings.descriptionLines
        );
        this.settings.animeHorizontalDescriptionLines = normalizeDescriptionLines(
            sanitized?.animeHorizontalDescriptionLines,
            this.settings.horizontalDescriptionLines
        );

        if (sanitized?.overlayTextLayout) {
            this.settings.overlayTextLayout = mergeOverlayLayout(sanitized.overlayTextLayout, DEFAULT_SETTINGS.overlayTextLayout);

            const approx = (a: number, b: number): boolean => Math.abs(a - b) < 0.11;
            const legacyLooksLikeOldDefaults =
                approx(this.settings.overlayTextLayout.title.x, 6)
                && approx(this.settings.overlayTextLayout.title.y, 8)
                && approx(this.settings.overlayTextLayout.year.x, 6)
                && approx(this.settings.overlayTextLayout.year.y, 22)
                && approx(this.settings.overlayTextLayout.description.x, 6)
                && approx(this.settings.overlayTextLayout.description.y, 34);

            if (legacyLooksLikeOldDefaults) {
                this.settings.overlayTextLayout = mergeOverlayLayout(undefined, DEFAULT_SETTINGS.overlayTextLayout);
            }
        } else {
            this.settings.overlayTextLayout = mergeOverlayLayout(undefined, DEFAULT_SETTINGS.overlayTextLayout);
        }

        this.settings.horizontalOverlayTextLayout = mergeOverlayLayout(
            sanitized?.horizontalOverlayTextLayout,
            DEFAULT_SETTINGS.horizontalOverlayTextLayout
        );

        this.settings.animeOverlayTextLayout = mergeOverlayLayout(
            sanitized?.animeOverlayTextLayout,
            sanitized?.animeOverlayTextLayout
                ? DEFAULT_SETTINGS.animeOverlayTextLayout
                : this.settings.overlayTextLayout
        );
        this.settings.animeHorizontalOverlayTextLayout = mergeOverlayLayout(
            sanitized?.animeHorizontalOverlayTextLayout,
            sanitized?.animeHorizontalOverlayTextLayout
                ? DEFAULT_SETTINGS.animeHorizontalOverlayTextLayout
                : this.settings.horizontalOverlayTextLayout
        );

        this.settings.overlayTextVisibility = mergeOverlayVisibility(
            sanitized?.overlayTextVisibility,
            DEFAULT_SETTINGS.overlayTextVisibility
        );
        this.settings.horizontalOverlayTextVisibility = mergeOverlayVisibility(
            sanitized?.horizontalOverlayTextVisibility,
            sanitized?.horizontalOverlayTextVisibility
                ? DEFAULT_SETTINGS.horizontalOverlayTextVisibility
                : this.settings.overlayTextVisibility
        );
        this.settings.animeOverlayTextVisibility = mergeOverlayVisibility(
            sanitized?.animeOverlayTextVisibility,
            sanitized?.animeOverlayTextVisibility
                ? DEFAULT_SETTINGS.animeOverlayTextVisibility
                : this.settings.overlayTextVisibility
        );
        this.settings.animeHorizontalOverlayTextVisibility = mergeOverlayVisibility(
            sanitized?.animeHorizontalOverlayTextVisibility,
            sanitized?.animeHorizontalOverlayTextVisibility
                ? DEFAULT_SETTINGS.animeHorizontalOverlayTextVisibility
                : this.settings.animeOverlayTextVisibility
        );
        this.settings.overlayApplyToAllMedia = typeof sanitized?.overlayApplyToAllMedia === 'boolean'
            ? sanitized.overlayApplyToAllMedia
            : DEFAULT_SETTINGS.overlayApplyToAllMedia;
        this.settings.badges = parseBadges(sanitized?.badges, DEFAULT_SETTINGS.badges);
        this.settings.horizontalBadges = parseBadges(
            sanitized?.horizontalBadges,
            sanitized?.horizontalBadges ? DEFAULT_SETTINGS.horizontalBadges : this.settings.badges
        );
        this.settings.animeBadges = parseBadges(
            sanitized?.animeBadges,
            sanitized?.animeBadges ? DEFAULT_SETTINGS.animeBadges : this.settings.badges
        );
        this.settings.animeHorizontalBadges = parseBadges(
            sanitized?.animeHorizontalBadges,
            sanitized?.animeHorizontalBadges ? DEFAULT_SETTINGS.animeHorizontalBadges : this.settings.animeBadges
        );
        // Migration guard: fix desync where anime badges were disabled via
        // "apply to all" but only game badges were re-enabled afterward.
        const animeBadgeDesync =
            (!this.settings.animeBadges.status.enabled && this.settings.badges.status.enabled)
            || (!this.settings.animeBadges.rating.enabled && this.settings.badges.rating.enabled);
        if (animeBadgeDesync) {
            if (!this.settings.animeBadges.status.enabled && this.settings.badges.status.enabled) {
                this.settings.animeBadges.status.enabled = true;
            }
            if (!this.settings.animeBadges.rating.enabled && this.settings.badges.rating.enabled) {
                this.settings.animeBadges.rating.enabled = true;
            }
            void this.saveData(this.settings);
        }
        if (sanitized?.integrations) {
            this.settings.integrations = Object.assign({}, DEFAULT_SETTINGS.integrations, sanitized.integrations);
            const integrations = this.settings.integrations;
            const defaultIntegrations = DEFAULT_SETTINGS.integrations;
            if (defaultIntegrations && sanitized.integrations.providers) {
                integrations.providers = Object.assign(
                    {},
                    defaultIntegrations.providers,
                    sanitized.integrations.providers
                );
            }
            if (defaultIntegrations) integrations.imageStorage = Object.assign(
                {},
                defaultIntegrations.imageStorage,
                sanitized.integrations.imageStorage ?? {}
            );
            if (defaultIntegrations && sanitized.integrations.media) {
                integrations.media = Object.assign(
                    {},
                    defaultIntegrations.media,
                    sanitized.integrations.media
                );
            }

            // Backward compatibility: map removed anime provider "omdb" to "anilist".
            const animeProvider = String(integrations.media?.anime?.provider ?? '');
            if (animeProvider === 'omdb') {
                integrations.media.anime.provider = 'anilist';
            }
        }

        if (this.migrateIntegrationTemplates()) {
            await this.saveData(this.settings);
        }
    }

    private isSettingsRecord(value: unknown): value is Partial<LorebaseSettings> {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    }

    private migrateIntegrationTemplates(): boolean {
        const media = this.settings.integrations?.media;
        if (!media) return false;

        let changed = false;

        if (media.games?.template) {
            const nextTemplate = this.insertTemplateFieldAfter(
                media.games.template,
                'poster',
                'poster_b: "{{VALUE:PosterHorizontal}}"',
                ['poster_b:', '{{VALUE:PosterHorizontal}}']
            );

            if (nextTemplate !== media.games.template) {
                media.games.template = nextTemplate;
                changed = true;
            }
        }

        if (media.anime?.template) {
            let nextTemplate = media.anime.template.replace(
                /^(\s*)image:\s*$/m,
                '$1image: "{{VALUE:image}}"'
            );
            nextTemplate = nextTemplate.replace(
                /^(\s*)status:\s*planned\s*$/m,
                '$1status: "{{VALUE:status}}"'
            );
            nextTemplate = nextTemplate
                .split(/\r?\n/)
                .filter((line) => !/^\s*name\s*:\s*["']?\{\{VALUE:name\}\}["']?\s*$/.test(line))
                .join('\n');

            nextTemplate = this.insertTemplateFieldAfter(
                nextTemplate,
                'image',
                'image_b: "{{VALUE:ImageHorizontal}}"',
                ['image_b:', '{{VALUE:ImageHorizontal}}']
            );
            nextTemplate = this.insertTemplateFieldAfter(
                nextTemplate,
                'format',
                [
                    'season_current: "{{VALUE:seasonCurrent}}"',
                    'episode_current: "{{VALUE:episodeCurrent}}"',
                    'episode_total: "{{VALUE:episodeTotal}}"',
                    'active_part_id: "{{VALUE:activePartId}}"',
                    'anime_parts:',
                    '{{VALUE:animePartsYaml}}',
                ].join('\n'),
                ['anime_parts:', '{{VALUE:animePartsYaml}}']
            );
            nextTemplate = this.insertTemplateFieldAfter(
                nextTemplate,
                'favorite',
                [
                    'integration_provider: "{{VALUE:integrationProvider}}"',
                    'integration_id: "{{VALUE:integrationId}}"',
                ].join('\n'),
                ['integration_provider:', '{{VALUE:integrationProvider}}', 'integration_id:', '{{VALUE:integrationId}}']
            );
            if (!nextTemplate.includes('integration_provider:')) {
                nextTemplate = this.insertTemplateFieldAfter(
                    nextTemplate,
                    'url',
                    [
                        'integration_provider: "{{VALUE:integrationProvider}}"',
                        'integration_id: "{{VALUE:integrationId}}"',
                    ].join('\n'),
                    ['integration_provider:', '{{VALUE:integrationProvider}}', 'integration_id:', '{{VALUE:integrationId}}']
                );
            }
            if (!nextTemplate.includes('anime_parts:')) {
                nextTemplate = this.insertTemplateFieldAfter(
                    nextTemplate,
                    'year',
                    [
                        'format: "{{VALUE:format}}"',
                        'season_current: "{{VALUE:seasonCurrent}}"',
                        'episode_current: "{{VALUE:episodeCurrent}}"',
                        'episode_total: "{{VALUE:episodeTotal}}"',
                        'active_part_id: "{{VALUE:activePartId}}"',
                        'anime_parts:',
                        '{{VALUE:animePartsYaml}}',
                    ].join('\n'),
                    ['anime_parts:', '{{VALUE:animePartsYaml}}']
                );
            }

            if (nextTemplate !== media.anime.template) {
                media.anime.template = nextTemplate;
                changed = true;
            }
        }

        if (media.anime?.templateFields?.includes('name')) {
            media.anime.templateFields = media.anime.templateFields.filter((field) => field !== 'name');
            changed = true;
        }
        if (media.anime?.templateFields && !media.anime.templateFields.includes('animeParts')) {
            const formatIndex = media.anime.templateFields.indexOf('format');
            const insertAt = formatIndex >= 0 ? formatIndex + 1 : media.anime.templateFields.length;
            media.anime.templateFields.splice(insertAt, 0, 'animeParts');
            changed = true;
        }
        if (media.anime?.templateFields && !media.anime.templateFields.includes('integrationSource')) {
            const favoriteIndex = media.anime.templateFields.indexOf('favorite');
            const insertAt = favoriteIndex >= 0 ? favoriteIndex + 1 : media.anime.templateFields.length;
            media.anime.templateFields.splice(insertAt, 0, 'integrationSource');
            changed = true;
        }

        return changed;
    }

    private insertTemplateFieldAfter(template: string, fieldName: string, insertedLine: string, duplicateMarkers: string[]): string {
        if (duplicateMarkers.some((marker) => template.includes(marker))) {
            return template;
        }

        const escapedField = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const fieldLine = new RegExp(`^(\\s*)${escapedField}\\s*:\\s*.*$`, 'm');
        return template.replace(fieldLine, (line: string, indent: string) => `${line}\n${indent}${insertedLine}`);
    }

    /**
     * Save plugin settings
     */
    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);

        // Update game service folder path if changed
        if (this.gameService) {
            this.gameService.setFolderPath(this.settings.games.folderPath);
        }
        if (this.animeService) {
            this.animeService.setFolderPath(this.settings.anime.folderPath);
        }

        // Update localization
        i18n.setLanguage(this.settings.language);

        // Apply accent color
        this.applyAccentColor();
        this.normalizeMediaType();
        this.applyParticles();
    }

    /**
     * Activate the library view
     */
    async activateView(): Promise<void> {
        const { workspace } = this.app;

        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_LIBRARY);

        if (leaves.length > 0) {
            // View already exists, use it
            leaf = leaves[0];
        } else {
            // Create new leaf in the main workspace
            leaf = workspace.getLeaf(true);
            if (leaf) {
                await leaf.setViewState({
                    type: VIEW_TYPE_LIBRARY,
                    active: true
                });
            }
        }

        if (leaf) {
            workspace.setActiveLeaf(leaf, { focus: true });
        }
    }

    /**
     * Show edit modal for a media item
     */
    showEditModal(item: MediaItem, onSave: () => void): void {
        if (item.type === 'anime') {
            const animeItem = item;
            const modal = new AnimeEditModal(
                this.app,
                animeItem,
                async (updates) => {
                    if (this.animeService) {
                        await this.animeService.updateAnime(animeItem, updates);
                        onSave();
                    }
                },
                () => {
                    this.showDeleteModal(animeItem, async () => {
                        if (!this.animeService) return;
                        await this.animeService.deleteAnime(animeItem);
                        onSave();
                    });
                },
                async () => {
                    if (!this.integrationService || !this.animeService) return;
                    const anime = animeItem;
                    if (!anime.integrationProvider || !anime.integrationId) {
                        new Notice(t('animePartsSourceMissing'));
                        return false;
                    }
                    new Notice(t('notifyLoading'), 1200);
                    const providerParts = await this.integrationService.fetchAnimePartsForItem(anime);
                    if (!providerParts?.length) {
                        new Notice(t('noticeNoResults'));
                        return false;
                    }
                    const review = await this.integrationService.reviewAnimePartsForItem(anime, providerParts);
                    if (!review) return false;
                    const activePart = review.parts.find((part) => part.id === review.activePartId) ?? review.parts[0] ?? null;
                    await this.animeService.updateAnime(anime, {
                        status: review.status,
                        parts: review.parts,
                        activePartId: review.activePartId,
                        seasonCurrent: activePart?.seasonNumber ?? null,
                        episodeCurrent: activePart?.episodeCurrent ?? null,
                        episodeTotal: activePart?.episodeTotal ?? null,
                    });
                    onSave();
                    return true;
                }
            );
            modal.open();
            return;
        }

        const gameItem = item;
        const seriesOptions = this.gameService?.getSeriesList() ?? [];
        const modal = new EditModal(
            this.app,
            gameItem,
            async (updates) => {
                if (this.gameService) {
                    await this.gameService.updateGame(gameItem, updates);
                    onSave();
                }
            },
            seriesOptions,
            () => {
                this.showDeleteModal(gameItem, async () => {
                    if (!this.gameService) return;
                    await this.gameService.deleteGame(gameItem);
                    onSave();
                });
            },
            this.settings.tagPresets.games
        );
        modal.open();
    }

    /**
     * Show statistics modal
     */
    showStatsModal(stats: GameStats | AnimeStats, mediaType: MediaType): void {
        const modal = new StatsModal(this.app, stats, mediaType);
        modal.open();
    }

    /**
     * Show delete confirmation modal
     */
    showDeleteModal(game: MediaItem, onConfirm: () => Promise<void>): void {
        const modal = new DeleteModal(this.app, game, onConfirm);
        modal.open();
    }

    addMediaItem(mediaType: MediaType): void {
        if (mediaType === 'anime') {
            void this.integrationService?.addAnime();
            return;
        }
        void this.integrationService?.addGame();
    }

    /**
     * Get the game service instance
     */
    getGameService(): GameService | null {
        return this.gameService;
    }

    getAnimeService(): AnimeService | null {
        return this.animeService;
    }

    getSteamSyncService(): SteamSyncService | null {
        return this.steamSyncService;
    }

    getMediaType(): MediaType {
        this.normalizeMediaType();
        return this.mediaType;
    }

    /**
     * Apply accent color to CSS variables
     */
    private applyAccentColor(): void {
        activeDocument.documentElement.style.setProperty('--lorebase-accent', this.settings.accentColor);
    }

    private applyParticles(): void {
        if (!this.particleService) {
            this.particleService = new ParticleService();
        }
        this.particleService.apply(this.settings.particleEffect, this.settings.particleIntensity);
    }

    private getEnabledMedia(): MediaType[] {
        const enabled: MediaType[] = [];
        if (this.settings.enabledMedia?.games) enabled.push('game');
        if (this.settings.enabledMedia?.anime) enabled.push('anime');
        return enabled;
    }

    private normalizeMediaType(): void {
        const enabled = this.getEnabledMedia();
        if (enabled.length === 0) {
            this.settings.enabledMedia = { games: true, anime: false };
            this.mediaType = 'game';
            return;
        }
        if (!enabled.includes(this.mediaType)) {
            this.mediaType = enabled[0];
        }
    }

    /**
     * Refresh all library views
     */
    refreshViews(): void {
        this.app.workspace.getLeavesOfType(VIEW_TYPE_LIBRARY).forEach(leaf => {
            if (leaf.view instanceof LibraryView) {
                void leaf.view.refresh();
            }
        });
    }

    /**
     * Lightweight refresh used by live settings preview updates.
     * Avoids full data reload from vault and updates only rendered card visuals.
     */
    refreshViewsVisuals(): void {
        this.app.workspace.getLeavesOfType(VIEW_TYPE_LIBRARY).forEach(leaf => {
            if (leaf.view instanceof LibraryView) {
                leaf.view.refreshCardVisuals();
            }
        });
    }

    async runSteamSync(): Promise<void> {
        if (!this.steamSyncService) return;

        try {
            new Notice('Steam Sync: loading Steam games...');
            const candidates = await this.steamSyncService.previewImport(this.settings.steamSync);
            for (const warning of this.steamSyncService.consumeWarnings()) {
                new Notice(`Steam Sync: ${warning}`, 6000);
            }
            if (!candidates.length) {
                new Notice('Steam Sync: no games found.');
                return;
            }

            const selectedAppIds = await new SteamSyncReviewModal(this.app, candidates, this.settings.language).openAndGetValue();
            if (!selectedAppIds || selectedAppIds.size === 0) {
                new Notice('Steam Sync: import cancelled.');
                return;
            }

            new Notice(`Steam Sync: importing ${selectedAppIds.size} selected games...`);
            const result = await this.steamSyncService.sync(this.settings, {
                onProgress: (message) => new Notice(`Steam Sync: ${message}`, 1200),
                selectedAppIds,
            });
            this.gameService?.invalidateCache();
            this.refreshViews();
            new Notice(`Steam Sync complete: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.failed} failed.`);
        } catch (error) {
            console.error('[Steam Sync] Sync failed:', error);
            const message = error instanceof Error ? `: ${error.message}` : '';
            new Notice(`Steam Sync failed${message}`);
        }
    }

    private async runSteamPlaytimeSync(): Promise<void> {
        if (!this.steamSyncService) return;

        try {
            const result = await this.steamSyncService.syncPlaytimeForExisting(this.settings);
            if (result.updated > 0) {
                this.gameService?.invalidateCache();
                this.refreshViews();
                new Notice(`Steam playtime updated for ${result.updated} games.`, 2500);
            }
        } catch (error) {
            console.warn('[Steam Sync] Playtime auto-sync failed:', error);
        }
    }

    /**
     * Show library type selection menu
     */
    showLibraryMenu(evt: MouseEvent): void {
        const enabled = this.getEnabledMedia();
        if (enabled.length <= 1) {
            const nextType = enabled[0] ?? 'game';
            const changed = this.mediaType !== nextType;
            this.mediaType = nextType;
            void this.activateView();
            if (changed) {
                this.refreshViews();
            }
            return;
        }

        const menu = new Menu();

        // Games
        if (this.settings.enabledMedia.games) {
            menu.addItem((item) => {
            const isSelected = this.mediaType === 'game';

            // Set title with custom styling if selected
            if (isSelected) {
                const titleEl = activeDocument.createDocumentFragment();
                const span = titleEl.createEl('span');
                span.setText(t('contextGames'));
                span.addClass('lorebase-menu-selected-title');
                item.setTitle(titleEl);
            } else {
                item.setTitle(t('contextGames'));
            }

            item.setIcon('gamepad-2')
                .onClick(() => {
                    const changed = this.mediaType !== 'game';
                    this.mediaType = 'game';
                    void this.activateView();
                    if (changed) {
                        this.refreshViews();
                    }
                });
            });
        }

        // Anime
        if (this.settings.enabledMedia.anime) {
            menu.addItem((item) => {
            const isSelected = this.mediaType === 'anime';

            if (isSelected) {
                const titleEl = activeDocument.createDocumentFragment();
                const span = titleEl.createEl('span');
                span.setText(t('contextAnime'));
                span.addClass('lorebase-menu-selected-title');
                item.setTitle(titleEl);
            } else {
                item.setTitle(t('contextAnime'));
            }

            item.setIcon('clapperboard')
                .onClick(() => {
                    const changed = this.mediaType !== 'anime';
                    this.mediaType = 'anime';
                    void this.activateView();
                    if (changed) {
                        this.refreshViews();
                    }
                });
            });
        }

        const element = evt.currentTarget;
        if (!(element instanceof HTMLElement)) return;
        const rect = element.getBoundingClientRect();
        menu.showAtPosition({ x: rect.right, y: rect.top });
    }
}
