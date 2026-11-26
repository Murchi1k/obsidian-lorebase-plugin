import { setIcon } from 'obsidian';
import { t } from '../localization';
import { compactGameText } from '../localization/compactGameEditor';

type ChipKind = 'tags' | 'genres';
type ChipList = {
    read: () => string[];
    write: (values: string[]) => void;
    normalize: (value: string) => string | null;
    visible?: (value: string) => boolean;
};

export function buildCompactEditorChips(): string {
    return `
        <div class="lorebase-editmode-panel-title-row">
            <div class="lorebase-game-chip-switch" role="group" aria-label="${t('tags')} / ${t('genres')}">
                <button type="button" data-chip-kind="tags" aria-pressed="true">${t('tags')}</button>
                <button type="button" data-chip-kind="genres" aria-pressed="false">${t('genres')}</button>
            </div>
            <button type="button" class="lorebase-editmode-icon-btn lorebase-game-tag-plus" data-action="toggle-tag-input" aria-expanded="false"></button>
        </div>
        <div class="lorebase-editmode-chip-row lorebase-game-tag-chips" data-role="tag-chips">
            <label class="lorebase-editmode-chip lorebase-game-tag-composer" data-role="tag-composer" hidden>
                <span data-role="chip-prefix" aria-hidden="true">#</span>
                <input type="text" data-field="new-tag" size="3" />
            </label>
        </div>
        <button type="button" class="lorebase-editmode-btn lorebase-game-tag-more" data-action="expand-tags" aria-expanded="false" hidden>
            <span data-role="tag-more-icon" aria-hidden="true"></span><span data-role="tag-more-label"></span>
        </button>`;
}

export function bindCompactEditorChips(root: HTMLElement, lists: Record<ChipKind, ChipList>) {
    const panel = root.querySelector<HTMLElement>('.lorebase-editmode-tags')!;
    const chips = panel.querySelector<HTMLElement>('[data-role="tag-chips"]')!;
    const composer = panel.querySelector<HTMLElement>('[data-role="tag-composer"]')!;
    const input = panel.querySelector<HTMLInputElement>('[data-field="new-tag"]')!;
    const toggle = panel.querySelector<HTMLButtonElement>('[data-action="toggle-tag-input"]')!;
    const more = panel.querySelector<HTMLButtonElement>('[data-action="expand-tags"]')!;
    const switches = panel.querySelectorAll<HTMLButtonElement>('[data-chip-kind]');
    let kind: ChipKind = 'tags';
    let expanded = false;
    setIcon(toggle, 'plus');

    const updateOverflow = (): void => {
        if (!chips.clientWidth) return;
        const items = Array.from(chips.querySelectorAll<HTMLElement>(':scope > :not([hidden])'));
        const rows = [...new Set(items.map(chip => chip.offsetTop))];
        const secondRow = rows[1];
        const overflow = secondRow === undefined ? [] : items.filter(chip => chip.offsetTop > secondRow);
        more.hidden = overflow.length === 0;
        const label = kind === 'genres'
            ? compactGameText(expanded ? 'hideGenres' : 'showGenres')
            : compactGameText(expanded ? 'hideTags' : 'showTags');
        more.setAttribute('aria-label', label);
        more.querySelector('[data-role="tag-more-label"]')!.textContent = expanded ? label : `+ ${overflow.length}`;
        setIcon(more.querySelector<HTMLElement>('[data-role="tag-more-icon"]')!, expanded ? 'chevron-up' : 'chevron-down');
        chips.classList.toggle('is-collapsed', !expanded && !more.hidden);
        items.forEach(chip => chip.classList.toggle('is-overflowing', !expanded && secondRow !== undefined && chip.offsetTop > secondRow));
    };

    const render = (): void => {
        chips.querySelectorAll(':scope > button').forEach(chip => chip.remove());
        const list = lists[kind];
        for (const value of list.read()) {
            if (list.visible && !list.visible(value)) continue;
            const chip = chips.createEl('button', {
                cls: 'lorebase-editmode-chip',
                text: kind === 'genres' ? value : `#${value}`,
                attr: { type: 'button', title: t('editRemoveHint') },
            });
            chip.addEventListener('click', () => {
                list.write(list.read().filter(entry => entry !== value));
                render();
            });
        }
        updateOverflow();
    };

    const showComposer = (open: boolean): void => {
        composer.hidden = !open;
        toggle.setAttribute('aria-expanded', String(open));
        if (open) input.focus({ preventScroll: true });
        else {
            input.value = '';
            input.size = 3;
        }
        updateOverflow();
    };
    const commit = (): void => {
        if (composer.hidden) return;
        const list = lists[kind];
        const values = list.read();
        const value = list.normalize(input.value);
        showComposer(false);
        if (value && !values.includes(value)) {
            list.write([...values, value]);
            render();
        }
    };

    const syncSwitch = (): void => {
        const label = compactGameText(kind === 'genres' ? 'addGenre' : 'addTag');
        input.setAttribute('aria-label', label);
        toggle.setAttribute('aria-label', label);
        toggle.title = label;
        chips.classList.toggle('is-genres', kind === 'genres');
        composer.querySelector('[data-role="chip-prefix"]')!.textContent = kind === 'genres' ? '+' : '#';
        switches.forEach(option => option.setAttribute('aria-pressed', String(option.dataset.chipKind === kind)));
    };

    toggle.addEventListener('click', () => composer.hidden ? showComposer(true) : commit());
    input.addEventListener('input', () => {
        input.size = Math.max(3, Math.min(22, input.value.length + 1));
        updateOverflow();
    });
    input.addEventListener('blur', event => { if (event.relatedTarget !== toggle) commit(); });
    composer.addEventListener('keydown', event => {
        if (event.isComposing || event.ctrlKey || event.metaKey || (event.key !== 'Escape' && event.key !== 'Enter')) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.key === 'Enter') commit();
        else showComposer(false);
        toggle.focus();
    });
    more.addEventListener('click', () => {
        expanded = !expanded;
        more.setAttribute('aria-expanded', String(expanded));
        updateOverflow();
    });
    switches.forEach(button => button.addEventListener('click', () => {
        const next = button.dataset.chipKind === 'genres' ? 'genres' : 'tags';
        if (next === kind) return;
        commit();
        kind = next;
        expanded = false;
        more.setAttribute('aria-expanded', 'false');
        syncSwitch();
        render();
    }));

    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(updateOverflow);
    observer?.observe(chips);
    syncSwitch();
    render();
    return { render, commit, destroy: () => observer?.disconnect() };
}
