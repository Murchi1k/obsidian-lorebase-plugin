import { describe, expect, it } from 'vitest';
import { localizedPersonName, localizedRole, needsPersonAlias, personAge, formatPersonDate, formatPersonAge } from '../src/utils/peopleDisplay';

describe('person display and language fallback', () => {
    it('uses available TMDB name aliases for the chosen script, without inventing names', () => {
        const aliases = ['Білл Мюррей', 'Билл Мюррей', 'ビル・マーレイ'];
        expect(localizedPersonName('Bill Murray', aliases, 'ru-RU')).toBe('Билл Мюррей');
        expect(localizedPersonName('Bill Murray', aliases, 'uk-UA')).toBe('Білл Мюррей');
        expect(localizedPersonName('Bill Murray', aliases, 'ja-JP')).toBe('ビル・マーレイ');
        expect(localizedPersonName('Bill Murray', [], 'ru-RU')).toBe('Bill Murray');
        expect(localizedPersonName('Bill Murray', aliases, 'en-US')).toBe('Bill Murray');
        expect(needsPersonAlias('Билл Мюррей', 'ru-RU')).toBe(false);
    });
    it('translates common qualifiers and crew jobs while preserving character names', () => {
        expect(localizedRole('Garfield (voice) / Self (archive footage)', 'ru-RU')).toBe('Garfield (озвучка) / В роли себя (архивные кадры)');
        expect(localizedRole('Executive Producer', 'ru-RU')).toBe('Исполнительный продюсер');
        expect(localizedRole('Wendell', 'ru-RU')).toBe('Wendell');
        expect(localizedRole('Self', 'uk-UA')).toBe('У ролі себе');
    });
    it('calculates age before and after the birthday and stops at the date of death', () => {
        expect(personAge('1964-06-20', '', new Date('2026-06-19T12:00:00Z'))).toBe(61);
        expect(personAge('1964-06-20', '', new Date('2026-06-20T12:00:00Z'))).toBe(62);
        expect(personAge('1964-06-20', '2020-06-19', new Date('2026-10-28T12:00:00Z'))).toBe(55);
        expect(personAge('2000-02-29', '', new Date('2025-03-01T12:00:00Z'))).toBe(25);
    });
    it('does not show ages for missing, invalid, reversed or future birth dates', () => {
        expect(personAge('')).toBeNull(); expect(personAge('2001-02-29')).toBeNull();
        expect(personAge('2000-02-30')).toBeNull(); expect(personAge('2020-01-01', '2019-12-31')).toBeNull();
        expect(personAge('2030-01-01', '', new Date('2026-10-28T12:00:00Z'))).toBeNull();
        expect(personAge('2000-01-01', 'unknown')).toBeNull();
    });
    it('formats dates and age units in the chosen TMDB locale', () => {
        expect(formatPersonDate('1964-06-20', 'ru-RU')).toContain('20 июня 1964');
        expect(formatPersonAge(61, 'ru-RU')).toBe('61 год'); expect(formatPersonAge(62, 'ru-RU')).toBe('62 года');
        expect(formatPersonAge(65, 'ru-RU')).toBe('65 лет'); expect(formatPersonDate('unknown', 'ru-RU')).toBe('unknown');
    });
});
