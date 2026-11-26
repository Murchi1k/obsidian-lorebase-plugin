import { renderDiscoveryMark } from './DiscoveryContext';

import { withReleaseCountdown } from '../utils/releaseCountdown';
import { normalizePersonalDate, UNKNOWN_DATE } from '../utils/personalDates';
import { personalDateText } from '../localization/personalDates';
import { attachDelayedTitleExpansion } from '../utils/delayedTitleExpansion';
import { mt } from '../localization/music';
import { getStatusAppearance } from '../statusPresentation';
import { setIcon } from 'obsidian';
import { loadMangaDexPoster } from './MangaDexPoster';

/**
 * LOREBASE - Game Card Component
 * Matches original 2.0.txt card structure exactly
 */

import { AnimeItem, BookItem, MediaItem, CardSize, CardOrientation, CardStyle, SortField, LorebaseSettings, BadgePosition, MediaStatus, MangaItem, SeriesItem, CompletionDateBadgeFormat } from '../types';
import { t, i18n } from '../localization';
import { CARD_SIZES, DEFAULT_COVER, DEFAULT_SETTINGS, HORIZONTAL_CARD_SIZES } from '../constants';
import {
    getSteamAppIdFromImageUrl,
    getSteamHorizontalImageCandidates,
    getSteamVerticalImageCandidates
} from '../services/integrations/steamImages';
import { CLASSIC_RATING_SETTINGS, formatCommunityRatingValue } from '../utils/rating';
import { renderCommunityRatingBadgeContent, renderRatingBadgeContent } from './RatingBadgeContent';
import { getMediaWorkTypeColor, getMediaWorkTypeLabel } from '../utils/mediaWorkType';
import { getBookCoverColor } from '../utils/bookCoverColor';
import { cancelPosterLoad, setPosterLoadPriority, setSmoothPoster } from './SmoothPoster';
import { getTitleSearchMatch } from '../services/media/titleSearch';
import { librarySearchCopy } from '../services/media/searchSuggestions';
import { getCardProfile } from '../services/media/cardProfiles';

// =============================================================================
// CARD CALLBACKS
// =============================================================================

export interface CardCallbacks {
    onClick: (game: MediaItem) => void;
    onContextMenu: (game: MediaItem, x: number, y: number) => void;
    onPartClick?: (game: MediaItem, partId: string) => void;
}

export interface CardDimensionOverrides {
    verticalMinWidth: number;
    verticalMinHeight: number;
    verticalImageRatio: number;
    horizontalMinWidth: number;
    horizontalHeight: number;
    horizontalImageRatio?: number;
}

type OverlayLayout = {
    title: HTMLElement | null;
    year: HTMLElement | null;
    format: HTMLElement | null;
    description: HTMLElement | null;
    lines: number;
    editable: boolean;
};

export interface AnimeProgressVisibility {
    showSeason: boolean;
    showEpisode: boolean;
}

type ImageUrlResolver = (value: string) => string | null;

// =============================================================================
// GAME CARD COMPONENT - Matching original exactly
// =============================================================================

export class GameCard {
    private static instances = new WeakMap<HTMLElement, GameCard>();
    private static loadedPartPosters = new Map<string, string>();
    private static overlayLayoutQueue = new Map<HTMLElement, OverlayLayout>();
    private static overlayLayoutFrame: number | null = null;
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
    private completionDateBadgeFormat: CompletionDateBadgeFormat;
    private ratingSettings: LorebaseSettings['ratingScale'];
    private resolveImageUrl: ImageUrlResolver | null;
    private abortController: AbortController;
    private objectUrls: string[] = [];
    private bookExpanded = false;
    private loadBookCover: (() => void) | null = null;
    private previousPoster: HTMLImageElement | null = null;
    private imageLoadingPriority: boolean | null = null;


    constructor(
        parent: HTMLElement,
        game: MediaItem,
        callbacks: CardCallbacks,
        cardSize: CardSize = 'medium',
        orientation: CardOrientation = 'vertical',
        cardStyle: CardStyle = 'hover',
        sortField: SortField = 'name',
        badges: LorebaseSettings['badges'] = {
            status: { enabled: true, position: 'bottom-right', iconOnly: false, showReleaseCountdown: true, x: 70, y: 86 },
            rating: { enabled: true, position: 'bottom-right', mode: 'emoji', x: 88, y: 86 },
            favorite: { enabled: true, position: 'top-right', subtlePulse: false, x: 90, y: 10 },
            workType: { enabled: true, position: 'top-right', x: 70, y: 10 },
            communityRating: { enabled: false, position: 'top-left', x: 8, y: 10, icon: 'star' },
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
        descriptionLines: number = 6,
        dimensionOverrides: CardDimensionOverrides | null = null,
        animeProgressVisibility: AnimeProgressVisibility = { showSeason: true, showEpisode: true },
        statusLabels: Partial<Record<MediaStatus, string>> = {},
        completionDateBadgeFormat: CompletionDateBadgeFormat = 'short',
        ratingSettings: LorebaseSettings['ratingScale'] = CLASSIC_RATING_SETTINGS,
        resolveImageUrl: ImageUrlResolver | null = null,
        private readonly bookshelf = false,
        private readonly searchQuery = '',
        private readonly editablePreview = false,
        private readonly groupedByCompletionDate = false,
        private readonly scrollDescription = false,
        private readonly showDiscoveryBadge = true,
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
        this.completionDateBadgeFormat = completionDateBadgeFormat;
        this.ratingSettings = ratingSettings;
        this.resolveImageUrl = resolveImageUrl;
        this.abortController = new AbortController();
        this.container = parent.createDiv({ cls: 'lorebase-card' });
        GameCard.instances.set(this.container, this);
        if (this.orientation === 'horizontal') {
            this.container.addClass('lorebase-card-horizontal');
        }
        this.render();
    }

    private render(): void {
        this.renderContent();
        renderDiscoveryMark(this.container, this.game, this.showDiscoveryBadge);
    }

    private renderContent(): void {
        if (this.game.type === 'music') { this.renderMusic(); return; }
        if (this.bookshelf && this.game.type === 'book') {
            this.renderBookSpine();
            return;
        }
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
                height: this.dimensionOverrides?.horizontalImageRatio ? 'auto' : `${horizontalHeight}px`,
                minHeight: this.dimensionOverrides?.horizontalImageRatio ? '0' : `${horizontalHeight}px`,
                minWidth: this.dimensionOverrides?.horizontalImageRatio ? '0' : `${horizontalMinWidth}px`,
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
            const ownerWindow = this.container.ownerDocument.defaultView;
            const isPhoneLayout = ownerWindow?.matchMedia('(max-width: 520px)').matches ?? false;
            const verticalMinHeight = isPhoneLayout
                ? 0
                : this.dimensionOverrides?.verticalMinHeight
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
            const ratio = this.dimensionOverrides?.horizontalImageRatio;
            imageContainer.setCssStyles(ratio
                ? { height: 'auto', aspectRatio: String(ratio), flex: '0 0 auto' }
                : { height: '100%' });
        }

        const imageWrapper = imageContainer.createDiv({ cls: 'lorebase-card-image-wrapper' });

        const imageCandidates = this.getCardImageCandidates(isHorizontal);
        if (imageCandidates.length) {
            const tracksParts = this.game.type === 'anime' || this.game.type === 'series';
            const posterKey = `${this.game.type}:${this.game.filePath}`;
            let imageCandidateIndex = 0;
            const img = this.previousPoster ?? imageWrapper.createEl('img', {
                attr: {
                    src: tracksParts ? GameCard.loadedPartPosters.get(posterKey) || '' : '',
                    alt: this.game.displayName,
                    loading: 'eager',
                    decoding: 'async',
                    fetchpriority: 'auto',
                }
            });
            if (this.previousPoster) {
                imageWrapper.appendChild(img);
                this.previousPoster = null;
                img.alt = this.game.displayName;
            }

            if (!imageCandidates.some(candidate => this.isMangaDexImage(candidate))) {
                setSmoothPoster(img, imageCandidates.map(candidate => this.resolveImageCandidate(candidate)), source => {
                    if (!tracksParts || source === DEFAULT_COVER) return;
                    GameCard.loadedPartPosters.delete(posterKey);
                    GameCard.loadedPartPosters.set(posterKey, source);
                    if (GameCard.loadedPartPosters.size > 128) GameCard.loadedPartPosters.delete(GameCard.loadedPartPosters.keys().next().value!);
                });
            } else {
                if (!img.getAttribute('src')) img.src = DEFAULT_COVER;
                const loadCandidate = (): void => {
                    const next = imageCandidates[imageCandidateIndex];
                    if (!next) {
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

                    img.src = this.resolveImageCandidate(next);
                };

                img.addEventListener('error', () => {
                    imageCandidateIndex++;
                    loadCandidate();
                }, { signal: this.abortController.signal });
                loadCandidate();
            }
        }

        if (!isProgressStyle) {
            this.renderOverlay(imageContainer);
            this.renderProgressBadge(imageContainer);
        }
        this.renderBadges(imageContainer);
        if (isProgressStyle) {
            this.renderProgressFooter();
        }
        this.renderSearchMatch();

        const signal = this.abortController.signal;

        if (!isProgressStyle && !this.editablePreview) {
            // Hidden hover text does not need measurement during scrolling.
            const refit = (): void => {
                if (!this.container.closest('.lorebase-view.is-scrolling')) GameCard.refitOverlay(this.container);
            };
            this.container.addEventListener('pointerenter', refit, { signal });
            if (this.container.matches(':hover')) refit();
        }

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

    private renderSearchMatch(): void {
        const match = getTitleSearchMatch(this.game, this.searchQuery);
        this.container.toggleClass('has-part-search-match', Boolean(match?.partId));
        if (!match?.partId) return;
        const copy = librarySearchCopy(i18n.getLanguage());
        const footer = this.container.querySelector<HTMLElement>('.lorebase-card-progress-footer');
        const button = (footer ?? this.container).createEl('button', { cls: 'lorebase-card-search-match', attr: {
            type: 'button', title: `${copy.found}: ${match.partTitle}${match.source === 'part-alias' ? ` · ${match.title}` : ''}`,
            'aria-label': `${copy.open}: ${match.partTitle}`,
        } });
        if (footer) footer.insertBefore(button, footer.querySelector('.lorebase-card-progress-row'));
        button.createSpan({ cls: 'lorebase-card-search-match-label', text: `${copy.part} ·` });
        button.createSpan({ cls: 'lorebase-card-search-match-title', text: match.partTitle });
        setIcon(button.createSpan({ cls: 'lorebase-card-search-match-arrow', attr: { 'aria-hidden': 'true' } }), 'arrow-up-right');
        button.addEventListener('click', event => {
            event.preventDefault(); event.stopPropagation();
            if (this.callbacks.onPartClick) this.callbacks.onPartClick(this.game, match.partId!);
            else this.callbacks.onClick(this.game);
        });
    }

    private renderMusic(): void {
        if (this.game.type !== 'music') return;
        const item = this.game;
        this.container.addClass('is-music');
        this.container.setAttribute('tabindex', '0');
        this.container.setAttribute('role', 'button');
        this.container.setAttribute('aria-label', item.displayName);
        const art = this.container.createDiv({ cls: 'lorebase-music-art' });
        art.createDiv({ cls: 'lorebase-music-disc', attr: { 'aria-hidden': 'true' } });
        const sleeve = art.createDiv({ cls: 'lorebase-music-sleeve' });
        const cover = sleeve.createEl('img', { cls: 'lorebase-music-cover', attr: {
            alt: item.displayName, src: this.resolveImageCandidate(item.imageUrl || DEFAULT_COVER), loading: 'eager', decoding: 'async', fetchpriority: 'high',
        } });
        cover.addEventListener('error', () => { if (cover.getAttribute('src') !== DEFAULT_COVER) cover.src = DEFAULT_COVER; }, { signal: this.abortController.signal });
        sleeve.createDiv({ cls: 'lorebase-music-cd-case', attr: { 'aria-hidden': 'true' } });
        const body = this.container.createDiv({ cls: 'lorebase-music-card-body' });
        const title = body.createDiv({ cls: 'lorebase-music-card-title', text: item.displayName, attr: { title: item.displayName } });
        if (this.orientation !== 'horizontal') attachDelayedTitleExpansion(this.container, title, this.abortController.signal);
        const credit = [item.artist, item.year].filter(Boolean).join(' · ');
        const meta = body.createDiv({ cls: 'lorebase-music-card-meta', attr: { title: credit } });
        if (item.artist) meta.createSpan({ cls: 'lorebase-music-card-artist', text: item.artist });
        if (item.year) meta.createSpan({ cls: 'lorebase-music-card-year', text: `${item.artist ? ' · ' : ''}${item.year}` });
        this.applyMusicTextLayout(this.overlayTextLayout);
        this.renderBadges(sleeve);
        this.container.toggleClass('lorebase-card-favorite-pulse', this.badges.favorite.enabled && this.badges.favorite.subtlePulse && item.favorite);
        const signal = this.abortController.signal;
        this.container.addEventListener('click', () => this.callbacks.onClick(item), { signal });
        this.container.addEventListener('keydown', event => {
            if (event.target !== this.container || !['Enter', ' '].includes(event.key)) return;
            event.preventDefault(); this.callbacks.onClick(item);
        }, { signal });
        this.container.addEventListener('contextmenu', event => {
            event.preventDefault(); event.stopPropagation(); this.callbacks.onContextMenu(item, event.clientX, event.clientY);
        }, { signal });
    }

    private applyMusicTextLayout(layout: LorebaseSettings['overlayTextLayout']): void {
        const fields = { title: '.lorebase-music-card-title', year: '.lorebase-music-card-meta' } as const;
        for (const field of ['title', 'year'] as const) {
            const node = this.container.querySelector<HTMLElement>(fields[field]);
            if (!node) continue;
            const point = layout[field];
            const x = Math.max(0, Math.min(85, Number.isFinite(point.x) ? point.x : 0));
            const y = Math.max(0, Math.min(90, Number.isFinite(point.y) ? point.y : 0));
            node.style.setProperty('--music-text-x', `${x}%`);
            node.style.setProperty('--music-text-y', `${y}%`);
            node.hidden = !this.overlayTextVisibility[field] && !this.editablePreview;
        }
    }

    private renderBookSpine(): void {
        const book = this.game as BookItem;
        let seed = 0;
        for (const character of book.filePath) seed = (Math.imul(seed, 31) + character.charCodeAt(0)) >>> 0;
        const colors = ['#505c45', '#754540', '#455963', '#79603d', '#50514a', '#594d61', '#3c5d54', '#655045'];
        this.container.className = 'lorebase-card lorebase-book-spine';
        this.container.setAttribute('data-binding', (seed >>> 15) % 3 === 1 ? 'literary' : 'modern');
        this.container.toggleClass('is-cover-visible', this.bookExpanded);
        this.container.setAttribute('role', 'button');
        this.container.setAttribute('aria-expanded', String(this.bookExpanded));
        this.container.tabIndex = 0;
        const author = book.authors?.join(', ') ?? '';
        const label = [book.displayName, author].filter(Boolean).join(' — ');
        this.container.setAttribute('aria-label', label);
        this.container.title = label;
        this.container.style.setProperty('--spine-color', colors[seed % colors.length]);
        this.container.style.setProperty('--spine-text-color', '#eee7d8');
        void this.applyBookCoverColor(book);
        this.container.style.setProperty('--spine-height', `${220 + (seed >>> 4) % 49}px`);
        // pageTotal is the parsed page_total field. Bound the thickness so short
        // books remain readable and very large volumes still fit narrow shelves.
        const spineWidth = typeof book.pageTotal === 'number' && Number.isFinite(book.pageTotal) && book.pageTotal > 0
            ? Math.max(38, Math.min(112, Math.round(book.pageTotal * 0.14)))
            : 44;
        this.container.style.setProperty('--spine-width', `${spineWidth}px`);
        this.container.style.setProperty('--page-depth', `${4 + (seed >>> 12) % 3}px`);
        const binding = this.container.createDiv({ cls: 'lorebase-book-binding' });
        binding.createSpan({ cls: 'lorebase-book-pages', attr: { 'aria-hidden': 'true' } });
        const text = binding.createDiv({ cls: 'lorebase-book-spine-text' });
        text.createSpan({ cls: 'lorebase-book-spine-title', text: book.displayName });
        if (author) text.createSpan({ cls: 'lorebase-book-spine-author', text: author });
        if (book.favorite) binding.createSpan({ cls: 'lorebase-book-spine-mark', text: '★', attr: { 'aria-hidden': 'true' } });
        const cover = this.container.createDiv({ cls: 'lorebase-book-front', attr: { 'aria-hidden': 'true' } });
        const fallback = cover.createDiv({ cls: 'lorebase-book-front-fallback' });
        fallback.createSpan({ text: book.displayName });
        if (author) fallback.createSpan({ cls: 'lorebase-book-front-author', text: author });
        if (book.favorite) cover.createSpan({ cls: 'lorebase-book-bookmark', text: '★' });
        const signal = this.abortController.signal;
        // Load only the selected cover, with the same local-file resolver as regular cards.
        this.loadBookCover = () => {
            this.loadBookCover = null;
            const candidates = [book.imageUrl, book.poster, book.horizontalImageUrl]
                .filter((value): value is string => Boolean(value) && value !== DEFAULT_COVER);
            if (!candidates.length) return;
            const img = cover.createEl('img', { attr: { alt: '', decoding: 'async' } });
            let index = 0;
            img.addEventListener('error', () => {
                index++;
                if (index < candidates.length) img.src = this.resolveImageCandidate(candidates[index]);
                else img.remove();
            }, { signal });
            img.src = this.resolveImageCandidate(candidates[index]);
        };
        if (this.bookExpanded) this.loadBookCover();
        const activate = (): void => {
            if (this.bookExpanded) this.callbacks.onClick(this.game);
            else this.setBookExpanded(true);
        };
        this.container.addEventListener('click', activate, { signal });
        this.container.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                activate();
            } else if (event.key === 'Escape' && this.bookExpanded) {
                event.preventDefault();
                event.stopPropagation();
                this.setBookExpanded(false);
            }
        }, { signal });
        this.container.addEventListener('contextmenu', event => {
            event.preventDefault();
            event.stopPropagation();
            this.callbacks.onContextMenu(this.game, event.clientX, event.clientY);
        }, { signal });
    }

    private async applyBookCoverColor(book: BookItem): Promise<void> {
        const document = this.container.ownerDocument;
        if (!document) return;
        const signal = this.abortController.signal;
        const candidates = [...new Set([book.imageUrl, book.poster, book.horizontalImageUrl])];
        for (const candidate of candidates) {
            if (!candidate || candidate === DEFAULT_COVER || signal.aborted) continue;
            const source = this.resolveImageCandidate(candidate);
            if (source === DEFAULT_COVER) continue;
            const color = await getBookCoverColor(source, document);
            if (signal.aborted) return;
            if (color) {
                this.container.style.setProperty('--spine-color', color.background);
                this.container.style.setProperty('--spine-text-color', color.text);
                return;
            }
        }
    }

    private setBookExpanded(expanded: boolean): void {
        if (expanded) {
            this.container.parentElement?.querySelectorAll<HTMLElement>('.lorebase-book-spine.is-cover-visible')
                .forEach(element => {
                    if (element !== this.container) GameCard.instances.get(element)?.setBookExpanded(false);
                });
            this.loadBookCover?.();
        }
        this.bookExpanded = expanded;
        this.container.toggleClass('is-cover-visible', expanded);
        this.container.setAttribute('aria-expanded', String(expanded));
    }

    private getCardImageCandidates(isHorizontal: boolean): string[] {
        const titleCover = this.game.type === 'anime' || this.game.type === 'series' ? this.game.titleImageUrl : null;
        const usesActiveCover = (this.game.type === 'anime' || this.game.type === 'series')
            && this.game.posterMode !== 'title' && Boolean(titleCover && this.game.imageUrl !== titleCover);
        const rawCandidates = usesActiveCover
            ? [this.game.imageUrl, titleCover, this.game.poster, this.game.horizontalImageUrl]
            : isHorizontal
            ? [this.game.horizontalImageUrl, this.game.imageUrl, this.game.poster]
            : [this.game.imageUrl, titleCover, this.game.poster, this.game.horizontalImageUrl];
        const expanded: string[] = [];
        for (const value of rawCandidates) {
            if (!value || value === DEFAULT_COVER) continue;
            expanded.push(...this.getImageCandidates(value, isHorizontal));
        }
        expanded.push(DEFAULT_COVER);
        return Array.from(new Set(expanded.filter(Boolean)));
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

    private resolveImageCandidate(candidate: string): string {
        if (this.isReadyImageUrl(candidate)) return candidate;
        return this.resolveImageUrl?.(candidate) || DEFAULT_COVER;
    }

    private isReadyImageUrl(value: string): boolean {
        return /^(https?:|app:|data:|blob:)/i.test(value);
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
        const signal = this.abortController.signal;
        try {
            const blob = await loadMangaDexPoster(url, signal);
            if (signal.aborted) return;
            const objectUrl = URL.createObjectURL(blob);
            this.objectUrls.push(objectUrl);
            img.src = objectUrl;
        } catch {
            if (!signal.aborted) onError();
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

        if (this.overlayTextVisibility.title || this.editablePreview) {
            titleEl = overlay.createDiv({ cls: 'lorebase-card-title' });
            titleEl.textContent = this.game.displayName;
            this.applyOverlayPosition(titleEl, 'title');
        }

        if (this.isAnime(this.game)) {
            if (this.overlayTextVisibility.year || this.editablePreview) {
                yearEl = overlay.createDiv({ cls: 'lorebase-card-year' });
                yearEl.textContent = this.game.year ? String(this.game.year) : t('yearNotSpecified');
                this.applyOverlayPosition(yearEl, 'year');
            }

            if (this.overlayTextVisibility.format || this.editablePreview) {
                formatEl = overlay.createDiv({ cls: 'lorebase-card-year lorebase-card-format' });
                formatEl.textContent = this.getAnimeFormatLabel(this.game.format);
                this.applyOverlayPosition(formatEl, 'format');
            }

            if (this.overlayTextVisibility.description || this.editablePreview) {
                descriptionEl = overlay.createDiv({ cls: 'lorebase-card-description' });
                descriptionEl.textContent = this.game.summary || this.game.description || t('noDescription');
                this.applyOverlayPosition(descriptionEl, 'description');
            }
        } else {
            if (this.overlayTextVisibility.year || this.editablePreview) {
                yearEl = overlay.createDiv({ cls: 'lorebase-card-year' });
                yearEl.textContent = this.game.year ? String(this.game.year) : t('yearNotSpecified');
                this.applyOverlayPosition(yearEl, 'year');
            }

            if (this.overlayTextVisibility.description || this.editablePreview) {
                descriptionEl = overlay.createDiv({ cls: 'lorebase-card-description' });
                descriptionEl.textContent = this.game.description || t('noDescription');
                this.applyOverlayPosition(descriptionEl, 'description');
            }
        }

        if (descriptionEl && this.scrollDescription) {
            descriptionEl.addClass('is-scrollable');
            descriptionEl.tabIndex = 0;
            descriptionEl.addEventListener('click', event => {
                if (descriptionEl.scrollHeight > descriptionEl.clientHeight) event.stopPropagation();
            }, { signal: this.abortController.signal });
        }
        const visibility = this.overlayTextVisibility;
        if (this.editablePreview) {
            this.layoutOverlay(overlay, visibility.title ? titleEl : null, visibility.year ? yearEl : null,
                visibility.format ? formatEl : null, descriptionEl);
        }
    }

    private renderProgressBadge(parent: HTMLElement): void {
        if (!this.isProgressMedia(this.game)) return;
        if (!this.animeProgressVisibility.showSeason && !this.animeProgressVisibility.showEpisode) return;
        const progress = this.getProgressTexts(this.game);
        if (!progress) return;

        const badge = parent.createDiv({ cls: 'lorebase-card-metacritic' });
        const showSeason = this.animeProgressVisibility.showSeason && Boolean(progress.season);
        const showEpisode = this.animeProgressVisibility.showEpisode && Boolean(progress.ep);

        if (this.isBook(this.game)) {
            if (showEpisode && progress.ep) {
                badge.createSpan({ cls: 'lorebase-card-progress-ep', text: progress.ep });
            }
            if (showSeason && progress.season) {
                const chapter = badge.createSpan({ cls: 'lorebase-card-progress-season', text: progress.season });
                chapter.addClass(showEpisode ? 'is-hover-only' : 'is-only');
            }
            return;
        }

        if (showSeason && progress.season) {
            const context = badge.createSpan({ cls: 'lorebase-card-progress-season', text: progress.season });
            context.addClass(showEpisode ? 'is-hover-only' : 'is-only');
        }
        if (showEpisode && progress.ep) {
            badge.createSpan({ cls: 'lorebase-card-progress-ep', text: progress.ep });
        }
    }

    private renderProgressFooter(): void {
        if (!this.isProgressMedia(this.game)) return;
        const footer = this.container.createDiv({ cls: 'lorebase-card-progress-footer' });

        const progress = this.getProgressTexts(this.game);
        const metaParts = [progress?.season, progress?.ep].filter((value): value is string => Boolean(value));

        const header = footer.createDiv({ cls: 'lorebase-card-progress-header' });
        const title = header.createDiv({ cls: 'lorebase-card-progress-title', text: this.game.displayName });
        attachDelayedTitleExpansion(this.container, title, this.abortController.signal);
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

        const communityRating = this.game.communityRating;
        if ((this.badges.communityRating.enabled || this.editablePreview) && communityRating != null && Number.isFinite(communityRating)) {
            this.renderCommunityRatingBadge(getGroup('top-left'), communityRating);
        }

        if (this.badges.status.enabled || this.editablePreview) {
            const statusGroup = getGroup(this.badges.status.position);
            statusGroup.addClass('has-status');
            this.renderStatusBadge(statusGroup);
        }

        if ((this.badges.rating.enabled || this.editablePreview) && this.game.userRating) {
            this.renderRatingBadge(getGroup(this.badges.rating.position));
        }

        if ((this.editablePreview || (this.badges.favorite.enabled && !this.badges.favorite.subtlePulse)) && this.game.favorite) {
            this.renderFavoriteBadge(getGroup(this.badges.favorite.position));
        }

        if ((this.badges.workType.enabled || this.editablePreview) && Boolean(this.game.workType)) {
            const badge = getGroup(this.badges.workType.position).createDiv({
                cls: 'lorebase-card-work-type',
                text: getMediaWorkTypeLabel(this.game.type, this.game.workType || '', i18n.getLanguage()),
            });
            badge.style.setProperty('--lorebase-type-color', getMediaWorkTypeColor(this.game.type, this.game.workType || ''));
        }
    }

    private renderStatusBadge(parent: HTMLElement): void {
        const appearance = getStatusAppearance(this.game.type, this.game.status);
        const isReadingMedia = this.game.type === 'book' || this.game.type === 'manga';
        const statusLabels: Record<string, string> = {
            to_be_released: t('statusToBeReleased'),
            completed: this.game.type === 'game'
                ? t('statusPlayed')
                : isReadingMedia ? t('statusReadCompleted') : t('statusCompleted'),
            playing: t('statusPlaying'),
            dropped: t('statusDropped'),
            sandbox: t('statusSandbox'),
            wishlist: t('statusWishlist'),
            not_started: t('statusNotStarted'),
            planned: isReadingMedia ? t('statusPlanToRead') : t('statusPlanned'),
            watching: isReadingMedia ? t('statusReading') : t('statusWatching'),
            paused: t('statusPaused'),
        };

        if (this.game.type === 'music') statusLabels[this.game.status] = mt(this.game.status);
        const overrideStatusText = appearance.label || this.statusLabels[this.game.status]?.trim();
        const isLegacyGameCompletedLabel = this.game.type !== 'game'
            && this.game.status === 'completed'
            && overrideStatusText === t('statusPlayed')
            && t('statusPlayed') !== t('statusCompleted');
        let statusText = !isLegacyGameCompletedLabel && overrideStatusText
            ? overrideStatusText
            : statusLabels[this.game.status] || String(this.game.status);
        if (!this.badges.status.iconOnly && this.shouldShowCompletionDate()) {
            const formatted = this.formatFinishedDate(this.game.finished);
            if (formatted) {
                statusText = `${statusText} | ${formatted}`;
            }
        }

        statusText = withReleaseCountdown(statusText, this.game, i18n.getLanguage(), new Date(), this.badges.status.showReleaseCountdown !== false);

        const statusBadge = parent.createDiv({
            cls: `lorebase-card-status lorebase-status-${this.game.status}`
        });
        statusBadge.style.color = appearance.color;
        const icon = statusBadge.createSpan({ cls: 'lorebase-status-badge-icon' });
        setIcon(icon, appearance.icon);

        if (this.badges.status.iconOnly) {
            statusBadge.addClass('is-icon-only');
            return;
        }

        statusBadge.title = statusText;
        statusBadge.createSpan({ cls: 'lorebase-status-badge-text', text: statusText });
    }

    private renderRatingBadge(parent: HTMLElement): void {
        if (!this.game.userRating) return;

        const ratingBadge = parent.createDiv({ cls: 'lorebase-card-rating' });
        renderRatingBadgeContent(ratingBadge, this.game.userRating, this.ratingSettings, this.badges.rating.mode, this.game.type);
    }

    private renderCommunityRatingBadge(parent: HTMLElement, rating: number): void {
        const locale = i18n.getLocale();
        const score = formatCommunityRatingValue(rating);
        const title = [t('communityRatingTitle'), score];
        if (this.game.communityRatingProvider) title.push(this.game.communityRatingProvider);
        const votes = this.game.communityVotes;
        if (votes != null && Number.isFinite(votes)) {
            title.push(Math.max(0, Math.trunc(votes)).toLocaleString(locale) + ' ' + t('communityRatingVotes'));
        }
        const label = title.join(' · ');
        const badge = parent.createDiv({
            cls: 'lorebase-card-community-rating',
            attr: { title: label, 'aria-label': label, role: 'img' },
        });
        renderCommunityRatingBadgeContent(badge, rating, this.badges.communityRating.icon);
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
        field: keyof LorebaseSettings['overlayTextLayout'],
        layout = this.overlayTextLayout,
    ): void {
        const point = this.getVisualOverlayPoint(field, layout);
        element.style.setProperty('--overlay-x', `${point.x}%`);
        element.style.setProperty('--overlay-y', `${point.y}%`);
        if (field === 'description') {
            element.style.setProperty('--overlay-max-width', `${Math.max(30, 92 - point.x)}%`);
        } else {
            element.style.removeProperty('--overlay-max-width');
        }
    }

    private getVisualOverlayPoint(field: keyof LorebaseSettings['overlayTextLayout'], layout: LorebaseSettings['overlayTextLayout']): { x: number; y: number } {
        const point = this.getOverlayPoint(field, layout);
        if (field !== 'description' || !this.overlayTextVisibility.title) return point;

        const titlePoint = this.getOverlayPoint('title', layout);
        if (point.x >= titlePoint.x) return point;
        return this.clampOverlayPoint(field, titlePoint.x, point.y);
    }

    private layoutOverlay(
        overlay: HTMLElement,
        titleEl: HTMLElement | null,
        yearEl: HTMLElement | null,
        formatEl: HTMLElement | null,
        descriptionEl: HTMLElement | null,
        lines = this.descriptionLines,
        immediate = false,
    ): void {
        const elements = {
            title: titleEl,
            year: yearEl,
            format: formatEl,
            description: descriptionEl,
            lines,
            editable: this.editablePreview,
        };
        if (immediate) {
            GameCard.overlayLayoutQueue.delete(overlay);
            GameCard.measureOverlay(overlay, elements)();
            return;
        }
        if ((!titleEl || !yearEl) && !descriptionEl) return;
        GameCard.overlayLayoutQueue.set(overlay, elements);
        if (GameCard.overlayLayoutFrame !== null) return;

        // Batch measurements before applying text offsets and line limits.
        GameCard.overlayLayoutFrame = window.requestAnimationFrame(() => {
            GameCard.overlayLayoutFrame = null;
            const tasks = Array.from(GameCard.overlayLayoutQueue.entries());
            GameCard.overlayLayoutQueue.clear();
            const updates = tasks.filter(([element]) => element.isConnected)
                .map(([element, fields]) => GameCard.measureOverlay(element, fields));
            updates.forEach(update => update());
        });
    }

    private static measureOverlay(
        overlay: HTMLElement,
        { title, year, format, description, lines, editable }: OverlayLayout,
    ): () => void {
        const badgeBounds: { top: number; bottom: number; left: number; right: number; atTop: boolean }[] = [];
        overlay.parentElement?.querySelectorAll<HTMLElement>('.lorebase-card-badge-group, .lorebase-card-metacritic')
            .forEach(badge => {
                const groupHeight = badge.offsetHeight;
                const height = editable && badge.matches('.lorebase-card-badge-group')
                    ? Math.max(0, ...Array.from(badge.querySelectorAll<HTMLElement>(':scope > :not(.is-preview-disabled)'))
                        .map(child => child.offsetHeight))
                    : groupHeight;
                if (!height) return;
                const atTop = badge.classList.contains('is-top-badge');
                const top = atTop ? badge.offsetTop : badge.offsetTop + groupHeight - height;
                badgeBounds.push({
                    top, bottom: top + height, left: badge.offsetLeft, right: badge.offsetLeft + badge.offsetWidth, atTop,
                });
            });
        const clearTopBadges = (element: HTMLElement): number => {
            let top = element.offsetTop;
            for (const badge of badgeBounds) {
                if (badge.atTop && (element === title || (element.offsetLeft < badge.right && element.offsetLeft + element.offsetWidth > badge.left))
                    && top < badge.bottom + 4 && top + element.offsetHeight > badge.top - 4) {
                    top = Math.max(top, badge.bottom + 4);
                }
            }
            return top;
        };
        const titleTop = title ? clearTopBadges(title) : 0;
        const titleOffset = title ? titleTop - title.offsetTop : 0;
        let yearOffset = 0;
        let formatOffset = 0;
        let descriptionOffset = 0;
        if (year) {
            let yearTop = clearTopBadges(year);
            if (title && year.offsetTop >= title.offsetTop) {
                yearTop = Math.max(yearTop, titleTop + title.offsetHeight + 8);
            }
            yearOffset = yearTop - year.offsetTop;
        }
        if (format) {
            const formatTop = clearTopBadges(format);
            const followsYear = year && Math.abs(format.offsetTop - year.offsetTop) < 4;
            formatOffset = Math.max(formatTop - format.offsetTop, followsYear ? yearOffset : 0);
        }
        if (description) {
            let descriptionTop = clearTopBadges(description);
            for (const [element, offset] of [[title, titleOffset], [year, yearOffset], [format, formatOffset]] as const) {
                if (element && description.offsetTop >= element.offsetTop) {
                    descriptionTop = Math.max(descriptionTop, element.offsetTop + offset + element.offsetHeight + 10);
                }
            }
            descriptionOffset = descriptionTop - description.offsetTop;
        }

        let capacity = lines;
        const descriptionStyle = description ? window.getComputedStyle(description) : null;
        const lineHeight = Number.parseFloat(descriptionStyle?.lineHeight ?? '');
        const padding = Number.parseFloat(descriptionStyle?.paddingTop ?? '0') + Number.parseFloat(descriptionStyle?.paddingBottom ?? '0');
        if (description && overlay.clientHeight > 0) {
            let bottom = overlay.clientHeight;
            for (const badge of badgeBounds) {
                if (!badge.atTop) bottom = Math.min(bottom, badge.top);
            }
            if (lineHeight > 0) {
                const available = bottom - 6 - description.offsetTop - descriptionOffset - padding;
                capacity = Math.max(0, Math.floor(available / lineHeight));
            }
        }

        return () => {
            if (title) title.style.transform = titleOffset ? `translateY(${titleOffset}px)` : '';
            if (year) year.style.transform = yearOffset ? `translateY(${yearOffset}px)` : '';
            if (format) format.style.transform = formatOffset ? `translateY(${formatOffset}px)` : '';
            if (description) {
                description.style.transform = descriptionOffset ? `translateY(${descriptionOffset}px)` : '';
                // Keep a draggable target in the editor even when no line fits.
                description.style.visibility = !capacity && !editable ? 'hidden' : '';
                const visibleLines = String(Math.max(1, Math.min(lines, capacity)));
                const scrollable = description.classList.contains('is-scrollable');
                description.style.setProperty('-webkit-line-clamp', scrollable ? 'unset' : visibleLines);
                description.style.setProperty('line-clamp', scrollable ? 'unset' : visibleLines);
                if (scrollable && lineHeight > 0) {
                    description.style.maxHeight = String(Number(visibleLines) * lineHeight + padding) + 'px';
                }
                if (editable) description.dataset.lineCapacity = String(capacity);
            }
        };
    }

    private getOverlayPoint(field: keyof LorebaseSettings['overlayTextLayout'], layout: LorebaseSettings['overlayTextLayout']): { x: number; y: number } {
        const defaults = getCardProfile(DEFAULT_SETTINGS, this.game.type, this.orientation).layout;
        const fallback = defaults[field];
        const raw = layout[field];
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

    private normalizeDescriptionLines(value: number): number {
        if (!Number.isFinite(value)) return 6;
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
                Math.floor(activePart?.chapterCurrent ?? item.chapterCurrent ?? 0),
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
                season: chapterText,
                ep: pageText,
            };
        }
        if (this.isManga(item)) {
            const activePart = item.parts?.find((part) => part.id === item.activePartId) ?? item.parts?.[0] ?? null;
            const chapterCurrent = Number.isFinite(activePart?.chapterCurrent ?? item.chapterCurrent)
                ? (activePart?.chapterCurrent ?? item.chapterCurrent) as number
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
        return this.game.type !== 'music' && (this.badges.status.alwaysShowCompletionDate || this.groupedByCompletionDate
            || this.sortField === 'dateCompleted' || this.sortField === 'dateFinished')
            && this.game.status === 'completed'
            && Boolean(normalizePersonalDate(this.game.finished));
    }

    private formatFinishedDate(value: string | null | undefined): string | null {
        const date = normalizePersonalDate(value);
        if (date === UNKNOWN_DATE) return personalDateText('unknown');
        if (/^\d{4}$/.test(date)) return date;
        if (/^\d{4}-\d{2}$/.test(date)) return new Intl.DateTimeFormat(i18n.getLocale(), { year: 'numeric', month: 'short' }).format(new Date(date + '-01T12:00:00'));
        const timestamp = this.getFinishedTimestamp(value);
        if (!timestamp || !Number.isFinite(timestamp)) return null;
        const locale = i18n.getLocale();
        const options: Intl.DateTimeFormatOptions = this.completionDateBadgeFormat === 'full'
            ? { month: 'short', day: 'numeric', year: 'numeric' }
            : { month: 'short', day: 'numeric' };
        try {
            return new Intl.DateTimeFormat(locale, options).format(new Date(timestamp));
        } catch {
            return new Date(timestamp).toLocaleDateString(locale, options);
        }
    }

    private getFinishedTimestamp(value: string | null | undefined): number | null {
        if (!value) return null;
        const trimmed = value.trim();
        if (!trimmed) return null;
        const parsed = Date.parse(trimmed);
        return Number.isNaN(parsed) ? null : parsed;
    }

    getElement(): HTMLElement {
        return this.container;
    }

    /** Virtual overscan should load before entering view, with visible covers first. */
    setImageLoadingPriority(visible: boolean): void {
        if (this.imageLoadingPriority === visible) return;
        this.imageLoadingPriority = visible;
        for (const image of Array.from(this.container.querySelectorAll<HTMLImageElement>('img'))) {
            image.loading = 'eager';
            image.setAttribute('fetchpriority', visible ? 'high' : 'low');
            setPosterLoadPriority(image, visible ? 'high' : 'low');
        }
    }

    updatePreviewOverlay(layout: LorebaseSettings['overlayTextLayout'], lines: number): void {
        if (!this.editablePreview) return;
        if (this.game.type === 'music') { this.applyMusicTextLayout(layout); return; }
        const overlay = this.container.querySelector<HTMLElement>('.lorebase-card-overlay');
        if (!overlay) return;
        const title = overlay.querySelector<HTMLElement>('.lorebase-card-title');
        const year = overlay.querySelector<HTMLElement>('.lorebase-card-year:not(.lorebase-card-format)');
        const format = overlay.querySelector<HTMLElement>('.lorebase-card-format');
        const description = overlay.querySelector<HTMLElement>('.lorebase-card-description');
        const fields = { title, year, format, description };
        for (const field of Object.keys(fields) as (keyof typeof fields)[]) {
            const element = fields[field];
            if (!element) continue;
            element.style.removeProperty('transform');
            this.applyOverlayPosition(element, field, layout);
        }
        const visibility = this.overlayTextVisibility;
        this.layoutOverlay(overlay, visibility.title ? title : null, visibility.year ? year : null,
            visibility.format ? format : null, description, this.normalizeDescriptionLines(lines), true);
    }

    static refitOverlay(element: HTMLElement): void {
        const card = GameCard.instances.get(element);
        const overlay = element.querySelector<HTMLElement>('.lorebase-card-overlay');
        if (!card || !overlay) return;
        card.layoutOverlay(
            overlay,
            overlay.querySelector('.lorebase-card-title'),
            overlay.querySelector('.lorebase-card-year:not(.lorebase-card-format)'),
            overlay.querySelector('.lorebase-card-format'),
            overlay.querySelector('.lorebase-card-description'),
        );
    }

    static refreshElement(element: HTMLElement, game: MediaItem): boolean {
        const card = GameCard.instances.get(element);
        if (!card) return false;
        card.refresh(game);
        return true;
    }

    static destroyElement(element: HTMLElement): void {
        GameCard.instances.get(element)?.destroy();
    }

    private refresh(game: MediaItem): void {
        const priority = this.imageLoadingPriority;
        const height = this.container.style.height;
        const currentPoster = this.container.querySelector<HTMLImageElement>('.lorebase-card-image img:not(.lorebase-poster-transition)');
        this.previousPoster = currentPoster && (game.type === 'anime' || game.type === 'series')
            ? currentPoster.cloneNode(false) as HTMLImageElement : null;
        if (currentPoster) cancelPosterLoad(currentPoster);
        this.abortController.abort();
        for (const url of this.objectUrls) URL.revokeObjectURL(url);
        this.objectUrls = [];
        this.abortController = new AbortController();
        this.game = game;
        this.container.empty();
        this.render();
        if (priority !== null) {
            this.container.style.height = height;
            this.imageLoadingPriority = null;
            this.setImageLoadingPriority(priority);
        }
    }

    destroy(): void {
        for (const overlay of Array.from(this.container.querySelectorAll<HTMLElement>('.lorebase-card-overlay'))) {
            GameCard.overlayLayoutQueue.delete(overlay);
        }
        const poster = this.container.querySelector<HTMLImageElement>('.lorebase-card-image img:not(.lorebase-poster-transition)');
        if (poster) cancelPosterLoad(poster);
        this.previousPoster = null;
        this.abortController.abort();
        for (const url of this.objectUrls) URL.revokeObjectURL(url);
        this.objectUrls = [];
        GameCard.instances.delete(this.container);
        if (this.container && this.container.parentElement) {
            this.container.remove();
        }
    }
}
