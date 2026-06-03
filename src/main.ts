/**
 * LOREBASE - Main Plugin Entry Point
 * Games and anime tracker plugin for Obsidian
 */

import { Plugin, WorkspaceLeaf, Menu, addIcon } from 'obsidian';
import { LorebaseSettings, GameItem, AnimeItem, MediaItem, GameStats, AnimeStats, MediaType } from './types';
import { DEFAULT_SETTINGS, VIEW_TYPE_LIBRARY, LOREBASE_ICON_ID, LOREBASE_ICON_SVG } from './constants';
import { i18n, t } from './localization';
import { LibraryView } from './views/LibraryView';
import { LorebaseSettingTab } from './settings/SettingsTab';
import { EditModal } from './modals/EditModal';
import { AnimeEditModal } from './modals/AnimeEditModal';
import { StatsModal } from './modals/StatsModal';
import { DeleteModal } from './modals/DeleteModal';
import { GameService } from './services/GameService';
import { AnimeService } from './services/AnimeService';
import { ParticleService } from './services/ParticleService';
import { IntegrationService } from './services/IntegrationService';
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
        this.integrationService = new IntegrationService(this.app, () => this.settings);
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
            id: 'open-lorebase-library',
            name: t('commandOpenLibrary'),
            callback: () => {
                this.activateView();
            }
        });

        this.addCommand({
            id: 'lorebase-add-game',
            name: t('commandAddGame'),
            callback: () => {
                void this.integrationService?.addGame();
            }
        });

        this.addCommand({
            id: 'lorebase-add-anime',
            name: t('commandAddAnime'),
            callback: () => {
                void this.integrationService?.addAnime();
            }
        });

        // Register settings tab
        this.addSettingTab(new LorebaseSettingTab(this.app, this));

        // Apply accent color on load
        this.applyAccentColor();
        this.applyParticles();
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
    }

    /**
     * Load plugin settings
     */
    async loadSettings(): Promise<void> {
        const loaded = (await this.loadData()) as Partial<LorebaseSettings> | null;
        const sanitized = loaded ? { ...loaded } : {};
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
            if (sanitized.integrations.providers) {
                this.settings.integrations!.providers = Object.assign(
                    {},
                    DEFAULT_SETTINGS.integrations!.providers,
                    sanitized.integrations.providers
                );
            }
            if (sanitized.integrations.media) {
                this.settings.integrations!.media = Object.assign(
                    {},
                    DEFAULT_SETTINGS.integrations!.media,
                    sanitized.integrations.media
                );
            }

            // Backward compatibility: map removed anime provider "omdb" to "anilist".
            const animeProvider = this.settings.integrations?.media?.anime?.provider as string | undefined;
            if (animeProvider === 'omdb') {
                this.settings.integrations!.media.anime.provider = 'anilist';
            }
        }
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
            workspace.revealLeaf(leaf);
        }
    }

    /**
     * Show edit modal for a media item
     */
    showEditModal(item: MediaItem, onSave: () => void): void {
        if (item.type === 'anime') {
            const modal = new AnimeEditModal(
                this.app,
                item as AnimeItem,
                async (updates) => {
                    if (this.animeService) {
                        await this.animeService.updateAnime(item as AnimeItem, updates);
                        onSave();
                    }
                },
                () => {
                    this.showDeleteModal(item, async () => {
                        if (!this.animeService) return;
                        await this.animeService.deleteAnime(item as AnimeItem);
                        onSave();
                    });
                }
            );
            modal.open();
            return;
        }

        const seriesOptions = this.gameService?.getSeriesList() ?? [];
        const modal = new EditModal(
            this.app,
            item as GameItem,
            async (updates) => {
                if (this.gameService) {
                    await this.gameService.updateGame(item as GameItem, updates);
                    onSave();
                }
            },
            seriesOptions,
            () => {
                this.showDeleteModal(item, async () => {
                    if (!this.gameService) return;
                    await this.gameService.deleteGame(item as GameItem);
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

    getMediaType(): MediaType {
        this.normalizeMediaType();
        return this.mediaType;
    }

    /**
     * Apply accent color to CSS variables
     */
    private applyAccentColor(): void {
        document.documentElement.style.setProperty('--lorebase-accent', this.settings.accentColor);
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
                leaf.view.refresh();
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

    /**
     * Show library type selection menu
     */
    showLibraryMenu(evt: MouseEvent): void {
        const enabled = this.getEnabledMedia();
        if (enabled.length <= 1) {
            const nextType = enabled[0] ?? 'game';
            const changed = this.mediaType !== nextType;
            this.mediaType = nextType;
            this.activateView();
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
                const titleEl = document.createDocumentFragment();
                const span = titleEl.createEl('span');
                span.setText(t('contextGames'));
                span.style.color = 'var(--lorebase-accent)';
                span.style.fontWeight = '600';
                item.setTitle(titleEl);
            } else {
                item.setTitle(t('contextGames'));
            }

            item.setIcon('gamepad-2')
                .onClick(() => {
                    const changed = this.mediaType !== 'game';
                    this.mediaType = 'game';
                    this.activateView();
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
                const titleEl = document.createDocumentFragment();
                const span = titleEl.createEl('span');
                span.setText(t('contextAnime'));
                span.style.color = 'var(--lorebase-accent)';
                span.style.fontWeight = '600';
                item.setTitle(titleEl);
            } else {
                item.setTitle(t('contextAnime'));
            }

            item.setIcon('clapperboard')
                .onClick(() => {
                    const changed = this.mediaType !== 'anime';
                    this.mediaType = 'anime';
                    this.activateView();
                    if (changed) {
                        this.refreshViews();
                    }
                });
            });
        }

        const element = evt.currentTarget as HTMLElement;
        const rect = element.getBoundingClientRect();
        menu.showAtPosition({ x: rect.right, y: rect.top });
    }
}
