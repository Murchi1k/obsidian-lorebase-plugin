import { App, setIcon } from 'obsidian';
import { i18n, t } from '../localization';
import { getWatchProgress, WatchablePart } from '../services/media/watchProgress';
import { getStatusAppearance } from '../statusPresentation';
import type { MediaStatus, RatingScaleSettings, UserRating } from '../types';
import { setPartPoster, watchCopy } from './WatchProgress';
import { createLorebaseDropdown, LorebaseDropdownHandle, LorebaseDropdownOption } from './LorebaseDropdown';
import { mountPartRating } from './PartRatingControl';

const labels = {
    en: { name: 'Part name', cover: 'Part poster', change: 'Change', add: 'Add', year: 'Release year', episodes: 'Watched / Total episodes', parts: 'parts', runtime: 'min/episode' },
    ru: { name: 'Название части', cover: 'Постер части', change: 'Изменить', add: 'Добавить', year: 'Год выпуска', episodes: 'Просмотрено / Всего серий', parts: 'частей', runtime: 'мин/серия' },
    uk: { name: 'Назва частини', cover: 'Постер частини', change: 'Змінити', add: 'Додати', year: 'Рік випуску', episodes: 'Переглянуто / Усього серій', parts: 'частин', runtime: 'хв/серія' },
    'zh-CN': { name: '分部名称', cover: '分部海报', change: '更改', add: '添加', year: '发行年份', episodes: '已看 / 总集数', parts: '个分部', runtime: '分钟/集' },
};
const partCopy = () => labels[i18n.getLanguage()] ?? labels.en;
const titleCardCopy = {
    en: { part: 'Part {n}', progress: 'Whole title', partRating: 'Part rating', settings: 'Additional settings', thisPart: 'This part' },
    ru: { part: 'Часть {n}', progress: 'Весь тайтл', partRating: 'Оценка части', settings: 'Дополнительные настройки', thisPart: 'Эта часть' },
    uk: { part: 'Частина {n}', progress: 'Увесь тайтл', partRating: 'Оцінка частини', settings: 'Додаткові налаштування', thisPart: 'Ця частина' },
    'zh-CN': { part: '第 {n} 部', progress: '整部作品', partRating: '分部评分', settings: '更多设置', thisPart: '此分部' },
};

export function buildTitlePartsProgress(): string {
    return `<div class="lorebase-title-part-total"><span>${titleCardCopy[i18n.getLanguage()].progress}</span><div data-role="watch-progress"></div></div>`;
}

export function buildTitlePartsHeader(title: string, refreshLabel?: string, autoLabel?: string): string {
    return `<div class="lorebase-editmode-panel-title-row lorebase-part-heading">
        <div class="lorebase-part-heading-title"><h3 class="lorebase-editmode-panel-title">${title}</h3><span data-role="part-count"></span></div>
        <div class="lorebase-editmode-anime-part-inline-actions">
            <button type="button" class="lorebase-part-add" data-action="add-part"><span data-role="add-part-icon"></span>${partCopy().add}</button>
            ${autoLabel ? `<button type="button" class="lorebase-editmode-anime-parts-icon-action lorebase-part-autofill" data-action="autofill-parts" aria-label="${autoLabel}" title="${autoLabel}"><span data-role="autofill-parts-icon" aria-hidden="true"></span></button>` : ''}
            ${refreshLabel ? `<button type="button" class="lorebase-editmode-anime-parts-icon-action" data-action="refresh-parts" aria-label="${refreshLabel}"></button>` : ''}
        </div>
    </div>`;
}

/** One persistent editor: selecting a tab only changes its values. */
export function buildTitlePartEditor(compact = false): string {
    const copy = partCopy();
    const card = titleCardCopy[i18n.getLanguage()];
    const poster = `<div class="lorebase-part-poster-preview">
        <img data-role="part-poster-preview" alt="" hidden />
        <div class="lorebase-part-poster-placeholder" data-role="part-poster-placeholder"><span data-role="part-poster-icon"></span><span>${copy.cover}</span></div>
    </div>`;
    const posterEdit = `<button type="button" class="lorebase-part-artwork-change" data-action="edit-part-poster" aria-expanded="false"><span data-role="part-poster-edit-icon"></span>${copy.change}</button>`;
    const name = `<label class="lorebase-part-field is-wide"><span>${copy.name}</span><input class="lorebase-editmode-input" data-field="part-title" type="text" /></label>`;
    const kind = `<div class="lorebase-part-field"><span>${t('editFormat')}</span><div class="lorebase-editmode-dropdown" data-field="part-kind"></div></div>`;
    const year = `<label class="lorebase-part-field"><span>${copy.year}</span><input class="lorebase-editmode-input" data-field="part-year" type="number" min="1" inputmode="numeric" /></label>`;
    const increment = `<button type="button" data-action="episode-inc" aria-label="${t('editEpisodeInc')}">+</button>`;
    const stepper = `<div class="lorebase-part-stepper" role="group" aria-label="${t('editEpisodeCurrent')}">
        <button type="button" data-action="episode-dec" aria-label="${t('editEpisodeCurrent')}: −1">−</button>
        <input data-field="part-episode-current" type="number" min="0" inputmode="numeric" aria-label="${t('editEpisodeCurrent')}" />
        ${compact ? '' : increment}
    </div>`;
    const total = `<input class="lorebase-editmode-input" data-field="part-episode-total" type="number" min="0" inputmode="numeric" placeholder="?" aria-label="${t('editEpisodeTotal')}" />`;
    const status = '<div class="lorebase-part-live-status" data-role="part-status-segments"></div>';
    const runtime = `<label class="lorebase-part-runtime" title="${watchCopy().duration}"><span>${card.thisPart}</span><span class="lorebase-part-runtime-value"><input data-field="part-duration" type="number" min="1" step="1" inputmode="numeric" placeholder="—" aria-label="${watchCopy().duration}" /><span>${watchCopy().minute}</span></span></label>`;
    const repeats = '<div class="lorebase-part-repeat-tracking" data-role="part-repeat-tracking"></div>';
    const posterSource = `<label class="lorebase-part-field lorebase-part-poster-source" data-role="part-poster-source" hidden><span>${watchCopy().poster}</span><input class="lorebase-editmode-input" data-field="part-poster" type="text" placeholder="https://…" /></label>`;
    const episodes = '<div data-role="part-episodes"></div>';
    const remove = `<button type="button" data-action="remove-part"><span data-role="remove-part-icon"></span>${t('editRemovePart')}</button>`;
    const defaults = `<details class="lorebase-part-duration-default">
        <summary>${card.settings}${compact ? '<span data-card-icon="chevron-down" aria-hidden="true"></span>' : ''}</summary>
        <div class="lorebase-part-duration-panel">
            <div class="lorebase-part-settings-heading"><span data-card-icon="sliders-horizontal" aria-hidden="true"></span><strong>${card.settings}</strong></div>
            <div class="lorebase-part-settings-duration"><span class="lorebase-part-settings-caption">${watchCopy().duration}</span>${runtime}<div data-role="episode-duration"></div></div>
            ${compact ? `<div class="lorebase-part-footer">${remove}</div>` : ''}
        </div>
    </details>`;
    if (compact) {
        const caption = (icon: string, label: string) => `<span class="lorebase-title-part-label"><span data-card-icon="${icon}" aria-hidden="true"></span>${label}</span>`;
        return `<div class="lorebase-part-editor lorebase-title-part-card" data-role="part-editor" role="tabpanel">
            <div class="lorebase-title-part-overview">
                <div class="lorebase-part-artwork">${poster}
                    <button type="button" class="lorebase-part-artwork-change" data-action="edit-part-poster" aria-expanded="false" aria-label="${watchCopy().poster}" title="${copy.cover}"><span data-role="part-poster-edit-icon" aria-hidden="true"></span></button>
                </div>
                <div class="lorebase-title-part-content">
                    <div class="lorebase-title-part-heading">
                        <div class="lorebase-title-part-identity">
                            <span class="lorebase-title-part-position" data-role="part-position"></span>
                            <input class="lorebase-editmode-input lorebase-title-part-title" data-field="part-title" data-role="part-card-title" type="text" aria-label="${copy.name}" placeholder="${copy.name}" />
                        </div>
                        <div class="lorebase-title-part-field lorebase-title-part-rating">
                            <span class="lorebase-title-part-label">${card.partRating}</span><div data-role="part-rating"></div>
                        </div>
                    </div>
                    <div class="lorebase-title-part-tracking">
                        ${status}
                        <div class="lorebase-title-part-progress">
                            <div class="lorebase-title-part-progress-heading"><span data-role="part-card-watched"></span><strong data-role="part-card-percent"></strong></div>
                            <progress class="lorebase-watch-progress-bar" data-role="part-card-progress" max="100" aria-label="${watchCopy().progress}"></progress>
                        </div>
                        <div class="lorebase-title-part-repeats">${repeats}</div>
                    </div>
                    <div class="lorebase-title-part-metadata">
                        <div class="lorebase-title-part-field">${caption('monitor', t('editFormat'))}<div data-field="part-kind"></div></div>
                        <label class="lorebase-title-part-field">${caption('calendar-days', t('templateFieldYear'))}<input class="lorebase-editmode-input" data-field="part-year" type="number" min="1" inputmode="numeric" placeholder="—" /></label>
                        <div class="lorebase-title-part-field lorebase-title-part-episodes-field">
                            ${caption('layers', t('editEpisodes'))}
                            <div class="lorebase-title-part-episode-count" role="group" aria-label="${copy.episodes}">${stepper}<span class="lorebase-part-episode-divider" aria-hidden="true">/</span>${total}${increment}</div>
                        </div>
                    </div>
                </div>
                ${posterSource}
            </div>
            <div class="lorebase-title-part-tools">${episodes}${defaults}</div>
        </div>`;
    }
    return `<div class="lorebase-part-editor" data-role="part-editor" role="tabpanel">
        <div class="lorebase-part-details">
            <div class="lorebase-part-artwork">${poster}${posterEdit}</div>
            <div class="lorebase-part-fields">
                ${name}${kind}${year}
                <div class="lorebase-part-tracking is-wide">
                    <div class="lorebase-part-field"><span>${copy.episodes}</span>
                        <div class="lorebase-part-episode-inputs">
                            ${stepper}
                            <span class="lorebase-part-episode-divider" aria-hidden="true">/</span>
                            ${total}
                        </div>
                    </div>
                    <div class="lorebase-part-field"><span>${t('editStatus')}</span>${status}</div>
                </div>
                <div class="lorebase-part-utilities is-wide">${defaults}${repeats}</div>
            </div>
            ${posterSource}
        </div>
        ${episodes}
        <div class="lorebase-part-footer">${remove}</div>
    </div>`;
}

export function bindTitlePartRating(root: HTMLElement, settings: RatingScaleSettings, media: 'anime' | 'series', getPart: () => { userRating?: UserRating } | null): ReturnType<typeof mountPartRating> | undefined {
    const host = root.querySelector<HTMLElement>('[data-role="part-rating"]');
    if (!host) return;
    return mountPartRating(host, { ...settings, classicPreset: 'standard' }, getPart()?.userRating ?? null, titleCardCopy[i18n.getLanguage()].partRating, value => {
        const part = getPart();
        if (part) part.userRating = value;
    }, settings.mode !== 'classic', media);
}

export function updateTitlePartCard(root: HTMLElement, part: WatchablePart, index: number): void {
    const card = root.querySelector<HTMLElement>('.lorebase-title-part-card');
    if (!card) return;
    card.dataset.episodeMode = part.episodeTracking ?? 'count';
    const { current, total, percent } = getWatchProgress([part]);
    const copy = watchCopy();
    card.querySelector('[data-role="part-position"]')!.textContent = titleCardCopy[i18n.getLanguage()].part.replace('{n}', String(index + 1));
    card.querySelector('[data-role="part-card-watched"]')!.textContent = `${current} / ${total ?? '—'} ${copy.episodes}`;
    card.querySelector('[data-role="part-card-percent"]')!.textContent = percent === null ? '' : `${percent}%`;
    const progress = card.querySelector<HTMLProgressElement>('[data-role="part-card-progress"]')!;
    if (percent === null) progress.removeAttribute('value'); else progress.value = percent;
    progress.setAttribute('aria-valuetext', percent === null ? copy.unknown : `${percent}%`);
}

export function updateTitlePartStatusAppearance(root: HTMLElement, type: 'anime' | 'series', status: MediaStatus): void {
    const button = root.querySelector<HTMLButtonElement>('.lorebase-title-part-card [data-role="part-status-segments"] button');
    if (!button) return;
    let icon = button.querySelector<HTMLElement>('.lorebase-title-part-status-icon');
    if (!icon) {
        icon = button.createSpan({ cls: 'lorebase-title-part-status-icon', attr: { 'aria-hidden': 'true' } });
        button.prepend(icon);
    }
    const appearance = getStatusAppearance(type, status);
    setIcon(icon, appearance.icon);
    button.style.setProperty('--lorebase-title-part-status', appearance.color);
}

let partDropdownId = 0;

export function createTitlePartDropdown<T extends string>(
    host: HTMLElement, options: LorebaseDropdownOption<T>[], value: T,
    onChange: (value: T) => void, label: string,
): LorebaseDropdownHandle<T> {
    host.addClass('lorebase-editmode-dropdown', 'lorebase-part-dropdown');
    const dropdown = createLorebaseDropdown(host, options, value, next => { onChange(next); describeValue(next); }, {
        floating: true, minPanelWidth: 180, maxPanelHeight: 240, panelClass: 'lorebase-part-dropdown-panel',
    });
    const button = host.querySelector<HTMLButtonElement>('button')!;
    const panel = host.querySelector<HTMLElement>('[role="listbox"]')!;
    panel.id = `lorebase-part-picker-${++partDropdownId}`;
    panel.setAttribute('aria-label', label);
    const describeValue = (next: T): void => {
        const selected = options.find(option => option.value === next)?.label ?? next;
        button.title = selected;
        button.setAttribute('aria-label', `${label}: ${selected}`);
    };
    describeValue(value);
    button.setAttribute('aria-haspopup', 'listbox');
    button.setAttribute('aria-controls', panel.id);
    const close = (): void => {
        panel.dispatchEvent(new Event('lorebase-dropdown-close'));
        button.focus({ preventScroll: true });
    };
    button.addEventListener('keydown', event => {
        if (event.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') {
            event.preventDefault(); event.stopPropagation(); close();
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (button.getAttribute('aria-expanded') !== 'true') button.click();
            const items = panel.querySelectorAll<HTMLElement>('[role="option"]');
            const selected = panel.querySelector<HTMLElement>('[aria-selected="true"]');
            (selected ?? items[event.key === 'ArrowUp' ? items.length - 1 : 0])?.focus();
        }
    });
    panel.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            event.preventDefault(); event.stopPropagation(); close(); return;
        }
        const items = Array.from(panel.querySelectorAll<HTMLElement>('[role="option"]'));
        if (!items.length) return;
        const index = items.indexOf(panel.ownerDocument.activeElement as HTMLElement);
        let next: number;
        if (event.key === 'ArrowDown') next = (index + 1) % items.length;
        else if (event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = items.length - 1;
        else return;
        event.preventDefault(); items[next].focus();
    });
    return { setValue: next => { dropdown.setValue(next); describeValue(next); } };
}

export function bindTitlePartEditor(root: HTMLElement): void {
    const defaults = root.querySelector<HTMLDetailsElement>('.lorebase-part-duration-default');
    defaults?.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || !defaults.open) return;
        event.preventDefault(); event.stopPropagation(); defaults.open = false;
        defaults.querySelector('summary')?.focus();
    });
    root.addEventListener('pointerdown', event => {
        if (defaults?.open && !defaults.contains(event.target as Node)) defaults.open = false;
    });
    root.querySelectorAll<HTMLElement>('[data-card-icon]').forEach(host => setIcon(host, host.dataset.cardIcon!));
    for (const [role, icon] of [['add-part-icon', 'plus'], ['part-poster-icon', 'image-plus'], ['part-poster-edit-icon', 'pencil'], ['remove-part-icon', 'trash-2']]) {
        const host = root.querySelector<HTMLElement>(`[data-role="${role}"]`);
        if (host) setIcon(host, icon);
    }
    const toggle = root.querySelector<HTMLButtonElement>('[data-action="edit-part-poster"]');
    const source = root.querySelector<HTMLElement>('[data-role="part-poster-source"]');
    const input = root.querySelector<HTMLInputElement>('[data-field="part-poster"]');
    toggle?.addEventListener('click', () => {
        if (!source) return;
        source.hidden = !source.hidden;
        toggle.setAttribute('aria-expanded', String(!source.hidden));
        if (!source.hidden) input?.focus();
    });
    input?.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== 'Escape') return;
        event.preventDefault();
        if (source) source.hidden = true;
        toggle?.setAttribute('aria-expanded', 'false');
        toggle?.focus();
    });
}

export function updateTitlePartPresentation(
    root: HTMLElement, app: App,
    parts: readonly { id: string }[],
    part: { id: string; poster?: string | null } | null,
): void {
    const count = root.querySelector<HTMLElement>('[data-role="part-count"]');
    if (count) {
        const language = i18n.getLanguage();
        const forms: Record<string, Partial<Record<Intl.LDMLPluralRule, string>>> = {
            en: { one: 'part', other: 'parts' }, ru: { one: 'часть', few: 'части', many: 'частей', other: 'частей' },
            uk: { one: 'частина', few: 'частини', many: 'частин', other: 'частин' },
        };
        const unit = forms[language]?.[new Intl.PluralRules(language).select(parts.length)] ?? partCopy().parts;
        count.textContent = `${parts.length} ${unit}`;
    }
    const editor = root.querySelector<HTMLElement>('[data-role="part-editor"]');
    if (!editor) return;
    const source = editor.querySelector<HTMLElement>('[data-role="part-poster-source"]');
    if (source) {
        source.id = `${editor.id}-poster-source`;
        editor.querySelector('[data-action="edit-part-poster"]')?.setAttribute('aria-controls', source.id);
    }
    if (editor.dataset.partId !== part?.id) {
        editor.dataset.partId = part?.id ?? '';
        if (source) source.hidden = true;
        editor.querySelector('[data-action="edit-part-poster"]')?.setAttribute('aria-expanded', 'false');
    }
    const image = editor.querySelector<HTMLImageElement>('[data-role="part-poster-preview"]');
    const placeholder = editor.querySelector<HTMLElement>('[data-role="part-poster-placeholder"]');
    if (!image || !placeholder) return;
    const poster = part?.poster?.trim() ?? '';
    if (image.dataset.poster === poster) return;
    image.dataset.poster = poster;
    image.hidden = !poster;
    placeholder.hidden = Boolean(poster);
    if (poster) {
        setPartPoster(image, app, poster, '');
        if (!image.getAttribute('src')) {
            image.hidden = true;
            placeholder.hidden = false;
        }
        image.onerror = () => { image.onerror = null; image.hidden = true; placeholder.hidden = false; };
    } else image.removeAttribute('src');
}

export function updatePartEditorActions(root: HTMLElement): void {
    const remove = root.querySelector<HTMLButtonElement>('[data-action="remove-part"]');
    if (remove) remove.hidden = remove.disabled;
    const footer = root.querySelector<HTMLElement>('.lorebase-part-footer');
    if (footer) footer.hidden = !remove || remove.hidden;
}

export function updateTitlePartTracking(root: HTMLElement, part: (WatchablePart & { status?: string }) | null): void {
    const editor = root.querySelector<HTMLElement>('[data-role="part-editor"]');
    if (!editor) return;
    editor.hidden = !part;
    if (!part) return;
    editor.dataset.status = part.status ?? '';
    const current = Math.max(0, part.episodeCurrent ?? 0);
    const total = part.episodeTotal && part.episodeTotal > 0 ? part.episodeTotal : null;
    editor.querySelector<HTMLButtonElement>('[data-action="episode-dec"]')!.disabled = current <= 0;
    editor.querySelector<HTMLButtonElement>('[data-action="episode-inc"]')!.disabled = total !== null && current >= total;
    const input = editor.querySelector<HTMLInputElement>('[data-field="part-episode-current"]')!;
    input.readOnly = editor.classList.contains('lorebase-title-part-card') && part.episodeTracking === 'episodes';
    if (total !== null) input.max = String(total); else input.removeAttribute('max');
}
