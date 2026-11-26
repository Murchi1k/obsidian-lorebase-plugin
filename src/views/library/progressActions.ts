import { AnimeItem, MangaItem } from '../../types';
import { stepProgress } from '../../utils/progress';
import { resizeEpisodeSelection } from '../../services/media/episodeTracking';

export interface ProgressMutation<T> {
    updates: Partial<T>;
    changedFields: string[];
}

export function incrementAnimeEpisode(item: AnimeItem): ProgressMutation<AnimeItem> {
    const parts = item.parts?.length ? item.parts.map((part) => ({ ...part })) : [];
    const activePart = parts.find((part) => part.id === item.activePartId) ?? parts[0] ?? null;
    const current = normalizeCount(activePart?.episodeCurrent ?? item.episodeCurrent) ?? 0;
    const total = normalizeCount(activePart?.episodeTotal ?? item.episodeTotal);
    const nextEpisode = stepProgress(current, 1, total) ?? 0;
    const updates: Partial<AnimeItem> = { episodeCurrent: nextEpisode };
    const changedFields = new Set<string>(['episodeCurrent']);

    item.episodeCurrent = nextEpisode;
    if (activePart) {
        activePart.episodeCurrent = nextEpisode;
        resizeEpisodeSelection(activePart, nextEpisode);
        if (total && nextEpisode >= total) {
            activePart.status = 'completed';
        } else if (activePart.status === 'planned') {
            activePart.status = 'watching';
        }
        item.parts = parts;
        item.activePartId = activePart.id;
        item.seasonCurrent = activePart.seasonNumber;
        item.episodeTotal = activePart.episodeTotal;
        updates.parts = parts;
        updates.activePartId = activePart.id;
        updates.seasonCurrent = activePart.seasonNumber;
        updates.episodeTotal = activePart.episodeTotal;
        changedFields.add('parts');
        changedFields.add('activePartId');
        changedFields.add('seasonCurrent');
        changedFields.add('episodeTotal');
    }

    if (item.status === 'planned') {
        item.status = 'watching';
        updates.status = 'watching';
        changedFields.add('status');
    }

    if (total && nextEpisode >= total) {
        const allPartsCompleted = parts.length > 0 && parts.every((part) => part.status === 'completed');
        if (parts.length === 0 || allPartsCompleted) {
            item.status = 'completed';
            updates.status = 'completed';
            changedFields.add('status');
        }
    }

    return { updates, changedFields: Array.from(changedFields) };
}

export function incrementMangaChapter(item: MangaItem): ProgressMutation<MangaItem> {
    const parts = item.parts?.length ? item.parts.map((part) => ({ ...part })) : [];
    const activePart = parts.find((part) => part.id === item.activePartId) ?? parts[0] ?? null;
    const current = normalizeChapterPosition(activePart?.chapterCurrent ?? item.chapterCurrent) ?? 0;
    const total = normalizeCount(activePart?.chapterTotal ?? item.chapterTotal);
    const nextChapter = stepChapterPosition(current,1,total);
    const updates: Partial<MangaItem> = { chapterCurrent: nextChapter };
    const changedFields = new Set<string>(['chapterCurrent']);

    item.chapterCurrent = nextChapter;
    if (activePart) {
        activePart.chapterCurrent = nextChapter;
        if (total && nextChapter >= total) {
            activePart.status = 'completed';
        } else if (activePart.status === 'planned') {
            activePart.status = 'watching';
        }
        item.parts = parts;
        item.activePartId = activePart.id;
        item.chapterTotal = activePart.chapterTotal;
        item.volumeCurrent = activePart.volumeNumber;
        updates.parts = parts;
        updates.activePartId = activePart.id;
        updates.chapterTotal = activePart.chapterTotal;
        updates.volumeCurrent = activePart.volumeNumber;
        changedFields.add('parts');
        changedFields.add('activePartId');
        changedFields.add('chapterTotal');
        changedFields.add('volumeCurrent');
    }

    if (item.status === 'planned') {
        item.status = 'watching';
        updates.status = 'watching';
        changedFields.add('status');
    }

    const allPartsCompleted = parts.length > 0 && parts.every((part) => part.status === 'completed');
    if ((parts.length === 0 && total && nextChapter >= total) || allPartsCompleted) {
        item.status = 'completed';
        updates.status = 'completed';
        changedFields.add('status');
    }

    return { updates, changedFields: Array.from(changedFields) };
}

function normalizeCount(value: number | null | undefined): number | null {
    return Number.isFinite(value) ? Math.max(0, Math.trunc(value as number)) : null;
}
import { normalizeChapterPosition, stepChapterPosition } from '../../utils/mangaChapters';
