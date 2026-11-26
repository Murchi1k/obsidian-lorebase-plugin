import { renderChoiceButtons } from './choiceButtons';
import { mt } from '../../localization/music';
import { snapMusicTextPosition } from './musicTextPosition';
import { GameCard } from '../../components/GameCard';
import { VIEW_TYPE_LIBRARY } from '../../constants';
import { i18n, t } from '../../localization';
import { CARD_MEDIA_KEYS, getCardProfile, type ConfigurableCardMedia } from '../../services/media/cardProfiles';
import { LayoutCalculator } from '../../views/library/LayoutCalculator';
import type { LibraryView } from '../../views/LibraryView';
import type { BadgePosition, CardOrientation, LorebaseSettings, MediaItem } from '../../types';
import { getRatingMax } from '../../utils/rating';
import { createCardPreviewItem } from './cardPreviewSamples';
import { loadCardPreviewItems } from './cardPreviewItems';
import type { SettingsSectionContext } from './types';

export type TextField = keyof LorebaseSettings['overlayTextLayout'];
export type BadgeField = keyof LorebaseSettings['badges'];

const textSelectors = {
    title: '.lorebase-card-title, .lorebase-music-card-title',
    year: '.lorebase-card-year:not(.lorebase-card-format), .lorebase-music-card-meta',
    format: '.lorebase-card-format',
    description: '.lorebase-card-description',
} as const;
const badgeSelectors = {
    status: '.lorebase-card-status',
    rating: '.lorebase-card-rating',
    communityRating: '.lorebase-card-community-rating',
    favorite: '.lorebase-card-favorite-badge',
    workType: '.lorebase-card-work-type',
} as const;
const snapX = { title: [5, 7, 10, 14], year: [5, 7, 10, 14], format: [26, 30, 34, 40], description: [2, 7, 10, 14] };
const snapY = { title: [5, 7, 10, 14], year: [13, 20, 24, 30], format: [13, 20, 24, 30], description: [21, 35, 40, 50, 62, 74, 84] };

function snap(value: number, guides: number[], threshold: number, max: number): number {
    const nearest = guides.reduce((best, guide) => Math.abs(guide - value) < Math.abs(best - value) ? guide : best);
    const snapped = Math.abs(nearest - value) <= threshold ? nearest : value;
    return Math.round(Math.min(max, Math.max(2, snapped)) * 10) / 10;
}

export function createCardPreview(
    context: SettingsSectionContext, host: HTMLElement, edits: {
        moveText: (field: TextField, x: number, y: number) => void;
        moveBadge: (field: BadgeField, position: BadgePosition) => void;
        toggleText: (field: TextField) => void;
        toggleBadge: (field: BadgeField) => void;
        resizeDescription: (lines: number) => void;
    },
): (media: ConfigurableCardMedia, orientation: CardOrientation, hover: boolean, longText: boolean, device?: 'desktop' | 'mobile') => void {
    const musicToolbar = host.createDiv({ cls: 'lorebase-card-preview-toolbar' });
    let musicKind: 'album' | 'track' = 'album';
    const shelfCards: GameCard[] = [];
    const viewport = host.createDiv({ cls: 'lorebase-card-mini-viewport' });
    const slot = viewport.createDiv({ cls: 'lorebase-card-mini-slot' });
    const drawing = slot.createDiv({ cls: 'lorebase-card-mini-drawing' });
    const resizeLabel = { en: 'Resize description', ru: 'Изменить число строк', uk: 'Змінити кількість рядків', 'zh-CN': '调整描述行数' }[i18n.getLanguage()];
    const handle = viewport.createEl('button', {
        cls: 'lorebase-card-description-handle', attr: { type: 'button', title: resizeLabel, 'aria-label': resizeLabel },
    });
    handle.hidden = true;
    const settings = context.plugin.settings;
    let card: GameCard | undefined;
    let scale = 1;
    let descriptionLines = 6;
    let savedLayout = settings.overlayTextLayout;
    let showText = true;
    const libraryItems = new Map<ConfigurableCardMedia, MediaItem[]>();
    const pending = new Set<ConfigurableCardMedia>();
    let active: Parameters<ReturnType<typeof createCardPreview>> | undefined;

    const placeHandle = (): void => {
        const description = drawing.querySelector(textSelectors.description);
        const image = drawing.querySelector('.lorebase-card-image');
        if (!showText || !description || !image) { handle.hidden = true; return; }
        const text = description.getBoundingClientRect();
        const cover = image.getBoundingClientRect();
        const frame = viewport.getBoundingClientRect();
        handle.hidden = text.top >= cover.bottom || text.left >= cover.right || !text.width || !text.height;
        handle.style.left = `${Math.min(text.right, cover.right - 8) - frame.left - viewport.clientLeft}px`;
        handle.style.top = `${Math.min(text.bottom, cover.bottom - 8) - frame.top - viewport.clientTop}px`;
    };

    const fit = (): void => {
        const music = active?.[0] === 'music';
        if (!music) viewport.style.removeProperty('height');
        const width = drawing.offsetWidth;
        const height = drawing.offsetHeight;
        if (!width || !height || viewport.clientWidth <= 16 || viewport.clientHeight <= 12) return;
        const maxHeight = music
            ? active?.[1] === 'horizontal' ? Math.max(180, Math.min(260, window.innerHeight * .35))
                : Math.max(240, Math.min(420, window.innerHeight * .54))
            : viewport.clientHeight;
        // Enlarging a narrow library card also enlarges its fixed-size text and
        // badges. Keep the preview at its actual size, or shrink it to fit.
        scale = Math.min(1, (viewport.clientWidth - 16) / width, (maxHeight - 24) / height);
        drawing.style.transform = `scale(${scale})`;
        slot.setCssStyles({ width: `${width * scale}px`, height: `${height * scale}px` });
        if (music) viewport.style.height = `${Math.ceil(height * scale) + 22}px`;
        placeHandle();
    };
    const observer = new ResizeObserver(() => {
        if (!viewport.isConnected) observer.disconnect();
        else fit();
    });
    observer.observe(viewport);
    observer.observe(drawing);
    context.signal?.addEventListener('abort', () => {
        observer.disconnect();
        card?.destroy();
        shelfCards.forEach(card => card.destroy());
    }, { once: true });
    viewport.addEventListener('scroll', placeHandle, { capture: true });

    let drag: {
        id: number; x: number; y: number; element: HTMLElement;
        field: TextField | BadgeField; text: boolean; bounds: DOMRect;
        resize: boolean; lineHeight: number; initialLines: number; capacity: number;
        origin: { x: number; y: number };
    } | undefined;
    const positionText = (field: TextField, bounds: DOMRect, start: { x: number; y: number }, dx: number, dy: number) => {
        if (active?.[0] === 'music') {
            return snapMusicTextPosition(field === 'year' ? 'year' : 'title', {
                x: start.x + 100 * dx / bounds.width, y: start.y + 100 * dy / bounds.height,
            }, savedLayout, active[1], bounds.width / scale, bounds.height / scale);
        }
        return {
            x: snap(start.x + 100 * dx / bounds.width, snapX[field], 1.6, field === 'description' ? 66 : 84),
            y: snap(start.y + 100 * dy / bounds.height, snapY[field], 2.1, 92),
        };
    };
    const textField = (target: Element): TextField | undefined => (Object.keys(textSelectors) as TextField[]).find(key => target.closest(textSelectors[key]));
    const badgeField = (target: Element): BadgeField | undefined => (Object.keys(badgeSelectors) as BadgeField[]).find(key => target.closest(badgeSelectors[key]));
    const corner = (event: PointerEvent, bounds: DOMRect): BadgePosition | undefined => {
        if (event.clientX < bounds.left || event.clientX > bounds.right
            || event.clientY < bounds.top || event.clientY > bounds.bottom) return;
        const vertical = event.clientY - bounds.top < bounds.height / 2 ? 'top' : 'bottom';
        const horizontal = event.clientX - bounds.left < bounds.width / 2 ? 'left' : 'right';
        return `${vertical}-${horizontal}`;
    };
    const measureDescription = (element: HTMLElement) => {
        const style = getComputedStyle(element);
        const lineHeight = Number.parseFloat(style.lineHeight) || 16;
        const padding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
        const visibleLines = Math.max(1, Math.round((element.offsetHeight - padding) / lineHeight));
        return {
            lineHeight: lineHeight * scale,
            initialLines: Math.min(descriptionLines, visibleLines),
            capacity: Math.max(1, Math.min(70, Number(element.dataset.lineCapacity ?? 70))),
        };
    };
    const resizedLines = (delta: number, { initialLines, capacity }: { initialLines: number; capacity: number }): number => {
        const visibleLines = Math.max(1, Math.min(capacity, initialLines + delta));
        return visibleLines === initialLines ? descriptionLines : visibleLines;
    };
    viewport.addEventListener('pointerdown', event => {
        if (event.button !== 0 || drag || !(event.target instanceof Element)) return;
        const image = drawing.querySelector('.lorebase-card-image, .lorebase-music-sleeve');
        if (!image) return;
        const target = event.target;
        const grabbedHandle = handle.contains(target);
        const scrollable = target.closest<HTMLElement>('.lorebase-card-description.is-scrollable');
        if (!grabbedHandle && scrollable) {
            const rect = scrollable.getBoundingClientRect();
            const scrollbar = (scrollable.offsetWidth - scrollable.clientWidth) * scale;
            if (event.pointerType === 'touch' || (scrollbar > 0 && event.clientX >= rect.right - scrollbar)) return;
        }
        const text = grabbedHandle ? 'description' : textField(target);
        const badge = badgeField(target);
        if (!text && !badge) return;
        const element = grabbedHandle ? drawing.querySelector<HTMLElement>(textSelectors.description)
            : target.closest<HTMLElement>(text ? textSelectors[text] : badgeSelectors[badge!]);
        const surface = text && active?.[0] === 'music' ? drawing.querySelector('.lorebase-music-card-body') ?? image : image;
        const bounds = surface.getBoundingClientRect();
        if (!element || !bounds.width || !bounds.height) return;
        const rect = element.getBoundingClientRect();
        const origin = text && active?.[0] === 'music' ? { ...savedLayout[text] } : { x: 100 * (rect.left - bounds.left) / bounds.width, y: 100 * (rect.top - bounds.top) / bounds.height };
        const metrics = grabbedHandle ? measureDescription(element) : { lineHeight: 1, initialLines: 1, capacity: 1 };
        drag = { id: event.pointerId, x: event.clientX, y: event.clientY, element, field: text ?? badge!, text: Boolean(text), bounds, resize: grabbedHandle, origin, ...metrics };
        if (badge) {
            event.preventDefault();
            element.focus({ preventScroll: true });
            viewport.setPointerCapture(event.pointerId);
        }
    });
    viewport.addEventListener('pointermove', event => {
        if (!drag || drag.id !== event.pointerId) return;
        if (!drag.text && drag.field === 'communityRating') return;
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        if (Math.hypot(dx, dy) < (drag.text ? 4 : 6)) return;
        if (!viewport.hasPointerCapture(event.pointerId)) viewport.setPointerCapture(event.pointerId);
        if (drag.text) {
            const field = drag.field as TextField;
            const layout = drag.resize ? savedLayout : { ...savedLayout, [field]: positionText(field, drag.bounds, drag.origin, dx, dy) };
            const lines = drag.resize ? resizedLines(Math.round(dy / drag.lineHeight), drag) : descriptionLines;
            card?.updatePreviewOverlay(layout, lines);
            if (active?.[0] === 'music') {
                const body = drawing.querySelector<HTMLElement>('.lorebase-music-card-body');
                body?.style.setProperty('--music-guide-x', `${layout[field].x}%`);
                body?.style.setProperty('--music-guide-y', `${layout[field].y}%`);
            }
            placeHandle();
            if (drag.resize) handle.setAttribute('title', `${resizeLabel} · ${lines}`);
            drawing.addClass('is-editing-text');
            drag.element.addClass('is-moving-text');
        } else {
            drag.element.style.translate = `${dx / scale}px ${dy / scale}px`;
            const position = corner(event, drag.bounds);
            if (position) drawing.dataset.dropCorner = position;
            else delete drawing.dataset.dropCorner;
        }
    });
    viewport.addEventListener('lostpointercapture', () => {
        if (drag) {
            drag.element.style.removeProperty('translate');
            drag.element.removeClass('is-moving-text');
            if (drag.text) {
                card?.updatePreviewOverlay(savedLayout, descriptionLines);
                placeHandle();
            }
        }
        drawing.removeClass('is-editing-text');
        delete drawing.dataset.dropCorner;
        drag = undefined;
    });
    viewport.addEventListener('pointerleave', () => {
        if (drag && !viewport.hasPointerCapture(drag.id)) drag = undefined;
    });
    viewport.addEventListener('pointercancel', () => {
        if (drag && !viewport.hasPointerCapture(drag.id)) drag = undefined;
    });
    viewport.addEventListener('pointerup', event => {
        if (!drag || drag.id !== event.pointerId) return;
        const gesture = drag;
        const { field, text, bounds, element, x, y, resize, origin } = gesture;
        element.style.removeProperty('translate');
        element.removeClass('is-moving-text');
        drawing.removeClass('is-editing-text');
        drag = undefined;
        const dx = event.clientX - x;
        const dy = event.clientY - y;
        delete drawing.dataset.dropCorner;
        if (resize) {
            const lines = resizedLines(Math.round(dy / gesture.lineHeight), gesture);
            if (Math.abs(dy) >= 4 && lines !== descriptionLines) edits.resizeDescription(lines);
            else {
                card?.updatePreviewOverlay(savedLayout, descriptionLines);
                placeHandle();
            }
        } else if (Math.hypot(dx, dy) < (text ? 4 : 6)) {
            if (!text) edits.toggleBadge(field as BadgeField);
        } else if (text) {
            const point = positionText(field as TextField, bounds, origin, dx, dy);
            edits.moveText(field as TextField, point.x, point.y);
        } else if (field !== 'communityRating') {
            const position = corner(event, bounds);
            if (position) edits.moveBadge(field as BadgeField, position);
        }
    });
    viewport.addEventListener('dblclick', event => {
        if (!(event.target instanceof Element)) return;
        const field = textField(event.target);
        if (field) edits.toggleText(field);
    });
    viewport.addEventListener('keydown', event => {
        if (event.key === ' ' && event.target instanceof Element && event.target.closest('.lorebase-card-description.is-scrollable')) return;
        if (event.target === handle && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
            event.preventDefault();
            const description = drawing.querySelector<HTMLElement>(textSelectors.description);
            if (description) edits.resizeDescription(resizedLines(event.key === 'ArrowUp' ? -1 : 1, measureDescription(description)));
            return;
        }
        if (!['Enter', ' '].includes(event.key) || !(event.target instanceof Element)) return;
        const text = textField(event.target);
        const badge = badgeField(event.target);
        if (!text && !badge) return;
        event.preventDefault();
        if (text) edits.toggleText(text);
        else if (badge) edits.toggleBadge(badge);
        const selector = text ? textSelectors[text] : badgeSelectors[badge!];
        drawing.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
    });

    const render: ReturnType<typeof createCardPreview> = (media, orientation, hover, longText, device = 'desktop') => {
        active = [media, orientation, hover, longText, device];
        const key = CARD_MEDIA_KEYS[media];
        const view = settings[key];
        const profile = getCardProfile(settings, media, orientation);
        descriptionLines = profile.descriptionLines;
        savedLayout = profile.layout;
        const sample = createCardPreviewItem(media, Math.min(4, getRatingMax(settings.ratingScale)));
        const references = context.app.workspace?.getLeavesOfType?.(VIEW_TYPE_LIBRARY)
            .map(leaf => (leaf.view as Partial<Pick<LibraryView, 'getCardPreviewReference'>>).getCardPreviewReference?.(media, orientation)) ?? [];
        const reference = references.find(reference => reference?.item) ?? references.find(Boolean);
        // A stable sample viewport keeps the editor usable when the Obsidian
        // sidebar changes the live library width. The grid summary reports the
        // actual library dimensions separately.
        const availableWidth = device === 'mobile' ? 390 : 1440;
        const calculator = new LayoutCalculator(() => availableWidth, () => device === 'mobile');
        const layout = calculator.getEffectiveLayout(view, orientation === 'horizontal' ? 'horizontal' : 'grid');
        if (!libraryItems.has(media) && !pending.has(media)) {
            pending.add(media);
            host.setAttribute('aria-busy', 'true');
            void loadCardPreviewItems(context, media).then(items => {
                libraryItems.set(media, items);
            }).catch(error => {
                libraryItems.set(media, []);
                console.error('Could not load card preview:', media, error);
            }).finally(() => {
                pending.delete(media);
                if (active?.[0] === media && host.isConnected && !context.signal?.aborted) render(...active);
            });
        }
        host.setAttribute('aria-busy', String(pending.has(media)));
        musicToolbar.hidden = media !== 'music';
        if (media === 'music' && !musicToolbar.childElementCount) renderChoiceButtons(musicToolbar, t('settingsPreviewMode'), [
            { value: 'album', label: mt('album'), icon: 'disc' }, { value: 'track', label: mt('track'), icon: 'music' },
        ], musicKind, value => { musicKind = value; if (active) render(...active); });
        const loaded = libraryItems.get(media) ?? [];
        const real = media === 'music'
            ? loaded.find(item => item.type === 'music' && item.musicKind === musicKind) ?? (reference?.item?.type === 'music' && reference.item.musicKind === musicKind ? reference.item : undefined)
            : reference?.item ?? loaded[0];
        const ratingSource = real && Number.isFinite(real.communityRating) ? real : sample;
        const item = real ? {
            ...real,
            favorite: true,
            userRating: real.userRating ?? sample.userRating,
            communityRating: ratingSource.communityRating,
            communityVotes: ratingSource.communityVotes,
            communityRatingProvider: ratingSource.communityRatingProvider,
            workType: real.workType || sample.workType || '',
        } : sample;
        if (real && longText) {
            item.description = sample.description;
            if (item.type === 'anime') item.summary = sample.description;
        }
        if (item.type === 'music') item.musicKind = musicKind;
        showText = hover;
        handle.setAttribute('title', `${resizeLabel} · ${descriptionLines}`);
        card?.destroy();
        shelfCards.splice(0).forEach(card => card.destroy());
        drawing.empty();
        drawing.classList.remove('is-bookshelf-preview');
        drawing.style.width = `${calculator.getCardWidth(layout)}px`;
        viewport.dataset.device = device;
        drawing.style.fontSize = reference?.fontSize ?? '';
        drawing.style.lineHeight = reference?.lineHeight ?? '';
        if (media === 'book' && view.bookshelfEffect) {
            drawing.addClass('is-bookshelf-preview');
            drawing.style.width = '340px';
            const shelf = drawing.createDiv({ cls: 'lorebase-bookshelf' });
            const books = loaded.filter(item => item.type === 'book').slice(0, 4);
            if (real?.type === 'book' && !books.some(book => book.filePath === real.filePath)) books.unshift(real);
            while (books.length < 4) {
                const index = books.length;
                const example = createCardPreviewItem('book', 4);
                if (example.type !== 'book') break;
                books.push({
                    ...example,
                    filePath: ['lorebase-preview-atlas.md', 'lorebase-preview-stories.md', 'lorebase-preview-novel.md', 'lorebase-preview-collection.md'][index],
                    displayName: ['LOREBASE', 'LOREBASE · II', 'LOREBASE · III', 'LOREBASE · IV'][index],
                    pageTotal: [150, 280, 450, 580][index], imageUrl: '',
                });
            }
            for (const book of books.slice(0, 4)) {
                shelfCards.push(new GameCard(shelf, book, { onClick() {}, onContextMenu() {} },
                    'medium', 'vertical', 'hover', 'name', profile.badges, profile.layout, profile.visibility, 6, null,
                    undefined, settings.statusLabels.books, 'short', settings.ratingScale,
                    value => context.plugin.getMetadataService?.()?.getImageUrl(value) ?? null,
                    true, '', false, false, settings.scrollCardDescriptions, settings.showDiscoveryBadge));
            }
            drawing.style.width = `${Math.max(300, shelfCards.reduce((sum, card) => sum + parseFloat(card.getElement().style.getPropertyValue('--spine-width')) + 8, 16))}px`;
            card = undefined;
            handle.hidden = true;
            fit();
            return;
        }
        card = new GameCard(
            drawing, item, { onClick() {}, onContextMenu() {} }, layout.cardSize, orientation, view.cardStyle, 'name',
            profile.badges, profile.layout, profile.visibility, profile.descriptionLines, layout.dimensions,
            { showSeason: view.showAnimeSeasonProgress, showEpisode: view.showAnimeEpisodeProgress },
            settings.statusLabels[key], settings.completionDateBadgeFormats?.[key] ?? settings.completionDateBadgeFormat,
            settings.ratingScale, value => context.plugin.getMetadataService?.()?.getImageUrl(value) ?? null,
            media === 'book' && Boolean(view.bookshelfEffect) && orientation === 'vertical',
            '', true, false, settings.scrollCardDescriptions, settings.showDiscoveryBadge,
        );
        const element = card.getElement();
        element.toggleClass('lorebase-preview-hover', hover);
        if (media === 'music') {
            const mode = musicKind === 'album' ? settings.music.albumCoverMode : settings.music.trackCoverMode;
            element.toggleClass('lorebase-music-vinyl', mode === 'vinyl');
            element.toggleClass('lorebase-music-cd', mode === 'cd');
        }
        element.toggleClass('lorebase-book-cover-effect', (media === 'book' || media === 'manga')
            && Boolean(view.bookCoverEffect) && !(media === 'book' && view.bookshelfEffect));
        for (const field of Object.keys(textSelectors) as TextField[]) {
            const node = element.querySelector<HTMLElement>(textSelectors[field]);
            if (!node) continue;
            const visible = profile.visibility[field];
            node.toggleClass('is-preview-disabled', !visible);
            node.setAttribute('tabindex', hover ? '0' : '-1');
            node.setAttribute('role', 'button');
            node.setAttribute('aria-pressed', String(visible));
        }
        for (const field of Object.keys(badgeSelectors) as BadgeField[]) {
            const node = element.querySelector<HTMLElement>(badgeSelectors[field]);
            if (!node) continue;
            const enabled = profile.badges[field].enabled;
            node.toggleClass('is-preview-disabled', !enabled);
            node.setAttribute('tabindex', '0');
            node.setAttribute('role', 'button');
            node.setAttribute('aria-pressed', String(enabled));
            const badgeLabel = field === 'workType'
                ? { en: 'Type badge', ru: 'Бейдж типа', uk: 'Бейдж типу', 'zh-CN': '类型徽章' }[i18n.getLanguage()]
                : t(({
                status: 'settingsBadgesStatus', rating: 'settingsBadgesRating', favorite: 'settingsBadgesFavorite',
                communityRating: 'communityRatingTitle',
            } as const)[field]);
            const state = enabled
                ? { en: 'On', ru: 'Включён', uk: 'Увімкнено', 'zh-CN': '已开启' }[i18n.getLanguage()]
                : { en: 'Off', ru: 'Выключен', uk: 'Вимкнено', 'zh-CN': '已关闭' }[i18n.getLanguage()];
            node.setAttribute('aria-label', badgeLabel);
            node.setAttribute('title', `${badgeLabel} · ${state}`);
        }
        const image = element.querySelector<HTMLElement>('.lorebase-card-image, .lorebase-music-sleeve');
        if (image) {
            const guides = image.createDiv({ cls: 'lorebase-card-drop-guides', attr: { 'aria-hidden': 'true' } });
            for (const position of ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const) {
                guides.createSpan({ attr: { 'data-corner': position } });
            }
        }
        fit();
        drawing.ownerDocument.defaultView?.requestAnimationFrame(placeHandle);
    };
    return render;
}
