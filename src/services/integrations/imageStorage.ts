import { App, TFile, TFolder, requestUrl } from 'obsidian';
import type { IntegrationImageStorageSettings, LorebaseSettings } from '../../types';
import type { MediaKind } from './types';
import { sanitizeFileName } from './templateUtils';
import { getAllMarkdownFiles } from '../media/serviceUtils';

type ImageValueKey = 'Poster' | 'PosterHorizontal' | 'image' | 'ImageHorizontal';

const IMAGE_FIELDS: Record<MediaKind, Array<{ key: ImageValueKey; label: string }>> = {
    games: [
        { key: 'Poster', label: 'Poster' },
        { key: 'PosterHorizontal', label: 'Horizontal' },
    ],
    anime: [
        { key: 'image', label: 'Image' },
        { key: 'ImageHorizontal', label: 'Horizontal' },
    ],
};

const FRONTMATTER_IMAGE_FIELDS: Record<MediaKind, Array<{ key: string; label: string }>> = {
    games: [
        { key: 'poster', label: 'Poster' },
        { key: 'poster_b', label: 'Horizontal' },
    ],
    anime: [
        { key: 'image', label: 'Image' },
        { key: 'image_b', label: 'Horizontal' },
        { key: 'poster', label: 'Poster' },
        { key: 'poster_b', label: 'Horizontal' },
    ],
};

export interface ExistingImageLocalizationResult {
    scanned: number;
    updated: number;
    downloaded: number;
    failed: number;
}

export async function localizeTemplateImages(
    app: App,
    kind: MediaKind,
    title: string,
    values: Record<string, unknown>,
    settings: IntegrationImageStorageSettings | undefined,
    template: string
): Promise<Record<string, unknown>> {
    if (!settings?.enabled) return values;

    const baseFolder = normalizeVaultPath(settings.folderPath || 'files/lorebase/images');
    if (!baseFolder) return values;

    const nextValues = { ...values };
    const downloadedByUrl = new Map<string, string>();

    for (const field of IMAGE_FIELDS[kind]) {
        if (!template.includes(`{{VALUE:${field.key}}}`)) continue;

        const rawValue = nextValues[field.key];
        const url = typeof rawValue === 'string' ? rawValue.trim() : '';
        if (!isRemoteImageUrl(url)) continue;

        const cachedPath = downloadedByUrl.get(url);
        if (cachedPath) {
            nextValues[field.key] = cachedPath;
            continue;
        }

        try {
            const localPath = await downloadImageToVault(app, {
                url,
                baseFolder,
                kind,
                title,
                label: field.label,
            });
            downloadedByUrl.set(url, localPath);
            nextValues[field.key] = localPath;
        } catch (error) {
            console.warn('[Lorebase] Failed to save remote image locally:', url, error);
        }
    }

    return nextValues;
}

export async function localizeExistingNoteImages(
    app: App,
    settings: LorebaseSettings
): Promise<ExistingImageLocalizationResult> {
    const storageSettings = settings.integrations?.imageStorage;
    const baseFolder = normalizeVaultPath(storageSettings?.folderPath || 'files/lorebase/images');
    const result: ExistingImageLocalizationResult = {
        scanned: 0,
        updated: 0,
        downloaded: 0,
        failed: 0,
    };

    if (!baseFolder) return result;

    const files = [
        ...getLibraryFiles(app, settings.games.folderPath, 'games'),
        ...getLibraryFiles(app, settings.anime.folderPath, 'anime'),
    ];
    const seen = new Set<string>();

    for (const entry of files) {
        if (seen.has(entry.file.path)) continue;
        seen.add(entry.file.path);
        result.scanned++;

        try {
            const cache = app.metadataCache.getFileCache(entry.file);
            const metadata = cache?.frontmatter as Record<string, unknown> | undefined;
            if (!metadata) continue;

            const updates = await buildFrontmatterImageUpdates(app, {
                metadata,
                kind: entry.kind,
                title: getNoteTitle(entry.file, metadata),
                baseFolder,
            });

            if (Object.keys(updates).length === 0) continue;

            await app.fileManager.processFrontMatter(entry.file, (frontmatter: Record<string, unknown>) => {
                for (const [key, value] of Object.entries(updates)) {
                    frontmatter[key] = value;
                }
            });

            result.updated++;
            result.downloaded += Object.keys(updates).length;
        } catch (error) {
            result.failed++;
            console.warn('[Lorebase] Failed to localize existing note images:', entry.file.path, error);
        }
    }

    return result;
}

function getLibraryFiles(app: App, folderPath: string, kind: MediaKind): Array<{ file: TFile; kind: MediaKind }> {
    const folder = app.vault.getAbstractFileByPath(folderPath);
    if (!(folder instanceof TFolder)) return [];
    return getAllMarkdownFiles(folder).map((file) => ({ file, kind }));
}

async function buildFrontmatterImageUpdates(
    app: App,
    params: {
        metadata: Record<string, unknown>;
        kind: MediaKind;
        title: string;
        baseFolder: string;
    }
): Promise<Record<string, string>> {
    const updates: Record<string, string> = {};
    const downloadedByUrl = new Map<string, string>();

    for (const field of FRONTMATTER_IMAGE_FIELDS[params.kind]) {
        const rawValue = params.metadata[field.key];
        const url = typeof rawValue === 'string' ? rawValue.trim() : '';
        if (!isRemoteImageUrl(url)) continue;

        const cachedPath = downloadedByUrl.get(url);
        if (cachedPath) {
            updates[field.key] = cachedPath;
            continue;
        }

        const localPath = await downloadImageToVault(app, {
            url,
            baseFolder: params.baseFolder,
            kind: params.kind,
            title: params.title,
            label: field.label,
        });
        downloadedByUrl.set(url, localPath);
        updates[field.key] = localPath;
    }

    return updates;
}

function getNoteTitle(file: TFile, metadata: Record<string, unknown>): string {
    const title = metadata.name ?? metadata.title;
    return typeof title === 'string' && title.trim() ? title.trim() : file.basename;
}

async function downloadImageToVault(
    app: App,
    params: { url: string; baseFolder: string; kind: MediaKind; title: string; label: string }
): Promise<string> {
    const response = await requestUrl({ url: params.url, method: 'GET' });
    const extension = getImageExtension(params.url, response.headers?.['content-type']);
    const folderPath = normalizeVaultPath(`${params.baseFolder}/${params.kind}`);
    const titlePart = sanitizeFileName(params.title) || 'Untitled';
    const labelPart = sanitizeFileName(params.label) || 'Image';
    const filePath = normalizeVaultPath(`${folderPath}/${titlePart} - ${labelPart}.${extension}`);

    await ensureFolder(app, folderPath);
    await app.vault.adapter.writeBinary(filePath, response.arrayBuffer);

    return filePath;
}

async function ensureFolder(app: App, folderPath: string): Promise<void> {
    const parts = normalizeVaultPath(folderPath).split('/').filter(Boolean);
    let current = '';

    for (const part of parts) {
        current = current ? `${current}/${part}` : part;
        const existing = app.vault.getAbstractFileByPath(current);
        if (existing instanceof TFolder) continue;
        if (existing) return;
        await app.vault.createFolder(current);
    }
}

function isRemoteImageUrl(value: string): boolean {
    return /^https?:\/\//i.test(value);
}

function normalizeVaultPath(path: string): string {
    return path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/').trim();
}

function getImageExtension(url: string, contentType?: string): string {
    const normalizedContentType = contentType?.toLowerCase() ?? '';
    if (normalizedContentType.includes('image/png')) return 'png';
    if (normalizedContentType.includes('image/webp')) return 'webp';
    if (normalizedContentType.includes('image/gif')) return 'gif';
    if (normalizedContentType.includes('image/jpeg') || normalizedContentType.includes('image/jpg')) return 'jpg';

    try {
        const pathname = new URL(url).pathname;
        const match = pathname.match(/\.([a-z0-9]+)$/i);
        const ext = match?.[1]?.toLowerCase();
        if (ext === 'jpeg') return 'jpg';
        if (ext && ['jpg', 'png', 'webp', 'gif'].includes(ext)) return ext;
    } catch {
        // Fall back below.
    }

    return 'jpg';
}
