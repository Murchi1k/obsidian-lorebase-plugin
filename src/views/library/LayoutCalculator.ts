import { CardDimensionOverrides } from '../../components/GameCard';
import { CARD_SIZES, HORIZONTAL_CARD_SIZES } from '../../constants';
import { CardSize, LorebaseSettings, ViewMode } from '../../types';

export type EffectiveLayout = {
    cardSize: CardSize;
    columns: number;
    orientation: LorebaseSettings['games']['orientation'];
    dimensions: CardDimensionOverrides | null;
    minCardWidth: number;
};

const GRID_GAP_PX = 16;
const GRID_PADDING_PX = 16;
const PRESET_VERTICAL_MIN_WIDTH: Record<CardSize, number> = {
    small: 180,
    medium: 220,
    large: 260,
};

export class LayoutCalculator {
    constructor(private readonly getAvailableWidth: () => number) {}

    getEffectiveLayout(settings: LorebaseSettings['games'], viewMode: ViewMode): EffectiveLayout {
        const orientation = viewMode === 'horizontal' ? 'horizontal' : 'vertical';
        const maxColumns = orientation === 'horizontal' ? 4 : settings.columns;
        const cardSize = settings.cardSize;
        const dimensions = settings.customCardSize
            ? this.resolveCustomCardDimensions(settings, cardSize)
            : null;
        const minCardWidth = orientation === 'vertical'
            ? (dimensions?.verticalMinWidth ?? PRESET_VERTICAL_MIN_WIDTH[cardSize])
            : (dimensions?.horizontalMinWidth ?? 240);

        return {
            cardSize,
            columns: maxColumns,
            orientation,
            dimensions,
            minCardWidth,
        };
    }

    getRenderedColumns(layout: EffectiveLayout): number {
        if (layout.orientation === 'horizontal') {
            return Math.max(1, layout.columns);
        }
        return this.resolveAdaptiveColumns(layout.columns, layout.minCardWidth);
    }

    getCardHeight(layout: EffectiveLayout): number {
        if (layout.orientation === 'horizontal') {
            if (layout.dimensions) return layout.dimensions.horizontalHeight;
            return parseInt(HORIZONTAL_CARD_SIZES[layout.cardSize].height) || 220;
        }
        if (layout.dimensions) return layout.dimensions.verticalMinHeight;
        return parseInt(CARD_SIZES[layout.cardSize].minHeight) || 400;
    }

    calculateActualCardHeight(
        layout: EffectiveLayout,
        renderedColumns: number,
        gridEl: HTMLElement | null
    ): number {
        const staticHeight = this.getCardHeight(layout);
        if (layout.orientation === 'horizontal' || !gridEl) return staticHeight;

        const gridWidth = gridEl.clientWidth;
        if (gridWidth <= 0) return staticHeight;

        const cols = Math.max(1, renderedColumns);
        const totalGap = GRID_GAP_PX * (cols - 1);
        const totalPadding = GRID_PADDING_PX * 2;
        const cardWidth = (gridWidth - totalGap - totalPadding) / cols;
        const imageRatio = layout.dimensions?.verticalImageRatio;
        const ratio = (imageRatio && Number.isFinite(imageRatio) && imageRatio > 0)
            ? imageRatio
            : 2 / 3;

        return Math.max(staticHeight, Math.ceil(cardWidth / ratio));
    }

    private resolveCustomCardDimensions(
        settings: LorebaseSettings['games'],
        cardSize: CardSize
    ): CardDimensionOverrides {
        const verticalPreset = CARD_SIZES[cardSize];
        const horizontalPreset = HORIZONTAL_CARD_SIZES[cardSize];
        const presetVerticalMinWidth = this.parseCssPixels(verticalPreset.maxWidth, 280);
        const presetVerticalMinHeight = this.parseCssPixels(verticalPreset.minHeight, 380);
        const presetImageHeight = this.parseCssPixels(verticalPreset.imageHeight, 320);
        const presetImageRatio = this.clampImageRatio(
            presetVerticalMinWidth / Math.max(1, presetImageHeight),
            0.72
        );

        return {
            verticalMinWidth: this.clampDimension(settings.customCardMinWidth, 140, 480, presetVerticalMinWidth),
            verticalMinHeight: this.clampDimension(settings.customCardMinHeight, 180, 900, presetVerticalMinHeight),
            verticalImageRatio: this.clampImageRatio(settings.customCardImageRatio, presetImageRatio),
            horizontalMinWidth: this.clampDimension(settings.customHorizontalCardMinWidth, 240, 700, 340),
            horizontalHeight: this.clampDimension(
                settings.customHorizontalCardHeight,
                120,
                520,
                this.parseCssPixels(horizontalPreset.height, 220)
            ),
        };
    }

    private resolveAdaptiveColumns(maxColumns: number, minCardWidth: number): number {
        const safeMaxColumns = this.clampDimension(maxColumns, 1, 12, 5);
        const safeMinWidth = this.clampDimension(minCardWidth, 120, 700, 220);
        const widthSource = this.getAvailableWidth();
        if (!Number.isFinite(widthSource) || widthSource <= 0) return safeMaxColumns;

        const innerWidth = Math.max(0, widthSource - (GRID_PADDING_PX * 2));
        const byWidth = Math.max(1, Math.floor((innerWidth + GRID_GAP_PX) / (safeMinWidth + GRID_GAP_PX)));
        return Math.max(1, Math.min(safeMaxColumns, byWidth));
    }

    private parseCssPixels(value: string, fallback: number): number {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
        return parsed;
    }

    private clampDimension(value: number, min: number, max: number, fallback: number): number {
        if (!Number.isFinite(value)) return fallback;
        const rounded = Math.round(value);
        if (rounded < min) return min;
        if (rounded > max) return max;
        return rounded;
    }

    private clampImageRatio(value: number, fallback: number): number {
        if (!Number.isFinite(value)) return fallback;
        if (value < 0.4) return 0.4;
        if (value > 2.2) return 2.2;
        return Math.round(value * 100) / 100;
    }
}
