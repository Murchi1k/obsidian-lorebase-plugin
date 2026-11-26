// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { installStatisticsDom } from './helpers/statisticsDom';
import { DeezerInlinePlayer, type DeezerPreviewTarget } from '../src/components/DeezerInlinePlayer';
import { validDeezerPreview, loadDeezerPreviews, exactMusicPreview, type MusicPreview } from '../src/services/media/musicPlayback';

const audioElements: HTMLAudioElement[] = [];
beforeAll(installStatisticsDom);
beforeEach(() => {
    audioElements.length = 0;
    const create = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag, options) => {
        const node = create(tag, options);
        if (tag === 'audio') { Object.defineProperty(node, 'duration', { configurable: true, value: 29.8 }); audioElements.push(node as HTMLAudioElement); }
        return node;
    });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async function () { this.dispatchEvent(new Event('play')); });
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function () { this.dispatchEvent(new Event('pause')); });
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });
const preview: MusicPreview = { id: '1', title: 'Song', artist: 'Artist', album: 'Album', preview: 'https://cdnt-preview.dzcdn.net/clip.mp3', url: 'https://www.deezer.com/track/1' };
function target(key: string): DeezerPreviewTarget {
    const row = document.body.createDiv();
    return { key, query: { title: key, artist: 'Artist', deezerId: key }, host: row.createDiv(), button: row.createEl('button') };
}
describe('inline Deezer previews', () => {
    it('resolves a preview on demand and rejects non-provider audio hosts', async () => {
        const fetch = vi.fn(async (_url: string) => ({ id: 1, title: 'Song', artist: { name: 'Artist' }, album: { title: 'Album' }, preview: preview.preview }));
        expect(await loadDeezerPreviews(fetch, { title: 'Song', artist: 'Artist', deezerId: '1' })).toEqual([preview]);
        expect(fetch.mock.calls[0][0]).toBe('https://api.deezer.com/track/1');
        expect(validDeezerPreview('https://evil.test/clip.mp3')).toBeUndefined();
        expect(validDeezerPreview('http://cdnt-preview.dzcdn.net/clip.mp3')).toBeUndefined();
        expect(exactMusicPreview([preview], { title: 'song', artist: 'ARTIST' })).toBe(preview);
        expect(exactMusicPreview([preview, { ...preview, id: '2' }], { title: 'song', artist: 'ARTIST' })).toBeUndefined();
    });
    it('reveals only the clicked row, supports seek/volume/pause, and releases audio on destroy', async () => {
        const load = vi.fn(async () => [preview]); const player = new DeezerInlinePlayer(load);
        const first = target('1'), second = target('2'); player.mount([first, second]);
        expect(load).not.toHaveBeenCalled(); expect(document.querySelector('.lorebase-deezer-inline')).toBeNull();
        await player.toggle('1');
        const audio = audioElements[0]; audio.dispatchEvent(new Event('loadedmetadata'));
        expect(first.host.querySelector('.lorebase-deezer-inline')).not.toBeNull();
        expect(second.host.children).toHaveLength(0); expect(first.button.getAttribute('aria-pressed')).toBe('true');
        const seek = first.host.querySelector<HTMLInputElement>('input[type=range]')!;
        seek.value = '12.5'; seek.dispatchEvent(new Event('input')); expect(audio.currentTime).toBe(12.5);
        const volume = first.host.querySelectorAll<HTMLInputElement>('input[type=range]')[1];
        volume.value = '.35'; volume.dispatchEvent(new Event('input')); expect(audio.volume).toBe(.35);
        first.host.querySelector<HTMLButtonElement>('.lorebase-deezer-inline-controls button')!.click(); expect(audio.muted).toBe(true);
        await player.toggle('1'); expect(first.button.getAttribute('aria-pressed')).toBe('false');
        player.destroy(); expect(audio.hasAttribute('src')).toBe(false); expect(first.host.children).toHaveLength(0);
    });
    it('ignores a late request when another song is selected or the editor closes', async () => {
        const resolvers = new Map<string, (items: MusicPreview[]) => void>();
        const player = new DeezerInlinePlayer(query => new Promise(done => resolvers.set(query.deezerId!, done)));
        const first = target('1'), second = target('2'); player.mount([first, second]);
        const one = player.toggle('1'), two = player.toggle('2');
        resolvers.get('1')!([preview]); await one; expect(audioElements).toHaveLength(0);
        player.destroy(); resolvers.get('2')!([preview]); await two;
        expect(audioElements).toHaveLength(0); expect(document.querySelector('.lorebase-deezer-inline')).toBeNull();
    });
    it('keeps the same audio when rows are reordered and stops when the active song is removed', async () => {
        const load = vi.fn(async () => [preview]); const player = new DeezerInlinePlayer(load);
        player.mount([target('1'), target('2')]); await player.toggle('1');
        const audio = audioElements[0]; audio.currentTime = 8;
        const replacement = target('1'); player.mount([target('2'), replacement]);
        expect(replacement.host.querySelector('.lorebase-deezer-inline')).not.toBeNull(); expect(audio.currentTime).toBe(8); expect(load).toHaveBeenCalledOnce();
        player.mount([target('2')]); expect(audio.hasAttribute('src')).toBe(false); expect(document.querySelector('.lorebase-deezer-inline')).toBeNull();
        player.destroy();
    });
    it('places ambiguous versions in the same row and plays only after the user chooses one', async () => {
        const player = new DeezerInlinePlayer(async () => [preview, { ...preview, id: '2', album: 'Remaster' }]);
        const row = target('song'); row.query = { title: 'Song', artist: 'Artist' }; player.mount([row]); await player.toggle('song');
        expect(audioElements).toHaveLength(0);
        const select = row.host.querySelector('select')!; select.value = '1'; select.dispatchEvent(new Event('change'));
        await vi.waitFor(() => expect(audioElements).toHaveLength(1));
        expect(document.querySelector('iframe')).toBeNull(); player.destroy();
    });
});
