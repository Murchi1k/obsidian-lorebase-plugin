import { getTemplateYamlKeys, orderTemplateFrontmatter } from './templateSchema';
import { App, TFile, TFolder } from 'obsidian';
import type { IntegrationImageStorageSettings, LorebaseSettings } from '../../types';
import type { MediaKind, TemplateKind } from './types';
import { coverImageExtension, createCoverImage } from './imageBinary';
import { requestWithDeadline } from './requestDeadline';
import { isOperationCancelled, type BackgroundOperation } from '../BackgroundOperation';
import { getAllMarkdownFiles } from '../media/serviceUtils';
import { fetchBinary } from './shared';
import { applyFrontmatterAliases, parseTemplateFieldAliases, remapFrontmatterUpdates } from '../media/templateFieldAliases';
import { TEMPLATE_MEDIA_TYPES } from './templatePreferences';

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
    movies: [
        { key: 'Poster', label: 'Poster' },
        { key: 'PosterHorizontal', label: 'Horizontal' },
    ],
    series: [
        { key: 'Poster', label: 'Poster' },
        { key: 'PosterHorizontal', label: 'Horizontal' },
    ],
    books: [
        { key: 'Poster', label: 'Poster' },
        { key: 'PosterHorizontal', label: 'Horizontal' },
    ],
    manga: [
        { key: 'Poster', label: 'Poster' },
        { key: 'PosterHorizontal', label: 'Horizontal' },
    ],
};

const FRONTMATTER_IMAGE_FIELDS: Record<TemplateKind, Array<{ key: string; label: string }>> = {
    music: [
        { key: 'poster', label: 'Poster' },
        { key: 'poster_b', label: 'Horizontal' },
    ],
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
    movies: [
        { key: 'poster', label: 'Poster' },
        { key: 'poster_b', label: 'Horizontal' },
    ],
    series: [
        { key: 'poster', label: 'Poster' },
        { key: 'poster_b', label: 'Horizontal' },
    ],
    books: [
        { key: 'poster', label: 'Poster' },
        { key: 'poster_b', label: 'Horizontal' },
    ],
    manga: [
        { key: 'poster', label: 'Poster' },
        { key: 'poster_b', label: 'Horizontal' },
    ],
};

export interface ExistingImageLocalizationResult {
    cancelled?: boolean;
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
    template: string,
    signal?: AbortSignal
): Promise<Record<string, unknown>> {
    const forceLocalMangaDex = kind === 'manga' && Object.values(values).some((value) => (
        typeof value === 'string' && isMangaDexCoverUrl(value)
    ));
    if (!settings?.enabled && !forceLocalMangaDex) return values;

    const baseFolder = normalizeVaultPath(settings?.folderPath || 'files/lorebase/images');
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
                signal,
            });
            downloadedByUrl.set(url, localPath);
            nextValues[field.key] = localPath;
        } catch (error) {
            if (isOperationCancelled(error)) throw error;
            console.warn('[Lorebase] Failed to save remote image locally:', url, error);
        }
    }

    return nextValues;
}

export async function saveManualImageFileToVault(
    app: App,
    file: File,
    params: { baseFolder: string; kind: MediaKind | 'music'; title: string; label: string; signal?: AbortSignal }
): Promise<string> {
    const baseFolder = normalizeVaultPath(params.baseFolder || 'files/lorebase/images');
    const folderPath = normalizeVaultPath(`${baseFolder}/${params.kind}`);
    if (file.size > 20 * 1024 * 1024) throw new Error('Cover images must not exceed 20 MB.');
    const buffer = await file.arrayBuffer();
    coverImageExtension(buffer, file.type);
    await ensureFolder(app, folderPath);
    return createCoverImage(app, folderPath, params.title, params.label, buffer, file.type, params.signal);
}

export async function localizeExistingNoteImages(
    app: App,
    settings: LorebaseSettings,
    operation?: BackgroundOperation
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
        ...getLibraryFiles(app, settings.movies.folderPath, 'movies'),
        ...getLibraryFiles(app, settings.series.folderPath, 'series'),
        ...getLibraryFiles(app, settings.books.folderPath, 'books'),
        ...getLibraryFiles(app, settings.manga.folderPath, 'manga'),
        ...getLibraryFiles(app, settings.music.folderPath, 'music'),
    ];
    const seen = new Set<string>();

    for (const entry of files) {
        if (seen.has(entry.file.path)) continue;
        seen.add(entry.file.path);
        result.scanned++;

        try {
            operation?.check();
            const cache = app.metadataCache.getFileCache(entry.file);
            const metadata = cache?.frontmatter;
            if (!metadata) continue;
            const expected = { ...metadata };
            const config = entry.kind === 'music' ? settings.music.noteTemplate : settings.integrations?.media[entry.kind];
            const aliases = config?.templateMode === 'advanced'
                ? parseTemplateFieldAliases(TEMPLATE_MEDIA_TYPES[entry.kind], config.template)
                : config?.fieldAliases ?? {};
            const resolved = applyFrontmatterAliases(metadata, aliases);

            const download = () => buildFrontmatterImageUpdates(app, {
                metadata: resolved,
                kind: entry.kind,
                title: getNoteTitle(entry.file, resolved),
                baseFolder,
                signal: operation?.signal,
            });
            const updates = remapFrontmatterUpdates(await (operation ? operation.wait(download) : download()), aliases);

            if (Object.keys(updates).length === 0) continue;

            let applied = 0;
            await app.fileManager.processFrontMatter(entry.file, (frontmatter: Record<string, unknown>) => {
                operation?.check();
                for (const [key, value] of Object.entries(updates)) {
                    if (frontmatter[key] !== expected[key]) continue;
                    frontmatter[key] = value;
                    applied++;
                }
                if (config?.templateEnabled) orderTemplateFrontmatter(frontmatter, getTemplateYamlKeys(config.template), {}, { compact: settings.integrations?.compactTemplates });
            });

            if (applied) result.updated++;
            result.downloaded += applied;
        } catch (error) {
            if (isOperationCancelled(error)) { result.cancelled = true; break; }
            result.failed++;
            console.warn('[Lorebase] Failed to localize existing note images:', entry.file.path, error);
        }
    }

    return result;
}

function getLibraryFiles(app: App, folderPath: string, kind: TemplateKind): Array<{ file: TFile; kind: TemplateKind }> {
    const folder = app.vault.getAbstractFileByPath(folderPath);
    if (!(folder instanceof TFolder)) return [];
    return getAllMarkdownFiles(folder).map((file) => ({ file, kind }));
}

async function buildFrontmatterImageUpdates(
    app: App,
    params: {
        metadata: Record<string, unknown>;
        kind: TemplateKind;
        title: string;
        baseFolder: string;
        signal?: AbortSignal;
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
            signal: params.signal,
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
    params: { url: string; baseFolder: string; kind: TemplateKind; title: string; label: string; signal?: AbortSignal }
): Promise<string> {
    const response = await requestWithDeadline(() => fetchBinary(params.url), undefined, params.signal);
    const contentType = Object.entries(response.headers ?? {}).find(([key]) => key.toLowerCase() === 'content-type')?.[1] ?? '';
    coverImageExtension(response.arrayBuffer, contentType);
    const folderPath = normalizeVaultPath(`${params.baseFolder}/${params.kind}`);
    await ensureFolder(app, folderPath);
    return createCoverImage(app, folderPath, params.title, params.label, response.arrayBuffer, contentType, params.signal);
}

async function ensureFolder(app: App, folderPath: string): Promise<void> {
    const parts = normalizeVaultPath(folderPath).split('/').filter(Boolean);
    let current = '';

    for (const part of parts) {
        current = current ? `${current}/${part}` : part;
        const existing = app.vault.getAbstractFileByPath(current);
        if (existing instanceof TFolder) continue;
        if (existing) throw new Error(`An existing file blocks the image folder: ${current}`);
        try { await app.vault.createFolder(current); }
        catch (error) { if (!(app.vault.getAbstractFileByPath(current) instanceof TFolder)) throw error; }
    }
}

function isRemoteImageUrl(value: string): boolean {
    return /^https?:\/\//i.test(value);
}

function isMangaDexCoverUrl(value: string): boolean {
    return /^https:\/\/uploads\.mangadex\.org\/covers\//i.test(value);
}

function normalizeVaultPath(path: string): string {
    const normalized = path.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');
    if (/^[a-z]:/i.test(normalized) || normalized.includes('\0') || normalized.split('/').some(part => part === '..' || part === '.')) {
        throw new Error('Choose an image folder inside the vault using a relative path.');
    }
    return normalized;
}
