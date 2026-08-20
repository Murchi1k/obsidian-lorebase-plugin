import { afterEach, describe, expect, it } from 'vitest';
import { i18n, t, type TranslationKey } from '../src/localization';
import type { Language } from '../src/types';

const COMMAND_TRANSLATIONS: Record<Language, Partial<Record<TranslationKey, string>>> = {
    en: {
        commandOpenGamesLibrary: 'Open Games',
        commandAddGame: 'Add game',
        commandSteamSync: 'Steam Sync',
        commandImportNotes: 'Import notes into LOREBASE',
    },
    ru: {
        commandOpenGamesLibrary: 'Открыть игры',
        commandAddGame: 'Добавить игру',
        commandSteamSync: 'Синхронизация Steam',
        commandImportNotes: 'Импортировать заметки в LOREBASE',
    },
    uk: {
        commandOpenGamesLibrary: 'Відкрити ігри',
        commandAddGame: 'Додати гру',
        commandSteamSync: 'Синхронізація Steam',
        commandImportNotes: 'Імпортувати нотатки в LOREBASE',
    },
    'zh-CN': {
        commandOpenGamesLibrary: '打开游戏库',
        commandAddGame: '添加游戏',
        commandSteamSync: 'Steam 同步',
        commandImportNotes: '将笔记导入 LOREBASE',
    },
};

describe('command localization', () => {
    afterEach(() => {
        i18n.setLanguage('en');
    });

    for (const language of ['en', 'ru', 'uk', 'zh-CN'] as const) {
        it(`uses ${language} command names`, () => {
            i18n.setLanguage(language);

            for (const [key, expected] of Object.entries(COMMAND_TRANSLATIONS[language])) {
                expect(t(key as TranslationKey)).toBe(expected);
            }
        });
    }

    it('uses the Simplified Chinese locale for dates', () => {
        i18n.setLanguage('zh-CN');
        expect(i18n.getLocale()).toBe('zh-CN');
    });

    it('localizes the community rating panel in Simplified Chinese', () => {
        i18n.setLanguage('zh-CN');

        const expected = {
            communityRatingTitle: '社区评分',
            communityRatingRefresh: '刷新评分',
            communityRatingScore: '评分',
            communityRatingNoSource: '暂无来源',
            communityRatingNoVotes: '暂无评分人数',
            communityRatingVotes: '人评分',
            communityRatingNotFound: '未找到社区评分。',
            communityRatingUpdated: '社区评分已更新。',
            communityRatingRefreshFailed: '社区评分刷新失败。',
        };

        for (const [key, value] of Object.entries(expected)) {
            expect(t(key as TranslationKey)).toBe(value);
        }
    });
});
