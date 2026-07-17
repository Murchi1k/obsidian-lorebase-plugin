import { Menu, MenuItem } from 'obsidian';
import { AnimeItem, BookItem, GameItem, MangaItem, MediaItem, MediaStatus, MovieItem, ReadingItem, SeriesItem } from '../../types';
import { FILTER_ICON_MAP, RATING_EMOJI, STATUS_ICON_MAP } from '../../constants';
import { t } from '../../localization';

type MenuItemWithSubmenu = MenuItem & { setSubmenu: () => Menu };

export interface MediaContextMenuDeps {
    isDestroyed: () => boolean;
    getStatusOptions: () => Array<{ status: MediaStatus; label: string }>;
    onApplyFiltersAndSort: () => void;
    onEdit: (item: MediaItem) => void;
    onDelete: (item: MediaItem) => void;
    onItemMutated: (item: MediaItem, changedFields: string[]) => void;
    updateAnime: (anime: AnimeItem, updates: Partial<AnimeItem>) => void;
    updateGame: (game: GameItem, updates: Partial<GameItem>) => void;
    updateVideo?: (item: MovieItem | SeriesItem, updates: Partial<MovieItem | SeriesItem>) => void;
    updateReading?: (item: ReadingItem, updates: Partial<ReadingItem>) => void;
}

export function showMediaContextMenu(item: MediaItem, x: number, y: number, deps: MediaContextMenuDeps): void {
    if (deps.isDestroyed()) return;

    const menu = new Menu();

    menu.addItem((menuItem) => {
        const submenuHost = menuItem as MenuItemWithSubmenu;
        submenuHost.setTitle(t('contextChangeRating')).setIcon('star');
        const sub = submenuHost.setSubmenu();

        const ratings: Array<{ value: 1 | 2 | 3 | 4 | 5; label: string }> = [
            { value: 5, label: t('ratingAwesome') },
            { value: 4, label: t('ratingGood') },
            { value: 3, label: t('ratingOkay') },
            { value: 2, label: t('ratingWeak') },
            { value: 1, label: t('ratingBad') },
        ];

        for (const rating of ratings) {
            sub.addItem((subItem: MenuItem) => {
                subItem.setTitle(`${RATING_EMOJI[rating.value]} ${rating.label}`)
                    .onClick(() => {
                        if (deps.isDestroyed()) return;
                        if (item.type === 'anime') {
                            item.userRating = rating.value;
                            deps.onItemMutated(item, ['userRating']);
                            deps.updateAnime(item, { userRating: rating.value });
                        } else if (item.type === 'movie' || item.type === 'series') {
                            item.userRating = rating.value;
                            deps.onItemMutated(item, ['userRating']);
                            deps.updateVideo?.(item, { userRating: rating.value });
                        } else if (item.type === 'book' || item.type === 'manga') {
                            item.userRating = rating.value;
                            deps.onItemMutated(item, ['userRating']);
                            deps.updateReading?.(item, { userRating: rating.value });
                        } else {
                            item.userRating = rating.value;
                            deps.onItemMutated(item, ['userRating']);
                            deps.updateGame(item, { userRating: rating.value });
                        }
                    });
            });
        }

        sub.addItem((subItem: MenuItem) => {
            subItem.setTitle(`${String.fromCodePoint(0x1f9f9)} ${t('contextClear')}`)
                .onClick(() => {
                    if (deps.isDestroyed()) return;
                    item.userRating = null;
                    deps.onItemMutated(item, ['userRating']);
                    if (item.type === 'anime') {
                        deps.updateAnime(item, { userRating: null });
                    } else if (item.type === 'movie' || item.type === 'series') {
                        deps.updateVideo?.(item, { userRating: null });
                    } else if (item.type === 'book' || item.type === 'manga') {
                        deps.updateReading?.(item, { userRating: null });
                    } else {
                        deps.updateGame(item, { userRating: null });
                    }
                });
        });
    });

    menu.addItem((menuItem) => {
        const submenuHost = menuItem as MenuItemWithSubmenu;
        submenuHost.setTitle(t('contextChangeStatus')).setIcon('circle');
        const sub = submenuHost.setSubmenu();

        for (const { status, label } of deps.getStatusOptions()) {
            sub.addItem((subItem: MenuItem) => {
                subItem.setTitle(label)
                    .setIcon(STATUS_ICON_MAP[status])
                    .onClick(() => {
                        if (deps.isDestroyed()) return;
                        if (item.type === 'anime') {
                            const nextStatus = status as AnimeItem['status'];
                            item.status = nextStatus;
                            deps.onItemMutated(item, ['status']);
                            deps.updateAnime(item, { status: nextStatus });
                        } else if (item.type === 'movie' || item.type === 'series') {
                            const nextStatus = status as MovieItem['status'];
                            item.status = nextStatus;
                            deps.onItemMutated(item, ['status']);
                            deps.updateVideo?.(item, { status: nextStatus });
                        } else if (item.type === 'book' || item.type === 'manga') {
                            const nextStatus = status as ReadingItem['status'];
                            item.status = nextStatus;
                            deps.onItemMutated(item, ['status']);
                            deps.updateReading?.(item, { status: nextStatus });
                        } else {
                            const nextStatus = status as GameItem['status'];
                            item.status = nextStatus;
                            deps.onItemMutated(item, ['status']);
                            deps.updateGame(item, { status: nextStatus });
                        }
                    });
            });
        }
    });

    if (item.type === 'anime') {
        menu.addItem((menuItem) => {
            menuItem.setTitle(t('contextEpisodePlusOne'))
                .setIcon('plus')
                .onClick(() => {
                    if (deps.isDestroyed()) return;
                    const parts = item.parts?.length ? item.parts.map((part) => ({ ...part })) : [];
                    const activePart = parts.find((part) => part.id === item.activePartId) ?? parts[0] ?? null;
                    const currentEpisodeSource = activePart?.episodeCurrent ?? item.episodeCurrent;
                    const currentEpisode = Number.isFinite(currentEpisodeSource)
                        ? Math.max(0, Math.trunc(currentEpisodeSource as number))
                        : 0;
                    const nextEpisode = currentEpisode + 1;
                    const updates: Partial<AnimeItem> = {
                        episodeCurrent: nextEpisode,
                    };
                    item.episodeCurrent = nextEpisode;
                    if (activePart) {
                        activePart.episodeCurrent = nextEpisode;
                        const total = Number.isFinite(activePart.episodeTotal)
                            ? Math.max(0, Math.trunc(activePart.episodeTotal as number))
                            : null;
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
                    }

                    if (item.status === 'planned') {
                        item.status = 'watching';
                        updates.status = 'watching';
                    }

                    const totalEpisodeSource = activePart?.episodeTotal ?? item.episodeTotal;
                    const totalEpisodes = Number.isFinite(totalEpisodeSource)
                        ? Math.max(0, Math.trunc(totalEpisodeSource as number))
                        : null;
                    if (totalEpisodes && nextEpisode >= totalEpisodes) {
                        const allPartsCompleted = parts.length > 0 && parts.every((part) => part.status === 'completed');
                        if (parts.length === 0 || allPartsCompleted) {
                            item.status = 'completed';
                            updates.status = 'completed';
                        }
                    }

                    deps.onItemMutated(item, ['episodeCurrent', 'episodeTotal', 'seasonCurrent', 'status', 'parts']);
                    deps.updateAnime(item, updates);
                });
        });
    }

    if (item.type === 'book') {
        menu.addItem((menuItem) => {
            menuItem.setTitle(t('contextPagePlusOne'))
                .setIcon('plus')
                .onClick(() => {
                    if (deps.isDestroyed()) return;
                    const current = Number.isFinite(item.pageCurrent) ? Math.max(0, Math.trunc(item.pageCurrent as number)) : 0;
                    const total = Number.isFinite(item.pageTotal) ? Math.max(0, Math.trunc(item.pageTotal as number)) : null;
                    const next = total ? Math.min(current + 1, total) : current + 1;
                    const updates: Partial<BookItem> = { pageCurrent: next };
                    item.pageCurrent = next;
                    if (item.status === 'planned') {
                        item.status = 'watching';
                        updates.status = 'watching';
                    }
                    if (total && next >= total) {
                        item.status = 'completed';
                        updates.status = 'completed';
                    }
                    deps.onItemMutated(item, ['pageCurrent', 'status']);
                    deps.updateReading?.(item, updates);
                });
        });
    }

    if (item.type === 'manga') {
        menu.addItem((menuItem) => {
            menuItem.setTitle(t('contextChapterPlusOne'))
                .setIcon('plus')
                .onClick(() => {
                    if (deps.isDestroyed()) return;
                    const parts = item.parts?.length ? item.parts.map((part) => ({ ...part })) : [];
                    const activePart = parts.find((part) => part.id === item.activePartId) ?? parts[0] ?? null;
                    const currentSource = activePart?.chapterCurrent ?? item.chapterCurrent;
                    const current = Number.isFinite(currentSource) ? Math.max(0, Math.trunc(currentSource as number)) : 0;
                    const totalSource = activePart?.chapterTotal ?? item.chapterTotal;
                    const total = Number.isFinite(totalSource) ? Math.max(0, Math.trunc(totalSource as number)) : null;
                    const next = total ? Math.min(current + 1, total) : current + 1;
                    const updates: Partial<MangaItem> = { chapterCurrent: next };
                    item.chapterCurrent = next;
                    if (activePart) {
                        activePart.chapterCurrent = next;
                        if (total && next >= total) {
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
                    }
                    if (item.status === 'planned') {
                        item.status = 'watching';
                        updates.status = 'watching';
                    }
                    const allPartsCompleted = parts.length > 0 && parts.every((part) => part.status === 'completed');
                    if ((parts.length === 0 && total && next >= total) || allPartsCompleted) {
                        item.status = 'completed';
                        updates.status = 'completed';
                    }
                    deps.onItemMutated(item, ['chapterCurrent', 'chapterTotal', 'volumeCurrent', 'status', 'parts']);
                    deps.updateReading?.(item, updates);
                });
        });
    }

    menu.addSeparator();

    menu.addItem((menuItem) => {
        menuItem.setTitle(item.favorite ? t('contextRemoveFavorite') : t('contextAddFavorite'))
            .setIcon(FILTER_ICON_MAP.favorite)
            .onClick(() => {
                if (deps.isDestroyed()) return;
                item.favorite = !item.favorite;
                deps.onItemMutated(item, ['favorite']);
                if (item.type === 'anime') {
                    deps.updateAnime(item, { favorite: item.favorite });
                } else if (item.type === 'movie' || item.type === 'series') {
                    deps.updateVideo?.(item, { favorite: item.favorite });
                } else if (item.type === 'book' || item.type === 'manga') {
                    deps.updateReading?.(item, { favorite: item.favorite });
                } else {
                    deps.updateGame(item, { favorite: item.favorite });
                }
            });
    });

    menu.addSeparator();

    menu.addItem((menuItem) => {
        menuItem.setTitle(t('contextEdit'))
            .setIcon('pencil')
            .onClick(() => {
                if (deps.isDestroyed()) return;
                deps.onEdit(item);
            });
    });

    menu.addItem((menuItem) => {
        menuItem.setTitle(t('contextDelete'))
            .setIcon('trash-2')
            .onClick(() => {
                if (deps.isDestroyed()) return;
                deps.onDelete(item);
            });
    });

    menu.showAtPosition({ x, y });
}
