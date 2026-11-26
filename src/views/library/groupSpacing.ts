/** Shared geometry for normal-flow and virtual grouped libraries. */
export function getGroupSpacing(gap: number): { headerHeight: number; headerGap: number; sectionGap: number } {
    return { headerHeight: 36, headerGap: Math.max(24, gap), sectionGap: Math.max(40, gap * 2) };
}
