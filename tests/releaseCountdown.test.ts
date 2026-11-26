import { describe, expect, it } from 'vitest';
import type { MediaItem, MediaType } from '../src/types';
import { withReleaseCountdown } from '../src/utils/releaseCountdown';

const now = new Date(2026, 9, 23, 23, 59);
const item = (releaseDate: string | null, type: MediaType = 'movie') => ({ type, releaseDate, status: 'to_be_released' } as MediaItem);
describe('release countdown badges', () => {
    it.each([1, 2, 5, 11, 21, 22])('counts %s calendar days with a compact day suffix', days => {
        const release = new Date(2026, 9, 23 + days);
        const value = `${release.getFullYear()}-${String(release.getMonth() + 1).padStart(2, '0')}-${String(release.getDate()).padStart(2, '0')}`;
        expect(withReleaseCountdown('Ожидает релиза', item(value), 'ru', now)).toBe(`Релиз через ${days} дн.`);
    });
    it.each(['game', 'anime', 'movie', 'series', 'book', 'manga', 'music'] as const)('supports %s and preserves custom status names', type => {
        expect(withReleaseCountdown('Скоро', item('2026-10-25', type), 'ru', now)).toBe('Скоро — 2 дн.');
    });
    it('hides the countdown when disabled', () => {
        expect(withReleaseCountdown('Ожидает релиза', item('2026-10-25'), 'ru', now, false)).toBe('Ожидает релиза');
    });
    it('does not invent days for incomplete, invalid or past dates or other statuses', () => {
        for (const date of [null, '2026-02-30', '2026-10-22']) {
            expect(withReleaseCountdown('Ожидает релиза', item(date), 'ru', now)).toBe('Ожидает релиза');
        }
        expect(withReleaseCountdown('Ожидает релиза',item('2027'),'ru',now)).toBe('Ожидает релиза · 2027');
        expect(withReleaseCountdown('Ожидает релиза',item('2026-11'),'ru',now)).toBe('Ожидает релиза · Ноябрь 2026');
        expect(withReleaseCountdown('Смотрю', { ...item('2026-10-25'), status: 'watching' }, 'ru', now)).toBe('Смотрю');
    });
    it('supports release aliases, the release day and other interface languages', () => {
        expect(withReleaseCountdown('Ожидает релиза', { ...item(null), rawFields: { released: '2026-10-24' } }, 'ru', now)).toBe('Релиз через 1 дн.');
        expect(withReleaseCountdown('Ожидает релиза', item('2026-10-23'), 'ru', now)).toBe('Релиз сегодня');
        expect(withReleaseCountdown('Soon', item('2026-10-24'), 'en', now)).toBe('Soon — 1d');
        expect(withReleaseCountdown('Очікує релізу', item('2026-10-25'), 'uk', now)).toBe('Реліз через 2 дн.');
        expect(withReleaseCountdown('即将发行', item('2026-10-25'), 'zh-CN', now)).toBe('2 天后发行');
    });
});
