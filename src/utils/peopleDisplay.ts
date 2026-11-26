/** TMDB aliases are not language-tagged. Prefer an available spelling in the
 * selected language's script; keep the original when no suitable alias exists. */
function nameScript(language: string): RegExp | null {
    const code = language.split('-')[0].toLowerCase();
    if (['ru', 'uk', 'be', 'bg', 'sr', 'mk'].includes(code)) return /\p{Script=Cyrillic}/u;
    if (code === 'zh') return /\p{Script=Han}/u;
    if (code === 'ja') return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
    if (code === 'ko') return /\p{Script=Hangul}/u;
    if (['ar', 'fa', 'ur'].includes(code)) return /\p{Script=Arabic}/u;
    if (code === 'he') return /\p{Script=Hebrew}/u;
    if (code === 'el') return /\p{Script=Greek}/u;
    if (code === 'th') return /\p{Script=Thai}/u;
    return null;
}
export function needsPersonAlias(name: string, language: string): boolean {
    const script = nameScript(language); return Boolean(script && !script.test(name));
}
export function localizedPersonName(name: string, aliases: unknown, language: string): string {
    const script = nameScript(language); if (!script || !needsPersonAlias(name, language)) return name;
    const values = (Array.isArray(aliases) ? aliases : []).filter((value): value is string => typeof value === 'string' && script.test(value));
    const code = language.split('-')[0].toLowerCase();
    if (code === 'ru') return values.find(value => !/[ієїґў]/i.test(value))?.trim() || name;
    if (code === 'uk') return (values.find(value => /[ієїґ]/i.test(value)) || values.find(value => !/[ыэёъў]/i.test(value)))?.trim() || name;
    if (code === 'zh') return values.find(value => !/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value))?.trim() || name;
    return values[0]?.trim() || name;
}
const commonRoles: Record<string, readonly [string, string, string]> = {
    self: ['В роли себя', 'У ролі себе', '本人'], himself: ['В роли себя', 'У ролі себе', '本人'], herself: ['В роли себя', 'У ролі себе', '本人'],
    voice: ['озвучка', 'озвучення', '配音'], uncredited: ['нет в титрах', 'немає в титрах', '未署名'],
    'archive footage': ['архивные кадры', 'архівні кадри', '资料影像'],
    director: ['Режиссёр', 'Режисер', '导演'], producer: ['Продюсер', 'Продюсер', '制片人'],
    'executive producer': ['Исполнительный продюсер', 'Виконавчий продюсер', '执行制片人'],
    writer: ['Сценарист', 'Сценарист', '编剧'], screenplay: ['Сценарист', 'Сценарист', '编剧'],
    creator: ['Создатель', 'Творець', '创作者'], narrator: ['Рассказчик', 'Оповідач', '旁白'],
};
/** Translate known qualifiers/jobs only; never fabricate a character translation. */
export function localizedRole(role: string, language: string): string {
    const index = ({ ru: 0, uk: 1, zh: 2 } as Record<string, number>)[language.split('-')[0].toLowerCase()];
    if (index === undefined) return role;
    return role.replace(/\b(Self|Himself|Herself|Voice|Uncredited|Archive footage|Executive producer|Director|Producer|Writer|Screenplay|Creator|Narrator)\b/gi,
        value => commonRoles[value.toLowerCase()]?.[index] || value);
}
function dateParts(value: string): [number, number, number] | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value); if (!match) return null;
    const parts = match.slice(1).map(Number) as [number, number, number];
    const date = new Date(`${value}T12:00:00Z`);
    return date.getUTCFullYear() === parts[0] && date.getUTCMonth() + 1 === parts[1] && date.getUTCDate() === parts[2] ? parts : null;
}
export function formatPersonDate(value: string, language: string): string {
    return dateParts(value) ? new Intl.DateTimeFormat(language, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`)) : value;
}
export function personAge(birthday: string, deathday = '', today = new Date()): number | null {
    const birth = dateParts(birthday);
    const end = deathday ? dateParts(deathday) : [today.getUTCFullYear(), today.getUTCMonth() + 1, today.getUTCDate()];
    if (!birth || !end || end[0] < birth[0] || `${end[0]}-${String(end[1]).padStart(2, '0')}-${String(end[2]).padStart(2, '0')}` < birthday) return null;
    return end[0] - birth[0] - (end[1] < birth[1] || (end[1] === birth[1] && end[2] < birth[2]) ? 1 : 0);
}
export function formatPersonAge(age: number, language: string): string {
    return new Intl.NumberFormat(language, { style: 'unit', unit: 'year', unitDisplay: 'long' }).format(age);
}
