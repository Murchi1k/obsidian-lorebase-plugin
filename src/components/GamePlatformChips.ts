import { renderRepeatCountInput } from './RepeatCountInput';
import { setIcon } from 'obsidian';
import { i18n, t } from '../localization';
import { compactGameText } from '../localization/compactGameEditor';
import { trackingText } from './RepeatTrackingControl';
import { type PlatformPlaythrough } from '../utils/repeatTracking';

interface GamePlatformActions {
    family: (platform: string) => string;
    icon: (family: string) => string;
    onChange: (entries: PlatformPlaythrough[], refresh?: boolean) => void;
    onRemove: (platform: string) => void;
}

export function renderGamePlatformChips(container: HTMLElement, platforms: string[], entries: PlatformPlaythrough[], options: GamePlatformActions): void {
    const previousScroll = container.querySelector<HTMLElement>('.lorebase-platform-choices')?.scrollTop ?? 0;
    container.empty();
    const values = Array.from(new Set([...platforms, ...entries.filter(entry => entry.selected).map(entry => entry.platform)]));
    if (!values.length) { container.createSpan({ cls: 'lorebase-editmode-platform-empty', text: t('editNoPlatforms') }); return; }
    const hint = { ru: 'Где играли · можно выбрать несколько', uk: 'Де грали · можна вибрати кілька', en: 'Played on · select multiple', 'zh-CN': '点击游玩过的平台，可多选。' }[i18n.getLanguage()];
    container.createDiv({ cls: 'lorebase-platform-selection-hint', text: hint });
    const list = container.createDiv({ cls: 'lorebase-platform-choices' });
    for (const platform of values) {
        const entry = entries.find(value => value.platform === platform);
        const selected = entry?.selected === true;
        const group = list.createDiv({ cls: 'lorebase-platform-choice' });
        const chip = group.createEl('button', {
            cls: `lorebase-editmode-platform-chip${selected ? ' is-played-on' : ''}`,
            attr: { type: 'button', 'aria-pressed': String(selected), 'aria-label': `${trackingText('playedOn')}: ${platform}`, 'data-platform-family': options.family(platform) },
        });
        setIcon(chip.createSpan({ cls: 'lorebase-editmode-platform-chip-icon' }), options.icon(options.family(platform)));
        chip.createSpan({ cls: 'lorebase-editmode-platform-chip-label', text: platform });
        chip.addEventListener('click', () => {
            const next = entries.map(value => ({ ...value }));
            const previous = next.find(value => value.platform === platform);
            if (previous) previous.selected = !selected;
            else next.push({ platform, repeatCount: 0, selected: true });
            options.onChange(next, true);
        });
        if (platforms.includes(platform)) {
            const remove = group.createEl('button', { cls: 'lorebase-platform-remove', attr: { type: 'button', 'aria-label': `${platform}: ${t('editRemoveHint')}`, title: t('editRemoveHint') } });
            setIcon(remove, 'x');
            remove.addEventListener('click', () => options.onRemove(platform));
        }
        if (!selected || !entry) continue;
        const counter = group.createDiv({ cls: 'lorebase-platform-repeat-inline' });
        renderRepeatCountInput(counter, entry.repeatCount, platform + ': ' + trackingText('game'), trackingText('hint'), count => {
            entries = entries.map(value => ({ ...value, repeatCount: value.platform === platform ? count : value.repeatCount }));
            options.onChange(entries, false);
        });
    }
    list.scrollTop = previousScroll;
}

export function renderCompactGamePlatforms(
    played: HTMLElement,
    platforms: string[],
    entries: PlatformPlaythrough[],
    options: GamePlatformActions,
): void {
    const panel = played.parentElement!;
    const search = panel.querySelector<HTMLInputElement>('[data-field="new-platform"]');
    const focused = played.ownerDocument.activeElement as HTMLElement | null;
    const focusedPlatform = focused?.dataset.playedPlatform;
    const editing = panel.classList.contains('is-editing');
    played.empty();
    const heading = played.createDiv({ cls: 'lorebase-played-heading' });
    const caption = heading.createDiv({ cls: 'lorebase-played-caption' });
    caption.createSpan({ cls: 'lorebase-played-label', text: trackingText('playedOn') });
    const hasPlayed = entries.some(entry => entry.selected);
    if (hasPlayed) caption.createSpan({ cls: 'lorebase-played-hint', text: compactGameText('editReplays') });
    const toggle = heading.createEl('button', {
        cls: 'lorebase-editmode-btn lorebase-played-toggle',
        attr: { type: 'button', 'aria-expanded': String(editing) },
    });
    setIcon(toggle.createSpan({ attr: { 'aria-hidden': 'true' } }), editing ? 'check' : 'gamepad-2');
    toggle.createSpan({ text: compactGameText(editing ? 'finishPlatforms' : 'managePlatforms') });
    const setEditing = (open: boolean): void => {
        if (!open && search) search.value = '';
        panel.classList.toggle('is-editing', open);
        renderCompactGamePlatforms(played, platforms, entries, options);
        (open && search ? search : played.querySelector<HTMLButtonElement>('.lorebase-played-toggle'))?.focus({ preventScroll: true });
    };
    toggle.addEventListener('click', () => setEditing(!editing));
    const choices = played.createDiv({ cls: 'lorebase-played-choices' });
    choices.addEventListener('keydown', event => {
        if (!editing || event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        setEditing(false);
    });
    // Match saved entries case-insensitively so re-adding a renamed chip keeps its count.
    const key = (platform: string): string => platform.toLowerCase();
    const byPlatform = new Map(entries.map(entry => [key(entry.platform), entry]));
    const playable = new Map(platforms.map(platform => [key(platform), platform]));
    for (const entry of entries) {
        if ((entry.selected || entry.repeatCount > 0) && !playable.has(key(entry.platform))) playable.set(key(entry.platform), entry.platform);
    }

    if (!editing && !hasPlayed) choices.createSpan({ cls: 'lorebase-played-empty', text: compactGameText('noPlayedPlatforms') });
    if (editing && !playable.size) choices.createSpan({ cls: 'lorebase-played-empty', text: t('editNoPlatforms') });
    for (const [id, platform] of playable) {
        const entry = byPlatform.get(id);
        if (!editing && !entry?.selected) continue;
        const row = choices.createDiv({ cls: 'lorebase-played-row' });
        row.dataset.platformName = id;
        row.dataset.platformFamily = options.family(platform);
        row.classList.toggle('is-selected', entry?.selected === true);
        const identity = editing
            ? row.createEl('button', { cls: 'lorebase-played-identity', attr: { type: 'button', 'aria-pressed': String(entry?.selected === true), 'data-played-platform': id } })
            : row.createDiv({ cls: 'lorebase-played-identity' });
        if (editing) {
            setIcon(identity.createSpan({ cls: 'lorebase-played-check', attr: { 'aria-hidden': 'true' } }), entry?.selected ? 'check' : 'square');
            identity.addEventListener('click', () => {
                const next = entry
                    ? entries.map(value => value === entry ? { ...value, selected: !value.selected } : value)
                    : [...entries, { platform, selected: true, repeatCount: 0 }];
                options.onChange(next, true);
            });
        }
        setIcon(identity.createSpan({ cls: 'lorebase-editmode-platform-chip-icon', attr: { 'aria-hidden': 'true' } }), options.icon(row.dataset.platformFamily));
        identity.createSpan({ cls: 'lorebase-played-name', text: platform, attr: { title: platform } });
        if (entry?.selected) renderRepeatCountInput(row, entry.repeatCount, `${platform}: ${trackingText('game')}`, trackingText('hint'), count => {
            entry.repeatCount = count;
            options.onChange(entries, false);
        });
        if (editing && platforms.includes(platform)) {
            const label = compactGameText('removeAvailablePlatform');
            const remove = row.createEl('button', {
                cls: 'lorebase-platform-remove',
                attr: { type: 'button', 'aria-label': `${label}: ${platform}`, title: label },
            });
            setIcon(remove, 'x');
            remove.addEventListener('click', () => {
                options.onRemove(platform);
                played.querySelector<HTMLButtonElement>('.lorebase-played-toggle')?.focus({ preventScroll: true });
            });
        }
        if (editing && id === focusedPlatform) identity.focus({ preventScroll: true });
    }
    if (search) {
        search.oninput = null;
        search.onkeydown = null;
        if (editing) {
            const rows = Array.from(choices.querySelectorAll<HTMLElement>('[data-platform-name]'));
            const empty = choices.createSpan({ cls: 'lorebase-played-empty', text: compactGameText('noMatchingPlatforms') });
            const filter = (): void => {
                const query = search.value.trim().toLowerCase();
                rows.forEach(row => { row.hidden = !row.dataset.platformName!.includes(query); });
                empty.hidden = !rows.length || rows.some(row => !row.hidden);
            };
            search.oninput = filter;
            search.onkeydown = event => {
                if (event.key !== 'Escape') return;
                event.stopPropagation();
                setEditing(false);
            };
            filter();
        }
    }
}
