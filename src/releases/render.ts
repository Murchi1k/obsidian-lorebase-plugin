import type { Language } from '../types';
import { setIcon } from 'obsidian';
import { getReleaseHistory, type ChangeKind } from './catalog';
import { getReleaseCopy, HISTORY_COPY } from './copy';
import type { ReleaseWindowState } from './navigation';

/** Emphasize known product names and literal placeholders without parsing HTML. */
export function renderReleaseText(container: HTMLElement, text: string): void {
    const tokens = /\{\{VALUE:[^}]+\}\}|\b(?:HowLongToBeat|MusicBrainz|AniList|Shikimori|MangaUpdates|MangaDex|SteamGridDB|Steam Sync|Steam|TMDB|IGDB|Last\.fm|403|404|429)\b|[«“][^»”\n]{1,60}[»”]/g;
    let offset = 0;
    let match: RegExpExecArray | null;
    while ((match = tokens.exec(text)) !== null) {
        container.append(container.ownerDocument.createTextNode(text.slice(offset, match.index)));
        const code = match[0].startsWith('{{');
        container.createEl(code ? 'code' : 'b', { cls: code ? 'lorebase-release-inline-code' : 'lorebase-release-keyword', text: match[0] });
        offset = match.index + match[0].length;
    }
    container.append(container.ownerDocument.createTextNode(text.slice(offset)));
}

/** Keep the short heading separate from the original, unabridged release note. */
function noteBody(text: string, summary: string): string {
    if (!text.startsWith(summary)) return text;
    return text.slice(summary.length).replace(/^[.。:：\s—–]+/, '').trim();
}

export function renderReleaseHistory(container: HTMLElement, language: Language, installedVersion: string, state?: ReleaseWindowState): void {
    const copy = getReleaseCopy(language);
    const labels = HISTORY_COPY[language];
    const releases = getReleaseHistory(language, installedVersion);
    const root = container.createDiv({ cls: 'lorebase-release-history' });
    if (!releases.some(release => release.version === installedVersion)) {
        root.createEl('p', { cls: 'lorebase-release-muted', text: `v${installedVersion} · ${copy.empty}` });
    }
    if (!releases.length) return;
    const toolbar = root.createDiv({ cls: 'lorebase-release-history-tools' });
    const versions = toolbar.createDiv({ cls: 'lorebase-release-versions', attr: { role: 'group', 'aria-label': labels.version } });
    const label = toolbar.createEl('label', { cls: 'lorebase-release-details-toggle' });
    const detailed = label.createEl('input', { attr: { type: 'checkbox' } });
    detailed.checked = state?.historyDetails ?? false;
    label.createSpan({ text: labels.details });
    const navigation = root.createDiv({ cls: 'lorebase-release-group-nav', attr: { role: 'tablist', 'aria-label': labels.sections } });
    const body = root.createDiv({ cls: 'lorebase-release-history-body', attr: { tabindex: '0' } });
    const buttons: HTMLButtonElement[] = [];
    const expanded = new Map<string, boolean>();
    let selected = Math.max(0, releases.findIndex(release => release.version === state?.historyVersion));
    let kind: ChangeKind = state?.historyKind ?? 'added';
    const groupIcons = { added: 'circle-plus', improved: 'sparkles', fixed: 'wrench' };
    const render = (): void => {
        const release = releases[selected];
        const groups = release.groups.filter(group => group.items.length);
        const group = groups.find(group => group.kind === kind) ?? groups[0];
        if (!group) return;
        kind = group.kind;
        if (state) {
            state.historyVersion = release.version; state.historyDetails = detailed.checked;
            state.historyKind = kind;
        }
        navigation.empty(); body.empty(); body.scrollTop = 0;
        const heading = body.createDiv({ cls: 'lorebase-release-history-heading' });
        heading.createEl('h3', { text: `v${release.version}` });
        if (release.version === installedVersion) {
            heading.classList.add('is-installed');
            heading.createSpan({ cls: 'lorebase-release-badge is-installed', text: copy.installed });
        }
        if (release.notice) body.createEl('p', { cls: 'lorebase-release-muted', text: release.notice });
        const id = `lorebase-release-group-${release.version.replace(/\W/g, '-')}`;
        const tabs: HTMLButtonElement[] = [];
        groups.forEach((category, index) => {
            const active = category.kind === kind;
            const tab = navigation.createEl('button', { cls: `is-${category.kind}`, attr: {
                type: 'button', role: 'tab', id: `${id}-tab-${category.kind}`, 'aria-controls': id,
                'aria-selected': String(active), tabindex: active ? '0' : '-1',
            } });
            setIcon(tab.createSpan({ cls: 'lorebase-release-group-nav-icon', attr: { 'aria-hidden': 'true' } }), groupIcons[category.kind]);
            tab.createSpan({ cls: 'lorebase-release-group-nav-label', text: copy[category.kind] });
            tab.createSpan({ cls: 'lorebase-release-count', text: String(category.items.length) });
            tab.addEventListener('click', () => { kind = category.kind; render(); });
            tab.addEventListener('keydown', event => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? groups.length - 1
                    : (index + (event.key === 'ArrowRight' ? 1 : -1) + groups.length) % groups.length;
                tabs[next].click();
                navigation.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
            });
            tabs.push(tab);
        });
        const section = body.createEl('section', { cls: `lorebase-release-group is-${kind}`, attr: {
            id, role: 'tabpanel', 'aria-labelledby': `${id}-tab-${kind}`,
        } });
        const list = section.createEl('ul', { cls: 'lorebase-release-note-list' });
        for (let index = 0; index < group.items.length; index++) {
            const text = group.items[index];
            const title = group.summaries?.[index] ?? text;
            const description = noteBody(text, title);
            const codes = kind === 'fixed'
                ? [...new Set(text.match(/\b[45]\d{2}\b/g) ?? [])].filter(code => !title.includes(code))
                : [];
            const displayTitle = codes.length ? `${title} · ${codes.join(', ')}` : title;
            const item = list.createEl('li');
            const hasDetails = !!description && description !== title;
            const disclosure = item.createEl(hasDetails ? 'details' : 'article', { cls: 'lorebase-release-note' });
            const key = `${release.version}:${kind}:${index}`;
            if (hasDetails) (disclosure as HTMLDetailsElement).open = expanded.get(key) ?? detailed.checked;
            const summary = disclosure.createEl(hasDetails ? 'summary' : 'div', { cls: 'lorebase-release-note-summary' });
            const icon = summary.createSpan({ cls: 'lorebase-release-item-icon', attr: { 'aria-hidden': 'true' } });
            setIcon(icon, group.icons?.[index] ?? groupIcons[kind]);
            summary.createSpan({ cls: 'lorebase-release-note-title', text: displayTitle });
            if (hasDetails) setIcon(summary.createSpan({ cls: 'lorebase-release-note-chevron', attr: { 'aria-hidden': 'true' } }), 'chevron-down');
            if (hasDetails) {
                const content = disclosure.createDiv({ cls: 'lorebase-release-item-content' });
                const sentences = description.split(/(?<=[.!?。！？])\s+(?=[A-ZА-ЯЁІЇЄҐ])/u);
                let paragraph = '';
                for (const sentence of sentences) {
                    paragraph += (paragraph ? ' ' : '') + sentence;
                    if (paragraph.length >= 160) { renderReleaseText(content.createEl('p'), paragraph); paragraph = ''; }
                }
                if (paragraph) renderReleaseText(content.createEl('p'), paragraph);
            }
            if (hasDetails) disclosure.addEventListener('toggle', () => { if (disclosure.isConnected) expanded.set(key, (disclosure as HTMLDetailsElement).open); });
        }
        buttons.forEach((button, index) => button.setAttribute('aria-pressed', String(index === selected)));
    };
    releases.forEach((release, index) => {
        const button = versions.createEl('button', { text: release.version, attr: { type: 'button' } });
        if (release.version === installedVersion) {
            button.classList.add('is-installed'); button.title = `${release.version} · ${copy.installed}`;
            button.setAttribute('aria-label', button.title); button.setAttribute('aria-current', 'true');
            button.createSpan({ cls: 'lorebase-release-installed-dot', attr: { 'aria-hidden': 'true' } });
        }
        button.addEventListener('click', () => { selected = index; render(); });
        buttons.push(button);
    });
    detailed.addEventListener('change', () => { expanded.clear(); render(); });
    render();
}
