import type { App } from 'obsidian';
import type { TranslationKey } from '../../localization';
import type LorebasePlugin from '../../main';

export type MediaTypeKey = 'games' | 'anime' | 'movies' | 'series' | 'books' | 'manga';
export interface MediaTabValues {
    statusLabels: MediaTypeKey;
    integrationTemplates: MediaTypeKey | 'music';
}
export type MediaTabScope = keyof MediaTabValues;

export interface TemplateFieldDef {
    key: string;
    label: TranslationKey;
}

export interface CollapsibleGroupElements {
    root: HTMLElement;
    body: HTMLElement;
}

export interface SettingsSectionContext {
    app: App;
    signal?: AbortSignal;
    plugin: LorebasePlugin;
    display: () => void;
    onMangaWorkTypesChanged?: () => void;
    createSectionHeader: (container: HTMLElement, icon: string, text: string) => void;
    createCollapsibleGroup: (
        container: HTMLElement,
        title: string,
        description?: string,
        open?: boolean
    ) => CollapsibleGroupElements;
    getActiveMediaTab: <Scope extends MediaTabScope>(scope: Scope) => MediaTabValues[Scope];
    setActiveMediaTab: (scope: MediaTabScope, media: MediaTypeKey | 'music') => void;
    applyAccentColor: (color: string) => void;
}
