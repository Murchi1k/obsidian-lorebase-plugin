import { ISO_COUNTRY_CODES } from '../../assets/isoCountryCodes';
import countryCodes from '../../assets/worldCountryCodes.json';
import type { MediaItem } from '../../types';
import { STAT_WORLD } from '../../assets/statisticsWorld';

const normalize = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const aliases = new Map<string, string>();
const codes = [...new Set([...ISO_COUNTRY_CODES, ...Object.values(countryCodes), ...STAT_WORLD.map(country => country.code).filter(code => code.length === 2), ...'AD AG AI AW BB BH BM BN BS CV DM FM GD HK KI KN LC LI LU MC MH MO MT MU MV NR PW SC SG SM ST TO TT TV VA VC'.split(' ')])];
for (const code of codes) aliases.set(normalize(code), code);
for (const country of STAT_WORLD) if (country.code.length === 2) for (const name of country.aliases) aliases.set(normalize(name), country.code);
for (const locale of ['en', 'ru', 'uk', 'zh-CN', 'ja']) {
    const names = new Intl.DisplayNames([locale], { type: 'region' });
    for (const code of codes) { const name = names.of(code); if (name) aliases.set(normalize(name), code); }
}
for (const [name, code] of Object.entries({ USA: 'US', UK: 'GB', UAE: 'AE', 'United States of America': 'US', 'Russian Federation': 'RU', 'Korea, Republic of': 'KR', 'South Korea': 'KR', 'Republic of Korea': 'KR', 'Россия': 'RU', 'США': 'US', 'Великобритания': 'GB', 'Южная Корея': 'KR' })) aliases.set(normalize(name), code);

/** Read origin metadata only. Never infer a country from a title's language or creator. */
export function statisticsCountryCodes(item: MediaItem): string[] {
    const raw = item.rawFields ?? {}, found = new Set<string>();
    const add = (value: unknown): void => {
        if (Array.isArray(value)) { value.forEach(add); return; }
        if (value && typeof value === 'object') { const country = value as Record<string, unknown>; add(country.iso_3166_1 ?? country.country_code ?? country.code ?? country.name); return; }
        if (typeof value !== 'string') return;
        const code = aliases.get(normalize(value)); if (code) { found.add(code); return; }
        if (/[,;\n]/.test(value)) value.split(/[,;\n]/).forEach(part => { const code = aliases.get(normalize(part)); if (code) found.add(code); });
    };
    if (item.countries !== undefined || Object.prototype.hasOwnProperty.call(raw, 'countries')) { add(item.countries ?? raw.countries); return [...found]; }
    [raw.country, raw.production_countries, raw.origin_country, raw.country_of_origin, raw.countryOfOrigin, 'countryOfOrigin' in item ? item.countryOfOrigin : null].forEach(add);
    return [...found];
}
export function statisticsCountryLabel(code: string, locale: string): string {
    try { return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code; } catch { return code; }
}

export function statisticsCountryOptions(locale: string): Array<{ code: string; label: string }> {
    return codes.map(code => ({ code, label: statisticsCountryLabel(code, locale) })).sort((a,b) => a.label.localeCompare(b.label, locale));
}
export function resolveStatisticsCountry(value: string): string | null { return aliases.get(normalize(value)) ?? null; }

export function normalizeCountryMetadata(value: unknown): string[] { return statisticsCountryCodes({rawFields: {countries:value}} as unknown as MediaItem); }
