import { describe, expect, it } from 'vitest';
import { GameService } from '../src/services/GameService';
import { AnimeService } from '../src/services/AnimeService';
import { ReadingService } from '../src/services/ReadingService';
import { VideoService } from '../src/services/VideoService';
import { MusicService } from '../src/services/MusicService';
import { MetadataService } from '../src/services/MetadataService';
import { DEFAULT_SETTINGS } from '../src/constants';
import { createBaseFilter, createMetadataService, createMockApp, createMockFile } from './helpers/testHelpers';
import { filterAndSortMedia } from '../src/services/media/filtering';
import { groupMediaItems, getViewFieldValue, matchesFilterRule, normalizeLibraryViewState } from '../src/services/media/libraryViewState';
import { getBuiltInFieldDefinitions, getSortOptionsForMediaType, getStatusOptionsForMediaType } from '../src/views/library/viewOptions';
import { normalizePriority } from '../src/utils/priority';

describe('personal priority', () => {
    it.each(['game', 'anime', 'movie', 'series', 'book', 'manga', 'music'] as const)('round-trips %s priority without changing status, notes or custom priority data', async type => {
        const file = createMockFile('Media/Book.md', 'Book');
        const fm: Record<string, unknown> = { type, title: 'Book', name: 'Book', status: type === 'game' ? 'playing' : type === 'music' ? 'listening' : 'watching', priority: 27, rating: 4, userRating: 4, favorite: false };
        const app = createMockApp({ [file.path]: { frontmatter: fm } }); app.vault.getAbstractFileByPath = () => file;
        app.fileManager.processFrontMatter = async (_file, handler) => { handler(fm); };
        const settings = structuredClone(DEFAULT_SETTINGS);
        const metadata = new MetadataService(app, () => settings);
        const service: any = type === 'game' ? new GameService(app, metadata) : type === 'anime' ? new AnimeService(app, metadata)
            : type === 'book' || type === 'manga' ? new ReadingService(app, type, 'Media', metadata)
            : type === 'music' ? new MusicService(app, 'Media', metadata) : new VideoService(app, type, 'Media', metadata);
        const parse = () => type === 'game' ? service.parseGameFromCache(file) : type === 'anime' ? service.parseAnimeFromCache(file) : service.parseFromCache(file);
        const item = parse(); expect(item).not.toBeNull(); expect(item.priority).toBe('normal');
        const update = (patch: any) => type === 'game' ? service.updateGame(item, patch) : type === 'anime' ? service.updateAnime(item, patch) : service.updateItem(item, patch);
        const status = item.status;
        await update({ priority: 'highest' }); expect(parse().priority).toBe('highest');
        await update({ priority: 'high' });
        expect(fm.personal_priority).toBe('high'); expect(fm.priority).toBe(27); expect(fm.status).toBe(status);
        expect(parse().priority).toBe('high');
        await update({ priority: 'low' }); expect(parse().priority).toBe('low');
        await update({ priority: 'normal' }); expect(parse().priority).toBe('normal'); expect(fm.priority).toBe(27);
        expect(getSortOptionsForMediaType(type).some(option => option.field === 'priority')).toBe(true);
        expect(getBuiltInFieldDefinitions(type, getStatusOptionsForMediaType(type), { showAdult: true, showCustom: true }).some(field => field.id === 'priority')).toBe(true);
    });
    it('sorts high, normal and low with stable ties, and filters normal for legacy notes', () => {
        const base: any = { displayName: '', nameLower: '', status: 'planned', tags: [], genres: [], year: null, userRating: null, favorite: false, hasCustomPoster: false, isAdult: false };
        const items = [{ ...base, displayName: 'Z', nameLower: 'z', priority: 'high' }, { ...base, displayName: 'A', nameLower: 'a', priority: 'high' }, { ...base, displayName: 'B', nameLower: 'b' }, { ...base, displayName: 'C', nameLower: 'c', priority: 'low' }, { ...base, displayName: 'D', nameLower: 'd', priority: 'highest' }];
        expect(filterAndSortMedia({ items, filter: createBaseFilter(), sortField: 'priority', sortOrder: 'desc', isVisible: () => true, getCompletedDate: () => null }).map(item => item.displayName)).toEqual(['D', 'A', 'Z', 'B', 'C']);
        expect(getViewFieldValue(items[2], 'priority')).toBe('normal');
        expect(matchesFilterRule(items[2], { id: 'p', field: 'priority', fieldType: 'list', operator: 'containsAny', value: ['normal'] })).toBe(true);
        expect(normalizePriority('invalid')).toBe('normal');
    });
    it('groups all four priorities in numeric order and keeps the view after reloading', () => {
        const items: any[] = ['normal', 'low', 'highest', 'high', undefined].map((priority, i) => ({ priority, filePath: String(i) }));
        const groups = groupMediaItems(items, 'priority', 'desc', 'ru-RU');
        expect(groups.map(group => group.label)).toEqual(['Наивысший', 'Высокий', 'Обычный', 'Низкий']);
        expect(groups[2].items).toHaveLength(2);
        expect(groupMediaItems(items, 'priority', 'asc', 'en').map(group => group.key)).toEqual(['priority:low', 'priority:normal', 'priority:high', 'priority:highest']);
        const fallback: any = { sort: { field: 'name', order: 'asc' }, group: { mode: 'none', order: 'asc' }, rules: [], tags: [], genres: [], workTypes: [] };
        const saved = normalizeLibraryViewState({ group: { mode: 'priority', order: 'desc' }, sort: { field: 'priority', order: 'desc' }, rules: [{ id: 'p', field: 'priority', fieldType: 'list', operator: 'containsAny', value: ['highest', 'high'] }] }, fallback);
        expect(normalizeLibraryViewState(JSON.parse(JSON.stringify(saved)), fallback)).toEqual(saved);
        expect(saved.group.mode).toBe('priority');
    });

});
