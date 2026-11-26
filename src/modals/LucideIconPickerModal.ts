import { App, Modal, getIconIds, setIcon } from 'obsidian';
import { i18n } from '../localization';
import { resolveLucideIcon } from '../utils/lucideIcon';

export class LucideIconPickerModal extends Modal {
    constructor(app: App, private selected: string, private onSelect: (icon: string) => void) { super(app); }
    onOpen(): void {
        this.modalEl.addClass('lorebase-icon-picker-modal');
        const ru = i18n.getLanguage() === 'ru';
        const uk = i18n.getLanguage() === 'uk';
        this.contentEl.createEl('h3', { text: ru ? 'Выбрать иконку' : uk ? 'Обрати іконку' : 'Choose icon' });
        const search = this.contentEl.createEl('input', { cls: 'lorebase-icon-search', type: 'search', attr: {
            placeholder: ru ? 'Название или ссылка Lucide…' : uk ? 'Назва або посилання Lucide…' : 'Icon name or Lucide link…',
            'aria-label': ru ? 'Поиск иконок' : uk ? 'Пошук іконок' : 'Search icons',
        } });
        const hint = this.contentEl.createDiv({ cls: 'lorebase-icon-picker-hint' });
        hint.appendText(ru ? 'Иконки Obsidian. Можно вставить название или ссылку из ' : uk ? 'Іконки Obsidian. Можна вставити назву або посилання з ' : 'Obsidian icons. Paste an icon name or link from ');
        hint.createEl('a', { text: 'Lucide', attr: { href: 'https://lucide.dev/icons/', target: '_blank', rel: 'noopener noreferrer' } });
        const grid = this.contentEl.createDiv({ cls: 'lorebase-icon-picker-grid', attr: { role: 'group', 'aria-label': ru ? 'Иконки' : uk ? 'Іконки' : 'Icons' } });
        const footer = this.contentEl.createDiv({ cls: 'lorebase-icon-picker-footer' });
        const count = footer.createSpan({ attr: { 'aria-live': 'polite' } });
        const more = footer.createEl('button', { text: ru ? 'Показать ещё' : uk ? 'Показати ще' : 'Show more', attr: { type: 'button' } });
        const icons = [...new Set(getIconIds())].sort((a, b) => a.localeCompare(b));
        let limit = 120;
        let matches: string[] = [];
        const choose = (icon: string): void => { this.onSelect(icon); this.close(); };
        const render = (): void => {
            grid.empty();
            const exact = resolveLucideIcon(search.value, icons);
            const query = search.value.trim().toLowerCase().replace(/\s+/g, '-');
            matches = exact ? [exact] : icons.filter(icon => icon.toLowerCase().includes(query));
            if (!query) matches.sort((a, b) => Number(b === this.selected || b === `lucide-${this.selected}`) - Number(a === this.selected || a === `lucide-${this.selected}`));
            for (const icon of matches.slice(0, limit)) {
                const name = icon.replace(/^lucide-/, '');
                const button = grid.createEl('button', { cls: 'lorebase-icon-choice', attr: { type: 'button', title: name, 'aria-label': name, 'aria-pressed': String(icon === this.selected || name === this.selected) } });
                setIcon(button, icon);
                button.addEventListener('click', () => choose(icon));
            }
            count.textContent = `${Math.min(matches.length, limit)} / ${matches.length}`;
            more.hidden = matches.length <= limit;
            if (!matches.length) grid.createDiv({ cls: 'lorebase-icon-empty', text: ru ? 'Иконка не найдена в этой версии Obsidian' : uk ? 'Іконку не знайдено в цій версії Obsidian' : 'Icon not found in this version of Obsidian' });
        };
        search.addEventListener('input', () => { limit = 120; render(); });
        search.addEventListener('keydown', event => {
            if (event.key === 'Enter' && matches.length === 1) { event.preventDefault(); choose(matches[0]); }
            if (event.key === 'ArrowDown') { event.preventDefault(); grid.querySelector<HTMLButtonElement>('button')?.focus(); }
        });
        more.addEventListener('click', () => { limit += 120; render(); });
        render(); search.focus();
    }
    onClose(): void { this.contentEl.empty(); }
}
