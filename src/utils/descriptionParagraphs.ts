/** Add reading breaks to plain provider text without modifying the stored description. */
export function descriptionParagraphs(raw: string): string[] {
    const paragraphs: string[] = [];
    for (const line of raw.replace(/\r\n?/g, '\n').split(/\n+/).map(value => value.trim()).filter(Boolean)) {
        if (line.length < 500) { paragraphs.push(line); continue; }
        const boundaries = /[.!?…]+[»”"')\]]*(?:[ \t]+|(?=[A-ZА-ЯЁІЇЄҐ])|$)|[。！？]+/gu;
        let start = 0, match: RegExpExecArray | null;
        while ((match = boundaries.exec(line))) {
            const end = match.index + match[0].length;
            if (end - start < 240 || line.length - end < 100) continue;
            paragraphs.push(line.slice(start, end).trim()); start = end;
        }
        const rest = line.slice(start).trim();
        if (rest) paragraphs.push(rest);
    }
    return paragraphs;
}

export function descriptionExcerpt(paragraphs: string[]): { paragraphs: string[]; shortened: boolean } {
    if (paragraphs.join('\n').length <= 500 && paragraphs.length <= 3) return { paragraphs, shortened: false };
    const excerpt: string[] = [];
    let length = 0;
    for (const paragraph of paragraphs) {
        if (length >= 240 || excerpt.length >= 3) break;
        const available = 420 - length;
        if (paragraph.length <= available) { excerpt.push(paragraph); length += paragraph.length; continue; }
        const boundary = paragraph.lastIndexOf(' ', available);
        excerpt.push(paragraph.slice(0, boundary > available * .6 ? boundary : available).trimEnd() + '…');
        break;
    }
    return { paragraphs: excerpt, shortened: true };
}
