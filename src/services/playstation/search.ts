/** PSN display names often contain marks and edition suffixes absent from catalogs. */
export function cleanPlayStationSearch(value: string): string {
    return value.replace(/[®™©℠]/g, '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

export function playStationSearchQueries(value: string): string[] {
    const title = cleanPlayStationSearch(value);
    const base = title.replace(/\s*[:–—-]?\s*(?:classic|definitive|complete|ultimate|deluxe|gold|standard|game of the year|goty|remastered)\s*(?:edition|version)?\s*$/i, '').trim();
    return [...new Set([title, base].filter(Boolean))];
}
