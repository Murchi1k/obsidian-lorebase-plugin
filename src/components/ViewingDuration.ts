import { setIcon } from 'obsidian';
import { i18n, t } from '../localization';
import { watchCopy } from './WatchProgress';

type Part = { kind: string; episodeDuration?: number | null };
const episodic = (part: Part) => part.kind !== 'movie';
export function commonEpisodeDuration(parts: readonly Part[]): number | null {
    const counts = new Map<number, number>();
    for (const part of parts) if (episodic(part) && part.episodeDuration && Number.isFinite(part.episodeDuration) && part.episodeDuration > 0)
        counts.set(part.episodeDuration, (counts.get(part.episodeDuration) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export function fillMissingEpisodeDurations(parts: Part[], duration = commonEpisodeDuration(parts)): void {
    if (!duration) return;
    for (const part of parts) if (episodic(part) && !part.episodeDuration) part.episodeDuration = duration;
}

const copy = {
    en: ['Typical episode', 'Used for seasons without a duration. Individual seasons can have their own value.', 'Hours', 'Minutes'],
    ru: ['Обычно серия', 'Для сезонов без длительности. У отдельного сезона можно указать своё значение.', 'Часы', 'Минуты'],
    uk: ['Зазвичай серія', 'Для сезонів без тривалості. Окремому сезону можна вказати власне значення.', 'Години', 'Хвилини'],
    'zh-CN': ['通常每集', '用于未设置时长的季。每季仍可单独设置。', '小时', '分钟'],
};

export function bindEpisodeDuration(root: HTMLElement, getParts: () => Part[], onChange: () => void): void {
    const host = root.querySelector<HTMLElement>('[data-role="episode-duration"]');
    if (!host) return;
    const previous = commonEpisodeDuration(getParts());
    const labels = copy[i18n.getLanguage()] ?? copy.en;
    host.classList.add('lorebase-viewing-duration');
    host.title = labels[1];
    const label = host.createEl('label');
    label.createSpan({ text: labels[0] });
    const input = label.createEl('input', { attr: { type: 'number', inputmode: 'numeric', min: '1', step: '1', placeholder: '—', 'aria-label': watchCopy().duration, 'data-field': 'common-duration' } });
    input.value = previous === null ? '' : String(previous);
    input.dataset.applied = input.value;
    label.createSpan({ text: watchCopy().minute });
    input.addEventListener('input', () => {
        const previous = Number(input.dataset.applied) || null;
        const value = Number(input.value);
        const duration = Number.isFinite(value) && value > 0 ? value : null;
        for (const part of getParts()) if (episodic(part) && (!part.episodeDuration || part.episodeDuration === previous))
            part.episodeDuration = duration;
        input.dataset.applied = duration === null ? '' : String(duration);
        onChange();
    });
}

export function syncEpisodeDuration(root: HTMLElement, parts: readonly Part[]): void {
    const input = root.querySelector<HTMLInputElement>('[data-field="common-duration"]');
    if (!input || input === root.ownerDocument.activeElement) return;
    const duration = commonEpisodeDuration(parts);
    input.value = duration === null ? '' : String(duration);
    input.dataset.applied = input.value;
}

export function bindMovieDuration(root: HTMLElement, minutes: number | null, onChange: (minutes: number | null) => void): void {
    const host = root.querySelector<HTMLElement>('[data-role="movie-duration"]');
    if (!host) return;
    host.classList.add('lorebase-viewing-duration');
    const icon = host.createSpan(); setIcon(icon, 'clock-3');
    host.createSpan({ text: t('templateFieldRuntime') });
    const labels = copy[i18n.getLanguage()] ?? copy.en;
    const makeInput = (label: string, unit: string, value: number | null, field: string) => {
        const wrapper = host.createEl('label');
        const input = wrapper.createEl('input', { attr: { type: 'number', inputmode: 'numeric', min: '0', step: '1', placeholder: '—', 'aria-label': label, 'data-field': field } });
        input.value = value === null ? '' : String(value);
        wrapper.createSpan({ text: unit });
        return input;
    };
    const hours = makeInput(labels[2], watchCopy().hour, minutes === null ? null : Math.floor(minutes / 60), 'runtime-hours');
    const mins = makeInput(labels[3], watchCopy().minute, minutes === null ? null : minutes % 60, 'runtime-minutes');
    const changed = () => {
        const total = Math.max(0, Math.trunc(Number(hours.value) || 0)) * 60 + Math.max(0, Math.trunc(Number(mins.value) || 0));
        onChange(total > 0 ? total : null);
    };
    hours.addEventListener('input', changed);
    mins.addEventListener('input', changed);
    for (const input of [hours, mins]) input.addEventListener('change', () => {
        const total = Math.max(0, Math.trunc(Number(hours.value) || 0)) * 60 + Math.max(0, Math.trunc(Number(mins.value) || 0));
        if (hours.value || mins.value) { hours.value = String(Math.floor(total / 60)); mins.value = String(total % 60); }
    });
}
