import { requestUrl } from 'obsidian';

/**
 * LOREBASE - Game Card Component
 * Matches original 2.0.txt card structure exactly
 */

import { AnimeItem, BookItem, GameItem, MediaItem, CardSize, CardOrientation, CardStyle, SortField, LorebaseSettings, BadgePosition, MediaStatus, MangaItem, SeriesItem } from '../types';
import { t, i18n } from '../localization';
import { STATUS_CONFIG, RATING_EMOJI, CARD_SIZES, DEFAULT_COVER, DEFAULT_SETTINGS, HORIZONTAL_CARD_SIZES } from '../constants';
import {
    getSteamAppIdFromImageUrl,
    getSteamHorizontalImageCandidates,
    getSteamVerticalImageCandidates
} from '../services/integrations/steamImages';

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
    private cardStyle: CardStyle;
    private sortField: SortField;
    private badges: LorebaseSettings['badges'];
    private overlayTextLayout: LorebaseSettings['overlayTextLayout'];
    private overlayTextVisibility: LorebaseSettings['overlayTextVisibility'];
    private descriptionLines: number;
    private dimensionOverrides: CardDimensionOverrides | null;
    private animeProgressVisibility: AnimeProgressVisibility;
    private statusLabels: Partial<Record<MediaStatus, string>>;
    private abortController: AbortController;
    private objectUrls: string[] = [];

    // Cached SVG template elements for cloneNode
    private static svgTemplateCache = new Map<string, HTMLElement>();

    constructor(
        parent: HTMLElement,
        game: MediaItem,
        callbacks: CardCallbacks,
        cardSize: CardSize = 'medium',
        orientation: CardOrientation = 'vertical',
        cardStyle: CardStyle = 'hover',
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
        this.cardStyle = cardStyle;
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
        const isProgressStyle = this.isProgressStyle();
        this.container.toggleClass('is-adult', this.game.isAdult);
        this.container.toggleClass('is-anime', this.game.type === 'anime');
        this.container.toggleClass('is-series', this.game.type === 'series');
        this.container.toggleClass('is-book', this.game.type === 'book');
        this.container.toggleClass('is-manga', this.game.type === 'manga');
        this.container.toggleClass('lorebase-card-progress-style', isProgressStyle);
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
            const imageCandidates = this.getImageCandidates(imgSrc, isHorizontal);
            let imageCandidateIndex = 0;
            const img = imageWrapper.createEl('img', {
                attr: {
                    src: '',
                    alt: this.game.displayName,
                    loading: 'lazy'
                }
            });

            const loadCandidate = (): void => {
                const next = imageCandidates[imageCandidateIndex];
                if (!next) {
                    if (isHorizontal) {
                        img.remove();
                        return;
                    }
                    if (img.src !== DEFAULT_COVER) img.src = DEFAULT_COVER;
                    return;
                }

                if (this.isMangaDexImage(next)) {
                    void this.setMangaDexImageSource(img, next, () => {
                        imageCandidateIndex++;
                        loadCandidate();
                    });
                    return;
                }

                img.src = next;
            };

            img.addEventListener('error', () => {
                imageCandidateIndex++;
                loadCandidate();
            });
            loadCandidate();
        }

        if (!isProgressStyle) {
            this.renderOverlay(imageContainer);
            this.renderProgressBadge(imageContainer);
        }
        this.renderBadges(imageContainer);
        if (isProgressStyle) {
            this.renderProgressFooter();
        }

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

    private getImageCandidates(primary: string, isHorizontal: boolean): string[] {
        const appId = getSteamAppIdFromImageUrl(primary)
            || getSteamAppIdFromImageUrl(this.game.imageUrl || '')
            || getSteamAppIdFromImageUrl(this.game.horizontalImageUrl || '');

        if (appId) {
            const candidates = isHorizontal
                ? getSteamHorizontalImageCandidates(appId, primary)
                : getSteamVerticalImageCandidates(appId, primary);
            return Array.from(new Set([primary, ...candidates].filter(Boolean)));
        }

        const mangaDexCandidates = this.getMangaDexImageCandidates(primary);
        if (mangaDexCandidates.length) {
            return mangaDexCandidates;
        }

        return [primary].filter(Boolean);
    }

    private getMangaDexImageCandidates(primary: string): string[] {
        if (!this.isMangaDexImage(primary)) return [];
        const base = primary
            .replace(/\.512\.jpg$/i, '')
            .replace(/\.256\.jpg$/i, '');
        return Array.from(new Set([
            primary,
            `${base}.512.jpg`,
            `${base}.256.jpg`,
            base,
        ].filter(Boolean)));
    }

    private async setMangaDexImageSource(img: HTMLImageElement, url: string, onError: () => void): Promise<void> {
        try {
            const response = await requestUrl({ url, method: 'GET' });
            const type = response.headers?.['content-type'] || 'image/jpeg';
            const objectUrl = URL.createObjectURL(new Blob([response.arrayBuffer], { type }));
            this.objectUrls.push(objectUrl);
            img.src = objectUrl;
        } catch {
            onError();
        }
    }

    private isMangaDexImage(url: string): boolean {
        return url.includes('uploads.mangadex.org/covers/');
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
        if (!this.isProgressMedia(this.game)) return;
        if (!this.animeProgressVisibility.showSeason && !this.animeProgressVisibility.showEpisode) return;
        const progress = this.getProgressTexts(this.game);
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

    private renderProgressFooter(): void {
        if (!this.isProgressMedia(this.game)) return;
        const footer = this.container.createDiv({ cls: 'lorebase-card-progress-footer' });

        const progress = this.getProgressTexts(this.game);
        const metaParts = [progress?.season, progress?.ep].filter((value): value is string => Boolean(value));

        const header = footer.createDiv({ cls: 'lorebase-card-progress-header' });
        header.createDiv({ cls: 'lorebase-card-progress-title', text: this.game.displayName });
        if (metaParts.length) {
            header.createSpan({ cls: 'lorebase-card-progress-meta', text: metaParts.join(' \u00B7  ') });
        }

        const row = footer.createDiv({ cls: 'lorebase-card-progress-row' });
        const track = row.createDiv({ cls: 'lorebase-card-progress-track' });
        const fill = track.createDiv({ cls: 'lorebase-card-progress-fill' });
        fill.setCssStyles({ width: `${this.getProgressPercent(this.game)}%` });
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
        const isReadingMedia = this.game.type === 'book' || this.game.type === 'manga';
        const statusLabels: Record<string, string> = {
            completed: this.game.type === 'game' ? t('statusPlayed') : t('statusCompleted'),
            playing: t('statusPlaying'),
            dropped: t('statusDropped'),
            sandbox: t('statusSandbox'),
            wishlist: t('statusWishlist'),
            not_started: t('statusNotStarted'),
            planned: isReadingMedia ? t('statusPlanToRead') : t('statusPlanned'),
            watching: isReadingMedia ? t('statusReading') : t('statusWatching'),
            paused: t('statusPaused'),
        };

        const overrideStatusText = this.statusLabels[this.game.status]?.trim();
        const isLegacyGameCompletedLabel = this.game.type !== 'game'
            && this.game.status === 'completed'
            && overrideStatusText === t('statusPlayed')
            && t('statusPlayed') !== t('statusCompleted');
        let statusText = !isLegacyGameCompletedLabel && overrideStatusText
            ? overrideStatusText
            : statusLabels[this.game.status] || String(this.game.status);
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
        const svg = createSvg('svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', '#ffffff');
        svg.setAttribute('stroke', 'none');
        svg.setAttribute('width', '12');
        svg.setAttribute('height', '12');
        const path = svg.createSvg('path');
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

    private isProgressStyle(): boolean {
        return this.cardStyle === 'progress'
            && this.orientation === 'vertical'
            && this.isProgressMedia(this.game);
    }

    private getProgressPercent(item: AnimeItem | SeriesItem | BookItem | MangaItem): number {
        if (this.isBook(item)) {
            const pagePercent = this.progressPercent(item.pageCurrent, item.pageTotal);
            if (pagePercent > 0) return pagePercent;
            return this.progressPercent(item.chapterCurrent, item.chapterTotal);
        }
        if (this.isManga(item)) {
            const activePart = item.parts?.find((part) => part.id === item.activePartId) ?? item.parts?.[0] ?? null;
            return this.progressPercent(
                activePart?.chapterCurrent ?? item.chapterCurrent,
                activePart?.chapterTotal ?? item.chapterTotal
            );
        }
        const activePart = item.parts?.find((part) => part.id === item.activePartId) ?? item.parts?.[0] ?? null;
        const current = this.isAnime(item)
            ? activePart?.episodeCurrent ?? item.episodeCurrent
            : activePart?.episodeCurrent ?? item.episodeCurrent;
        const total = this.isAnime(item)
            ? activePart?.episodeTotal ?? item.episodeTotal
            : activePart?.episodeTotal ?? item.episodeTotal;
        return this.progressPercent(current, total);
    }

    private progressPercent(current: number | null | undefined, total: number | null | undefined): number {
        const normalizedCurrent = Number.isFinite(current) ? Math.max(0, Math.trunc(current as number)) : 0;
        const normalizedTotal = Number.isFinite(total) ? Math.max(0, Math.trunc(total as number)) : 0;
        if (normalizedTotal <= 0) return 0;
        return Math.max(0, Math.min(100, Math.round((normalizedCurrent / normalizedTotal) * 1000) / 10));
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

    private getProgressTexts(item: AnimeItem | SeriesItem | BookItem | MangaItem): { ep: string | null; season: string | null } | null {
        if (this.isAnime(item)) return this.getAnimeProgressTexts(item);
        if (this.isBook(item)) {
            const pageCurrent = Number.isFinite(item.pageCurrent) ? Math.trunc(item.pageCurrent as number) : null;
            const pageTotal = Number.isFinite(item.pageTotal) ? Math.trunc(item.pageTotal as number) : null;
            const chapterCurrent = Number.isFinite(item.chapterCurrent) ? Math.trunc(item.chapterCurrent as number) : null;
            const chapterTotal = Number.isFinite(item.chapterTotal) ? Math.trunc(item.chapterTotal as number) : null;
            const pageText = pageCurrent !== null || pageTotal !== null
                ? `Pg ${pageCurrent !== null ? pageCurrent : '?'}/${pageTotal !== null ? pageTotal : '?'}`
                : null;
            const chapterText = chapterCurrent !== null || chapterTotal !== null
                ? `Ch. ${chapterCurrent !== null ? chapterCurrent : '?'}/${chapterTotal !== null ? chapterTotal : '?'}`
                : null;
            if (!pageText && !chapterText) return null;
            return {
                season: pageText,
                ep: chapterText,
            };
        }
        if (this.isManga(item)) {
            const activePart = item.parts?.find((part) => part.id === item.activePartId) ?? item.parts?.[0] ?? null;
            const chapterCurrent = Number.isFinite(activePart?.chapterCurrent ?? item.chapterCurrent)
                ? Math.trunc((activePart?.chapterCurrent ?? item.chapterCurrent) as number)
                : null;
            const chapterTotal = Number.isFinite(activePart?.chapterTotal ?? item.chapterTotal)
                ? Math.trunc((activePart?.chapterTotal ?? item.chapterTotal) as number)
                : null;
            const volumeCurrent = Number.isFinite(activePart?.volumeNumber ?? item.volumeCurrent)
                ? Math.trunc((activePart?.volumeNumber ?? item.volumeCurrent) as number)
                : null;
            const volumeTotal = Number.isFinite(item.volumeTotal) ? Math.trunc(item.volumeTotal as number) : null;
            if (chapterCurrent === null && chapterTotal === null && volumeCurrent === null && volumeTotal === null) return null;
            return {
                season: volumeCurrent !== null || volumeTotal !== null
                    ? `Vol. ${volumeCurrent !== null ? volumeCurrent : '?'}/${volumeTotal !== null ? volumeTotal : '?'}`
                    : null,
                ep: chapterCurrent !== null || chapterTotal !== null
                    ? `Ch. ${chapterCurrent !== null ? chapterCurrent : '?'}/${chapterTotal !== null ? chapterTotal : '?'}`
                    : null,
            };
        }

        const activePart = item.parts?.find((part) => part.id === item.activePartId) ?? item.parts?.[0] ?? null;
        const season = Number.isFinite(activePart?.seasonNumber)
            ? Math.trunc(activePart?.seasonNumber as number)
            : null;
        const seasonTotal = Number.isFinite(item.seasons) ? Math.trunc(item.seasons as number) : null;
        const epCurrent = Number.isFinite(activePart?.episodeCurrent ?? item.episodeCurrent)
            ? Math.trunc((activePart?.episodeCurrent ?? item.episodeCurrent) as number)
            : null;
        const epTotal = Number.isFinite(activePart?.episodeTotal ?? item.episodeTotal)
            ? Math.trunc((activePart?.episodeTotal ?? item.episodeTotal) as number)
            : null;

        if (season === null && seasonTotal === null && epCurrent === null && epTotal === null) return null;

        let seasonText: string | null = null;
        if (season !== null && seasonTotal !== null) {
            seasonText = `S ${season}/${seasonTotal}`;
        } else if (season !== null) {
            seasonText = `S ${season}`;
        } else if (seasonTotal !== null) {
            seasonText = `S ?/${seasonTotal}`;
        }
        const epText = epCurrent !== null || epTotal !== null
            ? `EP ${epCurrent !== null ? epCurrent : '?'}/${epTotal !== null ? epTotal : '?'}`
            : null;
        return { ep: epText, season: seasonText };
    }

    private isAnime(item: MediaItem): item is AnimeItem {
        return item.type === 'anime';
    }

    private isSeries(item: MediaItem): item is SeriesItem {
        return item.type === 'series';
    }

    private isBook(item: MediaItem): item is BookItem {
        return item.type === 'book';
    }

    private isManga(item: MediaItem): item is MangaItem {
        return item.type === 'manga';
    }

    private isProgressMedia(item: MediaItem): item is AnimeItem | SeriesItem | BookItem | MangaItem {
        return this.isAnime(item) || this.isSeries(item) || this.isBook(item) || this.isManga(item);
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
        for (const url of this.objectUrls) URL.revokeObjectURL(url);
        this.objectUrls = [];
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
            const wrapper = createDiv();
            const svg = createSvg('svg');
            svg.setAttribute('viewBox', '0 0 24 24');
            svg.setAttribute('fill', 'none');
            svg.setAttribute('stroke', 'currentColor');
            svg.setAttribute('stroke-width', '2');
            svg.setAttribute('stroke-linecap', 'round');
            svg.setAttribute('stroke-linejoin', 'round');
            const path = svg.createSvg('path');
            path.setAttribute('d', pathD);
            svg.appendChild(path);
            wrapper.appendChild(svg);
            template = wrapper;
            GameCard.svgTemplateCache.set(pathD, template);
        }
        return template.firstElementChild!.cloneNode(true) as SVGElement;
    }
}
