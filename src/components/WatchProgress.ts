
import { App, Menu, TFile } from 'obsidian';
import { i18n, t } from '../localization';
import { getWatchProgress, WatchablePart } from '../services/media/watchProgress';
import { getStatusAppearance } from '../statusPresentation';
import type { MediaStatus } from '../types';

const copy = {
    en: { missingMovieTime: 'Enter the movie runtime to calculate viewing time.', totalTime: 'Total viewing time', films: 'films', missingTime: 'Enter episode counts and durations to calculate viewing time.', progress: 'Viewing progress', watched: 'Watched', remaining: 'Remaining', duration: 'Episode duration (min)', poster: 'Part cover URL or vault path', season: 'Season', unknown: 'Unknown', episodes: 'episodes', active: 'Active part', activate: 'Make active', edit: 'Edit part', remove: 'Remove part', hour: 'h', minute: 'min' },
    ru: { missingMovieTime: 'Укажите длительность фильма для расчёта времени просмотра.', totalTime: 'Всего на просмотр', films: 'фильмов', missingTime: 'Укажите количество и длительность серий для расчёта времени просмотра.', progress: 'Прогресс просмотра', watched: 'Просмотрено', remaining: 'Осталось', duration: 'Длительность серии (мин)', poster: 'Обложка части: URL или путь в хранилище', season: 'Сезон', unknown: 'Неизвестно', episodes: 'серий', active: 'Активная часть', activate: 'Сделать активной', edit: 'Редактировать часть', remove: 'Удалить часть', hour: 'ч', minute: 'мин' },
    uk: { missingMovieTime: 'Укажіть тривалість фільму для розрахунку часу перегляду.', totalTime: 'Усього на перегляд', films: 'фільмів', missingTime: 'Укажіть кількість і тривалість серій для розрахунку часу перегляду.', progress: 'Прогрес перегляду', watched: 'Переглянуто', remaining: 'Залишилося', duration: 'Тривалість серії (хв)', poster: 'Обкладинка частини: URL або шлях у сховищі', season: 'Сезон', unknown: 'Невідомо', episodes: 'серій', active: 'Активна частина', activate: 'Зробити активною', edit: 'Редагувати частину', remove: 'Видалити частину', hour: 'год', minute: 'хв' },
    'zh-CN': { missingMovieTime: '请填写电影时长以计算观看时间。', totalTime: '观看总时长', films: '部电影', missingTime: '请填写集数和每集时长以计算观看时间。', progress: '观看进度', watched: '已观看', remaining: '剩余', duration: '每集时长（分钟）', poster: '分部封面 URL 或仓库路径', season: '季', unknown: '未知', episodes: '集', active: '当前分部', activate: '设为当前分部', edit: '编辑分部', remove: '删除分部', hour: '小时', minute: '分钟' },
};

export const watchCopy = () => copy[i18n.getLanguage()] ?? copy.en;

export function formatWatchTime(minutes: number | null): string {
    if (minutes === null) return watchCopy().unknown;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return [hours ? `${hours} ${watchCopy().hour}` : '', rest || !hours ? `${rest} ${watchCopy().minute}` : ''].filter(Boolean).join(' ');
}

export function renderWatchProgress(host: HTMLElement, parts: readonly WatchablePart[], options: { movie?: boolean } = {}): void {
    host.empty();
    host.addClass('lorebase-watch-progress');
    const progress = getWatchProgress(parts);
    const labels = watchCopy();
    host.setAttribute('aria-label', labels.progress);
    const overview = host.createDiv({ cls: 'lorebase-watch-progress-overview' });
    const heading = overview.createDiv({ cls: 'lorebase-watch-progress-heading' });
    const unit = options.movie ? labels.films : labels.episodes;
    heading.createEl('strong', { text: String(progress.current) });
    heading.createSpan({ text: progress.total === null ? ` ${unit} · ${labels.watched.toLocaleLowerCase()}` : ` / ${progress.total} ${unit}` });
    if (progress.percent !== null) overview.createSpan({ cls: 'lorebase-watch-percent', text: `${progress.percent}%` });
    const bar = host.createEl('progress', { cls: 'lorebase-watch-progress-bar', attr: { max: '100', 'aria-label': labels.progress } });
    if (progress.percent !== null) bar.value = progress.percent;
    else { bar.classList.add('is-unknown'); bar.setAttribute('aria-valuetext', labels.unknown); }
    const times = host.createDiv({ cls: 'lorebase-watch-progress-times' });
    const addTime = (label: string, minutes: number | null): void => {
        const item = times.createDiv({ cls: 'lorebase-watch-time' });
        item.createSpan({ text: label });
        item.createEl('strong', { text: `${minutes !== null && minutes > 0 ? '≈ ' : ''}${formatWatchTime(minutes)}` });
    };
    addTime(labels.watched, progress.watchedMinutes);
    addTime(labels.remaining, progress.remainingMinutes);
    addTime(labels.totalTime, progress.watchedMinutes !== null && progress.remainingMinutes !== null ? progress.watchedMinutes + progress.remainingMinutes : null);
    if (progress.watchedMinutes === null || progress.remainingMinutes === null) {
        host.createDiv({ cls: 'lorebase-watch-time-hint', text: options.movie ? labels.missingMovieTime : labels.missingTime });
    }
}
export function resolvePartPoster(app: App, poster: string | null | undefined, fallback: string): string {
    if (!poster?.trim()) return fallback;
    const path = poster.trim().replace(/^\[\[|\]\]$/g, '').split('|')[0];
    if (/^(?:https?:|data:image\/|app:)/i.test(path)) return path;
    const file = app.metadataCache.getFirstLinkpathDest?.(path, '') ?? app.vault.getAbstractFileByPath(path);
    return file instanceof TFile ? app.vault.getResourcePath(file) : fallback;
}

export function setPartPoster(image: HTMLImageElement, app: App, poster: string | null | undefined, fallback: string): void {
    image.onerror = () => { image.onerror = null; image.src = fallback; };
    image.src = resolvePartPoster(app, poster, fallback);
}

interface CompositionPart extends WatchablePart {
    id: string;
    title: string;
    poster?: string | null;
    status?: string;
}

let partTabsId = 0;

/** Update tabs in place so typing and changing progress never disturb focus. */
export function renderPartTabs<T extends CompositionPart>(options: {
    host: HTMLElement; editor: HTMLElement | null; parts: T[];
    mediaType: 'anime' | 'series'; selectedPartId: string | null; activePartId: string | null;
    onSelect: (part: T) => void; onEdit: (part: T) => void;
}): void {
    const { host, editor, parts } = options;
    if (!host.id) host.id = `lorebase-part-tabs-${++partTabsId}`;
    host.setAttribute('role', 'tablist');
    host.setAttribute('aria-label', t('editAnimeParts'));
    if (editor) editor.id = `${host.id}-panel`;
    const selectedPart = parts.find(part => part.id === options.selectedPartId) ?? parts[0] ?? null;
    const tabs = Array.from(host.children) as HTMLElement[];
    if (tabs.length !== parts.length || tabs.some((tab, index) => tab.dataset.partId !== parts[index]?.id)) {
        host.empty();
        for (const part of parts) {
            const button = host.createEl('button', { cls: 'lorebase-part-tab', attr: { type: 'button', role: 'tab' } });
            button.dataset.partId = part.id;
            button.id = `${host.id}-${encodeURIComponent(part.id)}`;
            if (editor) button.setAttribute('aria-controls', editor.id);
            button.addEventListener('click', () => options.onSelect(part));
            const editMenu = (): Menu => {
                const menu = new Menu();
                menu.addItem(item => item.setTitle(t('contextEdit')).setIcon('pencil').onClick(() => options.onEdit(part)));
                return menu;
            };
            button.addEventListener('contextmenu', event => {
                event.preventDefault();
                event.stopPropagation();
                editMenu().showAtMouseEvent(event);
            });
            button.addEventListener('keydown', event => {
                if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
                    event.preventDefault();
                    event.stopPropagation();
                    const rect = button.getBoundingClientRect();
                    editMenu().showAtPosition({ x: rect.left, y: rect.bottom });
                    return;
                }
                const currentIndex = Array.from(host.children).indexOf(button);
                let next = currentIndex;
                if (event.key === 'ArrowRight') next = (currentIndex + 1) % parts.length;
                else if (event.key === 'ArrowLeft') next = (currentIndex - 1 + parts.length) % parts.length;
                else if (event.key === 'Home') next = 0;
                else if (event.key === 'End') next = parts.length - 1;
                else return;
                event.preventDefault();
                const target = host.children[next] as HTMLButtonElement | undefined;
                target?.click();
                target?.focus({ preventScroll: true });
            });
        }
    }
    Array.from(host.children).forEach((element, index) => {
        const button = element as HTMLButtonElement;
        const part = parts[index];
        const selected = part.id === selectedPart?.id;
        button.toggleClass('is-selected', selected);
        button.dataset.active = String(part.id === options.activePartId);
        const status = (part.status || 'planned') as MediaStatus;
        button.dataset.status = status;
        button.style.setProperty('--lorebase-part-status-color', getStatusAppearance(options.mediaType, status).color);
        button.setAttribute('aria-selected', String(selected));
        button.tabIndex = selected ? 0 : -1;
        button.textContent = part.title || watchCopy().season + ' ' + (index + 1);
        button.title = button.textContent;
        button.setAttribute('aria-label', `${button.textContent}${part.id === options.activePartId ? ' · ' + watchCopy().active : ''}`);
        if (selected && editor) editor.setAttribute('aria-labelledby', button.id);
    });
    if (editor) editor.hidden = !selectedPart;
}
