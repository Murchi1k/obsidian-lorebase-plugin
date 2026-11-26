import type { MusicTrack } from '../../types';
import { formatDuration, musicTrackGroups, musicTrackSummary } from './music';

export const MUSIC_NOTE_CLASS = 'lorebase-music-note';
const START = '<!-- lorebase:tracklist:start -->';
const END = '<!-- lorebase:tracklist:end -->';

export function musicNoteClasses(value: unknown): string[] {
    const existing = Array.isArray(value) ? value.map(String) : typeof value === 'string' ? value.split(/[,\s]+/) : [];
    return [...new Set([...existing.filter(Boolean), MUSIC_NOTE_CLASS])];
}

type Labels = { title: string; song: string; duration: string; listened: string; disc: string; count?: string };
const cell = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/[\r\n]+/g, ' ');

/** Native HTML list: Obsidian renders it without a custom view or code-block processor. */
export function upsertMusicTracklist(content: string, tracks: readonly MusicTrack[], artist: string, labels: Labels): string {
    const newline = content.includes('\r\n') ? '\r\n' : '\n';
    const lines = content.split(/\r?\n/);
    let fence: { character: string; length: number; start: number; legacy: boolean } | null = null;
    const remove = new Set<number>();
    let start = -1, end = -1, html = false;
    for (let index = 0; index < lines.length; index++) {
        const match = lines[index].match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
        if (match) {
            const [, marker, info] = match;
            if (fence) {
                if (marker[0] === fence.character && marker.length >= fence.length && !info.trim()) {
                    if (fence.legacy && lines.slice(fence.start + 1, index).every(line => !line.trim())) {
                        for (let line = fence.start; line <= index; line++) remove.add(line);
                    }
                    fence = null;
                }
            } else fence = { character: marker[0], length: marker.length, start: index, legacy: info.trim() === 'lorebase-music' };
            continue;
        }
        if (!fence && lines[index] === START && start < 0) start = index;
        if (!fence && lines[index] === '<details class="lorebase-note-tracklist" open>' && start < 0) { start = index; html = true; }
        if (!fence && start >= 0 && lines[index] === (html ? '</details>' : END)) { end = index; break; }
    }
    const table: string[] = [];
    if (tracks.length) {
        const summary = musicTrackSummary(tracks);
        const meta = `${summary.total} ${labels.count ?? labels.song}${summary.duration === null ? '' : ` · ${formatDuration(summary.duration)}`}`;
        table.push('<details class="lorebase-note-tracklist" open>',
            `<summary><span class="lorebase-note-tracklist-label">${cell(labels.title)}</span><span class="lorebase-note-tracklist-meta">${cell(meta)}</span></summary>`);
        const groups = musicTrackGroups(tracks);
        for (const group of groups) {
            if (groups.length > 1) table.push(`<div class="lorebase-note-tracklist-disc">${cell(labels.disc)} ${group.disc}</div>`);
            group.tracks.forEach((track, index) => {
                const credit = track.artist || artist;
                table.push(`<div class="lorebase-note-tracklist-row"><span class="lorebase-note-tracklist-number">${index + 1}</span><span class="lorebase-note-tracklist-song" title="${cell(credit)}">${cell(track.title)}</span><span class="lorebase-note-tracklist-time">${formatDuration(track.duration) || '—'}</span></div>`);
            });
        }
        table.push('</details>');
    }
    if (start >= 0 && end < 0) return content;
    if (end >= 0) {
        return lines.flatMap((line, index) => index === start ? table : index > start && index <= end || remove.has(index) ? [] : [line]).join(newline);
    }
    const clean = lines.filter((_line, index) => !remove.has(index));
    if (!table.length) return clean.join(newline);
    let boundary = 0;
    if (clean[0]?.trim() === '---') {
        const yamlEnd = clean.findIndex((line, index) => index > 0 && /^(---|\.\.\.)\s*$/.test(line));
        if (yamlEnd < 0) return content;
        boundary = yamlEnd + 1;
    }
    clean.splice(boundary, 0, '', ...table, '');
    return clean.join(newline);
}
