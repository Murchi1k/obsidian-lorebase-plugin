/** A chapter number is a position, not a count of chapters. */
export function normalizeChapterPosition(raw: unknown, total?: number | null): number | null {
    if (raw === null || raw === undefined || raw === '') return null;
    const number = typeof raw === 'number' ? raw : Number(String(raw).trim().replace(',','.'));
    if (!Number.isFinite(number)) return null;
    const value = Math.max(0,number);
    return total && total > 0 && Math.floor(value) > total ? total : value;
}

/** Move to the neighbouring numbered chapter without generating extra entries. */
export function stepChapterPosition(current: number | null, direction: number, total: number | null): number {
    const position=current ?? 0;
    const next=direction>0 ? Math.floor(position)+1 : Math.ceil(position)-1;
    const normalized=normalizeChapterPosition(Math.max(0,next),total) ?? 0;
    return direction>0 && normalized<position ? position : normalized;
}
