import { animeGenreMigration } from '../utils/animeGenreMigration';
/**
 * LOREBASE - Metadata Service (Fixed)
 * Handles frontmatter updates and image URL resolution
 */

import { App, TFile } from 'obsidian';
import type { LorebaseSettings, MediaType, MediaItem, NoteTemplateSettings } from '../types';
import { statisticsCountryCodes } from './media/statisticsCountries';
import { applyFrontmatterAliases, migrateFrontmatterAliases, parseTemplateFieldAliases, remapFrontmatterUpdates } from './media/templateFieldAliases';
import { buildSimpleTemplate, getDefaultTemplateFields, getEffectiveSimpleTemplateFields } from './integrations/templateUtils';
import { withSyncSourceUrl } from '../utils/syncSource';
import type { TemplateKind } from './integrations/types';
import { getTemplateYamlKeys, orderTemplateFrontmatter } from './integrations/templateSchema';
import { formatTemplateWikilinks, getWikilinkTemplateKeys } from './integrations/templateValues';

const templateKinds: Record<MediaType, TemplateKind> = {
    game: 'games', anime: 'anime', movie: 'movies', series: 'series', book: 'books', manga: 'manga', music: 'music',
};

interface CompiledNoteTemplate {
    signature: string;
    source: string;
    template: string;
    aliases: Record<string, string>;
}

export class MetadataService {
    private disposed = false;
    private app: App;
    private imagePathCache = new Map<string, { path: string; modified: number; url: string }>();
    private imageBasenames?: Map<string, TFile[]>;
    private templateCache = new Map<MediaType, CompiledNoteTemplate>();

    dispose(): void { this.disposed = true; this.invalidateImageCache(); this.templateCache.clear(); }

    private assertActive(): void {
        if (this.disposed) { const error = new Error('Lorebase was unloaded.'); error.name = 'AbortError'; throw error; }
    }

    invalidateImageCache(): void {
        this.imagePathCache.clear();
        this.imageBasenames = undefined;
    }

    constructor(app: App, private readonly getSettings?: () => LorebaseSettings) {
        this.app = app;
    }

    resolveFrontmatter(mediaType: MediaType, source: Record<string, unknown>): Record<string, unknown> {
        const aliases = this.getAliases(mediaType);
        const previous = this.getPreviousAliases(mediaType, source, aliases);
        return applyFrontmatterAliases(source, { ...aliases, ...previous });
    }

    getFrontmatterFieldAliases(mediaType: MediaType): Record<string, string> {
        return { ...this.getAliases(mediaType) };
    }

    isCompactTemplateMode(): boolean {
        return this.getSettings?.().integrations?.compactTemplates === true;
    }

    async migrateAnimeGenres(file: TFile): Promise<void> {
        this.assertActive();
        await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
            if (this.disposed) return;
            const patch = animeGenreMigration(this.resolveFrontmatter('anime', frontmatter));
            if (patch) Object.assign(frontmatter, remapFrontmatterUpdates(patch, this.getAliases('anime')));
            const keys = getTemplateYamlKeys(this.getNoteTemplate('anime'));
            this.retainLegacyCountries(frontmatter, 'anime', keys);
            if (keys.length) orderTemplateFrontmatter(frontmatter, keys, {}, { compact: this.isCompactTemplateMode(), preserveEmpty: [this.getAliases('anime').countries ?? 'countries'] });
        });
    }

    async updateMetadata(file: TFile, updates: Record<string, unknown>, mediaType?: MediaType, shouldUpdate?: (current: Record<string, unknown>) => boolean): Promise<void> {
        this.assertActive();
        const template = mediaType ? this.getNoteTemplate(mediaType) : '';
        const templateKeys = getTemplateYamlKeys(template);
        const wikilinkKeys = getWikilinkTemplateKeys(template);
        // Use Obsidian's processFrontMatter API for reliable updates
        await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
            if (this.disposed) return;
            if (shouldUpdate && !shouldUpdate(frontmatter)) return;
            if (mediaType) this.migrateNoteFieldAliases(mediaType, frontmatter);
            const sourceUpdates = mediaType ? withSyncSourceUrl(mediaType, this.resolveFrontmatter(mediaType, frontmatter), updates) : updates;
            const resolvedUpdates = mediaType ? remapFrontmatterUpdates(sourceUpdates, this.getAliases(mediaType)) : sourceUpdates;
            for (const [key, value] of Object.entries(resolvedUpdates)) {
                if (value === null || value === undefined || value === '') {
                    if (templateKeys.includes(key) && !this.isCompactTemplateMode()) frontmatter[key] = null;
                    else delete frontmatter[key];
                } else {
                    frontmatter[key] = formatTemplateWikilinks(value, frontmatter[key], wikilinkKeys.has(key));
                }
            }
            if (mediaType) this.retainLegacyCountries(frontmatter, mediaType, templateKeys);
            if (templateKeys.length) orderTemplateFrontmatter(frontmatter, templateKeys, {}, { compact: this.isCompactTemplateMode(), preserveEmpty: [mediaType ? this.getAliases(mediaType).countries ?? 'countries' : 'countries'] });
        });
    }

    /** A newly enabled template field must not shadow an older origin property with null. */
    private retainLegacyCountries(frontmatter: Record<string, unknown>, mediaType: MediaType, templateKeys: string[]): void {
        const key = this.getAliases(mediaType).countries ?? 'countries';
        if (!templateKeys.includes(key) || Object.prototype.hasOwnProperty.call(frontmatter, key)) return;
        const countries = statisticsCountryCodes({ rawFields: this.resolveFrontmatter(mediaType, frontmatter) } as MediaItem);
        if (countries.length) frontmatter[key] = countries;
    }

    private getTemplateSettings(mediaType: MediaType): NoteTemplateSettings | undefined {
        const settings = this.getSettings?.();
        const kind = templateKinds[mediaType];
        return kind === 'music' ? settings?.music?.noteTemplate : settings?.integrations?.media?.[kind];
    }

    getNoteTemplate(mediaType: MediaType): string {
        return this.getCompiledTemplate(mediaType).template;
    }

    private getCompiledTemplate(mediaType: MediaType): CompiledNoteTemplate {
        const templateSettings = this.getTemplateSettings(mediaType);
        // Check values too: the settings UI edits arrays and aliases in place.
        const signature = JSON.stringify([templateSettings?.templateEnabled, templateSettings?.templateMode,
            templateSettings?.templateFields, templateSettings?.fieldAliases, templateSettings?.wikilinkFields]);
        const source = templateSettings?.template ?? '';
        const cached = this.templateCache.get(mediaType);
        if (cached?.signature === signature && cached.source === source) return cached;
        let template = '';
        if (templateSettings?.templateEnabled) {
            const kind = templateKinds[mediaType];
            template = templateSettings.templateMode === 'advanced' && source.trim() ? source
                : buildSimpleTemplate(kind, getEffectiveSimpleTemplateFields(kind,
                    templateSettings.templateFields ?? getDefaultTemplateFields(kind)), templateSettings.fieldAliases, templateSettings.wikilinkFields);
        }
        const compiled = { signature, source, template, aliases: {
            ...templateSettings?.fieldAliases, ...parseTemplateFieldAliases(mediaType, template),
        } };
        this.templateCache.set(mediaType, compiled);
        return compiled;
    }

    private getAliases(mediaType: MediaType): Record<string, string> {
        return this.getCompiledTemplate(mediaType).aliases;
    }

    private getPreviousAliases(mediaType: MediaType, source: Record<string, unknown>, aliases: Record<string, string>): Record<string, string> {
        const previous = this.getTemplateSettings(mediaType)?.previousFieldAliases ?? {};
        const active = new Set(Object.values(aliases));
        const has = (key: string): boolean => Object.prototype.hasOwnProperty.call(source, key);
        const result: Record<string, string> = {};
        for (const [canonical, keys] of Object.entries(previous)) {
            if (has(canonical) || has(aliases[canonical] ?? canonical)) continue;
            const oldKey = keys.find(key => !active.has(key) && has(key));
            if (oldKey) result[canonical] = oldKey;
        }
        return result;
    }

    migrateNoteFieldAliases(mediaType: MediaType, frontmatter: Record<string, unknown>): void {
        const aliases = this.getAliases(mediaType);
        const previous = this.getPreviousAliases(mediaType, frontmatter, aliases);
        for (const [canonical, oldKey] of Object.entries(previous)) {
            const key = aliases[canonical] ?? canonical;
            Object.defineProperty(frontmatter, key, { value: frontmatter[oldKey], enumerable: true, configurable: true, writable: true });
        }
        for (const oldKey of new Set(Object.values(previous))) delete frontmatter[oldKey];
        migrateFrontmatterAliases(frontmatter, aliases);
    }

    /**
     * Get image URL from poster value - FIXED to handle all formats
     * Priority: cm_poster > poster URL > vault file > default
     */
    getImageUrl(poster: unknown, customPoster?: unknown): string | null {
        // Try custom poster first
        if (customPoster) {
            const customUrl = this.resolveImagePath(customPoster);
            if (customUrl) return customUrl;
        }

        // Then try regular poster
        if (poster) {
            const url = this.resolveImagePath(poster);
            if (url) return url;
        }

        return null;
    }

    /**
     * Resolve image path to usable URL
     */
    private resolveImagePath(value: unknown): string | null {
        if (!value) return null;

        // Already a URL
        if (typeof value === 'string') {
            const normalized = this.normalizeImagePathValue(value);
            if (!normalized) return null;
            if (/^https?:\/\//i.test(normalized)) return normalized;

            // Obsidian link format [[filename]] or [[path/to/file]]
            const linkMatch = normalized.match(/\[\[(.+?)\]\]/);
            if (linkMatch) {
                return this.getVaultResourcePath(this.stripObsidianLinkTarget(linkMatch[1]));
            }

            // Direct file path (with or without extension)
            return this.getVaultResourcePath(normalized);
        }

        // Object with path property (Dataview link format)
        if (typeof value === 'object' && value !== null && 'path' in value) {
            const path = (value as { path: string }).path;
            return this.getVaultResourcePath(path);
        }

        return null;
    }

    private normalizeImagePathValue(value: string): string {
        let clean = value.trim();
        clean = clean.replace(/^["']|["']$/g, '').trim();
        clean = clean.replace(/^!+\s*/, '').trim();

        try {
            clean = decodeURIComponent(clean);
        } catch {
            // Keep the original text if it is not valid URI-encoded data.
        }

        if (clean.startsWith('app://obsidian.md/')) {
            clean = clean.slice('app://obsidian.md/'.length);
        }

        return clean.replace(/\\/g, '/').replace(/^\/+/, '').trim();
    }

    private stripObsidianLinkTarget(value: string): string {
        return value
            .split('|')[0]
            .split('#')[0]
            .trim();
    }

    /**
     * Get resource path for a file in the vault
     * Tries multiple search strategies
     */
    private getVaultResourcePath(path: string): string | null {
        if (!path) return null;

        // Clean up the path
        const cleanPath = this.stripObsidianLinkTarget(this.normalizeImagePathValue(path));
        const cached = this.imagePathCache.get(cleanPath);
        if (cached) {
            const current = this.app.vault.getAbstractFileByPath(cached.path);
            if (current instanceof TFile && current.stat.mtime === cached.modified) return cached.url;
            this.invalidateImageCache();
        }

        const cacheResult = (value: string | null, source?: TFile): string | null => {
            const resolved = source ?? file;
            if (value !== null && resolved instanceof TFile) {
                if (this.imagePathCache.size >= 512) this.imagePathCache.delete(this.imagePathCache.keys().next().value!);
                this.imagePathCache.set(cleanPath, { path: resolved.path, modified: resolved.stat.mtime, url: value });
            }
            return value;
        };

        // Try exact path first
        let file = this.app.vault.getAbstractFileByPath(cleanPath);
        if (file && file instanceof TFile) {
            return cacheResult(this.app.vault.getResourcePath(file));
        }

        // Try with files/ prefix (common poster location)
        if (!cleanPath.startsWith('files/')) {
            file = this.app.vault.getAbstractFileByPath(`files/${cleanPath}`);
            if (file && file instanceof TFile) {
                return cacheResult(this.app.vault.getResourcePath(file));
            }
        }

        // Try with common image extensions
        const extensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
        for (const ext of extensions) {
            if (!cleanPath.toLowerCase().endsWith(ext)) {
                file = this.app.vault.getAbstractFileByPath(cleanPath + ext);
                if (file && file instanceof TFile) {
                    return cacheResult(this.app.vault.getResourcePath(file));
                }

                // Also try with files/ prefix
                file = this.app.vault.getAbstractFileByPath(`files/${cleanPath}${ext}`);
                if (file && file instanceof TFile) {
                    return cacheResult(this.app.vault.getResourcePath(file));
                }
            }
        }

        // Try finding by basename in entire vault
        const basename = cleanPath.split('/').pop() || cleanPath;
        if (!this.imageBasenames) {
            this.imageBasenames = new Map();
            for (const candidate of this.app.vault.getFiles()) {
                if (!/^(?:png|jpe?g|gif|webp|avif|svg|bmp)$/i.test(candidate.extension)) continue;
                for (const key of new Set([candidate.basename, candidate.name])) {
                    const entries = this.imageBasenames.get(key) ?? [];
                    entries.push(candidate); this.imageBasenames.set(key, entries);
                }
            }
        }
        const matches = this.imageBasenames.get(basename) ?? [];
        if (matches.length === 1) return cacheResult(this.app.vault.getResourcePath(matches[0]), matches[0]);

        return cacheResult(null);
    }
}
