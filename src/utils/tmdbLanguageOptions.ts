import { TMDB_LANGUAGES } from '../services/integrations/providers/tmdb';

export function getTmdbLanguageOptions(locale: string): { value: string; label: string }[] {
    const languages = new Intl.DisplayNames([locale], { type: 'language' });
    const regions = new Intl.DisplayNames([locale], { type: 'region' });
    const counts = new Map<string, number>();
    for (const value of TMDB_LANGUAGES) {
        const language = value.split('-')[0];
        counts.set(language, (counts.get(language) ?? 0) + 1);
    }
    return TMDB_LANGUAGES.map(value => {
        const [language, region] = value.split('-');
        const name = languages.of(language) ?? language;
        let label = name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
        if ((counts.get(language) ?? 0) > 1) {
            label += ` (${regions.of(region) ?? region})`;
        }
        return { value, label };
    });
}
