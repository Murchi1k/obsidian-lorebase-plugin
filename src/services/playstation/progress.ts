import type { GameItem } from '../../types';
import { achievementProgress } from '../../utils/gameTracking';
import { TROPHY_GRADES, type PlayStationTracking } from './types';

/** Copies an explicitly enabled PSN snapshot into the regular editable progress fields. */
export function playStationPersonalProgress(tracking: PlayStationTracking): Partial<GameItem> {
    const result: Partial<GameItem> = {};
    if (tracking.playtimeMinutes !== undefined) result.playtimeMinutes = tracking.playtimeMinutes;
    if (tracking.trophySets?.length) {
        let earned = 0, total = 0;
        for (const set of tracking.trophySets) for (const grade of TROPHY_GRADES) {
            earned += set.earned[grade]; total += set.total[grade];
        }
        result.achievementsUnlocked = earned; result.achievementsTotal = total;
        const progress = achievementProgress(earned, total);
        if (progress !== null) result.progressPercent = progress;
    }
    return result;
}
