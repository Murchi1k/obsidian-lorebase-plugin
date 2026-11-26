import { describe, expect, it } from 'vitest';
import { musicNoteClasses, upsertMusicTracklist } from '../src/services/media/musicNote';
import { normalizeMusicTracks } from '../src/services/media/music';

const labels = { title: 'Tracklist', song: 'Song', duration: 'Duration', listened: 'Listened', disc: 'Disc' };
const tracks = normalizeMusicTracks([{ id: 'a', title: 'A | <img> [link]', duration: 185, listened: true, favorite: true },
    { id: 'b', title: 'B', disc: 2, duration: 200, artist: 'Guest' }]);

describe('minimal music tracklists', () => {
    it('replaces the old empty panel with a native list without touching personal writing', () => {
        const original = '---\r\ntype: music\r\ntracks: []\r\n---\r\n\r\n```lorebase-music\r\n```\r\n\r\n## My Notes\r\n\r\nPersonal writing\r\n';
        const result = upsertMusicTracklist(original, tracks, 'Artist', labels);
        expect(result).not.toContain('```lorebase-music');
        expect(result).toContain('lorebase-note-tracklist-disc">Disc 2');
        expect(result).toContain('A | &lt;img&gt; [link]</span>');
        expect(result).toContain('title="Guest">B</span>');
        expect(result).toContain('lorebase-note-tracklist-time">3:20</span>');
        expect(result).not.toContain('<!--');
        expect(result).not.toContain('| ---');
        expect(result.endsWith('## My Notes\r\n\r\nPersonal writing\r\n')).toBe(true);
        expect(upsertMusicTracklist(result, tracks, 'Artist', labels)).toBe(result);
        const edited = upsertMusicTracklist(result, [{ ...tracks[0], title: 'Updated' }], 'Artist', labels);
        expect(edited).toContain('Updated');
        expect(edited).not.toContain('Disc 2');
        expect(edited.split('<details class="lorebase-note-tracklist" open>')).toHaveLength(2);
    });
    it('keeps examples, user code and unrelated tables and removes only an owned tracklist', () => {
        const original = '````markdown\n```lorebase-music\n```\n````\n\n| Personal | Table |\n| --- | --- |\n| Keep | Me |\n';
        const result = upsertMusicTracklist(original, tracks, 'Artist', labels);
        expect(result).toContain(original);
        expect(upsertMusicTracklist(result, [], 'Artist', labels)).toContain(original);
        expect(upsertMusicTracklist(result, [], 'Artist', labels)).not.toContain('<details class="lorebase-note-tracklist"');
        const custom = '```lorebase-music\ncustom text\n```\n';
        expect(upsertMusicTracklist(custom, [], 'Artist', labels)).toBe(custom);
    });
    it('migrates the generated table once, retaining other sections and user tables', () => {
        const previous = 'Intro\n\n<!-- lorebase:tracklist:start -->\n## Tracklist\n\n| # | Song |\n| --- | --- |\n| 1 | Old |\n<!-- lorebase:tracklist:end -->\n\n## My Notes\nMy text\n';
        const result = upsertMusicTracklist(previous, tracks, 'Artist', { ...labels, count: 'tracks' });
        expect(result).toContain('Intro\n');
        expect(result).toContain('2 tracks · 6:25');
        expect(result).not.toContain('lorebase:tracklist:');
        expect(result).not.toContain('| # | Song |');
        expect(result).toContain('## My Notes\nMy text\n');
        expect(upsertMusicTracklist(result, tracks, 'Artist', { ...labels, count: 'tracks' })).toBe(result);
    });
    it('preserves user CSS classes and deduplicates the class hiding the unsupported property', () => {
        expect(musicNoteClasses('custom, wide')).toEqual(['custom', 'wide', 'lorebase-music-note']);
        expect(musicNoteClasses(['custom', 'lorebase-music-note'])).toEqual(['custom', 'lorebase-music-note']);
    });
});
