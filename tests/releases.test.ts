import { describe, expect, it } from 'vitest';
import { compareVersions, getReleaseStartupAction } from '../src/releases/versionState';
import { getReleaseHighlights, getReleaseHistory } from '../src/releases/catalog';
import { LEGACY_TRANSLATIONS } from '../src/releases/legacyTranslations';
import { LEGACY_RELEASES } from '../src/releases/legacy';

describe('release notification lifecycle', () => {
    it('remembers a fresh installation without announcing an update', () => {
        expect(getReleaseStartupAction('4.0.0', undefined, false)).toBe('remember');
        expect(getReleaseStartupAction('4.0.0', '4.0.0', true)).toBe('none');
    });
    it('announces the migration from installations without a version marker once', () => {
        expect(getReleaseStartupAction('4.0.0', undefined, true)).toBe('show');
        expect(getReleaseStartupAction('4.0.0', '4.0.0', true)).toBe('none');
    });
    it('handles upgrades across skipped releases, including numeric version ordering', () => {
        expect(getReleaseStartupAction('4.0.0', '2.0.6', true)).toBe('show');
        expect(getReleaseStartupAction('4.10.0', '4.9.0', true)).toBe('show');
    });
    it('preserves the watermark on downgrades and ignores build metadata', () => {
        expect(getReleaseStartupAction('3.0.1', '4.0.0', true)).toBe('none');
        expect(getReleaseStartupAction('4.0.0+rebuilt', '4.0.0+original', true)).toBe('none');
    });
    it('recovers invalid persisted values without crashing', () => {
        for (const value of [null, {}, 4, '', 'broken']) expect(getReleaseStartupAction('4.0.0', value, true)).toBe('show');
        expect(getReleaseStartupAction('broken', '4.0.0', true)).toBe('none');
    });
    it('orders prereleases before stable versions and compares numeric prerelease identifiers', () => {
        expect(compareVersions('4.0.0-beta.10', '4.0.0-beta.2')).toBe(1);
        expect(compareVersions('4.0.0-beta', '4.0.0')).toBe(-1);
        expect(compareVersions('4.0.0', '4.0.0-rc.1')).toBe(1);
    });
});

describe('offline release catalog', () => {
    it('lists the patch first while keeping the 4.0.0 history', () => {
        for (const language of ['en', 'ru', 'uk', 'zh-CN'] as const) {
            const [patch, previous] = getReleaseHistory(language, '4.0.1');
            expect(patch.version).toBe('4.0.1');
            expect(patch.groups[0].kind).toBe('fixed');
            expect(patch.groups[0].items).toHaveLength(2);
            expect(previous.version).toBe('4.0.0');
        }
    });
    it('lists actors as added and statistics once as the eighteenth feature', () => {
        const groups = getReleaseHistory('ru', '4.0.0')[0].groups;
        expect(groups.find(group => group.kind === 'added')?.summaries).toContain('Актёры и фильмография');
        expect(groups.find(group => group.kind === 'improved')?.summaries).not.toContain('Актёры и фильмография');
        const features = getReleaseHighlights('ru', '4.0.0');
        expect(features[17]).toMatchObject({ target: 'statistics', title: 'Переработанная статистика' });
        expect(groups.flatMap(group => group.summaries ?? []).filter(title => title === 'Переработанная статистика')).toHaveLength(1);
    });
    it('lists all four completed tracking features explicitly in the current changelog', () => {
        const summaries = getReleaseHistory('ru', '4.0.0')[0].groups.flatMap(group => group.summaries ?? []);
        for (const title of ['Актёры и фильмография', 'Переработанная статистика', 'Прогресс игр, время, достижения и режимы', 'Отдельные серии в составе тайтла']) expect(summaries).toContain(title);
    });
    for (const language of ['ru', 'uk', 'en', 'zh-CN'] as const) {
        it(`has complete current notes and working highlight targets in ${language}`, () => {
            const history = getReleaseHistory(language, '4.0.0');
            expect(history.map(release => release.version)).toEqual(['4.0.0', '3.0.1', '2.0.6', '1.1.0']);
            expect(history[0].groups.map(group => group.kind)).toEqual(['added', 'improved', 'fixed']);
            expect(history[0].groups.every(group => group.items.length > 0)).toBe(true);
            for (const group of history[0].groups) {
                expect(group.summaries).toHaveLength(group.items.length);
                expect(group.icons).toHaveLength(group.items.length);
            }
            expect(getReleaseHighlights(language, '4.0.0').map(feature => feature.target)).toEqual([
                'music', 'ratings', 'calendar', 'groups', 'anilist', 'bookshelf', 'alternativeTitles', 'mangaTypes', 'statuses', 'tmdb', 'integrations', 'vndb', 'animeOrigin', 'librarySearch', 'templates', 'adding', 'parts', 'statistics',
            ]);
            expect(history.every(release => release.groups.every(group => group.items.every(item => typeof item === 'string' && item.length > 0)))).toBe(true);
        });
    }
    it('translates every archived entry without dropping or adding entries', () => {
        const originalCount = LEGACY_RELEASES.reduce((sum, release) => sum + release.groups.reduce((count, group) => count + group.items.length, 0), 0);
        for (const language of ['ru', 'uk', 'zh-CN'] as const) {
            expect(LEGACY_TRANSLATIONS[language]).toHaveLength(originalCount);
            const history = getReleaseHistory(language, '3.0.1');
            expect(history.map(release => release.groups.map(group => group.items.length))).toEqual(LEGACY_RELEASES.map(release => release.groups.map(group => group.items.length)));
            for (const release of history) for (const group of release.groups) for (const text of group.items) {
                expect(text).toMatch(language === 'zh-CN' ? /[\u4e00-\u9fff]/ : /[А-Яа-яІіЇїЄє]/);
            }
        }
    });
    it('includes the omitted fixes and preserves the advanced template placeholder', () => {
        const text = getReleaseHistory('ru', '4.0.0')[0].groups.flatMap(group => group.items).join('\n');
        for (const expected of ['TMDB', '404', 'HowLongToBeat', 'Shikimori', '{{VALUE:name}}', 'временно отключены', 'весь сезон', 'Светлая тема', 'Steam Sync', 'бета-версии']) expect(text).toContain(expected);
    });
    it('covers the shipped sync, settings and poster updates without implementation diary entries', () => {
        const release = getReleaseHistory('ru', '4.0.0')[0];
        const text = release.groups.flatMap(group => group.items).join('\n');
        for (const topic of ['Steam Sync в окне добавления', 'Импорт AniList в окне добавления', 'Прогресс импорта Steam и AniList', 'Привязка к AniList', 'Эффекты частиц', 'Сакура, снег, листья, светлячки и дождь', 'Интерактивное превью карточек', 'Настройки плагина', 'Импорт заметок', 'Переработанная статистика', 'Обложки MangaDex', 'Качество обложек MangaUpdates']) expect(text).toContain(topic);
        expect(text).not.toMatch(/Jikan|User-Agent|очистка обработчиков|Окно немного переработано|Медиа → Аниме|шаблонах интеграций|Сетка и музыка|Размер и сетка|Поиск 18\+ в AniList|Переключатель 18\+ в добавлении/);
        expect(release.groups[0].summaries?.slice(0, 5)).toEqual([
            'Входящие из заметок #lorebase', 'Приоритет произведения', 'Open Library для книг', 'Откуда узнал', 'Почему бросил',
        ]);
        expect(release.groups[1].summaries?.[0]).toBe('Просмотрено, дата неизвестна');
        expect(release.groups.find(group => group.kind === 'added')?.summaries).toContain('Comic Vine для комиксов');
        expect(release.groups.find(group => group.kind === 'fixed')?.summaries).toContain('Отдельные переключатели AniList и Shikimori');
        const expectedCounts = release.groups.map(group => group.items.length);
        for (const language of ['en', 'uk', 'zh-CN'] as const) expect(getReleaseHistory(language, '4.0.0')[0].groups.map(group => group.items.length)).toEqual(expectedCounts);
    });
    it('does not present future features as part of an older or unknown release', () => {
        expect(getReleaseHistory('en', '3.0.1').some(release => release.version === '4.0.0')).toBe(false);
        expect(getReleaseHighlights('en', '4.1.0')).toEqual([]);
    });
});
