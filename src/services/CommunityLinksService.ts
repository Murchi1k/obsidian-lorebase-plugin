import { requestUrl } from 'obsidian';
import type { CommunityLink, CommunityLinkCache, CommunityLinks } from '../types';

export const REPOSITORY_URL = 'https://github.com/Murchi1k/obsidian-lorebase-plugin';
export const COMMUNITY_LINKS_URL = 'https://api.github.com/repos/Murchi1k/obsidian-lorebase-plugin/contents/community-links.json';
export const COMMUNITY_LINK_REFRESH_MS = 60 * 60 * 1000;
const RETRY_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 4000;
export const DEFAULT_COMMUNITY_LINKS: Readonly<CommunityLinks> = {
    kofi: 'https://ko-fi.com/murch1k',
    discord: 'https://discord.gg/qUA4EzafR',
    patreon: 'https://www.patreon.com/c/Murch1k',
    github: REPOSITORY_URL,
};
export const DEFAULT_COMMUNITY_BUTTONS: readonly CommunityLink[] = [
    { id: 'kofi', label: 'Ko-fi', url: DEFAULT_COMMUNITY_LINKS.kofi, icon: 'brand:kofi' },
    { id: 'discord', label: 'Discord', url: DEFAULT_COMMUNITY_LINKS.discord, icon: 'brand:discord' },
    { id: 'patreon', label: 'Patreon', url: DEFAULT_COMMUNITY_LINKS.patreon, icon: 'brand:patreon' },
    { id: 'github', label: 'GitHub', url: REPOSITORY_URL, icon: 'lucide:github' },
];
const copyLinks = (links: readonly CommunityLink[]): CommunityLink[] => links.map(link => ({ ...link }));
const record = (value: unknown): Record<string, unknown> | null => (
    value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
);

/** Any website is supported, while script URLs and embedded credentials are never opened. */
export function isCommunityWebUrl(value: unknown): value is string {
    if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u0020\u007f]/.test(value)) return false;
    try {
        const url = new URL(value);
        return (url.protocol === 'https:' || url.protocol === 'http:') && !!url.hostname && !url.username && !url.password;
    } catch { return false; }
}

function readIcon(value: unknown): string {
    if (typeof value !== 'string') return 'lucide:link';
    if (/^(?:brand:(?:kofi|discord|patreon)|(?:lucide:)?[a-z][a-z0-9-]{0,63})$/.test(value)) return value;
    if (value.startsWith('emoji:') && value.length <= 40 && value.slice(6).trim() && !/[\u0000-\u001f\u007f<>]/.test(value)) return value;
    if (isCommunityWebUrl(value) && value.startsWith('https://')) return value;
    return 'lucide:link';
}

/** Version 2 lists replace the whole menu, including order and removals. Legacy maps remain supported. */
export function readCommunityLinks(value: unknown, fallback: readonly CommunityLink[] = DEFAULT_COMMUNITY_BUTTONS): CommunityLink[] | null {
    if (Array.isArray(value)) {
        if (value.length > 20) return null;
        if (value.length === 0) return [];
        const ids = new Set<string>();
        const links: CommunityLink[] = [];
        for (const raw of value) {
            const entry = record(raw);
            if (!entry || typeof entry.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(entry.id) || ids.has(entry.id)) continue;
            if (typeof entry.label !== 'string' || !entry.label.trim() || entry.label.length > 48 || /[\u0000-\u001f\u007f]/.test(entry.label)) continue;
            if (!isCommunityWebUrl(entry.url)) continue;
            ids.add(entry.id);
            links.push({ id: entry.id, label: entry.label.trim(), url: entry.url, icon: readIcon(entry.icon) });
        }
        return links.length ? links : null;
    }
    const source = record(value);
    if (!source) return null;
    const result = copyLinks(fallback);
    let found = false;
    for (const link of result) {
        if (!isCommunityWebUrl(source[link.id])) continue;
        link.url = source[link.id] as string;
        found = true;
    }
    return found ? result : null;
}

async function fetchCommunityLinks(): Promise<unknown> {
    const response = await requestUrl({
        url: COMMUNITY_LINKS_URL, method: 'GET', throw: false,
        headers: { Accept: 'application/vnd.github.raw+json' },
    });
    if (response.status !== 200 || response.text.length > 32_768) throw new Error('Community links unavailable');
    return JSON.parse(response.text);
}

/** Only public link data is downloaded; offline users retain their last valid addresses. */
export class CommunityLinksService {
    private links: CommunityLink[];
    private updatedAt = 0;
    private retryAt = 0;
    private pending?: Promise<CommunityLink[]>;

    constructor(cache: unknown, private readonly persist: (cache: CommunityLinkCache) => Promise<void>,
        private readonly fetchLinks: () => Promise<unknown> = fetchCommunityLinks) {
        const stored = record(cache);
        const cachedLinks = readCommunityLinks(stored?.links);
        this.links = cachedLinks ?? copyLinks(DEFAULT_COMMUNITY_BUTTONS);
        if (cachedLinks && typeof stored?.updatedAt === 'number' && Number.isFinite(stored.updatedAt)
            && stored.updatedAt > 0 && stored.updatedAt <= Date.now()) this.updatedAt = stored.updatedAt;
    }

    get current(): CommunityLink[] { return copyLinks(this.links); }

    refresh(): Promise<CommunityLink[]> {
        if (this.pending) return this.pending;
        const now = Date.now();
        if (now < this.retryAt || (this.updatedAt > 0 && now - this.updatedAt < COMMUNITY_LINK_REFRESH_MS)) return Promise.resolve(this.current);
        this.retryAt = now + RETRY_MS;
        this.pending = this.load(now).finally(() => { this.pending = undefined; });
        return this.pending;
    }

    private async load(now: number): Promise<CommunityLink[]> {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Community links timeout')), TIMEOUT_MS); });
            const payload = record(await Promise.race([this.fetchLinks(), timeout]));
            if (payload?.version !== 1 && payload?.version !== 2) return this.current;
            if (payload.version === 2 && !Array.isArray(payload.links)) return this.current;
            const links = readCommunityLinks(payload.links, this.links);
            if (!links) return this.current;
            this.links = links;
            this.updatedAt = now;
            try { await this.persist({ updatedAt: now, links: this.current }); } catch { /* Keep valid in-memory links if caching fails. */ }
        } catch { /* Network errors and unpublished files use cached or bundled links. */ }
        finally { if (timer !== undefined) clearTimeout(timer); }
        return this.current;
    }
}

