/**
 * LOREBASE - Metadata Service (Fixed)
 * Handles frontmatter updates and image URL resolution
 */

import { App, TFile } from 'obsidian';

export class MetadataService {
    private app: App;

    constructor(app: App) {
        this.app = app;
    }

    async updateMetadata(file: TFile, updates: Record<string, unknown>): Promise<void> {
        // Use Obsidian's processFrontMatter API for reliable updates
        await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
            for (const [key, value] of Object.entries(updates)) {
                if (value === null || value === undefined || value === '') {
                    delete frontmatter[key];
                } else {
                    frontmatter[key] = value;
                }
            }
        });
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
            if (value.startsWith('http://') || value.startsWith('https://')) {
                return value;
            }

            // Obsidian link format [[filename]] or [[path/to/file]]
            const linkMatch = value.match(/\[\[(.+?)\]\]/);
            if (linkMatch) {
                return this.getVaultResourcePath(linkMatch[1]);
            }

            // Direct file path (with or without extension)
            return this.getVaultResourcePath(value);
        }

        // Object with path property (Dataview link format)
        if (typeof value === 'object' && value !== null && 'path' in value) {
            const path = (value as { path: string }).path;
            return this.getVaultResourcePath(path);
        }

        return null;
    }

    /**
     * Get resource path for a file in the vault
     * Tries multiple search strategies
     */
    private getVaultResourcePath(path: string): string | null {
        if (!path) return null;

        // Clean up the path
        let cleanPath = path.trim();

        // Remove leading/trailing quotes
        cleanPath = cleanPath.replace(/^["']|["']$/g, '');

        // Try exact path first
        let file = this.app.vault.getAbstractFileByPath(cleanPath);
        if (file && file instanceof TFile) {
            return this.app.vault.getResourcePath(file);
        }

        // Try with files/ prefix (common poster location)
        if (!cleanPath.startsWith('files/')) {
            file = this.app.vault.getAbstractFileByPath(`files/${cleanPath}`);
            if (file && file instanceof TFile) {
                return this.app.vault.getResourcePath(file);
            }
        }

        // Try with common image extensions
        const extensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
        for (const ext of extensions) {
            if (!cleanPath.toLowerCase().endsWith(ext)) {
                file = this.app.vault.getAbstractFileByPath(cleanPath + ext);
                if (file && file instanceof TFile) {
                    return this.app.vault.getResourcePath(file);
                }

                // Also try with files/ prefix
                file = this.app.vault.getAbstractFileByPath(`files/${cleanPath}${ext}`);
                if (file && file instanceof TFile) {
                    return this.app.vault.getResourcePath(file);
                }
            }
        }

        // Try finding by basename in entire vault
        const basename = cleanPath.split('/').pop() || cleanPath;
        const allFiles = this.app.vault.getFiles();
        for (const f of allFiles) {
            if (f.basename === basename || f.name === basename) {
                return this.app.vault.getResourcePath(f);
            }
        }

        return null;
    }
}
