import type { DiscoveryContext } from '../types';
const value = (raw: unknown): string => typeof raw === 'string' ? raw.trim() : '';
export function normalizeDiscovery(raw: unknown): DiscoveryContext | undefined {
    const data = typeof raw === 'string' ? { reason: raw } : raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    const result = { reason: value(data.reason), recommendedBy: value(data.recommendedBy ?? data.recommended_by) };
    return Object.values(result).some(Boolean) ? result : undefined;
}
export function discoveryFrontmatter(raw: unknown): Record<string, string> | null {
    const data = normalizeDiscovery(raw);
    return data ? { recommended_by: data.recommendedBy, reason: data.reason } : null;
}
/** Write only explicit personal fields, including when an advanced template omits them. */
export function withPersonalFields(content: string, fields: Record<string, unknown>): string {
    const match = content.match(/^(\uFEFF?---\r?\n)([\s\S]*?)(\r?\n---)(?=\r?\n|$)/);
    const lines = match ? match[2].split(/\r?\n/) : [];
    for (const [key, data] of Object.entries(fields)) {
        const index = lines.findIndex(line => line.startsWith(key + ':'));
        const replacement = key + ': ' + JSON.stringify(data ?? null);
        if (index < 0) lines.push(replacement);
        else {
            let end = index + 1;
            while (end < lines.length && (/^\s+\S|^-\s/.test(lines[end]) || !lines[end].trim())) end++;
            lines.splice(index, end - index, replacement);
        }
    }
    return match ? match[1] + lines.join('\n') + match[3] + content.slice(match[0].length) : '---\n' + lines.join('\n') + '\n---\n\n' + content;
}
