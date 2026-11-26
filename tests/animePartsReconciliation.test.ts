import { describe, expect, it, vi } from 'vitest';
import { reconcileAnimeParts } from '../src/services/integrations/animeParts';
import { IntegrationService } from '../src/services/IntegrationService';
import { DEFAULT_SETTINGS } from '../src/constants';
import { createMockApp } from './helpers/testHelpers';
import type { AnimePart, AnimeItem } from '../src/types';
const first: AnimePart = { id: 'anilist-889', title: 'Black Lagoon', kind: 'tv', seasonNumber: 1, year: 2006, episodeTotal: 12, episodeCurrent: 0, status: 'planned' };
const second: AnimePart = { ...first, id: 'anilist-1519', title: 'Black Lagoon: The Second Barrage', seasonNumber: 2 };
const legacy: AnimePart = { ...first, id: 'main', episodeTotal: null, seasonNumber: null };
describe('anime parts reconciliation', () => {
    it('fills a legacy empty root with the real first season, remaps its selection and totals 24 episodes', () => {
        const result = reconcileAnimeParts([first, second], [legacy], 'main');
        expect(result.parts.map(part => [part.id, part.episodeTotal])).toEqual([[first.id, 12], [second.id, 12]]);
        expect(result.activePartId).toBe(first.id); expect(result.existingIds.has(first.id)).toBe(true);
        expect(legacy.id).toBe('main'); expect(legacy.episodeTotal).toBeNull();
    });
    it('preserves checks, scores and custom metadata while adopting a provider ID that can load episode titles', () => {
        const saved = { ...legacy, title: 'Мои пираты', alternativeTitles: ['Black Lagoon'], poster: 'local.jpg', episodeDuration: 26, status: 'watching' as const, episodeCurrent: 2, watchedEpisodes: [1, 4], episodeTracking: 'episodes' as const, episodeRatings: { 4: 9.5 }, userRating: 8 };
        const result = reconcileAnimeParts([first, second], [saved], 'main');
        expect(result.parts[0]).toMatchObject({ id: first.id, title: saved.title, poster: 'local.jpg', episodeTotal: 12, watchedEpisodes: [1, 4], episodeRatings: { 4: 9.5 }, userRating: 8, status: 'watching' });
        result.parts[0].episodeRatings![4] = 1; expect(saved.episodeRatings[4]).toBe(9.5);
    });
    it('removes an empty duplicate when the canonical part already exists and keeps manual extras', () => {
        const manual = { ...legacy, id: 'manual', title: 'Bonus' };
        const result = reconcileAnimeParts([first, second], [first, legacy, manual], 'main');
        expect(result.parts.map(part => part.id)).toEqual([first.id, second.id, 'manual']); expect(result.activePartId).toBe(first.id);
    });
    it('retains ambiguous same-name seasons rather than guessing which part owns the personal data', () => {
        const result = reconcileAnimeParts([first, { ...first, id: 'anilist-2', seasonNumber: 2 }], [{ ...legacy, episodeCurrent: 3 }], 'main');
        expect(result.parts.map(part => part.id)).toEqual([first.id, 'anilist-2', 'main']);
    });
    it('auto-fills without opening a selection modal or writing to the vault', async () => {
        const app = createMockApp({}); const service = new IntegrationService(app, () => structuredClone(DEFAULT_SETTINGS));
        const review = vi.spyOn(service as any, 'reviewAnimeParts');
        const anime = { parts: [legacy], activePartId: 'main', status: 'watching' } as AnimeItem;
        const result = await service.reviewAnimePartsForItem(anime, [first, second], true);
        expect(result?.parts).toHaveLength(2); expect(result?.status).toBe('watching'); expect(review).not.toHaveBeenCalled();
        expect(anime.parts).toEqual([legacy]); expect(anime.activePartId).toBe('main');
    });
});
