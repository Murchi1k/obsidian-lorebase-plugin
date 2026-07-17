import { App, TFile } from 'obsidian';
import type { FilterState } from '../../src/types';
import { MetadataService } from '../../src/services/MetadataService';

export function createMockFile(path: string, basename: string): TFile {
    const file = new TFile();
    file.path = path;
    file.basename = basename;
    file.name = `${basename}.md`;
    file.extension = 'md';
    file.stat = { ctime: Date.now(), mtime: Date.now(), size: 0 };
    return file;
}

export function createMockApp(cacheByPath: Record<string, unknown>): App {
    const app = {
        metadataCache: {
            getFileCache(file: { path: string }): unknown {
                return cacheByPath[file.path] ?? null;
            },
        },
        vault: {
            getAbstractFileByPath(): null {
                return null;
            },
            getFiles(): TFile[] {
                return [];
            },
            getResourcePath(): string {
                return '';
            },
        },
        fileManager: {
            async processFrontMatter(): Promise<void> {
                return;
            },
        },
    };

    return app as unknown as App;
}

export function createMetadataService(app: App): MetadataService {
    return new MetadataService(app);
}

export function createBaseFilter(): FilterState {
    return {
        statuses: [],
        favoriteOnly: false,
        adultOnly: false,
        customOnly: false,
        searchTerm: '',
        tags: [],
        genres: [],
    };
}
