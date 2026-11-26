import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/constants';
import { createDefaultCardGrid, normalizeCardGrid } from '../src/services/media/cardGrid';
import { LayoutCalculator } from '../src/views/library/LayoutCalculator';

// These cases exercise explicit pixel sizing; column defaults are covered separately.
const settings = () => {
    const settings = structuredClone(DEFAULT_SETTINGS.games);
    settings.cardGrid!.desktop.mode = settings.cardGrid!.mobile.mode = 'size';
    return settings;
};

describe('LayoutCalculator', () => {
    it('sizes cards in pixels and fits columns without stretching the posters', () => {
        const calculator = new LayoutCalculator(() => 1100);
        const config = settings();
        config.cardGrid!.desktop.width = 180;
        const layout = calculator.getEffectiveLayout(config, 'grid');
        expect(calculator.getRenderedColumns(layout)).toBe(5);
        expect(calculator.getCardWidth(layout)).toBe(180);
        expect(calculator.getCardHeight(layout)).toBe(270);
    });

    it('uses separate widths for horizontal cards', () => {
        const calculator = new LayoutCalculator(() => 1100);
        const config = settings();
        config.cardGrid!.desktop.horizontalWidth = 400;
        const layout = calculator.getEffectiveLayout(config, 'horizontal');
        expect(calculator.getRenderedColumns(layout)).toBe(2);
        expect(calculator.getCardWidth(layout)).toBe(400);
        expect(calculator.getCardHeight(layout)).toBe(250);
    });

    it('fits a wide screen by width without inheriting the old column cap', () => {
        const calculator = new LayoutCalculator(() => 3840);
        const config = settings();
        config.cardGrid!.desktop.width = 100;
        const layout = calculator.getEffectiveLayout(config, 'grid');
        expect(calculator.getRenderedColumns(layout)).toBe(32);
        expect(calculator.getCardWidth(layout)).toBe(100);
    });

    it('shrinks a single card when even its chosen width cannot fit', () => {
        const calculator = new LayoutCalculator(() => 170);
        const layout = calculator.getEffectiveLayout(settings(), 'horizontal');
        expect(calculator.getRenderedColumns(layout)).toBe(1);
        expect(calculator.getCardWidth(layout)).toBe(150);
        expect(calculator.getCardHeight(layout)).toBe(94);
    });

    it('lets phone widths produce one, two, or three columns', () => {
        const calculator = new LayoutCalculator(() => 390);
        const config = settings();
        for (const [width, columns] of [[100, 3], [150, 2], [250, 1]]) {
            config.cardGrid!.mobile.width = width;
            const layout = calculator.getEffectiveLayout(config, 'grid');
            expect(calculator.getRenderedColumns(layout)).toBe(columns);
            expect(calculator.getCardWidth(layout)).toBe(width);
        }
    });

    it('keeps desktop and phone profiles independent at the same pane width', () => {
        const config = settings();
        config.cardGrid!.desktop.width = 220;
        config.cardGrid!.mobile.width = 100;
        const desktop = new LayoutCalculator(() => 390, () => false);
        const phone = new LayoutCalculator(() => 390, () => true);
        expect(desktop.getRenderedColumns(desktop.getEffectiveLayout(config, 'grid'))).toBe(1);
        expect(phone.getRenderedColumns(phone.getEffectiveLayout(config, 'grid'))).toBe(3);
    });

    it('fills the row in column mode and adapts down in narrow panes', () => {
        const config = settings();
        config.cardGrid!.desktop.mode = 'columns';
        config.cardGrid!.desktop.columns = 4;
        const wide = new LayoutCalculator(() => 1100, () => false);
        const wideLayout = wide.getEffectiveLayout(config, 'grid');
        expect(wide.getRenderedColumns(wideLayout)).toBe(4);
        expect(wide.getCardWidth(wideLayout)).toBe(255);
        const narrow = new LayoutCalculator(() => 340, () => false);
        const narrowLayout = narrow.getEffectiveLayout(config, 'grid');
        expect(narrow.getRenderedColumns(narrowLayout)).toBe(2);
        expect(narrow.getCardWidth(narrowLayout)).toBe(146);
    });

    it('uses the same gap and dimensions to calculate virtual rows', () => {
        const config = settings();
        config.cardGrid!.desktop.mode = 'columns';
        config.cardGrid!.desktop.columns = 3;
        config.cardGrid!.desktop.gap = 24;
        config.cardGrid!.posterRatio = .75;
        const calculator = new LayoutCalculator(() => 1000);
        const layout = calculator.getEffectiveLayout(config, 'grid');
        expect(layout.gap).toBe(24);
        expect(layout.padding).toBe(24);
        expect(calculator.getCardWidth(layout)).toBeCloseTo(904 / 3);
        expect(calculator.calculateActualCardHeight(layout, 3, { clientWidth: 1000 } as HTMLElement)).toBe(402);
    });

    it('accounts for progress footers and search captions in virtual rows', () => {
        const calculator = new LayoutCalculator(() => 1100);
        const config = settings();
        config.cardStyle = 'progress';
        const layout = calculator.getEffectiveLayout(config, 'grid');
        const grid = { clientWidth: 1100 } as HTMLElement;
        expect(calculator.calculateActualCardHeight(layout, 4, grid)).toBe(378);
        expect(calculator.calculateActualCardHeight({ ...layout, partSearchCaption: true }, 4, grid)).toBe(400);
        const horizontal = calculator.getEffectiveLayout(config, 'horizontal');
        expect(calculator.calculateActualCardHeight({ ...horizontal, partSearchCaption: true }, 2, grid)).toBe(250);
    });

    it('migrates legacy custom sizes without modifying the old settings object', () => {
        const config = settings();
        delete config.cardGrid;
        config.customCardSize = true;
        config.customCardMinWidth = 300;
        config.customCardImageRatio = .75;
        config.customHorizontalCardMinWidth = 600;
        config.customHorizontalCardHeight = 300;
        const result = normalizeCardGrid(undefined, config);
        expect(result.desktop.width).toBe(300);
        expect(result.posterRatio).toBe(.75);
        expect(result.desktop.horizontalWidth).toBe(600);
        expect(result.horizontalRatio).toBe(2);
        expect(config.cardGrid).toBeUndefined();
    });

    it('normalizes incomplete and out-of-range saved values and survives a reload', () => {
        const grid = normalizeCardGrid({ desktop: { width: NaN, gap: 100, columns: -5 }, mobile: { width: 9999 }, posterRatio: 0 });
        expect(grid.desktop.width).toBe(createDefaultCardGrid().desktop.width);
        expect(grid.desktop.gap).toBe(32);
        expect(grid.desktop.columns).toBe(1);
        expect(grid.mobile.width).toBe(250);
        expect(grid.posterRatio).toBe(.4);
        expect(normalizeCardGrid(JSON.parse(JSON.stringify(grid)))).toEqual(grid);
    });
});
