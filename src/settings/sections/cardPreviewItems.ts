import type { MediaItem, MediaType } from '../../types';
import type { SettingsSectionContext } from './types';

/** Load the selected library even when another media is open in the workspace. */
export async function loadCardPreviewItems(context: SettingsSectionContext, media: MediaType): Promise<MediaItem[]> {
    const plugin = context.plugin;
    let items: MediaItem[] | undefined;
    switch (media) {
        case 'game': items = await plugin.getGameService?.()?.loadGames(); break;
        case 'anime': items = await plugin.getAnimeService?.()?.loadAnime(); break;
        case 'movie': items = await plugin.getMovieService?.()?.loadItems(); break;
        case 'series': items = await plugin.getSeriesService?.()?.loadItems(); break;
        case 'book': items = await plugin.getBookService?.()?.loadItems(); break;
        case 'manga': items = await plugin.getMangaService?.()?.loadItems(); break;
        case 'music': items = await plugin.getMusicService?.()?.loadItems(); break;
    }
    const descriptionLength = (item: MediaItem): number => (
        item.type === 'anime' ? item.summary || item.description : item.description
    )?.trim().length ?? 0;
    return (items ?? []).filter(item => item.type === media)
        .sort((first, second) => descriptionLength(second) - descriptionLength(first));
}
