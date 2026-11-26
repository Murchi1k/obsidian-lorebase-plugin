import type { CardGridDeviceSettings, CardGridSettings, LorebaseSettings } from '../../types';

export const CARD_GRID_MOBILE_BREAKPOINT = 520;

export function createDefaultCardGrid(columns = 5): CardGridSettings {
    return {
        desktop: { mode: 'columns', width: 220, horizontalWidth: 400, columns, horizontalColumns: 4, gap: 16 },
        mobile: { mode: 'columns', width: 150, horizontalWidth: 300, columns, horizontalColumns: 4, gap: 10 },
        posterRatio: 2 / 3,
        horizontalRatio: 16 / 10,
    };
}

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function number(value: unknown, fallback: number, min: number, max: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

export function normalizeCardGrid(raw: unknown, legacy?: Partial<LorebaseSettings['games']>): CardGridSettings {
    const defaults = createDefaultCardGrid(legacy && 'albumCoverMode' in legacy ? 7 : 5);
    if (!raw && legacy) {
        const width = legacy.customCardSize ? legacy.customCardMinWidth
            : { small: 180, medium: 220, large: 260 }[legacy.cardSize ?? 'medium'];
        defaults.desktop.width = number(width, defaults.desktop.width, 100, 420);
        defaults.desktop.columns = Math.round(number(legacy.columns, defaults.desktop.columns, 1, 12));
        if (legacy.customCardSize) {
            defaults.posterRatio = number(legacy.customCardImageRatio, defaults.posterRatio, .4, 2.2);
            defaults.desktop.horizontalWidth = number(legacy.customHorizontalCardMinWidth, 400, 180, 720);
            const height = number(legacy.customHorizontalCardHeight, 220, 80, 600);
            defaults.horizontalRatio = number(defaults.desktop.horizontalWidth / height, defaults.horizontalRatio, 1, 3);
        }
    }
    const source = record(raw);
    const device = (key: 'desktop' | 'mobile'): CardGridDeviceSettings => {
        const values = record(source[key]);
        const fallback = defaults[key];
        return {
            mode: values.mode === 'size' ? 'size' : 'columns',
            width: Math.round(number(values.width, fallback.width, 100, key === 'mobile' ? 250 : 420)),
            horizontalWidth: Math.round(number(values.horizontalWidth, fallback.horizontalWidth, 180, key === 'mobile' ? 480 : 720)),
            columns: Math.round(number(values.columns, fallback.columns, 1, 12)),
            horizontalColumns: Math.round(number(values.horizontalColumns, fallback.horizontalColumns, 1, 12)),
            gap: Math.round(number(values.gap, fallback.gap, 4, 32)),
        };
    };
    return {
        desktop: device('desktop'),
        mobile: device('mobile'),
        posterRatio: number(source.posterRatio, defaults.posterRatio, .4, 2.2),
        horizontalRatio: number(source.horizontalRatio, defaults.horizontalRatio, 1, 3),
    };
}

export function cardGridWidthCss(columns: number, gap: number, padding: number, targetWidth?: number): string {
    const count = Math.max(1, columns);
    const available = `calc((100% - ${gap * (count - 1) + padding * 2}px) / ${count})`;
    return targetWidth ? `min(${targetWidth}px, ${available})` : available;
}
