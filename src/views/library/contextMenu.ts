import { Menu, MenuItem } from 'obsidian';
import { AnimeItem, BookItem, GameItem, MediaItem, MediaStatus, MovieItem, RatingBadgeMode, ReadingItem, SeriesItem } from '../../types';
import { FILTER_ICON_MAP, STATUS_ICON_MAP } from '../../constants';
import { t } from '../../localization';
import { getRatingColor, getRatingEmoji, getRatingLabelKey, getRatingValues } from '../../utils/ratingScale';
import { incrementAnimeEpisode, incrementMangaChapter } from './progressActions';

type MenuItemWithSubmenu = MenuItem & { setSubmenu: () => Menu };

export interface MediaContextMenuDeps {
    isDestroyed: () => boolean;
    getStatusOptions: () => Array<{ status: MediaStatus; label: string }>;
    onApplyFiltersAndSort: () => void;
    onEdit: (item: MediaItem) => void;
    onOpen: (item: MediaItem) => void;
    onDelete: (item: MediaItem) => void;
    onSourceAction?: (item: MediaItem, relink: boolean) => void;
    onItemMutated: (item: MediaItem, changedFields: string[]) => void;
    cardClickAction: 'open' | 'edit';
    ratingMode: RatingBadgeMode;
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

        const ratings = getRatingValues()
            .reverse()
            .map((value) => ({ value, label: t(getRatingLabelKey(value)) }));

        for (const rating of ratings) {
            sub.addItem((subItem: MenuItem) => {
                let title: string | DocumentFragment;
                if (deps.ratingMode === 'star') {
                    title = createFragment();
                    const star = title.createSpan({ cls: 'lorebase-context-rating-star', text: '\u2605' });
                    star.style.color = getRatingColor(rating.value);
                    title.createSpan({ text: `${rating.value} \u00b7 ${rating.label}` });
                } else {
                    title = `${getRatingEmoji(rating.value)} ${rating.label}`;
                }
                subItem.setTitle(title)
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
                            const updates: Partial<AnimeItem> = { status: nextStatus };
                            const changedFields = ['status'];
                            item.status = nextStatus;
                            if (nextStatus === 'completed' && !item.finished) {
                                item.finished = getTodayDateInput();
                                updates.finished = item.finished;
                                changedFields.push('finished');
                            }
                            deps.onItemMutated(item, changedFields);
                            deps.updateAnime(item, updates);
                        } else if (item.type === 'movie' || item.type === 'series') {
                            const nextStatus = status as MovieItem['status'];
                            const updates: Partial<MovieItem> = { status: nextStatus };
                            const changedFields = ['status'];
                            item.status = nextStatus;
                            if (nextStatus === 'completed' && !item.finished) {
                                item.finished = getTodayDateInput();
                                updates.finished = item.finished;
                                changedFields.push('finished');
                            }
                            deps.onItemMutated(item, changedFields);
                            deps.updateVideo?.(item, updates);
                        } else if (item.type === 'book' || item.type === 'manga') {
                            const nextStatus = status as ReadingItem['status'];
                            const updates: Partial<ReadingItem> = { status: nextStatus };
                            const changedFields = ['status'];
                            item.status = nextStatus;
                            if (nextStatus === 'completed' && !item.finished) {
                                item.finished = getTodayDateInput();
                                updates.finished = item.finished;
                                changedFields.push('finished');
                            }
                            deps.onItemMutated(item, changedFields);
                            deps.updateReading?.(item, updates);
                        } else {
                            const nextStatus = status as GameItem['status'];
                            const updates: Partial<GameItem> = { status: nextStatus };
                            item.status = nextStatus;
                            const changedFields = ['status'];
                            if (nextStatus === 'completed' && !item.finished) {
                                item.finished = getTodayDateInput();
                                item.dateCompleted = Date.parse(item.finished);
                                updates.finished = item.finished;
                                changedFields.push('finished', 'dateCompleted');
                            }
                            deps.onItemMutated(item, changedFields);
                            deps.updateGame(item, updates);
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
                    const mutation = incrementAnimeEpisode(item);
                    deps.onItemMutated(item, mutation.changedFields);
                    deps.updateAnime(item, mutation.updates);
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
                    const mutation = incrementMangaChapter(item);
                    deps.onItemMutated(item, mutation.changedFields);
                    deps.updateReading?.(item, mutation.updates);
                });
        });
    }

    menu.addSeparator();

    if (deps.onSourceAction) {
        const connected = Boolean(item.integrationProvider && item.integrationId);
        menu.addItem((menuItem) => {
            menuItem
                .setTitle(connected ? t('contextSourceRefresh') : t('contextSourceLink'))
                .setIcon(connected ? 'refresh-cw' : 'link-2')
                .onClick(() => {
                    if (deps.isDestroyed()) return;
                    deps.onSourceAction?.(item, false);
                });
        });
        if (connected) {
            menu.addItem((menuItem) => {
                menuItem
                    .setTitle(t('contextSourceChange'))
                    .setIcon('repeat-2')
                    .onClick(() => {
                        if (deps.isDestroyed()) return;
                        deps.onSourceAction?.(item, true);
                    });
            });
        }
        menu.addSeparator();
    }

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
        const opensEditorOnClick = deps.cardClickAction === 'edit';
        menuItem.setTitle(opensEditorOnClick ? t('editOpen') : t('contextEdit'))
            .setIcon(opensEditorOnClick ? 'file-text' : 'pencil')
            .onClick(() => {
                if (deps.isDestroyed()) return;
                if (opensEditorOnClick) deps.onOpen(item);
                else deps.onEdit(item);
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

function getTodayDateInput(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
