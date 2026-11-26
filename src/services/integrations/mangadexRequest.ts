export const MANGADEX_USER_AGENT = 'Lorebase (Obsidian plugin; metadata search)';
export const MANGADEX_HEADERS = { Accept: 'application/json', 'User-Agent': MANGADEX_USER_AGENT };

/** The image CDN requires the same identifiable client as the catalogue API. */
export function withMangaDexHeaders(url: string, headers: Record<string, string> = {}): Record<string, string> {
    try {
        if (!['api.mangadex.org', 'uploads.mangadex.org'].includes(new URL(url).hostname)) return headers;
    } catch { return headers; }
    const next = { ...headers };
    for (const key of Object.keys(next)) if (key.toLowerCase() === 'user-agent') delete next[key];
    next['User-Agent'] = MANGADEX_USER_AGENT;
    return next;
}
