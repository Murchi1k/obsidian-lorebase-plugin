import type { JsonFetcher } from './common';
import { trackingNumber } from '../../../utils/gameTracking';

export type SteamTrackingResult = { playtimeMinutes?: number; achievementsUnlocked?: number; achievementsTotal?: number; partial: boolean };

/** The two endpoints may fail independently (private stats, no achievements, rate limits). */
export async function getSteamTracking(fetch: JsonFetcher, steamId: string, key: string, appId: string): Promise<SteamTrackingResult> {
    if (!key.trim() || !/^\d{17}$/.test(steamId) || !/^[1-9]\d*$/.test(appId) || !Number.isSafeInteger(Number(appId))) throw new Error('Steam tracking is not configured');
    const result: SteamTrackingResult = { partial: false };
    const owned = new URL('https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/');
    owned.searchParams.set('key', key);
    owned.searchParams.set('input_json', JSON.stringify({ steamid: steamId, appids_filter: [Number(appId)], include_played_free_games: true }));
    const achievements = new URL('https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/');
    achievements.searchParams.set('key', key); achievements.searchParams.set('steamid', steamId); achievements.searchParams.set('appid', appId);
    // Do not log URLs here: query parameters contain the user's API key.
    const [time, stats] = await Promise.allSettled([fetch(owned.toString()), fetch(achievements.toString())]);
    if (time.status === 'fulfilled') {
        const data = time.value as { response?: { games?: Array<{ appid?: number; playtime_forever?: number }> } } | null;
        const games = data?.response?.games;
        const game = Array.isArray(games) ? games.find(value => value && String(value.appid) === appId) : undefined;
        const minutes = trackingNumber(game?.playtime_forever);
        if (minutes !== null) result.playtimeMinutes = minutes;
    }
    if (stats.status === 'fulfilled') {
        const data = stats.value as { playerstats?: { success?: boolean; achievements?: Array<{ achieved?: number }> } } | null;
        const values = data?.playerstats?.achievements;
        if (data?.playerstats?.success === true && Array.isArray(values) && values.every(value => value && (value.achieved === 0 || value.achieved === 1))) {
            result.achievementsTotal = values.length;
            result.achievementsUnlocked = values.filter(value => value.achieved === 1).length;
        }
    }
    if (result.achievementsTotal === undefined) {
        const fallback = new URL('https://api.steampowered.com/ISteamUserStats/GetUserStatsForGame/v0002/');
        fallback.searchParams.set('key', key); fallback.searchParams.set('steamid', steamId); fallback.searchParams.set('appid', appId);
        const schema = new URL('https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v0002/');
        schema.searchParams.set('key', key); schema.searchParams.set('appid', appId);
        const [user, definition] = await Promise.allSettled([fetch(fallback.toString()), fetch(schema.toString())]);
        if (user.status === 'fulfilled' && definition.status === 'fulfilled') {
            const player = (user.value as { playerstats?: { steamID?: string; achievements?: Array<{ name?: string; achieved?: number }> } } | null)?.playerstats;
            const available = (definition.value as { game?: { availableGameStats?: { achievements?: Array<{ name?: string }> } } } | null)?.game?.availableGameStats?.achievements;
            if (player?.steamID === steamId && Array.isArray(player.achievements) && Array.isArray(available)
                && player.achievements.every(value => value && (value.achieved === 0 || value.achieved === 1))) {
                const names = new Set(available.map(value => value.name));
                result.achievementsTotal = available.length;
                result.achievementsUnlocked = new Set(player.achievements.filter(value => value.achieved === 1 && names.has(value.name)).map(value => value.name)).size;
            }
        }
    }
    if (result.playtimeMinutes === undefined && result.achievementsTotal === undefined) throw new Error('Steam tracking data is unavailable');
    result.partial = result.playtimeMinutes === undefined || result.achievementsTotal === undefined;
    return result;
}
