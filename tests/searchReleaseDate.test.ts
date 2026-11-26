import { expect, it } from 'vitest';
import { formatSearchReleaseDate, fuzzySearchReleaseDate } from '../src/utils/searchReleaseDate';

it.each(['2020-12-09', '2020-12-09T23:00:00Z', 'Dec 9, 2020', '9 Dec, 2020'])(
    'formats %s consistently without a local timezone shift', value => {
        expect(formatSearchReleaseDate(value, 'ru')).toBe('9 дек. 2020');
        expect(formatSearchReleaseDate(value, 'en')).toBe('Dec 9, 2020');
    });
it('preserves partial and unknown release dates instead of adding a fictitious day', () => {
    expect(fuzzySearchReleaseDate({ year: 2020 })).toBe('2020');
    expect(fuzzySearchReleaseDate({ year: 2020, month: 12 })).toBe('2020-12');
    expect(fuzzySearchReleaseDate({ year: 2020, month: 12, day: 9 })).toBe('2020-12-09');
    expect(formatSearchReleaseDate('2020-99-99', 'en')).toBe('2020');
    expect(formatSearchReleaseDate('2020-12-99', 'en')).toBe('Dec 2020');
    expect(formatSearchReleaseDate('2023-02-29', 'en')).toBe('Feb 2023');
    expect(formatSearchReleaseDate('2024-02-29', 'en')).toBe('Feb 29, 2024');
    expect(formatSearchReleaseDate('Coming soon', 'en')).toBe('Coming soon');
});
