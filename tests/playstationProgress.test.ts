import { describe, expect, it } from 'vitest';
import { playStationPersonalProgress } from '../src/services/playstation/progress';
import type { PlayStationTracking } from '../src/services/playstation/types';

const identity: PlayStationTracking = { accountId: '123', titleId: 'PPSA00001_00', platform: 'PS5' };
describe('PSN data in regular game progress', () => {
    it('leaves unavailable fields untouched instead of clearing manual values', () => {
        expect(playStationPersonalProgress(identity)).toEqual({});
        expect(playStationPersonalProgress({ ...identity, playtimeMinutes: 0, trophySets: [] })).toEqual({ playtimeMinutes: 0 });
    });
    it('copies a genuine zero and combines trophy counts across sets like achievements', () => {
        const empty = { bronze: 0, silver: 0, gold: 0, platinum: 0 };
        const base = { id: 'NPWR00001_00', title: 'Base', platform: 'PS5', progress: 0, earned: empty, total: { ...empty, bronze: 10 } };
        expect(playStationPersonalProgress({ ...identity, trophySets: [base] })).toEqual({ achievementsUnlocked: 0, achievementsTotal: 10, progressPercent: 0 });
        const expansion = { ...base, id: 'NPWR00002_00', earned: { ...empty, silver: 2 }, total: { ...empty, silver: 2 } };
        expect(playStationPersonalProgress({ ...identity, trophySets: [base, expansion] })).toEqual({ achievementsUnlocked: 2, achievementsTotal: 12, progressPercent: 17 });
    });
});
