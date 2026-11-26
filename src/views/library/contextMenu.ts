import { pt } from '../../localization/priority';
import { normalizePriority } from '../../utils/priority';
import type { MusicItem } from '../../types';
import { Menu, MenuItem } from 'obsidian';
import { AnimeItem, BookItem, CustomMediaGroup, GameItem, MediaItem, MediaStatus, MovieItem, RatingBadgeMode, RatingScaleSettings, ReadingItem, SeriesItem, UserRating } from '../../types';
import { getClassicRatingLevel } from '../../classicRatingPresets';
import { FILTER_ICON_MAP, RATING_CONFIG, RATING_EMOJI } from '../../constants';
import { t } from '../../localization';
import { UNKNOWN_DATE, personalDateTimestamp } from '../../utils/personalDates';
import { sortedCustomGroups } from '../../services/media/customGroups';
import { getStatusAppearance } from '../../statusPresentation';
import { completeWatchingParts } from '../../services/media/videoProgress';
import { incrementAnimeEpisode, incrementMangaChapter } from './progressActions';
import { formatRatingValue, getRatingMax, getRatingStep, roundRatingToStep } from '../../utils/rating';

type MenuItemWithSubmenu = MenuItem & { setSubmenu: () => Menu };

export interface MediaContextMenuDeps {
    chooseCompletionDate?: (item: MediaItem) => Promise<string | null>;
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
    ratingSettings: RatingScaleSettings;
    updateAnime: (anime: AnimeItem, updates: Partial<AnimeItem>) => void;
    updateGame: (game: GameItem, updates: Partial<GameItem>) => void;
    updateVideo?: (item: MovieItem | SeriesItem, updates: Partial<MovieItem | SeriesItem>) => void;
    updateMusic?: (item: MusicItem, updates: Partial<MusicItem>) => void;
    updateReading?: (item: ReadingItem, updates: Partial<ReadingItem>) => void;
    customGroups: CustomMediaGroup[];
    onToggleCustomGroup: (item: MediaItem, groupId: string) => void;
    onOpenCustomGroups: () => void;
}

export function showMediaContextMenu(item: MediaItem, x: number, y: number, deps: MediaContextMenuDeps): void {
    if (deps.isDestroyed()) return;

    const menu = new Menu();

    const applyRating = (value: UserRating): void => {
        if (deps.isDestroyed()) return;
        item.userRating = value;
        deps.onItemMutated(item, ['userRating']);
        if (item.type === 'anime') deps.updateAnime(item, { userRating: value });
        else if (item.type === 'movie' || item.type === 'series') deps.updateVideo?.(item, { userRating: value });
        else if (item.type === 'book' || item.type === 'manga') deps.updateReading?.(item, { userRating: value });
        else if (item.type === 'music') deps.updateMusic?.(item, { userRating: value });
        else deps.updateGame(item, { userRating: value });
    };

    menu.addItem((menuItem) => {
        if (deps.ratingSettings.mode === 'custom') {
            const submenuHost = menuItem as MenuItemWithSubmenu;
            const max = getRatingMax(deps.ratingSettings);
            const step = getRatingStep(deps.ratingSettings);
            let current = item.userRating;
            const updateMenuTitle = (): void => {
                const currentText = current === null ? '—' : `${formatRatingValue(current)}/${max}`;
                submenuHost.setTitle(`${t('contextChangeRating')} · ${currentText}`);
            };
            updateMenuTitle();
            submenuHost.setIcon('star');
            const sub = submenuHost.setSubmenu();
            sub.addItem((controlItem) => {
                const content = createFragment();
                const control = content.createSpan({ cls: 'lorebase-context-rating-control' });
                const decrease = control.createEl('button', { cls: 'lorebase-context-rating-step', text: '−', attr: { type: 'button' } });
                const value = control.createEl('input', { cls: 'lorebase-context-rating-value', attr: { type: 'text', inputmode: 'decimal', 'aria-label': t('editRating'), placeholder: '—' } });
                const increase = control.createEl('button', { cls: 'lorebase-context-rating-step', text: '+', attr: { type: 'button' } });
                const stopMenuClick = (event: Event): void => {
                    event.preventDefault();
                    event.stopPropagation();
                };
                const render = (): void => {
                    value.value = current === null ? '' : formatRatingValue(current);
                    decrease.disabled = current === null || current <= 1;
                    increase.disabled = current !== null && current >= max;
                    updateMenuTitle();
                };
                control.addEventListener('click', event => event.stopPropagation());
                // Obsidian's native menu cancels mousedown, which prevents input focus.
                control.addEventListener('mousedown', event => event.stopPropagation());
                for (const input of [value]) {
                    input.addEventListener('pointerdown', event => event.stopPropagation());
                    input.addEventListener('keydown', event => event.stopPropagation());
                }
                value.addEventListener('focus', () => value.select());
                value.addEventListener('click', () => value.select());
                const commit = (): void => {
                    const raw = value.value.trim();
                    const parsed = Number(raw.replace(',', '.'));
                    const valid = !raw || /^\d+(?:[.,]\d)?$/.test(raw) && parsed >= 1 && parsed <= max
                        && Math.abs(parsed - roundRatingToStep(parsed, step)) < 0.001;
                    value.setCustomValidity(valid ? '' : `1–${max} · ${step}`);
                    if (!valid) { value.reportValidity(); return; }
                    const next = raw ? parsed : null;
                    if (current !== next) { current = next; applyRating(current); }
                    render();
                };
                value.addEventListener('input', () => {
                    const raw = value.value.trim();
                    const parsed = Number(raw.replace(',', '.'));
                    const valid = /^\d+(?:[.,]\d)?$/.test(raw) && parsed >= 1 && parsed <= max
                        && Math.abs(parsed - roundRatingToStep(parsed, step)) < 0.001;
                    value.setCustomValidity(!raw || valid ? '' : `1–${max} · ${step}`);
                    if (valid && parsed !== current) {
                        current = parsed; applyRating(current); updateMenuTitle();
                        decrease.disabled = current <= 1; increase.disabled = current >= max;
                    }
                });
                value.addEventListener('change', commit);
                value.addEventListener('keydown', event => {
                    if (event.key === 'Enter') { event.preventDefault(); commit(); }
                });
                for (const button of [decrease, increase]) {
                    button.addEventListener('pointerdown', stopMenuClick);
                    button.addEventListener('click', stopMenuClick);
                }
                decrease.addEventListener('click', () => {
                    if (current === null || current <= 1) return;
                    current = Math.max(1, roundRatingToStep(current - step, 0.1));
                    applyRating(current);
                    render();
                });
                increase.addEventListener('click', () => {
                    if (current !== null && current >= max) return;
                    current = Math.min(max, roundRatingToStep((current ?? (1 - step)) + step, 0.1));
                    applyRating(current);
                    render();
                });
                controlItem.setTitle(content);
                render();
            });
            sub.addItem((clearItem) => clearItem
                .setTitle(`${String.fromCodePoint(0x1f9f9)} ${t('contextClear')}`)
                .onClick(() => applyRating(null)));
            return;
        }
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
                let title: string | DocumentFragment;
                const themed = getClassicRatingLevel(deps.ratingSettings, item.type, rating.value);
                if (themed) {
                    title = createFragment();
                    title.createSpan({ cls: 'lorebase-context-rating-star', text: themed.emoji });
                    title.createSpan({ text: `${rating.value} · ${themed.label}` }).style.color = themed.color;
                } else if (deps.ratingMode === 'star') {
                    title = createFragment();
                    const star = title.createSpan({ cls: 'lorebase-context-rating-star', text: '\u2605' });
                    star.style.color = RATING_CONFIG.find((entry) => entry.value === rating.value)?.color
                        ?? 'var(--interactive-accent)';
                    title.createSpan({ text: `${rating.value} \u00b7 ${rating.label}` });
                } else {
                    title = `${RATING_EMOJI[rating.value]} ${rating.label}`;
                }
                subItem.setTitle(title)
                    .onClick(() => {
                        applyRating(rating.value);
                    });
            });
        }

        sub.addItem((subItem: MenuItem) => {
            subItem.setTitle(`${String.fromCodePoint(0x1f9f9)} ${t('contextClear')}`)
                .onClick(() => {
                    applyRating(null);
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
                    .setIcon(getStatusAppearance(item.type, status).icon)
                    .onClick(async () => {
                        if (deps.isDestroyed()) return;
                        let completion: string | null = null;
                        if (status === 'completed' && item.type !== 'music' && !item.finished) {
                            completion = deps.chooseCompletionDate ? await deps.chooseCompletionDate(item) : UNKNOWN_DATE;
                            if (completion === null || deps.isDestroyed()) return;
                        }
                        if (item.type === 'music') {
                            item.status = status as MusicItem['status'];
                            deps.onItemMutated(item, ['status']);
                            deps.updateMusic?.(item, { status: item.status });
                        } else if (item.type === 'anime') {
                            const nextStatus = status as AnimeItem['status'];
                            const updates: Partial<AnimeItem> = { status: nextStatus };
                            const changedFields = ['status'];
                            if (nextStatus === 'completed') {
                                updates.parts = completeWatchingParts(item.parts ?? []);
                                const active = updates.parts.find(part => part.id === item.activePartId) ?? updates.parts[0];
                                updates.episodeCurrent = active?.episodeCurrent ?? item.episodeTotal ?? item.episodeCurrent;
                                Object.assign(item, updates);
                                changedFields.push('parts', 'episodeCurrent');
                            }
                            item.status = nextStatus;
                            if (nextStatus === 'completed' && !item.finished) {
                                item.finished = completion ?? UNKNOWN_DATE;
                                updates.finished = item.finished;
                                changedFields.push('finished');
                            }
                            deps.onItemMutated(item, changedFields);
                            deps.updateAnime(item, updates);
                        } else if (item.type === 'movie' || item.type === 'series') {
                            const nextStatus = status as MovieItem['status'];
                            const updates: Partial<MovieItem> = { status: nextStatus };
                            const changedFields = ['status'];
                            if (item.type === 'series' && nextStatus === 'completed') {
                                updates.parts = completeWatchingParts(item.parts ?? []);
                                const active = updates.parts.find(part => part.id === item.activePartId) ?? updates.parts[0];
                                Object.assign(updates, { episodeCurrent: active?.episodeCurrent ?? item.episodeTotal ?? item.episodeCurrent });
                                Object.assign(item, updates);
                                changedFields.push('parts', 'episodeCurrent');
                            }
                            item.status = nextStatus;
                            if (nextStatus === 'completed' && !item.finished) {
                                item.finished = completion ?? UNKNOWN_DATE;
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
                                item.finished = completion ?? UNKNOWN_DATE;
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
                                item.finished = completion ?? UNKNOWN_DATE;
                                item.dateCompleted = personalDateTimestamp(item.finished);
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

    menu.addItem((menuItem) => {
        const submenuHost = menuItem as MenuItemWithSubmenu;
        submenuHost.setTitle(t('contextGroups')).setIcon('folders');
        const sub = submenuHost.setSubmenu();
        for (const group of sortedCustomGroups(deps.customGroups)) {
            const included = group.itemPaths.includes(item.filePath);
            sub.addItem((subItem) => subItem
                .setTitle(group.name)
                .setIcon(included ? 'check' : 'folder')
                .onClick(() => deps.onToggleCustomGroup(item, group.id)));
        }
        if (deps.customGroups.length > 0) sub.addSeparator();
        sub.addItem((subItem) => subItem
            .setTitle(t('customGroupsManage'))
            .setIcon('settings-2')
            .onClick(() => deps.onOpenCustomGroups()));
    });

    if (deps.onSourceAction && item.type !== 'music') {
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
                } else if (item.type === 'music') {
                    deps.updateMusic?.(item, { favorite: item.favorite });
                } else {
                    deps.updateGame(item, { favorite: item.favorite });
                }
            });
    });

    menu.addItem(menuItem => {
        const selected = normalizePriority(item.priority);
        const entry = menuItem as MenuItemWithSubmenu;
        entry.setTitle(pt('priority') + ' · ' + pt(selected)).setIcon('flag');
        const submenu = entry.setSubmenu();
        for (const value of ['highest', 'high', 'normal', 'low'] as const) submenu.addItem(option => option
            .setTitle(pt(value)).setChecked(value === selected).onClick(() => {
                if (deps.isDestroyed()) return;
                item.priority = value;
                deps.onItemMutated(item, ['priority']);
                if (item.type === 'anime') deps.updateAnime(item, { priority: value });
                else if (item.type === 'movie' || item.type === 'series') deps.updateVideo?.(item, { priority: value });
                else if (item.type === 'book' || item.type === 'manga') deps.updateReading?.(item, { priority: value });
                else if (item.type === 'music') deps.updateMusic?.(item, { priority: value });
                else deps.updateGame(item, { priority: value });
                deps.onApplyFiltersAndSort();
            }));
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
