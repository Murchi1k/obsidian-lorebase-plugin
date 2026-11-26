type RecordValue = Record<string, unknown>;
function names(raw: unknown): string[] {
    if (!Array.isArray(raw)) return typeof raw === 'string' ? raw.split(',').map(value => value.trim()) : [];
    return raw.map(value => typeof value === 'string' ? value : value && typeof value === 'object' ? String((value as RecordValue).name ?? (value as RecordValue).description ?? '') : '').filter(Boolean);
}
/** Only label search results when their response actually contains classification data. */
export function inferGameWorkType(item: RecordValue | null): string | undefined {
    if (!item) return undefined;
    const tags = [...names(item.genres), ...names(item.tags)];
    if (tags.some(value => /visual[ _-]?novel/i.test(value))) return 'Visual novel';
    return Array.isArray(item.genres) ? 'Game' : undefined;
}
export function inferVideoWorkType(kind: 'movies' | 'series', item: RecordValue): string | undefined {
    const series = kind === 'series';
    const genreNames = names(item.genres ?? item.Genre).map(value => value.toLowerCase());
    const ids = Array.isArray(item.genre_ids) ? item.genre_ids : Array.isArray(item.genres) ? item.genres.map(value => value && typeof value === 'object' ? (value as RecordValue).id : null) : [];
    const type = String(item.type ?? '').toLowerCase();
    if (ids.includes(16) || genreNames.includes('animation') || type === 'animation') return series ? 'Animated series' : 'Animation';
    if (ids.includes(99) || genreNames.includes('documentary') || type === 'documentary') return series ? 'Documentary series' : 'Documentary';
    if (series && (ids.includes(10764) || ids.includes(10767) || ids.includes(10763))) return 'TV show';
    if (series && ['talk show', 'talk', 'reality', 'news', 'game show', 'variety'].includes(type)) return 'TV show';
    if (series) return type === 'scripted' || Array.isArray(item.genre_ids) || Array.isArray(item.genres) || Boolean(item.Genre) ? 'Series' : undefined;
    return Array.isArray(item.genre_ids) || Array.isArray(item.genres) || Boolean(item.Genre) || type === 'movie' || type === 'film' ? 'Movie' : undefined;
}
