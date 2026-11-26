import type { Language, MediaItem } from '../types';

export type ReleasePrecision = 'day' | 'month' | 'quarter' | 'year' | 'unknown';
export interface ReleaseWindow {
    value: string;
    precision: ReleasePrecision;
    /** Bounds are used for filtering, never as a confirmed release day. */
    start: Date | null;
    end: Date | null;
}
const fields = ['released', 'release_date', 'releaseDate', 'aired_on', 'air_date', 'premiered', 'first_air_date',
    'publishedDate', 'publish_date', 'published', 'publication_date', 'date'];

export function parseReleaseWindow(raw: unknown): ReleaseWindow | null {
    if (raw instanceof Date && Number.isFinite(raw.getTime())) raw = `${raw.getFullYear()}-${String(raw.getMonth()+1).padStart(2,'0')}-${String(raw.getDate()).padStart(2,'0')}`;
    if (typeof raw !== 'string' && typeof raw !== 'number') return null;
    let value = String(raw).trim();
    if (/^(unknown|tba|tbd|неизвестно|невідомо)$/i.test(value)) return { value: 'unknown', precision: 'unknown', start: null, end: null };
    value = value.replace(/^Q([1-4])\s+(\d{4})$/i, '$2-Q$1');
    const match = /^(\d{4})(?:[-/.](?:(Q[1-4])|(\d{1,2})(?:[-/.](\d{1,2}))?))?(?:T.*)?$/i.exec(value);
    if (!match) return null;
    const year = Number(match[1]), quarter = match[2] ? Number(match[2].slice(1)) : null;
    const month = match[3] ? Number(match[3]) : null, day = match[4] ? Number(match[4]) : null;
    if (year < 100 || year > 9999 || month !== null && (month < 1 || month > 12)) return null;
    const start = new Date(year, quarter ? (quarter-1)*3 : month ? month-1 : 0, day ?? 1);
    if (day !== null && (start.getFullYear() !== year || start.getMonth() !== month!-1 || start.getDate() !== day)) return null;
    const precision: ReleasePrecision = quarter ? 'quarter' : day !== null ? 'day' : month ? 'month' : 'year';
    const end = precision === 'day' ? new Date(year, month!-1, day!+1)
        : quarter ? new Date(year, quarter*3, 1) : month ? new Date(year, month, 1) : new Date(year+1,0,1);
    value = match[1] + (quarter ? `-Q${quarter}` : month ? `-${String(month).padStart(2,'0')}${day !== null ? '-'+String(day).padStart(2,'0') : ''}` : '');
    return { value, precision, start, end };
}

export function normalizeReleaseDate(raw: unknown): string {
    const parsed = parseReleaseWindow(raw);
    if (parsed) return parsed.value;
    if (typeof raw === 'string' && /^\d{4}[-/.]/.test(raw.trim())) return '';
    // Older provider notes may contain a written month or a timestamp.
    if (typeof raw !== 'string' || !/[a-z]|^\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4}$/i.test(raw.trim())) return '';
    const local = /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/.exec(raw.trim());
    if (local) return parseReleaseWindow(`${local[3]}-${local[2]}-${local[1]}`)?.value ?? '';
    const time = Date.parse(raw);
    if (!Number.isFinite(time)) return '';
    const date = new Date(time);
    if (/^[a-z]+[ ,]+\d{4}$/i.test(raw.trim())) return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
    return parseReleaseWindow(date)?.value ?? '';
}

export function getItemReleaseWindow(item: MediaItem): ReleaseWindow | null {
    // An explicit partial/unknown date must not fall back to an old exact date.
    const direct = parseReleaseWindow(normalizeReleaseDate(item.releaseDate));
    if (direct) return direct;
    for (const field of fields) {
        const parsed = parseReleaseWindow(normalizeReleaseDate(item.rawFields?.[field]));
        if (parsed) return parsed;
    }
    return null;
}

/** Keep a legacy/custom property in place without leaving a stale fallback alias. */
export function releaseDatePatch(frontmatter:Record<string,unknown>, raw:unknown, keys:readonly string[], fallback=keys[0]):Record<string,unknown> {
    const has=(key:string):boolean=>Object.prototype.hasOwnProperty.call(frontmatter,key);
    const selected=keys.find(has) ?? fallback;
    const updates:Record<string,unknown>={[selected]:normalizeReleaseDate(raw)||null};
    for(const key of keys) if(key !== selected && has(key)) updates[key]=null;
    return updates;
}

export function formatReleaseDate(raw: unknown, language: Language): string {
    const window = parseReleaseWindow(normalizeReleaseDate(raw));
    if (!window) return typeof raw === 'string' ? raw : '';
    if (window.precision === 'unknown') return { en:'Date unknown', ru:'Дата неизвестна', uk:'Дата невідома', 'zh-CN':'日期未知' }[language];
    const year = window.start!.getFullYear();
    if (window.precision === 'year') return String(year);
    if (window.precision === 'quarter') {
        const quarter = Number(window.value.slice(-1));
        return { en:`Q${quarter} ${year}`, ru:`${['I','II','III','IV'][quarter-1]} квартал ${year}`, uk:`${['I','II','III','IV'][quarter-1]} квартал ${year}`, 'zh-CN':`${year} 年第 ${quarter} 季度` }[language];
    }
    const result = new Intl.DateTimeFormat({ en:'en-US', ru:'ru-RU', uk:'uk-UA', 'zh-CN':'zh-CN' }[language], {
        year:'numeric', month:'long', ...(window.precision === 'day' ? { day:'numeric' as const } : {}),
    }).format(window.start!).replace(/\s*г\.$/,'');
    return result.charAt(0).toLocaleUpperCase()+result.slice(1);
}
