// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameTrackingPanel } from '../src/components/GameTrackingPanel';
import { getSteamTracking } from '../src/services/integrations/providers/steamTracking';
import { GameService } from '../src/services/GameService';
import { createMockApp, createMockFile, createMetadataService } from './helpers/testHelpers';
import { achievementProgress, trackingNumber, gameModes } from '../src/utils/gameTracking';
import { gt } from '../src/localization/gameTracking';
import type { GameItem } from '../src/types';

afterEach(() => document.body.replaceChildren());
const profile = '76561198000000000';
describe('Steam game tracking', () => {
    it('uses user stats and the game schema when the achievements endpoint is unavailable', async () => {
        const fetch = async (url: string) => {
            if (url.includes('GetOwnedGames')) return { response: { games: [{ appid: 42, playtime_forever: 20 }] } };
            if (url.includes('GetPlayerAchievements')) return { playerstats: { success: false } };
            if (url.includes('GetUserStatsForGame')) return { playerstats: { steamID: profile, achievements: [{ name: 'ONE', achieved: 1 }] } };
            return { game: { availableGameStats: { achievements: [{ name: 'ONE' }, { name: 'TWO' }, { name: 'THREE' }] } } };
        };
        expect(await getSteamTracking(fetch, profile, 'secret', '42')).toMatchObject({ partial: false, achievementsUnlocked: 1, achievementsTotal: 3 });
    });
    it('requests the selected app, distinguishes zero from unavailable, and counts achievements', async () => {
        const fetch = vi.fn(async (url: string) => url.includes('GetOwnedGames')
            ? { response: { games: [{ appid: 42, playtime_forever: 0 }] } }
            : { playerstats: { success: true, achievements: [{ achieved: 1 }, { achieved: 0 }] } });
        expect(await getSteamTracking(fetch, profile, 'secret', '42')).toEqual({ partial: false, playtimeMinutes: 0, achievementsUnlocked: 1, achievementsTotal: 2 });
        expect(JSON.parse(new URL(fetch.mock.calls[0][0]).searchParams.get('input_json')!)).toMatchObject({ steamid: profile, appids_filter: [42] });
    });
    it('preserves unavailable fields when either endpoint fails and never invents zero playtime', async () => {
        const fetch = async (url: string) => { if (url.includes('GetOwnedGames')) throw Error('private'); return { playerstats: { success: true, achievements: [] } }; };
        expect(await getSteamTracking(fetch, profile, 'secret', '42')).toEqual({ partial: true, achievementsUnlocked: 0, achievementsTotal: 0 });
        await expect(getSteamTracking(async () => ({}), profile, 'secret', '42')).rejects.toThrow('unavailable');
        const never = vi.fn();
        await expect(getSteamTracking(never, profile, '', '42')).rejects.toThrow('configured'); expect(never).not.toHaveBeenCalled();
    });
});
describe('personal game data', () => {
    it('round-trips personal fields, reads existing Steam minutes and leaves progress independent of status', async () => {
        const file = createMockFile('Games/Test.md', 'Test');
        const fm: Record<string, unknown> = { type: 'game', status: 'completed', playtime: 125, progress_percent: 30, game_modes: ['solo'], custom: 'keep' };
        const app = createMockApp({ [file.path]: { frontmatter: fm } });
        app.vault.getAbstractFileByPath = () => file;
        app.fileManager.processFrontMatter = async (_file, callback) => callback(fm);
        const service = new GameService(app, createMetadataService(app));
        const item = service.parseGameFromCache(file)!;
        expect(item).toMatchObject({ progressPercent: 30, playtimeMinutes: 125, gameModes: ['solo'] });
        await service.updateGame(item, { playtimeMinutes: 180, achievementsUnlocked: 2, achievementsTotal: 10, gameModes: ['coop', 'multiplayer'] });
        expect(service.parseGameFromCache(file)).toMatchObject({ progressPercent: 30, playtimeMinutes: 180, achievementsUnlocked: 2, achievementsTotal: 10, gameModes: ['coop', 'multiplayer'] });
        expect(fm.progress_percent).toBe(30);
        await service.updateGame(item, { progressPercent: 55 });
        expect(fm.progress_percent).toBe(55);
        expect(fm.custom).toBe('keep'); expect(fm.status).toBe('completed');
        expect(trackingNumber('not a number')).toBeNull(); expect(trackingNumber('', 100)).toBeNull();
        expect(gameModes(['solo', 'solo', 'unknown'])).toEqual(['solo']);
    });
});
function fixture(refresh = vi.fn(async () => ({ partial: true, playtimeMinutes: 60 }))) {
    const root = document.body.appendChild(document.createElement('section'));
    const game = { progressPercent: 40, playtimeMinutes: 125, achievementsUnlocked: 3, achievementsTotal: 10, gameModes: ['solo'], steamAppId: '42' } as GameItem;
    const panel = new GameTrackingPanel(root, game, refresh);
    const field = (label: string) => root.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
    return { root, game, panel, field, refresh };
}
describe('game editor draft', () => {
    it('tracks only changed fields and validates counts without altering the source item', () => {
        const { root, panel, game, field } = fixture();
        expect(panel.getValue()).toEqual({});
        const progress = root.querySelector<HTMLElement>('[role=progressbar]')!;
        expect(progress.getAttribute('aria-valuenow')).toBe('40');
        expect(root.querySelector('input[type=range]')).toBeNull();
        expect(root.querySelector(`input[aria-label="${gt('steamId')}"]`)).toBeNull();
        field(gt('unlocked')).value = '11'; field(gt('unlocked')).dispatchEvent(new Event('input'));
        expect(panel.validate()).toBe(false);
        field(gt('total')).value = '12'; field(gt('total')).dispatchEvent(new Event('input'));
        expect(panel.validate()).toBe(true);
        expect(game.progressPercent).toBe(40);
        expect(panel.getValue()).toMatchObject({ achievementsUnlocked: 11, achievementsTotal: 12 });
        expect(panel.getValue()).not.toHaveProperty('progressPercent');
        expect(progress.getAttribute('aria-valuenow')).toBe('40');
        root.querySelector<HTMLButtonElement>('.lorebase-game-apply-progress')!.click();
        expect(panel.getValue().progressPercent).toBe(92);
        expect(progress.getAttribute('aria-valuenow')).toBe('92');
        field(gt('progress')).value = '67'; field(gt('progress')).dispatchEvent(new Event('input'));
        expect(panel.getValue().progressPercent).toBe(67);
        expect(progress.getAttribute('aria-valuenow')).toBe('67');
        panel.destroy();
    });
    it('edits numeric hours and minutes and keeps progress unchanged on a Steam update until explicitly applied', async () => {
        const { root, panel, field } = fixture(vi.fn(async () => ({ partial: false, playtimeMinutes: 10807, achievementsUnlocked: 8, achievementsTotal: 78 })));
        const hours = field(gt('hours')), minutes = field(gt('minutes'));
        hours.value = '180'; hours.dispatchEvent(new Event('input')); minutes.value = '7'; minutes.dispatchEvent(new Event('input'));
        expect(panel.getValue().playtimeMinutes).toBe(10807);
        expect(root.querySelector('.lorebase-game-time-adjust')).toBeNull();
        minutes.value = '60'; minutes.dispatchEvent(new Event('input')); expect(panel.validate()).toBe(false);
        root.querySelector<HTMLButtonElement>('.lorebase-game-steam-refresh')!.click();
        await vi.waitFor(() => expect(panel.getValue().achievementsTotal).toBe(78));
        expect(panel.validate()).toBe(true);
        expect(panel.getValue()).not.toHaveProperty('progressPercent');
        expect(root.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow')).toBe('40');
        expect(root.querySelector('.lorebase-game-apply-progress')?.textContent).toBe('= 10%');
        root.querySelector<HTMLButtonElement>('.lorebase-game-apply-progress')!.click();
        expect(panel.getValue().progressPercent).toBe(10);
        expect(root.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow')).toBe('10');
    });
    it('replaces total Steam time without adding it or wiping unavailable achievements', async () => {
        const { root, panel, game } = fixture();
        Array.from(root.querySelectorAll('button')).find(button => button.textContent === gt('steam'))!.click();
        await vi.waitFor(() => expect(panel.getValue().playtimeMinutes).toBe(60));
        expect(panel.getValue()).not.toHaveProperty('achievementsUnlocked');
        expect(panel.getValue()).not.toHaveProperty('progressPercent');
        expect(game.playtimeMinutes).toBe(125);
        panel.destroy();
    });
    it('ignores a late Steam response after the editor is closed', async () => {
        let finish!: (value: { partial: boolean; playtimeMinutes: number }) => void;
        const { root, panel } = fixture(vi.fn(() => new Promise(resolve => { finish = resolve; })));
        Array.from(root.querySelectorAll('button')).find(button => button.textContent === gt('steam'))!.click();
        panel.destroy(); finish({ partial: false, playtimeMinutes: 999 });
        await Promise.resolve(); await Promise.resolve();
        expect(panel.getValue()).toEqual({});
    });
});

describe('achievement progress and time formatting', () => {
    it('handles unknown and zero totals without retaining a legacy manual percentage', () => {
        expect(achievementProgress(8, 78)).toBe(10);
        expect(achievementProgress(0, 57)).toBe(0);
        expect(achievementProgress(0, 0)).toBeNull();
        expect(achievementProgress(null, 57)).toBeNull();
        expect(achievementProgress(80, 57)).toBeNull();
    });

});
