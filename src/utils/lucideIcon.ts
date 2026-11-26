/** Accept icon names, Lucide links, or the class/name from copied Lucide markup. */
export function resolveLucideIcon(value: string, available: readonly string[]): string | null {
    const known = new Set(available);
    const text = value.trim();
    const candidates = [text];
    const link = text.match(/^https?:\/\/(?:www\.)?lucide\.dev\/icons\/([a-z0-9-]+)(?:[/?#].*)?$/i);
    if (link) candidates.push(link[1]);
    for (const match of text.matchAll(/\blucide-([a-z0-9-]+)\b/gi)) candidates.push(match[1]);
    if (/^[A-Za-z][A-Za-z0-9]*$/.test(text)) candidates.push(text.replace(/Icon$/, '').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase());
    for (const candidate of candidates) {
        const name = candidate.replace(/^lucide-/, '').replace(/-icon$/, '').toLowerCase();
        if (known.has(name)) return name;
        if (known.has(`lucide-${name}`)) return `lucide-${name}`;
    }
    return null;
}
