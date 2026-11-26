const latin = 'qwertyuiop[]asdfghjkl;\'zxcvbnm,.';
const latinShift = 'QWERTYUIOP{}ASDFGHJKL:"ZXCVBNM<>';
const layouts = {
    ru: 'йцукенгшщзхъфывапролджэячсмитьбю',
    uk: 'йцукенгшщзхїфівапролджєячсмитьбю',
};
const toLatin = new Map<string, string>();
const toCyrillic = { ru: new Map<string, string>(), uk: new Map<string, string>() };
for (const language of ['ru', 'uk'] as const) {
    Array.from(layouts[language]).forEach((letter, index) => {
        toLatin.set(letter, latin[index]); toLatin.set(letter.toUpperCase(), latinShift[index]);
        toCyrillic[language].set(latin[index], letter);
        toCyrillic[language].set(latinShift[index], letter.toUpperCase());
    });
}
toLatin.set('ё', '`'); toLatin.set('Ё', '~');
toLatin.set('ґ', '\\'); toLatin.set('Ґ', '|');
toCyrillic.ru.set('`', 'ё'); toCyrillic.ru.set('~', 'Ё');
toCyrillic.uk.set('\\', 'ґ'); toCyrillic.uk.set('|', 'Ґ');

const replaceKeys = (query: string, map: ReadonlyMap<string, string>): string => Array.from(query, character => map.get(character) ?? character).join('');

/** Possible physical key mappings; callers decide whether a suggestion is useful. */
export function getKeyboardLayoutCandidates(query: string, language = 'ru'): string[] {
    const value = query.trim();
    const letters = value.match(/[a-zа-яёіїєґ]/gi) ?? [];
    if (letters.length < 2 || value.length < 3 || /(?:\b[a-z][a-z\d+.-]*:\/\/|\bwww\.)/i.test(value)) return [];
    const candidates = new Set<string>();
    if (/[а-яёіїєґ]/i.test(value)) candidates.add(replaceKeys(value, toLatin));
    if (/[a-z]/i.test(value)) {
        for (const layout of language === 'uk' ? ['uk', 'ru'] as const : ['ru', 'uk'] as const) {
            candidates.add(replaceKeys(value, toCyrillic[layout]));
        }
    }
    candidates.delete(value);
    return [...candidates];
}

/** Suggest physical keyboard keys, never transliteration or an automatic replacement. */
export function suggestKeyboardLayout(query: string, hasMatch: (query: string) => boolean, language = 'ru'): string | null {
    const candidates = getKeyboardLayoutCandidates(query, language);
    if (!candidates.length || hasMatch(query.trim())) return null;
    return candidates.find(candidate => hasMatch(candidate)) ?? null;
}
