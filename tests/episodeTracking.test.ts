import { describe, expect, it } from 'vitest';
import { enableEpisodeTracking, readEpisodeFields, episodeFields, normalizeEpisodePart, resizeEpisodeSelection, mergeEpisodeDetails } from '../src/services/media/episodeTracking';
import { setPartEpisodeCurrent, setVideoPartStatus } from '../src/services/media/videoProgress';
import { getWatchProgress } from '../src/services/media/watchProgress';
import { AnimeService } from '../src/services/AnimeService';
import { VideoService } from '../src/services/VideoService';
import { createMockApp, createMetadataService } from './helpers/testHelpers';
import { mergeProviderMetadata, toAnimePartsFrontmatter } from '../src/services/integrations/enrichment';
import { renderPartsYaml } from '../src/services/integrations/shared';
import type { VideoPart } from '../src/types';
import { incrementAnimeEpisode } from '../src/views/library/progressActions';

const season = (): VideoPart => ({ id: 'season-1', title: 'Season 1', kind: 'season', seasonNumber: 1, episodeCurrent: 3, episodeTotal: 12, status: 'watching' });
describe('individual episode tracking', () => {
    it('keeps precise episode checks consistent with the library quick increment', () => {
        const item = { status: 'watching', episodeCurrent: 2, episodeTotal: 12, activePartId: 'season-1', parts: [{ ...season(), kind: 'tv', watchedEpisodes: [2, 6], episodeCurrent: 2 }] } as any;
        const updates = incrementAnimeEpisode(item).updates;
        expect(updates.parts?.[0].watchedEpisodes).toEqual([1, 2, 6]); expect(updates.episodeCurrent).toBe(3);
    });
    it('seeds old counts and preserves gaps through counter edits', () => {
        const part = season(); enableEpisodeTracking(part); expect(part.watchedEpisodes).toEqual([1, 2, 3]);
        part.watchedEpisodes = [1, 4, 8]; normalizeEpisodePart(part);
        setPartEpisodeCurrent(part, 4); expect(part.watchedEpisodes).toEqual([1, 2, 4, 8]);
        setPartEpisodeCurrent(part, 3); expect(part.watchedEpisodes).toEqual([1, 2, 4]);
        expect(part.episodeCurrent).toBe(3); expect(part.status).toBe('watching');
    });
    it('keeps checks when changing display modes and fills/clears a completed part consistently', () => {
        const part = season(); enableEpisodeTracking(part); part.episodeTracking = 'count';
        expect(part.watchedEpisodes).toEqual([1, 2, 3]);
        setVideoPartStatus(part, 'completed'); expect(part.watchedEpisodes).toEqual(Array.from({ length: 12 }, (_, n) => n + 1));
        setPartEpisodeCurrent(part, 0); expect(part.watchedEpisodes).toEqual([]); expect(part.status).toBe('planned');
    });
    it('does not mistake checked episode 8 for eight watched episodes', () => {
        const part = normalizeEpisodePart({ ...season(), watchedEpisodes: [8] });
        expect(part.episodeCurrent).toBe(1);
        expect(getWatchProgress([{ ...part, episodeDuration: 24 }])).toMatchObject({ current: 1, total: 12, watchedMinutes: 24, remainingMinutes: 264 });
    });
    it('treats empty checks as zero, normalizes malformed numbers, and never hides a checked episode after refresh', () => {
        const fields = readEpisodeFields({ watched_episodes: [0, -2, 1, '3', 3, 1.5, Infinity, 50001], episode_tracking: 'episodes' });
        expect(fields.watchedEpisodes).toEqual([1, 3]);
        expect(normalizeEpisodePart({ ...season(), ...fields, episodeTotal: 2 })).toMatchObject({ episodeCurrent: 2, episodeTotal: 3 });
        expect(normalizeEpisodePart({ ...season(), watchedEpisodes: [] }).episodeCurrent).toBe(0);
        expect(episodeFields(season())).toEqual({});
    });
    it('merges episode metadata without replacing personal titles or checks', () => {
        expect(mergeEpisodeDetails([{ number: 1, title: 'My title' }], [{ number: 1, title: 'Provider title', duration: 25 }, { number: 2, title: 'Next' }])).toEqual([
            { number: 1, title: 'My title', duration: 25 }, { number: 2, title: 'Next' },
        ]);
    });
    it('uses individual runtimes for noncontiguous watched episodes and average fallback for missing runtimes', () => {
        const part = { ...season(), episodeTotal: 3, watchedEpisodes: [2], episodeDuration: 20, episodeDetails: [{ number: 1, title: 'A', duration: 10 }, { number: 2, title: 'B', duration: 40 }] };
        expect(getWatchProgress([part])).toMatchObject({ watchedMinutes: 40, remainingMinutes: 30 });
        expect(getWatchProgress([{ ...part, episodeDuration: null }])).toMatchObject({ watchedMinutes: 40, remainingMinutes: null });
        expect(getWatchProgress([{ ...part, episodeTotal: null }]).total).toBeNull();
    });
    it.each(['anime', 'series'] as const)('round-trips checks and metadata through %s YAML parsing and serialization', type => {
        const app = createMockApp({}), metadata = createMetadataService(app);
        const service = type === 'anime' ? new AnimeService(app, metadata) : new VideoService(app, 'series', 'Series', metadata);
        const part = { ...season(), kind: type === 'anime' ? 'tv' : 'season', watchedEpisodes: [2, 6], episodeTracking: 'episodes', episodeDetails: [{ number: 2, title: 'Second', airDate: '2020-01-02', duration: 24 }] } as any;
        const raw = type === 'anime' ? (service as any).serializeAnimeParts([part])[0] : (service as any).serializeParts([part])[0];
        const parsed = type === 'anime' ? (service as any).parseAnimePart(raw, 0) : (service as any).parseParts([raw])[0];
        expect(parsed).toMatchObject({ watchedEpisodes: [2, 6], episodeCurrent: 2, episodeTracking: 'episodes', episodeDetails: part.episodeDetails });
        expect(renderPartsYaml([parsed])).toContain('watched_episodes: [2,6]');
        expect(toAnimePartsFrontmatter([parsed])[0].watched_episodes).toEqual([2, 6]);
    });
    it('preserves personal checks during a forced provider refresh', () => {
        const before = { series_parts: [{ id: 'season-1', season: 1, title: 'Season', watched_episodes: [2, 6], episode_current: 2, episode_tracking: 'episodes', episodes: [{ number: 2, title: 'Local' }] }] };
        const refreshed = mergeProviderMetadata(before, { series_parts: [{ id: 'season-1', season: 1, title: 'New title', watched_episodes: [], episode_current: 0, episode_tracking: 'count', episodes: [{ number: 2, title: 'Provider' }] }] }, [], { overwriteProviderFields: true, forceProviderFields: true });
        expect((refreshed.values.series_parts as any[])[0]).toMatchObject({ title: 'New title', watched_episodes: [2, 6], episode_current: 2, episode_tracking: 'episodes', episodes: [{ number: 2, title: 'Local' }] });
    });
});
