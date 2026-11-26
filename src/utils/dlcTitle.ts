/** Display the distinguishing DLC name; keep the original title in the model. */
export function getDlcDisplayTitle(title: string, gameTitle: string): string {
    const full = title.trim();
    const base = gameTitle.trim();
    if (!base || !full.toLocaleLowerCase().startsWith(base.toLocaleLowerCase())) return full;
    const suffix = full.slice(base.length);
    if (!/^\s*[-:–—|]\s*/.test(suffix)) return full;
    return suffix.replace(/^\s*[-:–—|]\s*/, '').trim() || full;
}
