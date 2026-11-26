import { STAT_MEDIA, summarizeStatRecords, type StatRecord } from './statistics';

/** Keep sources separate: lifetime game minutes, calculated media minutes, or reading units. */
export function statisticsTimeByMedia(rows: StatRecord[]) {
    return STAT_MEDIA.flatMap(type => {
        const group = rows.filter(row => row.item.type === type);
        if (!group.length) return [];
        const summary = summarizeStatRecords(group);
        const field = type === 'game' ? 'played' : type === 'music' ? 'listened' : 'watched';
        const reading = type === 'book' || type === 'manga';
        const totalField = type === 'book' ? 'pageTotal' : 'chapterTotal';
        const known = reading ? group.filter(row => row[totalField] !== null).length : group.filter(row => row[field] !== null).length;
        const unknown = reading ? group.length - known : type === 'music' ? summary.musicUnknown : group.filter(row => row[field] === null || field === 'watched' && row.partialWatch).length;
        const byPath = new Map(group.map(row => [row.item.filePath, row]));
        const independent = group.filter(row => {
            if (row.item.type !== 'music' || !row.item.parentAlbum || !row.item.parentTrackId) return true;
            const trackId = row.item.parentTrackId;
            const parent = byPath.get(row.item.parentAlbum)?.item;
            return parent?.type !== 'music' || !parent.tracks.some(track => track.id === trackId && track.listened);
        });
        return [{ type, count: group.length, summary, minutes: !reading && known ? type === 'game' ? summary.played : type === 'music' ? summary.listened : summary.watched : null,
            known, unknown, reading, current: type === 'book' ? summary.pages : summary.chapters,
            total: reading && unknown === 0 ? group.reduce((sum, row) => sum + (row[totalField] ?? 0), 0) : null,
            remaining: group.some(row => row.remaining !== null) ? summary.remaining : null,
            episodeCount: summary.episodes,
            trackCount: type === 'music' ? independent.reduce((sum, row) => sum + (row.item.type !== 'music' ? 0 : row.item.musicKind === 'album' ? row.item.tracks.filter(track => track.listened).length : ['completed', 'on_repeat'].includes(row.item.status) ? 1 : 0), 0) : 0,
        }];
    });
}
