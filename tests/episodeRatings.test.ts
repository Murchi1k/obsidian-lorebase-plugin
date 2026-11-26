// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PartEpisodesControl } from '../src/components/PartEpisodesControl';
import { mergeProviderMetadata, toAnimePartsFrontmatter } from '../src/services/integrations/enrichment';
import { renderPartsYaml } from '../src/services/integrations/shared';
import { AnimeService } from '../src/services/AnimeService';
import { VideoService } from '../src/services/VideoService';
import { createMetadataService, createMockApp } from './helpers/testHelpers';
import type { VideoPart } from '../src/types';
afterEach(() => document.body.replaceChildren());
describe('episode controls after removing episode scores', () => {
    it('shows only watch controls in grid and list, including notes containing old score data', () => {
        const part: VideoPart = { id: 's1', title: 'Season', kind: 'season', seasonNumber: 1, episodeTracking: 'episodes', episodeCurrent: 0, episodeTotal: 12, status: 'planned', episodeRatings: { 1: 8, 999: 9 } };
        const host = document.body.appendChild(document.createElement('div')), changed = vi.fn();
        const control = new PartEpisodesControl(host, () => part, changed);
        const check = () => {
            expect(host.querySelector('[class*="episode-chart"], [class*="episode-score"], .lorebase-episode-rating, input')).toBeNull();
            expect(host.querySelectorAll('[data-episode]')).toHaveLength(12);
        };
        check(); host.querySelectorAll<HTMLButtonElement>('.lorebase-episodes-views button')[1].click(); check();
        host.querySelector<HTMLButtonElement>('[data-episode="2"]')!.click();
        expect(part.watchedEpisodes).toEqual([2]); expect(changed).toHaveBeenLastCalledWith('progress');
        expect(part.episodeRatings).toEqual({ 1: 8, 999: 9 }); control.destroy();
    });
    it.each(['anime', 'series'] as const)('preserves existing %s note data when saving unrelated changes', type => {
        const app = createMockApp({}), metadata = createMetadataService(app);
        const service: any = type === 'anime' ? new AnimeService(app, metadata) : new VideoService(app, 'series', 'Series', metadata);
        const part: any = { id: 's1', title: 'Season', kind: type === 'anime' ? 'tv' : 'season', seasonNumber: 1, episodeCurrent: 0, episodeTotal: 12, status: 'planned', userRating: 4, episodeRatings: { 1: 8.5, 4: 9 } };
        const raw = type === 'anime' ? service.serializeAnimeParts([part])[0] : service.serializeParts([part])[0];
        const parsed = type === 'anime' ? service.parseAnimePart(raw, 0) : service.parseParts([raw])[0];
        expect(parsed.episodeRatings).toEqual(part.episodeRatings); expect(parsed.userRating).toBe(4);
        expect(renderPartsYaml([parsed])).toContain('episode_ratings: {"1":8.5,"4":9}');
        expect(toAnimePartsFrontmatter([parsed])[0].episode_ratings).toEqual(part.episodeRatings);
    });
    it('keeps scores through a forced provider refresh, even when the provider sends different values', () => {
        const before = { series_parts: [{ id: 'season-1', title: 'Old', episode_ratings: { 1: 8.7 }, user_rating: 4 }] };
        const after = mergeProviderMetadata(before, { series_parts: [{ id: 'season-1', title: 'New', episode_ratings: { 1: 1 }, user_rating: 0 }] }, [], { overwriteProviderFields: true, forceProviderFields: true });
        expect((after.values.series_parts as any[])[0]).toMatchObject({ title: 'New', episode_ratings: { 1: 8.7 }, user_rating: 4 });
    });
});
