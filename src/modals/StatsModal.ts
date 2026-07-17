/**
 * LOREBASE - Statistics Modal
 * Displays collection statistics in a beautiful dashboard
 */

import { Modal, App } from 'obsidian';
import { GameStats, AnimeStats, MediaType } from '../types';
import { t } from '../localization';
import { RATING_CONFIG } from '../constants';

// =============================================================================
// STATS MODAL
// =============================================================================

/**
 * Modal for displaying collection statistics
 */
export class StatsModal extends Modal {
    private stats: GameStats | AnimeStats;
    private mediaType: MediaType;

    constructor(app: App, stats: GameStats | AnimeStats, mediaType: MediaType) {
        super(app);
        this.stats = stats;
        this.mediaType = mediaType;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        this.modalEl.addClass('lorebase-stats-modal-container');
        contentEl.addClass('lorebase-stats-modal', 'lorebase-modal-root');

        // Header
        const header = contentEl.createDiv({ cls: 'lorebase-stats-header lorebase-modal-header' });
        header.createSpan({
            text: this.getMediaIcon(),
            cls: 'lorebase-stats-icon'
        });
        header.createEl('h2', { text: t('statsTitle'), cls: 'lorebase-stats-title' });

        // Custom Close Button
        const closeBtn = header.createEl('button', { cls: 'lorebase-stats-close lorebase-modal-close', text: '\u{2716}' });
        closeBtn.addEventListener('click', () => this.close());

        // Main stats grid
        this.renderMainStats(contentEl);

        // Status distribution
        this.renderStatusDistribution(contentEl);

        // Rating distribution
        this.renderRatingDistribution(contentEl);

        // Additional info (games only)
        if (this.mediaType === 'game') {
            this.renderAdditionalInfo(contentEl);
        }
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }

    /**
     * Render main statistics cards
     */
    private renderMainStats(container: HTMLElement): void {
        const grid = container.createDiv({ cls: 'lorebase-stats-main-grid' });
        const isWatchMedia = this.mediaType !== 'game';
        const stats = this.stats as (GameStats & AnimeStats);

        // Total
        this.createStatCard(grid, {
            icon: this.getMediaIcon(),
            label: t('statsTotal'),
            value: stats.total,
            color: 'blue'
        });

        // Completed / Watched
        this.createStatCard(grid, {
            icon: '\u{2705}',
            label: isWatchMedia ? t('statusCompleted') : t('statsCompleted'),
            value: isWatchMedia ? stats.completed : (stats as GameStats).completed,
            percent: isWatchMedia
                ? (stats.statusPercentages.completed || 0)
                : ((stats as GameStats).statusPercentages.completed || 0),
            color: 'green'
        });

        // Average rating
        this.createStatCard(grid, {
            icon: '\u{2B50}',
            label: t('statsAvgRating'),
            value: stats.avgRating,
            subtext: `${t('statsOf')} 5.0`,
            color: 'pink'
        });

        // Favorites
        this.createStatCard(grid, {
            icon: '\u{2764}\u{FE0F}',
            label: t('statusFavorite'),
            value: stats.favorite,
            percent: stats.total > 0
                ? Math.round((stats.favorite / stats.total) * 1000) / 10
                : 0,
            color: 'orange'
        });
    }

    /**
     * Create a statistics card
     */
    private createStatCard(parent: HTMLElement, config: {
        icon: string;
        label: string;
        value: number;
        percent?: number;
        subtext?: string;
        color: string;
    }): void {
        const card = parent.createDiv({ cls: `lorebase-stats-card lorebase-stats-card-${config.color}` });

        card.createDiv({ cls: 'lorebase-stats-card-icon', text: config.icon });

        const content = card.createDiv({ cls: 'lorebase-stats-card-content' });
        content.createDiv({ cls: 'lorebase-stats-card-label', text: config.label });
        content.createDiv({ cls: 'lorebase-stats-card-value', text: String(config.value) });

        if (config.percent !== undefined) {
            content.createDiv({ cls: 'lorebase-stats-card-percent', text: `${config.percent}%` });
        }
        if (config.subtext) {
            content.createDiv({ cls: 'lorebase-stats-card-percent', text: config.subtext });
        }
    }

    /**
     * Render status distribution section
     */
    private renderStatusDistribution(container: HTMLElement): void {
        const section = container.createDiv({ cls: 'lorebase-stats-section' });
        const isWatchMedia = this.mediaType !== 'game';

        const title = section.createDiv({ cls: 'lorebase-stats-section-title' });
        title.createSpan({ text: '\u{1F4C8}' });
        title.createSpan({ text: t('statsDistribution') });

        const grid = section.createDiv({ cls: 'lorebase-stats-status-grid' });

        const isReadingMedia = this.mediaType === 'book' || this.mediaType === 'manga';
        const statusData = isWatchMedia
            ? [
                { key: 'planned', icon: '\u{1F5D3}\u{FE0F}', label: isReadingMedia ? t('statusPlanToRead') : t('statusPlanned'), value: (this.stats as AnimeStats).planned, color: '#9e9e9e' },
                { key: 'watching', icon: '\u{1F440}', label: isReadingMedia ? t('statusReading') : t('statusWatching'), value: (this.stats as AnimeStats).watching, color: '#2196f3' },
                { key: 'completed', icon: '\u{2705}', label: t('statusCompleted'), value: (this.stats as AnimeStats).completed, color: '#4caf50' },
                { key: 'dropped', icon: '\u{1F494}', label: t('statusDropped'), value: (this.stats as AnimeStats).dropped, color: '#ff9800' },
                { key: 'paused', icon: '\u{23F8}\u{FE0F}', label: t('statusPaused'), value: (this.stats as AnimeStats).paused, color: '#ffeb3b' },
            ]
            : [
                { key: 'completed', icon: '\u{2705}', label: t('statusPlayed'), value: (this.stats as GameStats).completed, color: '#4caf50' },
                { key: 'playing', icon: '\u{1F3AE}', label: t('statusPlaying'), value: (this.stats as GameStats).playing, color: '#2196f3' },
                { key: 'dropped', icon: '\u{1F6AB}', label: t('statusDropped'), value: (this.stats as GameStats).dropped, color: '#ff9800' },
                { key: 'wishlist', icon: '\u{1F516}', label: t('statusWishlist'), value: (this.stats as GameStats).wishlist, color: '#ff6fb1' },
                { key: 'sandbox', icon: '\u{1F9E9}', label: t('statusSandbox'), value: (this.stats as GameStats).sandbox, color: '#ffeb3b' },
                { key: 'notStarted', icon: '\u{23F8}\u{FE0F}', label: t('statusNotStarted'), value: (this.stats as GameStats).notStarted, color: '#9e9e9e' },
            ];

        for (const data of statusData) {
            const percent = this.stats.statusPercentages[data.key] || 0;

            const card = grid.createDiv({ cls: 'lorebase-stats-status-card' });
            card.style.setProperty('--status-color', data.color);

            card.createDiv({ cls: 'lorebase-stats-status-icon', text: data.icon });

            const info = card.createDiv({ cls: 'lorebase-stats-status-info' });
            info.createDiv({ cls: 'lorebase-stats-status-label', text: data.label });

            const values = info.createDiv({ cls: 'lorebase-stats-status-values' });
            values.createSpan({ cls: 'lorebase-stats-status-value', text: String(data.value) });
            values.createSpan({ cls: 'lorebase-stats-status-percent', text: `${percent}%` });

            const bar = card.createDiv({ cls: 'lorebase-stats-bar' });
            const fill = bar.createDiv({ cls: 'lorebase-stats-bar-fill' });
            fill.style.width = `${percent}%`;
            fill.style.background = data.color;
        }
    }

    /**
     * Render rating distribution section
     */
    private renderRatingDistribution(container: HTMLElement): void {
        const section = container.createDiv({ cls: 'lorebase-stats-section' });

        const title = section.createDiv({ cls: 'lorebase-stats-section-title' });
        title.createSpan({ text: '\u{2B50}' });
        title.createSpan({ text: t('statsRatingDistribution') });

        const grid = section.createDiv({ cls: 'lorebase-stats-rating-grid' });

        for (const config of RATING_CONFIG) {
            const count = this.stats.ratingDistribution[config.value] || 0;
            const percent = this.stats.withRating > 0
                ? Math.round((count / this.stats.withRating) * 1000) / 10
                : 0;

            const card = grid.createDiv({ cls: 'lorebase-stats-rating-card' });

            card.createDiv({ cls: 'lorebase-stats-rating-emoji', text: config.emoji });
            card.createDiv({ cls: 'lorebase-stats-rating-label', text: t(config.labelKey) });
            card.createDiv({ cls: 'lorebase-stats-rating-count', text: String(count) });

            const bar = card.createDiv({ cls: 'lorebase-stats-bar' });
            const fill = bar.createDiv({ cls: 'lorebase-stats-bar-fill' });
            fill.style.width = `${percent}%`;
            fill.style.background = config.color;

            card.createDiv({ cls: 'lorebase-stats-rating-percent', text: `${percent}%` });
        }
    }

    /**
     * Render additional info section
     */
    private renderAdditionalInfo(container: HTMLElement): void {
        const stats = this.stats as GameStats;
        const section = container.createDiv({ cls: 'lorebase-stats-section' });

        const title = section.createDiv({ cls: 'lorebase-stats-section-title' });
        title.createSpan({ text: '\u{2139}\u{FE0F}' });
        title.createSpan({ text: t('statsAdditionalInfo') });

        const grid = section.createDiv({ cls: 'lorebase-stats-extra-grid' });

        const extraData = [
            { icon: '\u{1F3AF}', label: t('statsSeries'), value: stats.seriesCount },
            { icon: '\u{1F3A8}', label: t('statsCustomPosters'), value: stats.customPosters },
            { icon: '\u{1F51E}', label: t('statsAdultContent'), value: stats.adult },

            { icon: '\u{1F3C6}', label: t('statsRated'), value: stats.withRating },
            {
                icon: '\u{1F4CA}',
                label: t('statsCompletionPercent'),
                value: stats.total > 0
                    ? `${Math.round((stats.completed / stats.total) * 100)}%`
                    : '0%'
            },
        ];

        for (const data of extraData) {
            const card = grid.createDiv({ cls: 'lorebase-stats-extra-card' });
            card.createDiv({ cls: 'lorebase-stats-extra-icon', text: data.icon });
            card.createDiv({ cls: 'lorebase-stats-extra-label', text: data.label });
            card.createDiv({ cls: 'lorebase-stats-extra-value', text: String(data.value) });
        }
    }

    private getMediaIcon(): string {
        if (this.mediaType === 'game') return '\u{1F3AE}';
        if (this.mediaType === 'movie') return '\u{1F3AC}';
        if (this.mediaType === 'book') return '\u{1F4D6}';
        if (this.mediaType === 'manga') return '\u{1F4DA}';
        return '\u{1F4FA}';
    }
}
