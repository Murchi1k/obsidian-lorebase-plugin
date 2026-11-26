import { describe, expect, it } from 'vitest';
import { mergeInboxCandidates, parseInboxNote } from '../src/services/inbox/parser';

const parse = (body: string) => parseInboxNote('Notes/Plans.md', body);
describe('whole-note inbox opt-in', () => {
    it.each(['#lorebase', '#LB', '#lb', '#LoreBase', '#Lb'])('accepts %s once for the entire list', tag => {
        expect(parse(`${tag}\nПросто игры\nMortal Shell 2\nEVERWIND\nThe Blood of Dawnwalker`).map(item => item.title))
            .toEqual(['Mortal Shell 2', 'EVERWIND', 'The Blood of Dawnwalker']);
    });
    it.each(['#lbreak', '#lorebases', '#lb/other', '#lorebase-other', 'https://example.com/#lb', '`#LB`'])('does not mistake %s for an opt-in', tag => {
        expect(parse(`${tag}\nGame`)).toEqual([]);
    });
    it('ignores tags and list items in fenced code and Obsidian comments', () => {
        expect(parse('```md\n#LB\nGame\n```\nOther')).toEqual([]);
        expect(parse('%%\n#LB\nGame\n%%\nOther')).toEqual([]);
        expect(parse('<!-- #LB -->\nGame')).toEqual([]);
        expect(parse('#LB\n~~~\nNot a game\n~~~\n%% secret %%\nReal game').map(item => item.title)).toEqual(['Real game']);
    });
    it('supports metadata tags and excludes the YAML header', () => {
        expect(parseInboxNote('List.md', '---\ntags: [LB]\nother: value\n---\nGame', 'games', ['LB']).map(item => item.title)).toEqual(['Game']);
    });
    it('supports inline markers without requiring a tag on every item', () => {
        expect(parse('- Game A #LB\n- Game B').map(item => item.title)).toEqual(['Game A', 'Game B']);
    });
});
describe('inbox list extraction', () => {
    it('recognizes plain and Markdown media sections and adult flags', () => {
        const entries = parse('#LB\nПросто игры\nA\nПорно игры\nB\n## Аниме\nC\n## Книги\nD\n## Музыка\nE');
        expect(entries.map(item => [item.title, item.kind, item.isAdult])).toEqual([
            ['A', 'games', false], ['B', 'games', true], ['C', 'anime', false], ['D', 'books', false], ['E', 'music', false],
        ]);
        expect(entries[1].origins[0]).toMatchObject({ path: 'Notes/Plans.md', line: 5, section: 'Порно игры', text: 'B' });
    });
    it('keeps ratings, annotations and private links out of the catalogue query', () => {
        const [entry] = parse('#lorebase\nGame 6/10 (not released) ([https://example.com/private#secret](https://example.com/private#secret))');
        expect(entry.title).toBe('Game');
        expect(entry.rating10).toBe(6);
        expect(entry.notes).toEqual(['not released']);
        expect(entry.links).toEqual(['https://example.com/private#secret']);
        expect(entry.origins[0].text).toContain('6/10');
    });
    it('keeps demo, year and edition suffixes as part of the title', () => {
        expect(parse('#LB\nGame(demo)\nGame (2024)\nGame (Complete Edition)').map(item => item.title))
            .toEqual(['Game(demo)', 'Game (2024)', 'Game (Complete Edition)']);
    });
    it('preserves a marker-looking fragment inside a personal URL', () => {
        const [entry] = parse('#LB\nGame ([link](https://example.com/file?key=#LB))');
        expect(entry.links).toEqual(['https://example.com/file?key=#LB']);
    });
    it('handles bullets, checkboxes, Windows newlines, hard breaks and HTML spaces', () => {
        expect(parse('#LB\r\n- [ ] Game A\\\r\n&#x20;Game B<br>Game C\r\n1. Game D').map(item => item.title))
            .toEqual(['Game A', 'Game B', 'Game C', 'Game D']);
    });
    it('merges repeated titles but preserves every source and note', () => {
        const entries = mergeInboxCandidates([
            ...parse('#LB\nGame\nGame (waiting)\nGame'),
            ...parseInboxNote('Other.md', '#lb\nGame 8/10'),
        ]);
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({ title: 'Game', rating10: 8, notes: ['waiting'] });
        expect(entries[0].origins).toHaveLength(3);
    });
    it('does not merge different editions, years or media types', () => {
        expect(parse('#LB\nGame (2020)\nGame (2024)\n## Фильмы\nGame\n## Игры\nGame')).toHaveLength(4);
    });
    it('keeps receipt identities stable when unrelated lines are reordered', () => {
        const a = parse('#LB\nGame A\nGame B')[0];
        const b = parse('#LB\n\nGame B\nGame A')[1];
        expect(a.origins[0].id).toBe(b.origins[0].id);
        expect(a.origins[0].line).not.toBe(b.origins[0].line);
    });
    it('does not turn standalone links, images or table rows into titles', () => {
        expect(parse('#LB\nhttps://example.com/file\n![poster](https://example.com/a.jpg)\n| Game | score |\nActual game').map(item => item.title)).toEqual(['Actual game']);
    });
    it('does not mistake fences inside comments for real code blocks', () => {
        expect(parse('<!--\n```\n-->\n#lb\nGame A\n%%\n```\n%%\nGame B').map(item => item.title)).toEqual(['Game A', 'Game B']);
    });
    it('uses displayed punctuation in titles with Markdown escapes', () => {
        expect(parse('#LB\nSummer \\~ Life in the Countryside')[0].title).toBe('Summer ~ Life in the Countryside');
    });
});
