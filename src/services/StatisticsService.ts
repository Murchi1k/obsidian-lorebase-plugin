import type { MediaItem, MediaType } from '../types';
import { makeStatRecord, STAT_MEDIA, type StatRecord } from './media/statistics';

export interface StatisticsLibrary { records: StatRecord[]; failedTypes: MediaType[] }
/** Reuse the same parsers and caches as the libraries, with partial failure recovery. */
export async function loadStatisticsLibrary(loaders: Record<MediaType, () => Promise<MediaItem[]>>, getCreated: (path: string) => number | undefined): Promise<StatisticsLibrary> {
    const results = await Promise.allSettled(STAT_MEDIA.map(type => Promise.resolve().then(loaders[type])));
    const records = new Map<string, StatRecord>(), failedTypes: MediaType[] = [];
    results.forEach((result, index) => {
        if (result.status === 'rejected') { failedTypes.push(STAT_MEDIA[index]); return; }
        for (const item of result.value) {
            const path = item.filePath.replace(/\\/g, '/');
            if (!records.has(path)) records.set(path, makeStatRecord(item, getCreated(item.filePath)));
        }
    });
    return { records: [...records.values()], failedTypes };
}
