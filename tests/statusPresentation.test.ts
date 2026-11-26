import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/constants';
import { configureStatusPresentation, getStatusAppearance, normalizeStatusCustomization } from '../src/statusPresentation';
import { getStatusOptionsForMediaType } from '../src/views/library/viewOptions';
import { musicStatus, statusAfterTrackChange } from '../src/services/media/music';
import { GameService } from '../src/services/GameService';
import { AnimeService } from '../src/services/AnimeService';
import { ReadingService } from '../src/services/ReadingService';
import { VideoService } from '../src/services/VideoService';
import { createMetadataService, createMockApp, createMockFile } from './helpers/testHelpers';
import { matchesFilterRule } from '../src/services/media/libraryViewState';
import type { MediaItem, MediaType } from '../src/types';

afterEach(() => configureStatusPresentation(DEFAULT_SETTINGS));

describe('custom status presentation and storage', () => {
    it('restores per-library custom status options and built-in appearance after settings serialization', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.statusCustomization = { game: { custom_replay: { label: 'Перепройти', icon: 'repeat', color: '#123456' }, completed: { label: 'Готово', icon: 'trophy', color: '#987654' } },
            music: { custom_collect: { label: 'В коллекции', icon: 'archive', color: '#abcdef' } } };
        const restored = JSON.parse(JSON.stringify(settings));
        restored.statusCustomization = normalizeStatusCustomization(restored.statusCustomization);
        configureStatusPresentation(restored);
        expect(getStatusOptionsForMediaType('game')).toContainEqual({ status: 'custom_replay', label: 'Перепройти' });
        expect(getStatusOptionsForMediaType('anime').some(option => option.status === 'custom_replay')).toBe(false);
        expect(getStatusAppearance('game', 'completed')).toEqual({ label: 'Готово', icon: 'trophy', color: '#987654' });
        expect(getStatusOptionsForMediaType('music')).toContainEqual({ status: 'custom_collect', label: 'В коллекции' });
    });

    it('ignores malformed settings while retaining valid labels and safe defaults', () => {
        const normalized = normalizeStatusCustomization({ game: { custom_ok: { label: '  Статус  ', icon: 'heart', color: '#aabbcc' }, custom_bad: { label: 42, icon: '<svg>', color: 'red' }, invalid: { label: 'Ignored' } }, music: null });
        expect(normalized.game?.custom_ok).toEqual({ label: 'Статус', icon: 'heart', color: '#aabbcc' });
        expect(normalized.game?.custom_bad).toEqual({});
        expect(normalized.game).not.toHaveProperty('invalid');
        configureStatusPresentation({ statusLabels: DEFAULT_SETTINGS.statusLabels, statusCustomization: normalized });
        expect(getStatusAppearance('game', 'custom_bad')).toMatchObject({ icon: 'circle', color: '#e7e7e7' });
    });

    it.each(['game', 'anime', 'movie', 'series', 'book', 'manga'] as MediaType[])('preserves %s custom statuses when reading notes and calculating statistics', kind => {
        const file = createMockFile('Library/Item.md', 'Item');
        const app = createMockApp({ [file.path]: { frontmatter: { type: kind, title: 'Item', status: 'custom_collect', genres: [], tags: [] } } });
        const metadata = createMetadataService(app);
        let item: MediaItem | null;
        let counts: Record<string, number> | undefined;
        if (kind === 'game') {
            const service = new GameService(app, metadata);
            item = service.parseGameFromCache(file);
            counts = service.calculateStats(item ? [item] : []).customStatusCounts;
        } else if (kind === 'anime') {
            const service = new AnimeService(app, metadata);
            item = service.parseAnimeFromCache(file);
            counts = service.calculateStats(item ? [item] : []).customStatusCounts;
        } else if (kind === 'book' || kind === 'manga') {
            const service = new ReadingService(app, kind, 'Library', metadata);
            item = service.parseFromCache(file);
            counts = service.calculateStats(item ? [item] : []).customStatusCounts;
        } else {
            const service = new VideoService(app, kind as 'movie' | 'series', 'Library', metadata);
            item = service.parseFromCache(file);
            counts = service.calculateStats(item ? [item] : []).customStatusCounts;
        }
        expect(item?.status).toBe('custom_collect');
        expect(counts).toEqual({ custom_collect: 1 });
        expect(matchesFilterRule(item!, { id: 'custom', field: 'status', fieldType: 'list', operator: 'containsAny', value: ['custom_collect'] })).toBe(true);
    });

    it('keeps an explicit custom music status when every song becomes listened', () => {
        expect(musicStatus('custom_collect')).toBe('custom_collect');
        expect(statusAfterTrackChange('custom_collect', [{ id: '1', title: 'Song', artist: '', disc: 1, duration: 100, listened: true, favorite: false, userRating: null }])).toBe('custom_collect');
    });
});
