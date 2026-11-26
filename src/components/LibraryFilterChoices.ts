import { setIcon } from 'obsidian';
import type { FieldDefinition, FilterRule } from '../types';
import { i18n, t } from '../localization';
import { libraryFieldCopy } from '../services/media/libraryFieldCatalog';

/** A bounded, searchable checklist. Selected values stay visible while searching. */
export function renderLibraryFilterChoices(parent: HTMLElement, rule: FilterRule, definition: FieldDefinition, onChange: () => void): void {
    const copy = libraryFieldCopy(i18n.getLanguage());
    const root = parent.createDiv({ cls: 'lorebase-filter-values' });
    const selected = new Map((Array.isArray(rule.value) ? rule.value : typeof rule.value === 'string' && rule.value ? [rule.value] : [])
        .filter(value => value.trim()).map(value => [value.trim().toLocaleLowerCase(), value.trim()]));
    const options = new Map((definition.options ?? []).map(option => [option.value.toLocaleLowerCase(), option]));
    for (const [key, value] of selected) if (!options.has(key)) options.set(key, { value, label: value });
    const compact = ['status', 'activePartFormat', 'partFormats', 'musicKind'].includes(definition.id) && options.size <= 12;
    root.toggleClass('is-compact', compact);
    let summary: HTMLElement | undefined;
    let content = root;
    if (!compact) {
        const disclosure = root.createEl('details', { cls: 'lorebase-filter-choice-disclosure' });
        disclosure.open = selected.size === 0;
        summary = disclosure.createEl('summary');
        content = disclosure.createDiv({ cls: 'lorebase-filter-choice-content' });
    }
    const search = compact ? null : content.createEl('input', { cls: 'lorebase-view-value-input lorebase-filter-value-search', attr: {
        type: 'search', placeholder: t('searchPlaceholder'), 'aria-label': `${t('searchPlaceholder')} · ${definition.label}`,
    } });
    const list = content.createDiv({ cls: 'lorebase-filter-value-list', attr: { role: 'group', 'aria-label': definition.label } });
    const empty = content.createDiv({ cls: 'lorebase-filter-value-empty', attr: { role: 'status' } });
    const count = content.createDiv({ cls: 'lorebase-filter-value-count', attr: { 'aria-live': 'polite' } });
    const rows: Array<{ key: string; label: string; button: HTMLButtonElement; icon: HTMLElement }> = [];
    const update = (): void => {
        const query = search?.value.trim().toLocaleLowerCase() ?? '';
        let visible = 0;
        for (const row of rows) {
            const active = selected.has(row.key);
            row.button.hidden = !active && !row.label.toLocaleLowerCase().includes(query);
            if (!row.button.hidden) visible++;
            row.button.toggleClass('is-active', active);
            row.button.setAttribute('aria-pressed', String(active));
            row.button.style.order = !compact && active ? '-1' : '0';
            setIcon(row.icon, active ? 'check-square' : 'square');
        }
        empty.hidden = visible > 0;
        empty.textContent = options.size ? copy.noMatches : copy.noValues;
        count.hidden = compact || selected.size === 0;
        count.textContent = `${copy.selected}: ${selected.size}`;
        if (summary) {
            const labels = [...selected.keys()].map(key => options.get(key)?.label ?? selected.get(key)!);
            summary.textContent = labels.length ? labels.length <= 2 ? labels.join(', ') : `${labels[0]} +${labels.length - 1}`
                : ({ ru: 'Выберите значения', en: 'Choose values', uk: 'Виберіть значення', 'zh-CN': '选择值' })[i18n.getLanguage()];
            summary.title = labels.join(', ');
        }
    };
    for (const [key, option] of options) {
        const button = list.createEl('button', { cls: 'lorebase-filter-value-option', attr: { type: 'button', title: option.label } });
        const icon = button.createSpan({ cls: 'lorebase-filter-value-check', attr: { 'aria-hidden': 'true' } });
        button.createSpan({ cls: 'lorebase-filter-value-label', text: option.label });
        rows.push({ key, label: option.label, button, icon });
        button.addEventListener('click', () => {
            if (selected.has(key)) selected.delete(key); else selected.set(key, option.value);
            rule.value = [...selected.values()];
            rule.fieldType = 'list';
            update();
            onChange();
        });
    }
    search?.addEventListener('input', update);
    update();
}
