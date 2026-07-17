import type { App } from 'obsidian';
import type { TranslationKey } from '../../localization';
import type LorebasePlugin from '../../main';

export type MediaTypeKey = 'games' | 'anime' | 'movies' | 'series' | 'books' | 'manga';
export type MediaTabScope = 'statusLabels' | 'mediaSettings' | 'integrationTemplates';

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
    plugin: LorebasePlugin;
    display: () => void;
    createSectionHeader: (container: HTMLElement, icon: string, text: string) => void;
    createCollapsibleGroup: (
        container: HTMLElement,
        title: string,
        description?: string,
        open?: boolean
    ) => CollapsibleGroupElements;
    getActiveMediaTab: (scope: MediaTabScope) => MediaTypeKey;
    setActiveMediaTab: (scope: MediaTabScope, media: MediaTypeKey) => void;
    applyAccentColor: (color: string) => void;
}
