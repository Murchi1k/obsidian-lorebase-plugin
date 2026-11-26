import { getIconIds, setIcon } from 'obsidian';
import { groupText as gt } from '../localization/groups';
import { CUSTOM_GROUP_ICONS, CUSTOM_GROUP_ICON_MAX_BYTES, isCustomGroupImageIcon } from '../services/media/customGroups';
import { resolveLucideIcon } from '../utils/lucideIcon';

export function renderCustomGroupIcons(parent: HTMLElement, selected: () => string, onSelect: (icon: string) => void): { refresh: () => void; closePicker: () => boolean } {
    const section = parent.createDiv({ cls: 'lorebase-group-field' });
    section.createEl('strong', { cls: 'lorebase-group-field-label', text: gt('icon') });
    const presets = section.createDiv({ cls: 'lorebase-group-icon-options', attr: { role: 'group', 'aria-label': gt('icon') } });
    let requestId = 0;
    const choose = (icon: string): void => { requestId++; error.hidden = true; onSelect(icon); };
    for (const icon of CUSTOM_GROUP_ICONS) {
        const button = presets.createEl('button', { attr: { type: 'button', 'data-icon': icon, 'aria-label': gt(icon), title: gt(icon) } });
        setIcon(button, icon);
        button.addEventListener('click', () => choose(icon));
    }
    const actions = section.createDiv({ cls: 'lorebase-group-icon-actions' });
    const all = actions.createEl('button', { cls: 'lorebase-group-icon-action', attr: { type: 'button', 'aria-expanded': 'false' } });
    setIcon(all.createSpan(), 'grid-2x2'); all.createSpan({ text: gt('allIcons') });
    const upload = actions.createEl('button', { cls: 'lorebase-group-icon-action', attr: { type: 'button' } });
    setIcon(upload.createSpan(), 'image-plus'); upload.createSpan({ text: gt('uploadIcon') });
    const file = section.createEl('input', { cls: 'lorebase-group-icon-file', attr: { type: 'file', accept: 'image/svg+xml,image/png,image/jpeg,image/webp', 'aria-label': gt('uploadIcon') } });
    file.hidden = true;
    section.createDiv({ cls: 'lorebase-group-icon-hint', text: gt('iconFileHint') });
    const error = section.createDiv({ cls: 'lorebase-group-field-error', text: gt('iconFileError'), attr: { role: 'alert' } });
    error.hidden = true;
    upload.addEventListener('click', () => file.click());
    file.addEventListener('change', () => {
        const image = file.files?.[0];
        file.value = '';
        if (!image) return;
        const id = ++requestId;
        if (!['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp'].includes(image.type) || image.size > CUSTOM_GROUP_ICON_MAX_BYTES || !image.size) { error.hidden = false; return; }
        const reader = new FileReader();
        reader.addEventListener('load', () => {
            if (id !== requestId || !section.isConnected) return;
            if (typeof reader.result !== 'string' || !isCustomGroupImageIcon(reader.result)) { error.hidden = false; return; }
            choose(reader.result);
        });
        reader.addEventListener('error', () => { if (id === requestId && section.isConnected) error.hidden = false; });
        reader.readAsDataURL(image);
    });

    const catalog = section.createDiv({ cls: 'lorebase-group-icon-catalog' });
    catalog.hidden = true;
    const search = catalog.createEl('input', { cls: 'lorebase-group-icon-search', attr: { type: 'search', placeholder: gt('searchIcons'), 'aria-label': gt('searchIcons') } });
    const grid = catalog.createDiv({ cls: 'lorebase-group-icon-results', attr: { role: 'group', 'aria-label': gt('allIcons') } });
    const footer = catalog.createDiv({ cls: 'lorebase-group-icon-catalog-footer' });
    const count = footer.createSpan({ attr: { 'aria-live': 'polite' } });
    const more = footer.createEl('button', { cls: 'lorebase-group-icon-action', text: gt('showMore'), attr: { type: 'button' } });
    let available: string[] | null = null;
    let matches: string[] = [];
    let limit = 60;
    const closePicker = (): boolean => {
        if (catalog.hidden) return false;
        catalog.hidden = true; all.setAttribute('aria-expanded', 'false'); all.focus({ preventScroll: true }); return true;
    };
    const pickFromCatalog = (icon: string): void => { choose(icon); closePicker(); };
    const renderCatalog = (): void => {
        available ??= [...new Set(getIconIds())].sort((a, b) => a.localeCompare(b));
        const exact = resolveLucideIcon(search.value, available);
        const query = search.value.trim().toLowerCase().replace(/\s+/g, '-');
        matches = exact ? [exact] : available.filter(icon => icon.toLowerCase().includes(query));
        grid.empty();
        for (const icon of matches.slice(0, limit)) {
            const name = icon.replace(/^lucide-/, '');
            const button = grid.createEl('button', { attr: { type: 'button', 'data-icon': icon, title: name, 'aria-label': name, 'aria-pressed': String(selected() === icon) } });
            setIcon(button, icon);
            button.addEventListener('click', () => pickFromCatalog(icon));
        }
        if (!matches.length) grid.createDiv({ cls: 'lorebase-group-icon-hint', text: gt('iconsEmpty') });
        count.textContent = `${Math.min(matches.length, limit)} / ${matches.length}`;
        more.hidden = matches.length <= limit;
    };
    all.addEventListener('click', () => {
        if (closePicker()) return;
        catalog.hidden = false; all.setAttribute('aria-expanded', 'true'); renderCatalog(); search.focus();
    });
    search.addEventListener('input', () => { limit = 60; renderCatalog(); });
    search.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
            event.preventDefault(); event.stopPropagation();
            if (matches.length === 1) pickFromCatalog(matches[0]);
        } else if (event.key === 'ArrowDown') { event.preventDefault(); grid.querySelector<HTMLButtonElement>('button')?.focus(); }
    });
    more.addEventListener('click', () => { limit += 60; renderCatalog(); });
    let previousSelection: string | undefined;
    return {
        closePicker,
        refresh: () => {
            const icon = selected();
            if (icon === previousSelection) return;
            previousSelection = icon;
            presets.querySelectorAll<HTMLButtonElement>('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.icon === icon)));
            grid.querySelectorAll<HTMLButtonElement>('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.icon?.replace(/^lucide-/, '') === icon.replace(/^lucide-/, ''))));
            upload.setAttribute('aria-pressed', String(isCustomGroupImageIcon(icon)));
            all.classList.toggle('has-custom-selection', !isCustomGroupImageIcon(icon) && !CUSTOM_GROUP_ICONS.some(value => value === icon));
        },
    };
}
