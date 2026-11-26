import { afterEach, describe, expect, it } from 'vitest';
import type { App } from 'obsidian';
import { __setRequestUrlMock } from './mocks/obsidian';
import { AniListSyncService } from '../src/services/AniListSyncService';
import { MetadataService } from '../src/services/MetadataService';
import { DEFAULT_SETTINGS } from '../src/constants';

afterEach(() => __setRequestUrlMock(null));
const entry = (id: number) => ({ id: id + 100, media: { id }, status: 'CURRENT', progress: 1, score: 0 });
const service = () => new AniListSyncService({} as App, {} as MetadataService);

describe('complete AniList collection before reconciliation', () => {
    it('reads every chunk and deduplicates titles repeated in custom lists', async () => {
        const chunks: number[] = [];
        __setRequestUrlMock(options => {
            const body = JSON.parse(String(typeof options === 'string' ? '' : options.body));
            chunks.push(body.variables.chunk);
            return { json: { data: { MediaListCollection: { hasNextChunk: body.variables.chunk === 1,
                lists: [{ entries: body.variables.chunk === 1 ? [entry(1), entry(1)] : [entry(1), entry(2)] }] } } } };
        });
        const values = await (service() as any).fetchEntries('fixture', 'token', 'ANIME');
        expect(chunks).toEqual([1, 2]); expect(values.map((value: ReturnType<typeof entry>) => value.media.id)).toEqual([1, 2]);
    });
    it.each([
        { lists: [] },
        { hasNextChunk: false, lists: [{ entries: null }] },
        { hasNextChunk: false, lists: [{ entries: [null] }] },
        { hasNextChunk: false, lists: [{ entries: [{ id: 1, media: {} }] }] },
        { hasNextChunk: true, lists: [] },
    ])('rejects incomplete or malformed response %#', async collection => {
        __setRequestUrlMock(() => ({ json: { data: { MediaListCollection: collection } } }));
        await expect((service() as any).fetchEntries('fixture', 'token', 'ANIME')).rejects.toThrow(/incomplete|invalid|empty/);
    });
    it('does not reconcile or delete earlier entries if a later chunk is incomplete', async () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.anilistSync.accessToken = 'fixture'; settings.anilistSync.username = 'fixture';
        settings.anilistSync.syncDeletions = true;
        settings.anilistSync.lastSynced['anime:1'] = { entryId: 101, status: 'CURRENT', progress: 1, score: 0, volumeProgress: 0, localPath: 'Anime/One.md', localDeleted: true };
        const snapshot = structuredClone(settings.anilistSync.lastSynced); const queries: string[] = [];
        __setRequestUrlMock(options => {
            const body = JSON.parse(String(typeof options === 'string' ? '' : options.body)); queries.push(body.query);
            return { json: { data: { MediaListCollection: body.variables.chunk === 1
                ? { hasNextChunk: true, lists: [{ entries: [entry(1)] }] } : {} } } };
        });
        await expect(service().sync(settings)).rejects.toThrow(/incomplete/);
        expect(queries).toHaveLength(2); expect(queries.every(query => !query.includes('mutation'))).toBe(true);
        expect(settings.anilistSync.lastSynced).toEqual(snapshot);
    });
    it('rejects pending results after the service is disposed', async () => {
        let finish!: (value: unknown) => void;
        __setRequestUrlMock(() => new Promise(resolve => { finish = resolve; }));
        const api = service(); const pending = (api as any).fetchEntries('fixture', 'token', 'ANIME');
        const check = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
        api.dispose(); finish({ json: { data: { MediaListCollection: { hasNextChunk: false, lists: [] } } } });
        await check;
    });
});
