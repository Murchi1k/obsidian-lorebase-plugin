import { STAT_FACETS, type StatFacet } from './statistics';
export const STAT_SECTIONS = ['summary', 'media', 'time', 'continue', 'journey', 'timeline', 'distribution', 'preferences', 'quality', 'geography'] as const;
export type StatSection = typeof STAT_SECTIONS[number];
export interface StatWidgetLayout { order: number; span: number; height: number | null; collapsed: boolean }
export interface StatisticsPreferences {
    widgets: Record<string, StatWidgetLayout>;
    density: 'comfortable' | 'compact';
    cardSize: 'small' | 'medium' | 'large';
    activityMonths: 3 | 6;
    width: 'wide' | 'standard';
    hiddenSections: StatSection[];
    rankFacet: StatFacet;
    rankColumns: StatFacet[];
    rankOrder: 'count' | 'rating';
    calendarView: 'month' | 'activity' | 'year';
    titleView: 'grid';
}
export function normalizeStatisticsPreferences(value: unknown): StatisticsPreferences {
    const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
    const hidden = Array.isArray(raw.hiddenSections) ? raw.hiddenSections : [];
    const widgets: Record<string, StatWidgetLayout> = {};
    if (raw.widgets && typeof raw.widgets === 'object' && !Array.isArray(raw.widgets)) for (const [id, value] of Object.entries(raw.widgets)) {
        if (!/^(overview|insights)-(summary|kpi-total|kpi-completed|kpi-rating|kpi-favorites|media|time|continue|journey|timeline|statuses|ratings|preferences|quality|geography)$/.test(id) || !value || typeof value !== 'object') continue;
        const entry = value as Record<string, unknown>;
        widgets[id] = { order: typeof entry.order === 'number' && Number.isFinite(entry.order) ? Math.max(0, Math.min(50, entry.order)) : 0,
            span: typeof entry.span === 'number' && Number.isFinite(entry.span) && entry.span >= 3 ? Math.min(12, Math.round(entry.span)) : entry.span === 1 ? 6 : 12, height: typeof entry.height === 'number' && Number.isFinite(entry.height) ? Math.max(id.includes('-kpi-') ? 80 : 120, Math.min(900, entry.height)) : null, collapsed: entry.collapsed === true };
    }
    const previousSummary = widgets['overview-summary'];
    if (previousSummary && !Object.keys(widgets).some(id => id.startsWith('overview-kpi-'))) {
        // Split the old four-figure container without inheriting its oversized height.
        for (const [id, entry] of Object.entries(widgets)) {
            if (id.startsWith('overview-') && id !== 'overview-summary' && entry.order >= previousSummary.order) entry.order += 3;
        }
        ['total', 'completed', 'rating', 'favorites'].forEach((key, index) => {
            widgets['overview-kpi-' + key] = { order: previousSummary.order + index, span: 3, height: null, collapsed: false };
        });
        delete widgets['overview-summary'];
    }
    delete widgets['insights-journey'];
    const columns = Array.isArray(raw.rankColumns) ? raw.rankColumns.filter((facet): facet is StatFacet => STAT_FACETS.includes(facet as StatFacet)).slice(0,8) : [];
    const rankColumns: StatFacet[] = columns.length ? columns : [STAT_FACETS.includes(raw.rankFacet as StatFacet) ? raw.rankFacet as StatFacet : 'genres', 'studios', 'directors', 'authors'];
    return { rankColumns, widgets, titleView: 'grid', cardSize: raw.cardSize === 'small' || raw.cardSize === 'large' ? raw.cardSize : 'medium', activityMonths: raw.activityMonths === 3 ? 3 : 6, calendarView: raw.calendarView === 'activity' || raw.calendarView === 'year' ? raw.calendarView : 'month', density: raw.density === 'compact' ? 'compact' : 'comfortable', width: raw.width === 'standard' ? 'standard' : 'wide',
        hiddenSections: STAT_SECTIONS.filter(section => hidden.includes(section)),
        rankFacet: STAT_FACETS.includes(raw.rankFacet as StatFacet) ? raw.rankFacet as StatFacet : 'genres', rankOrder: raw.rankOrder === 'rating' ? 'rating' : 'count' };
}
