import type { App, TFile } from 'obsidian';

const MY_NOTES_HEADING = 'My Notes';
interface Section { start: number; body: number; end: number }

/** Find actual sections, ignoring fenced examples, comments and frontmatter. */
function findSection(content: string, heading: string): { section?: Section; openBlock: boolean } {
    let offset = 0;
    let fence: { marker: string; length: number } | undefined;
    let comment = false;
    let frontmatter = false;
    let section: Section | undefined;
    const lines = content.match(/[^\n]*\n|[^\n]+$/g) ?? [];
    for (let index = 0; index < lines.length; index++) {
        const raw = lines[index];
        const line = raw.replace(/\r?\n$/, '');
        const start = offset;
        offset += raw.length;
        if (index === 0 && /^\uFEFF?---[ \t]*$/.test(line)) { frontmatter = true; continue; }
        if (frontmatter) { if (/^(?:---|\.\.\.)[ \t]*$/.test(line)) frontmatter = false; continue; }
        if (fence) {
            const close = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
            if (close && close[1][0] === fence.marker && close[1].length >= fence.length) fence = undefined;
            continue;
        }
        if (comment) { if (line.includes('-->')) comment = false; continue; }
        if (/^ {0,3}<!--/.test(line)) { comment = !line.includes('-->'); continue; }
        const opening = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
        if (opening && (opening[1][0] !== '`' || !opening[2].includes('`'))) {
            fence = { marker: opening[1][0], length: opening[1].length }; continue;
        }
        const title = line.match(/^ {0,3}(#{1,6})(?:[ \t]+(.*)|[ \t]*)$/);
        if (!title) continue;
        const level = title[1].length;
        if (section && level <= 2) { section.end = start; return { section, openBlock: false }; }
        const name = (title[2] ?? '').replace(/[ \t]+#+[ \t]*$/, '').trim();
        if (level === 2 && name.toLocaleLowerCase() === heading.toLocaleLowerCase()) {
            section = { start, body: offset, end: content.length };
        }
    }
    return { section, openBlock: Boolean(fence || comment || frontmatter) };
}

export function extractMarkdownSection(content: string, heading: string = MY_NOTES_HEADING): string {
    const { section } = findSection(content, heading);
    return section ? content.slice(section.body, section.end).replace(/^(?:[ \t]*\r?\n)+/, '').replace(/\s+$/, '') : '';
}

export function upsertMarkdownSection(content: string, heading: string = MY_NOTES_HEADING, value: string): string {
    const { section, openBlock } = findSection(content, heading);
    const newline = content.includes('\r\n') ? '\r\n' : '\n';
    const normalized = value.trim().replace(/\r?\n/g, newline);
    if (!section) {
        if (!normalized) return content;
        if (openBlock) throw new Error('Close the Markdown code block, comment or frontmatter before adding My Notes.');
        const gap = !content || content.endsWith(newline + newline) ? '' : content.endsWith(newline) ? newline : newline + newline;
        return content + gap + `## ${heading}${newline}${newline}${normalized}${newline}`;
    }
    const before = content.slice(0, section.start);
    const after = content.slice(section.end);
    if (!normalized) return before + after;
    return before + `## ${heading}${newline}${newline}${normalized}${newline}` + (after ? newline + after : '');
}

/** Obsidian transforms the latest contents under its per-file write lock. */
export async function updateMarkdownSection(app: App, file: TFile, value: string, heading = MY_NOTES_HEADING, beforeWrite?: () => void): Promise<void> {
    beforeWrite?.();
    await app.vault.process(file, content => { beforeWrite?.(); return upsertMarkdownSection(content, heading, value); });
}
