import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { requestUrl } from 'obsidian';
import { COMMUNITY_LINK_REFRESH_MS, COMMUNITY_LINKS_URL, CommunityLinksService, DEFAULT_COMMUNITY_BUTTONS, DEFAULT_COMMUNITY_LINKS, readCommunityLinks } from '../src/services/CommunityLinksService';

vi.mock('obsidian', () => ({ requestUrl: vi.fn() }));
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-05T12:00:00Z')); vi.mocked(requestUrl).mockReset(); });
afterEach(() => { vi.useRealTimers(); });
const custom = { id: 'website', label: 'My website', url: 'https://creator.example/', icon: 'lucide:globe' };
const payload = (links = [custom]) => ({ version: 2, links });
const discordUrl = (service: CommunityLinksService) => service.current.find(link => link.id === 'discord')?.url;

describe('community link data', () => {
    it('ships an editable menu with names, addresses and icons', () => {
        const file = JSON.parse(readFileSync('community-links.json', 'utf8'));
        expect(file.version).toBe(2);
        expect(Array.isArray(file.links)).toBe(true);
        // This published file is edited independently of the bundled fallbacks.
        expect(readCommunityLinks(file.links)).toHaveLength(file.links.length);
    });
    it.each(['javascript:alert(1)', 'data:text/html,test', 'file:///C:/test', 'https://user:pass@example.com/', 'https://example.com/a\nb', '/invite/abc', 'not-a-url'])('rejects non-web or malformed addresses: %s', url => {
        expect(readCommunityLinks([{ ...custom, url }])).toBeNull();
    });
    it('supports any website, root URLs and custom HTTP ports', () => {
        const links = [custom, { ...custom, id: 'local-site', url: 'http://localhost:8080/' }];
        expect(readCommunityLinks(links)).toEqual(links);
    });
    it.each(['lucide:heart', 'globe', 'brand:discord', 'emoji:☕', 'https://assets.example/custom.svg'])('supports custom icon format %s', icon => {
        expect(readCommunityLinks([{ ...custom, icon }])?.[0].icon).toBe(icon);
    });
    it.each(['<svg onload="alert(1)">', 'javascript:alert(1)', 'data:image/svg+xml,test', 'http://assets.example/icon.png', 'emoji:<img>'])('uses a plain link fallback for unsupported icon data %s', icon => {
        expect(readCommunityLinks([{ ...custom, icon }])?.[0].icon).toBe('lucide:link');
    });
    it('preserves configured order and allows removing every default button', () => {
        const links = [{ ...custom, id: 'second', label: 'Second' }, custom];
        expect(readCommunityLinks(links)).toEqual(links);
        expect(readCommunityLinks([])).toEqual([]);
    });
    it('skips duplicate ids and invalid entries without evaluating labels as markup', () => {
        const label = '<b>Website</b>';
        expect(readCommunityLinks([{ ...custom, label }, { ...custom, label: 'Duplicate' }, { ...custom, id: 'bad id' }, { ...custom, id: 'empty', label: ' ' }]))
            .toEqual([{ ...custom, label }]);
        expect(readCommunityLinks(Array.from({ length: 21 }, (_, i) => ({ ...custom, id: String(i) })))).toBeNull();
    });
    it('migrates legacy link maps while allowing a website outside the old brand hosts', () => {
        const links = readCommunityLinks({ discord: 'https://community.example/' });
        expect(links?.find(link => link.id === 'discord')?.url).toBe('https://community.example/');
        expect(links?.find(link => link.id === 'kofi')?.url).toBe(DEFAULT_COMMUNITY_LINKS.kofi);
    });
});

describe('community link refresh', () => {
    it('deduplicates requests and persists the complete customized menu', async () => {
        let resolve!: (value: unknown) => void;
        const fetch = vi.fn(() => new Promise<unknown>(done => { resolve = done; }));
        const persist = vi.fn(async () => {});
        const service = new CommunityLinksService(undefined, persist, fetch);
        const first = service.refresh();
        expect(service.refresh()).toBe(first);
        expect(fetch).toHaveBeenCalledOnce();
        resolve(payload()); await first;
        expect(service.current).toEqual([custom]);
        expect(persist).toHaveBeenCalledWith({ updatedAt: Date.now(), links: [custom] });
        await service.refresh(); expect(fetch).toHaveBeenCalledOnce();
        const exposed = service.current; exposed[0].url = 'https://modified.example/';
        expect(service.current).toEqual([custom]);
    });
    it('uses the persisted cache for one hour before refreshing', async () => {
        const fetch = vi.fn(async () => payload());
        const service = new CommunityLinksService({ updatedAt: Date.now(), links: DEFAULT_COMMUNITY_BUTTONS }, async () => {}, fetch);
        await vi.advanceTimersByTimeAsync(COMMUNITY_LINK_REFRESH_MS - 1);
        await service.refresh(); expect(fetch).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1); await service.refresh();
        expect(fetch).toHaveBeenCalledOnce(); expect(service.current).toEqual([custom]);
    });
    it('keeps a saved empty menu empty and honors its cache lifetime', async () => {
        const fetch = vi.fn(async () => payload());
        const service = new CommunityLinksService({ updatedAt: Date.now(), links: [] }, async () => {}, fetch);
        await service.refresh();
        expect(fetch).not.toHaveBeenCalled(); expect(service.current).toEqual([]);
    });
    it('loads legacy cached addresses and version 1 partial updates', async () => {
        const service = new CommunityLinksService({ updatedAt: Date.now() - COMMUNITY_LINK_REFRESH_MS, links: { ...DEFAULT_COMMUNITY_LINKS, discord: 'https://discord.gg/cached' } },
            async () => {}, async () => ({ version: 1, links: { discord: 'https://discord.gg/latest' } }));
        expect(discordUrl(service)).toBe('https://discord.gg/cached');
        await service.refresh();
        expect(discordUrl(service)).toBe('https://discord.gg/latest');
    });
    it('keeps last valid links offline and throttles failed requests', async () => {
        const fetch = vi.fn(async () => { throw new Error('offline'); });
        const persist = vi.fn(async () => {});
        const service = new CommunityLinksService({ updatedAt: Date.now() - COMMUNITY_LINK_REFRESH_MS, links: [custom] }, persist, fetch);
        expect(await service.refresh()).toEqual([custom]);
        await service.refresh(); expect(fetch).toHaveBeenCalledOnce(); expect(persist).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(10 * 60 * 1000); await service.refresh(); expect(fetch).toHaveBeenCalledTimes(2);
    });
    it.each([{ version: 3, links: [custom] }, { version: 2, links: {} }, { version: 2, links: [{ ...custom, url: 'javascript:alert(1)' }] }, null, []])('ignores malformed or unsupported data: %j', async remote => {
        const persist = vi.fn(async () => {});
        const service = new CommunityLinksService(undefined, persist, async () => remote);
        expect(await service.refresh()).toEqual(DEFAULT_COMMUNITY_BUTTONS); expect(persist).not.toHaveBeenCalled();
    });
    it('applies an explicitly empty remote menu and saves it', async () => {
        const persist = vi.fn(async () => {});
        const service = new CommunityLinksService(undefined, persist, async () => payload([]));
        expect(await service.refresh()).toEqual([]);
        expect(persist).toHaveBeenCalledWith({ updatedAt: Date.now(), links: [] });
    });
    it('returns cached links after four seconds and ignores a late response', async () => {
        let resolve!: (value: unknown) => void;
        const persist = vi.fn(async () => {});
        const service = new CommunityLinksService(undefined, persist, () => new Promise(done => { resolve = done; }));
        const refreshed = service.refresh();
        await vi.advanceTimersByTimeAsync(4000);
        expect(await refreshed).toEqual(DEFAULT_COMMUNITY_BUTTONS);
        resolve(payload()); await Promise.resolve();
        expect(service.current).toEqual(DEFAULT_COMMUNITY_BUTTONS); expect(persist).not.toHaveBeenCalled();
    });
    it('uses the public contents endpoint without credentials or vault data', async () => {
        vi.mocked(requestUrl).mockResolvedValue({ status: 200, text: JSON.stringify(payload()) } as any);
        const service = new CommunityLinksService(undefined, async () => {});
        await service.refresh();
        expect(requestUrl).toHaveBeenCalledWith({ url: COMMUNITY_LINKS_URL, method: 'GET', throw: false, headers: { Accept: 'application/vnd.github.raw+json' } });
        expect(service.current).toEqual([custom]);
    });
    it.each([{ status: 404, text: '{}' }, { status: 403, text: '{}' }, { status: 200, text: '<html>Unavailable</html>' }, { status: 200, text: 'x'.repeat(32769) }])('keeps bundled links when the endpoint is unavailable', async response => {
        vi.mocked(requestUrl).mockResolvedValue(response as any);
        const service = new CommunityLinksService(undefined, async () => {});
        expect(await service.refresh()).toEqual(DEFAULT_COMMUNITY_BUTTONS);
    });
    it('keeps a valid update usable when caching to disk fails', async () => {
        const service = new CommunityLinksService(undefined, async () => { throw new Error('disk full'); }, async () => payload());
        await service.refresh(); expect(service.current).toEqual([custom]);
    });
});

