import { setIcon } from 'obsidian';
import { i18n, t } from '../localization';
import { trackingText } from './RepeatTrackingControl';
import type { PlatformPlaythrough } from '../utils/repeatTracking';

let nextPlatformInput = 0;

/** One list owns both availability and played-on selection. No second copy of the chips. */
export function createManualGamePlatforms(parent: HTMLElement, initialPlatforms: string[], initialEntries: PlatformPlaythrough[],
    change: (platforms: string[], entries: PlatformPlaythrough[]) => void): void {
    const field = parent.createDiv({ cls: 'lorebase-editmode-field lorebase-manual-platforms is-wide' });
    field.createSpan({ cls: 'lorebase-editmode-field-label', text: t('templateFieldPlatforms') });
    const row = field.createDiv({ cls: 'lorebase-manual-platform-input-row' });
    const id = `lorebase-manual-platforms-${++nextPlatformInput}`;
    const input = row.createEl('input', { cls: 'lorebase-editmode-input', attr: { type: 'text', list: id, placeholder: t('editPlatformPlaceholder'), 'aria-label': t('templateFieldPlatforms') } });
    const suggestions = row.createEl('datalist', { attr: { id } });
    for (const name of ['PC', 'PlayStation 5', 'PlayStation 4', 'Xbox Series X/S', 'Xbox One', 'Nintendo Switch', 'Steam Deck', 'macOS', 'Linux', 'Android', 'iOS']) suggestions.createEl('option', { attr: { value: name } });
    const add = row.createEl('button', { cls: 'lorebase-manual-platform-add', attr: { type: 'button', 'aria-label': t('editAddPlatform'), title: t('editAddPlatform') } });
    setIcon(add, 'plus');
    const list = field.createDiv({ cls: 'lorebase-manual-platform-list' });
    const hint = field.createDiv({ cls: 'lorebase-manual-platform-hint', text: ({ ru: 'Нажмите на платформу, если играли на ней.', uk: 'Натисніть на платформу, якщо грали на ній.', en: 'Click a platform if you played on it.', 'zh-CN': '点击标记您游玩过的平台。' })[i18n.getLanguage()] });
    let platforms = [...new Set([...initialPlatforms, ...initialEntries.filter(entry => entry.selected).map(entry => entry.platform)])];
    let entries = initialEntries.map(entry => ({ ...entry }));
    const emit = (): void => change([...platforms], entries.map(entry => ({ ...entry })));
    const render = (): void => {
        list.empty(); hint.hidden = platforms.length === 0;
        for (const platform of platforms) {
            const selected = entries.some(entry => entry.platform === platform && entry.selected);
            const chip = list.createDiv({ cls: `lorebase-manual-platform${selected ? ' is-selected' : ''}` });
            const button = chip.createEl('button', { cls: 'lorebase-manual-platform-choice', attr: { type: 'button', 'aria-pressed': String(selected), 'aria-label': `${trackingText('playedOn')}: ${platform}`, 'data-platform': platform } });
            const icon = /pc|windows|linux|mac|steam deck/i.test(platform) ? 'monitor' : /android|ios|mobile/i.test(platform) ? 'smartphone' : 'gamepad-2';
            setIcon(button.createSpan({ cls: 'lorebase-manual-platform-icon' }), selected ? 'check' : icon);
            button.createSpan({ text: platform });
            button.addEventListener('click', () => {
                const previous = entries.find(entry => entry.platform === platform);
                if (previous) previous.selected = !selected;
                else entries.push({ platform, selected: true, repeatCount: 0 });
                emit(); render(); list.querySelector<HTMLButtonElement>(`[data-platform="${CSS.escape(platform)}"]`)?.focus();
            });
            const remove = chip.createEl('button', { cls: 'lorebase-manual-platform-remove', attr: { type: 'button', 'aria-label': `${t('editRemoveHint')}: ${platform}`, title: t('editRemoveHint') } });
            setIcon(remove, 'x');
            remove.addEventListener('click', () => { platforms = platforms.filter(value => value !== platform); entries = entries.filter(entry => entry.platform !== platform); emit(); render(); });
        }
    };
    const commit = (): void => {
        const values = input.value.split(/[,;\n]/).map(value => value.trim()).filter(Boolean);
        for (const value of values) if (!platforms.some(platform => platform.toLocaleLowerCase() === value.toLocaleLowerCase())) platforms.push(value);
        input.value = ''; emit(); render();
    };
    add.addEventListener('click', () => { commit(); input.focus(); });
    input.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); commit(); } });
    input.addEventListener('blur', () => { if (input.value.trim()) commit(); });
    render();
}
