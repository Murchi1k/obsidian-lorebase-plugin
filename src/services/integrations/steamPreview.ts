import type { Language } from '../../types';

export type SteamPreviewNameResolver = (appIds: number[]) => Promise<Record<number, string>>;

export function isSteamPlaceholderName(name: string | undefined): boolean {
    return !name?.trim() || /^(?:Steam\s+App\s+)?\d+$/i.test(name.trim());
}

export function getSteamImportDisplayName(name: string | undefined, language: Language): string {
    if (!isSteamPlaceholderName(name)) return name!.trim();
    return { ru: 'Игра из Steam', uk: 'Гра зі Steam', en: 'Steam game', 'zh-CN': 'Steam 游戏' }[language];
}
