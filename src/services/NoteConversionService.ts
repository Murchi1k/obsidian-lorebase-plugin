import { scheduleTimeout } from '../utils/timers';
import { App, TFile, TFolder } from 'obsidian';
import type { LorebaseSettings, NoteImportFieldMapping, NoteImportSettings, NoteImportTargetMedia } from '../types';
import { sanitizeFileName } from './integrations/templateUtils';
import { ensureFolder } from './integrations/shared';
import { getAllMarkdownFiles } from './media/serviceUtils';
import type { MediaSourceSelection } from './integrations/types';
import { mergeProviderMetadata } from './integrations/enrichment';
import { getTemplateYamlKeys, orderTemplateFrontmatter } from './integrations/templateSchema';
import { MUSIC_NOTE_IMPORT_FIELD_MAPPINGS } from '../constants';
import { OperationLifetime, isOperationCancelled, type BackgroundOperation } from './BackgroundOperation';

export interface NoteImportPreviewItem {
    id: string;
    sourcePath: string;
    targetPath: string;
    title: string;
    poster: string | null;
    renamed: Array<{ from: string; to: string }>;
    kept: string[];
    removed: string[];
    warnings: string[];
    canImport: boolean;
    nextFrontmatter: Record<string, unknown>;
    targetMedia: Exclude<NoteImportTargetMedia, 'auto'> | null;
    source?: MediaSourceSelection | null;
}

export interface NoteImportPreview {
    items: NoteImportPreviewItem[];
    warnings: string[];
}

export interface NoteImportApplyResult {
    cancelled?: boolean;
    created: number;
    updated: number;
    skipped: number;
    failed: number;
}

export interface NoteImportReviewResult {
    selectedIds: Set<string>;
    targetMediaById: Record<string, Exclude<NoteImportTargetMedia, 'auto'>>;
    sourcesById: Record<string, MediaSourceSelection>;
}

interface PreparedNote extends NoteImportPreviewItem {
    file: TFile;
}

export class NoteConversionService {
    private readonly operations = new OperationLifetime();
    constructor(private readonly app: App, private readonly currentSettings?: () => LorebaseSettings) {}
    dispose(): void { this.operations.dispose(); }
    private context(value: LorebaseSettings): string {
        return JSON.stringify({ import: value.noteImport,
            folders: [value.games, value.anime, value.movies, value.series, value.books, value.manga, value.music].map(config => config.folderPath) });
    }

    async preview(settings: LorebaseSettings, signal?: AbortSignal): Promise<NoteImportPreview> {
        const operation = this.operations.begin(() => this.context(this.currentSettings?.() ?? settings), signal, undefined, this.context(settings));
        try {
            const prepared = await operation.wait(() => this.prepare(settings.noteImport, settings, {}, {}, operation));
            return {
                items: prepared.map(({ file: _file, ...item }) => item),
                warnings: this.getSettingsWarnings(settings.noteImport),
            };
        } finally { operation.close(); }
    }

    async apply(
        settings: LorebaseSettings,
        selection: Set<string> | NoteImportReviewResult,
        enrichmentsOrProgress: Record<string, Record<string, unknown>> | ((message: string) => void) = {},
        onProgress?: (message: string) => void,
        signal?: AbortSignal
    ): Promise<NoteImportApplyResult> {
        const enrichments = typeof enrichmentsOrProgress === 'function' ? {} : enrichmentsOrProgress;
        const progress = typeof enrichmentsOrProgress === 'function' ? enrichmentsOrProgress : onProgress;
        const selectedIds = selection instanceof Set ? selection : selection.selectedIds;
        const targetOverrides = selection instanceof Set ? {} : selection.targetMediaById;
        const expected = this.context(settings);
        const operation = this.operations.begin(() => this.context(this.currentSettings?.() ?? settings), signal, undefined, expected);
        if (this.currentSettings && this.context(this.currentSettings()) !== expected) { operation.close(); throw new Error('Import settings changed. Open the preview again.'); }
        try {
            const prepared = await operation.wait(() => this.prepare(settings.noteImport, settings, targetOverrides, enrichments, operation));
            const selected = prepared.filter((item) => selectedIds.has(item.id) && item.canImport);
            const result: NoteImportApplyResult = { created: 0, updated: 0, skipped: 0, failed: 0 };

            for (const item of selected) {
                try {
                    operation.check();
                    progress?.(item.sourcePath);
                    if (settings.noteImport.writeMode === 'replace') {
                        await this.replaceFrontmatter(item.file, item.targetPath, item.nextFrontmatter, operation);
                        result.updated++;
                    } else {
                        await this.createCopy(item.file, item.targetPath, item.nextFrontmatter, operation);
                        result.created++;
                    }
                } catch (error) {
                    if (isOperationCancelled(error)) { result.cancelled = true; result.skipped += selected.length - result.created - result.updated - result.failed; break; }
                    console.error('[LOREBASE Note Import] Failed to import note:', item.sourcePath, error);
                    result.failed++;
                }
            }

            result.skipped += Math.max(0, prepared.length - selected.length);
            return result;
        } finally { operation.close(); }
    }

    buildFrontmatter(
        source: Record<string, unknown>,
        settings: NoteImportSettings
    ): Omit<NoteImportPreviewItem, 'id' | 'sourcePath' | 'targetPath' | 'title' | 'poster' | 'warnings' | 'canImport' | 'targetMedia' | 'source'> {
        const blacklist = new Set(settings.blacklist.map((key) => key.trim()).filter(Boolean));
        const consumed = new Set<string>();
        const next: Record<string, unknown> = {};
        const renamed: Array<{ from: string; to: string }> = [];
        const kept: string[] = [];
        const removed: string[] = [];

        const media = settings.targetMedia === 'auto' ? this.detectTargetMedia(source) : settings.targetMedia;
        const mappings = media === 'music' ? [
            ...settings.fieldMappings.map(mapping => ({ ...mapping, key: mapping.key === 'name' ? 'title' : mapping.key === 'plot' ? 'description' : mapping.key })),
            ...MUSIC_NOTE_IMPORT_FIELD_MAPPINGS.filter(mapping => !settings.fieldMappings.some(item => item.key === mapping.key)),
        ] : settings.fieldMappings;
        for (const mapping of mappings) {
            const foundKey = this.findMappedKey(source, mapping);
            if (!foundKey) continue;
            if (blacklist.has(mapping.key)) {
                consumed.add(foundKey);
                removed.push(foundKey);
                continue;
            }

            next[mapping.key] = source[foundKey];
            consumed.add(foundKey);
            if (foundKey !== mapping.key) renamed.push({ from: foundKey, to: mapping.key });
        }

        for (const [key, value] of Object.entries(source)) {
            if (consumed.has(key)) continue;
            if (blacklist.has(key)) {
                removed.push(key);
                continue;
            }
            if (!Object.prototype.hasOwnProperty.call(next, key)) {
                next[key] = value;
                kept.push(key);
            }
        }

        for (const key of Object.keys(next)) {
            if (!blacklist.has(key)) continue;
            delete next[key];
            if (!removed.includes(key)) removed.push(key);
        }

        const targetType = settings.targetMedia === 'auto'
            ? this.getTargetType(this.detectTargetMedia(source))
            : null;
        if (targetType && !blacklist.has('type')) {
            next.type = targetType;
            if (!kept.includes('type')) kept.push('type');
        }
        if (media === 'music') {
            if (!blacklist.has('type')) next.type = 'music';
            if (typeof next.music_kind === 'string') next.music_kind = next.music_kind.trim().toLowerCase() === 'song' ? 'track' : next.music_kind.trim().toLowerCase();
            if (!blacklist.has('music_kind') && !next.music_kind) {
                const raw = String(source.type ?? '').toLowerCase();
                next.music_kind = ['song', 'track'].includes(raw) || next.parent_track_id ? 'track' : 'album';
            }
            if (Array.isArray(next.tracks)) next.tracks = next.tracks.map((track: unknown, index) => typeof track === 'string'
                ? { id: `import-track-${index + 1}`, title: track }
                : this.isPlainRecord(track) ? { ...track, id: String(track.id ?? `import-track-${index + 1}`), title: track.title ?? track.name ?? '',
                    ...(track.userRating === undefined && track.rating !== undefined ? { userRating: track.rating } : {}) } : track);
        }

        return {
            nextFrontmatter: next,
            renamed,
            kept,
            removed: Array.from(new Set(removed)),
        };
    }

    serializeMarkdownWithFrontmatter(content: string, frontmatter: Record<string, unknown>): string {
        const body = this.extractBody(content);
        const yaml = this.serializeFrontmatter(frontmatter);
        return `---\n${yaml}---\n${body ? `\n${body}` : ''}`;
    }

    private async prepare(
        settings: NoteImportSettings,
        fullSettings: LorebaseSettings,
        targetOverrides: Record<string, Exclude<NoteImportTargetMedia, 'auto'>> = {},
        enrichments: Record<string, Record<string, unknown>> = {},
        operation?: BackgroundOperation
    ): Promise<PreparedNote[]> {
        const sourceFiles = this.getSourceFiles(settings.sourceFolderPath);
        const reservedPaths = new Set<string>();
        const items: PreparedNote[] = [];
        const priorMusicCopies = new Map(this.getSourceFiles(fullSettings.music.folderPath).map(file => [String(this.readFrontmatter(file).lorebase_import_source ?? ''), file.path]));
        let processed = 0;

        for (const file of sourceFiles) {
            if (++processed % 100 === 0) await new Promise<void>(resolve => { scheduleTimeout(resolve, 0); });
            operation?.check();
            const frontmatter = this.readFrontmatter(file);
            const conversion = this.buildFrontmatter(frontmatter, { ...settings, targetMedia: targetOverrides[file.path] ?? settings.targetMedia });
            const incoming = enrichments[file.path] ? { ...enrichments[file.path] } : null;
            if (incoming && conversion.nextFrontmatter.cm_poster) {
                delete incoming.poster;
                delete incoming.poster_b;
            }
            const merged = incoming
                ? mergeProviderMetadata(conversion.nextFrontmatter, incoming, settings.blacklist)
                : null;
            const nextFrontmatter = merged?.values ?? conversion.nextFrontmatter;
            const title = this.getTitle(nextFrontmatter, file);
            const targetMedia = targetOverrides[file.path]
                ?? (settings.targetMedia === 'auto'
                    ? this.detectTargetMedia(frontmatter)
                    : settings.targetMedia);
            if (
                targetOverrides[file.path]
                && !Object.prototype.hasOwnProperty.call(nextFrontmatter, 'type')
                && !settings.blacklist.includes('type')
            ) {
                nextFrontmatter.type = this.getTargetType(targetMedia);
            }
            if (targetMedia) {
                const config = targetMedia === 'music' ? fullSettings.music.noteTemplate : fullSettings.integrations?.media[targetMedia];
                const keys = config?.templateEnabled ? getTemplateYamlKeys(config.template)
                    .filter(key => Object.prototype.hasOwnProperty.call(nextFrontmatter, key)) : [];
                // Respect the importer's explicit field mapping and blacklist; only order existing properties.
                orderTemplateFrontmatter(nextFrontmatter, keys, {}, { compact: fullSettings.integrations?.compactTemplates });
            }
            const musicValid = targetMedia !== 'music' || (nextFrontmatter.type === 'music'
                && ['album', 'track'].includes(String(nextFrontmatter.music_kind))
                && (nextFrontmatter.tracks === undefined || Array.isArray(nextFrontmatter.tracks) && nextFrontmatter.tracks.every(track => this.isPlainRecord(track) && typeof track.title === 'string' && track.title.trim())
                    && new Set(nextFrontmatter.tracks.map(track => (track as Record<string, unknown>).id)).size === nextFrontmatter.tracks.length));
            const priorMusicCopy = targetMedia === 'music' && settings.writeMode === 'copy' ? priorMusicCopies.get(file.path) : undefined;
            const canImport = targetMedia !== null && musicValid && !priorMusicCopy;
            if (targetMedia === 'music' && settings.writeMode === 'copy' && !settings.blacklist.includes('lorebase_import_source')) {
                nextFrontmatter.lorebase_import_source = file.path;
            }
            const targetPath = priorMusicCopy ?? (targetMedia
                ? this.resolveTargetPath(fullSettings[targetMedia].folderPath, title, reservedPaths, settings.writeMode === 'replace' ? file.path : undefined)
                : '');
            if (targetPath) reservedPaths.add(targetPath);
            items.push({
                ...conversion,
                nextFrontmatter,
                file,
                id: file.path,
                sourcePath: file.path,
                targetPath,
                title,
                poster: this.getPoster(nextFrontmatter),
                warnings: [...this.getItemWarnings(frontmatter, nextFrontmatter, settings, targetMedia),
                    ...(!musicValid ? ['Music type or tracklist is invalid. Use album/track, an array of named tracks and unique track IDs.'] : []),
                    ...(priorMusicCopy ? [`This music note was already imported: ${priorMusicCopy}`] : [])],
                canImport,
                targetMedia,
            });
        }

        return items;
    }

    private getSourceFiles(folderPath: string): TFile[] {
        const normalized = folderPath.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
        if (!normalized) return [];
        const entry = this.app.vault.getAbstractFileByPath(normalized);
        if (entry instanceof TFile) return entry.extension === 'md' ? [entry] : [];
        if (entry instanceof TFolder) return getAllMarkdownFiles(entry);
        return [];
    }

    private readFrontmatter(file: TFile): Record<string, unknown> {
        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
        if (!frontmatter || typeof frontmatter !== 'object' || Array.isArray(frontmatter)) return {};
        const clone: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(frontmatter)) {
            if (key === 'position') continue;
            clone[key] = value;
        }
        return clone;
    }

    private findMappedKey(source: Record<string, unknown>, mapping: NoteImportFieldMapping): string | null {
        const aliases = mapping.aliases.includes(mapping.key)
            ? mapping.aliases
            : [mapping.key, ...mapping.aliases];
        const sourceKeys = Object.keys(source);
        for (const alias of aliases) {
            const key = sourceKeys.find((candidate) => candidate.toLowerCase() === alias.toLowerCase());
            if (!key) continue;
            const value = source[key];
            if (value === undefined || value === null || value === '') continue;
            return key;
        }
        return null;
    }

    private detectTargetMedia(frontmatter: Record<string, unknown>): Exclude<NoteImportTargetMedia, 'auto'> | null {
        const raw = String(frontmatter.type ?? '').trim().toLowerCase();
        if (raw === 'game' || raw === 'games') return 'games';
        if (raw === 'anime') return 'anime';
        if (raw === 'movie' || raw === 'movies') return 'movies';
        if (raw === 'series' || raw === 'show' || raw === 'tv') return 'series';
        if (raw === 'book' || raw === 'books') return 'books';
        if (raw === 'manga') return 'manga';
        if (['music', 'album', 'track', 'song'].includes(raw) || ['album', 'track'].includes(String(frontmatter.music_kind ?? frontmatter.musicKind ?? frontmatter.music_type ?? '').trim().toLowerCase())) return 'music';
        return null;
    }

    private getTargetType(targetMedia: Exclude<NoteImportTargetMedia, 'auto'> | null): string | null {
        if (!targetMedia) return null;
        if (targetMedia === 'games') return 'game';
        if (targetMedia === 'movies') return 'movie';
        if (targetMedia === 'books') return 'book';
        return targetMedia;
    }

    private getTitle(frontmatter: Record<string, unknown>, file: TFile): string {
        const raw = frontmatter.name ?? frontmatter.title;
        if (typeof raw === 'string' && raw.trim()) return raw.trim();
        if (raw !== undefined && raw !== null && String(raw).trim()) return String(raw).trim();
        return file.basename || file.name.replace(/\.md$/i, '') || 'Untitled';
    }

    private getPoster(frontmatter: Record<string, unknown>): string | null {
        const raw = frontmatter.poster ?? frontmatter.image ?? frontmatter.poster_b;
        return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
    }

    private resolveTargetPath(folderPath: string, title: string, reservedPaths: Set<string>, ignoreExistingPath?: string): string {
        const folder = folderPath.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
        const safeName = sanitizeFileName(title) || 'Untitled';
        let candidate = folder ? `${folder}/${safeName}.md` : `${safeName}.md`;
        let index = 2;
        while (reservedPaths.has(candidate) || this.isExistingPathBlocked(candidate, ignoreExistingPath)) {
            candidate = folder ? `${folder}/${safeName} ${index}.md` : `${safeName} ${index}.md`;
            index++;
        }
        return candidate;
    }

    private isExistingPathBlocked(path: string, ignoreExistingPath?: string): boolean {
        const existing = this.app.vault.getAbstractFileByPath(path);
        if (!existing) return false;
        return path !== ignoreExistingPath;
    }

    private async replaceFrontmatter(file: TFile, targetPath: string, nextFrontmatter: Record<string, unknown>, operation: BackgroundOperation): Promise<void> {
        const folder = targetPath.split('/').slice(0, -1).join('/');
        if (folder) await ensureFolder(this.app, folder);
        operation.check();
        await this.app.vault.process(file, content => { operation.check(); return this.serializeMarkdownWithFrontmatter(content, nextFrontmatter); });
        if (targetPath !== file.path) {
            operation.check();
            await this.app.fileManager.renameFile(file, targetPath);
        }
    }

    private async createCopy(file: TFile, targetPath: string, nextFrontmatter: Record<string, unknown>, operation: BackgroundOperation): Promise<void> {
        const content = await operation.wait(() => this.app.vault.read(file));
        const folder = targetPath.split('/').slice(0, -1).join('/');
        if (folder) await ensureFolder(this.app, folder);
        operation.check();
        await this.app.vault.create(targetPath, this.serializeMarkdownWithFrontmatter(content, nextFrontmatter));
    }

    private extractBody(content: string): string {
        const normalized = content.replace(/^\uFEFF/, '');
        const match = normalized.match(/^---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n)?/);
        if (!match) return normalized;
        return normalized.slice(match[0].length);
    }

    private serializeFrontmatter(frontmatter: Record<string, unknown>): string {
        return Object.entries(frontmatter)
            .map(([key, value]) => this.serializeYamlEntry(key, value, 0))
            .filter(Boolean)
            .join('');
    }

    private serializeYamlEntry(key: string, value: unknown, indent: number): string {
        const prefix = ' '.repeat(indent);
        key = /^[A-Za-z_][A-Za-z0-9_-]*$/.test(key) ? key : JSON.stringify(key);
        if (Array.isArray(value)) {
            if (!value.length) return `${prefix}${key}: []\n`;
            return `${prefix}${key}:\n${value.map((item) => this.serializeYamlListItem(item, indent + 2)).join('')}`;
        }
        if (this.isPlainRecord(value)) {
            if (!Object.keys(value).length) return `${prefix}${key}: {}\n`;
            const nested = Object.entries(value)
                .map(([childKey, childValue]) => this.serializeYamlEntry(childKey, childValue, indent + 2))
                .join('');
            return `${prefix}${key}:\n${nested}`;
        }
        return `${prefix}${key}: ${this.serializeYamlScalar(value)}\n`;
    }

    private serializeYamlListItem(value: unknown, indent: number): string {
        const prefix = ' '.repeat(indent);
        if (Array.isArray(value)) return value.length
            ? `${prefix}-\n${value.map(item => this.serializeYamlListItem(item, indent + 2)).join('')}`
            : `${prefix}- []\n`;
        if (this.isPlainRecord(value)) {
            if (!Object.keys(value).length) return `${prefix}- {}\n`;
            const nested = Object.entries(value)
                .map(([key, childValue]) => this.serializeYamlEntry(key, childValue, indent + 2))
                .join('');
            return `${prefix}-\n${nested}`;
        }
        return `${prefix}- ${this.serializeYamlScalar(value)}\n`;
    }

    private serializeYamlScalar(value: unknown): string {
        if (value === null || value === undefined) return 'null';
        if (typeof value === 'number' && Number.isFinite(value)) return String(value);
        if (typeof value === 'boolean') return value ? 'true' : 'false';
        const text = String(value);
        if (!text) return '""';
        if (/^[A-Za-z0-9_./:@+-]+$/.test(text) && Number.isNaN(Number(text))
            && !/^(true|false|null|yes|no|on|off|~|[-+]?\.inf|\.nan)$/i.test(text)
            && !/^\d{4}-\d{2}-\d{2}(?:$|[Tt])/.test(text)) return text;
        return JSON.stringify(text);
    }

    private isPlainRecord(value: unknown): value is Record<string, unknown> {
        return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
    }

    private getSettingsWarnings(settings: NoteImportSettings): string[] {
        const warnings: string[] = [];
        if (!settings.sourceFolderPath.trim()) warnings.push('Source folder is not selected.');
        if (settings.targetMedia === 'auto') warnings.push('Auto mode routes notes by their frontmatter type field.');
        if (settings.writeMode === 'replace') warnings.push('Replace mode updates and moves selected source notes into the LOREBASE folder.');
        return warnings;
    }

    private getItemWarnings(
        source: Record<string, unknown>,
        next: Record<string, unknown>,
        settings: NoteImportSettings,
        targetMedia: Exclude<NoteImportTargetMedia, 'auto'> | null
    ): string[] {
        const warnings: string[] = [];
        if (!Object.keys(source).length) warnings.push('No frontmatter found.');
        if (!Object.keys(next).length) warnings.push('Result frontmatter is empty.');
        if (!next.name && !next.title) warnings.push('No name/title field after mapping.');
        if (settings.targetMedia === 'auto' && !targetMedia) warnings.push('Auto mode could not detect a supported type.');
        return warnings;
    }
}
