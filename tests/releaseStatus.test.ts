import { describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import type { MediaItem, MediaType, LorebaseSettings } from '../src/types';
import { getNextReleaseStatus, isFutureReleaseDate } from '../src/services/media/releaseStatus';
import { synchronizeReleaseStatuses } from '../src/services/ReleaseStatusService';
import { MetadataService } from '../src/services/MetadataService';
import { GameService } from '../src/services/GameService';
import { AnimeService } from '../src/services/AnimeService';
import { VideoService } from '../src/services/VideoService';
import { ReadingService } from '../src/services/ReadingService';
import { MusicService } from '../src/services/MusicService';
import { DEFAULT_SETTINGS } from '../src/constants';
import { createMockFile } from './helpers/testHelpers';

const today = new Date(2026, 9, 20, 0, 1);
const types: MediaType[] = ['game', 'anime', 'movie', 'series', 'book', 'manga', 'music'];
const title = (type: MediaType, releaseDate: string | null, status = type === 'game' ? 'not_started' : 'planned') => ({ type, releaseDate, status, year: null } as MediaItem);

describe('release status by the computer local date', () => {
    it.each(types)('%s waits before release, becomes idle on the release day, and catches up after absence', type => {
        const idle = type === 'game' ? 'not_started' : 'planned';
        expect(getNextReleaseStatus(title(type, '2026-10-21'), today)).toBe('to_be_released');
        expect(getNextReleaseStatus(title(type, '2026-10-20', 'to_be_released'), today)).toBe(idle);
        expect(getNextReleaseStatus(title(type, '2026-10-19', 'to_be_released'), today)).toBe(idle);
        expect(getNextReleaseStatus(title(type, '2026-10-20T23:59:59Z', 'to_be_released'), today)).toBe(idle);
    });
    it('preserves progress, completed titles, wishlists, and custom statuses', () => {
        for (const status of ['playing', 'watching', 'listening', 'completed', 'dropped', 'paused', 'sandbox', 'wishlist', 'on_repeat', 'custom_mine']) {
            for (const release of ['2026-10-21', '2026-10-19']) expect(getNextReleaseStatus(title('game', release, status), today)).toBe(status);
        }
    });
    it('does not invent a release day from partial or unknown dates', () => {
        expect(getNextReleaseStatus(title('anime', '2026', 'to_be_released'), today)).toBe('to_be_released');
        expect(getNextReleaseStatus(title('anime', '2026-10', 'to_be_released'), today)).toBe('to_be_released');
        expect(getNextReleaseStatus(title('anime', '2026-09', 'to_be_released'), today)).toBe('planned');
        expect(getNextReleaseStatus(title('anime', '2027'), today)).toBe('to_be_released');
        for (const value of [null, 'TBA', '2026-02-30', '2026-13']) expect(getNextReleaseStatus(title('anime', value, 'to_be_released'), today)).toBe('to_be_released');
        expect(isFutureReleaseDate('2027', today)).toBe(true);
        expect(isFutureReleaseDate('2026-11', today)).toBe(true);
        expect(isFutureReleaseDate('2026-10-20', today)).toBe(false);
    });
    it('uses date aliases and a known future year', () => {
        expect(getNextReleaseStatus({ ...title('manga', null), rawFields: { publishedDate: '2026-10-21' } }, today)).toBe('to_be_released');
        expect(getNextReleaseStatus({ ...title('game', null), year: 2027 }, today)).toBe('to_be_released');
    });
});

function fixture(custom = false, type: MediaType = 'game') {
    const file = createMockFile('Games/Upcoming.md', 'Upcoming');
    const fm: Record<string, unknown> = custom ? { type, MyStatus: 'to_be_released', Release: '2026-10-20', custom: 'keep' }
        : { type, status: 'to_be_released', released: '2026-10-20', custom: 'keep' };
    let beforeWrite = () => {};
    const app = {
        vault: { getMarkdownFiles: () => [file], getAbstractFileByPath: () => file },
        metadataCache: { getFileCache: () => ({ frontmatter: { ...fm, position: {} } }) },
        fileManager: { processFrontMatter: vi.fn(async (_file, update) => { beforeWrite(); update(fm); }) },
    } as unknown as App;
    const settings = structuredClone(DEFAULT_SETTINGS) as LorebaseSettings;
    settings.integrations.media.games.templateMode = 'advanced';
    settings.integrations.media.games.template = custom ? 'MyStatus: {{VALUE:status}}\nRelease: {{VALUE:released}}' : '';
    const metadata = new MetadataService(app, () => settings);
    const games = new GameService(app, metadata);
    const sources = [{ folder: 'Games', parse: (file: ReturnType<typeof createMockFile>) => {
        if (type === 'game') return games.parseGameFromCache(file);
        if (type === 'anime') return new AnimeService(app, metadata).parseAnimeFromCache(file);
        if (type === 'movie' || type === 'series') return new VideoService(app, type, 'Games', metadata).parseFromCache(file);
        if (type === 'book' || type === 'manga') return new ReadingService(app, type, 'Games', metadata).parseFromCache(file);
        return new MusicService(app, 'Games', metadata).parseFromCache(file);
    } }];
    return { app, fm, metadata, sources, setBeforeWrite: (fn: () => void) => { beforeWrite = fn; } };
}

describe('release status persistence', () => {
    it('scans only changed notes after startup, including an empty batch', async () => {
        const f = fixture();
        const file = f.app.vault.getMarkdownFiles()[0];
        const fullScan = vi.spyOn(f.app.vault, 'getMarkdownFiles');
        expect(await synchronizeReleaseStatuses(f.app, f.metadata, f.sources, today, [])).toBe(false);
        expect(await synchronizeReleaseStatuses(f.app, f.metadata, f.sources, today, [file])).toBe(true);
        expect(fullScan).not.toHaveBeenCalled();
        expect(f.fm.status).toBe('not_started');
    });
    it.each(types)('persists the release-day transition for %s and a newly entered future date', async type => {
        const f = fixture(false, type);
        await synchronizeReleaseStatuses(f.app, f.metadata, f.sources, today);
        expect(f.fm.status).toBe(type === 'game' ? 'not_started' : 'planned');
        f.fm.released = '2026-10-21';
        await synchronizeReleaseStatuses(f.app, f.metadata, f.sources, today);
        expect(f.fm.status).toBe('to_be_released');
    });
    it.each([false, true])('updates canonical or custom status fields once, preserving unrelated metadata (aliases=%s)', async custom => {
        const { app, fm, metadata, sources } = fixture(custom);
        expect(await synchronizeReleaseStatuses(app, metadata, sources, today)).toBe(true);
        expect(fm[custom ? 'MyStatus' : 'status']).toBe('not_started');
        expect(fm.custom).toBe('keep');
        expect(await synchronizeReleaseStatuses(app, metadata, sources, today)).toBe(false);
        expect(app.fileManager.processFrontMatter).toHaveBeenCalledTimes(1);
    });
    it('does not overwrite a status changed during an asynchronous scan', async () => {
        const f = fixture();
        f.setBeforeWrite(() => { f.fm.status = 'playing'; });
        expect(await synchronizeReleaseStatuses(f.app, f.metadata, f.sources, today)).toBe(false);
        expect(f.fm.status).toBe('playing');
    });
});
