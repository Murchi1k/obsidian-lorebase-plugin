import { App, TFolder, requestUrl } from 'obsidian';
import type { IntegrationTemplateSettings } from '../../types';
import { getHowLongToBeatTimes } from './providers/howlongtobeat';
import type { JsonFetcher } from './providers/common';

type RequestMethod = 'GET' | 'POST';
type PartLike = {
    id: string;
    kind: string;
    title: string;
    seasonNumber: number | null;
    episodeCurrent: number | null;
    episodeTotal: number | null;
    status: string;
};

type MangaPartLike = {
    id: string;
    kind: string;
    title: string;
    volumeNumber: number | null;
    chapterCurrent: number | null;
    chapterTotal: number | null;
    status: string;
};

interface FetchJsonOptions {
    errorPrefix?: string;
    swallowErrors?: boolean;
    rateLimitMessage?: string;
    htmlJsonMessage?: string;
}

export async function fetchJson(
    url: string,
    headers: Record<string, string> = {},
    method: RequestMethod = 'GET',
    body?: string,
    options: FetchJsonOptions = {}
): Promise<unknown> {
    let response: Awaited<ReturnType<typeof requestUrl>>;
    try {
        const requestOptions: { url: string; method: RequestMethod; headers: Record<string, string>; body?: string } = {
            url,
            method,
            headers,
        };
        if (body !== undefined) {
            requestOptions.body = body;
        }
        response = await requestUrl(requestOptions);
    } catch (error) {
        if (options.rateLimitMessage && isStatusError(error, 429)) {
            throw new Error(options.rateLimitMessage);
        }
        if (options.swallowErrors) {
            return null;
        }
        throw error;
    }

    try {
        return response.json;
    } catch (error) {
        const text = response.text?.trim() ?? '';
        if (options.htmlJsonMessage && (text.startsWith('<!DOCTYPE') || text.startsWith('<html'))) {
            throw new Error(options.htmlJsonMessage);
        }
        if (options.swallowErrors) {
            return null;
        }
        throw error;
    }
}

export function getJsonFetcher(fetcher: JsonFetcher): JsonFetcher {
    return fetcher;
}

export async function ensureFolder(app: App, folderPath: string): Promise<void> {
    if (!folderPath) return;
    const existing = app.vault.getAbstractFileByPath(folderPath);
    if (existing instanceof TFolder) return;
    if (existing) return;
    await app.vault.createFolder(folderPath);
}

export function shouldLoadHowLongToBeat(mediaSettings: IntegrationTemplateSettings, template = mediaSettings.template): boolean {
    if (!mediaSettings.templateEnabled) return false;
    if (!mediaSettings.howLongToBeatEnabled) return false;

    const mode = mediaSettings.templateMode ?? 'advanced';
    if (mode === 'simple') {
        return true;
    }

    return /\{\{VALUE:(main|main_plus_sides|perfectionist|completionist)\}\}/.test(template);
}

export async function fetchHowLongToBeatValues(
    fetcher: JsonFetcher,
    name: string,
    year: string | undefined,
    logPrefix: string
): Promise<{
    main: string;
    main_plus_sides: string;
    perfectionist: string;
} | null> {
    try {
        return await getHowLongToBeatTimes(fetcher, name, year);
    } catch (error) {
        console.warn(`${logPrefix} howlongtobeat failed`, error);
        return null;
    }
}

export function renderPartsYaml(parts: PartLike[]): string {
    if (!parts.length) return '  []';
    return parts.map((part) => [
        `  - id: "${escapeYaml(part.id)}"`,
        `    kind: "${part.kind}"`,
        `    title: "${escapeYaml(part.title)}"`,
        `    season: ${part.seasonNumber ?? 'null'}`,
        `    episode_current: ${part.episodeCurrent ?? 0}`,
        `    episode_total: ${part.episodeTotal ?? 'null'}`,
        `    status: "${part.status}"`,
    ].join('\n')).join('\n');
}

export function renderMangaPartsYaml(parts: MangaPartLike[]): string {
    if (!parts.length) return '  []';
    return parts.map((part) => [
        `  - id: "${escapeYaml(part.id)}"`,
        `    kind: "${part.kind}"`,
        `    title: "${escapeYaml(part.title)}"`,
        `    volume: ${part.volumeNumber ?? 'null'}`,
        `    chapter_current: ${part.chapterCurrent ?? 0}`,
        `    chapter_total: ${part.chapterTotal ?? 'null'}`,
        `    status: "${part.status}"`,
    ].join('\n')).join('\n');
}

export async function imageUrlExists(url: string): Promise<boolean> {
    if (!url) return false;

    try {
        const response = await requestUrl({ url, method: 'HEAD' });
        return response.status >= 200 && response.status < 300;
    } catch {
        return false;
    }
}

function escapeYaml(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).replace(/"/g, '\\"');
}

function isStatusError(error: unknown, status: number): boolean {
    if (!(error instanceof Error)) return false;
    const message = error.message.toLowerCase();
    return message.includes(`status ${status}`) || message.includes(`status: ${status}`);
}
