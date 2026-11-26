import type { CardDimensionOverrides } from '../../components/GameCard';
import type { CardSize, LorebaseSettings, ViewMode } from '../../types';
import { CARD_GRID_MOBILE_BREAKPOINT, normalizeCardGrid } from '../../services/media/cardGrid';

export type EffectiveLayout = {
    partSearchCaption?: boolean;
    music?: boolean;
    musicArtRatio?: number;
    cardSize: CardSize;
    cardStyle: LorebaseSettings['games']['cardStyle'];
    columns: number;
    orientation: LorebaseSettings['games']['orientation'];
    dimensions: CardDimensionOverrides;
    minCardWidth: number;
    targetCardWidth?: number;
    gap: number;
    padding: number;
};

export class LayoutCalculator {
    constructor(private readonly getAvailableWidth: () => number, private readonly isMobile?: () => boolean) {}

    getEffectiveLayout(settings: LorebaseSettings['games'], viewMode: ViewMode): EffectiveLayout {
        const orientation = viewMode === 'horizontal' ? 'horizontal' : 'vertical';
        const grid = normalizeCardGrid(settings.cardGrid, settings);
        const availableWidth = this.getAvailableWidth();
        const mobile = this.isMobile?.() ?? (availableWidth > 0 && availableWidth <= CARD_GRID_MOBILE_BREAKPOINT);
        const device = mobile ? grid.mobile : grid.desktop;
        const horizontal = orientation === 'horizontal';
        const targetWidth = horizontal ? device.horizontalWidth : device.width;
        const columns = horizontal ? device.horizontalColumns : device.columns;
        const music = 'albumCoverMode' in settings;
        let musicArtRatio = 1;
        if (music) {
            const musicSettings = settings as LorebaseSettings['music'];
            const kindRule = musicSettings.viewState.rules.find(rule => rule.field === 'musicKind' && rule.operator === 'containsAny');
            const kinds = Array.isArray(kindRule?.value) ? kindRule.value : ['album', 'track'];
            musicArtRatio = kinds.every(kind => (kind === 'track' ? musicSettings.trackCoverMode : musicSettings.albumCoverMode) === 'vinyl') ? .78 : 1;
        }
        return {
            music, musicArtRatio,
            cardSize: settings.cardSize,
            cardStyle: settings.cardStyle,
            columns, orientation,
            minCardWidth: device.mode === 'size' ? targetWidth : horizontal ? music ? 300 : 180 : 100,
            targetCardWidth: device.mode === 'size' ? targetWidth : undefined,
            gap: device.gap,
            padding: device.gap,
            dimensions: {
                verticalMinWidth: 10000,
                verticalMinHeight: 0,
                verticalImageRatio: grid.posterRatio,
                horizontalMinWidth: 0,
                horizontalHeight: targetWidth / grid.horizontalRatio,
                horizontalImageRatio: grid.horizontalRatio,
            },
        };
    }

    getRenderedColumns(layout: EffectiveLayout): number {
        const width = this.getAvailableWidth();
        if (!Number.isFinite(width) || width <= 0) return layout.targetCardWidth ? 1 : layout.columns;
        const innerWidth = Math.max(0, width - layout.padding * 2);
        const fitting = Math.max(1, Math.floor((innerWidth + layout.gap) / (layout.minCardWidth + layout.gap)));
        return layout.targetCardWidth ? fitting : Math.min(layout.columns, fitting);
    }

    getCardWidth(layout: EffectiveLayout, columns = this.getRenderedColumns(layout), gridWidth = this.getAvailableWidth()): number {
        if (!Number.isFinite(gridWidth) || gridWidth <= 0) return layout.targetCardWidth ?? layout.minCardWidth;
        const available = Math.max(1, gridWidth - layout.padding * 2 - layout.gap * (Math.max(1, columns) - 1));
        return Math.min(layout.targetCardWidth ?? Infinity, available / Math.max(1, columns));
    }

    getCardHeight(layout: EffectiveLayout): number {
        if (layout.music && layout.orientation === 'horizontal') return 180;
        const width = this.getCardWidth(layout);
        return this.cardHeight(layout, width);
    }

    calculateActualCardHeight(layout: EffectiveLayout, columns: number, gridEl: HTMLElement | null): number {
        const width = this.getCardWidth(layout, columns, gridEl?.clientWidth);
        return this.cardHeight(layout, width);
    }

    private cardHeight(layout: EffectiveLayout, width: number): number {
        if (layout.music) return layout.orientation === 'horizontal' ? 180 : Math.ceil(width * (layout.musicArtRatio ?? 1)) + 48;
        const horizontal = layout.orientation === 'horizontal';
        const ratio = horizontal ? layout.dimensions.horizontalImageRatio! : layout.dimensions.verticalImageRatio;
        const imageHeight = Math.ceil(width / ratio);
        const footer = !horizontal && layout.cardStyle === 'progress' ? 48 : 0;
        const searchCaption = !horizontal && layout.partSearchCaption ? 22 : 0;
        return imageHeight + footer + searchCaption;
    }
}
