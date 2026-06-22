/**
 * LOREBASE - Game Card Component
 * Matches original 2.0.txt card structure exactly
 */

import { AnimeItem, GameItem, MediaItem, CardSize, CardOrientation, SortField, LorebaseSettings, BadgePosition, MediaStatus } from '../types';
import { t, i18n } from '../localization';
import { STATUS_CONFIG, RATING_EMOJI, CARD_SIZES, DEFAULT_COVER, DEFAULT_SETTINGS, HORIZONTAL_CARD_SIZES } from '../constants';

// =============================================================================
// CARD CALLBACKS
// =============================================================================

export interface CardCallbacks {
    onClick: (game: MediaItem) => void;
    onContextMenu: (game: MediaItem, x: number, y: number) => void;
}

export interface CardDimensionOverrides {
    verticalMinWidth: number;
    verticalMinHeight: number;
    verticalImageRatio: number;
    horizontalMinWidth: number;
    horizontalHeight: number;
}

export interface AnimeProgressVisibility {
    showSeason: boolean;
    showEpisode: boolean;
}

// =============================================================================
// GAME CARD COMPONENT - Matching original exactly
// =============================================================================

export class GameCard {
    private container: HTMLElement;
    private game: MediaItem;
    private callbacks: CardCallbacks;
    private cardSize: CardSize;
    private orientation: CardOrientation;
    private sortField: SortField;
    private badges: LorebaseSettings['badges'];
    private overlayTextLayout: LorebaseSettings['overlayTextLayout'];
    private overlayTextVisibility: LorebaseSettings['overlayTextVisibility'];
    private descriptionLines: number;
    private dimensionOverrides: CardDimensionOverrides | null;
    private animeProgressVisibility: AnimeProgressVisibility;
    private statusLabels: Partial<Record<MediaStatus, string>>;
    private abortController: AbortController;

    // Cached SVG template elements for cloneNode
    private static svgTemplateCache = new Map<string, HTMLElement>();

    constructor(
        parent: HTMLElement,
        game: MediaItem,
        callbacks: CardCallbacks,
        cardSize: CardSize = 'medium',
        orientation: CardOrientation = 'vertical',
        sortField: SortField = 'name',
        badges: LorebaseSettings['badges'] = {
            status: { enabled: true, position: 'bottom-right', iconOnly: false, x: 70, y: 86 },
            rating: { enabled: true, position: 'bottom-right', mode: 'emoji', x: 88, y: 86 },
            favorite: { enabled: true, position: 'top-right', subtlePulse: false, x: 90, y: 10 },
        },
        overlayTextLayout: LorebaseSettings['overlayTextLayout'] = {
            title: { x: 0, y: 0 },
            year: { x: 0, y: 0 },
            format: { x: 0, y: 0 },
            description: { x: 0, y: 0 },
        },
        overlayTextVisibility: LorebaseSettings['overlayTextVisibility'] = {
            title: true,
            year: true,
            format: true,
            description: true,
        },
        descriptionLines: number = 4,
        dimensionOverrides: CardDimensionOverrides | null = null,
        animeProgressVisibility: AnimeProgressVisibility = { showSeason: true, showEpisode: true },
        statusLabels: Partial<Record<MediaStatus, string>> = {}
    ) {
        this.game = game;
        this.callbacks = callbacks;
        this.cardSize = cardSize;
        this.orientation = orientation;
        this.sortField = sortField;
        this.badges = badges;
        this.overlayTextLayout = overlayTextLayout;
        this.overlayTextVisibility = overlayTextVisibility;
        this.descriptionLines = this.normalizeDescriptionLines(descriptionLines);
        this.dimensionOverrides = dimensionOverrides;
        this.animeProgressVisibility = animeProgressVisibility;
        this.statusLabels = statusLabels;
        this.abortController = new AbortController();
        this.container = parent.createDiv({ cls: 'lorebase-card' });
        if (this.orientation === 'horizontal') {
            this.container.addClass('lorebase-card-horizontal');
        }
        this.render();
    }

    private render(): void {
        const isHorizontal = this.orientation === 'horizontal';
        this.container.toggleClass('is-adult', this.game.isAdult);
        this.container.toggleClass('is-anime', this.game.type === 'anime');
        this.container.toggleClass(
            'lorebase-card-favorite-pulse',
            this.badges.favorite.enabled && this.badges.favorite.subtlePulse && this.game.favorite
        );

        if (isHorizontal) {
            const sizes = HORIZONTAL_CARD_SIZES[this.cardSize];
            const horizontalMinWidth = this.dimensionOverrides?.horizontalMinWidth ?? 340;
            const horizontalHeight = this.dimensionOverrides?.horizontalHeight
                ?? this.parseCssPixels(sizes.height, 220);
            this.container.setCssStyles({
                width: sizes.width,
                height: `${horizontalHeight}px`,
                minHeight: `${horizontalHeight}px`,
                minWidth: `${horizontalMinWidth}px`,
            });
        } else {
            const sizes = CARD_SIZES[this.cardSize];
            const verticalMaxWidth = this.dimensionOverrides?.verticalMinWidth
                ?? this.parseCssPixels(sizes.maxWidth, 280);
            this.container.setCssStyles({
                width: '100%',
                maxWidth: `${verticalMaxWidth}px`,
                minWidth: '',
                minHeight: '0',
            });
        }

        const imageContainer = this.container.createDiv({ cls: 'lorebase-card-image' });
        if (!isHorizontal) {
            const sizes = CARD_SIZES[this.cardSize];
            const verticalMinHeight = this.dimensionOverrides?.verticalMinHeight
                ?? this.parseCssPixels(sizes.minHeight, 380);
            imageContainer.setCssStyles({ minHeight: `${verticalMinHeight}px` });
            // verticalImageRatio = width/height from user's custom setting.
            // For CSS aspect-ratio we need width/height; portrait = ratio < 1.
            const verticalImageRatio = this.dimensionOverrides?.verticalImageRatio;
            if (verticalImageRatio && Number.isFinite(verticalImageRatio) && verticalImageRatio > 0) {
                // Custom ratio: use as-is (user controls portrait/landscape)
                imageContainer.setCssStyles({ aspectRatio: `${verticalImageRatio}` });
            } else {
                // Default portrait ratio: 2/3 (standard game cover format, height = 1.5 x width).
                // This ensures cards look like portrait covers at any column count.
                imageContainer.setCssStyles({ aspectRatio: '2/3' });
            }
            imageContainer.setCssStyles({ height: '' });
        } else {
            imageContainer.setCssStyles({ height: '100%' });
        }

        const imageWrapper = imageContainer.createDiv({ cls: 'lorebase-card-image-wrapper' });

        const imgSrc = isHorizontal
            ? this.game.horizontalImageUrl
            : (this.game.imageUrl || DEFAULT_COVER);
        if (imgSrc) {
            const img = imageWrapper.createEl('img', {
                attr: {
                    src: imgSrc,
                    alt: this.game.displayName,
                    loading: 'lazy'
                }
            });

            img.addEventListener('error', () => {
                if (isHorizontal) {
                    img.remove();
                    return;
                }
                if (this.game.horizontalImageUrl && img.src !== this.game.horizontalImageUrl) {
                    img.src = this.game.horizontalImageUrl;
                    return;
                }
                if (img.src !== DEFAULT_COVER) {
                    img.src = DEFAULT_COVER;
                }
            });
        }

        this.renderOverlay(imageContainer);
        this.renderProgressBadge(imageContainer);
        this.renderBadges(imageContainer);

        const signal = this.abortController.signal;

        this.container.addEventListener('click', (e) => {
            e.preventDefault();
            this.callbacks.onClick(this.game);
        }, { signal });

        this.container.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.callbacks.onContextMenu(this.game, e.clientX, e.clientY);
        }, { signal });
    }

    private renderOverlay(parent: HTMLElement): void {
        const overlay = parent.createDiv({ cls: 'lorebase-card-overlay' });
        let titleEl: HTMLElement | null = null;
        let yearEl: HTMLElement | null = null;
        let formatEl: HTMLElement | null = null;
        let descriptionEl: HTMLElement | null = null;

        if (this.overlayTextVisibility.title) {
            titleEl = overlay.createDiv({ cls: 'lorebase-card-title' });
            titleEl.textContent = this.game.displayName;
            this.applyOverlayPosition(titleEl, 'title');
        }

        if (this.isAnime(this.game)) {
            if (this.overlayTextVisibility.year) {
                yearEl = overlay.createDiv({ cls: 'lorebase-card-year' });
                yearEl.textContent = this.game.year ? String(this.game.year) : t('yearNotSpecified');
                this.applyOverlayPosition(yearEl, 'year');
            }

            if (this.overlayTextVisibility.format) {
                formatEl = overlay.createDiv({ cls: 'lorebase-card-year lorebase-card-format' });
                formatEl.textContent = this.getAnimeFormatLabel(this.game.format);
                this.applyOverlayPosition(formatEl, 'format');
            }

            if (this.overlayTextVisibility.description) {
                descriptionEl = overlay.createDiv({ cls: 'lorebase-card-description' });
                descriptionEl.textContent = this.game.summary || this.game.description || t('noDescription');
                this.applyOverlayPosition(descriptionEl, 'description');
                this.applyDescriptionClamp(descriptionEl);
            }
        } else {
            if (this.overlayTextVisibility.year) {
                yearEl = overlay.createDiv({ cls: 'lorebase-card-year' });
                yearEl.textContent = this.game.year ? String(this.game.year) : t('yearNotSpecified');
                this.applyOverlayPosition(yearEl, 'year');
            }

            if (this.overlayTextVisibility.description) {
                descriptionEl = overlay.createDiv({ cls: 'lorebase-card-description' });
                descriptionEl.textContent = this.game.description || t('noDescription');
                this.applyOverlayPosition(descriptionEl, 'description');
                this.applyDescriptionClamp(descriptionEl);
            }
        }

        this.applyTitleFlowOffset(overlay, titleEl, yearEl, formatEl, descriptionEl);
    }

    private renderProgressBadge(parent: HTMLElement): void {
        if (!this.isAnime(this.game)) return;
        if (!this.animeProgressVisibility.showSeason && !this.animeProgressVisibility.showEpisode) return;
        const progress = this.getAnimeProgressTexts(this.game);
        if (!progress) return;

        const badge = parent.createDiv({ cls: 'lorebase-card-metacritic' });
        if (this.animeProgressVisibility.showSeason && progress.season) {
            const season = badge.createSpan({ cls: 'lorebase-card-progress-season', text: progress.season });
            const hasEpisodeBadge = this.animeProgressVisibility.showEpisode && Boolean(progress.ep);
            if (hasEpisodeBadge) {
                season.addClass('is-hover-only');
            } else {
                season.addClass('is-only');
            }
        }
        if (this.animeProgressVisibility.showEpisode && progress.ep) {
            badge.createSpan({ cls: 'lorebase-card-progress-ep', text: progress.ep });
        }
    }

    private renderBadges(parent: HTMLElement): void {
        const groups = new Map<BadgePosition, HTMLElement>();
        const getGroup = (position: BadgePosition): HTMLElement => {
            const existing = groups.get(position);
            if (existing) return existing;
            const group = parent.createDiv({ cls: 'lorebase-card-badge-group' });
            group.addClass(`is-${position}`);
            if (position.startsWith('top')) {
                group.addClass('is-top-badge');
            }
            groups.set(position, group);
            return group;
        };

        if (this.badges.status.enabled) {
            this.renderStatusBadge(getGroup(this.badges.status.position));
        }

        if (this.badges.rating.enabled && this.game.userRating) {
            this.renderRatingBadge(getGroup(this.badges.rating.position));
        }

        if (this.badges.favorite.enabled && this.game.favorite && !this.badges.favorite.subtlePulse) {
            this.renderFavoriteBadge(getGroup(this.badges.favorite.position));
        }
    }

    private renderStatusBadge(parent: HTMLElement): void {
        const config = STATUS_CONFIG[this.game.status];
        const statusLabels: Record<string, string> = {
            completed: this.isAnime(this.game) ? t('statusCompleted') : t('statusPlayed'),
            playing: t('statusPlaying'),
            dropped: t('statusDropped'),
            sandbox: t('statusSandbox'),
            not_started: t('statusNotStarted'),
            planned: t('statusPlanned'),
            watching: t('statusWatching'),
            paused: t('statusPaused'),
        };

        let statusText = this.statusLabels[this.game.status]?.trim() || statusLabels[this.game.status] || String(this.game.status);
        if (!this.badges.status.iconOnly && this.shouldShowCompletionDate()) {
            const game = this.game as GameItem;
            const formatted = this.formatCompletionDate(game.dateCompleted);
            if (formatted) {
                statusText = `${statusText} | ${formatted}`;
            }
        }

        const statusBadge = parent.createDiv({
            cls: `lorebase-card-status lorebase-status-${this.game.status}`
        });

        if (this.badges.status.iconOnly) {
            statusBadge.addClass('is-icon-only');
            statusBadge.appendChild(this.createSvgIcon(config.pathD));
            return;
        }

        statusBadge.appendChild(this.createSvgIcon(config.pathD));
        statusBadge.createSpan({ text: statusText });
    }

    private renderRatingBadge(parent: HTMLElement): void {
        if (!this.game.userRating) return;

        const ratingBadge = parent.createDiv({ cls: 'lorebase-card-rating' });
        const starText = `\u2605${this.game.userRating}`;
        const emojiText = RATING_EMOJI[this.game.userRating] ?? '';
        const mode = this.badges.rating.mode;

        if (mode === 'emoji') {
            ratingBadge.addClass('is-emoji');
            ratingBadge.textContent = emojiText;
            return;
        }
        ratingBadge.textContent = starText;
    }

    private static favoriteTemplate: SVGElement | null = null;

    private renderFavoriteBadge(parent: HTMLElement): void {
        const favoriteBadge = parent.createDiv({ cls: 'lorebase-card-favorite-badge' });
        if (this.badges.favorite.subtlePulse) {
            favoriteBadge.addClass('is-subtle-pulse');
        }
        if (!GameCard.favoriteTemplate) {
            GameCard.favoriteTemplate = this.createFavoriteSvgTemplate();
        }
        favoriteBadge.appendChild(GameCard.favoriteTemplate.cloneNode(true));
    }

    private createFavoriteSvgTemplate(): SVGElement {
        const ownerDocument = this.container.ownerDocument;
        const svg = ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', '#ffffff');
        svg.setAttribute('stroke', 'none');
        svg.setAttribute('width', '12');
        svg.setAttribute('height', '12');
        const path = ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z');
        svg.appendChild(path);
        return svg;
    }

    private applyOverlayPosition(
        element: HTMLElement,
        field: 'title' | 'year' | 'format' | 'description'
    ): void {
        const point = this.getVisualOverlayPoint(field);
        element.style.setProperty('--overlay-x', `${point.x}%`);
        element.style.setProperty('--overlay-y', `${point.y}%`);
        if (field === 'description') {
            element.style.setProperty('--overlay-max-width', `${Math.max(30, 92 - point.x)}%`);
        } else {
            element.style.removeProperty('--overlay-max-width');
        }
    }

    private getVisualOverlayPoint(field: 'title' | 'year' | 'format' | 'description'): { x: number; y: number } {
        const point = this.getOverlayPoint(field);
        if (field !== 'description' || !this.overlayTextVisibility.title) return point;

        const titlePoint = this.getOverlayPoint('title');
        if (point.x >= titlePoint.x) return point;
        return this.clampOverlayPoint(field, titlePoint.x, point.y);
    }

    private applyTitleFlowOffset(
        _overlay: HTMLElement,
        _titleEl: HTMLElement | null,
        _yearEl: HTMLElement | null,
        _formatEl: HTMLElement | null,
        _descriptionEl: HTMLElement | null
    ): void {
        // Removed: previously called getComputedStyle + getBoundingClientRect per card,
        // causing forced reflow/layout thrashing. The overlay uses CSS-based layout;
        // multi-line titles can be handled via CSS gap/flex instead of JS measurements.
        // This is intentionally a no-op — the visual shift was minor and the perf cost
        // was the #1 bottleneck in the entire plugin.
    }

    private getOverlayPoint(field: 'title' | 'year' | 'format' | 'description'): { x: number; y: number } {
        const defaults = this.isAnime(this.game)
            ? DEFAULT_SETTINGS.animeOverlayTextLayout
            : DEFAULT_SETTINGS.overlayTextLayout;
        const fallback = defaults[field];
        const raw = this.overlayTextLayout[field];
        const x = this.normalizeOverlayPercent(raw?.x, fallback.x);
        const y = this.normalizeOverlayPercent(raw?.y, fallback.y);
        return this.clampOverlayPoint(field, x, y);
    }

    private normalizeOverlayPercent(value: number, fallback: number): number {
        if (!Number.isFinite(value)) return fallback;
        const rounded = Math.round(value * 10) / 10;
        if (rounded < -20 || rounded > 120) return fallback;
        return rounded;
    }

    private clampOverlayPoint(
        field: 'title' | 'year' | 'format' | 'description',
        x: number,
        y: number
    ): { x: number; y: number } {
        const maxX = field === 'description' ? 66 : 84;
        return {
            x: Math.max(2, Math.min(maxX, x)),
            y: Math.max(2, Math.min(92, y)),
        };
    }

    private applyDescriptionClamp(element: HTMLElement): void {
        element.setCssStyles({
            display: '-webkit-box',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            webkitBoxOrient: 'vertical',
        });
        element.style.setProperty('-webkit-line-clamp', String(this.descriptionLines));
        element.style.setProperty('line-clamp', String(this.descriptionLines));
    }

    private normalizeDescriptionLines(value: number): number {
        if (!Number.isFinite(value)) return 4;
        return Math.max(1, Math.min(70, Math.round(value)));
    }

    private parseCssPixels(value: string, fallback: number): number {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
        return parsed;
    }

    private getAnimeProgressTexts(anime: AnimeItem): { ep: string | null; season: string | null } | null {
        const activePart = anime.parts?.find((part) => part.id === anime.activePartId) ?? anime.parts?.[0] ?? null;
        const kind = activePart?.kind ?? anime.format;
        const season = Number.isFinite(activePart?.seasonNumber ?? anime.seasonCurrent)
            ? Math.trunc((activePart?.seasonNumber ?? anime.seasonCurrent) as number)
            : null;
        const seasonTotal = Number.isFinite(anime.seasonTotal) ? Math.trunc(anime.seasonTotal as number) : null;
        const epCurrent = Number.isFinite(activePart?.episodeCurrent ?? anime.episodeCurrent)
            ? Math.trunc((activePart?.episodeCurrent ?? anime.episodeCurrent) as number)
            : null;
        const epTotal = Number.isFinite(activePart?.episodeTotal ?? anime.episodeTotal)
            ? Math.trunc((activePart?.episodeTotal ?? anime.episodeTotal) as number)
            : null;

        if (season === null && seasonTotal === null && epCurrent === null && epTotal === null) {
            return null;
        }

        let seasonText: string | null = null;
        if (kind === 'tv' && (season !== null || seasonTotal !== null)) {
            if (season !== null && seasonTotal !== null) {
                seasonText = `S ${season}/${seasonTotal}`;
            } else if (season !== null) {
                seasonText = `S ${season}`;
            } else {
                seasonText = `S ?/${seasonTotal}`;
            }
        }

        let epText: string | null = null;
        if (epCurrent !== null || epTotal !== null) {
            const currentText = epCurrent !== null ? String(epCurrent) : '?';
            const totalText = epTotal !== null ? String(epTotal) : '?';
            epText = kind === 'tv'
                ? `EP ${currentText}/${totalText}`
                : `${this.getAnimeFormatLabel(kind)} ${currentText}/${totalText}`;
        } else if (kind !== 'tv') {
            seasonText = this.getAnimeFormatLabel(kind);
        }

        if (!epText && !seasonText) return null;
        return { ep: epText, season: seasonText };
    }

    private isAnime(item: MediaItem): item is AnimeItem {
        return item.type === 'anime';
    }

    private getAnimeFormatLabel(format: AnimeItem['format']): string {
        const map: Record<AnimeItem['format'], string> = {
            tv: t('formatTv'),
            movie: t('formatMovie'),
            ova: t('formatOva'),
            ona: t('formatOna'),
            special: t('formatSpecial'),
        };
        return map[format] ?? t('formatTv');
    }

    private shouldShowCompletionDate(): boolean {
        const game = this.game;
        if (game.type !== 'game') return false;
        return this.sortField === 'dateCompleted'
            && game.status === 'completed'
            && Number.isFinite(game.dateCompleted || 0)
            && (game.dateCompleted || 0) > 0;
    }

    private formatCompletionDate(timestamp: number | null): string | null {
        if (!timestamp || !Number.isFinite(timestamp)) return null;
        const locale = i18n.getLanguage() === 'ru' ? 'ru-RU' : 'en-US';
        try {
            return new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric' }).format(new Date(timestamp));
        } catch {
            return new Date(timestamp).toLocaleDateString(locale, { month: 'short', year: 'numeric' });
        }
    }

    getElement(): HTMLElement {
        return this.container;
    }

    destroy(): void {
        this.abortController.abort();
        if (this.container && this.container.parentElement) {
            this.container.remove();
        }
    }

    /**
     * Create an SVG icon element using cached templates for performance.
     * Uses cloneNode to avoid repeated SVG construction.
     */
    private createSvgIcon(pathD: string): SVGElement {
        let template = GameCard.svgTemplateCache.get(pathD);
        if (!template) {
            const ownerDocument = this.container.ownerDocument;
            const wrapper = ownerDocument.createElement('div');
            const svg = ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', '0 0 24 24');
            svg.setAttribute('fill', 'none');
            svg.setAttribute('stroke', 'currentColor');
            svg.setAttribute('stroke-width', '2');
            svg.setAttribute('stroke-linecap', 'round');
            svg.setAttribute('stroke-linejoin', 'round');
            const path = ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', pathD);
            svg.appendChild(path);
            wrapper.appendChild(svg);
            template = wrapper;
            GameCard.svgTemplateCache.set(pathD, template);
        }
        return template.firstElementChild!.cloneNode(true) as SVGElement;
    }
}
