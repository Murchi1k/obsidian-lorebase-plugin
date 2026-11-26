// Identify the API client instead of inheriting Obsidian's browser User-Agent.
export const ANILIST_USER_AGENT = 'Lorebase (Obsidian plugin)';

export function withAniListHeaders(url: string, headers: Record<string, string> = {}): Record<string, string> {
    try {
        if (new URL(url).hostname !== 'graphql.anilist.co') return headers;
    } catch {
        return headers;
    }
    const result = { ...headers };
    for (const name of Object.keys(result)) {
        if (name.toLowerCase() === 'user-agent') delete result[name];
    }
    result['User-Agent'] = ANILIST_USER_AGENT;
    return result;
}
