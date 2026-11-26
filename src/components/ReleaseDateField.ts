import { setIcon } from 'obsidian';
import { t } from '../localization';
import { HierarchicalDatePicker } from '../modals/HierarchicalDatePicker';

/** Reuse the existing release field, or add it to Additional for media without one. */
export function mountReleaseDate(root: HTMLElement, getValue: () => string, changed: (value: string) => void): HierarchicalDatePicker {
    let input = root.querySelector<HTMLInputElement>('[data-field="release-date"], [data-field="released"]');
    if (!input) {
        const advanced = root.querySelector<HTMLElement>('details.lorebase-editmode-advanced');
        const host = advanced?.querySelector<HTMLElement>('.lorebase-editmode-advanced-grid, .lorebase-editmode-kv-list') ?? advanced ?? root;
        const field = host.createEl('label', { cls:'lorebase-editmode-field lorebase-editmode-date-field', attr:{'data-mobile-pane':'more'} });
        field.createSpan({ cls:'lorebase-editmode-field-label', text:t('editReleaseDate') });
        input = field.createEl('input', { cls:'lorebase-editmode-input', attr:{'data-field':'release-date'} });
    }
    input.type = 'text'; input.removeAttribute('maxlength'); input.removeAttribute('inputmode');
    if (!input.parentElement!.classList.contains('lorebase-editmode-date-control')) {
        const row = input.parentElement!.createDiv({cls:'lorebase-editmode-date-control'});
        row.append(input);
    }
    let trigger = input.parentElement!.querySelector<HTMLButtonElement>('[data-action="open-release-calendar"], [data-action="open-release-date-calendar"]');
    if (!trigger) trigger = input.parentElement!.createEl('button', { cls:'lorebase-editmode-date-control-icon', attr:{type:'button','aria-label':t('editReleaseDate'),'data-action':'open-release-calendar'} });
    setIcon(trigger,'calendar-days');
    const picker = new HierarchicalDatePicker(input,trigger,getValue,changed,{allowPartial:true,allowQuarter:true,allowUnknown:true});
    picker.syncInput();
    return picker;
}
