import { describe, expect, it } from 'vitest';
import { makeStatRecord, defaultStatFilters, filterStatRecords } from '../src/services/media/statistics';
import { statisticsCountryCodes, statisticsCountryLabel } from '../src/services/media/statisticsCountries';
import { statisticsPeriodRange, statisticsRatingSummary } from '../src/services/media/statisticsOverview';
import { STAT_WORLD } from '../src/assets/statisticsWorld';
import type { MediaItem } from '../src/types';
const item = (patch: Record<string, unknown> = {}) => ({ type: 'movie', filePath: 'm.md', displayName: 'Movie', status: 'planned', genres: [], tags: [], userRating: null, rawFields: {}, ...patch }) as unknown as MediaItem;
describe('statistics overview', () => {
    it('normalizes multilingual country names, ISO codes and co-productions once per title', () => {
        expect(statisticsCountryCodes(item({ rawFields: { countries: ['USA', 'Соединённые Штаты', 'United Kingdom', 'UK', '日本', 'JP', { iso_3166_1: 'UA' }] } }))).toEqual(['US', 'GB', 'JP', 'UA']);
        expect(statisticsCountryCodes(item({ rawFields: { country: 'Korea, Republic of' } }))).toEqual(['KR']);
        expect(statisticsCountryLabel('JP', 'ru')).toBe('Япония');
    });
    it('does not guess a country from a title, language, studio or creator', () => {
        expect(statisticsCountryCodes(item({ displayName: 'Tokyo', director: 'Akira Kurosawa', rawFields: { language: 'Japanese', studio: 'Ghibli', country: 'unknown' } }))).toEqual([]);
    });
    it('filters by origin and exposes unknowns without treating them as a country', () => {
        const rows = [makeStatRecord(item({ rawFields: { countries: ['FR', 'US'] } })), makeStatRecord(item())];
        expect(filterStatRecords(rows, { ...defaultStatFilters(), facet: { key: 'countries', value: 'FR' } })).toEqual([rows[0]]);
        expect(filterStatRecords(rows, { ...defaultStatFilters(), countryUnknown: true })).toEqual([rows[1]]);
    });
    it('bounds quick periods by local calendar dates and respects the chosen date basis', () => {
        const now = new Date(2026, 9, 29, 12), month = statisticsPeriodRange('month', now)!;
        expect(new Date(month.from).getDate()).toBe(1); expect(new Date(month.to).getDate()).toBe(29);
        expect(new Date(statisticsPeriodRange('week', now)!.from).getDate()).toBe(23);
        expect(statisticsPeriodRange('all', now)).toBeNull();
        const rows = [makeStatRecord(item({ status: 'completed', finished: '2026-10-10', rawFields: { date_added: '2026-09-01' } })), makeStatRecord(item({ rawFields: { date_added: '2026-10-12' } }))];
        expect(filterStatRecords(rows, { ...defaultStatFilters(), dateRange: month })).toEqual([rows[1]]);
        expect(filterStatRecords(rows, { ...defaultStatFilters(), dateField: 'finished', dateRange: month })).toEqual([rows[0]]);
    });
    it('calculates a median without counting missing ratings as zero', () => {
        expect(statisticsRatingSummary([2, 8, 9, null].map(userRating => makeStatRecord(item({ userRating }))))).toEqual({ count: 3, median: 8 });
        expect(statisticsRatingSummary([2, 5].map(userRating => makeStatRecord(item({ userRating }))))).toEqual({ count: 2, median: 3.5 });
    });
    it('bundles finite country outlines with stable IDs and a recognizable range of regions', () => {
        expect(new Set(STAT_WORLD.map(country => country.code)).size).toBe(STAT_WORLD.length);
        for (const code of ['US', 'JP', 'UA', 'BR', 'ZA', 'AU']) expect(STAT_WORLD.find(country => country.code === code)?.path).toMatch(/^M[\d,.MLZl -]+Z$/);
        expect(STAT_WORLD.some(country => country.path.includes('NaN'))).toBe(false);
    });
});
