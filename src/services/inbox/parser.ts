import type { TemplateKind } from '../integrations/types';

export interface InboxOrigin {
    id: string;
    path: string;
    line: number;
    text: string;
    section: string;
}
export interface InboxCandidate {
    id: string;
    title: string;
    kind: TemplateKind;
    notes: string[];
    links: string[];
    rating10: number | null;
    isAdult: boolean;
    origins: InboxOrigin[];
}

// Exact tags only: #lbreak, #lb/other and URL fragments do not opt a note in.
const MARKER = /(^|[^\p{L}\p{N}_/#])#(?:lorebase|lb)(?![\p{L}\p{N}_/-])/giu;
const mediaHeadings: Array<[TemplateKind, RegExp]> = [
    ['games', /^(?:(?:просто|обычные|порно|adult|regular|18\+)\s+)?(?:игры|ігри|games|визуальные новеллы|visual novels)(?:\s*\(?(?:18\+|nsfw)\)?)?$/i],
    ['anime', /^(?:аниме|аніме|anime)$/i],
    ['movies', /^(?:фильмы|фільми|кино|movies|films)$/i],
    ['series', /^(?:сериалы|серіали|series|tv shows)$/i],
    ['books', /^(?:книги|books)$/i],
    ['manga', /^(?:манга|манхва|маньхуа|manga|manhwa|manhua)$/i],
    ['music', /^(?:музыка|музика|music|альбомы|альбоми|albums)$/i],
];

export function inboxTitleKey(value: string): string {
    return value.normalize('NFKC').toLocaleLowerCase().replace(/[“”«»"']/g, '').replace(/[\s_]+/g, ' ').trim();
}
function fingerprint(value: string): string {
    let a = 2166136261, b = 5381;
    for (let i = 0; i < value.length; i++) {
        a = Math.imul(a ^ value.charCodeAt(i), 16777619);
        b = Math.imul(b, 33) ^ value.charCodeAt(value.length - i - 1);
    }
    return (a >>> 0).toString(36) + '-' + (b >>> 0).toString(36);
}
function clean(value: string): string {
    return value.replace(/(?:&nbsp;|&#x20;|&#32;)/gi, ' ').replace(/&amp;/gi, '&')
        .replace(/\\\s*$/, '').replace(/\s+/g, ' ').trim();
}
function stripMarkers(value: string): string {
    const protectedRanges: Array<[number, number]> = [];
    const pattern = /https?:\/\/\S+|`[^`]*`/gi;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(value))) protectedRanges.push([match.index, match.index + match[0].length]);
    MARKER.lastIndex = 0;
    return value.replace(MARKER, (all, prefix: string, offset: number) =>
        protectedRanges.some(([start, end]) => offset >= start && offset < end) ? all : prefix);
}

/** Parsing is local and side-effect free. No source note, link or provider is opened. */
export function parseInboxNote(path: string, content: string, fallback: TemplateKind = 'games', tags: readonly string[] = []): InboxCandidate[] {
    const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/);
    let frontmatter = lines[0]?.trim() === '---', fence = '', comment = false, htmlComment = false;
    const body: Array<{ text: string; line: number }> = [];
    for (let i = 0; i < lines.length; i++) {
        if (frontmatter) { if (i > 0 && /^(?:---|\.\.\.)\s*$/.test(lines[i])) frontmatter = false; continue; }
        const line = lines[i];
        if (fence) {
            const close = /^\s{0,3}(`{3,}|~{3,})\s*$/.exec(line);
            if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = '';
            continue;
        }
        let text = '';
        // Obsidian %% comments can span lines; code and comments cannot opt a note in.
        const pieces = line.split('%%');
        for (let n = 0; n < pieces.length; n++) { if (n) comment = !comment; if (!comment) text += pieces[n]; }
        const htmlPieces = text.split(/(<!--|-->)/);
        text = '';
        for (const piece of htmlPieces) {
            if (piece === '<!--') htmlComment = true;
            else if (piece === '-->') htmlComment = false;
            else if (!htmlComment) text += piece;
        }
        const code = /^\s{0,3}(`{3,}|~{3,})/.exec(text);
        if (code) { fence = code[1]; continue; }
        for (const part of text.split(/<br\s*\/?\s*>/i)) body.push({ text: part, line: i + 1 });
    }
    const tagged = tags.some(tag => /^(?:#)?(?:lorebase|lb)$/i.test(tag)) || body.some(({ text }) => {
        MARKER.lastIndex = 0;
        return MARKER.test(text.replace(/`[^`]*`/g, '').replace(/https?:\/\/\S+/gi, ''));
    });
    if (!tagged) return [];
    let kind = fallback, section = '', adult = false;
    const result: InboxCandidate[] = [];
    for (const entry of body) {
        const original = clean(entry.text);
        let text = clean(stripMarkers(original));
        if (!text || /^(?:[-*_]\s*){3,}$/.test(text) || /^\s*\|/.test(text) || /^(?:https?:\/\/|!\[)/i.test(text)) continue;
        const heading = /^#{1,6}\s+(.+?)(?:\s+#+)?$/.exec(text);
        const label = (heading?.[1] ?? text).replace(/^\*\*(.*?)\*\*$/, '$1').replace(/:$/, '').trim();
        const group = mediaHeadings.find(([, pattern]) => pattern.test(label));
        if (heading || group || /:$/.test(text)) {
            section = label; if (group) kind = group[0];
            adult = /(?:порно|18\+|adult|nsfw)/i.test(label);
            continue;
        }
        text = text.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, '').replace(/^\[[ xX]\]\s*/, '')
            .replace(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/, (_all: string, target: string, alias?: string) => alias || target);
        const links: string[] = [], notes: string[] = [];
        text = text.replace(/\[([^\]]*)\]\((https?:\/\/[^\s]+?)\)/gi, (_all, label: string, url: string) => {
            links.push(url); return label === url ? '' : label;
        }).replace(/https?:\/\/[^\s<>\])]+/gi, url => { links.push(url); return ''; });
        text = text.replace(/\(\s*\)/g, '').trim();
        let rating10: number | null = null;
        text = text.replace(/(?:^|\s)(\d{1,2}(?:[.,]\d+)?)\s*\/\s*10(?=$|\s|\()/, (all, value: string) => {
            const number = Number(value.replace(',', '.'));
            if (number < 0 || number > 10) return all;
            rating10 = number; return ' ';
        });
        let tail: RegExpExecArray | null;
        while ((tail = /\s*\(([^()]*)\)\s*$/.exec(text))) {
            if (/^(?:\d{4}|demo|remaster(?:ed)?|remake|[^\n]*edition|part\s+\d+|часть\s+\d+)$/i.test(tail[1].trim())) break;
            if (tail[1].trim()) notes.unshift(tail[1].trim());
            text = text.slice(0, tail.index).trim();
        }
        const title = clean(text.replace(/^\*\*|\*\*$/g, '').replace(/^`|`$/g, '').replace(/\\([\\`*_{}[\]()#+\-.!~>])/g, '$1'));
        if (!title || !/[\p{L}\p{N}]/u.test(title) || title.startsWith('#')) continue;
        const origin: InboxOrigin = { id: path + '::' + fingerprint(original), path, line: entry.line, text: original, section };
        result.push({ id: kind + ':' + inboxTitleKey(title), title, kind, notes, links: [...new Set(links)], rating10, isAdult: adult, origins: [origin] });
    }
    return mergeInboxCandidates(result);
}

export function mergeInboxCandidates(entries: readonly InboxCandidate[]): InboxCandidate[] {
    const result = new Map<string, InboxCandidate>();
    for (const entry of entries) {
        const key = entry.kind + ':' + inboxTitleKey(entry.title);
        const current = result.get(key);
        if (!current) { result.set(key, { ...entry, id: key, notes: [...entry.notes], links: [...entry.links], origins: [...entry.origins] }); continue; }
        current.notes = [...new Set([...current.notes, ...entry.notes])];
        current.links = [...new Set([...current.links, ...entry.links])];
        current.origins = [...new Map([...current.origins, ...entry.origins].map(origin => [origin.id, origin])).values()];
        if (current.rating10 === null) current.rating10 = entry.rating10;
        else if (entry.rating10 !== null && entry.rating10 !== current.rating10) current.notes.push(`${entry.rating10}/10 (${entry.origins[0]?.path ?? ''})`);
        current.isAdult ||= entry.isAdult;
    }
    return [...result.values()];
}
