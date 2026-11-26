// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PartEpisodesControl } from '../src/components/PartEpisodesControl';
import { setPartEpisodeCurrent } from '../src/services/media/videoProgress';
import type { EpisodeInfo, VideoPart } from '../src/types';
afterEach(() => document.body.replaceChildren());
function fixture(total: number | null = 12, load?: (part: VideoPart) => Promise<EpisodeInfo[]>) {
    let part: VideoPart = { id: 's1', kind: 'season', title: 'Season', seasonNumber: 1, episodeCurrent: 2, episodeTotal: total, status: 'watching' };
    const host = document.createElement('div'); document.body.append(host);
    const changed = vi.fn((change: string) => { if (change === 'progress') setPartEpisodeCurrent(part, part.episodeCurrent || 0); });
    const control = new PartEpisodesControl(host, () => part, changed, load as any);
    const enable = () => host.querySelectorAll<HTMLButtonElement>('.lorebase-episodes-mode button')[1].click();
    return { control, host, changed, enable, get part() { return part; }, setPart: (value: VideoPart) => { part = value; control.update(); } };
}
describe('part episode control', () => {
    it('supports sparse toggles, bulk marks and reset without writing notes', () => {
        const test = fixture(); test.enable();
        test.host.querySelector<HTMLButtonElement>('[data-episode="5"]')!.click();
        expect(test.part.watchedEpisodes).toEqual([1, 2, 5]);
        expect(document.activeElement?.getAttribute('data-episode')).toBe('5');
        test.host.querySelectorAll<HTMLButtonElement>('.lorebase-episodes-actions button')[0].click();
        expect(test.part.status).toBe('completed'); expect(test.part.episodeCurrent).toBe(12);
        test.host.querySelectorAll<HTMLButtonElement>('.lorebase-episodes-actions button')[1].click();
        expect(test.part.watchedEpisodes).toEqual([]); expect(test.part.status).toBe('planned'); test.control.destroy();
    });
    it('bounds large catalogs and retains checks when changing grid/list or pages', () => {
        const test = fixture(1600); test.enable(); expect(test.host.querySelectorAll('[data-episode]')).toHaveLength(120);
        test.host.querySelectorAll<HTMLButtonElement>('.lorebase-episodes-paging button')[1].click();
        test.host.querySelector<HTMLButtonElement>('[data-episode="125"]')!.click(); expect(test.part.watchedEpisodes).toEqual([1, 2, 125]);
        test.host.querySelectorAll<HTMLButtonElement>('.lorebase-episodes-views button')[1].click();
        expect(test.host.querySelectorAll('[data-episode]')).toHaveLength(120); expect(test.part.watchedEpisodes).toEqual([1, 2, 125]); test.control.destroy();
    });
    it('shows the full episode list for ordinary seasons and marks through a first Shift-click', () => {
        const test = fixture(80); test.enable();
        test.host.querySelectorAll<HTMLButtonElement>('.lorebase-episodes-views button')[1].click();
        expect(test.host.querySelectorAll('[data-episode]')).toHaveLength(80);
        test.host.querySelector('[data-episode="70"]')!.dispatchEvent(new MouseEvent('click', { shiftKey: true }));
        expect(test.part.watchedEpisodes).toEqual(Array.from({ length: 70 }, (_, i) => i + 1));
        expect(test.part.episodeCurrent).toBe(70);
        test.control.destroy();
    });
    it('marks a range across pages without altering checks outside it', () => {
        const test = fixture(140); test.enable();
        test.host.querySelector<HTMLButtonElement>('[data-episode="118"]')!.click();
        test.host.querySelectorAll<HTMLButtonElement>('.lorebase-episodes-paging button')[1].click();
        test.host.querySelector('[data-episode="125"]')!.dispatchEvent(new MouseEvent('click', { shiftKey: true }));
        expect(test.part.watchedEpisodes).toEqual([1, 2, 118, 119, 120, 121, 122, 123, 124, 125]);
        expect(document.activeElement?.getAttribute('data-episode')).toBe('125');
        test.setPart({ ...test.part, id: 's2', watchedEpisodes: [20], episodeCurrent: 1 });
        test.host.querySelector('[data-episode="4"]')!.dispatchEvent(new MouseEvent('click', { shiftKey: true }));
        expect(test.part.watchedEpisodes).toEqual([1, 2, 3, 4, 20]);
        test.control.destroy();
    });
    it('does not pretend an unknown total is finished', () => {
        const test = fixture(null); test.enable();
        expect(test.host.querySelector<HTMLButtonElement>('.lorebase-episodes-actions button')!.disabled).toBe(true);
        test.host.querySelector<HTMLButtonElement>('[data-episode="7"]')!.click();
        expect(test.part.episodeTotal).toBeNull(); expect(test.part.status).toBe('watching'); test.control.destroy();
    });
    it('does not apply an episode request to a different season or after closing', async () => {
        let resolve!: (value: EpisodeInfo[]) => void;
        const test = fixture(12, () => new Promise(done => resolve = done)); test.enable();
        test.host.querySelector<HTMLButtonElement>('.lorebase-episodes-load')!.click();
        test.setPart({ ...test.part, id: 's2', episodeDetails: undefined }); resolve([{ number: 1, title: 'Wrong season' }]);
        await Promise.resolve(); await Promise.resolve(); expect(test.part.episodeDetails).toBeUndefined();
        test.host.querySelector<HTMLButtonElement>('.lorebase-episodes-load')!.click(); test.control.destroy(); resolve([{ number: 1, title: 'Late' }]);
        await Promise.resolve(); await Promise.resolve(); expect(test.host.childElementCount).toBe(0); expect(test.part.episodeDetails).toBeUndefined();
    });
    it('keeps marks and existing names when metadata loads or fails', async () => {
        const load = vi.fn().mockResolvedValueOnce([{ number: 2, title: '<script>unsafe</script>' }]).mockRejectedValueOnce(new Error('offline'));
        const test = fixture(12, load); test.enable();
        test.host.querySelector<HTMLButtonElement>('.lorebase-episodes-load')!.click();
        await vi.waitFor(() => expect(test.part.episodeDetails?.length).toBe(1));
        test.host.querySelectorAll<HTMLButtonElement>('.lorebase-episodes-views button')[1].click();
        expect(test.host.querySelector('script')).toBeNull(); expect(test.host.textContent).toContain('<script>unsafe</script>');
        test.host.querySelector<HTMLButtonElement>('.lorebase-episodes-load')!.click();
        await vi.waitFor(() => expect(test.host.querySelector('.lorebase-episodes-message')).not.toBeNull());
        expect(test.part.watchedEpisodes).toEqual([1, 2]); expect(test.part.episodeDetails?.length).toBe(1); test.control.destroy();
    });
});
